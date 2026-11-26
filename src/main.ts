import { Keymap, MarkdownRenderChild, Plugin, TFile, debounce, parseYaml, setIcon } from "obsidian";
import { HomelabStore } from "./store";
import { CardInjector } from "./inject";
import { DEFAULT_SETTINGS, HomelabViewsSettingTab, HomelabViewsSettings } from "./settings";
import { NoteRef, inFolder, isPrivatePath, noteRef } from "./model/index";
import { clear, el } from "./render/dom";
import type { RenderEnv, ViewState } from "./render/env";
import { optionNotice } from "./render/common";
import { backupsOptions, cardOptions, networkOptions, scheduleOptions } from "./render/options";
import { renderBackups } from "./render/backups";
import { renderSchedule } from "./render/schedule";
import { renderNetwork } from "./render/network";
import { renderNoteCard } from "./render/card";

const HOVER_SOURCE = "axlc-homelab-views";

const ICON_FALLBACK: Record<string, string> = {
	"alert-triangle": "triangle-alert",
	check: "check-check",
	"app-window": "app-window-mac",
};

export const BLOCKS = ["homelab-backups", "homelab-schedule", "homelab-network", "homelab-card"] as const;
type BlockKind = (typeof BLOCKS)[number];

export default class HomelabViewsPlugin extends Plugin {
	settings!: HomelabViewsSettings;
	store!: HomelabStore;
	private injector!: CardInjector;
	private scheduleCards = debounce(() => this.injector.refreshAll(), 80, true);
	private resolvedOnce = false;

	async onload() {
		await this.loadSettings();
		this.store = new HomelabStore(this.app, () => this.settings.rootFolder);
		this.injector = new CardInjector(this);
		this.addSettingTab(new HomelabViewsSettingTab(this.app, this));
		this.registerHoverLinkSource(HOVER_SOURCE, { display: "Homelab Views", defaultMod: true });

		for (const kind of BLOCKS) {
			this.registerMarkdownCodeBlockProcessor(kind, (source, el, ctx) => {
				ctx.addChild(new HomelabBlock(this, el, kind, source, ctx.sourcePath));
			});
		}

		// Reading view re-renders can drop the card from the header; put it back.
		this.registerMarkdownPostProcessor((_el, ctx) => {
			if (ctx.frontmatter) this.scheduleCards();
		});

		const { metadataCache, vault, workspace } = this.app;
		this.registerEvent(
			metadataCache.on("changed", (file, data) => {
				this.injector.noteContent(file.path, data);
				this.store.fileChanged(file);
				this.scheduleCards();
			}),
		);
		this.registerEvent(
			metadataCache.on("resolved", () => {
				// The first full resolution after start: views rendered before the cache was ready refresh once.
				if (!this.resolvedOnce) {
					this.resolvedOnce = true;
					this.store.invalidate();
				}
				this.scheduleCards();
			}),
		);
		this.registerEvent(vault.on("delete", (file) => this.store.fileRemoved(file.path)));
		this.registerEvent(
			vault.on("rename", (file, oldPath) => {
				this.store.fileRemoved(oldPath);
				if (file instanceof TFile) this.store.fileChanged(file);
			}),
		);
		this.registerEvent(this.store.on("changed", () => this.scheduleCards()));
		this.registerEvent(workspace.on("layout-change", () => this.scheduleCards()));
		this.registerEvent(workspace.on("active-leaf-change", () => this.scheduleCards()));
		this.registerEvent(workspace.on("file-open", () => this.scheduleCards()));
		// "Next run" moves on: refresh the cards once a minute (code blocks refresh themselves).
		this.registerInterval(window.setInterval(() => this.injector.refreshAll(), 60_000));
		workspace.onLayoutReady(() => this.injector.refreshAll());

		this.addCommand({
			id: "toggle-note-card",
			name: "Kartenansicht in Notizen ein- oder ausschalten",
			callback: async () => {
				this.settings.autoCard = !this.settings.autoCard;
				await this.saveSettings();
			},
		});
	}

	onunload() {
		this.injector.removeAll();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.store.invalidate();
		this.injector.refreshAll();
	}

