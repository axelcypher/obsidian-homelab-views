/** Options of the code blocks, given as YAML inside the block. */
import { BACKUP_SYSTEMS, BackupSystem } from "../model/backup";
import { isObject } from "../model/check";
import { ENTRIES } from "../model/network";

export interface CommonOptions {
	/** Folder filter; may also point outside the root folder. */
	path?: string;
}

export interface BackupsOptions extends CommonOptions {
	system?: BackupSystem[];
	group: boolean;
	jobs: boolean;
}

export interface ScheduleOptions extends CommonOptions {
	system?: BackupSystem[];
	jobs: boolean;
	view: "both" | "timeline" | "list";
}

export type NetworkSection = "machines" | "apps" | "subnets";

export interface NetworkOptions extends CommonOptions {
	show: NetworkSection[];
	entry?: string;
	runsOn?: string;
}

export interface CardBlockOptions {
	note?: string;
	network: boolean;
	backup: boolean;
}

export interface Parsed<T> {
	opts: T;
	problems: string[];
}

type Raw = Record<string, unknown>;

function asObject(raw: unknown, problems: string[]): Raw {
	if (raw === null || raw === undefined) return {};
	if (isObject(raw)) return raw;
	problems.push("Optionen müssen YAML-Schlüssel sein, z. B. system: dumps");
	return {};
}

function unknown(o: Raw, allowed: string[], problems: string[]): void {
	for (const k of Object.keys(o)) if (!allowed.includes(k)) problems.push(`unbekannte Option „${k}“ (erlaubt: ${allowed.join(", ")})`);
}

function list(v: unknown): unknown[] {
	return v === undefined || v === null ? [] : Array.isArray(v) ? v : [v];
}

function strings<T extends string>(v: unknown, allowed: readonly T[], name: string, problems: string[]): T[] | undefined {
	if (v === undefined || v === null) return undefined;
	const out: T[] = [];
	for (const item of list(v)) {
		const s = String(item).trim();
		if ((allowed as readonly string[]).includes(s)) out.push(s as T);
		else problems.push(`${name}: „${s}“ unbekannt (erlaubt: ${allowed.join(", ")})`);
	}
	return out.length ? out : undefined;
}

function bool(v: unknown, name: string, fallback: boolean, problems: string[]): boolean {
	if (v === undefined || v === null) return fallback;
	if (typeof v === "boolean") return v;
	if (v === "ja" || v === "yes") return true;
	if (v === "nein" || v === "no") return false;
	problems.push(`${name}: true oder false erwartet`);
	return fallback;
}

function path(v: unknown, problems: string[]): string | undefined {
	if (v === undefined || v === null) return undefined;
	if (typeof v !== "string") {
		problems.push("path: Ordnerpfad als Text erwartet");
		return undefined;
	}
	return v.trim().replace(/^\/+|\/+$/g, "");
}

export function backupsOptions(raw: unknown): Parsed<BackupsOptions> {
	const problems: string[] = [];
	const o = asObject(raw, problems);
	unknown(o, ["system", "path", "group", "jobs"], problems);
	return {
		opts: {
			system: strings(o.system, BACKUP_SYSTEMS, "system", problems),
			path: path(o.path, problems),
			group: bool(o.group, "group", true, problems),
			jobs: bool(o.jobs, "jobs", true, problems),
		},
		problems,
	};
}

export function scheduleOptions(raw: unknown): Parsed<ScheduleOptions> {
	const problems: string[] = [];
	const o = asObject(raw, problems);
	unknown(o, ["system", "path", "jobs", "view"], problems);
	const view = strings(o.view, ["both", "timeline", "list"] as const, "view", problems)?.[0] ?? "both";
	return {
		opts: {
			system: strings(o.system, BACKUP_SYSTEMS, "system", problems),
			path: path(o.path, problems),
			jobs: bool(o.jobs, "jobs", true, problems),
			view,
		},
		problems,
	};
}

export function networkOptions(raw: unknown): Parsed<NetworkOptions> {
	const problems: string[] = [];
	const o = asObject(raw, problems);
	unknown(o, ["show", "path", "entry", "runs-on"], problems);
	const runsOn = o["runs-on"];
	return {
		opts: {
			show: strings(o.show, ["machines", "apps", "subnets"] as const, "show", problems) ?? ["machines", "apps", "subnets"],
			path: path(o.path, problems),
			entry: strings(o.entry, ENTRIES, "entry", problems)?.[0],
			runsOn: typeof runsOn === "string" && runsOn.trim() ? runsOn.trim() : undefined,
		},
		problems,
	};
}

export function cardOptions(raw: unknown): Parsed<CardBlockOptions> {
	const problems: string[] = [];
	const o = asObject(raw, problems);
	unknown(o, ["note", "show"], problems);
	const show = strings(o.show, ["network", "backup"] as const, "show", problems);
	let note: string | undefined;
	if (typeof o.note === "string") note = o.note.trim().replace(/^\[\[|\]\]$/g, "").split("|")[0];
	// YAML reads an unquoted [[Note]] as a nested list
	else if (Array.isArray(o.note) && Array.isArray(o.note[0])) note = String(o.note[0][0]);
	else if (o.note !== undefined) problems.push("note: Link oder Pfad erwartet, z. B. note: \"[[vm-docker-01]]\"");
	return {
		opts: {
			note,
			network: show ? show.includes("network") : true,
			backup: show ? show.includes("backup") : true,
		},
		problems,
	};
}
