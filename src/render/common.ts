/** Building blocks shared by the note card and the central views. */
import type { BackupBlock, JobTarget, Retention, Source } from "../model/backup";
import type { Runner, TaskBlock } from "../model/tasks";
import type { Issue } from "../model/check";
import { BackupEntry, NoteRef, errorCount } from "../model/index";
import { parseHostPort } from "../model/ip";
import { formatDuration, formatSchedule, labelRun, nextRun } from "../schedule/schedule";
import { clock } from "../schedule/time";
import { breakable, el, txt } from "./dom";
import type { RenderEnv } from "./env";
import { JOB_LABEL, RETENTION_LABEL, RUNNER_HINT, RUNNER_ICON, RUNNER_LABEL, SOURCE_LABEL, SYSTEM_LABEL, TASK_KIND_LABEL, plural } from "./labels";

export function systemClass(system: string | undefined): string {
	return system ? `hv-sys hv-sys-${system}` : "hv-sys hv-sys-none";
}

export function systemBadge(parent: HTMLElement, system: string | undefined): HTMLElement {
	const label = system ? (SYSTEM_LABEL as Record<string, string>)[system] ?? system : "ohne System";
	return el(parent, "span", { cls: `hv-badge hv-badge-sys ${systemClass(system)}`, text: label });
}

/** Colour class of a task runner (dashed style, separate from the backup systems). */
export function runnerClass(runner: string | undefined): string {
	return runner ? `hv-run hv-run-${runner}` : "hv-run hv-run-none";
}

/** "Host-Cron", "k3s-CronJob", "Komodo", "App-intern" with icon. */
export function runnerBadge(parent: HTMLElement, runner: string | undefined, env: RenderEnv): HTMLElement {
	const known = !!runner && runner in RUNNER_LABEL;
	const b = el(parent, "span", {
		cls: `hv-badge hv-badge-run ${runnerClass(runner)}`,
		title: known ? RUNNER_HINT[runner as keyof typeof RUNNER_HINT] : "ohne runner",
	});
	if (known) icon(b, env, RUNNER_ICON[runner as keyof typeof RUNNER_ICON], "hv-icon hv-icon-xs");
	el(b, "span", { text: known ? RUNNER_LABEL[runner as keyof typeof RUNNER_LABEL] : "ohne runner" });
	return b;
}

export function taskKindBadge(parent: HTMLElement, kind: string | undefined): HTMLElement | null {
	if (!kind) return null;
	return el(parent, "span", {
		cls: `hv-badge hv-badge-kind${kind === "reboot" ? " is-reboot" : ""}`,
		text: (TASK_KIND_LABEL as Record<string, string>)[kind] ?? kind,
	});
}

/** Where a task is started: host + crontab file, CronJob, Komodo procedure, app. */
export function runnerView(parent: HTMLElement, r: Runner | undefined, env: RenderEnv, compact = false): void {
	if (!r) {
		el(parent, "span", { cls: "hv-faint", text: "–" });
		return;
	}
	const line = el(parent, "div", "hv-loc");
	const details: [string, string][] = [];
	switch (r.kind) {
		case "cron":
			el(line, "span", { cls: "hv-loc-kind", text: "Host" });
			el(line, "span", { cls: "hv-strong", text: r.host });
			if (r.file) details.push(["Datei", r.file]);
			if (r.user) details.push(["Benutzer", r.user]);
			break;
		case "k3s":
			el(line, "span", { cls: "hv-loc-kind", text: "CronJob" });
			copyable(line, r.cronjob, env, "hv-loc-value", "path");
			break;
		case "komodo":
			el(line, "span", { cls: "hv-loc-kind", text: r.type === "action" ? "Aktion" : "Prozedur" });
			el(line, "span", { cls: "hv-strong", text: r.name });
			break;
		case "app":
			el(line, "span", { cls: "hv-loc-kind", text: "App" });
			el(line, "span", { cls: "hv-strong", text: r.app });
			break;
	}
	if (details.length) {
		const d = el(parent, "div", compact ? "hv-loc-details is-compact" : "hv-loc-details");
		for (const [k, v] of details) {
			const item = el(d, "span", "hv-kv");
			el(item, "span", { cls: "hv-kv-k", text: k });
			const val = el(item, "span", "hv-kv-v hv-mono");
			breakable(val, v, BREAK_PATH);
		}
	}
}

