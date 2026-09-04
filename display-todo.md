# Auxiliary displays — implementation plan

Planning document for adding non-LED auxiliary displays to the `Hardware`
development line. This turns the roadmap's fixed-purpose display work into an
implementable sequence and keeps the freeform custom UI as a separately gated
project.

In this document, **LED output** means the existing `MatrixOutput` node and
**display** means a separate 7-segment, OLED, or TFT peripheral.

## Outcome

- Add exact, modelled display parts through the hardware workbench.
- Show signal-carrying displays as nodes in the root graph, even while a pattern
  group is open.
- Keep browser preview and generated-firmware behaviour equivalent.
- Ship useful fixed-purpose displays before depending on the custom UI editor.
- Eventually let a user enter a `Display` node, place typed widgets, and bind
  those widgets to the running graph in both directions.
- Support normal sketches, generative shows, and SD-show players deliberately;
  no generator may silently omit a configured display.

## Scope and sequencing

| Slice | Deliverable | Dependency |
| --- | --- | --- |
| A | Shared display model, string/control signals, bus validation, firmware driver adapters | None |
| B | Numeric 7-segment display | Slice A |
| C | Fixed-layout monochrome OLED, including pattern browser/thumbnails | Slice A; runtime pattern selection for the browser variant |
| D | Fixed-layout colour TFT transport/status screen | Slice A; transport runtime bridge |
| E | Freeform custom UI editor and LVGL code generation | Proven Slice D driver/runtime; its own design gate |

Slices B–D are real deliverables. Slice E must not block them. Freeze its data,
port, theme and widget contracts while they are still cheap to change, but do
not build the editor until the fixed TFT software path exists and one
representative panel/touch/LVGL bench spike has supplied the memory, refresh and
touch budgets. Full soak testing and support claims may follow later.

## Decisions to preserve

- A display is one physical component with two views, following
  [`hardware-nodes.md`](docs/development/design/hardware-nodes.md): the hardware
  workbench owns its existence, exact module, pins, and wiring; the graph owns
  its live inputs and outputs.
- All display parts live in the root graph and use `rootGraphNodes` /
  `rootGraphEdges` for reads and root-scoped writes.
- Fixed display nodes have stable, declared ports. Only the freeform `Display`
  node has widget-derived dynamic ports.
