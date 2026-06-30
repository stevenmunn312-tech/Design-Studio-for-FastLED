# Collection-driven performance — design note

Status: proposed · Owner: app · Date: 2026-06-30

Let the **Performance Generator** draw its patterns from a user-curated
**Pattern Collection** instead of the 11 hardcoded section patterns, and let the
rules engine **modulate each pattern's palette, speed, and intensity** through
exposed group inputs — gated by a per-collection **"Use group inputs"** toggle.

This unifies the two show pipelines that exist today:

- **Generative pattern show** — `PatternCollection → PatternMaster → MatrixOutput`.
  Runtime-random scheduling; codegen (`showGenerator.ts`) compiles each collected
  group's subgraph into a `render_pN()` C++ function via `generateCpp`.
- **Music-sync show** — `MusicLibrary → PerformanceGenerator → SDCard`.
  Deterministic, analysis-driven scheduling baked to one song; patterns are a
  fixed enum (`PATTERN_IDS` 0–11) rendered by a hand-written firmware `switch`.

The proposal keeps the Performance Generator's **deterministic, beat-/section-aware
scheduling** but swaps its fixed pattern vocabulary for the user's own patterns,
borrowing the generative pipeline's **subgraph codegen** so any studio pattern can
play on-device. See [generative-pattern-show.md](generative-pattern-show.md) for
the pipeline it merges with.

## Goals

- Wire a `PatternCollection`'s `patternset` into the `PerformanceGenerator` so the
  rules engine picks from the curated groups, not the `SECTION_PATTERNS` enum.
- Drive each pattern with the analysis-derived **palette / speed / intensity** the
  generator already computes — but only for patterns that opt in by exposing those
  group inputs.
- A **"Use group inputs"** checkbox on the Performance Generator: off → patterns
  render exactly as authored (self-contained), the generator only schedules *which*
  pattern and *when*; on → the generator also feeds palette/speed/intensity into
  each pattern's exposed inputs.
- Keep both legacy paths working unchanged when no collection is wired.

## Non-goals

- Removing the built-in 11-pattern mode. With no `patternset` wired, the
  Performance Generator behaves exactly as today.
- Changing the generative `PatternMaster` show. It keeps its runtime-random engine.
- Per-pattern audio reactivity rework — patterns already read the mic globals; this
  note is about the *generator-driven* modulation layer on top.

## What exists today (grounding)

- `PerformanceGenerator` node ([nodeLibrary.ts](../../../src/state/nodeLibrary.ts)):
  `inputs: [songs]`, `outputs: [shows]`; properties `beatIntensity`,
  `energySensitivity`, `transitionDuration`, `paletteMode`, `fixedPalette`.
- `generateShow(analysis, options)` ([performanceGenerator.ts](../../../src/codegen/performanceGenerator.ts))
  emits a sorted `ShowEvent[]`: `SET_PATTERN` / `SET_PALETTE` / `SET_SPEED` /
  `SET_BRIGHTNESS` / `BEAT_FLASH` / `TRANSITION`. Pattern names come from
  `SECTION_PATTERNS` (11 distinct); palette/speed/brightness are computed per
  section/beat.
- `.show` format ([showFile.ts](../../../src/types/showFile.ts)) + `showFileToBinary`:
  `SET_PATTERN` encodes a `PATTERN_IDS` enum (0–11); `SET_PALETTE` a `PALETTE_IDS`
  enum; speed/brightness/intensity as float32.
- Firmware player ([playerSketchGenerator.ts](../../../src/codegen/playerSketchGenerator.ts)):
  hand-written `renderPattern()` `switch`, applies palette/speed/brightness
  globally, syncs to `audio.getPosition()`.
- `PatternCollection` node: `outputs: [patternset]`, `properties.patternIds`
  (`string[]` of group ids); subgraphs live in `graphData[groupId]`.
- Subgraph codegen ([showGenerator.ts](../../../src/codegen/showGenerator.ts)):
  `buildPattern(groupId, groups, index)` re-terminates a group's subgraph at a
  synthetic `MatrixOutput`, runs `generateCpp`, prefixes its buffers, dedupes
  helpers, and wraps the loop body as `render_pN(uint32_t ms)`.
- Group-input binding ([graphEvaluator.ts](../../../src/state/graphEvaluator.ts)):
  a `Group` node binds its connected input ports into `boundInputs`, passed as
  `groupInputs` into the subgraph; `GroupInput` nodes resolve
  `groupInputs[paramId]`. **`showGenerator.buildPattern` currently filters
  `GroupInput`/`GroupOutput` out** — so exposed inputs are dropped in show codegen
  today. Closing that gap is the heart of the "Use group inputs" work.

