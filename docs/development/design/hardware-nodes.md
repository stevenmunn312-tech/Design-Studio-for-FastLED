# Hardware nodes and the two-view model

Status: implemented on `Hardware`; microphone, PCM1802 line-in, player-decoder
Audio sources, and self-growing button banks shipped · Owner: app · Updated: 2026-08-25

The current branch models each physical component once and presents it in the
views where it has meaning. The user-facing workflow is in the
[hardware workbench guide](../../user/hardware-workbench.md); this note records
the implementation contract.

## One component, two views

- The **hardware workbench** shows the selected board and every attached part.
  It owns physical existence, exact module identity, and wiring assignments.
- The **graph** shows only parts that carry signal. It owns dataflow edges and
  composition-facing properties.

Both views read and update the same root-graph node. Hardware-only nodes are not
rendered on the graph, but remain persisted graph records so validation and
generators have one source of truth.

The app always renders graph and hardware panes together, separated by a
resizable horizontal divider. The lower pane switches between **Hardware** and
**Upload** tabs. Its camera supports pan, zoom, Fit, and anchor preservation
across layout changes.

## Hardware is created from the workbench

Hardware node types are hidden from the Node Library and canvas picker. The
workbench's **Add Hardware** menu is the creation path for:

- signal inputs: INMP441 microphone, PCM1802 line-in ADC, button, button bank,
  potentiometer, encoder, PIR motion, ambient light, and RTC modules;
- workbench-only fixtures: SD Card and amplifier/DAC modules; and
- LED String, LED Matrix, LED Ring, LED Corkscrew, and HUB75 Panel outputs.

Creation targets the root graph even while the user is editing a pattern group.
The new part receives board-profile starting pins where available. GPIO
allocation respects capability, existing uses, and the selected part option.

Changing boards retargets assignments made by Studio and preserves explicit
user choices. User-selected pins are remembered by part and board so switching
away and back restores the intended wiring.

## Which parts appear in the graph

`isHardwareManagedSignalNodeType` defines the parts visible in both views:

- `MicInput`, `LineInput`, `ButtonInput`, `ButtonBank`, `PotInput`, and `EncoderInput`;
- `MotionInput` and `LightInput`;
- `RTCInput`; and
- `MatrixOutput` (the implementation type behind all five LED-output forms).

`Board`, `SDCard`, and `Amplifier` are hardware-only. They carry configuration,
not graph data.

Deleting a hardware-managed signal node on the canvas removes its signal edges
but retains the part. Removing it through the workbench deletes the root-graph
record completely. This keeps a canvas edit from silently claiming a physical
part was unplugged.

## Wiring ownership

Clicking a part opens `HardwarePartBody` in a workbench inspector. GPIO fields
use `BoardPinPicker`, which filters by required capability, distinguishes
recommended and caution pins, detects conflicts across root hardware, and
allows an explicit custom GPIO.

`ButtonBank` is the compact graph form for several independent momentary
buttons. Its final hollow output is a UI-only invitation. Connecting that
socket materializes a stable boolean output, copies the destination input's
label (for example **Play / Pause**), allocates a free board-compatible GPIO,
and exposes another empty socket in the same undoable transaction. Disconnecting
the noodle retains the row and its wiring. The graph shows the inherited name,
preview press control, and assigned GPIO; the workbench inspector owns editing
the name, pin, and per-button internal pull-up. Stable row ids keep edges intact
when labels or pins change; removing a row there also removes the noodles fed
by that output. Board retargeting tracks app-assigned and user-owned
pins per row and restores hand wiring when returning to a board.

The workbench draws automatic semantic links between the board and parts. They
confirm attachment; they are not editable graph edges and are not a complete
wiring schematic. The Build Diagram remains responsible for pin-level
connections, level shifting, power distribution, fusing, parts/connection
exports, and print sheets.

## Board ownership

There is exactly one root Board node. It selects an exact physical profile and
owns settings that generated firmware can apply only once:

- master brightness;
- global clockless-chipset overclock;
- global power cap;
- PSRAM policy/mode; and
- serial route.

Board/profile selection and the durable controller policy live with the
project. The selected USB port, build engine, toolchain/core state, and current
readiness remain desk-local deployment state.

## LED outputs

One `MatrixOutput` implementation backs five physical forms exposed separately
by **Add Hardware**. Each form has its own display label and renderer:

- LED String;
- LED Matrix;
- LED Ring;
- LED Corkscrew; and
- HUB75 Panel.

The physical form cannot be changed from the signal node. The workbench creates
the object the user owns. Responsibilities are split as follows:

- the workbench inspector owns GPIO assignments and module identity;
- the graph node owns size/count, chipset and colour order where applicable,
  frame fit/crop route, matrix/panel/custom mapping, correction, dithering, and
  supersampling; and
- the Board owns brightness, power, overclock, and memory policy.

