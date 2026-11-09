# v1.0.0 implementation backlog

Single active checklist for `main`. Restructured
2026-09-24 and reconciled against every document under `docs/` on 2026-10-07.
The full history of every item up to 2026-09-24, with its evidence narrative,
is in [the archived backlog](docs/archive/hardware-todo-to-2026-09-24.md); item
ids are unchanged, so links to "root todo, HW-nn" still name the same work.

## How this list works

- **Sections run in order of progression:** finish section 3 before the
  release track, and gather bench evidence while the release track runs;
  section 6 waits until after v1. New parts keep landing
  through the [hardware expansion roadmap](docs/plans/hardware-expansion-roadmap.md),
  each experimental until its bench row in section 4.
- **Engineering items close on software**, plus a compile where the item
  changes firmware. They do not wait for hardware. Compiles run on Arduino CLI
  alone until fbuild upkeep (section 5) resumes. Run fixture compiles one at a time;
  overlapping runs corrupt the arduino-cli cache.
- **Hardware nobody here owns is not a blocker.** A feature ships marked
  **experimental** in the [support matrix](docs/release/beta-support-matrix.md)
  and graduates when a dated bench row lands, from the maintainer or from
  community testing. A bench gate may hold back implementation only where the
  facts cannot be known without measuring, such as the controller or pinout
  of an unbranded clone board.
- **A new part starts with its Blender model.** Modelling from datasheet
  dimensions is the first step of implementing a part, not a precondition
  waiting on someone else.
- Contracts live in design notes, evidence in reports and support rows. Remove
  an entry once its outcome is recorded, and route details through
  [docs/index.md](docs/index.md).

## 3. Engineering before the release track

