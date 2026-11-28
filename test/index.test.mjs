import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { core, y, fixtureRecords } from "./helpers.mjs";

const { buildIndex, findOverlaps, runsBetween, zonedToInstant, compareKeys, addressSortKey, isPrivatePath } = core;

const block = (id, extra = "") => `
  - schema: 1
    id: ${id}
    system: dumps
    source: {restic: "a:/b"}
    schedule: {times: ["07:15"]}
    tz: Europe/Berlin
${extra}`;

describe("index: checks across notes", () => {
	test("duplicate id: both blocks get an error", () => {
		const idx = buildIndex([
			{ path: "docs/a.md", frontmatter: y(`backup:${block("same")}`) },
			{ path: "docs/b.md", frontmatter: y(`backup:${block("same")}`) },
		]);
		assert.equal(idx.backups.length, 2);
		for (const e of idx.backups) assert.match(e.issues[0].message, /doppelte id same, auch in „[ab]“/);
		assert.equal(idx.backupById.has("same"), false);
	});

	test("copy-of resolves across notes and links both ways", () => {
		const idx = buildIndex([
			{ path: "docs/app.md", frontmatter: y(`backup:${block("app-dump")}`) },
			{ path: "docs/nas.md", frontmatter: y(`backup:${block("app-dump-nas", "    copy-of: app-dump")}`) },
		]);
		const copy = idx.backupById.get("app-dump-nas");
		assert.deepEqual(copy.issues, []);
		assert.equal(copy.original.block.id, "app-dump");
		assert.equal(idx.backupById.get("app-dump").copies[0], copy);
	});

	test("copy-of an unknown id or a job is an error", () => {
		const idx = buildIndex([
			{
				path: "docs/x.md",
				frontmatter: y(`backup:${block("a", "    copy-of: missing")}
  - {schema: 1, id: j, type: job, system: restic, job: prune, on: {restic: "a:/b"}, schedule: {times: ["01:00"]}, tz: UTC}
${block("b", "    copy-of: j")}`),
			},
		]);
		assert.match(idx.backupById.get("a").issues[0].message, /unbekannte id missing/);
		assert.match(idx.backupById.get("b").issues[0].message, /ist ein Job/);
	});

	test("notes in _privat or _private are never indexed", () => {
		const fm = y(`backup:${block("p")}`);
		const idx = buildIndex([
			{ path: "docs/_privat/a.md", frontmatter: fm },
			{ path: "_private/b.md", frontmatter: fm },
		]);
		assert.equal(idx.backups.length, 0);
		assert.ok(isPrivatePath("x/_privat/y.md"));
		assert.ok(!isPrivatePath("x/privat/y.md"));
	});

	test("duplicate hostname with the same path is a warning; different paths are fine", () => {
		const app = (name, path) => ({ schema: 2, kind: "app", name, "runs-on": ["vm"], hostnames: [{ name: "shared.example", entry: "intern", target: "10.0.0.1:443", ...(path ? { path } : {}) }] });
		const dup = buildIndex([
			{ path: "a.md", frontmatter: { "network-flow": app("a") } },
			{ path: "b.md", frontmatter: { "network-flow": app("b") } },
		]);
		assert.ok(dup.network.every((e) => e.issues.some((i) => i.severity === "warning" && /Hostname auch bei/.test(i.message))));
		const ok = buildIndex([
			{ path: "a.md", frontmatter: { "network-flow": app("a") } },
			{ path: "b.md", frontmatter: { "network-flow": app("b", "/figures") } },
		]);
		assert.ok(ok.network.every((e) => e.issues.length === 0));
	});

	test("schema 6: a fallback target beside a main target is fine, alone it is a warning", () => {
		const app = (name, fallback, schema = 6) => ({ schema, kind: "app", name, "runs-on": ["vm"], hostnames: [{ name: "couchdb.example", entry: "intern", target: "10.0.0.1:443", ...(fallback === undefined ? {} : { fallback }) }] });
		const pair = buildIndex([
			{ path: "a.md", frontmatter: { "network-flow": app("a") } },
			{ path: "b.md", frontmatter: { "network-flow": app("b", true) } },
		]);
		assert.ok(pair.network.every((e) => e.issues.length === 0));
		assert.equal(pair.network.find((e) => e.res.name === "b").res.hostnames[0].fallback, true);
		const alone = buildIndex([{ path: "b.md", frontmatter: { "network-flow": app("b", true) } }]);
		assert.ok(alone.network[0].issues.some((i) => i.field.endsWith("fallback") && /ohne Hauptziel/.test(i.message)));
		const old = buildIndex([{ path: "b.md", frontmatter: { "network-flow": app("b", true, 5) } }]);
		assert.ok(old.network[0].issues.some((i) => /schema: 6/.test(i.message)));
	});
});

