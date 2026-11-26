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
tasks:
  - schema: 1
    id: beispiel-cluster-image-cleanup
    what: Alte Container-Images auf den Nodes löschen
    kind: cleanup
    runner: {k3s: kube-system/image-cleanup}
    schedule: {times: ["03:30"]}
    tz: Europe/Berlin
    duration: 20m
  - schema: 1
    id: beispiel-cluster-cert-check
    what: Zertifikate prüfen
    kind: check
    runner: {app: cert-manager}
    schedule: {every: 12h}
    tz: UTC
---
# Beispiel-Cluster

Erfundene Beispieldaten für die Homelab Views.
