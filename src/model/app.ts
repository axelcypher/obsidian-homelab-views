/**
 * Frontmatter key `app`, schema 1: the profile of an app ("App-Steckbrief")
 * (vault: homelab-docs/projects/homelab-views/Frontmatter für App-Steckbriefe.md).
 *
 * It holds the facts every app note used to repeat by hand: what the app is for,
 * where and how it is deployed, the versions in use and whether updates are due,
 * the Vault paths it reads (and whether they belong to another app), its data
 * paths and databases, and links. Hostnames, ports and backups stay under
 * `network-flow` and `backup`.
 */
import { Checker, Issue, Raw, blocksOf, isObject, show } from "./check";

export const APP_PLATFORMS = ["k3s", "docker", "ha-addon", "host"] as const;
export type AppPlatform = (typeof APP_PLATFORMS)[number];

export const APP_STATUSES = ["running", "stopped", "planned", "retired"] as const;
export const UPDATE_TYPES = ["none", "patch", "minor", "major"] as const;
export const DEPLOY_KINDS = ["argocd", "komodo", "addon", "manual"] as const;
export type DeployKind = (typeof DEPLOY_KINDS)[number];
export const DB_ENGINES = ["postgres", "mariadb", "mysql", "mongo", "sqlite", "redis", "valkey", "other"] as const;
export const VERSION_KINDS = ["image", "chart", "package", "other"] as const;

export interface AppVersion {
	name: string;
	version: string;
	kind?: string;
	latest?: string;
	update?: string;
	source?: string;
}

export interface AppSecret {
	path: string;
	keys?: string[];
	/** the app the path belongs to, when this app only shares it */
	from?: string;
}

export interface AppStorage {
	path: string;
	what?: string;
}

export interface AppDatabase {
	engine: string;
	name?: string;
}

export interface AppLink {
	url: string;
	title?: string;
}

export interface AppBlock {
	schema?: number;
	name?: string;
	what?: string;
	platform?: AppPlatform;
	status?: string;
	deploy?: { kind: DeployKind; value: string };
	repo?: string;
	namespace?: string;
	versions?: AppVersion[];
	/** YYYY-MM-DD: when `versions[].latest` was last checked */
	checked?: string;
	secrets?: AppSecret[];
	storage?: AppStorage[];
	databases?: AppDatabase[];
	links?: AppLink[];
}

export interface ParsedApp {
	index: number;
	field: string;
	block: AppBlock;
	issues: Issue[];
}

const APP_KEYS = [
	"schema", "name", "what", "platform", "status", "deploy", "repo", "namespace",
	"versions", "checked", "secrets", "storage", "databases", "links",
] as const;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Parses the value of the frontmatter key `app` (one object or a list of objects). */
export function parseApps(value: unknown): ParsedApp[] {
	return blocksOf(value, "app").map(({ raw, field, index }) => {
		const issues: Issue[] = [];
		const block = validateAppBlock(raw, new Checker(issues, field));
		return { index, field, block, issues };
	});
}

/** A version may be written as a number in YAML (`7.0`); keep the text the author meant. */
function versionText(c: Checker, obj: Raw, key: string, required = false): string | undefined {
	const v = obj[key];
	if (typeof v === "number") return String(v);
	return c.str(obj, key, { required });
}

/** js-yaml reads an unquoted YYYY-MM-DD as a Date; accept it like the quoted text. */
function dateText(c: Checker, obj: Raw, key: string): string | undefined {
	const v = obj[key];
	if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
	const raw = c.str(obj, key);
	if (raw === undefined) return undefined;
	// A date that went through JSON (or a full timestamp) counts by its day.
	const s = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z?$/.test(raw) ? raw.slice(0, 10) : raw;
	if (!DATE.test(s)) {
		c.error(key, `${show(s)}: erwartet ein Datum JJJJ-MM-TT`);
		return undefined;
	}
	return s;
}

