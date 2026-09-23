# Shrimp's Expanded Horizons

A floating, draggable **parallax horizon** window for Foundry VTT scenes — the same core
window, layer terrain and Points-of-Interest table as the free
[Shrimp's Distant Horizons](https://github.com/Shrimp381/shrimps-distant-horizons), plus a
handful of deeper tools built on top of it.

**Compatibility: Foundry v13+.**

## What's in this module (v0.2.1)

Everything the free module does — floating/dockable window, 6-layer parallax terrain with
custom-image uploads, draggable POIs with Unknown/Rumored/Discovered states, day/night,
GM/Player view, Lock View, Free Dock, per-scene save + live GM→player sync — **plus:**

- **Journal-linked POIs.** Link any POI to one of your world's real Journal Entries from
  the POI table's "Journal" column. Once that POI is Discovered, a small journal badge
  appears on its marker — click it (as GM or player) to open the real entry in Foundry's
  own journal sheet. The Journal Entries panel (Settings → Journal Entries) is a read-only
  mirror of your world's Journal sidebar, kept live via Foundry's own hooks.
- **Presets.** Save the current layers, POIs, palette and horizon length as a named preset
  (Settings → Presets), then load it again later — on this scene or a different one.
  Presets are world-scoped (`game.settings`), so every GM in the world shares the same
  library and sees updates immediately.
- **Procedural horizon generator.** Pick a biome (or "Random"/"Combo" to mix two), a
  ruggedness, and a POI density, then generate a full 6-layer horizon with placed POIs from
  a seed (Settings → Procedural Generator). The same seed always produces the same result.
- **Vantage Point — top-down radar.** A one-click radar view: the party sits fixed at the
  centre, 6 concentric rings represent the 6 terrain layers (nearest layer = innermost
  ring), and every POI plots as a dot on its own layer's ring at its own compass bearing
  (set per-POI in the table's Radar column — independent of where it sits on the flat
  horizon, with a one-click "align to current facing" button). It temporarily grows to
  fill the whole module window (collapsing the Layers/POI panel below it); toggle it off
  to return to the normal flat view. Purely a local display toggle — never saved or
  synced, works the same whether the window is docked or undocked, and is available to
  GM and player alike. The radar itself stays fixed north-up (it doesn't spin with the
  horizon's current facing) — only a small arrow at the centre rotates to show which way
  you're currently facing on the horizon.
- **Passive Perception visibility.** Each POI gets a Perception DC (Radar column, next to
  Bearing — default 15). A Hidden POI automatically becomes visible as an unidentified
  blip to any player whose own assigned character's passive Perception meets or beats
  that DC — computed per-player on their own client, so different players can see
  different things revealed, matching how passive Perception works at the table. This
  only unlocks *existence* (Hidden → Unknown); promoting a POI to Rumored or Discovered
  stays a deliberate GM call, same as before.

**What ships pre-populated vs. blank (on a scene with no saved setup yet):**
- The 6 horizon **layers** come with sensible default terrain so there's something to look
  at immediately — edit, reorder, replace, or run the Procedural Generator to build a new one.
- **Points of Interest start empty.** Use "+ Add POI" or the generator to place some.

## v0.2.1 — radar Vantage Point + passive Perception

Replaces the v0.2.0 diorama-tilt Vantage Point entirely with the top-down radar described
above, and adds per-POI `bearing`/`revealDC` fields. Existing POIs from earlier scene saves
default to bearing 0° and DC 15 the first time they're rendered — worth a pass through the
POI table to set real bearings on anything placed before this update, since bearing was
never inferred from the horizon position (see the note below on why).

**Why bearing is its own field, not derived from horizon position:** the flat horizon's
POI position (`xPos` + which layer) is a parallax-scroll coordinate, scaled per layer by
that layer's own `speed` (1.0 for the nearest layer down to 0.05 for the farthest).
Reversing that into a compass bearing would need dividing by `speed` — on the farthest
layer that's a 20× amplification, meaning a single pixel of difference would swing a
bearing by several degrees. So bearing is a deliberately independent, explicitly-set
field; the "align to current facing" button next to it is a convenience for setting it
from wherever the horizon is currently pointed, not a permanent link between the two.

**Why passive Perception reveals are per-player, not shared:** matches how passive
Perception works at the table — it's a per-character stat, so two players can and should
see different Hidden POIs revealed depending on their own assigned character. The check
runs on each player's own client and is never written back to the scene, so nothing here
is visible to, or affects, any other player or the GM's saved data.

## v0.2.0 — rebuilt on Distant Horizons v1.0.6

This release replaces the v0.1.0 prototype's raw-DOM implementation with Distant Horizons
v1.0.6's `ApplicationV2` + `HandlebarsApplicationMixin` architecture — the four Expanded
features above are now proper PARTS/actions/settings instead of hand-injected markup, same
as the rest of the window. Every DH v1.0.6 fix and structural change carries over
unchanged, including:

- The v13 UI-chrome measuring fix (docked strip no longer overlaps the sidebar/hotbar on
  Foundry v13, where `#ui-left`/`#sidebar` are layout wrappers, not the visible toolbar
  itself).
- Full localization via `game.i18n` and `lang/en.json` (every string added for the four
  Expanded features is localized too).
- The GM-only permission gate — a real player's client never even renders the Layers/POI
  editing markup, matching the fix already shipped in Distant Horizons.
- The world-storage upload pipeline for layer/POI images (Foundry's own `FilePicker`,
  never a base64 `data:` URI).

## Installing in Foundry VTT

**Manifest URL:**

```
https://raw.githubusercontent.com/Shrimp381/shrimps-expanded-horizons/main/module.json
```

In Foundry: **Add-on Modules → Install Module**, paste that URL into the **Manifest URL**
field, and click **Install**. Then enable it from your world's **Manage Modules** list.

Once enabled, open a scene and look in the **Notes** controls group (the same toolbar
group journal pins live in, on the left-hand side of the canvas) for a mountain-range
icon — click it to show or hide the Expanded Horizons window.

## Project structure

```
shrimps-expanded-horizons/
├── module.json               Foundry module manifest
├── scripts/
│   └── expanded-horizons.js  ApplicationV2 app class + hooks (esmodule)
├── templates/
│   ├── window.hbs            Main window PART
│   ├── settings.hbs          Settings dropdown PART (incl. Presets, Journal
│   │                         Entries and Procedural Generator sections)
│   ├── layers-info.hbs       Layers-info popup PART
│   ├── layer-row.hbs         Registered partial (one terrain layer row)
│   └── poi-row.hbs           Registered partial (one POI table row)
├── lang/
│   └── en.json               Localization strings (game.i18n)
├── styles/
│   └── expanded-horizons.css
├── assets/
│   ├── shrimp-logo.png
│   ├── forest-hand-1.png
│   └── forest-hand-2.png
├── LICENSE
└── README.md
```

---

## Publishing / updating this on GitHub (manual browser upload — no git CLI)

This project publishes every module through the GitHub website directly, not the `git`
command line. Full steps live in the project's own
**"GitHub manual upload process"** doc; short version:

### First time publishing

1. On github.com, create a new **public** repo named exactly `shrimps-expanded-horizons`
   (matches `module.json`'s `"id"`). Don't initialize it with a README/license — this
   folder already has them.
2. On the empty repo page, click **uploading an existing file** and drag in the
   **contents** of this folder (`module.json`, `scripts/`, `templates/`, `lang/`,
   `styles/`, `assets/`, `README.md`, `LICENSE`) — not a zip, and not a wrapping parent
   folder. Commit.
3. Create the release (below) — this is what actually makes the module installable.

### Updating later

1. Confirm `module.json`'s `"version"` has been bumped for the new release.
2. On the repo, replace each changed file (open it → pencil/edit icon, or use
   **Add file → Upload files** to drag a same-named replacement over it). Commit.
3. Create a new release (below) tagged to match the new version.

### Every release: create the GitHub Release with the zip attached

This is the step that actually makes the module downloadable/updatable in Foundry — the
repo files alone aren't enough, since `module.json`'s `"download"` field points at a
release asset.

1. Repo → **Releases** → **Create a new release**.
2. **Tag**: `v0.2.1` (must match `module.json`'s `"version"`, prefixed with `v`).
3. **Release title**: `v0.2.1` (or a short description).
4. **Description**: a brief changelog — e.g. "Rebuilt on Distant Horizons v1.0.6;
   Journal-linked POIs, Presets, Procedural Generator and Vantage Point are now proper
   ApplicationV2 PARTS/actions/settings instead of raw-DOM injection. Renamed from
   Enhanced Horizons."
5. **Attach the module zip** — drag it into "Attach binaries". It **must be named
   `module.zip`** exactly (matching the `download` URL's expected filename,
   `.../releases/latest/download/module.zip`), or Foundry's install/update will 404.
6. Leave "Set as the latest release" checked. Click **Publish release**.

### Verifying it worked

- Paste the manifest URL above into a browser — it should show raw JSON with the right
  version, not a 404.
- Paste the `download` URL into a browser — it should trigger a `module.zip` download.
- In Foundry, **Install Module** with the manifest URL and confirm the version shown.

## Listing on Foundry's official package directory (optional)

Once you're happy with a release, submit the module at
[foundryvtt.com/community/manage-packages](https://foundryvtt.com/community/manage-packages)
using the manifest URL above.

## Note on the rename from "Enhanced Horizons"

This module was previously published (v0.1.0) as **Shrimp's Enhanced Horizons**
(`shrimps-enhanced-horizons`). Because the module `id` has changed, Foundry treats
`shrimps-expanded-horizons` as a brand-new module — it will **not** auto-update an
existing Enhanced Horizons install. If you're migrating an existing world: install
Expanded Horizons from the manifest URL above, re-point any GM workflow at the new
module, and then disable/uninstall the old `shrimps-enhanced-horizons` module once
you've confirmed the new one is working. Scene data saved under the old module's flags
is **not** automatically migrated (it lives under the old module's namespace on each
Scene document) — rebuild or use the Procedural Generator on scenes that need it, or ask
for a one-off migration script if you have a lot of existing scenes to carry over.
