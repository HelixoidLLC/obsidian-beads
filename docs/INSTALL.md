# Installing Beads

Three ways to get the plugin into a vault. Pick by what you're doing:

| You want to… | Use |
| --- | --- |
| Run the Helixoid fork (markdown fields, lineage graph, pane filters) and get updates | [BRAT, from this fork](#1-brat-from-this-fork) |
| Run the fork once, no auto-updates | [Build and copy](#2-build-and-copy) |
| Change the plugin's code | [Dev symlink](#3-dev-symlink) |
| Run the upstream plugin only | [Upstream](#4-upstream-rome-1) |

> **Which repo am I installing from?**
> Upstream is [`Rome-1/obsidian-beads`](https://github.com/Rome-1/obsidian-beads)
> — the version in Obsidian's community directory. This repo is the Helixoid
> fork, which carries work upstream hasn't merged yet (see
> [PR #2](https://github.com/Rome-1/obsidian-beads/pull/2)): the markdown text
> fields, the lineage graph, and the pane filters. **Upstream's releases do not
> contain those**, so installing from upstream is a downgrade if you're already
> on a fork build.

Everything below writes into `<vault>/.obsidian/plugins/beads-pane/`. The folder
name **must** be `beads-pane` (the manifest id), and all three files
(`main.js`, `manifest.json`, `styles.css`) must sit directly in it — not zipped,
not in a subfolder.

Beads is **desktop only** (it shells out to `bd` and watches the filesystem), so
it won't load on mobile.

---

## 1. BRAT, from this fork

[BRAT](https://github.com/TfTHacker/obsidian42-brat) installs a plugin straight
from a GitHub repo's latest release and keeps it updated — the least-effort
option for a vault you actually work in.

1. Install **BRAT** from Settings → Community plugins → Browse, and enable it.
2. Run **BRAT: Add a beta plugin for testing** from the command palette.
3. Enter `HelixoidLLC/obsidian-beads`, leave the version as latest, and confirm.
4. Enable **Beads** under Community plugins.

Updates: **BRAT: Check for updates to all beta plugins**, or let BRAT check on
startup (its own setting). Then continue with [After installing](#after-installing).

## 2. Build and copy

No BRAT, no auto-updates — a snapshot of whatever you have checked out.

```bash
cd /path/to/obsidian-beads
npm install
npm run build                      # tsc typecheck + production main.js

VAULT="/path/to/your/vault"
mkdir -p "$VAULT/.obsidian/plugins/beads-pane"
cp main.js manifest.json styles.css "$VAULT/.obsidian/plugins/beads-pane/"
```

Then reload: **Reload app without saving** from the command palette (or
`obsidian plugin:reload id=beads-pane`, see below), and enable **Beads** under
Community plugins.

Because this is a **copy**, a later `npm run build` does *not* reach the vault —
re-run the `cp`. To check what a vault is actually running:

```bash
cat "$VAULT/.obsidian/plugins/beads-pane/manifest.json" | grep version
# and, to confirm it matches a given commit:
shasum -a256 "$VAULT/.obsidian/plugins/beads-pane/main.js" main.js
```

## 3. Dev symlink

For working on the plugin. The vault reads the repo directly, so a rebuild is
live. Full dev loop (watch mode, reload, DevTools) is in
[`AGENTS.md`](../AGENTS.md#installing-the-local-copy-into-obsidian-dev-loop).

```bash
VAULT="$HOME/Obsidian/ObsidianNotes"        # a throwaway vault is safer
mkdir -p "$VAULT/.obsidian/plugins"
# A released or copied install has the same id — move it aside first.
[ -e "$VAULT/.obsidian/plugins/beads-pane" ] && \
  mv "$VAULT/.obsidian/plugins/beads-pane" /tmp/beads-pane.bak
ln -s "$PWD" "$VAULT/.obsidian/plugins/beads-pane"
npm run dev                                  # rebuilds main.js on save
```

Obsidian writes its plugin settings to `<repo>/data.json` through the symlink.
That file is gitignored — don't commit it.

Reload after a rebuild:

```bash
obsidian plugin:reload id=beads-pane         # Obsidian CLI; app must be running
obsidian dev:console level=error             # read captured console errors
```

## 4. Upstream (Rome-1)

The directory version, without this fork's features.

- **Community plugins** (once accepted): Settings → Community plugins → Browse →
  search **"Beads"** → Install → Enable.
- **Manual**: download `main.js`, `manifest.json` and `styles.css` from the
  [latest upstream release](https://github.com/Rome-1/obsidian-beads/releases)
  and copy them into `<vault>/.obsidian/plugins/beads-pane/`.

---

## After installing

1. **Settings → Beads → Project root** — a directory containing `.beads/`. It
   auto-fills when the vault root has one.
2. **bd binary path** — a GUI-launched Obsidian usually doesn't inherit your
   shell `PATH`, so give the full path (`which bd`, e.g. `/opt/homebrew/bin/bd`).
3. Click **Test connection** (runs `bd --version`).
4. Open the pane: the **list-checks** ribbon icon, or **Beads: Open pane**.

**Live updates** need **bd >= 1.3.0** with the events journal switched on. The
pane offers to turn it on when it can; with older bd, or the journal off, it
falls back to polling on the refresh interval plus an `fs.watch` on `.beads/`.
Turning the journal on writes `.beads/config.yaml`, so it applies to **every bd
user of that workspace** — the plugin never does it without asking.

## Cutting a release of this fork

So that BRAT (option 1) has something to install. Full upstream/directory
process is in [`RELEASE.md`](RELEASE.md); for a fork release:

```bash
# On the fork's shipping branch (helixoid/main):
#   1. bump "version" in manifest.json and package.json
#   2. add "<version>": "<minAppVersion>" to versions.json
#   3. commit
npm run build
gh release create <version> main.js manifest.json styles.css \
  --repo HelixoidLLC/obsidian-beads \
  --title "<version>" --notes "…"
```

The tag **must exactly match** `manifest.json`'s `version`, with **no `v`
prefix** — BRAT and Obsidian both match on it. Attach the three files as
individual assets.

Fork versions are numbered **ahead of upstream** (upstream is on `0.0.x`, the
fork on `0.1.x`) so a fork build is never mistaken for a directory build and
BRAT never sees a downgrade.
