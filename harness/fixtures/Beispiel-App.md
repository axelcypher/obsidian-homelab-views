---
network-flow:
  - schema: 1
    kind: app
    name: beispiel-app
    runs-on: [beispiel-vm]
    hostnames:
      - name: beispiel.k8s.example.invalid
        entry: intern
        target: 10.20.0.99:443
        traefik: traefik-02
backup:
  - schema: 1
    id: beispiel-app-dump
    system: dumps
    engine: postgres
    format: dump
    source: {restic: "10.50.0.101:/backup/docker/dumps/99", host: docker-99, tag: dumps, path: /dumps/beispiel-app}
    schedule: {times: ["07:15", "13:15", "19:15", "23:15"]}
    tz: Europe/Berlin
    grace: 1h
    retention: {keep-last: 4, keep-daily: 7, keep-weekly: 4}
  - schema: 1
    id: beispiel-app-dump-nas
    system: dumps
    copy-of: beispiel-app-dump
    engine: postgres
    format: dump
    source: {files: "10.30.0.5:/volume1/backup/database/docker-99/beispiel-app", pattern: "*/*.gz"}
    schedule: {weekdays: [sun], times: ["23:15"]}
    tz: Europe/Berlin
    grace: 2h
    retention: {keep-weekly: 3, keep-monthly: 3}
---
# Beispiel-App

Erfundene Beispieldaten für [[Beispiel Dataview]] und [[Beispiel Bases]].