HW-32 (frame performance) is under [Completed](#completed); its bench rows are
in section 4.

- [ ] **FastLED upgrade to 3.10.8 (M).** Both engines pin
  `_FASTLED_VERSION`, **3.10.8** since 2026-10-27 (3.10.5 before). As
  released, 3.10.7 and 3.10.8 cannot build ESP32-C3/C6:
  `platforms/esp/32/interrupts/riscv.hpp` declares its functions
  `FL_NO_EXCEPT` (`noexcept` on ESP) and `riscv.cpp.hpp` defines them without
  it, a hard GCC error on both engines (fbuild `ethernet/c3@esp32c3`,
  2026-10-24). FastLED fixed it on `master` (`528a6fdbe`, #4831); the helper
  applies that fix to both engines' copies (`_patch_fastled_riscv_noexcept`).
  Drop the patch at the first release that has it. Nothing has compiled on
  3.10.8 with the patch yet; the steps below are still to do. Source diffs 3.10.5→3.10.8 already clear the preview ports:
  2-D/3-D `inoise8`/`inoise16`, `ColorFromPalette`, `blur1d`/`blur2d`,
  `hsv2rgb_rainbow` and the lib8tion math are unchanged in effect, and
  `nblendPaletteTowardPalette` only gained an early return for a budget of 0,
  which codegen never passes (a blend of 0 is a straight cut). On the upgrade:
  - Arduino CLI compile of every family on the new release (the first
    compile installs it), ESP32-C3 and C6 included, and record the ESP32
    flash and RAM drop 3.10.7 promises.
  - Recheck what is not pure source: `FastLED.delay` and `show()` pacing
    ([loopPacing.ts](src/codegen/loopPacing.ts)), the ESP32 I2S microphone
    format and the SAMD ISR naming
    ([audioEngineCpp.ts](src/codegen/audio/audioEngineCpp.ts)), the ESP32
    microphone profiles ([micModules.ts](src/state/peripherals/micModules.ts))
    and `chipsetSendMicros` ([wireTime.ts](src/utils/wireTime.ts)). Then move
    their "FastLED 3.10.5" comments and test names to the new release. Default
    buses and driver choices are done (2026-10-27): 3.10.8 selects parallel
    engines as `Bus::FLEX_IO` plus an instance, and the classic ESP32 has no
    parallel clockless driver until upstream declares one, so its I2S choice
    is gone ([board capabilities](docs/architecture/board-capabilities.md#choosing-the-driver)).
  - SAMD51: 3.10.6 fixed the compile break from 3.10.4, hardware SPI and the
    I2S clash upstream. Try a SAMD51 build without
    `_patch_fastled_samd51_build` and the audio workaround; drop each part the
    build no longer needs.
  - ESP8266 on the bench: `addLeds()` on GPIO12 no longer hangs, and the
    `D1`-style pin constants work.

### Node review follow-ups

From the 2026-11-09 review of every library node (235). The ten bugs it
found that were confirmed in code are fixed (`aedaa095`), and on 2026-11-10
the rest of its suggestions were checked against the code and most landed
(see CHANGELOG). What follows is what was left: each item needs a product
decision, a bench part, a by-ear check or a larger rework, and most carry a
note on what was found. Merges, renames and removed properties change saved
shapes: land them before the HW-18 format freeze, or drop them.

New firmware from that pass has not been compiled yet. Before the freeze,
compile one fixture each for: DMX and DDP Live, Presence `connected` and mm,
Keypad keys and Digit, Touch Pad pads, Accel Shake, the Code node's a/b
block, Encoder clicks (`CtlDetent` with `lroundf`), demo drums, the envelope
clock, Beat Phase, Schedule Trigger's DateTime, Saturation Keep Brightness,
Frame Warp motion, the shared trail knob, Game of Life's period-2 reseed,
Plasma Scale, Field Warp bilinear sampling, Path speed, Text Base, and the
Music Player seed.

#### Inputs, hardware, graph and code

- [ ] **Category: Move DMX512 and DIN MIDI hardware to bench parts (Med, M).**
  Every other physical input is a bench part with auto-assigned pins, but
  DMX512 and DIN MIDI keep raw pin sliders and a user-picked UART on library
  nodes. Mirror the Audio to Microphone model: bench parts for the RS-485
  transceiver and MIDI wing, UART allocated automatically, and drop
  `dmxPort`/`midiUart`. Evidence `src/nodes/input/definitions.ts:451`,
  `src/build/hardwareManifest.ts:1502`. Still open: it needs bench entries
  (and verified renders) for the MAX485 board and the MIDI FeatherWing, and a
  UART allocator. Meanwhile `midiUartValidationIssues` refuses a DIN UART the
  radar, DMX512, the DFPlayer or a second jack already reads.
- [ ] **Category: Optionally merge TouchButton and Motion into Button
  (Low, M).** ButtonInput, TouchButtonInput and MotionInput are all one
  digital line, and TouchButton already derives active level from `partId`.
  Only worth doing together with the Button/ButtonBank merge; the distinct
  port names read well otherwise. Evidence `src/codegen/controlInputCpp.ts:65`.
- [ ] **Button: Make Button a one-row Button Bank (Med, M).** Button Bank is a
  strict superset (per-row name, pin, pull-up, identical `pinMode` and
  `digitalRead` code). Make Button a bank that starts with one row and offers
  "Add button", so one node and one shelf entry cover both and a single
  button grows without rewiring. Evidence `src/state/player/buttonBank.ts:7`,
  `src/codegen/controlInputCpp.ts:56`. Still open: retiring `ButtonInput`
  reaches about 36 source files (player and show firmware bindings, pin
  retargeting, board links, templates, the deck) and 59 test files. The bench
  now adds a Button Bank with its first row on a pin
  (`firstButtonBankRow`), which the merged Button would reuse.
- [ ] **RTC Clock: Handle daylight saving time (Med, M).** NTP time is UTC
  plus a fixed minute offset, so clocks and Schedule Triggers are an hour off
  for half the year in DST regions. Offer a region/time-zone picker that
  emits a POSIX TZ string (`configTzTime` on ESP32). Evidence
  `src/state/peripherals/rtc.ts`, `src/codegen/peripherals/rtcInputCpp.ts`.
  Still open. The shape: a curated zone list mapping labels to POSIX strings;
  a pure POSIX-rule evaluator for the preview (`Mm.w.d/time` rules) held to
  `Intl` in tests; `configTzTime` on ESP32 and `configTime(tz, server)` on
  ESP8266 in the `FLS_NET_SNTP` branch; and a generated rule function for the
  UNO R4 WiFi branch, which runs its own SNTP and applies the offset itself.

#### Audio and audio-reactive

- [ ] **Category: Rename the `energy` property and port to `reactivity`
  (Med, M).** Every audio pattern relabels `energy` as "reactivity"
  (`src/state/nodeLibrary.ts:3301`), so the stored id matches Audio
  Features' peak-relative Energy output and invites Energy → Reactivity
  wiring (about 20 bundled-pattern edges and the Vocal Aurora help example
  do this). Rename the id and port (pre-1.0, so no migration needed) so
  choosing Energy or Loudness becomes a deliberate wire. Left open: the
  fourteen promoted saved graphs (`bundledSavedAudioPatterns.ts`) must stay
  byte for byte, and several carry `energy` properties and edges, so a
  rename needs a decision on how their copies are converted; the show
  engines' `useGroupInputs` also feed a pattern's `energy` input by name.
- [ ] **Category: Remap Speed so the current look sits mid-slider (Med, M).**
  BassRings, MidrangeWaves, MidrangeBloom, TreblePrism, AudioCascade,
  KickShock, VocalAurora, BeatKaleidoscope, SpectraMosaic, EmberPulse,
  TurbulentBloom, GravityWell, RainRipples and PrismStorm default `speed`
  to 1.0 on a 0–1 slider, leaving no room to go faster. Remap so the
  current look is 0.5 (internal rate = 2 × slider) and update saved values
  and bundled patterns. Evidence `src/state/nodeLibrary.ts:583`. Left open:
  many bundled patterns wire Map Range or audio levels into these speeds,
  and the promoted graphs cannot be edited, so a remap changes tuned looks
  unless every wired range is halved too; needs a by-ear check.
- [ ] **Category: Add an optional Audio input to the band patterns (Med,
  M).** Every band pattern needs Mic → FFT Analyzer → pattern. Spectrum
  Visualizer's Three Band style already falls back to the spectrum thirds
  when its band ports are unwired. Give the band patterns an optional Audio
  input with the same fallback so a first patch is one wire; keep FFT
  Analyzer for gain, smoothing and tilt. Evidence
  `src/nodes/audioReactive/evaluate.ts:1158`. Left open (size): about
  fourteen evaluators and emitters. Three Band now eases its unwired thirds
  (keepOver in `nodes/shared/envelopeClock.ts`) and FFT Analyzer analyses at
  a fixed 24-bin split (`FFT_ANALYSIS_BANDS`); a shared helper doing both
  with per-node state, the port declared last so splicing is unchanged, and
  `dropConnections` auto-wiring it would make a first patch one wire.
- [ ] **Category: Standardise colour inputs on Palette plus optional Color
  (Low, M).** Gravity Well uses a Color port plus R/G/B and no palette,
  Beat Flash uses a `'none'` palette sentinel plus R/G/B, Dance Flash is
  R/G/B only, and Ember Pulse is a fixed HeatColor ramp. Move all four to a
  Palette port plus an optional Color port. Evidence
  `src/state/nodeLibrary.ts:740`. Beat Flash is done: a Color select
  (Solid, Palette) replaced the `'none'` sentinel and gates R/G/B. Dance
  Flash and Ember Pulse remain (the HeatColor ramp is a look choice), and
  Gravity Well is blocked as below.
- [ ] **Audio Features: Apply Sensitivity and smoothing to Loudness (Med,
  S).** Loudness is the raw meter and real music sits at 0.02–0.2 of its
  scale, so wired into a 0–1 input it barely moves and the help tells users
  to add a Smooth node. Apply Sensitivity as a gain plus about 0.15 s of
  smoothing. Evidence `src/nodes/audio/evaluate.ts:294`. Left open: the
  shared energy stage (`energyDynamics.ts`) reads each pattern's own Audio
  Features Loudness, whose Sensitivity varies 0.5–0.65 across the bundled
  patterns, through its own 0.15 s Smooth, with ranges set by ear for the
  raw meter. A gain would retune 86 patterns and a second smoother would
  stack lag (the 0.6 s delay Steve heard). Needs a decision: a separate
  eased output, or moving the stage onto it and retuning by ear.
- [ ] **Gravity Well: Replace R/G/B ports with a palette (Med, S).** It is
  the only band pattern with no palette; a Color port overrides three R/G/B
  float ports. Swap the R/G/B ports for a palette and keep the optional
  Color port, or fold it into Bass Rings as a "lensing" style. Evidence
  `src/nodes/audioReactive/definitions.ts:457`. Left open: the promoted
  Event Horizon graph (byte for byte) colours its well with unwired R/G/B
  80/160/255, so dropping R/G/B recolours it; a Solid/Palette select like
  Beat Flash's would keep it, but a saved node without the key would read
  differently from a new one. Needs a decision on that graph.
- [ ] **Color Trails: Cut the tuning knobs (Med, M).** Twelve knobs over 15
  inputs, with separate X and Y speed, amplitude and frequency, and a
  Persistence slider (0.9–0.9999, step 0.0001) the help explains in
  minutes. Link X and Y by default (one Flow speed, strength and scale plus
  an "independent axes" toggle), and replace Persistence with a Trail
  length in seconds. Evidence `src/state/nodeLibrary.ts:899`. Left open:
  all four bundled Color Trails tune X and Y differently (often opposite
  signs), so each would need the independent toggle and a conversion of
  Persistence (0.9988–0.99935 per frame) into seconds; the trail-length
  curve wants a by-ear check.

#### Colour and maths

- [ ] **Palette Bank: Accept wired palettes (Low, L).** Only catalogue presets
  can join a bank; Custom, Poline, Image and Harmony palettes cannot. Add
  wired palette slots to make it the general palette switcher. Evidence
  `src/nodes/color/codegen.ts:181`. Needs a decision on the port shape first:
  the node has no variable-count ports, so slots mean either a fixed set
  (say Palette 1–4) or a new dynamic-port mechanism. A builder's `pal_<id>`
  is a `loop()` local, so the sketch cannot keep `&pal_<id>` in the static
  `_pbPal_<id>[]` table; it would copy the selected slot into the working
  palette each frame, and the preview's entries become `Palette` values
  (name or 16 stops) rather than names. The bank body, `paletteBankLabel`
  and the Name output also assume catalogue names. The Index input (now
  added) already lets any number source pick a slot.

#### Effects and signals

- [ ] **Category: Merge the overlapping frame-transform nodes (Med, M).**
  Frame Transform, Transform, Frame Warp, Array, Frame Feedback and Tile
  Symmetry each own part of offset/rotate/scale, "Rotate" means three
  different things, and "Transform" vs "Frame Transform" are near-identical
  names for opposite behaviours. Before v1, make one Frame Transform with
  any-angle rotate, scale and offset, each with an optional per-second rate.
  Keep Frame Warp for field-driven displacement only. Needs a product call
  before code: whether the merged node keeps Frame Transform's whole-pixel
  wrap and quarter turns (exact, no resampling) beside a resampled any-angle
  path, and whether Frame Warp's own zoom/rotate go. Transform's Scale now
  breathes between half and double size (`transformZoom.ts`), the rule a
  per-second zoom rate would reuse. Moves: Transform in 4 bundled JSON
  patterns and 5 help examples; Frame Transform in the Blend and Frame
  Transform help examples. Evidence `src/nodes/composite/definitions.ts`.
- [ ] **Category: Fold Kaleidoscope into Mirror (Med, M).** Mirror,
  Kaleidoscope and Tile Symmetry all fold a frame (Symmetry is now labelled
  Tile Symmetry). Add a "Radial" axis to Mirror with a Segments control
  shown only for that axis (Mirror already hides glow controls by mode, and
  glow has no single partner radially, so gate it off), and share Tile
  Symmetry's Rotation/Spin so the radial fold can turn. Left because it
  reaches well beyond the Effects nodes: Kaleidoscope is a built-in show
  pattern (`builtinShowPatterns.ts`, Performance Generator's chorus list,
  `showUpload.test.ts`), sits in 6 bundled JSON patterns, 10 shelf and
  featured seeds, `patternRating.ts`, `frameInvariance.ts` (twice) and the
  Math and Inputs help examples; the turn needs a rotation term in
  `KALEIDO_SOURCE_CPP`, which the native parity test covers. Evidence
  `src/state/nodeLibrary.ts:5253`.
- [ ] **Gamma: Offer a Gamma setting on the LED output (Low, M).** Help says
  to put Gamma last, just before the LED output; a setting on the output
  would remove a node from most finished graphs. Left for the Outputs list:
  it is an LED output property, applied in `ledOutputRuntimeCpp` beside
  Enabled and Brightness so the normal sketch, show controller and SD player
  agree, and in the preview's output routing. The preview can reuse
  `gammaVideoTable` (`src/nodes/composite/gamma.ts`), now a byte-exact
  port of FastLED's `napplyGamma_video`. Evidence
  `src/components/HelpModal/reference/composite.ts:171`.
- [ ] **Math Switch: Add a Select property (Med, S).** Frame Switch gained a
  `select` switch as its `sel` port's property input; Math `Switch` has the
  same gap (unwired it always passes A). Left to the Colour and maths list's
  owner, which is also folding Gate into Switch. Evidence
  `src/nodes/composite/definitions.ts:365`.

#### Fields and shapes

- [ ] **Category: Fix centred fields on a 1-row strip (Med, M).** Strips,
  rings and corkscrews are `height: 1`, where `centeredY(0, 1)` is -1, so
  every centred field samples only the bottom of its circle. Formula Shapes'
  superformula and Lissajous render near-black, Shape Field's default circle
  is a sub-pixel speck (it sizes by the short side), and Path and Fourier
  cannot move (reach is 0). Centre on pixel centres, `(y+0.5-H/2)/(H/2)`, and
  use the long side when one dimension is 1. Same for the rose kernel.
  `src/state/evaluator/formula.ts:28`, `src/nodes/shared/integerPatterns.ts:1232`.
  Gradient Field is done (it measures in pixels from its pivot, so its radial
  centre sits on a strip's row). Still to do: `centeredX/Y` is shared with
  Custom Formula and every emitter's `cx/cy` line; the rose kernel is an
  integer kernel with a C++ twin; Shape Field, Path, Fourier and Shape's new
  Scale with matrix (`matrixSizeScale`) all size by the short side, which is
  1 on a strip.
- [ ] **Category: Merge Field Warp, Field Rotate and Field Tile into one
  transform node (Med, M).** They duplicate Frame Warp, which has offset
  fields, strength, zoom, rotate, edge mode and bilinear sampling. Build one
  Field Transform/Warp mirroring Frame Warp, adding spin and tiles X/Y. This
  also fixes Field Rotate always wrapping (a ramp or edge shape pulls the
  opposite edge into the corners) and Field Tile dropping detail by skipping
  pixels. Migrate the bundled patterns that use the three (Fibonacci Spiral
  Drive, Golden Ratio Cathedral, Lissajous Lattice, audio release sets).
  `src/nodes/field/evaluate.ts:575`, `:590`. Field Warp already has
  strength 2 and bilinear sampling (`sampleFieldBilinear` and its emitted
  twin), which the merged node can reuse for rotate and tile.
- [ ] **Category: Give Formula Shapes placement or fold it into Shape Field
  (Med, M).** Rose and superformula are shape outlines but always centred at a
  fixed scale, with no cx/cy/size and no fill/distance mode. Either add them
  to Shape Field as shape types, or add cx/cy/size to Formula Shapes.
  `src/nodes/field/evaluate.ts:229`.
- [ ] **Category: Decide whether to drop "x/y above 1 means pixels" (Low, S).**
  Design question: `normalizedCenterAxis` reads any value above 1 as a pixel
  coordinate for Shape, Text and Clock Display, so a wired LFO overshooting to
  1.05 jumps from the right edge to pixel 1. Decide whether to drop the rule
  and keep x/y normalised everywhere (or add a unit select), accepting the
  compatibility break. `src/nodes/shapes/evaluate.ts:47`.
- [ ] **Category: Rename the FormulaField type to FormulaShapes (Low, M).**
  `FieldFormula` and `FormulaField` are easy to swap in docs and code.
  Pre-v1, rename the type cleanly if the node stays. Needs a decision: the
  node-review pass kept node type ids on renames (the label already reads
  Formula Shapes), and the id is in three bundled patterns, the node cards'
  file names and saved projects.
- [ ] **Category: Grow field nodes so pattern/field twins are not subsets
  (Low, M).** Noise has 9 algorithms vs Field Noise's fBm only; Game of Life
  has no Automaton equivalent; Reaction Diffusion/Turing Field, Custom
  Formula/Field Formula and the gradient patterns repeat likewise. Add
  `noiseType` to Field Noise and a Conway `life` type to Automaton so field
  chains are not stuck with the subset.
- [ ] **Field -> Frame: Add a wireable palette offset (Low, S).** Colour
  cycling today needs a Palette plus Palette Transform into `paletteIn`.
  Needs a decision first: Field -> Frame reads a field as an amount (1 is the
  last colour, `LINEARBLEND_NOWRAP`), while a cycling offset must wrap, so
  somewhere in the field a 1 takes the colour of a 0 and the jump moves with
  the offset. Low/High now exist on the node; an offset would apply after
  them.
- [ ] **Text: Add an integer size (Med, M).** The only font is 3x5, tiny on
  32x32 or 64x32 HUB75 panels. Add an integer `size` (pixel scale 1-4),
  shared with Clock Display's digits. `src/nodes/shared/font.ts:10`.
  Touches `textBlockLayout` widths and heights, `renderTextInto` and the
  scroll totals in the preview, and both sketch paths (the baked column
  arrays and the wired `_fontCol` loop, each with wrap and scroll), plus
  Clock Display's `blitText` and its clock glyph table.
- [ ] **Clock Display: Split Stopwatch/Timer into a signal node (Low, M).**
  A transport lives inside a drawing node; anyone wanting only `done` still
  draws digits. Consider a small Timer signal node with Clock Display drawing
  a wired `seconds`.
- [ ] **Line: Align units with its siblings (Low, S).** Thickness is done.
  Line alone takes pixel coordinates (now pixel centres: 0 is the first
  pixel, `max_x` the last, matching the `center_x`/`max_x` expressions) while
  Shape, Text and Clock Display take 0-1. A units select or a 0-1 default
  is a product choice, and a 0-1 default would move every saved Line and
  the Help examples that use pixel expressions.




#### Generative and simulations

- [ ] **Category: Move the rest of simulation motion onto the clock (Med, M).**
  Done: every trail fades by elapsed time through the shared `trail` knob,
  and Starfield, Digital Rain and Flow Field scale their per-frame steps by
  `passFrames` (`src/nodes/shared/passClock.ts`, firmware `passFramesCpp`).
  Still per pass, against "never per pass" in
  `docs/development/patterns/graph-and-nodes.md:285`: String Particles moves
  and life, Formula Points' logistic map and attractor iterations (a count a
  frame), and every Particles mode (`rate` is a per-frame chance, `decay` a
  per-frame share of life, and twenty bodies of per-frame velocities and
  drag). The same `passFrames` scaling fits each; drag and decay need
  `Math.pow(k, frames)` rather than a multiply, and each mode wants checking
  by eye. Evidence `src/nodes/simulations/evaluate.ts` (evalParticles,
  evalStringParticles, evalFormulaPoints).
- [ ] **Category: Merge the overlapping Noise types and fold the sine family
  into Plasma (Med, M).** Noise has four near-duplicate cloud types (simplex,
  noise3d, fbm, plasma) and the sine family is spread over Plasma and Noise
  `field`, `sine`, `plasma`. Keep fbm (octaves), noise4d (looping), worley,
  gabor and plasma-fractal in Noise; make simplex and noise3d fbm presets; fold
  `field` and `sine` into Plasma, which gains `scale`. Each type also has its
  own speed and scale range, so nine types means nine slider calibrations.
  Done so far: Noise defaults to fbm, `field` reads "Sine Grid", and Plasma
  has `scale` (0.5 is the classic size). Left: the merge itself, which moves
  saved `field`/`sine`/`simplex`/`noise3d` graphs onto other nodes or presets
  and needs a choice of preset values by eye. While there, simplex, noise3d,
  noise4d and plasma-fractal still wrap their value (`wrap01`), cutting seams
  through non-cyclic palettes such as lava; fbm clamps. Evidence
  `src/nodes/generative/evaluate.ts:299`, `src/nodes/shared/speedRange.ts:52`.
- [ ] **Category: Default Ripple and String Particles to the LED output's
  network (Med, M).** Ripple needs the output's network preset, JSON and LEDs
  per edge, and String Particles needs the ring LED count, all copied by hand
  with nothing keeping them in sync. Default both to "match LED output" read
  from the root graph's MatrixOutput, with the current fields as an override.
  The Ripple default `ledsPerEdge: 14` rarely matches a real build and the
  Help example uses 4. For String Particles, a ring form gives the ring track
  and LED count and a strip form gives row. Open questions before building
  it: which output to match when a board drives several (the multi-board
  partition model feeds consumers the active board's partition), what the
  preview does inside a group or pattern where no LED output is reachable,
  and how a "match" value is saved so a later output change follows it.
  Evidence `src/state/nodeLibrary.ts:2244`, `:2261`.
- [ ] **Particles: Prune overlapping modes (Med, M).** `confetti` duplicates
  the Confetti node; `rain` and `sparkle` overlap Digital Rain; `orbit` and
  `vortex` are both rotation about the centre. The clashing names are fixed
  (`attractor` is now `chase`, `gravity` is now `drops`). Which modes to drop
  is a product call: each removal moves saved graphs (Mainstage Confetti
  Singularity uses `fireworks`, Help uses `snow` and `luminova`) and drops a
  look someone may use, so decide the list before cutting. Evidence
  `src/nodes/simulations/particleModes.ts:5`.

#### Outputs and shows

- [ ] **LED output: Lift the 300-LED cap on strings, rings and corkscrews
  (Med, M).** `MAX_LED_RUN` stops them at 300 while a matrix may reach 4096,
  though one 5 m reel at 144/m is 720. Raise the chain cap toward the matrix
  total (data lanes already split long chains), or document why it is 300.
  Evidence `src/state/output/ledOutputForm.ts:42`. Not a constant change: a
  string's canvas is `ledCount` x 1, so `WIDTH` grows with the cap, and some
  emitted pattern code sizes per-column arrays by `WIDTH` on the loop stack
  (Spectrum Visualizer's wave `_wvV[WIDTH], _wvY[WIDTH]` floats in
  `src/nodes/audioReactive/codegen.ts:199`, 8 bytes per LED; the 1-D
  automaton's `_row[WIDTH]` in `src/nodes/field/codegen.ts:394`) or as static
  columns (`_svLevel` and friends, 16 bytes per column). At 720 LEDs the
  stack arrays alone pass 5 KB of an 8 KB loop task. Move those to static or
  heap storage (or cap them by a column count), raise `MAX_LED_RUN`, make
  `ledCount` a typed number (`entry: 'number'`, a 1-4096 slider cannot be
  dragged), and confirm with compiles of a long string through the sweep in
  `showGenerator.test.ts` before trusting it on hardware.
  `NETWORK_MAX_LEDS` and the positioned-string `MAX_LEDS` are separate 300
  caps.
- [ ] **Analog RGB Strip: Resolve overlap with Power Switch (Med, M).** The
  YYNMOS-4 and Mosfetti boards Power Switch catalogues are the usual way to
  drive an analog strip, yet the strip leaves the driver as "whatever the bench
  has" and lives in the sidebar, not on the bench. Either give it an optional
  driver `partId` and make it a bench part, or add an "RGB strip" load mode
  with a Color input to Power Switch. Evidence `src/build/hardwareManifest.ts:1253`,
  `src/build/hardware.ts:27`. Needs a product decision between the two
  shapes (one node that names its MOSFET board, or Power Switch growing a
  colour load), and either way the Build Diagram wiring for an RGB load on a
  four-channel board. Its default pins no longer clash with the Amplifier.

## 4. Bench and community testing (non-blocking, in parallel)

Each entry is a support-matrix row waiting for evidence. The feature is already
in the app and marked experimental; nothing here holds up development. HW-18
chooses the supported combinations from whatever is on record at release.

### Controls, displays and boards

- **Direct controls:** real touch, panel enable and re-enable, LED and status
  response, and widget feedback during playback, on hardware
  ([design, step 10](docs/design/direct-controls-and-output-status.md#10-verify-the-complete-workflows)).
- **On-glass labels:** a captioned screen photographed on a panel; it
  compiled on 7 October 2026
  ([compile record](docs/reports/compile/display-compile-checks.md#captions-and-starts-at-7-october-2026)).
- **HW-11 shared bus:** TFT + SD + touch on one bus with audio playing. The CYD
  cannot host this run (its card is on the second SPI host), so it needs another
  rig. All other HW-11 measurements are recorded, and its budgets are set.
- **LVGL pool from heap:** on the CYD, a custom screen still starts and free
  heap after `lv_init()` matches the earlier runs, now that ESP32 takes LVGL's
  64 KiB pool from internal heap
  ([compile record](docs/reports/compile/custom-board-compile-checks.md#after-the-lvgl-pool-fix-7-october-2026);
  [bench runs](docs/development/testing/display-budget-bench.md)).
- **XC4630 parallel panel:** on an ESP32-S3 N16R8 the LEDs work but the panel
  has never drawn, so its touch is unjudged. Next step: instrument the
  generated `setup()` with serial markers and read the last one
  ([bring-up](docs/reports/bench/xc4630-bring-up.md#next-step)).
- **D-02 screens and widgets:** on a touch panel, a design with two screens
  moved by a Go to screen button and by a wired Screen input; a Text Entry typed
  on the keyboard and its text reaching a Text; a Chart filling at its interval
  and a Spectrum following a microphone; Show Status picturing the slideshow's
  pattern. All compile only at the v1 freeze
  ([custom screens](docs/development/patterns/custom-screens.md)).
- **D-02 Web Remote:** the phone page on an ESP32 and an ESP8266 on a real
  Wi-Fi network, reached by its `.local` name, every control type driving the
  LEDs, a held button released by the timeout, and a reconnect after Wi-Fi drops
  ([design](docs/design/web-remote.md)).
- **Custom boards:** one custom layout compared against its board's documented
  pinout, then representative projects flashed. The software compile is
  recorded
  ([compile record](docs/reports/compile/custom-board-compile-checks.md)).

- **D-05 Arduino Nano ESP32:** flashed from Studio through its DFU bootloader,
  an LED output on D6 lighting from GPIO9 (proof that the GPIO numbering
  reaches the board), the I2C default on A4/A5, and Serial on the USB port.
  The row's requirements are in the support matrix.
- **D-05 WT32-ETH01:** an Ethernet link, DHCP and static addressing, Art-Net
  over the cable driving an LED output, NTP sync, recovery after a cable pull,
  and an upload through a USB-to-serial adapter. The row's requirements are in
  the support matrix.

### Firmware and show matrix

- **HW-13 firmware/bench matrix:**
  - classic-ESP32 SD provisioning and player, following the
    [SD-show run](docs/release/beta-hardware-validation.md#sd-show-validation-run);
    it also clears the three defects left from the 2026-07-28 run;
  - S3 PSRAM variants;
  - tiled, rotated or custom-XY layouts, and native multi-output;
  - baked audio and collection modulation;
  - FormulaField and FormulaPoints;
  - pattern nodes with compile evidence only: the Fluid solver's C++, and
    Turing Field's pixels against the preview;
  - a real Art-Net controller, and DMX512 over RS-485;
  - long-duration RTC software-clock drift, and DS3231 recovery;
  - an NTP RTC Clock inside a generative show and an SD-player build, synced
    over Wi-Fi and over the WIZ850io, with the clock read on a panel;
  - Button, Pot, Encoder and PIR, including the encoder's Confirm with a Music
    Player and its detent edge cases
    ([input bench](docs/reports/bench/input-peripheral-bench.md));
  - a HUB75 full support row, streaming, folded/chained/rotated topology, and
    show/player (confirm chain orientation, preview fidelity and panel power
    assumptions).
- **SD Video:** measured card read bandwidth per board, against the 400 KB/s
  estimate ([SD Video limits](docs/design/sd-video.md#limits)).
- **Persistent patterns across a transition:** preview versus LEDs on Trails,
  Frame Feedback, Reaction Diffusion and Fluid across a show transition, for
  both entry policies. Restart clears that state as the incoming transition
  starts. Resume keeps it, and the preview holds it while the pattern is away.
  Text-level coverage is in `persistentRenderBuffers.test.ts` and
  `entryReset.test.ts`
  ([compile record](docs/reports/compile/render-buffer-ram-compile-checks.md)).
- **HW-32 frame performance**, each experimental in the
  [support matrix](docs/release/beta-support-matrix.md):
  - deadline pacing: fps and `renderms`/`sendms` before and after on a strip
    of 500 LEDs or more at the 60 fps default, against the readiness strip's
    reachable frame rate;
  - **Split across pins**: two and four lanes sending at once on a classic
    ESP32 and an S3, with the wiring diagnostic lighting each lane in turn;
  - each offered LED driver (classic ESP32 I2S, S3 LCD_CLOCKLESS and I2S, C6
    and H2 RMT) driving three outputs with Wi-Fi up;
  - an APA102 run at a raised data rate, and where its length starts to lose
    data;
  - node shares on an ESP32-C3 and an ESP32-C6
    ([node-share bench](docs/reports/bench/node-share-bench.md#not-yet-measured)).
- **D-12 integer kernels:** the after-reading of every converted node on the
  ESP8266 node-share bench, each under 10 ms a 256-pixel frame, and FastLED's
  own `inoise8` checked against the sketch's copy on the device
  ([node-share bench](docs/reports/bench/node-share-bench.md#converted-for-d-12)).
- **Compile matrix at the v1 freeze:** no compile runs during active v1
  development, because every sketch keeps changing. Once the release track is
  done and before HW-18, run
  `python scripts/compile-fixtures/compile-matrix.py --engine all` at the
  frozen code. On 2026-10-27 that plan was 198 builds: 131 on Arduino CLI
  and 67 on fbuild, picked from every fixture of every family so each board
  builds every library, configuration and FastLED, core or library name the
  fixtures use at least once (Steve chose this rule over 397 and 139). The
  count moves with the code; `--list` gives the current one. Runs go to the
  `Compile matrix` GitHub workflow (20 Windows runners). 2026-10-28, on FastLED
  3.10.8 and Arduino core 3.3.12: Arduino CLI 130 of 130 pass
  (`artifacts/compile-matrix/cloud-40518148901`, commit `ea42a73b`); fbuild
  63 of 66 (`cloud-40505040758`), the two S3 LED-driver legs since fixed and
  passing, the Nano ESP32 failing on an fbuild board-flag bug
  ([FastLED/fbuild#1760](https://github.com/FastLED/fbuild/issues/1760)). The freeze run repeats this on the frozen code.
- **Deploy gate on accreted graphs:** anyone with a graph that uploaded before
  2026-09-11 and is refused now should report it as a gate bug, not rewire the
  graph. Shipped starters are covered by `deployGates.test.ts`.

### Audio

- **D-05 DFPlayer Mini:** a numbered file in `/mp3` starts when Play rises and
  pauses when it falls, Next and Previous step the card, volume follows the
  0 to 1 input across the 30 hardware steps, and BUSY reads low while a file
  is playing. Line Out feeds a power amplifier from DAC_L and DAC_R. The
  row's requirements are in the support matrix.
- **HW-19 microphones:** ICS-43434 and Generic MEMS live FFT and beat response,
  against an INMP441 on the same fixture and source.
- **HW-20 audio chain:** each power amplifier (PAM8403, PAM8610, DX-0809) fed by
  a DAC and by the internal DAC. The MAX98357A stereo pair hearing left and
  right separately.
- **SPH0645LM4H:** a classic-ESP32 bench row against an INMP441. Separately,
  a measured capture on an ESP32-S3, which is the one genuine measurement
  gap: no documented timing fix exists for its I2S block, so the S3 is
  refused until one is found.

### Power and outputs

- **D-05 solid-state relay:** the Seeed Grove 2-channel board switching a real
  AC load within 0.1 to 2 A, both channels held off through reset and setup,
  each channel independent, the 1.5 mA off-state leakage observable or measured,
  VCC at 5 V, and a DC load confirmed not to turn off. The row's requirements
  are in the support matrix.
- **D-05 power switch:** the LR7843 switching and dimming a real DC load,
  including the MOSFET temperature at 50% duty; the row's requirements are in
  the support matrix.
- **D-05 Mosfetti:** the MonkMakes Mosfetti's four channels held off through
  setup, switched independently, one dimmed at 1 kHz, with the board total kept
  under 2 A; the row's requirements are in the support matrix.
- **D-05 YYNMOS-4:** the LR7843 revision's terminal order checked on the board
  first (it is inferred from the family's earlier boards), then four channels
  held off through setup, switched independently from 3.3 V GPIOs, one dimmed
  at 500 Hz with the MOSFET temperature at 50% duty, and the gate voltage at the
  lowest supply used; the row's requirements are in the support matrix.
- **D-05 Darlington driver:** the ULN2803A switching a real load from each channel,
  every input held low through reset and setup, with the load supply's ground joined
  to the controller's; the row's requirements are in the support matrix.
- **D-05 PWM driver:** the PCA9685 on the I2C bus, an LED dimmed across the range,
  a channel at exactly 0 and 1, a servo or oscilloscope reading at the chosen
  frequency, and outputs staying off until written; the row's requirements are in the
  support matrix.
- **D-05 buzzers:** the KY-012 sounded from a GPIO, silent through reset and setup,
  sounding while Sound is true and silent when it falls; and the KY-006 the same
  way, plus a pitch sweep following a wired Pitch and its transducer's measured
  DC resistance. The rows' requirements are in the support matrix.
- **D-05 cooling fan:** the Noctua NF-A4x10 5V PWM driven through 0%, 20%, 50%
  and 100% commands, with PWM frequency checked at 25 kHz and reported RPM
  compared with an optical tachometer. Confirm it stops at 0%, starts reliably,
  stays off through reset and setup, and reports a stall when the rotor is held.
  The row's requirements are in the support matrix.
- **D-05 power monitor:** INA219 and INA226 readings against a multimeter, the
  INA226 with one load above 3 A; the rows' requirements are in the support matrix.
- **D-05 PD trigger:** the ZY12PDN negotiating each voltage it offers from a named
  charger and cable, measured at its output pads before any load is connected; the
  row's requirements are in the support matrix.
- **D-05 controller buck:** a board powered through its 5 V pin from the
  LM2596 at 12 V and at 24 V, output set to 5.0 V first, with the controller
  and its 5 V modules running.
- **D-05 LED rail converter:** a loaded 5 V LED rail powered from the Mean Well
  SD-100A-5 at 12 V and the SD-100B-5 at 24 V, with source current, output
  voltage, case temperature, FG and the isolated-output ground bond recorded.
- **D-05 1S battery build:** a Samsung INR18650-35E cell with the IP5305T
  boost, charge and protection module powering about ten LEDs. Measure pack
  minimum and full voltage, charge current, 5 V full-white output, protection
  disconnect, fuse operation, temperatures and runtime.
- **D-05 4S 16×16 battery build:** Samsung INR18650-35E cells with the
  HX-4S-F30A BMS, IP2368 charger and DGXBY 20 A buck powering a 16×16 matrix.
  Verify B0 through B4 sense order and the P- return; record charge ceiling,
  low-end dropout, pack current, fuse operation, wire and board temperatures,
  and full-white runtime.
- **D-05 4S 32×32 battery build:** Samsung INR18650-35E cells with the BM3451
  60 A BMS, IP2368 charger and two RCNUN 60 A bucks powering a 32×32 matrix.
  Run uncapped full-white hardware checks and the 30 A FastLED running limit;
  record the same voltages, currents, protection, temperatures and runtime as
  the 16×16 build, with a high-power low-voltage professional reviewing it.

### Sensors and inputs

- **D-05 light sensor:** the Adafruit BH1750's Lux against a reference meter in
  dim, room and bright light; the row's requirements are in the support matrix.
- **D-05 presence sensor:** the HLK-LD2410C reporting moving, stationary,
  combined and absent targets at two measured distances, including UART
  reconnect recovery; the row's requirements are in the support matrix.
- **D-05 touch button:** the Seeed Grove Touch Sensor powered from 3V3, with
  SIG idle LOW and touched HIGH on the selected GPIO; release, held and rapid
  touches in normal, slideshow and player firmware, plus startup and SIG
  reconnect behaviour. The row's requirements are in the support matrix.
- **D-05 environment sensor:** the Adafruit BME280's temperature, humidity and
  pressure against trusted references at two conditions, including recovery
  after unplugging the module. The row's requirements are in the support matrix.
- **D-05 temperature probe:** the Adafruit-form waterproof DS18B20 on 3V3 with
  its 4.7 kΩ DATA pull-up, read against a trusted thermometer at two
  temperatures including an ice bath, with Connected dropping and recovering
  when the probe is unplugged and replugged. The row's requirements are in the
  support matrix.
- **D-05 distance sensor:** the HC-SR04 on 5 V with its 1 kΩ / 2 kΩ Echo divider,
  read against a tape measure at two distances, with Connected dropping with
  nothing in range and recovering. The row's requirements are in the support
  matrix.
- **D-05 laser distance sensor:** the VL53L0X and VL53L1X (the latter also past
  1.2 m) on 3V3 and the I2C bus, read against a tape measure at two distances,
  with Connected dropping when it is unplugged and recovering; the row's
  requirements are in the support matrix.
- **D-05 joystick:** the KY-023 on 3V3 with VRx and VRy on ADC1 pins and SW on a
  pull-up pin, both axes read centred and at full travel in each direction, the
  dead zone checked, and SW pressed and released. The row's requirements are in
  the support matrix.
- **D-05 accelerometer and gyroscope:** the GY-521 on 3V3 at 0x68 and 0x69, flat and on
  each side reading about 1 g on the matching axis, a slow turn compared against a
  known rate, and Connected dropping and recovering on unplug. The row's
  requirements are in the support matrix.
- **D-05 microwave motion:** the RCWL-0516 on 5 V with OUT on a GPIO, reading high
  on movement and low after its roughly two-second hold, the range against a tape
  measure, and behaviour through a plastic case. The row's requirements are in the
  support matrix.
- **D-05 touch pad:** the MPR121 breakout on the I2C bus, all twelve electrodes read in
  each generator, a touch and a release on each, and Connected going false when the
  breakout is unplugged. The row's requirements are in the support matrix.
- **D-05 keypad:** the 4x4 membrane keypad on eight GPIOs, all sixteen keys read in
  each generator, the tail order confirmed against the keypad's own markings, and a
  press and release on each row and column. The row's requirements are in the support
  matrix.
- **D-05a IR remote:** receiver, remote, board, FQBN and GPIO recorded;
  tap/hold/alternate/unknown/rapid keys in all three build modes; reception
  during long clockless LED `show()` calls
  ([plan](docs/design/ir-remote-controls.md)). The
  [KS0026/S3 partial bench pass](docs/release/beta-support-matrix.md#recorded-validations-that-are-not-yet-full-support-rows)
  confirms learning and remote LED power, including Toggle's separate On/Off
  inputs; the remaining key/repeat/long-run and build-mode checks stay open.

### Network and data links

- **D-03 multi-board sync:** two ESP32 boards on one Wi-Fi network, the
  primary leading, running the same pattern and then the same collection
  show: the follower's clock offset settles and the two stay on one pattern
  through transitions, and the follower resumes its own picks five seconds
  after the leader is unplugged. Compile both partitions first; no
  multi-board sketch has compiled yet.
- **D-03 UNO R4 WiFi networking:** NTP sync and Art-Net receive through
  WiFiS3 on an Arduino UNO R4 WiFi: first compile on arduino-cli (the
  `ARDUINO_UNOWIFIR4` define, `WiFiS3.h`, `setHostname` and the
  DNS-second `config` order are assumed from the core), then an NTP-synced
  Clock Display and a desk-driven Art-Net universe.
- **D-05 wired Ethernet:** the WIZ850io on a real network: link-up, DHCP and
  static addressing, Art-Net over the cable, NTP sync, and cable pull/replug
  recovery; the row's requirements are in the support matrix.
- **D-05 DMX transceiver:** the C25B MAX485 module on 5 V, with its RO divider,
  receiving a real DMX512 line; the row's requirements are in the support
  matrix.
- **D-05 pixel data extender:** the NLED TX/RX pair driving a WS2812B run over
  a long twisted A/B/ground cable, with the length recorded, powered from
  separate supplies at each end with bonded grounds.

## 5. Release track (in order)

- [ ] **fbuild upkeep (M)** ([runbook](docs/runbooks/fbuild-workarounds.md)).
  Pulled into v1 on 2026-10-21: v1 ships with fbuild verified. Development
  compiles on Arduino CLI alone until the repository matures; then rerun every
  fbuild leg and pick these up:
  - The pin moved to 2.5.44 on 2026-10-23 and to 2.5.45 on 2026-10-27;
    `backend/.venv` and the Espressif Python hold 2.5.45. On 2026-10-24 the fix legs ran: the LVGL archive (§12),
    Renesas and SAMD21 now build; RP2040 passes boot2 and stops on the Pico
    core's TinyUSB library, reported as
    [FastLED/fbuild#1719](https://github.com/FastLED/fbuild/issues/1719)
    ([IR record](docs/reports/compile/ir-compile-checks.md#fbuild-2544-recheck-24-october-2026)).
    Still to do: the full fbuild run (`scripts/compile-fixtures/run-fbuild.cmd`,
    then `--retry-failed` after fixing what it reports), then
    remove the §12 recovery and retry SAMD51 without its `_PIO_BOARDS`
    `-DARDUINO_ARCH_SAMD`/`EIC_IRQn` flags. #1658 (§5) and #1673 have no
    fixture of their own.
  - **Release blocker for fbuild on Windows:** every daemon compile opens a
    visible, focus-taking console window (§13,
    [#1722](https://github.com/FastLED/fbuild/issues/1722)); app users hit it
    too. Fixed upstream by #1723 (zccache 1.15.6), with #1719 (#1721)
    alongside; both ship in 2.5.45, pinned 2026-10-27. Still to do: check
    with a short build that no window opens.
  - **fbuild `main` run, 2026-10-24** (local build of `710790b2`, FastLED
    3.10.5): 45 of 46 legs pass with no console windows, RP2040 included;
    C6, RP2350 and SAMD51 build; an overflow now prints region sizes (§5);
    an ESP32 no-op rebuild takes 0.1 s. Open, drafted locally and not
    posted (`tmp/fbuild-main/drafts/`): RP2040/RP2350 flash counts the
    `.heap` reservation, and SAMD21 fails on FastLED 3.10.5 because fbuild
    does not select the core's `SPI` library for an include behind `#if`
    (both SAMD21 legs are expected failures until then). Also open: fbuild
    ESP32 images carry about 255 KB more `.eh_frame` than Arduino CLI's,
    cause not yet found.
  - Every known fbuild problem has an upstream issue: RP2040 TinyUSB
    ([#1719](https://github.com/FastLED/fbuild/issues/1719)), §12 LVGL archive
    length ([#1656](https://github.com/FastLED/fbuild/issues/1656)), §7
    ESP8266 `deploy` ([#1657](https://github.com/FastLED/fbuild/issues/1657)),
    §5 no size summary on a link overflow
    ([#1658](https://github.com/FastLED/fbuild/issues/1658)), the RP2040,
    Renesas and SAMD21 build failures
    ([#1670](https://github.com/FastLED/fbuild/issues/1670),
    [#1671](https://github.com/FastLED/fbuild/issues/1671),
    [#1672](https://github.com/FastLED/fbuild/issues/1672)) and Windows long
    paths ([#1673](https://github.com/FastLED/fbuild/issues/1673)). Drop each
    workaround as its fix lands.
  - Arduino Nano ESP32 ([#1760](https://github.com/FastLED/fbuild/issues/1760)):
    fixed on fbuild `main` by #1764 (merged 2026-10-27 19:29 UTC, after
    v2.5.47). When a release contains `40868957`, move the pin to it and
    rebuild `nano-esp32/nano-esp32@nano-esp32` with the `Compile matrix`
    workflow (`-f engine=fbuild -f only=nano-esp32/nano-esp32@nano-esp32`).
  - Recompile the RP2040 IR fbuild leg on that release (#1719 fixed on
    `main` by #1721).
  - The four unpatched vendored libraries stay in `lib/`: on 2.5.37 a GitHub
    `lib_deps` ignores its `#ref`, the HUB75 pin is ignored, esp_dmx 4.1.0
    does not build on IDF 5.5, and every `lib_deps` library is compiled
    whether used or not (§1). Report them upstream, then revisit.
- [ ] **HW-17 · Distribution smoke tests (M).** Clean-profile offline-PWA
  relaunch and clean end-user-machine desktop runs; platform signing and
  notarization before publishing: Authenticode for the Windows launcher and
  bundled executables, macOS application layout, hardened runtime and
  notarization, and checksums with a provenance record for every archive.
  Before a macOS package is a release candidate, reconcile the fbuild 2.5.4
  tools it substitutes with the pinned Python dependency and repeat its smoke
  ([desktop distribution](docs/release/desktop-distribution.md#github-package-workflow)).
  Exit: per-platform launch/install, helper discovery, permissions, offline
  and recovery evidence.
- [ ] **HW-18 · v1 scope and format baseline (M).** The pre-1.0 compatibility
  sweep is done ([cleanup record](docs/release/versioning-and-releases.md#pre-v1-cleanup-record));
  new leftovers found later are removed the same way, without migrations.
  *At release:*
  choose the supported combinations from the evidence then on record,
  reconcile release copy, freeze the panel/document/control save format, and
  record limitations and deferments. Repeat the
  [keyboard and screen-reader smoke test](docs/release/accessibility-smoke-test.md)
  on the candidate build, because the recorded pass (2026-07-26) predates the
  workspace tabs and shelves. Follow the
  [release checklist](docs/release/versioning-and-releases.md#release-checklist).

## 6. Deferred until after v1

Scope set item by item on 2026-10-21. Items dropped then are recorded in
their design notes: free drawing, XY Pad, Launch Pad and TFT video in
[auxiliary displays](docs/design/auxiliary-displays.md#deferred-dropped-and-why);
per-input modulation from song analysis in
[collection-driven performance](docs/design/collection-driven-performance.md);
colour profile in
[pattern node expansion](docs/plans/pattern-node-expansion.md#phase-11--output-layout-and-media-follow-ons);
and an Upload information shelf in
[workspace shelves](docs/plans/workspace-shelves.md#order).

- [ ] **D-02 · Large display panels.** Parallel-RGB LCD panels and HDMI output
  as display targets. Each is a different runtime class, with new board
  profiles, a display driver and its own LVGL memory budget
  ([auxiliary displays](docs/design/auxiliary-displays.md#deferred-dropped-and-why)).
- [ ] **D-03 · Linux backend and show-side Art-Net.** A Raspberry Pi/Linux
  code-generation backend beside the C++ firmware path. Art-Net in the show and
  SD-player generators is an open question, because a show already owns its
  LEDs: take the LEDs over while packets arrive, or act only as remote control.
  NTP in those generators shipped with D-03.

## Completed

Outcomes are recorded where linked; the per-item narratives up to 2026-09-24
are in the [archived backlog](docs/archive/hardware-todo-to-2026-09-24.md).

- **D-13 · Board links over ESP-NOW**: controls and readings between the
  boards of one project over authenticated ESP-NOW, with channel following
  for a board off Wi-Fi, held hand-set values through a sender restart, and
  the Encoder's Level output found on the way
  ([design](docs/design/board-links.md#as-built);
  [compile checks](docs/reports/compile/board-link-compile-checks.md)). All
  three bench runs passed on 2026-10-26 and 27: a Music Player with a touch
  screen, with an OLED and a bare encoder, and set by an ESP8266 Web Remote
  ([bench record](docs/reports/bench/board-link-bench.md)).
- **D-11 · Richer show and timeline tools**: weighted and tagged picks,
  Restart/Resume entry policies, song-show lanes with ramps and named inputs,
  locked-range regeneration, and looping Slideshow and Music Player sequences
  ([design](docs/design/show-sequencing.md);
  [compile checks](docs/reports/compile/show-sequencing-compile-checks.md)).
  Software and compile work is complete; preview-versus-LED bench evidence remains
  in section 4 and the [support matrix](docs/release/beta-support-matrix.md).
- **D-04 · Code and field fidelity**: Code-node includes and defines, gradient
  palettes, custom XY maps, static locals and typed arrays in the preview
  ([code node](docs/design/code-node.md)); writable Field Formula buffers
  (`prev`); show-side Vibe, Song Structure and Pitch Detect baked into an
  `ADET` trailer, Waveform inactive in shows by design
  ([audio detectors](docs/design/audio-detectors.md)); Stereo VU Meter
  clocked rails, unequal rail lengths and several fixtures per board, with
  the stereo FFT and streamed audio deferred until a consumer exists
  ([expansion design](docs/design/stereo-vu-expansion.md)).
- **D-06 · Segment networks and millimetre string positions**: a positioned
  string's span in millimetres on the Build Diagram card with an overlap
  warning; `stripLayout: 'network'` laying a string along a graph's edges
  (hexagon and triangle presets, custom JSON, a layout editor); and the
  `Ripple` pattern that travels the network, with the turning rule baked into
  the sketch ([segment networks](docs/design/segment-networks.md)).
- **D-07 · Build Diagram panel in the shared sidebar**: the information
  panel portals into the shared sidebar host with the shared width, resize and
  toggle controls, its own controls removed; the content is unchanged
  ([workspace shelves](docs/plans/workspace-shelves.md#order)).
- **D-02 · Custom screens, v1 remainder**: several screens with Go to screen
  and a Screen input, Text Entry, Chart and Spectrum, the Web Remote node,
  panel-measured size limits, and Show Status artwork
  ([custom screens](docs/development/patterns/custom-screens.md);
  [Web Remote](docs/design/web-remote.md)).
- **D-02 · Larger UI scope, v1 part**: shared-document panels, Choice Strip,
  Step Control, Colour Picker, Arc Gauge, Marquee and Containers
  ([widget ports](docs/reference/displays.md#widget-ports)).
- **D-04 · Code-node preview fidelity, v1 part**: persistent globals, integer
  wrap and timing macros in the preview shim
  ([code node](docs/design/code-node.md)).
- **D-05 · Hardware expansion**: no implementation work remains; each part
  is recorded in the [roadmap](docs/plans/hardware-expansion-roadmap.md) and
  its bench row is in section 4.
- **D-06 · Pattern and output follow-ons, v1 part**: shaped outputs in show
  and player sketches, shapes in the LED Output pane, the raw Noise field and
  one `.h` per pattern
  ([pattern node expansion](docs/plans/pattern-node-expansion.md#phase-11--output-layout-and-media-follow-ons)).
- **D-08 · Node lock-in and the Help node reference rewrite**: NaN guard,
  property grid, dead properties, definition bugs, beat gate, data-type
  sweep, labels and groups, tooltips, merges and new nodes, then a
  hand-written Help page and live example for every node
  ([graph and nodes](docs/development/patterns/graph-and-nodes.md);
  [compile record](docs/reports/compile/pattern-node-compile-checks.md#node-lock-in-d-08-14-october-2026)).
- **D-09 · Dead code in generated firmware**: one pruning pass after all
  three generators, held by `deadCodeCorpus.test.ts` and compiled
  ([firmware generation](docs/development/patterns/firmware-generation.md#dead-code-pruning)).
- **D-10 · Render-buffer RAM**: scratch pooled across collected patterns,
  shared within one graph, and never a persistent terminal aliased to `leds`
  ([compile record](docs/reports/compile/render-buffer-ram-compile-checks.md)).
  The bench row is in section 4.
- **D-12 · Integer kernels for the remaining costly nodes**: every node the
  node-share bench measured at 10 ms or more draws its pixels with integer
  maths, each with a native parity test, except the exemptions decided on
  2026-10-21: Turing Field and Slice Tiling (near-ties would move edges),
  Reaction Diffusion (a float simulation), Custom Formula (the user's own
  expression) and Animartrix (vendored)
  ([firmware generation](docs/development/patterns/firmware-generation.md#integer-pattern-kernels)).
  The device readings are a section 4 row.
- **HW-32 · Frame performance**: deadline pacing with render and send timed
  apart, per-board wire-time advice, clocked data rates, one LED output split
  across pins, a Board LED driver choice, per-node timing, frame-invariant
  nodes drawn once, and integer kernels for the five costliest formula
  patterns on an ESP8266
  ([board capabilities](docs/architecture/board-capabilities.md);
  [multi-output routing](docs/architecture/multi-output-routing.md);
  [firmware generation](docs/development/patterns/firmware-generation.md#integer-pattern-kernels);
  [node-share bench](docs/reports/bench/node-share-bench.md)). The bench rows
  are in section 4.
- **HW-14 · Independent electrical review**: two passes, no blocking safety
  issue ([findings](docs/architecture/build-diagram.md#independent-electrical-review)).
  Any power family added after `5d10f5e7` reopens it for its own pass before
  it leaves experimental.
- **D-01 · Broader control graph**: Interval, Time, Wave, nested groups,
  colour, pattern selection, LED status, wall-clock signal nodes and a wired
  local RTC in show and player builds
  ([control routing](docs/design/large-displays-and-control-routing.md#d-01-implementation);
  [compile checks](docs/reports/compile/control-graph-compile-checks.md)).
- **D-03 · Networking in every firmware output, v1 part**: an NTP RTC Clock
  in the generative-show and SD-player sketches brings up the same Wi-Fi or
  wired Ethernet connection the normal sketch uses, through one shared
  emitter, and the control graph's NTP refusal is lifted
  ([RTC design](docs/design/rtc-clock-and-schedule.md#time-sources-software-clock-optional-ntp-or-a-ds3231);
  [compile checks](docs/reports/compile/control-graph-compile-checks.md)).
- **D-03 · Multi-board, library sharing and UNO R4 networking** (software
  complete 2026-10-22): a project carries several boards as partitions of
  the root graph, each with its own parts, pins, validation, sketch and
  upload target, worked on one at a time through a board selector in the
  Hardware pane, the Build Diagram and the Upload tab; with clock sync on
  the primary board leads over UDP and followers adopt its clock and show
  state ([design](docs/design/multi-board.md)). Patterns, palettes and
  collections travel as one library bundle by file, clipboard or link,
  never remembered as known content on import
  ([design](docs/design/library-sharing.md)). NTP and Art-Net/sACN/DDP work
  on the Arduino UNO R4 WiFi through WiFiS3, with the RTC running its own
  SNTP exchange. Collection and engine ownership stay separate. Compiles
  and bench rows are in section 4.
- **HW-01–HW-10, HW-15, HW-21–HW-31**: controls and screens, workflow, catalogue
  and helper work.
- **Direct controls and LED output status**: software complete; bench readings
  are in section 4
  ([design](docs/design/direct-controls-and-output-status.md)).
- **HW-11 · Touch/LVGL budget and calibration**: instrument built, five
  runs recorded, budgets set, and guided calibration done on the CYD
  ([bench](docs/development/testing/display-budget-bench.md)). The shared-bus
  run is in section 4.
- **HW-13 · display compile half**: twelve fixtures pass on both engines
  ([compile record](docs/reports/compile/display-compile-checks.md)). The bench
  matrix is in section 4.
- **HW-16 · First-user journey**: a first-time user built and uploaded a
  working sketch within minutes, without guidance (reported 2026-09-24).
  The blocker classes are automated in `deployGates.test.ts`.
- **HW-19 · ICS-43434 and Generic I2S MEMS**: software complete; compiles
  pass on arduino-cli and fbuild.
- **HW-20 phases 2–5**: Option B chain, power amplifiers, the SPH0645LM4H
  (classic ESP32, app-owned capture) and the MAX98357A stereo pair
  ([plan](docs/design/audio-hardware.md#phases)).
- **D-05a · IR remote**: steps 1–13
  ([IR compile checks](docs/reports/compile/ir-compile-checks.md)).
- **D-05 parts, roadmap steps 1–10 and the sensor, control, output and power
  families after them**: LR7843 and Mosfetti power switches, INA219 and
  INA226, MAX485, HLK-LD2410C, BH1750, Grove Touch, WIZ850io, NLED data
  extender, LM2596 and SD-100A/B-5 with main fuses and trunks, BME280,
  DS18B20, HC-SR04, VL53L0X and VL53L1X (including two on one bus, each with its
  own SHDN or XSHUT pin and an address from 0x30 to 0x33), KY-023, GY-521, RCWL-0516, MPR121,
  4x4 keypad, PCA9685, ULN2803A, KY-012, KY-006, ZY12PDN, the YYNMOS-4
  (LR7843 revision) and the Noctua NF-A4x10 5V PWM cooling fan, each in software
  and compiled where it has firmware
  ([roadmap](docs/plans/hardware-expansion-roadmap.md);
  [compile records](docs/index.md#compile-checks)).
- **Controller profiles**: the ESP32-C3 Super Mini, ESP32-C6-DevKitC-1, D1 Mini,
  Pico W, Teensy 4.1 and Arduino Nano ESP32 are authored and drawn on their
  measured pads, 2026-10-08; the Super Mini's reversed rails and the D1 Mini's
  rail spacing were corrected in their models, and the Nano ESP32 is modelled
  and compiled. The WT32-ETH01 followed on 2026-10-09 with its LAN8720A
  Ethernet as a board profile fact and power through its 5V pin. The QuinLED
  Dig-Uno v3.1 followed that day with its exact terminal and header map, fixed
  level-shifted GPIO16/GPIO3 LED outputs, and 5-24 V fused input; it shares the
  existing generic ESP32 compile target
  ([compile record](docs/reports/compile/controller-board-compile-checks.md))
  ([roadmap](docs/plans/hardware-expansion-roadmap.md#additional-controller-profiles)).
  The QuinLED Dig-Quad v3.1 completed the exact-controller batch on 2026-10-09
  with its 100.394 x 48.209 mm model, dual high-current input, five fused power
  groups, seven positive and seven ground outputs, and level-shifted LED1-LED4
  on GPIO16/GPIO3/GPIO1/GPIO4.
- **Pattern node expansion**: Phases 0–10, and Phase 11's render scale,
  positioned strings, white point and SD Video, all compiled
  ([plan](docs/plans/pattern-node-expansion.md)).
- **App review, 24 September 2026**: all 24 items and the walkthrough's
  layout and repair findings
  ([plan](docs/plans/2026-09-24-app-review.md)), including its level-gate
  compile on 7 October 2026.
- **Workspace shelves**: the preview in all four workspaces and the Hardware
  shelf ([plan](docs/plans/workspace-shelves.md)).
- **Custom boards**: steps 1–8 in software and tests, 2026-10-06
  ([design](docs/design/custom-board-pin-layouts.md)); compiled 2026-10-07,
  the classic-ESP32 SD player after LVGL's pool moved to the heap
  ([compile record](docs/reports/compile/custom-board-compile-checks.md));
  bench is in section 4.
