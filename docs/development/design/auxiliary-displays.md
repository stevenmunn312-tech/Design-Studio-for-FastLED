# Auxiliary displays — design note

Status: fixed segment/OLED/TFT drivers, source envelopes, Song Info, custom
documents/editor and LVGL generation implemented on Hardware. Updated 2026-09-08.
The panel/document split is implemented but has unresolved integration defects;
see [large displays](large-displays-and-control-routing.md) and
[the branch review](../reports/hardware-branch-review.md). Physical support is
recorded separately in the support matrix.

An **LED output** is `MatrixOutput` in any supported form. A physical auxiliary
display is a separate segment/OLED/TFT peripheral. A custom `Display` is now a
screen document, not another physical device. This note keeps driver, asset,
widget, runtime and bus contracts; active work is [root todo](../../../todo.md).

## Support boundary

The [support matrix](../../release/beta-support-matrix.md) alone defines recorded
board/module/bus/generator support. Segment/OLED rows already exist. Custom
LVGL/touch performance still needs the HW-11 bench budget; compilation does
not establish physical support. Selected drivers are listed below.

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
note is about the parts themselves. `TransportDisplay` also consumes this
envelope, or an exclusive custom-document input; it no longer takes per-field
content wires. The document node has no hardware ownership.

The Info Display's Pattern Browser screen reads the shared selection contract
rather than tracking an index of its own — active versus highlighted, wrapping,
confirm, and what happens when the collection changes are defined once in
[the generative pattern show note](generative-pattern-show.md#which-pattern-is-playing).

### Which displays get a design surface

Segment and OLED modules use predetermined source-driven layouts, without a
layout selector. TFT panels can use built-in layouts or a custom document.
The runtime resolves the physical controller from the mounted panel. Touch
actions require a touch-capable module; a non-touch TFT cannot operate interactive
widgets locally. Allowed widget display classes remain defined by the registry;
the exact non-touch custom-screen product scope needs HW-07/D-02 reconciliation.

`Display` owns `displayId` and stable widget-role ports. `TransportDisplay` owns
pins/rotation and receives the document through `customDisplay`. A fixed screen
is useful without creating a document. See the [large-display contract](large-displays-and-control-routing.md).

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
Minimal Transport, Pattern Deck, Show Status, LED Performance, Audio Reactor,
Diagnostics and DMX Monitor are templates composed from ordinary widgets. A template mints
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

Normal-sketch, generative-show and SD-player build consumers prepare custom
display assets through `useCustomDisplayAssets` before calling the generator.
Only documents owned by root display nodes are baked, and image fetching waits
for workspace trust. Both build consumers share in-flight and successful bakes
per immutable document. Document edits invalidate the generated code immediately;
late completions cannot replace newer screen data. Preparation errors name the
display and block the build, with a shared retry action. A capacity check never
measures a placeholder screen while the real artwork is pending or failed.
The capacity readout distinguishes image preparation from an empty graph and
surfaces the named failure; its review action opens the upload controls. A
preparation attempt publishes bytes only when every display has succeeded.
`generateCpp`, `generateShowSketch` and the SD-player builder receive finished
bytes keyed by node id and emit validated PROGMEM tables before the LVGL
objects reference them. Template preparation also validates widget bindings
before fetching or generating;
missing documents, stale handles and unsupported wires produce named errors.
SD upload checks the document/trust snapshot again after any confirmation
dialog; it does not pair a newly edited screen with older rasterizations.

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
list, `SONG_INFO_PORTS` in `src/state/songInfo.ts`, defines the fields. The
player publishes them in its Display envelope; Song Info exposes the individual
ports for custom-widget or other scalar consumers.

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

The evaluator and normal generator derive physical terminals from input-bearing
output-category nodes and ordinary sinks. This keeps an interactive panel in
the root set even though it publishes Controls. The pinless Display document
does not declare its widget inputs in NODE_LIBRARY and is not an unconditional
root. Firmware reachability follows its customDisplay edge to a physical panel.
A document used as a control source without a mounted panel must be diagnosed;
that case currently generates undeclared symbols (HW-03).

Display role values already reach the runtime store, but the editor does not
yet draw passive graph-fed values. HW-05 completes the renderer and audits
sample/evaluate/publish order; do not claim full browser/firmware parity yet.

### Scheduling

Display work is scheduled independently of LED animation. A 320×240 SPI panel
redrawn whole is worth several LED frames, so full redraws are not a thing the
loop does: updates go out when a rendered value changes or a bounded refresh
interval expires, and a disabled or disconnected display costs approximately
nothing. This is a hard requirement, not an optimisation — the acceptance gate
is no regression to wall-clock LED timing.

## Generators

The required contract is that a build emits every supported binding or reports
why it cannot. The current implementation has known violations recorded in the
[branch review](../reports/hardware-branch-review.md), particularly selection,
Enabled, unmounted/shared documents and fixed-control diagnostics.

Normal sketches evaluate general graph expressions. Show and SD-player
templates share a bounded scalar IR in `controlGraph.ts`, with GPIO sampling,
typed sources, dependency ordering, cycle/type/id checks and a 256-node limit.
`scalarControlCpp.ts` supplies Math, Lerp, Clamp, MapRange, Sin, Cos, Compare,
TextValue and FormatNumber to both the IR and normal sketches. Custom controls
provide float/bool pre-pass samples; template widget inputs accept supported
float/bool/string paths. Time-dependent sources, groups, arbitrary scripts and
structured colour/pattern bindings remain outside that template scope.

`playerDisplays.ts` resolves fixed content envelopes. The normal generator can
read RTC Clock, the player reads its track, and the show reads its slideshow.
The show song-expression table is intentionally empty because it owns no track.
Player scalar song readings come through Song Info nodes wired to the active
Music Player, not removed per-field ports on the player itself.

`templateControlRouting.ts` follows Player Controls chains for selected
destinations. Player builds route to Music Player; show builds currently route
only to rendered LED outputs, which is why slideshow pattern intent is ignored
(HW-01). LED output latches combine enabled values by AND and brightness by
multiplication. Direct LED control wires remain refused by the SD player;
commands there must reach Music Player. Show Status is read-only: it no longer
has blackout/brightness regions. Those controls belong in custom widgets.

The show publishes its pattern ordinal, but TFT-only selection declarations and
pattern names still need repair. Utility Wiring Test and Stream Receiver have
their own fixed-display/diagnostic scope; they do not execute the custom UI.

Generator selection must agree across upload, validation, capacity and assets.
`resolveBuildMode` owns that shared plan, retaining SD-player precedence and
the standalone-VU output capability. An SD card by itself is insufficient to
choose the music/show player, and a disconnected engine never selects a template.

Custom show displays use `customDisplayControlGraph.ts` to derive roles from
saved documents rather than copied node handles. Each configured, enabled
panel is created and made LVGL's default before its screen objects are created.
The shared panel adapter and widget/asset emitters use one identifier rule,
including for numeric-leading UUIDs and multiple panels.

Touch input devices run in LVGL event mode: the controller calls `lv_indev_read`
for every enabled custom panel before snapshotting any widget output. The
snapshot is the typed source for the entire graph pass. Set bindings never
become producer dependencies, so feedback such as Slider Out → Math → Slider
Set, including across screens, preserves the sampled touch intent. After LED
output, the controller applies graph-authoritative inputs using the existing
finger-ownership/release rules, then services LVGL's monotonic timer handler.
In these template paths disabled custom screens contribute false/zero and
perform no touch or LVGL work. Normal firmware does not yet honor this rule
after the panel/document split (HW-02).

Custom float/bool/string inputs support the same scalar nodes as the control
mapper; wired colour and pattern-selection roles remain refused. Asset
preparation and capacity measurement include actual baked image data. The
SD player uses this same resolver and ordering. Only referenced Song Info
ports from an unpacker wired to its player are sampled; strings are copied into bounded buffers before a
transport action can reset their source tags. A synchronized volume slider
reads `playerVolume`, the normalized control setting before the amplifier cap,
so feedback cannot repeatedly attenuate the value. Fixed touch panels publish
the same bundle as widget/GPIO-fed Player Controls; each mapper keeps its own
debounce/repeat settings and downstream absolute values override upstream ones.

The bundle is applied to the player's one transport before audio servicing and
LED rendering. Custom widgets and fixed displays publish after LED output,
including on the generic player's EOF branch before returning. Serial file
transfers still bypass all display/control work. Collection and file-timeline
players use the same integration. Direct Enabled/Brightness/Controls wires to
the player's LED output remain refused; those controls must reach Music Player
through Player Controls. Firmware compilation and physical shared-SPI/audio
performance evidence remain separate release gates.

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

## Selected drivers

| Family | Current implementation |
| --- | --- |
| TM1637 / MAX7219 | Inline controller-specific segment drivers |
| SSD1306 / SH1106 | Inline OLED driver, both catalogue-derived transports |
| ST7789 / ST7789V | Inline SPI TFT renderer; custom screens use the LVGL panel adapter |
| XPT2046 | Shared `tftTouchCpp.ts` sampling and LVGL indev wrapper |
| Custom UI | LVGL 9.5.0, pinned by the helper; selected font-size configuration |

U8g2/LovyanGFX were candidates, not current dependencies. ILI9341 is not a
current driver. Exact integrated-board controller identity must be established
before adding it (HW-12). Generated firmware never follows a floating library
branch. See the [compile record](../display-compile-checks.md) for the toolchain
contract and the current fixture limitation.

## Evidence gates

Historical compile-size results are recorded separately; these runtime gates
remain unmeasured. HW-11 must supply them, and
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

**Known gap (HW-03):** after the panel/document split, the estimator still
reads custom-panel geometry from document properties and counts orphan documents.
The allocation contract below describes what it must count after repair.

Capacity estimation in `src/utils/validateGraph.ts` counts OLED buffers and
fixed TFT field caches. Custom screens add a 20-row RGB565 buffer using the
mounted width in the intended model, a 32-byte panel/handle allowance, and one static
runtime cache per widget (one slot even for an empty document). With no document
available, the estimate reserves the maximum 64 slots. Cache sizes live beside
the emitted struct; buffer sizing is shared with the panel emitter.

The pinned LVGL configuration reserves one shared 64 KiB internal heap per
sketch for objects, styles, labels and other LVGL allocations, plus a shared
handler timestamp. This allocation is counted once, regardless of screen count;
widget heap allocations must not be added a second time. These costs remain
internal when LED render buffers move to PSRAM. RAM readouts subscribe to
document edits as well as graph changes. Fonts and baked image/thumbnail bytes
remain in PROGMEM and are measured by the actual compile-capacity check.
The estimate excludes other framework overhead and does not establish runtime
heap headroom or replace the physical measurements above.

## Deferred, and why

Multiple screens and navigation stacks, overlapping widgets, freeform drawing,
containers, arbitrary LVGL properties, embedded C/C++ or JavaScript, on-device
text entry, charts and waveform/spectrum histories, animated marquees, the
second-wave Colour Picker/Choice Strip/Step Control/XY Pad/Launch Pad/Arc Gauge
palette, video on a TFT, SquareLine project import, remote/network UI, e-paper,
and large RGB/HDMI panels.

The fixed and custom software paths now exist. The original sequence required
a representative bench budget before freezing custom-UI limits; that measurement
is still outstanding and is HW-11. Do not infer runtime capacity from the
completed editor or historical successful compiles.

E-paper and RGB/HDMI stay out because they are different runtime classes, not
because they are exotic. Character LCDs stay out because they would add a third
text backend without covering a use case the OLED slice does not already serve.
