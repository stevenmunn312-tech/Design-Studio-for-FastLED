# Multi-output routing

The rendering strategy and its rationale are documented separately in
[per-output native rendering](per-output-native-render.md).

Each `MatrixOutput` node is an explicit hardware route. Its incoming `frame`
cable selects the frame-producing branch for that controller; the node owns the
controller's pins, chipset, color order, physical dimensions, XY layout, and
brightness. Multiple routes render in one firmware loop and are presented by
one synchronized `FastLED.show()`.

Firmware evaluates frame branches on one logical **composition canvas**. Its
size is the largest configured output dimension on each axis (including a 2×
supersampled route). Each output then maps its branch into its physical grid:

- `fit` box-filters the complete composition into the output dimensions;
- `crop` selects an output-sized, wrapping viewport from `routeX`, `routeY`.

The preview uses the same composition and mapping rules. When more than one
output exists, its Route selector chooses which physical result is displayed;
node thumbnails continue to be produced by the shared evaluation pass.

All GPIO consumers remain in one resource namespace. Graph Health and deploy
validation therefore reject reuse between outputs and between an output and
microphone, SD, button, potentiometer, or encoder pins. Layout validation runs
for every output. Power estimates sum physical LEDs and configured caps; RAM
estimates include every physical LED array plus the union of frame branches on
the shared composition canvas.

Existing projects need no migration: a single `MatrixOutput` retains its prior
dimensions, layout, preview, and generated-sketch path. Missing routing
properties default to `fit` with origin `(0, 0)`.

## Data lanes (experimental)

One LED output can be fed from several data pins without becoming several
outputs. Its chain is cut into equal **lanes**; the output keeps one `leds`
array, one render, one XY map, and its preview, RAM and power figures are
unchanged. Each lane is its own FastLED controller over a slice of that array,
`addLeds<...>(leds, offset, count)`, so FastLED sends the lanes at once where
the board's driver can (`parallelOutputs` in `src/build/ledDrivers.ts`) and one
after another where it cannot.

The contract, owned by `src/state/output/dataLanes.ts`:

- `dataLanes` is a whole number of lanes, default 1; `lanePins` lists the data
  pins of lanes 2..N in chain order, and lane 1 keeps `dataPin`.
- Lanes are equal, and a lane boundary falls on a whole row (matrix or custom
  layout), a whole panel (panels layout), or anywhere on a single chain
  (string, ring, corkscrew). `offeredDataLaneCounts` lists the counts up to
  `MAX_DATA_LANES` (8) that satisfy this; every UI and fix offers only those.
- Clockless chipsets only. A clocked (SPI) chipset would need a clock line per
  lane, and HUB75 has its own ribbon, so neither splits.
- `dataLanePlan` is what firmware drives. A request that is not offered or is
  missing a pin falls back to one pin, and `findDataLaneIssues` (deploy and
  Graph Health) blocks the build until it is fixed. A parallel mirror cannot
  be split on either side: the mirror shares one data line.
- Every requested lane pin is a pin claim (`collectPinUses`, key
  `lanePins.<i>`), so collisions, board compatibility, allocation and the pin
  pickers see it.

`fastledSetupCpp` (`src/codegen/output/ledHardwareCpp.ts`) is the one place
lanes are emitted, so the normal sketch, the multi-output routes, the show and
player generators, the stream receiver and the wiring diagnostic all get them.
Named controllers become `<name>`, `<name>_lane2`, …, and per-controller
correction, temperature and dither apply to every lane. The wiring diagnostic
adds a first step that lights each lane in turn with its first LED white.

The Build Diagram draws each lane as its own run (`buildMatrixOutputItems` in
`src/build/hardwareManifest.ts`): lane 1 keeps the output's item id, lanes 2..N
are `output:<id>:lane<k>`, each with its own data wire, level-shifter channel,
resistor and, where the output uses a data extender, its own TX/RX pair. The
current cap is split by LED count, so power totals are the fixture's own.

The **Split across pins** fix is `splitAcrossPinsFix` (pure, from a pin list)
and `splitAcrossPinsForGraph` (`src/build/pins/splitAcrossPins.ts`, from the
board's allocator). The wire-time card (`wireTimeFixes` in
`src/utils/wireTime.ts`) offers it only where the board sends more than one
output at once and the board has free output pins for every new lane; the
repair is `splitOutputAcrossPins` in the graph store. The hardware panel's
Data lanes section sets the count and assigns pins the same way.