The corkscrew form uses an unwrapped-cylinder authoring canvas whose horizontal
axis travels around the cylinder and whose vertical axis travels down its
height. LED count, turns, start angle, winding direction, diameter, and height
produce one shared preview/firmware sample map. Its physical preview draws the
same helical chain front-on with depth cues.

Every output renders in its own shape in the graph and workbench. Clicking a
workbench output also selects the route shown in the side preview. Multi-output
firmware remains one synchronized sketch for one board.

## Hardware part identity and rendering

Exact part options drive the label, pin roles, notes, thumbnail, and workbench
render. Board and part assets carry verified dimensions.

An LED part is drawn as its own emitters on bare board, never over a photograph
of itself. A string is a matrix one row high and a VU rail is one column of the
same thing, so one pitch (`WS2812B_PITCH_MM`) gives a run both its length and
its square cells, and `LED_CELL_FILL` answers where the LED sits in a cell once
for every part: the middle of it.

A photograph of real tape used to be drawn under a string and a rail, and it
cost a second geometry everywhere. The light had to come out of the thing in the
picture, so an emitter had to be located within the render — right of centre,
past the current-limiting resistor, about a quarter of the pitch wide against
two thirds of the tape's width — and the rail had to rotate that tile a quarter
turn and swap its axes; the bloom needed a second, wider stack so it landed on
the photographed PCB; and the render's own pitch could not be re-tiled, so a
panel squeezing that 2.6:1 segment into a square cell turned into noise. A drawn
LED lands on drawn board by construction, and all of it is gone. The trade is
that a string is drawn one pitch tall rather than at tape's real 8 mm width: a
run's length already dominates its box, and square cells are what make it read
as the row of LEDs it is.

Every form draws a lit LED as one group holding the package and the bloom around
it, all inheriting a single fill, so a frame costs one attribute write per
emitter and the glow can never drift out of step with the LED. `EMITTER_GLOW` is
that bloom — one soft layer, for every part: a real WS2812B blows its package
out to white and throws its colour about a pitch in every direction, but on a
grid where the next LED is a pitch away anything wider only washes the board
out, and the diffuser above already supplies the dome. It is stacked layers
rather than a blur for the reason the rest of that file avoids filters — the
content changes every frame — and the preview overflows its part's box on
purpose, because light lands past the edge of the board it is mounted on.

Graph nodes use compact thumbnails only. The workbench is the recognition view:
what it owes the user is "this is the module you are holding", not a measurable
ratio between two of them. LED fixtures add live output previews, diffuser
treatment, and sampled light spill.

### Size is compressed, not shared

One millimetre scale across every part spans twenty to one the moment a panel
and a microphone share a bench, and neither framing it allows is usable: fit
the panel and the controller is four pixels wide, size the controller and the
panel is off the stage. Each part is therefore drawn at its own scale, taken
from the cube root of its size (`SCALE_COMPRESSION` in `hardwareLayout.ts`), so
a 320 mm panel reads at roughly one and a half times a 63 mm controller instead
of five times it.

The compression is one factor per part, so no part is distorted — a strip stays
as long and thin as a strip is — and the ordering holds, so a physically larger
part still draws larger. What is given up is the literal ratio, which was never
measurable off a screen and which the bench cannot offer a comparison for
anyway: there is only ever one board on it. Do not reintroduce a single shared
`mmScale`; anything drawn in physical units on a part (an LED pitch, a diffuser
tile) reads that part's own `mmScale` from its `PlacedPart`.

### Runs are sized by their emitters, and drawn broken

A run of repeated emitters — a string, a VU rail — is the one part whose
compressed size is the wrong answer, because the diagonal it is derived from is
dominated by a length that is a fact about how much tape was bought. Compressed
that way, a metre of tape draws a hairline: true to its own aspect and a picture
of nothing. So a run is scaled by its *emitter* instead, and its length is
bounded separately by drawing it **broken** — the mechanical-drawing convention
for a long part shown short: both ends at true pitch, the middle removed, two
strokes across the cut, and the real count in the caption. Breaking cannot
substitute for the emitter scale, because removing emitters does not make the
remaining ones any bigger.

How big that emitter is drawn is not a free choice either. Every WS2812B on the
bench is the same component, so a panel already settles the size of one, and a
run of the same LED takes its scale from that panel rather than from a floor of
its own (`emitterMm` on a part box, matched in `partScale`). Otherwise a string
beside a 32x32 panel drew LEDs three times the panel's and read as a different
component. The floor (`RUN_MIN_EMITTER_BANDS`) remains for the bench that has no
panel to match, and a part built on a different LED — a HUB75 panel's 4 mm pixel
— is deliberately not a match: it is a denser part, and that difference is the
thing worth seeing.

A two-dimensional panel is not broken: its size is bounded and its shape is
information.

`hardwareLayout.ts` owns the cut. The drawn box, the bare board behind it and
the live emitters over it all read that one answer, so the picture and the
geometry cannot drift apart, and a broken run's cells name the emitters they
really are: the LED after the break is LED 59, not the LED that would sit there
had the run been drawn whole. The cut is deliberately independent of the band —
every length in it scales with the band together — so the shrink-to-fit pass
cannot make a run gain or lose emitters as it narrows the bench around it.

