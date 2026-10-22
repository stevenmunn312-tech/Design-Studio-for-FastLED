# Display node reference

Physical displays are root-level Hardware parts. A colour panel references
a **screen design** through `displayId`; panels can share a design. Widget
outputs leave through the companion **Touch Screen** node. The
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
| Info Display | SSD1306 0.96-inch (Adafruit) | 128×64 OLED, STEMMA QT I²C breakout, address 0x3C or 0x3D |
| Display Panel | ST7789 1.54-inch | 240×240 colour TFT, SPI, no touch |
| Display Panel | XC4630 2.8-inch shield + touch | 320×240 ILI9341 TFT, 8-bit parallel, resistive touch sharing panel lines |
| Display Panel | ST7789V 2.4-inch + touch | 240×320 colour TFT, SPI, XPT2046 touch with its own header |
| Display Panel | ILI9341 2.8-inch + touch (DFR0665) | 320×240 colour TFT, SPI, XPT2046 touch and microSD |

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

The slideshow owns the current pattern. The OLED reports it; physical
Previous, Next and encoder controls go to Pattern Slideshow's named action
inputs, or through Player Controls when you want a compact bundle. A step
changes the pattern on the LEDs straight away, with the usual transition, and
a step during a transition cuts to the new pattern. Pattern
thumbnails are baked during export, so upload again after changing the
collection.

Select the actual OLED module before assigning pins. The SH1106 SPI module is
not interchangeable with the SSD1306 I²C module. For SSD1306, match its address
and use the same SDA/SCL pair as the other I²C parts in the sketch.

## Display Panel

Connect **Display** from RTC Clock, Music Player, Pattern Slideshow or
an LED output for Clock, Now Playing/Fixed Transport, Show Status or
LED Status respectively. The source chooses content; presentation only
chooses among that source's treatments. Unwired panels say Waiting.
Now Playing and Show Status picture what the LEDs are showing, live, in a
96-pixel square: a matrix at whole pixels per LED, a strip as bands across the
square. Any size of collection is pictured, and nothing is baked at upload.
While you browse, the pattern you are looking at is named, not pictured; the
picture stays on what is running. The device redraws the picture ten times a
second.
**Layout** also always offers **Custom design**, the panel's own screen:
choosing it creates the design the first time and enables **Edit screen
design**. The panel keeps its Display wire, which bound widgets read.
Enabled remains a separate input/property.

For fixed music touch on XPT2046, wire named Touch outputs such as
**Play / Pause** directly to matching Music Player action inputs, or
route **Touch Controls → Player Controls Controls In → Music Player
Controls** when you want one compact bundle, continuous
volume/brightness, chaining or repeat settings. Show Status and Clock
are read-only. For custom touch, wire individual widget outputs from
the companion **Touch Screen** node; the fixed-layout Controls output does not
replace those widget ports. **Connect template controls** draws the
obvious wires (Volume direct, Play/Pause through a Changed Trigger,
Blackout through a Not) without overriding a connection you already
made.

The normal generator can render a clock. Show and player templates do the same
for a wired RTC Clock of any source. An NTP clock starts the sketch's network
in those builds too, over Wi-Fi or the wired link.

### Diagnostics and touch bounds

On the panel's graph node, choose **Diagnostics** in the layout menu for a
self-test. It overrides a screen design as well as the fixed layouts, so there
is nothing to disconnect first, and the **Display** source wire can stay
connected. Diagnostics shows mapped touch coordinates on XPT2046 modules and
identifies a non-touch panel as such. Choose the previous layout to return to
your content. Upload the changed design to run the check on the device.

The companion **Touch Screen** node owns **Touch X Min/Max** and **Touch Y Min/Max**.
These are raw 0–4095 bounds from the exact digitiser; the 200/3900 defaults are
provisional. **Calibrate touch** measures them.

The wizard drives the board itself. Choose the port, press **Upload calibration
sketch**, and it flashes a small measuring sketch built from the panel alone —
no LED output, no graph validation, no FastLED — then opens serial and reads
the `FLS_STAT touchx=<value> touchy=<value>` lines it prints while the glass is
held. The panel shows four numbered boxes matching the wizard's corner map;
press the middle of the one it asks for, and a dot is left where the press
landed. Saving writes the bounds to the Touch Screen node and releases the port. The
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

## Touch Screen

A touch-capable panel arrives as two nodes: the **Display Panel** and a
**Touch Screen** node beside it, added together by taking the module off the shelf and
linked from that moment. The digitiser is a separate chip from the display
controller, which is why it is a separate node; its five lines are still pins on
the panel, where the Build Diagram and the pin checker look for them.

