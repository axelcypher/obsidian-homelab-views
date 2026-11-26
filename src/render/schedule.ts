/**
 * `homelab-schedule`: all runs of the current week (Monday to Sunday) in the
 * display zone, as a 00–24 timeline per weekday and as a list sorted by time;
 * interval schedules separately; overlaps of run windows (start + grace).
 */
import { BACKUP_SYSTEMS } from "../model/backup";
import { BackupEntry, backupTitle } from "../model/index";
import { compareKeys } from "../model/ip";
import { Overlap, PlannedBlock, Run, findOverlaps, runsBetween } from "../schedule/overlaps";
import { WEEKDAYS, WEEKDAY_SHORT, formatDuration, formatWeekdays } from "../schedule/schedule";
import { LocalDate, MINUTE, addDays, clock, localDate, sameLocalDate, wallTime, weekdayOf, zonedToInstant } from "../schedule/time";
import { el, txt } from "./dom";
import type { RenderEnv, ViewState } from "./env";
import { emptyState, icon, jobBadge, problemsSection, scrollWrap, systemClass, titleIsJob } from "./common";
import { JOB_LABEL, SOURCE_LABEL, SYSTEM_LABEL, plural } from "./labels";
import type { ScheduleOptions } from "./options";

interface Planned extends PlannedBlock {
	entry: BackupEntry;
}

interface Day {
	date: LocalDate;
	index: number;
	start: number;
	end: number;
	isToday: boolean;
}

export function planned(entries: BackupEntry[]): Planned[] {
	const out: Planned[] = [];
	for (const e of entries) {
		const b = e.block;
		if (b.type === "ignore" || !b.schedule || !b.tz || b.schedule.kind !== "times") continue;
		out.push({
			entry: e,
			key: e.key,
			id: b.id,
			notePath: e.note.path,
			type: b.type,
			job: b.job,
			target: e.target,
			copyOf: b.copyOf,
			graceMs: b.graceMs,
			schedule: b.schedule,
			tz: b.tz,
		});
	}
	return out;
}

export function currentWeek(now: number, tz: string): Day[] {
	const today = localDate(now, tz);
	const monday = addDays(today, -weekdayOf(today));
	return Array.from({ length: 7 }, (_, i) => {
		const date = addDays(monday, i);
		return {
			date,
			index: i,
			start: zonedToInstant(date, 0, 0, tz),
			end: zonedToInstant(addDays(date, 1), 0, 0, tz),
			isToday: sameLocalDate(date, today),
		};
	});
}

function minuteOfDay(ms: number, tz: string): number {
	const w = wallTime(ms, tz);
	return w.hour * 60 + w.minute;
}

function dateLabel(d: LocalDate): string {
	return `${String(d.day).padStart(2, "0")}.${String(d.month).padStart(2, "0")}.`;
}

const runId = (r: Run) => `${r.block.key}@${r.start}`;

