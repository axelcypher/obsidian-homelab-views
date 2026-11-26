import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { core, y, fields, find } from "./helpers.mjs";

const { parseNetwork } = core;
const issuesOf = (text) => parseNetwork(y(text)).flatMap((p) => p.issues);

describe("network-flow: valid blocks", () => {
	test("examples of the schema note", () => {
		const examples = [
			`
schema: 1
kind: app
name: immich
runs-on: k3s-evangelion
hostnames:
  - name: immich.pendzialek.net
    entry: beide
    target: 10.20.0.50:443
    traefik: cluster`,
			`
schema: 2
kind: app
name: ophir-figures
runs-on: [vm-docker-02]
hostnames:
  - name: ophir.zenbyte.win
    entry: internet
    cloudflare: true
    target: 10.8.0.15:443
    traefik: traefik-02
    path: /figures`,
			`
schema: 1
kind: machine
name: k3s-asuka-01
type: vm
host: sol
cluster: k3s-evangelion
addresses:
  - ip: 10.8.0.34
    subnet: oxygen
    mac: bc:24:11:48:c7:4e
web-interface: 10.8.0.34:8006`,
			`
- schema: 1
  kind: subnet
  name: oxygen
  network: 10.20.0.0/16
  vlan: 8
  medium: LAN
- schema: 1
  kind: subnet
  name: pantheon
  network: 10.108.0.0/24
  vlan: null
  medium: WireGuard
- schema: 1
  kind: site
  name: Pantheon
  subnet: pantheon`,
			`
- schema: 2
  kind: rack
  name: Wandschrank
  units: 12
  shelves:
    - position: 3
      units: 1
- schema: 2
  kind: device
  name: sg300
  type: switch
  rack: {name: Wandschrank, position: 9}
  connections:
    - {port: g1, to: "opnsense:igb0", kind: copper}
    - {port: wg, to: Pantheon, kind: vpn}
- schema: 2
  kind: machine
  name: sol
  type: host
  rack: {name: Wandschrank, shelf: 3, units: 2, side: back}`,
			`
schema: 1
kind: cluster
name: k3s-evangelion
machines: [k3s-magi-01, k3s-magi-02]
lb-ips:
  - ip: 10.8.0.45
  - {ip: 10.20.0.50, services: [traefik]}`,
			`
schema: 1
kind: app
name: unifi-network
runs-on: [vm-docker-01]
ports:
  - {port: 8443, protocol: tcp, purpose: UniFi web administration}
  - {port: 3478, protocol: udp}`,
		];
		for (const text of examples) assert.deepEqual(issuesOf(text), [], text.slice(0, 50));
	});

	test("typed values", () => {
		const [app] = parseNetwork(y("{schema: 1, kind: app, name: immich, runs-on: k3s-evangelion}"));
		assert.deepEqual(app.res.runsOn, ["k3s-evangelion"]);
		assert.equal(app.res.runsOnCluster, true);
		const [subnet] = parseNetwork(y("{schema: 1, kind: subnet, name: x, network: 10.1.0.0/24, vlan: null}"));
		assert.equal(subnet.res.vlan, null);
	});
});

