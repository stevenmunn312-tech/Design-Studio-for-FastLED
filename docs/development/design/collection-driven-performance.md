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
modes — "intensity" as a *group input* is a separate, per-pattern knob (see §4),
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

### 4. Exposed group inputs — palette / speed / intensity

The opt-in contract: a pattern participates in modulation by exposing **named
group inputs** with reserved `paramId`s the generator recognises:

- `palette` (dataType `palette`)
- `speed` (dataType `float`)
- `intensity` (dataType `float`)

These are created the normal way (a `GroupInput` node inside the subgraph, wired to
e.g. a pattern's palette port / speed property driver). Convention over config: the
generator looks for `GroupInput` nodes whose `paramId` matches the reserved names
and feeds the corresponding analysis value; any the pattern doesn't expose are
simply not driven (graceful — that pattern just ignores that dimension).

**Preview** (`useGroupInputs` on): evaluate the group subgraph with a
`groupInputs` map `{ palette, speed, intensity }` built from `showStateAt`, reusing
the exact `Group`-node binding path in the evaluator. (Preview already has the
machinery; it currently renders via `PATTERN_NODE` synthetic graphs — collection
mode swaps in real subgraph evaluation.)

**Codegen** (`useGroupInputs` on): teach `showGenerator.buildPattern` to **not**
strip `GroupInput` nodes for the reserved ids; instead emit each `render_pN(ms,
palette, speed, intensity)` taking the modulated params, and have the controller
pass the current `SET_*`-derived values at call time. When off (or a pattern
exposes none), `render_pN(ms)` keeps its current self-contained signature.

This is where the bulk of the engineering sits — it's the same buffer-prefix /
helper-dedupe rewrite `buildPattern` already does, extended to thread a few
parameters through the generated function signature.

### 5. Firmware player — dispatch to render_pN

The collection-mode player merges two existing generators:

- **From `showGenerator`:** the `render_pN()` table + `renderPattern(i, ms[, palette,
  speed, intensity])` dispatch, compiled from the wired collection.
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

1. **Wiring + index scheduling (no modulation).** Add the `patternset` input;
   `generateShow` picks random collection indices; `.show` `version: 2` with
   `patternSet`; preview renders indexed subgraphs (self-contained); `SDCard`
   exports the merged `render_pN` player. Patterns render exactly as authored —
   `SET_PALETTE/SPEED` are emitted but unused. Ship + hardware-validate this first;
   it's the whole unification minus modulation.
2. **"Use group inputs" modulation.** The toggle; reserved `palette/speed/intensity`
   group-input convention; `buildPattern` threads params into `render_pN`; preview
   binds `groupInputs`; controller passes modulated values.
3. **Section-aware pattern selection.** Optional per-pattern section tags so the
   generator picks contextually, not purely at random.
4. **Editor polish.** Collection-aware `SET_PATTERN` dropdown; show which patterns
   expose which inputs.

## Open questions

- **Reserved paramId names vs. UI.** Convention (`palette`/`speed`/`intensity`) is
  simplest. Alternative: an explicit mapping UI on the Performance Generator
  ("drive *this* group input from speed"). Convention first; revisit if users want
  to map arbitrary inputs.
- **`intensity` semantics.** Is it a 0–1 master that the pattern interprets
  (brightness-ish, density, amplitude…), or do we standardise it? Proposal: pass a
  0–1 analysis-energy value and let each pattern decide how to use it — maximal
  flexibility, zero generator assumptions.
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