Touch Screen has no inputs. It has a compact **Controls** output plus named outputs for
the actions the current fixed layout defines — Previous, Play/Pause, Next and
volume on **Fixed Transport**; play/pause and volume on **Now Playing**; nothing
on read-only layouts such as Show Status or Waiting. Wire a named output
directly to the destination that owns it, or wire **Controls** to **Player Controls**
when you want a bundled path.

A panel showing a screen design has no fixed layout underneath for Touch Screen to
read. The design owns the touch instead: each Button, Toggle, Slider and Dial
publishes on its own output on the companion Touch Screen node. The controls a
template placed (Previous, Play, Next, Volume, Brightness and Blackout) also
travel on **Controls**, so a Now Playing design drives Music Player through that
one wire. A control whose own output you have wired keeps that job and leaves
the bundle, so a tap never fires twice.

The output rests at zero whenever the panel is disabled or the module has no
touch controller, so a dark panel cannot hold the last press anybody made.

## Screen Design

Set a physical TFT panel's **Layout** to **Custom design** to create and size
its design, then **Edit screen design** to open it. On any other layout the
button is disabled and says to choose Custom design. Choosing a fixed layout
sets the design aside rather than deleting it: its widgets and wires are kept,
the fixed layout draws and reads touch, and any wire from the design's controls
reads at rest (Graph Health says how many). Choosing Custom design again brings
it back as it was. A design is the size of the glass it was drawn for.
A second panel of that same size can show it from **Screen design** on
the panel: each glass keeps its own touch and Enabled state, and **Own
copy** gives this panel a separate drawing. Duplicate still copies.
There is no separate document node to add or connect.

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

### Screens

A design can hold up to eight screens, shown as tabs above the canvas. The
panel starts on the first. **Add screen** adds an empty one after the screen
you are drawing; select no widget to rename, reorder, duplicate or delete the
screen from the inspector. Widgets, templates and pasted widgets land on the
screen you are drawing, and only that screen's widgets are checked against
each other for overlap.

Two things move the glass between screens:

- A **Button**'s **Go to screen** loads that screen when the press is released.
  The button still reports its press on its own output.
- With two or more screens the panel gains a **Screen** input. It counts the
  first screen as 0, rounds the number and holds it to the screens there are,
  and moves the glass only when the screen it selects changes, so a steady
  value leaves the buttons free to move. On a build's first pass it shows the
  screen the input selects.

Controls on a screen that is not showing keep the value they last had, in the
preview and on the device. Deleting a screen deletes what is drawn on it,
except wired controls, which return to **Connected**; buttons that went to it go
nowhere. Run and the panel thumbnail show the screen the panel is on.

### Widget ports

| Widget | Input | Output |
| --- | --- | --- |
| Text, Marquee | Text: string (Value role) | — |
| Numeric Readout, Progress, Value Meter, Arc Gauge, Chart | Value: float | — |
| Spectrum | Audio: audio (Value role) | — |
| Timecode | Seconds: float (Value role) | — |
| Status Indicator | Value: boolean | — |
| Colour Swatch | Colour: colour (Value role) | — |
| Pattern Browser | Pattern: pattern selection (Value role) | — |
| Image / Icon | Asset selected in the inspector | — |
| Button | — | Output: boolean |
| Toggle | Set: boolean, optional | Output: boolean |
| Slider, Dial, Step Control | Set: float, optional | Output: float |
| Choice Strip | Set: float, optional | Output: float, the chosen option counting the first as 0 |
| Colour Picker | Set: colour, optional | Output: colour |
| Text Entry | Set: text, optional | Output: text |

A **Choice Strip** divides its width evenly between two to six options, typed
as one comma-separated list (`Calm, Party, Strobe`). It outputs the chosen
option's position, the first being 0, so it can drive anything that takes a
number. A Set value is rounded and held inside the options. Give each option at
least 48 px of width; Graph Health reports a strip too narrow for its options.

A **Step Control** is a minus key, the value and a plus key. Each press moves
the value one Step inside Minimum and Maximum, and a held key repeats. It shows
the value to the precision of its Step. Like a Slider, a new Step Control wired
to a property takes that property's range, and it can carry Volume or
Brightness on a template's Controls wire.