export function renderSchedule(
	parent: HTMLElement,
	entries: BackupEntry[],
	env: RenderEnv,
	opts: ScheduleOptions,
	state: ViewState,
): void {
	void state;
	const root = el(parent, "div", "hv-root hv-view hv-schedule");
	let list = entries;
	if (opts.system) list = list.filter((e) => e.block.system && opts.system?.includes(e.block.system));
	if (!opts.jobs) list = list.filter((e) => e.block.type !== "job");
	if (!list.length) {
		emptyState(root, "Keine Backup-Blöcke gefunden.");
		return;
	}

	const tz = env.displayTz;
	const days = currentWeek(env.now, tz);
	const weekStart = days[0].start;
	const weekEnd = days[6].end;
	const blocks = planned(list);
	const runs = runsBetween(blocks, weekStart, weekEnd);
	const overlaps = findOverlaps(runs);
	const intervals = list.filter((e) => e.block.schedule?.kind === "every");

	// Runs taking part in an overlap, for highlighting
	const marked = new Map<string, Overlap["level"]>();
	for (const o of overlaps) {
		for (const w of o.windows) {
			for (const r of runs) {
				if ((r.block.key === o.a.key || r.block.key === o.b.key) && r.start < w.to && w.from < r.end) {
					const id = runId(r);
					if (marked.get(id) !== "collision") marked.set(id, o.level);
				}
			}
		}
	}

	// Header
	const bar = el(root, "div", "hv-toolbar");
	const legend = el(bar, "div", "hv-legend");
	for (const s of BACKUP_SYSTEMS) {
		if (!list.some((e) => e.block.system === s)) continue;
		const item = el(legend, "span", `hv-legend-item ${systemClass(s)}`);
		el(item, "span", { cls: "hv-dot", attr: { "aria-hidden": "true" } });
		el(item, "span", { text: SYSTEM_LABEL[s] });
	}
	if (list.some((e) => e.block.type === "job")) {
		const item = el(legend, "span", "hv-legend-item");
		el(item, "span", { cls: "hv-legend-swatch is-job", attr: { "aria-hidden": "true" } });
		el(item, "span", { text: "Job" });
	}
	el(bar, "div", {
		cls: "hv-toolbar-meta",
		text: `Woche ${dateLabel(days[0].date)}–${dateLabel(days[6].date)} · Zeiten in ${tz}`,
	});

	if (opts.view !== "list" && blocks.length) timeline(root, days, runs, marked, env);
	overlapSection(root, overlaps, intervals.length > 0, env);
	if (opts.view !== "timeline" && blocks.length) runList(root, days, runs, marked, env);
	if (intervals.length) intervalList(root, intervals, env);
	problemsSection(
		root,
		list.map((e) => ({ note: e.note, field: e.field, issues: e.issues, label: e.block.id })),
		env,
	);
}

// ---------------------------------------------------------------------------
// Timeline

function runTitle(r: Run<Planned>, tz: string): string {
	const b = r.block.entry.block;
	const parts = [
		`${clock(r.start, tz)}${b.graceMs ? `–${clock(r.end, tz)}` : ""}`,
		b.id ?? "",
		b.type === "job" ? `Job ${JOB_LABEL[b.job ?? ""] ?? b.job ?? ""}` : backupTitle(b),
		b.system ? SYSTEM_LABEL[b.system] : "",
		b.graceMs ? `Karenz ${formatDuration(b.graceMs)}` : "",
		r.block.entry.note.name,
	];
	return parts.filter(Boolean).join(" · ");
}

interface Segment {
	run: Run<Planned>;
	day: number;
	left: number;
	width: number;
	cont: boolean;
}

/** Runs with the same system, kind, start and length on a day are drawn as one bar. */
interface Bar {
	key: string;
	day: number;
	left: number;
	width: number;
	cont: boolean;
	segs: Segment[];
}

