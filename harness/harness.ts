/**
 * Visual test harness: renders the plugin's views with the fixture notes in a
 * page that imitates Obsidian's reading view. Parameters:
 *   ?view=card-vm|card-app|card-pbs|card-firewall|card-switch|card-error|backups|schedule|network
 *   &theme=light|dark   &now=2026-11-26T15:00:00+01:00
 */
import { buildIndex, NoteRecord, noteRef } from "../src/core";
import { renderNoteCard } from "../src/render/card";
import { renderBackups } from "../src/render/backups";
import { renderSchedule } from "../src/render/schedule";
import { renderNetwork } from "../src/render/network";
import { backupsOptions, networkOptions, scheduleOptions } from "../src/render/options";
import type { RenderEnv } from "../src/render/env";
import { el } from "../src/render/dom";

declare const __RECORDS__: NoteRecord[];

// Simplified Lucide icons (24×24, stroke), as Obsidian's setIcon would render them.
const ICONS: Record<string, string> = {
	server:
		'<rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/>',
	"app-window": '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M10 4v4"/><path d="M2 8h20"/><path d="M6 4v4"/>',
	"hard-drive":
		'<line x1="22" x2="2" y1="12" y2="12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" x2="6.01" y1="16" y2="16"/><line x1="10" x2="10.01" y1="16" y2="16"/>',
	layers:
		'<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
	network:
		'<rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/><path d="M12 12V8"/>',
	"map-pin": '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
	database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
	"alert-triangle":
		'<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
	check: '<path d="M20 6 9 17l-5-5"/>',
	clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
	copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
	"external-link": '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
	cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
	globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
	lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
	"corner-down-right": '<polyline points="15 10 20 15 15 20"/><path d="M4 4v7a4 4 0 0 0 4 4h12"/>',
};

const params = new URLSearchParams(location.search);
const view = params.get("view") ?? "card-vm";
const theme = params.get("theme") ?? "light";
const now = Date.parse(params.get("now") ?? "2026-11-26T15:00:00+01:00");
document.body.classList.add(theme === "dark" ? "theme-dark" : "theme-light");

const env: RenderEnv = {
	now,
	displayTz: "Europe/Berlin",
	link(parent, target, text, cls) {
		return el(parent, "a", { cls: `hv-link ${cls ?? ""}`.trim(), text: text ?? target.name, attr: { href: "#" } });
	},
	bindOpen(e) {
		e.classList.add("is-clickable");
	},
	icon(parent, name) {
		const ns = "http://www.w3.org/2000/svg";
		const svg = document.createElementNS(ns, "svg");
		for (const [k, v] of Object.entries({
			viewBox: "0 0 24 24",
			fill: "none",
			stroke: "currentColor",
			"stroke-width": "2",
			"stroke-linecap": "round",
			"stroke-linejoin": "round",
			class: "svg-icon",
		}))
			svg.setAttribute(k, v);
		// Static icon markup from this file, not user data.
		svg.innerHTML = ICONS[name] ?? '<circle cx="12" cy="12" r="9"/>';
		parent.appendChild(svg);
	},
	copy: () => Promise.resolve(),
	resolveName: () => undefined,
};

const index = buildIndex(__RECORDS__);
const page = document.getElementById("page") as HTMLElement;
const sizer = el(page, "div", "markdown-preview-sizer");

function header(title: string, props: [string, string][]) {
	const head = el(sizer, "div", "mod-header");
	el(head, "div", { cls: "inline-title", text: title });
	const meta = el(head, "div", "metadata-container");
	for (const [k, v] of props) {
		const row = el(meta, "div", "metadata-row");
		el(row, "span", { cls: "metadata-key", text: k });
		el(row, "span", { cls: "metadata-value", text: v });
	}
	return head;
}

function card(path: string) {
	const note = noteRef(path);
	const data = index.byNote.get(path);
	const head = header(note.name, [
		["network-flow", "{…}"],
		["backup", `${data?.backups.length ?? 0} Blöcke`],
	]);
	const host = el(head, "div", "hv-auto-card is-top");
	if (data) renderNoteCard(host, { note, ...data }, index, env);
	const p = el(sizer, "div", "markdown-rendered");
	el(p, "p", { text: "Erfundene Beispieldaten für die Homelab Views. Der Text der Notiz folgt unter der Karte." });
}

function block(title: string, lang: string, render: (c: HTMLElement) => void) {
	header(title, [["tags", "homelab, übersicht"]]);
	const md = el(sizer, "div", "markdown-rendered");
	el(md, "p", { text: "Aus dem Frontmatter aller Notizen gerendert; nichts davon ist hier von Hand gepflegt." });
	const c = el(md, "div", `block-language-${lang}`);
	render(c);
}

const cards: Record<string, string> = {
	"card-vm": "Beispiel-VM.md",
	"card-app": "Beispiel-App.md",
	"card-pbs": "Beispiel-PBS.md",
	"card-firewall": "Beispiel-Firewall.md",
	"card-switch": "Beispiel-Switch.md",
	"card-gallery": "Beispiel-Galerie.md",
	"card-error": "Beispiel-Fehler.md",
	"card-game": "Beispiel-Gameserver.md",
	"card-cluster": "Beispiel-Cluster.md",
};

if (cards[view]) card(cards[view]);
else if (view === "backups")
	block("Backup-Übersicht", "homelab-backups", (c) => renderBackups(c, index.backups, env, backupsOptions(null).opts, {}));
else if (view === "backups-flat")
	block("Backup-Übersicht", "homelab-backups", (c) =>
		renderBackups(c, index.backups, env, backupsOptions({ group: false }).opts, {}),
	);
else if (view === "schedule")
	block("Zeitplan", "homelab-schedule", (c) => renderSchedule(c, index.backups, env, scheduleOptions(null).opts, {}));
else if (view === "network")
	block("Netzwerk", "homelab-network", (c) => renderNetwork(c, index.network, index, env, networkOptions(null).opts, {}));

document.body.setAttribute("data-ready", "1");
