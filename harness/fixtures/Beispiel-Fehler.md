---
network-flow:
  schema: 1
  kind: app
  name: beispiel-fehler
  hostnames:
    - name: fehler.beispiel.invalid
      entry: extern
      target: 10.20.0.97
      path: /alt
backup:
  - schema: 1
    id: beispiel-fehler-dump
    system: dumps
    engine: postgres
    source: {restic: "10.50.0.101:/backup/docker/dumps/99", files: "10.30.0.5:/volume1/backup/x"}
    schedule: {times: ["7:15", "19:15"]}
    grace: 1 Stunde
    retension: {keep-daily: 7}
  - schema: 1
    id: beispiel-fehler-kopie
    system: dumps
    copy-of: beispiel-fehler-dumb
    source: {files: "10.30.0.5:/volume1/backup/database/fehler"}
    schedule: {weekdays: [sun], times: ["23:15"]}
    tz: Europe/Berlin
---
# Beispiel-Fehler

Erfundene, absichtlich fehlerhafte Beispieldaten: so zeigen die Homelab Views Validierungsfehler.
