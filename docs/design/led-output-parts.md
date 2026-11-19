# LED output parts: opening `MatrixOutput` to downloaded parts

Status: **built** (work-breakdown steps 1 to 6, 2026-11-19) · Owner: app · Date: 2026-11-19

The [downloadable parts plan](../plans/downloadable-parts.md) opened 39 of 40
part types; this note opened the last. The LED output (`MatrixOutput`, "LED
output" in user copy) was the one left closed, and LED products are the family users will ask for most:
strips of every density and chipset, rings, matrices, panels, HUB75. This note
proposes how an LED output takes a part. The save format closes at v1.0.0, so
the decision is needed before then. Pre-1.0 clean breaks are allowed
([CLAUDE.md](../../CLAUDE.md)).

## 1. Current state

- **No part on the node.** `MatrixOutput` carries no `partId`. What it is
  comes from properties: `form` (`strip | matrix | ring | corkscrew | hub75`,
  `src/state/output/ledOutputForm.ts`), `ledCount`, `width`, `height`,
  `serpentine`, `layout`, `startCorner`, `firstRun`, `tilesX/Y`, `chipset`,
  `colorOrder`, ring and corkscrew geometry, and the `positions*` and
  `network*` arrangements (`src/state/nodeLibrary.ts`, property schema near
  line 857).
- **Readers of those properties** (about 25 non-test files read `chipset` or
  `outputForm`): the evaluator and preview (`outputGridDims`,
  `outputCanvasDims`), codegen (`src/codegen/output/ledHardwareCpp.ts`,
  `cppGenerator.ts`, and the show, player, stream and wiring-test sketches),
  power (`src/build/power/ledDraw.ts` maps chipset to volts and mA per LED;
  `controllerSettings.ts` `ledSupplyVolts` picks 12 V for WS2811 and WS2815),
  the Build Diagram and manifest (`buildMatrixOutputItem` in
  `hardwareManifest.ts`), bench drawing (`useBenchParts.ts`, `ledPitchMm`,
  `ringDiameterMm`), the Hardware tab inspector (`HardwarePartBody.tsx`, a
  read-only summary with "Edit on the Graph"), the deploy popup and setup
  wizard, and Graph Health (`validateGraph.ts`, `hardwareValidation.ts`).
- **The shelf** offers five form entries, hand-written in `LED_OUTPUT_ENTRIES`
  (`hardwarePartCatalog.ts`), with default sizes. Choosing one adds a node.
- **The catalogue has eight LED parts** with a top-level `ledLayout`
  (`form`, `count`, `width`, `height`, `diameterMm`, `pitchMm`): HUB75 64x64
  P4, WS2812B matrix 16x16, WS2812B rings of 8, 12, 16, 24 and 60, and a
  WS2812B strip rendered as a 6-LED, 60 LEDs/m sample. `ledLayout` has **no
  chipset, colour order, voltage, current or wiring order**. Its only reader is
  `catalogueRings`, which feeds `ringDiameterMm` (diameter by LED count,
  interpolated). Nothing reads a part's matrix size or pitch; `ledPitchMm` is
  a constant (10 mm, HUB75 4 mm).
- **Two accessories** are in the catalogue under `MatrixOutput`: the NLED pixel
  data extender pair (a `pixelDataExtender` block: distance, rate, supply,
  conductors) and the 74AHCT125 (picture and size only). The extender is
  selected by the string property `dataLink` (`Direct | NLED Pixel Data
  Extender`) and found by the constant `NLED_PIXEL_DATA_EXTENDER_PART_ID`
  (`pixelDataExtender.ts`). The level shifter is not selected at all: one chip
  is implied per four outputs (`buildExports.ts`; `PhysicalAssemblyDiagram.tsx`
  imports its render), and its pin geometry is code in
  `physicalDiagramLayout.ts`.
- `partTypes.ts` marks the type `downloadable: false`, and
  `downloadableTypes.test.ts` fails at the option-row check for every LED part
  because no node resolves one.

## 2. Proposed model

**One part type, one new block.** `MatrixOutput` becomes open with
`deviceField: 'chipset'` and `devices` = the app's existing chipset list
(`CHIPSET_OPTIONS`). A chipset is code (a FastLED template argument, sanitised
before C++), so a new chipset is a part-type change and an app release; a new
product on a known chipset is data. The top-level `ledLayout` is removed and
replaced by a `ledOutput` block in `PART_BLOCK_SPECS`.

| Field | Meaning | Today |
| --- | --- | --- |
| `form` | `strip`, `matrix`, `ring`, `hub75` | `ledLayout.form` |
| `chipset` | one of `devices`; `HUB75` implied for `hub75` | node property |
| `colorOrder` | order the product ships in | node property |
| `supplyVolts` | 5 or 12 (a value the power plan supports) | `ledSupplyVolts(chipset)` |
| `fullWhiteMa` | max current per LED at full white, at `supplyVolts` (datasheet maximum, not typical) | `ledFullWhiteDraw(chipset)` |
| `pitchMm` | LED spacing; a strip's LEDs per metre is `1000 / pitchMm` | constants |
| `count` | fixed LED count (rings, sticks) | `ledLayout.count` |
| `maxCount`, `cutEvery` | cuttable strip: reel length and cut unit (1, or 3 for 12 V segments) | none |
| `width`, `height` | fixed grid (matrices, HUB75 panels) | `ledLayout` |
| `wiring` | `serpentine`, `startCorner`, `firstRun` as the product is wired | node properties |
| `diameterMm` | ring size | `ledLayout.diameterMm` |
| `maxDataRateMhz` | clocked chipsets only; caps `dataRateMhz` | `CLOCKED_DATA_RATES_MHZ` |
| `scan` | HUB75 scan factor; feeds `hub75WideScan` | node property |

Rules: the validator checks that the size fields fit the form (`count` or
`maxCount` for linear forms, `width` and `height` for grids). `pitchMm` and
`fullWhiteMa` are range-checked like every numeric field. Copy fields are plain
text. No clock, timing or library string is carried.

**Facts versus install choices.**

- *Part facts:* form, chipset, default colour order, supply voltage, current
  per LED, pitch, fixed count or maximum count and cut unit, grid size, wiring
  order, ring diameter, clock-rate ceiling, HUB75 scan.
- *Install choices (stay node properties):* `ledCount` within the part's
  bounds, `dataPin`, `clockPin`, data lanes, the data link and shifter choice,
  `outputBrightness`, gamma, `enabled`, ring and corkscrew start angle and
  direction, `tilesX/Y`, tile serpentine and rotations, `positions*` and
  `network*` arrangements, the chosen `dataRateMhz`, and a `colorOrder`
  correction (batches differ in order).

**Cut-to-length strip.** The part says `pitchMm`, `maxCount` (for example 300
for a 5 m reel at 60/m) and `cutEvery`. The node's `ledCount` is clamped to
`[cutEvery, maxCount]` and to a multiple of `cutEvery`. The UI shows the length
beside the count (metres from `ledCount * pitchMm`) and edits either way. A
fixed-count part (ring, 144-LED stick) locks `ledCount`. The existing sample
strip's 6-LED picture becomes a render note, not a count.

**Corkscrew and the positions and network layouts are arrangements, not
products.** They stay node properties over a `strip` part (a corkscrew is a
strip wound on a cylinder), so the picker offers strip parts when `form` is
corkscrew.

## 3. How the node picks its part

A new optional `partId` property on `MatrixOutput`, first in the "Output
Geometry" group (`nodeLibrary.ts`, group list near line 4424). Empty means
**Custom**: exactly today's node, with its own form, chipset and size editable.
Choosing a part **stamps** the part facts into the node's existing properties
(`form`, `chipset`, `colorOrder`, `width`, `height`, `serpentine`,
`startCorner`, `firstRun`, `ledCount` bounds), and `isPropertyEnabled` locks
the part-owned ones while `partId` is set (`colorOrder` and `ledCount` stay
editable within limits). "Make custom" clears `partId` and keeps the values.
Changing `form` by hand also clears it.

- **Shelf.** The LED outputs category keeps its five form entries as the
  "Custom" starting points and gains catalogue products listed by category
  (`led-strips`, `led-rings`, `led-matrices`, `led-hub75`, from the index's
  tree), so search finds "WS2815 144/m" in bundled and downloaded parts. A part
  entry calls `addLedOutput` with `partId` and the next free LED pin.
  Accessories (`led-data-links`) appear in search and apply to a selected LED
  output.
- **LED output popup (the node).** The Output Geometry group opens with a part
  picker (label, revision, verification, "Custom"). Locked fields show the
  part's value and say why.
- **Hardware tab.** The inspector's summary row gains the part label and keeps
  the rule that what the output *is* has one editor, the node. "Edit on the
  Graph" stays. The deploy popup and the setup wizard read the same properties;
  the wizard's first step becomes "Which LED product?" with Custom last.
- **Unknown or unverified part.** The node is kept and marked, and Upload is
  blocked through `unresolvedPartSummaries` and `uploadBlockReason`, as for the
  other types (plan steps 9 and 11).

## 4. Existing saves

Recommendation: **optional `partId`; no derived id; no migration.** A save
without `partId` is a Custom output and behaves exactly as today. Nothing is
renamed, so v1.0.0 keeps the same property names and the freeze is not
widened. Deriving a `partId` from properties (a 24-LED ring becomes
`ws2812b-ring-24`) is rejected: it would lock fields on strips the user cut and
wired by hand, and a real ring may differ from the modelled one.

The one clean pre-1.0 break is the extender: `dataLink` (a label string)
becomes `dataLinkPartId` (empty is Direct). The old value is read as Direct
without a note, as CLAUDE.md allows. This is experimental hardware with no
bench row.

## 5. The extender and the level shifter as parts

- **Extender.** `dataLinkPartId` names any `MatrixOutput` part carrying a
  `pixelDataExtender` block. `nledPixelDataExtenderSpec()` becomes
  `dataLinkSpec(props)`; the diagram's card growth, `buildConnectionRows` and
  the BOM read that spec and the part's pads. `pixelDataExtenderSupports` stays
  code (one-wire chipsets only, never clocked or HUB75).
- **Level shifter.** Add a `levelShifter` block: `channels`, `supplyMinV`,
  `supplyMaxV`, `inputHighMinV`, and per-channel pad labels (`in`, `out`, `oe`)
  plus `vcc` and `gnd`. The diagram stops drawing a DIP14 from constants and
  reads manifest `pads` (the audit's X1 mechanism). The choice is one property
  on the Board node (`levelShifterPartId`, default 74AHCT125), because grouping
  outputs onto chips is already board-wide (`ceil(outputs / channels)` in
  `buildExports.ts`). The render comes from the catalogue, not the static
  import.
- A shifter with a different pinout needs verified Blender assets (CLAUDE.md);
  a data-only part reusing a known pinout does not.

## 6. Firmware and preview parity

Stamping is the strategy: **the node stays the single evaluated truth.** The
evaluator, the five sketch generators, power, the diagram and Graph Health keep
reading the same properties, so a part-backed output and a hand-set Custom one
with equal properties produce identical preview frames, identical `generateCpp`
text and identical power. A `reconcileLedPart(node)` step in
`normalizeLoadedGraph` re-stamps part facts from the embedded manifest on every
load (the embedded manifest wins, per the plan), so a hand-edited save cannot
drift. New readers are limited to what had no property: per-LED current
(`ledFullWhiteDraw` takes the part value when present), pitch (`ledPitchMm`,
`ringDiameterMm`), cut bounds, the clock ceiling, and the shifter and extender
specs.

Proof: extend `downloadableTypes.test.ts` so every bundled LED part, copied
under a fresh id, yields the same preview hash, C++, power load, manifest items
and Build Diagram layout as the same output made Custom with those properties.
Generated C++ is identical by construction, so no compile is needed beyond the
one pre-release matrix.

## 7. Work breakdown

1. **Schema.** `ledOutput` and `levelShifter` blocks in `PART_BLOCK_SPECS`;
   remove `ledLayout`; move the eight parts and their overlays; register
   `deviceField: 'chipset'` and `devices`. Importer and validator tests.
2. **Resolver and stamping.** Pure `ledProduct.ts` (resolve, stamp, reconcile,
   clamp), the `partId` property, locks in `isPropertyEnabled`, load reconcile,
   unresolved-part handling.
3. **Facts into readers.** `ledFullWhiteDraw`, `ledSupplyVolts`, `ledPitchMm`,
   `ringDiameterMm`, the `dataRateMhz` ceiling, `ledCount` bounds, and
   validation messages for out-of-range or unsupported combinations.
4. **UI.** Node picker, Hardware tab row, shelf entries from the category tree,
   setup wizard first step, length editing for cuttable strips.
5. **Accessories.** `dataLinkPartId`, `dataLinkSpec`, `levelShifterPartId`,
   diagram geometry and BOM from manifest pads, remove the id constant and the
   static render import. Splits in two (extender, shifter).
6. **Open the type.** Flip `downloadable`, extend the registry-wide test,
   regenerate help ("Boards for this node" for LED products), update the
   patterns docs, README and `docs/index.md`.

Steps 1 and 2 must land before the freeze. Steps 3 to 6 can follow in any order
within phase A.

**Risks.**

- Two sources of truth if a code path writes a locked property. Mitigation: the
  reconcile on load, and a test that every locked key is in the stamped set.
- Bundled LED parts have no per-LED current or colour order on record today.
  Values must come from datasheets with `sources`, and power values err high
  ([power sizing](../development/patterns/validation-and-deploy.md)).
- New strip variants need a picture. Reuse the form's generic render until
  verified Blender assets exist.
- Matrix `tilesX/Y` composition: stamped `width` and `height` are the tile size
  times the tile count, and changing the part must keep the tile count.
- The shelf's LED category is first on a blank bench. Adding catalogue rows must
  not push the Custom entries out of sight.
- Level-shifter geometry in code is the likeliest place a hidden id branch
  remains; grep the `levelShifter*` helpers when step 5 starts.

## 8. Decisions

Steve took every recommended answer on 2026-11-19:

1. Custom stays a first-class choice beside named parts.
2. A named part's facts are locked, except `colorOrder` and `ledCount` within
   the part's bounds; "Make custom" detaches the node.
3. The level shifter is chosen on the Board node: one part for the board,
   default 74AHCT125, no "direct, no shifter" option yet.
4. Corkscrew and the positions and network arrangements are node properties
   over a strip part.
5. The chipset list is closed in the app; a part naming an unknown chipset is
   "needs a newer Design Studio".
6. Picking a part in the node's picker may change the output's form (a strip
   node given a ring part becomes a ring). The bench stays one way to set the
   form and the picker is a second (decided 2026-11-19, after step 4).

The questions as they were asked:


1. **Is Custom kept as a first-class choice?** Recommended: yes. People have
   strips with no known product, and it keeps today's saves valid.
2. **Locked or editable part facts?** Recommended: locked, except `colorOrder`
   and `ledCount` within bounds, with "Make custom" to detach.
3. **Where is the level shifter chosen?** Recommended: on the Board node, one
   part for the whole board, default 74AHCT125, with no "direct, no shifter"
   option until a bench row justifies it.
4. **Are corkscrew and the positions and network arrangements node properties
   over a strip part?** Recommended: yes, as in section 2.
5. **Is the chipset list closed in the app?** Recommended: yes. A new chipset
   is a part-type change and an app release; custom timing data would be code
   by another name.