The gap is masked into the board layer and the diffuser over it, never into the
part itself: a mask clips its whole subtree and isolates it from the backdrop,
which over the live cells would take the LEDs' bloom with it and leave a lit run
looking printed. The emitters need no mask at all — they are drawn per slot and
simply leave the gap empty — and the two strokes across the cut are a sibling of
the part for the same reason.

### The bench is a bus, not a dataflow column

Parts sit in two rows: everything that feeds the board above it, everything the
board drives below it. Which row a part belongs in is read off the runs rather
than declared, so nothing has to tell the layout what a part is.

Runs between them are orthogonal — down out of a part, along a horizontal lane
in the channel between the rows, and down into the next, turning rounded square
corners. The shape is the one a wiring or network diagram uses, and it is what
lets the bench spread sideways: adding a part widens the arrangement instead of
lengthening a diagonal across it, which puts the pane's spare horizontal space
to use rather than growing a column down the middle of it.

Each run gets a lane of its own rather than sharing a trunk. A network bus draws
one line for many devices because it really is one wire; these are not — every
run is a different pin, and stacking them on one line would say they were
joined. Lanes are ordered left to right, which reads as a fan; crossings still
occur where a wide row fans out of a narrow board, and cannot be removed while
every run leaves the same part.

Labels go on the outside: a part in the upper row labels above itself, one in
the lower row below, so the channel between them is left to the wiring. The
board is the one part wired on both sides, so its label sits beside it.

### Captions hold their size and drop detail

Captions live inside the panned and zoomed world, so left alone they are
multiplied by zoom twice over — dust at a fit-everything view, a billboard when
you close in on a pin. They are counter-scaled to one readable size on screen
instead, and where a part becomes too small to label the detail drops rather
than the type: pin summary first, then the name. The layout reserves slot
height by the same rule, so a dense bench stops paying height for labels it is
never going to draw.

The measurement is the *slot* a part was given, not the part's own render: a
label's problem is its neighbour's label, and the slot is the width it has to
itself. A row therefore also sizes its slots for the labels they will carry, so
a 45 px module with a long pin summary is not placed hard against the next one.

## Upload tab

Deployment tools now live in the lower pane rather than on the LED output node.
The Upload tab contains readiness, the explicit measured-capacity check,
compile/upload/cancel, firmware reuse/export/view, diagnostics, validation
reporting, Stream Receiver/Live Stream, and an embedded Output/Serial console.

The console has filtered and verbose toolchain output plus a serial monitor with
baud selection and connection controls. A compile log therefore stays visible
in the same full-width workbench where the action was started.

## Audio capability and deferred work

The graph now has an `Audio` capability node whose source picker is derived from
attached board hardware. It discovers microphones, PCM1802 line-in ADCs and,
when an SD Card, amplifier, and Music Player define the on-board player workflow,
the player's decoder tap. The picker lists only Microphone, Line Input, and
Audio Decoder, with Microphone as the default. Every choice is
selectable before its Hardware provider exists; the node then stays disabled
and explains how to enable that source. Adding the provider resolves the menu
entry to its concrete hardware label, such as `Microphone - INMP441`. Audio
cables carry the live/recorded/baked signal
payload through FFT, beat, percussion, feature, spectrum, group, preview, and
firmware paths instead of letting analysis nodes read ambient browser state.
`MicInput` and `LineInput` remain concrete Hardware providers for wiring and
code generation but do not appear as signal nodes or carry graph cables.

Collection shows compile against the player-hosted audio globals. The pinned
ESP32-audioI2S callback queues decoded PCM immediately before I2S/DAC output;
after the write is fed, FastLED's existing Processor derives EQ bands, beat, and
BPM for the compiled patterns. The baked show envelope remains a startup and
decoder-failure fallback rather than the primary on-device analysis source.

For external players whose decoder is not running on the controller, the
ESP32-S3 firmware can capture the player's line-level DAC output through a
PCM1802 breakout. The part owns MCLK, BCLK, LRCLK, and DOUT assignments, exposes
left/right/both channel selection, appears in Build Diagram exports, and feeds
the same FastLED audio processor as the microphone path. It must receive a
line-level output, not a bridge-tied speaker output. Browser preview still uses
the browser/OS audio source because it cannot sample the physical ADC.

A `Storage` capability abstracts the storage providers available to the root
hardware graph: the concrete SD Card workbench part, the controller's onboard
flash, and its USB transfer path. It defaults only when there is one provider;
otherwise the provider is explicit. SD Card remains a concrete workbench-only
part used by the music-synchronised player workflow.

Multi-board graphs and a Raspberry Pi backend remain out of scope. Per-output
native rendering is designed separately in
[`per-output-native-render.md`](per-output-native-render.md).