## The four layers that must agree

A pattern reference flows through four layers; collection mode changes the meaning
of "pattern" in each:

| Layer | Today (enum) | Collection mode |
|-------|--------------|-----------------|
| Generator (`choosePattern`) | random name from `SECTION_PATTERNS` | random **index** into the wired `patternIds` |
| `.show` `SET_PATTERN` | `PATTERN_IDS` enum 0–11 | **collection index** 0…N-1 |
| Browser preview (`showPreview.ts`) | synthetic single-node graph via `PATTERN_NODE` | evaluate the group **subgraph** via the group registry |
| Firmware player | hand-written `switch` | `render_pN()` functions from `showGenerator.buildPattern` |

The crux: `SET_PATTERN` stops being a global enum and becomes an **index into the
collection that ships with the show**. The show package must therefore carry the
pattern set (the compiled `render_pN()` table) alongside the event stream.

## Design

### 1. Node wiring

Add a `patternset` input to `PerformanceGenerator`:

```
inputs: [
  { id: 'songs',      label: 'Songs',    dataType: 'songs' },
  { id: 'patternset', label: 'Patterns', dataType: 'patternset' },
]
```

`PatternCollection.patternset → PerformanceGenerator.patternset` is then an
ordinary typed connection (no `handleConnect` absorb interception — unlike the
collection's own `pattern` input, this is a normal noodle). When present, the
generator resolves the collection's `patternIds` from the source node's
`properties.patternIds` and the subgraphs from the group registry.

Add the toggle to `defaultProperties`:

```
useGroupInputs: false   // off → patterns render as authored; on → modulate exposed inputs
```

Surface it as an inline checkbox in `PerformanceGeneratorBody`, enabled only when a
`patternset` is wired (mirror `isPropertyEnabled` gating, like `fixedPalette`).

### 2. Generator — pick by index, not name

`generateShow` gains an optional pattern vocabulary. When a collection is wired,
`choosePattern(sectionType)` returns a **collection index** instead of a
`SECTION_PATTERNS` name. Two sub-options for *which* index:

- **Simple (first slice):** ignore section type, pick a random index per section
  (the collection is the user's hand-picked vocabulary; they already curated it).
- **Later:** allow per-pattern section tags (a group property like
  `sections: ['drop','chorus']`) so a pattern is eligible only in matching
  sections, falling back to "any" when untagged.

`SET_PALETTE` / `SET_SPEED` / `SET_BRIGHTNESS` events are **still emitted** (the
generator computes them from analysis as today) — they become the *values fed to
the exposed group inputs* when `useGroupInputs` is on, and no-ops when off.

`SET_BRIGHTNESS` is global (FastLED `setBrightness`) and stays global in both
modes — `energy` as a *group input* is a separate, per-pattern knob (see §4),
distinct from the global brightness command.

### 3. `.show` format — pattern set + indices

Bump `ShowFile` to carry the collection identity so the player can map indices to
renderers:

- `ShowFile.patternSet?: string[]` — the ordered group ids (parallels
  `PatternCollection.patternIds`). Index in `SET_PATTERN.params` now references
  this array.
- Binary: when `patternSet` is present, `SET_PATTERN` encodes the **index**
  directly (0…N-1) rather than a `PATTERN_IDS` enum. A header flag (or a format
  `version: 2`) distinguishes enum shows from collection shows so the player knows
  which dispatch to use. Keep `version: 1` enum shows readable for the legacy path.

This is the one genuinely format-level change and deserves its own commit + tests
(`showFileToBinary` round-trip for a collection show).

### 4. Exposed group inputs — roles, not indices

A pattern opts into modulation by exposing `GroupInput` nodes tagged with a
reserved **role** — not a numbered port. Three roles:

- `energy` (dataType `float`, 0–1) — the renamed reactivity knob (was `intensity`;
  see *Prerequisite* below)
- `speed` (dataType `float`, 0–1)
- `palette` (dataType `palette`)

The generator emits **one 0–1 value per role** (from the analysis, the same numbers
that drive `SET_SPEED` / `SET_PALETTE` / the section energy) and **broadcasts** it
to every input carrying that role. The role is what the generator binds to; the
input's *label* can still be human ("Layer A speed", "Layer B speed").

**Why roles beat `Energy1 / Speed1 / Speed2 / Palette1 / Palette2`.** The generator
has only *one* energy, *one* speed, *one* palette at any instant — numbered inputs
would have nothing distinct to fill them. Broadcasting one value per role scales to
any number of knobs, and the key move is: **the generator only supplies the value;
how it combines is authored inside the pattern.** A two-layer pattern that wires its
`speed` input through a `Math(multiply)` against each layer's authored constant gets
both layers breathing with the song *while keeping their authored ratio* — one
signal, many knobs, relationship preserved. Want a hard replace instead? Wire the
input straight in. The generator stays dumb; the pattern author owns the semantics.
(This is why everything trending to 0–1 matters — a role signal is dimensionally
wire-able into any knob.)

**Palette is the exception — opt-in per input.** You can't multiply a palette, so
broadcasting one song-palette to both anchors of a two-palette blend collapses it.
So only `palette`-tagged inputs follow the song; an untagged palette stays as
authored. Tag the one you want to track the mood; leave the rest. (Tagging both is
allowed but rarely wanted.)

**Preview** (`useGroupInputs` on): evaluate the group subgraph with a `groupInputs`
map keyed by role (`{ energy, speed, palette }`) built from `showStateAt`, reusing
the exact `Group`-node binding path in the evaluator — every input sharing a role
receives the same value. (Preview already has the machinery; it currently renders
via `PATTERN_NODE` synthetic graphs — collection mode swaps in real subgraph
evaluation.)

**Codegen** (`useGroupInputs` on): teach `showGenerator.buildPattern` to **not**
strip role-tagged `GroupInput` nodes; instead emit each `render_pN(ms, energy,
speed, palette)` taking the role values, and have the controller pass the current
`SET_*`-derived values at call time. When off (or a pattern exposes no roles),
`render_pN(ms)` keeps its current self-contained signature.

This is where the bulk of the engineering sits — the same buffer-prefix /
helper-dedupe rewrite `buildPattern` already does, extended to thread a few role
parameters through the generated function signature.

**Deferred — advanced per-input mapping.** The genuine case of two *different*
driven signals (Speed1 ← tempo, Speed2 ← bass energy) needs a richer generator
signal set (tempo, bass/mid/treble energy, beat, mood-palette) and a small mapping
UI on the Performance Generator that binds each signal to a specific named input.
Additive on top of roles; not in the first cuts.

### Prerequisite — `intensity → energy` rename + 0–1 normalization

Independent of the collection work but needed for the `energy` role to read
cleanly:

- Rename the **node property/input `intensity`** (the 0–1 reactivity knob on
  MidrangeWaves, BassRings, MidrangeBloom, TreblePrism, AudioCascade, Kaleidoscope)
  to `energy`: input id+label and `defaultProperties` in `nodeLibrary.ts`, the
  `PROPERTY_META` entries, `props.intensity` reads in `graphEvaluator.ts`,
  `f('intensity', …)` in `cppGenerator.ts`, and tests. Add a **load-time migration**
  (`migrateLegacyGraph`) for the property key *and* the `intensity` edge handle,
  the same precedent as the BlendFrames `t → amount` rename.
- **Leave alone:** `beatIntensity` (a Performance Generator option) and
  `BEAT_FLASH.intensity` (a `.show` event param, 0–255 flash magnitude) — different
  concepts; renaming would only collide with the new role.
- Broader **0–1 normalization** of node values where suited is a separate, ongoing
  refinement pass (done together, per-node) — it makes role signals wire cleanly
  into any knob, but isn't a hard blocker for slice 1.

### 5. Firmware player — dispatch to render_pN

The collection-mode player merges two existing generators:

- **From `showGenerator`:** the `render_pN()` table + `renderPattern(i, ms[, energy,
  speed, palette])` dispatch, compiled from the wired collection.
- **From `playerSketchGenerator`:** the ESP32-audioI2S audio sync, the `.show`
  binary-search-by-position event loop, and the global brightness / beat-flash
  application.

`SET_PATTERN` sets the active index; `SET_PALETTE`/`SET_SPEED`/`SET_BRIGHTNESS`
update the modulation values passed into `render_pN` (when group inputs on) or stay
global (when off). The `SDCard` export ships this merged player instead of the
fixed-switch one whenever the wired `PerformanceGenerator` has a collection.

### 6. Browser preview & timeline editor

- `showPreview.renderShowFrame` branches: if the show has a `patternSet`, render
  the indexed group's subgraph (with `groupInputs` when on) instead of a
  `PATTERN_NODE` lookup.
- The **timeline editor** (`ShowTimeline.tsx`) `SET_PATTERN` dropdown lists the
  **collection's patterns** (by group name) instead of `SHOW_PATTERNS` when the
  song's show is collection-backed. Everything else in the editor is unchanged —
  it already edits the generic event stream.

## Slices

1. **Wiring + index scheduling (no modulation).** ✅ **shipped (2026-06-30), not yet
   hardware-validated.** Added the `patternset` input on `PerformanceGenerator`;
   `generateShow(analysis, options, patternIds)` picks a random collection index per
   section; `.show` is `version: 2` with a `patternSet` array and `SET_PATTERN`
   carrying `params.index`; `musicStore` resolves the wired collection live from the
   graph; `showPreview` renders the indexed group's subgraph via the group registry;
   `buildPatternRenderers` (extracted from `showGenerator`) compiles the collection
   into `render_pN()` and the player (`generatePlayerSketch(cfg, renderers)`)
   dispatches by index; `validateGraph` warns on collection-without-song / empty
   collection. Patterns render exactly as authored — `SET_PALETTE/SPEED` are emitted
   but unused. **Remaining: flash an ESP32-S3 and confirm the merged player runs the
   collected patterns in time.**
2. **"Use group inputs" modulation.** **`energy` role shipped (2026-07-01), not yet
   hardware-validated.** Added a `SET_ENERGY` show command (0–1 section energy) and
   the `PerformanceGenerator.useGroupInputs` toggle. Preview: `renderShowFrame`
   evaluates the pattern group's subgraph directly and, when on, feeds the section
   energy to any `GroupInput` with `paramId: 'energy'` via the evaluator's
   `groupInputs` path. Codegen: `buildPattern` keeps role-tagged `GroupInput` nodes
   and `generateCpp` emits `float n_<id>_out = <paramId>;`; `buildPatternRenderers(…,
   roleParams)` widens each `render_pN` to `(uint32_t ms, float energy)`; the player
   declares an `energy` global, handles `CMD_SET_ENERGY`, and passes it into the
   dispatch. Off by default. *Role assignment* is currently manual — a `GroupInput`'s
   `paramId` defaults to `param0`, so the user renames it to `energy` in the node's
   property editor (a role dropdown is editor polish, slice 4). **Remaining in this
   slice: the `speed` role (reuse `SET_SPEED`, normalised 0–1) and the `palette` role
   (a `CRGBPalette16` param — the structurally harder one), plus hardware validation.**
3. **Section-aware pattern selection.** Optional per-pattern section tags so the
   generator picks contextually, not purely at random.
4. **Editor polish.** Collection-aware `SET_PATTERN` dropdown; show which patterns
   expose which inputs.

## Resolved

- **Roles, not numbered inputs.** Group inputs carry a role (`energy`/`speed`/
  `palette`); the generator broadcasts one 0–1 value per role to every input of that
  role. Combination (replace vs. scale) is authored inside the pattern. Palette is
  opt-in per input. See §4. Per-input distinct-signal mapping is deferred.
- **`energy` semantics.** A 0–1 analysis-energy value the pattern interprets however
  it likes — zero generator assumptions. (Renamed from `intensity`.)

## Open questions

- **Collection drift.** A `.show` references group ids; if the user edits/deletes a
  group after generating, the show is stale. The package is self-contained at
  export (compiled `render_pN`), but the *preview* reads live `graphData` —
  regenerate-on-change already covers the timeline; confirm it covers pattern-set
  changes too.
- **Mixed wiring.** Both `songs` and `patternset` wired is the target. `songs` only
  → legacy enum mode. `patternset` only (no song) → undefined; likely disable
  export and warn via `validateGraph`.

## Touch list (for the eventual implementation)

- `nodeLibrary.ts` — `PerformanceGenerator` gets `patternset` input +
  `useGroupInputs` property + `PROPERTY_META`/`isPropertyEnabled` gating.
- `performanceGenerator.ts` — `generateShow` accepts a pattern vocabulary; index
  scheduling; `showFileToBinary` v2 with `patternSet`.
- `showFile.ts` — `ShowFile.patternSet?`, format version bump.
- `showGenerator.ts` — extract `buildPattern`/`render_pN` table for reuse; param
  threading for exposed inputs.
- `playerSketchGenerator.ts` — collection-mode player merging audio sync + the
  `render_pN` dispatch.
- `showPreview.ts` — indexed subgraph rendering + `groupInputs` binding.
- `PerformanceGeneratorBody.tsx` / `ShowTimeline.tsx` — toggle UI; collection-aware
  pattern dropdown.
- `validateGraph.ts` — warn on `patternset`-without-song and stale/empty collection.
- Tests — binary v2 round-trip, index scheduling, `buildPattern` param threading,
  preview indexed render.