describe("index: zigbee checks across notes (schema 5)", () => {
	const z = (name, ieee, role = "end-device", coordinator = "SLZB-MR3U") =>
		`\n  - {schema: 5, kind: zigbee, name: "${name}", ieee: "${ieee}", role: ${role}, coordinator: ${coordinator}}`;
	test("same ieee in two notes, same name at one coordinator, two coordinator blocks", () => {
		const idx = buildIndex([
			{ path: "docs/a.md", frontmatter: y(`network-flow:${z("Coordinator", "0x00124b0000000001", "coordinator")}${z("Flur/Lampe", "0x00158d0000000001", "router")}`) },
			{ path: "docs/b.md", frontmatter: y(`network-flow:${z("Coordinator 2", "0x00124b0000000002", "coordinator")}${z("Flur/Lampe", "0x00158D0000000001")}`) },
		]);
		const msgs = idx.network.flatMap((e) => e.issues.map((i) => `${i.field}: ${i.message}`));
		assert.equal(msgs.filter((m) => /IEEE 0x00158d0000000001 steht auch in/.test(m)).length, 2);
		assert.equal(msgs.filter((m) => /Flur\/Lampe gibt es am Koordinator SLZB-MR3U mehrfach/.test(m)).length, 2);
		assert.equal(msgs.filter((m) => /mehr als einen Block mit role: coordinator/.test(m)).length, 2);
		// zigbee names are not part of the generic "mehrfach beschrieben" warning
		assert.equal(msgs.filter((m) => /mehrfach beschrieben/.test(m)).length, 0);
	});
	test("same name at different coordinators is fine", () => {
		const idx = buildIndex([
			{ path: "docs/a.md", frontmatter: y(`network-flow:${z("Lampe", "0x00158d0000000001", "router", "A")}${z("Lampe", "0x00158d0000000002", "router", "B")}`) },
		]);
		assert.deepEqual(idx.network.flatMap((e) => e.issues), []);
	});
});

describe("fixtures (example notes)", () => {
	const idx = buildIndex(fixtureRecords());

	test("the example notes are valid (errors live in Beispiel-Fehler only)", () => {
		const byNote = (name) => idx.byNote.get(name);
		for (const name of ["Beispiel-VM.md", "Beispiel-Gameserver.md", "Beispiel-App.md"]) {
			const n = byNote(name);
			assert.deepEqual([...n.backups, ...n.network].flatMap((e) => e.issues), [], name);
		}
		assert.equal(idx.backupById.get("beispiel-app-dump-nas").original.block.id, "beispiel-app-dump");
	});

	test("overlaps in the week of 23 Nov 2026", () => {
		const blocks = idx.backups
			.filter((e) => e.block.schedule?.kind === "times" && e.block.tz)
			.map((e) => ({ key: e.key, id: e.block.id, notePath: e.note.path, type: e.block.type, job: e.block.job, target: e.target, copyOf: e.block.copyOf, graceMs: e.block.graceMs, schedule: e.block.schedule, tz: e.block.tz }));
		const from = zonedToInstant({ year: 2026, month: 11, day: 23 }, 0, 0, "Europe/Berlin");
		const to = zonedToInstant({ year: 2026, month: 11, day: 30 }, 0, 0, "Europe/Berlin");
		const overlaps = findOverlaps(runsBetween(blocks, from, to));
		const summary = overlaps.map((o) => [o.level, o.a.id, o.b.id, o.windows.length]);
		// restic backup (daily 02:30 + 3 h) and its Sunday prune on the same repo
		assert.deepEqual(summary.find((s) => s[0] === "collision"), ["collision", "beispiel-vm-restic", "beispiel-vm-restic-prune", 1]);
		// PBS (Wed 03:00 + 3 h) and restic of the same VM
		assert.ok(summary.some((s) => s[0] === "hint" && s.includes("beispiel-vm-pbs") && s.includes("beispiel-vm-restic")));
		// a dump and the sync job that delivers it, and a dump and its copy, belong together
		assert.ok(!summary.some((s) => s.includes("beispiel-vm-dumps-sync")));
		assert.ok(!summary.some((s) => s.includes("beispiel-app-dump") && s.includes("beispiel-app-dump-nas")));
		assert.equal(summary.filter((s) => s[0] === "collision").length, 1);
	});
});

describe("IP sorting", () => {
	test("numeric, not textual", () => {
		const ips = ["10.10.0.1", "10.9.0.1", "10.8.0.25", "10.8.0.3", "192.168.1.1", "host.example:443", undefined];
		const sorted = [...ips].sort((a, b) => compareKeys(addressSortKey(a), addressSortKey(b)));
		assert.deepEqual(sorted, ["10.8.0.3", "10.8.0.25", "10.9.0.1", "10.10.0.1", "192.168.1.1", "host.example:443", undefined]);
	});

	test("addresses with port sort by address, then port", () => {
		const sorted = ["10.8.0.15:8443", "10.8.0.15:443", "10.8.0.2:80"].sort((a, b) => compareKeys(addressSortKey(a), addressSortKey(b)));
		assert.deepEqual(sorted, ["10.8.0.2:80", "10.8.0.15:443", "10.8.0.15:8443"]);
	});
});
