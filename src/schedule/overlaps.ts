/**
 * Runs of fixed-time schedules within a time range, and the overlaps between them.
 *
 * A run occupies [start, start + grace) – the window in which its copy has to
 * arrive. Without `grace` a run counts as one minute.
 *
 * Which overlaps are reported:
 * - **collision**: two runs at the same target (repo, datastore, folder, volume)
 *   where at least one is a job (prune, verify, gc, sync). Example: the restic
 *   backup at 02:30 and the Sunday prune of the same repo at 02:30.
 * - **hint**: two runs of the same note (the same VM or app) at different targets.
 *
 * Not reported, because they belong together by design: a block and its
 * `copy-of`; a sync job and the backups it delivers to its target; backups that
 * share a target (several apps dumping into one repo).
 */
import { Schedule, occurrences } from "./schedule";
import { MINUTE } from "./time";

export interface PlannedBlock {
	key: string;
	id?: string;
	notePath: string;
	type: "backup" | "job";
	job?: string;
	target?: string;
	copyOf?: string;
	graceMs?: number;
	schedule: Schedule;
	tz: string;
}

export interface Run<B extends PlannedBlock = PlannedBlock> {
	block: B;
	start: number;
	end: number;
}

export interface Overlap<B extends PlannedBlock = PlannedBlock> {
	a: B;
	b: B;
	level: "collision" | "hint";
	/** Overlapping windows, one per occurrence */
	windows: { from: number; to: number }[];
}

export function runLength(b: PlannedBlock): number {
	return Math.max(b.graceMs ?? 0, MINUTE);
}

/** Runs that overlap [from, to): starts in range plus earlier starts whose window reaches into it. */
export function runsBetween<B extends PlannedBlock>(blocks: B[], from: number, to: number): Run<B>[] {
	const runs: Run<B>[] = [];
	for (const block of blocks) {
		const len = runLength(block);
		for (const start of occurrences(block.schedule, block.tz, from - len, to)) {
			if (start + len > from) runs.push({ block, start, end: start + len });
		}
	}
	return runs.sort((a, b) => a.start - b.start || a.block.key.localeCompare(b.block.key));
}

export function classify(a: PlannedBlock, b: PlannedBlock): Overlap["level"] | null {
	if (a.key === b.key) return null;
	if ((a.copyOf && a.copyOf === b.id) || (b.copyOf && b.copyOf === a.id)) return null;
	const sameTarget = !!a.target && a.target === b.target;
	if (sameTarget) {
		const sync = (x: PlannedBlock, y: PlannedBlock) => x.type === "job" && x.job === "sync" && y.type === "backup";
		if (sync(a, b) || sync(b, a)) return null;
		if (a.type === "backup" && b.type === "backup") return null;
		return "collision";
	}
	return a.notePath === b.notePath ? "hint" : null;
}

export function findOverlaps<B extends PlannedBlock>(runs: Run<B>[]): Overlap<B>[] {
	const byPair = new Map<string, Overlap<B>>();
	const sorted = [...runs].sort((x, y) => x.start - y.start);
	for (let i = 0; i < sorted.length; i++) {
		const r1 = sorted[i];
		for (let j = i + 1; j < sorted.length; j++) {
			const r2 = sorted[j];
			if (r2.start >= r1.end) break;
			const level = classify(r1.block, r2.block);
			if (!level) continue;
			const [a, b] = r1.block.key < r2.block.key ? [r1.block, r2.block] : [r2.block, r1.block];
			const pair = `${a.key}|${b.key}`;
			let o = byPair.get(pair);
			if (!o) {
				o = { a, b, level, windows: [] };
				byPair.set(pair, o);
			}
			o.windows.push({ from: Math.max(r1.start, r2.start), to: Math.min(r1.end, r2.end) });
		}
	}
	return [...byPair.values()].sort(
		(x, y) => (x.level === y.level ? x.windows[0].from - y.windows[0].from : x.level === "collision" ? -1 : 1),
	);
}
