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
