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
found that were confirmed in code are fixed (`aedaa095`). What follows are the
review's remaining suggestions, one checkbox each, tagged (impact, effort)
and cited to the code they came from. They have not been rechecked against
the code since, so confirm the claim before acting on it. Merges, renames and
removed properties change saved shapes: land them before the HW-18 format
freeze, or drop them.

#### Inputs, hardware, graph and code

- [ ] **Category: One network identity per board (High, M).** Hostname,
  DHCP/static fields (6 properties) and Wi-Fi SSID/password are repeated on
  DMXInput, DdpInput, WebRemoteInput, RTCInput (plus StreamOutput and Music
  Player). Firmware uses only the first network user's settings, so the rest
  are dead input, and the deploy check reads only the owner's SSID. Move
  SSID/password/hostname/addressing to the Board (or a Wi-Fi entry in the
  bench Network shelf) and drop the fields from every network node, which
  also removes the "nodes disagree" warning. Evidence
  `src/codegen/peripherals/networkCpp.ts:67`, `src/utils/validateGraph.ts:325`.
- [ ] **Category: Move DMX512 and DIN MIDI hardware to bench parts (Med, M).**
  Every other physical input is a bench part with auto-assigned pins, but
  DMX512 and DIN MIDI keep raw pin sliders and a user-picked UART on library
  nodes. Mirror the Audio to Microphone model: bench parts for the RS-485
  transceiver and MIDI wing, UART allocated automatically, and drop
  `dmxPort`/`midiUart`. Evidence `src/nodes/input/definitions.ts:451`,
  `src/build/hardwareManifest.ts:1502`.
- [ ] **Category: Fold tall output lists on sensor nodes (Med, M).**
  RTCInput has 14 outputs, MotionVectorInput 7, PowerMonitorInput 5, and
  `NodeDefinition` has no output equivalent of `defaultExposedInputs`. Add an
  "exposed outputs" list: show the common ones, reveal the rest on demand,
  always show wired ones. Evidence `src/types/index.ts:41`.
- [ ] **Category: Per-pad/per-key output sockets (Med, S).** ButtonBank,
  IRRemoteInput and WebRemoteInput grow a named output per item from a
  trailing socket, but TouchPadInput and KeypadInput only publish an index,
  so "pad 3 pressed" needs Compare + And. Offer the same grow-a-port socket
  on both nodes.
- [ ] **Category: Let preview test the disconnected branch (Low, S).** Every
  sensor with a Connected output returns `connected: true` in preview, so the
  fallback a graph builds can't be exercised. Add an "unplug" toggle to the
  stand-in widget. Evidence `src/nodes/input/evaluate.ts:384`.
- [ ] **Category: Use one distance unit (Low, S).** PresenceInput reports
  Distance in metres, DistanceInput in millimetres. Pick one and rename
  ports (pre-1.0 allows it). Evidence `src/codegen/peripherals/presenceSensorCpp.ts:90`.
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
  `src/codegen/controlInputCpp.ts:56`.
- [ ] **Button Bank: Start with one row on the bench (Low, S).** It is added
  to the bench empty with no pins, so the module wires to nothing until the
  user goes to the canvas. Start it with one row. Evidence
  `src/components/Hardware/hardwarePartCatalog.ts:589`.
- [ ] **IR Remote: Add a kit-remote preset (Med, S).** Without a board the
  only way to add keys is typing NEC address/command numbers, yet most
  receiver kits ship the same 17/21-key NEC remote. Add a one-click preset
  with named keys so users can wire Up/Down/OK before hardware exists.
  Evidence `src/components/Canvas/bodies/IRRemoteBody.tsx:107`.
- [ ] **Presence Sensor: Add a Connected output (Low, S).** Firmware reports
  "nobody" when no frame arrived within 1 s, so an unplugged radar looks like
  an empty room. Add `connected` like the other bus sensors. Evidence
  `src/codegen/peripherals/presenceSensorCpp.ts:90`.
- [ ] **Accel & Gyro: Add a shake output (Med, S).** "Shake to change
  pattern" currently needs Expression (sqrt(x^2+y^2+z^2)-1) plus Compare.
  Add a `shake` float or thresholded bool output. The gyro ports are
  candidates for output folding.
- [ ] **Touch Pad: Add per-electrode outputs (Med, S).** "Pad N pressed"
  needs Compare(Electrode = N) And Touched. Offer per-electrode outputs on
  demand through the grow-a-port socket (see Category).
- [ ] **Keypad: Add per-key outputs (Med, S).** Same per-key socket as Touch
  Pad, so "key A pressed" needs no Compare + And.
- [ ] **Keypad: Add a label or digit output (Low, S).** Key is an index into
  the 4x4 layout, so the key printed "0" is 13. Add a `label` string output,
  or a `digit` output reading 0-9 for number keys, so presets can be picked
  by number. Evidence `src/components/HelpModal/reference/input.ts:557`.
- [ ] **RTC Clock: Allow a Clock node without a DS3231 (High, M).** RTCInput
  is hidden from the library and the only shelf entries are two DS3231
  modules, yet Compile Time, Manual and NTP need no part (and the Help
  example uses Compile Time). A user wanting an NTP clock must add a module
  they don't own. Apply the Audio pattern: a library "Clock" capability node
  with the time-source choice, where a DS3231 on the bench is one provider.
  Evidence `src/build/hardware.ts:28`, `src/components/Hardware/hardwarePartCatalog.ts:533`.
- [ ] **RTC Clock: Handle daylight saving time (Med, M).** NTP time is UTC
  plus a fixed minute offset, so clocks and Schedule Triggers are an hour off
  for half the year in DST regions. Offer a region/time-zone picker that
  emits a POSIX TZ string (`configTzTime` on ESP32). Evidence
  `src/state/peripherals/rtc.ts`, `src/codegen/peripherals/rtcInputCpp.ts`.
- [ ] **RTC Clock: Fold its 14 outputs (Med, M).** Show DateTime, Display,
  Hour, Minute and Valid by default and reveal the rest on demand, using the
  output folding in Category.
- [ ] **Ethernet: Update the "Art-Net and NTP" copy (Low, S).** The network
  layer serves Art-Net, sACN, DDP, Web Remote, Stream Output, internet radio
  and clock sync, but the description, shelf hint, part note, Help text,
  unused-module diagnostic and the DMX/RTC disagreement warning name only
  Art-Net/NTP or DMX/RTC. Reword to "the board's network (Art-Net/sACN, DDP,
  Web Remote, NTP...)". Evidence `src/nodes/hardware/definitions.ts:95`,
  `src/utils/validateGraph.ts:2208`.
- [ ] **DC-DC Converter: Derive Source V from upstream (Med, M).** Source V is
  typed even when decided elsewhere: a Battery Pack ignores it, and with a PD
  trigger the user enters the voltage twice and is warned if they differ.
  Derive the source from the upstream battery or trigger when on the bench
  and show it read-only, which removes the PD-mismatch warning. Evidence
  `src/build/power/electricalPlan.ts:549`, `src/build/power/electricalPlan.ts:461`.
- [ ] **Custom Formula: Expose A and B by default (Low, S).** A, B and
  Palette are property inputs with no `defaultExposedInputs`, so the node
  shows no input ports until exposed, unlike Expression. Expose A and B by
  default. Evidence `src/nodes/code/definitions.ts:19`, `src/nodes/math/definitions.ts:146`.
- [ ] **Custom Formula: Rename to Formula Pattern (Low, S).** Four formula
  nodes share one language under unrelated names (Expression, Custom
  Formula, Field Formula, Formula Shapes). "Formula Pattern" says it outputs
  a frame; also point Help to Field Formula, Field, Frame for composition.
- [ ] **Code: Add float A/B inputs (Med, M).** The only input is an optional
  seed Frame, so a pasted FastLED effect can't follow a pot, Web Remote
  slider or audio level without editing the code. Add Custom Formula's float
  A/B inputs, available as `a`/`b` in both the shim and the sketch. Evidence
  `src/nodes/code/definitions.ts:31`.

#### Audio and audio-reactive

- [ ] **Category: Expose band and drum sockets on audio patterns (High, S).**
  Only Audio → Hue and Level Meter declare `defaultExposedInputs`, so the
  other 23 audio patterns draw no Bass, Mids, Treble, Kick or Vocals socket
  until a wire lands on the row. Add `defaultExposedInputs` for the band and
  drum ports on every audio pattern, as graph-and-nodes.md already advises
  for nodes whose ports are their purpose. Evidence
  `src/nodes/audioReactive/definitions.ts:118`,
  `src/state/propertyInputs.ts:162`.
- [ ] **Category: Use frame-rate-independent envelopes (Med, M).** FFT
  Analyzer, Percussion Detect, Audio Features and Frequency Band smoothing,
  Beat Flash decay/attack, Beat Kaleidoscope punch and Ember Pulse burst
  count frames, while Spectrum Visualizer, Waveform, Color Trails and Beat
  Detect scale by dt. Preview and device agree only at 60 fps, so a Board
  frame rate other than 60 changes flash length and response time. Use
  `pow(k, dt*60)` everywhere, as Spectrum Visualizer does. Evidence
  `src/nodes/audioReactive/evaluate.ts:506`,
  `src/nodes/audio/evaluate.ts:229`.
- [ ] **Category: Rename the `energy` property and port to `reactivity`
  (Med, M).** Every audio pattern relabels `energy` as "reactivity"
  (`src/state/nodeLibrary.ts:3301`), so the stored id matches Audio
  Features' peak-relative Energy output and invites Energy → Reactivity
  wiring (about 20 bundled-pattern edges and the Vocal Aurora help example
  do this). Rename the id and port (pre-1.0, so no migration needed) so
  choosing Energy or Loudness becomes a deliberate wire.
- [ ] **Category: Remap Speed so the current look sits mid-slider (Med, M).**
  BassRings, MidrangeWaves, MidrangeBloom, TreblePrism, AudioCascade,
  KickShock, VocalAurora, BeatKaleidoscope, SpectraMosaic, EmberPulse,
  TurbulentBloom, GravityWell, RainRipples and PrismStorm default `speed`
  to 1.0 on a 0–1 slider, leaving no room to go faster. Remap so the
  current look is 0.5 (internal rate = 2 × slider) and update saved values
  and bundled patterns. Evidence `src/state/nodeLibrary.ts:583`.
- [ ] **Category: Add a "which level to use" table to the help (Med, S).**
  Audio Features Energy is peak-relative, Loudness is absolute RMS, Vibe
  Volume is song-average-relative, and Stereo Levels is absolute on
  line-in but peak-normalised on a microphone. Add a one-line table to the
  Audio Features, Vibe and Stereo Levels help recommending Loudness for
  brightness. Evidence `src/audio/stereoLevels.ts:106`.
- [ ] **Category: Add an optional Audio input to the band patterns (Med,
  M).** Every band pattern needs Mic → FFT Analyzer → pattern. Spectrum
  Visualizer's Three Band style already falls back to the spectrum thirds
  when its band ports are unwired. Give the band patterns an optional Audio
  input with the same fallback so a first patch is one wire; keep FFT
  Analyzer for gain, smoothing and tilt. Evidence
  `src/nodes/audioReactive/evaluate.ts:1158`.
