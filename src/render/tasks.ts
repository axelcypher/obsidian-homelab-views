/**
 * `homelab-tasks`: scheduled work that is not a backup, one row per task,
 * grouped by who starts it (host cron, k3s CronJob, Komodo, app-internal) so the
 * kinds never mix.
 */
import { TaskEntry, errorCount, taskTitle } from "../model/index";
import { compareKeys } from "../model/ip";
import { TASK_RUNNERS, TaskRunnerKind } from "../model/tasks";
import { nextRun } from "../schedule/schedule";
import { clear, el } from "./dom";
import type { RenderEnv, ViewState } from "./env";
import {
	durationText,
	emptyState,
	issueMarker,
	nextRunView,
	problemsSection,
	runnerBadge,
	runnerClass,
	runnerView,
	scheduleText,
	scrollWrap,
	taskKindBadge,
} from "./common";
import { RUNNER_HINT, RUNNER_LABEL, plural } from "./labels";
import type { TasksOptions } from "./options";

const ALL = "__all__";

interface Col {
	label: string;
	cls: string;
	render(td: HTMLTableCellElement, e: TaskEntry): void;
}

/** Soonest first; tasks without a fixed time at the end. */
function byNextRun(env: RenderEnv) {
	const at = (e: TaskEntry) => {
		const b = e.block;
		if (!b.schedule || !b.tz) return Infinity;
		const n = nextRun(b.schedule, b.tz, env.now);
		return n.kind === "at" ? n.at : Infinity;
	};
	return (a: TaskEntry, b: TaskEntry) => at(a) - at(b) || compareKeys(a.note.name, b.note.name) || compareKeys(a.block.id ?? "", b.block.id ?? "");
}

export function renderTasks(parent: HTMLElement, entries: TaskEntry[], env: RenderEnv, opts: TasksOptions, state: ViewState): void {
	const root = el(parent, "div", "hv-root hv-view hv-tasks");
	let list = entries;
	if (opts.runner) list = list.filter((e) => e.block.runner && opts.runner?.includes(e.block.runner.kind));
	if (opts.kind) list = list.filter((e) => e.block.kind && opts.kind?.includes(e.block.kind));
	if (!list.length) {
		emptyState(root, "Keine geplanten Aufgaben gefunden.");
		return;
	}
	const runners = TASK_RUNNERS.filter((r) => list.some((e) => e.block.runner?.kind === r));
	const noRunner = list.some((e) => !e.block.runner);

	const bar = el(root, "div", "hv-toolbar");
	const chips = el(bar, "div", { cls: "hv-filter", attr: { role: "group", "aria-label": "Nach Herkunft filtern" } });
	const body = el(root, "div", "hv-view-body");
	const selected = () => (state.runner as string | undefined) ?? ALL;
	const chip = (value: string, label: string, count: number, runner?: TaskRunnerKind) => {
		const b = el(chips, "button", {
			cls: `hv-filter-chip${runner ? ` ${runnerClass(runner)}` : ""}`,
			title: runner ? RUNNER_HINT[runner] : undefined,
			attr: { type: "button", "aria-pressed": String(selected() === value) },
		});
		if (runner) el(b, "span", { cls: "hv-dot is-hollow", attr: { "aria-hidden": "true" } });
		el(b, "span", { text: label });
		el(b, "span", { cls: "hv-filter-count", text: String(count) });
		b.addEventListener("click", () => {
			state.runner = selected() === value ? ALL : value;
			for (const other of Array.from(chips.children)) other.setAttribute("aria-pressed", "false");
			b.setAttribute("aria-pressed", String(selected() === value));
			draw();
		});
	};
	if (runners.length + (noRunner ? 1 : 0) > 1) {
		chip(ALL, "Alle", list.length);
		for (const r of runners) chip(r, RUNNER_LABEL[r], list.filter((e) => e.block.runner?.kind === r).length, r);
	} else chips.remove();
	el(bar, "div", { cls: "hv-toolbar-meta", text: plural(list.length, "Aufgabe", "Aufgaben") });

	const cols: Col[] = [
		{ label: "Notiz", cls: "hv-col-notiz", render: (td, e) => void env.link(td, e.note, e.note.name, "hv-note-link") },
		{ label: "Was", cls: "hv-col-was", render: (td, e) => whatCell(td, e, env) },
		...(opts.group ? [] : [{ label: "Herkunft", cls: "hv-col-system", render: (td: HTMLTableCellElement, e: TaskEntry) => void runnerBadge(td, e.block.runner?.kind, env) }]),
		{ label: "Zeitplan", cls: "hv-col-zeitplan", render: (td, e) => void (td.textContent = scheduleText(e.block)) },
		{ label: "Nächster Lauf", cls: "hv-col-next", render: (td, e) => nextRunView(td, e.block, env) },
		{ label: "Dauer", cls: "hv-col-karenz", render: (td, e) => void (td.textContent = durationText(e.block)) },
		{ label: "Gestartet von", cls: "hv-col-ort", render: (td, e) => runnerView(td, e.block.runner, env, true) },
	];

	const draw = () => {
		clear(body);
		const sel = selected();
		const shown = sel === ALL ? list : list.filter((e) => e.block.runner?.kind === sel);
		const groups: { runner?: TaskRunnerKind; entries: TaskEntry[] }[] = [];
		if (opts.group) {
			for (const r of runners) {
				const g = shown.filter((e) => e.block.runner?.kind === r);
				if (g.length) groups.push({ runner: r, entries: g });
			}
			const rest = shown.filter((e) => !e.block.runner);
			if (rest.length) groups.push({ entries: rest });
		} else groups.push({ entries: shown });

		const wrap = scrollWrap(body);
		const table = el(wrap, "table", "hv-table hv-backup-table hv-task-table has-sticky");
		const headRow = el(el(table, "thead"), "tr");
		for (const c of cols) el(headRow, "th", { text: c.label, cls: c.cls });
		for (const g of groups) {
			const tbody = el(table, "tbody", "hv-group");
			if (opts.group) {
				const tr = el(tbody, "tr", "hv-group-row");
				const th = el(tr, "th", { attr: { colspan: String(cols.length), scope: "rowgroup" } });
				const label = el(th, "div", `hv-group-label ${runnerClass(g.runner)}`);
				el(label, "span", { cls: "hv-dot is-hollow", attr: { "aria-hidden": "true" } });
				el(label, "span", { cls: "hv-group-name", text: g.runner ? RUNNER_LABEL[g.runner] : "ohne gültigen runner" });
				if (g.runner) el(label, "span", { cls: "hv-group-hint", text: RUNNER_HINT[g.runner] });
				el(label, "span", { cls: "hv-group-count", text: String(g.entries.length) });
			}
			for (const e of [...g.entries].sort(byNextRun(env))) {
				const cls = ["hv-task-row", runnerClass(e.block.runner?.kind)];
				if (errorCount(e.issues)) cls.push("has-errors");
				const tr = el(tbody, "tr", cls.join(" "));
				for (const c of cols) c.render(el(tr, "td", c.cls), e);
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

function whatCell(td: HTMLElement, e: TaskEntry, env: RenderEnv): void {
	const b = e.block;
	const title = el(td, "div", "hv-what");
	el(title, "span", { cls: "hv-what-text", text: taskTitle(b) });
	taskKindBadge(title, b.kind);
	el(td, "div", { cls: "hv-what-id hv-mono", text: b.id ?? "ohne id" });
	issueMarker(td, e.issues, e.field, env);
}
