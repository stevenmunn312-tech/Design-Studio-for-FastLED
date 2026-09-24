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

- **Inputs** — microphone, PCM1802 line-in ADC, button, button bank,
  demodulating IR receiver, potentiometer, encoder, PIR motion sensor,
  HLK-LD2410C radar presence sensor, ambient-light sensor, INA219 power monitor,
  and RTC module;
- **Storage** — supported microSD modules;
- **Amplifiers & DACs** — the I2S stage on the board's pins (a MAX98357A
  speaker amplifier, or a PCM5102A or UDA1334A DAC), and the analog power
  amplifiers (PAM8403, PAM8610, DX-0809) that take line level and drive the
  speakers;
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

### Measure a DC load

The **INA219 power monitor** reports a DC load's volts, amps and watts. Put it
in the supply lead: the supply's positive wire goes to **Vin+**, the load's
positive wire to **Vin-**, and the load shares ground with the board. It reads
up to 26 V and 3.2 A. Power the monitor from the board's 3V3 pin, not 5 V: its
data pull-ups follow its supply. It joins the board's I2C pins, which it can
share with an RTC or an I2C display; if you use more than one monitor, bridge
the A0/A1 jumpers so each has its own address, and pick that address on the
node. In preview there is no sensor, so drag the node's volts and amps sliders.
Amps run from 0 to 3.2, so put a **Map Range** in front of anything that
expects 0 to 1.

### Detect stationary presence

The **HLK-LD2410C Presence Sensor** detects a person who is moving or sitting
still and reports their distance up to 6 m. Power VCC from 5 V and GND from the
board. Wire the sensor's **TX** pad to the ESP32 GPIO shown as **RX (sensor TX)**
in Studio; leave RX and OUT unwired. Its UART is 3.3 V logic, so no divider is
needed. Mount the component/antenna face toward the occupied area and keep
metal and dense power wiring out of the space immediately in front of it.

The node offers Presence, Moving, Still, and Distance outputs. In preview,
toggle Moving and Still and drag the distance slider. Only one sensor can be
active because the generated reader owns UART1. If a DMX512 input also uses
UART1, Graph Health asks you to move DMX to UART2 on a board that provides it.
The feature requires an
ESP32-family target and remains experimental until the support matrix records
a compile and a physical comparison against the module's OUT indicator.

### Measure ambient light

**Add Hardware → Inputs** offers two light sensors. The **LDR light sensor** is
an analog divider on one ADC pin; its **Level** output is relative brightness
from 0 to 1, and **Lux** stays at 0 because a bare LDR cannot be calibrated.
The **Adafruit BH1750** reports calibrated illuminance over I2C. Power its
**VIN** from **3V3**, not 5 V: the breakout pulls the controller's SDA and SCL
up to VIN. Wire SDA and SCL to the board's I2C pins, which Studio fills in for
you. Leave **ADDR** unconnected for address 0x23, or tie it high and choose
0x5C, which lets two sensors share the bus.

The BH1750 node's **Lux** output is the measured reading. **Level** is Lux
divided by **Max Lux**, so set Max Lux to the brightest light the build should
react to (a lit room is a few hundred lux, daylight tens of thousands). In
preview, drag the node's knob. The BH1750 is experimental until the support
matrix records it on a real board.

### Add an IR remote receiver

Choose **Add Hardware → Inputs → IR Receiver**, then choose the exact receiver
you own. The module choice is electrical, not cosmetic: a KY-022 breakout puts
supply on its centre pin, while a bare TSOP38238 puts ground there. KY-022
clones can also swap their outer signal and ground pins, so check the board's
silkscreen or data sheet before applying power. Configure the signal GPIO in
the Hardware inspector; the receiver itself drives that line, so Studio does
not enable an internal pull-up.

The receiver's graph node starts with **Learn button…** and no usable key
outputs. To create a mapping:

1. Click **Learn button…**, name the key, choose the board's serial port, and
   upload the temporary learning sketch. Studio deliberately does not reuse a
   cached project build for this diagnostic.
2. Press the remote key once. Studio records its protocol, address and command
   under a stable mapping id. Manual entry is available when a receiver cannot
   be connected during authoring.
3. Choose **Once** for an action that should fire on the first decoded frame,
   or **Held** when the remote's repeat frames should keep firing.