- [ ] **Category: Edge-detect the beat input in every pattern (Low, S).**
  Beat Flash, Beat Kaleidoscope and Ember Pulse re-trigger on every frame
  the input is true, though their help says "each rising edge". A Kick
  envelope or Vibe Spike that stays true for several frames pins the flash
  at full. Detect the rising edge as Kick Shock, Percussion Blobs, Rain
  Ripples, Prism Storm and Dance Flash already do. Evidence
  `src/nodes/audioReactive/evaluate.ts:507`.
- [ ] **Category: Standardise colour inputs on Palette plus optional Color
  (Low, M).** Gravity Well uses a Color port plus R/G/B and no palette,
  Beat Flash uses a `'none'` palette sentinel plus R/G/B, Dance Flash is
  R/G/B only, and Ember Pulse is a fixed HeatColor ramp. Move all four to a
  Palette port plus an optional Color port. Evidence
  `src/state/nodeLibrary.ts:740`.
- [ ] **FFT Analyzer: Replace Bands with crossover controls (Med, S).** The
  32 slots are 16 EQ bins duplicated, so Bands only nudges the crossover by
  a slot, and at counts not divisible by 3 the thirds overlap
  (`spectrumThirdBounds(8)` gives bass [0,3) and mids [2,6)). Replace it
  with two crossover controls in Hz (about 300 and 1500), or make it a
  meter-only display setting. Evidence `src/nodes/audio/evaluate.ts:101`.
- [ ] **Beat Detect: Hide Attack and Decay behind a "Baked show" group (Med,
  S).** Live audio uses FastLED's beat gated by Threshold only, so both
  controls do nothing in the common case. Collapse them into a "Baked show"
  group so Threshold is the one visible knob. Evidence
  `src/nodes/audio/evaluate.ts:147`.
- [ ] **Beat Detect: Tuck away the diagnostic outputs (Low, M).** Flux,
  Onset and Contrast are always 0 on live audio and no bundled pattern
  wires any of the five diagnostic outputs. Move them into the
  BeatDetectBody readout or behind an advanced-outputs toggle. Evidence
  `src/nodes/audio/evaluate.ts:162`.
- [ ] **Audio Features: Derive Silence from Loudness (High, S).** Silence is
  `energy < 0.015 + gate×0.35`, and Energy is peak-relative, so what counts
  as quiet floats with the last few seconds' peak. Gate the absolute
  Loudness instead and drop the Silence Gate workaround from the help.
  Evidence `src/nodes/audio/evaluate.ts:315`.
- [ ] **Audio Features: Apply Sensitivity and smoothing to Loudness (Med,
  S).** Loudness is the raw meter and real music sits at 0.02–0.2 of its
  scale, so wired into a 0–1 input it barely moves and the help tells users
  to add a Smooth node. Apply Sensitivity as a gain plus about 0.15 s of
  smoothing. Evidence `src/nodes/audio/evaluate.ts:294`.
- [ ] **Vibe: Make the Spike outputs one-frame hits (Med, S).** A spike is
  true whenever the instantaneous value exceeds the smoothed one, so it
  stays true for several frames, and the help example wiring Bass Spike →
  Beat Flash stacks flashes. Add a one-frame `bassHit` pulse (threshold on
  imm/avg plus cooldown), or point the example at Beat Detect. Evidence
  `src/audio/fastledReactive.ts:502`.
- [ ] **Vibe: Add a 0–1 output toggle (Low, S).** Level / 2, clamped, would
  remove the Map Range the help says every 0–1 use needs. Evidence
  `src/components/HelpModal/reference/audio.ts:155`.
- [ ] **Pitch Detect: Add a pitch-class or note-hue output (Low, S).** Add
  `pitchClass` (0–11) or `noteHue` (0–360); the help example needs an
  Expression node to get there. Evidence
  `src/components/HelpModal/reference/audio.ts:267`.
- [ ] **Audio → Hue: Add a Balance mode as the default (High, S).** The
  help promises the balance of bass, mids and treble, but the node computes
  a weighted sum × 360, so hue tracks overall loudness and both silence and
  full volume give red. Add a Balance mode, the spectral centroid
  `(0.5·m + t)/(b+m+t)` over a Hue Start and Span, holding the last hue
  near silence. Make it the default for new nodes and keep Weighted Sum for
  the 12 bundled patterns using it. Evidence
  `src/nodes/audio/evaluate.ts:450`.
- [ ] **Frequency Band: Add band presets and narrow the Hz sliders (Med,
  M).** The sliders are linear from 20 to 8000 Hz, so the bass range sits
  in the first 3% of travel, and anything below 90 Hz or above 5.12 kHz
  only re-reads the edge bins. Add a preset select (Kick, Bass, Low mids,
  Vocals, Snare snap, Top) that fills Low and High, and limit the sliders to
  the EQ range. Evidence `src/state/nodeLibrary.ts:915`.
- [ ] **Frequency Band: Fix the "hi-hat air band" wording (Low, S).** The
  definition comment and help mention a hi-hat air band but the spectrum
  stops at 5.1 kHz; say so. Evidence `src/nodes/audio/definitions.ts:208`.
- [ ] **Beat Phase: Stop free-running at the BPM field once beats arrive
  (High, S).** With Beat wired, the phase keeps running at the BPM field and
  wraps (adding to Count) before the real beat resets it. If BPM is faster
  than the song, Count and Bar double-step and Phase saws twice per beat; if
  slower, Phase jumps from about 0.8 to 0. After two beats, run at the
  measured interval or hold phase at 1 until the next beat, and wire Beat
  Detect's BPM into the help example. Evidence
  `src/nodes/audio/evaluate.ts:430`.
- [ ] **Spectrum Visualizer: Show only the controls the style uses (Med,
  S).** Waterfall Speed applies to Waterfall only; Peak Hold and Peak
  Gravity don't apply to Waterfall or Three Band; Reactivity, Speed and
  Mirror apply to Three Band only. Add a SpectrumVisualizer case to
  `isPropertyEnabled` to gate them, as the Music Player's radio group does.
  Evidence `src/state/nodeLibrary.ts:5018`.
- [ ] **Spectrum Visualizer: Smooth Three Band or split it out (Med, S).**
  Three Band ignores the Smoothing and Tilt rows it shows; unwired bands
  are raw spectrum thirds × gain, so bars jitter next to every other style.
  Apply the smoothing, or make Three Band its own node. Evidence
  `src/nodes/audioReactive/evaluate.ts:1158`.
- [ ] **Bass Pulse: Default bass to 0.5 (Med, S).** It defaults to
  `bass: 0` so it drops black, while every sibling uses 0.5. Change the
  default to 0.5. Evidence `src/nodes/audioReactive/definitions.ts:103`.
- [ ] **Beat Flash: Make "Screen" match on preview and firmware (High, S).**
  The preview lerps each channel toward the flash colour and can darken,
  while the firmware only adds `max(0, colour − base)`. A base brighter
  than the flash colour is pulled down in preview but untouched on the
  device, and the sunset-over-Life help example shows different colours. Use
  the firmware's "lighten toward" behaviour in both and rename the mode.
  Evidence `src/nodes/audioReactive/evaluate.ts:546`.
- [ ] **Beat Flash: Soften the default intensity (Med, S).** Defaults give
  a full-white, full-intensity flash on every beat. Default Intensity to
  about 0.4–0.5. Evidence `src/nodes/audioReactive/definitions.ts:252`.
- [ ] **Beat Flash: Merge Keep Base and Blend into one Mode select (Low,
  S).** Blend does nothing when Keep Base is off. Replace both with a Mode
  select (Lighten / Add / Replace), and gate R/G/B off when a palette is
  chosen via `isPropertyEnabled`, removing the `'none'` palette sentinel.
  Evidence `src/state/nodeLibrary.ts:740`.
- [ ] **Dance Flash: Add a Gap select (Med, S).** The 2–5 minute gap
  between flashes is hard-coded. Add a Gap select (for example 30 s, 1–2
  min, 2–5 min); keep the first flash at 2.5–6 s. Evidence
  `src/nodes/audioReactive/danceFlash.ts:14`.
- [ ] **Kick Shock: Default drums to nonzero and demo-fire when unwired
  (Med, S).** Kick, Snare and Hi-Hat default to 0, so it drops near-black
  (idle floor about 5/255). Default the drums to a visible value, or fire a
  slow demo kick while the ports are unwired so the rings show. Evidence
  `src/nodes/audioReactive/definitions.ts:308`.
- [ ] **Vocal Aurora: Stop wiring Energy into Reactivity in the help
  example (Med, S).** The example uses Audio Features Energy, so curtains
  stay fully reactive through a quiet verse. Wire Loudness (or nothing) and
  update the text. Evidence
  `src/components/HelpModal/reference/pattern.ts:1179`.
- [ ] **Percussion Blobs: Default drums to nonzero and demo-spawn when
  unwired (Med, S).** Kick, Snare and Hi-Hat default to 0, so it drops
  black. Use the same fix as Kick Shock: visible defaults, or spawn demo
  blobs while the drum ports are unwired. Evidence
  `src/nodes/audioReactive/definitions.ts:396`.
- [ ] **Gravity Well: Replace R/G/B ports with a palette (Med, S).** It is
  the only band pattern with no palette; a Color port overrides three R/G/B
  float ports. Swap the R/G/B ports for a palette and keep the optional
  Color port, or fold it into Bass Rings as a "lensing" style. Evidence
  `src/nodes/audioReactive/definitions.ts:457`.
- [ ] **Rain Ripples: Consider merging with Kick Shock (Low, M).** Rain
  Ripples is Kick Shock's kick lane with a bool trigger, sharing count,
  decay, thickness, spread and blend. Fold it in as a Trigger input plus a
  preset, or leave as is. Evidence `src/state/nodeLibrary.ts:962`.
- [ ] **Prism Storm: Rename to separate it from Treble Prism (Low, S).**
  "Prism Storm" and "Treble Prism" sit in the same subcategory and read as
  one effect. Rename one, for example "Hi-Hat Shards" for Prism Storm, since
  the hi-hat snap is what sets it apart.
- [ ] **Audio Flow: Share one noise kernel between preview and firmware
  (Med, M).** The preview samples simplex `_snoise2`, the firmware samples
  `inoise8` with a +8 y-offset, so texture and palette coverage differ on
  the device. Move it to a shared integer kernel like its siblings.
  Evidence `src/nodes/audioReactive/evaluate.ts:1107`.
- [ ] **Audio Flow: Align palette fallback and description (Low, S).** The
  preview falls back to `'party'` but the default property is `'rainbow'`,
  and the description doesn't say mids drive the flow and bass drives the
  brightness. Match the fallback to the default and fix the text. Evidence
  `src/nodes/audioReactive/evaluate.ts:1415`.
- [ ] **Color Trails: Cut the tuning knobs (Med, M).** Twelve knobs over 15
  inputs, with separate X and Y speed, amplitude and frequency, and a
  Persistence slider (0.9–0.9999, step 0.0001) the help explains in
  minutes. Link X and Y by default (one Flow speed, strength and scale plus
  an "independent axes" toggle), and replace Persistence with a Trail
  length in seconds. Evidence `src/state/nodeLibrary.ts:899`.
