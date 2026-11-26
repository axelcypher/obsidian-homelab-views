/** Card view of one note: its network-flow resources and its backup blocks. */
import { BackupEntry, HomelabIndex, NetworkEntry, NoteRef, TaskEntry, backupTitle, errorCount, findResourceNote, homeSubnet, taskTitle } from "../model/index";
import { addressSortKey, compareKeys } from "../model/ip";
import { NO_CARD_ROLES } from "../model/network";
import type { NetworkResource } from "../model/network";
import { formatDuration, labelRun, nextRun } from "../schedule/schedule";
import { breakable, el, txt } from "./dom";
import type { RenderEnv } from "./env";
import {
	copyable,
	durationText,
	externalLink,
	graceText,
	graceUntil,
	icon,
	issuesView,
	jobBadge,
	locationView,
	nextRunView,
	retentionChips,
	runnerBadge,
	runnerClass,
	runnerView,
	scheduleText,
	systemBadge,
	systemClass,
	taskKindBadge,
	titleIsJob,
	webUrl,
} from "./common";
import { CONNECTION_LABEL, ENTRY_LABEL, KIND_ICON, KIND_LABEL, ROLE_LABEL, TYPE_LABEL, plural } from "./labels";

export interface CardData {
	note: NoteRef;
	backups: BackupEntry[];
	network: NetworkEntry[];
	tasks?: TaskEntry[];
}

export interface CardOptions {
	network?: boolean;
	backup?: boolean;
	tasks?: boolean;
}

export function renderNoteCard(
	parent: HTMLElement,
	data: CardData,
	index: HomelabIndex,
	env: RenderEnv,
	opts: CardOptions = {},
): HTMLElement {
	const root = el(parent, "div", "hv-root hv-note");
	const showNet = opts.network !== false && data.network.length > 0;
	const showBackup = opts.backup !== false && data.backups.length > 0;

	if (showNet) {
		const section = el(root, "div", "hv-section hv-section-net");
		const subnets = data.network.filter((e) => e.res.kind === "subnet");
		for (const e of data.network) {
			if (e.res.kind === "subnet") continue;
			networkCard(section, e, index, env);
		}
		if (subnets.length) subnetCard(section, subnets, env);
	}

	if (showBackup) {
		const section = el(root, "div", "hv-section hv-section-backup");
		backupSectionHead(section, data.backups, env);
		const grid = el(section, "div", "hv-bk-grid");
		for (const e of data.backups) backupCard(grid, e, data.note, env);
	}

	const tasks = data.tasks ?? [];
	const showTasks = opts.tasks !== false && tasks.length > 0;
	if (showTasks) {
		const section = el(root, "div", "hv-section hv-section-tasks");
		taskSectionHead(section, tasks, env);
		const grid = el(section, "div", "hv-bk-grid");
		for (const e of tasks) taskCard(grid, e, env);
	}

	if (!showNet && !showBackup && !showTasks) el(root, "div", { cls: "hv-empty", text: "Keine Homelab-Daten in dieser Notiz." });
	return root;
}

// ---------------------------------------------------------------------------
// Network

function cardHead(card: HTMLElement, res: NetworkResource, env: RenderEnv): HTMLElement {
	const head = el(card, "div", "hv-card-head");
	icon(head, env, KIND_ICON[res.kind ?? ""] ?? "server", "hv-icon hv-card-icon");
	const main = el(head, "div", "hv-card-head-main");
	const titleRow = el(main, "div", "hv-card-title-row");
	el(titleRow, "span", { cls: "hv-card-title", text: res.name ?? "ohne Namen" });
	const kind = KIND_LABEL[res.kind ?? ""] ?? res.kind ?? "unbekannt";
	const type = res.type ? TYPE_LABEL[res.type] ?? res.type : undefined;
	el(titleRow, "span", { cls: "hv-kind", text: type ? `${kind} · ${type}` : kind });
	return main;
}

