# Hardware and the Build Diagram

Pins, buses and boards, the peripheral parts and how each is chosen, and how the
Build Diagram draws them.

Moved out of the always-loaded `CLAUDE.md` so a session reads it only when
working in this area; record new patterns for this area here, not there. History
of the entries before the move: `git log -p -- CLAUDE.md`.

## Pins and boards

- A board drawn on the Build Diagram as its render, with wires on its pads,
  needs an authored profile in `boardProfiles.ts` and a measured entry in
  `CONTROLLER_SPECS` (`controllerGeometry.ts`); an imported profile alone gets
  the generic schematic. Take the rail X, first and last pad Y and USB mouth
  from the package's `measuredPixelGeometry`, the scale from the camera's
  orthographic span, and check each pad centre against its see-through hole
  in the render before trusting them. `controllerGeometry.test.ts` holds pad
  counts, power anchors and aspect to the shipped render. Check the
  manifest's mouth row against the render's alpha: the full rebuild moved
  USB-C receptacles without updating every manifest.
- A controller whose connections are scattered terminals, not two straight
  headers, uses `anchorPoints` in `controllerGeometry.ts`. Measure each anchor
  from the Blender scene and map its own left/right wire-routing side. Do not
  force screw terminals into the legacy equal-pitch rail interpolation; the
  Dig-Uno and Dig-Quad are the reference profiles. Large controller assemblies
  set `establishesScale: false`; fit only that render into the fixed slot so a
  100 mm power board does not shrink every compact development board.
- Check a clone board's rail order against a photo of the component side.
  Pinout images are often of the underside with USB at the top, and copying
  one without turning it over reverses both rails; the ESP32-C3 Super Mini
  shipped that way until 2026-10-08. Supply pads sit beside the USB connector
  on every board in the catalogue, which makes the mistake easy to spot. Read
  a mechanical drawing's dimensions against what they point at, too: the D1
  Mini's 20.4 mm is its mounting holes, and its rails are 22.86 mm apart.
- Ethernet built into a board is a profile fact (`onboardEthernet`), never an
  `EthernetModule`. Ask `wiredNetworkIn`, not `ethernetModuleIn`, whether a
  cable carries the network: the board's port wins, and a module beside it is
  idle. A board with no USB sets `hasUsb: false` and omits `usbPoint`; the
  power plan, sheet and connection export then name its power-in pin.

- A DFPlayer Mini is one UART-controlled player, not a second music-sync
  decoder. `DFPlayerOutput` owns controller RX, controller TX and an
  active-low BUSY input. Preview Playing follows the requested Play level;
  firmware replaces it with the BUSY pin. Commands go out one at a time,
  100 ms apart, after a 1 s card start. Classic ESP32 and S3 open UART2 so
  a presence sensor can keep UART1; S2, C3, C6 and H2 have only UART1, and
  Graph Health refuses a presence sensor or a DMX512 input on that same
  port. Speaker mode uses SPK1/SPK2. Line Out is the wiring choice that
  lets DAC_L/DAC_R feed a power amplifier. The normal sketch is the only
  generator that emits it.
- A relay module's load kind, off-state leakage and isolation live on the
  catalogue `relay` block and are shown as Build Diagram facts and as Load,
  Leakage and Isolation rows in the part inspector. They are not a graph-health
  error: the switched load is not a node. Mechanical Songle-class modules are
  `ac-dc` dry contacts with no leakage. The Seeed Grove 2-channel board
  (`seeed-grove-2ch-ssr`) is two Omron G3MC-202P phototriacs: AC only, 1.5 mA
  leakage at 200 VAC, 2,500 VAC input-to-output, active-high, zero-cross.
  Firmware takes the idle level from `relay.trigger`: HIGH before `pinMode` for
  active-low, LOW before `pinMode` for active-high. Signal pads use
  `channelInputLabels` (CTR1, CTR2), not the left-to-right header order and not
  IN1/IN2. Channel pins the module does not have are hidden by
  `relayChannelPropertyEnabled`.
- A four-wire PWM fan is one bidirectional graph device, not separate output
  and sensor fixtures. `CoolingFanOutput` owns an active-high PWM GPIO and an
  open-collector tachometer GPIO with pull-up. Its exact part metadata carries
  PWM frequency and pulses per revolution so preview, firmware, manifest and
  Build Diagram do not restate those values. Generated ESP32 firmware latches
  PWM low before output mode, counts falling tach edges in an ISR and publishes
  RPM from a timed pulse window. Keep board gating beside both deploy validation
  and Graph Health, and keep the browser RPM explicitly an estimate.

- Pin collision checking is bus-aware, not a flat duplicate-claim check:
  `src/build/pins/busTopology.ts` declares each pin's kind and role and derives the
  bus *instance* from the pins themselves, and both `validateGraph.ts` and the
  Graph Health drawer call its one `findPinCollisions`.
- A role that depends on the board is resolved in `collectPinUses` from the
  selected FQBN (the wired-Ethernet module's bus lines are shareable SPI lines
  only on a one-host chip), so any collision check has to pass the FQBN
  through. One that omits it judges the board as unchosen, and on a C3 that
  once refused the very bus sharing Ethernet validation required.
- `assignPartPins`' refusal (`noPinReason` in `src/build/parts/partPinAssignment.ts`)
  speaks in the board's own words only when the profile states a pad allowlist
  (`pinSafety.safeGeneralPurpose`): it names which spare pins are held and by
  what (`holderList`, skipping stand-in `__claimed-` nodes), or how many are
  left against how many the part still needs; a profile-less board keeps the
  general "No free GPIO" wording, since a chip-table pool is no claim about the
  board's pads. `findExactBoardPinIssues` reads the same allowlist through
  `boardSparePins`, so a part stranded on a reserved pin after a board change is
  told the board is full and to free a pad. See
  [hardware nodes](../../architecture/hardware-model.md).
