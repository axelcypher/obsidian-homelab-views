/**
 * Frontmatter key `network-flow`, schema 1, 2 and 3
 * (vault: homelab-docs/projects/network-flow/Frontmatter für den Doku-Zustand.md).
 * Schema 3 (network-flow #113): `role` at subnets, `home` and `interfaces` at machines
 * and devices, `addresses[].iface`, `ports` (VLANs of switch ports) at devices.
 */
import { Checker, Issue, Raw, blocksOf, isObject, show } from "./check";
import { MAC, isCidr, isHostname, isIPv4, isIPv6, parseHostPort } from "./ip";

export const NETWORK_KINDS = ["app", "machine", "device", "cluster", "subnet", "site", "rack"] as const;
export type NetworkKind = (typeof NETWORK_KINDS)[number];

export const ENTRIES = ["internet", "intern", "beide"] as const;
export const MACHINE_TYPES = ["vm", "lxc", "host"] as const;
export const DEVICE_TYPES = ["switch", "access-point", "router", "nas", "ups", "other"] as const;
export const CONNECTION_KINDS = ["copper", "fibre", "usb", "power", "wifi", "virtual", "vpn"] as const;
export const MEDIA = ["LAN", "WLAN", "WireGuard"] as const;
export const PROTOCOLS = ["tcp", "udp"] as const;
export const SUBNET_ROLES = ["management", "admin", "server", "iot", "clients", "guest", "development", "gameserver", "storage", "vpn"] as const;
/** Roles whose subnets get no card of their own (Netzwerk-Grundregeln R2). */
export const NO_CARD_ROLES: readonly string[] = ["management", "storage"];

export interface Address {
	ip: string;
	subnet?: string;
	mac?: string;
	/** schema 3: name of the network card in the guest/OS, e.g. enp0s18 */
	iface?: string;
}

/** schema 3: a network card, also one without an IP */
export interface Interface {
	name: string;
	mac?: string;
	subnet?: string;
	/** `undefined`: not documented; `null`: untagged */
	vlan?: number | null;
}

/** schema 3: VLANs of a switch port */
export interface SwitchPort {
	port: string;
	pvid?: number;
	untagged?: number[];
	tagged?: number[];
}

export interface Hostname {
	name: string;
	/** internet | intern | beide; kept even when invalid so it can be shown */
	entry?: string;
	cloudflare?: boolean;
	target?: string;
	traefik?: string;
	path?: string;
}

export interface Port {
	port: number;
	protocol?: string;
	purpose?: string;
}

export interface Connection {
	port?: string;
	to?: string;
	kind?: string;
}

export interface RackPlace {
	name: string;
	position?: number;
	shelf?: number;
	units?: number;
	side?: string;
}

export interface LbIp {
	ip: string;
	services?: string[];
}

export interface Shelf {
	position: number;
	units: number;
}

export interface NetworkResource {
	schema?: number;
	kind?: NetworkKind;
	name?: string;
	// app
	runsOn?: string[];
	/** `runs-on` was given as a single cluster name */
	runsOnCluster?: boolean;
	hostnames?: Hostname[];
	ports?: Port[];
	// machine, device
	type?: string;
	host?: string;
	cluster?: string;
	addresses?: Address[];
	interfaces?: Interface[];
	home?: string;
	switchPorts?: SwitchPort[];
	macs?: string[];
	webInterface?: string;
	rack?: RackPlace;
	connections?: Connection[];
	// cluster
	machines?: string[];
	lbIps?: LbIp[];
	// subnet
	network?: string;
	/** `undefined`: not documented; `null`: untagged */
	vlan?: number | null;
	medium?: string;
	role?: string;
	// site
	subnet?: string;
	// rack
	units?: number;
	site?: string;
	shelves?: Shelf[];
}

export interface ParsedResource {
	index: number;
	field: string;
	res: NetworkResource;
	issues: Issue[];
}

