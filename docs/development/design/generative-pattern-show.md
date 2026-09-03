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

### Who owns the selection

The player. Not the panel.

The first build of the Pattern Browser put `Select` and `Confirm` on the Info
Display and let it keep its own cursor. It worked as a picture and failed as a
model: the display knew which pattern you had chosen and nothing else did, so
confirming changed what the panel *said* while the LEDs carried on with the
show's own rotation. A display describing something the hardware is not doing
is the exact failure this project keeps designing against, and pointing the
ports at the display is what caused it.

The same rule that settled Transport Control settles this. The player holds the
patterns, so the player owns which one is playing. Controls control it. The
display displays it.

```
Encoder ─┐
Buttons ─┼─► Player Controls ──playercontrols──► Music Player ──patternselect──► Info Display
         ┘                                            │
                                                    frame
                                                      ▼
                                                  LED output
```

**Player Controls** grows the physical half, beside the volume and brightness
inputs it already carries. That is what the node is for: it is where physical
inputs become intent. A knob is not a selection and a button is not a command
until something says so, and having one node say it is what stops a display, a
player and a firmware generator each deciding separately what a press meant.

| Input | Type | Physical source |
| --- | --- | --- |
| Pattern Selection | `float` | rotary encoder position |
| Previous Pattern | `bool` | button |
| Next Pattern | `bool` | button |
| Confirm | `bool` | encoder push, or a button |

Buttons and an encoder both arriving is deliberate, not redundant: a panel
build may have three buttons and no encoder, and the `playercontrols` bundle
already carries both shapes for the transport (`next` beside `volumeUp`).

**Music Player** grows one output, `Pattern Select`, carrying the whole
selection — active, highlight, ordinal, count, and whether a browse is open.
Technically it is I/O: the commands arrive on `controls` and the resulting
selection leaves on `patternselect`, which is what makes the round trip
visible on the canvas rather than hidden in a display's private state.

**Info Display** loses `Patterns`, `Select` and `Confirm` and gains one
`Pattern Select` input. The panel stops deciding anything. It also stops
needing its own wire to the collection: the selection names the player, and the
player already has the patterns, so the thumbnails bake against that collection
rather than a second one the display was pointed at separately.

The rest follows from that. Confirming drives playback because the player owns
the cursor it is confirming. Two panels wired to one player agree, because
there is one cursor rather than two. And the SD player's encoder stops being a
special case: it reaches the selection the same way every other control does,
through the bundle it already builds.

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

## Pattern Slideshow

Status: added 2026-08-29.

The same show, without music. `PatternCollection -> PatternSlideshow ->
MatrixOutput` runs a collection on a timer for people who want slow, relaxing
patterns on a wall and have no card, no amplifier and no interest in a
transport.

The engine for this already existed and had no node. `showGenerator.ts` has
always played a collection with dwell and transitions and needed neither SD nor
audio, but the only way to reach it was a Music Player with no card attached —
a node labelled **Music Player**, whose every port is music, standing in for the
music-free case. Nobody would find that, so nobody did.

**What is different from Music Player**, and why:

- **Order is a choice.** Random or sequential. The generative show is random by
  design; a slideshow of patterns you arranged in an order you liked should be
  able to play them in it.
- **One interval, not a min/max pair.** The randomised dwell exists to keep a
  beat-driven show from feeling metronomic. A slideshow has no beat to feel
  metronomic against.
- **Transitions are optional, with a fade built in.** Off means a cut. On with
  nothing wired means a fade, rather than requiring a `TransitionSet` to get the
  one transition everybody wants first.
- **Audio is live-only and off by default.** A music-free player has no decoder
  to tap, so its `audio` accepts a microphone or a line input and nothing else.
  Reactivity is an explicit switch because the whole point of the mode is slow
  relaxing patterns, which should not twitch at room noise unless asked.
- **Pattern changes are immediate.** No highlight-then-confirm. The Slideshow
  still owns a `PatternSelectionState` for the same reasons the player does — a
  reorder must not change what is playing, and a deletion hands its slot to the
  new occupant — but a control that says "next" moves what is running, not a
  cursor waiting on a confirm. There is no separate active/highlight split to
  show, which is what the browser layout's `SELECT?` row exists for.
