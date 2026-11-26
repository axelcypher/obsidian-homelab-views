/**
 * Frontmatter key `backup`, schema 1
 * (vault: homelab-docs/projects/backup-ui/Frontmatter für Backups.md).
 */
import { Checker, Issue, Raw, blocksOf, isObject, show } from "./check";
import { Schedule, WEEKDAYS, Weekday, parseDuration } from "../schedule/schedule";
import { isValidTimeZone } from "../schedule/time";

export const BACKUP_SYSTEMS = ["pbs", "pbs-vm", "restic", "dumps", "longhorn", "homeassistant", "opnsense"] as const;
export type BackupSystem = (typeof BACKUP_SYSTEMS)[number];

export const ENGINES = ["postgres", "mariadb", "mysql", "mongo", "sqlite", "valkey", "redis"] as const;
export const FORMATS = ["dump", "sql", "archive", "db", "rdb", "tar", "vma"] as const;
export const JOB_KINDS = ["prune", "verify", "gc", "sync"] as const;
export type JobKind = (typeof JOB_KINDS)[number];

export const RETENTION_COUNTS = [
	"keep-last",
	"keep-hourly",
	"keep-daily",
	"keep-weekly",
	"keep-monthly",
	"keep-yearly",
] as const;
export type RetentionCount = (typeof RETENTION_COUNTS)[number];

export interface Retention {
	counts: { key: RetentionCount; value: number }[];
	maxAge?: string;
	maxAgeMs?: number;
}

export type Source =
	| { kind: "pbs"; group: string; ns?: string; store?: string }
	| { kind: "restic"; repo: string; host?: string; tag?: string; path?: string }
	| { kind: "files"; dir: string; pattern?: string }
	| { kind: "longhorn"; volume: string };

export type SourceKind = Source["kind"];

export const JOB_TARGETS = ["pbs-datastore", "restic", "files"] as const;
export type JobTargetKind = (typeof JOB_TARGETS)[number];

export interface JobTarget {
	kind: JobTargetKind;
	value: string;
}

export interface BackupBlock {
	schema?: number;
	id?: string;
	type: "backup" | "job" | "ignore";
	system?: BackupSystem;
	what?: string;
	/** type: ignore — why the source is left out on purpose */
	why?: string;
	schedule?: Schedule;
	tz?: string;
	grace?: string;
	graceMs?: number;
	retention?: Retention;
	engine?: string;
	format?: string;
	copyOf?: string;
	source?: Source;
	job?: JobKind;
	on?: JobTarget;
}

export interface ParsedBackup {
	/** Position in the `backup` list (0 for a single object). */
	index: number;
	/** `backup` or `backup[2]` */
	field: string;
	block: BackupBlock;
	issues: Issue[];
}

const COMMON_KEYS = [
	"schema",
	"id",
	"type",
	"system",
	"what",
	"schedule",
	"tz",
	"grace",
	"retention",
	"engine",
	"format",
] as const;
const BACKUP_ONLY = ["copy-of", "source"] as const;
const JOB_ONLY = ["job", "on"] as const;
/** type: ignore — a source found live that is not backed up on purpose (no schedule, no retention) */
const IGNORE_KEYS = ["schema", "id", "type", "system", "what", "why", "source"] as const;
const IGNORE_SOURCES: readonly SourceKind[] = ["pbs", "longhorn"];

export const ID_PATTERN = /^[a-z0-9-]+$/;
const ID_MSG = "nur Kleinbuchstaben, Ziffern und „-“";
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const SERVER_PATH = /^[^\s:/]+:\/\S*$/;
const SERVER_PATH_MSG = "erwartet server:/pfad, z. B. 10.50.0.10:/backup/…";

/** Location key of each `source` and the extra fields that belong to it. */
const SOURCE_FIELDS: Record<SourceKind, readonly string[]> = {
	pbs: ["ns", "store"],
	restic: ["host", "tag", "path"],
	files: ["pattern"],
	longhorn: [],
};
const SOURCE_KINDS = Object.keys(SOURCE_FIELDS) as SourceKind[];

/** Parses the value of the frontmatter key `backup` (one object or a list of objects). */
export function parseBackups(value: unknown): ParsedBackup[] {
	return blocksOf(value, "backup").map(({ raw, field, index }) => {
		const issues: Issue[] = [];
		const block = validateBackupBlock(raw, new Checker(issues, field));
		return { index, field, block, issues };
	});
}