A **Colour Picker** is a strip of every hue, red at both ends. Drag along it to
pick a colour; the output is that hue at the picker's own **Saturation** and
**Brightness**. A colour wired to Set moves the marker to that colour's hue, so
a grey or black moves it to red. Its colour wire works in all three firmware
builds. Unlike FastLED's `CHSV`, the colours match the strip drawn under your
finger exactly, with no boosted yellow. Drag from the Touch Screen node's **Add
control…** socket onto any colour input that holds a colour of its own — a
Solid Colour's Color, a Blend's A or B, a Circle's Fill — and a picker is made
that starts at that colour. Picking a colour in that node's own colour row
while the picker drives it moves the picker to the colour's hue.

An **Arc Gauge** draws a number between Minimum and Maximum as a 270-degree arc
with the gap at the bottom, the reading in the middle formatted by its Decimals,
Prefix and Suffix. Turn off **Show value** for the arc alone. It takes no touch.

A **Marquee** is one line of text that never stops moving: it starts at the
left edge, travels left at its **Speed** in pixels per second until it has
gone, then enters again from the right. It moves even when the text would fit,
which is the difference from a Text widget with **Scroll text that does not
fit**, whose title stands still until it is too long. New text, wired or read
from the panel's source, carries on from where the old text had reached. The
default speed, 40 pixels per second, is the one a scrolling Text uses. A
Marquee repaints its whole box on every frame it moves, so keep it to the one
line it needs.

A **Chart** plots a number over time. It takes a reading every **Seconds
between readings**, by the clock rather than when the value changes, so a
steady value draws a flat line, and keeps the newest **Readings shown** (8 to
64) with the newest on the right. Readings are placed between **Minimum** and
**Maximum**; a reading that is not a number leaves a gap. Its **Style** is a
line or bars. It starts empty in the preview and on the device and fills from the
left as it reads. Wire it like a Numeric Readout, or set its **Reads** row to
a field of the panel’s source, such as a power monitor’s watts.

A **Spectrum** draws live audio as **Bars** (4 to 32), bass on the left. Wire
the **Audio** node's output to it, as you would to an FFT Analyzer. It folds
the analyser's 32 bands into its bars and redraws at most 20 times a second.
It needs a normal sketch with a microphone or line input: the generative show
and the SD player report that they do not analyse live audio for it.

A **Text Entry** is a one-line text field. Tap it and the panel's keyboard
opens at the bottom of the screen; type, then press the tick key (or Enter) to
confirm, or the close key to put back the text it had. Its output is the
confirmed text, never half a word, so it can feed a Text, a Marquee or any
other text input. It starts with **Starts with** and holds at most **Maximum
length** characters, up to 63 bytes. Text typed on the device is kept until
the board restarts. A text wired to **Set** replaces it while nobody is typing.
One keyboard serves every Text Entry on a panel, and a design with none
compiles no keyboard. In Run, click the field and type with your own keyboard.

An input appears only for a widget reading **A wire from the graph**. Set a
widget's **Reads** row to a field of the panel's source instead — Title, Elapsed,
Time — and it takes that value directly, with no socket and no cable. Outputs are
unaffected: a control still reports what a finger did to it either way. The
fields on offer are whatever the source wired into the panel publishes, narrowed
to those the widget can show, so a track title is never offered to a progress
bar.

The panel exposes widget input roles, and the companion Touch Screen node exposes
widget output roles, so a new empty screen adds no widget ports to either node.
A widget with one port uses its widget label on the graph socket; a control with
multiple ports appends Output or Set. The inspector shows the role and type. For
a first connection, add a Slider and Numeric Readout and connect the slider's
Output on Touch Screen to the readout's Value on the panel. For formatted text, insert
Format Number between the slider and a Text widget. For music-player actions,
connect widget outputs directly to named action inputs where available, or use
Player Controls when you need chaining, repeat settings or a bundle. A player's
Volume is a direct property input. SD-player fixture brightness still goes
through Player Controls; a direct LED output Brightness wire is refused on that
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

A design drawn for a measured panel is checked against that glass, not only
against the 320 × 240 reference screen. With no widget selected, the
inspector states the panel's diagonal, its pixels per millimetre, how large a
control must be to hit every time (a 6 mm fingertip plus the touch surface's
own error on each side), how far apart two controls must be, and the smallest
text that reads at arm's length (1.8 mm). **Layout issues** name each control
or text that falls short, in millimetres. These are warnings: the design
builds and works as drawn, and the same design opened for another panel is
checked against that one.

