---
network-flow:
  - schema: 1
    kind: app
    name: beispiel-gameserver
    runs-on: [beispiel-vm]
    hostnames:
      - name: spiel.example.invalid
        entry: internet
        target: 10.90.0.99:25565
backup:
  - schema: 1
    id: beispiel-gameserver-welt
    system: restic
    what: Welt (konsistent, save-off)
    source: {restic: "10.50.0.101:/backup/docker/minecraft/beispiel"}
    schedule: {every: 6h}
    tz: Europe/Berlin
    grace: 1h
    retention: {keep-last: 4, keep-daily: 7, keep-weekly: 4, keep-monthly: 3}
---
# Beispiel-Gameserver

Erfundene Beispieldaten (Zeitplan als Intervall) für [[Beispiel Dataview]] und [[Beispiel Bases]].