- The freeform editor targets the larger touch panels only. Segment modules and
  the small OLEDs get a dropdown of fixed layouts and nothing else: you cannot
  pick a widget on a screen you cannot touch, so every interactive widget in the
  palette is dead there, and what is left is what a preset already is. See
  [auxiliary displays](docs/development/design/auxiliary-displays.md#which-displays-get-a-design-surface).
- Custom UI port ids derive from widget id plus a registry-owned role, never an
  editable label or array position. Renaming or moving a widget must never break
  a cable, and the model must permit zero, one or multiple roles per widget.
- The first custom UI is one fixed-resolution screen with integer pixel
  geometry, snapping, touch-aware minimum sizes, one theme-owned background and
  a non-overlapping widget layer. Responsive layouts, arbitrary scripts, and
  user-authored C++ are not v1 features.
- Touch state is sampled before graph evaluation; graph-to-widget values are
  applied afterward. A registry-declared synchronized control may close its
  `out → graph → set` path and is explicitly one tick: sampled touch leaves this
  tick and authoritative state is published after evaluation. Every other
  feedback path through one Display is rejected or requires a visible `Delay`.
- Generated loop code uses fixed buffers / `const char *` and `snprintf`, not
  repeatedly allocated Arduino `String` values.
- Driver and LVGL dependencies are pinned to tested tags. Do not follow a
  default branch from generated firmware.
- New physical visuals use verified Blender assets and dimensions imported with
  `scripts/import-part-assets.py`; do not add hand-drawn stand-ins.

## Displays to include

The first row in each family is the reference device that establishes the
driver contract. Closely related controllers follow only after the reference
device passes on hardware — which is why the OLED family leads with the SH1106
rather than the more commonly cited SSD1306: a contract meant to be proven on
hardware should be built against the hardware that exists.

The 2.4-inch module states its native 240×320 portrait geometry. It is used
in landscape, but rotation is a node property rather than part of the part —
recording 320×240 in the catalogue would bake one orientation into the module
itself and leave the other unrepresentable.

Its header breaks touch out as T_CLK/T_DIN/T_DO alongside SCK/MOSI/MISO, so
whether display and touch share one bus is something the user wires rather
than something the module decides. Bus validation already derives the bus from
the pins themselves, so both wirings are describable: same clock pin means one
bus with unique chip selects, different clock pins mean two.

The SH1106 on the bench is the 7-pin SPI variant rather than the 4-pin I²C
one, so the two OLEDs will arrive on different transports. That is deliberate
coverage rather than an inconvenience, and it is why the surface contract is
defined independently of the bus.

Two rows changed after the modules were ordered. The 2.4-inch touch TFT is an
ST7789V rather than an ILI9341, so one ST7789 driver now covers both it and the
1.3-inch 240×240 module, and ILI9341 reaches the bench only inside the CYD
board. Note that 2.4-inch 320×240 SPI modules are commonly ILI9341 and are
sometimes mislabelled, so confirm the controller by reading its ID register
before building against it.

| Priority | Exact controller/module family | Proposed node | Bus / input | Primary use cases |
| --- | --- | --- | --- | --- |
| 1 | TM1637 4-digit 7-segment module, colon variant | `SegmentDisplay` | CLK + DIO | BPM, clock, countdown, score, active-pattern number, debug value |
| 2 | MAX7219 8-digit 7-segment module | `SegmentDisplay` | SPI-like CLK/DIN/CS | Longer counters, elapsed/duration display, channel/value monitor |
| 3 | SH1106 128×64 SPI OLED (1.3-inch, 7-pin) | `InfoDisplay` | 4-wire SPI: CLK/MOSI shared, CS/DC/RES exclusive | Song title and progress, clock/date, current pattern, sensor/status readout. Leads the OLED slice because it is the device on the bench |
| 4 | SSD1306 128×64 I²C OLED (0.96-inch) | `InfoDisplay` | I²C | Same layouts through the same 1-bit surface contract. The transport is written and tested; the module has not been on a bench |
| 5 | ST7789 240×240 SPI TFT, no touch | `TransportDisplay` | SPI | Colour now-playing screen, album/pattern art, status dashboard, fixed gauges |
| 6 | ST7789V 2.4-inch 240×320 SPI TFT + XPT2046 touch + microSD (MSP2402 form) | `TransportDisplay`, then `Display` | Shared SPI with separate CS lines; touch breaks out T_CLK/T_DIN/T_DO so sharing is a wiring choice | Fixed play/pause/previous/next/volume UI; reference target for the custom UI builder |
| 7 | ESP32-2432S028R integrated ILI9341/XPT2046 board profile | `Display` | Board-integrated | Low-cost end-to-end custom UI reference and repeatable validation target. The only ILI9341 on the bench, and a board rather than a part |
| Later | GC9A01 240×240 round TFT | `TransportDisplay` / `Display` | SPI, module-specific touch if present | Circular gauge, clock face, compact effect controller |
| Later | ST7796 480×320 touch TFT | `Display` | SPI/parallel, exact module dependent | Larger custom control surface after RAM and refresh budgets are proven |

Do not put e-paper, HDMI/RGB panels, arbitrary web views, or generic character
LCDs in the first implementation. E-paper has a fundamentally different
refresh model, large RGB/HDMI displays need another hardware/runtime class, and
HD44780-style character LCDs add a third text backend without covering a use
case the OLED slice cannot already serve.

### Fixed display layouts and use cases

`SegmentDisplay` layouts:

- Numeric: signed/unsigned value, configurable decimal places, leading zero,
  clamp/overflow indication, and brightness.
- Clock: `HH:MM`, stopwatch, countdown, and optional blinking colon.
- Index: current pattern / pattern count, score, cue number, or DMX channel.

`InfoDisplay` layouts:

- Now Playing: title, elapsed/duration, progress bar, play state, and volume.
- Pattern Browser: encoder selection, pattern name, ordinal, and a baked 1-bit
  thumbnail.
- Clock: time/date plus sync/valid state from `RTCInput`.
- Status: two short text rows, one numeric value, a progress bar, and up to four
  boolean indicators.

`TransportDisplay` layouts:

- Now Playing: title, elapsed/duration, progress, active pattern, and colour
  artwork/thumbnail.
- Fixed Transport: previous, play/pause, next, and volume; touch actions go
  through the shared transport bridge rather than bespoke player globals.
- Show Status: active pattern, section, beat/BPM, output state, and brightness.
- Diagnostics: board/connection state and a display/touch self-test. This is a
  generated diagnostic layout, not a user-authored custom UI.

## Proposed node and data contracts

### Shared signal types and bridge nodes

- [x] Add `string` as a real port data type with a port colour, accessible-port
  labelling, connection checks, group boundary support, preview value handling,
  and C++ code generation.
- [x] Represent generated strings with bounded UTF-8 buffers. Define maximum
  bytes, truncation/ellipsis behaviour, supported glyphs, and invalid-character
  fallback once in shared code.
- [x] Add `TextValue` (static string), `FormatNumber` (float → string), and
  `FormatDateTime` (`datetime` → string) nodes with preview/firmware parity.
- [x] Split the transport across the two nodes that already model the appliance:
  `PlayerControls` commands the player, and `PatternMaster` (Music Player)
  reports title, artist, album, genre, year, status, elapsed, duration,
  remaining, progress, volume, and bitrate through `SONG_INFO_PORTS`. A single
  `TransportControl` node doing both shipped first and was removed: the thing
  holding the music is the thing that knows what the music is.
- [x] Fill those outputs on the device from the file's own tags, so a card the
  app has never seen still names its tracks on a display.
- [x] Reconcile roadmap hardware controls with the current model: runtime volume
  now belongs to `Amplifier`, not `SDCard`. Do not move the static maximum back
  to storage; route live volume through the transport/audio runtime.
- [x] Add explicit runtime inputs for LED-output enabled/blackout, brightness,
  and master speed. Master speed must scale the one shared time value in preview
  and every firmware generator rather than rewriting individual node speeds.
  Enabled and Brightness are per LED output rather than per project: two
  outputs are two fixtures, and a stage wash and a monitor strip do not have to
  be dark together. A third port, Controls, takes the `playercontrols` bundle
  and latches its toggle/delta per output; the three combine rather than
  override, which is what makes a touch panel routable in a normal sketch (see
  Phase 5). Master speed is one `MasterSpeed` node, because one shared
  clock cannot be scaled per output.
  Both are accumulated rather than multiplied — `t * speed` would jump every
  animation in the build the instant the knob moved — and both read the speed
  the previous frame resolved, since a control computed from scaled time could
  not be turned back up from a freeze.
  Two generators refuse rather than emit. A music player animates on the
  track's own position, so scaling it would slide the LEDs off the music: that
  is correct behaviour, not a gap. The show generator's clock also times how
  long each pattern holds, so it needs a second accumulated clock before it can
  honour a speed knob — that one *is* a gap, and is the remaining work here.
- [x] Define button semantics once: a Button widget is `true` while pressed;
  transport/control sinks detect a rising edge where a one-shot action is
  required. Toggle widgets hold a boolean state.

### Fixed nodes

- [x] `SegmentDisplay` consumes `value: float`, `enabled: bool`, and optionally
  `dateTime: datetime`. Its formatting mode and exact module are properties.
- [x] `InfoDisplay` consumes stable typed ports for its selected fixed layout;
  do not add/remove ports when a label changes.
- [ ] `TransportDisplay` consumes the same contract: song information in from
  Music Player, commands out through the `playercontrols` bundle Player Controls
  already publishes. A touch module does not invent a second player.
  The inbound half is done — stable typed ports for both layouts, resolved by
  the evaluator and by `playerDisplaysFromGraph` for the SD player. Browser
  touch and the SD-player outbound path are done; normal-sketch and generative-
  show routing remain, and are the reason this contract is not yet complete.
- [x] Each fixed node has a compact browser preview body that shows what the
  physical screen will render at its real aspect ratio. Transport Display
  paints its evaluated RGB565 surface, Info Display paints the page-major OLED
  buffer, and Segment Display lights the evaluated controller-width digits.

### Freeform `Display` node

The node owns `displayId` and derives its graph ports from widgets in the
corresponding persisted `DisplayDocument`.

The launch palette is a control-surface kit for music, LED and live-show
hardware, not a generic LVGL catalogue. Domain behaviour still belongs in the
graph: a transport strip is a template made from ordinary widgets whose ports
wire through `PlayerControls`, not a second player hidden inside a display.

Initial widget palette:

| Widget | Direction | Port type | v1 semantics |
| --- | --- | --- | --- |
| Text | graph → display | `string` | Static fallback or live one/two-line text, fixed font/size/alignment |
| Numeric readout | graph → display | `float` | Precision, prefix/suffix, min/max formatting |
| Timecode | graph → display | `float` | Seconds rendered as `M:SS` or `H:MM:SS`; distinct from wall-clock `datetime` |
| Progress | graph → display | `float` | Clamped 0–1 track/show progress |
| Value meter | graph → display | `float` | Horizontal/vertical ranged bar with optional warning zones |
| Status indicator | graph → display | `bool` | Light, badge, icon or short off/on label |
| Colour swatch | graph → display | `color` | Solid colour preview with optional RGB/hex caption |
| Pattern browser | graph → display | `patternselect` | Active/highlighted pattern, ordinal, browse state and baked thumbnail |
| Image / icon | none | none | Validated lookup id for a size-limited baked asset |
| Button | display → graph | `bool` | True while pressed; text, icon or text+icon presentation |
| Toggle | display ↔ graph | `bool` | Local latch when unwired; optional authoritative state input when synchronized controls land |
| Slider | display ↔ graph | `float` | Horizontal/vertical min/max/step control; primary continuous touch input |
| Dial | display ↔ graph | `float` | Slider value contract with vertical-drag touch interaction, not circular tracing |

The first runtime may ship Toggle, Slider and Dial as output-only controls, but
the document and port model must reserve graph-authoritative state now. A
control that changes from a physical button cannot leave a touch Toggle or
volume Slider displaying the old value. While touched, the user owns the
value; on release, a wired authoritative input wins again.

The next palette, after the one-screen runtime is proven, is Colour Picker,
Choice Strip, Step Control, XY Pad, Launch Pad and Arc Gauge. Colour Picker
emits `color`; XY Pad and Launch Pad are the reason the schema must not assume
one port per widget. Defer charts/spectrum histories, arbitrary text input and
keyboards, dropdowns, multi-screen navigation, animations, containers, custom
event scripts and arbitrary LVGL properties.

Templates are declarative groups of these widgets, never new runtime
behaviours. Ship at least Now Playing, Minimal Transport, Pattern Deck, LED
Performance, Audio Reactor, Diagnostics and DMX Monitor. Inserting one mints
the same visible typed ports as placing its widgets individually.

The first release has exactly two visual layers: one screen background from
the theme (solid, gradient or validated baked image), then a non-overlapping
widget layer. This permits authored skins without introducing arbitrary z-order
or containers. `DisplayTheme` owns background, surfaces, text, accent/warning/
success colours, approved fonts and sizes, corner/border treatment, and default/
pressed/active/disabled widget states. The editor may show graph-type-coloured
input/output notches in Design mode; generated screens and Run mode do not.

Draft persisted shape (names may change in the design note, ownership should
not):

```ts
interface DisplayDocument {
  schemaVersion: 1
  displayId: string
  /** Snapshot used to detect a module/resolution change; the hardware node's
   *  exact partId, rotation, and pins remain authoritative. */
  designSize: { width: number; height: number }
  gridSize: number
  theme: DisplayTheme
  widgets: DisplayWidget[]
}

interface DisplayWidget {
  id: string
  type: DisplayWidgetType
  label: string
  bounds: { x: number; y: number; width: number; height: number }
  properties: Record<string, unknown>
}
```

Derive every outer port id from the stable widget id and a stable role. A
single-port readout may use `widget:<id>:value`; a synchronized control reserves
`widget:<id>:out` and `widget:<id>:set`; a later multi-axis control may use
`widget:<id>:x` and `widget:<id>:y`. Roles come from the widget registry, never
from editable labels or array positions. Changing a widget to an incompatible
port shape is create-new/delete-old and requires the same wired-edge
confirmation as deleting it.

The document does not store cables, live values, touch/selection/hover state or
physical pins. Asset properties store validated lookup ids, never paths or text
that can become a generated identifier.

## Implementation checklist

The sequencing boundary is the fixed TFT, not every unchecked box in this
file. Freeze the custom-UI schema, port roles, theme/asset model and widget
registry contract now, while no workspace has persisted them. Continue
implementation through the fixed `TransportDisplay` software path before
building the freeform editor. Do not persist the earlier one-value-port model
and migrate it later.

Most physical support rows and soak tests may follow the software work, but one
representative ST7789/XPT2046/LVGL spike is a design input rather than a release
formality: its measured heap, draw buffer, asset cost and touch latency set the
widget, font and image limits before Phase 7 is frozen.

### Phase 0 — design spike and acceptance budget

- [x] Create `docs/development/design/auxiliary-displays.md` and link it from
  `docs/NAVIGATOR.md`. Record the data model, runtime ordering, supported
  generators, driver decision, bus rules, and measured constraints there.
- [x] Acquire/reference at least TM1637, SSD1306, ST7789, and
  ILI9341/XPT2046 hardware before claiming support.
- [ ] Spike the simple-display backend and one LVGL 9.x TFT on the exact board
  profiles selected for launch. Pin known-good library tags after the spike.
- [ ] Measure flash, internal RAM, PSRAM, TFT draw-buffer size, LED frame rate,
  touch latency, and audio/show coexistence. Set explicit support gates from
  evidence rather than assuming every nominally compatible MCU can run LVGL.
- [ ] Target no regression to wall-clock LED timing, responsive touch under
  normal LED load, and no unbounded heap growth during a one-hour soak test.
- [ ] Study SquareLine's widget hierarchy, inspector, events, generated-file
  separation, and asset handling. Adopt useful interaction patterns without
  importing its project format or promising feature parity.

### Phase 1 — hardware and persistence foundation

- [x] Add display part categories, exact options, verified catalogue entries,
  renders, dimensions, pin labels, voltage notes, and power expectations.
- [x] Extend the hardware workbench add menu, true-scale part rendering,
  settings inspector, remove/show-node actions, layout persistence, and tests
  for the shipped Segment Display and Info Display families. Transport Display
  joins the same path in Phase 5 rather than reopening this contract.
- [x] Add display node types to the hardware-managed signal set and hardware
  library-hidden set. Ensure add/edit/delete operations always target root.
- [x] Prevent display parts from being grouped or saved into reusable patterns;
  derive this from hardware ownership where possible instead of maintaining a
  second drifting exclusion list. The list existed and had already drifted: it
  named MatrixOutput, MicInput, LineInput and Board and missed the other nine
  parts, so grouping a selection containing a Pot Input or an Info Display
  sealed a bench part inside a pattern group. `isGroupExcludedNodeType` now
  derives from `isHardwareNodeType` plus the three scene-level sources that are
  not parts, and `saveGroupToLibrary` strips whatever an older group still
  carries. Pasting into an open group was the remaining door and is closed the
  same way.
- [x] Add I²C/SPI fields to `PART_FIELDS`, exact-board default-pin assignment,
  board retargeting, GPIO requirements, and generated wiring manifests for the
  shipped segment/OLED modules. The transport-aware pin plans select only the
  chosen module's actual header; TFT/touch fields extend this in Phase 5.
- [x] Replace the current “any duplicate GPIO conflicts” rule with bus-aware
  validation:
  - I²C clients may share SDA/SCL but must have compatible voltage/bus settings
    and unique addresses where the devices require them.
  - SPI clients may share SCK/MOSI/MISO but require unique CS lines and guarded
    transactions; TFT touch and SD-card coexistence is a first-class test.
  - Display reset, data/command, backlight, interrupt, and touch-CS pins remain
    exclusive unless a driver contract explicitly says otherwise.
- [ ] Add optional `displayDocuments` to workspace persistence, project
  autosave, JSON import/export, sharing, undo/orphan cleanup, and migrations.
  Missing data must load as an empty registry for old workspaces. Start this
  only after the role-based port, background/theme and asset-id contracts above
  are frozen; persistence is the point at which those choices become expensive.
  The versioned registry now round-trips through workspace capture, projects,
  JSON import/export and share links; load/import normalize it, missing data is
  empty, and store updates participate in undo. Orphan cleanup remains paired
  with the future `Display` node, because no graph node owns a document yet.
- [ ] Validate imported documents and assets with hard limits. Widget metadata
  is declarative and must never be treated as executable code or raw C++.

### Phase 2 — runtime and code-generation foundation

- [ ] Create a registry-driven display layer (`DISPLAY_PARTS`, fixed-layout
  definitions, driver capability metadata, and later `DISPLAY_WIDGET_LIBRARY`)
  so preview, validation, help, and codegen read one inventory. Widget entries
  declare zero or more stable port roles, not one assumed `value` port.
- [x] Add display nodes as evaluation terminals. A display must update even when
  it is not upstream of an LED output; do not rely on the current
  `reachableFromOutputs` walk alone.
- [ ] Split mixed source/sink display handling into deterministic stages:
  sample touch outputs, evaluate the control/frame graph, publish display
  inputs, then flush changed widgets/pixels.
- [ ] Build a small control-graph IR for float/bool/string/status paths. Reuse
  it from normal sketch, generative-show, and SD-player generators instead of
  copy/pasting display-specific graph evaluation into each generator.
  The copy/paste this guards against was avoided when the show controller
  learned to draw: it reuses `playerDisplaysFromGraph` rather than growing a
  second resolver, parameterised by the expression table the generator hands
  in. The show's table is empty on purpose — it has no music to answer for — so
  every song wire is reported unresolved through the one path. That is still
  the interim stage the IR replaces, not the IR: it resolves a wire to a named
  accessor and cannot evaluate a Wave or a Math node. What it does settle is
  the shape, which is a table per generator rather than a branch per generator.
- [x] Add shared display setup/loop/global helpers for Segment Display and Info
  Display alongside the existing LED, HUB75, audio, and RTC helpers. Controller
  quirks and transport setup stay in their adapters rather than node emit
  cases; TFT/LVGL add new adapters through the same boundary.
- [x] Extend the helper's lazy optional-library staging with include markers,
  pinned fetches, cache recovery, clear error messages, and both fbuild and
  Arduino CLI coverage.
  LVGL 9.5.0 is selected by the emitted `<lvgl.h>` marker. fbuild replaces an
  incomplete or wrong-version checkout, exposes it only to the requesting
  sketch, and restores hidden caches even after a failed build; Arduino CLI
  installs the exact release on first use. Both paths generate the same bounded
  configuration and name a manual recovery command if dependency setup fails.
- [x] Update `THIRD_PARTY_NOTICES.md` and desktop dependency notices for every
  shipped driver/runtime library. Nothing to add yet, and that is the point of
  checking: the TM1637, MAX7219, SH1106 and SSD1306 drivers are all written
  inline against `Wire` and `digitalWrite`, so no shipped display pulls in a
  third-party library. The first entry arrives with the TFT panel/LVGL
  dependencies in Phase 5/7.
  The notices now record LVGL 9.5.0 and its MIT terms, and explicitly retain the
  fact that the inline ST7789V/XPT2046 drivers add no third-party dependency.
- [ ] Update firmware RAM estimation for OLED buffers, TFT/LVGL draw buffers,
  widget heap, fonts, images, and thumbnails. The actual compile-capacity check
  remains authoritative. The shipped half is in: `estimateFirmwareRam` now
  reports `displayBytes`, and a display is counted whether or not anything is
  wired to it, because a sink is emitted either way — it is never in the walk
  back from the LED output, which is why it was worth nothing before. Each
  figure lives beside the struct it measures (`OLED_PANEL_RAM_BYTES`,
  `SEGMENT_DISPLAY_RAM_BYTES`) rather than being restated in the estimator, and
  `DISPLAY_NODE_TYPES` is derived from the catalogue — a workbench-owned node
  whose modules carry a display spec — so it holds when the touch panel arrives
  with outputs of its own. Fonts and thumbnails are deliberately *not* counted:
  they are PROGMEM, and this estimate is internal RAM only. TFT draw buffers
  and widget heap join when there is something to measure.
- [x] Add validation errors when a selected action/generator cannot represent a
  shipped display, plus unresolved-binding warnings for the interim player
  path. Never generate a successful sketch that simply leaves the part dark;
  extend the same derived display set when Transport Display and Display land.

### Phase 3 — `SegmentDisplay`

- [x] Implement TM1637 first: defaults, properties, node body, evaluator,
  deterministic formatter, firmware setup/update, brightness, colon/decimal,
  blank/error/overflow states, and help text.
- [x] Send updates only when the rendered digits change or a bounded refresh
  interval expires; do not rewrite the module on every LED frame.
- [x] Add MAX7219 behind the same logical node contract after TM1637 passes,
  keeping controller-specific wiring and digit capacity in the part adapter.
- [x] Test negative values, rounding, leading zero, decimal placement, NaN,
  overflow, clock rollover, disabled state, low brightness, and multiple
  segment displays. Two of those cases were wrong: a value under 1 lit the
  decimal point on a blank digit, and Index mode folded a non-finite reading
  to 0 in the browser while the firmware's lroundf was free to do otherwise.
- [ ] Compile on every board family advertised for the part and record at least
  one physical support row before marking it supported.

### Phase 4 — `InfoDisplay` and pattern browser

- [x] Implement SH1106 128×64 first, then SSD1306 through the same 1-bit
  surface contract. The SH1106 carries 132×64 of controller RAM behind a
  128×64 panel, so its 2-column offset belongs in the contract rather than
  being fixed up per device — driving one as the other shifts the image two
  pixels and wraps rubbish down the edge, which reads as a wiring fault.
  The SSD1306's transport shipped later than its part option, and for a while
  choosing it produced a sketch that bit-banged SPI at a module with no CS, DC
  or reset pin: a successful build and a dark panel. The surface contract was
  already bus-independent; the driver was not. It is now — one `OledPanel`, one
  command sequence, one flush, with only `_oledCommand` and `_oledPage`
  branching. See
  [one surface, two transports](docs/development/design/auxiliary-displays.md#one-surface-two-transports).
- [x] Keep the transport separate from the surface contract. The module on the
  bench is a 7-pin SPI SH1106 and the SSD1306 to come is 4-pin I²C, so the
  1-bit layout, offset and page addressing must not assume either bus. This is
  coverage rather than a complication: SPI exercises CLK/MOSI sharing with the
  SD card and its own CS, and I²C exercises SDA/SCL sharing with the RTC.
- [x] Reuse the bitmap glyph data in `src/state/font.ts` for text rasterisation
  so browser and firmware layouts share glyphs, alignment, spacing, truncation,
  and unsupported-character behaviour.
- [x] Implement the Now Playing, Clock and Status layouts using shared pure
  layout helpers rather than separate preview and C++ geometry guesses.
- [x] Add the Pattern Browser layout once the runtime pattern-selection
  contract and baked thumbnails below exist. It now renders through the shared
  one-bit surface and emits the same selection/thumbnail contract in normal and
  player sketches.
- [x] Add dirty-region/value checks or a bounded refresh rate so I²C display
  traffic does not stall LED rendering.
- [x] Define the runtime pattern-selection contract once in
  `src/state/patternSelection.ts`: wrapping, confirmation, active-vs-highlighted
  selection, encoder counts-per-detent, and what happens when the collection
  changes. The generative show reads it, which fixed a running show restarting
  at a random pattern whenever its collection was edited.
- [x] Emit the shared half of that contract — wrapping, confirmation, the
  active/highlight split — into generated firmware. Collection reconciliation
  stays browser-only: on a device the collection is fixed at compile time.
- [x] Move the selection onto the player, where it belongs. The first build put
  `Select`/`Confirm` on the Info Display, so the panel owned the cursor and
  confirming changed what the screen said while the LEDs carried on. Player
  Controls gains Pattern Selection / Previous Pattern / Next Pattern / Confirm
  beside the volume and brightness inputs it already has; Music Player gains
  one `Pattern Select` output carrying the whole selection; the Info Display
  consumes that and stops deciding anything. Confirm then drives playback
  because the player owns the cursor, and the SD player's encoder stops being a
  special case. See
  [who owns the selection](docs/development/design/generative-pattern-show.md#who-owns-the-selection).
- [x] Bake Pattern Collection thumbnails during export/codegen:
  - evaluate each group at a deterministic representative tick and dimensions;
  - downsample/dither to the target 1-bit thumbnail size with one shared helper;
  - store bytes in PROGMEM, not RAM;
  - cap count and total flash cost, with a clear validation message. The cap
    landed before the message did, and the two are not the same thing: an
    over-budget collection bakes nothing, so the panel read "NO PATTERNS" —
    exactly what a browser wired to nobody reads. `browserThumbnailIssues`
    derives the reason from the pattern count rather than from the bake, so
    validation can say it without evaluating anything or asking about trust;
  - show the same baked result in the browser preview. The Info Display node
    paints the complete OLED surface at the panel's real aspect ratio; the
    shared `renderInfoDisplay` blits the same baked bytes the firmware does.
- [x] Test title truncation, empty collection, one/many patterns, encoder wrap,
  I²C address settings, OLED+RTC bus sharing, and thumbnail flash estimates.
  The last three arrived with the I²C transport: an OLED and a DS3231 on one
  SDA/SCL pair is accepted, two panels on one strap is not, and a Pattern
  Browser is measured with its baked table rather than without it.

### Phase 5 — fixed `TransportDisplay`

Complete the software path in this phase before starting the editor. It is the
reference implementation for panel setup, dirty updates, touch sampling,
calibration, player-control routing, artwork budgets and generator support that
freeform widgets must reuse rather than rediscover.

- [x] Establish a panel adapter with ST7789 240×240 SPI, partial updates,
  rotation, colour order, backlight, and deterministic refresh scheduling.
  Not "partial draw buffers" as this line first said: 240×240 is 115 KB and
  240×320 is 153 KB, so the device holds no frame at all. The browser surface
  keeps a real dirty box; the firmware caches each field's last-drawn text or
  integer and repaints only what changed. Both draw the same pixels from the
  same geometry — only the decision about when to ship bytes differs, and only
  one side has the RAM to make it the other way. The background is painted once
  at setup rather than on the refresh deadline, because a full-screen fill
  would stall the LED loop visibly. Pacing is wall-clock, never a frame count.
- [x] Implement the fixed Now Playing and Show Status layouts without touch.
  Shared pure helpers in `src/state/transportDisplay.ts`, drawn by the
  evaluator and emitted as literals by both generators that draw displays.
  The geometry is a function rather than flat constants, because rotation gives
  one layout three sizes to satisfy.
- [x] Add Fixed Transport once touch exists: three finger-sized Previous,
  Play/Pause and Next buttons plus an absolute Volume bar. The browser surface,
  both firmware generators and XPT2046 hit testing resolve the same geometry;
  player firmware routes the buttons through its existing transport actions.
- [x] Add the ST7789V 320×240 module and its XPT2046 touch as the first
      interactive target.
  Display and touch may share SPI data/clock lines but use separate CS and
  transactions.
  The module is catalogued and one ST7789 driver already covers both panels, so
  what is left here is touch alone. Before adding a touch *output* port, read
  the sink trap in the design note: both terminal registries are derived from
  inputs-and-no-outputs, so a display that gains an output drops out of both in
  one step — pruned from the sketch along with everything feeding it, and
  evaluated at only the ~8 fps publish cadence. Neither symptom names the port
  that caused it. The terminal rule now derives from output category plus
  inputs (or an ordinary output-less sink), so adding `controls` cannot remove
  the panel. Raw touch coordinates use four-edge calibration, rotate through
  the same mounted geometry as the TFT, and fixed hit regions derive from the
  visible layout fields. Player sketches sample XPT2046 over a small software-
  SPI transaction, so the separately broken-out header works on the display
  bus or on its own pins.
- [x] Route fixed transport actions through the `playercontrols` bundle and read
  status from Music Player, so browser preview, generated normal sketches,
  generative shows, and SD players agree on edge handling, volume, and pattern
  selection. The SD-player slice: a Transport Display wired through Player
  Controls emits play/pause and volume from Now Playing, or LED toggle and
  brightness from Show Status. Browser touch: the node preview publishes button
  edges and held absolute sliders through the same bundle using the firmware's
  shared hit geometry.
  The generative show resolved to *nothing to command*: a show rotates patterns
  and holds no music, and drops the LED-output runtime too, so play/pause,
  previous, next, volume, blackout and dimming all have no destination in it.
  It draws the panel and reports the running pattern from its own cursor; a
  wired Controls output is refused there, and the XPT2046 service is not
  emitted outside Diagnostics, because it would call player transport functions
  a show controller does not define.
  The normal sketch needed a port contract before it needed a generator, and
  the contract chosen was `MatrixOutput` gaining a **`controls`** input. That
  is the honest destination: a sketch has no transport, but it does have
  fixtures, and blackout and dimming are exactly what a Show Status panel
  offers. The bundle is not a value there — it carries a toggle and a delta —
  so an output keeps a latch (`applyLedControls` /
  `composeLedOutputRuntime` in `state/ledOutputRuntime.ts`, mirrored by
  `ledOutputLatchCpp`), and the three ports combine (ANDed, multiplied) rather
  than overriding one another. `PlayerControls` gained its first emit case in a
  normal sketch to build the bundle from ordinary wires, and
  `tftTouchServiceCpp` gained a *sink* so the panel's hit geometry stays
  resolved once whether the press lands on a player transport or in a bundle.
  Validation now asks whether a chain reaches something the selected generator
  can act on (`controlChainSinks`) rather than whether the generator can sample
  touch at all; an unwired touch panel is still valid as a read-only display.
  Deliberately still open, and out of this slice: a panel cannot *read back*
  the latch it just changed, so a Show Status screen shows OUTPUT OFF while the
  fixture is lit unless something else is wired to its `outputEnabled` input.
  Closing that means either an output publishing its resolved runtime — which
  would give a sink an output and drop it from both terminal registries, the
  trap this file warns about twice — or the synchronized-control `set` contract
  frozen for Phase 6/7. It belongs with the latter.
- [ ] Add calibration/rotation handling for touch and persist the exact module's
  calibration only where it is stable. Provide a generated touch self-test.
  Calibration properties, clamping, all four rotations, and the generated
  Diagnostics layout are implemented. Diagnostics paints colour swatches and
  panel geometry on every TFT, and reports live mounted X/Y coordinates on an
  XPT2046 module in both normal and player sketches even when Controls is not
  wired. It also reports the raw ADC pair needed to derive the four calibration
  edges rather than hiding those samples behind the configured mapping.
  Bench-derived per-module calibration values remain.
- [x] Bake colour pattern thumbnails/art into flash with explicit size limits;
  optionally place large assets on the existing SD capability only through an
  explicit storage policy. The fixed 96×96 RGB565 path is complete:
  (`TRANSPORT_ARTWORK_BYTES`, `MAX_TRANSPORT_ARTWORKS`,
  `transportArtworkBudgetIssue`, `_tftArt`). `TransportDisplay` reads the
  player-owned `patternSelect` metadata, `bakeTransportArtworks.ts` evaluates
  each collected pattern once at a fixed tick and downsamples it in the browser,
  and `transportArtworkCpp.ts` emits the finished big-endian bytes into one
  indexed PROGMEM table. Preview caches and draws those same RGB565 bytes;
  firmware changes the picture when the active index changes. The eight-image
  / 144 KB ceiling is validated before upload and included in capacity builds.
  There is still deliberately no live `image` port: that signal carries
  `ImageData`, not a baked collection asset. Larger SD-backed assets remain a
  separate, explicit future storage policy rather than an automatic fallback.
- [ ] Verify TFT + SD card + touch on the same SPI host, audio playback, LED
  refresh, cold boot, reconnect/upload, and one-hour interaction soak.

### Phase 6 — custom UI document and editor

- [x] Add a discriminated workspace view (`graph` or `display`) while keeping
  signal `graphData` and declarative `displayDocuments` separate. Reuse the
  existing enter/exit gesture, breadcrumbs, fit-view request, and per-document
  undo expectations without pretending widgets are React Flow nodes.
  `uiStore` now carries a session-only `DesignWorkspaceView` discriminant and
  `App` swaps the React Flow canvas for `DisplayEditor` without moving document
  data into UI state. The editor shares the fit request, returns through a
  Graph breadcrumb or Escape, and suppresses graph-only clipboard shortcuts.
  Undo/redo stacks are now stashed per display id and rebased when restored, so
  a step in one display cannot alter another display or the parked graph. The
  outer `Display` hardware node now creates its document and opens it from its
  node body or a double-click.
- [x] Define and version `DisplayDocument` and `DisplayWidget` schemas. At
  minimum store display/module id, resolution/orientation, grid, theme,
  widgets, stable ids, integer bounds, type, validated properties and validated
  asset lookup ids. Theme owns the one screen background; widgets occupy the
  non-overlapping layer above it.
  `src/state/displayDocument.ts` freezes schema version 1, the 13 launch widget
  identities, the single background/theme contract and bounded declarative
  values. Its normalizer rejects unknown schema/widget types, unsafe ids and
  nested property data before any future preview or emitter can read them.
- [x] Build `DISPLAY_WIDGET_LIBRARY` entries with label, direction, port type,
  stable port-role definitions, defaults, minimum visual and touch size,
  allowed display classes, preview renderer, LVGL emitter, property inspector
  metadata, state styling, asset slots and validation. Launch entries are Text,
  Numeric Readout, Timecode, Progress, Value Meter, Status Indicator, Colour
  Swatch, Pattern Browser, Image/Icon, Button, Toggle, Slider and Dial.
  The declarative registry contract is now in `src/state/displayRegistry.ts`:
  all 13 launch entries own their role-based ports, defaults, geometry limits,
  adapter identities, inspector metadata, supported states, asset slots and
  property validation. Workspace normalization reads that metadata instead of
  maintaining a second property-key table. The DOM preview dispatch now covers
  every adapter identity, the editor builds its property controls from the
  registry metadata, and the shared theme resolver supplies its state styling.
  The emitter identities are the registry contract; their LVGL implementations
  remain Phase 7 work.
- [x] Implement add, select, multi-select, drag, keyboard nudge, resize, snap,
  align/distribute, duplicate, delete, copy/paste, undo/redo, zoom/fit, and
  non-overlap collision feedback. Prioritise add/select/drag/resize/snap and
  undo before multi-select/alignment/copy workflows.
  The editor now adds all 13 registry widgets; supports additive multi-select,
  bounded group drag, grid and one-pixel keyboard nudge, resize, six-way align,
  horizontal/vertical distribution, duplicate, delete, cut/copy/paste,
  zoom/fit, and overlap plus registry validation. Pointer and keyboard actions
  use the same pure document transforms, and pasted widgets receive fresh
  stable ids. Document commits flow through the workspace undo slice and its
  per-document history scopes.
- [x] Make every editor action keyboard reachable and announce widget type,
  bounds, port direction/type, selection, and validation errors.
  Palette actions, bounds/properties, select-all, additive selection, nudge,
  duplicate, cut/copy/paste and delete are keyboard reachable; selection
  changes announce type, integer bounds and role-based port contracts through
  a polite live region. Numeric bounds are the keyboard resize equivalent.
  Validation changes now use a persistent polite live region, invalid widgets
  reference their issue text directly, and selection announcements include the
  selected widget's validation state alongside its type, integer bounds and
  role-based port contract.
- [x] Auto-mint/remove dynamic ports on the outer `Display` node. Removing a
  wired widget requires confirmation and removes its edges atomically. Changing
  a widget to a different port type is create-new/delete-old, not an in-place
  type mutation. Port ids derive from widget id plus registry role (`value`,
  `out`, `set`, and later `x`/`y`), never label or array position.
  `displayDocumentPorts` derives ordered typed inputs/outputs from the registry,
  and the graph store synchronizes those onto the root-scoped hardware node.
  Label and position edits retain cables; removed roles and incompatible type
  changes prune only their affected edges in the same undoable transaction.
  The editor confirms before deleting or cutting wired widgets, and duplicating
  a custom-display node clones its document under a fresh display id.
- [x] Add a read-only “run” preview mode that accepts pointer/touch input and a
  design mode that never fires graph actions accidentally.
  The display workspace now has a session-only Design/Run switch. Run hides
  editing chrome, selection, grid, resize and collision affordances while
  Button, Toggle, Slider and Dial use isolated local preview values with
  pointer capture and keyboard equivalents. Switching modes never writes the
  document, and Design routes the same surface only to selection and geometry
  gestures. Publishing those preview values to graph evaluation remains with
  the Phase 7 runtime store rather than smuggling runtime state into the
  declarative document.
- [x] Use a shared widget theme/token model for DOM preview and LVGL codegen.
  Pixel-perfect parity is not required, but bounds, text wrapping, state,
  values, and interaction semantics are. Include default, pressed, active,
  inactive and disabled states, plus solid/gradient/baked-image backgrounds.
  `src/state/displayTheme.ts` now resolves the persisted theme into renderer-
  neutral background, typography and five-state widget tokens with deterministic
  colour blends suitable for both CSS and emitted LVGL. The DOM editor consumes
  those tokens for widget surfaces, borders, indicators, tracks, thumbs and
  pressed offsets; Run mode selects pressed/active/inactive state from the same
  interaction semantics. Text wrapping, alignment, font choice, size and line
  limit are resolved once, while baked-image backgrounds retain a safe surface
  fallback until the validated asset registry can supply their pixels.
- [x] Add a validated asset registry/import boundary for the external design
  pack. Registry entries expose stable id, kind, dimensions, tintability,
  source format, allowed display classes and estimated flash cost. Cover the
  canonical semantic glyphs, all launch/follow-on palette thumbnails, theme
  tokens, supported-size backgrounds, themed player controls and starter-
  template previews; source working-folder paths must never enter a workspace.
  `scripts/import-display-assets.py` is the boundary, the sibling of the part
  importer: it reads the pack's own manifests, refuses a path that escapes the
  pack root or names a file that is not there, derives each glyph's dimensions
  from its viewBox, and copies the vector masters and theme tokens under
  `public/display-assets/` — all 393 assets across the six categories.
  `src/state/displayAssets.ts` wraps the generated catalogue, and
  `normalizeDisplayAssetId` is the only way an id enters a document, so widget
  slots and the theme background both drop a working-folder path, a URL or a
  retired id rather than persisting a reference nothing can draw. Flash cost is
  priced at the size a widget actually draws at, since a vector master is
  rasterised at bake time. The inspector offers what is installed instead of a
  free-text id, and the Image/Icon preview draws the real asset, tinting a
  tintable glyph through its alpha the way the baker will. Only vectors and
  tokens are imported: the pack's PNG rasters are regenerable, and a screen
  bakes only the sizes, tints and states it uses. The pack stays out of the PWA
  precache like the node cards and board renders.
- [x] Enforce touch-first geometry per target rather than only visual minimums:
  approximately 48×48 px primary targets and 6–8 px separation on the 320×240
  reference screen, with Slider hit regions wider than their visible tracks.
  New and resized controls enforce the greater of each registry entry's visual
  and touch minimum. `DISPLAY_TOUCH_SEPARATION_PX` now states the finger gap
  once: `displayWidgetsTooClose` compares hit regions rather than paint, new
  widgets are placed clear of it, and a pair that comes closer reports a
  `separation` issue distinct from an overlap. Only touch targets take part —
  derived from the registry's touch minimum, so a caption may still sit against
  a button. `displayControlHitBounds` is the one statement of a control's
  pointer region: the drawn bounds grown symmetrically to that minimum, which
  Run mode applies as an extended click area around the painted control the way
  LVGL will, leaving a slider's hit region far taller than the
  `DISPLAY_CONTROL_TRACK_PX` track it paints.
- [x] Add declarative templates for Now Playing, Minimal Transport, Pattern
  Deck, LED Performance, Audio Reactor, Diagnostics and DMX Monitor. Templates
  insert ordinary widgets and mint ordinary visible ports; they do not gain
  private runtime behaviour.
  `src/state/displayTemplates.ts` holds the seven as bounds and property
  overrides only, and `applyDisplayTemplate` appends them through the same id
  minting, bounds constraint and registry defaults a hand-placed widget uses —
  so a placed template is indistinguishable from a hand-built screen and undo
  reverses it in one step. Each is authored on the 320×240 reference and tested
  to land there with no layout issue, including the touch separation rule, while
  a smaller document clamps them. None uses Image/Icon: that widget cannot
  validate until the asset registry exists, and a template must not arrive
  holding an error.
- [x] Show graph-type-coloured input/output notches in Design mode so direction
  and type remain legible; hide editor-only notches in Run mode and firmware.
  Each role now renders as an edge-aligned `IN`/`OUT` badge carrying its graph
  data type and the same colour as graph handles. The badges are editor-only
  DOM affordances: Run mode renders its separate widget surface without them,
  and they are not part of the declarative document consumed by firmware.

### Phase 7 — custom UI runtime and LVGL codegen

- [x] Add a display runtime store keyed by `displayId/widgetId` for touch values,
  graph-driven values by stable role, dirty state, touch ownership and preview
  diagnostics. Keep per-frame reads imperative so React does not rerender the
  entire app at animation rate.
  `src/state/displayRuntimeStore.ts` holds all five per widget under nested
  display/widget maps. Unlike the hardware-input and TransportDisplay touch
  stores it is written every evaluated frame, so value writes mutate in place
  and never call `set`; only a diagnostic change bumps `diagnosticsVersion`, the
  one thing React chrome subscribes to. `takeDirtyDisplayWidgets` hands a
  renderer what changed and clears it in the same pass, and a repeated write of
  an unchanged value re-dirties nothing. Run mode is now its first writer: the
  preview keeps no second copy of a control's value, marks a held gesture as
  touch-owned and releases on pointer-up, and resets the display's runtime when
  the mode or the open display changes.
- [x] Add an evaluator case for the dynamic `Display` node that publishes input
  widget values and returns sampled output roles using the ordering contract
  above; do not assume one value per widget.
  The case needs no document: a minted port id is widget id plus registry role,
  and `parseDisplayWidgetPortId` reads it back, so the evaluator walks the
  node's own ports in both directions and a widget owning several roles is
  ordinary. Wired inputs publish into the runtime store for the panel to draw
  after this pass; outputs carry the touch value sampled before it, resting at
  the port type's own value — false for a latch, zero for a ranged control —
  until a finger moves it. A disabled screen publishes nothing and reports only
  those rest values. The screen is deliberately not a hot root: seeding the hot
  set from its minted ports would put its whole upstream closure on the 60 fps
  path to publish values nothing draws yet, so it publishes on ~8 fps publish
  frames until a panel renderer reads `roleValues`. Touch is unaffected — a
  widget output wired to a real terminal is pulled by that terminal. Restore the
  hot root together with that renderer.
- [x] Reject instantaneous graph cycles through one Display node, or add a
  visible `Delay` requirement; do not rely on evaluator recursion guards to
  define user-facing behaviour by accident. The sole implicit exception is a
  registry-declared synchronized control's paired `out → graph → set` loop,
  whose one-tick ordering is part of that widget contract and tested directly.
  Satisfied by defining the behaviour rather than refusing the shape, because
  rejection would refuse this plan's own flagship template: Now Playing's
  buttons drive a player whose title and elapsed time come back to its own text,
  which is a loop through one screen and is not an `out → set` pair. The
  exception is not special after all — a screen's outputs are a pure function of
  touch sampled *before* the pass and depend on no input, so the evaluator
  memoizes them before resolving a single input. Every loop through one screen,
  or closing through a second, then carries the finger's value instead of the
  `{}` the recursion guard hands back, and the guard no longer decides anything
  a user can see. Tests assert the discriminating values (a wired 0.5 comes back
  as 0.75, not the unwired default's 0.25) and fail without the memoization. No
  `Delay` node exists, so that alternative was never on the table.
- [x] Generate deterministic LVGL object setup, styles, event callbacks, bounded
  value buffers, role-based bindings, and change-only updates from
  `DisplayDocument`.
  `src/codegen/customDisplayLvglCpp.ts` is the document-to-LVGL 9 boundary. It
  creates widgets in persisted order using array indices rather than authored
  ids, resolves the same theme tokens as the DOM preview, attaches one bounded
  callback runtime to Button, Toggle, Slider and Dial, and maps stable `value`
  / `set` roles into cached text, integer, boolean and colour updates. All text
  passes through the shared 64-byte display budget and C++ literal allow-list;
  generated code contains no Arduino `String` or per-frame object creation.
  Pattern Browser and Image/Icon deliberately keep placeholders until the
  later asset-baking item supplies their PROGMEM data. The emitter remains
  behind the existing upload validation gate until the next timing, pinned
  dependency/configuration and panel-driver slices make an LVGL sketch
  buildable rather than merely syntactically emitted.
- [x] Configure LVGL tick/handler timing from monotonic milliseconds so LED
  animation remains wall-clock driven and high-refresh displays cannot speed it
  up.
  The LVGL emitter registers a `millis()` callback with `lv_tick_set_cb` and
  services `lv_timer_handler` through a wrap-safe five-millisecond gate. It
  never calls `lv_tick_inc` from the LED loop, so neither strip length nor
  display refresh rate can become an accidental second animation clock.
- [x] Pin LVGL and panel/touch dependencies and generate a minimal `lv_conf.h`
  or build-define set that includes only used widgets, fonts, colour depth, and
  heap features.
  Both helper engines now select LVGL 9.5.0 exactly and write the same
  `lv_conf.h`: RGB565, the fixed 64 KiB built-in heap, Montserrat 14, and only
  Label, Bar, LED, Button, Switch, Slider and Arc. The ST7789V and XPT2046
  adapters stay inline, so there is no panel/touch library version to float.
- [x] Emit static images/fonts into PROGMEM and validate asset size before
  generation. No widget label, asset name, or imported text may become an
  unsanitised C++ identifier or literal. Bake only used glyph sizes, tints and
  states from vector/token sources; template preview screenshots are never
  firmware assets.
  `customDisplayResources.ts` now derives the exact background, Image/Icon and
  control-icon rasterizations a document paints, folding equal id/size/tint
  uses while keeping different variants separate. `bakeCustomDisplayAssets.ts`
  fetches only validated site-relative catalogue URLs, rasterizes vectors at
  their final size, and packs A8, RGB565 or RGB565+A8 bytes before synchronous
  code generation. The 512 KiB pre-generation ceiling, exact byte-length check,
  supported background size and editor-only category checks fail with named
  diagnostics instead of producing a partial screen. `customDisplayAssetsCpp.ts`
  emits aligned indexed PROGMEM tables and LVGL 9 descriptors; only the
  codegen-owned display stem and array index enter identifiers, while all
  authored text still passes through `displayString`/`cppStringLiteral`.
  The LVGL emitter selects the nearest pinned Montserrat bitmap size per text
  widget, records only sizes actually used, and the helper specializes
  `lv_conf.h` from that allow-listed marker so unused font tables stay out of
  flash. Backgrounds, tinted masks, full-colour transparent art and optional
  Button/Toggle icons now consume those baked descriptors; template preview
  screenshots have no route into the bake.
- [x] Implement synchronized Toggle/Slider/Dial as a bounded two-role contract:
  `out` carries touch intent and optional `set` carries graph-authoritative
  state. The finger owns the value while pressed; the wired graph value wins
  again on release. An unwired `set` leaves the control locally owned.
  Browser runtime and generated LVGL now share that ordering. A pending-intent
  bit preserves a fast press/release until one graph sample, so a touch cannot
  vanish merely because it landed between evaluator frames; after that sample,
  a type-compatible wired `set` becomes visible and is republished on `out`.
  Without `set`, the last local Toggle/Slider/Dial value remains authoritative.
- [x] Support arbitrary scalar/control wiring in normal sketches.
  The normal-sketch half is done; show/player remain refused (next). Until now
  a wired custom Display could not build at all — `cppGenerator.ts` had no
  `case 'Display'`, `TERMINAL_NODE_TYPES` could not name it (its ports are
  minted per document, not declared in `NODE_LIBRARY`), and validation
  unconditionally refused every generator. A normal sketch compiles the whole
  graph the same way the browser preview evaluates it, so it needed no new IR:
  the case resolves each wired widget role to an ordinary C++ expression by
  dataType (float/bool/string/color; `patternselect` stays unresolved — no
  PatternSlideshow can exist in a normal-sketch graph, so there is nothing to
  read), and publishes each widget output as an ordinary declared `n_<id>_<port>`
  node output, so a Button or Slider reaches an LED output's Enabled/Brightness
  input, another widget, or any future node type through the same generic
  wiring every other node already uses — no per-consumer special case. That
  needed one latent bug fixed first: `n_<id>_<port>` interpolated a port id
  raw, which is safe for every ordinary node's fixed alphanumeric ports but not
  for a widget's `widget:id:role` port id; all eight sites now run it through
  the existing `safeId()` sanitizer, which was already exactly the right
  transform. `case 'Display'` also makes the node an unconditional codegen
  root (not gated behind `TERMINAL_NODE_TYPES`, unlike the evaluator's
  deliberately-absent hot-root treatment of the same node — codegen runs once,
  not sixty times a second, so there is no cost to it always emitting a
  configured screen).
  `src/codegen/customDisplayPanelCpp.ts` is the physical half
  `customDisplayLvglCpp.ts` deliberately stops short of: an LVGL 9
  `lv_display_t` flush callback and (on a touch-capable module) an `lv_indev_t`
  read callback driving the ST7789/ST7789V panel over SPI. It does not reuse
  `tftDisplayCpp.ts`'s `TftPanel` — that is a cached-field renderer for the
  fixed transport layouts with no notion of flushing an arbitrary pixel
  buffer — but copies the same datasheet-verified ST7789 register sequence
  rather than re-deriving it, so the two drivers cannot quietly disagree about
  what a working panel needs. Touch is not re-implemented at all: the indev
  callback is a thin wrapper around `tftTouchCpp.ts`'s existing `_xptPoint`,
  emitted once regardless of how many touch-capable panels (a TransportDisplay
  and a custom Display) sample it. `lv_init()` is emitted exactly once, before
  any other LVGL call, immediately ahead of `setupLines` — the one point every
  custom Display's object/panel setup is known to land, regardless of topo
  order or how many exist.
  The document itself is not on the node (only its ports and pin properties
  are), so `generateCpp`'s new `displayDocuments` option threads it in keyed by
  displayId, the same way `artworks` threads in Now Playing artwork; both
  upload call sites (`MatrixOutputDeployPopup.tsx`, `CapacityWatcher.tsx`) now
  pass the documents and finished image bytes through `useCustomDisplayAssets`.
  That shared preparation hook subscribes to document-only edits and trust,
  deduplicates in-flight/successful bakes per immutable document, and discards
  late results from older edits. Upload, export, code view and capacity checks
  wait for preparation; missing documents, invalid resources and failed decodes
  block generation with named diagnostics. Retry refreshes both build consumers.
  SVG masters decode at their catalogue dimensions before rasterization, and
  `generateCpp` emits their validated PROGMEM tables alongside the references.
  Regression tests cover trust changes, stale completion, retry, document-only
  edits and actual asset tables in the measured sketch.
  `validateGraph.ts`'s blanket refusal is now scoped to `show`/`player`
  generators only, which is the "then" half of this item and remains
  unimplemented — neither has a compiled graph (the show has no music at all
  and the player runs a fixed template around the file it holds) to resolve
  widget wiring against.
  Verified end-to-end, not just per-module: a real `generateCpp()` call with a
  wired Toggle/Text document produces `lv_init()` before any object/display
  creation, the Text widget reading a real upstream string variable, the
  Toggle's output becoming `bool n_screen_widget_toggle_out = ...` and that
  variable then gating an LED output's blackout fill — i.e. a widget output
  driving real graph logic, which is what this item asked for.
- [ ] Embed the shared control-graph IR in generative-show and SD-player firmware
  so custom touch widgets can drive real graph logic rather than only hardcoded
  transport actions. Normal-sketch support above does not complete this path.
- [x] Block unsupported generator bindings with an actionable diagnostic until
  the corresponding control-graph path exists. Generated shows already refuse
  displays because that generator cannot draw them; normal sketches now refuse
  a wired XPT2046 Controls output they cannot sample, and SD-player builds
  refuse incomplete chains that never reach Music Player. Read-only panels stay
  valid. The same messages appear in deploy validation and live Graph Health.

### Phase 8 — tests, documentation, and release evidence

- [ ] Add focused registry/default/property tests and update node-card/help
  generation for every graph-visible display/control node.
- [ ] Add evaluator parity tests for formatted text, fixed layouts, widget
  role outputs, synchronized-control ownership/release, update ordering,
  group/string propagation, and cycle handling.
- [ ] Add C++ generator tests for normal, generative-show, SD-player, diagnostic,
  and stream-receiver paths, including “configured display is not omitted”.
- [ ] Add workspace migration/import/export/orphan/undo tests for display
  documents, role-derived ports, asset ids and wired-widget deletion.
- [ ] Add hardware workbench tests for exact module identity, root-scoped edits,
  repeated displays, part layout, pin retargeting, shared-bus rules, and delete.
- [ ] Add backend tests for optional dependency fetch/stage/cache recovery and
  pinned versions.
- [ ] Add visual snapshots for each fixed layout and custom widget state at every
  supported resolution/orientation, including pressed/active/disabled states,
  every launch theme token and each template. Visual snapshots complement, not
  replace, semantic tests.
- [ ] Run `npm run lint`, `npm test`, and `npm run build`; compile representative
  generated sketches through both supported build engines.
- [ ] Add the user workflow to the hardware workbench guide and display-node
  reference pages. Describe unsupported devices as unsupported, not generic.
- [ ] Add support-matrix rows only after recorded physical tests for the exact
  board, module, bus, generator, and interaction combination.

## Likely repository touch points

| Area | Existing files to extend | Expected new modules |
| --- | --- | --- |
| Node/types | `src/types/index.ts`, `src/state/nodeLibrary.ts`, `src/state/graphStore.ts`, `src/state/graphEvaluator.ts` | `src/state/displayTypes.ts`, `src/state/displayRegistry.ts`, `src/state/displayRuntimeStore.ts` |
| Hardware model | `src/state/hardware.ts`, `src/state/partCatalogue.ts`, `src/state/partOptions.ts`, `src/state/partFields.ts`, `src/components/Hardware/HardwarePane.tsx` | display part/default-pin helpers and imported catalogue assets |
| Persistence | `src/state/workspacePersistence.ts`, project/share/import call sites in `src/state/` and `src/utils/` | `src/state/displayDocument.ts` with schema normalization/validation |
| Graph UI | `src/components/Canvas/StudioNode.tsx`, `src/components/Canvas/NodeGraphCanvas.tsx`, graph navigation/breadcrumb components | `src/components/DisplayEditor/` and fixed display node bodies |
| Runtime bridges | `src/state/playerTransport.ts`, `src/state/showPlayback.ts`, `src/state/hardwareInputStore.ts` | transport/display bridge state and pure layout/format helpers |
| Firmware | `src/codegen/cppGenerator.ts`, `src/codegen/showGenerator.ts`, `src/codegen/playerSketchGenerator.ts`, diagnostic/stream generators | `src/codegen/display/` adapters, control-graph IR, fixed-layout and LVGL emitters |
| Validation | `src/utils/validateGraph.ts`, `src/build/hardwareManifest.ts`, capacity/hardware validation modules | shared I²C/SPI topology and display capacity estimators |
| Build helper | `backend/app.py`, `backend/tests/` | pinned optional-library definitions/fetch tests |
| Documentation | `docs/NAVIGATOR.md`, `docs/user/hardware-workbench.md`, `docs/release/beta-support-matrix.md` | display design note and help/reference content |

Keep new tests beside their domains. In particular, generator coverage belongs
under `src/codegen/__tests__/`, state/evaluator/persistence coverage under
`src/state/__tests__/`, UI coverage under the adjacent component
`__tests__/`, and build-helper coverage under `backend/tests/`.

## Cross-cutting acceptance criteria

- Old projects load unchanged; new projects retain exact display module,
  placement, pins, layout, widgets, and cables after save/reload/export/import.
- A display remains visible/configurable in the hardware pane while any pattern
  group is being edited.
- Preview and firmware use the same numeric formatting, glyphs, truncation,
  widget bounds, input clamps, button edges, port roles, synchronized-control
  ownership, pattern index, and time source.
- Design-mode port notches, selection handles and collision feedback never
  become persisted screen content or generated firmware objects.
- A synchronized control cannot report stale local state after its wired
  authoritative value changes; touch ownership is temporary and ends on
  release.
- Launch templates are ordinary validated documents assembled from registered
  widgets and gain no hidden transport, player or graph behaviour.
- Adding a display cannot silently change LED wiring, master brightness, audio
  volume, pattern order, or selected board.
- Pin/address/bus conflicts are detected before upload with a repair-oriented
  message.
- Display work is scheduled independently of LED animation time; disabling or
  disconnecting a display restores negligible runtime overhead.
- Every supported generator either emits the display and its bindings or blocks
  with a clear diagnostic.
- No imported display document executes code, bypasses workspace trust, performs
  I/O on mount, or interpolates unvalidated text into generated C++.
- Capacity estimates include display costs and physical compile results remain
  the source of truth.

## Explicitly deferred

- Multiple custom UI screens and navigation stacks.
- Overlapping/free-z-order widgets and freeform vector drawing.
- Charts, waveform/spectrum histories, animated marquees, XY Pad, Launch Pad,
  Choice Strip, Step Control, Colour Picker and Arc Gauge until the launch
  palette and one-screen runtime meet their performance gates.
- Arbitrary LVGL properties, custom callbacks, embedded C/C++, or JavaScript.
- On-device keyboard/text entry.
- Video playback on TFTs or using a TFT as another LED output.
- Importing/exporting SquareLine project files.
- Remote/network UI, web servers, or phone dashboards.
- E-paper and large RGB/HDMI display families.

## Research references

- [LVGL integration overview](https://docs.lvgl.io/master/integration/overview.html)
- [LVGL display model](https://docs.lvgl.io/master/main-modules/display/overview.html)
- [LVGL events](https://docs.lvgl.io/master/common-widget-features/events.html)
- [SquareLine Studio development/export workflow](https://docs.squareline.io/docs/1.5.3/introduction/typical_dev/)
- [U8g2 supported display setup list](https://github.com/olikraus/u8g2/wiki/u8g2setupcpp)
- [LovyanGFX supported controller/device overview](https://github.com/lovyan03/LovyanGFX/blob/master/README.md)
