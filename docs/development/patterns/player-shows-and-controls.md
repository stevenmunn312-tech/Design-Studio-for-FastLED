# Player, shows and controls

Music Player and its controls, per-output LED runtime, the order a control pass
runs in, pattern shows and transitions, and audio levels.

Moved out of the always-loaded `CLAUDE.md` so a session reads it only when
working in this area; record new patterns for this area here, not there. History
of the entries before the move: `git log -p -- CLAUDE.md`.

## Music Player

- The player is modelled as the appliance it is: `PatternMaster` (**Music
  Player**) holds the music and reports what it is playing, `PlayerControls`
  controls it. `PlayerControls` mints one input per job it has been given rather
  than declaring all fourteen: `src/state/playerControlAssignments.ts` owns the
  catalogue, the node carries a `controls` id list, and a drop on its trailing
  `add-control` socket is held as `pendingControlAssignment` until the picker in
  `PlayerControlsBody.tsx` names it — because nothing on the source side can (a
  Button's output is only ever `pressed`, so the Button Bank trick of naming a
  row after its target port does not mirror). **The minted port id is the
  function id**, unchanged from when they were declared in `NODE_LIBRARY`, so
  the evaluator, every generator, validation and the firmware needed no
  teaching; only whether the socket exists is new — keep it that way rather than
  giving rows ids of their own. The picker narrows twice, and both narrowings
  are deliberate. By **type**: it matches the source's dataType *exactly*,
  narrower than `portsCompatible`, because a button on Volume would set 0 or 1
  and nothing between. By **destination**: each function names the
  `PlayerControlDestination` kinds that act on it (a Music Player holds the
  track, the lamp and the collection and takes all fourteen; a Performance
  Generator holds the track and the lamp but not the cursor, since its patterns
  come from the timed show file; an LED output has a blackout and a dimmer; a
  Pattern Slideshow has a cursor and no transport), `controlChainSinks` says
  which kinds this bundle reaches, and `sensiblePlayerControls` intersects the
  two — so Play / Pause is not offered on a chain ending at an LED output, a
  port that would mint, wire, validate and do nothing. `ControlChainSink` in
  `codegen/playerDisplays.ts` is an *alias* of that same union rather than a
  second copy. By **one job per source**: `sensiblePlayerControls` takes a
  `SensibleControlContext` and offers nothing already held by that same source
  on that node, since a press is one event — a button wired to both Brightness
  Up and Brightness Down would fire +step and -step in the same frame and net to
  nothing; `sharedControlSourceIssues` in `validateGraph.ts` catches a route
  that bypasses the picker and wires the collision directly. A chain plugged
  into nothing yet is judged on type alone, since there is no destination to
  judge against and refusing everything would leave nothing to build with. Two
  ordering rules are load-bearing and were each wrong once: the row is added
  before the connection completes (or a Button Bank's own trailing socket names
  its row after `add-control` instead of the function), and
  `materializeButtonBankConnection` derives the target's ports through
  `effectiveInputs` rather than trusting `data.inputs`. A load unions the stored
  list with the functions its edges already land on, since a pre-feature save
  and a fresh node both present an empty list and only the wires tell them
  apart. A node doing both was tried and removed — see
  [auxiliary displays](../design/auxiliary-displays.md). Button debounce and
  rising-edge rules live once in `src/state/transportBridge.ts` so a press means
  one thing to the evaluator and to the player sketch.
- `src/state/songInfo.ts`'s `SONG_INFO_PORTS` is the one list behind the
  track-report outputs (title/artist/album/.../bitrate), but the node that
  spreads it is the **`SongInfo` unpacker**, not Music Player: the player
  publishes one `display` envelope (3 outputs total) and `SongInfo` opens it
  into a wire per field, so a player graph draws three sockets instead of
  sixteen and the unpacker appears only in a graph that genuinely wants a field
  on a cable. It takes the same envelope a panel does — that arm already carries
  a whole `SongInfo`, so nothing is defined twice — and reports **blanks** for
  any other source (a Slideshow, an RTC, nothing), because an unwired field must
  read as no music rather than as stale music. `playerControlGraph.ts` offers
  the sampled sources for custom-display widgets from `SongInfo` nodes *wired to
  the player*, resolved through `PLAYER_SONG_EXPRESSIONS`; requiring the wire is
  what stops an unwired unpacker reporting the track on a cable nobody
  connected. A normal sketch emits blanks (its Music Player is a black fill),
  and emits them as definitions rather than omissions since downstream code
  already names the symbols. Tag fields are read, never guessed from a filename:
  the device reads ID3 in `audio_id3data`, and the preview reads the same frames
  from a local track with `src/audio/id3Tags.ts` (ID3v2.2-2.4, then v1), an ID3
  title replacing the filename as it does on the board. Bitrate and a show
  transport's tags stay blank in preview, since the value only exists where the
  music does. In preview only, when no `ShowTransport` owns the player, the
  envelope's track falls back to `usePlayerTransport.localTrack` — the local
  playlist's currently open file, published by `LEDPreview.tsx` (title via
  `localTrackTitle`, mirroring `songResetFromFile` in
  `codegen/playerSongInfoCpp.ts`) — rather than reporting blank; firmware has no
  such fallback, since a device player has no local-playlist mode to fall back
  to.
