import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { core, y } from "./helpers.mjs";

const { parseApps, buildIndex, pendingUpdates } = core;
const issuesOf = (text) => parseApps(y(text)).flatMap((p) => p.issues);
const find = (issues, field) => issues.find((i) => i.field === field);

const APP = `
schema: 1
name: vaultwarden
what: Passwortmanager (Bitwarden-kompatibel)
platform: k3s
deploy: {argocd: vaultwarden}
repo: apps/k3s/vaultwarden
namespace: vaultwarden
versions:
  - {name: vaultwarden/server, version: 1.37.1-alpine, latest: 1.38.0, update: minor}
  - {name: vaultwarden, kind: chart, version: 0.35.1, latest: 0.39.0, update: minor}
checked: 2026-11-27
secrets:
  - {path: kv/k3s-evangelion/vaultwarden, keys: [ADMIN_TOKEN]}
storage:
  - {path: vaultwarden-data-vaultwarden-0, what: Longhorn-Volume}
databases:
  - {engine: sqlite}
links:
  - https://github.com/dani-garcia/vaultwarden/wiki
`;

describe("app profile (schema 1)", () => {
	test("valid profile; unquoted date and numeric versions are read as text", () => {
		const [p] = parseApps(y(APP.replace("version: 0.35.1", "version: 7.0")));
		assert.deepEqual(p.issues, []);
		assert.equal(p.block.platform, "k3s");
		assert.deepEqual(p.block.deploy, { kind: "argocd", value: "vaultwarden" });
		assert.equal(p.block.checked, "2026-11-27");
		assert.equal(p.block.versions[1].version, "7");
		assert.equal(pendingUpdates(p.block), 2);
		assert.deepEqual(p.block.links, [{ url: "https://github.com/dani-garcia/vaultwarden/wiki" }]);
	});
	test("required fields, enums and hints for keys of other schemas", () => {
		const issues = issuesOf("{schema: 1, platform: cloud, hostnames: [], images: []}");
		assert.ok(find(issues, "app.name"));
		assert.ok(find(issues, "app.what"));
		assert.match(find(issues, "app.platform").message, /nicht erlaubt/);
		assert.match(find(issues, "app.hostnames").message, /network-flow/);
		assert.match(find(issues, "app.images").message, /versions/);
	});
	test("deploy needs exactly one kind; repo is a path; secrets never take values", () => {
		const base = "{schema: 1, name: a, what: b, platform: docker";
		assert.match(find(issuesOf(`${base}, deploy: {komodo: a, argocd: b}}`), "app.deploy").message, /genau einer/);
		assert.match(find(issuesOf(`${base}, repo: /apps/docker/a}`), "app.repo").message, /Pfad im Repo/);
		assert.match(find(issuesOf(`${base}, secrets: [{path: kv/x, values: {A: 1}}]}`), "app.secrets[0].values").message, /nie in die Doku/);
		assert.equal(find(issuesOf(`${base}, secrets: [{path: kv/data/x}]}`), "app.secrets[0].path").severity, "warning");
	});
	test("update without latest and latest without checked are warnings", () => {
		const issues = issuesOf("{schema: 1, name: a, what: b, platform: docker, versions: [{name: x, version: 1, update: major}, {name: y, version: 2, latest: 3}]}");
		assert.equal(find(issues, "app.versions[0].latest").severity, "warning");
		assert.equal(find(issues, "app.checked").severity, "warning");
	});
	test("the same app name in two notes is a warning at both", () => {
		const idx = buildIndex([
			{ path: "docs/a.md", frontmatter: y("app: {schema: 1, name: x, what: y, platform: docker}") },
			{ path: "docs/b.md", frontmatter: y("app: {schema: 1, name: x, what: y, platform: docker}") },
		]);
		assert.equal(idx.apps.length, 2);
		for (const e of idx.apps) assert.match(e.issues[0].message, /auch einen Steckbrief/);
		assert.ok(idx.byNote.get("docs/a.md").apps.length === 1);
	});
});