- [ ] **Color Trails: Reconcile the Seed 0 behaviour (Low, S).** Its Seed
  says 0 is a fixed seed, against the global rule that 0 runs free. Align
  it with the rule, or label it differently. Evidence
  `src/state/nodeLibrary.ts:2555`.

#### Colour and maths

- [ ] **Category: Show friendly names in Select dropdowns (Med, S).** Dropdowns
  render raw ids (`inOutApprox`, `oneShot`, `pulseDivider`, `hsvShort`,
  `splitComplementary`, `smoothStep`, `bytes`). Route option text through the
  `BUNDLED_TITLES` table and add a small label map for `mixMode`, `harmony`,
  `position` and `hueUnits`. Evidence `src/components/Canvas/StudioNode.tsx:703`,
  `src/state/nodeLibrary.ts:4625`.
- [ ] **Category: Add an Adjust Color node (Med, M).** Dimming, hue-rotating or
  desaturating one colour takes RGB to HSV, Math, HSV to RGB (the RGB to HSV
  help example is that chain). Add a colour node with hue offset, saturation
  scale and brightness scale, built on the existing `_rgbHue`/`_hsv` helpers.
  Evidence `src/components/HelpModal/reference/color.ts`.
- [ ] **Category: Unify HSV port naming (Low, S).** Ports read `Hue`/`Sat
  (0–1)`/`Val (0–1)` on HSV to RGB, `Saturation`/`Value` with no range on Hue
  Cycle and Harmony Palette, and `H (0–360)`/`S`/`V` on RGB to HSV. Pick one
  pattern, e.g. "Hue (°)", "Saturation (0–1)", "Brightness (0–1)"; "Value" is
  jargon. Evidence `src/nodes/color/definitions.ts`.
- [ ] **Gradient Sampler: Replace the six RGB sliders with two swatches (High,
  S).** Red/green/blue A and B are six sliders standing in for two colours.
  Give each `rA/gA/bA` and `rB/gB/bB` triple one swatch, as `hasRgbProperties`
  does for `r/g/b`; keeping the property names keeps the Color A/B ports
  Touch-controllable. Gradient Frame benefits too. Evidence
  `src/state/nodeLibrary.ts:3306`, `src/components/Canvas/studioNodeChrome.ts:118`.
- [ ] **Gradient Sampler: Clamp T in rgb mode (Med, S).** With T wired outside
  0–1, the preview extrapolates, the canvas clamps, and firmware casts with no
  `constrain`, so a bipolar Wave wraps the colour on hardware. Clamp T in
  `rgb` mode as the hue modes already do. Evidence `src/state/palettes/hueMix.ts:35`,
  `src/codegen/cppGenerator.ts:969`.
- [ ] **Gradient Sampler: Hide the six float sockets (Low, S).** Once swatches
  exist, drop the `rA`…`bB` ports from the inspector's exposable list; they
  are rarely wired and make the node look complex. Evidence
  `src/state/nodeLibrary.ts:4295`.
- [ ] **Palette Sampler: Add a wrap/hold-ends option (Med, S).** T = 1 wraps to
  the first colour, so a full-scale sensor on `heat` reads black, and for T in
  0.945–1 firmware blends toward entry 0 while the preview shows the last
  stop. Add "Wrap" / "Hold ends" using `samplePaletteClamped` and
  `LINEARBLEND_NOWRAP`. Evidence `src/nodes/color/evaluate.ts:141`,
  `src/nodes/color/codegen.ts:70`.
- [ ] **Palette Sweep: Add a Loop motion option (Med, S).** The node only
  ping-pongs, so a cyclic palette cannot scroll one way without Palette
  Sampler plus a sawtooth Wave. Add a Motion select, "Ping-pong" / "Loop".
  Evidence `src/nodes/color/evaluate.ts:147`.
- [ ] **Palette Sweep: Reuse Ease's easing table (Low, S).** The node has its
  own list and `applySweepEase`; its "cubic" is `4t³` while Ease's in-out
  "cubic" is smoothstep, so one name gives two curves. Reuse `applyEase` and
  the `EASE_TYPES` subset. Evidence `src/nodes/color/evaluate.ts:66`.
- [ ] **HSV → RGB: Fix the "FastLED byte" hue units (Med, S).** `bytes` is a
  rescaled spectrum wheel (`h/255*360`), not FastLED's CHSV rainbow wheel, so
  "96 green, 160 blue" is only approximate. Either make `bytes` the rainbow
  wheel on both sides, or relabel it "0–255 wheel" and correct the anchors to
  85/170. Evidence `src/nodes/color/evaluate.ts:94`, `src/codegen/colorControlCpp.ts:14`.
- [ ] **HSV → RGB: Make the Hue slider max follow the units (Low, S).** The
  slider stays 0–360 in bytes mode. Make its max depend on `hueUnits`, as
  `propertyOptions` does for dependent selects. Evidence
  `src/state/nodeLibrary.ts:720`.
- [ ] **Color Temperature: Fix the inverted Warmth property (Med, S).** 0 is
  candle (warmest) and 1 is blue sky, so raising Warmth cools the light.
  Rename it "Coolness" or, better, flip the mapping so 1 = warm. Evidence
  `src/nodes/color/evaluate.ts:45`, `src/state/nodeLibrary.ts:2689`.
- [ ] **Color Temperature: Offer a Kelvin control (Low, S).** The linear
  1000–12000 K map puts the useful whites (2700–6500 K) in only 0.15–0.5 of
  the slider. Use roughly 1800–9000 K in Kelvin. Evidence
  `src/nodes/color/evaluate.ts:45`.
- [ ] **Custom Palette: Correct the stale "four colours" text (Med, S).**
  Description, definition comment and Help say "up to four colours, spaced
  evenly", but the body supports 2–8 draggable, positioned stops with presets
  and export. Update the text. Evidence `src/nodes/color/definitions.ts:165`,
  `src/components/HelpModal/reference/color.ts:279`.
- [ ] **Custom Palette: Bind ports to stable stop ids (Low, M).** Wires bind to
  the sorted stop index, so dragging a wired stop past a neighbour moves its
  wire onto the other stop, and only 4 of up to 8 stops can be wired. Bind
  each port to a stop id, or show in the body which stop each port drives.
  Evidence `src/nodes/color/evaluate.ts:211`.
- [ ] **Poline Palette: Make preview and firmware use the same table (Med,
  S).** The preview interpolates the raw poline array (2·points+3 colours)
  while firmware resamples to 16 by nearest index, duplicating entries; at
  `points: 1` it posterises on hardware. Resample with interpolation on both
  sides and have the evaluator return `polineStops16`. Evidence
  `src/nodes/color/evaluate.ts:228`, `src/state/palettes/polinePalette.ts:86`, `src/codegen/helpers/polineHelperCpp.ts:59`.
- [ ] **Poline Palette: Fix the anchor count wording (Low, S).** Text says "up
  to three anchors" / "two or three", but all three are always used. Say
  "three", or add an anchor count of 2/3. Evidence `src/nodes/color/evaluate.ts:223`.
- [ ] **Poline Palette: Add a dark-middle preset (Low, S).** Add a
  `POLINE_PRESETS` entry with a deep tinted middle anchor (e.g. `#14063c`) so
  the high-contrast recipe is one click away.
- [ ] **Harmony Palette: Make harmonies hold their hues (High, M).** Hue is
  interpolated linearly between anchor offsets, so complementary sweeps red,
  orange, yellow, green, cyan and the other kinds are 210–270° rainbow
  segments; "never clash" is false. Hold each harmony hue as a band with short
  blends between, in the preview helper and the C++ loop. Evidence
  `src/state/palettes/harmonyPalette.ts:26`, `src/nodes/color/codegen.ts:161`.
- [ ] **Harmony Palette: Add a Shade control for a black point (Med, S).**
  Every stop has the same Value, so full-frame patterns wash out. Add a
  0–1 "Shade" that dips Value between the hue bands. Evidence
  `src/state/palettes/harmonyPalette.ts:33`.
- [ ] **Palette Transform: Add a Black point control (High, M).** Add a 0–1
  levels-style floor, per entry `c' = max(0, c − f)/(1 − f)`, in the same
  loop on both sides, so any catalogue palette gets real contrast without a
  hand-built Poline. Evidence `src/nodes/color/evaluate.ts:247`,
  `src/nodes/color/codegen.ts:244`.
- [ ] **Palette Transform: Add its own preset select (Med, S).** With nothing
  wired it silently transforms `rainbow`, so reversing or dimming a preset
  needs Palette Selector first. Use a key other than `palette` (as Palette
  Blend does with `paletteA`) so it stays a builder under
  `PALETTE_BUILDER_NODE_TYPES`. Evidence `src/nodes/color/evaluate.ts:242`,
  `src/nodes/color/codegen.ts:241`.
- [ ] **Palette Bank: Seed default palettes (Med, S).** A fresh node has
  `palettes: []`, outputs the fallback and raises a validation warning. Seed
  3–4 contrasting presets so the first Next does something visible. Evidence
  `src/nodes/color/definitions.ts:289`.
- [ ] **Palette Bank: Add an Index input (Med, M).** Next/Previous are the only
  way in, so Step Value, an encoder, DMX or a Touch slider cannot pick a
  palette directly, though the node already outputs Index. Add an Index input
  that selects directly.
- [ ] **Palette Bank: Accept wired palettes (Low, L).** Only catalogue presets
  can join a bank; Custom, Poline, Image and Harmony palettes cannot. Add
  wired palette slots to make it the general palette switcher. Evidence
  `src/nodes/color/codegen.ts:181`.
- [ ] **Map Range: Add a Clamp output toggle (High, S).** Help tells users to
  follow Map Range with Clamp, and it is the standard normaliser for
  un-normalised inputs. One checkbox removes a node from the commonest chain
  and stops extrapolated values from breaking effects. Evidence
  `src/components/HelpModal/reference/math.ts:89`.
- [ ] **Map Range: Expose only Value by default (Low, S).** All five sockets
  are exposed, but the ranges are nearly always typed. Expose only Value
  (hidden sockets stay drop targets); do the same for Clamp's Min/Max.
  Evidence `src/nodes/math/definitions.ts:68`.
- [ ] **Step Value: Lift the ±100 slider caps (Med, S).** Initial/Min/Max/Step
  are capped at ±100 and `EditableRange` rejects typed values outside it, so a
  0–255 brightness or 60–180 BPM counter cannot be set, though the normaliser
  allows ±1,000,000. Switch to `entry: 'number'`. Evidence
  `src/state/nodeLibrary.ts:626`, `src/nodes/shared/stepValue.ts:30`.
- [ ] **Step Value: Declare action inputs for Touch (Med, S).** Increase,
  Decrease and Reset are not `actionInputs`, so Touch controls cannot be
  minted on them, which is the use its comment names. Declare them as Palette
  Bank does. Evidence `src/state/propertyInputs.ts:35`, `src/nodes/color/definitions.ts:273`.