/** Window of a task: "15 min" or "–". */
export function durationText(b: TaskBlock): string {
	return b.durationMs === undefined ? "–" : formatDuration(b.durationMs);
}

/** "Job · Prune"; the kind is left out when the title already names it. */
export function jobBadge(parent: HTMLElement, job: string | undefined, withKind = true): HTMLElement {
	const b = el(parent, "span", { cls: "hv-badge hv-badge-job" });
	el(b, "span", { cls: "hv-badge-job-kind", text: "Job" });
	if (job && withKind) el(b, "span", { text: JOB_LABEL[job] ?? job });
	return b;
}

/** Whether the block's title is only the job name (then the badge does not repeat it). */
export function titleIsJob(b: BackupBlock): boolean {
	return b.type === "job" && !b.what;
}

const BREAK_PATH = /(?<=[/])/;
const BREAK_HOST = /(?<=[.])/;

/** Horizontally scrolling wrapper; marks itself while scrolled so the sticky first column gets a shadow. */
export function scrollWrap(parent: HTMLElement, cls = "hv-table-wrap"): HTMLElement {
	const wrap = el(parent, "div", cls);
	wrap.addEventListener("scroll", () => wrap.classList.toggle("is-scrolled", wrap.scrollLeft > 2), { passive: true });
	return wrap;
}

/** Monospace value that copies itself on click (and with Enter/Space). */
export function copyable(
	parent: HTMLElement,
	value: string,
	env: RenderEnv,
	cls = "",
	breakAt?: "path" | "host",
): HTMLElement {
	const s = el(parent, "span", {
		cls: `hv-copy hv-mono ${breakAt ? "is-breakable " : ""}${cls}`.trim(),
		title: "Klicken zum Kopieren",
		attr: { role: "button", tabindex: "0" },
	});
	if (breakAt) breakable(s, value, breakAt === "path" ? BREAK_PATH : BREAK_HOST);
	else s.textContent = value;
	let timer = 0;
	const doCopy = (e: Event) => {
		e.preventDefault();
		e.stopPropagation();
		void env.copy(value).then(() => {
			s.classList.add("is-copied");
			s.setAttribute("data-copied", "Kopiert");
			const win = s.ownerDocument.defaultView;
			if (win) {
				win.clearTimeout(timer);
				timer = win.setTimeout(() => s.classList.remove("is-copied"), 1200);
			}
		});
	};
	s.addEventListener("click", doCopy);
	s.addEventListener("keydown", (e) => {
		if (e.key === "Enter" || e.key === " ") doCopy(e);
	});
	return s;
}

export function icon(parent: HTMLElement, env: RenderEnv, name: string, cls = "hv-icon"): HTMLElement {
	const span = el(parent, "span", { cls, attr: { "aria-hidden": "true" } });
	env.icon(span, name);
	return span;
}

/** "https://…" for a web interface address; https for the usual TLS ports, else http. */
export function webUrl(addr: string): string | undefined {
	const hp = parseHostPort(addr);
	if (!hp) return undefined;
	const tls = [443, 8006, 8007, 8443, 9443].includes(hp.port);
	const host = hp.host.includes(":") ? `[${hp.host}]` : hp.host;
	return `${tls ? "https" : "http"}://${host}${hp.port === (tls ? 443 : 80) ? "" : `:${hp.port}`}`;
}

export function externalLink(parent: HTMLElement, href: string, text: string, env: RenderEnv, cls = ""): HTMLElement {
	const a = el(parent, "a", {
		cls: `hv-ext ${cls}`.trim(),
		text,
		attr: { href, target: "_blank", rel: "noopener noreferrer" },
	});
	icon(a, env, "external-link", "hv-icon hv-icon-xs");
	return a;
}

// ---------------------------------------------------------------------------
// Backup values