function timeline(
	parent: HTMLElement,
	days: Day[],
	runs: Run<Planned>[],
	marked: Map<string, Overlap["level"]>,
	env: RenderEnv,
): void {
	const tz = env.displayTz;

	// Cut runs into per-day segments and merge identical ones into bars.
	const bars = new Map<string, Bar>();
	for (const day of days) {
		for (const r of runs) {
			const from = Math.max(r.start, day.start);
			const to = Math.min(r.end, day.end);
			if (from >= to) continue;
			const b = r.block.entry.block;
			const seg: Segment = {
				run: r,
				day: day.index,
				left: minuteOfDay(from, tz),
				width: Math.max((to - from) / MINUTE, 1),
				cont: r.start < day.start,
			};
			const key = [b.system ?? "", b.type, b.graceMs ? "g" : "p", seg.left, Math.round(seg.width), seg.cont ? "c" : ""].join("|");
			const id = `${day.index}|${key}`;
			const bar = bars.get(id);
			if (bar) bar.segs.push(seg);
			else bars.set(id, { key, day: day.index, left: seg.left, width: seg.width, cont: seg.cont, segs: [seg] });
		}
	}

	// Lanes are assigned per bar key across the whole week, so a recurring run keeps its lane every day.
	const keys = new Map<string, { left: number; width: number }>();
	for (const bar of bars.values()) keys.set(bar.key, { left: bar.left, width: bar.width });
	const laneOf = new Map<string, number>();
	const laneEnds: number[] = [];
	const ordered = [...keys.entries()].sort((a, b) => a[1].left - b[1].left || b[1].width - a[1].width);
	for (const [key, k] of ordered) {
		const end = k.left + Math.max(k.width, 14);
		let lane = laneEnds.findIndex((e) => e <= k.left);
		if (lane < 0) {
			lane = laneEnds.length;
			laneEnds.push(end);
		} else laneEnds[lane] = end;
		laneOf.set(key, lane);
	}
	const lanes = Math.max(laneEnds.length, 1);

	const scroller = scrollWrap(parent, "hv-tl-scroll");
	const tl = el(scroller, "div", { cls: "hv-tl", attr: { role: "img", "aria-label": "Zeitleiste der Woche" } });
	tl.style.setProperty("--hv-lanes", String(lanes));

	const axisRow = el(tl, "div", "hv-tl-row hv-tl-axis-row");
	el(axisRow, "div", "hv-tl-day");
	const axis = el(axisRow, "div", "hv-tl-axis");
	for (let h = 0; h <= 24; h += 3) {
		el(axis, "span", {
			cls: `hv-tl-tick${h === 0 ? " is-first" : h === 24 ? " is-last" : ""}`,
			text: String(h).padStart(2, "0"),
			attr: { style: `left: ${(h / 24) * 100}%` },
		});
	}

	for (const day of days) {
		const row = el(tl, "div", `hv-tl-row${day.isToday ? " is-today" : ""}`);
		const label = el(row, "div", "hv-tl-day");
		el(label, "span", { cls: "hv-tl-wd", text: WEEKDAY_SHORT[day.index] });
		el(label, "span", { cls: "hv-tl-date", text: day.isToday ? "heute" : dateLabel(day.date) });
		const track = el(row, "div", "hv-tl-track");

		for (const bar of bars.values()) {
			if (bar.day !== day.index) continue;
			const first = bar.segs[0].run.block.entry.block;
			const levels = bar.segs.map((s) => marked.get(runId(s.run)));
			const cls = ["hv-tl-bar", systemClass(first.system)];
			if (first.type === "job") cls.push("is-job");
			if (!first.graceMs) cls.push("is-point");
			if (bar.cont) cls.push("is-cont");
			if (levels.includes("collision")) cls.push("is-collision");
			else if (levels.includes("hint")) cls.push("is-hint");
			const title = bar.segs.map((s) => runTitle(s.run, tz)).join("\n");
			const elBar = el(track, "div", {
				cls: cls.join(" "),
				title,
				attr: {
					style: `left: ${(bar.left / 1440) * 100}%; width: ${(bar.width / 1440) * 100}%; --hv-lane: ${laneOf.get(bar.key) ?? 0}`,
				},
			});
			const notes = new Set(bar.segs.map((s) => s.run.block.entry.note.path));
			if (notes.size === 1) env.bindOpen(elBar, bar.segs[0].run.block.entry.note);
			if (bar.segs.length > 1 && bar.width >= 85) el(elBar, "span", { cls: "hv-tl-count", text: `×${bar.segs.length}` });
		}

		if (day.isToday) {
			el(track, "div", {
				cls: "hv-tl-now",
				title: `jetzt ${clock(env.now, tz)}`,
				attr: { style: `left: ${(minuteOfDay(env.now, tz) / 1440) * 100}%` },
			});
		}
	}
}

// ---------------------------------------------------------------------------
// List by time of day

