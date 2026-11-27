/**
 * The app profile (`app` frontmatter): one card per block in the note card, and
 * the table `homelab-apps` with all apps, their platform, deployment and pending updates.
 */
import { AppEntry, HomelabIndex, errorCount } from "../model/index";
import { AppBlock, GITOPS_REPO_URL, pendingUpdates } from "../model/app";
import { compareKeys } from "../model/ip";
import { el, txt } from "./dom";
import type { RenderEnv, ViewState } from "./env";
import { copyable, emptyState, externalLink, icon, issueMarker, issuesView, problemsSection } from "./common";
import { APP_STATUS_LABEL, DB_ENGINE_LABEL, DEPLOY_LABEL, PLATFORM_LABEL, UPDATE_LABEL, plural } from "./labels";
import type { AppsOptions } from "./options";
import { Column, sortableTable } from "./table";

function platformBadge(parent: HTMLElement, b: AppBlock): void {
	if (!b.platform) return;
	el(parent, "span", { cls: `hv-badge hv-badge-platform is-${b.platform}`, text: PLATFORM_LABEL[b.platform] ?? b.platform });
}

function statusBadge(parent: HTMLElement, b: AppBlock): void {
	if (!b.status || b.status === "running") return;
	el(parent, "span", { cls: `hv-badge hv-badge-status is-${b.status}`, text: APP_STATUS_LABEL[b.status] ?? b.status });
}

function updateBadge(parent: HTMLElement, update: string | undefined): void {
	if (!update) return;
	el(parent, "span", { cls: `hv-badge hv-badge-update is-${update}`, text: UPDATE_LABEL[update] ?? update });
}

function deployView(parent: HTMLElement, b: AppBlock): void {
	if (!b.deploy) return void el(parent, "span", { cls: "hv-faint", text: "–" });
	txt(parent, `${DEPLOY_LABEL[b.deploy.kind] ?? b.deploy.kind} `);
	el(parent, "code", { cls: "hv-mono", text: b.deploy.value });
}

function row(dl: HTMLElement, label: string): HTMLElement {
	const r = el(dl, "div", "hv-field");
	el(r, "div", { cls: "hv-field-k", text: label });
	return el(r, "div", "hv-field-v");
}

