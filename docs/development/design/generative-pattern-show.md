# Generative pattern show — design note

Status: implemented (phases 1–4 shipped; current behavior is defined by code and tests) · Owner: app · Date: 2026-06-26

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
   sessions and grows over time. As shipped, browser-local state is the first
   cache layer and the local helper mirrors user patterns into JSON files when
   it is available.
2. **Collection** — a *subset chosen from the Library* for one show. The on-canvas
   Collection node "absorbs" patterns into an internal list (the declutter win),
   reusing the existing group/subgraph machinery, and outputs a new `patternset`
   data type.
3. **Music Player** — the show engine. Inputs: a `patternset`, a chosen pool of
   transitions (from the existing 16), optional beat/drop triggers, optional
   `playercontrols`, and optional `playerparticles`. It runs the random show,
   and because it is stateful it can play that show **live in the preview**.
   Output → LED output.

```
[Library]  --drag-->  (pattern groups on canvas)
                              |
                     Collection node  --patternset--┐
Player Controls  ----------------------controls----┼-->  Music Player  --frame-->  LED output
Player Particles --------------------particleFx----┘          ^
                                                    transition pool + beat triggers
```

### Which pattern is playing

`src/state/patternSelection.ts` is the one definition of *which pattern*, and it
exists because four things need to agree about it and none of them can see each
other: an encoder turning on a panel, the OLED Pattern Browser drawing what it
selected, this show advancing on its own, and the SD player doing the same on a
device with no app attached.

The model is a browser sitting over a player. **Active** is the pattern that is
running. **Highlight** is the one you are looking at. They are the same until
something moves the highlight, and they converge again when you either confirm
it or stop touching it for `PATTERN_BROWSE_TIMEOUT_MS`. Without that split,
scrolling past a pattern would play it — which is how you get a strobe you never
asked for while hunting for something else.

The rules the four callers would otherwise each invent:

- **Wrapping.** Past the end goes to the start, and before the start goes to the
  end. A shaft that keeps turning and does nothing reads as broken, and an
  encoder has no ends to hit.
- **Confirmation.** A press commits the highlight. Confirming what is already
  playing is not a change but still ends the browse, which is what a press means
  when you land back where you started.
- **Ordering.** An auto-advance and a press landing on the same frame resolve in
  the user's favour, rather than by whichever branch happens to run first.
- **The collection changing underneath.** A cursor carries both an id and an
  index, and each covers the other's blind spot. The id survives a reorder, so
  dragging a pattern up the list does not change what is on the LEDs. The index
  survives a deletion, so removing the running pattern hands its slot to
  whatever took it rather than dumping the show back at the top.

That last rule is why this landed as shared code rather than as a helper inside
the show. The show's state used to be keyed on the pattern *count*, so adding or
removing one pattern restarted the whole show at a random pattern with a fresh
dwell — editing a collection interrupted the show you were editing it for.

An encoder's running count is not a step: the generated decoder counts every A/B
transition, so one detent of a KY-040 is four counts, and stepping per count
scrolls four patterns per click. `encoderSteps` divides by a caller-supplied
`ENCODER_COUNTS_PER_STEP`, because the browser's encoder body produces mouse
drag rather than quadrature and the two are genuinely different units. It also
ignores the first reading — a graph that loads with its encoder parked at 37 has
not asked for anything — and treats a jump beyond `ENCODER_RESEAT_COUNTS` as a
re-seat rather than travel, which is what Reset On Press slamming the count to
zero looks like.

**Firmware.** On a device the collection is fixed at compile time, so
reconciliation is browser-only by construction; wrapping, confirmation and the
active/highlight split are the shared half. Those land in generated code when
the Pattern Browser gives them an input to read — emitting them before there is
a caller would be a second definition of the same rules, which is the thing this
module exists to prevent.

### Physical player controls

`PlayerControls` is the semantic boundary between physical inputs and playback.
Buttons, potentiometers, and encoders wire into named play/pause, previous,
next, volume, LED power, and brightness inputs; one `Controls` output wires to
Music Player. Controls nodes can be chained through `controlsIn`, so a control
panel can be assembled in sections without adding ports to Music Player.

Transport commands and LED toggle are rising-edge events. Absolute volume and
brightness are normalized values; up/down inputs produce deltas. Do not combine
an absolute input and up/down inputs for the same setting in one controls chain:
the absolute source continually reasserts its position, so graph validation
warns about that mapping.

This bundle is also the contract future touch/display controls should emit. The
Music Player does not need separate physical-button and touch-screen APIs.

### Particle overlay

`PlayerParticles` owns the beat-particle overlay's enabled state, colour,
random-colour and random-style choices, style, and intensity. Its `Particle FX`
output wires to Music Player's `particleFx` input. The existing beat input on
Music Player remains the trigger, so users do not have to duplicate the beat
wire. This is an overlay configuration bundle, distinct from the standalone
Particles frame generator.

### Audio

- **Patterns react to the mic individually** — the user tunes a pattern to suit a
  section of audio. So each generated `render_<name>()` gets the shared
  mic-derived globals (`bass/mids/treble/beat`), not only the controller. In the
  live preview this is free: patterns already read the audio store.
- **Beat/drop triggers gate on audio** — Music Player only offers the on-beat /
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
loop) rather than emitting a separate `.h` per pattern. Multi-file
`.h`-per-pattern output remains an
unshipped follow-up if flash-size or build-time pressure ever calls for it.

## Phased rollout

1. **Library** ✅ — save a named group into the Pattern Library; drag to
   instantiate; rename/delete; organize into shelves. The shipped flow uses
   `patternLibrary.ts`, caches locally in the browser, and mirrors user
   patterns into helper-backed JSON files when available. *(Self-contained —
   no codegen / Music Player changes.)*
2. **Collection node** ✅ — absorb patterns into an internal list; `patternset` data
   type; declutter.
3. **Music Player upgrade** ✅ — `patternset` input, transition-pool selection
   (via a wired `TransitionSet`), beat trigger (audio-gated); live random-show
   preview.
4. **Codegen** ✅ — per-pattern `render_pN()` functions + the controller `.ino`
   (random pattern + random transition on triggers), as a single file rather
   than per-pattern `.h`s (see above). Player Controls and Player Particles are
   compiled as explicit optional input bundles.

All four phases are implemented. Hardware validation now covers the controller
show path, the full transition pool, and the on-device microphone/beat-triggered
particle overlay flow; see `docs/release/beta-support-matrix.md`.

## Open questions / later

- Broader sharing/distribution beyond the current helper-backed local JSON
  mirroring.
- Per-pattern weighting or tags (e.g. "calm" vs "drop") for smarter random picks.
- Whether Collection and Music Player should merge once the dust settles.

## Relationship to existing nodes

`PatternMaster` remains the internal node type for Music Player. `Sequencer`
(cycles four inputs with crossfade) is the smaller fixed-input alternative;
Music Player instead consumes a Pattern Collection and can use all 16 transition
styles. `Transition` stays the manual two-input A→B primitive.