- [ ] **Lerp: Remove it in favour of Map Range (Med, S).** Same maths as Map
  Range with In 0–1, and "Lerp" is jargon. Remove it (one bundled use) now
  that Map Range gains a clamp, or at minimum rename it "Mix Numbers" and
  label T "(0–1)". Evidence `src/nodes/math/evaluate.ts:93`.
- [ ] **Ease: Clean up the dropdown (Med, S).** Fourteen camelCase options are
  shown. Drop `inOutApprox` ("Fast Approx") from the picker, as it is a CPU
  detail with no visible difference, but keep the id for saved graphs.
  Evidence `src/state/nodeLibrary.ts` `BUNDLED_TITLES.Ease`.
- [ ] **Ease: Make header labels consistent (Low, S).** In-out curves read
  `Ease · Cubic`/`Ease · Quad` while others read `Ease In/Out · Sine`. Use
  "Ease In/Out · Cubic" etc. Evidence `src/state/nodeLibrary.ts` `BUNDLED_TITLES.Ease`.
- [ ] **Gate: Remove it in favour of Switch (Med, S).** Gate is exactly Switch
  with A = fallback, and Switch can also wire the fallback. It has no bundled
  uses; remove it and move its "roam only while held" Help example to Switch.
  Evidence `src/nodes/math/evaluate.ts:124`.
- [ ] **Smooth: Add a separate Fall time (Med, S).** Fast attack with slow
  release is the standard way to tame audio levels and VU readouts, and
  neither Smooth nor Envelope can do it. Add an optional Fall time (rise =
  Response): one extra `alpha` branch on each side. Evidence
  `src/nodes/math/evaluate.ts:139`, `src/nodes/math/codegen.ts:72`.
- [ ] **Compare: Add an operation select and hysteresis (Med, S).** Only
  `A > B` exists. Add >, <, ≥, ≤ and a Hysteresis amount (on above B + h, off
  below B − h), so flicker near a threshold is fixed in the level domain
  rather than with a following Trigger/Debounce. Evidence
  `src/components/HelpModal/reference/math.ts:423`.

#### Effects and signals

- [ ] **Category: Split the flat Effects list into subcategories (Med, S).**
  Effects has 21 nodes in one mixed list; `SUBCATEGORY_ORDER` has no
  `composite` entry. Add one with Layer (Blend, Mask, Frame Switch, Zones,
  Glitter), Colour (Brightness, Hue Shift, Saturation, Color Boost, Gamma,
  Invert), Geometry (Frame Transform, Transform, Mirror, Kaleidoscope,
  Symmetry, Array, Frame Warp) and Time (Trails, Frame Feedback, Blur 2D).
  Evidence `src/state/nodeLibrary.ts:224`.
- [ ] **Category: Merge the overlapping frame-transform nodes (Med, M).**
  Frame Transform, Transform, Frame Warp, Array, Frame Feedback and Symmetry
  each own part of offset/rotate/scale, "Rotate" means three different
  things, and "Transform" vs "Frame Transform" are near-identical names for
  opposite behaviours. Before v1, make one Frame Transform with any-angle
  rotate, scale and offset, each with an optional per-second rate. Keep
  Frame Warp for field-driven displacement only. Evidence
  `src/nodes/composite/definitions.ts`.
- [ ] **Category: Fold Kaleidoscope into Mirror, rename Symmetry (Med, M).**
  Mirror, Kaleidoscope and Symmetry all fold a frame. Add a "Radial" axis
  to Mirror with a Segments control shown only for that axis (Mirror
  already hides glow controls by mode), share Symmetry's Rotation/Spin so
  the radial fold can turn, and rename Symmetry "Tile Symmetry". Evidence
  `src/state/nodeLibrary.ts:5253`.
- [ ] **Category: Merge Color Boost into Saturation (Med, S).** Both scale
  distance from grey. Saturation is HSV-based (0-2); Color Boost keeps
  brightness, only boosts, and its 0-1 slider secretly means 1x-2.5x. Make
  one Saturation node with a "Keep brightness" toggle that switches to the
  luma formula. Evidence `src/nodes/composite/evaluate.ts:528`.
- [ ] **Category: Add a scope to Noise LFO and Envelope (Low, M).** Only
  Wave has an on-node scope, but these two are the nodes whose shape is the
  whole point. Evidence `src/components/Canvas/StudioNode.tsx:1315`.
- [ ] **Blend: List Lighten in the mode lists (Low, S).** The node
  description and help overview name six modes and omit Lighten, and the
  global `blendMode` meta lacks it too, which invites drift. Add it to all
  three. Evidence `src/nodes/composite/definitions.ts:397`.
- [ ] **Blend: Route Normal mode through the byte kernel (Low, S).**
  Preview Normal uses float maths while firmware uses FastLED `nblend`;
  every other mode shares `blendMix8`. Use the kernel for Normal to remove
  the last off-by-one gap. Evidence `src/nodes/composite/evaluate.ts:243`,
  `src/nodes/composite/codegen.ts:308`.
- [ ] **Brightness: Match preview and firmware rounding (Low, S).** Preview
  rounds, firmware truncates `(uint8_t)fminf(...)`, so at 0.5 a level-1
  pixel stays 1 in preview but is 0 on the board. Add `+0.5f` in firmware
  or use the byte kernel on both sides. Evidence
  `src/nodes/composite/evaluate.ts:256`, `src/nodes/composite/codegen.ts:17`.
- [ ] **Gamma: Make preview match FastLED on dim pixels (Med, S).** Preview
  uses `Math.round(255*(c/255)^g)`; firmware `napplyGamma_video` truncates
  and lifts every non-zero input to at least 1. At gamma 2.2, inputs up to
  about 12 are black in preview but glow on the LEDs. Truncate, then raise
  non-zero results to 1 in the preview, and add a gamma parity test.
  Evidence `src/nodes/composite/evaluate.ts:551`,
  `src/nodes/composite/codegen.ts:222`.
- [ ] **Gamma: Offer a Gamma setting on the LED output (Low, M).** Help says
  to put Gamma last, just before the LED output; a setting on the output
  would remove a node from most finished graphs. Evidence
  `src/components/HelpModal/reference/composite.ts:171`.
- [ ] **Color Boost: Match preview and firmware rounding (Low, S).** Preview
  rounds, firmware truncates `(uint8_t)constrain(...)`. Use one rule on
  both sides. Evidence `src/nodes/composite/evaluate.ts:533`,
  `src/nodes/composite/codegen.ts:214`.
- [ ] **Transform: Make Scale mode loop instead of freezing (Med, S).**
  `s = 1 + phase/100` clamps to 0.05-20, so at the default rate 90 a zoom-in
  freezes at 20x after about 21 s and a negative rate freezes after about
  1 s. Use a ping-pong zoom or an exponential zoom that wraps within one
  octave. Evidence `src/nodes/composite/evaluate.ts:81`,
  `src/nodes/composite/codegen.ts:240`.
- [ ] **Transform: Give Rate a per-mode range or label (Low, S).** One
  -360..360 step-1 slider serves degrees/s, %/s and px/s, so 0.5 px/s is
  impossible and 360 px/s is meaningless on a 16-wide matrix. Evidence
  `src/state/nodeLibrary.ts:1150`.
- [ ] **Array: Default blend to lighten (Med, S).** Default `add` stacks
  five copies at falloff 0.7 (about 2.8x gain), so any full-frame source
  such as Plasma turns almost white; the help example already picks
  `lighten`. Evidence `src/nodes/composite/definitions.ts:206`.
- [ ] **Array: Share one copy-limit constant (Low, S).** The limit is 24 in
  the slider, 32 in the preview cap and a 32 literal in firmware. Use one
  shared constant per the bounds rule. Evidence
  `src/state/nodeLibrary.ts:1160`, `src/nodes/composite/codegen.ts:266`.
- [ ] **Mirror: Handle Diagonal on non-square matrices (Low, S).** Diagonal
  assumes square; on a wide panel `bx`/`by` clamping smears every column
  past H into strips. Disable Diagonal when W differs from H, or say so in
  its tooltip. Evidence `src/nodes/composite/evaluate.ts:587`.
- [ ] **Mirror: Match glow rounding to firmware (Low, S).** Preview adds an
  unrounded float (and passes non-integer channels downstream); firmware
  chains two truncating `scale8` calls. Round the same way in the preview.
  Evidence `src/nodes/composite/evaluate.ts:581`,
  `src/nodes/composite/codegen.ts:368`.
- [ ] **Frame Warp: Add a built-in displacement source (Med, M).** With
  defaults it does nothing visible (zoom 1, rotate 0, unwired fields read
  0.5, meaning no push); seeing an effect needs two hand-written Field
  Formula nodes. Add a Swirl / Ripple / Turbulence select with a speed,
  used when dx/dy are unwired. Evidence
  `src/nodes/composite/evaluate.ts:378`.
- [ ] **Symmetry: Add display labels to select options (Med, M).** The group
  dropdown shows crystallographic codes (p1, pm, p4m, p6m...) and
  `PropertyControl` selects cannot carry labels. Add optional option labels
  (e.g. "p4m: square, mirrors + quarter turns"), also useful for
  FieldSymmetry. Evidence `src/state/evaluator/symmetry.ts:1`,
  `src/state/nodeLibrary.ts:410`.
- [ ] **Frame Feedback: Allow rotate and zoom together (Med, M).**
  Translate, Rotate and Scale are mutually exclusive, so the classic
  turning tunnel needs a separate Transform in front. Add a combined "Zoom
  + Turn", or apply all four values like Array; `feedbackFrame` already
  computes cos/sin and inverse scale together. Evidence
  `src/state/nodeLibrary.ts:5322`, `src/nodes/shared/integerPatterns.ts:1330`.
- [ ] **Frame Feedback: Use a time-based fade like Trails (Low, S).** Its
  `fade` is linear and per frame, so the look depends on frame rate. Move
  it to the shared half-life fade and use the same semantics as Trails,
  which it generalises. Evidence `src/state/nodeLibrary.ts:3482`.
- [ ] **Frame Feedback: Unify "Amount" vs "opacity" naming (Low, S).** The
  port is labelled Amount but its row says "opacity", and Blend's port says
  Opacity. Pick one word across Blend and Frame Feedback. Evidence
  `src/nodes/composite/definitions.ts:328`, `src/state/nodeLibrary.ts:3482`.
- [ ] **Frame Switch: Add a Select property (Med, S).** There is no manual
  toggle; unwired it always shows A, and checking B needs a wired button.
  Add a `select` boolean property as the `sel` port's property input, as
  Schedule Trigger's `enable` does. Math `Switch` has the same gap.
  Evidence `src/nodes/composite/definitions.ts:365`.
- [ ] **Zones: Add a per-zone Fit option (Med, M).** Zones crop rather than
  place: each copies `src[y][x]` at the same coordinates, so in the "Four
  seasons" help example Fire in zone B shows only a quarter of a
  full-matrix fire. Add nearest-neighbour downscale into the rectangle.
  Evidence `src/nodes/composite/evaluate.ts:314`,
  `src/nodes/composite/codegen.ts:47`.
