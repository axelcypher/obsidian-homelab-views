---
network-flow:
  - schema: 4
    kind: device
    name: beispiel-switch
    type: switch
    addresses:
      - ip: 10.40.0.99
        subnet: beryllium
    macs: ["00:1a:2b:00:99:10"]
    rack:
      name: Beispielrack
      position: 9
      units: 1
    web-interface: 10.40.0.99:80
    front:
      - [g1, g2, g3, g4, null, g5, g6, g7, g8, null, sfp1]
    back:
      - [power]
    port-types: {sfp1: sfp, power: inlet}
    ports:
      - {port: g1, pvid: 1, vlans: {untagged: [1], tagged: [5, 8]}}
      - {port: g8, pvid: 8, vlans: {untagged: [8], tagged: []}}
    connections:
      - port: g1
        to: "beispiel-fw:igb0"
        kind: copper
      - port: g8
        to: "beispiel-ap:eth0"
        kind: copper
  - schema: 2
    kind: rack
    name: Beispielrack
    units: 12
    site: Beispielstandort
    shelves:
      - position: 3
        units: 1
---
# Beispiel-Switch

Erfundene Beispieldaten für die Homelab Views.
