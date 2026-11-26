import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { core, y, fields, find } from "./helpers.mjs";

const { parseTasks, buildIndex, classify, findOverlaps, runsBetween, zonedToInstant } = core;

function issuesOf(text) {
	return parseTasks(y(text)).flatMap((p) => p.issues);
}

const REBOOT = `
schema: 1
id: vm-docker-01-reboot
what: Neustart aus dem Gast
kind: reboot
runner: {cron: centauri, file: crontab/proxmox.centauri.crontab, user: root}
schedule: {weekdays: [mon], times: ["05:30"]}
tz: Europe/Berlin
duration: 15m
command: qm guest exec 2001 -- systemctl reboot
`;

describe("tasks schema 1: valid blocks", () => {
	test("host cron with file, user, duration and command", () => {
		const [p] = parseTasks(y(REBOOT));
		assert.deepEqual(p.issues, []);
		assert.equal(p.field, "tasks");
		assert.deepEqual(p.block.runner, { kind: "cron", host: "centauri", file: "crontab/proxmox.centauri.crontab", user: "root" });
		assert.equal(p.block.kind, "reboot");
		assert.equal(p.block.durationMs, 15 * 60 * 1000);
		assert.equal(p.block.schedule.kind, "times");
	});
	test("k3s CronJob, Komodo procedure and action, app-internal, as a list", () => {
		const parsed = parseTasks(
			y(`
- {schema: 1, id: a, what: x, runner: {k3s: kube-system/cleanup}, schedule: {every: 6h}, tz: UTC}
- {schema: 1, id: b, what: x, runner: {komodo: Global Auto Update}, schedule: {times: ["06:30"]}, tz: Europe/Berlin}
- {schema: 1, id: c, what: x, runner: {komodo: prune, type: action}, schedule: {times: ["04:00"]}, tz: Europe/Berlin}
- {schema: 1, id: d, what: x, runner: {app: homeassistant}, schedule: {times: ["03:00"]}, tz: Europe/Berlin}
`),
		);
		assert.deepEqual(parsed.flatMap((p) => p.issues), []);
		assert.deepEqual(
			parsed.map((p) => p.block.runner),
			[
				{ kind: "k3s", cronjob: "kube-system/cleanup" },
				{ kind: "komodo", name: "Global Auto Update", type: "procedure" },
				{ kind: "komodo", name: "prune", type: "action" },
				{ kind: "app", app: "homeassistant" },
			],
		);
		assert.equal(parsed[1].field, "tasks[1]");
	});
});

describe("tasks schema 1: errors", () => {
	test("required fields", () => {
		assert.deepEqual(fields(issuesOf("{what: x}")).sort(), ["tasks.id", "tasks.runner", "tasks.schedule", "tasks.schema", "tasks.tz"]);
	});
	test("runner needs exactly one kind, fields of another kind are named", () => {
		const none = find(issuesOf(REBOOT.replace(/runner: .*/, "runner: {file: x}")), "tasks.runner");
		assert.match(none.message, /genau einer fehlt: cron, k3s, komodo, app/);
		const two = find(issuesOf(REBOOT.replace(/runner: .*/, "runner: {cron: sol, k3s: a/b}")), "tasks.runner");
		assert.match(two.message, /genau einer erlaubt/);
		const wrong = find(issuesOf(REBOOT.replace(/runner: .*/, "runner: {k3s: a/b, file: x}")), "tasks.runner.file");
		assert.match(wrong.message, /gehört zu cron, nicht zu k3s/);
	});
	test("k3s needs namespace/cronjob, komodo type only procedure or action", () => {
		assert.ok(find(issuesOf(REBOOT.replace(/runner: .*/, "runner: {k3s: cleanup}")), "tasks.runner.k3s"));
		assert.ok(find(issuesOf(REBOOT.replace(/runner: .*/, "runner: {komodo: x, type: stack}")), "tasks.runner.type"));
	});
	test("backup fields get a hint, kind and duration are checked", () => {
		const issues = issuesOf(`${REBOOT}grace: 1h\nsystem: pbs\n`);
		assert.match(find(issues, "tasks.grace").message, /duration/);
		assert.match(find(issues, "tasks.system").message, /backup/);
		assert.ok(find(issuesOf(REBOOT.replace("kind: reboot", "kind: restart")), "tasks.kind"));
		assert.ok(find(issuesOf(REBOOT.replace("duration: 15m", "duration: soon")), "tasks.duration"));
	});
});

describe("tasks in the index and the schedule", () => {
	const pbs = `backup:
  - {schema: 1, id: vm-pbs, system: pbs, source: {pbs: vm/2001}, schedule: {weekdays: [mon], times: ["05:00"]}, tz: Europe/Berlin, grace: 3h}
`;
	test("tasks are indexed per note; duplicate ids are errors", () => {
		const idx = buildIndex([
			{ path: "vm/a.md", frontmatter: y(`tasks:\n  - ${JSON.stringify(y(REBOOT))}`) },
			{ path: "vm/b.md", frontmatter: y(`tasks: ${JSON.stringify(y(REBOOT))}`) },
		]);
		assert.equal(idx.tasks.length, 2);
		assert.equal(idx.byNote.get("vm/a.md").tasks.length, 1);
		for (const e of idx.tasks) assert.match(find(e.issues, `${e.field}.id`).message, /doppelte id vm-docker-01-reboot/);
	});
	test("a reboot inside a backup window of the same note is a collision, other tasks a hint", () => {
		const reboot = { key: "t", notePath: "vm/a.md", type: "task", taskKind: "reboot" };
		const update = { key: "u", notePath: "vm/a.md", type: "task", taskKind: "update" };
		const backup = { key: "b", notePath: "vm/a.md", type: "backup", target: "pbs:pbs" };
		const elsewhere = { key: "x", notePath: "vm/b.md", type: "backup", target: "pbs:pbs" };
		assert.equal(classify(reboot, backup), "collision");
		assert.equal(classify(backup, reboot), "collision");
		assert.equal(classify(update, backup), "hint");
		assert.equal(classify(reboot, update), "hint");
		assert.equal(classify(reboot, elsewhere), null);
	});
	test("runs of tasks and backups overlap in the week", () => {
		const idx = buildIndex([{ path: "vm/a.md", frontmatter: y(`${pbs}tasks: ${JSON.stringify(y(REBOOT))}`) }]);
		const blocks = [
			...idx.tasks.map((e) => ({ key: e.key, notePath: e.note.path, type: "task", taskKind: e.block.kind, graceMs: e.block.durationMs, schedule: e.block.schedule, tz: e.block.tz })),
			...idx.backups.map((e) => ({ key: e.key, notePath: e.note.path, type: e.block.type, target: e.target, graceMs: e.block.graceMs, schedule: e.block.schedule, tz: e.block.tz })),
		];
		const from = zonedToInstant({ year: 2026, month: 11, day: 30 }, 0, 0, "Europe/Berlin");
		const overlaps = findOverlaps(runsBetween(blocks, from, from + 7 * 86400000));
		assert.equal(overlaps.length, 1);
		assert.equal(overlaps[0].level, "collision");
	});
});
