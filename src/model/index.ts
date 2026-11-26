/**
 * Builds a vault-wide index from note frontmatter and adds the checks that need
 * more than one block: duplicate `id`, `copy-of` targets, duplicate resources
 * and hostnames.
 */
import { Issue } from "./check";
import { BackupBlock, ParsedBackup, parseBackups, targetKey } from "./backup";
import { NetworkResource, ParsedResource, parseNetwork } from "./network";
import { ParsedTask, TaskBlock, parseTasks } from "./tasks";

export interface NoteRecord {
	path: string;
	frontmatter: Record<string, unknown> | null | undefined;
}

export interface NoteRef {
	path: string;
	/** File name without folder and `.md` */
	name: string;
}

export interface BackupEntry extends ParsedBackup {
	note: NoteRef;
	/** Unique key within the index: `path#index` */
	key: string;
	/** Location of the copies (backup) or of what a job works on */
	target?: string;
	/** Set when `copy-of` resolves */
	original?: BackupEntry;
	copies: BackupEntry[];
}

export interface NetworkEntry extends ParsedResource {
	note: NoteRef;
	key: string;
}

export interface TaskEntry extends ParsedTask {
	note: NoteRef;
	key: string;
}

export interface HomelabIndex {
	backups: BackupEntry[];
	network: NetworkEntry[];
	tasks: TaskEntry[];
	/** Blocks by `id` (only ids that occur once) */
	backupById: Map<string, BackupEntry>;
	/** Resources by name (all kinds) */
	networkByName: Map<string, NetworkEntry[]>;
	byNote: Map<string, { backups: BackupEntry[]; network: NetworkEntry[]; tasks: TaskEntry[] }>;
}

export const BACKUP_KEY = "backup";
export const NETWORK_KEY = "network-flow";
export const TASKS_KEY = "tasks";

export function noteRef(path: string): NoteRef {
	const file = path.split("/").pop() ?? path;
	return { path, name: file.replace(/\.md$/i, "") };
}

/** True for paths inside `_privat/` or `_private/`, which are never read. */
export function isPrivatePath(path: string): boolean {
	return path.split("/").some((seg) => seg === "_privat" || seg === "_private");
}

/** True when `path` lies in folder `folder` (or `folder` is empty = whole vault). */
export function inFolder(path: string, folder: string): boolean {
	const f = folder.trim().replace(/^\/+|\/+$/g, "");
	return f === "" || path === f || path.startsWith(f + "/");
}

export function hasHomelabData(fm: Record<string, unknown> | null | undefined): boolean {
	return !!fm && (fm[BACKUP_KEY] !== undefined || fm[NETWORK_KEY] !== undefined || fm[TASKS_KEY] !== undefined);
}

export function buildIndex(records: NoteRecord[]): HomelabIndex {
	const index: HomelabIndex = {
		backups: [],
		network: [],
		tasks: [],
		backupById: new Map(),
		networkByName: new Map(),
		byNote: new Map(),
	};

	const sorted = [...records].filter((r) => !isPrivatePath(r.path)).sort((a, b) => a.path.localeCompare(b.path));
	for (const rec of sorted) {
		const fm = rec.frontmatter;
		if (!hasHomelabData(fm) || !fm) continue;
		const note = noteRef(rec.path);
		const backups: BackupEntry[] = parseBackups(fm[BACKUP_KEY]).map((p) => ({
			...p,
			note,
			key: `${note.path}#${p.index}`,
			target: targetKey(p.block),
			copies: [],
		}));
		const network: NetworkEntry[] = parseNetwork(fm[NETWORK_KEY]).map((p) => ({
			...p,
			note,
			key: `${note.path}#nf${p.index}`,
		}));
		const tasks: TaskEntry[] = parseTasks(fm[TASKS_KEY]).map((p) => ({
			...p,
			note,
			key: `${note.path}#t${p.index}`,
		}));
		index.backups.push(...backups);
		index.network.push(...network);
		index.tasks.push(...tasks);
		index.byNote.set(note.path, { backups, network, tasks });
	}

	checkBackupIds(index);
	checkTaskIds(index);
	checkNetwork(index);
	return index;
}

function issue(entry: { issues: Issue[]; field: string }, field: string, message: string, severity: Issue["severity"] = "error") {
	entry.issues.push({ field: field ? `${entry.field}.${field}` : entry.field, message, severity });
}

function where(e: { note: NoteRef; field: string }): string {
	return `„${e.note.name}“ (${e.field})`;
}

