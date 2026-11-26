// Builds the visual test harness into harness/out/: fixtures (YAML frontmatter
// parsed with js-yaml) + renderers bundled with esbuild + plugin styles.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import yaml from "js-yaml";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const out = path.join(here, "out");
fs.mkdirSync(out, { recursive: true });

const fixtures = path.join(here, "fixtures");
const records = fs
	.readdirSync(fixtures)
	.filter((f) => f.endsWith(".md"))
	.sort()
	.map((f) => {
		const text = fs.readFileSync(path.join(fixtures, f), "utf8");
		const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
		return { path: f, frontmatter: m ? yaml.load(m[1]) : null };
	});

await esbuild.build({
	entryPoints: [path.join(here, "harness.ts")],
	bundle: true,
	format: "iife",
	target: "es2020",
	outfile: path.join(out, "harness.js"),
	define: { __RECORDS__: JSON.stringify(records) },
	logLevel: "warning",
});

fs.copyFileSync(path.join(root, "styles.css"), path.join(out, "styles.css"));
fs.copyFileSync(path.join(here, "obsidian.css"), path.join(out, "obsidian.css"));
fs.writeFileSync(
	path.join(out, "index.html"),
	`<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Homelab Views – Harness</title>
<link rel="stylesheet" href="obsidian.css">
<link rel="stylesheet" href="styles.css">
</head>
<body>
<div class="markdown-reading-view"><div id="page" class="markdown-preview-view markdown-rendered is-readable-line-width"></div></div>
<script src="harness.js"></script>
</body>
</html>
`,
);
console.log(`harness: ${records.length} fixtures → ${path.relative(root, out)}/index.html`);
