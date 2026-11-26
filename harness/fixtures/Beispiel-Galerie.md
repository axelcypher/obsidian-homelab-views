---
network-flow:
  schema: 2
  kind: app
  name: beispiel-galerie
  runs-on: beispiel-cluster
  hostnames:
    - name: galerie.beispiel.invalid
      path: /galerie
      entry: internet
      cloudflare: true
      target: 10.8.0.95:443
      traefik: cluster
    - name: galerie.oxygen.beispiel.invalid
      entry: intern
      target: 10.8.0.95:443
      traefik: cluster
backup:
  - schema: 1
    id: beispiel-galerie-dump
    system: dumps
    engine: postgres
    format: dump
    source: {restic: "10.5.0.101:/backup/k3s/dumps", host: k3s, tag: beispiel-galerie}
    schedule: {times: ["07:15", "13:15", "19:15", "23:15"]}
    tz: Europe/Berlin
    grace: 1h
    retention: {keep-last: 4, keep-daily: 7, keep-weekly: 4}
---
# Beispiel-Galerie

Erfundene Beispieldaten (schema 2 mit Pfad, runs-on als Cluster) für die Homelab Views.
