import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { core } from "./helpers.mjs";

const { nextRun, occurrences, labelRun, formatSchedule, formatWeekdays, parseDuration, formatDuration, formatRelative, zonedToInstant, wallTime, isValidTimeZone, clock } = core;

const times = (t, weekdays) => (weekdays ? { kind: "times", times: t, weekdays } : { kind: "times", times: t });
const at = (iso) => Date.parse(iso);
const iso = (ms) => new Date(ms).toISOString();
const next = (s, tz, now) => {
	const n = nextRun(s, tz, at(now));
	assert.equal(n.kind, "at");
	return iso(n.at);
};

describe("next run: fixed times", () => {
	// Thursday, 26 Nov 2026, 15:00 in Berlin (CET, UTC+1)
	const NOW = "2026-11-26T15:00:00+01:00";

	test("later today", () => {
		assert.equal(next(times(["07:15", "13:15", "19:15", "23:15"]), "Europe/Berlin", NOW), "2026-11-26T18:15:00.000Z");
	});

	test("after the last time of the day: first time tomorrow", () => {
		assert.equal(next(times(["07:15", "23:15"]), "Europe/Berlin", "2026-11-26T23:30:00+01:00"), "2026-11-27T06:15:00.000Z");
	});

	test("exactly at a start: the next one", () => {
		assert.equal(next(times(["15:00", "16:00"]), "Europe/Berlin", NOW), "2026-11-26T15:00:00.000Z");
	});

	test("unsorted times are handled", () => {
		assert.equal(next(times(["23:15", "07:15", "19:15"]), "Europe/Berlin", NOW), "2026-11-26T18:15:00.000Z");
	});

	test("weekday later in the week and across the week end", () => {
		assert.equal(next(times(["01:00"], ["sun"]), "Europe/Berlin", NOW), "2026-11-29T00:00:00.000Z");
		// Wednesday from a Thursday: six days ahead
		assert.equal(next(times(["03:00"], ["wed"]), "Europe/Berlin", NOW), "2026-12-02T02:00:00.000Z");
	});

	test("same weekday: today before the time, next week after it", () => {
		assert.equal(next(times(["16:00"], ["thu"]), "Europe/Berlin", NOW), "2026-11-26T15:00:00.000Z");
		assert.equal(next(times(["14:00"], ["thu"]), "Europe/Berlin", NOW), "2026-12-03T13:00:00.000Z");
	});

	test("Mo–Fr on a Friday evening jumps over the weekend", () => {
		assert.equal(next(times(["04:45"], ["mon", "tue", "wed", "thu", "fri"]), "Europe/Berlin", "2026-11-27T20:00:00+01:00"), "2026-11-30T03:45:00.000Z");
	});

	test("the weekday is taken in the schedule's zone, not in UTC", () => {
		// 23:30 Sunday in Berlin is still Sunday; in UTC it is 22:30 Sunday
		assert.equal(next(times(["23:30"], ["sun"]), "Europe/Berlin", "2026-11-29T20:00:00+01:00"), "2026-11-29T22:30:00.000Z");
		// 00:30 Monday in Tokyo is Sunday 15:30 UTC
		assert.equal(next(times(["00:30"], ["mon"]), "Asia/Tokyo", "2026-11-29T12:00:00Z"), "2026-11-29T15:30:00.000Z");
	});
});