export function sourceView(parent: HTMLElement, s: Source | undefined, env: RenderEnv, compact = false): void {
	if (!s) {
		el(parent, "span", { cls: "hv-faint", text: "–" });
		return;
	}
	const line = el(parent, "div", "hv-loc");
	el(line, "span", { cls: "hv-loc-kind", text: SOURCE_LABEL[s.kind] });
	const value = s.kind === "pbs" ? s.group : s.kind === "restic" ? s.repo : s.kind === "files" ? s.dir : s.volume;
	copyable(line, value, env, "hv-loc-value", "path");

	const details: [string, string][] = [];
	if (s.kind === "pbs") {
		if (s.store) details.push(["Store", s.store]);
		if (s.ns) details.push(["Namespace", s.ns]);
	} else if (s.kind === "restic") {
		if (s.host) details.push(["Host", s.host]);
		if (s.tag) details.push(["Tag", s.tag]);
		if (s.path) details.push(["Pfad", s.path]);
	} else if (s.kind === "files" && s.pattern) details.push(["Muster", s.pattern]);
	if (details.length) {
		const d = el(parent, "div", compact ? "hv-loc-details is-compact" : "hv-loc-details");
		for (const [k, v] of details) {
			const item = el(d, "span", "hv-kv");
			el(item, "span", { cls: "hv-kv-k", text: k });
			const val = el(item, "span", "hv-kv-v hv-mono");
			breakable(val, v, BREAK_PATH);
		}
	}
}

export function jobTargetView(parent: HTMLElement, on: JobTarget | undefined, env: RenderEnv): void {
	if (!on) {
		el(parent, "span", { cls: "hv-faint", text: "–" });
		return;
	}
	const line = el(parent, "div", "hv-loc");
	el(line, "span", { cls: "hv-loc-kind", text: SOURCE_LABEL[on.kind] ?? on.kind });
	copyable(line, on.value, env, "hv-loc-value", "path");
}

/** Where a block's copies live, or what a job works on. */
export function locationView(parent: HTMLElement, b: BackupBlock, env: RenderEnv, compact = false): void {
	if (b.type === "job") jobTargetView(parent, b.on, env);
	else sourceView(parent, b.source, env, compact);
}

export function retentionChips(parent: HTMLElement, r: Retention | undefined): void {
	if (!r || (r.counts.length === 0 && !r.maxAge)) {
		el(parent, "span", { cls: "hv-faint", text: "–" });
		return;
	}
	const wrap = el(parent, "div", "hv-chips");
	for (const { key, value } of r.counts) {
		const chip = el(wrap, "span", "hv-chip");
		el(chip, "span", { cls: "hv-chip-k", text: RETENTION_LABEL[key] });
		el(chip, "span", { cls: "hv-chip-v", text: String(value) });
	}
	if (r.maxAgeMs !== undefined) {
		const chip = el(wrap, "span", "hv-chip");
		el(chip, "span", { cls: "hv-chip-k", text: "max." });
		el(chip, "span", { cls: "hv-chip-v", text: formatDuration(r.maxAgeMs) });
	}
}

export function scheduleText(b: { schedule?: BackupBlock["schedule"] }): string {
	return b.schedule ? formatSchedule(b.schedule) : "–";
}

/** Next run in the display zone: "heute 19:15" + "in 4 h". */
export function nextRunView(parent: HTMLElement, b: { schedule?: BackupBlock["schedule"]; tz?: string }, env: RenderEnv): void {
	if (!b.schedule || !b.tz) {
		el(parent, "span", { cls: "hv-faint", text: "–" });
		return;
	}
	const n = nextRun(b.schedule, b.tz, env.now);
	if (n.kind === "interval") {
		el(parent, "span", { cls: "hv-faint", text: "ohne feste Uhrzeit" });
		return;
	}
	const label = labelRun(n.at, b.tz, env.displayTz, env.now);
	const main = el(parent, "div", "hv-next");
	el(main, "span", { cls: "hv-next-day", text: label.day });
	txt(main, " ");
	el(main, "span", { cls: "hv-next-time", text: label.time });
	const sub = el(parent, "div", { cls: "hv-next-rel", text: label.relative });
	if (label.original) el(sub, "span", { cls: "hv-next-orig", text: ` · ${label.original}` });
}

