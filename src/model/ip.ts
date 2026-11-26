/** IPv4 parsing and numeric sorting helpers. */

const collator = new Intl.Collator("de", { numeric: true, sensitivity: "base" });

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function parseIPv4(s: string): number | null {
	const m = IPV4.exec(s.trim());
	if (!m) return null;
	let n = 0;
	for (let i = 1; i <= 4; i++) {
		const octet = parseInt(m[i], 10);
		if (octet > 255 || (m[i].length > 1 && m[i].startsWith("0"))) return null;
		n = n * 256 + octet;
	}
	return n;
}

export function isIPv4(s: string): boolean {
	return parseIPv4(s) !== null;
}

/** Loose IPv6 check (hex groups with optional `::`). */
export function isIPv6(s: string): boolean {
	if (!/^[0-9a-fA-F:.]+$/.test(s) || !s.includes(":")) return false;
	const doubles = s.split("::").length - 1;
	if (doubles > 1) return false;
	const groups = s.split(":").filter((g) => g !== "");
	return groups.every((g) => /^[0-9a-fA-F]{1,4}$/.test(g) || isIPv4(g)) && (doubles === 1 || groups.length >= 7);
}

export function isCidr(s: string): boolean {
	const m = /^(.+)\/(\d{1,2})$/.exec(s);
	return !!m && isIPv4(m[1]) && parseInt(m[2], 10) <= 32;
}

const HOSTNAME = /^(?=.{1,253}$)([a-zA-Z0-9_](?:[a-zA-Z0-9_-]{0,61}[a-zA-Z0-9])?)(\.[a-zA-Z0-9_](?:[a-zA-Z0-9_-]{0,61}[a-zA-Z0-9])?)*\.?$/;

export function isHostname(s: string): boolean {
	return HOSTNAME.test(s);
}

/** Parses `adresse:port` with an IPv4 address, DNS name or IPv6 in brackets. */
export function parseHostPort(s: string): { host: string; port: number } | null {
	let host: string;
	let port: string;
	if (s.startsWith("[")) {
		const m = /^\[([^\]]+)\]:(\d+)$/.exec(s);
		if (!m || !isIPv6(m[1])) return null;
		host = m[1];
		port = m[2];
	} else {
		const i = s.lastIndexOf(":");
		if (i <= 0) return null;
		host = s.slice(0, i);
		port = s.slice(i + 1);
		if (!/^\d+$/.test(port)) return null;
		if (!isIPv4(host) && !isHostname(host)) return null;
	}
	const p = parseInt(port, 10);
	if (p < 1 || p > 65535) return null;
	return { host, port: p };
}

export const MAC = /^[0-9a-fA-F]{2}(?::[0-9a-fA-F]{2}){5}$/;

/**
 * Sort key for addresses: IPv4 numerically first, then everything else by text.
 * Returns a tuple compared element-wise by {@link compareKeys}.
 */
export function addressSortKey(s: string | undefined): (string | number)[] {
	if (!s) return [2, ""];
	const hp = parseHostPort(s);
	const host = hp ? hp.host : s;
	const n = parseIPv4(host);
	if (n !== null) return [0, n, hp?.port ?? 0];
	return [1, host.toLowerCase(), hp?.port ?? 0];
}

export type SortKey = string | number | (string | number)[] | undefined | null;

export function isEmptyKey(k: SortKey): boolean {
	return k === undefined || k === null || k === "";
}

/** Compares sort keys: numbers numerically, strings with German collation, tuples element-wise, empty last. */
export function compareKeys(a: SortKey, b: SortKey): number {
	const emptyA = isEmptyKey(a);
	const emptyB = isEmptyKey(b);
	if (emptyA || emptyB) return emptyA === emptyB ? 0 : emptyA ? 1 : -1;
	if (Array.isArray(a) && Array.isArray(b)) {
		for (let i = 0; i < Math.max(a.length, b.length); i++) {
			const c = compareKeys(a[i], b[i]);
			if (c) return c;
		}
		return 0;
	}
	if (typeof a === "number" && typeof b === "number") return a - b;
	return collator.compare(String(a), String(b));
}
