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

Slices B–D are real deliverables. Slice E must not block them and should only
start after a fixed TFT has passed compile, preview-parity, performance, and
physical-hardware tests.

## Decisions to preserve

- A display is one physical component with two views, following
  [`hardware-nodes.md`](docs/development/design/hardware-nodes.md): the hardware
  workbench owns its existence, exact module, pins, and wiring; the graph owns
  its live inputs and outputs.
- All display parts live in the root graph and use `rootGraphNodes` /
  `rootGraphEdges` for reads and root-scoped writes.
- Fixed display nodes have stable, declared ports. Only the freeform `Display`
  node has widget-derived dynamic ports.
- Custom UI widget ids, not editable labels or array positions, are persisted as
  port ids. Renaming or moving a widget must never break a cable.
- The first custom UI is one fixed-resolution screen with integer pixel
  geometry, snapping, minimum sizes, and no overlap. Responsive layouts,
  arbitrary scripts, and user-authored C++ are not v1 features.
- Touch state is sampled before graph evaluation; graph-to-widget values are
  applied afterward. A feedback cable from a display output back to an input on
  the same display is either rejected or explicitly defined as a one-tick delay.
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
| 4 | SSD1306 128×64 I²C OLED (0.96-inch) | `InfoDisplay` | I²C | Same layouts through the same 1-bit surface contract, once the module arrives |
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
- [x] Add a `TransportControl` bridge for play/pause, previous, next, seek,
  volume, and pattern selection plus title, elapsed, duration, playing, pattern
  name/index/count, and volume status outputs.
- [x] Bind `TransportControl` to `playerTransport` / show preview in the browser
  and to explicit controller state in generative-show and SD-player firmware.
- [x] Reconcile roadmap hardware controls with the current model: runtime volume
  now belongs to `Amplifier`, not `SDCard`. Do not move the static maximum back
  to storage; route live volume through the transport/audio runtime.
- [ ] Add explicit runtime inputs for LED-output enabled/blackout, brightness,
  and master speed. Master speed must scale the one shared time value in preview
  and every firmware generator rather than rewriting individual node speeds.
- [x] Define button semantics once: a Button widget is `true` while pressed;
  transport/control sinks detect a rising edge where a one-shot action is
  required. Toggle widgets hold a boolean state.

### Fixed nodes

- [ ] `SegmentDisplay` consumes `value: float`, `enabled: bool`, and optionally
  `dateTime: datetime`. Its formatting mode and exact module are properties.
- [ ] `InfoDisplay` consumes stable typed ports for its selected fixed layout;
  do not add/remove ports when a label changes.
- [ ] `TransportDisplay` consumes the transport/status contract. A touch module
  invokes the same transport runtime used by `TransportControl`; it does not
  invent a second player implementation.
- [ ] Each fixed node has a compact browser preview body that shows what the
  physical screen will render at its real aspect ratio.

### Freeform `Display` node

The node owns `displayId` and derives its graph ports from widgets in the
corresponding persisted `DisplayDocument`.

Initial widget palette:

| Widget | Direction | Port type | v1 semantics |
| --- | --- | --- | --- |
| Label | graph → display | `string` | One or two lines, fixed font/size/alignment |
| Numeric readout | graph → display | `float` | Precision, prefix/suffix, min/max formatting |
| Progress bar | graph → display | `float` | Clamped 0–1 value |
| Status light | graph → display | `bool` | Off/on colours and optional text |
| Colour swatch | graph → display | `color` | Solid colour preview |
| Static image | none | none | Validated, size-limited, baked asset |
| Button | display → graph | `bool` | True while pressed |
| Toggle | display → graph | `bool` | Persistent on/off value |
| Slider | display → graph | `float` | Min/max/step and initial value |
| Knob | display → graph | `float` | Rotary form of Slider; same value contract |

Defer charts, arbitrary text input/keyboards, dropdowns, multi-screen
navigation, animations, bidirectional controls, containers, and custom event
scripts until the one-screen typed-port model is proven.

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

Derive an outer port id from the stable widget id (for example
`widget:<id>:value`). The document does not store cables, live values, selected
widgets, hover state, or physical pins.

## Implementation checklist

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
- [ ] Extend the hardware workbench add menu, true-scale part rendering,
  settings inspector, remove/show-node actions, layout persistence, and tests.
- [x] Add display node types to the hardware-managed signal set and hardware
  library-hidden set. Ensure add/edit/delete operations always target root.
- [ ] Prevent display parts from being grouped or saved into reusable patterns;
  derive this from hardware ownership where possible instead of maintaining a
  second drifting exclusion list.
- [ ] Add I²C/SPI fields to `PART_FIELDS`, exact-board default-pin assignment,
  board retargeting, GPIO requirements, and generated wiring manifests.
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
  Missing data must load as an empty registry for old workspaces.