/** Grace as "1 h". */
export function graceText(b: BackupBlock): string {
	if (b.graceMs === undefined) return "–";
	return formatDuration(b.graceMs);
}

export function graceUntil(b: BackupBlock, env: RenderEnv): string | undefined {
	if (b.graceMs === undefined || !b.schedule || !b.tz) return undefined;
	const n = nextRun(b.schedule, b.tz, env.now);
	if (n.kind !== "at") return undefined;
	return `bis ${clock(n.at + b.graceMs, env.displayTz)}`;
}

// ---------------------------------------------------------------------------
// Issues

/** Strips the block prefix (`backup[1].`) so the card shows only the field inside the block. */
export function relativeField(field: string, base: string): string {
	if (field === base) return "Block";
	return field.startsWith(base + ".") ? field.slice(base.length + 1) : field;
}

export function issuesView(parent: HTMLElement, issues: Issue[], base: string, env: RenderEnv): HTMLElement | null {
	if (!issues.length) return null;
	const box = el(parent, "div", `hv-issues${errorCount(issues) ? "" : " is-warning"}`);
	const list = el(box, "div", "hv-issue-list");
	for (const i of issues) {
		const row = el(list, "div", `hv-issue is-${i.severity}`);
		icon(row, env, "alert-triangle", "hv-icon hv-icon-xs hv-issue-icon");
		const text = el(row, "span", "hv-issue-text");
		el(text, "span", { cls: "hv-issue-field hv-mono", text: relativeField(i.field, base) });
		txt(text, " ");
		el(text, "span", { cls: "hv-issue-msg", text: i.message });
	}
	return box;
}

/** Small marker with a count and the messages as tooltip, for table rows. */
export function issueMarker(parent: HTMLElement, issues: Issue[], base: string, env: RenderEnv): void {
	if (!issues.length) return;
	const errors = errorCount(issues);
	const m = el(parent, "span", {
		cls: `hv-issue-marker${errors ? "" : " is-warning"}`,
		title: issues.map((i) => `${relativeField(i.field, base)}: ${i.message}`).join("\n"),
	});
	icon(m, env, "alert-triangle", "hv-icon hv-icon-xs");
	el(m, "span", { text: plural(issues.length, "Problem", "Probleme") });
}

/** Collapsible list of all problems of a view, grouped by note. */
export function problemsSection(
	parent: HTMLElement,
	entries: { note: NoteRef; field: string; issues: Issue[]; label?: string }[],
	env: RenderEnv,
): void {
	const withIssues = entries.filter((e) => e.issues.length);
	if (!withIssues.length) return;
	const total = withIssues.reduce((n, e) => n + e.issues.length, 0);
	const notes = new Set(withIssues.map((e) => e.note.path)).size;
	const details = el(parent, "details", "hv-problems");
	const summary = el(details, "summary", "hv-problems-summary");
	icon(summary, env, "alert-triangle", "hv-icon hv-icon-xs");
	el(summary, "span", {
		text: `${plural(total, "Problem", "Probleme")} in ${plural(notes, "Notiz", "Notizen")}`,
	});
	const list = el(details, "div", "hv-problems-list");
	for (const e of withIssues) {
		for (const i of e.issues) {
			const row = el(list, "div", `hv-problem is-${i.severity}`);
			env.link(row, e.note, e.note.name, "hv-problem-note");
			if (e.label) el(row, "span", { cls: "hv-problem-block hv-mono", text: e.label });
			el(row, "span", { cls: "hv-problem-field hv-mono", text: relativeField(i.field, e.field) });
			el(row, "span", { cls: "hv-problem-msg", text: i.message });
		}
	}
}

export function blockLabel(e: BackupEntry): string {
	return e.block.id ?? e.field;
}

/** Notice line for code block option problems. */
export function optionNotice(parent: HTMLElement, problems: string[], env: RenderEnv): void {
	if (!problems.length) return;
	const box = el(parent, "div", "hv-notice");
	icon(box, env, "alert-triangle", "hv-icon hv-icon-xs");
	el(box, "span", { text: problems.join(" · ") });
}

export function emptyState(parent: HTMLElement, text: string): void {
	el(parent, "div", { cls: "hv-empty", text });
}
