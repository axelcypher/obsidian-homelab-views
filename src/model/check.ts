/**
 * Small helpers for strict, schema-like validation of YAML frontmatter.
 * Every check records an {@link Issue} with the field path and a German reason.
 */

export type Severity = "error" | "warning";

export interface Issue {
	/** Field path inside the note's frontmatter, e.g. `backup[1].schedule.times[0]`. */
	field: string;
	message: string;
	severity: Severity;
}

export type Raw = Record<string, unknown>;

export function isObject(v: unknown): v is Raw {
	return typeof v === "object" && v !== null && !Array.isArray(v) && !(v instanceof Date);
}

/** German name of a YAML value's type, for error messages. */
export function typeName(v: unknown): string {
	if (v === null || v === undefined) return "leer";
	if (Array.isArray(v)) return "Liste";
	if (v instanceof Date) return "Datum";
	switch (typeof v) {
		case "string":
			return "Text";
		case "number":
			return Number.isInteger(v) ? "ganze Zahl" : "Zahl";
		case "boolean":
			return "Wahrheitswert";
		case "object":
			return "Objekt";
		default:
			return typeof v;
	}
}

/** Short display of a value inside a message: „07:15“, 435, [Liste]. */
export function show(v: unknown): string {
	if (typeof v === "string") return `„${v.length > 60 ? v.slice(0, 57) + "…" : v}“`;
	if (typeof v === "number" || typeof v === "boolean") return String(v);
	if (v === null || v === undefined) return "leer";
	return typeName(v);
}

/** Collects issues below a base path. */
export class Checker {
	constructor(
		readonly issues: Issue[],
		readonly base: string,
	) {}

	path(field: string): string {
		if (!field) return this.base;
		if (!this.base) return field;
		return field.startsWith("[") ? this.base + field : `${this.base}.${field}`;
	}

	child(field: string): Checker {
		return new Checker(this.issues, this.path(field));
	}

	error(field: string, message: string): void {
		this.issues.push({ field: this.path(field), message, severity: "error" });
	}

	warn(field: string, message: string): void {
		this.issues.push({ field: this.path(field), message, severity: "warning" });
	}

	missing(field: string, extra = ""): void {
		this.error(field, `Pflichtfeld fehlt${extra}`);
	}

	wrongType(field: string, expected: string, v: unknown): void {
		this.error(field, `muss ${expected} sein, ist ${typeName(v)} (${show(v)})`);
	}

	/** Reports every key of `obj` that is not allowed. `hints` replaces the default reason per key. */
	unknownKeys(obj: Raw, allowed: Iterable<string>, hints: Record<string, string> = {}): void {
		const set = new Set(allowed);
		for (const key of Object.keys(obj)) {
			if (set.has(key)) continue;
			this.error(key, hints[key] ?? "unbekanntes Feld");
		}
	}

	/** Reads an optional or required string. Enum values are returned even when invalid (for display). */
	str(
		obj: Raw,
		key: string,
		opts: { required?: boolean; oneOf?: readonly string[]; pattern?: RegExp; patternMsg?: string } = {},
	): string | undefined {
		const v = obj[key];
		if (v === undefined || v === null) {
			if (opts.required) this.missing(key);
			else if (v === null && key in obj) this.wrongType(key, "Text", v);
			return undefined;
		}
		if (typeof v !== "string") {
			this.wrongType(key, "Text", v);
			return undefined;
		}
		if (v.trim() === "") {
			this.error(key, "darf nicht leer sein");
			return undefined;
		}
		if (opts.oneOf && !opts.oneOf.includes(v)) {
			this.error(key, `${show(v)} ist nicht erlaubt; erlaubt: ${opts.oneOf.join(", ")}`);
			return v;
		}
		if (opts.pattern && !opts.pattern.test(v)) {
			this.error(key, `${show(v)}: ${opts.patternMsg ?? "ungültiges Format"}`);
			return v;
		}
		return v;
	}

	int(obj: Raw, key: string, opts: { required?: boolean; min?: number; max?: number } = {}): number | undefined {
		const v = obj[key];
		if (v === undefined || v === null) {
			if (opts.required) this.missing(key);
			else if (v === null && key in obj) this.wrongType(key, "eine ganze Zahl", v);
			return undefined;
		}
		if (typeof v !== "number" || !Number.isInteger(v)) {
			this.wrongType(key, "eine ganze Zahl", v);
			return undefined;
		}
		if (opts.min !== undefined && v < opts.min) {
			this.error(key, `${v} ist zu klein (mindestens ${opts.min})`);
			return undefined;
		}
		if (opts.max !== undefined && v > opts.max) {
			this.error(key, `${v} ist zu groß (höchstens ${opts.max})`);
			return undefined;
		}
		return v;
	}

	bool(obj: Raw, key: string): boolean | undefined {
		const v = obj[key];
		if (v === undefined) return undefined;
		if (typeof v !== "boolean") {
			this.wrongType(key, "true oder false", v);
			return undefined;
		}
		return v;
	}

	/** Reads an optional or required list; reports non-lists and (optionally) empty lists. */
	list(obj: Raw, key: string, opts: { required?: boolean; nonEmpty?: boolean } = {}): unknown[] | undefined {
		const v = obj[key];
		if (v === undefined || v === null) {
			if (opts.required) this.missing(key);
			else if (v === null && key in obj) this.wrongType(key, "eine Liste", v);
			return undefined;
		}
		if (!Array.isArray(v)) {
			this.wrongType(key, "eine Liste", v);
			return undefined;
		}
		if (opts.nonEmpty && v.length === 0) {
			this.error(key, "darf nicht leer sein");
			return undefined;
		}
		return v;
	}

	obj(obj: Raw, key: string, opts: { required?: boolean } = {}): Raw | undefined {
		const v = obj[key];
		if (v === undefined || v === null) {
			if (opts.required) this.missing(key);
			else if (v === null && key in obj) this.wrongType(key, "ein Objekt", v);
			return undefined;
		}
		if (!isObject(v)) {
			this.wrongType(key, "ein Objekt", v);
			return undefined;
		}
		return v;
	}

	/** A list of strings; invalid items are reported and skipped. */
	strList(
		obj: Raw,
		key: string,
		opts: { required?: boolean; nonEmpty?: boolean; oneOf?: readonly string[]; pattern?: RegExp; patternMsg?: string } = {},
	): string[] | undefined {
		const items = this.list(obj, key, opts);
		if (!items) return undefined;
		const out: string[] = [];
		items.forEach((item, i) => {
			const field = `${key}[${i}]`;
			if (typeof item !== "string" || item.trim() === "") {
				this.wrongType(field, "Text", item);
				return;
			}
			if (opts.oneOf && !opts.oneOf.includes(item)) {
				this.error(field, `${show(item)} ist nicht erlaubt; erlaubt: ${opts.oneOf.join(", ")}`);
				return;
			}
			if (opts.pattern && !opts.pattern.test(item)) {
				this.error(field, `${show(item)}: ${opts.patternMsg ?? "ungültiges Format"}`);
				return;
			}
			out.push(item);
		});
		return out;
	}
}

/** Normalises the value of a frontmatter key that may hold one block or a list of blocks. */
export function blocksOf(value: unknown, key: string): { raw: unknown; field: string; index: number }[] {
	if (value === undefined || value === null) return [];
	if (Array.isArray(value)) return value.map((raw, index) => ({ raw, field: `${key}[${index}]`, index }));
	return [{ raw: value, field: key, index: 0 }];
}
