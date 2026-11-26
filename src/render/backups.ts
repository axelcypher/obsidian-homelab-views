/** `homelab-backups`: one row per backup block, grouped by system, copies below their original. */
import { BACKUP_SYSTEMS, BackupSystem } from "../model/backup";
import { BackupEntry, backupTitle, errorCount } from "../model/index";
import { compareKeys } from "../model/ip";
import { clear, el } from "./dom";
import type { RenderEnv, ViewState } from "./env";
import {
	emptyState,
	graceText,
	icon,
	issueMarker,
	jobBadge,
	locationView,
	nextRunView,
	problemsSection,
	retentionChips,
	scheduleText,
	scrollWrap,
	systemBadge,
	systemClass,
	titleIsJob,
} from "./common";
import { SYSTEM_LABEL, plural } from "./labels";
import type { BackupsOptions } from "./options";

const ALL = "__all__";

/** Orders blocks so that each copy follows its original; jobs come after the backups. */
export function treeOrder(entries: BackupEntry[]): { entry: BackupEntry; depth: number }[] {
	const set = new Set(entries);
	const byName = (a: BackupEntry, b: BackupEntry) =>
		compareKeys(a.note.name, b.note.name) || compareKeys(a.block.id ?? "", b.block.id ?? "");
	const out: { entry: BackupEntry; depth: number }[] = [];
	const seen = new Set<BackupEntry>();
	const visit = (e: BackupEntry, depth: number) => {
		if (seen.has(e)) return;
		seen.add(e);
		out.push({ entry: e, depth });
		for (const c of [...e.copies].sort(byName)) if (set.has(c)) visit(c, depth + 1);
	};
	const roots = entries.filter((e) => !e.original || !set.has(e.original));
	const backups = roots.filter((e) => e.block.type !== "job").sort(byName);
	const jobs = roots.filter((e) => e.block.type === "job").sort(byName);
	for (const e of [...backups, ...jobs]) visit(e, e.original ? 1 : 0);
	return out;
}

interface Col {
	label: string;
	cls: string;
	render(td: HTMLTableCellElement, e: BackupEntry, depth: number): void;
}