export function validateBackupBlock(raw: unknown, c: Checker): BackupBlock {
	if (!isObject(raw)) {
		c.error("", `ein Block muss ein Objekt sein, ist ${show(raw)}`);
		return { type: "backup" };
	}

	// type decides which keys are allowed
	let type: "backup" | "job" | "ignore" = "backup";
	const rawType = raw.type;
	let typeKnown = true;
	if (rawType !== undefined) {
		if (rawType === "backup" || rawType === "job" || rawType === "ignore") type = rawType;
		else {
			typeKnown = false;
			c.error("type", `${show(rawType)} ist nicht erlaubt; erlaubt: backup, job, ignore`);
		}
	}
	if (type === "ignore") return validateIgnoreBlock(raw, c);

	const allowed: string[] = [...COMMON_KEYS];
	const hints: Record<string, string> = {};
	if (!typeKnown || type === "backup") allowed.push(...BACKUP_ONLY);
	if (!typeKnown || type === "job") allowed.push(...JOB_ONLY);
	if (typeKnown && type === "backup") for (const k of JOB_ONLY) hints[k] = "nur bei type: job";
	if (typeKnown && type === "job") for (const k of BACKUP_ONLY) hints[k] = "nur bei type: backup";
	c.unknownKeys(raw, allowed, hints);

	const block: BackupBlock = { type };

	// schema
	if (raw.schema === undefined || raw.schema === null) c.missing("schema");
	else if (raw.schema !== 1) {
		if (typeof raw.schema === "number") c.error("schema", `Version ${raw.schema} ist unbekannt (bekannt: 1)`);
		else c.wrongType("schema", "die Zahl 1", raw.schema);
	} else block.schema = 1;

	block.id = c.str(raw, "id", { required: true, pattern: ID_PATTERN, patternMsg: ID_MSG });
	const system = c.str(raw, "system", { required: true, oneOf: BACKUP_SYSTEMS });
	if (system && (BACKUP_SYSTEMS as readonly string[]).includes(system)) block.system = system as BackupSystem;
	block.what = c.str(raw, "what");

	const schedule = c.obj(raw, "schedule", { required: true });
	if (schedule) block.schedule = validateSchedule(schedule, c.child("schedule"));

	const tz = c.str(raw, "tz", { required: true });
	if (tz !== undefined) {
		if (isValidTimeZone(tz)) block.tz = tz;
		else c.error("tz", `${show(tz)} ist keine bekannte IANA-Zeitzone (z. B. Europe/Berlin oder UTC)`);
	}

	const grace = c.str(raw, "grace");
	if (grace !== undefined) {
		const ms = parseDuration(grace);
		if (ms === null) c.error("grace", `${show(grace)} ist keine Dauer (z. B. 30m, 3h, 1d)`);
		else {
			block.grace = grace;
			block.graceMs = ms;
		}
	}

	const retention = c.obj(raw, "retention");
	if (retention) block.retention = validateRetention(retention, c.child("retention"));

	block.engine = c.str(raw, "engine", { oneOf: ENGINES });
	block.format = c.str(raw, "format", { oneOf: FORMATS });

	if (type === "backup") {
		block.copyOf = c.str(raw, "copy-of", { pattern: ID_PATTERN, patternMsg: ID_MSG });
		if (block.copyOf && block.copyOf === block.id) c.error("copy-of", "verweist auf den eigenen Block");
		const source = c.obj(raw, "source", { required: typeKnown });
		if (source) block.source = validateSource(source, c.child("source"));
	}

	if (type === "job") {
		const job = c.str(raw, "job", { required: typeKnown, oneOf: JOB_KINDS });
		if (job && (JOB_KINDS as readonly string[]).includes(job)) block.job = job as JobKind;
		const on = c.obj(raw, "on", { required: typeKnown });
		if (on) block.on = validateJobTarget(on, c.child("on"));
	}

	return block;
}