const KIND_KEYS: Record<NetworkKind, readonly string[]> = {
	app: ["runs-on", "hostnames", "ports"],
	machine: ["type", "host", "cluster", "addresses", "interfaces", "home", "web-interface", "rack", "connections"],
	device: ["type", "addresses", "interfaces", "home", "macs", "ports", "rack", "web-interface", "connections"],
	cluster: ["machines", "lb-ips"],
	subnet: ["network", "vlan", "medium", "role"],
	site: ["subnet"],
	rack: ["units", "site", "shelves"],
};
const BASE_KEYS = ["schema", "kind", "name"];
/** Keys that only exist from schema 3 on, per kind. */
const SCHEMA3_KEYS: Partial<Record<NetworkKind, readonly string[]>> = {
	machine: ["interfaces", "home"],
	device: ["interfaces", "home", "ports"],
	subnet: ["role"],
};
const HOST_PORT_MSG = "erwartet adresse:port, z. B. 10.20.0.50:443 (IPv6 in eckigen Klammern)";

export function parseNetwork(value: unknown): ParsedResource[] {
	return blocksOf(value, "network-flow").map(({ raw, field, index }) => {
		const issues: Issue[] = [];
		const res = validateResource(raw, new Checker(issues, field));
		return { index, field, res, issues };
	});
}

export function validateResource(raw: unknown, c: Checker): NetworkResource {
	if (!isObject(raw)) {
		c.error("", `ein Block muss ein Objekt sein, ist ${show(raw)}`);
		return {};
	}
	const res: NetworkResource = {};

	let schema = 0;
	if (raw.schema === undefined || raw.schema === null) c.missing("schema");
	else if (raw.schema === 1 || raw.schema === 2 || raw.schema === 3) schema = res.schema = raw.schema;
	else if (typeof raw.schema === "number") c.error("schema", `Version ${raw.schema} ist unbekannt (bekannt: 1, 2, 3)`);
	else c.wrongType("schema", "die Zahl 1, 2 oder 3", raw.schema);

	const kind = c.str(raw, "kind", { required: true, oneOf: NETWORK_KINDS });
	let known: NetworkKind | undefined;
	if (kind && (NETWORK_KINDS as readonly string[]).includes(kind)) {
		known = kind as NetworkKind;
		if (known === "rack" && schema === 1) c.error("kind", "die Art rack gibt es erst ab schema: 2");
		res.kind = known;
	}
	res.name = c.str(raw, "name", { required: true });

	if (!known) {
		// Without a known kind, only report keys that no kind knows.
		c.unknownKeys(raw, [...BASE_KEYS, ...Object.values(KIND_KEYS).flat()]);
		return res;
	}

	const hints: Record<string, string> = {};
	if (schema === 1 && known === "machine") hints.rack = "rack an einer Maschine gibt es erst ab schema: 2";
	const only3 = schema !== 0 && schema < 3 ? SCHEMA3_KEYS[known] ?? [] : [];
	for (const key of only3) hints[key] = `${key} gibt es erst ab schema: 3`;
	for (const [k, keys] of Object.entries(KIND_KEYS)) {
		if (k === known) continue;
		for (const key of keys) if (!KIND_KEYS[known].includes(key)) hints[key] ??= `gehört nicht zu kind: ${known}`;
	}
	const allowed = [...BASE_KEYS, ...KIND_KEYS[known]].filter(
		(k) => !(schema === 1 && known === "machine" && k === "rack") && !only3.includes(k),
	);
	c.unknownKeys(raw, allowed, hints);

	switch (known) {
		case "app":
			validateApp(raw, c, res, schema);
			break;
		case "machine":
			res.type = c.str(raw, "type", { required: true, oneOf: MACHINE_TYPES });
			res.host = c.str(raw, "host");
			res.cluster = c.str(raw, "cluster");
			res.addresses = addresses(raw, c, schema);
			if (schema >= 3) {
				res.interfaces = interfaces(raw, c);
				res.home = c.str(raw, "home");
			}
			res.webInterface = hostPort(raw, "web-interface", c);
			if (schema >= 2) res.rack = rackPlace(raw, c, schema);
			res.connections = connections(raw, c);
			break;
		case "device":
			res.type = c.str(raw, "type", { required: true, oneOf: DEVICE_TYPES });
			res.addresses = addresses(raw, c, schema);
			if (schema >= 3) {
				res.interfaces = interfaces(raw, c);
				res.home = c.str(raw, "home");
				res.switchPorts = switchPorts(raw, c);
			}
			res.macs = c.strList(raw, "macs", { pattern: MAC, patternMsg: "keine MAC-Adresse (aa:bb:cc:dd:ee:ff)" });
			res.rack = rackPlace(raw, c, schema);
			res.webInterface = hostPort(raw, "web-interface", c);
			res.connections = connections(raw, c);
			break;
		case "cluster":
			res.machines = c.strList(raw, "machines", { required: true, nonEmpty: true });
			res.lbIps = lbIps(raw, c);
			break;
		case "subnet": {
			res.network = c.str(raw, "network", { required: true });
			if (res.network && !isCidr(res.network)) {
				c.error("network", `${show(res.network)} ist kein IPv4-Netz in CIDR (z. B. 10.20.0.0/16)`);
				res.network = undefined;
			}
			if ("vlan" in raw) {
				if (raw.vlan === null) res.vlan = null;
				else res.vlan = c.int(raw, "vlan", { min: 1, max: 4094 });
			}
			res.medium = c.str(raw, "medium", { oneOf: MEDIA });
			if (schema >= 3) res.role = c.str(raw, "role", { oneOf: SUBNET_ROLES });
			break;
		}
		case "site":
			res.subnet = c.str(raw, "subnet");
			break;
		case "rack": {
			res.units = c.int(raw, "units", { required: true, min: 1, max: 48 });
			res.site = c.str(raw, "site");
			const shelves = c.list(raw, "shelves");
			if (shelves) {
				res.shelves = [];
				shelves.forEach((s, i) => {
					const sc = c.child(`shelves[${i}]`);
					if (!isObject(s)) return sc.wrongType("", "ein Objekt", s);
					sc.unknownKeys(s, ["position", "units"]);
					const position = sc.int(s, "position", { required: true, min: 1, max: 48 });
					const units = sc.int(s, "units", { required: true, min: 1, max: 48 });
					if (position !== undefined && units !== undefined) {
						if (res.units !== undefined && position + units - 1 > res.units)
							sc.error("", `reicht über die Höhe des Racks hinaus (HE ${position + units - 1} > ${res.units})`);
						res.shelves?.push({ position, units });
					}
				});
			}
			break;
		}
	}
	return res;
}