export function validateAppBlock(raw: unknown, c: Checker): AppBlock {
	const block: AppBlock = {};
	if (!isObject(raw)) {
		c.error("", `ein Block muss ein Objekt sein, ist ${show(raw)}`);
		return block;
	}
	c.unknownKeys(raw, APP_KEYS, {
		hostnames: "Hostnamen stehen unter network-flow (kind: app)",
		ports: "Ports stehen unter network-flow (kind: app)",
		"runs-on": "wo die App läuft, steht unter network-flow (kind: app)",
		backup: "Sicherungen stehen unter dem Schlüssel backup",
		images: "Images und Charts stehen unter versions",
		env: "Umgebungsvariablen gehören in den Text der Notiz",
	});

	if (raw.schema === undefined || raw.schema === null) c.missing("schema");
	else if (raw.schema !== 1) {
		if (typeof raw.schema === "number") c.error("schema", `Version ${raw.schema} ist unbekannt (bekannt: 1)`);
		else c.wrongType("schema", "die Zahl 1", raw.schema);
	} else block.schema = 1;

	block.name = c.str(raw, "name", { required: true });
	block.what = c.str(raw, "what", { required: true });
	const platform = c.str(raw, "platform", { required: true, oneOf: APP_PLATFORMS });
	if (platform && (APP_PLATFORMS as readonly string[]).includes(platform)) block.platform = platform as AppPlatform;
	block.status = c.str(raw, "status", { oneOf: APP_STATUSES });

	const deploy = c.obj(raw, "deploy");
	if (deploy) {
		const dc = c.child("deploy");
		const present = DEPLOY_KINDS.filter((k) => deploy[k] !== undefined);
		if (present.length !== 1) {
			dc.error("", present.length ? `genau einer erlaubt, gefunden: ${present.join(", ")}` : `genau einer fehlt: ${DEPLOY_KINDS.join(", ")}`);
			dc.unknownKeys(deploy, DEPLOY_KINDS);
		} else {
			dc.unknownKeys(deploy, DEPLOY_KINDS);
			const value = dc.str(deploy, present[0], { required: true });
			if (value) block.deploy = { kind: present[0], value };
		}
	}

	block.repo = c.str(raw, "repo");
	if (block.repo && (block.repo.startsWith("/") || block.repo.includes("://"))) {
		c.error("repo", `${show(block.repo)}: erwartet einen Pfad im Repo gitops-homelab, z. B. apps/k3s/immich`);
		block.repo = undefined;
	}
	block.namespace = c.str(raw, "namespace");

	const versions = c.list(raw, "versions");
	if (versions) {
		block.versions = [];
		versions.forEach((v, i) => {
			const vc = c.child(`versions[${i}]`);
			if (!isObject(v)) return vc.wrongType("", "ein Objekt", v);
			vc.unknownKeys(v, ["name", "version", "kind", "latest", "update", "source"]);
			const name = vc.str(v, "name", { required: true });
			const version = versionText(vc, v, "version", true);
			const entry: AppVersion | undefined = name && version ? { name, version } : undefined;
			const kind = vc.str(v, "kind", { oneOf: VERSION_KINDS });
			const latest = versionText(vc, v, "latest");
			const update = vc.str(v, "update", { oneOf: UPDATE_TYPES });
			const source = vc.str(v, "source");
			if (!entry) return;
			if (kind) entry.kind = kind;
			if (latest) entry.latest = latest;
			if (update) entry.update = update;
			if (source) entry.source = source;
			if (update && update !== "none" && !latest) vc.warn("latest", "Update-Art ohne neueste Version");
			block.versions?.push(entry);
		});
	}
	block.checked = dateText(c, raw, "checked");
	if (block.versions?.some((v) => v.latest) && !block.checked) c.warn("checked", "fehlt: wann wurden die neuesten Versionen geprüft?");

	const secrets = c.list(raw, "secrets");
	if (secrets) {
		block.secrets = [];
		secrets.forEach((s, i) => {
			const sc = c.child(`secrets[${i}]`);
			if (!isObject(s)) return sc.wrongType("", "ein Objekt", s);
			sc.unknownKeys(s, ["path", "keys", "from"], { values: "Werte gehören nie in die Doku, nur die Namen unter keys" });
			const path = sc.str(s, "path", { required: true });
			if (path && /^kv\/data\//.test(path)) sc.warn("path", "ohne „data/“ schreiben, z. B. kv/docker-secrets/immich");
			const keys = sc.strList(s, "keys");
			const from = sc.str(s, "from");
			if (path) block.secrets?.push({ path, ...(keys?.length ? { keys } : {}), ...(from ? { from } : {}) });
		});
	}

	const storage = c.list(raw, "storage");
	if (storage) {
		block.storage = [];
		storage.forEach((s, i) => {
			const sc = c.child(`storage[${i}]`);
			if (typeof s === "string" && s.trim()) return void block.storage?.push({ path: s });
			if (!isObject(s)) return sc.wrongType("", "ein Pfad oder ein Objekt", s);
			sc.unknownKeys(s, ["path", "what"]);
			const path = sc.str(s, "path", { required: true });
			const what = sc.str(s, "what");
			if (path) block.storage?.push({ path, ...(what ? { what } : {}) });
		});
	}

	const databases = c.list(raw, "databases");
	if (databases) {
		block.databases = [];
		databases.forEach((d, i) => {
			const dc = c.child(`databases[${i}]`);
			if (!isObject(d)) return dc.wrongType("", "ein Objekt", d);
			dc.unknownKeys(d, ["engine", "name"]);
			const engine = dc.str(d, "engine", { required: true, oneOf: DB_ENGINES });
			const name = dc.str(d, "name");
			if (engine) block.databases?.push({ engine, ...(name ? { name } : {}) });
		});
	}

	const links = c.list(raw, "links");
	if (links) {
		block.links = [];
		links.forEach((l, i) => {
			const lc = c.child(`links[${i}]`);
			if (typeof l === "string" && /^https?:\/\//.test(l)) return void block.links?.push({ url: l });
			if (!isObject(l)) return lc.wrongType("", "eine URL oder ein Objekt", l);
			lc.unknownKeys(l, ["url", "title"]);
			const url = lc.str(l, "url", { required: true });
			const title = lc.str(l, "title");
			if (url && !/^https?:\/\//.test(url)) return lc.error("url", `${show(url)}: erwartet http(s)://…`);
			if (url) block.links?.push({ url, ...(title ? { title } : {}) });
		});
	}
	return block;
}

/** Number of components with a pending update (patch, minor or major). */
export function pendingUpdates(b: AppBlock): number {
	return (b.versions ?? []).filter((v) => v.update && v.update !== "none").length;
}

export const GITOPS_REPO_URL = "https://github.com/axelcypher/gitops-homelab/tree/main/";