- [ ] **Zones: Fix the "named rectangle" wording (Low, S).** Zones cannot be
  named. Drop "named" or add a label field. Evidence
  `src/nodes/composite/definitions.ts:416`.
- [ ] **Wave: Allow slow frequencies (Med, S).** Frequency uses the shared
  0-4 Hz, step 0.1 slider and `EditableRange` rejects off-step typed
  values, so the slowest LFO is 10 s and the help's own 0.15, 0.12 and 0.07
  Hz cannot be entered. Add a Wave override with step 0.01, or a
  "Period (s)" rate unit. Evidence `src/state/nodeLibrary.ts:519`,
  `src/components/EditableRange/validRangeValue.ts:7`.
- [ ] **Wave: Default to Unipolar (Med, S).** The default swings -1 to +1
  while most targets read 0-1, and three of four composite help examples
  turn Unipolar on. Default `unipolar: true` before v1. Evidence
  `src/nodes/signal/definitions.ts:26`.
- [ ] **Random: Add a trigger input (Med, S).** It draws a new value every
  frame, and its own help sends users to Sample & Hold for "new value per
  beat". Add an optional `trigger` bool input that draws only on a rising
  edge, and make Min and Max wireable property inputs. Evidence
  `src/nodes/signal/definitions.ts:74`.
- [ ] **Schedule Trigger: Replace seven clock inputs with one dateTime
  (High, M).** Day/Month/Year left unwired freeze the day key, so Trigger
  mode fires on the first day only, and unwired Weekday reads Sunday so
  Weekdays mode never runs. Help asks for four wires and Graph Health
  checks only two. Take one `dateTime` input from RTC Clock's DateTime
  output (already used by Clock Display) and keep Enable as the only other
  input. Evidence `src/nodes/signal/evaluate.ts:157`,
  `src/nodes/signal/definitions.ts:104`.
- [ ] **Schedule Trigger: Replace six time sliders with two time fields
  (Med, M).** Start and end take hour/minute/second sliders. Use two HH:MM
  fields with optional seconds. Evidence `src/state/nodeLibrary.ts:702`.
- [ ] **Schedule Trigger: Move Enable out of "Day Rules" (Low, S).** It
  belongs with Timing or on its own. Evidence
  `src/state/nodeLibrary.ts:4092`.
- [ ] **Clock: Rename to avoid RTC Clock and Clock Display (Med, S).**
  Searching for time of day finds a BPM metronome. Rename it "Tempo Clock"
  or "BPM Clock". Evidence `src/nodes/input/definitions.ts:487`,
  `src/nodes/shapes/definitions.ts:95`.

#### Fields and shapes

- [ ] **Category: Make Field Formula x/y 0-1 like Custom Formula (High, S).**
  Field Formula passes integer pixel `x, y`, but Custom Formula (same variable
  list and tooltip) passes 0-1, and Field Formula's Help says "0 to 1". Moving
  a formula between the two, or following the Help, gives the wrong picture.
  Make `x, y` 0-1 and add `px, py` for pixels, then update the 3 bundled
  patterns that use it. At minimum, correct the Help.
  `src/nodes/field/evaluate.ts:172`, `src/components/HelpModal/reference/field.ts:10`.
- [ ] **Category: Fix centred fields on a 1-row strip (Med, M).** Strips,
  rings and corkscrews are `height: 1`, where `centeredY(0, 1)` is -1, so
  every centred field samples only the bottom of its circle. Formula Shapes'
  superformula and Lissajous render near-black, Shape Field's default circle
  is a sub-pixel speck (it sizes by the short side), and Path and Fourier
  cannot move (reach is 0). Centre on pixel centres, `(y+0.5-H/2)/(H/2)`, and
  use the long side when one dimension is 1. Same for the rose kernel.
  `src/state/evaluator/formula.ts:28`, `src/nodes/shared/integerPatterns.ts:1232`.
- [ ] **Category: Merge Field Warp, Field Rotate and Field Tile into one
  transform node (Med, M).** They duplicate Frame Warp, which has offset
  fields, strength, zoom, rotate, edge mode and bilinear sampling. Build one
  Field Transform/Warp mirroring Frame Warp, adding spin and tiles X/Y. This
  also fixes Field Rotate always wrapping (a ramp or edge shape pulls the
  opposite edge into the corners) and Field Tile dropping detail by skipping
  pixels. Migrate the bundled patterns that use the three (Fibonacci Spiral
  Drive, Golden Ratio Cathedral, Lissajous Lattice, audio release sets).
  `src/nodes/field/evaluate.ts:575`, `:590`.
- [ ] **Category: Give Shape and Shape Field one size unit and one name list
  (Med, S).** Shape `size` is pixels (default 6 overflows 8x8, tiny on
  64x64); Shape Field `size` is a fraction of the short side. Shape says
  `ellipse` where Shape Field says `circle`. Use a fraction (or Clock
  Display's `scaleWithMatrix`) and one shape-name list for both.
  `src/state/nodeLibrary.ts:1378`.
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
  Pre-v1, rename the type cleanly if the node stays.
- [ ] **Category: Grow field nodes so pattern/field twins are not subsets
  (Low, M).** Noise has 9 algorithms vs Field Noise's fBm only; Game of Life
  has no Automaton equivalent; Reaction Diffusion/Turing Field, Custom
  Formula/Field Formula and the gradient patterns repeat likewise. Add
  `noiseType` to Field Noise and a Conway `life` type to Automaton so field
  chains are not stuck with the subset.
- [ ] **Category: Unify spin/rotation units and names (Low, S).** `spin` is
  deg/s on Field Rotate, Slice Tiling and Field Symmetry, turns/s on Polar
  Gradient (unlabelled), and a static angle on Fractal Field. Name the static
  ones `rotation` and put units in labels, as Wireframe3D's "spin X (deg/s)"
  does. `src/state/nodeLibrary.ts:1056`, `src/nodes/field/codegen.ts:344`.
- [ ] **Category: Make port labels match row labels (Low, S).** Formula
  Shapes' port reads "Symmetry" but its row "lobes"; Fluid's ports read
  "Inject / Inject X / Inject Y" but its rows "dye / source X / source Y".
  `src/nodes/field/definitions.ts:117`, `:190`.
- [ ] **Field Formula: Add a/b sliders (Med, S).** `a` and `b` are bare ports
  with no property, so tuning a constant needs a wired node. Declare
  `propertyInputs: { a, b }` with default 0, as Custom Formula does.
  `src/nodes/field/definitions.ts:16`, `src/nodes/code/definitions.ts:19`.
- [ ] **Field Noise: Add contrast/normalise to fBm (Med, S).** fBm is a
  weighted average of octaves, so values cluster near 0.5 and the palette ends
  (including black) are rarely reached. Add a contrast or normalise option
  here, or handle it in Field -> Frame. `src/nodes/shared/integerPatterns.ts:1159`.
- [ ] **Wave Sim: Add wireable splashX/splashY (Med, S).** A splash always
  lands on a fixed cycle of five points. Add inputs like Fluid's
  `injectX/injectY` so touch, joystick or beat position can kick the water.
  `src/nodes/field/evaluate.ts:310`, `src/nodes/field/codegen.ts:291`.
- [ ] **Wave Sim: Make Wrap X cover both axes (Low, S).** Y always wraps while
  X wrap is a toggle, so with Wrap X off edges reflect left/right but wrap
  top/bottom. Let the toggle cover both, or rename it "Wrap edges".
  `src/nodes/field/evaluate.ts:337`.
- [ ] **Fluid: Rename `speed` to `quality` (Med, S).** It is solver passes
  (4-20) and raising it slows the flow ("More is smoother and slower"), the
  opposite of what a Speed slider implies. Rename to `quality` or
  `solverPasses`; pre-v1 drop the old name. `src/state/nodeLibrary.ts:1825`,
  `src/state/evaluator/fluid.ts:24`.
- [ ] **Fractal Field: Rename `spin` to `rotation` (Med, S).** `spin` is a
  fixed view angle in degrees, while everywhere else `spin` is a rate.
  Rename to `rotation`; optionally add a real `spin`.
  `src/nodes/field/codegen.ts:344`, `src/state/nodeLibrary.ts:1835`.
- [ ] **Fractal Field: Make zoom exponential (Med, M).** Linear 0.25-64 means
  1x to 2x is about 1.6% of the travel, so flying into the Mandelbrot is
  impractical. Expose zoom as an exponent (zoom = 2^z, z 0-6) or add a log
  slider kind; `PropertyControl` has none. `src/state/nodeLibrary.ts:1506`, `:410`.
- [ ] **Automaton: Accumulate fractional steps in preview (Low, S).** Preview
  quantises speed to whole 60-tick intervals (31-40 all run 30 steps/s) while
  firmware uses `1000/speed` ms. Accumulate fractional steps on the clock.
  `src/state/evaluator/automaton.ts:31`, `src/nodes/field/codegen.ts:392`.
- [ ] **Field -> Frame: Add input range or auto-normalise (Med, S).** Fields
  rarely reach the palette's black point or top (Field Noise averages near
  0.5, Frame -> Field red is 0.33, Fractal/Automaton sit low), so painting
  uses the middle of the palette and every chain needs a Field Levels node.
  Add `low`/`high` (Field Levels semantics) or an auto-normalise toggle.
  `src/nodes/field/evaluate.ts:836`, `src/state/evaluator/frames.ts:189`.
- [ ] **Field -> Frame: Add a wireable palette offset (Low, S).** Colour
  cycling today needs a Palette plus Palette Transform into `paletteIn`.
- [ ] **Frame -> Field: Add a conversion mode select (Med, S).** Plain
  `(r+g+b)/3` makes saturated red or blue a 0.33 field and a rainbow
  0.33-0.67. Add modes: average (today), max (HSV value) and luma.
  `src/nodes/field/evaluate.ts:853`, `src/nodes/field/codegen.ts:440`.
- [ ] **Field Math: Let unwired B be a wireable constant (Med, S).** An
  unwired side is a zero field, so scaling or offsetting by a knob or audio
  level needs Float -> Field. Add a `value` (0-1) for B alongside Mix, so
  "multiply by bass" is one node and Float -> Field can retire.
  `src/nodes/field/evaluate.ts:452`.
- [ ] **Gradient Field: Use aspect-correct coordinates (Med, S).** Coordinates
  are normalised per axis, so the radial ramp is an ellipse on non-square
  panels and Angle is not a true angle. Use short-side units as Shape Field
  does. `src/nodes/field/evaluate.ts:893`.
- [ ] **Gradient Field: Gate Angle and fix cx/cy description (Low, S).**
  `angular` ignores Angle: use it to turn the pinwheel or gate it to `linear`
  in `isPropertyEnabled`. Also `cx/cy` are described as radial/angular only
  but pivot the linear ramp too. `src/nodes/field/evaluate.ts:899`,
  `src/state/nodeLibrary.ts:2171`.
- [ ] **Float -> Field: Retire the node (Med, S).** Its only job is feeding
  Field Math; no bundled pattern uses it besides its own Help example. Remove
  it once Field Math's unwired B reads a constant.
