import type { NoteRef } from "../model/index";

/** What the renderers need from their host (Obsidian or the test harness). */
export interface RenderEnv {
	/** Current time (ms). */
	now: number;
	/** IANA zone in which times are shown. */
	displayTz: string;
	/** Creates a link to a note. */
	link(parent: HTMLElement, target: NoteRef, text?: string, cls?: string): HTMLElement;
	/** Makes an arbitrary element open a note on click. */
	bindOpen(el: HTMLElement, target: NoteRef): void;
	/** Renders a Lucide icon into `parent`. */
	icon(parent: HTMLElement, name: string): void;
	/** Copies text to the clipboard. */
	copy(text: string): Promise<void>;
	/** Finds the note documenting a machine, cluster or host by name (outside the index too). */
	resolveName?(name: string): NoteRef | undefined;
}

/** Per-view UI state (sorting, filters) that survives re-renders. */
export type ViewState = Record<string, unknown>;
