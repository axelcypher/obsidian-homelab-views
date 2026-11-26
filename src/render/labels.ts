/** German labels and colour assignment for the UI. */
import type { BackupSystem, RetentionCount } from "../model/backup";
import type { TaskKind, TaskRunnerKind } from "../model/tasks";

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

/** Who starts a task; the four kinds stay apart in every view. */
export const RUNNER_LABEL: Record<TaskRunnerKind, string> = {
	cron: "Host-Cron",
	k3s: "k3s-CronJob",
	komodo: "Komodo",
	app: "App-intern",
};

export const RUNNER_HINT: Record<TaskRunnerKind, string> = {
	cron: "Crontab auf einem Host (Proxmox-Node, VM, Bare Metal)",
	k3s: "CronJob im k3s-Cluster",
	komodo: "Zeitplan einer Komodo-Prozedur oder -Aktion",
	app: "eigener Zeitplan der App",
};

export const RUNNER_ICON: Record<TaskRunnerKind, string> = {
	cron: "terminal",
	k3s: "boxes",
	komodo: "workflow",
	app: "app-window",
};

export const TASK_KIND_LABEL: Record<TaskKind, string> = {
	reboot: "Neustart",
	update: "Update",
	cleanup: "Aufräumen",
	check: "Prüfung",
	maintenance: "Wartung",
	other: "Sonstiges",
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
