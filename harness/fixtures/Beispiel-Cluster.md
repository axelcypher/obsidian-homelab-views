---
network-flow:
  schema: 1
  kind: cluster
  name: beispiel-cluster
  machines: [beispiel-node-01, beispiel-node-02, beispiel-node-03]
  lb-ips:
    - ip: 10.20.0.95
      services: [traefik]
    - ip: 10.20.0.96
backup:
  schema: 1
  id: beispiel-longhorn-daten
  system: longhorn
  what: Volume beispiel-daten
  source: {longhorn: beispiel/beispiel-daten}
  schedule: {times: ["01:00"]}
  tz: Europe/Berlin
  grace: 2h
  retention: {keep-daily: 7, keep-weekly: 4}
---
# Beispiel-Cluster

Erfundene Beispieldaten für die Homelab Views.
