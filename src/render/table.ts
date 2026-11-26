/** Sortable table: header buttons toggle the order; the state survives re-renders via ViewState. */
import { SortKey, compareKeys, isEmptyKey } from "../model/ip";
import { clear, el } from "./dom";
import type { ViewState } from "./env";
import { scrollWrap } from "./common";

export interface Column<R> {
	key: string;
	label: string;
	cls?: string;
	render(td: HTMLTableCellElement, row: R): void;
	/** Without `sort` the column is not sortable. */
	sort?: (row: R) => SortKey;
}

export interface SortState {
	key: string;
	dir: 1 | -1;
}

export function sortableTable<R>(
	parent: HTMLElement,
	rows: R[],
	columns: Column<R>[],
	state: ViewState,
	stateKey: string,
	opts: { initial: SortState; rowClass?: (row: R) => string; tiebreak?: (row: R) => SortKey; tableClass?: string },
): HTMLElement {
	const wrap = scrollWrap(parent);
	const table = el(wrap, "table", `hv-table has-sticky ${opts.tableClass ?? ""}`.trim());
	const headRow = el(el(table, "thead"), "tr");
	const tbody = el(table, "tbody");
	const current = (state[stateKey] as SortState | undefined) ?? opts.initial;

	const headers = new Map<string, HTMLTableCellElement>();
	for (const col of columns) {
		const th = el(headRow, "th", col.cls ?? "");
		headers.set(col.key, th);
		if (!col.sort) {
			th.textContent = col.label;
			continue;
		}
		const btn = el(th, "button", { cls: "hv-sort", attr: { type: "button" } });
		el(btn, "span", { text: col.label });
		el(btn, "span", { cls: "hv-sort-ind", attr: { "aria-hidden": "true" } });
		btn.addEventListener("click", () => {
			const s = (state[stateKey] as SortState | undefined) ?? opts.initial;
			state[stateKey] = s.key === col.key ? { key: col.key, dir: (s.dir * -1) as 1 | -1 } : { key: col.key, dir: 1 };
			fill();
		});
	}

	const fill = () => {
		const s = (state[stateKey] as SortState | undefined) ?? current;
		const col = columns.find((c) => c.key === s.key && c.sort) ?? columns.find((c) => c.key === opts.initial.key);
		for (const [key, th] of headers) {
			const active = col?.key === key;
			th.classList.toggle("is-sorted", active);
			if (active) th.setAttribute("aria-sort", s.dir === 1 ? "ascending" : "descending");
			else th.removeAttribute("aria-sort");
			const ind = th.querySelector(".hv-sort-ind");
			if (ind) ind.textContent = active ? (s.dir === 1 ? "↑" : "↓") : "";
		}
		const sorted = [...rows];
		if (col?.sort) {
			const keyOf = col.sort;
			sorted.sort((a, b) => {
				const ka = keyOf(a);
				const kb = keyOf(b);
				// Empty values stay at the end in both directions.
				if (isEmptyKey(ka) !== isEmptyKey(kb)) return isEmptyKey(ka) ? 1 : -1;
				const c = compareKeys(ka, kb);
				if (c) return c * s.dir;
				return opts.tiebreak ? compareKeys(opts.tiebreak(a), opts.tiebreak(b)) : 0;
			});
		}
		clear(tbody);
		for (const row of sorted) {
			const tr = el(tbody, "tr", opts.rowClass?.(row) ?? "");
			for (const c of columns) c.render(el(tr, "td", c.cls ?? ""), row);
		}
	};
	fill();
	return wrap;
}