- [ ] Validate imported documents and assets with hard limits. Widget metadata
  is declarative and must never be treated as executable code or raw C++.

### Phase 2 — runtime and code-generation foundation

- [ ] Create a registry-driven display layer (`DISPLAY_PARTS`, fixed-layout
  definitions, driver capability metadata, and later `DISPLAY_WIDGET_LIBRARY`)
  so preview, validation, help, and codegen read one inventory.
- [x] Add display nodes as evaluation terminals. A display must update even when
  it is not upstream of an LED output; do not rely on the current
  `reachableFromOutputs` walk alone.
- [ ] Split mixed source/sink display handling into deterministic stages:
  sample touch outputs, evaluate the control/frame graph, publish display
  inputs, then flush changed widgets/pixels.
- [ ] Build a small control-graph IR for float/bool/string/status paths. Reuse
  it from normal sketch, generative-show, and SD-player generators instead of
  copy/pasting display-specific graph evaluation into each generator.
- [ ] Add shared display setup/loop/global helpers alongside the existing LED,
  HUB75, audio, and RTC helpers. Keep panel/touch configuration out of node
  emit cases.
- [ ] Extend the helper's lazy optional-library staging with include markers,
  pinned fetches, cache recovery, clear error messages, and both fbuild and
  Arduino CLI coverage.
- [ ] Update `THIRD_PARTY_NOTICES.md` and desktop dependency notices for every
  shipped driver/runtime library.
- [ ] Update firmware RAM estimation for OLED buffers, TFT/LVGL draw buffers,
  widget heap, fonts, images, and thumbnails. The actual compile-capacity check
  remains authoritative.
- [ ] Add validation errors when a selected action/generator cannot represent a
  display. Never generate a successful sketch that simply leaves the part dark.

### Phase 3 — `SegmentDisplay`

- [x] Implement TM1637 first: defaults, properties, node body, evaluator,
  deterministic formatter, firmware setup/update, brightness, colon/decimal,
  blank/error/overflow states, and help text.
- [x] Send updates only when the rendered digits change or a bounded refresh
  interval expires; do not rewrite the module on every LED frame.
- [x] Add MAX7219 behind the same logical node contract after TM1637 passes,
  keeping controller-specific wiring and digit capacity in the part adapter.
- [ ] Test negative values, rounding, leading zero, decimal placement, NaN,
  overflow, clock rollover, disabled state, low brightness, and multiple
  segment displays.
- [ ] Compile on every board family advertised for the part and record at least
  one physical support row before marking it supported.

### Phase 4 — `InfoDisplay` and pattern browser

- [x] Implement SH1106 128×64 first, then SSD1306 through the same 1-bit
  surface contract. The SH1106 carries 132×64 of controller RAM behind a
  128×64 panel, so its 2-column offset belongs in the contract rather than
  being fixed up per device — driving one as the other shifts the image two
  pixels and wraps rubbish down the edge, which reads as a wiring fault.
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
- [ ] Add the Pattern Browser layout once the runtime pattern-selection
  contract and baked thumbnails below exist. It was held back deliberately:
  shipping it before those would mean a layout that previews and cannot be
  generated.
- [x] Add dirty-region/value checks or a bounded refresh rate so I²C display
  traffic does not stall LED rendering.
- [ ] Implement a runtime pattern-selection contract shared by encoder input,
  OLED browser, generative show, and SD player. Define wrapping, confirmation,
  active-vs-highlighted selection, and behaviour when the collection changes.
- [ ] Bake Pattern Collection thumbnails during export/codegen:
  - evaluate each group at a deterministic representative tick and dimensions;
  - downsample/dither to the target 1-bit thumbnail size with one shared helper;
  - store bytes in PROGMEM, not RAM;
  - cap count and total flash cost, with a clear validation message;
  - show the same baked result in the browser preview.
- [ ] Test title truncation, empty collection, one/many patterns, encoder wrap,
  I²C address settings, OLED+RTC bus sharing, and thumbnail flash estimates.

### Phase 5 — fixed `TransportDisplay`

- [ ] Establish a panel adapter with ST7789 240×240 SPI, partial draw buffers,
  rotation, colour order, backlight, and deterministic refresh scheduling.
- [ ] Implement the fixed Now Playing and Show Status layouts without touch.
- [ ] Add the ST7789V 320×240 module and its XPT2046 touch as the first
      interactive target.
  Display and touch may share SPI data/clock lines but use separate CS and
  transactions.
- [ ] Route fixed transport actions and status through `TransportControl` so
  browser preview, generated normal sketches, generative shows, and SD players
  agree on edge handling, seek limits, volume, and pattern selection.
