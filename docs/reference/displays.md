# Display node reference

Physical displays are root-level Hardware parts. **Screen Design** is a
separate screen document with widget ports; it has no GPIO. Connect it to the
Screen Design input on a physical **Display Panel**. The
[workbench guide](../user/hardware-workbench.md#add-and-connect-a-display) describes
the current flow; in-app Help describes the same panel/document wiring.

## Choose the exact module

| Graph node | Available module | Screen and interface |
| --- | --- | --- |
| Segment Display | TM1637 4-digit | Four digits, centre colon, dedicated CLK/DIO pair |
| Segment Display | MAX7219 8-digit | Eight digits, no colon, SPI clock/data plus dedicated load line |
| Info Display | SH1106 1.3-inch | 128×64 OLED, seven-pin SPI module |
| Info Display | SH1106 0.96-inch | 128×64 OLED, seven-pin SPI module |
| Info Display | SH1106 1.3-inch (I²C) | 128×64 OLED, four-pin I²C module, 0x3C or 0x3D |
| Info Display | SSD1306 0.96-inch | 128×64 OLED, four-pin I²C module, address 0x3C or 0x3D |
| Display Panel | ST7789 1.54-inch | 240×240 colour TFT, SPI, no touch |
| Display Panel | ST7789V 2.4-inch + touch | 240×320 colour TFT, SPI, XPT2046 touch with its own header |

These are implemented catalogue choices, not a list of physically validated
combinations. Unlisted controllers, panel sizes, interfaces, and touch modules
are unsupported. The [beta support matrix](../release/beta-support-matrix.md)
is the authority for recorded hardware support. A successful build for one
ESP32-S3 does not establish support for every board or display combination.

## Segment Display

Connect one **Display** wire from RTC Clock, Music Player, or Pattern Slideshow.
It shows the time, elapsed playback position, or pattern number respectively.
Unwired digits show dashes. A raw float or a Format Number string does not fit
this socket; use a Screen Design readout for those values.

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

## Display Panel

Connect **Display** from RTC Clock, Music Player or Pattern Slideshow for Clock,
Now Playing/Fixed Transport or Show Status respectively. The source chooses
content; presentation only chooses among that source's treatments. Unwired
panels say Waiting. Alternatively, connect a document's **Screen Design**
output. The two content inputs are exclusive: the newest content wire replaces
the other. Enabled remains a separate input/property.

For fixed music touch on XPT2046, route **Controls → Player Controls Controls In
→ Music Player Controls**. Show Status and Clock are read-only. For custom
touch, wire individual controls from the **document node**; the physical panel's
fixed Controls output does not replace those widget ports.

The normal generator can render a clock. Show/player templates only read their
own supported source kinds, so an arbitrary RTC wire there remains unresolved.

### Diagnostics and touch bounds

On the panel's graph node, choose **Diagnostics** in the layout menu for a
self-test. Disconnect a **Screen Design** wire first: a mounted document owns
the screen. The fixed **Display** source wire can stay connected. Diagnostics
shows mapped touch coordinates on XPT2046 modules and identifies a non-touch
panel as such. Choose the previous layout and reconnect the document to return
to your content. Upload the changed design to run the check on the device.

The panel also exposes **Touch X Min/Max** and **Touch Y Min/Max** for touch
modules. These are raw 0–4095 bounds; use measurements from the exact module,
then save the project and upload again. The defaults are provisional.
Diagnostics shows mapped pixels, not raw samples, and browser touches cannot
calibrate the physical controller. Guided calibration remains HW-11 work.

## Screen Design

Click **Create screen design** on a physical TFT panel to create, size, connect
and open its document. A separately added document cannot be edited until it
is connected to a panel. **Edit screen design** reopens it. Design adds/resizes widgets or inserts ordinary
widget templates; labels such as Now Playing and DMX Monitor do not supply data
or automatically wire actions. Module, pins and mounted rotation belong to the
panel. Use one document per physical panel; shared documents are refused.

Return with **Graph** to wire widget roles. Renaming/moving widgets retains
connections; copying creates new identities; deleting a wired widget prompts
before removing its edges. Layouts participate in save and undo; transient
touch state does not. Run exercises local controls and Design locks them for
editing. Run redraws passive graph-fed readouts as values are published, as does
the panel thumbnail. Run is not device telemetry. Changing mode resets local
control state. A disabled panel's thumbnail is dark; editing remains available.

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
widget ports; it still has its Screen Design content output. A widget with one port uses its widget label on the graph socket; a
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
Templates use the currently selected icon theme for their transport and action
controls, including Shuffle, Auto advance, and Freeze.
All eight built-in templates — Now Playing, Minimal Transport, Pattern Deck,
Show Status, LED Performance, Audio Reactor, Diagnostics, and DMX Monitor —
have separate 320×240 and 240×320 compositions. The editor places the portrait
composition directly rather than squeezing or clipping the landscape one.
Themed icon-only Buttons and Toggles paint inside their saved border-box bounds;
those bounds remain the complete touch target, at least 48×48 px with 8 px
between neighbouring controls. A recognised template switches between its
dedicated touch-safe portrait and landscape compositions when the panel
orientation changes.
Use the editor’s **Portrait** and **Landscape** controls to match the panel’s
mounted rotation. The switch reflows the saved layout, keeps square themed
touch targets square, selects the matching background artwork, rotates the
connected panel and sizes the document from its mounted glass.

### Firmware scope and troubleshooting

Normal, generative-show, and SD-player builds generate custom LVGL widgets.
Show and SD-player control paths accept float, boolean, and string bindings
from supported sources and scalar operations: Math, Lerp, Clamp, Map Range,
Sin, Cos, Compare, Text Value, and Format Number. Supported GPIO buttons,
button banks, potentiometers, and encoders can participate; SD-player displays
can also use supported Song Info fields from an unpacker wired to the player.

This does not enable every node in a template build. Time-dependent nodes,
nested groups, and wired colour or pattern-selection widget inputs are
unsupported by these show/player control paths. Graph Health and build
validation identify unresolved bindings rather than silently supplying a value.
A widget appearing in the editor is not a promise that every generator can
evaluate every wire connected to it.

| Symptom | What to check |
| --- | --- |
| No widget graph ports | Add widgets in Edit screen design; the empty document only has its Screen Design content output. |
| Control snaps back after release | Inspect its Set wire; that source becomes authoritative after touch. |
| Template does not control playback | Connect widget outputs through Player Controls to Music Player. |
| Build reports an unsupported widget input | Replace the upstream path with supported scalar nodes, or use a normal sketch where that path is supported. |
| Screen document size does not match | Reopen the editor after changing the mounted module or rotation and resolve the reported size/layout issue. |
| Asset preparation or trust issue | Choose an installed asset and complete the project's trust review before building. |
| Pin conflict | Check exact module identity, shared bus pins, and separate chip-select lines in Hardware and Graph Health. |

### Known integration gaps

The software repairs from the 2026-09-08 review are implemented: slideshow
controls and TFT-only Show Status share selection state, mounted panels own
geometry and Enabled, shared/unmounted documents have explicit build rules,
RAM estimates use the mount plan, and Run readouts repaint. The compile fixtures
now use the panel/document model. Fresh compile runs and physical validation
remain separate gates; see [the active checklist](../../todo.md).

The [compile record](../development/display-compile-checks.md) preserves historical
normal/show/player builds through both toolchains; it is not a fresh validation
of the panel/document split. Calibration, rotation on real modules, bus sharing
under load, LED rate and runtime memory still require physical checks. The
calibration wizard is not implemented; default numeric bounds are not a measured
calibration for your module.