function noteLinkOrText(parent: HTMLElement, name: string, index: HomelabIndex, env: RenderEnv, kinds: NetworkResource["kind"][]) {
	const note = findResourceNote(index, name, kinds) ?? env.resolveName?.(name);
	if (note) env.link(parent, note, name, "hv-ref");
	else el(parent, "span", { cls: "hv-ref is-unresolved", text: name, title: "Keine Notiz gefunden" });
}

function field(dl: HTMLElement, label: string): HTMLElement {
	const row = el(dl, "div", "hv-field");
	el(row, "div", { cls: "hv-field-k", text: label });
	return el(row, "div", "hv-field-v");
}

function networkCard(parent: HTMLElement, e: NetworkEntry, index: HomelabIndex, env: RenderEnv): void {
	const r = e.res;
	const card = el(parent, "div", `hv-card hv-net hv-net-${r.kind ?? "unknown"}`);
	const main = cardHead(card, r, env);

	// Subtitle: where it lives
	const sub = el(main, "div", "hv-card-sub");
	const bits: (() => void)[] = [];
	if (r.kind === "app" && r.runsOn?.length) {
		bits.push(() => {
			el(sub, "span", { cls: "hv-sub-k", text: r.runsOnCluster ? "läuft im Cluster " : "läuft auf " });
			r.runsOn?.forEach((m, i) => {
				if (i > 0) txt(sub, ", ");
				noteLinkOrText(sub, m, index, env, r.runsOnCluster ? ["cluster"] : ["machine", "device", "cluster"]);
			});
		});
	}
	if (r.host) {
		const host = r.host;
		bits.push(() => {
			el(sub, "span", { cls: "hv-sub-k", text: "Host " });
			noteLinkOrText(sub, host, index, env, ["machine", "device"]);
		});
	}
	if (r.cluster) {
		const cluster = r.cluster;
		bits.push(() => {
			el(sub, "span", { cls: "hv-sub-k", text: "Cluster " });
			noteLinkOrText(sub, cluster, index, env, ["cluster"]);
		});
	}
	if (r.kind === "machine" || r.kind === "device") {
		const home = homeSubnet(index, r);
		if (home)
			bits.push(() => {
				el(sub, "span", { cls: "hv-sub-k", text: "Heimnetz " });
				el(sub, "span", { text: home.name, title: home.explicit ? "im Frontmatter gesetzt (home)" : "nach R1 abgeleitet" });
				if (home.explicit) el(sub, "span", { cls: "hv-faint", text: " (gesetzt)" });
			});
	}
	if (r.kind === "site" && r.subnet) bits.push(() => txt(sub, `Netz ${r.subnet}`));
	if (r.kind === "rack" && r.site) bits.push(() => txt(sub, `Standort ${r.site}`));
	bits.forEach((b, i) => {
		if (i > 0) el(sub, "span", { cls: "hv-sep", text: " · " });
		b();
	});
	if (!bits.length) sub.remove();

	const body = el(card, "div", "hv-card-body");

	if (r.addresses?.length) {
		el(body, "div", { cls: "hv-label", text: "Adressen" });
		const list = el(body, "div", "hv-addr-list");
		const sorted = [...r.addresses].sort((a, b) => compareKeys(addressSortKey(a.ip), addressSortKey(b.ip)));
		for (const a of sorted) {
			const row = el(list, "div", "hv-addr");
			copyable(row, a.ip, env, "hv-addr-ip");
			const sn = el(row, "span", { cls: "hv-addr-subnet", text: a.subnet ?? "" });
			if (a.iface) el(sn, "span", { cls: "hv-faint hv-mono", text: ` ${a.iface}`, title: "Netzwerkkarte im Gast" });
			if (a.mac) copyable(row, a.mac.toLowerCase(), env, "hv-addr-mac");
			else el(row, "span", { cls: "hv-addr-mac hv-faint", text: "–" });
		}
	}

	if (r.front?.length || r.back?.length) frontPanel(body, r);
	if (r.interfaces?.length) interfacesTable(body, r, env);
	if (r.switchPorts?.length) switchPortsTable(body, r);

	if (r.kind === "app") appBody(body, r, env);

	if (r.kind === "cluster") {
		if (r.machines?.length) {
			el(body, "div", { cls: "hv-label", text: plural(r.machines.length, "Maschine", "Maschinen") });
			const wrap = el(body, "div", "hv-ref-list");
			for (const m of r.machines) noteLinkOrText(wrap, m, index, env, ["machine"]);
		}
		if (r.lbIps?.length) {
			el(body, "div", { cls: "hv-label", text: "LB-IPs" });
			const list = el(body, "div", "hv-addr-list is-two");
			for (const lb of [...r.lbIps].sort((a, b) => compareKeys(addressSortKey(a.ip), addressSortKey(b.ip)))) {
				const row = el(list, "div", "hv-addr");
				copyable(row, lb.ip, env, "hv-addr-ip");
				el(row, "span", { cls: "hv-addr-subnet", text: lb.services?.join(", ") ?? "" });
			}
		}
	}

	const dl = el(body, "div", "hv-fields");
	if (r.macs?.length) {
		const v = field(dl, r.macs.length === 1 ? "MAC" : "MACs");
		r.macs.forEach((m, i) => {
			if (i > 0) txt(v, " ");
			copyable(v, m.toLowerCase(), env);
		});
	}
	if (r.webInterface) {
		const v = field(dl, "Weboberfläche");
		copyable(v, r.webInterface, env);
		const url = webUrl(r.webInterface);
		if (url) {
			txt(v, " ");
			externalLink(v, url, "öffnen", env, "hv-open");
		}
	}
	if (r.rack) {
		const v = field(dl, "Rack");
		const parts = [r.rack.name];
		if (r.rack.position !== undefined) parts.push(`HE ${r.rack.position}`);
		if (r.rack.shelf !== undefined) parts.push(`Fachboden HE ${r.rack.shelf}`);
		if (r.rack.units !== undefined) parts.push(`${r.rack.units} HE hoch`);
		if (r.rack.side) parts.push(r.rack.side === "back" ? "Rückseite" : "Vorderseite");
		txt(v, parts.join(" · "));
	}
	if (r.kind === "rack") {
		if (r.units !== undefined) txt(field(dl, "Höhe"), `${r.units} HE`);
		if (r.shelves?.length)
			txt(field(dl, "Fachböden"), r.shelves.map((s) => `HE ${s.position}${s.units > 1 ? `–${s.position + s.units - 1}` : ""}`).join(", "));
	}
	if (r.connections?.length) {
		const v = field(dl, "Verbindungen");
		const list = el(v, "div", "hv-conn-list");
		for (const c of r.connections) {
			const row = el(list, "div", "hv-conn");
			el(row, "span", { cls: "hv-mono", text: c.port ?? "?" });
			el(row, "span", { cls: "hv-conn-arrow", text: "→" });
			el(row, "span", { cls: "hv-mono", text: c.to ?? "?" });
			if (c.kind) el(row, "span", { cls: "hv-faint", text: CONNECTION_LABEL[c.kind] ?? c.kind });
		}
	}
	if (!dl.childElementCount) dl.remove();
	if (!body.childElementCount && !e.issues.length) body.remove();

	issuesView(card, e.issues, e.field, env);
	if (errorCount(e.issues)) card.classList.add("has-errors");
}