- [ ] Add calibration/rotation handling for touch and persist the exact module's
  calibration only where it is stable. Provide a generated touch self-test.
- [ ] Bake colour pattern thumbnails/art into flash with explicit size limits;
  optionally place large assets on the existing SD capability only through an
  explicit storage policy.
- [ ] Verify TFT + SD card + touch on the same SPI host, audio playback, LED
  refresh, cold boot, reconnect/upload, and one-hour interaction soak.

### Phase 6 — custom UI document and editor

- [ ] Add a discriminated workspace view (`graph` or `display`) while keeping
  signal `graphData` and declarative `displayDocuments` separate. Reuse the
  existing enter/exit gesture, breadcrumbs, fit-view request, and per-document
  undo expectations without pretending widgets are React Flow nodes.
- [ ] Define and version `DisplayDocument` and `DisplayWidget` schemas. At
  minimum store display/module id, resolution/orientation, grid, theme,
  widgets, stable ids, integer bounds, type, and validated properties.
- [ ] Build `DISPLAY_WIDGET_LIBRARY` entries with label, direction, port type,
  defaults, minimum size, allowed display classes, preview renderer, LVGL
  emitter, property inspector metadata, and validation.
- [ ] Implement add, select, multi-select, drag, keyboard nudge, resize, snap,
  align/distribute, duplicate, delete, copy/paste, undo/redo, zoom/fit, and
  non-overlap collision feedback.
- [ ] Make every editor action keyboard reachable and announce widget type,
  bounds, port direction/type, selection, and validation errors.
- [ ] Auto-mint/remove dynamic ports on the outer `Display` node. Removing a
  wired widget requires confirmation and removes its edges atomically. Changing
  a widget to a different port type is create-new/delete-old, not an in-place
  type mutation.
- [ ] Add a read-only “run” preview mode that accepts pointer/touch input and a
  design mode that never fires graph actions accidentally.
- [ ] Use a shared widget theme/token model for DOM preview and LVGL codegen.
  Pixel-perfect parity is not required, but bounds, text wrapping, state,
  values, and interaction semantics are.

### Phase 7 — custom UI runtime and LVGL codegen

- [ ] Add a display runtime store keyed by `displayId/widgetId` for touch values,
  graph-driven values, dirty state, and preview diagnostics. Keep per-frame
  reads imperative so React does not rerender the entire app at animation rate.
- [ ] Add an evaluator case for the dynamic `Display` node that publishes input
  widget values and returns sampled output widget values using the ordering
  contract above.
- [ ] Reject instantaneous graph cycles through one Display node, or add a
  visible `Delay` requirement; do not rely on evaluator recursion guards to
  define user-facing behaviour by accident.
- [ ] Generate deterministic LVGL object setup, styles, event callbacks, bounded
  value buffers, and change-only updates from `DisplayDocument`.
- [ ] Configure LVGL tick/handler timing from monotonic milliseconds so LED
  animation remains wall-clock driven and high-refresh displays cannot speed it
  up.
- [ ] Pin LVGL and panel/touch dependencies and generate a minimal `lv_conf.h`
  or build-define set that includes only used widgets, fonts, colour depth, and
  heap features.
- [ ] Emit static images/fonts into PROGMEM and validate asset size before
  generation. No widget label, asset name, or imported text may become an
  unsanitised C++ identifier or literal.
- [ ] Support arbitrary scalar/control wiring in normal sketches first. Then
  embed the shared control-graph IR in generative-show and SD-player firmware so
  touch can drive real graph logic rather than only hardcoded transport actions.
- [ ] Block unsupported show-mode bindings with an actionable diagnostic until
  the corresponding control-graph path exists.

### Phase 8 — tests, documentation, and release evidence

- [ ] Add focused registry/default/property tests and update node-card/help
  generation for every graph-visible display/control node.
- [ ] Add evaluator parity tests for formatted text, fixed layouts, widget
  outputs, update ordering, group/string propagation, and cycle handling.
- [ ] Add C++ generator tests for normal, generative-show, SD-player, diagnostic,
  and stream-receiver paths, including “configured display is not omitted”.
- [ ] Add workspace migration/import/export/orphan/undo tests for display
  documents and widget-derived ports.
- [ ] Add hardware workbench tests for exact module identity, root-scoped edits,
  repeated displays, part layout, pin retargeting, shared-bus rules, and delete.
- [ ] Add backend tests for optional dependency fetch/stage/cache recovery and
  pinned versions.
- [ ] Add visual snapshots for each fixed layout and custom widget state at every
  supported resolution/orientation. Visual snapshots complement, not replace,
  semantic tests.
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
  widget bounds, input clamps, button edges, pattern index, and time source.
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
