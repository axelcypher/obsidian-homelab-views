/**
 * Reads frontmatter from Obsidian's metadata cache (never the files), builds
 * the index lazily and tells the views when homelab frontmatter changed.
 */
import { App, Events, TFile, debounce } from "obsidian";
import {
	BACKUP_KEY,
	HomelabIndex,
	NETWORK_KEY,
	TASKS_KEY,
	NoteRecord,
	buildIndex,
	hasHomelabData,
	inFolder,
	isPrivatePath,
} from "./model/index";

export function parentFolder(path: string): string {
	return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
}

export class HomelabStore extends Events {
	/** Increases with every change, so cached renderings know when to refresh. */
	version = 0;
	private cache = new Map<string, HomelabIndex>();
	/** Last seen homelab frontmatter per path, to ignore edits that do not touch it. */
	private signatures = new Map<string, string>();
	private notify = debounce(() => this.trigger("changed"), 250, true);

	constructor(
		private app: App,
		private root: () => string,
	) {
		super();
	}

	static signature(fm: Record<string, unknown> | null | undefined): string {
		if (!hasHomelabData(fm) || !fm) return "";
		return JSON.stringify([fm[BACKUP_KEY] ?? null, fm[NETWORK_KEY] ?? null, fm[TASKS_KEY] ?? null]);
	}

	frontmatter(file: TFile): Record<string, unknown> | undefined {
		return this.app.metadataCache.getFileCache(file)?.frontmatter;
	}

	private records(folder: string): NoteRecord[] {
		const out: NoteRecord[] = [];
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (!inFolder(file.path, folder) || isPrivatePath(file.path)) continue;
			const fm = this.frontmatter(file);
			if (hasHomelabData(fm)) out.push({ path: file.path, frontmatter: fm });
		}
		return out;
	}

	/** Index of all notes in `folder` (default: the root folder from the settings). */
	index(folder = this.root()): HomelabIndex {
		const key = `f:${folder}`;
		let idx = this.cache.get(key);
		if (!idx) {
			idx = buildIndex(this.records(folder));
			this.cache.set(key, idx);
			for (const e of [...idx.backups, ...idx.network, ...idx.tasks]) {
				const file = this.app.vault.getAbstractFileByPath(e.note.path);
				if (file instanceof TFile) this.signatures.set(file.path, HomelabStore.signature(this.frontmatter(file)));
			}
		}
		return idx;
	}

	/**
	 * Index for the card of one note: the root folder plus the note's own folder,
	 * so notes outside the root (e.g. examples) still resolve their neighbours.
	 */
	indexForNote(path: string): HomelabIndex {
		const root = this.root();
		if (inFolder(path, root)) return this.index(root);
		const parent = parentFolder(path);
		const key = `n:${root}|${parent}`;
		let idx = this.cache.get(key);
		if (!idx) {
			const seen = new Set<string>();
			const records = [...this.records(root), ...this.records(parent)].filter((r) => {
				if (seen.has(r.path)) return false;
				seen.add(r.path);
				return true;
			});
			// Only direct siblings of the note's folder, not the whole subtree
			idx = buildIndex(records.filter((r) => inFolder(r.path, root) || parentFolder(r.path) === parent));
			this.cache.set(key, idx);
		}
		return idx;
	}

	/** Folder of the index for a view with an optional `path` option. */
	baseFolder(path: string | undefined): string {
		const root = this.root();
		if (!path) return root;
		return inFolder(path, root) ? root : path;
	}

	/** Called on metadata changes; returns true when homelab frontmatter of the file changed. */
	fileChanged(file: TFile): boolean {
		if (isPrivatePath(file.path)) return false;
		const sig = HomelabStore.signature(this.frontmatter(file));
		const before = this.signatures.get(file.path) ?? "";
		if (sig === before) return false;
		if (sig) this.signatures.set(file.path, sig);
		else this.signatures.delete(file.path);
		this.invalidate();
		return true;
	}

	fileRemoved(path: string): void {
		if (this.signatures.delete(path)) this.invalidate();
	}

	invalidate(): void {
		this.version++;
		this.cache.clear();
		this.notify();
	}
}