/** One app profile as a card (used in the note card). */
export function appCard(parent: HTMLElement, e: AppEntry, env: RenderEnv): void {
	const b = e.block;
	const card = el(parent, "div", `hv-card hv-app${b.status && b.status !== "running" ? ` is-${b.status}` : ""}`);
	const head = el(card, "div", "hv-card-head");
	icon(head, env, "package", "hv-icon hv-card-icon");
	const main = el(head, "div", "hv-card-head-main");
	const titleRow = el(main, "div", "hv-card-title-row");
	el(titleRow, "span", { cls: "hv-card-title", text: b.name ?? "ohne Namen" });
	platformBadge(titleRow, b);
	statusBadge(titleRow, b);
	if (b.what) el(main, "div", { cls: "hv-card-sub", text: b.what });

	const body = el(card, "div", "hv-card-body");
	const dl = el(body, "div", "hv-fields");
	if (b.deploy) deployView(row(dl, "Bereitstellung"), b);
	if (b.repo) externalLink(row(dl, "Repo"), GITOPS_REPO_URL + b.repo, b.repo, env, "hv-mono");
	if (b.namespace) el(row(dl, "Namespace"), "code", { cls: "hv-mono", text: b.namespace });
	if (b.databases?.length) {
		const v = row(dl, "Datenbank");
		b.databases.forEach((d, i) => {
			if (i) txt(v, ", ");
			txt(v, DB_ENGINE_LABEL[d.engine] ?? d.engine);
			if (d.name) el(v, "span", { cls: "hv-faint", text: ` (${d.name})` });
		});
	}
	if (b.storage?.length) {
		const v = el(row(dl, "Daten"), "div", "hv-stack");
		for (const s of b.storage) {
			const line = el(v, "div", "hv-app-line");
			copyable(line, s.path, env);
			if (s.what) el(line, "span", { cls: "hv-faint", text: ` ${s.what}` });
		}
	}
	if (b.secrets?.length) {
		const v = el(row(dl, "Secrets"), "div", "hv-stack");
		for (const s of b.secrets) {
			const line = el(v, "div", "hv-app-line");
			copyable(line, s.path, env);
			if (s.from) el(line, "span", { cls: "hv-badge hv-badge-shared", text: `von ${s.from}`, title: `Der Pfad gehört zu ${s.from}; diese App nutzt ihn mit.` });
			if (s.keys?.length) {
				const keys = el(line, "div", "hv-chips");
				for (const k of s.keys) el(keys, "span", { cls: "hv-chip hv-mono", text: k });
			}
		}
	}
	if (b.links?.length) {
		const v = row(dl, "Links");
		b.links.forEach((l, i) => {
			if (i) txt(v, " · ");
			externalLink(v, l.url, l.title ?? l.url.replace(/^https?:\/\//, "").replace(/\/$/, ""), env);
		});
	}

	if (b.versions?.length) {
		const head2 = el(body, "div", "hv-subhead");
		el(head2, "span", { text: "Versionen" });
		const pending = pendingUpdates(b);
		el(head2, "span", { cls: "hv-faint", text: [pending ? plural(pending, "Update offen", "Updates offen") : "aktuell", b.checked ? `geprüft ${b.checked}` : ""].filter(Boolean).join(" · ") });
		const wrap = el(body, "div", "hv-table-wrap hv-card-table");
		const table = el(wrap, "table", "hv-table is-compact");
		const tr = el(el(table, "thead"), "tr");
		for (const h of ["Komponente", "Version", "Neueste", "Update"]) el(tr, "th", { text: h });
		const tbody = el(table, "tbody");
		for (const v of b.versions) {
			const r = el(tbody, "tr");
			const name = el(r, "td");
			if (v.source && /^https?:\/\//.test(v.source)) externalLink(name, v.source, v.name, env, "hv-mono");
			else el(name, "span", { cls: "hv-mono", text: v.name });
			if (v.kind && v.kind !== "image") el(name, "span", { cls: "hv-faint", text: ` ${v.kind}` });
			el(r, "td", { cls: "hv-mono", text: v.version });
			el(r, "td", { cls: "hv-mono", text: v.latest ?? "–" });
			updateBadge(el(r, "td"), v.update);
		}
	}
	issuesView(card, e.issues, e.field, env);
}

/** `homelab-apps`: all app profiles, one row per app. */
export function renderApps(parent: HTMLElement, entries: AppEntry[], _index: HomelabIndex, env: RenderEnv, opts: AppsOptions, state: ViewState): void {
	const root = el(parent, "div", "hv-root hv-view hv-apps");
	let list = entries;
	if (opts.platform) list = list.filter((e) => e.block.platform && opts.platform?.includes(e.block.platform));
	if (opts.status) list = list.filter((e) => opts.status?.includes(e.block.status ?? "running"));
	if (opts.updates) list = list.filter((e) => pendingUpdates(e.block) > 0);
	if (!list.length) return void emptyState(root, "Keine App-Steckbriefe gefunden.");

	const pendingTotal = list.reduce((n, e) => n + (pendingUpdates(e.block) ? 1 : 0), 0);
	const head = el(root, "div", "hv-subsection-head");
	el(head, "span", { cls: "hv-subsection-title", text: plural(list.length, "App", "Apps") });
	el(head, "span", { cls: "hv-subsection-meta", text: pendingTotal ? `${pendingTotal} mit offenen Updates` : "keine offenen Updates" });

	const cols: Column<AppEntry>[] = [
		{
			key: "name",
			label: "App",
			render: (td, e) => {
				env.link(el(td, "div", "hv-name-cell"), e.note, e.block.name ?? e.note.name, "hv-note-link hv-strong");
				if (e.block.what) el(td, "div", { cls: "hv-faint", text: e.block.what });
				issueMarker(td, e.issues, e.field, env);
			},
			sort: (e) => e.block.name ?? e.note.name,
		},
		{
			key: "platform",
			label: "Plattform",
			render: (td, e) => {
				platformBadge(td, e.block);
				statusBadge(td, e.block);
			},
			sort: (e) => `${e.block.platform ?? ""}/${e.block.status ?? "running"}`,
		},
		{ key: "deploy", label: "Bereitstellung", render: (td, e) => deployView(td, e.block), sort: (e) => e.block.deploy?.value ?? "" },
		{
			key: "updates",
			label: "Updates",
			render: (td, e) => {
				const n = pendingUpdates(e.block);
				if (!e.block.versions?.length) return void el(td, "span", { cls: "hv-faint", text: "–" });
				if (!n) el(td, "span", { cls: "hv-faint", text: "aktuell" });
				for (const v of e.block.versions.filter((x) => x.update && x.update !== "none")) {
					const line = el(td, "div", "hv-stack-line");
					updateBadge(line, v.update);
					el(line, "span", { cls: "hv-mono", text: ` ${v.name} ${v.version} → ${v.latest ?? "?"}` });
				}
			},
			sort: (e) => -pendingUpdates(e.block),
		},
		{ key: "checked", label: "Geprüft", cls: "hv-nowrap", render: (td, e) => void (td.textContent = e.block.checked ?? "–"), sort: (e) => e.block.checked ?? "" },
	];
	sortableTable(root, list, cols, state, "sortApps", {
		tableClass: "hv-apps-table",
		initial: { key: "name", dir: 1 },
		rowClass: (e) => (errorCount(e.issues) ? "has-errors" : ""),
		tiebreak: (e) => e.note.path,
	});
	problemsSection(
		root,
		list.map((e) => ({ note: e.note, field: e.field, issues: e.issues, label: e.block.name })),
		env,
	);
	void compareKeys;
}
