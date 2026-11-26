import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

export * as core from "../build/test/core.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Parses YAML like Obsidian's frontmatter (YAML 1.2 core schema). */
export function y(text) {
	return yaml.load(text);
}

/** Records of the fixture notes in harness/fixtures (the example notes plus invented extras). */
export function fixtureRecords() {
	const dir = path.join(here, "..", "harness", "fixtures");
	return fs
		.readdirSync(dir)
		.filter((f) => f.endsWith(".md"))
		.sort()
		.map((f) => {
			const text = fs.readFileSync(path.join(dir, f), "utf8");
			const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
			return { path: f, frontmatter: m ? yaml.load(m[1]) : null };
		});
}

/** Fields of all issues, for compact assertions. */
export function fields(issues) {
	return issues.map((i) => i.field);
}

export function find(issues, field) {
	return issues.find((i) => i.field === field);
}
