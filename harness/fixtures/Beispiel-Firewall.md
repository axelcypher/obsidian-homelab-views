---
network-flow:
  - schema: 1
    kind: machine
    name: beispiel-fw
    type: vm
    host: pve-01
    addresses:
      - ip: 10.20.0.1
        subnet: lan
        mac: f6:f6:b0:00:99:01
      - ip: 10.50.0.1
        subnet: backup
        mac: f6:f6:b0:00:99:01
      - ip: 10.10.0.1
        subnet: beispiel-wg
    web-interface: 10.20.0.1:8443
  - schema: 1
    kind: subnet
    name: lan
    network: 10.20.0.0/16
    vlan: 8
    medium: LAN
  - schema: 1
    kind: subnet
    name: backup
    network: 10.50.0.0/24
    vlan: 5
    medium: LAN
  - schema: 1
    kind: subnet
    name: beispiel-wg
    network: 10.10.0.0/24
    vlan: null
    medium: WireGuard
  - schema: 1
    kind: site
    name: Beispielstandort
    subnet: beispiel-wg
backup:
  schema: 1
  id: beispiel-fw-config
  system: opnsense
  what: Konfiguration (config.xml)
  source: {files: "10.30.0.5:/volume1/backup/opnsense", pattern: "config-*.xml"}
  schedule: {times: ["04:00"]}
  tz: Europe/Berlin
  grace: 1h
  retention: {max-age: 30d}
---
# Beispiel-Firewall

Erfundene Beispieldaten für die Homelab Views.