4. Wire a learned boolean output to an action. For numeric properties, wire
   increase/decrease/reset keys into **Step Value**, then wire its Value output
   to the property's exposed input. Power commonly goes through a
   **Trigger** in Toggle mode. In an SD/player graph, route player and LED
   controls through **Control Map → Music Player**.
5. Upload the project again after learning; the temporary learner is not the
   project firmware. Cancelling or completing the learner releases the serial
   port.

The learning upload is refused until the workspace is trusted. Project builds
pin Arduino-IRremote 4.7.1: the helper installs or vendors it lazily, an
exported `.ino` carries the exact `arduino-cli lib install IRremote@4.7.1`
instruction, and a project without an IR receiver does not include the
library. Board acceptance follows the architectures advertised by that pinned
release plus its explicit exclusions; in particular, ESP32-S3 is blocked.

Resolve these Graph Health findings before upload or export:

| Finding | Repair |
| --- | --- |
| More than one IR receiver | Keep one root-owned receiver and move every mapping to it. |
| No learned keys | Learn a key or enter a complete mapping manually. |
| Blank, unsupported or out-of-range mapping | Relearn the key, or correct its protocol, address and command. |
| Duplicate key identity | Relearn or edit one row so protocol, address and command are unique. |
| Wired output has no mapping | Repair the retained mapping row or remove the stale wire. |
| Selected board is unsupported | Choose a supported FQBN or remove the receiver. |
| Receiver GPIO conflicts | Move the signal to a free digital-input GPIO. |
| Invalid Step Value range | Use finite values, a positive step, `Max > Min`, and an initial value inside the range. |

IR receive remains experimental until a row in the beta support matrix records
the exact receiver, remote, board, pin and press/hold behavior under active LED
output. A minimal learner succeeding is not evidence that long, interrupt-
blocking LED writes will preserve every repeat frame.

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

### Drive speakers from a power amplifier

An SD music show needs something on the board's pins to turn the song into
sound. A **MAX98357A** drives a small speaker directly. For a bigger amplifier,
add a **PCM5102A** or **UDA1334A** DAC and then a **power amplifier**
(**PAM8403**, **PAM8610** or **DX-0809**). The DAC takes the three I2S wires
from the board; plug its line out into the amplifier's line input, and the
amplifier drives the speakers. The power amplifier has no GPIO of its own, so
the Build Diagram labels its input with the DAC that feeds it rather than
drawing a wire.

- Volume is set on the DAC. With a DAC in the chain, the power amplifier's
  volume field is hidden, because the DAC is the part the board drives.
- The PAM8610 and DX-0809 run on 12 V and need their own supply. The controller
  cannot power them. Connect that supply's ground to the board and the DAC.
- For stereo without a power amplifier, add a **MAX98357A stereo pair**: two
  boards on the same BCLK, LRC and DIN lines, one per speaker. Set each board's
  SD pin so one plays left and the other right. An unmodified board plays the
  left-plus-right mix. The Build Diagram wires the left board and lists the
  lines the right board shares.
- A MAX98357A cannot feed a power amplifier. Its speaker output is not line
  level, and neither of its outputs is ground. Graph Health refuses that
  combination and asks for a DAC instead.
- With no DAC on the bench, a power amplifier takes line level from the classic
  ESP32's own DAC on GPIO25 and GPIO26. No other board has a DAC, so on an
  ESP32-S3 add a PCM5102A or UDA1334A.

