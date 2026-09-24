# Display node reference

Physical displays are root-level Hardware parts. A colour panel may
carry a **screen design** on itself (`displayId`); there is no separate
document node and no Screen Design cable. Widget outputs leave through
the companion **Touch** node. The
[workbench guide](../user/hardware-workbench.md#add-and-connect-a-display)
describes the current flow; in-app Help describes the same ownership.

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

Connect one **Display** wire from RTC Clock, Music Player, Pattern Slideshow,
or an LED output. It shows the time, elapsed playback position, pattern
number, or whole percent of effective fixture brightness respectively.
Unwired digits show dashes. A raw float or a Format Number string does not
fit this socket; use a custom-screen readout for those values.

Set brightness, leading zeros, decimals, colon, and enabled state on the graph
node where applicable. The TM1637 has a colon; the MAX7219 module does not.
TM1637's two wires are not I²C and cannot be shared between modules. MAX7219 can
share SPI clock and data with compatible devices while retaining its own load
line.

## Info Display

Connect the source's **Display** output to the OLED's **Display** input. RTC
Clock supplies the clock screen, Music Player supplies now-playing information,
Pattern Slideshow supplies the pattern browser, and an LED output supplies
LED Status. There is no layout selector; an unwired panel explicitly reports
that state. Rotation and enabled state are graph settings.

The slideshow owns the current pattern and highlighted selection. The OLED
reports that state; physical browsing controls go to Pattern Slideshow's named
action inputs, or through Control Map when you want a compact bundle. Pattern
thumbnails are baked during export, so upload again after changing the
collection.

Select the actual OLED module before assigning pins. The SH1106 SPI module is
not interchangeable with the SSD1306 I²C module. For SSD1306, match its address
and use the same SDA/SCL pair as the other I²C parts in the sketch.

## Display Panel

Connect **Display** from RTC Clock, Music Player, Pattern Slideshow or
an LED output for Clock, Now Playing/Fixed Transport, Show Status or
LED Status respectively. The source chooses content; presentation only
chooses among that source's treatments. Unwired panels say Waiting. A
custom screen is created on the panel with **Create screen design**;
the panel keeps its Display wire, which bound widgets read. Enabled
remains a separate input/property.

For fixed music touch on XPT2046, wire named Touch outputs such as
**Play / Pause** directly to matching Music Player action inputs, or
route **Touch Controls → Control Map Controls In → Music Player
Controls** when you want one compact bundle, continuous
volume/brightness, chaining or repeat settings. Show Status and Clock
are read-only. For custom touch, wire individual widget outputs from
the companion **Touch** node; the fixed-layout Controls output does not
replace those widget ports. **Connect template controls** draws the
obvious wires (Volume direct, Play/Pause through a Changed Trigger,
Blackout through a Not) without overriding a connection you already
made.

The normal generator can render a clock. Show/player templates only read their
own supported source kinds, so an arbitrary RTC wire there remains unresolved.

### Diagnostics and touch bounds

On the panel's graph node, choose **Diagnostics** in the layout menu for a
self-test. It overrides a screen design as well as the fixed layouts, so there
is nothing to disconnect first, and the **Display** source wire can stay
connected. Diagnostics shows mapped touch coordinates on XPT2046 modules and
identifies a non-touch panel as such. Choose the previous layout to return to
your content. Upload the changed design to run the check on the device.

The companion **Touch** node owns **Touch X Min/Max** and **Touch Y Min/Max**.
These are raw 0–4095 bounds from the exact digitiser; the 200/3900 defaults are
provisional. **Calibrate touch** measures them.

The wizard drives the board itself. Choose the port, press **Upload calibration
sketch**, and it flashes a small measuring sketch built from the panel alone —
no LED output, no graph validation, no FastLED — then opens serial and reads
the `FLS_STAT touchx=<value> touchy=<value>` lines it prints while the glass is
held. The panel shows four numbered boxes matching the wizard's corner map;
press the middle of the one it asks for, and a dot is left where the press
landed. Saving writes the bounds to the Touch node and releases the port. The
board is left running the measuring sketch, so upload your project again
afterwards.

The run also measures **which way the digitiser counts**, saved as **Touch Flip
X** and **Touch Flip Y**. A range cannot carry that — the same two numbers
describe an axis read in either direction — so a reversed panel used to map
every press to the mirror of where it happened while the calibration itself
looked correct. The wizard names the finding before you save.

The dots are drawn through whatever calibration is currently saved, so they are
the check as well as the feedback: before a run on a reversed panel they land on
the opposite side to your finger, and after saving and reopening the wizard they
land under it. The readings sent over serial are always the raw ones, so a
re-run measures the hardware rather than its own previous answer.

Diagnostics still shows mapped pixels, not raw samples, and browser touches
cannot calibrate the physical controller.

## Touch

A touch-capable panel arrives as two nodes: the **Display Panel** and a
**Touch** node beside it, added together by taking the module off the shelf and
linked from that moment. The digitiser is a separate chip from the display
controller, which is why it is a separate node; its five lines are still pins on
the panel, where the Build Diagram and the pin checker look for them.

Touch has no inputs. It has a compact **Controls** output plus named outputs for
the actions the current fixed layout defines — Previous, Play/Pause, Next and
volume on **Fixed Transport**; play/pause and volume on **Now Playing**; nothing
on read-only layouts such as Show Status or Waiting. Wire a named output
directly to the destination that owns it, or wire **Controls** to **Control Map**
when you want a bundled path.

A panel showing a screen design has no fixed layout underneath for Touch to
read. The design owns the touch instead: each Button, Toggle, Slider and Dial
publishes on its own output on the companion Touch node. The controls a
template placed (Previous, Play, Next, Volume, Brightness and Blackout) also
travel on **Controls**, so a Now Playing design drives Music Player through that
one wire. A control whose own output you have wired keeps that job and leaves
the bundle, so a tap never fires twice.

The output rests at zero whenever the panel is disabled or the module has no
touch controller, so a dark panel cannot hold the last press anybody made.

## Screen Design

Click **Create screen design** on a physical TFT panel to create, size and open
its design; **Edit screen design** reopens it. A design belongs to the panel it
was drawn on, so it is always the size of that glass and there is no separate
document to add, connect, or accidentally attach to two panels at once. To reuse
a design, duplicate the panel — the copy gets a design of its own.

Design adds and resizes widgets or inserts ordinary widget templates. Module,
pins and mounted rotation belong to the panel. A template's readings arrive
bound to whatever is wired into the panel (see **Widget ports** below). When
the destination is unambiguous, **Connect template controls** draws the
control wires as ordinary graph edges (Volume direct, Play/Pause through a
Changed Trigger, Blackout through a Not) without overriding a connection
you already made.

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

An input appears only for a widget reading **A wire from the graph**. Set a
widget's **Reads** row to a field of the panel's source instead — Title, Elapsed,
Time — and it takes that value directly, with no socket and no cable. Outputs are
unaffected: a control still reports what a finger did to it either way. The
fields on offer are whatever the source wired into the panel publishes, narrowed
to those the widget can show, so a track title is never offered to a progress
bar.

The panel exposes widget input roles, and the companion Touch node exposes
widget output roles, so a new empty screen adds no widget ports to either node.
A widget with one port uses its widget label on the graph socket; a control with
multiple ports appends Output or Set. The inspector shows the role and type. For
a first connection, add a Slider and Numeric Readout and connect the slider's
Output on Touch to the readout's Value on the panel. For formatted text, insert
Format Number between the slider and a Text widget. For music-player actions,
connect widget outputs directly to named action inputs where available, or use
Control Map when you need chaining, repeat settings or a bundle. A player's
Volume is a direct property input. SD-player fixture brightness still goes
through Control Map; a direct LED output Brightness wire is refused on that
build.

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
All nine built-in templates — Clock, Now Playing, Minimal Transport, Pattern
Deck, Show Status, LED Performance, Audio Reactor, Diagnostics, and DMX Monitor
— have separate 320×240 and 240×320 compositions. The editor places the portrait
composition directly rather than squeezing or clipping the landscape one.
The shelf is ordered by what the panel is wired to. The layouts that source can
fill come first, under a **Mapped to** heading naming it — Now Playing and
Minimal Transport for a Music Player, Pattern Deck and Show Status for either a
player or a Pattern Slideshow, Clock for an RTC — and everything else follows
under **Other layouts**. Which templates are mapped is derived from the readings
each one already takes from the panel's source, so nothing is hidden: the four
templates that read every value off the graph (LED Performance, Audio Reactor,
Diagnostics, DMX Monitor) are correct on any panel, and a panel with no source
yet shows one ungrouped list.

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
| No widget graph ports | Add widgets in Edit screen design; an empty design has no widget ports yet. Bound readouts mint none. Control outputs appear on the companion Touch node. |
| Control snaps back after release | Inspect its Set wire; that source becomes authoritative after touch. |
| Template does not control playback | Use **Connect template controls**, or wire Touch outputs to Music Player action inputs (or through Control Map when the control is bundled). |
| Build reports an unsupported widget input | Replace the upstream path with supported scalar nodes, or use a normal sketch where that path is supported. |
| Screen document size does not match | Reopen the editor after changing the mounted module or rotation and resolve the reported size/layout issue. |
| Asset preparation or trust issue | Choose an installed asset and complete the project's trust review before building. |
| Pin conflict | Check exact module identity, shared bus pins, and separate chip-select lines in Hardware and Graph Health. |

### Known integration gaps

The software repairs from the 2026-09-08 review are implemented: slideshow
controls and TFT-only Show Status share selection state, panels own their
geometry and Enabled, RAM estimates use the mount plan, and Run readouts
repaint. A design shared between panels or attached to none — which those
repairs gave build rules for — is no longer possible to express, since a panel
owns its design outright. Fresh compile runs and physical validation
remain separate gates; see [the active checklist](../../todo.md).

The [compile record](../development/display-compile-checks.md) preserves historical
normal/show/player builds through both toolchains; it is not a fresh validation
of the panel/document split. Calibration, rotation on real modules, bus sharing
under load, LED rate and runtime memory still require physical checks. The
browser calibration wizard is implemented, but its raw-sample firmware emitter
and on-device verification remain separate work; default numeric bounds are not
a measured calibration for your module.
