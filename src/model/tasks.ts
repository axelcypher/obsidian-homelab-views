/**
 * Frontmatter key `tasks`, schema 1: scheduled work that is not a backup
 * (vault: homelab-docs/projects/homelab-views/Frontmatter für geplante Aufgaben.md).
 *
 * `runner` says who starts the task, and the kinds are kept apart on purpose:
 * - `cron`   a crontab line on a host (Proxmox node, VM, bare metal)
 * - `k3s`    a Kubernetes CronJob in the cluster
 * - `komodo` a scheduled Komodo procedure or action
 * - `app`    an app's own scheduler (HA automation, an app's internal job)
 */
import { Checker, Issue, Raw, blocksOf, isObject, show } from "./check";
import { ID_PATTERN, validateSchedule } from "./backup";
import { Schedule, parseDuration } from "../schedule/schedule";
import { isValidTimeZone } from "../schedule/time";

export const TASK_RUNNERS = ["cron", "k3s", "komodo", "app"] as const;
export type TaskRunnerKind = (typeof TASK_RUNNERS)[number];

export const TASK_KINDS = ["reboot", "update", "cleanup", "check", "maintenance", "other"] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export const KOMODO_TYPES = ["procedure", "action"] as const;

export type Runner =
	| { kind: "cron"; host: string; file?: string; user?: string }
	| { kind: "k3s"; cronjob: string }
	| { kind: "komodo"; name: string; type: "procedure" | "action" }
	| { kind: "app"; app: string };

export interface TaskBlock {
	schema?: number;
	id?: string;
	what?: string;
	kind?: TaskKind;
	runner?: Runner;
	schedule?: Schedule;
	tz?: string;
	duration?: string;
	durationMs?: number;
	command?: string;
}

export interface ParsedTask {
	index: number;
	/** `tasks` or `tasks[2]` */
	field: string;
	block: TaskBlock;
	issues: Issue[];
}

const TASK_KEYS = ["schema", "id", "what", "kind", "runner", "schedule", "tz", "duration", "command"] as const;

/** Main key of each runner and the extra fields that belong to it. */
const RUNNER_FIELDS: Record<TaskRunnerKind, readonly string[]> = {
	cron: ["file", "user"],
	k3s: [],
	komodo: ["type"],
	app: [],
};

/** Parses the value of the frontmatter key `tasks` (one object or a list of objects). */
export function parseTasks(value: unknown): ParsedTask[] {
	return blocksOf(value, "tasks").map(({ raw, field, index }) => {
		const issues: Issue[] = [];
		const block = validateTaskBlock(raw, new Checker(issues, field));
		return { index, field, block, issues };
	});
}

export function validateTaskBlock(raw: unknown, c: Checker): TaskBlock {
	const block: TaskBlock = {};
	if (!isObject(raw)) {
		c.error("", `ein Block muss ein Objekt sein, ist ${show(raw)}`);
		return block;
	}
	c.unknownKeys(raw, TASK_KEYS, {
		system: "gehört zu backup, nicht zu tasks",
		source: "gehört zu backup; wer die Aufgabe startet, steht in runner",
		grace: "bei tasks heißt das Fenster duration",
		retention: "gehört zu backup, nicht zu tasks",
		type: "gehört zu backup; die Art der Aufgabe steht in kind",
	});

	if (raw.schema === undefined || raw.schema === null) c.missing("schema");
	else if (raw.schema !== 1) {
		if (typeof raw.schema === "number") c.error("schema", `Version ${raw.schema} ist unbekannt (bekannt: 1)`);
		else c.wrongType("schema", "die Zahl 1", raw.schema);
	} else block.schema = 1;

	block.id = c.str(raw, "id", { required: true, pattern: ID_PATTERN, patternMsg: "nur Kleinbuchstaben, Ziffern und „-“" });
	block.what = c.str(raw, "what", { required: true });
	const kind = c.str(raw, "kind", { oneOf: TASK_KINDS });
	if (kind && (TASK_KINDS as readonly string[]).includes(kind)) block.kind = kind as TaskKind;

	const runner = c.obj(raw, "runner", { required: true });
	if (runner) block.runner = validateRunner(runner, c.child("runner"));

	const schedule = c.obj(raw, "schedule", { required: true });
	if (schedule) block.schedule = validateSchedule(schedule, c.child("schedule"));

	const tz = c.str(raw, "tz", { required: true });
	if (tz !== undefined) {
		if (isValidTimeZone(tz)) block.tz = tz;
		else c.error("tz", `${show(tz)} ist keine bekannte IANA-Zeitzone (z. B. Europe/Berlin oder UTC)`);
	}

	const duration = c.str(raw, "duration");
	if (duration !== undefined) {
		const ms = parseDuration(duration);
		if (ms === null) c.error("duration", `${show(duration)} ist keine Dauer (z. B. 15m, 1h)`);
		else {
			block.duration = duration;
			block.durationMs = ms;
		}
	}
	block.command = c.str(raw, "command");
	return block;
}

export function validateRunner(r: Raw, c: Checker): Runner | undefined {
	const present = TASK_RUNNERS.filter((k) => r[k] !== undefined);
	if (present.length === 0) {
		c.error("", `genau einer fehlt: ${TASK_RUNNERS.join(", ")} (cron = Crontab eines Hosts, k3s = CronJob, komodo = Komodo-Zeitplan, app = Zeitplan der App selbst)`);
		c.unknownKeys(r, TASK_RUNNERS.flatMap((k) => RUNNER_FIELDS[k]));
		return undefined;
	}
	if (present.length > 1) {
		c.error("", `genau einer erlaubt, gefunden: ${present.join(", ")}`);
		return undefined;
	}
	const kind = present[0];
	const hints: Record<string, string> = {};
	for (const other of TASK_RUNNERS) {
		if (other === kind) continue;
		for (const f of RUNNER_FIELDS[other]) hints[f] = `gehört zu ${other}, nicht zu ${kind}`;
	}
	c.unknownKeys(r, [kind, ...RUNNER_FIELDS[kind]], hints);

	switch (kind) {
		case "cron": {
			const host = c.str(r, "cron", { required: true, pattern: /^\S+$/, patternMsg: "erwartet den Namen des Hosts, z. B. sol" });
			const file = c.str(r, "file");
			const user = c.str(r, "user");
			return host ? { kind, host, file, user } : undefined;
		}
		case "k3s": {
			const cronjob = c.str(r, "k3s", {
				required: true,
				pattern: /^[^\s/]+\/[^\s/]+$/,
				patternMsg: "erwartet namespace/cronjob, z. B. kube-system/cleanup",
			});
			return cronjob ? { kind, cronjob } : undefined;
		}
		case "komodo": {
			const name = c.str(r, "komodo", { required: true });
			const type = c.str(r, "type", { oneOf: KOMODO_TYPES });
			const t = type === "action" ? "action" : "procedure";
			return name ? { kind, name, type: t } : undefined;
		}
		case "app": {
			const app = c.str(r, "app", { required: true });
			return app ? { kind, app } : undefined;
		}
	}
}