- The player owns which pattern is playing, not the panel: `PatternMaster` keeps
  one `PatternSelectionState` per instance (`patternSelectionState` in
  `src/nodes/show/evaluate.ts`) and passes it into `evalPatternShow`, so the show's own
  advance and a user confirm move the same cursor. Physical intent becomes
  selection through the `PlayerControls` node — its
  `patternSelect`/`patternPrevious`/`patternNext`/`patternConfirm` inputs feed
  the evaluator's `PlayerControls` bundle, carried as `patternSteps` (whole
  detents; the encoder's raw count is converted where it's read) and
  `patternConfirm`, not through a display. `src/state/patternSelection.ts` still
  defines **active** (running) versus **highlight** (being looked at), wrapping
  at both ends, confirm-commits, and a cursor carrying both id and index so a
  reorder keeps playing the same pattern and a deletion hands its slot to the
  new occupant — do not reintroduce a bare `% count` or key show state on the
  pattern count. The result is published once, on the engine's `patternSelect`
  output (`patternselect` dataType, `PatternSelectValue`) and again inside its
  `display` envelope; a panel only displays it — it does not decide, and does
  not collect its own wire to the collection. Pattern browsing belongs to
  `PatternSlideshow`, not to Music Player: a player screen is transport only.
  `src/codegen/patternSelectionCpp.ts` emits the firmware half
  (`PATTERN_SELECTION_CPP`);
  `patternSelect`/`patternPrevious`/`patternNext`/`patternConfirm` are
  `PlayerControlAction` values in `playerSketchGenerator.ts`, and
  `_selSetActive` routes the generic (SD-decoder) player's own rotation through
  the same selection so a confirm changes what actually renders, not just what
  the panel reports. The player sketch must emit `PatternSel` when either an
  OLED Pattern Browser or physical pattern controls need it — tying the
  declaration to the browser alone generates `_sel_player` calls with no type or
  variable in a headless-control build. Collection reconciliation (the id/index
  cursor keeping a show on the same pattern across a reorder) stays deliberately
  browser-only: a device's collection is fixed at compile time, so there is no
  "underneath you" for it to change — see
  [generative pattern show](../design/generative-pattern-show.md#which-pattern-is-playing).

## Controls and LED output runtime

- Per-output blackout and dimming are wires, not project settings:
  `src/state/ledOutputRuntime.ts` resolves an output's `enabled`/`brightness`
  ports, defaulting unwired to lit/undimmed so adding the ports to an existing
  project can't black it out, and `applyLedOutputRuntime` copies the pooled
  `Frame` only when there's something to do — frames are shared across every
  consumer of the same upstream node, so dimming in place would dim other
  outputs' previews too. `src/codegen/ledOutputRuntimeCpp.ts` emits the firmware
  equivalent after an output's blit and before its `show()`, the one point every
  geometry branch (ring, corkscrew, crop, downscale, supersample, plain copy)
  has already converged on the physical array, using `nscale8_video` rather than
  `nscale8` (which crushes dim colors to black well before zero) and a separate
  `fill_solid` for blackout rather than brightness 0. HUB75 has no CRGB array to
  scale, so `hub75OutputRuntimeCpp` emits before the blit instead, through the
  driver's own `setBrightness8`/clear. A third port, `controls`, takes the
  `playercontrols` bundle — not a value but a *toggle* and a *delta*, so it
  needs a per-output latch (`blankLedOutputLatch`/`applyLedControls`, mirrored
  by `ledOutputLatchCpp` in `src/codegen/playerControlsCpp.ts`). All three
  combine rather than override: `composeLedOutputRuntime` ANDs blackout and
  multiplies level, so no port needs a precedence rule and an unwired one
  contributes its identity. An output reads only
  `ledToggle`/`brightnessDelta`/`brightness` (`LedControlSignal`, structural to
  avoid a cycle); play/pause, volume and pattern intent travel the same wire to
  a Music Player and are ignored here. That port is what makes a touch panel
  routable in a normal sketch: `playerControlsCpp.ts` gives `PlayerControls` its
  first emit case there, building the bundle from ordinary wires with the
  debounce/repeat numbers from `transportBridge.ts` and the detent size from
  `patternSelection.ts`, and `tftTouchServiceCpp` takes a *sink* (the player's
  transport functions, or a bundle local) so the hit geometry stays resolved
  once. `controlChainSinks` in `playerDisplays.ts` answers "does this bundle
  reach anything this generator can act on" in one walk — an LED output's latch
  counts, a Music Player in a plain sketch does not, because a normal sketch
  renders one as a black fill.
- The order a control pass runs in is stated once rather than left for each
  generator to restate: `CONTROL_PHASES` in `src/state/controlPhases.ts` names
  seven phases split into an **input** half (`sample-touch`,
  `snapshot-controls`, `sample-ir`), which must fully *close* before anything
  acts on it since every binding — including feedback crossing two screens — has
  to read one snapshot, and an **output** half (`resolve-graph`,
  `apply-destinations`, `publish-feedback`, `refresh-screens`), which may run
  more than once per pass (the SD player publishes and repaints on its
  track-advance exit as well as at the foot of the loop), so output phases are
  judged by where each *begins* rather than by their last occurrence. Each phase
  carries regex `anchors` matched against emitted sketch text rather than
  source, so `controlPhaseViolation(loopSource)` judges all three generators the
  same way instead of each carrying its own hand-listed ordering assertion;
  `src/codegen/__tests__/controlPhaseOrder.test.ts` runs it over what each
  generator actually emits — plus any generated compile fixtures under
  `artifacts/display-compile/` when present — and keeps a scrambled negative
  control proving the checker can fail. `sample-touch` and `snapshot-controls`
  both read the panel Enabled latch (`_cdPanelOn_<id>`) a full pass before
  `apply-destinations` writes it (`priorSample`) — deliberate, since evaluating
  the same expression at three sites that could disagree is worse than one frame
  of lag on the single frame a gate changes. See
  [direct controls and LED output status](../design/direct-controls-and-output-status.md#6-preserve-feedback-and-evaluation-order).
- `src/state/__tests__/directControlWorkflow.test.ts` is a workflow test rather
  than a per-rule one: it builds a single realistic graph (Juggle → LED String,
  a status OLED reading that output back, two pots — one on brightness, one on
  Juggle's speed — and a physical button on the panel's Enabled) and asks it the
  questions that matter between features rather than within one, since every
  rule involved already has a fixture that passes it in isolation. It asserts
  behaviour (preview/firmware agreement, property-input fallback-to-field when
  unplugged, survival of save/reload/undo, and naming what drives a wired
  property from the graph alone) rather than emitted text. It caught a real bug
  on its first run: an LED output's status read `node.data.label` directly, but
  nothing persists a node label — `normalizeLoadedGraph` overwrites it with the
  library default on every load, and the canvas instead derives the shown title
  at render time through `nodeDisplayLabel(nodeType, properties, fallback)` in
  `nodeLibrary.ts`, which maps an output's `form` through
  `LED_OUTPUT_FORM_LABELS`. So a status panel on an LED String reported "LED
  Matrix", on every evaluation, not just once. Both readers of a status title —
  the LED output's evaluator (`src/nodes/output/evaluate.ts`) and
  `cppGenerator.ts`'s `ledStatusEmit` — must resolve it through `nodeDisplayLabel` rather than
  `node.data.label`; a status panel's second row is `ledStatusCountText`
  (`ledOutputRuntime.ts`), count only, since the name is now correctly derived
  and doesn't need repeating. A third reader had the same bug:
  `mountedDisplays.ts`'s `documentDisplaySourceLabel`, which names a design's
  source beside the templates it suits in the display editor, read
  `source.data.label` directly and reported "LED Matrix" for a wired LED String;
  it now resolves through
  `nodeDisplayLabel(source.data.nodeType, source.data.properties, fallback)` the
  same way, falling back to the raw label only when the source isn't a
  recognised `DISPLAY_SOURCE_NODE_TYPES` kind.

## Shows, collections and transitions

- Pattern Slideshow (`PatternSlideshow` node type,
  `src/state/patternSlideshow.ts`) is the show engine for a collection with no
  music: `slideshowSettings` resolves its
  order/interval/transition/audio-reactive/seed properties once, read by both
  the evaluator and `showGenerator.ts`, so a wired interval overrides the
  property the same way on both sides. `isPatternShow`
  (`src/codegen/showGenerator.ts`) keys the pattern-show generator on this
  node's presence rather than on a Music Player with no card attached — the old
  condition made an incomplete player look like a working music-free show. That
  gap is now closed the other way too: a Music Player with no SD card and
  amplifier is a validation error (`showEngineIssues` in `validateGraph.ts`),
  not a silent stand-in for the slideshow. See
  [generative pattern show](../design/generative-pattern-show.md#pattern-slideshow).
- Pattern **author tags** (`src/state/patternTags.ts`, `SavedPattern.bestOn`)
  answer "where does this look best", which is taste and therefore authored —
  not "will this render", which is mechanical and almost always yes. They
  promote, never exclude: `best` sorts first, the untagged default `works` still
  appears in every search, and only a narrowly derived `poor` (content whose
  whole substance is a 2-D form — a clock face, a text banner; never a field or
  noise pattern, which reads fine along one row) is set aside, behind a count
  and a "Show anyway". So a tag on one pattern can never hide another, and
  untagged stays a correct answer rather than a gap. The three tags are coarser
  than `LedOutputForm` on purpose — a corkscrew is a ring, a HUB75 panel is a
  matrix — and `formTagForOutputForm` maps a bench output onto one, which is how
  the add-patterns dialog defaults its Output facet from `outputRoutes` on the
  root graph instead of asking. Tagging is a *curation* activity, so it lives
  where patterns are browsed (library context menu, Pattern Insights card) and
  the one-click saves stay one click; `savePattern` carries `bestOn` and
  `categoryId` across a `replaceByName` save because the tweak-and-resave loop
  must not discard curation. The picker's facets are OR-within/AND-across with
  counts computed excluding their own facet. See
  [generative pattern show](../design/generative-pattern-show.md#choosing-patterns-for-a-collection).
- **Transitions: a style is a pure inverse per-pixel sample.** Every A→B
  transition style is `(A, B, t, W, H) → pixel`, never a forward blit, particle
  system, or per-frame state — that contract is why the 3D styles needed no new
  plumbing (a perspective divide is the same shape as `zoom`'s linear scale). A
  style is spread across five registration sites and missing one fails quietly
  and differently each time: `src/nodes/show/evaluate.ts`'s `compositeTransition`
  (browser preview, falls through to crossfade if missing),
  `transitionHelperCpp.ts`'s `TRANSITION_HELPER_CPP` (show generator and SD
  player), the `Transition` emitter in `src/nodes/show/codegen.ts` (normal sketch),
  `performanceGenerator.ts`'s `TRANSITION_IDS` (numeric id), and
  `nodeLibrary.ts`'s `PROPERTY_META.transitionType` (option list/labels).
  `PROPERTY_META.transitionType.options` and `SHOW_TRANSITIONS` must hold the
  same names in the same order — `transition3d.test.ts` asserts the two arrays
  equal rather than trusting convention. Style ids are append-only, dense, and
  ascending because they're persisted in exported `.show` files, and the
  codebase derives an id two ways that only agree while the table stays dense:
  `performanceGenerator.ts` looks up `TRANSITION_IDS[name]` by value,
  `showGenerator.ts` looks up `SHOW_TRANSITIONS.indexOf(name)` by position — a
  gap or reorder makes a generated show pick the wrong transition with no
  runtime error. A style must reach A at `t=0` and B at `t=1` through the maths,
  not a runtime guard, since the generators emit a loop over runtime `t` with no
  way to branch on it; `transition3d.test.ts` checks both the guarded endpoints
  and guard-free convergence near `t=0`/`t=1`. Parity hazards: C++ `roundf` and
  JS `Math.round` break `.5` ties differently, so neither is used — coordinates
  floor and a channel is quantised once with `floor(v + 0.5)`; float
  (generators) versus double (evaluator) precision is an accepted,
  not-to-be-fixed divergence. The 3D styles sample bilinearly through one shared
  `sampleShaded`/`_sampleShaded` with the depth shade folded into the weights
  (quantise once, clamp out-of-frame neighbours rather than fading to black, and
  an integral coordinate still reads exactly one pixel so endpoint exactness
  survives); the pre-3D styles stay nearest-neighbour deliberately, since a
  uniform scale does not shimmer the way a rotation does and converting them
  would restyle existing shows. The show generator narrows
  `TRANSITION_HELPER_CPP` to only the styles in its pool by scanning for
  `    case N: {` at a fixed indent, so a new arm's braces must stay balanced
  with none inside comments; the SD player can't narrow and always emits every
  style. See [transition catalogue](../design/transition-catalogue.md).
- A collection show schedules patterns by *position*: `SET_PATTERN` carries an
  index into the show's own `ShowFile.patternSet` (version 2 shows only; version
  1 enum shows use `params.name` and have none). `buildShowPayload`
  (`src/utils/showUpload.ts`) compiles the player's one `render_pN` table from
  the *first ready show's* `patternSet` alone, so every packaged show must share
  one vocabulary — a second show generated against a different collection would
  map its indices onto the first show's patterns and play the wrong thing in
  sync. Because `patternSet` already records that vocabulary, drift is a
  comparison, not a timestamp: `src/state/showFreshness.ts`'s
  `showFreshnessIssues` compares stored shows against the wired collection and
  the live pattern-group registry, and `buildShowPayload` refuses rather than
  warns — `showPackagingIssues` is the one funnel the deploy popup calls, so the
  refusal reads as a sentence rather than a dead button. A hand-edited show
  (`edited: true`) is deliberately never auto-regenerated, which is why its
  repair message names Revert instead of the generator; `regenerateShow`
  (musicStore) reads the wired collection live, so `PerformanceGeneratorBody`'s
  regenerate effect keys on it as well as the generator's own options. See
  [collection-driven performance](../design/collection-driven-performance.md).

## Audio levels

- VU meter levels are gated and scaled in exactly one place per side of the
  browser/firmware split, not re-derived at each measurement site:
  `src/audio/stereoLevels.ts`'s `VU_RMS_NOISE_GATE`/`VU_RMS_REFERENCE` condition
  every browser producer of `leftLevel`/`rightLevel` (live capture, decoder
  preview, baked envelope), and `src/codegen/stereoLevelCpp.ts`'s
  `vuNormalizedLevelCpp` emits the matching C++ from those same constants.
  `audioEngineCpp.ts`'s PCM1802 capture and `playerSketchGenerator.ts`'s decoder
  tap both call that one emitter instead of measuring raw RMS themselves — the
  decoder tap read roughly four times lower than every other producer of
  `_audioLeftLevel`/`_audioRightLevel` before this emitter existed, because it
  was the one path applying no gate/reference at all. The decoder tap has a
  second, independent attenuator: ESP32-audioI2S scales decoded PCM by
  `volumetable[vol]/64` (its own 22-entry table) in `Gain()` before the tap ever
  sees a sample, so the rails tracked the volume knob while a mic or line input
  on the same fixture kept metering its source — bench-measured at the default
  volume of 18 as 48/64 = 0.75 low. `vuNormalizedLevelCpp`'s `rmsScaleExpr`
  option multiplies the RMS *before* the gate is subtracted (folding it into
  `gainExpr` instead would scale a level the gate had already been subtracted
  from), and `playerSketchGenerator.ts` mirrors the library's table as
  `DECODER_VOLUME_TABLE`, states the starting `_decoderVolumeComp` as a constant
  in setup, and recomputes it alongside `audio.setVolume()` whenever a controls
  build changes volume at runtime — so the compensation can't drift out of step
  with the knob. The mono FFT feed is deliberately left uncompensated: it rides
  FastLED's own adaptive normalization and has no absolute scale to preserve,
  unlike a meter.
- A renderer with a planned cross-language twin is frozen with golden-vector
  tests, not eyeballed: `src/state/__tests__/stereoVuGoldenVectors.ts` holds the
  fixed input fixture (`STEREO_VU_GOLDEN_STEPS`, `STEREO_VU_GOLDEN_PROPERTIES`)
  in its own module, separate from `stereoVuGolden.test.ts`, so a future C++
  replay harness can import the same steps instead of restating them — a parity
  test is only meaningful if both sides answer the identical question. Recorded
  output lives in a sibling `.vectors.json` and is regenerated only deliberately
  (`STEREO_VU_UPDATE_GOLDEN=1 npx vitest run <file>`), never by letting a
  failing test rewrite its own expectation. Steps are timed to land
  mid-behaviour — partway through a release, just past a hold, before a trail
  settles — rather than after values stabilize, since a settled comparison can't
  tell a broken ballistic from a correct one.