describe("network-flow: errors", () => {
	test("missing required fields", () => {
		assert.deepEqual(fields(issuesOf("{schema: 1, kind: app, name: x}")), ["network-flow.runs-on"]);
		assert.deepEqual(fields(issuesOf("{schema: 1, kind: machine, name: x}")), ["network-flow.type"]);
		assert.deepEqual(fields(issuesOf("{kind: subnet}")).sort(), ["network-flow.name", "network-flow.network", "network-flow.schema"]);
		assert.deepEqual(
			fields(issuesOf("{schema: 1, kind: app, name: x, runs-on: [a], hostnames: [{name: a.b}]}")).sort(),
			["network-flow.hostnames[0].entry", "network-flow.hostnames[0].target"],
		);
	});

	test("entry values: internal and extern are not in the schema", () => {
		const i = find(issuesOf("{schema: 1, kind: app, name: x, runs-on: [a], hostnames: [{name: a.b, entry: internal, target: '1.2.3.4:443'}]}"), "network-flow.hostnames[0].entry");
		assert.match(i.message, /erlaubt: internet, intern, beide/);
		// the value is kept for display
		const [p] = parseNetwork(y("{schema: 1, kind: app, name: x, runs-on: [a], hostnames: [{name: a.b, entry: internal, target: '1.2.3.4:443'}]}"));
		assert.equal(p.res.hostnames[0].entry, "internal");
	});

	test("unknown fields and fields of another kind", () => {
		assert.equal(find(issuesOf("{schema: 1, kind: machine, name: x, type: vm, adresses: []}"), "network-flow.adresses").message, "unbekanntes Feld");
		assert.match(find(issuesOf("{schema: 1, kind: machine, name: x, type: vm, runs-on: [a]}"), "network-flow.runs-on").message, /gehört nicht zu kind: machine/);
		assert.ok(find(issuesOf("{schema: 1, kind: machine, name: x, type: vm, addresses: [{ip: 10.0.0.1, subnet: a, vlan: 3}]}"), "network-flow.addresses[0].vlan"));
	});

	test("version rules: path, rack and kind rack need schema 2", () => {
		assert.match(
			find(issuesOf("{schema: 1, kind: app, name: x, runs-on: [a], hostnames: [{name: a.b, entry: intern, target: 'a.b:80', path: /x}]}"), "network-flow.hostnames[0].path").message,
			/erst ab schema: 2/,
		);
		assert.match(find(issuesOf("{schema: 1, kind: machine, name: x, type: host, rack: Wandschrank}"), "network-flow.rack").message, /erst ab schema: 2/);
		assert.match(find(issuesOf("{schema: 1, kind: device, name: x, type: nas, rack: {name: W, position: 3}}"), "network-flow.rack").message, /erst ab schema: 2/);
		assert.deepEqual(issuesOf("{schema: 1, kind: device, name: x, type: nas, rack: Wandschrank}"), []);
		assert.match(find(issuesOf("{schema: 1, kind: rack, name: W, units: 12}"), "network-flow.kind").message, /erst ab schema: 2/);
		assert.match(find(issuesOf("{schema: 3, kind: site, name: S}"), "network-flow.schema").message, /Version 3 ist unbekannt/);
	});

	test("rack placement rules", () => {
		assert.match(issuesOf("{schema: 2, kind: device, name: x, type: ups, rack: {name: W, position: 1, shelf: 2}}")[0].message, /schließen sich aus/);
		assert.match(find(issuesOf("{schema: 2, kind: device, name: x, type: ups, rack: {name: W, units: 2}}"), "network-flow.rack.units").message, /nur zusammen/);
		assert.match(issuesOf("{schema: 2, kind: device, name: x, type: ups, rack: {name: W, position: 47, units: 3}}")[0].message, /über HE 48/);
		assert.match(issuesOf("{schema: 2, kind: rack, name: W, units: 12, shelves: [{position: 12, units: 2}]}")[0].message, /Höhe des Racks/);
		assert.ok(find(issuesOf("{schema: 2, kind: device, name: x, type: ups, rack: {name: W, position: 3, side: left}}"), "network-flow.rack.side"));
	});

	test("value formats", () => {
		assert.match(
			find(issuesOf("{schema: 1, kind: app, name: x, runs-on: [a], hostnames: [{name: a.b, entry: intern, target: 10.8.0.97}]}"), "network-flow.hostnames[0].target").message,
			/adresse:port/,
		);
		assert.deepEqual(issuesOf("{schema: 1, kind: app, name: x, runs-on: [a], hostnames: [{name: a.b, entry: intern, target: '[fd00::1]:443'}]}"), []);
		assert.match(
			find(issuesOf("{schema: 1, kind: app, name: x, runs-on: [a], hostnames: [{name: a.b, entry: intern, cloudflare: true, target: 'a.b:443'}]}"), "network-flow.hostnames[0].cloudflare").message,
			/nur bei entry internet oder beide/,
		);
		assert.ok(find(issuesOf("{schema: 1, kind: machine, name: x, type: vm, addresses: [{ip: 10.0.0.300, subnet: a}]}"), "network-flow.addresses[0].ip"));
		assert.ok(find(issuesOf("{schema: 1, kind: machine, name: x, type: vm, addresses: [{ip: 10.0.0.3, subnet: a, mac: bc-24-11}]}"), "network-flow.addresses[0].mac"));
		assert.ok(find(issuesOf("{schema: 1, kind: subnet, name: x, network: 10.0.0.0}"), "network-flow.network"));
		assert.ok(find(issuesOf("{schema: 1, kind: subnet, name: x, network: 10.0.0.0/24, vlan: 5000}"), "network-flow.vlan"));
		assert.ok(find(issuesOf("{schema: 1, kind: app, name: x, runs-on: [a], ports: [{port: 70000, protocol: tcp}]}"), "network-flow.ports[0].port"));
		assert.ok(find(issuesOf("{schema: 1, kind: app, name: x, runs-on: [a], ports: [{port: 80, protocol: http}]}"), "network-flow.ports[0].protocol"));
		assert.ok(find(issuesOf("{schema: 2, kind: device, name: x, type: switch, connections: [{port: g1, to: opnsense, kind: copper}]}"), "network-flow.connections[0].to"));
	});
});
