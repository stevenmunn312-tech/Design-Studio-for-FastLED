# Large displays and control routing

Status: the panel owns its screen design. There is no separate document
node and no mount wire. Song Info unpacks a player's display envelope.
Control Map remains the optional compact bundle; direct named actions
and property inputs are specified in
[direct controls](direct-controls-and-output-status.md). HW-01–08
integration gaps from 2026-09-08 are closed. Remaining evidence for the
direct-controls work is compilation and bench, recorded in that note.

## One physical panel, its own screen design

`TransportDisplay` (label **Display Panel**) owns exact part identity,
SPI/touch pins, calibration, rotation, Enabled, and the screen drawn on
it. The design is named by the panel's `displayId` property and stored
in `graphStore.displayDocuments`. Widget input sockets stay on the
panel, because the panel draws graph values into widgets. Widget output
sockets leave through the paired Touch node. There is no `Display`
node, no `customDisplay` input, and no mount edge.

Choosing **Custom design** in the panel's Layout mints the document
(sized to the glass, stamped as `displayId`); **Edit screen design**
opens it. Having a design and showing it are separate facts: a fixed
layout sets the design aside with its widget ports and wires intact,
and everything that means *showing* (the mount plan, evaluator, all
three generators, validation) asks `shownDesignId` in
`state/displays/transportDisplay.ts` rather than reading `displayId`. Wires from
a set-aside design's controls read at rest: the evaluator publishes rest
values and firmware declares them as constants, only where something
reads them. Duplicating the
panel mints a fresh `displayId`, so the copy has its own design. A
second panel of the same rotated size can show that design: **Screen
design** on the panel lists the drawings that fit the glass, and **Own
copy** gives this panel a fresh document. Each panel keeps its own
touch, Enabled latch and widget values. Two fingers on two panels are
two signals, so simultaneous touch needs no precedence. Image bytes are
emitted once, under the document id. LVGL screen and widget symbols
stay on the document id while one panel shows the design, and use each
panel's id (`displayRuntimeId`) when a second panel shows it, so an
unshared sketch keeps the symbols it already had. A document exists
only while a panel names it. Deleting a panel deletes the design when
it is the last panel that names that id.

`customDisplayMountPlan` in `mountedDisplays.ts` is the list of panels
showing a design. RAM pricing, asset baking, deploy validation and
all three generators read it. The old `shared` / `unmounted` fields
went with the states they reported.

### Geometry

`mountedDisplays.ts` answers how large this design is as mounted, once,
from the panel. A design's size must equal the panel's rotated size;
deploy validation checks it for every generator and the template plan
resolves it through the same helper. The editor's Portrait/Landscape
control rotates every panel showing the design and sizes the document
from what the glass then presents, in one undoable action. Rotating one
shared panel from its own inspector leaves the document as it is; that
glass then fails the size check until it matches again or takes its own
copy. There is no scaling between different glass sizes.

### Enabled

Enabled is one runtime signal, and it means the same thing in all three
generators: the panel is dark, reads no touch, and rests its widget outputs at
`false`/`0`. The panel is still built and still initialised — it is fitted
hardware either way — so re-enabling resumes from the image already on the
glass, and a fixed layout's next `_tftPaint` is a full repaint because its
refresh clock did not advance while it was off.

Each panel keeps one latch (`_tftOn_<id>` for a fixed layout, `_cdPanelOn_<id>`
for a custom screen), written where its expression is evaluable and read by
everything that runs before that point — touch sampling and widget-output
snapshots see the previous pass's value on the single frame Enabled changes.
That is the price of evaluating the expression once instead of in three places
that could disagree. A constant folds into the latch's initialiser, so an
always-on panel pays nothing.

A wire feeding Enabled is accepted by every generator. The templates resolve it
through the scalar control graph, which is what `controlSources` carries.

## The wire chooses the content

| Content connection | Panel content |
| --- | --- |
| RTC Clock Display → Display | Clock (Compile Time, Manual, DS3231 and NTP in every generator) |
| Music Player Display → Display | Now Playing or Fixed Transport |
| Pattern Slideshow Display → Display | Show Status |
| A screen design on the panel itself (`displayId`) | Authored LVGL screen |
| Nothing | Waiting for a signal |

