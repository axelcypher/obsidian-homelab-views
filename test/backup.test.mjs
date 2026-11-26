import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { core, y, fields, find, fixtureRecords } from "./helpers.mjs";

const { parseBackups } = core;

/** Issues of a single block given as YAML. */
function issuesOf(text) {
	const parsed = parseBackups(y(text));
	return parsed.flatMap((p) => p.issues);
}

const MINIMAL = `
schema: 1
id: test-block
system: restic
source: {restic: "10.50.0.10:/backup/x"}
schedule: {times: ["02:30"]}
tz: Europe/Berlin
`;

describe("backup schema 1: valid blocks", () => {
	test("all examples of the schema note are valid", () => {
		const examples = [
			`
- schema: 1
  id: vm-docker-01-pbs
  system: pbs
  what: Systemplatte
  source: {pbs: vm/2001}
  schedule: {weekdays: [wed], times: ["03:00"]}
  tz: Europe/Berlin
  grace: 3h
- schema: 1
  id: docker-01-restic
  system: restic
  what: /data (persistent, db, bulk)
  source: {restic: 10.50.0.10:/backup/docker/bind/01}
  schedule: {times: ["02:30"]}
  tz: Europe/Berlin
  grace: 3h
  retention: {keep-daily: 14, keep-weekly: 8, keep-monthly: 6}
- schema: 1
  id: docker-01-restic-prune
  type: job
  system: restic
  job: prune
  on: {restic: 10.50.0.10:/backup/docker/bind/01}
  schedule: {weekdays: [sun], times: ["02:30"]}
  tz: Europe/Berlin
- schema: 1
  id: docker-01-dumps-sync
  type: job
  system: dumps
  job: sync
  what: Komodo-Prozedur db-dumps-sync
  on: {restic: 10.50.0.10:/backup/docker/dumps/01}
  schedule: {times: ["07:40", "13:40", "19:40", "23:40"]}
  tz: Europe/Berlin`,
			`
- schema: 1
  id: authentik-dump
  system: dumps
  engine: postgres
  format: dump
  source: {restic: 10.50.0.10:/backup/k3s/dumps, host: k3s, tag: authentik}
  schedule: {times: ["07:15", "13:15", "19:15", "23:15"]}
  tz: Europe/Berlin
  grace: 1h
  retention: {keep-last: 4, keep-daily: 7, keep-weekly: 4}
- schema: 1
  id: authentik-dump-nas
  system: dumps
  copy-of: authentik-dump
  engine: postgres
  format: dump
  source: {files: 10.30.0.5:/volume1/backup/database/k3s/authentik, pattern: "*/*.gz"}
  schedule: {weekdays: [sun], times: ["23:15"]}
  tz: Europe/Berlin
  grace: 2h
  retention: {keep-weekly: 3, keep-monthly: 3}`,
			`
- schema: 1
  id: vm-pbs-01-vzdump
  system: pbs-vm
  what: Systemplatte (VM 102)
  format: vma
  source: {files: 10.30.0.5:/volume1/backup/dump, pattern: "vzdump-qemu-102-*.vma.zst"}
  schedule: {weekdays: [sun], times: ["01:00"]}
  tz: Europe/Berlin
  grace: 2h
  retention: {keep-last: 3, keep-weekly: 1, keep-monthly: 1}
- schema: 1
  id: pbs-gc
  type: job
  system: pbs
  job: gc
  on: {pbs-datastore: pbs}
  schedule: {times: ["00:00"]}
  tz: Europe/Berlin`,
			`
schema: 1
id: mc-berkano
system: restic
what: Berkano world + config (über RCON)
source: {restic: 10.50.0.10:/backup/docker/minecraft/berkano}
schedule: {every: 6h}
tz: Europe/Berlin
grace: 2h
retention: {keep-last: 4, keep-daily: 7, keep-weekly: 4, keep-monthly: 3}`,
		];
		for (const text of examples) assert.deepEqual(issuesOf(text), [], text.slice(0, 60));
	});

	test("the backup blocks of the example notes are valid", () => {
		for (const name of ["Beispiel-VM.md", "Beispiel-App.md", "Beispiel-Gameserver.md"]) {
			const rec = fixtureRecords().find((r) => r.path === name);
			assert.deepEqual(parseBackups(rec.frontmatter.backup).flatMap((p) => p.issues), [], name);
		}
	});

	test("parses values into a typed block", () => {
		const [p] = parseBackups(
			y(`
schema: 1
id: authentik-dump
system: dumps
engine: postgres
source: {restic: "10.50.0.10:/backup/k3s/dumps", host: k3s, tag: authentik}
schedule: {times: ["13:15", "07:15"]}
tz: Europe/Berlin
grace: 1h
retention: {keep-last: 4, max-age: 14d}`),
		);
		const b = p.block;
		assert.equal(p.field, "backup");
		assert.equal(b.type, "backup");
		assert.equal(b.system, "dumps");
		assert.deepEqual(b.source, { kind: "restic", repo: "10.50.0.10:/backup/k3s/dumps", host: "k3s", tag: "authentik", path: undefined });
		assert.deepEqual(b.schedule, { kind: "times", times: ["13:15", "07:15"] });
		assert.equal(b.graceMs, 3_600_000);
		assert.deepEqual(b.retention.counts, [{ key: "keep-last", value: 4 }]);
		assert.equal(b.retention.maxAgeMs, 14 * 86_400_000);
	});

	test("a list gives one entry per block with its index", () => {
		const parsed = parseBackups([y(MINIMAL), { ...y(MINIMAL), id: "second" }]);
		assert.deepEqual(
			parsed.map((p) => [p.field, p.index, p.block.id]),
			[
				["backup[0]", 0, "test-block"],
				["backup[1]", 1, "second"],
			],
		);
	});
});