- [ ] **Field Warp: Raise default strength and add bilinear sampling (Med,
  S).** Default strength 1 is only +-1 px, barely visible (its Help example
  uses 3, Frame Warp defaults to 2), and nearest-only sampling steps visibly.
  Raise the default and add bilinear sampling. If merged into the transform
  node, apply there. `src/nodes/field/definitions.ts:399`,
  `src/nodes/field/evaluate.ts:555`.
- [ ] **Text: Add a `base` input (Med, S).** Every other drawing node draws
  over a base; Text alone renders on black (`fill_solid(...Black)`), so its
  Help example needs a Blend in screen mode, which cannot draw opaque text.
  Add `base`. `src/nodes/shapes/definitions.ts:69`,
  `src/nodes/shapes/codegen.ts:475`.
- [ ] **Text: Add an integer size (Med, M).** The only font is 3x5, tiny on
  32x32 or 64x32 HUB75 panels. Add an integer `size` (pixel scale 1-4),
  shared with Clock Display's digits. `src/nodes/shared/font.ts:10`.
- [ ] **Text: Expose or remove `props.font` (Low, S).** Both sides read it but
  nothing writes it (hidden in `src/components/Canvas/studioNodeChrome.ts:145`). Expose a font
  choice or delete the dead property. `src/nodes/shapes/evaluate.ts:558`,
  `src/nodes/shapes/codegen.ts:463`.
- [ ] **Clock Display: Gate `scaleWithMatrix` with radius (Low, S).** It only
  affects the analogue radius but is always shown. Gate it with `radius` in
  `isPropertyEnabled`. `src/state/nodeLibrary.ts:5194`,
  `src/nodes/shapes/evaluate.ts:597`.
- [ ] **Clock Display: Split Stopwatch/Timer into a signal node (Low, M).**
  A transport lives inside a drawing node; anyone wanting only `done` still
  draws digits. Consider a small Timer signal node with Clock Display drawing
  a wired `seconds`.
- [ ] **Line: Stop over-brightening (Low, S).** Additive 0.5 px discs splatted
  every 0.5 px sum to about 2x on-line coverage; (0,100,128) shows near
  (0,200,255) and anti-aliasing is lost. Splat with max (lighten) or compute
  distance to the segment once. `src/nodes/shapes/evaluate.ts:717`,
  `src/nodes/shapes/codegen.ts:209`.
- [ ] **Line: Add thickness and align units (Low, S).** Path and Shape have
  thickness, Line does not; Line alone uses pixel coordinates while siblings
  are normalised. Add thickness and a units select or a 0-1 default.
- [ ] **Shape: Fix the default size overflow on small panels (Med, S).** The
  fixed default of 6 px overflows an 8x8 panel. Besides the shared size-unit
  change (category), make the default a fraction of the short side or add
  `scaleWithMatrix`. `src/state/nodeLibrary.ts:1378`.
- [ ] **Path: Wrap T and add `speed` (Med, S).** With defaults it is one
  frozen dot. T is clamped to 0-1 though `pathPoint` already wraps, so a Time
  node stalls at 1. Wrap T and add a `speed` (turns/s) used while T is
  unwired, as Fourier Epicycles has. `src/nodes/shapes/evaluate.ts:761`,
  `src/nodes/shapes/codegen.ts:298`.
- [ ] **Path: Match Fourier's shape list (Low, S).** Path offers 5 shapes
  against Fourier's 8 though its comment says they draw the same curves. Add
  `star`, `square`, `infinity`, or treat Path as Fourier with circles off and
  a T input. `src/state/nodeLibrary.ts:439`, `src/nodes/shapes/fourierOutline.ts:14`.
- [ ] **Fourier Epicycles: Move persistence to half-life trail fade (Med,
  M).** `persistence` is a per-frame share on a 0-1 slider with default 0.995,
  so useful values sit in the top 5% of travel and trail length follows frame
  rate. Move it to `trailFadeAmount` (see `docs/development/patterns/graph-and-nodes.md` ~291-302), with
  a firmware twin. `src/nodes/shapes/evaluate.ts:184`,
  `src/nodes/shared/trailFade.ts:42`.
- [ ] **Fourier Epicycles: Fix the Harmonics slider range (Low, S).** The
  slider runs to 64 but `maxHarmonics` defaults to 32, so the top half does
  nothing. Bake `ceil(harmonics)` when unwired and show `maxHarmonics` only
  when wired. `src/state/nodeLibrary.ts:1434`.
- [ ] **Gradient Frame: Replace `vertical` with `angle` or fold into Palette
  Gradient (Med, S).** It is horizontal/vertical only beside Palette
  Gradient's free angle. Add `angle`, or add an A/B colour mode to Palette
  Gradient and retire this node. `src/nodes/shapes/evaluate.ts:480`.
- [ ] **Gradient Frame: Guard vertical on strips (Low, S).** With H=1,
  `_y/(HEIGHT-1.0f)` is 0/0 = NaN, and NaN cast to a byte is undefined
  behaviour on the board. Guard with `max(1, H-1)` as Palette Gradient does.
  `src/nodes/shapes/codegen.ts:685`.
- [ ] **Image: Apply brightness after contrast (Low, S).** Brightness runs
  before contrast, so with contrast 0.5, Brightness 0 leaves a 25% grey veil
  and fading by wiring Brightness fails. Apply brightness last, on both sides.
  `src/nodes/shared/image.ts:209`, `src/nodes/shared/image.ts:153`.
- [ ] **Image: Move `sampling` to the Transform group (Low, S).** It sits in
  "Playback". `src/state/nodeLibrary.ts:4135`.

#### Generative and simulations

- [ ] **Category: Give `fade` one meaning on every node (High, M).** Confetti
  and Juggle use the half-life scale (0 longest trail, 1 none); Flow Field,
  Ripple, String Particles, Game of Life, Formula Points `persistence` and
  Particles `decay` use per-frame retention (1 never fades); Scanner `fade` is
  glow length (1 longest). A slider learned on one node does the opposite on
  the next. Pre-v1, rename all of them to one key (for example `trail`: 0
  none, 1 longest), route them through `trailFadeAmount`/`trailFadeCpp`, and
  convert bundled and help values. Evidence `src/nodes/shared/trailFade.ts:26`,
  `docs/development/patterns/graph-and-nodes.md:291`.
- [ ] **Category: Make Fire, Digital Rain, Blobs and Particles work on a
  one-row strip (High, S).** Strips (60x1, 10x1, 65x1) are supported forms and
  these defaults break on them. Fire `direction: 'up'` gives a one-row heat
  grid, so no propagation runs and the strip shows random flicker. Digital
  Rain `direction: 'down'` makes every LED a one-cell lane. Blobs sizes by
  `min(W,H)`, so the radius is about 0.2 px and the strip stays near black.
  Particles spawn and die on y. Add an `auto` direction (along the longer
  axis) as the default for Fire and Digital Rain, size Blobs from the longer
  side when one side is 1, and point Particles users to String Particles on a
  one-row canvas. Evidence `src/nodes/simulations/evaluate.ts:123`,
  `src/nodes/generative/evaluate.ts:458`.
- [ ] **Category: Move simulation motion and trails onto the clock (Med, M).**
  Most simulations advance per pass, against "never per pass" in
  `docs/development/patterns/graph-and-nodes.md:285`: Flow Field, Ripple trails, String Particles, Game
  of Life, Formula Points, Digital Rain, Starfield and every Particles mode
  (`rate` is a per-frame chance). A heavy graph on an ESP8266 or C3 that
  drops to 30 fps halves speeds and doubles trails. Do the trail part inside
  the `fade` rework above, then move motion onto `dt` node by node. Evidence
  `src/nodes/simulations/evaluate.ts:587`, `:824`.
- [ ] **Category: Fix HSV wheel parity for Rainbow, Pride 2015 and Boids
  (Med, S).** FastLED `CHSV`/`fill_rainbow` is the rainbow wheel and the
  preview `hsv()` is the spectrum wheel, so yellows and oranges differ on
  hardware. Rainbow (`src/nodes/generative/codegen.ts:205`), Pride 2015 (`:223`, when
  unwired) and Boids' hue colour modes (`src/nodes/simulations/codegen.ts:717`) still
  emit `CHSV`. Use `_hsv`/`hsv2rgb_spectrum`, or for Rainbow make the preview
  emulate `hsv2rgb_rainbow`, since FastLED's look is the intent. Evidence
  `src/codegen/helpers/hsvHelperCpp.ts:4`.
- [ ] **Category: Merge the overlapping Noise types and fold the sine family
  into Plasma (Med, M).** Noise has four near-duplicate cloud types (simplex,
  noise3d, fbm, plasma) and the sine family is spread over Plasma and Noise
  `field`, `sine`, `plasma`. Keep fbm (octaves), noise4d (looping), worley,
  gabor and plasma-fractal in Noise; make simplex and noise3d fbm presets; fold
  `field` and `sine` into Plasma, which gains `scale`. Each type also has its
  own speed and scale range, so nine types means nine slider calibrations.
  Evidence `src/nodes/generative/evaluate.ts:299`,
  `src/nodes/shared/speedRange.ts:52`.
- [ ] **Category: Fold Heartbeat into Breathe (Med, S).** Both sample the
  palette at an envelope and dim by the same formula (Heartbeat
  `1 - strength*(1-env)` equals Breathe with `minLevel = 1 - strength`). Add
  `curve: 'heartbeat'` to Breathe (or call the merged node Pulse), widen the
  BPM range to 1-240, and remove Heartbeat. Evidence
  `src/nodes/generative/evaluate.ts:584`, `:688`.
- [ ] **Category: Default Ripple and String Particles to the LED output's
  network (Med, M).** Ripple needs the output's network preset, JSON and LEDs
  per edge, and String Particles needs the ring LED count, all copied by hand
  with nothing keeping them in sync. Default both to "match LED output" read
  from the root graph's MatrixOutput, with the current fields as an override.
  The Ripple default `ledsPerEdge: 14` rarely matches a real build and the
  Help example uses 4. For String Particles, a ring form gives the ring track
  and LED count and a strip form gives row. Evidence `src/state/nodeLibrary.ts:2244`,
  `:2261`.
- [ ] **Category: Make `speed` mean one thing (Low, S).** `speed` is a 0-1 rate
  almost everywhere, but steps per frame on Reaction Diffusion and
  generations per second on Game of Life. Rename Reaction Diffusion `speed`
  to `steps` (`src/state/nodeLibrary.ts:1460`) and put the unit in Game of Life's row
  label.
- [ ] **Category: Put units in `rate` row labels (Low, S).** `rate` is strikes
  per minute (Lightning), chance per frame (Particles) and ripples per second
  (Ripple). Label each with its unit, as Ripple's `lifetime (s)` already does.
  Evidence `src/state/nodeLibrary.ts:2891`.
- [ ] **Category: Size Starfield and Flow Field pools to the property when
  `count` is unwired (Low, S).** Both always declare the maximum pool (300 x
  12 B = 3.6 KB; 400 x 8 B = 3.2 KB) because `count` is wireable. Evidence
  `src/nodes/simulations/codegen.ts:674`, `:500`.
