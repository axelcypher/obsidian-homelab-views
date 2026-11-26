/**
 * Minimal DOM builder on standard APIs (no innerHTML), so the renderers run in
 * Obsidian (also in pop-out windows) and in the plain-browser test harness.
 */

export interface ElOpts {
	cls?: string;
	text?: string;
	title?: string;
	attr?: Record<string, string>;
}

export function el<K extends keyof HTMLElementTagNameMap>(
	parent: Node,
	tag: K,
	opts?: ElOpts | string,
): HTMLElementTagNameMap[K] {
	const doc = parent.ownerDocument ?? (parent as Document);
	const e = doc.createElement(tag);
	if (typeof opts === "string") e.className = opts;
	else if (opts) {
		if (opts.cls) e.className = opts.cls;
		if (opts.text !== undefined) e.textContent = opts.text;
		if (opts.title) e.title = opts.title;
		if (opts.attr) for (const [k, v] of Object.entries(opts.attr)) e.setAttribute(k, v);
	}
	parent.appendChild(e);
	return e;
}

export function txt(parent: Node, s: string): Text {
	const doc = parent.ownerDocument ?? (parent as Document);
	const t = doc.createTextNode(s);
	parent.appendChild(t);
	return t;
}

export function clear(e: Element): void {
	while (e.firstChild) e.removeChild(e.firstChild);
}

/** Text with break opportunities (<wbr>) after the given characters, e.g. "/" in paths. */
export function breakable(parent: Node, s: string, after: RegExp): void {
	const parts = s.split(after).filter((p) => p !== "");
	parts.forEach((p, i) => {
		if (i > 0) el(parent, "wbr");
		txt(parent, p);
	});
}

/** Joins items with a separator element, e.g. " · ". */
export function joined<T>(parent: HTMLElement, items: T[], render: (item: T) => void, sep = " · "): void {
	items.forEach((item, i) => {
		if (i > 0) el(parent, "span", { cls: "hv-sep", text: sep });
		render(item);
	});
}