export function entryBadge(
	parent: HTMLElement,
	entry: string | undefined,
	cloudflare: boolean | undefined,
	env: RenderEnv,
	compact = false,
): void {
	if (entry) {
		const known = entry in ENTRY_LABEL;
		const b = el(parent, "span", {
			cls: `hv-badge hv-entry hv-entry-${known ? entry : "unknown"}`,
			title: known ? `Eingang: ${ENTRY_LABEL[entry]}` : `Eingang ${entry} ist laut Schema nicht erlaubt`,
		});
		icon(b, env, entry === "intern" ? "lock" : "globe", "hv-icon hv-icon-xs");
		el(b, "span", { text: ENTRY_LABEL[entry] ?? entry });
	}
	if (cloudflare) {
		const c = el(parent, "span", {
			cls: `hv-badge hv-cf${compact ? " is-compact" : ""}`,
			title: "über den Cloudflare-Proxy",
			attr: { "aria-label": "Cloudflare-Proxy" },
		});
		icon(c, env, "cloud", "hv-icon hv-icon-xs");
		if (!compact) el(c, "span", { text: "Cloudflare" });
	}
}

function appBody(body: HTMLElement, r: NetworkResource, env: RenderEnv): void {
	if (r.hostnames?.length) {
		el(body, "div", { cls: "hv-label", text: r.hostnames.length === 1 ? "Hostname" : "Hostnamen" });
		const list = el(body, "div", "hv-host-list");
		for (const h of r.hostnames) {
			const row = el(list, "div", "hv-host");
			const l1 = el(row, "div", "hv-host-line");
			const name = el(l1, "a", {
				cls: "hv-host-name hv-mono",
				attr: { href: `https://${h.name}${h.path ?? ""}`, target: "_blank", rel: "noopener noreferrer" },
			});
			breakable(name, h.name, /(?<=[.])/);
			if (h.path) el(name, "span", { cls: "hv-host-path", text: h.path });
			const badges = el(l1, "span", "hv-host-badges");
			entryBadge(badges, h.entry, h.cloudflare, env);
			const l2 = el(row, "div", "hv-host-meta");
			el(l2, "span", { cls: "hv-host-arrow", text: "→" });
			if (h.target) copyable(l2, h.target, env, "hv-host-target");
			else el(l2, "span", { cls: "hv-faint", text: "kein Ziel" });
			if (h.traefik) {
				el(l2, "span", { cls: "hv-sep", text: " · " });
				el(l2, "span", { cls: "hv-sub-k", text: "Traefik " });
				el(l2, "span", { cls: "hv-traefik", text: h.traefik === "cluster" ? "Cluster" : h.traefik });
			}
		}
	}
	if (r.ports?.length) {
		el(body, "div", { cls: "hv-label", text: r.ports.length === 1 ? "Port" : "Ports" });
		const list = el(body, "div", "hv-port-list");
		for (const p of r.ports) {
			const row = el(list, "div", "hv-port");
			el(row, "span", { cls: "hv-port-num hv-mono", text: `${p.port}/${p.protocol ?? "?"}` });
			if (p.purpose) el(row, "span", { cls: "hv-port-purpose", text: p.purpose });
		}
	}
}

