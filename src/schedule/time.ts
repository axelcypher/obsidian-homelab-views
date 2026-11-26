/**
 * Time zone arithmetic on top of the Intl API (no external tz database).
 *
 * Wall times are converted to instants with the same disambiguation as
 * `Temporal`'s default ("compatible"): a time that does not exist because the
 * clock jumps forward (02:30 on the last Sunday of March in Europe/Berlin) is
 * moved forward by the gap (03:30 CEST); a time that occurs twice because the
 * clock goes back (02:30 on the last Sunday of October) means the earlier one.
 */

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export interface WallTime {
	year: number;
	month: number;
	day: number;
	hour: number;
	minute: number;
	second: number;
	/** 0 = Monday … 6 = Sunday */
	weekday: number;
}

export interface LocalDate {
	year: number;
	month: number;
	day: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
	let f = formatters.get(tz);
	if (!f) {
		f = new Intl.DateTimeFormat("en-US", {
			timeZone: tz,
			hourCycle: "h23",
			year: "numeric",
			month: "numeric",
			day: "numeric",
			hour: "numeric",
			minute: "numeric",
			second: "numeric",
		});
		formatters.set(tz, f);
	}
	return f;
}

const IANA_NAME = /^(?:UTC|GMT|[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)+)$/;

/** True for IANA zone names the runtime knows (`Europe/Berlin`, `UTC`); offsets like `+01:00` are rejected. */
export function isValidTimeZone(tz: string): boolean {
	if (!IANA_NAME.test(tz)) return false;
	try {
		formatter(tz);
		return true;
	} catch {
		return false;
	}
}

/** Weekday of a calendar date, 0 = Monday … 6 = Sunday. */
export function weekdayOf(d: LocalDate): number {
	return (new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay() + 6) % 7;
}

export function addDays(d: LocalDate, n: number): LocalDate {
	const t = new Date(Date.UTC(d.year, d.month - 1, d.day + n));
	return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
}

/** The wall clock reading of instant `ms` in zone `tz`. */
export function wallTime(ms: number, tz: string): WallTime {
	const parts = formatter(tz).formatToParts(new Date(ms));
	const get = (type: Intl.DateTimeFormatPartTypes) => {
		const p = parts.find((x) => x.type === type);
		return p ? parseInt(p.value, 10) : 0;
	};
	const date = { year: get("year"), month: get("month"), day: get("day") };
	return {
		...date,
		hour: get("hour") % 24,
		minute: get("minute"),
		second: get("second"),
		weekday: weekdayOf(date),
	};
}

/** UTC offset of zone `tz` at instant `ms`, in milliseconds (positive east of Greenwich). */
export function offsetAt(ms: number, tz: string): number {
	const w = wallTime(ms, tz);
	const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
	return asUtc - Math.floor(ms / 1000) * 1000;
}

/** Instant of a wall time in zone `tz`, see the module comment for gaps and overlaps. */
export function zonedToInstant(d: LocalDate, hour: number, minute: number, tz: string): number {
	const wall = Date.UTC(d.year, d.month - 1, d.day, hour, minute);
	const before = offsetAt(wall - DAY, tz);
	const after = offsetAt(wall + DAY, tz);
	const candidates = [wall - before, wall - after].filter((t) => offsetAt(t, tz) === wall - t);
	if (candidates.length) return Math.min(...candidates);
	// Gap: interpret with the offset before the transition, which moves the time forward.
	return wall - before;
}

/** Local calendar date of instant `ms` in zone `tz`. */
export function localDate(ms: number, tz: string): LocalDate {
	const w = wallTime(ms, tz);
	return { year: w.year, month: w.month, day: w.day };
}

/** Start of the local day containing `ms`. */
export function startOfLocalDay(ms: number, tz: string): number {
	return zonedToInstant(localDate(ms, tz), 0, 0, tz);
}

export function sameLocalDate(a: LocalDate, b: LocalDate): boolean {
	return a.year === b.year && a.month === b.month && a.day === b.day;
}

export function pad2(n: number): string {
	return n < 10 ? `0${n}` : String(n);
}

/** "HH:MM" of instant `ms` in zone `tz`. */
export function clock(ms: number, tz: string): string {
	const w = wallTime(ms, tz);
	return `${pad2(w.hour)}:${pad2(w.minute)}`;
}
