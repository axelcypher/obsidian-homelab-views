---
network-flow:
  schema: 1
  kind: app
  name: beispiel-komodo
  runs-on: [beispiel-vm]
  hostnames:
    - name: komodo.beispiel.invalid
      entry: beide
      cloudflare: true
      target: 10.8.0.15:443
      traefik: traefik-01
  ports:
    - port: 9120
      protocol: tcp
      purpose: Komodo Core API
backup:
  schema: 1
  id: beispiel-komodo-core-db
  system: dumps
  what: Core-Datenbank (Komodo „Backup Core Database“)
  engine: mongo
  format: archive
  source: {files: "10.2.0.5:/volume1/backup/komodo", pattern: "*.gz"}
  schedule: {times: ["02:00"]}
  tz: UTC
  grace: 1h
  retention: {max-age: 14d}
---
# Beispiel-Komodo

Erfundene Beispieldaten (Zeitplan in UTC) für die Homelab Views.