function subnetCard(parent: HTMLElement, subnets: NetworkEntry[], env: RenderEnv): void {
	const card = el(parent, "div", "hv-card hv-net hv-net-subnets");
	const head = el(card, "div", "hv-card-head");
	icon(head, env, "network", "hv-icon hv-card-icon");
	const main = el(head, "div", "hv-card-head-main");
	const row = el(main, "div", "hv-card-title-row");
	el(row, "span", { cls: "hv-card-title", text: "Subnetze" });
	el(row, "span", { cls: "hv-kind", text: String(subnets.length) });
	const wrap = el(card, "div", "hv-table-wrap is-flush");
	const table = el(wrap, "table", "hv-table is-compact");
	const tr = el(el(table, "thead"), "tr");
	const withRole = subnets.some((s) => s.res.role);
	for (const h of ["Name", "Netz", "VLAN", "Medium", ...(withRole ? ["Rolle"] : [])]) el(tr, "th", { text: h });
	const tbody = el(table, "tbody");
	const sorted = [...subnets].sort((a, b) =>
		compareKeys(addressSortKey(a.res.network?.split("/")[0]), addressSortKey(b.res.network?.split("/")[0])),
	);
	for (const s of sorted) {
		const r = el(tbody, "tr");
		el(r, "td", { cls: "hv-strong", text: s.res.name ?? "" });
		const net = el(r, "td");
		if (s.res.network) copyable(net, s.res.network, env);
		el(r, "td", { cls: "hv-num", text: s.res.vlan === null ? "ohne Tag" : s.res.vlan === undefined ? "–" : String(s.res.vlan) });
		el(r, "td", { text: s.res.medium ?? "–" });
		if (withRole) {
			const role = el(r, "td", { text: s.res.role ? ROLE_LABEL[s.res.role] ?? s.res.role : "–" });
			if (s.res.role && NO_CARD_ROLES.includes(s.res.role)) role.classList.add("hv-faint");
		}
	}
	const issues = subnets.flatMap((s) => s.issues);
	issuesView(card, issues, "", env);
}