Power amplifiers have no hardware validation yet; see the
[support matrix](../release/beta-support-matrix.md#experimental-until-validated).

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

## Wire a knob or a button to something

Blackout, dimming and pattern intent are wires, not project settings. Add the
control as a part — **Potentiometer**, **Button**, **Rotary Encoder** — then
wire it to the property or named action it should control. Right-click a
runtime field and choose **Expose input** to draw that socket; dragging onto
the property row exposes and connects it in one step. Use **Control Map**
when you want one compact bundle, conversion, chaining or repeat settings.
Dropping on its trailing socket asks what that control should do and mints a
port named for the job, offering only the jobs this chain can actually carry
out: a bundle ending at an LED output is offered blackout and dimming, one
ending at a Pattern Slideshow is offered pattern intent, and one reaching Music
Player is offered all of it. Each option says whether it is an edge (*on each
press*) or a position (*holds its position, 0 to 1*).

The node's single **Controls** output then goes to whatever should obey it:

| Destination | What it takes |
| --- | --- |
| LED output **Controls** | Blackout toggle, brightness level and up/down steps |
| Pattern Slideshow **Controls** | Pattern selection, previous/next, confirm |
| Music Player **Controls** | Transport, volume, blackout, dimming and pattern intent |
| Another Control Map **Controls In** | Chains banks of controls into one bundle |

An LED output's **Enabled** and **Brightness** inputs take a plain wire too, for
a graph with no controls in it. Unwired, an output is lit and undimmed, so
adding these ports to an existing project cannot darken it. Blackout, dimming
and the Controls bundle combine rather than override each other.

Two Start Gallery patches arrive with both ends already wired: **Dimmer and
Blackout** (a knob and a button reaching an LED output, no player anywhere) and
**Browse a Slideshow** (an encoder turning a highlight, a press committing it,
and an OLED showing what you are about to play).

## Add and connect a display

Choose **Add Hardware → Displays**, then choose the exact module you need from
the menu. Select the added part in the workbench to configure its GPIO. The
[display reference](../reference/displays.md) lists the available modules,
connections, and build limitations. An unlisted controller, resolution, or
touch module is unsupported; choosing a similar-looking part does not make its
driver compatible.

For **Segment Display**, **Info Display**, and built-in **Display Panel**
screens, connect the source's **Display** output to the panel's **Display** input.
RTC Clock selects a clock, Music Player selects transport information,
Pattern Slideshow selects its pattern status/browser, and an LED output
selects **LED Status**. The TFT's presentation setting chooses between
treatments of its connected source. There are no separate
Title/Artist/Progress inputs on the physical panel.

For fixed music touch, wire named Touch outputs such as **Play / Pause**
straight to matching Music Player action inputs, or connect **Touch
Controls → Control Map Controls In → Music Player Controls** when you
want one compact bundle or need continuous volume/brightness. Custom
screens publish their individual widget outputs on the companion Touch
node. Fixed Show Status and Clock screens have no touch actions.

### Design a custom screen

1. Add a physical **Display panel** and choose its exact module. Set its
   GPIO/touch pins in Hardware.
2. Click **Create screen design** on that panel's graph node. This mints
   a design on the panel itself — already sized to the glass — and opens
   the editor. There is no second node and no Screen Design cable. The
   panel keeps its Display wire: that source is what bound widgets read.
3. In **Design**, place widgets or a template, then edit labels, bounds,
   theme and assets. A template whose destination is unambiguous draws
   ordinary graph wires when it is placed; **Connect template controls**
   fills any that are still missing, without overriding a wire you
   already drew. **Portrait**/**Landscape** rotates the panel and re-fits
   the design to what it then shows, so the two can never disagree.
4. Return with **Graph**, or with the panel's own name in the breadcrumb
   to land on it. Widget outputs leave through the companion **Touch**
   node. A 0–1 Slider can drive a normal-sketch LED output's Brightness
   input. For SD music playback, assign fixture brightness through
   **Control Map → Music Player**; a player's own Volume is a direct
   property input. Bound readouts take a field of the panel's Display
   source from the inspector's **Reads** row; use **Song Info** only when
   you genuinely need one field on a cable.
5. **Run** exercises local touch controls and repaints graph-fed readouts as
   the graph publishes them. It is a simulation, not a hardware connection:
   it does not verify physical touch calibration or on-device draw rate.
6. Resolve Graph Health and resource issues, measure capacity, then upload.

For a panel self-test, choose **Diagnostics** in the panel's layout menu.
It overrides a screen design as well as the fixed layouts, so there is
nothing to disconnect first, and the Display source wire can stay.
Upload to check the physical panel and mapped XPT2046 touch coordinates;
choose the previous layout to restore content. Touch X/Y Min/Max
properties take measured raw bounds for that exact module. Save and
upload after changing them. Defaults are provisional and Diagnostics is
not a raw sample collector. The companion Touch node's **Calibrate
touch** wizard captures the four corners for you: choose the board's
port, press **Upload calibration sketch**, and it flashes a temporary
measuring sketch built from the panel alone, listens for the raw
readings it prints, and guides you corner by corner. It works on a graph
that cannot otherwise be deployed — a screen with no LED output, say —
because the sketch is built from the panel, not the graph. Saving
updates the Touch node and releases the port; upload your project again
to run with the measured bounds.

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