A panel owns the screen drawn on it, so there is no second content input and no
mount edge to make exclusive: `displayId` names the design and the `display`
wire names the source its widgets read. A panel with both draws the design and
feeds it from that source.

`tftLayout` is a presentation choice within the connected source's treatments;
it cannot choose another source's content. `transportLayoutForKind` resolves it.
The TFT Clock treatment was implemented in `fecbc2bb`; it is no longer deferred.
Show and player templates read a wired RTC Clock whatever its source. An NTP
clock brings the sketch's network bootstrap with it (`networkCpp.ts`), over
Wi-Fi or the wired link the normal sketch would use.

Show Status displays the engine's pattern/selection information. It has no LED
toggle or brightness touch region. Use custom Toggle/Slider widgets for those
actions. Diagnostics is device lifecycle, not a DisplaySignal source; a visible
entry point is still needed.

Show Status reads pattern names from the sketch's own name table
(`patternNameTableCpp`), not from a Pattern Browser's baked thumbnails: a name
needs no bake, no trust decision and no flash budget, so a TFT-only show still
names what it plays. Cursor emission is derived from every consumer — browser,
Show Status, artwork, and anything commanding it — rather than from OLED
presence.

### Readings without wires

A widget can name a **field** of the source wired into the panel instead of
minting a socket and waiting for a cable. A Now Playing screen with five
readings was otherwise five cables drawn from the Music Player already plugged
into the panel beside them — the values were there, just not offered.

The field catalogue is derived, not restated: `state/displays/displaySourceFields.ts`
maps the player's fields from `SONG_INFO_PORTS`, so a field added to a track
report is offered on a screen the same day and cannot be offered under a name
nothing publishes. `displaySourceFieldsForWidget` narrows by data type the way
the Control Map picker does, and for the same reason — a track title on a
progress bar is a connection that would show nothing.

Four things read one `source` property:

| Reader | What it does with it |
| --- | --- |
| `displayDocumentPorts` | A bound widget mints no input port |
| `syncDisplayNodesInContent` | Projects `widgetSources` onto the panel node |
| `graphEvaluator` | Publishes the field out of the live envelope |
| The three generators | Emit the expression their build can answer with |

The projection is what makes the rest work: evaluation and every generator work
from the node, and a bound widget has no port to carry the fact. It is one
direction only — the document is the truth, the projection is rewritten on every
edit — so the two cannot drift.

Which fields a build can answer is a fact about the *generator*, so each owns a
table beside its routing walk rather than in its emitter, because validation and
the asset hook resolve bindings through that same walk:

| Build | Table | Answers |
| --- | --- | --- |
| Normal sketch | `normalSketchSourceExpressions` | The clock, through the same `_rtcClockText`/`_rtcDateText` helpers the fixed Clock layout uses |
| SD player | `PLAYER_SOURCE_EXPRESSIONS` | `PLAYER_SONG_EXPRESSIONS` plus its own selection |
| Generative show | `SHOW_SOURCE_EXPRESSIONS` | The pattern it is running, from the one cursor the pixels already follow |

A bound **pattern name** is the one reading that costs flash, so it turns the
name table and the cursor on the way a Pattern Browser does
(`DISPLAY_NAME_SOURCE_FIELDS` / `DISPLAY_SELECTION_SOURCE_FIELDS`), and
`patternNameStringCpp` wraps the buffer reader in the smallest thing that
returns a pointer, since a widget binding is one expression with nowhere to put
a declaration.

A field a build cannot answer is a **warning**, not an error: the widget draws
its own text — the same blank a fixed Now Playing layout leaves for the same
missing reading — and `unresolvedBindingIssue` names the field and the build.
This is deliberately weaker than the stance taken on a *cable*, which is refused
outright, because a binding is often a template's default rather than something
somebody wired wrong.

Templates bind through `TEMPLATE_WIDGET_SOURCES`, keyed by the template's own
widget label like `TEMPLATE_CONTROL_ICONS` beside it, so a portrait composition
cannot bind a field its landscape twin leaves on a wire — which would make a
panel's rotation quietly change which sockets it has.

