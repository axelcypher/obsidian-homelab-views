---
network-flow:
  - schema: 5
    kind: zigbee
    name: Coordinator
    ieee: "0x00124b0001a2b3c4"
    role: coordinator
    coordinator: SLZB-MR3U
  - schema: 5
    kind: zigbee
    name: Küche/Licht/Küchenzeile
    ieee: "0x00178801040600bd"
    role: router
    coordinator: SLZB-MR3U
    room: Küche
  - schema: 5
    kind: zigbee
    name: Küche/Sensoren/Präsenzsensor
    ieee: "0x8c73dafffedaec3e"
    role: router
    coordinator: SLZB-MR3U
    room: Küche
  - schema: 5
    kind: zigbee
    name: Flur/Sensoren/Haustür
    ieee: "0x00158d008c74757d"
    role: end-device
    coordinator: SLZB-MR3U
    room: Flur
  - schema: 5
    kind: zigbee
    name: Büro/Remote/Shortcut Button
    ieee: "0xdc8e95fffe89fe1c"
    role: end-device
    coordinator: SLZB-MR3U
    room: Büro
---
# Beispiel: Zigbee-Netz (schema 5)

Erfundene Beispielnotiz für die Harness: ein Koordinator, zwei Router, zwei Endgeräte.
