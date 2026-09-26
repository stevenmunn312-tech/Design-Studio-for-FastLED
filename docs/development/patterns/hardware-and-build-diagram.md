# Hardware and the Build Diagram

Pins, buses and boards, the peripheral parts and how each is chosen, and how the
Build Diagram draws them.

Moved out of the always-loaded `CLAUDE.md` so a session reads it only when
working in this area; record new patterns for this area here, not there. History
of the entries before the move: `git log -p -- CLAUDE.md`.

## Pins and boards

- Pin collision checking is bus-aware, not a flat duplicate-claim check:
  `src/state/busTopology.ts` declares each pin's kind and role and derives the
  bus *instance* from the pins themselves, and both `validateGraph.ts` and the
  Graph Health drawer call its one `findPinCollisions`.
- `assignPartPins`' refusal (`noPinReason` in `src/state/partPinAssignment.ts`)
  speaks in the board's own words only when the profile states a pad allowlist
  (`pinSafety.safeGeneralPurpose`): it names which spare pins are held and by
  what (`holderList`, skipping stand-in `__claimed-` nodes), or how many are
  left against how many the part still needs; a profile-less board keeps the
  general "No free GPIO" wording, since a chip-table pool is no claim about the
  board's pads. `findExactBoardPinIssues` reads the same allowlist through
  `boardSparePins`, so a part stranded on a reserved pin after a board change is
  told the board is full and to free a pad. See
  [hardware nodes](../design/hardware-nodes.md).
