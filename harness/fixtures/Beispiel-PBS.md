---
network-flow:
  schema: 1
  kind: machine
  name: beispiel-pbs
  type: vm
  host: pve-01
  addresses:
    - ip: 10.50.0.98
      subnet: backup
      mac: bc:24:11:dc:98:05
  web-interface: 10.50.0.98:8007
backup:
  - schema: 1
    id: beispiel-pbs-vzdump
    system: pbs-vm
    what: Systemplatte (VM 998)
    format: vma
    source: {files: "10.30.0.5:/volume1/backup/dump", pattern: "vzdump-qemu-998-*.vma.zst"}
    schedule: {weekdays: [sun], times: ["01:00"]}
    tz: Europe/Berlin
    grace: 2h
    retention: {keep-last: 3, keep-weekly: 1, keep-monthly: 1}
  - schema: 1
    id: beispiel-pbs-gc
    type: job
    system: pbs
    job: gc
    on: {pbs-datastore: pbs}
    schedule: {times: ["00:00"]}
    tz: Europe/Berlin
  - schema: 1
    id: beispiel-pbs-prune
    type: job
    system: pbs
    job: prune
    on: {pbs-datastore: pbs}
    schedule: {times: ["21:30"]}
    tz: Europe/Berlin
    retention: {keep-daily: 7, keep-weekly: 8, keep-monthly: 6}
  - schema: 1
    id: beispiel-pbs-verify
    type: job
    system: pbs
    job: verify
    on: {pbs-datastore: pbs}
    schedule: {weekdays: [sat], times: ["05:00"]}
    tz: Europe/Berlin
    grace: 2h
---
# Beispiel-PBS

Erfundene Beispieldaten für die Homelab Views.