Widgets may overlap. A widget added later draws over an earlier one, and
**To front**, **Forward**, **Backward** and **To back** in the inspector change
that order (Ctrl/Cmd+] and Ctrl/Cmd+[, with Shift to go all the way). Only a
control takes a touch: text, readings, images and containers let a press
through to whatever control is under them, on the panel as in the Run preview,
so a label can sit on a button. Two controls over each other are reported,
because the panel gives the press to the upper one and the lower can only be
reached where it shows.

A **Container** is a framed panel for grouping. Drop a widget wholly inside
one, or move or resize a container round widgets, and they become its
contents: they move, copy, cut and delete with it, draw over it, and are cut
off at its edge. Drag a widget out of it, even partly, to take it out.
Resizing never takes a widget out; one that no longer fits is reported as cut
off. Containers do not hold other containers. A wired control deleted with its
container goes back to **Connected**, as when it is deleted on its own.

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
All ten built-in templates — Clock, Now Playing, Minimal Transport, Pattern
Deck, Show Status, LED Performance, Audio Reactor, Diagnostics, DMX Monitor,
and Power Monitor — have separate 320×240 and 240×320 compositions. The editor
places the portrait composition directly rather than squeezing or clipping the
landscape one.
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
Sin, Cos, Compare, Trigger, Step Value, Interval, Time, Wave, Text Value, and
Format Number. Supported GPIO buttons,
button banks, potentiometers, and encoders can participate; SD-player displays
can also use supported Song Info fields from an unpacker wired to the player.

Interval uses the firmware's elapsed-millisecond timer and accepts a wired
period. Computed pulses bypass contact debounce; physical buttons retain it.
The music player's track-position clock is unchanged.

Time and Wave share one animation-clock snapshot in a slideshow. Master Speed
scales that clock and a wired speed applies on the next pass; dwell and
transitions keep elapsed time. In an SD player, root Time/Wave controls use
elapsed time and remain separate from the track-position clock used to render
patterns. Time's Delta Time output retains its nominal 1/60-second value.
Clock, Envelope, Noise LFO and Schedule Trigger share the
normal emitters and keep wall-clock milliseconds, so Master Speed does not
scale them. A wired RTC Clock of any source can feed a Schedule Trigger and a
Clock layout; an NTP clock brings the network bootstrap into the build.

Supported scalar nodes keep that behaviour inside groups, including a contact
forwarded through a group input. A Colour Swatch accepts a self-contained
colour node, and the device stores that colour packed at the swatch. A Pattern
Browser names the pattern the running slideshow or player is showing. An LED
output wired to a panel reports that output's own name, count, blackout and
level when the template drives it. Palette sources, a pattern selection from
any other node, an output the template does not drive, and Smooth,
Random and DMX Channel still fail explicitly.
Graph Health and build validation identify unresolved bindings rather than
silently supplying a value.
A widget appearing in the editor is not a promise that every generator can
evaluate every wire connected to it.

| Symptom | What to check |
| --- | --- |
| No widget graph ports | Add widgets in Edit screen design; an empty design has no widget ports yet. Bound readouts mint none. Control outputs appear on the companion Touch Screen node. |
| Control snaps back after release | Inspect its Set wire; that source becomes authoritative after touch. |
| Template does not control playback | Use **Connect template controls**, or wire Touch outputs to Music Player action inputs (or through Player Controls when the control is bundled). |
| Build reports an unsupported widget input | Replace the upstream path with supported scalar nodes, or use a normal sketch where that path is supported. |
| Screen document size does not match | Reopen the editor after changing the mounted module or rotation and resolve the reported size/layout issue. |
| Asset preparation or trust issue | Choose an installed asset and complete the project's trust review before building. |
| Pin conflict | Check exact module identity, shared bus pins, and separate chip-select lines in Hardware and Graph Health. |

### Known integration gaps

The software repairs from the 2026-09-08 review are implemented: slideshow
controls and TFT-only Show Status share selection state, panels own their
geometry and Enabled, RAM estimates use the mount plan, and Run readouts
repaint. Panels can share a design through `displayId`. Fresh compile runs and
physical validation remain separate gates; see [the active checklist](../../todo.md).

The [compile record](../reports/compile/display-compile-checks.md) preserves historical
normal/show/player builds through both toolchains; it is not a fresh validation
of the panel/document split. Calibration, rotation on real modules, bus sharing
under load, LED rate and runtime memory still require physical checks. The
browser calibration wizard and its raw-sample firmware emitter are implemented,
but on-device verification remains separate work; default numeric bounds are not
a measured calibration for your module.