- Hardware soldered to the controller board is stated once, in
  `src/state/integratedBoardHardware.ts`, and read twice:
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
  `src/build/boardPinSafetyOverrides.ts`, which supplies `pinSafety` for a board
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
  [hardware nodes](../design/hardware-nodes.md#boards-with-hardware-already-on-them).
- `Board` is a hardware-only node type and is `hidden` on the graph canvas, so
  the grouped property controls `PROPERTY_GROUPS` declares for it (its "Bench"
  group included) never render anywhere — that generic renderer only draws for
  visible canvas nodes. `src/components/Canvas/BoardNodeBody.tsx`, rendered from
  the Hardware tab, stands in for the hidden node but does not read
  `PROPERTY_GROUPS`; a Board property needing a UI control must be added there
  by hand. `reportTelemetry`'s checkbox has been added, reverted and restored,
  and the reason it is back is the whole of its scope: it was removed once touch
  calibration got its own generated instrument sketch
  (`src/codegen/touchCalibrationSketch.ts`) and stopped needing telemetry, which
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

## Peripherals

- A hardware option the generator cannot honestly build is not offered:
  `MIC_MODULES` in `src/state/micModules.ts` is the one list of I2S MEMS
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
  only when nothing does. `src/state/audioOutput.ts` owns the answers
  (`i2sAudioStage`, `powerAmplifierFeed` → `dac`/`internalDac`/`speakerAmp`,
  `audioVolumeStage`), and `hasAudioOutputStage` lives in the import-free
  `buildMode.ts` so the build-mode resolver can ask it too. A speaker amp
  feeding a power amp is one structured issue in both the gate and Graph Health.
  A DAC alone is deliberately not warned about, since powered speakers are a
  correct build. See
  [audio part expansion](../plans/audio-part-expansion.md#phases).
- **IR receiver (D-05a):** `IRRemoteInput` is a hardware-managed, root-owned
  signal node (`HARDWARE_MANAGED_SIGNAL_NODE_TYPES` and
  `HARDWARE_LIBRARY_HIDDEN_NODE_TYPES` in `hardware.ts`) claiming one exclusive
  digital-input pin with no pull-up — the receiver module drives the line
  itself, the way a PIR does, so a pull-up would fight its output stage. Its
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
  button from a wire dropped on it — `liveExamples.test.ts` refuses a wire on
  that socket from any live example, since the generic bool builder would
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
  `cache: false`, reads one non-repeat `FLS_IR v=1` line off the shared serial
  ingest, and saves it with `learnIrRemoteButton` in one undo step. Cancel
  releases the port. An untrusted workspace is refused before any flash.
  Arduino-IRremote is pinned at 4.7.1 (`IR_REMOTE_VERSION` /
  `_IRREMOTE_VERSION`). `irRemoteHeader` emits only the `DECODE_*` families a
  sketch's keys use, and emits nothing when there are none, so an IR-free sketch
  does not acquire the library. fbuild vendors tag `v4.7.1` lazily and hides
  that checkout from other sketches; arduino-cli installs `IRremote@4.7.1`;
  `// FLS-IRREMOTE:` changes the sketch bytes when the pin changes. Project
  sketches poll through `irRemoteProjectEmission` (`irRemoteCpp.ts`): one
  `IrReceiver.decode()` in the `sample-ir` input phase, after the control
  snapshot and before destination apply, shared by `cppGenerator.ts` and the
  show and player control graphs. A key bool is named like any other GPIO output
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
  Board support follows the pinned release's architecture declaration with its
  explicit ESP32-S3 exception, so a custom board on a supported core is not
  rejected merely for having an unknown board id. The shelf fixture and verified
  receiver renders followed: `IR_RECEIVER_MODULES` in `src/state/irModules.ts`
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
  [IR compile checks](../ir-compile-checks.md), reproduced with
  `npm run gen:ir-compile-fixtures` and `scripts/compile-ir-smoke.py`.
- **Power switch (experimental):** `PowerSwitchOutput`
  (`src/state/powerSwitch.ts`) is the relay's DC counterpart: one active-high
  opto-isolated MOSFET channel on one GPIO (`signalPin`), load-side limits read
  from the catalogue's `mosfet` block. It takes no supply from the controller,
  so `peripheralPowerPadIndex` returns `null` for it and `peripheralPowerNet`
  follows; a module with no supply pad must say so rather than fall back to pad
  0, which on this board is GND and drew a VCC wire onto it. See
  [hardware nodes](../design/hardware-nodes.md).
- **Light sensor (experimental):** `LightInput` picks its module from
  `LIGHT_SENSOR_MODULES` (`src/state/lightSensor.ts`), the same one-list shape
  as `MIC_MODULES`: an LDR on one ADC pin or the Adafruit BH1750 on the shared
  I2C bus. The module's transport decides the claimed pins
  (`lightSensorPinKeys`) and the shown fields (`isPropertyEnabled`). An LDR's
  Lux is a flat zero rather than an invented conversion, since a bare divider
  has no calibration. The BH1750's breakout pulls the controller side of SDA/SCL
  up to VIN, so `peripheralPowerNet` powers it from 3V3 despite the VIN
  silkscreen, the same trap as the INA219. See
  [hardware nodes](../design/hardware-nodes.md). Firmware compile evidence
  (BH1750 normal/slideshow/player, the LDR path, and a no-sensor guard, all
  classic ESP32) is tracked in
  [light-sensor compile checks](../light-sensor-compile-checks.md), reproduced
  with `npm run gen:light-compile-fixtures` and
  `scripts/compile-presence-smoke.py` (shared with the presence-sensor checks
  via `--label light`).
- **Power monitor (experimental):** `PowerMonitorInput` is an INA219 I2C node.
  Its board's VIN has no regulator and sets the chip's I2C pull-up level, so the
  Build Diagram powers it from 3V3 via `peripheralPowerNet` even though the pad
  silkscreens VIN. The one-I2C-bus check moved out of display-specific code into
  `i2cBusValidationIssues` in `validateGraph.ts` (deploy gate + Graph Health),
  so it now refuses any two I2C parts on different SDA/SCL pairs, not only when
  a display is among them. See [hardware nodes](../design/hardware-nodes.md).
- **Power converters (hardware-only):** `src/state/powerConverter.ts` resolves
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
  [hardware nodes](../design/hardware-nodes.md#converting-a-12-v-or-24-v-source-to-5-v).
- **DMX transceiver (experimental):** a DMX512 `DMXInput` is drawn as the "C25B"
  MAX485 module (`dmx-input`, `src/state/dmxTransceiver.ts`). It is not a
  `PART_OPTIONS` row, because that would put the module's picture on an Art-Net
  node too, and an Art-Net node draws nothing. It takes **5 V**, its rated
  supply, so RO swings to 5 V: `receiveDivider` draws 1 kΩ from RO to a junction
  and 2 kΩ to ground, and `peripheralSignalEndPoint` ends the RX wire on that
  junction for both the lane allocator and the router, so the wire's lane is
  chosen for the point it climbs to. RE has no GPIO:
  `transceiverEnableBridgePads` finds it by name and the sheet draws a jumper to
  DE. See [DMX / Art-Net input](../design/dmx-artnet-input.md#the-transceiver).
- **Wired Ethernet (experimental):** `EthernetModule` is a hardware-only WIZnet
  WIZ850io (W5500) that replaces Wi-Fi for Art-Net and NTP in the normal sketch;
  both call the transport-neutral `_netEnsureConnected`/`_netConnected`, and
  only `src/codegen/ethernetCpp.ts`'s bootstrap differs. It takes
  `SPIClass(HSPI)` where the chip has a second SPI host, because a colour panel
  owns the default `SPI` object and `SPI.begin` keeps the first pins it is
  given; on the one-host C3/C6 it shares `SPI` and validation requires the
  panel's SCLK/MOSI. Its two-row header is why `peripheralApproach` exists: a
  wire to a top-row pad climbs between the bottom-row pads rather than through
  one. See [wired Ethernet](../design/wired-ethernet.md); firmware compile
  evidence is tracked in
  [Ethernet compile checks](../ethernet-compile-checks.md).
- **NLED pixel data extender (experimental):** an LED output's `dataLink`
  property (`Direct` | `NLED Pixel Data Extender`,
  `src/state/pixelDataExtender.ts`) is a physical-route fact only — firmware
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
  [hardware nodes](../design/hardware-nodes.md#long-data-runs); marked
  experimental (unvalidated long-run distance) in
  `docs/release/beta-support-matrix.md`.

## Build Diagram

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
