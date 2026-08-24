# Hardware nodes and the two-view model

Status: implemented on `Hardware`; capability abstractions remain deferred ·
Owner: app · Updated: 2026-08-24

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

- signal inputs: INMP441 microphone, button, potentiometer, encoder, PIR motion,
  ambient light, and RTC modules;
- workbench-only fixtures: SD Card and amplifier/DAC modules; and
- LED String, LED Matrix, LED Ring, and HUB75 Panel outputs.

Creation targets the root graph even while the user is editing a pattern group.
The new part receives board-profile starting pins where available. GPIO
allocation respects capability, existing uses, and the selected part option.

Changing boards retargets assignments made by Studio and preserves explicit
user choices. User-selected pins are remembered by part and board so switching
away and back restores the intended wiring.

## Which parts appear in the graph

`isHardwareManagedSignalNodeType` defines the parts visible in both views:

- `MicInput`, `ButtonInput`, `PotInput`, and `EncoderInput`;
- `MotionInput` and `LightInput`;
- `RTCInput`; and
- `MatrixOutput` (the implementation type behind all four LED-output forms).

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

One `MatrixOutput` implementation backs four physical forms exposed separately
by **Add Hardware**. Each form has its own display label and renderer:

- LED String;
- LED Matrix;
- LED Ring; and
- HUB75 Panel.

The physical form cannot be changed from the signal node. The workbench creates
the object the user owns. Responsibilities are split as follows:

- the workbench inspector owns GPIO assignments and module identity;
- the graph node owns size/count, chipset and colour order where applicable,
  frame fit/crop route, matrix/panel/custom mapping, correction, dithering, and
  supersampling; and
- the Board owns brightness, power, overclock, and memory policy.

The output renders in its own shape in the graph and workbench. Clicking a
workbench output also selects the route shown in the side preview. Multi-output
firmware remains one synchronized sketch for one board.

## Hardware part identity and rendering

Exact part options drive the label, pin roles, notes, thumbnail, and workbench
render. Board and part assets carry verified dimensions. The workbench lays
them out using a shared millimetre scale instead of normalizing every image to
the same box.

Graph nodes use compact thumbnails only. The workbench is the recognition and
relative-scale view. LED fixtures add live output previews, diffuser treatment,
and sampled light spill without changing the underlying physical footprint.

## Upload tab

Deployment tools now live in the lower pane rather than on the LED output node.
The Upload tab contains readiness, the explicit measured-capacity check,
compile/upload/cancel, firmware reuse/export/view, diagnostics, validation
reporting, Stream Receiver/Live Stream, and an embedded Output/Serial console.

The console has filtered and verbose toolchain output plus a serial monitor with
baud selection and connection controls. A compile log therefore stays visible
in the same full-width workbench where the action was started.

## Deferred capability work

The current microphone still provides the audio signal directly, and analysis
nodes retain their existing ambient preview integration. The planned `Audio`
capability node, decoder tap, line-in source, and explicit analysis-node audio
ports are not implemented.

A Storage capability abstraction across SD, onboard flash, and USB is also not
implemented. SD Card remains a concrete workbench-only part used by the
music-synchronised player workflow.

Multi-board graphs and a Raspberry Pi backend remain out of scope. Per-output
native rendering is designed separately in
[`per-output-native-render.md`](per-output-native-render.md).