function validateApp(raw: Raw, c: Checker, res: NetworkResource, schema: number): void {
	const runsOn = raw["runs-on"];
	if (runsOn === undefined || runsOn === null) c.missing("runs-on");
	else if (typeof runsOn === "string") {
		if (runsOn.trim()) {
			res.runsOn = [runsOn];
			res.runsOnCluster = true;
		} else c.error("runs-on", "darf nicht leer sein");
	} else res.runsOn = c.strList(raw, "runs-on", { nonEmpty: true });

	const hostnames = c.list(raw, "hostnames");
	if (hostnames) {
		res.hostnames = [];
		hostnames.forEach((h, i) => {
			const hc = c.child(`hostnames[${i}]`);
			if (!isObject(h)) return hc.wrongType("", "ein Objekt", h);
			const allowed = ["name", "entry", "cloudflare", "target", "traefik", "path"];
			hc.unknownKeys(h, schema === 1 ? allowed.filter((k) => k !== "path") : allowed, {
				path: "path gibt es erst ab schema: 2",
			});
			const name = hc.str(h, "name", { required: true });
			if (name && !isHostname(name)) hc.error("name", `${show(name)} ist kein gültiger Hostname`);
			const entry = hc.str(h, "entry", { required: true, oneOf: ENTRIES });
			const cloudflare = hc.bool(h, "cloudflare");
			if (cloudflare === true && entry === "intern") hc.error("cloudflare", "nur bei entry internet oder beide");
			const target = hostPort(h, "target", hc, true);
			const traefik = hc.str(h, "traefik");
			let path: string | undefined;
			if (schema >= 2) {
				path = hc.str(h, "path");
				if (path !== undefined && (!path.startsWith("/") || (path.length > 1 && path.endsWith("/")))) {
					hc.error("path", `${show(path)}: beginnt mit /, endet nicht mit / (z. B. /figures)`);
					path = undefined;
				}
			}
			if (name) res.hostnames?.push({ name, entry, cloudflare, target, traefik, path });
		});
	}

	const ports = c.list(raw, "ports");
	if (ports) {
		res.ports = [];
		ports.forEach((p, i) => {
			const pc = c.child(`ports[${i}]`);
			if (!isObject(p)) return pc.wrongType("", "ein Objekt", p);
			pc.unknownKeys(p, ["port", "protocol", "purpose"]);
			const port = pc.int(p, "port", { required: true, min: 1, max: 65535 });
			const protocol = pc.str(p, "protocol", { required: true, oneOf: PROTOCOLS });
			const purpose = pc.str(p, "purpose");
			if (port !== undefined) res.ports?.push({ port, protocol, purpose });
		});
	}
}

