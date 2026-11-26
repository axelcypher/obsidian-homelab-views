/** `homelab-network`: machines and devices, apps by hostname, subnets, Zigbee nodes – sortable, IPs numerically. */
import { HomelabIndex, NetworkEntry, NoteRef, errorCount, findResourceNote, homeSubnet } from "../model/index";
import { addressSortKey, compareKeys } from "../model/ip";
import { NO_CARD_ROLES } from "../model/network";
import type { Address, Hostname, NetworkResource } from "../model/network";
import { el, txt } from "./dom";
import type { RenderEnv, ViewState } from "./env";
import { copyable, emptyState, externalLink, issueMarker, problemsSection, webUrl } from "./common";
import { entryBadge } from "./card";
import { ENTRY_LABEL, KIND_LABEL, ROLE_LABEL, TYPE_LABEL, ZIGBEE_ROLE_LABEL, plural } from "./labels";
import type { NetworkOptions } from "./options";
import { Column, sortableTable } from "./table";

function resolve(index: HomelabIndex, env: RenderEnv, name: string, kinds: NetworkResource["kind"][]): NoteRef | undefined {
	return findResourceNote(index, name, kinds) ?? env.resolveName?.(name);
}

function refOrText(parent: HTMLElement, index: HomelabIndex, env: RenderEnv, name: string, kinds: NetworkResource["kind"][]) {
	const note = resolve(index, env, name, kinds);
	if (note) env.link(parent, note, name, "hv-ref");
	else el(parent, "span", { cls: "hv-ref is-unresolved", text: name });
}

function section(parent: HTMLElement, title: string, meta: number | string): HTMLElement {
	const s = el(parent, "div", "hv-subsection");
	const h = el(s, "div", "hv-subsection-head");
	el(h, "span", { cls: "hv-subsection-title", text: title });
	el(h, "span", { cls: "hv-subsection-meta", text: String(meta) });
	return s;
}

function sortedAddresses(e: NetworkEntry): Address[] {
	return [...(e.res.addresses ?? [])].sort((a, b) => compareKeys(addressSortKey(a.ip), addressSortKey(b.ip)));
}

/** One line per item; empty cell shows a dash. */
function stack<T>(td: HTMLElement, items: T[], render: (line: HTMLElement, item: T) => void): void {
	if (!items.length) return void el(td, "span", { cls: "hv-faint", text: "–" });
	const list = el(td, "div", "hv-stack");
	for (const item of items) render(el(list, "div", "hv-stack-line"), item);
}

function nameCell(td: HTMLElement, e: NetworkEntry, env: RenderEnv): void {
	const line = el(td, "div", "hv-name-cell");
	env.link(line, e.note, e.res.name ?? e.note.name, "hv-note-link hv-strong");
	issueMarker(td, e.issues, e.field, env);
}

