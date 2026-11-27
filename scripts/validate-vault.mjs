// Prüft alle Frontmatter-Blöcke (network-flow, backup, tasks, app) im Vault mit dem Kern
// des Plugins Homelab Views. Aufruf:
//   HV_PLUGIN=<Pfad zum Checkout von obsidian-homelab-views> node validate_vault.mjs <vault-root oder homelab-docs/docs> [--overlaps]
// Voraussetzung im Plugin-Checkout: npm ci && npm test (erzeugt build/test/core.mjs).
// Letzte Zeile muss "issues 0" zeigen. Ordner _privat/_private werden übersprungen.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const plugin = path.resolve(process.env.HV_PLUGIN ?? "obsidian-homelab-views");
const { default: yaml } = await import(pathToFileURL(path.join(plugin, "node_modules/js-yaml/dist/js-yaml.mjs")).href);
const core = await import(pathToFileURL(path.join(plugin, "build/test/core.mjs")).href);
const arg = process.argv[2];
if (!arg) { console.error("Aufruf: HV_PLUGIN=<plugin> node validate_vault.mjs <vault-root|homelab-docs/docs> [--overlaps]"); process.exit(2); }
const docs = arg.endsWith("homelab-docs/docs") ? arg : path.join(arg, "homelab-docs/docs");
const root = path.resolve(docs, "../..");
const recs = [];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
  if (e.name.startsWith("_priv")) continue;
  const p = path.join(d, e.name);
  if (e.isDirectory()) walk(p); else if (e.name.endsWith(".md")) {
    const t = fs.readFileSync(p, "utf8"); const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(t);
    let fm = null; try { fm = m ? yaml.load(m[1]) : null; } catch (err) { console.log("YAML", p, err.message); }
    recs.push({ path: path.relative(root, p), frontmatter: fm });
  } } };
walk(docs);
const idx = core.buildIndex(recs);
let issues = 0;
for (const e of [...idx.backups, ...idx.network, ...(idx.tasks ?? []), ...(idx.apps ?? [])]) for (const i of e.issues) { issues++; console.log("ISSUE", e.note.path, i.field, i.message ?? ""); }
for (const i of (idx.issues ?? [])) { issues++; console.log("ISSUE", JSON.stringify(i)); }
console.log("backup blocks", idx.backups.length, "network blocks", idx.network.length, "task blocks", (idx.tasks ?? []).length, "app blocks", (idx.apps ?? []).length, "issues", issues);
if (process.argv[3] === "--overlaps") {
  const blocks = [];
  for (const e of idx.tasks) { const b = e.block; if (b.schedule?.kind === "times" && b.tz) blocks.push({ key: e.key, id: b.id, notePath: e.note.path, type: "task", taskKind: b.kind, graceMs: b.durationMs, schedule: b.schedule, tz: b.tz }); }
  for (const e of idx.backups) { const b = e.block; if (b.type !== "ignore" && b.schedule?.kind === "times" && b.tz) blocks.push({ key: e.key, id: b.id, notePath: e.note.path, type: b.type, job: b.job, target: e.target, copyOf: b.copyOf, graceMs: b.graceMs, schedule: b.schedule, tz: b.tz }); }
  const from = core.zonedToInstant({ year: 2026, month: 11, day: 30 }, 0, 0, "Europe/Berlin");
  for (const o of core.findOverlaps(core.runsBetween(blocks, from, from + 7 * 86400000))) {
    if (o.a.type !== "task" && o.b.type !== "task") continue;
    const w = o.windows.map((x) => new Date(x.from).toLocaleString("de-DE", { timeZone: "Europe/Berlin", weekday: "short", hour: "2-digit", minute: "2-digit" }) + "–" + new Date(x.to).toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" })).join(", ");
    console.log("OVERLAP", o.level, o.a.id, "<>", o.b.id, w);
  }
}
