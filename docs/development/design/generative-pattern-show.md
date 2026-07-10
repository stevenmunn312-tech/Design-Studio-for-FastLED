# Generative pattern show — design note

Status: implemented (phases 1–4 shipped; see `CLAUDE.md` for current behavior) · Owner: app · Date: 2026-06-26

How the studio should author a **generative pattern show** — a matrix that
endlessly picks from a large set of patterns and transitions, the way the
user's hardware already runs (60+ patterns, ~12 transitions, random pick +
random transition on a min/max timer modulated by beat/drop). This is a third
authoring path, **distinct from** the live single-graph flow and the music-sync
SD flow (`MusicLibrary → PerformanceGenerator → SDCard`).

## Goals

- Build a pattern, like it, **save it**, and have it accumulate into a personal
  library over time.
- Assemble a **subset** of saved patterns and let the matrix run them as a
  random show with styled transitions and configurable triggers.
- Keep the canvas uncluttered even with dozens of patterns.
- Patterns stay **individually audio-reactive** (the matrix has a mic).

## Non-goals

- Replacing the single-pattern flow. A lone pattern wired to `MatrixOutput`
  still compiles/uploads just that pattern, unchanged.
- The music-sync SD pipeline. That stays separate.

## Model

Three distinct concepts (Library ≠ Collection):

1. **Library** — a persistent vault of saved pattern groups. Save a named group
   and it appears in the sidebar beside the built-in nodes; it survives across
   sessions and grows over time. **Storage: `localStorage`** first (works on the
   plain static site, no backend needed); a backend/export path can come later.
2. **Collection** — a *subset chosen from the Library* for one show. The on-canvas
   Collection node "absorbs" patterns into an internal list (the declutter win),
   reusing the existing group/subgraph machinery, and outputs a new `patternset`
   data type.
3. **Pattern Master** — the show engine. Inputs: a `patternset`, a chosen pool of
   transitions (from the existing 16), and trigger options (min/max dwell time,
   on-beat, on-drop). It runs the random show, and because it's stateful it can
   play that show **live in the preview**. Output → `MatrixOutput`.

```
[Library]  --drag-->  (pattern groups on canvas)
                              |
                     Collection node  --patternset-->  Pattern Master  --frame-->  Matrix Output
                              ^                              ^
                       (absorbs patterns)            (transition pool + triggers)
```

### Audio

- **Patterns react to the mic individually** — the user tunes a pattern to suit a
  section of audio. So each generated `render_<name>()` gets the shared
  mic-derived globals (`bass/mids/treble/beat`), not only the controller. In the
  live preview this is free: patterns already read the audio store.
- **Beat/drop triggers gate on audio** — Pattern Master only offers the on-beat /
  on-drop trigger options when an audio source is wired; time-based (min/max
  dwell) otherwise.

## Codegen target

Today `cppGenerator` emits a single flat `loop()`. The show needs:

- **One `render_<name>(CRGB* leds, uint32_t ms)` per pattern**, each compiled from
  its pattern subgraph standalone.
- A controller **`.ino`** holding the pattern table, current/next index, the
  min/max-timer + beat trigger logic, and a transition state machine that
  reuses the 16 transition effects' existing C++ emitters to composite the
  outgoing/incoming patterns.

_As shipped:_ `src/codegen/showGenerator.ts` implements this as a single
controller file (one `render_pN()` per pattern plus the dispatch/transition
loop) rather than emitting a separate `.h` per pattern — see *Show codegen
(Phase 4)* in `CLAUDE.md`. Multi-file `.h`-per-pattern output remains an
unshipped follow-up if flash-size or build-time pressure ever calls for it.

## Phased rollout

1. **Library** ✅ — save a named group to `localStorage`; a "My Patterns" sidebar
   section; drag to instantiate; rename/delete. A `patternLibrary.ts` store so
   later phases read the same source. *(Self-contained — no codegen / Pattern
   Master changes.)*
2. **Collection node** ✅ — absorb patterns into an internal list; `patternset` data
   type; declutter.
3. **Pattern Master upgrade** ✅ — `patternset` input, transition-pool selection
   (via a wired `TransitionSet`), beat trigger (audio-gated); live random-show
   preview.
4. **Codegen** ✅ — per-pattern `render_pN()` functions + the controller `.ino`
   (random pattern + random transition on triggers, beat-triggered particle
   overlay), as a single file rather than per-pattern `.h`s (see above).

All four phases are implemented; only the basic time-based crossfade path has
been hardware-validated (see `CLAUDE.md`).

## Open questions / later

- Backend-backed (shareable) library + export, beyond `localStorage`.
- Per-pattern weighting or tags (e.g. "calm" vs "drop") for smarter random picks.
- Whether Collection and Pattern Master should merge once the dust settles.

## Relationship to existing nodes

`PatternMaster` (cycles 4 inputs, time/beat) and `Sequencer` (cycles 4 inputs,
crossfade) are the seeds of Pattern Master; this supersedes the 4-input cap and
the crossfade-only limitation, and reaches the 16 transition styles. `Transition`
stays the manual two-input A→B primitive.