Those bindings are also what orders the template shelf.
`displayTemplatesForSource` calls a template **mapped** to a source when every
field it binds is one that source publishes, so the layouts a wired panel can
fill come first and adding a binding re-files its template on its own — there is
no per-template list of source kinds to keep in step, and none can claim a source
that could not feed it. It promotes rather than filters, the same stance pattern
author tags take: a template binding nothing reads every value off the graph and
is correct on any panel, so the four that do stay reachable, and a panel with no
source yet gets one ungrouped list rather than a guess. Clock exists partly for
this: an RTC is the one source ordinary firmware answers for, and without it
"Mapped to RTC Clock" would have been an empty group.

`normalizeDisplaySource` is the import boundary, and deliberately cannot ask
which source is wired in: a document has no panel in hand, and a design saved
against a player then moved to a slideshow keeps the binding it was drawn with
rather than having it erased. It validates against every field any source
offers — the relationship `normalizeDisplayAssetId` has with the installed pack
— and the wired source's own gaps are reported at build time instead.

## Reporting state

Music Player publishes `frame`, `patternSelect` and `display`. Its DisplaySignal
contains `SongInfo` and nullable `PatternSelectValue`. Song Info unpacks the
same envelope into the thirteen ports defined by `SONG_INFO_PORTS`.
An unwired unpacker or one fed by RTC/Slideshow emits blanks, not stale music.
Player template sources resolve only unpackers actually connected to its player.
A normal sketch emits blanks because it does not run the device music player.

The player owns track/selection state; screens report it. Slideshow owns its
active/highlight cursor. Firmware routes controls back to that engine before
publishing readback: `showControlTargets` names the slideshow as a control
destination beside the LED outputs it renders, the show loop applies the bundle
through `_selUpdate`, and the renderer reads `cur` back out of the cursor, so a
confirm changes the pixels rather than only what a panel says.

## Assigning controls

Keep hardware sources generic: Button pressed can trigger a pattern or an
appliance. Control Map owns assignment, not a dropdown on each physical part.
Dropping on **Control…** opens a picker, then creates the named function input
and completes the connection. Disconnecting retains the row; explicitly removing
the row removes its edge. Function ids remain port ids, such as `playPause`.

`playerControlAssignments.ts` owns the catalogue. The picker narrows twice.

By **type**, deliberately narrower than float/bool wire compatibility: a button
is not a useful continuous-volume control.

By **destination**, because a bundle goes somewhere specific. Each function
names the `PlayerControlDestination` kinds that act on it — a Music Player
holds the track, the lamp and the collection and so takes all fourteen; an LED
output has a blackout and a dimmer; a Pattern Slideshow has a cursor and no
transport. `controlChainSinks` (`codegen/player/playerDisplays.ts`) walks the chain to
find which kinds this node reaches, and `sensiblePlayerControls` intersects the
two, so Play / Pause is not offered on a chain that ends at an LED output — a
port that would mint, wire, validate and do nothing. `ControlChainSink` is an
alias of that same union rather than a second copy, so a new destination cannot
reach the generators while the picker goes on offering it nothing. A chain
plugged into nothing yet is judged on type alone: there is no destination to
judge against, and refusing everything would leave nothing to build with.

Each option carries one line saying whether it is an edge or a position — *On
each press*, *Holds its position, 0 to 1*, *Turn — one detent per pattern* —
because `kind` is the thing being chosen and the label alone does not say it.

For Button Bank → Control… both ends need a name. Materialize the target row
before completing the edge, and derive target ports through `effectiveInputs`;
otherwise the bank names its button after the trailing add socket. Pending
assignments are cancelled when the picker is dismissed. Loading unions declared
functions with actual wired function ids so existing edges remain legible.

Fixed music touch may wire named Touch outputs straight to Music Player
action inputs, or send the Controls bundle through Control Map. Custom
UI publishes each widget from the companion Touch node. Direct named
actions and property inputs are specified in
[direct controls](direct-controls-and-output-status.md). A screen design
does not acquire the fixed-layout transport actions; those outputs rest.

A screen design does fill the Controls bundle from the widgets a template
gave a job (`controlRole`), so a Now Playing design drives Music Player
through one wire. `src/state/displays/designControlBundle.ts` is the one mapping, read
by the evaluator, all three generators and validation:

- Previous/Next land on track steps, or on pattern steps when the panel shows a
  slideshow; Play/Pause, Pattern Confirm and Blackout (as the lamp toggle) are
  actions; Volume and Brightness are levels.