interface ListRow {
	planned: Planned;
	time: string;
	minute: number;
	original?: string;
	days: Set<number>;
	until?: string;
	level?: Overlap["level"];
}

function runList(parent: HTMLElement, days: Day[], runs: Run<Planned>[], marked: Map<string, Overlap["level"]>, env: RenderEnv): void {
	const tz = env.displayTz;
	const rows = new Map<string, ListRow>();
	for (const r of runs) {
		if (r.start < days[0].start || r.start >= days[6].end) continue;
		const time = clock(r.start, tz);
		const k = `${r.block.key}|${time}`;
		let row = rows.get(k);
		if (!row) {
			const b = r.block.entry.block;
			const orig = r.block.tz !== tz ? clock(r.start, r.block.tz) : undefined;
			row = {
				planned: r.block,
				time,
				minute: minuteOfDay(r.start, tz),
				original: orig && orig !== time ? `${orig} ${r.block.tz}` : undefined,
				days: new Set(),
				until: b.graceMs ? clock(r.end, tz) : undefined,
			};
			rows.set(k, row);
		}
		row.days.add(weekdayOf(localDate(r.start, tz)));
		const level = marked.get(runId(r));
		if (level === "collision" || (level === "hint" && !row.level)) row.level = level;
	}
	const sorted = [...rows.values()].sort(
		(a, b) =>
			a.minute - b.minute ||
			BACKUP_SYSTEMS.indexOf(a.planned.entry.block.system ?? "pbs") - BACKUP_SYSTEMS.indexOf(b.planned.entry.block.system ?? "pbs") ||
			compareKeys(a.planned.id ?? "", b.planned.id ?? ""),
	);

	const section = el(parent, "div", "hv-subsection");
	sectionTitle(section, "Läufe nach Uhrzeit", plural(sorted.length, "Startzeit", "Startzeiten"));
	const wrap = scrollWrap(section);
	const table = el(wrap, "table", "hv-table hv-run-table");
	const head = el(el(table, "thead"), "tr");
	for (const h of ["Zeit", "Tage", "Was", "Notiz", "Karenz"]) el(head, "th", { text: h });
	const tbody = el(table, "tbody");
	const todayIdx = days.find((d) => d.isToday)?.index;
	let lastMinute = -1;
	for (const r of sorted) {
		const b = r.planned.entry.block;
		const cls = [systemClass(b.system)];
		if (r.minute !== lastMinute && lastMinute >= 0) cls.push("is-new-time");
		if (r.level) cls.push(`is-${r.level}`);
		const tr = el(tbody, "tr", cls.join(" "));
		const sameTime = r.minute === lastMinute;
		lastMinute = r.minute;

		const t = el(tr, "td", "hv-col-time");
		el(t, "span", { cls: `hv-time hv-mono${sameTime ? " is-repeat" : ""}`, text: r.time });
		if (r.original) el(t, "div", { cls: "hv-time-orig hv-mono", text: r.original });

		const d = el(tr, "td", "hv-col-days");
		weekdayStrip(d, r.days, todayIdx);

		whatCell(el(tr, "td", "hv-col-was"), r.planned.entry, r.level);
		env.link(el(tr, "td", "hv-col-notiz"), r.planned.entry.note, r.planned.entry.note.name, "hv-note-link");
		const g = el(tr, "td", "hv-col-karenz");
		if (b.graceMs !== undefined) {
			txt(g, formatDuration(b.graceMs));
			if (r.until) el(g, "div", { cls: "hv-faint", text: `bis ${r.until}` });
		} else el(g, "span", { cls: "hv-faint", text: "–" });
	}
}

