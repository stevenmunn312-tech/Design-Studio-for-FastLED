# Fixed displays

Registering a display, the display envelope and who owns a panel, baked pattern
pictures, the colour TFT driver and its transports, and the golden tests that
freeze fixed layouts.

Moved out of the always-loaded `CLAUDE.md` so a session reads it only when
working in this area; record new patterns for this area here, not there. History
of the entries before the move: `git log -p -- CLAUDE.md`.

## Registering a display

- **Displays: registration points.** A new auxiliary display touches more
  registries than a normal node, and missing one fails quietly. Hand-written, so
  register it in each: `hardware.ts` (both ownership sets), `partOptions.ts`
  (the exact module), `nodeLibrary.ts` `GPIO_PIN_PROPERTIES`, `busTopology.ts`
  `BUS_ASSIGNMENTS`, `hardwareManifest.ts` `collectPinUses`, `pinRetarget.ts`
  `PART_PIN_PLANS`, `HardwarePane.tsx` `FIXTURE_PARTS`, `playerDisplays.ts`
  (`playerDisplaysFromGraph`'s per-type branch, for both template sketches — the
  SD player and the show controller). Missing `PART_PIN_PLANS` costs twice: the
  part keeps the pins of the board being left, and it never enters `claimed`, so
  parts that do retarget are handed its pins on top of it.
  `src/state/__tests__/hardwareRegistries.test.ts` holds these in step so an
  omission fails there rather than on a bench. Everything else is derived and
  needs no row — the Build Diagram's part list and render table,
  `cppGenerator.ts` `DISPLAY_TERMINAL_NODE_TYPES`, and `graphEvaluator.ts`
  `HOT_NODE_TYPES`, the last two from one rule (workbench-owned, carries signal,
  no outputs) so a display becomes a codegen *and* an evaluation terminal at
  once. Prefer deriving a registry over adding a row to it; each of those was
  forgotten at least once first. Controller quirks (an SH1106's column offset, a
  module's digit count) belong on a controller descriptor, and layout geometry,
  glyph tables and pad positions come from the shared modules and the part
  catalogue rather than being restated. A bus role cannot always be read from
  the property name — the same pin is exclusive on one controller and a shared
  bus line on another — so `collectPinUses` attaches the resolved `bus` to the
  pin use and `findPinCollisions` prefers it. One node can also cover two *transports*:
  the Info Display's SH1106 now spans both — 7-pin SPI (`sh1106-oled-128x64`)
  and 4-pin I²C (`sh1106-oled-128x64-i2c`, same SH1106G silicon and 2-column RAM
  offset, different bus) — and its SSD1306 is 4-pin I²C too, so the node carries
  both headers and every registry above asks `oledTransportForProps` which one
  is real — reserving the SPI set for a two-wire module holds five pins nothing
  drives and denies them to the next part. Transport is derived from the
  catalogue entry's declared interface (`oledTransportFor`), never listed a
  second time — adding the SH1106 I²C variant needed only a new
  `PART_OPTIONS`/catalogue entry, no registry code changes, which is the
  derive-don't-list design paying off even when the same controller spans both
  transports. Generated firmware starts exactly one `Wire`, so a build whose I²C
  parts name different SDA/SCL pins is refused in validation and a board change
  puts an I²C display on the board's own I²C bus rather than on free GPIO. A
  generated sketch's `#include <Wire.h>` follows the driver, not the transport:
  `infoDisplayCpp.ts`'s `OledPanel` carries both transports and branches on
  `p.transport` at runtime, so its Wire calls compile even in an SPI-only build,
  and `cppGenerator.ts`'s `needsWireHeader` / `playerSketchGenerator.ts`'s
  `i2cIncludeCpp` gate the include on any `InfoDisplay` being present rather
  than on an I²C part existing — `needsWire` still separately gates
  `Wire.begin`, since a build with no I²C device has no pins to start a bus
  with. `src/codegen/__tests__/emittedIncludes.test.ts` derives this rule rather
  than listing headers. See
  [auxiliary displays](../design/auxiliary-displays.md). Three generators pick a
  graph by `sdShowConnected` (`src/utils/showUpload.ts`) tested before
  `isPatternShow`, and all three draw displays: `cppGenerator.ts` (normal
  sketch) emits one from the node walk, while `playerSketchGenerator.ts` (SD
  player) and `showGenerator.ts` (pattern show) are fixed templates that resolve
  a display's ports through the one walk in `playerDisplays.ts`. What separates
  the two templates is only the expression table they hand it — the player
  answers for the track it is holding, the show has no music at all and passes
  `SHOW_DISPLAY_EXPRESSIONS`, which is empty on purpose so every song wire is
  reported unresolved rather than filled with a plausible zero. What the show
  does know it supplies without a wire: `showPatternIndex` and `PATTERN_COUNT`
  feed a Show Status panel, and its rotation goes through `_selSetActive` on the
  one `_sel_show` cursor so a Pattern Browser and the pixels cannot disagree.
  That cursor is emitted for every *consumer* — a Pattern Browser, a Show Status
  panel, baked artwork — and for anything that *commands* it, which is why
  `showSelectionCpp` lives in the generator rather than in the display half: a
  headless three-button build has no display half and still needs one.
  `showControlTargets` names the Pattern Slideshow itself as a control
  destination beside the LED outputs it renders (the first latches blackout and
  dimming, the second takes pattern intent), the loop applies that bundle
  through `_selUpdate` before rendering, and the renderer reads `cur` back out
  of the cursor — confirming has to change the pixels, not only what a panel
  says. Confirm-on-any-non-zero-step mirrors the evaluator's slideshow rule
  rather than restating it. Fixed touch routing and generator limits are defined
  in [auxiliary displays](../design/auxiliary-displays.md); `selectedGenerator`
  in `validateGraph.ts` has to name the generator a graph would *actually* build
  with — a Show Engine writing to a card builds the player sketch, and the same
  graph without a card builds an ordinary one. `infoDisplayCpp.ts`'s
  `infoDisplayLoopCpp` and its sibling helpers are shared by the first two, so a
  new `InfoDisplay` layout that emits calls (as Pattern Browser does for
  `_selUpdate`/`_oledThumb`/`THUMB_*`) needs its supporting definitions emitted
  by both — teaching only one produced a sketch calling functions that did not
  exist. Those calls are themselves stem-composed (`THUMB_COUNT_<stem>`,
  `_sel_<stem>`, `_thumbByte_<stem>`, `PATTERN_NAME_COUNT_<stem>`,
  `_patName_<stem>_read`), with the emitting and the referencing code deriving
  the stem independently, so TypeScript can't see the two disagree;
  `src/codegen/__tests__/emittedSymbols.test.ts` guards this the same
  derive-don't-list way, asserting that any such symbol the emitted sketch
  mentions, it also declares.

## Content, ownership and pattern pictures

- **Display content and ownership:** SegmentDisplay/InfoDisplay take one
  source-driven `display` envelope. Two node types publish the `player` kind —
  Music Player and Performance Generator — because both hold a file off the card
  and both build `playerSketchGenerator.ts`, so a panel says the same things
  about either; `DISPLAY_SOURCE_NODE_TYPES` is the one place that mapping lives
  and `buildMode.ts`'s `templateDisplaySourceIds` is simply the selected engine
  rather than a list of which engines have a Display output. A performance build
  pushes its show file's `patternId` through `_selSetActive` each pass, since
  the generic player's rotation — the only other writer of `_sel_player` — is
  compiled out there and the cursor would otherwise name pattern 1 for the whole
  song. See
  [collection-driven performance](../design/collection-driven-performance.md#the-generator-as-a-player).
  TransportDisplay takes only `display`/`enabled` inputs, owns all physical
  pins/rotation, and has **no outputs** — the panel/document split is gone:
  there is no `Display` node, no `customDisplay` input, and no mount edge. A
  panel's own screen design lives on the panel itself, named by its `displayId`
  property, so a design plugged into two panels or left mounted on none is
  unsayable rather than validated. Touch leaves through the separate
  `TouchInput` node (one `controls` output, an internal `panelId` link naming
  the glass it reads), created and deleted together with its panel. Music Player
  reports one envelope; Song Info unpacks its fields. Normal firmware supports
  fixed RTC Clock (including TFT); player/show templates honor their own source
  kinds. See [simple displays](../design/simple-displays.md) and
  [large displays/control routing](../design/large-displays-and-control-routing.md).
- Pattern thumbnails are baked in the browser at export, never rendered
  on-device: `src/state/patternThumbnail.ts` owns what a thumbnail *is* (32x32 =
  exactly four OLED pages, page-major bit-0-at-top matching `OledSurface`, Rec.
  709 luminance, ordered 4x4 Bayer dither, and the
  `MAX_THUMBNAILS`/`thumbnailBudgetIssue` flash budget), and
  `src/utils/bakePatternThumbnails.ts` owns rendering a pattern group through
  `evaluateGraph` at the fixed `THUMBNAIL_TICK_SEC` and 2x supersample to get
  it. The firmware only blits finished bytes, so there is deliberately no second
  dithering implementation to keep in parity — the inverse of the usual
  shared-pure-helper rule, and worth stating so one doesn't get "helpfully"
  added in C++. Ordered rather than error-diffused dither is what makes a bake
  reproducible. Trust is threaded through the bake same as evaluation elsewhere:
  `evaluateGraph` defaults to trusted, and a bake evaluates whatever a collected
  pattern contains. `src/codegen/patternThumbnailCpp.ts` emits the PROGMEM table
  once per collection, not per sketch, with an identifier-stemmed name
  (`THUMB_COUNT_<stem>` etc.) — two Pattern Browsers can be showing different
  collections, and one shared table would quietly make the second browser draw
  the first one's pictures. Pattern *names* are a second table on that same stem
  (`patternNameTableCpp`, `PATTERN_NAME_COUNT_<stem>`/`_patName_<stem>_read`),
  fed by `src/utils/patternNames.ts` rather than by the bake, because a name
  evaluates nothing: it needs no trust decision and no flash budget, so a
  TFT-only Show Status that pictures nothing still names what it plays and an
  over-budget collection keeps its names. Do not fold them back into one table.
  The per-graph bake stays out of the generators themselves for the same reason:
  they are text emitters with no way to know whether the workspace is trusted,
  so `src/utils/browserThumbnails.ts` finds every Pattern Browser — every
  `InfoDisplay` whose `display` wire comes from a pattern-rotating source, not a
  property — bakes its collection, and hands the finished bytes in through
  `opts.thumbnails`. A *normal* sketch can never contain one, because a browser
  is the Slideshow's screen and a Slideshow builds the show controller, so
  `generateCpp` emits neither table nor cursor and takes no `thumbnails` option
  at all. Both upload callers do this bake — `MatrixOutputDeployPopup.tsx` and
  `CapacityWatcher.tsx` — each threading `useGraphStore.getState().trusted`;
  `CapacityWatcher` needs it too because thumbnails are flash and that component
  is what measures flash. The firmware's "NO PATTERNS" message is gated on the
  pattern *name* count (`PATTERN_NAME_COUNT_<stem>`), not the thumbnail count,
  so it is said only by a browser wired to nothing or to an empty collection,
  which is what it means; a collection over its flash budget (or one nobody
  trusted) still has its names in flash and lists them, drawing the shared
  `_oledThumbMissing` empty frame in place of a picture rather than reporting no
  patterns at all. `browserThumbnailIssues` in `browserThumbnails.ts` still
  flags the over-budget/untrusted case before upload so the missing pictures are
  explained rather than silent: it derives that case from the wired pattern *count*,
  not from running the bake (which cannot run ahead of a trust decision and can
  only skip), so `validateGraph.ts`'s `findDisplayGeneratorIssues` can name the
  browser and the byte cost without evaluating anything. For live preview, the
  `InfoDisplay` evaluator resolves the selection out of its `display` envelope,
  bakes only the highlighted group through the same fixed tick/converter, and
  caches it against the group node/edge identities plus trust; evaluator reset
  clears that cache so offline renders start cold. `InfoDisplayNodeBody` only
  paints the evaluated page-major `OledSurface` at the panel's true aspect
  ratio; it does not rebake or reinterpret the layout in React.

## Colour TFT

- Colour TFT (ST7789/ST7789V) support exists as pure modules mirroring the OLED
  family — `src/state/tftSurface.ts` (surface primitives),
  `src/state/transportDisplay.ts` (Waiting/Clock/Now Playing/Fixed
  Transport/Show Status layouts), `src/codegen/tftDisplayCpp.ts` (driver) — and
  `TransportDisplay` is wired end to end: evaluator case in `graphEvaluator.ts`,
  emit cases in both sketch generators, resolved player displays, controller
  lookup, and RAM validation. Artwork is player-owned baked data rather than a
  live `image` input: the collection and active index arrive inside the
  `display` envelope's `player` arm, which carries
  `selection: PatternSelectValue | null` beside the `SongInfo` (`SongInfo` has
  neither a pattern name nor a collection identity, so a one-wire Now Playing
  panel had nothing to caption artwork with — the player owns both readings and
  publishes them together, so `artworkPlayer` follows the one `display` edge
  rather than guessing among metadata ports);
  `src/utils/bakeTransportArtworks.ts` evaluates at a fixed tick and packs 96x96
  big-endian RGB565; `src/utils/transportArtworks.ts` finds each panel/player
  route and enforces the eight-artwork flash budget;
  `src/codegen/transportArtworkCpp.ts` emits an indexed PROGMEM table; the
  preview caches and draws the same converted bytes. It publishes a
  `playercontrols` bundle for XPT2046 touch; terminal discovery therefore
  derives from input-bearing output-category nodes as well as ordinary
  output-less sinks, so an interactive display remains hot and remains a codegen
  root. `src/state/transportTouch.ts` owns calibration, rotation and hit
  regions; player firmware samples the separately routable touch header through
  `src/codegen/tftTouchCpp.ts`. The browser node body writes mounted pixel
  coordinates to the transient `transportDisplayTouchStore`, and the evaluator
  applies those same hit regions so pointer preview and firmware do not invent
  separate controls. Fixed Transport exposes finger-sized Previous, Play/Pause
  and Next buttons plus Volume; Now Playing exposes play/pause and volume. Show
  Status is read-only (`transportTouchRegions` returns `[]` for it, as for
  `Waiting`) — it shrank to what a Slideshow actually carries (pattern
  name/index/count, highlight, browsing), and the LED toggle/brightness it used
  to draw had no Slideshow source, so that control moved to `TouchInput`, whose
  `controls` output can wire an LED output's Controls input directly. Validate
  the resolved layout and its actual destination: the fixed-control check names
  the touch actions the layout resolves to and where the chain actually ends,
  rather than the Show Status blackout it no longer draws. A panel with a
  mounted screen design has no fixed layout to sample, so it is judged
  separately from the fixed-layout branches below. Its widgets publish from the
  document on their own Touch ports, and the template-stamped ones
  (`controlRole`) also fill the Touch node's Controls bundle through
  `src/state/designControlBundle.ts`, the one mapping the evaluator, all three
  generators and validation read. A Toggle presses on a finger's gesture count,
  never its value, because Set feedback moves the value too; see
  [large displays](../design/large-displays-and-control-routing.md).
  `tftControllerFor` must match the longest controller name first (`ST7789V`
  starts with `ST7789`). Descriptors state native-portrait geometry only;
  rotation is a node property, and `tftWindowOrigin` derives each rotation's RAM
  offset. Which silicon drives a panel and how large the glass itself is are two
  different facts: `tftControllerForProps` in `nodeLibrary.ts` resolves the base
  descriptor by controller name, then overrides its width/height from the part
  catalogue's own `resolutionPx` whenever that disagrees with the chip-name
  default, rather than baking one panel size per chip and forcing every module
  on that chip to share it — the same relationship the OLED's `columnOffset`
  expresses for narrower glass windowed into wider RAM (e.g. a 240x240 module
  built on ST7789V silicon that otherwise defaults to a 240x320 touch panel's
  dimensions). Module pad geometry in `MODULE_PAD_GEOMETRY`
  (`physicalDiagramLayout.ts`) must be re-measured against the part's actual
  render whenever a catalogue asset is re-imported with a different pinout — a
  stale pad table silently mislabels wires on the Build Diagram even after the
  catalogue and firmware sides are fixed. `displayPartCoverage.test.ts` derives
  its cases from `catalogueDisplays()` rather than a part-id list, so a display
  imported later fails until it has geometry, a part-menu entry (or a named
  `CATALOGUE_ONLY` exemption, as both catalogued ILI9341 modules still have) and
  pads found by its own silkscreen. A catalogue part id names the *module
  design*, not what arrived in the post: `st7789v-xpt2046-touch-240x320` is both
  the CYD's integrated panel, which has a working digitiser, and a standalone
  AliExpress module sold as touch that came with no digitiser fitted at all. So
  `displayHasTouch` answers for the catalogued design and cannot be read as a
  claim about a particular unit — a build for a module like that emits touch
  code its hardware will never answer, which looks identical to a calibration
  fault. A panel's controller and its transport are independent axes: the
  DFRobot SPI breakout and the Duinotech XC4630 parallel shield are both ILI9341
  silicon — `tftControllerFor` resolves either to the one `ILI9341` descriptor
  in `tftSurface.ts` — but share no wiring. `tftTransportFor` derives the bus
  from the catalogue's declared `interface` string rather than a part-id list,
  so a re-import needs no code change; it searches for the word "parallel"
  instead of matching `oledTransportFor`'s leading token, because "8-bit
  parallel" leads with the bus width and a leading-token match would aim
  four-wire SPI writes at eight data lines, and anything else defaults to SPI as
  the safer wrong answer. The ILI9341 descriptor is the first that doesn't share
  the ST7789 shape: `colorOrder: 'BGR'` and `invert: false` are exactly the two
  fields that yield a plausible-but-wrong picture rather than a dark one, and
  `invert`'s value came from the datasheet power-on state, not a bench run. The
  XC4630 is out of `CATALOGUE_ONLY` (only `ili9341-xpt2046-touch-320x240`
  remains there): its touch panel has no controller and reads four of the
  panel's own LCD lines as electrodes, and `tftTouchCpp.ts`'s `_resPoint` does
  that read without a second pin claim (see the parallel-transport bullet
  below). **A panel's touch is resolved per generator, and every generator that
  can draw a parallel panel has to resolve it as a sheet.**
  `tftTouchServiceCpp`/`tftTouchSetupCpp` have always branched on
  `TftTouchEmit.resistive`, so the trap is upstream of them, in the walk that
  populates it: `cppGenerator.ts` did and `playerDisplays.ts` did not, so an
  SD-player build with an XC4630 compiled an XPT2046 on `touchCsPin` and friends
  — properties a bare sheet has no reason to carry, so they fell back to the
  library defaults 15/2/18/23/19, which on a parallel shield are the panel's own
  register-select and data lines, an I2S word clock and (on an S3) USB D-. It
  read nothing, drove pins the graph never claimed, and no pin check could see
  it, because those pins are invented at emit time rather than declared. Both
  walks now derive the electrodes from
  `tftTransportForProps(props) === 'parallel'` and `PARALLEL_TOUCH_ELECTRODES`,
  and `RESISTIVE_TOUCH_CPP_HELPERS` is appended after `TFT_TOUCH_CPP_HELPERS`
  (never instead of it — `_resPoint` calls `_touchMap`, which lives in that
  block). `resistiveTouch.test.ts` runs one parallel-panel graph through both
  generators and derives the expected pins from the electrode map, so teaching
  only one fails there. Which pad a signal lands on is derived twice over, never
  listed: the positional fallback order is chosen by the catalogued interface's
  transport (an I2C OLED read the SPI order and drew SDA on the CS pad), and a
  line printed with another name resolves through `PART_PIN_PROPERTY_ALIASES` —
  Adafruit's breakout prints CLK/DATA on the two lines it answers I2C on. The
  panel has no device-side framebuffer (240x320 is 153 KB): browser dirty
  rectangles and firmware field caches deliberately differ. The background
  paints once at setup. This driver needs `#include <SPI.h>` in normal sketches;
  the player already has one for SD.
- The colour TFT driver's two transports (SPI and 8-bit parallel) sit behind one
  bus abstraction in `tftDisplayCpp.ts`: `_tftTxnBegin`, `_tftTxnEnd` and
  `_tftWrite8` are the only functions permitted to name `SPI.*`. Every writer
  above them — `_tftCommand`, `_tftCommandData`, `_tftRun`, and the PROGMEM
  artwork blitter `_tftArt` — reduces to the same
  open/command-byte-DC-low/data-bytes-DC-high/close shape and calls through
  those three; a writer that names SPI directly still compiles and still works
  on every SPI panel, failing only (and silently) on a parallel one.
  `src/codegen/__tests__/tftBusTransport.test.ts` derives this rule from the
  emitted C++ text — it attributes each line to its enclosing function and flags
  any `SPI.transfer`/`beginTransaction`/`endTransaction` outside the three
  primitives — rather than hand-listing writers, plus an inverse check that all
  four writers do call `_tftWrite8` so the rule can't pass by matching nothing.
  `_tftBegin` picks the transport from a `dataPins` argument (`nullptr` default,
  so every existing SPI emitter is unchanged); a parallel panel also skips
  `SPI.begin`, which would otherwise claim an SCK/MOSI it never uses. Hardware
  facts encoded there rather than re-derivable from the datasheet: WR pulses low
  then high because the controller latches on the rising edge; RD must be driven
  high and left there, since floating/low lets the controller drive the data
  lines back and every write collides with its own output — this presents as a
  dead panel, not a bus fault; data lines idle low and WR idles high so the
  first strobe is a real edge.
- A parallel colour panel's own module declares its wiring, and a bare resistive
  touch sheet on it borrows four of those same lines rather than claiming a
  second set. `TFT_TRANSPORT_PINS.parallel` (`tftSurface.ts`) is the thirteen
  lines a parallel shield actually has — csPin, dcPin, resetPin, wrPin, rdPin,
  d0Pin..d7Pin, no clock, no MISO, no touch header — mirroring
  `OLED_TRANSPORT_PINS`; `dcPin` carries what the shield silkscreens LCD_RS
  (register select and data/command are the same signal), so
  `PART_PIN_PROPERTY_ALIASES` in `partCatalogue.ts` resolves it to that label
  rather than adding a second property, and gained matching entries for
  LCD_CS/LCD_RST/wrPin/rdPin/d0Pin..d7Pin.
  `transportDisplayPinKeysForProps`/`tftTransportForProps` in `nodeLibrary.ts`
  branch on the module's declared interface to answer which pins a given panel
  actually shows, and the `isPropertyEnabled` gate for `TransportDisplay` is now
  derived from that same map (`TFT_PIN_PROPERTIES`) rather than the hand-listed
  SPI/touch groups it used to read — the old list let the new parallel keys fall
  past the gate and show as editable on every SPI panel, caught by
  `displayNodeRegistration.test.ts`, which asserts a module's editable pins
  equal the pins it claims. `PARALLEL_TOUCH_ELECTRODES` (xp=d0Pin, ym=d1Pin,
  yp=csPin, xm=dcPin) is how the bare sheet reads without a second pin claim:
  Touch declares no pins of its own here, exactly as it already doesn't for an
  XPT2046 whose lines live on the panel, so `findPinCollisions` needs no
  teaching. `gpioRequirementForProperty` asks those four for `analogInput` only
  when the panel's transport is parallel (csPin/dcPin stay `digitalOutput` on
  SPI) — the binding half of a pair, since every analog-capable pin on these
  parts is also an output — and asking for it is what keeps touch off ADC2
  without a new rule: `assignPartPins` already orders pins carrying an
  applicable caveat last, and the ESP32-S3's ADC2 caveat is exactly that
  `analogRead` may fail while Wi-Fi is active. `TransportDisplay.dcPin`'s
  default moved from 16 to 9 for this reason (16 is ADC2); `InfoDisplay.dcPin`
  stays 16, since it has no parallel transport to conflict with. The read
  itself, `tftTouchCpp.ts`'s `_resPoint`/`_resRelease`, has one load-bearing
  rule: all four pins are LCD lines the frame drives as outputs the rest of the
  time, so every exit — including the early return below the pressure threshold
  (`TOUCH_Z_MIN`) — must call `_resRelease` before returning, or the next panel
  write goes out on a pin still configured as an input and, because this panel
  keeps no framebuffer, the corrupted write stays on the glass until that field
  happens to change on its own; `resistiveTouch.test.ts` derives the check by
  splitting the emitted function on every `return` rather than counting known
  branches. `_touchMap`, extracted from `_xptPoint`, is the one place raw counts
  become rotated screen pixels, shared by both readers so the reversed-axis/span
  handling can't drift between a digitiser chip and a bare sheet. The read is
  not yet wired into any generator's emit path or a part-menu entry — see the
  XC4630/`CATALOGUE_ONLY` note above.

## Layout invariants and golden tests

- A fixed display layout is frozen with golden-vector tests the same way the VU
  meter's cross-language twin is (see
  [audio levels](player-shows-and-controls.md#audio-levels)), extended from one
  renderer to the whole catalogue: `src/state/__tests__/displaySurfaceCases.ts`
  enumerates every catalogued panel geometry x fixed layout x reading —
  including the at-rest reading a disabled panel draws — as one list derived
  from the controller/rotation tables rather than hand-listed, so a new module
  joins the sweep on its own and a new layout fails to compile until every
  reading is supplied. Two consumers read that one list rather than each
  declaring its own: `displaySurfaceGolden.test.ts` records a digest per case
  (size, distinct-colour count, ink coverage, and a hash) instead of a bare
  hash, because a layout that stops drawing and one that shifted a pixel both
  fail a hash check identically, and only the coverage number tells them apart;
  `npm run gen:display-sheets` (`scripts/generate-display-sheets.ts`/`.mjs`)
  rasterises the same cases into a PNG contact sheet per geometry at the panel's
  true pixel size, labelled in the panel's own bitmap font, written to the
  gitignored `artifacts/` tree, because a committed picture is a second
  authority a hash mismatch can't argue with. `displayThemeGolden.test.ts`
  applies the same discipline to themes: it freezes every launch theme across
  every widget state as resolved *tokens* rather than a rendered widget, since
  the DOM preview and the LVGL emitter both read exactly those token numbers,
  and records the text/surface contrast per state alongside the values so a
  state that's technically distinct but illegible still fails.
- Two display-generator invariants keep a panel from reporting something its
  data doesn't support. `showStatusStateText` (`src/state/transportDisplay.ts`)
  takes the pattern count, not just `browsing`, and returns empty rather than
  BROWSING/PLAYING when the count is zero — mirroring `showStatusOrdinalText`'s
  existing refusal to show "1/0" for an empty collection — and
  `tftDisplayCpp.ts`'s `showStatusLoop` emits the identical
  `count <= 0 ? "" : ...` guard into firmware so the preview and the generated
  sketch cannot disagree. Separately, `transportWaitingGeometry`'s waiting
  message is the one fixed-text field allowed to pick its own type scale
  (`waitingMessageScale`, floored at `bodyScale`): every other TransportDisplay
  field truncates because its content is a stranger's title with no scale that
  fits everything, but WAITING's string is fixed and known ahead of time, so
  sizing it to fit is correct where sizing an artist name to fit would hide real
  overflow.