// ---------------------------------------------------------------------------
// Backups

function backupSectionHead(parent: HTMLElement, backups: BackupEntry[], env: RenderEnv): void {
	const head = el(parent, "div", "hv-section-head");
	icon(head, env, "database", "hv-icon");
	el(head, "span", { cls: "hv-section-title", text: "Sicherungen" });
	const jobs = backups.filter((b) => b.block.type === "job").length;
	const ignored = backups.filter((b) => b.block.type === "ignore").length;
	const copies = backups.length - jobs - ignored;
	const counts = [
		copies ? plural(copies, "Sicherung", "Sicherungen") : "",
		jobs ? plural(jobs, "Job", "Jobs") : "",
		ignored ? plural(ignored, "Ausnahme", "Ausnahmen") : "",
	]
		.filter(Boolean)
		.join(" · ");
	el(head, "span", { cls: "hv-section-meta", text: counts });

	// Soonest next run of the note
	let soonest: { at: number; entry: BackupEntry } | undefined;
	for (const e of backups) {
		const b = e.block;
		if (!b.schedule || !b.tz) continue;
		const n = nextRun(b.schedule, b.tz, env.now);
		if (n.kind === "at" && (!soonest || n.at < soonest.at)) soonest = { at: n.at, entry: e };
	}
	if (soonest) {
		const l = labelRun(soonest.at, soonest.entry.block.tz ?? env.displayTz, env.displayTz, env.now);
		const next = el(head, "span", { cls: "hv-section-next" });
		icon(next, env, "clock", "hv-icon hv-icon-xs");
		el(next, "span", { text: `nächster Lauf ${l.day} ${l.time}` });
		el(next, "span", { cls: "hv-faint", text: ` · ${soonest.entry.block.id ?? ""}` });
	}
}

export function backupCard(parent: HTMLElement, e: BackupEntry, here: NoteRef, env: RenderEnv): HTMLElement {
	const b = e.block;
	if (b.type === "ignore") return ignoreCard(parent, e, env);
	const classes = ["hv-card", "hv-bk", systemClass(b.system)];
	if (b.type === "job") classes.push("is-job");
	if (b.copyOf) classes.push("is-copy");
	if (errorCount(e.issues)) classes.push("has-errors");
	const card = el(parent, "div", classes.join(" "));

	const head = el(card, "div", "hv-bk-head");
	systemBadge(head, b.system);
	if (b.type === "job") jobBadge(head, b.job, !titleIsJob(b));
	if (b.type === "job") card.setAttribute("aria-label", `Job ${b.id ?? ""}`);

	el(card, "div", { cls: "hv-bk-title", text: backupTitle(b) });
	el(card, "div", { cls: "hv-bk-id hv-mono", text: b.id ?? "ohne id", title: "id des Blocks" });

	if (b.copyOf) {
		const c = el(card, "div", "hv-copyof");
		icon(c, env, "corner-down-right", "hv-icon hv-icon-xs");
		el(c, "span", { text: "Kopie von " });
		if (e.original && e.original.note.path !== here.path) env.link(c, e.original.note, b.copyOf, "hv-ref hv-mono");
		else el(c, "span", { cls: `hv-ref hv-mono${e.original ? "" : " is-unresolved"}`, text: b.copyOf });
		// the original's description only when it says something the copy's own title doesn't
		const ownWhat = b.what?.trim();
		const origWhat = e.original?.block.what?.trim();
		if (origWhat && origWhat !== ownWhat) el(c, "span", { cls: "hv-faint", text: ` · ${origWhat}` });
	}
	if (e.copies.length) {
		const c = el(card, "div", "hv-copyof is-has-copies");
		icon(c, env, "copy", "hv-icon hv-icon-xs");
		el(c, "span", { text: e.copies.length === 1 ? "weitere Kopie: " : "weitere Kopien: " });
		e.copies.forEach((copy, i) => {
			if (i > 0) txt(c, ", ");
			if (copy.note.path !== here.path) env.link(c, copy.note, copy.block.id ?? copy.field, "hv-ref hv-mono");
			else el(c, "span", { cls: "hv-ref hv-mono", text: copy.block.id ?? copy.field });
		});
	}

	const dl = el(card, "div", "hv-fields");
	locationView(field(dl, b.type === "job" ? "Wirkt auf" : "Ort"), b, env);
	el(field(dl, "Zeitplan"), "span", { cls: b.schedule ? "hv-schedule" : "hv-faint", text: scheduleText(b) });
	if (b.schedule?.kind !== "every") nextRunView(field(dl, "Nächster Lauf"), b, env);
	else {
		const v = field(dl, "Nächster Lauf");
		el(v, "span", { cls: "hv-faint", text: "ohne feste Uhrzeit" });
		if (b.graceMs !== undefined)
			el(v, "div", {
				cls: "hv-next-rel",
				text: `überfällig nach ${formatDuration(b.schedule.everyMs + b.graceMs)} ohne Lauf`,
			});
	}
	if (b.graceMs !== undefined) {
		const v = field(dl, "Karenz");
		txt(v, graceText(b));
		const until = graceUntil(b, env);
		if (until) el(v, "span", { cls: "hv-faint", text: ` · ${until}` });
	}
	if (b.retention) retentionChips(field(dl, "Aufbewahrung"), b.retention);
	const fmt = [b.engine, b.format].filter(Boolean) as string[];
	if (fmt.length) el(field(dl, "Format"), "span", { cls: "hv-mono", text: fmt.join(" · ") });
	if (b.tz && b.tz !== env.displayTz) el(field(dl, "Zeitzone"), "span", { cls: "hv-mono", text: b.tz });

	issuesView(card, e.issues, e.field, env);
	return card;
}