export function renderBackups(
	parent: HTMLElement,
	entries: BackupEntry[],
	env: RenderEnv,
	opts: BackupsOptions,
	state: ViewState,
): void {
	const root = el(parent, "div", "hv-root hv-view hv-backups");
	let list = entries;
	if (opts.system) list = list.filter((e) => e.block.system && opts.system?.includes(e.block.system));
	if (!opts.jobs) list = list.filter((e) => e.block.type !== "job");
	if (!list.length) {
		emptyState(root, "Keine Backup-Blöcke gefunden.");
		return;
	}

	const systems = BACKUP_SYSTEMS.filter((s) => list.some((e) => e.block.system === s));
	const unknownSystem = list.some((e) => !e.block.system);

	// Toolbar: filter chips and counts
	const bar = el(root, "div", "hv-toolbar");
	const chips = el(bar, "div", { cls: "hv-filter", attr: { role: "group", "aria-label": "Nach System filtern" } });
	const body = el(root, "div", "hv-view-body");
	const selected = () => (state.system as string | undefined) ?? ALL;

	const chip = (value: string, label: string, count: number, system?: string) => {
		const b = el(chips, "button", {
			cls: `hv-filter-chip${system ? ` ${systemClass(system)}` : ""}`,
			attr: { type: "button", "aria-pressed": String(selected() === value) },
		});
		if (system) el(b, "span", { cls: "hv-dot", attr: { "aria-hidden": "true" } });
		el(b, "span", { text: label });
		el(b, "span", { cls: "hv-filter-count", text: String(count) });
		b.addEventListener("click", () => {
			state.system = selected() === value ? ALL : value;
			for (const other of Array.from(chips.children)) other.setAttribute("aria-pressed", "false");
			b.setAttribute("aria-pressed", String(selected() === value));
			draw();
		});
	};
	if (systems.length + (unknownSystem ? 1 : 0) > 1) {
		chip(ALL, "Alle", list.length);
		for (const s of systems) chip(s, SYSTEM_LABEL[s], list.filter((e) => e.block.system === s).length, s);
	} else chips.remove();

	const copies = list.filter((e) => e.block.copyOf).length;
	const jobs = list.filter((e) => e.block.type === "job").length;
	el(bar, "div", {
		cls: "hv-toolbar-meta",
		text: [
			plural(list.length - jobs, "Sicherung", "Sicherungen"),
			copies ? `davon ${plural(copies, "Kopie", "Kopien")}` : "",
			jobs ? plural(jobs, "Job", "Jobs") : "",
		]
			.filter(Boolean)
			.join(" · "),
	});

	// Time columns first: at the usual note width they stay visible without scrolling.
	const cols: Col[] = [
		{ label: "Notiz", cls: "hv-col-notiz", render: (td, e) => void env.link(td, e.note, e.note.name, "hv-note-link") },
		{ label: "Was", cls: "hv-col-was", render: (td, e, depth) => whatCell(td, e, depth, env) },
		...(opts.group ? [] : [{ label: "System", cls: "hv-col-system", render: (td: HTMLTableCellElement, e: BackupEntry) => void systemBadge(td, e.block.system) }]),
		{ label: "Zeitplan", cls: "hv-col-zeitplan", render: (td, e) => void (td.textContent = scheduleText(e.block)) },
		{ label: "Nächster Lauf", cls: "hv-col-next", render: (td, e) => nextRunView(td, e.block, env) },
		{ label: "Karenz", cls: "hv-col-karenz", render: (td, e) => void (td.textContent = graceText(e.block)) },
		{ label: "Ort", cls: "hv-col-ort", render: (td, e) => locationView(td, e.block, env, true) },
		{ label: "Aufbewahrung", cls: "hv-col-aufbewahrung", render: (td, e) => retentionChips(td, e.block.retention) },
	];

	const draw = () => {
		clear(body);
		const sel = selected();
		const shown = sel === ALL ? list : list.filter((e) => e.block.system === sel);
		const groups: { system?: BackupSystem; entries: BackupEntry[] }[] = [];
		if (opts.group) {
			for (const s of systems) {
				const g = shown.filter((e) => e.block.system === s);
				if (g.length) groups.push({ system: s, entries: g });
			}
			const rest = shown.filter((e) => !e.block.system);
			if (rest.length) groups.push({ entries: rest });
		} else groups.push({ entries: shown });

		const wrap = scrollWrap(body);
		const table = el(wrap, "table", "hv-table hv-backup-table has-sticky");
		const headRow = el(el(table, "thead"), "tr");
		for (const c of cols) el(headRow, "th", { text: c.label, cls: c.cls });
		for (const g of groups) {
			const tbody = el(table, "tbody", "hv-group");
			if (opts.group) {
				const tr = el(tbody, "tr", "hv-group-row");
				const th = el(tr, "th", { attr: { colspan: String(cols.length), scope: "rowgroup" } });
				const label = el(th, "div", `hv-group-label ${systemClass(g.system)}`);
				el(label, "span", { cls: "hv-dot", attr: { "aria-hidden": "true" } });
				el(label, "span", { cls: "hv-group-name", text: g.system ? SYSTEM_LABEL[g.system] : "ohne gültiges System" });
				el(label, "span", { cls: "hv-group-count", text: String(g.entries.length) });
			}
			for (const { entry: e, depth } of treeOrder(g.entries)) {
				const cls = [systemClass(e.block.system)];
				if (depth) cls.push("is-copy-row");
				if (e.block.type === "job") cls.push("is-job-row");
				if (errorCount(e.issues)) cls.push("has-errors");
				const tr = el(tbody, "tr", cls.join(" "));
				for (const c of cols) c.render(el(tr, "td", c.cls), e, depth);
			}
		}
		problemsSection(
			body,
			shown.map((e) => ({ note: e.note, field: e.field, issues: e.issues, label: e.block.id })),
			env,
		);
	};
	draw();
}

function whatCell(td: HTMLElement, e: BackupEntry, depth: number, env: RenderEnv): void {
	const b = e.block;
	const title = el(td, "div", "hv-what");
	if (depth) {
		const arrow = el(title, "span", { cls: "hv-tree", attr: { "aria-hidden": "true" } });
		icon(arrow, env, "corner-down-right", "hv-icon hv-icon-xs");
	}
	el(title, "span", { cls: "hv-what-text", text: backupTitle(b) });
	if (b.type === "job") jobBadge(title, b.job, !titleIsJob(b));
	el(td, "div", { cls: "hv-what-id hv-mono", text: b.id ?? "ohne id" });
	if (b.copyOf) {
		const c = el(td, "div", "hv-what-copy");
		el(c, "span", { text: "Kopie von " });
		if (e.original) env.link(c, e.original.note, b.copyOf, "hv-ref hv-mono");
		else el(c, "span", { cls: "hv-ref hv-mono is-unresolved", text: b.copyOf });
	}
	issueMarker(td, e.issues, e.field, env);
}
