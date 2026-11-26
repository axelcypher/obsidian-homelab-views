import {
	DAY,
	HOUR,
	MINUTE,
	LocalDate,
	addDays,
	clock,
	localDate,
	sameLocalDate,
	weekdayOf,
	zonedToInstant,
} from "./time";

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const WEEKDAY_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;

export type Schedule =
	| { kind: "times"; times: string[]; weekdays?: Weekday[] }
	| { kind: "every"; every: string; everyMs: number };

// ---------------------------------------------------------------------------
// Durations

const DURATION = /^(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?$/;

/** Parses a duration like `30m`, `3h`, `1d` or `1h30m`; returns milliseconds or null. */
export function parseDuration(s: string): number | null {
	const m = DURATION.exec(s.trim());
	if (!m || (!m[1] && !m[2] && !m[3])) return null;
	const ms = (+(m[1] ?? 0) * 24 + +(m[2] ?? 0)) * HOUR + +(m[3] ?? 0) * MINUTE;
	return ms > 0 ? ms : null;
}

/** German duration: "30 min", "6 h", "1 h 30 min", "1 Tag", "14 Tage", "1 Tag 6 h". */
export function formatDuration(ms: number): string {
	const total = Math.round(ms / MINUTE);
	const days = Math.floor(total / (24 * 60));
	const hours = Math.floor((total % (24 * 60)) / 60);
	const minutes = total % 60;
	const parts: string[] = [];
	if (days) parts.push(days === 1 ? "1 Tag" : `${days} Tage`);
	if (hours) parts.push(`${hours} h`);
	if (minutes) parts.push(`${minutes} min`);
	return parts.length ? parts.join(" ") : "0 min";
}

// ---------------------------------------------------------------------------
// Readable schedule

export function weekdayIndex(d: Weekday): number {
	return WEEKDAYS.indexOf(d);
}

/** "täglich", "Mi", "Mo–Fr", "Sa, So", "Mo, Mi, Fr", "Mo–Mi, Sa". Ranges need three or more days. */
export function formatWeekdays(days: readonly Weekday[] | undefined): string {
	if (!days || days.length === 0) return "täglich";
	const idx = [...new Set(days.map(weekdayIndex))].sort((a, b) => a - b);
	if (idx.length === 7) return "täglich";
	const runs: number[][] = [];
	for (const i of idx) {
		const last = runs[runs.length - 1];
		if (last && last[last.length - 1] === i - 1) last.push(i);
		else runs.push([i]);
	}
	return runs
		.map((r) =>
			r.length >= 3 ? `${WEEKDAY_SHORT[r[0]]}–${WEEKDAY_SHORT[r[r.length - 1]]}` : r.map((i) => WEEKDAY_SHORT[i]).join(", "),
		)
		.join(", ");
}

export function sortedTimes(times: readonly string[]): string[] {
	return [...new Set(times)].sort();
}

/** "täglich 07:15 · 13:15", "Mi 03:00", "alle 6 h". */
export function formatSchedule(s: Schedule): string {
	if (s.kind === "every") return `alle ${formatDuration(s.everyMs)}`;
	return `${formatWeekdays(s.weekdays)} ${sortedTimes(s.times).join(" · ")}`;
}

// ---------------------------------------------------------------------------
// Next run and occurrences

export type NextRun =
	| { kind: "at"; at: number }
	/** Interval schedules have no fixed time; `at` is only known from the last run. */
	| { kind: "interval"; everyMs: number; at: number | null };

function hm(t: string): [number, number] {
	const [h, m] = t.split(":").map((x) => parseInt(x, 10));
	return [h, m];
}

function runsOn(s: Extract<Schedule, { kind: "times" }>, d: LocalDate): boolean {
	if (!s.weekdays || s.weekdays.length === 0) return true;
	const wd = weekdayOf(d);
	return s.weekdays.some((w) => weekdayIndex(w) === wd);
}

/**
 * Next start strictly after `now`. Fixed times are interpreted in `tz`
 * (the schedule's own zone); the result is an instant, to be shown in any zone.
 */
export function nextRun(s: Schedule, tz: string, now: number, lastRun?: number): NextRun {
	if (s.kind === "every") {
		let at: number | null = null;
		if (lastRun !== undefined) {
			at = lastRun + s.everyMs;
			while (at <= now) at += s.everyMs;
		}
		return { kind: "interval", everyMs: s.everyMs, at };
	}
	const today = localDate(now, tz);
	const times = sortedTimes(s.times).map(hm);
	for (let i = 0; i <= 8; i++) {
		const d = addDays(today, i);
		if (!runsOn(s, d)) continue;
		for (const [h, m] of times) {
			const at = zonedToInstant(d, h, m, tz);
			if (at > now) return { kind: "at", at };
		}
	}
	// Unreachable for valid schedules (every weekday occurs within 8 days).
	return { kind: "interval", everyMs: 0, at: null };
}

/** All starts in [from, to) of a fixed-time schedule. Interval schedules have none. */
export function occurrences(s: Schedule, tz: string, from: number, to: number): number[] {
	if (s.kind === "every") return [];
	const out: number[] = [];
	const times = sortedTimes(s.times).map(hm);
	let d = localDate(from - DAY, tz);
	const last = localDate(to + DAY, tz);
	for (let guard = 0; guard < 400; guard++) {
		if (runsOn(s, d)) {
			for (const [h, m] of times) {
				const at = zonedToInstant(d, h, m, tz);
				if (at >= from && at < to) out.push(at);
			}
		}
		if (sameLocalDate(d, last)) break;
		d = addDays(d, 1);
	}
	return out.sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Display of instants

/** "heute", "morgen", or "Mi 02.12." for the local date of `at` in `tz`. */
export function formatDay(at: number, tz: string, now: number): string {
	const d = localDate(at, tz);
	const today = localDate(now, tz);
	if (sameLocalDate(d, today)) return "heute";
	if (sameLocalDate(d, addDays(today, 1))) return "morgen";
	if (sameLocalDate(d, addDays(today, -1))) return "gestern";
	return `${WEEKDAY_SHORT[weekdayOf(d)]} ${String(d.day).padStart(2, "0")}.${String(d.month).padStart(2, "0")}.`;
}

/** "in 5 min", "in 3 h 20 min", "in 6 Tagen". */
export function formatRelative(delta: number): string {
	const future = delta >= 0;
	const abs = Math.abs(delta);
	let text: string;
	if (abs < MINUTE) text = "weniger als 1 min";
	else if (abs < HOUR) text = `${Math.round(abs / MINUTE)} min`;
	else if (abs < DAY) {
		const h = Math.floor(abs / HOUR);
		const m = Math.round((abs % HOUR) / MINUTE);
		text = m ? `${h} h ${m} min` : `${h} h`;
	} else {
		const days = Math.round(abs / DAY);
		text = days === 1 ? "1 Tag" : `${days} Tagen`;
	}
	return future ? `in ${text}` : `vor ${text}`;
}

export interface RunLabel {
	/** "heute", "morgen", "Mi 02.12." */
	day: string;
	/** "19:15" in the display zone */
	time: string;
	/** "in 4 h 15 min" */
	relative: string;
	/** "07:15 UTC" when the schedule zone differs from the display zone and the clock reads differently */
	original?: string;
}

export function labelRun(at: number, scheduleTz: string, displayTz: string, now: number): RunLabel {
	const time = clock(at, displayTz);
	const label: RunLabel = { day: formatDay(at, displayTz, now), time, relative: formatRelative(at - now) };
	if (scheduleTz !== displayTz) {
		const orig = clock(at, scheduleTz);
		if (orig !== time) label.original = `${orig} ${scheduleTz}`;
	}
	return label;
}