describe("backup schema 1: missing required fields", () => {
	for (const key of ["schema", "id", "system", "schedule", "tz"]) {
		test(`without ${key}`, () => {
			const obj = y(MINIMAL);
			delete obj[key];
			const issues = parseBackups(obj)[0].issues;
			const i = find(issues, `backup.${key}`);
			assert.ok(i, `issue for ${key}: ${JSON.stringify(issues)}`);
			assert.match(i.message, /Pflichtfeld fehlt/);
			assert.equal(i.severity, "error");
		});
	}

	test("a backup without source", () => {
		const obj = y(MINIMAL);
		delete obj.source;
		assert.deepEqual(fields(parseBackups(obj)[0].issues), ["backup.source"]);
	});

	test("a job without job and on", () => {
		const issues = issuesOf(`
schema: 1
id: prune
type: job
system: restic
schedule: {times: ["02:30"]}
tz: UTC`);
		assert.deepEqual(fields(issues).sort(), ["backup.job", "backup.on"]);
	});

	test("schedule without times or every", () => {
		const issues = issuesOf(MINIMAL.replace(`schedule: {times: ["02:30"]}`, "schedule: {weekdays: [mon]}"));
		assert.equal(issues.length, 1);
		assert.equal(issues[0].field, "backup.schedule");
		assert.match(issues[0].message, /times .* oder every/);
	});
});

describe("backup schema 1: unknown fields", () => {
	test("typo at block level", () => {
		const issues = issuesOf(MINIMAL + "retension: {keep-daily: 7}\n");
		assert.deepEqual(fields(issues), ["backup.retension"]);
		assert.equal(issues[0].message, "unbekanntes Feld");
	});

	test("unknown keys in schedule, retention and source", () => {
		const issues = issuesOf(`
schema: 1
id: x
system: restic
source: {restic: "a:/b", pathh: /x}
schedule: {times: ["02:30"], time: "02:30"}
tz: UTC
retention: {keep-dayly: 7}`);
		assert.deepEqual(fields(issues).sort(), ["backup.retention.keep-dayly", "backup.schedule.time", "backup.source.pathh"]);
	});

	test("fields that belong to the other type", () => {
		assert.match(find(issuesOf(MINIMAL + "job: prune\n"), "backup.job").message, /nur bei type: job/);
		const job = `
schema: 1
id: j
type: job
system: restic
job: prune
on: {restic: "a:/b"}
schedule: {times: ["02:30"]}
tz: UTC
source: {restic: "a:/b"}
copy-of: other`;
		const issues = issuesOf(job);
		assert.match(find(issues, "backup.source").message, /nur bei type: backup/);
		assert.match(find(issues, "backup.copy-of").message, /nur bei type: backup/);
	});

	test("extra field of another location key", () => {
		const issues = issuesOf(MINIMAL.replace(`source: {restic: "10.50.0.10:/backup/x"}`, `source: {restic: "a:/b", ns: foo}`));
		assert.match(find(issues, "backup.source.ns").message, /gehört zu pbs, nicht zu restic/);
	});
});