- A Button presses on its rising edge. A Toggle presses when a *finger* flips
  it, counted by a per-widget gesture count (`touchCount` in the preview
  runtime, `taps` in the LVGL runtime), never from its value. A template binds
  Play's Set to the player's `playing`, so the value also moves whenever the
  transport is driven from elsewhere, and reading it would echo that back as a
  press.
- A widget whose own output is wired keeps that job and leaves the bundle,
  so one tap never fires twice. Unplaced widgets are never in it.

Firmware builds the bundle with the Control Map emitter
(`designControlBundleEmit`), adding a `CtlTap` edge beside `CtlEdge`. A panel
drawing a design is also skipped by `playerDisplays.ts`: emitting its fixed
layout as well painted both onto one glass and read the digitiser twice.

## Registration and implementation boundaries

Physical panel changes span `hardware.ts`, `partOptions.ts`, `GPIO_PIN_PROPERTIES`,
`BUS_ASSIGNMENTS`, `hardwareManifest.ts`, `PART_PIN_PLANS`, Hardware fixture lists
and `playerDisplays.ts`. Hardware registry tests guard that inventory. A
screen design is not a hardware part and belongs to none of those
physical registries.

The normal generator walks graph expressions. Show/player templates reuse
`templateControlRouting.ts`, `controlGraph.ts` and `customDisplayControlGraph.ts`.
Their supported sources/types remain narrower than the browser evaluator.
`customDisplayMountPlan` is that shared mounted-screen plan for validation,
asset preparation, capacity and all three generators; the resolved *build mode*,
selected engine, display sources and output/control capabilities come from the
pure `resolveBuildMode` plan shared by every entry point. The rendering adapters
remain specialized.

No pre-1.0 migration is required on Hardware. The v1 format becomes the new
compatibility baseline only after it ships.

## Remaining decisions

### D-01 implementation

D-01 started on 11 October 2026, ahead of the other post-v1 items. Work proceeds
in independently compiled slices:

1. Interval-driven controls: implemented in the shared scalar graph. A wired
   period resolves before the timer, one timer sample feeds every consumer,
   and a computed press bypasses contact debounce. Normal, show and player
   firmware share the existing elapsed-millisecond emitter. Physical button
   debounce and the player's track-position clock remain unchanged.
2. Time and Wave: implemented with shared normal/template emitters and one
   clock snapshot per control pass. Slideshow controls read animation time,
   including Master Speed; the clock uses the previous pass's speed so a
   time-dependent speed source is resolved after its clock, not before it.
   Slideshow dwell and transitions retain elapsed time. SD-player root controls
   read elapsed time independently of playback; patterns retain track position.
   Time's `dt` remains the existing nominal 1/60 second. Other time-dependent
   sources still need their clock, reset and state contracts defined.
3. Nested groups: grouping preserves each outgoing port's type and identity,
   including fanout and distinct frame outputs. The evaluator reads all terminal
   ports once per instance, propagates trust and the root hardware catalogue,
   and retains independent timer state. Ungrouping restores each boundary wire,
   including a directly forwarded input. Existing frame patterns retain their
   conventional `frame` port.

   Normal firmware and template routing share `expandGroups`. It resolves
   nested input/output boundaries, removes unwired inputs so consumers retain
   their property fallbacks, and rejects recursive or missing definitions,
   ambiguous identifiers and hardware placed inside groups. Expanded scalar
   dependencies count against the existing 256-node control limit. Boundary
   cycles fail explicitly; expansion also bounds nesting and total node count.
   Physical contacts retain debounce through group boundaries; computed pulses
   bypass it in both preview and firmware. Validation, Graph Health, asset
   preparation and generation receive the same current group registry.

   Regression coverage includes mixed outputs, nested input forwarding,
   repeated timer instances, fallbacks, recursive definitions, identifier
   collisions, dependency limits and trust propagation. The compiled fixture
   wraps Interval, Time and Wave in two groups and forwards a root button
   through a group input directly to its output.
4. Structured colour, pattern selection and LED status: implemented. A Colour
   Swatch accepts a self-contained colour node. The control graph keeps a
   `CRGB`; the swatch binding packs it. Palette, image and harmony sources
   still fail explicitly. A Pattern Browser accepts only the running engine's
   `patternSelect` and reads the browsing-aware name. Source-field pattern
   names stay on the active index. LED status answers for an output the
   template drives, using that output's own runtime. A show latches status
   with the pixels. A player reports the driven output's manual settings and
   does not fold in master brightness. A second, undriven output stays
   unresolved.
