import { App, PluginSettingTab, Setting } from "obsidian";
import { isValidTimeZone } from "./schedule/time";
import type HomelabViewsPlugin from "./main";

export interface HomelabViewsSettings {
	rootFolder: string;
	autoCard: boolean;
	cardPosition: "top" | "bottom";
	displayTz: string;
}

export const DEFAULT_SETTINGS: HomelabViewsSettings = {
	rootFolder: "homelab-docs/docs",
	autoCard: true,
	cardPosition: "top",
	displayTz: "Europe/Berlin",
};

export class HomelabViewsSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: HomelabViewsPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		const s = this.plugin.settings;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Wurzelordner")
			.setDesc(
				"Notizen in diesem Ordner (mit Unterordnern) bilden die zentralen Ansichten. Ordner namens _privat und _private werden nie gelesen.",
			)
			.addText((t) =>
				t
					.setPlaceholder(DEFAULT_SETTINGS.rootFolder)
					.setValue(s.rootFolder)
					.onChange(async (v) => {
						s.rootFolder = v.trim().replace(/^\/+|\/+$/g, "");
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Kartenansicht in der Notiz")
			.setDesc("Zeigt in jeder Notiz mit backup- oder network-flow-Frontmatter automatisch die Karten, in der Lese- und Live-Preview-Ansicht.")
			.addToggle((t) =>
				t.setValue(s.autoCard).onChange(async (v) => {
					s.autoCard = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Position der Karten")
			.addDropdown((d) =>
				d
					.addOption("top", "oben, unter den Eigenschaften")
					.addOption("bottom", "unten, am Ende der Notiz")
					.setValue(s.cardPosition)
					.onChange(async (v) => {
						s.cardPosition = v === "bottom" ? "bottom" : "top";
						await this.plugin.saveSettings();
					}),
			);

		const tzSetting = new Setting(containerEl)
			.setName("Zeitzone für die Anzeige")
			.setDesc("IANA-Name, z. B. Europe/Berlin. Nächste Läufe und der Wochenplan werden in dieser Zeitzone gezeigt.");
		tzSetting.addText((t) =>
			t
				.setPlaceholder(DEFAULT_SETTINGS.displayTz)
				.setValue(s.displayTz)
				.onChange(async (v) => {
					const tz = v.trim();
					const ok = isValidTimeZone(tz);
					t.inputEl.toggleClass("hv-invalid", !ok);
					tzSetting.descEl.setText(
						ok
							? "IANA-Name, z. B. Europe/Berlin. Nächste Läufe und der Wochenplan werden in dieser Zeitzone gezeigt."
							: `„${tz}“ ist keine bekannte IANA-Zeitzone; es bleibt ${s.displayTz}.`,
					);
					if (!ok) return;
					s.displayTz = tz;
					await this.plugin.saveSettings();
				}),
		);
	}
}