describe("next run: time zones", () => {
	test("UTC schedule shown in Berlin: one hour later in winter, two in summer", () => {
		const winter = nextRun(times(["02:00"]), "UTC", at("2026-11-26T15:00:00Z"));
		assert.equal(iso(winter.at), "2026-11-27T02:00:00.000Z");
		assert.equal(clock(winter.at, "Europe/Berlin"), "03:00");
		const label = labelRun(winter.at, "UTC", "Europe/Berlin", at("2026-11-26T15:00:00Z"));
		assert.deepEqual(label, { day: "morgen", time: "03:00", relative: "in 11 h", original: "02:00 UTC" });

		const summer = nextRun(times(["02:00"]), "UTC", at("2026-07-01T12:00:00Z"));
		assert.equal(clock(summer.at, "Europe/Berlin"), "04:00");
	});

	test("no original time when both zones read the same", () => {
		const n = nextRun(times(["02:00"]), "Europe/Berlin", at("2026-11-26T15:00:00Z"));
		assert.equal(labelRun(n.at, "Europe/Berlin", "Europe/Berlin", at("2026-11-26T15:00:00Z")).original, undefined);
	});

	test("Berlin schedule across the spring change keeps the wall time", () => {
		// Wednesday 03:00: before the change UTC+1, after it UTC+2
		assert.equal(next(times(["03:00"], ["wed"]), "Europe/Berlin", "2026-03-26T12:00:00+01:00"), "2026-04-01T01:00:00.000Z");
		assert.equal(next(times(["03:00"], ["wed"]), "Europe/Berlin", "2026-10-22T12:00:00+02:00"), "2026-10-28T02:00:00.000Z");
	});

	test("spring forward: 02:30 does not exist and is moved forward by the gap", () => {
		// Sunday 29 March 2026: 02:00 CET → 03:00 CEST
		assert.equal(next(times(["02:30"]), "Europe/Berlin", "2026-03-28T12:00:00+01:00"), "2026-03-29T01:30:00.000Z");
		assert.equal(clock(at("2026-03-29T01:30:00Z"), "Europe/Berlin"), "03:30");
		// the day after it is 02:30 CEST again
		assert.equal(next(times(["02:30"]), "Europe/Berlin", "2026-03-29T12:00:00+02:00"), "2026-03-30T00:30:00.000Z");
	});

	test("fall back: 02:30 occurs twice, the earlier one counts", () => {
		// Sunday 25 October 2026: 03:00 CEST → 02:00 CET
		assert.equal(next(times(["02:30"]), "Europe/Berlin", "2026-10-24T12:00:00+02:00"), "2026-10-25T00:30:00.000Z");
		// once past the first 02:30, the next run is the next day (not the repeated hour)
		assert.equal(next(times(["02:30"]), "Europe/Berlin", "2026-10-25T00:45:00Z"), "2026-10-26T01:30:00.000Z");
	});

	test("other zones with other change dates (New York, 8 March 2026)", () => {
		assert.equal(next(times(["02:30"]), "America/New_York", "2026-03-07T12:00:00-05:00"), "2026-03-08T07:30:00.000Z");
		assert.equal(clock(at("2026-03-08T07:30:00Z"), "America/New_York"), "03:30");
	});

	test("zonedToInstant and wallTime round trip", () => {
		for (const tz of ["Europe/Berlin", "UTC", "America/New_York", "Australia/Sydney", "Asia/Kolkata"]) {
			const ms = zonedToInstant({ year: 2026, month: 6, day: 15 }, 9, 45, tz);
			const w = wallTime(ms, tz);
			assert.deepEqual([w.year, w.month, w.day, w.hour, w.minute], [2026, 6, 15, 9, 45], tz);
		}
	});

	test("time zone names", () => {
		assert.ok(isValidTimeZone("Europe/Berlin"));
		assert.ok(isValidTimeZone("UTC"));
		assert.ok(isValidTimeZone("America/Argentina/Buenos_Aires"));
		assert.ok(!isValidTimeZone("Europe/Berlinn"));
		assert.ok(!isValidTimeZone("+01:00"));
		assert.ok(!isValidTimeZone("Berlin"));
	});
});

describe("next run: intervals (every)", () => {
	const s = { kind: "every", every: "6h", everyMs: parseDuration("6h") };

	test("without a last run there is no fixed next time", () => {
		assert.deepEqual(nextRun(s, "Europe/Berlin", at("2026-11-26T15:00:00Z")), { kind: "interval", everyMs: 21_600_000, at: null });
	});

	test("with a last run: last run + interval, rolled past now", () => {
		const now = at("2026-11-26T15:00:00Z");
		assert.equal(iso(nextRun(s, "UTC", now, at("2026-11-26T12:00:00Z")).at), "2026-11-26T18:00:00.000Z");
		assert.equal(iso(nextRun(s, "UTC", now, at("2026-11-25T01:00:00Z")).at), "2026-11-26T19:00:00.000Z");
	});

	test("interval schedules have no occurrences on the timeline", () => {
		assert.deepEqual(occurrences(s, "UTC", at("2026-11-23T00:00:00Z"), at("2026-11-30T00:00:00Z")), []);
	});
});