5. Other time-dependent sources and a wired RTC: implemented. Clock, Envelope,
   BeatSin, Noise LFO, Counter and Schedule Trigger share the normal emitters.
   They keep wall-clock `millis()`, static state keyed by node id, and Clock's
   rising-edge reset. Master Speed does not scale them, and the player's
   track-position clock is untouched. The preview resets a Clock when animation
   time jumps backward; firmware does not, because these nodes do not read that
   clock. Counter still steps by `rate/60` each pass. Complex Wave, Random and
   DMX Channel still fail explicitly.

   The RTC is the wired RTC Clock node, not a scene-wide clock. Show and player
   graphs emit Compile Time, Manual and DS3231 through the normal sketch's RTC
   loop. Scalar ports are ordinary control outputs, so Schedule Trigger and Math
   can read them. `dateTime` is the value that loop writes; a display reads it
   after the graph resolves the clock's `valid` port, which emits the whole
   node. Two consumed clocks stay two clocks, and an unread clock is not
   emitted. An NTP clock resolves like the others; its emission carries the
   network headers, the `_netEnsureConnected()`/`_netConnected()` bootstrap
   and, for a wired link, the setup line, all from the shared
   `src/codegen/peripherals/networkCpp.ts` the normal sketch uses (D-03). Two
   NTP clocks emit identical blocks, so the caller's dedupe leaves one.

   DS3231 starts Wire from the node's pins, then the board profile, and the
   first emitted chip calls `_rtcHandleSerialSet()` once per loop. The templates
   already start Serial, so this path adds no second `Serial.begin`. When a
   power monitor and a DS3231 both ask to start Wire, the control graph keeps
   the RTC line. A panel that already starts I2C still wins over the control
   graph, so the compile fixture's clock is Compile Time and stays off the
   OLED bus. `RTC_CPP_FORWARD` is emitted when a helper contains
   `struct _RtcDateTime {`, after `#include <FastLED.h>`.

   Fixed Clock layouts and bound custom widgets accept kind `clock` before the
   template's own kind list when `clockFor` returns the dateTime symbol.
   Omitting that provider keeps the unresolved warning. The symbol comes from
   the Display edge's source. Custom widgets use the normal sketch's
   `_rtcClockText` and `_rtcDateText` fields. The source table is the power
   monitor, then LED status, then the clock, then the template's own fields.
   An RTC Display wire that produces no clock table replaces that table, so
   the widgets stay blank.

`scripts/compile-fixtures/control-graph.ts` generates normal, show and SD-player
fixtures with nested Interval, both Time outputs, wired Wave inputs and wired
Master Speed where supported. The shared OLED reads the LED output it is wired
to. Show and player fixtures also mount a write-only ST7789 whose Colour Swatch
is a temperature sampled through an hsv-long gradient, and whose Pattern
Browser reads the running engine. Every mode adds a Compile Time RTC, a Clock
reset by the root button, a Schedule Trigger enabled by that Clock's beat, and
a TM1637 Clock layout on GPIO 2 and 3. Normal and slideshow builds gate the LED
output from the schedule. The player gates the colour panel, because a direct
Enabled wire on its LED output is an error. The regression fixture also checks
a timer shared between a Control Map and a panel's Enabled path, plus a physical
button that still requires debounce. Results are recorded in
[control graph compile checks](../reports/compile/control-graph-compile-checks.md).
These are software checks, not hardware evidence.

### Other scope

HW-01–08 are closed. Direct-control compilation is done; its bench evidence
is still open in
[direct controls](direct-controls-and-output-status.md#10-verify-the-complete-workflows).
Performance Generator is now a real Display source. NTP in the show and
SD-player generators landed with D-03. A shared document on two same-size
panels is in. Density/size thresholds, multi-screen navigation and the
rest of D-02 stay deferred; the widgets joining v1 are listed in
[auxiliary displays](auxiliary-displays.md#deferred-dropped-and-why).
Driver, bus and asset contracts remain in
[auxiliary displays](auxiliary-displays.md).