function checkBackupIds(index: HomelabIndex): void {
	const byId = new Map<string, BackupEntry[]>();
	for (const e of index.backups) {
		const id = e.block.id;
		if (!id) continue;
		const list = byId.get(id) ?? [];
		list.push(e);
		byId.set(id, list);
	}
	for (const [id, list] of byId) {
		if (list.length === 1) {
			index.backupById.set(id, list[0]);
			continue;
		}
		for (const e of list) {
			const others = list.filter((o) => o !== e).map(where).join(", ");
			issue(e, "id", `doppelte id ${id}, auch in ${others}; keiner der Blöcke zählt`);
		}
	}
	for (const e of index.backups) {
		const ref = e.block.copyOf;
		if (!ref || ref === e.block.id) continue;
		if (byId.has(ref) && !index.backupById.has(ref)) {
			issue(e, "copy-of", `${ref} ist mehrdeutig (doppelte id)`);
			continue;
		}
		const original = index.backupById.get(ref);
		if (!original) {
			issue(e, "copy-of", `unbekannte id ${ref}`);
			continue;
		}
		if (original.block.type === "job") {
			issue(e, "copy-of", `${ref} ist ein Job, keine Sicherung`);
			continue;
		}
		e.original = original;
		original.copies.push(e);
	}
}

function checkTaskIds(index: HomelabIndex): void {
	const byId = new Map<string, TaskEntry[]>();
	for (const e of index.tasks) {
		if (!e.block.id) continue;
		byId.set(e.block.id, [...(byId.get(e.block.id) ?? []), e]);
	}
	for (const [id, list] of byId) {
		if (list.length < 2) continue;
		for (const e of list) {
			const others = list.filter((o) => o !== e).map(where).join(", ");
			issue(e, "id", `doppelte id ${id}, auch in ${others}`);
		}
	}
}

function checkNetwork(index: HomelabIndex): void {
	const byKindName = new Map<string, NetworkEntry[]>();
	for (const e of index.network) {
		const name = e.res.name;
		if (!name) continue;
		const list = index.networkByName.get(name) ?? [];
		list.push(e);
		index.networkByName.set(name, list);
		if (e.res.kind) {
			const k = `${e.res.kind}:${name}`;
			byKindName.set(k, [...(byKindName.get(k) ?? []), e]);
		}
	}
	for (const list of byKindName.values()) {
		if (list.length < 2) continue;
		for (const e of list) {
			const others = list.filter((o) => o !== e).map(where).join(", ");
			issue(e, "name", `${e.res.kind} ${e.res.name} ist mehrfach beschrieben, auch in ${others}`, "warning");
		}
	}

	// A hostname is duplicate when two apps name it with the same path, or both without a path.
	const hosts = new Map<string, { entry: NetworkEntry; i: number }[]>();
	for (const e of index.network) {
		if (e.res.kind !== "app") continue;
		e.res.hostnames?.forEach((h, i) => {
			const k = `${h.name.toLowerCase()}|${h.path ?? ""}`;
			hosts.set(k, [...(hosts.get(k) ?? []), { entry: e, i }]);
		});
	}
	for (const list of hosts.values()) {
		const apps = new Set(list.map((x) => x.entry));
		if (apps.size < 2) continue;
		for (const { entry, i } of list) {
			const others = [...apps]
				.filter((a) => a !== entry)
				.map((a) => a.res.name ?? a.note.name)
				.join(", ");
			issue(entry, `hostnames[${i}].name`, `Hostname auch bei ${others} (gleicher Pfad)`, "warning");
		}
	}
}

// ---------------------------------------------------------------------------
// Lookups used by renderers

export function errorCount(issues: Issue[]): number {
	return issues.filter((i) => i.severity === "error").length;
}

/** Display title of a block: `what`, else engine/format, else the job, else the id. */
export function backupTitle(b: BackupBlock): string {
	if (b.what) return b.what;
	if (b.type === "job" && b.job) return jobLabel(b.job);
	if (b.engine) return `${b.engine}-Dump`;
	if (b.format) return `Kopie (${b.format})`;
	return b.id ?? "ohne id";
}

/** Display title of a task: `what`, else the id. */
export function taskTitle(b: TaskBlock): string {
	return b.what ?? b.id ?? "ohne id";
}

export function jobLabel(job: string): string {
	return { prune: "Prune", verify: "Verify", gc: "Garbage Collection", sync: "Sync" }[job] ?? job;
}

/** Finds the note of a machine or cluster named `name` (for `runs-on` links). */
export function findResourceNote(index: HomelabIndex, name: string, kinds: NetworkResource["kind"][]): NoteRef | undefined {
	const list = index.networkByName.get(name);
	return list?.find((e) => kinds.includes(e.res.kind))?.note;
}
