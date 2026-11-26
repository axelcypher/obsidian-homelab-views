---
network-flow:
  - schema: 2
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