/** `type: ignore`: schema, id, system, why and a pbs/longhorn source; no schedule, no retention. */
function validateIgnoreBlock(raw: Raw, c: Checker): BackupBlock {
	const hint = "nicht bei type: ignore (Ausnahmen haben keinen Zeitplan und keine Aufbewahrung)";
	const hints: Record<string, string> = {};
	for (const k of [...COMMON_KEYS, ...BACKUP_ONLY, ...JOB_ONLY]) if (!(IGNORE_KEYS as readonly string[]).includes(k)) hints[k] = hint;
	c.unknownKeys(raw, [...IGNORE_KEYS], hints);
	const block: BackupBlock = { type: "ignore" };
	if (raw.schema === undefined || raw.schema === null) c.missing("schema");
	else if (raw.schema !== 1) {
		if (typeof raw.schema === "number") c.error("schema", `Version ${raw.schema} ist unbekannt (bekannt: 1)`);
		else c.wrongType("schema", "die Zahl 1", raw.schema);
	} else block.schema = 1;
	block.id = c.str(raw, "id", { required: true, pattern: ID_PATTERN, patternMsg: ID_MSG });
	const system = c.str(raw, "system", { required: true, oneOf: BACKUP_SYSTEMS });
	if (system && (BACKUP_SYSTEMS as readonly string[]).includes(system)) block.system = system as BackupSystem;
	block.what = c.str(raw, "what");
	block.why = c.str(raw, "why", { required: true });
	const source = c.obj(raw, "source", { required: true });
	if (source) {
		const src = validateSource(source, c.child("source"));
		if (src && !IGNORE_SOURCES.includes(src.kind)) c.error("source", `bei type: ignore nur pbs oder longhorn, nicht ${src.kind}`);
		else if (src) block.source = src;
	}
	return block;
}

export function validateSchedule(s: Raw, c: Checker): Schedule | undefined {
	c.unknownKeys(s, ["times", "weekdays", "every"]);
	const hasTimes = s.times !== undefined;
	const hasEvery = s.every !== undefined;
	if (hasTimes && hasEvery) {
		c.error("", "entweder times (feste Zeiten) oder every (Intervall), nicht beides");
		return undefined;
	}
	if (!hasTimes && !hasEvery) {
		c.error("", "braucht times (feste Zeiten) oder every (Intervall)");
		return undefined;
	}

	if (hasEvery) {
		if (s.weekdays !== undefined) c.error("weekdays", "nur zusammen mit times");
		const every = c.str(s, "every", { required: true });
		if (every === undefined) return undefined;
		const ms = parseDuration(every);
		if (ms === null) {
			c.error("every", `${show(every)} ist keine Dauer (z. B. 6h)`);
			return undefined;
		}
		return { kind: "every", every, everyMs: ms };
	}

	const list = c.list(s, "times", { required: true, nonEmpty: true });
	if (!list) return undefined;
	const times: string[] = [];
	let ok = true;
	list.forEach((t, i) => {
		const field = `times[${i}]`;
		if (typeof t === "number") {
			ok = false;
			c.error(field, `Uhrzeit als Text in Anführungszeichen schreiben ("HH:MM"); YAML hat sie als Zahl ${t} gelesen`);
		} else if (typeof t !== "string") {
			ok = false;
			c.wrongType(field, "eine Uhrzeit \"HH:MM\"", t);
		} else if (!TIME.test(t)) {
			ok = false;
			c.error(field, `${show(t)} ist keine Uhrzeit „HH:MM“ (00:00–23:59)`);
		} else if (times.includes(t)) {
			c.warn(field, `${show(t)} steht doppelt`);
		} else times.push(t);
	});

	let weekdays: Weekday[] | undefined;
	if (s.weekdays !== undefined) {
		const wd = c.strList(s, "weekdays", { nonEmpty: true, oneOf: WEEKDAYS });
		if (wd) {
			const unique = [...new Set(wd)] as Weekday[];
			if (unique.length !== wd.length) c.warn("weekdays", "enthält einen Tag doppelt");
			weekdays = unique;
		} else ok = false;
	}
	if (!ok || times.length === 0) return undefined;
	return weekdays ? { kind: "times", times, weekdays } : { kind: "times", times };
}