/** `type: ignore`: found live, left out on purpose — no schedule, just the reason. */
function ignoreCard(parent: HTMLElement, e: BackupEntry, env: RenderEnv): HTMLElement {
	const b = e.block;
	const classes = ["hv-card", "hv-bk", "is-ignored", systemClass(b.system)];
	if (errorCount(e.issues)) classes.push("has-errors");
	const card = el(parent, "div", classes.join(" "));
	const head = el(card, "div", "hv-bk-head");
	systemBadge(head, b.system);
	el(head, "span", { cls: "hv-badge hv-badge-ignore", text: "bewusst ausgenommen" });
	el(card, "div", { cls: "hv-bk-title", text: b.what ?? b.id ?? "Ausnahme" });
	el(card, "div", { cls: "hv-bk-id hv-mono", text: b.id ?? "ohne id", title: "id des Blocks" });
	const dl = el(card, "div", "hv-fields");
	locationView(field(dl, "Ort"), b, env);
	el(field(dl, "Grund"), "span", { text: b.why ?? "–" });
	issuesView(card, e.issues, e.field, env);
	return card;
}

// ---------------------------------------------------------------------------
// Scheduled tasks (not backups)

function taskSectionHead(parent: HTMLElement, tasks: TaskEntry[], env: RenderEnv): void {
	const head = el(parent, "div", "hv-section-head");
	icon(head, env, "calendar-clock", "hv-icon");
	el(head, "span", { cls: "hv-section-title", text: "Geplante Aufgaben" });
	el(head, "span", { cls: "hv-section-meta", text: plural(tasks.length, "Aufgabe", "Aufgaben") });
	let soonest: { at: number; entry: TaskEntry } | undefined;
	for (const e of tasks) {
		const b = e.block;
		if (!b.schedule || !b.tz) continue;
		const n = nextRun(b.schedule, b.tz, env.now);
		if (n.kind === "at" && (!soonest || n.at < soonest.at)) soonest = { at: n.at, entry: e };
	}
	if (soonest) {
		const l = labelRun(soonest.at, soonest.entry.block.tz ?? env.displayTz, env.displayTz, env.now);
		const next = el(head, "span", { cls: "hv-section-next" });
		icon(next, env, "clock", "hv-icon hv-icon-xs");
		el(next, "span", { text: `nächste ${l.day} ${l.time}` });
		el(next, "span", { cls: "hv-faint", text: ` · ${soonest.entry.block.id ?? ""}` });
	}
}