describe("backup schema 1: wrong types and values", () => {
	test("schema as text and unknown version", () => {
		assert.match(find(issuesOf(MINIMAL.replace("schema: 1", 'schema: "1"')), "backup.schema").message, /muss die Zahl 1 sein/);
		assert.match(find(issuesOf(MINIMAL.replace("schema: 1", "schema: 2")), "backup.schema").message, /Version 2 ist unbekannt/);
	});

	test("time read as a number (unquoted in YAML 1.1) and malformed time", () => {
		// What a YAML 1.1 parser makes of 07:15 (sexagesimal 435)
		const obj = y(MINIMAL);
		obj.schedule = { times: [435, "7:15", "24:00"] };
		const issues = parseBackups(obj)[0].issues;
		assert.match(find(issues, "backup.schedule.times[0]").message, /Anführungszeichen/);
		assert.match(find(issues, "backup.schedule.times[1]").message, /keine Uhrzeit/);
		assert.match(find(issues, "backup.schedule.times[2]").message, /keine Uhrzeit/);
		assert.equal(parseBackups(obj)[0].block.schedule, undefined);
	});

	test("weekdays as text, unknown weekday", () => {
		assert.match(
			find(issuesOf(MINIMAL.replace(`{times: ["02:30"]}`, `{times: ["02:30"], weekdays: wed}`)), "backup.schedule.weekdays").message,
			/muss eine Liste sein/,
		);
		assert.match(
			find(issuesOf(MINIMAL.replace(`{times: ["02:30"]}`, `{times: ["02:30"], weekdays: [wednesday]}`)), "backup.schedule.weekdays[0]").message,
			/nicht erlaubt; erlaubt: mon, tue/,
		);
	});

	test("times and every together, weekdays with every", () => {
		assert.match(issuesOf(MINIMAL.replace(`{times: ["02:30"]}`, `{times: ["02:30"], every: 6h}`))[0].message, /nicht beides/);
		assert.deepEqual(fields(issuesOf(MINIMAL.replace(`{times: ["02:30"]}`, `{every: 6h, weekdays: [mon]}`))), ["backup.schedule.weekdays"]);
	});

	test("durations, counts and free text", () => {
		const issues = issuesOf(MINIMAL + `grace: 3\nwhat: 42\nretention: {keep-daily: "7", max-age: two weeks}\n`);
		assert.match(find(issues, "backup.grace").message, /muss Text sein, ist ganze Zahl/);
		assert.match(find(issues, "backup.what").message, /muss Text sein/);
		assert.match(find(issues, "backup.retention.keep-daily").message, /ganze Zahl/);
		assert.match(find(issues, "backup.retention.max-age").message, /keine Dauer/);
		assert.match(find(issuesOf(MINIMAL + "grace: 1 Stunde\n"), "backup.grace").message, /keine Dauer/);
	});

	test("enums: system, engine, format, type, job", () => {
		assert.match(find(issuesOf(MINIMAL.replace("system: restic", "system: borg")), "backup.system").message, /erlaubt: pbs, pbs-vm/);
		assert.ok(find(issuesOf(MINIMAL + "engine: postgresql\n"), "backup.engine"));
		assert.ok(find(issuesOf(MINIMAL + "format: zip\n"), "backup.format"));
		assert.ok(find(issuesOf(MINIMAL + "type: copy\n"), "backup.type"));
		const job = MINIMAL.replace(`source: {restic: "10.50.0.10:/backup/x"}`, `type: job\njob: backup\non: {restic: "a:/b"}`);
		assert.match(find(issuesOf(job), "backup.job").message, /erlaubt: prune, verify, gc, sync/);
	});

	test("id format and time zone", () => {
		assert.match(find(issuesOf(MINIMAL.replace("id: test-block", "id: Test_Block")), "backup.id").message, /Kleinbuchstaben/);
		assert.match(find(issuesOf(MINIMAL.replace("Europe/Berlin", "Europe/Berlinn")), "backup.tz").message, /IANA/);
		assert.ok(find(issuesOf(MINIMAL.replace("Europe/Berlin", '"+01:00"')), "backup.tz"));
		assert.deepEqual(issuesOf(MINIMAL.replace("Europe/Berlin", "UTC")), []);
	});

	test("source: none, two, or malformed location", () => {
		assert.match(issuesOf(MINIMAL.replace(`{restic: "10.50.0.10:/backup/x"}`, "{host: k3s}"))[0].message, /Ortsschlüssel fehlt/);
		assert.match(
			find(issuesOf(MINIMAL.replace(`{restic: "10.50.0.10:/backup/x"}`, `{restic: "a:/b", files: "c:/d"}`)), "backup.source").message,
			/gefunden: restic, files/,
		);
		assert.match(find(issuesOf(MINIMAL.replace(`{restic: "10.50.0.10:/backup/x"}`, "{pbs: 2001}")), "backup.source.pbs").message, /Text/);
		assert.match(find(issuesOf(MINIMAL.replace(`{restic: "10.50.0.10:/backup/x"}`, "{pbs: vms/2001}")), "backup.source.pbs").message, /Backup-Gruppe/);
		assert.match(find(issuesOf(MINIMAL.replace(`{restic: "10.50.0.10:/backup/x"}`, "{restic: /backup/x}")), "backup.source.restic").message, /server:\/pfad/);
		assert.match(find(issuesOf(MINIMAL.replace(`{restic: "10.50.0.10:/backup/x"}`, "{longhorn: immich}")), "backup.source.longhorn").message, /namespace\/pvc/);
	});

	test("a list item that is not an object", () => {
		const parsed = parseBackups(y(`["just text", ${JSON.stringify(y(MINIMAL))}]`));
		assert.equal(parsed.length, 2);
		assert.deepEqual(fields(parsed[0].issues), ["backup[0]"]);
		assert.deepEqual(parsed[1].issues, []);
	});

	test("copy-of on itself", () => {
		assert.match(find(issuesOf(MINIMAL + "copy-of: test-block\n"), "backup.copy-of").message, /eigenen Block/);
	});
});
