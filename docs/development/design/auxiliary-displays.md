# Auxiliary displays — design note

Status: in progress; the `string` signal, the Music Player's song-information
outputs, the TM1637 and MAX7219 Segment Displays and the Info Display have
shipped. The SH1106 OLED is
the first device driven on real hardware: panel, font, refresh and mounted
rotation confirmed on a bench, on an ESP32-S3 over 4-wire SPI. The SSD1306's I²C
transport is written and tested but has not been on a bench · Owner: app ·
Date: 2026-08-27

Gives a build a second screen: a 7-segment module showing BPM, an OLED naming
the pattern the encoder is about to select, a colour TFT running a now-playing
screen you can actually press. Studio has one visual output today, and it is the
LED fixture itself — anything a build wants to *say* has to be spelled out in
pixels on the tape or not said at all.

In this note **LED output** means the existing `MatrixOutput` node in any of its
forms, and **display** means a separate 7-segment, OLED, or TFT peripheral. The
work sequence, the device list, and the per-phase checklists live in
[`display-todo.md`](../../../display-todo.md); this note records the contracts
that sequence has to hold to.

## What is not decided here

Nothing in this note is a support claim.
[`docs/release/beta-support-matrix.md`](../../release/beta-support-matrix.md)
remains the only authority on what works, and it gets a row for an exact
board/module/bus/generator combination after that combination has been tested on
real hardware — not after it compiles. The modules named below have been ordered
and none has been on a bench. Every library named below is a candidate to be
pinned after the Phase 0 spike, not a decision already taken.

## The display is a part first

A display follows the two-view model in
[hardware nodes](hardware-nodes.md) exactly as an LED output does. The hardware
workbench owns whether the part exists, which exact module it is, where its pins
land, and how it is wired. The graph owns what flows into it and, for a touch
device, what flows out.

That makes displays root-graph nodes, read through `rootGraphNodes` /
`rootGraphEdges` and written to the root even while a pattern group is the open
graph. The rule is not new and the reason has not changed: a part is a physical
fact about the bench, and a bench does not change because the user opened a
subgraph. A display must also stay visible and configurable in the hardware pane
while a group is being edited.

Displays cannot be pulled into a group or saved into a reusable pattern. That
falls out of hardware ownership rather than needing a second exclusion list —
`isHardwareNodeType` in `src/state/hardware.ts` already means "root only", and
displays join it rather than acquiring a parallel rule that can drift.

## Two kinds of display node

**Fixed nodes** — `SegmentDisplay`, `InfoDisplay`, `TransportDisplay` — have
stable, declared ports like every other node in `NODE_LIBRARY`. A port is what a
cable attaches to: a node whose ports move when a label changes is a node whose
cables silently break.

The two **simple** panels went further than stable ports and now have a single
content input, `Display`, with no layout property at all — what is plugged in
decides what the panel shows. That model, and what an unwired panel says instead
of sitting blank, is in [simple displays](simple-displays.md); the rest of this
note is about the parts themselves. `TransportDisplay` is a tier-3 panel and
still resolves per port.

