# Hardware workbench guide

The `Hardware` branch uses one project model in two coordinated views. The
lower workbench shows the physical rig; the graph above shows its signal flow.
This guide describes the current implementation.

## Start with the board

Click the board in the workbench and choose its family and exact physical
profile. A profile identifies the headers and fitted hardware, whereas an FQBN
can identify only a chip family or build target. The eye button opens the
reviewed pinout for the selected profile.

The board owns settings that one generated sketch can apply only once:

- master brightness;
- clockless-chipset overclock;
- global FastLED power cap;
- render-buffer PSRAM policy and interface; and
- serial routing on supported native-USB ESP32 targets.

`Auto` is the safe default for PSRAM. It enables external render buffers only
when the exact profile records a PSRAM interface. `Auto` serial routing examines
the selected USB port and chooses native USB or a UART bridge from its identity;
an unknown device falls back to UART unless the user overrides it.

## Add the parts that exist

Use **Add Hardware** in the workbench. The current categories are:

- **Inputs** — microphone, PCM1802 line-in ADC, button, potentiometer, encoder,
  PIR motion sensor, ambient-light sensor, and RTC module;
- **Storage** — supported microSD modules;
- **Amplifiers & DACs** — the supported I2S DAC/amplifier and analog amplifier
  modules; and
- **LED outputs** — LED String, LED Matrix, LED Ring, LED Corkscrew, and HUB75 Panel.

Hardware entries are intentionally absent from the Node Library. Creating the
part from the workbench means Studio knows which board owns it and can assign
board-appropriate starting pins.

Some components appear in both views because they carry a signal:

- microphone, line-in, and input/sensor parts produce graph data;
- RTC produces a clock signal; and
- an LED output consumes a frame.

Board, SD Card, and amplifier/DAC parts are workbench-only. They persist as part
of the project and affect validation or code generation, but they do not carry
a graph signal.

## Configure wiring

Click a part to open its wiring inspector. The pin picker:

- filters for the capability the connection needs;
- prefers unoccupied, known-good header GPIOs;
- identifies conflicts and caution pins; and
- provides **Other GPIO…** for deliberate hand wiring.

Changing the board retargets assignments Studio chose. Pins the user changed
are treated as intentional and remembered per physical board. This lets a
project move between boards without silently overwriting hand wiring.

Right-click a part for hardware actions. **Show in graph** is available for
signal-carrying parts. Removing a node on the graph disconnects it but does not
pretend the part vanished from the bench; use **Remove** in the
workbench to remove it completely.

### Connect a line-level player

On an ESP32-S3 project, add **PCM1802 line-in ADC** when an external audio
player cannot expose decoded PCM to Studio firmware. Connect the player's
line-level left/right output to the breakout's RCA inputs, then configure MCLK,
BCLK, LRCLK, DOUT, and the channel choice in the part inspector. Do not connect
a bridge-tied speaker output to the RCA inputs.

The part becomes an Audio source for FFT, beat, percussion, and feature nodes.
Generated firmware samples the physical ADC; browser preview uses the selected
browser/OS audio input because a web app cannot read the breakout directly.
Other controller targets are rejected until their master-clock path is
implemented and verified.

## Configure LED outputs

One implementation type backs all five fixture forms, but the workbench offers
each as the object a user buys. Configuration is split by responsibility:

- the physical inspector owns GPIO assignments and module identity;
- the graph node owns pixel count or dimensions, chipset, colour order, frame
  fit/crop route, matrix/panel/custom layout, correction, dithering, and
  supersampling; and
- the Board owns master brightness and power policy shared by every output.

Each output renders in its own physical shape in the graph and workbench. Click
an output in the workbench to make it the route displayed in the side preview.

For an LED Corkscrew, set the chain length, number of turns, LED 0 angle,
winding direction, cylinder diameter, and finished height. Studio authors the
effect on an unwrapped cylinder, then uses the same helical sample map for the
browser preview and generated firmware.

## Navigate the workbench

Drag the horizontal divider to rebalance graph and hardware space. Use **−**,
**+**, and **Fit** to navigate the true-scale arrangement. Studio preserves the
hardware view anchor while the layout changes so the part being inspected does
not jump away.

The workbench is not the Build Diagram. Its automatic links answer “what is
connected to this board?” Open **View → Build Diagram** for pin-level wiring,
power distribution, fusing, a parts list, connection CSV, SVG export, and print
sheets.

## Upload and inspect output

Select the lower pane's **Upload** tab. It contains:

- the guided setup wizard and Board/Port control;
- the expandable Upload readiness checklist;
- the user-initiated measured flash/RAM capacity check;
- normal Upload and cancellation;
- re-upload, generated-code view, and `.ino` export;
- Wiring Test and HUB75 topology diagnostics;
- beta hardware coverage reporting;
- Stream Receiver and Live Stream actions; and
- an embedded console with separate **Output** and **Serial** tabs, verbose
  toolchain output, baud selection, connect/disconnect, and clear controls.

The helper serializes builds. A capacity check requested during another build
is reported as queued, and a running compile can be cancelled before anything
is sent to the board.

For a music-synchronised SD show, add an SD Card and the appropriate audio-output
part first. Upload then packages the selected music/show content and flashes the
player path. Ordinary graphs and generative shows stay on the normal firmware
path.

## Support boundary

A board profile or compile target means Studio knows how to describe or build
for that target; it is not evidence that every peripheral and workflow works on
real hardware. Graph Health reports what can be inferred statically. The
[beta support matrix](../release/beta-support-matrix.md) is the authority for
recorded end-to-end combinations.
