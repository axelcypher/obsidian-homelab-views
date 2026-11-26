// Screenshots of every view in light and dark, plus phone width.
// Usage: node harness/shoot.mjs [outDir] [view ...]
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(process.argv[2] ?? path.join(here, "out", "shots"));
const only = process.argv.slice(3);
fs.mkdirSync(outDir, { recursive: true });

const page = pathToFileURL(path.join(here, "out", "index.html")).href;
const desktop = ["card-vm", "card-app", "backups", "schedule", "network"];
const extra = ["card-pbs", "card-firewall", "card-switch", "card-gallery", "card-error", "card-game", "card-cluster", "backups-flat"];
const phone = ["card-vm", "card-app", "backups", "schedule", "network"];

const jobs = [];
for (const view of [...desktop, ...extra]) for (const theme of ["light", "dark"]) jobs.push({ view, theme, width: 900, name: `${view}-${theme}` });
for (const view of phone) for (const theme of ["light", "dark"]) jobs.push({ view, theme, width: 390, name: `${view}-${theme}-phone` });

const browser = await chromium.launch();
const context = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 900, height: 800 } });
const tab = await context.newPage();
const errors = [];
tab.on("pageerror", (e) => errors.push(e.message));
tab.on("console", (m) => m.type() === "error" && errors.push(m.text()));

for (const job of jobs) {
	if (only.length && !only.some((o) => job.name.startsWith(o))) continue;
	await tab.setViewportSize({ width: job.width, height: 800 });
	await tab.goto(`${page}?view=${job.view}&theme=${job.theme}`);
	await tab.waitForSelector("body[data-ready]");
	const file = path.join(outDir, `${job.name}.png`);
	await tab.screenshot({ path: file, fullPage: true });
	console.log(file);
}
await browser.close();
if (errors.length) {
	console.error("page errors:\n" + errors.join("\n"));
	process.exit(1);
}