- **Master Speed changes motion, not the programme.** Slideshow intervals and
  transition durations are wall-clock seconds. The preview and generated
  controller keep an unscaled elapsed clock for those decisions and pass a
  separate accumulated animation clock into collected patterns. A speed of
  zero therefore freezes motion inside the current/outgoing/incoming patterns
  without freezing the changeover itself. The generated controller supports
  the Master Speed node's slider; a wire feeding Speed remains a validation
  error until the fixed controller template can emit that root control graph.

**The generator moves with it.** `isPatternShow` keys on `PatternSlideshow`
rather than on a Music Player that happens to lack a card, so the three
generators are told apart by which node is present rather than by which hardware
is absent. A Music Player is now the SD-player workflow only: without a card it
is an incomplete build, and validation says so and names the Slideshow.

It publishes a `display` output like the other sources — see [simple
displays](simple-displays.md) — which is what a small OLED or a segment module
plugs into to say which pattern is running.

## Choosing patterns for a Collection

Filling a Collection is a browsing job, not a build job, and the add-patterns
dialog is where the Library's size stops being an asset. Its controls are
facets — chips, OR within a facet and AND across facets — so "LED String +
Audio Reactive" narrows the way it reads. Sort stays a `<select>`, because
ordering genuinely is one-of-four. Every chip carries a count computed with its
own facet excluded; a chip that read zero while you filtered on it would make a
narrowed list look like a thin library, which is the failure mode that makes
faceted search feel broken.

### Where a pattern looks best is authored, not measured

`src/state/patternTags.ts` holds one small vocabulary — `string`, `matrix`,
`ring` — and `SavedPattern.bestOn` holds the author's claim about their own
pattern.

The temptation is to derive this: render the pattern at `N x 1` and at `W x H`
and decide. That answers a different question. *Will it break* is mechanical and
almost always "no" — Juggle reads well on a string, a matrix and a ring alike.
*Where does it shine* is taste, and the only person holding it is the author,
who has just spent an hour looking at the thing on one particular output. So the
tag is authored, and it **promotes rather than excludes**:

| state | source | in a search for that output |
| --- | --- | --- |
| `best` | the author said so | sorted to the top |
| `works` | **the default** — untagged | shown under "Also works here" |
| `poor` | derived | set aside behind a count and a "Show anyway" |

Untagged is the common and correct answer, which is what lets an optional tag
system survive: the tagged patterns float, and every other pattern behaves
exactly as it did before anyone tagged anything. A tag on one pattern can never
hide another.

Only `poor` is derived, and deliberately narrowly: content whose whole substance
is a two-dimensional form (a clock face, a text banner, a wireframe) has no
one-line reading at all, while a plasma or a noise field sampled along one row is
still a plasma and must never enter that set. A rule nobody asked for should fire
rarely. An author naming an output beats the derivation for that output and only
that one.

The three coarse tags are not the five `LedOutputForm` values, because a ring and
a corkscrew are both a chain read around a seam and a HUB75 panel is a matrix in
every sense a pattern can perceive. `formTagForOutputForm` maps a real bench
output onto the tag it answers to, which is how the dialog defaults its Output
facet from `outputRoutes` on the root graph rather than asking the user what they
are building for.

### Tagging is curation, not authoring

The editing surfaces are the ones reached while *browsing*: a bulk toggle in the
Library's context menu that states the whole selection (on / mixed / off), and a
chip row beside the star rating on each Pattern Insights card. The create-group
dialog also asks, because it is the one save path that already stops for a name.

The three context-menu saves stay a single click. A modal on the tweak-and-resave
loop gets dismissed by the third iteration, and a dismissed question tags
nothing — while save time is also the worst moment to ask, since the author has
only ever seen the pattern on their own output. `savePattern` therefore carries
`bestOn` and `categoryId` across a `replaceByName` save: curation is not content,
and re-saving an edited pattern must not silently discard it.

Bundled patterns are curated in `bundledPatterns.ts` and read-only here, the same
way their name and shelf already are.

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
