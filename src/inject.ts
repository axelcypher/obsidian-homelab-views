/**
 * Places the note card above (or below) the note in reading view and in Live
 * Preview. The card lives outside the editor content (in `.cm-sizer` next to
 * the properties, and in the header of the reading view), so the editor never
 * sees it and nothing is written to the note.
 */
import { MarkdownView } from "obsidian";
import { hasHomelabData, isPrivatePath, noteRef } from "./model/index";
import { el } from "./render/dom";
import { renderNoteCard } from "./render/card";
import type HomelabViewsPlugin from "./main";

const CARD = "hv-auto-card";
type SlotName = "preview" | "editor";

interface Slot {
	parent: HTMLElement;
	/** Insert before this node (null = append). */
	before: Node | null;
	/** True when an existing card sits where it should. */
	placed(card: HTMLElement): boolean;
}

export class CardInjector {
	/** Notes that contain a `homelab-card` block themselves (then no automatic card). */
	private manual = new Map<string, boolean>();

	constructor(private plugin: HomelabViewsPlugin) {}

	noteContent(path: string, text: string): void {
		if (isPrivatePath(path)) return;
		this.manual.set(path, /^\s*(`{3,}|~{3,})\s*homelab-card\b/m.test(text));
	}

	refreshAll(): void {
		this.plugin.app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.view instanceof MarkdownView) this.refresh(leaf.view);
		});
	}

	removeAll(): void {
		this.plugin.app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.view instanceof MarkdownView) leaf.view.containerEl.querySelectorAll(`.${CARD}`).forEach((e) => e.remove());
		});
	}

	private slot(view: MarkdownView, name: SlotName, bottom: boolean): Slot | null {
		if (name === "preview") {
			const sizer = view.previewMode.containerEl.querySelector<HTMLElement>(".markdown-preview-sizer");
			if (!sizer) return null;
			const box = sizer.querySelector<HTMLElement>(`:scope > ${bottom ? ".mod-footer" : ".mod-header"}`);
			if (box) return { parent: box, before: bottom ? box.firstChild : null, placed: (c) => c.parentElement === box };
			return {
				parent: sizer,
				before: bottom ? null : sizer.firstChild,
				placed: (c) => c.parentElement === sizer && (bottom ? !c.nextElementSibling : !c.previousElementSibling),
			};
		}
		const source = view.containerEl.querySelector<HTMLElement>(".markdown-source-view");
		// Only Live Preview; in source mode the frontmatter is plain text and no card is shown.
		if (!source || !source.classList.contains("is-live-preview")) return null;
		const sizer = source.querySelector<HTMLElement>(".cm-sizer");
		const content = sizer?.querySelector<HTMLElement>(":scope > .cm-contentContainer");
		if (!sizer || !content) return null;
		return bottom
			? { parent: sizer, before: content.nextSibling, placed: (c) => c.previousElementSibling === content }
			: { parent: sizer, before: content, placed: (c) => c.nextElementSibling === content };
	}

	refresh(view: MarkdownView): void {
		const { settings, store } = this.plugin;
		const file = view.file;
		const fm = file ? store.frontmatter(file) : undefined;
		const want =
			!!file && settings.autoCard && !isPrivatePath(file.path) && hasHomelabData(fm) && this.manual.get(file.path) !== true;

		if (file && want && !this.manual.has(file.path)) {
			// Learn once whether the note has its own homelab-card block.
			const path = file.path;
			void this.plugin.app.vault.cachedRead(file).then((text) => {
				const before = this.manual.get(path);
				this.noteContent(path, text);
				if (this.manual.get(path) !== before && this.manual.get(path)) this.refresh(view);
			});
		}

		const bottom = settings.cardPosition === "bottom";
		const sig = file
			? JSON.stringify([
					file.path,
					store.version,
					Math.floor(Date.now() / 60_000),
					settings.displayTz,
					settings.cardPosition,
					fm?.backup ?? null,
					fm?.["network-flow"] ?? null,
				])
			: "";

		for (const name of ["preview", "editor"] as SlotName[]) {
			const existing = Array.from(view.containerEl.querySelectorAll<HTMLElement>(`.${CARD}[data-slot="${name}"]`));
			const current = want ? this.slot(view, name, bottom) : null;
			const keep = existing.find((c) => current && c.dataset.sig === sig && current.placed(c));
			for (const c of existing) if (c !== keep) c.remove();
			if (!current || keep || !file) continue;

			// Locate again: the removed card may have been the reference node.
			const slot = this.slot(view, name, bottom);
			if (!slot) continue;
			const host = el(slot.parent, "div", { cls: `${CARD} ${bottom ? "is-bottom" : "is-top"}`, attr: { "data-slot": name } });
			host.dataset.sig = sig;
			host.setAttribute("contenteditable", "false");
			// Keep the editor from moving the cursor or taking focus when the card is clicked.
			if (name === "editor") host.addEventListener("mousedown", (e) => e.stopPropagation());
			slot.parent.insertBefore(host, slot.before);
			const index = store.indexForNote(file.path);
			const data = index.byNote.get(file.path);
			if (!data) {
				host.remove();
				continue;
			}
			renderNoteCard(host, { note: noteRef(file.path), ...data }, index, this.plugin.env(file.path));
		}
	}
}
