# Display node reference

Displays are root-level hardware parts with graph nodes. Add them through
**Add Hardware → Displays** and configure module identity and GPIO in the
workbench. Use the graph for signal connections and presentation settings. The
[hardware workbench guide](../user/hardware-workbench.md#add-and-connect-a-display)
walks through a first custom screen. The same workflow is available in Help →
Node Reference on each display's page.

## Choose the exact module

| Graph node | Available module | Screen and interface |
| --- | --- | --- |
| Segment Display | TM1637 4-digit | Four digits, centre colon, dedicated CLK/DIO pair |
| Segment Display | MAX7219 8-digit | Eight digits, no colon, SPI clock/data plus dedicated load line |
| Info Display | SH1106 1.3-inch | 128×64 OLED, seven-pin SPI module |
| Info Display | SSD1306 0.96-inch | 128×64 OLED, four-pin I²C module, address 0x3C or 0x3D |
| Transport Display | ST7789 1.3-inch | 240×240 colour TFT, SPI, no touch |
| Transport Display | ST7789V 2.4-inch + touch | 240×320 colour TFT, SPI, XPT2046 touch with its own header |
| Custom Display | ST7789V 2.4-inch + touch | The same 240×320 module, with an editable widget screen |

These are implemented catalogue choices, not a list of physically validated
combinations. Unlisted controllers, panel sizes, interfaces, and touch modules
are unsupported. The [beta support matrix](../release/beta-support-matrix.md)
is the authority for recorded hardware support. A successful build for one
ESP32-S3 does not establish support for every board or display combination.

## Segment Display

Connect one **Display** wire from RTC Clock, Music Player, or Pattern Slideshow.
It shows the time, elapsed playback position, or pattern number respectively.
Unwired digits show dashes. A raw float or a Format Number string does not fit
this socket; use a Custom Display readout for those values.

Set brightness, leading zeros, decimals, colon, and enabled state on the graph
node where applicable. The TM1637 has a colon; the MAX7219 module does not.
TM1637's two wires are not I²C and cannot be shared between modules. MAX7219 can
share SPI clock and data with compatible devices while retaining its own load
line.

## Info Display

Connect the source's **Display** output to the OLED's **Display** input. RTC
Clock supplies the clock screen, Music Player supplies now-playing information,
and Pattern Slideshow supplies the pattern browser. There is no layout selector;
an unwired panel explicitly reports that state. Rotation and enabled state are
graph settings.

The slideshow owns the current pattern and highlighted selection. The OLED
reports that state; physical browsing controls go through Player Controls to
Pattern Slideshow. Pattern thumbnails are baked during export, so upload again
after changing the collection.

Select the actual OLED module before assigning pins. The SH1106 SPI module is
not interchangeable with the SSD1306 I²C module. For SSD1306, match its address
and use the same SDA/SCL pair as the other I²C parts in the sketch.

## Transport Display

Choose **Now Playing**, **Fixed Transport**, or **Show Status** on the graph
node, then wire the typed inputs used by that layout. These include Title,
Artist, Elapsed, Duration, Progress, Playing, Volume, pattern information, and
LED output state. Elapsed and Duration are seconds; Progress, Volume, and
Brightness use normalized 0–1 values. Text Value supplies literal text and
Format Number turns a float into a string for text inputs.

For music playback, wire the matching outputs from Music Player to the screen.
On the XPT2046 module, connect **Controls → Player Controls → Music Player**
to give touch actions a destination. Read-only panels remain useful without
this chain. The square ST7789 module has no touch controller and produces no
touch actions.

The chosen layout, destination, and firmware generator must support each other.
Graph Health reports incomplete or unsupported touch chains. Normal and
generative-show graphs can use the fixed controls supported by their destination;
the SD-player chain must reach Music Player. Selecting a touch module does not
automatically wire any action.

## Custom Display

Click **Edit display** on the graph node. The screen size follows the selected
module and rotation. In **Design**, place individual widgets or insert a
template, then edit bounds and properties in the inspector. Templates add
ordinary widgets with editable labels and ports; names such as Now Playing or
DMX Monitor do not supply data or establish automatic connections.

Use **Graph** to return and connect the newly created ports. Widget identity
keeps wires attached when labels or positions change. Duplicating or pasting
creates new widget identities; wire their ports separately. Deleting a wired
widget prompts before removing its wires. Undo/redo and project save include
the layout. Transient touch state is neither saved nor undo history.

**Run** lets you exercise controls locally. **Design** locks those controls for
editing. Switching modes resets local control state. The browser preview is
not a device connection, and it does not test physical display wiring, touch
alignment, or timing under load.

### Widget ports

| Widget | Input | Output |
| --- | --- | --- |
| Text | Text: string (Value role) | — |
| Numeric Readout, Progress, Value Meter | Value: float | — |
| Timecode | Seconds: float (Value role) | — |
| Status Indicator | Value: boolean | — |
| Colour Swatch | Colour: colour (Value role) | — |
| Pattern Browser | Pattern: pattern selection (Value role) | — |
| Image / Icon | Asset selected in the inspector | — |
| Button | — | Output: boolean |
| Toggle | Set: boolean, optional | Output: boolean |
| Slider, Dial | Set: float, optional | Output: float |

The node exposes the roles of its actual widgets, so a new empty screen has no
ports. A widget with one port uses its widget label on the graph socket; a
control with multiple ports appends Output or Set. The inspector shows the role
and type. For a first connection, add a Slider and Numeric Readout and connect
the slider's Output to the readout's Value. For formatted text, insert Format
Number between the slider and a Text widget. For music-player actions, connect
widget outputs to the appropriate Player Controls inputs and that node to Music
Player. Route SD-player brightness and volume through that same chain.

A synchronized control belongs to the finger while held. After release, a wired
**Set** value becomes authoritative. With Set unwired, the last local value is
retained. This allows a control to show the state it controls without its
graph-fed value fighting a drag.

### Layout and assets

Select a widget to edit its label, position, size, and type-specific properties.
With no selection, edit the grid, theme, and background. **Fit** frames the
screen. Arrow keys move the selection by the grid; Shift+Arrow moves one pixel.
Ctrl/Cmd+A selects all, Ctrl/Cmd+C/V copies/pastes, Ctrl/Cmd+D duplicates, and
Delete removes the selection. Multiple selections expose alignment and
distribution controls.

Choose images, icons, and backgrounds from the installed asset choices in the
inspector. Resolve missing-asset and layout issues before deployment. Asset
preparation is part of generated-code, capacity, and upload preparation; imported
projects must pass the workspace trust checks before external assets are read.
Rebuild after changing the document or assets so the device receives the new
screen.

The editor's left sidebar also has **Button icons**. Its **Icon theme** picker
shows one matching control-art set at a time; click an icon to add an icon-first
Button or Toggle. The picker changes control art only, while the Screen
**Theme** in the inspector changes the display's colours and background.
Templates use the currently selected icon theme for their supported Previous,
Play/Pause, Next, Confirm, and LED power controls. Other template actions stay
text-labelled until matching icon art is added to the pack.

### Firmware scope and troubleshooting

Normal, generative-show, and SD-player builds generate custom LVGL widgets.
Show and SD-player control paths accept float, boolean, and string bindings
from supported sources and scalar operations: Math, Lerp, Clamp, Map Range,
Sin, Cos, Compare, Text Value, and Format Number. Supported GPIO buttons,
button banks, potentiometers, and encoders can participate; SD-player displays
can also use the player's supported song outputs.

This does not enable every node in a template build. Time-dependent nodes,
nested groups, and wired colour or pattern-selection widget inputs are
unsupported by these show/player control paths. Graph Health and build
validation identify unresolved bindings rather than silently supplying a value.
A widget appearing in the editor is not a promise that every generator can
evaluate every wire connected to it.

| Symptom | What to check |
| --- | --- |
| No custom graph ports | Open Edit display and add widgets; the empty screen has no roles. |
| Control snaps back after release | Inspect its Set wire; that source becomes authoritative after touch. |
| Template does not control playback | Connect widget outputs through Player Controls to Music Player. |
| Build reports an unsupported widget input | Replace the upstream path with supported scalar nodes, or use a normal sketch where that path is supported. |
| Screen document size does not match | Reopen the editor after changing the mounted module or rotation and resolve the reported size/layout issue. |
| Asset preparation or trust issue | Choose an installed asset and complete the project's trust review before building. |
| Pin conflict | Check exact module identity, shared bus pins, and separate chip-select lines in Hardware and Graph Health. |

Representative normal, show, and SD-player sketches have compiled with both
Arduino CLI and fbuild on an ESP32-S3 N16R8; see the
[compile record](../development/display-compile-checks.md). Touch calibration,
rotation on the physical module, TFT/SD/touch bus sharing under load, LED frame
rate, and runtime memory use still need physical checks. The calibration wizard
is not yet implemented; existing numeric calibration bounds are not a measured
calibration for your module.