- [ ] **Category: Integrate Heartbeat `bpm` and TV Simulator `cutRate` phase
  (Low, S).** Both are wireable but take phase from raw `t`, so a live BPM
  (a pulse sensor) makes the phase jump. Use `speedPhase`. Evidence
  `src/state/evaluator/classics.ts:59`, `src/nodes/generative/evaluate.ts:709`.
- [ ] **Noise: Default `noiseType` to `fbm` (Med, S).** The default `field` is
  `sin16(x)+sin16(y)`, a moving plaid labelled "Noise Field". Default to
  `fbm`, and rename `field` to "Sine Grid" if it stays. Simplex, noise3d,
  noise4d and plasma also wrap their value, cutting hard seams through
  non-cyclic palettes such as lava and heat; fbm clamps instead. Evidence
  `src/nodes/generative/definitions.ts:35`, `src/nodes/generative/evaluate.ts:319`.
- [ ] **Noise: Fix stale help text (Low, S).** `src/state/nodeLibrary.ts:1874` says "Noise
  4D and fbm use FastLED inoise on the controller", but both emit the
  `_snoise2` twin. Reword it. Evidence `src/nodes/generative/codegen.ts:76`.
- [ ] **Plasma: Add a `scale` property (Med, S).** Spatial frequencies are
  fixed per pixel, so a 64x64 panel shows many small cells and an 8x8 panel
  one blob. Noise and Pacifica already expose scale. Evidence
  `src/nodes/shared/integerPatterns.ts:72`.
- [ ] **Plasma: Make speed 0 actually still (Low, S).** The palette scrolls on
  bare `t`, but the tooltip says "0 frozen". Scale the scroll by speed or
  reword the tooltip. Evidence `src/nodes/shared/integerPatterns.ts:49`, `src/state/nodeLibrary.ts:2801`.
- [ ] **Rainbow: Add an `axis` option (Low, S).** On a matrix the hue runs in
  row-major order, so each row restarts further round the wheel and the result
  is a skewed band, not a 2-D gradient. Offer along string, horizontal and
  vertical. Evidence `src/nodes/generative/evaluate.ts:50`.
- [ ] **Pride 2015: Add a `palette` select with a `none` option (Low, S).**
  The colorwaves variant currently needs a separate Palette node wired in,
  because `propertyInputs` has no `palette`. Follow the pattern at
  `src/state/nodeLibrary.ts:743`. Evidence `src/nodes/generative/definitions.ts:80`.
- [ ] **Scanner: Make the glow trail one-sided (Med, S).** The glow uses
  `Math.abs(coord - pos)`, so it spreads equally ahead of and behind the beam,
  while the tooltip and Help promise a tail. Make it one-sided along travel,
  or reuse the trail-fade buffer Juggle uses. Evidence
  `src/nodes/generative/evaluate.ts:139`, `src/nodes/generative/codegen.ts:282`.
- [ ] **Scanner: Stop the beam vanishing at one end of the default palette
  (Med, S).** Colour is sampled at beam position and default `lava` starts at
  `#140000`, so the beam is nearly black at the left end; the Help example has
  the same problem. Sample a bright range (for example `0.3 + 0.7*travel`) or
  change the default palette. Evidence `src/nodes/generative/evaluate.ts:135`,
  `src/state/palettes/paletteCatalog.ts:29`.
- [ ] **Confetti: Rename Speed to "Colour drift" (Med, S).** Speed and Density
  both set spawn count (`density*(0.08+speed*0.3)*sqrt(area)`), and the
  Density tooltip admits it multiplies Speed. Keep Density for amount and
  rename Speed after its only other effect. Evidence
  `src/nodes/generative/evaluate.ts:166`, `:168`.
- [ ] **Sunrise: Add a `trigger` input that restarts the timed ramp (Med, S).**
  Timed mode only counts from power-on, so a real wake-up light needs
  Progress fed from a schedule through several nodes. A rising edge on
  `trigger` would let ScheduleTrigger or RTC wire in directly. Evidence
  `src/state/nodeLibrary.ts:2228`.
- [ ] **Radial Burst: Rename the `arms` key and port to `rings` (Low, S).** The
  row reads "arms" while the port says "Rings" and the tooltip says "Number of
  rings", with no PROPERTY_LABELS entry. Pre-v1, rename rather than keep the
  old key for saved-graph compatibility. Evidence
  `src/nodes/generative/definitions.ts:320`.
- [ ] **Blobs: Rename the `scale` key to `size` (Low, S).** The row shows
  "scale" while the port reads "Size". Evidence
  `src/nodes/generative/definitions.ts:350`.
- [ ] **Fire: Make Turbulence a three-option select (Low, S).** The 0-2 slider
  has step 0.1, but both preview and firmware round it to 0, 1 or 2. Use a
  select (narrow, normal, wide) or an integer slider. Evidence
  `src/state/nodeLibrary.ts:1603`, `src/nodes/simulations/evaluate.ts:131`.
- [ ] **Fire: Consider dropping `paletteMix` (Low, S).** It is a grayscale blend
  a downstream saturation node already covers, and removing it removes an
  emitted branch and a port. Evidence `src/nodes/simulations/codegen.ts:120`.
- [ ] **Particles: Prune overlapping modes and rename clashing ones (Med, M).**
  `confetti` duplicates the Confetti node; `rain` and `sparkle` overlap Digital
  Rain; `orbit` and `vortex` are both rotation about the centre. `attractor`
  clashes with Formula Points' de Jong `attractor` (rename to "chase"), and
  the `gravity` type shares its name with the `gravity` multiplier (rename to
  "drops"). Evidence `src/state/nodeLibrary.ts:2891`.
- [ ] **Particles: Gate `rate` and `decay` per mode (Med, S).** `rate` is unused
  by orbit, bounce, fireflies, luminova, comet and meteor; `decay` is unused by
  snow, bubbles, orbit, fireflies and bounce. `count`, `spread`, `gravity` and
  `bounce` are already gated that way. Evidence `src/state/nodeLibrary.ts:5334`,
  `src/nodes/simulations/evaluate.ts:250`.
- [ ] **Particles: Cap the preview pool to the firmware pool (Med, S).**
  Preview caps at 600 particles, firmware at 120 (240 for luminova), so the
  featured luminova example (count 6, decay 0.985) shows about 330 dots in
  preview but about 39 per emitter on hardware, and trails look shorter on the
  controller. Cap the preview at `particlePoolSize(mode)`, and fix the Help
  text that says "five emitters" with count 6. Evidence
  `src/nodes/simulations/particleModes.ts:20`, `src/components/HelpModal/reference/pattern.ts:735`.
- [ ] **Particles: Remove unused per-particle colour in firmware (Med, S).**
  `${A}r/g/b` (360 B) and `_pc` are written but rendering colours by life, and
  the preview's fireworks `hsv` is discarded too. This breaks the "no dead
  code in firmware" rule. Remove it, or use it as a per-burst palette offset
  so fireworks bursts differ in colour. Evidence
  `src/nodes/simulations/codegen.ts:206`, `:352`.
- [ ] **Formula Points: Label the `attractor` variant "de Jong attractor"
  (Low, S).** It shares a name with Particles' `attractor`, which is a
  different effect. Evidence `src/nodes/simulations/evaluate.ts:461`.
- [ ] **Flow Field: Make preview and firmware draw the same flow (Med, S).** The
  preview steers by `_snoise2(...)*4π` (angle ±4π, field translating in x);
  firmware uses `inoise8(...,t*100)/255*4π` (angle 0..4π, field evolving in z).
  Curl mode likewise uses `inoise16` against `_snoise2`. Use the shipped
  `_snoise2` twin in firmware. Evidence `src/nodes/simulations/evaluate.ts:588`, `src/nodes/simulations/codegen.ts:505`.
- [ ] **Flow Field: Cut `SCALE_MAX` to about 0.25 (Med, S).** Default 0.08 on a
  0-1 slider means most of the slider is unusable; past about 0.3 every pixel
  has an eddy. Evidence `src/nodes/generative/definitions.ts:165`,
  `src/nodes/shared/speedRange.ts:46`.
- [ ] **Ripple: Rename to "Network Ripple" (Med, S).** It only works on a
  segment network and draws hexagons, while Radial Burst's Help example is
  already titled "Ripples spreading on a still pond", and RainRipples and the
  "Ripple Wipe" transition exist. Evidence `src/components/HelpModal/reference/pattern.ts:662`.
- [ ] **Ripple: Gate the `network` JSON row to `networkPreset === 'custom'`
  (Low, S).** MatrixOutput gates it, but `isPropertyEnabled` has no Ripple
  clause. Evidence `src/state/nodeLibrary.ts:5251`.
- [ ] **Starfield: Fix the "streak outward" description or add a warp trail
  (Low, S).** Each star is a single pixel with no streak. Add an optional
  trail through `trailFade`, or reword. Evidence
  `src/nodes/simulations/definitions.ts:295`, `src/nodes/simulations/evaluate.ts:830`.
- [ ] **Boids: Read every hue colour mode through the palette (Med, S).**
  Heading, spectrum, density, position, cycle and radial read the HSV wheel,
  leaving the always-visible palette socket useless in them. Route all through
  the palette, which also removes the `CHSV` parity gap and makes `spectrum`
  redundant (drop it). Modes become solid, palette position, heading, density,
  position, radial, cycle. Evidence `src/nodes/simulations/codegen.ts:717`.
- [ ] **Boids: Gate property rows by colour mode (Low, S).** `palette` only
  matters in palette mode, `color`/R/G/B only in solid, and `isPropertyEnabled`
  has no Boids clause. Evidence `src/state/nodeLibrary.ts:2926`.
- [ ] **Game of Life: Reseed when only period-2 oscillators remain (Med, S).**
  Stale detection counts only an empty or unchanged board, so a 16x16 torus
  ending in blocks plus blinkers loops forever, against the reseed promise.
  Also compare against the board two generations back, or reseed when
  population is unchanged for N generations. Evidence
  `src/nodes/simulations/evaluate.ts:997`, `src/nodes/simulations/codegen.ts:787`.

#### Outputs and shows

- [ ] **Category: Unify show-engine timing names and labels (Med, S).** Music
  Player and Pattern Slideshow use `minTime`/`maxTime`/`transitionSec` with
  ports "Min Time"/"Max Time"/"Transition", but the fields read "min hold
  (s)"/"max hold (s)"/"fade (s)", and "fade" is wrong when a Transition Pool
  picks iris or cube. Performance Generator uses `patternHold`/
  `transitionDuration`, and Sequencer and Slideshow use `interval`/`fade`.
  Before v1.0.0 settle on one name per concept and one label style (Music
  Player also mixes Title Case with lower case). Evidence
  `src/state/nodeLibrary.ts:3335`, `src/nodes/show/definitions.ts:331`.
- [ ] **Category: Test that every live player/show input reaches firmware
  (Med, M).** `LIVE_PLAYER_SHOW_PROPERTIES` declares ports as verified live
  inputs, but nothing checks the generated sketch. Add a test that walks the
  list and confirms each port changes the generated sketch in the show and SD
  player generators. Evidence `src/state/player/runtimeControlScope.ts:34`.
