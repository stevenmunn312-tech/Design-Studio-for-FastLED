# Auxiliary displays — design note

Status: in progress; the `string` signal, the Music Player's song-information
outputs, the TM1637 and MAX7219 Segment Displays and the Info Display have
shipped. The SH1106 OLED is
the first device driven on real hardware: panel, font, refresh and mounted
rotation confirmed on a bench, on an ESP32-S3 over 4-wire SPI · Owner: app ·
Date: 2026-08-25

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
stable, declared ports like every other node in `NODE_LIBRARY`. Their layout is
chosen from a property, and changing that property does not add or remove ports.
This matters because a port is what a cable attaches to: a node whose ports move
when a label changes is a node whose cables silently break.

The Info Display's Pattern Browser layout reads the shared selection contract
rather than tracking an index of its own — active versus highlighted, wrapping,
confirm, and what happens when the collection changes are defined once in
[the generative pattern show note](generative-pattern-show.md#which-pattern-is-playing).

**The freeform `Display` node** is the only node with widget-derived dynamic
ports, and it is deliberately last. It owns a `displayId` and derives its ports
from the widgets in the matching `DisplayDocument`.

The fixed nodes are not a stepping stone to the freeform one. They are the
deliverable for anyone who wants a clock, a pattern name, or a transport screen
without drawing a UI, and they ship first because they can.

### Port identity

An outer port id on the freeform node derives from the widget's stable id —
`widget:<id>:value` — never from its editable label and never from its position
in the widget array. Renaming a widget or dragging it up the list must not break
a cable. Changing a widget to a different port type is a create-new/delete-old
operation, not an in-place type mutation, because the old cable was type-checked
against the old type and there is no honest way to carry it across.

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

### Master controls

LED-output enabled/blackout, master brightness, and master speed become explicit
runtime inputs. Master speed scales the one shared time value that preview and
every generator already read — it does not rewrite per-node speeds. The LED
preview is wall-clock driven and stays that way; a display refreshing at its own
rate must not be able to move animation time.

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
`Delay` and is defined as one tick. What it must not be is whatever the
evaluator's recursion guard happens to do — that would be user-facing behaviour
decided by accident.

### Displays are terminals

`reachableFromOutputs` in `src/codegen/cppGenerator.ts` walks back from every
`MatrixOutput` and prunes what it cannot reach. A display is not upstream of an
LED output and never will be, so under the current walk a configured display and
everything feeding it would be pruned out of the sketch. Displays join the walk
as roots, and the preview's terminal set gains them alongside `GroupOutput` and
`MatrixOutput`.

A display must update even in a graph with no LED output at all.

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

The SD player is at that interim stage now. It resolves a display's inputs
against the Music Player's own output ports — title, artist, elapsed and the
rest — because those are what the player can answer from the file it is
holding, and it collects anything wired from another source as unresolved. That
is deliberately narrower than the IR: it covers the case a finished build
actually has, which is a panel reporting the track, and it does not pretend to
evaluate a Wave or a Math node inside a template that has no graph in it. The
IR replaces it rather than being layered on top.

The control-graph IR is built once and reused by all three generators. The
alternative — display-specific graph evaluation copy-pasted into each — is how
the generators drift apart, and the drift shows up as a display that reads
correctly in a normal sketch and wrongly in a show.

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
| SSD1306 / SH1106 1-bit OLED | U8g2 | Smallest footprint for 1-bit, broad device coverage, and its device list is the reference for what "supported" can mean | Whether Studio's own `font.ts` glyphs rasterise through it, or whether the layout helpers draw pixels directly |
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
arbitrary LVGL properties, embedded C/C++ or JavaScript, on-device text entry,
video on a TFT, SquareLine project import, remote/network UI, e-paper, and large
RGB/HDMI panels.

The custom UI editor in particular must not gate the fixed displays. It starts
only after a fixed TFT has passed compile, preview parity, performance, and
physical hardware tests — the freeform editor is where this feature is most
likely to consume the schedule, and the useful deliverables are the ones that
ship before it.

E-paper and RGB/HDMI stay out because they are different runtime classes, not
because they are exotic. Character LCDs stay out because they would add a third
text backend without covering a use case the OLED slice does not already serve.