function hostPort(obj: Raw, key: string, c: Checker, required = false): string | undefined {
	const v = c.str(obj, key, { required });
	if (v === undefined) return undefined;
	if (!parseHostPort(v)) c.error(key, `${show(v)}: ${HOST_PORT_MSG}`);
	return v;
}

function addresses(raw: Raw, c: Checker, schema: number): Address[] | undefined {
	const list = c.list(raw, "addresses");
	if (!list) return undefined;
	const out: Address[] = [];
	list.forEach((a, i) => {
		const ac = c.child(`addresses[${i}]`);
		if (!isObject(a)) return ac.wrongType("", "ein Objekt", a);
		ac.unknownKeys(a, schema >= 3 ? ["ip", "subnet", "mac", "iface"] : ["ip", "subnet", "mac"], {
			iface: "iface gibt es erst ab schema: 3",
		});
		const ip = ac.str(a, "ip", { required: true });
		if (ip && !isIPv4(ip) && !isIPv6(ip)) ac.error("ip", `${show(ip)} ist keine IP-Adresse`);
		const subnet = ac.str(a, "subnet", { required: true });
		const mac = ac.str(a, "mac", { pattern: MAC, patternMsg: "keine MAC-Adresse (aa:bb:cc:dd:ee:ff)" });
		const iface = schema >= 3 ? ac.str(a, "iface") : undefined;
		if (ip) out.push({ ip, subnet, mac, iface });
	});
	return out;
}

/** schema 3: network cards; each name once per machine or device. */
function interfaces(raw: Raw, c: Checker): Interface[] | undefined {
	const list = c.list(raw, "interfaces");
	if (!list) return undefined;
	const out: Interface[] = [];
	const seen = new Set<string>();
	list.forEach((x, i) => {
		const ic = c.child(`interfaces[${i}]`);
		if (!isObject(x)) return ic.wrongType("", "ein Objekt", x);
		ic.unknownKeys(x, ["name", "mac", "subnet", "vlan"]);
		const name = ic.str(x, "name", { required: true });
		const mac = ic.str(x, "mac", { pattern: MAC, patternMsg: "keine MAC-Adresse (aa:bb:cc:dd:ee:ff)" });
		const subnet = ic.str(x, "subnet");
		let vlan: number | null | undefined;
		if ("vlan" in x) vlan = x.vlan === null ? null : ic.int(x, "vlan", { min: 1, max: 4094 });
		if (!name) return;
		if (seen.has(name)) ic.error("name", `Karte ${show(name)} steht doppelt`);
		else {
			seen.add(name);
			out.push({ name, mac, subnet, vlan });
		}
	});
	return out;
}

/** schema 3: VLANs of switch ports; each port once, each VLAN at most once per port. */
function switchPorts(raw: Raw, c: Checker): SwitchPort[] | undefined {
	const list = c.list(raw, "ports");
	if (!list) return undefined;
	const out: SwitchPort[] = [];
	const seen = new Set<string>();
	list.forEach((x, i) => {
		const pc = c.child(`ports[${i}]`);
		if (!isObject(x)) return pc.wrongType("", "ein Objekt", x);
		pc.unknownKeys(x, ["port", "pvid", "vlans"]);
		let port: string | undefined;
		if (x.port === undefined || x.port === null) pc.missing("port");
		else if (typeof x.port === "string" || typeof x.port === "number") port = String(x.port);
		else pc.wrongType("port", "Text oder Zahl", x.port);
		const pvid = pc.int(x, "pvid", { min: 1, max: 4094 });
		let untagged: number[] | undefined;
		let tagged: number[] | undefined;
		const v = pc.obj(x, "vlans");
		if (v) {
			const vc = pc.child("vlans");
			vc.unknownKeys(v, ["untagged", "tagged"]);
			const seenVlan = new Map<number, string>();
			const read = (key: "untagged" | "tagged"): number[] | undefined => {
				const items = vc.list(v, key);
				if (!items) return undefined;
				const ids: number[] = [];
				items.forEach((id, k) => {
					if (typeof id !== "number" || !Number.isInteger(id) || id < 1 || id > 4094) {
						vc.wrongType(`${key}[${k}]`, "eine VLAN-ID von 1 bis 4094", id);
						return;
					}
					const before = seenVlan.get(id);
					if (before) {
						vc.error(`${key}[${k}]`, before === key ? `VLAN ${id} steht doppelt` : `VLAN ${id} steht schon in ${before}`);
						return;
					}
					seenVlan.set(id, key);
					ids.push(id);
				});
				return ids;
			};
			untagged = read("untagged");
			tagged = read("tagged");
		}
		if (!port) return;
		if (seen.has(port)) pc.error("port", `Port ${show(port)} steht doppelt`);
		else {
			seen.add(port);
			out.push({ port, pvid, untagged, tagged });
		}
	});
	return out;
}

