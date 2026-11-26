---
network-flow:
  schema: 1
  kind: machine
  name: beispiel-vm
  type: vm
  host: pve-01
  addresses:
    - ip: 10.20.0.99
      subnet: lan
      mac: bc:24:11:dc:99:08
    - ip: 10.50.0.99
      subnet: backup
      mac: bc:24:11:dc:99:05
backup:
  - schema: 1
    id: beispiel-vm-pbs
    system: pbs
    what: Systemplatte
    source: {pbs: vm/9999}
    schedule: {weekdays: [wed], times: ["03:00"]}
    tz: Europe/Berlin
    grace: 3h
    retention: {keep-weekly: 8, keep-monthly: 6}
  - schema: 1
    id: beispiel-vm-restic
    system: restic
    what: /data (persistent, db, bulk)
    source: {restic: "10.50.0.101:/backup/docker/bind/99"}
    schedule: {times: ["02:30"]}
    tz: Europe/Berlin
    grace: 3h
    retention: {keep-daily: 14, keep-weekly: 8, keep-monthly: 6}
  - schema: 1
    id: beispiel-vm-restic-prune
    type: job
    system: restic
    job: prune
    on: {restic: "10.50.0.101:/backup/docker/bind/99"}
    schedule: {weekdays: [sun], times: ["02:30"]}
    tz: Europe/Berlin
  - schema: 1
    id: beispiel-vm-dumps-sync
    type: job
    system: dumps
    job: sync
    what: Komodo-Prozedur db-dumps-sync
    on: {restic: "10.50.0.101:/backup/docker/dumps/99"}
    schedule: {times: ["07:40", "13:40", "19:40", "23:40"]}
    tz: Europe/Berlin
---
# Beispiel-VM

Erfundene Beispieldaten für [[Beispiel Dataview]] und [[Beispiel Bases]]. Liegt bewusst außerhalb von
`homelab-docs/docs/`, damit backup-ui und network-flow diese Werte nicht einlesen.