export function renderNetwork(
	parent: HTMLElement,
	entries: NetworkEntry[],
	index: HomelabIndex,
	env: RenderEnv,
	opts: NetworkOptions,
	state: ViewState,
): void {
	const root = el(parent, "div", "hv-root hv-view hv-network");
	if (!entries.length) {
		emptyState(root, "Keine network-flow-Blöcke gefunden.");
		return;
	}

	if (opts.show.includes("machines")) {
		const machines = entries.filter((e) => e.res.kind === "machine" || e.res.kind === "device");
		if (machines.length) {
			const s = section(root, "Maschinen und Geräte", machines.length);
			const cols: Column<NetworkEntry>[] = [
				{ key: "name", label: "Name", render: (td, e) => nameCell(td, e, env), sort: (e) => e.res.name ?? "" },
				{
					key: "type",
					label: "Typ",
					render: (td, e) => {
						el(td, "span", { cls: "hv-type", text: e.res.type ? TYPE_LABEL[e.res.type] ?? e.res.type : "–" });
						if (e.res.kind === "device") el(td, "div", { cls: "hv-faint", text: KIND_LABEL.device });
					},
					sort: (e) => [e.res.kind ?? "", e.res.type ?? ""].join("/"),
				},
				{
					key: "host",
					label: "Host",
					cls: "hv-nowrap",
					render: (td, e) => {
						if (e.res.host) refOrText(td, index, env, e.res.host, ["machine", "device"]);
						else el(td, "span", { cls: "hv-faint", text: "–" });
						if (e.res.cluster) {
							const c = el(td, "div", "hv-faint");
							txt(c, "Cluster ");
							refOrText(c, index, env, e.res.cluster, ["cluster"]);
						}
					},
					sort: (e) => e.res.host ?? "",
				},
				// IP, Netz and MAC as three columns; each cell stacks one line per address so the lines align.
				{
					key: "ip",
					label: "IP",
					cls: "hv-col-ip",
					render: (td, e) => stack(td, sortedAddresses(e), (line, a) => void copyable(line, a.ip, env, "hv-addr-ip")),
					sort: (e) => {
						const first = sortedAddresses(e)[0];
						return first ? addressSortKey(first.ip) : undefined;
					},
				},
				{
					key: "subnet",
					label: "Netz",
					cls: "hv-col-subnet",
					render: (td, e) => stack(td, sortedAddresses(e), (line, a) => void (line.textContent = a.subnet ?? "–")),
					sort: (e) => sortedAddresses(e)[0]?.subnet ?? "",
				},
				{
					key: "mac",
					label: "MAC",
					cls: "hv-col-mac",
					render: (td, e) =>
						stack(td, sortedAddresses(e), (line, a) => {
							if (a.mac) copyable(line, a.mac.toLowerCase(), env, "hv-addr-mac");
							else el(line, "span", { cls: "hv-faint", text: "–" });
						}),
					sort: (e) => sortedAddresses(e)[0]?.mac ?? "",
				},
				{
					key: "home",
					label: "Heimnetz",
					cls: "hv-nowrap",
					render: (td, e) => {
						const h = homeSubnet(index, e.res);
						if (!h) return void el(td, "span", { cls: "hv-faint", text: "–" });
						el(td, "span", { text: h.name, title: h.explicit ? "im Frontmatter gesetzt (home)" : "nach R1 abgeleitet" });
						if (h.explicit) el(td, "div", { cls: "hv-faint", text: "gesetzt" });
					},
					sort: (e) => homeSubnet(index, e.res)?.name ?? "",
				},
				{
					key: "web",
					label: "Weboberfläche",
					cls: "hv-nowrap",
					render: (td, e) => {
						if (!e.res.webInterface) return void el(td, "span", { cls: "hv-faint", text: "–" });
						const url = webUrl(e.res.webInterface);
						if (url) externalLink(td, url, e.res.webInterface, env, "hv-mono");
						else el(td, "span", { cls: "hv-mono", text: e.res.webInterface });
					},
					sort: (e) => addressSortKey(e.res.webInterface),
				},
			];
			sortableTable(s, machines, cols, state, "sortMachines", {
				tableClass: "hv-machine-table",
				initial: { key: "ip", dir: 1 },
				rowClass: (e) => (errorCount(e.issues) ? "has-errors" : ""),
				tiebreak: (e) => e.res.name ?? "",
			});
		}
	}

	if (opts.show.includes("apps")) {
		let apps = entries.filter((e) => e.res.kind === "app");
		if (opts.runsOn) apps = apps.filter((e) => e.res.runsOn?.includes(opts.runsOn ?? ""));
		type Row = { e: NetworkEntry; h?: Hostname };
		let rows: Row[] = apps.flatMap((e) => (e.res.hostnames?.length ? e.res.hostnames.map((h) => ({ e, h })) : [{ e }]));
		if (opts.entry) rows = rows.filter((r) => r.h?.entry === opts.entry || (opts.entry !== "intern" && r.h?.entry === "beide"));
		if (rows.length) {
			const s = section(root, "Apps", `${plural(apps.length, "App", "Apps")} · ${plural(rows.filter((r) => r.h).length, "Hostname", "Hostnamen")}`);
			const cols: Column<Row>[] = [
				{ key: "app", label: "App", render: (td, r) => nameCell(td, r.e, env), sort: (r) => r.e.res.name ?? "" },
				{
					key: "host",
					label: "Hostname",
					cls: "hv-nowrap",
					render: (td, r) => {
						if (!r.h) return void el(td, "span", { cls: "hv-faint", text: "kein Hostname" });
						const a = el(td, "a", {
							cls: "hv-host-name hv-mono",
							attr: { href: `https://${r.h.name}${r.h.path ?? ""}`, target: "_blank", rel: "noopener noreferrer" },
						});
						txt(a, r.h.name);
						if (r.h.path) el(a, "span", { cls: "hv-host-path", text: r.h.path });
					},
					sort: (r) => (r.h ? r.h.name.split(".").reverse().join(".") + (r.h.path ?? "") : ""),
				},
				{
					key: "entry",
					label: "Eingang",
					render: (td, r) => {
						if (!r.h) return;
						const wrap = el(td, "div", "hv-host-badges");
						entryBadge(wrap, r.h.entry, r.h.cloudflare, env, true);
					},
					sort: (r) => (r.h?.entry ? `${Object.keys(ENTRY_LABEL).indexOf(r.h.entry)}${r.h.cloudflare ? "1" : "0"}` : ""),
				},
				{
					key: "target",
					label: "Ziel",
					cls: "hv-nowrap",
					render: (td, r) => {
						if (r.h?.target) copyable(td, r.h.target, env);
						else el(td, "span", { cls: "hv-faint", text: "–" });
					},
					sort: (r) => addressSortKey(r.h?.target),
				},
				{
					key: "traefik",
					label: "Traefik",
					cls: "hv-nowrap",
					render: (td, r) => {
						if (r.h?.traefik) el(td, "span", { cls: "hv-traefik", text: r.h.traefik === "cluster" ? "Cluster" : r.h.traefik });
						else el(td, "span", { cls: "hv-faint", text: "–" });
					},
					sort: (r) => r.h?.traefik ?? "",
				},
				{
					key: "runs",
					label: "Läuft auf",
					cls: "hv-nowrap",
					render: (td, r) => {
						const runs = r.e.res.runsOn ?? [];
						if (!runs.length) return void el(td, "span", { cls: "hv-faint", text: "–" });
						runs.forEach((m, i) => {
							if (i > 0) txt(td, ", ");
							refOrText(td, index, env, m, r.e.res.runsOnCluster ? ["cluster"] : ["machine", "device", "cluster"]);
						});
					},
					sort: (r) => (r.e.res.runsOn ?? []).join(", "),
				},
			];
			sortableTable(s, rows, cols, state, "sortApps", {
				tableClass: "hv-app-table",
				initial: { key: "app", dir: 1 },
				rowClass: (r) => (errorCount(r.e.issues) ? "has-errors" : ""),
				tiebreak: (r) => (r.h ? r.h.name : ""),
			});
		}
	}

	if (opts.show.includes("subnets")) {
		const subnets = entries.filter((e) => e.res.kind === "subnet");
		if (subnets.length) {
			const s = section(root, "Subnetze", subnets.length);
			const cols: Column<NetworkEntry>[] = [
				{ key: "name", label: "Name", render: (td, e) => nameCell(td, e, env), sort: (e) => e.res.name ?? "" },
				{
					key: "network",
					label: "Netz",
					cls: "hv-nowrap",
					render: (td, e) => {
						if (e.res.network) copyable(td, e.res.network, env);
					},
					sort: (e) => addressSortKey(e.res.network?.split("/")[0]),
				},
				{
					key: "vlan",
					label: "VLAN",
					cls: "hv-num",
					render: (td, e) => {
						td.textContent = e.res.vlan === null ? "ohne Tag" : e.res.vlan === undefined ? "–" : String(e.res.vlan);
					},
					sort: (e) => (e.res.vlan === null ? 0 : e.res.vlan),
				},
				{ key: "medium", label: "Medium", render: (td, e) => void (td.textContent = e.res.medium ?? "–"), sort: (e) => e.res.medium ?? "" },
				{
					key: "role",
					label: "Rolle",
					render: (td, e) => {
						if (!e.res.role) return void el(td, "span", { cls: "hv-faint", text: "–" });
						txt(td, ROLE_LABEL[e.res.role] ?? e.res.role);
						if (NO_CARD_ROLES.includes(e.res.role)) el(td, "div", { cls: "hv-faint", text: "keine eigene Karte" });
					},
					sort: (e) => e.res.role ?? "",
				},
			];
			sortableTable(s, subnets, cols, state, "sortSubnets", { initial: { key: "network", dir: 1 }, tableClass: "hv-subnet-table" });
		}
	}

	if (opts.show.includes("zigbee")) {
		const nodes = entries.filter((e) => e.res.kind === "zigbee");
		if (nodes.length) {
			const s = section(root, "Zigbee", nodes.length);
			const rank = (r?: string) => (r === "coordinator" ? 0 : r === "router" ? 1 : 2);
			const cols: Column<NetworkEntry>[] = [
				{ key: "name", label: "Name", render: (td, e) => nameCell(td, e, env), sort: (e) => e.res.name ?? "" },
				{
					key: "role",
					label: "Rolle",
					render: (td, e) => {
						if (!e.res.zigbeeRole) return void el(td, "span", { cls: "hv-faint", text: "–" });
						el(td, "span", { cls: `hv-badge hv-badge-zigbee is-${e.res.zigbeeRole}`, text: ZIGBEE_ROLE_LABEL[e.res.zigbeeRole] ?? e.res.zigbeeRole });
					},
					sort: (e) => rank(e.res.zigbeeRole),
				},
				{ key: "room", label: "Raum", render: (td, e) => void (td.textContent = e.res.room ?? "–"), sort: (e) => e.res.room ?? "" },
				{
					key: "ieee",
					label: "IEEE",
					cls: "hv-nowrap",
					render: (td, e) => {
						if (e.res.ieee) copyable(td, e.res.ieee, env);
					},
					sort: (e) => e.res.ieee ?? "",
				},
				{
					key: "coordinator",
					label: "Koordinator",
					render: (td, e) => {
						if (e.res.coordinator) refOrText(td, index, env, e.res.coordinator, ["device", "machine"]);
					},
					sort: (e) => e.res.coordinator ?? "",
				},
			];
			sortableTable(s, nodes, cols, state, "sortZigbee", { initial: { key: "name", dir: 1 }, tableClass: "hv-zigbee-table" });
		}
	}

	if (!root.querySelector(".hv-subsection")) emptyState(root, "Keine passenden Einträge.");
	problemsSection(
		root,
		entries.map((e) => ({ note: e.note, field: e.field, issues: e.issues, label: e.res.name })),
		env,
	);
}