	/** Render environment for views shown in note `sourcePath`. */
	env(sourcePath: string): RenderEnv {
		const { workspace, metadataCache } = this.app;
		const hoverParent = { hoverPopover: null };
		const open = (target: NoteRef, e: MouseEvent) => {
			e.preventDefault();
			void workspace.openLinkText(target.path, sourcePath, Keymap.isModEvent(e));
		};
		const hover = (target: NoteRef, targetEl: HTMLElement, event: MouseEvent) =>
			workspace.trigger("hover-link", { event, source: HOVER_SOURCE, hoverParent, targetEl, linktext: target.path, sourcePath });
		return {
			now: Date.now(),
			displayTz: this.settings.displayTz,
			link: (parent, target, text, cls) => {
				const a = el(parent, "a", {
					cls: `hv-link ${cls ?? ""}`.trim(),
					text: text ?? target.name,
					attr: { href: target.path, "data-href": target.path },
				});
				a.addEventListener("click", (e) => open(target, e));
				a.addEventListener("mouseover", (e) => hover(target, a, e));
				return a;
			},
			bindOpen: (elm, target) => {
				elm.classList.add("is-clickable");
				elm.addEventListener("click", (e) => open(target, e));
				elm.addEventListener("mouseover", (e) => hover(target, elm, e));
			},
			icon: (parent, name) => {
				setIcon(parent, name);
				// Lucide renamed some icons; fall back to the new name if the old one is unknown.
				if (!parent.querySelector("svg") && ICON_FALLBACK[name]) setIcon(parent, ICON_FALLBACK[name]);
			},
			copy: (text) => navigator.clipboard.writeText(text),
			resolveName: (name) => {
				const file = metadataCache.getFirstLinkpathDest(name, sourcePath);
				return file && !isPrivatePath(file.path) ? noteRef(file.path) : undefined;
			},
		};
	}

	renderBlock(kind: BlockKind, source: string, container: HTMLElement, sourcePath: string, state: ViewState): void {
		let raw: unknown = null;
		try {
			raw = source.trim() ? parseYaml(source) : null;
		} catch (e) {
			const box = el(container, "div", "hv-root hv-notice is-error");
			box.textContent = `Die Optionen im Block sind kein gültiges YAML: ${(e as Error).message}`;
			return;
		}
		const env = this.env(sourcePath);
		const store = this.store;

		if (kind === "homelab-card") {
			const { opts, problems } = cardOptions(raw);
			optionNotice(container, problems, env);
			let path = sourcePath;
			if (opts.note) {
				const file = this.app.metadataCache.getFirstLinkpathDest(opts.note, sourcePath);
				if (!file) return void el(container, "div", { cls: "hv-root hv-empty", text: `Notiz „${opts.note}“ nicht gefunden.` });
				path = file.path;
			}
			if (isPrivatePath(path)) return void el(container, "div", { cls: "hv-root hv-empty", text: "Private Notizen werden nicht gelesen." });
			const index = store.indexForNote(path);
			const data = index.byNote.get(path);
			if (!data) {
				el(container, "div", { cls: "hv-root hv-empty", text: `Keine backup- oder network-flow-Daten in „${noteRef(path).name}“.` });
				return;
			}
			renderNoteCard(container, { note: noteRef(path), ...data }, index, env, opts);
			return;
		}

		if (kind === "homelab-network") {
			const { opts, problems } = networkOptions(raw);
			optionNotice(container, problems, env);
			const index = store.index(store.baseFolder(opts.path));
			const entries = index.network.filter((e) => !opts.path || inFolder(e.note.path, opts.path));
			renderNetwork(container, entries, index, env, opts, state);
			return;
		}

		const backupsIn = (path: string | undefined) =>
			store.index(store.baseFolder(path)).backups.filter((e) => !path || inFolder(e.note.path, path));
		if (kind === "homelab-backups") {
			const { opts, problems } = backupsOptions(raw);
			optionNotice(container, problems, env);
			renderBackups(container, backupsIn(opts.path), env, opts, state);
		} else {
			const { opts, problems } = scheduleOptions(raw);
			optionNotice(container, problems, env);
			renderSchedule(container, backupsIn(opts.path), env, opts, state);
		}
	}
}

/** One rendered code block; re-renders on frontmatter changes and once a minute. */
class HomelabBlock extends MarkdownRenderChild {
	private state: ViewState = {};

	constructor(
		private plugin: HomelabViewsPlugin,
		containerEl: HTMLElement,
		private kind: BlockKind,
		private source: string,
		private sourcePath: string,
	) {
		super(containerEl);
	}

	onload() {
		this.render();
		this.registerEvent(this.plugin.store.on("changed", () => this.render()));
		this.registerInterval(window.setInterval(() => this.render(), 60_000));
	}

	private render() {
		const c = this.containerEl;
		// Keep open problem lists and horizontal scroll positions across re-renders.
		const open = Array.from(c.querySelectorAll("details")).map((d) => d.open);
		const scroll = Array.from(c.querySelectorAll<HTMLElement>(".hv-table-wrap, .hv-tl-scroll")).map((s) => s.scrollLeft);
		clear(c);
		try {
			this.plugin.renderBlock(this.kind, this.source, c, this.sourcePath, this.state);
		} catch (e) {
			console.error("[Homelab Views] rendering failed", e);
			el(c, "div", { cls: "hv-root hv-notice is-error", text: `Darstellung fehlgeschlagen: ${(e as Error).message}` });
		}
		c.querySelectorAll("details").forEach((d, i) => {
			if (open[i]) d.open = true;
		});
		c.querySelectorAll<HTMLElement>(".hv-table-wrap, .hv-tl-scroll").forEach((s, i) => {
			if (scroll[i]) s.scrollLeft = scroll[i];
		});
	}
}
