# Homelab Views

> **Private plugin.** Maintained by [axelcypher](https://github.com/axelcypher) for my own use.
> It is not published in the Obsidian community plugin directory.

Renders the frontmatter of my homelab docs as readable cards, tables and a weekly
schedule – without Dataview or Bases. It reads two frontmatter keys:

- **`backup`** – backup blocks, schema 1 (vault note
  `homelab-docs/projects/backup-ui/Frontmatter für Backups.md`)
- **`network-flow`** – documented network state, schema 1 and 2 (vault note
  `homelab-docs/projects/network-flow/Frontmatter für den Doku-Zustand.md`)

Both schemas are implemented strictly, including their validation: unknown fields, missing
required fields, wrong types and invalid values are shown per block with the field path and the
reason. The plugin only **reads** frontmatter from Obsidian's metadata cache; it never writes to
notes. Folders named `_privat` or `_private` are never read. All UI text is German.

## Note card

Every note with `backup` and/or `network-flow` frontmatter shows a card view of its own data at the
top (or bottom) of the note, in reading view and Live Preview:

- **Network:** machines and devices with their addresses (IP, subnet, MAC – monospace, click to
  copy), host, cluster, web interface, rack and connections; apps with their hostnames, entry
  badge (Internet / Intern / Internet + intern, Cloudflare), target, Traefik instance, ports and
  `runs-on` linked to the machine's note; clusters, subnets, sites and racks.
- **Backups:** one card per block, coloured by `system`: what, location (`source`, or `on` for
  jobs), schedule in plain German (“täglich 07:15 · 13:15 · 19:15 · 23:15”, “Mi 03:00”,
  “alle 6 h”), the **next run** computed from schedule and `tz` and shown in the display time zone,
  grace, retention chips, `copy-of` links in both directions and a job badge.
- Validation problems appear at the bottom of the affected card.

The automatic card can be switched off; a note that contains its own `homelab-card` block gets no
automatic card.

## Code blocks

Options are YAML inside the block; an empty block uses the defaults.

### `homelab-backups`

All backup blocks as a table, one row per block: note, what, schedule, next run, grace, location,
retention. Grouped by system with filter chips; copies are listed directly below their original.

````markdown
```homelab-backups
system: dumps                 # one system or a list; default: all
path: homelab-docs/docs/apps  # folder filter; may also point outside the root folder
group: true                   # false: one flat table with a System column
jobs: true                    # false: hide prune/verify/gc/sync jobs
```
````

### `homelab-schedule`

The current week (Monday–Sunday) in the display time zone:

- a 00–24 timeline per weekday; each run is drawn from its start to start + grace, jobs hatched,
  identical runs merged, a marker for “now”;
- **overlaps**: a *Kollision* when runs at the same target (repo, datastore, folder, volume)
  overlap and at least one of them is a job (e.g. the daily restic backup and the Sunday prune of
  the same repo); an *Überschneidung* when two runs of the same note overlap. A block and its
  `copy-of`, a sync job and the backups it delivers, and backups sharing a repo are not reported;
- a list of all start times sorted by time of day with a weekday strip;
- interval schedules (`every`) separately – they have no fixed time and are not checked for overlaps.

````markdown
```homelab-schedule
system: [pbs, restic]   # default: all
path: homelab-docs/docs
jobs: true
view: both              # timeline | list | both
```
````

### `homelab-network`

Machines and devices (name, type, host, IP, subnet, MAC, web interface), apps one row per
hostname (hostname, entry, target, Traefik, runs on) and subnets. All columns are sortable; IP
addresses sort numerically.

````markdown
```homelab-network
show: [machines, apps, subnets]   # default: all three
entry: internet                   # only hostnames reachable from the internet (incl. "beide")
runs-on: vm-docker-01             # only apps on this machine or cluster
path: homelab-docs/docs
```
````

### `homelab-card`

The card view placed by hand, for the current note or another one:

````markdown
```homelab-card
note: "[[vm-docker-01]]"   # default: this note
show: [network, backup]    # default: both
```
````

## Settings

| Setting | Default | |
|---|---|---|
| Wurzelordner | `homelab-docs/docs` | Notes in this folder (with subfolders) make up the central views |
| Kartenansicht in der Notiz | on | Automatic card view in notes with homelab frontmatter |
| Position der Karten | oben | Below the properties, or at the end of the note |
| Zeitzone für die Anzeige | `Europe/Berlin` | IANA zone for next runs and the weekly schedule |

Command: **Kartenansicht in Notizen ein- oder ausschalten**.

All views update live when frontmatter changes (`metadataCache` `changed`/`resolved`), and once a
minute for the next-run times.

## Time zones

Fixed times are interpreted in the block's `tz` with the Intl API (no bundled tz database). A
time that does not exist because the clock jumps forward (02:30 on the last Sunday of March in
`Europe/Berlin`) runs at 03:30; a time that occurs twice when the clock goes back counts once, at
its first occurrence (the `Temporal` “compatible” rule). Schedules in `UTC` are shown converted
to the display zone, with the original time next to it.

## Development

```bash
npm install
npm run build     # tsc --noEmit + esbuild → main.js
npm test          # unit tests (node --test) on a pre-built bundle of the pure modules
npm run shots     # visual harness: renders all views with the fixtures, light and dark, via Playwright
```

`harness/fixtures/` contains the example notes of the vault
(`homelab-docs/_beispiele/frontmatter-rendering/`) and a few more invented notes, among them one
with deliberate schema errors. The harness page (`harness/out/index.html`) imitates Obsidian's
default theme variables, so the styles can be checked outside Obsidian.

Source layout: `src/model` (parsers and validators), `src/schedule` (time zones, next run,
occurrences, overlaps), `src/render` (DOM renderers, no Obsidian dependency), `src/main.ts`,
`src/store.ts`, `src/inject.ts`, `src/settings.ts` (Obsidian glue), `styles.css` (Obsidian CSS
variables only).

## Installation

Installed and updated by the [Revamp Manager](https://github.com/axelcypher/obsidian-revamp-manager)
once the repo carries the topic `axlc-obsidian-revamp` and has a release (push a tag `x.y.z`; the
workflow builds and publishes `main.js`, `manifest.json` and `styles.css`).

## Notes

- The automatic card is placed into Obsidian's view DOM (next to the properties in reading view and
  Live Preview). These class names are not public API; if a future Obsidian version changes them,
  the `homelab-card` block keeps working.
- There is no card in source mode, in hover previews, embeds or PDF export – use a `homelab-card`
  block there.