- [ ] **Category: Show master brightness as a percentage (Low, S).**
  Brightness uses five scales: Board 0-255, LED output 0-1, Stereo VU 0-1,
  Segment Display 0-7/0-15, Analog Strip 0-1. Show the Board level as a
  percentage so the fixtures read alike (FastLED can still store 0-255).
- [ ] **Category: Rename display nodes after the hardware (Low, S).** Info
  Display, Display Panel and Segment Display stay separate nodes. Relabel them
  with the parts people buy ("OLED Display", "TFT Display", "7-Segment
  Display").
- [ ] **Category: Say when to use Player Controls vs direct action ports (Low,
  S).** The engines and the LED output now take Next, Toggle-blackout and
  Brightness Up/Down directly. Add one help sentence on each engine: one or two
  buttons, wire them directly; a whole panel, use Player Controls.
- [ ] **Category: Point the sidebar Output section at the Hardware tab (Low,
  S).** It lists only Master Speed, Frame Stream and Analog RGB Strip because
  everything else is added from the bench. Add a permanent "LED outputs are on
  the Hardware tab" row. Evidence `src/build/hardware.ts:27`.
- [ ] **Board: Add a Frame Rate control (High, S).** `frameRate` is described
  and the Board help says to set it, but `src/components/Canvas/bodies/BoardNodeBody.tsx` has no fps row;
  the only writer is the Graph Health repair `setBoardFrameRate`, which can
  only lower it. Add an fps row beside Master brightness. Evidence
  `src/components/Canvas/bodies/BoardNodeBody.tsx:404`, `src/state/graphStore.ts:4704`.
- [ ] **Board: Reword help step 2 on the power cap (Low, S).** It presents the
  cap as the answer when the LEDs could draw more than the supply gives. Say to
  size the supply from the "Required power supply" figure, and use the cap to
  limit brightness or heat. Evidence `src/components/HelpModal/reference/output.ts:15`.
- [ ] **LED output: Lift the 300-LED cap on strings, rings and corkscrews
  (Med, M).** `MAX_LED_RUN` stops them at 300 while a matrix may reach 4096,
  though one 5 m reel at 144/m is 720. Raise the chain cap toward the matrix
  total (data lanes already split long chains), or document why it is 300.
  Evidence `src/state/output/ledOutputForm.ts:42`.
- [ ] **LED output: Merge supersample and render scale (Low, S).** The two
  controls grey each other out. Replace them with one "Render resolution: Half
  / Full / 2x smooth" select. Evidence `src/state/nodeLibrary.ts:5235`.
- [ ] **Stereo VU Meter: Remove the unenforced power cap (High, S).** The node
  defaults to `powerLimit: true, milliamps: 1800` and help promises a shared
  rail cap, but no generator emits it (only the Board cap) and
  `src/codegen/audio/stereoVuMeterCpp.ts` never reads either property. The Build Diagram reports
  a limit the sketch never applies. Remove both properties as was done for LED
  outputs. Evidence `src/nodes/output/definitions.ts:292`, `src/codegen/cppGenerator.ts:468`.
- [ ] **Stereo VU Meter: Collapse or preset the Response group (Low, S).** Its
  30 properties include a nine-row Response group (gain through beat accent)
  few people touch. Start it collapsed, or offer 3-4 presets (Hi-fi, Punchy,
  Smooth).
- [ ] **DFPlayer Mini: Make Play a one-shot option or fix the help example
  (Med, S).** Firmware pauses as soon as Play falls, and a Button's Pressed is
  true only while held, so the doorbell example stops on release. Add a "Play
  mode: Hold / One-shot" choice (rising edge plays to the end using BUSY), or
  insert a Toggle Trigger in the example. Evidence `src/components/HelpModal/reference/output.ts:280`,
  `src/codegen/peripherals/dfPlayerCpp.ts:82`.
- [ ] **Display Panel: List all four modules in help (Low, S).** Help names the
  1.54-inch and 2.4-inch modules, but the catalogue also has the ILI9341
  2.8-inch + touch and the XC4630 2.8-inch shield. List all four, or say
  "choose the module on the Hardware shelf". Evidence `src/components/HelpModal/reference/output.ts:328`,
  `src/build/parts/partOptions.ts:572`.
- [ ] **Master Speed: Reconcile help and validation (Med, S).** Help says the
  Music Player ignores it, but validation blocks a player build. Make it a
  warning with a one-click "Remove Master Speed" fix, or change the help to say
  it is an error. Evidence `src/components/HelpModal/reference/output.ts:360`, `src/utils/validateGraph.ts:3120`.
- [ ] **Amplifier: Fix stale help about built-in pin defaults (Med, S).** Help
  says a player without an Amplifier uses its pin defaults, but a Music Player
  or show without an audio-output stage is now an error. Say the player needs
  one. Evidence `src/components/HelpModal/reference/output.ts:409`, `src/utils/validateGraph.ts:2692`.
- [ ] **Amplifier: Use one label for max volume (Low, S).** `maxVolume` is the
  ceiling that player volume 1.0 maps to, but the tooltip, the bench field and
  help each describe it differently. Use "Max volume (0-21)" with "the level at
  full player volume". Evidence `src/state/nodeLibrary.ts:3210`,
  `src/build/parts/partFields.ts:73`.
- [ ] **Power Amplifier: Error on the internal-DAC path (High, S).** On a
  classic ESP32 with no DAC on the bench it is accepted and emits
  `Audio audio(true)`, but ESP32-audioI2S 3.0.12 is silent there under IDF 5.
  Make "power amplifier with no DAC" an error on every board with the existing
  "Add a PCM5102A" fix, and remove the built-in-DAC paragraph from help.
  Evidence `src/utils/validateGraph.ts:1529`, `src/codegen/playerSketchGenerator.ts:1658`.
- [ ] **Analog RGB Strip: Resolve overlap with Power Switch (Med, M).** The
  YYNMOS-4 and Mosfetti boards Power Switch catalogues are the usual way to
  drive an analog strip, yet the strip leaves the driver as "whatever the bench
  has" and lives in the sidebar, not on the bench. Either give it an optional
  driver `partId` and make it a bench part, or add an "RGB strip" load mode
  with a Color input to Power Switch. Evidence `src/build/hardwareManifest.ts:1253`,
  `src/build/hardware.ts:27`.
- [ ] **Analog RGB Strip: Change default pins that clash with Amplifier (Low,
  S).** Default R=25, G=26 are the Amplifier's default LRC and BCLK, so a music
  build with an analog strip starts with a pin conflict. Evidence
  `src/nodes/output/definitions.ts:691`.
- [ ] **Music Library: Remove the empty wire to Performance Generator (Med,
  M).** The `music` wire carries only `true`; the generator reads the global
  music store either way, and validation warns until the cable is drawn. Fold
  the library into the Performance Generator (double-click or "Edit songs"
  opens the library UI), or make Music Library portless like SD Card and drop
  the warning. Evidence `src/nodes/show/evaluate.ts:1744`, `src/utils/validateGraph.ts:4886`.
- [ ] **Player Particles: Make Style a named select (Med, S).** Style is a
  0-16 slider although the 17 styles have names (rain, explode, fireworks,
  swirl, twinkle, ring and so on). Replace it with a named select. Evidence
  `src/state/nodeLibrary.ts:1491`, `src/nodes/show/evaluate.ts:800`.
- [ ] **Music Player: Remove the stale "SD player only crossfades" claim (Med,
  S).** Help and the `transitionSec` tooltip say the SD player uses crossfade,
  but it now compiles the wired Transition Pool, so users are told to skip a
  working feature. Evidence `src/components/HelpModal/reference/show.ts:151`, `src/state/nodeLibrary.ts:1797`.
- [ ] **Music Player: Honour or grey out `seed` on SD builds (Low, S).** `seed`
  is preview-only on the SD player; the slideshow honours it. Either honour it
  in `src/codegen/playerSketchGenerator.ts` or grey it out for SD, Bluetooth and Radio
  builds. Evidence `src/state/nodeLibrary.ts:1806`, `src/codegen/showGenerator.ts:1777`.
- [ ] **Music Player: Trim the help overview (Low, S).** The overview is eight
  paragraphs covering every source. Move the Bluetooth and Radio paragraphs
  into the `musicSource` tooltip and a propertyNote so the overview teaches the
  common SD/timed path. Evidence `src/components/HelpModal/reference/show.ts:131`.
- [ ] **Sequencer: Rename to avoid the engines' "Sequence" order (Low, S).**
  The name collides with the step editor on the Music Player and Slideshow,
  but this node is a four-slot timed crossfade. Rename it ("Crossfade Cycle" or
  "Look Rotator"). Evidence `src/nodes/show/codegen.ts:335`.
- [ ] **Transition Pool: Update the description and comment (Low, S).** The
  sidebar description says "for the Music Player / Performance Generator" and
  the definition comment names only Performance Generator, but Pattern
  Slideshow takes it too. Update both. Evidence
  `src/nodes/show/definitions.ts:381`, `src/nodes/show/definitions.ts:194`.
- [ ] **Pattern Slideshow: Merge Interval into Min/Max Time (Med, M).** Without
  Audio Reactive the resolver sets `minTime = maxTime = interval`; with it,
  Interval is hidden and Min/Max default to 20/20, so Energy Pacing visibly
  changes nothing. Drop `interval` and its port, always show Min/Max (equal
  means fixed), gate only Beat Transitions, Energy Pacing and Dwells & Bursts on
  Audio Reactive, and default to an unequal pair such as 8-30 s. Evidence
  `src/state/patterns/patternSlideshow.ts:107`, `src/nodes/show/definitions.ts:263`.
- [ ] **Pattern Slideshow: Remove the Transitions switch (Low, S).**
  `transitionsEnabled: false` and Transition 0 s both give a hard cut. Keep
  only the duration field. Evidence `src/state/patterns/patternSlideshow.ts:118`.
- [ ] **Performance Generator: Show in the main preview by default (Low, S).**
  `showInMainPreview` defaults off, so a generator wired to an LED output plays
  only in its small body canvas while that output's main preview stays black.
  Default it on. Evidence `src/nodes/show/evaluate.ts:1747`,
  `src/components/Canvas/bodies/PerformanceGeneratorBody.tsx:425`.
- [ ] **SD Card: Fix the diagnostic that names a removed input (Med, S).** With
  no Frame on an LED output and an SD Card on the bench, the fix says "wire an
  SD Card node to the SD Card input", but the LED output has no `sdcard` port
  and SD Card is portless. Replace with the normal "connect a Frame" fix and
  remove the dead checks. Evidence `src/utils/validateGraph.ts:3931`,
  `src/utils/hardwareValidation.ts:321`.
- [ ] **SD Card: Update stale description and comment (Low, S).** The sidebar
  description "SD card and audio pins for the music-sync player" is out of
  date (audio moved to the Amplifier), and so is the comment about a classic
  ESP32 falling back to its built-in DAC. Evidence
  `src/nodes/show/definitions.ts:384`, `src/nodes/show/definitions.ts:363`.

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
