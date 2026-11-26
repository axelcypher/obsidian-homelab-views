/** German labels and colour assignment for the UI. */
import type { BackupSystem, RetentionCount } from "../model/backup";

export const SYSTEM_LABEL: Record<BackupSystem, string> = {
	pbs: "PBS",
	"pbs-vm": "PBS-VM",
	restic: "restic",
	dumps: "Dumps",
	longhorn: "Longhorn",
	homeassistant: "Home Assistant",
	opnsense: "OPNsense",
};

/** Obsidian colour variable per system (`--color-<name>`), used only as a calm tint. */
export const SYSTEM_COLOR: Record<BackupSystem, string> = {
	pbs: "blue",
	"pbs-vm": "cyan",
	restic: "green",
	dumps: "purple",
	longhorn: "orange",
	homeassistant: "yellow",
	opnsense: "red",
};

export const JOB_LABEL: Record<string, string> = {
	prune: "Prune",
	verify: "Verify",
	gc: "GC",
	sync: "Sync",
};

export const RETENTION_LABEL: Record<RetentionCount, string> = {
	"keep-last": "letzte",
	"keep-hourly": "stündlich",
	"keep-daily": "täglich",
	"keep-weekly": "wöchentlich",
	"keep-monthly": "monatlich",
	"keep-yearly": "jährlich",
};

export const SOURCE_LABEL: Record<string, string> = {
	pbs: "PBS",
	restic: "restic",
	files: "Dateien",
	longhorn: "Longhorn",
	"pbs-datastore": "PBS-Datastore",
};

export const KIND_LABEL: Record<string, string> = {
	app: "App",
	machine: "Maschine",
	device: "Gerät",
	cluster: "Cluster",
	subnet: "Subnetz",
	site: "Standort",
	rack: "Rack",
};

export const KIND_ICON: Record<string, string> = {
	app: "app-window",
	machine: "server",
	device: "hard-drive",
	cluster: "layers",
	subnet: "network",
	site: "map-pin",
	rack: "server",
};

export const TYPE_LABEL: Record<string, string> = {
	vm: "VM",
	lxc: "LXC",
	host: "Host",
	switch: "Switch",
	"access-point": "Access Point",
	router: "Router",
	nas: "NAS",
	ups: "USV",
	other: "Sonstiges",
};

export const ENTRY_LABEL: Record<string, string> = {
	internet: "Internet",
	intern: "Intern",
	beide: "Internet + intern",
};

export const CONNECTION_LABEL: Record<string, string> = {
	copper: "Kupfer",
	fibre: "Glasfaser",
	usb: "USB",
	power: "Strom",
	wifi: "WLAN",
	virtual: "virtuell",
	vpn: "VPN",
};

export function plural(n: number, one: string, many: string): string {
	return `${n} ${n === 1 ? one : many}`;
}