/** Title with job badge; below: system (coloured dot), id and an overlap tag. */
function whatCell(td: HTMLElement, e: BackupEntry, level?: Overlap["level"]): void {
	const b = e.block;
	const line = el(td, "div", "hv-what");
	el(line, "span", { cls: "hv-what-text", text: backupTitle(b) });
	if (b.type === "job") jobBadge(line, b.job, !titleIsJob(b));
	const meta = el(td, "div", `hv-what-meta ${systemClass(b.system)}`);
	el(meta, "span", { cls: "hv-dot", attr: { "aria-hidden": "true" } });
	el(meta, "span", { cls: "hv-what-sys", text: b.system ? SYSTEM_LABEL[b.system] : "ohne System" });
	el(meta, "span", { cls: "hv-what-id hv-mono", text: b.id ?? "" });
	if (level) {
		el(meta, "span", {
			cls: `hv-ov-tag is-${level}`,
			text: level === "collision" ? "Kollision" : "Überschneidung",
			title: "siehe Überschneidungen",
		});
	}
}

function weekdayStrip(parent: HTMLElement, days: Set<number>, today: number | undefined): void {
	const names = [...days].sort((a, b) => a - b).map((i) => WEEKDAYS[i]);
	const strip = el(parent, "span", { cls: "hv-wd-strip", title: formatWeekdays(names), attr: { "aria-label": formatWeekdays(names) } });
	for (let i = 0; i < 7; i++) {
		el(strip, "span", {
			cls: `hv-wd${days.has(i) ? " is-on" : ""}${today === i ? " is-today" : ""}`,
			text: WEEKDAY_SHORT[i],
			attr: { "aria-hidden": "true" },
		});
	}
}

function sectionTitle(parent: HTMLElement, title: string, meta?: string): void {
	const h = el(parent, "div", "hv-subsection-head");
	el(h, "span", { cls: "hv-subsection-title", text: title });
	if (meta) el(h, "span", { cls: "hv-subsection-meta", text: meta });
}

// ---------------------------------------------------------------------------
// Interval schedules

function intervalList(parent: HTMLElement, entries: BackupEntry[], env: RenderEnv): void {
	const section = el(parent, "div", "hv-subsection");
	sectionTitle(section, "Ohne feste Uhrzeit", "Intervall, driftet mit jedem Neustart");
	const wrap = scrollWrap(section);
	const table = el(wrap, "table", "hv-table hv-run-table");
	const head = el(el(table, "thead"), "tr");
	for (const h of ["Intervall", "Was", "Notiz", "Karenz"]) el(head, "th", { text: h });
	const tbody = el(table, "tbody");
	for (const e of entries) {
		const b = e.block;
		if (b.schedule?.kind !== "every") continue;
		const tr = el(tbody, "tr", systemClass(b.system));
		el(el(tr, "td", "hv-col-time"), "span", { cls: "hv-time", text: `alle ${formatDuration(b.schedule.everyMs)}` });
		whatCell(el(tr, "td", "hv-col-was"), e);
		env.link(el(tr, "td", "hv-col-notiz"), e.note, e.note.name, "hv-note-link");
		const g = el(tr, "td", "hv-col-karenz");
		if (b.graceMs !== undefined) {
			txt(g, formatDuration(b.graceMs));
			el(g, "div", { cls: "hv-faint", text: `überfällig nach ${formatDuration(b.schedule.everyMs + b.graceMs)}` });
		} else el(g, "span", { cls: "hv-faint", text: "–" });
	}
}

// ---------------------------------------------------------------------------
// Overlaps

/** "So 02:30–05:30", "täglich 02:30–03:00", "Mo, Mi 03:00–05:30". */
export function formatWindows(windows: { from: number; to: number }[], tz: string): string {
	const byRange = new Map<string, Set<number>>();
	for (const w of windows) {
		const range = w.to - w.from <= MINUTE ? clock(w.from, tz) : `${clock(w.from, tz)}–${clock(w.to, tz)}`;
		const set = byRange.get(range) ?? new Set<number>();
		set.add(weekdayOf(localDate(w.from, tz)));
		byRange.set(range, set);
	}
	return [...byRange.entries()]
		.map(([range, days]) => `${formatWeekdays([...days].sort((a, b) => a - b).map((i) => WEEKDAYS[i]))} ${range}`)
		.join(" · ");
}