export function taskCard(parent: HTMLElement, e: TaskEntry, env: RenderEnv): HTMLElement {
	const b = e.block;
	const classes = ["hv-card", "hv-bk", "hv-task", runnerClass(b.runner?.kind)];
	if (errorCount(e.issues)) classes.push("has-errors");
	const card = el(parent, "div", classes.join(" "));
	const head = el(card, "div", "hv-bk-head");
	runnerBadge(head, b.runner?.kind, env);
	taskKindBadge(head, b.kind);
	el(card, "div", { cls: "hv-bk-title", text: taskTitle(b) });
	el(card, "div", { cls: "hv-bk-id hv-mono", text: b.id ?? "ohne id", title: "id des Blocks" });

	const dl = el(card, "div", "hv-fields");
	runnerView(field(dl, "Gestartet von"), b.runner, env);
	el(field(dl, "Zeitplan"), "span", { cls: b.schedule ? "hv-schedule" : "hv-faint", text: scheduleText(b) });
	if (b.schedule?.kind === "every") el(field(dl, "Nächster Lauf"), "span", { cls: "hv-faint", text: "ohne feste Uhrzeit" });
	else nextRunView(field(dl, "Nächster Lauf"), b, env);
	if (b.durationMs !== undefined) {
		const v = field(dl, "Dauer");
		txt(v, durationText(b));
		if (b.schedule && b.tz) {
			const n = nextRun(b.schedule, b.tz, env.now);
			if (n.kind === "at") el(v, "span", { cls: "hv-faint", text: ` · bis ${clockIn(n.at + b.durationMs, env)}` });
		}
	}
	if (b.command) copyable(field(dl, "Befehl"), b.command, env, "hv-cmd", "path");
	if (b.tz && b.tz !== env.displayTz) el(field(dl, "Zeitzone"), "span", { cls: "hv-mono", text: b.tz });

	issuesView(card, e.issues, e.field, env);
	return card;
}

function clockIn(at: number, env: RenderEnv): string {
	return labelRun(at, env.displayTz, env.displayTz, env.now).time;
}

// ---------------------------------------------------------------------------
// Schema 3: network cards and switch ports

/** Network cards (Proxmox names for VMs), with the address that belongs to each (same MAC and subnet). */
function interfacesTable(body: HTMLElement, r: NetworkResource, env: RenderEnv): void {
	const list = r.interfaces ?? [];
	el(body, "div", { cls: "hv-label", text: list.length === 1 ? "Netzwerkkarte" : `Netzwerkkarten (${list.length})` });
	const wrap = el(body, "div", "hv-table-wrap hv-card-table");
	const table = el(wrap, "table", "hv-table is-compact hv-iface-table");
	const head = el(el(table, "thead"), "tr");
	for (const h of ["Karte", "Netz", "VLAN", "MAC", "IP"]) el(head, "th", { text: h });
	const tbody = el(table, "tbody");
	for (const i of list) {
		const tr = el(tbody, "tr");
		el(tr, "td", { cls: "hv-mono hv-strong", text: i.name });
		el(tr, "td", { text: i.subnet ?? "–" });
		el(tr, "td", { cls: "hv-num", text: i.vlan === null ? "ohne Tag" : i.vlan === undefined ? "–" : String(i.vlan) });
		const mac = el(tr, "td");
		if (i.mac) copyable(mac, i.mac.toLowerCase(), env);
		else el(mac, "span", { cls: "hv-faint", text: "–" });
		const ipTd = el(tr, "td");
		const addr = (r.addresses ?? []).find(
			(a) => !!a.mac && !!i.mac && a.mac.toLowerCase() === i.mac.toLowerCase() && (!i.subnet || a.subnet === i.subnet),
		);
		if (addr) copyable(ipTd, addr.ip, env);
		else el(ipTd, "span", { cls: "hv-faint", text: i.subnet ? "keine IP" : "–" });
	}
}