The Info Display's Pattern Browser screen reads the shared selection contract
rather than tracking an index of its own — active versus highlighted, wrapping,
confirm, and what happens when the collection changes are defined once in
[the generative pattern show note](generative-pattern-show.md#which-pattern-is-playing).

### Which displays get a design surface

The freeform editor is for the **larger touch panels only**. Segment modules and
the small OLEDs get one predetermined screen per source, and nothing else.

Three reasons, and the first is the one that settles it: you cannot pick a
widget on a screen you cannot touch. A drag-and-drop UI whose output has no
pointer is a layout tool, not an interface — every interactive widget in the
palette above is dead on a panel with no touch controller, which leaves labels
and readouts, which is what a preset already is.

Second, a 4-digit 7-segment module and a 128x64 one-bit panel have no room to
design in. Every pixel is load-bearing at that size, and a hand-placed layout on
one is reliably worse than a preset that was tuned once against the real glyph
metrics. The constraint is doing the design work; exposing it as freedom mostly
exposes the ways it can go wrong.

Third, the freeform path costs a widget palette, a persisted document format,
LVGL codegen and asset baking. That is repaid on a screen big enough to be worth
designing and not on one that shows four digits.

So the tiers are:

| Display | What the user picks |
| --- | --- |
| Segment (TM1637, MAX7219) | A mode from a dropdown |
| Info Display (SH1106, SSD1306) | A layout from a dropdown, with presets bindable to buttons |
| Touch TFT (ST7789V + XPT2046, CYD) | Fixed layouts first, then the freeform editor |

Segment modes are `Number`, `Clock` and `Index` today, with a timer/countdown
and an elapsed/duration mode to come. Two notes on those. A wall clock needs a
time source rather than a board feature, so "hardware dependent" is expressed as
an unwired `dateTime` showing dashes and validation saying an RTC is wanted — a
display that invents midnight is worse than one that admits it does not know.
And a *duration* is not a wall clock even though both read `M:SS`: one counts
from zero and the other rolls over at 24 hours, so it is a separate mode rather
than a flag on Clock.

**The freeform `Display` node** is the only node with widget-derived dynamic
ports, and it is deliberately last. It owns a `displayId` and derives its ports
from the widgets in the matching `DisplayDocument`.

The fixed nodes are not a stepping stone to the freeform one. They are the
deliverable for anyone who wants a clock, a pattern name, or a transport screen
without drawing a UI, and they ship first because they can.

### Port identity

Every outer port id on the freeform node derives from the widget's stable id and
a stable role declared by the widget registry — never from its editable label
and never from its position in the widget array. A one-port readout may use
`widget:<id>:value`; a synchronized control reserves `widget:<id>:out` and
`widget:<id>:set`; a later multi-axis control may use `widget:<id>:x` and
`widget:<id>:y`. Renaming or reordering a widget must not break a cable, and the
model must not assume that every widget has exactly one port.

Changing a widget to an incompatible port shape is a create-new/delete-old
operation, not an in-place type mutation, because the old cable was type-checked
against the old role and there is no honest way to carry it across. Removing a
wired widget requires confirmation and removes its edges atomically.

### A control-surface palette, not an LVGL catalogue

The freeform UI is for music, LEDs and live-show hardware. Its launch palette is
Text (`string` in), Numeric Readout (`float` in), Timecode (`float` seconds in),
Progress (`float` 0–1 in), Value Meter (`float` in), Status Indicator (`bool`
in), Colour Swatch (`color` in), Pattern Browser (`patternselect` in),
Image/Icon (no port), Button (`bool` out), Toggle (`bool` out with reserved
state input), Slider (`float` out with reserved state input), and Dial (the same
value contract with vertical-drag touch interaction).

Button is one semantic widget with text, icon, or text-plus-icon presentation;
there are not separate transport or image-button behaviours. Now Playing,
Minimal Transport, Pattern Deck, LED Performance, Audio Reactor, Diagnostics
and DMX Monitor are templates composed from ordinary widgets. A template mints
the same visible typed ports as placing those widgets individually and never
gets a private player or graph runtime.

Colour Picker, Choice Strip, Step Control, XY Pad, Launch Pad and Arc Gauge are
the next palette after the one-screen runtime is proven. They are named now so
the registry and port-role model leave room for `color`, indexed and multi-role
outputs without making them launch requirements. Charts, waveform/spectrum
histories and animated marquees wait on measured display bandwidth.

The first editor has two visual layers: one background owned by `DisplayTheme`
(solid, gradient or validated baked image), then one non-overlapping widget
layer. The theme also owns surfaces, text, accent/warning/success colours,
approved font faces and sizes, corner/border treatment, and default, pressed,
active, inactive and disabled states. This permits authored skins without
opening arbitrary z-order or containers. Graph-type-coloured port notches are
an editor-only Design-mode aid and never become generated screen content.

### Asset library contract

Documents store validated asset ids, never source paths. The asset registry
resolves each id to its kind, intrinsic size, tintability, vector/raster source,
allowed display classes and estimated generated flash cost. The required design
library is a canonical semantic-glyph set, palette thumbnails for every launch
and named follow-on widget, theme tokens, optional theme-owned backgrounds at
the supported screen sizes, and reference previews for every starter template.
The themed player-control art is the same kind of registered source material,
not a second widget catalogue.

Default, pressed, active, inactive and disabled appearances are token-driven.
The importer/code generator bakes only the sizes, colours and states used by a
document instead of storing a complete raster matrix for every theme. Template
previews are design references only: inserting a template still creates
ordinary widgets, and generated firmware never embeds the preview screenshot.
External source-art working folders and their manifests are build-time handoff
inputs; neither a saved workspace nor generated C++ may depend on those paths.

Normal-sketch upload, export, code view and capacity checks prepare custom
display assets through `useCustomDisplayAssets` before calling the generator.
Only documents owned by root display nodes are baked, and image fetching waits
for workspace trust. Both build consumers share in-flight and successful bakes
per immutable document. Document edits invalidate the generated code immediately;
late completions cannot replace newer screen data. Preparation errors name the
display and block the build, with a shared retry action. A capacity check never
measures a placeholder screen while the real artwork is pending or failed.
`generateCpp` receives finished bytes keyed by node id and emits validated
PROGMEM tables before the LVGL objects reference them. Show/player custom-screen
generation remains gated separately until those generators support its bindings.

### The persisted document

```ts
interface DisplayDocument {
  schemaVersion: 1
  displayId: string
  designSize: { width: number; height: number }
  gridSize: number
  theme: DisplayTheme
  widgets: DisplayWidget[]
}

interface DisplayWidget {
  id: string
  type: DisplayWidgetType
  label: string
  bounds: { x: number; y: number; width: number; height: number }
  properties: Record<string, unknown>
}
```

`designSize` is a snapshot used to notice that the module or its resolution
changed. It is not the authority — the hardware node's `partId`, rotation, and
pins are. Two records of the same fact will disagree eventually, so only one of
them is allowed to be believed.

The document stores no cables, no live values, no selection or hover state, and
no physical pins. Those belong to the graph, the runtime store, the editor
session, and the hardware node respectively.

`displayDocuments` is an optional workspace field. A workspace saved without one
loads as an empty registry. There is no pre-1.0 migration path and none will be
written: `Hardware` is the breaking line, and the v1.0.0 format is the
compatibility baseline that starts *after* release.

### Widget metadata is data

A widget is declarative. Nothing in a `DisplayDocument` is evaluated, and
nothing in one becomes a C++ identifier. A label is display text; an asset name
is a lookup key. Imported documents pass a normalizing validator with hard
limits — widget count, document count, integer bounds, bounded design and grid
size, label length, and a per-type property whitelist — before anything reads
them, and unknown types or keys are dropped rather than carried through.

This is the same trust boundary the workspace already draws around
`CustomFormula`, `FieldFormula`, and `Code` nodes, and it exists for the same
reason: an imported workspace is someone else's file.

## Signals a display needs

### `string`

Text is the one thing every display class needs and the graph could not carry.
`string` is a real port data type — its own colour, its own help
copy, and no implicit conversion. It connects to `string` only. `float` and
`bool` interconvert with each other because a number and a flag are the same
quantity at different resolutions; a string is not, and a silent
number-to-string coercion would put formatting decisions somewhere no one can
see them. `FormatNumber` exists so those decisions are a node.

Generated strings are bounded UTF-8 in fixed buffers. One shared module —
`src/state/displayText.ts` — declares the byte budget, truncates on code-point
boundaries, defines the ellipsis behaviour, and defines the fallback for a
character the target cannot draw. Both the evaluator and the C++ generator
import it, because preview/firmware parity is not something two independent
implementations achieve by agreement.

The supported glyph set derives from the bitmap font in `src/state/font.ts`.
That is the glyph data the OLED slice rasterises with, so deriving the set from
anywhere else would let the preview promise a character the firmware cannot
render.

### Bridge nodes

`TextValue`, `FormatNumber`, and `FormatDateTime` turn a property, a `float`,
and a `datetime` into a `string`. All three have shipped. `FormatDateTime` reads the same value shape
`RTCInput` already produces.

The transport is split the way the appliance is. You have a music player; you
need something to control it; a user puts music in; the player plays it and
says what it is playing. So `PlayerControls` sends commands — play/pause,
previous, next, volume, brightness — through the `playercontrols` bundle, and
`PatternMaster` (Music Player) reports back: title, artist, album, genre, year,
status, playing, elapsed, duration, remaining, progress, volume, bitrate. One
list, `SONG_INFO_PORTS` in `src/state/songInfo.ts`, defines those ports and the
field behind each, so a port cannot exist with nothing filling it.

A single `TransportControl` node that both commanded and reported shipped first
and was removed. It put the song information on a node beside the player rather
than on the player, which meant two nodes could claim to be the transport, and
the browser was the only thing that could answer "what is playing" — exactly
backwards for the case that matters most: a finished build with a card of files
the app has never seen. The device reads those tags; the browser cannot.

Which is why the empty fields are deliberate. In the browser, artist and album
stay blank because a filename is not an ID3 frame, and a wrong name on a screen
is worse than a blank row — a blank row is obviously blank. This is not one
value computed two ways that could disagree; it is a value that only exists
where the music does. On the device, `audio_id3data` and `audio_bitrate` fill
them as the file reports them, and `songReset()` clears them at every track
open so a file with no artist tag cannot wear the previous track's artist.

A touch `TransportDisplay` reads and commands through the same two ends. It
does not get its own player implementation — two player implementations would
be two definitions of what "next" means.

Runtime volume belongs to `Amplifier`, not `SDCard`. The static maximum stays
where storage can see it; live volume routes through the transport/audio
runtime.

### Button semantics, defined once

A Button widget reads `true` while pressed. A Toggle holds a boolean. Where a
sink needs a one-shot action it detects the rising edge itself. Defining this at
the widget would make "press" mean different things on different displays.

Toggle, Slider and Dial also reserve an optional graph-authoritative `set`
input beside their touch-intent `out` output. The first runtime may implement
the output-only form first, but persistence and port identity must not freeze
that limitation. With `set` wired, the finger owns the value while pressed and
the graph value wins again on release; with it unwired, the widget owns its
local state. This prevents a physical button or another control changing the
real player/output while the touchscreen continues displaying stale state.

### Master controls

LED-output enabled/blackout, brightness, and master speed are explicit runtime
inputs. The LED preview is wall-clock driven and stays that way; a display
refreshing at its own rate must not be able to move animation time.

Enabled and Brightness sit on the LED output itself, one pair per output, because
two outputs are two fixtures — a stage wash and a monitor strip do not have to be
dark together. They multiply with the Board's static brightness and with a
player's own dimming, and every factor is a cable on the canvas rather than a
hidden global. `src/state/ledOutputRuntime.ts` holds the rule; the evaluator
applies it so the main matrix, per-output previews, offline recordings and the
live stream cannot disagree, and `ledOutputRuntimeCpp.ts` applies it after the
blit, where every geometry branch has converged on the physical array.

A third port, **Controls**, takes the `playercontrols` bundle. It is not a
value like the other two: it carries a *toggle* and a *delta*, which only mean
anything against something that remembers the last press. That something is a
per-output latch — `blankLedOutputLatch` / `applyLedControls` in the same
module, mirrored by `ledOutputLatchCpp` in `codegen/playerControlsCpp.ts`.

The three combine rather than override each other: ANDed for blackout,
multiplied for level, in `composeLedOutputRuntime`. That is the rule this
section already states for every other factor, and it means neither port needs
a precedence story — an unwired one contributes its identity and disappears. A
blackout button a wired Enabled could veto is not a blackout button, which is
why blackout is the AND and not the multiply.

An LED output reads exactly three fields of the bundle: `ledToggle`,
`brightnessDelta` and an optional absolute `brightness`. A fixture has no
opinion about play/pause, previous, next, volume or which pattern is
highlighted; those travel down the same wire to a Music Player and are ignored
here. `LedControlSignal` names the three, structurally rather than importing
the evaluator's `PlayerControls`, so the honest statement of what an output
does with a bundle is in the type.

This is what a touch panel needed to be routable in a normal sketch. Before it,
`PlayerControls` had no emit case there at all — the bundle's only consumers
were the Music Player, which a normal sketch renders as a black fill, and
another Player Controls. A press had nowhere to land, so validation refused the
wire. It now lands on a fixture. `codegen/playerControlsCpp.ts` emits the
bundle from ordinary graph wires (the debounce and repeat numbers read from
`state/transportBridge.ts`, the detent size from `state/patternSelection.ts`),
and `tftTouchServiceCpp` takes a **sink** — the player's own transport
functions, or a bundle local — so which rectangle is which action stays
resolved once from the shared geometry rather than copied per generator.

Master speed is one `MasterSpeed` node, because the shared clock it scales is
one clock and cannot be per output. It scales that clock rather than rewriting
per-node speeds, so a graph's dozen individual rates keep their relationships
and a node written next year is covered without being taught anything.

Both are **accumulated, never multiplied**. `t * speed` looks equivalent and is
not: moving the knob from 1 to 2 would double `t` on the spot and every
animation in the build would leap. Time advances by `dt * speed` instead — the
browser slides its clock's origin, which is the mechanism the pause already
uses; the firmware keeps a `_tAnim` accumulator in place of `millis() / 1000`.

Both read the speed the **previous** frame resolved. That is a requirement, not
a shortcut: a control computed from scaled time could not be turned back up out
of a freeze, and in firmware the clock is emitted above the nodes that would
compute the speed. One frame of lag on a knob is imperceptible.

The music-player generator still refuses Master Speed. Its animation time *is*
the track position — patterns are synced to what is playing — so scaling it
would slide the LEDs off the music; that refusal is correct behaviour.

The Pattern Slideshow generator has two clocks instead. `now = millis()` remains
the real elapsed clock for interval expiry, transition progress and
`phaseStart`. When Master Speed is present, `_showAnimSec` accumulates only
`dt * speed`, and the resulting `animNow` is the timestamp passed to every
`renderPattern` call. At speed zero the current pattern's motion freezes, but
the slideshow still reaches its next interval, crosses the transition in its
configured number of seconds, and continues through the collection. With no
Master Speed node the generator keeps its old direct `now` path and emits no
extra clock state.

The fixed show template currently honours Master Speed's own slider. A graph
wired into its Speed input is rejected before export because the template does
not emit an arbitrary root control graph; silently baking the visible slider
while ignoring that wire would be worse than refusing it. Normal sketches and
the browser preview continue to support the wired form.

## Runtime ordering

Every frame, in this order:

1. Sample touch outputs.
2. Evaluate the control/frame graph.
3. Publish display inputs.
4. Flush changed widgets and pixels.

Fixing the order is what makes a bidirectional device deterministic. Sampling
touch after evaluation would make a press take effect a frame late in preview
and on time in firmware, or the reverse, depending on where each generator
happened to put the read.

A cable from a display's output back to an input on the same display is a cycle
across one node. It is rejected with a diagnostic, or it requires a visible
`Delay` and is defined as one tick. The sole implicit exception is a
registry-declared synchronized control's paired `out → graph → set` loop: touch
is sampled at the start of the tick and its authoritative `set` value is
published after evaluation, so that loop is explicitly one tick and does not
depend on recursion order. Every other feedback path stays rejected. What none
of them may be is whatever the evaluator's recursion guard happens to do — that
would be user-facing behaviour decided by accident.

### Displays are terminals

`reachableFromOutputs` in `src/codegen/cppGenerator.ts` walks back from every
`MatrixOutput` and prunes what it cannot reach. A display is not upstream of an
LED output and never will be, so under the current walk a configured display and
everything feeding it would be pruned out of the sketch. Displays join the walk
as roots, and the preview's terminal set gains them alongside `GroupOutput` and
`MatrixOutput`.

A display must update even in a graph with no LED output at all.

Both terminal registries are **derived** from exactly one rule: an ordinary
input-bearing node with no outputs is a terminal, and so is any input-bearing
node in the output category. `TERMINAL_NODE_TYPES` in
`src/codegen/cppGenerator.ts` and `HOT_NODE_TYPES` in
`src/state/graphEvaluator.ts` therefore pick up each display without a row.

The second clause arrived with touch. `TransportDisplay` gained a
`playercontrols` output, and the former inputs-and-no-outputs rule would have
silently removed it from both sets: `reachableFromOutputs` would prune the
panel and everything feeding it out of a cleanly compiling sketch, while the
preview would evaluate it only on publish frames at roughly 8 fps. Deriving the
wider rule rather than adding the display to two hand-kept lists keeps the trap
closed for the freeform interactive display too.

### Scheduling

Display work is scheduled independently of LED animation. A 320×240 SPI panel
redrawn whole is worth several LED frames, so full redraws are not a thing the
loop does: updates go out when a rendered value changes or a bounded refresh
interval expires, and a disabled or disconnected display costs approximately
nothing. This is a hard requirement, not an optimisation — the acceptance gate
is no regression to wall-clock LED timing.

## Generators

Normal sketch, generative show, SD-show player, diagnostic, and stream receiver
each either emit a configured display with its bindings or fail validation with
an actionable message. There is no third outcome. A sketch that compiles, uploads
and leaves the part dark is the worst available result, because the user's next
move is to suspect the wiring.

Arbitrary scalar/control wiring lands in normal sketches first. Generative-show
and SD-player firmware get it by embedding the shared control-graph IR, so a
touch control can drive real graph logic rather than only the hardcoded
transport actions. Until that path exists for a given generator, an unsupported
binding blocks with a diagnostic naming what is missing.

Both template generators are at that interim stage now. They resolve a
display's inputs against the Music Player's own output ports — title, artist,
elapsed and the rest — and collect anything wired from another source as
unresolved. That is deliberately narrower than the IR: it covers the case a
finished build actually has, which is a panel reporting what the firmware is
doing, and it does not pretend to evaluate a Wave or a Math node inside a
template that has no graph in it. The IR replaces it rather than being layered
on top.

One walk serves both, in `codegen/playerDisplays.ts`, parameterised by the
expression table the generator hands it. That table is the whole difference.
The SD player's names the accessors that read the file it is holding. The show
controller's, `SHOW_DISPLAY_EXPRESSIONS`, is **empty**, and the emptiness is the
statement: a generative show rotates patterns and holds no music, so there is
no title, no elapsed time and no volume anywhere in that sketch. Every song
wire into a panel there is reported unresolved rather than filled with a
plausible zero — the same rule the browser follows when it leaves artist blank
instead of guessing it from a filename. Branching on the generator inside the
resolver would have made a third template a third branch; handing the table in
makes it a table.

What the show controller *does* know it supplies with no wiring at all. Which
pattern is running, and how many there are, come from the show's own state:
`showPatternIndex` and `PATTERN_COUNT`, so a Show Status panel dropped into a
generative show reports "3/8" out of the box. Its rotation goes through
`_selSetActive` on the single `_sel_show` cursor, exactly as the SD player's
does, so a Pattern Browser and the pixels cannot come to disagree about which
pattern is playing.

Drawing is not commanding, and the two are separately gated. A show has no
transport for play/pause, previous, next or volume to reach, and no LED-output
runtime either — it drops Enabled, Brightness and Controls alike — so a wired
Controls output is refused there, and its touch service is not emitted at all
outside Diagnostics, because it would call player transport functions a show
controller does not define. A normal sketch is the case that changed: it now
samples the panel and publishes the bundle, so the question there is not
whether the generator can read touch but whether the chain ends somewhere it
can act on. `controlChainSinks` answers that in one walk — an LED output's
latch is somewhere, a Music Player in a plain sketch is not. A Diagnostics
panel still samples touch whatever is wired, since reporting coordinates is
how you find the calibration numbers. An unwired touch panel stays valid as a
read-only display.

Which generator a graph would *actually* build with therefore has to be exact.
`selectedGenerator` mirrors the upload path's order, and both arms of
`sdShowConnected` matter: a Show Engine writing a timed show to a card builds
the **player** sketch, and the same graph without a card builds an ordinary
one. Neither mattered while every generator but the normal one refused displays
outright. Both do now that all three draw.

The control-graph IR is built once and reused by all three generators. The
alternative — display-specific graph evaluation copy-pasted into each — is how
the generators drift apart, and the drift shows up as a display that reads
correctly in a normal sketch and wrongly in a show.

## One surface, two transports

An SH1106 and an SSD1306 draw the same picture. The 1-bit layout, the page
addressing, the glyphs and the column offset are identical, and the only thing
that differs is how the bytes get to the glass: the module on the bench is a
7-pin SPI SH1106 and the SSD1306 is a 4-pin I²C one.

`src/state/oledSurface.ts` therefore splits two facts that are easy to conflate:

- **Controller** is silicon. It carries the column offset — an SH1106 has 132
  columns of RAM behind a 128-column panel, so its window starts two columns in.
  Drive one as the other and the image sits two pixels off with the remainder
  wrapped down the edge, which reads as a wiring fault and costs an evening.
- **Transport** is the module. `OLED_TRANSPORT_PINS` names the pins each header
  brings out, and `oledTransportFor` derives which one a part is from the
  catalogue entry's declared interface rather than from a second hand-kept list.

That split is what one node covering both modules rests on. The node carries
both headers, `isPropertyEnabled` offers only the chosen module's, and
`collectPinUses` reserves only those — the SPI set held for a 4-pin panel would
be five pins nothing drives, handed to no other part.

The generated driver follows the same shape. One `OledPanel`, one command
sequence, one dirty-region flush; `_oledCommand` and `_oledPage` branch on the
transport and nothing else does. There is deliberately no second layout
implementation to keep in parity.

A 4-pin panel has no reset line and no chip select, so it is not begun the way
an SPI one is: it resets itself at power-up, and its address — 0x3C or 0x3D, a
solder blob on the module — is a property rather than a wire.

**One `Wire`, because the sketch starts one.** Two I²C pairs is legal wiring on
an ESP32 and undrivable by every generator here, each of which emits a single
`Wire.begin`. The device on the other pair never answers, which from the outside
looks exactly like a bad joint. So a build whose I²C parts name different SDA and
SCL pins is a validation error, the retarget puts an I²C display on the board's
own I²C bus rather than on two free pins, and the bus is started once for
whatever is on it rather than by whichever part is set up first.

## The same split in colour

`src/state/tftSurface.ts` is the RGB565 twin of the 1-bit surface above, and it
keeps that module's two rules for the same reasons. It knows nothing about the
bus, and the controller's own geometry lives on its descriptor.

The colour analogue of the SH1106's column offset is worse, because it moves
with rotation. An ST7789 driving a 240×240 panel has 240×320 of frame memory
behind it, so a rotation that scans rows backwards addresses the glass eighty
rows in. Every ST7789 library carries that as a four-row table. `tftWindowOrigin`
derives it instead, from one sentence — mirroring an axis does not move the
glass, it renumbers the memory behind it — and the known values fall out. A
table is how the next module's fifth case gets it wrong.

Both descriptors state **native portrait** size. Rotation is a fact about how the
module was bolted down, not about the part, so recording the 2.4-inch module as
320×240 would bake one orientation into the catalogue and leave the other
unrepresentable. The layouts resolve against the mounted size instead.

`ST7789V` starts with `ST7789`. A shortest-prefix controller lookup hands the
240×320 module the 240×240 descriptor and draws every layout eighty rows short,
so `tftControllerFor` matches the longest name first.

**The layout geometry is a function, not a table of constants.** This is the one
place the colour modules depart from `INFO_LAYOUT`, and the reason is arithmetic:
a 1-bit panel is always 128×64, but a colour one resolves against 240×240,
240×320 and 320×240 depending on rotation. `nowPlayingGeometry(w, h)` and
`showStatusGeometry(w, h)` resolve once, the evaluator draws from them, and the
generator calls the same functions with the mounted size and emits the resulting
literals. Flat constants would have meant writing every number out again per
size.

### Refresh, without a framebuffer

240×240 is 115 KB of pixels and 240×320 is 153 KB. Neither fits beside FastLED
and an audio pipeline on an ESP32, so the driver keeps no framebuffer at all.
That forces the two halves apart, and the split is deliberate:

- The **browser** surface keeps a real dirty bounding box. It has the memory,
  and a single rectangle over-sends when two changes are far apart but can never
  under-send.
- The **firmware** caches, per field, the text or the integer it last drew, and
  repaints a field when that changes. With nothing to diff against, this is the
  only dirty model available to it.

Both draw the same pixels from the same geometry. Only the decision about *when*
to ship bytes differs, and only one of the two has the RAM to make it the other
way. Do not "unify" this.

Two consequences worth stating, because both look like bugs:

**The background is painted once, at setup.** A full-screen fill is 115 KB across
the bus; doing it on a refresh deadline would stall the LED loop long enough to
see. The deadline repaints fields instead, which is what recovers a panel that
was unplugged and came back. Every field erases its own cell before drawing, so
the ground never needs laying again — and a cell sized from the previous string
would leave the tail of a longer one behind, which is why the geometry states
the cell rather than the text.

**Pacing is wall-clock, never a frame count.** An LED loop's rate depends on the
strip length and what else is running, so a frame-counted panel updates at a
different speed on every build.

Unlike the bit-banged OLED, this driver uses hardware SPI with
`beginTransaction`/`endTransaction` around every burst — both because 115 KB does
not travel by software loop, and because the 2.4-inch module shares its bus with
touch and an SD card. It is the first display driver here to need an `#include`,
which `TFT_DISPLAY_CPP_INCLUDES` states rather than leaving the preamble and the
driver to disagree about.

### Artwork is player-owned baked data, not a live image port

The layouts render artwork from baked RGB565 bytes. `patternSelect` tells the
panel which player-owned collection and active index it is showing; it does not
carry pixels. `bakeTransportArtworks.ts` evaluates each collected pattern at the
fixed 2.5-second tick, renders at 2×, box-downsamples to 96×96 and packs the
finished big-endian RGB565 bytes. `transportArtworkCpp.ts` emits one indexed
PROGMEM table per player, and `_tftArt` blits the selected row verbatim. The
browser preview caches and draws the result of the same conversion, so there is
no device-side scaler or colour converter to drift from it.

There is deliberately still no `image` input. That signal carries live
`ImageData` capped at `IMAGE_MAX_DIM`; treating it as a baked collection asset
would either need a second C++ scaler or make preview and firmware disagree.
Eight artworks cost 144 KB and are the explicit flash ceiling. An over-budget
collection is rejected before upload and included in the capacity build rather
than silently shipping only its first pictures. Larger assets may later use SD,
but only through an explicit storage policy.

## Bus rules

Today `findPinConflicts` in `src/utils/validateGraph.ts` treats any GPIO claimed
twice as an error, with one narrow exemption for mirrored LED outputs. Displays
make sharing normal rather than exceptional, so the rule has to understand what
a pin *is*:

- **I²C** clients may share SDA/SCL. They need compatible voltage and bus
  settings, and distinct addresses where the device has one.
- **SPI** clients may share SCK/MOSI/MISO. They need unique chip selects and
  guarded transactions.
- **Reset, data/command, backlight, interrupt, and touch chip-select stay
  exclusive** unless a driver contract explicitly says otherwise.

Two devices on *different* SPI hosts sharing a pin number is still a conflict,
so the model tracks the bus instance, not just the role.

Messages name both parts, the pin, and what to change. "GPIO 21 is assigned to
more than one pin" describes the collision without helping anyone repair it.

There are two walks over this data — `findPinConflicts` for deploy validation
and `buildGraphDiagnostics` for the Graph Health drawer — and they have drifted
apart once already. Bus awareness goes into one shared helper both call.

TFT plus SD card on one SPI host is a first-class test case, not a footnote. It
is also the configuration most likely to be wired by a user who bought a display
board with an SD slot on it.

## Driver candidates

Pinned tags come after the Phase 0 spike. Generated firmware never follows a
default branch.

| Family | Candidate | Why | What the spike has to settle |
| --- | --- | --- | --- |
| TM1637 / MAX7219 7-segment | A small dedicated driver per controller | No graphics stack is warranted for eight digits | Whether one logical node contract covers both controllers with wiring and digit capacity confined to the part adapter |
| SSD1306 / SH1106 1-bit OLED | ~~U8g2~~ — settled: an inline driver, `src/codegen/infoDisplayCpp.ts` | A page-addressed 1-bit panel is a short, stable protocol over either bus, and bundling it keeps the display slices off the optional-library staging path: nothing to fetch, nothing to pin, nothing to fail without a network. It also lets the emitted glyph table be generated from `font.ts`, so preview and panel cannot disagree | Settled |
| ST7789 / ILI9341 colour TFT | LovyanGFX | Runtime configuration suits per-project generation; a build-flag-configured driver fights a generator that emits one sketch per project | Draw-buffer size, partial-update scheduling, and coexistence with SD on the same host |
| XPT2046 touch | Panel driver's own touch support | Sharing the driver's transaction handling is safer than a second SPI client racing it | Calibration stability per module, and whether it survives LED refresh load |
| Custom UI | LVGL 9.x | The only candidate that is an actual widget toolkit | Whether a minimal `lv_conf.h` fits the launch board profiles at all |

References: [LVGL integration
overview](https://docs.lvgl.io/master/integration/overview.html), [LVGL display
model](https://docs.lvgl.io/master/main-modules/display/overview.html), [LVGL
events](https://docs.lvgl.io/master/common-widget-features/events.html), [U8g2
device list](https://github.com/olikraus/u8g2/wiki/u8g2setupcpp), [LovyanGFX
controller overview](https://github.com/lovyan03/LovyanGFX/blob/master/README.md),
and [SquareLine's development
workflow](https://docs.squareline.io/docs/1.5.3/introduction/typical_dev/) for
interaction patterns only — not its project format.

## Evidence gates

None of these have been measured. Each is a gate the Phase 0 spike fills in, and
a device family that fails its gate does not ship regardless of whether it
compiles. Nominal MCU compatibility is not evidence that a board can run LVGL.

| Measurement | Gate | Board / module | Result |
| --- | --- | --- | --- |
| Flash used by the display path | Fits with headroom on the smallest advertised board | — | not measured |
| Internal RAM, free heap at steady state | No unbounded growth over a one-hour soak | — | not measured |
| PSRAM required? | Recorded per board profile | — | not measured |
| TFT draw-buffer size | Partial updates only; no full framebuffer where it does not fit | — | not measured |
| LED frame rate with display active | No regression to wall-clock LED timing | — | not measured |
| Touch latency under LED load | Responsive under normal load | — | not measured |
| Audio + show coexistence | Playback unaffected | — | not measured |

Capacity estimation in `src/utils/validateGraph.ts` gains OLED buffers, TFT and
LVGL draw buffers, widget heap, fonts, images, and thumbnails. The estimate
guides; the physical compile stays authoritative.

## Deferred, and why

Multiple screens and navigation stacks, overlapping widgets, freeform drawing,
containers, arbitrary LVGL properties, embedded C/C++ or JavaScript, on-device
text entry, charts and waveform/spectrum histories, animated marquees, the
second-wave Colour Picker/Choice Strip/Step Control/XY Pad/Launch Pad/Arc Gauge
palette, video on a TFT, SquareLine project import, remote/network UI, e-paper,
and large RGB/HDMI panels.

The custom UI editor in particular must not gate the fixed displays. Its schema,
port roles, widget registry and theme/asset contracts are frozen while no saved
document depends on them, but editor implementation starts only after the fixed
TFT software path exists and one representative panel/touch/LVGL bench spike
has supplied real memory, refresh and touch budgets. Full soak tests and support
claims may follow, but nominal MCU compatibility is not enough to freeze widget
limits. The freeform editor is where this feature is most likely to consume the
schedule, and the useful fixed-display deliverables still ship before it.

E-paper and RGB/HDMI stay out because they are different runtime classes, not
because they are exotic. Character LCDs stay out because they would add a third
text backend without covering a use case the OLED slice does not already serve.
