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

- **Inputs** — microphone, PCM1802 line-in ADC, button, button bank, potentiometer, encoder,
  PIR motion sensor, ambient-light sensor, and RTC module;
- **Storage** — supported microSD modules;
- **Amplifiers & DACs** — the supported I2S DAC/amplifier and analog amplifier
  modules;
- **Displays** — segment readouts, OLED information panels, fixed-layout TFTs,
  and a custom touch display; and
- **LED outputs** — LED String, LED Matrix, LED Ring, LED Corkscrew, and HUB75 Panel.

A **Button Bank** starts with one hollow graph socket. Connect it to a named
input such as **Next** or **Brightness Up**: the bank creates a button with that
name, assigns a free GPIO, and leaves another empty socket ready. Use the
on-node button to test it in preview. Click the bank in Hardware to change its
GPIO or internal pull-up; unplugging a graph noodle does not erase the physical
button or its wiring. Remove the row from that Hardware inspector when the
physical button is no longer part of the build.

Hardware entries are intentionally absent from the Node Library. Creating the
part from the workbench means Studio knows which board owns it and can assign
board-appropriate starting pins.

Some components appear in both views because they carry a signal:

- microphone, line-in, and input/sensor parts produce graph data;
- RTC produces a clock signal; and
- an LED output consumes a frame.

Auxiliary displays also have graph nodes: fixed panels consume display data,
while touch panels can publish controls as well. They are separate screens and
do not consume any of the LED output's pixels.

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

## Add and connect a display

Choose **Add Hardware → Displays**, then choose the exact module you need from
the menu. Select the added part in the workbench to configure its GPIO. The
[display reference](../reference/displays.md) lists the available modules,
connections, and build limitations. An unlisted controller, resolution, or
touch module is unsupported; choosing a similar-looking part does not make its
driver compatible.

For **Segment Display**, **Info Display**, and built-in **Transport Display**
screens, connect the source's **Display** output to the panel's **Display** input.
RTC Clock selects a clock, Music Player selects transport information, and
Pattern Slideshow selects its pattern status/browser. The TFT's presentation
setting chooses between treatments of its connected source. There are no
separate Title/Artist/Progress inputs on the physical panel.

For fixed music touch, connect **Transport Display Controls → Player Controls
Controls In → Music Player Controls**. Custom screens use their individual
widget outputs instead. Fixed Show Status and Clock screens have no touch actions.

### Design a custom screen

1. Add a physical **Transport display** and choose its exact module. Set its
   GPIO/touch pins in Hardware and mounted rotation on that panel's graph node.
2. Add **Custom display** from the display menu. This creates a screen document,
   not another hardware part. Connect its **Custom Display** output to the
   physical panel's **Custom Display** input; this replaces any built-in Display
   content wire. Use a separate document for each panel for now.
3. Click **Edit display** on the document. In **Design**, place widgets or a
   template, then edit labels, bounds, theme and assets. Templates create ordinary
   widgets and ports; they do not connect playback or supply live data.
4. Return with **Graph**. A 0–1 Slider can drive a normal-sketch LED output's
   Brightness input. For SD music playback, assign brightness/volume through
   **Player Controls → Music Player**. For track text, connect **Music Player
   Display → Song Info Display**, then **Song Info Title → Text widget input**.
5. **Run** exercises local touch controls. It is not a hardware connection, and
   passive graph-fed readouts do not yet repaint live there. Do not use a blank
   readout as proof that its graph wire is wrong. Return to Design to edit.
6. Match document dimensions to the panel's mounted dimensions before building.
   The current Portrait/Landscape action changes the document but does not yet
   update the connected panel; set that panel's rotation explicitly as well.
   Resolve Graph Health and resource issues, measure capacity, then upload.

The Hardware branch is still completing this integration. Slideshow physical
pattern selection, TFT-only Show Status, custom-panel Disabled in normal
firmware, and shared-document builds have known defects. See the
[review findings](../development/reports/hardware-branch-review.md) before relying
on those paths; HW-01–06 track their repair. Existing compile records do not
certify the newly split panel/document workflow.

Readout widgets receive values. Buttons publish boolean outputs. Toggles,
sliders, and dials also have an optional **Set** input: touch owns a control
while held, and its wired Set value takes over after release. With Set
unwired, it retains its local value. See the
[widget role table](../reference/displays.md#widget-ports) for the complete map.

Renaming or moving widgets preserves connections. Deleting a wired widget
asks before removing its connections. Copying widgets creates independent
widgets that need their own graph wiring. The screen document is saved with the
project, and layout edits participate in undo/redo; temporary Run-mode touch
values are not saved.

Use distinct chip-select lines when sharing a compatible SPI bus between a TFT,
touch controller, and SD card. TM1637 is not I²C and needs a separate CLK/DIO
pair per module. Resolve pin conflicts in Graph Health and review the Build
Diagram. Shared-bus operation under audio and LED load, touch calibration, and
screen performance still need physical validation; successful compilation does
not close those checks.

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
player path. A connected Pattern Slideshow uses the show-controller generator; ordinary
graphs use the normal sketch generator. An SD card alone does not select the
player; the qualifying music/show graph also has to exist.

## Support boundary

A board profile or compile target means Studio knows how to describe or build
for that target; it is not evidence that every peripheral and workflow works on
real hardware. Graph Health reports what can be inferred statically. The
[beta support matrix](../release/beta-support-matrix.md) is the authority for
recorded end-to-end combinations.