function targetLabel(target: string): { kind: string; value: string } {
	const i = target.indexOf(":");
	const kind = target.slice(0, i);
	return { kind: kind === "pbs" ? "PBS-Datastore" : SOURCE_LABEL[kind] ?? kind, value: target.slice(i + 1) };
}

function blockRef(parent: HTMLElement, p: PlannedBlock, env: RenderEnv): void {
	const e = (p as Planned).entry;
	const b = e.block;
	const ref = el(parent, "span", `hv-ov-block ${systemClass(b.system)}`);
	el(ref, "span", { cls: "hv-dot", attr: { "aria-hidden": "true" } });
	env.link(ref, e.note, b.id ?? e.field, "hv-ref hv-mono");
	el(ref, "span", {
		cls: "hv-faint",
		text: ` ${b.type === "job" ? `Job ${JOB_LABEL[b.job ?? ""] ?? b.job ?? ""}` : b.system ? SYSTEM_LABEL[b.system] : ""}`,
	});
}

function overlapSection(parent: HTMLElement, overlaps: Overlap[], hasIntervals: boolean, env: RenderEnv): void {
	const collisions = overlaps.filter((o) => o.level === "collision");
	const hints = overlaps.filter((o) => o.level === "hint");
	const box = el(parent, "div", `hv-overlaps${collisions.length ? " has-collisions" : hints.length ? " has-hints" : " is-clear"}`);
	const head = el(box, "div", "hv-overlaps-head");
	icon(head, env, collisions.length || hints.length ? "alert-triangle" : "check", "hv-icon");
	if (!overlaps.length) {
		el(head, "span", { cls: "hv-overlaps-title", text: "Keine Überschneidungen" });
		el(head, "span", {
			cls: "hv-overlaps-meta",
			text: `am selben Ziel oder innerhalb einer Notiz${hasIntervals ? "; Intervall-Läufe ohne feste Uhrzeit sind nicht geprüft" : ""}`,
		});
		return;
	}
	el(head, "span", { cls: "hv-overlaps-title", text: "Überschneidungen" });
	el(head, "span", {
		cls: "hv-overlaps-meta",
		text: [collisions.length ? plural(collisions.length, "Kollision", "Kollisionen") : "", hints.length ? plural(hints.length, "Überschneidung", "Überschneidungen") : ""]
			.filter(Boolean)
			.join(" · "),
	});
	const list = el(box, "div", "hv-ov-list");
	for (const o of overlaps) {
		const item = el(list, "div", `hv-ov is-${o.level}`);
		const top = el(item, "div", "hv-ov-top");
		el(top, "span", { cls: `hv-ov-tag is-${o.level}`, text: o.level === "collision" ? "Kollision" : "Überschneidung" });
		el(top, "span", { cls: "hv-ov-when hv-mono", text: formatWindows(o.windows, env.displayTz) });
		const what = el(item, "div", "hv-ov-what");
		blockRef(what, o.a, env);
		el(what, "span", { cls: "hv-ov-and", text: "und" });
		blockRef(what, o.b, env);
		const why = el(item, "div", "hv-ov-why");
		if (o.level === "collision" && o.a.target) {
			const t = targetLabel(o.a.target);
			txt(why, `gleichzeitig am selben Ziel: ${t.kind} `);
			el(why, "span", { cls: "hv-mono", text: t.value });
		} else {
			txt(why, "gleichzeitig in derselben Notiz ");
			const e = (o.a as Planned).entry;
			env.link(why, e.note, e.note.name, "hv-ref");
		}
	}
	if (hasIntervals) el(box, "div", { cls: "hv-overlaps-foot", text: "Intervall-Läufe ohne feste Uhrzeit sind nicht geprüft." });
}