/** VLANs of switch ports (Soll for the SNMP comparison in network-flow). */
function switchPortsTable(body: HTMLElement, r: NetworkResource): void {
	const list = r.switchPorts ?? [];
	el(body, "div", { cls: "hv-label", text: `Ports (${list.length})` });
	const wrap = el(body, "div", "hv-table-wrap hv-card-table");
	const table = el(wrap, "table", "hv-table is-compact hv-port-table");
	const head = el(el(table, "thead"), "tr");
	for (const h of ["Port", "PVID", "ungetaggt", "getaggt"]) el(head, "th", { text: h });
	const tbody = el(table, "tbody");
	const fmt = (ids: number[] | undefined) => (ids === undefined ? "–" : ids.length ? ids.join(", ") : "keine");
	for (const p of list) {
		const tr = el(tbody, "tr");
		el(tr, "td", { cls: "hv-mono hv-strong", text: p.port });
		el(tr, "td", { cls: "hv-num", text: p.pvid === undefined ? "–" : String(p.pvid) });
		el(tr, "td", { cls: "hv-mono", text: fmt(p.untagged) });
		el(tr, "td", { cls: "hv-mono", text: fmt(p.tagged) });
	}
}

// ---------------------------------------------------------------------------
// Schema 4: front and back view

const PORT_TYPE_LABEL: Record<string, string> = {
	rj45: "RJ45",
	sfp: "SFP",
	"sfp+": "SFP+",
	combo: "Combo (RJ45 + SFP)",
	usb: "USB",
	inlet: "Stromeingang",
	outlet: "Steckdose",
};

/** Connectors as on the device: rows top to bottom; linked ports highlighted, details on hover. */
function frontPanel(body: HTMLElement, r: NetworkResource): void {
	const conn = new Map((r.connections ?? []).filter((c) => c.port).map((c) => [c.port as string, c]));
	const vlans = new Map((r.switchPorts ?? []).map((p) => [p.port, p]));
	const ifaces = new Map((r.interfaces ?? []).map((i) => [i.name, i]));
	const side = (label: string, rows: (string | null)[][] | undefined) => {
		if (!rows?.length) return;
		el(body, "div", { cls: "hv-label", text: label });
		const panel = el(body, "div", { cls: "hv-panel", attr: { role: "img", "aria-label": `${label} von ${r.name ?? ""}` } });
		for (const row of rows) {
			const line = el(panel, "div", "hv-panel-row");
			for (const name of row) {
				if (name === null) {
					el(line, "span", { cls: "hv-panel-gap", attr: { "aria-hidden": "true" } });
					continue;
				}
				const type = r.portTypes?.[name] ?? "rj45";
				const c = conn.get(name);
				const v = vlans.get(name);
				const i = ifaces.get(name);
				const tip = [`${name} · ${PORT_TYPE_LABEL[type] ?? type}`];
				if (c) tip.push(`→ ${c.to ?? "?"}${c.kind ? ` (${CONNECTION_LABEL[c.kind] ?? c.kind})` : ""}`);
				if (v) {
					const fmt = (ids?: number[]) => (ids === undefined ? "–" : ids.length ? ids.join(", ") : "keine");
					tip.push(`PVID ${v.pvid ?? "–"} · ungetaggt ${fmt(v.untagged)} · getaggt ${fmt(v.tagged)}`);
				}
				if (i) tip.push([i.subnet, i.vlan === null ? "ohne Tag" : i.vlan !== undefined ? `VLAN ${i.vlan}` : "", i.mac].filter(Boolean).join(" · "));
				const cls = ["hv-port-cell", `is-${type.replace("+", "-plus")}`];
				if (c) cls.push("is-linked");
				const cell = el(line, "span", { cls: cls.join(" "), title: tip.join("\n") });
				const label = type === "inlet" || type === "outlet" ? "AC" : type === "usb" ? "" : name.replace(/^(gi|ge|eth|port)/i, "") || name;
				el(cell, "span", { cls: "hv-port-label", text: label });
			}
		}
	};
	side("Front", r.front);
	side("Rückseite", r.back);
}