describe("occurrences", () => {
	test("four times a day for a week", () => {
		const from = zonedToInstant({ year: 2026, month: 11, day: 23 }, 0, 0, "Europe/Berlin");
		const to = zonedToInstant({ year: 2026, month: 11, day: 30 }, 0, 0, "Europe/Berlin");
		const list = occurrences(times(["07:15", "13:15", "19:15", "23:15"]), "Europe/Berlin", from, to);
		assert.equal(list.length, 28);
		assert.equal(clock(list[0], "Europe/Berlin"), "07:15");
		assert.equal(clock(list[27], "Europe/Berlin"), "23:15");
	});

	test("the week with the spring change still has seven daily runs", () => {
		const from = zonedToInstant({ year: 2026, month: 3, day: 23 }, 0, 0, "Europe/Berlin");
		const to = zonedToInstant({ year: 2026, month: 3, day: 30 }, 0, 0, "Europe/Berlin");
		const list = occurrences(times(["02:30"]), "Europe/Berlin", from, to);
		assert.equal(list.length, 7);
		assert.deepEqual(list.map((ms) => clock(ms, "Europe/Berlin")).slice(5), ["02:30", "03:30"]);
	});
});

describe("readable German", () => {
	test("schedules", () => {
		assert.equal(formatSchedule(times(["07:15", "13:15", "19:15", "23:15"])), "täglich 07:15 · 13:15 · 19:15 · 23:15");
		assert.equal(formatSchedule(times(["03:00"], ["wed"])), "Mi 03:00");
		assert.equal(formatSchedule({ kind: "every", every: "6h", everyMs: 21_600_000 }), "alle 6 h");
		assert.equal(formatSchedule(times(["04:45"], ["fri", "mon", "tue", "wed", "thu"])), "Mo–Fr 04:45");
		assert.equal(formatSchedule(times(["10:00"], ["sat", "sun"])), "Sa, So 10:00");
		assert.equal(formatSchedule(times(["01:00"], ["mon", "tue", "wed", "thu", "fri", "sat", "sun"])), "täglich 01:00");
	});

	test("weekday lists", () => {
		assert.equal(formatWeekdays(["mon", "wed", "fri"]), "Mo, Mi, Fr");
		assert.equal(formatWeekdays(["mon", "tue", "wed", "sat"]), "Mo–Mi, Sa");
		assert.equal(formatWeekdays(undefined), "täglich");
	});

	test("durations", () => {
		assert.equal(parseDuration("30m"), 1_800_000);
		assert.equal(parseDuration("3h"), 10_800_000);
		assert.equal(parseDuration("1d"), 86_400_000);
		assert.equal(parseDuration("1h30m"), 5_400_000);
		for (const bad of ["", "3", "3 h", "1 Stunde", "0h", "h", "-1h", "1.5h"]) assert.equal(parseDuration(bad), null, bad);
		assert.equal(formatDuration(1_800_000), "30 min");
		assert.equal(formatDuration(5_400_000), "1 h 30 min");
		assert.equal(formatDuration(86_400_000), "1 Tag");
		assert.equal(formatDuration(14 * 86_400_000), "14 Tage");
	});

	test("relative times and day labels", () => {
		assert.equal(formatRelative(5 * 60_000), "in 5 min");
		assert.equal(formatRelative(3 * 3_600_000 + 20 * 60_000), "in 3 h 20 min");
		assert.equal(formatRelative(6 * 86_400_000), "in 6 Tagen");
		const now = at("2026-11-26T15:00:00+01:00");
		assert.equal(labelRun(at("2026-11-26T19:15:00+01:00"), "Europe/Berlin", "Europe/Berlin", now).day, "heute");
		assert.equal(labelRun(at("2026-11-27T07:15:00+01:00"), "Europe/Berlin", "Europe/Berlin", now).day, "morgen");
		assert.equal(labelRun(at("2026-12-02T03:00:00+01:00"), "Europe/Berlin", "Europe/Berlin", now).day, "Mi 02.12.");
	});
});
