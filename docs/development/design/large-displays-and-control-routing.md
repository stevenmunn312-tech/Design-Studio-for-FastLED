# Large displays and control routing

Status: panel/document split, exclusive content inputs, Song Info unpacker and
dynamic Control Map assignments implemented on Hardware. Integration gaps
were found on 2026-09-08; see [the branch review](../reports/hardware-branch-review.md)
and [HW-01–08](../../../todo.md). This contract replaces the pre-split proposal.

## One physical panel, a separate screen document

`TransportDisplay` (current label **Transport Display**) owns exact part identity,
SPI/touch pins, calibration, rotation and Enabled. It has three inputs: Display,
Custom Display and Enabled. Its Controls output is the fixed-layout transport
bundle. Hardware existence is independent of content choice.

`Display` (current label **Custom Display**) owns a `displayId` and the design
reference. `graphStore.displayDocuments` stores widgets/theme with undo history.
It has no part, bus or pins. The static `customDisplay` output connects to a
panel, while widget ports derive from stable widget ids and roles. The document
does not join hardware registries. Edit display lives on the document node.

The document's own `customDisplay` output is a library port and survives every
document sync; widget ports are additive beside it. Replacing the whole set with
widget ports stripped that output and dropped the mount wire on load and on
every edit, so a saved screen came back unplugged from its panel.

### One design, one panel

A design drives one panel. Every symbol a screen emits — its LVGL screen object,
its widget runtime array, each widget output variable — is keyed by the document
node, so a second panel showing the same document declared all of them twice.
Normal generation emitted that duplicate; the template planner refused it as an
identifier collision, which named the wrong thing entirely and told the user to
recreate a display that was fine.

`customDisplayMountPlan` in `mountedDisplays.ts` is the one walk that decides
which screens a build contains, and RAM pricing, asset baking, deploy validation
and all three generators read it. It reports the two shapes that cannot be
built:

- **A document on more than one panel.** Refused, naming the panels, with the
  repair: copy the `Display` node and wire a copy to each panel. Duplicating the
  node already mints a fresh `displayId`, so the copy is independent. Sharing one
  document across two panels would also be two fingers on one set of widgets with
  no rule for which wins; independent copies avoid needing that rule. A build
  forced through anyway emits the design once and lets the spare panel fall back
  to its fixed layout, so the refused graph still produces well-formed C++.
- **A document no panel shows, driving something.** Its widgets are never built,
  so a wire out of it named a control variable the sketch never declared. The
  wire is refused, and codegen declares the output at rest — the same answer a
  disabled panel gives, for the same reason: there is nothing there for a finger
  to move.

A design nobody has plugged in and nobody has wired out of costs nothing and
blocks nothing: no draw buffer, no widget caches, no LVGL heap, no artwork bake.
Leaving spare designs in a workspace is ordinary, and an unused one with a broken
image reference used to refuse an upload that never referenced it.

Document fan-out to two panels stays out of scope until there is an answer for
simultaneous touch; see [HW-03](../../../todo.md).

### Geometry

`mountedDisplays.ts` answers "how large is this design as mounted" once, from
the panel. A mounted document's design size must equal the panel's rotated size;
deploy validation checks it for every generator and the template plan resolves
it through the same helper. The editor's Portrait/Landscape control rotates the
panels a design is plugged into and sizes the design from what they then
present, in one undoable action; an unmounted design swaps its own edges,
because there is no panel to ask.

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
| RTC Clock Display → Display | Clock (implemented for normal firmware) |
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
Show/player templates still cannot read arbitrary RTC sources.

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

The field catalogue is derived, not restated: `state/displaySourceFields.ts`
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
transport. `controlChainSinks` (`codegen/playerDisplays.ts`) walks the chain to
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

Fixed music touch routes Panel Controls → Control Map → Music Player.
Custom UI uses document widget outputs → named Control Map actions, or
supported direct LED inputs. It does not acquire fixed transport actions merely
by connecting its document to a touch panel.

## Registration and implementation boundaries

Physical panel changes span `hardware.ts`, `partOptions.ts`, `GPIO_PIN_PROPERTIES`,
`BUS_ASSIGNMENTS`, `hardwareManifest.ts`, `PART_PIN_PLANS`, Hardware fixture lists
and `playerDisplays.ts`. Hardware registry tests guard that inventory. Document
nodes belong to none of those physical registries.

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

HW-01–08 cover selection, ownership, diagnostics, live preview,
connected starters and generator-aware assignments. Broader structured bindings,
Performance Generator as a real Display source, density/size thresholds and
multi-screen scope are explicitly deferred in D-01/02. Useful driver, bus and
asset contracts remain in [auxiliary displays](auxiliary-displays.md).