export function validateRetention(r: Raw, c: Checker): Retention {
	c.unknownKeys(r, [...RETENTION_COUNTS, "max-age"]);
	const out: Retention = { counts: [] };
	for (const key of RETENTION_COUNTS) {
		const v = c.int(r, key, { min: 0 });
		if (v !== undefined) out.counts.push({ key, value: v });
	}
	const maxAge = c.str(r, "max-age");
	if (maxAge !== undefined) {
		const ms = parseDuration(maxAge);
		if (ms === null) c.error("max-age", `${show(maxAge)} ist keine Dauer (z. B. 14d)`);
		else {
			out.maxAge = maxAge;
			out.maxAgeMs = ms;
		}
	}
	return out;
}

export function validateSource(s: Raw, c: Checker): Source | undefined {
	const present = SOURCE_KINDS.filter((k) => s[k] !== undefined);
	if (present.length === 0) {
		c.error("", `genau ein Ortsschlüssel fehlt: ${SOURCE_KINDS.join(", ")}`);
		c.unknownKeys(s, SOURCE_KINDS.flatMap((k) => SOURCE_FIELDS[k]));
		return undefined;
	}
	if (present.length > 1) {
		c.error("", `genau ein Ortsschlüssel erlaubt, gefunden: ${present.join(", ")}`);
		return undefined;
	}
	const kind = present[0];
	const own = SOURCE_FIELDS[kind];
	const hints: Record<string, string> = {};
	for (const other of SOURCE_KINDS) {
		if (other === kind) continue;
		for (const f of SOURCE_FIELDS[other]) hints[f] = `gehört zu ${other}, nicht zu ${kind}`;
	}
	c.unknownKeys(s, [kind, ...own], hints);

	switch (kind) {
		case "pbs": {
			const group = c.str(s, "pbs", {
				required: true,
				pattern: /^(vm|ct|host)\/\S+$/,
				patternMsg: "erwartet eine Backup-Gruppe wie vm/2001 oder ct/105",
			});
			const ns = c.str(s, "ns");
			const store = c.str(s, "store");
			return group ? { kind, group, ns, store } : undefined;
		}
		case "restic": {
			const repo = c.str(s, "restic", { required: true, pattern: SERVER_PATH, patternMsg: SERVER_PATH_MSG });
			const host = c.str(s, "host");
			const tag = c.str(s, "tag");
			const path = c.str(s, "path");
			return repo ? { kind, repo, host, tag, path } : undefined;
		}
		case "files": {
			const dir = c.str(s, "files", { required: true, pattern: SERVER_PATH, patternMsg: SERVER_PATH_MSG });
			const pattern = c.str(s, "pattern");
			return dir ? { kind, dir, pattern } : undefined;
		}
		case "longhorn": {
			const volume = c.str(s, "longhorn", {
				required: true,
				pattern: /^[^\s/]+\/[^\s/]+$/,
				patternMsg: "erwartet namespace/pvc, z. B. immich/immich-library",
			});
			return volume ? { kind, volume } : undefined;
		}
	}
}

export function validateJobTarget(on: Raw, c: Checker): JobTarget | undefined {
	const present = JOB_TARGETS.filter((k) => on[k] !== undefined);
	c.unknownKeys(on, JOB_TARGETS);
	if (present.length === 0) {
		c.error("", `genau einer fehlt: ${JOB_TARGETS.join(", ")}`);
		return undefined;
	}
	if (present.length > 1) {
		c.error("", `genau einer erlaubt, gefunden: ${present.join(", ")}`);
		return undefined;
	}
	const kind = present[0];
	const value =
		kind === "pbs-datastore"
			? c.str(on, kind, { required: true })
			: c.str(on, kind, { required: true, pattern: SERVER_PATH, patternMsg: SERVER_PATH_MSG });
	return value ? { kind, value } : undefined;
}

/** Location of a block's copies (backup) or of what a job works on, normalised for comparisons. */
export function targetKey(b: BackupBlock): string | undefined {
	const trim = (s: string) => s.replace(/\/+$/, "");
	if (b.type === "job") {
		if (!b.on) return undefined;
		return b.on.kind === "pbs-datastore" ? `pbs:${b.on.value}` : `${b.on.kind}:${trim(b.on.value)}`;
	}
	const s = b.source;
	if (!s) return undefined;
	switch (s.kind) {
		case "pbs":
			return `pbs:${s.store ?? "pbs"}`;
		case "restic":
			return `restic:${trim(s.repo)}`;
		case "files":
			return `files:${trim(s.dir)}`;
		case "longhorn":
			return `longhorn:${s.volume}`;
	}
}
