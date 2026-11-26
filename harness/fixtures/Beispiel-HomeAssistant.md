---
network-flow:
  schema: 1
  kind: machine
  name: beispiel-ha
  type: vm
  host: sol
  addresses:
    - ip: 10.2.0.99
      subnet: helium
      mac: 0a:d9:1e:00:99:02
  web-interface: 10.2.0.99:8123
backup:
  schema: 1
  id: beispiel-ha-backup
  system: homeassistant
  what: Vollsicherung (Add-on)
  format: tar
  source: {files: "10.2.0.5:/volume1/backup/homeassistant", pattern: "*.tar"}
  schedule: {weekdays: [mon, tue, wed, thu, fri], times: ["04:45"]}
  tz: Europe/Berlin
  grace: 1h
  retention: {keep-last: 7}
---
# Beispiel-HomeAssistant

Erfundene Beispieldaten für die Homelab Views.