- Hardware soldered to the controller board is stated once, in
  `src/build/boards/integratedBoardHardware.ts`, and read twice:
  `graphStore.selectBoardProfile` (the one action board choice goes through —
  the Hardware tab's `BoardNodeBody` owns both the select and the side-by-side
  `BoardPinoutPicker`, Build Diagram only reports the board) materializes a
  CYD's fitted panel and Touch node when that profile is chosen — idempotent,
  and adopting a panel already wired to the same fixed pinout rather than
  duplicating it — and `pinRetarget`'s `ownedNow` answers with those pins ahead
  of every other rule, so they are claimed (everything else routes around them)
  and never moved (there is nowhere to move them to). A line the board ties
  off-GPIO, like that panel's reset on `EN`, is `NO_PIN` (255) — the value the
  firmware already guards on — and `pinPropertyIsUnwired` in `nodeLibrary.ts`
  names the only properties allowed to carry it, exactly the ones a sketch
  guards; `collectPinUses` exempts it there, since every pin claim derives from
  that one walk and a tied reset otherwise reads as a part on GPIO 255 and
  refuses the build. An OLED's reset is driven unconditionally and has no
  exemption. That module is now read a third time, by
  `src/build/boards/boardPinSafetyOverrides.ts`, which supplies `pinSafety` for a board
  whose asset package carries no `pinSafetySummary` (only the CYD) the way
  `boardI2cDefaults.ts` supplies a bus the manifests cannot see, and wins over
  imported data for the same reason a hand-authored profile does: the *reserved*
  half is derived from the fitted wiring rather than restated, and `NO_PIN`
  reserves nothing. Two consequences a first attempt got wrong.
  `safeGeneralPurpose` is the allowlist `assignPartPins` draws from, so stating
  it is what stops the chip-level fallback offering GPIO1 — and on this board it
  leaves a two-pin pool, small enough that an ordinary graph exhausts it and the
  unplaced part keeps the pin it arrived on. And a pin reserved *for* fitted
  hardware must not be denied *to* it: `findExactBoardPinIssues` turns reserved
  into a build blocker, so it asks `integratedPinsFor` — `ownedNow`'s own
  question — or every CYD graph reports eleven errors about wiring nobody can
  change. `UNLISTED_SAFETY_IDS` (via `lacksPinAdvice`) counts a profile with *no*
  `pinSafety` as a gap as well as one with an empty allowlist; asking only the
  second let the sole board with no data read as complete. See
  [hardware nodes](../../architecture/hardware-model.md#boards-with-hardware-already-on-them).
- `Board` is a hardware-only node type and is `hidden` on the graph canvas, so
  the grouped property controls `PROPERTY_GROUPS` declares for it (its "Bench"
  group included) never render anywhere — that generic renderer only draws for
  visible canvas nodes. `src/components/Canvas/bodies/BoardNodeBody.tsx`, rendered from
  the Hardware tab, stands in for the hidden node but does not read
  `PROPERTY_GROUPS`; a Board property needing a UI control must be added there
  by hand. `reportTelemetry`'s checkbox has been added, reverted and restored,
  and the reason it is back is the whole of its scope: it was removed once touch
  calibration got its own generated instrument sketch
  (`src/codegen/sketches/touchCalibrationSketch.ts`) and stopped needing telemetry, which
  left no *user* needing the word — but HW-11's display-budget bench reads this
  switch and nothing else, and an instrument that cannot be switched on is not
  an instrument. So it is a bench control, not a feature: off by default,
  ESP-only, and the note under it says to leave it off for a finished build and
  that calibration does not need it. `DeviceTelemetryCard` is mounted beside the
  Output console rather than in the deploy `controls`, and travels with the
  console into the docked branch too — that branch renders the console alone, so
  a card attached to the workbench body would be absent from the Upload tab,
  which is the one place anyone looks for it (`MatrixOutputDeployPopup.test.tsx`
  holds this). The invariant this bullet exists to record still holds: adding a
  property to `PROPERTY_GROUPS` alone does nothing for `Board`, since
  `BoardNodeBody.tsx` doesn't read that registry — any future control for a
  Board property needs to be hand-added there, gated on the same predicate the
  generator gates emission on (`boardSupportsTelemetry` for this one), and read
  straight off the node rather than through `controllerSettings` (durable
  controller *policy*) for a per-session instrument like this.

- **Read the selected board through the resolver, never by `profileId`.**
  `profileId` may be `custom`, which no catalogue lookup knows.
  `selectedPhysicalBoardProfile` (or `resolveBoardSelection` for a bare Board
  property bag) returns the stock profile or the project's custom board; ask
  `boardProfileById` only for the stock catalogue. Default buses follow the
  same rule: `profileI2cDefault(profile)`, not `boardI2cDefault(profile.id)`,
  and a chip-level default (SD, I2S) is adopted on a custom board only when
  `boardOffersPins` says the header carries it. A custom pool is always
  explicit (`boardHasExplicitPinPool`): an empty one is no pins, not the chip
  table. The resolver caches by the saved definition object, so a store
  selector gets the same profile back until the Board properties change; keep
  that when touching it, or selectors re-render forever. See
  [Board architecture](../../architecture/board-capabilities.md#project-custom-boards).
- **A dialog opened from the workbench board menu must not be portalled.**
  `HardwarePane` closes the board menu on any `pointerdown` outside the menu's
  own DOM, so a portalled `CustomBoardEditor` lost its first click and
  unmounted with the menu. It renders in place with a fixed backdrop, as
  `BoardPinoutPicker` does. The board pinout (`BoardPinoutPopup`) is the one
  App-level exception: its overlay sits at z-index 1050, above the floating
  menus (1000), and `HardwarePane` ignores outside clicks while
  `pinoutProfileId` is set, so the menu stays open beneath it; Escape needs no
  such check, since the pinout opened later and so is the higher Escape layer.
  `AppDialogHost` sits at 1200, above both, matching its place as the last
  layer opened.

## Peripherals

- **Two VL53 sensors on one I2C bus leave 0x29 free.** Every VL53L0X and VL53L1X
  wakes at 0x29, and the catalogue address list stays that power-on address.
  Assignable addresses 0x30 to 0x33 live in `distanceSensor.ts`. `distanceSensorBusIssues`
  refuses a shared SDA/SCL pair where any sensor stays on 0x29, repeats an assigned
  address, or lacks its own SHDN/XSHUT GPIO. `NO_PIN` on `xshutPin` means the line is
  not driven and is not a pin claim. The sketch holds every wired shutdown pin low,
  releases one sensor, calls `init` at 0x29, then `setAddress` before any further
  register write, and drives that pin low again if `init` fails. A fresh object
  assignment points the driver back at 0x29, because the library stores the address
  privately. `i2cDistanceBusPeers` pulls an unwired peer into the normal sketch and
  the show/player control graph when another sensor on the same pins is emitted.
  A single sensor may stay at 0x29 with SHDN unwired, and that sketch keeps the
  original Pololu sequence.
- **An actively driven touch module is not a mechanical button.**
  `TouchButtonInput` represents the exact Seeed Grove Touch Sensor
  (TTP223-BA6): one exclusive digital-input GPIO, no pull-up, active-high
  momentary output, and a 3V3 supply in the Build Diagram so its SIG level stays
  in the controller's logic domain. Its polarity and electrical facts come from
  the catalogue `touchSensor` block through `touchButtonSpec`, rather than being
  restated in each generator. Normal codegen and the show/player control graph
  both use `controlInputCpp`, so all three paths emit the same plain `INPUT` and
  part-derived pressed level. The render faces the touch side and its catalogue
  pin order is deliberately locked as `SIG, NC, VCC, GND`; this is the
  left-to-right result of rotating the reference board's photographed right
  edge clockwise, not mirroring the board.
- A hardware option the generator cannot honestly build is not offered:
  `MIC_MODULES` in `src/state/peripherals/micModules.ts` is the one list of I2S MEMS
  microphones the app may present, and a module earns a row when it names
  exactly one way to be captured, either an app-owned `capture` adapter or
  FastLED's factory and profile. The one adapter today is the SPH0645LM4H:
  FastLED's ESP32 driver ignores `mCommFormat` and cannot express its timing, so
  `StudioSph0645Input` in `audioEngineCpp.ts` applies the published classic-ESP32
  register fix. `micSupportedForBoard(fqbn, partId)` limits it to classic ESP32
  at every check, because the S3 has no documented equivalent. Otherwise a
  module needs both the `fl::audio::Config` factory it needs (`CreateInmp441`,
  `CreateIcs43434`, `CreateGenericMEMS`) and the matching
  `fl::audio::MicProfile` member — not every module that happens to wire the
  same way (an analog electret board has no I2S `Config` variant at all, so it
  stays off the list). `partOptions.ts`'s `MicInput` options map over
  `MIC_MODULES` rather than restating them, and `audioEngineCpp.ts` resolves
  `micModuleFor(p.partId)` in `audioEngineForGraph` and threads the chosen
  `MicModule` into `audioEngineCpp`, which calls
  `Config::${micModule.factory}`/`MicProfile::${micModule.profile}` — a fourth
  module can't reach the Add Hardware menu without the generator also being able
  to build it. Only the FastLED-native ESP32 and Teensy backends actually apply
  a `MicProfile`; the hand-written `StudioI2sMicInput` adapter used on
  Pico/SAMD51/STM32 is plain I2S with no profile hook, so on those backends the
  generated sketch says in a comment that the module choice changed only the
  name and wiring picture, not the captured signal. `partCatalogue.ts`'s
  `PART_PIN_PROPERTY_ALIASES` gained `i2sWs`/`i2sSck`/`i2sSd` (each module
  silkscreens the same three signals under different names — WS/SCK/SD vs
  LRCL/BCLK/DOUT) so pin fields and the Build Diagram resolve pads by name per
  board rather than needing a per-module pin list.
- **Audio output is a two-role chain, resolved by role, never by
  `nodes.find('Amplifier')`.** `Amplifier` is the I2S stage on the board's pins
  (MAX98357A, PCM5102A, UDA1334A; each option states
  `output: 'speaker' | 'line'`). `PowerAmplifier` is the analog stage (PAM8403,
  PAM8610, DX-0809). It claims **no GPIO** when a DAC feeds it and GPIO25/26
  only when nothing does. `src/state/audio/audioOutput.ts` owns the answers
  (`i2sAudioStage`, `powerAmplifierFeed` → `dac`/`internalDac`/`speakerAmp`,
  `audioVolumeStage`), and `hasAudioOutputStage` lives in the import-free
  `buildMode.ts` so the build-mode resolver can ask it too. A speaker amp
  feeding a power amp is one structured issue in both the gate and Graph Health.
  A DAC alone is deliberately not warned about, since powered speakers are a
  correct build. See
  [audio part expansion](../../design/audio-hardware.md#phases).
- **IR receiver (D-05a):** `IRRemoteInput` has a saved `debug` checkbox
  (off by default). Enabling it adds
  serial diagnostics to the normal project, slideshow, or SD-player upload;
  upload again after changing it and open the serial monitor at 115200 baud.
  `FLS_IR_DEBUG` reports the effective protocol/address/command/repeat and
  `FLS_IR_MATCH` names the output pulses. On ESP32-S3, `FLS_IR_CAPTURE` reports
  cumulative captured/dropped/invalid counts once a second; `FLS_IR_RAW` shows
  uncorrected header/first-bit/stop timings in microseconds; `FLS_IR_TIMINGS`
  lists every captured mark and space in microseconds, starting with the header
  mark and excluding the initial gap and trailing idle, before normalization.
  A full NEC command requires `len=68`; `len=64` is missing two bit pairs and
  must remain rejected rather than guessing a key from its following repeat.
  `FLS_IR_DECODE` shows the
  decoder result, including rejected UNKNOWN captures. Only counters run in
  the ISR; all serial output runs in the main loop. Disabled diagnostics emit
  no logging or counter overhead. Debug also captures before any keys are
  learned or wired, enabling the supported decoder families for inspection.
  It is a hardware-managed, root-owned
  signal node (`HARDWARE_MANAGED_SIGNAL_NODE_TYPES` and
  `HARDWARE_LIBRARY_HIDDEN_NODE_TYPES` in `hardware.ts`) claiming one exclusive
  digital-input pin with no pull-up — the receiver module drives the line
  itself, the way a PIR does, so a pull-up would fight its output stage.
  The Keyestudio KS0026 option in `irModules.ts` declares
  `supplyVoltage: 5` from its manufacturer specification; the Build Diagram
  uses that fact for both its supply rail and its conservative signal divider.
  Other IR options use the logic rail and a direct signal connection. The
  KS0026's `-, +, S` header geometry comes from its own imported Blender render.
  `build/pins/receiveDivider.ts` owns the divider source rules shared by the diagram
  and the Hardware captions. `numericPinSummary` adds “See build diagram” to
  the affected assigned input pin (KS0026 S, HC-SR04 Echo, MAX485 RO/RX), rather
  than presenting it as a direct connection.
  Its
  outputs are the keys someone has learned, derived from `buttons` the way a
  Button Bank derives its own: an IR key is an identity in a saved mapping
  rather than a pin, so the node grows one output port per key
  (`irRemoteOutputs` in `irRemote.ts`) but still costs exactly one GPIO however
  many keys exist — `collectPinUses` (`src/build/hardwareManifest.ts`) pushes a
  single `pin` use regardless of button count, and `buildHardwareManifest`
  reports it as its own peripheral kind, `'ir-input'`. Load normalization
  (`normalizeLoadedGraph` in `graphStore.ts`) unions the stored `buttons`
  mapping with the handles its edges already leave from
  (`irRemoteHandlesFromEdges`), so a damaged or truncated save can't take a live
  wire down with it — the retained row keeps an empty `protocol`, which is what
  makes it visibly invalid to validation rather than a plausible mapping nobody
  authored, and the wire survives to be repaired. The trailing
  `IR_REMOTE_LEARN_HANDLE` socket is an invitation, not a signal, and mints no
  button from a wire dropped on it. Saving a learned key transfers all pending
  wires from Learn to that new key, retaining edge identities and destinations
  in the same undo step as the mapping (`learnIrRemoteButton`). A canceled or
  rejected save leaves those wires alone. `liveExamples.test.ts` excludes
  that socket from live examples, since the generic bool builder would
  otherwise wire `outputs[0]`, which here is Learn. Registration touches
  `nodeLibrary.ts` (pin property, `gpioRequirementForProperty`),
  `pinRetarget.ts` (`PART_PIN_PLANS.IRRemoteInput`) and `performanceDeck.ts`
  (`WIRING_KEYS`), but deliberately **not** `busTopology.ts`:
  `busAssignmentFor`'s default is already `{ kind: 'none', role: 'exclusive' }`,
  which is exactly what a line nothing shares means, so a `BUS_ASSIGNMENTS` row
  would only restate it — the same registration-point list
  [the displays bullet](fixed-displays.md#registering-a-display) documents,
  minus the ones a plain GPIO input doesn't need (bus assignments beyond
  `exclusive`, controller descriptors). The node body (`IRRemoteBody`) presses
  and holds through `hardwareInputStore`; the evaluator turns that into the same
  once/held pulses as `reduceIrRemoteFrame`, and its held-key simulator spaces
  frames at 100 ms with false passes between them — without those idle passes a
  downstream rising-edge `StepValue` advances only once. Add, rename and remove
  are one undo step each (`addIrRemoteButton`, `updateIrRemoteButton`,
  `removeIrRemoteButton`), a rename keeps the entry id, and removing a wired key
  asks first. Learning (`useIrLearnStore`) uploads `generateIrLearnSketch` with
  `cache: false` once per mapping session. **Map IR remote buttons** shows build
  progress, captures a non-repeat `FLS_IR v=1` line from shared serial ingest,
  then asks for its name. Saving through `learnIrRemoteButton` is one undo step
  per key and returns to listening without uploading again. Done releases the
  port and retains saved keys; an unnamed capture is discarded. Duplicate codes
  remain available to retry, and listening stops accepting keys at the 32-key
  limit. An untrusted workspace is refused before any flash.
  Arduino-IRremote is pinned at 4.7.1 (`IR_REMOTE_VERSION` /
  `_IRREMOTE_VERSION`). `irRemoteHeader` emits only the `DECODE_*` families a
  sketch's keys use, and emits nothing when there are none, so an IR-free sketch
  does not acquire the library. fbuild vendors tag `v4.7.1` lazily and hides
  that checkout from other sketches; arduino-cli installs `IRremote@4.7.1`;
  `// FLS-IRREMOTE:` changes the sketch bytes when the pin changes. Project
  sketches poll through `irRemoteProjectEmission` (`irRemoteCpp.ts`): one
  `FLS_IR_RECEIVER.decode()` in the `sample-ir` input phase, after the control
  snapshot and before destination apply, shared by `cppGenerator.ts` and the
  show and player control graphs. Held repeats inherit the last complete
  frame's protocol/address/command for
  up to 250 ms between frames, so NEC keys still match when the decoder labels
  their full repeats NEC2. Explicit repeat codes must match the remembered
  address and command. Firmware defers the next decode for one false graph pass
  after a pulse, so consecutive captures still create separate rising edges for
  Step Value and other event consumers. A key bool is named like any other GPIO
  output
  (`n_<id>_button_<key>`), so a direct action or Control Map resolves it; `once`
  drops repeat frames and `held` keeps them. A key with no protocol stays false
  and does not pull in the library. `irRemoteWorkflow.test.ts` holds the
  first-release Power → Toggle and Up/Down/Reset → Step Value workflow across
  preview, save/reload, undo/redo, normal, slideshow, and SD/player generation;
  the player route goes through Control Map because direct LED-output runtime
  controls are unsupported there. Validation is one structured issue walk
  projected into both `findDeployBlockingErrors` and Graph Health: it blocks a
  second receiver, empty/invalid/duplicate/missing mappings, unsupported
  selected FQBNs, and bad Step Value domains, while the existing shared
  pin-collision and signal-range walks remain authoritative for those concerns.
  Board support follows the pinned release's architecture declaration; S3 uses
  the native RMT adapter in `irRmtReceiverCpp.ts`, not the unsupported timer
  receiver. `FLS_IR_RECEIVER` selects that adapter at compile time for both the
  learner and all project generators, and otherwise aliases `IrReceiver`.
  RMT captures active-low timings at 1 MHz with a 12 ms idle timeout (NEC's
  leading mark alone is 9 ms). The ISR copies timings and completion time into
  a four-frame queue and immediately re-arms capture, independently of LED
  rendering. ESP-IDF permits `rmt_receive` in ISR context. Queue saturation
  drops the newest frame without stopping capture. The main loop alone loads
  IRremote's reserved-entry-zero raw buffer and copies both rawlen/gap fields
  into decodedIRData; `resume()` resets only the decoder, never active RMT RX.
  Gap measurement uses capture time, not the time the loop
  resumes after LED output. The S3 raw buffer covers the saved protocol list's
  maximum 48 bits. Its RMT API requires Arduino-ESP32 3.x / ESP-IDF 5 or newer.
  The adapter seeds repeat identity from the last recognized capture for at
  most 250 ms; UNKNOWN noise is discarded instead of poisoning IRremote's
  previous decoded identity. A damaged full NEC header invalidates that key.
  For a recent NEC-family key only, a canonical 9 ms/2.25 ms repeat prefix uses
  IRremote's bounded greater-range stop-mark matcher before normalizing the
  stop mark and trimming trailing glitches. Full commands keep the library's
  ordinary decoder checks. This accommodates stretched 750–800 µs repeat marks
  without broadening every decoder's tolerance or replaying stale buttons.
  Keep the full IR header as one includes entry: the show/player control
  graphs deduplicate entries, so splitting conditional blocks into lines
  silently removes repeated preprocessor directives. The capture class belongs
  in globals after all library includes. Putting it beside IRremote's early
  include in the player makes fbuild insert its CRGB-typed function prototypes
  before FastLED.h; IRremote itself must still precede Audio.h. A custom board on a
  supported core is not rejected merely for having an unknown board id. The shelf fixture and verified
  receiver renders followed: `IR_RECEIVER_MODULES` in `src/state/peripherals/irModules.ts`
  is the one list of demodulating receivers an `IRRemoteInput` can be, the same
  shape `MIC_MODULES` already has — the deciding fact here is *pin order* rather
  than existence, since a KY-022 breakout puts its supply on the centre pin and
  a bare TSOP38238 puts ground there, so treating them as interchangeable would
  put the supply rail on a GPIO for half of users. `irReceiverModuleFor(partId)`
  falls back to the shelf's first entry for an unset or stale `partId`,
  mirroring `micModuleFor`'s same rule; `partOptions.ts`'s `IRInput` options and
  `hardwarePartCatalog.ts`'s `IR_INPUT_PARTS` shelf rows both map over the list rather
  than restating it. A KY-022 clone's documented outer-pin swap is carried as a
  per-entry `note` rather than averaged away. User-facing operation and repairs
  live in `docs/user/hardware-workbench.md#add-an-ir-remote-receiver`;
  `docs/release/beta-support-matrix.md` keeps all IR combinations experimental
  until an exact bench row exists. IRremote must be included before `Audio.h`:
  ESP32-audioI2S's public header pulls in `using namespace std`, after which
  IRremote 4.7.1's global `void_t` alias collides with `std::void_t`; the player
  generator emits graph includes ahead of `Audio.h` for this reason, asserted by
  `irRemoteGenerators.test.ts`. Firmware compile evidence across
  generators/toolchains/boards — including the still-open fbuild legs (RP2040
  fails on a boot2 assembler issue that isn't a Studio bug;
  SAMD/Renesas/Teensy/STM32 unexercised) — is tracked in
  [IR compile checks](../../reports/compile/ir-compile-checks.md), reproduced with
  `npm run gen:compile-fixtures -- ir` and `scripts/compile-fixtures/compile-ir-smoke.py`.
- **Power switch (experimental):** `PowerSwitchOutput`
  (`src/state/peripherals/powerSwitch.ts`) is the relay's DC counterpart: active-high
  MOSFET channels, one GPIO each, load-side limits read from the catalogue's
  `mosfet` block. The board decides the channel count (LR7843 one, Mosfetti
  and YYNMOS-4 four), and every view gets the ports from `partDerivedInputs`
  (`src/build/parts/partPorts.ts`), as for a relay; a new part-derived node joins
  that helper rather than adding its own ternary at each call site. It takes no
  supply from the controller, so `peripheralPowerPadIndex` returns `null` for
  it and `peripheralPowerNet` follows; a module with no supply pad must say so
  rather than fall back to pad 0, which on the LR7843 is GND and drew a VCC
  wire onto it. Channel pins are found on the sheet by the board's printed
  letters (`mosfet.channelLabels` through `partPinLabelForProperty`), not by
  position; a board whose inputs print something else names them in
  `mosfet.channelInputLabels` (the YYNMOS-4's PWM1 to PWM4), which wins for
  pins and pads while ports keep the channel label. A pad printed `GND1`,
  `GND2` and so on is one channel's own return: the diagram draws a ground on
  each (`peripheralChannelGroundPadIndexes`), where a repeated plain `GND` is
  one net the board joins and gets one stub. A PWM choice made per node can collide across nodes: channels share
  LEDC timers on ESP32 core 2 and one frequency on ESP8266 and RP2040, so
  `powerSwitchPwmPlan` plans every dimmed channel in the sketch together. Dimming reads
  its PWM frequency from the part (`mosfet.pwmHz`), because a module's gate
  drive decides how fast it can switch; a module without one only switches.
  When a new field decides which firmware a node emits, a node saved before
  the field existed must read the default the evaluator and emitter fall back
  to: `powerSwitchDims` first read a missing Level as 0 and turned every
  existing switch into PWM. See
  [hardware nodes](../../architecture/hardware-model.md).
- **Light sensor (experimental):** `LightInput` picks its module from
  `LIGHT_SENSOR_MODULES` (`src/state/peripherals/lightSensor.ts`), the same one-list shape
  as `MIC_MODULES`: an LDR on one ADC pin or the Adafruit BH1750 on the shared
  I2C bus. The module's transport decides the claimed pins
  (`lightSensorPinKeys`) and the shown fields (`isPropertyEnabled`). An LDR's
  Lux is a flat zero rather than an invented conversion, since a bare divider
  has no calibration. The BH1750's breakout pulls the controller side of SDA/SCL
  up to VIN, so `peripheralPowerNet` powers it from 3V3 despite the VIN
  silkscreen, the same trap as the INA219. See
  [hardware nodes](../../architecture/hardware-model.md). Firmware compile evidence
  (BH1750 normal/slideshow/player, the LDR path, and a no-sensor guard, all
  classic ESP32) is tracked in
  [light-sensor compile checks](../../reports/compile/light-sensor-compile-checks.md), reproduced
  with `npm run gen:compile-fixtures -- light` and
  `scripts/compile-fixtures/compile-presence-smoke.py` (shared with the presence-sensor checks
  via `--label light`).
- **Environment sensor (experimental):** `EnvironmentInput` is the exact
  Adafruit product-2652 BME280. It publishes temperature (°C), humidity (% RH)
  and pressure (hPa) as physical values. The imported `environmentSensor`
  block owns 0x76/0x77 and the three measurement ranges; preview controls,
  validation, manifest facts and direct compensated firmware all read that
  contract. On the I2C route, SDA lands on the breakout's SDI pad and SCL on
  SCK; SDO and CS remain unwired. The Build Diagram powers VIN from 3V3.
- **Distance sensor (experimental):** `DistanceInput` is the HC-SR04. Trig is
  `digitalOutput`, Echo is `digitalInput`. VCC takes the 5 V rail, so Echo swings
  to 5 V and gets the same 1 kΩ / 2 kΩ divider as the MAX485's RO:
  `receiveDivider` looks up the property and pad per part kind in
  `RECEIVE_DIVIDER_SOURCES`, so add a new 5 V output there rather than copying the
  drawing. The render shows the transducer face; its pad row was computed from
  the model's own coordinates (12 px/mm), so re-measure if the render is replaced.
- **Temperature probe (experimental):** `TemperatureInput` is the waterproof
  DS18B20 (Adafruit product 381). One GPIO, requested as `digitalOutput`
  because 1-Wire is driven low and released. The bare probe has no pull-up, so
  the diagram draws a 4.7 kΩ resistor from DATA to 3V3 under the probe
  (`dataPullUp` in `physicalDiagramLayout.ts`). Wire order VCC, GND, DATA puts
  DATA last so that resistor crosses no supply stub; keep that order if the
  render is replaced. VCC comes from 3V3, never 5 V, since the pull-up would
  hold the pin at the supply. Firmware is library-free and CRC-checked; see
  [hardware nodes](../../architecture/hardware-model.md).
- **Power monitor (experimental):** `PowerMonitorInput` reads an INA219 or INA226
  over I2C.
  INA219 and INA226 both have an opt-in `debug` checkbox. Keep unwired debug
  monitors in normal and template builds, deduplicate the shared diagnostic
  helper separately from each chip helper, and initialize Serial at 115200
  before sensor setup (shared with RTC, IR and telemetry). Per-node wrap-safe
  timers limit reads' diagnostic output to once a second; measurement still
  runs every loop, and failed reads still zero the graph outputs. See the
  [user guide](../../user/hardware-workbench.md#measure-a-dc-load).
  The INA219 board's VIN has no regulator and sets the chip's I2C pull-up level, so the
  Build Diagram powers it from 3V3 via `peripheralPowerNet` even though the pad
  silkscreens VIN. The one-I2C-bus check moved out of display-specific code into
  `i2cBusValidationIssues` in `validateGraph.ts` (deploy gate + Graph Health),
  so it now refuses any two I2C parts on different SDA/SCL pairs, not only when
  a display is among them. See [hardware nodes](../../architecture/hardware-model.md).
- An I2C part with its own address resolver must use it in `i2cAddressFor` as
  well as firmware and validation. The PWM driver's unprefixed hex and missing
  address defaults once resolved differently in bus collision detection, hiding
  two devices answering on the same address. Reject partial address parses;
  `parseInt` alone accepts trailing text that the configuration did not offer.
- **Power converters (hardware-only):** `src/state/peripherals/powerConverter.ts` resolves
  ratings from the catalogue's `powerConverter` block (never restated);
  `sourceVoltageIssue`'s minimum is `max(inputMinV, outputSetV + minHeadroomV)`.
  For the LM2596 controller buck, `ratedInputCurrentMa` sizes the input
  fuse/wire for the converter's full rated output, not an estimated load, and
  the electrical plan (`controllerSupply`, not the deploy gate: firmware is
  unchanged) blocks a board whose onboard power path is unverified, a board with
  no `power-in` pin, an out-of-range source voltage, and a second controller
  converter. For the isolated Mean Well SD-100A/B-5 LED-rail converters,
  `deratedCurrentMa` reads the imported temperature curve at
  `ENCLOSURE_AMBIENT_C` (40 °C), `groupSupplies` packs each 5 V zone only while
  it retains the ordinary 20% headroom, and each zone gets its own source-side
  fuse/conductor plus output main fuse/trunk. A controller buck joins the same
  upstream-source budget; different source voltages, mixed rail models and
  out-of-range sources block the electrical plan. The Build Diagram follows
  terminals 1 V+, 2 V-, 3 FG, 4-5 -V and 6-7 +V, including the isolated-output
  ground bond; converter outputs are never paralleled. See
  [hardware nodes](../../architecture/hardware-model.md#converting-a-12-v-or-24-v-source-to-5-v).
- **DMX transceiver (experimental):** a DMX512 `DMXInput` is drawn as the "C25B"
  MAX485 module (`dmx-input`, `src/state/peripherals/dmxTransceiver.ts`). It is not a
  `PART_OPTIONS` row, because that would put the module's picture on an Art-Net
  node too, and an Art-Net node draws nothing. It takes **5 V**, its rated
  supply, so RO swings to 5 V: `receiveDivider` draws 1 kΩ from RO to a junction
  and 2 kΩ to ground, and `peripheralSignalEndPoint` ends the RX wire on that
  junction for both the lane allocator and the router, so the wire's lane is
  chosen for the point it climbs to. RE has no GPIO:
  `transceiverEnableBridgePads` finds it by name and the sheet draws a jumper to
  DE. See [DMX / Art-Net input](../../design/dmx-artnet-input.md#the-transceiver).
- **Wired Ethernet (experimental):** `EthernetModule` is a hardware-only WIZnet
  WIZ850io (W5500) that replaces Wi-Fi for Art-Net and NTP in the normal sketch;
  both call the transport-neutral `_netEnsureConnected`/`_netConnected`, and
  only `src/codegen/peripherals/ethernetCpp.ts`'s bootstrap differs. It takes
  `SPIClass(HSPI)` where the chip has a second SPI host, because a colour panel
  owns the default `SPI` object and `SPI.begin` keeps the first pins it is
  given; on the one-host C3/C6 it shares `SPI` and validation requires the
  panel's SCLK/MOSI. Its two-row header is why `peripheralApproach` exists: a
  wire to a top-row pad climbs between the bottom-row pads rather than through
  one. See [wired Ethernet](../../design/wired-ethernet.md); firmware compile
  evidence is tracked in
  [Ethernet compile checks](../../reports/compile/ethernet-compile-checks.md).
- **NLED pixel data extender (experimental):** an LED output's `dataLink`
  property (`Direct` | `NLED Pixel Data Extender`,
  `src/state/peripherals/pixelDataExtender.ts`) is a physical-route fact only — firmware
  emits the identical one-wire signal either way, so the evaluator and
  generators need no teaching. Choosing the extender records
  `dataLinkPartId: NLED_PIXEL_DATA_EXTENDER_PART_ID` on the manifest item; from
  that, `itemLayouts` (`physicalDiagramLayout.ts`) grows the card by
  `OUTPUT_DATA_EXTENDER_HEIGHT` to draw the TX/RX pair below the fixture, and
  `buildConnectionRows`/`buildBomRows` (`buildExports.ts`) route through TX, the
  twisted A/B/GND run, and RX into DIN instead of wiring the output straight to
  DIN. Distance and conductor facts (`pairConductors`, `maxDistanceMeters`) come
  from the imported part's own `pixelDataExtender` block
  (`nledPixelDataExtenderSpec()`), never restated as constants. The pair carries
  one asynchronous line, so a clocked chipset or a HUB75 ribbon can't use it —
  `findPixelDataExtenderErrors` (via `pixelDataExtenderSupports`) blocks deploy,
  and `isPropertyEnabled` disables `dataLink` on SPI/HUB75 outputs, but the
  field stays editable while it already names the extender, so a chipset change
  that invalidated the choice can be undone from the field itself rather than
  getting stuck disabled. See
  [hardware nodes](../../architecture/hardware-model.md#long-data-runs); marked
  experimental (unvalidated long-run distance) in
  `docs/release/beta-support-matrix.md`.

## Hardware workbench

- Hardware captions counter-scale through overview zooms so labels stay
  readable. Above 1:1 zoom they grow with their parts through the full zoom
  range.
- Pin captions follow each catalogue part's `pinLabelsLeftToRight` order. GPIO
  numbers never reorder physical header labels.

## Indicator LEDs on the bench

- A part's or board's indicator LEDs are measured from its model by
  `Blender Assets/Scripts/measure_part_indicators.py` into the manifest's
  `indicators`. The importers carry them onto the render they were measured
  on (`render.indicators`); `scripts/assets/render_indicators.py` validates them for
  both importers and scales a board's with its downsized render.
  `BenchIndicators` draws them only when that render is the picture on screen
  (`indicatorRenderFor`).
- Indicator measurement must also check camera visibility: a projected lens
  rectangle can belong to an LED buried under another component. The measurement
  script samples camera rays through the lens and excludes fully occluded LEDs,
  ignoring objects hidden from the render. An occluded LED requires correcting
  its source model placement against the board references, re-rendering and
  remeasuring; excluding its overlay alone does not repair the asset. The generic
  ESP32-S3 N16R8 power/TX/RX row sits below BOOT on exposed PCB. Its source repair
  script is `Blender Assets/Scripts/fix_n16r8_status_led_seats.py`; staged renders
  pass `relight_qa.py` before promotion with `relight_promote.py`.
- The board rebuild names each LED `LED n` with `LED n lens` and `LED n die`,
  and a die material ending " lit" was rendered emitting. A lit LED is a power
  LED: the render already shows it on, so the bench adds only its glow. An
  unlit LED is recorded only under an explicit rule in that script, and a rule
  never targets a rendered-lit LED, because baked light cannot be turned off.
  A board that renders more than one LED lit records none, since which one is
  power is not in the model. The generators had lit the Arduino Nano's TX, RX
  and L, the Uno's L, the R4s' TX/RX, SCK and matrix, the nRF52840 DK's user
  LEDs and the Nucleo-144's LD1-LD3, which an idle board has dark.
  `board_rebuild/relight.py` turned those off and re-rendered them; it names
  each LED from the generator's object names in the pre-rebuild backups. Run
  `relight_qa.py` before `relight_promote.py` when relighting a board. QA
  allows only light to be removed: glossy leads and gold rings reflect an LED
  from across the board, so a fixed radius around it is the wrong test. The
  same script recolours LEDs (the Arduino power LEDs are green) and reseats
  one the generator put on another part (the Uno R3's L). Those render twice:
  first with the LED off, so QA can check the first step only removed light
  and the second only added it. Boards whose single lit LED may be a user or
  charge LED are skipped by name until checked against the board.
- What lights a state-driven LED is read from the same evaluated values the
  firmware acts on (`indicatorGlow`): a relay publishes each coil as
  `relayEnergisedKey(n)`, a Power Switch its per-channel `load` (so a dimmed
  Mosfetti channel LED dims with it), an IR receiver `IR_RECEIVING_KEY` while a
  key is held, and a ZY12PDN shows its requested voltage's stock-firmware
  colour. These keys are read-back values like the displays' surfaces, not
  ports. A rule's LED order follows the generator: relay channel n's status
  LED is at increasing x, and Mosfetti A to D run left to right.

## Build Diagram

- A peripheral title is centred on its picture and has to stay inside the
  column slot (`PERIPHERAL_RENDER_W` + `PERIPHERAL_GAP`). Catalogue labels run
  past that on one line, so `fitPartTitle` wraps them to two lines at the
  measured Inter 16px advances, and the gap is wide enough that the longer
  line of the widest label still clears its neighbour. The caption above a
  title (line-in, shared pads, XLR) moves up with the wrap. Output cards use
  the same fitter against the card width, with the subtitle left under the
  title. `physicalDiagramLayout.test.ts` places the longest catalogue labels
  in adjacent columns and refuses an overlap.
- On the Build Diagram, a microphone is an ordinary peripheral row item, not a
  bespoke top-of-sheet slot: `itemLayouts` (`physicalDiagramLayout.ts`) dropped
  the `mic-input` carve-out and the
  `MicrophoneGraphic`/`microphoneTerminalPoint`/`MICROPHONE_PAD_*` machinery in
  `PhysicalAssemblyDiagram.tsx` is gone, because all three catalogued mics
  (INMP441, ICS-43434, generic I2S MEMS) are six-pad rows along the bottom edge
  like every other module — the bespoke slot only ever bought a pad *column* for
  free routing, and reading pads from `MODULE_PAD_GEOMETRY`'s measured geometry
  makes that unnecessary. A microphone's channel-select pad (`L/R`/`LR`/`SEL`,
  tied to ground to pick the left channel, which is the app's default) carries
  no GPIO, so it isn't one of the item's connections: `micChannelSelectPadIndex`
  finds it by label the same way `POWER_PAD_LABELS`/`GROUND_PAD_LABELS` find
  supply/ground, and it draws with the plain GND symbol (one net, one symbol,
  per the common-net rule) but a longer stub — `CHANNEL_SELECT_STUB_DROP` — so
  its "GND (LEFT)" caption doesn't overprint the plain GND label beside it.
  Because that stub sits deeper than the ordinary VCC/GND ones,
  `peripheralLaneBase(rowItems)` replaces the old flat `PERIPHERAL_LANE_BASE`
  constant wherever a row's first control lane is placed — a row is deepened
  only when one of its own items actually carries a channel-select pad, priced
  per row rather than sheet-wide. Right-side control wires no longer interleave
  with the bus (output) wires in `rightLaneSlots`/`assignControlCorridors`: they
  now rank strictly after every bus wire, offset by at least
  `CONTROL_CORRIDOR_MIN_SLOT` (5), because a bus wire's corridor stops around
  y~520 while a control wire keeps descending through the module lanes and
  through the USB block's x=291 boundary — interleaved, a right-rail control pin
  sitting above every output pin could take slot 0 and cut straight through it.
- A pad on the Build Diagram is coloured at its drilled hole, not at a fixed
  dot: `peripheralPadRadius` (`physicalDiagramLayout.ts`) looks up
  `MODULE_PAD_HOLE_RADIUS[partId]` — each part's hole radius measured in its own
  render's pixels, from the hole's transparency — and scales it by the same
  `fittedRenderBox` factor `peripheralPadPoint` already uses to place the pad,
  so the colour fills the hole without painting over the plated ring around it;
  a part with no measured hole falls back to `DEFAULT_PAD_HOLE_RADIUS`.
  `fittedRenderBox` itself was factored out of `peripheralPadPoint` so both
  functions derive one `preserveAspectRatio="meet"` fitted box from a part's
  render instead of two. The old hand-guessed
  `PAD_X_RATIOS_SD_5V`/`PAD_X_RATIOS_SD_3V3` spreads (assuming every SD card was
  a 400x690 picture) are gone; both microSD boards now have real
  `MODULE_PAD_GEOMETRY` rows measured from their drilled holes, and the UDA1334A
  and `st7789v-xpt2046-touch-240x320` rows were re-measured after their renders
  changed shape (504x324 and 651x1169 respectively) — the old tables assumed the
  prior render's dimensions and put every pad tens of pixels off.
  `src/components/BuildDiagram/__tests__/padGeometry.test.ts` is the invariant:
  every part in `MODULE_PAD_GEOMETRY` must also have a `MODULE_PAD_HOLE_RADIUS`
  entry (`peripheralPadRadius` must not fall back to the default), or a small
  board's rings get painted over.
- A Build Diagram wire's hover tooltip names the pad printed on the *part*, not
  the controller's use label for that pin: `connection.useLabel` speaks for the
  controller (the ESP32 drives I2S data *out*), so an amplifier's data wire read
  "I2S DOUT" over a pad silkscreened DIN. `PhysicalAssemblyDiagram.tsx` now
  resolves `peripheralPadLabel(layout.item, padIndex)` and prefers it —
  `${connection.pinLabel} · ${layout.item.title} ${padName}` (e.g. "GPIO16 ·
  MAX98357A I2S amplifier DIN") — falling back to the old `pinLabel · useLabel`
  shape only when the pad carries no printed label.
  `BuildDiagramWorkspace.test.tsx` asserts both that a wire's tip matches the
  part's pad name exactly (`^GPIO\s?4 · Button SIG$`) and that the amplifier
  case never reads DOUT.
- A chip photo on the Build Diagram must be scaled and placed *from the same
  measured leg pitch the wiring terminals are cut to*, never fitted into an
  independently hand-typed box: the 74AHCT125 level-shifter's render box
  (`LEVEL_SHIFTER_RENDER_X`/`_WIDTH`) and its terminal rows
  (`LEVEL_SHIFTER_PIN_ROWS`) were two separate guesses in
  `physicalDiagramLayout.ts`, so the photographed leg pitch drifted off the
  terminal pitch by pin 7. `LEVEL_SHIFTER_RENDER_PX`
  (`sn74ahct125n-dip14.webp`'s own measured leg positions) now drives a derived
  `LEVEL_SHIFTER_RENDER_SCALE`/`_WIDTH`/`_HEIGHT`/`_X`/`_Y`, keeping the fixed
  `LEVEL_SHIFTER_PIN_PITCH` terminal rows authoritative, the same discipline
  `MODULE_PAD_GEOMETRY` already applies to module pads.
- Put each LED data resistor after the 74AHCT125 output and next to the LED
  DIN terminal. The short resistor-to-DIN lead represents required physical
  placement; putting the resistor beside the controller or shifter can leave
  the long cable unterminated and reduce its damping effect.
- Show local GND and +5V net symbols on every LED output card. These identify
  the panel power terminals while the detailed fused feed routes remain in the
  power section.
- Build Diagram wire hover (`src/components/BuildDiagram/wireHover.tsx`) blooms
  a wire's visible stroke and names its connection without a React re-render on
  every pointer move. A drawn wire is 3-10 units wide and usually viewed zoomed
  out, so `HoverWire` pairs the visible `path` with a wider transparent twin
  (`wireHitArea`, marked `data-pan-background` so dragging it still pans the
  sheet) inside one `<g>`, and CSS `:hover` on that group alone drives the glow
  — no state, no listener. `WireBloomFilter`'s region is declared in
  `userSpaceOnUse` units rather than the default bounding-box units, because
  most wires are straight horizontal/vertical runs whose bbox has zero height or
  width, which would make a bbox-relative filter region collapse to nothing and
  the hovered wire disappear instead of glow. `WireTooltip` is portalled to
  `document.body` rather than drawn inside the diagram's own SVG coordinates,
  since that surface is pan/zoom-transformed and an in-place tooltip would
  shrink with zoom and clip at the viewport edge.