function connections(raw: Raw, c: Checker): Connection[] | undefined {
	const list = c.list(raw, "connections");
	if (!list) return undefined;
	const out: Connection[] = [];
	list.forEach((x, i) => {
		const cc = c.child(`connections[${i}]`);
		if (!isObject(x)) return cc.wrongType("", "ein Objekt", x);
		cc.unknownKeys(x, ["port", "to", "kind"]);
		let port: string | undefined;
		if (x.port === undefined || x.port === null) cc.missing("port");
		else if (typeof x.port === "string" || typeof x.port === "number") port = String(x.port);
		else cc.wrongType("port", "Text oder Zahl", x.port);
		const to = cc.str(x, "to", { required: true });
		const kind = cc.str(x, "kind", { required: true, oneOf: CONNECTION_KINDS });
		if (to && kind !== "vpn" && !to.includes(":")) cc.error("to", `${show(to)}: erwartet name:port der Gegenstelle`);
		out.push({ port, to, kind });
	});
	return out;
}

function lbIps(raw: Raw, c: Checker): LbIp[] | undefined {
	const list = c.list(raw, "lb-ips");
	if (!list) return undefined;
	const out: LbIp[] = [];
	list.forEach((x, i) => {
		const lc = c.child(`lb-ips[${i}]`);
		if (!isObject(x)) return lc.wrongType("", "ein Objekt", x);
		lc.unknownKeys(x, ["ip", "services"]);
		const ip = lc.str(x, "ip", { required: true });
		if (ip && !isIPv4(ip) && !isIPv6(ip)) lc.error("ip", `${show(ip)} ist keine IP-Adresse`);
		let services: string[] | undefined;
		if (typeof x.services === "string") services = [x.services];
		else if (x.services !== undefined) services = lc.strList(x, "services");
		if (ip) out.push({ ip, services });
	});
	return out;
}

function rackPlace(raw: Raw, c: Checker, schema: number): RackPlace | undefined {
	const v = raw.rack;
	if (v === undefined) return undefined;
	if (typeof v === "string") {
		if (!v.trim()) {
			c.error("rack", "darf nicht leer sein");
			return undefined;
		}
		return { name: v };
	}
	if (!isObject(v)) {
		c.wrongType("rack", schema >= 2 ? "ein Name oder ein Objekt" : "der Name des Racks", v);
		return undefined;
	}
	if (schema < 2) {
		c.error("rack", "rack als Objekt (mit Platz) gibt es erst ab schema: 2; mit schema: 1 nur den Namen");
		return undefined;
	}
	const rc = c.child("rack");
	rc.unknownKeys(v, ["name", "position", "shelf", "units", "side"]);
	const name = rc.str(v, "name", { required: true });
	const position = rc.int(v, "position", { min: 1, max: 48 });
	const shelf = rc.int(v, "shelf", { min: 1, max: 48 });
	const units = rc.int(v, "units", { min: 1, max: 48 });
	const side = rc.str(v, "side", { oneOf: ["front", "back"] });
	if (v.position !== undefined && v.shelf !== undefined) rc.error("", "position und shelf schließen sich aus");
	if (v.position === undefined && v.shelf === undefined) {
		if (v.units !== undefined) rc.error("units", "nur zusammen mit position oder shelf");
		if (v.side !== undefined) rc.error("side", "nur zusammen mit position oder shelf");
	}
	if (position !== undefined && position + (units ?? 1) - 1 > 48)
		rc.error("", `reicht über HE 48 hinaus (position + units − 1 = ${position + (units ?? 1) - 1})`);
	return name ? { name, position, shelf, units, side } : undefined;
}
