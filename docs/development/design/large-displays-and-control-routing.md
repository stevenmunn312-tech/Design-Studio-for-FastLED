# Large displays and control routing

Status: panel/document split, exclusive content inputs, Song Info unpacker and
dynamic Player Controls assignments implemented on Hardware. Integration gaps
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

One document driving two panels was a design intention, not a completed feature:
normal generation duplicates widget symbols and template generation rejects it.
Use separate documents for now; HW-03 will enforce the boundary. Editor
orientation still writes to the old document property, and normal custom-panel
Enabled is ineffective; HW-02 repairs these ownership gaps.

## The wire chooses the content

| Content connection | Panel content |
| --- | --- |
| RTC Clock Display → Display | Clock (implemented for normal firmware) |
| Music Player Display → Display | Now Playing or Fixed Transport |
| Pattern Slideshow Display → Display | Show Status |
| Custom Display document → Custom Display | Authored LVGL screen |
| Nothing | Waiting for a signal |

Display and Custom Display inputs are exclusive. Connecting either removes the
other content edge through `completeConnection`. `customdisplay` is a distinct
data type, so OLED/segment panels cannot accept a custom document.

`tftLayout` is a presentation choice within the connected source's treatments;
it cannot choose another source's content. `transportLayoutForKind` resolves it.
The TFT Clock treatment was implemented in `fecbc2bb`; it is no longer deferred.
Show/player templates still cannot read arbitrary RTC sources.

Show Status displays the engine's pattern/selection information. It has no LED
toggle or brightness touch region. Use custom Toggle/Slider widgets for those
actions. Diagnostics is device lifecycle, not a DisplaySignal source; a visible
entry point is still needed. Template Show Status names and TFT-only cursor
emission still need HW-01.

## Reporting state

Music Player publishes `frame`, `patternSelect` and `display`. Its DisplaySignal
contains `SongInfo` and nullable `PatternSelectValue`. Song Info unpacks the
same envelope into the thirteen ports defined by `SONG_INFO_PORTS`.
An unwired unpacker or one fed by RTC/Slideshow emits blanks, not stale music.
Player template sources resolve only unpackers actually connected to its player.
A normal sketch emits blanks because it does not run the device music player.

The player owns track/selection state; screens report it. Slideshow owns its
active/highlight cursor. Firmware must route controls back to that engine before
publishing readback; the slideshow template currently misses this route (HW-01).

## Assigning controls

Keep hardware sources generic: Button pressed can trigger a pattern or an
appliance. Player Controls owns assignment, not a dropdown on each physical part.
Dropping on **Control…** opens a picker, then creates the named function input
and completes the connection. Disconnecting retains the row; explicitly removing
the row removes its edge. Function ids remain port ids, such as `playPause`.

`playerControlAssignments.ts` owns the catalogue. The picker matches exact source
types, deliberately narrower than float/bool wire compatibility: a button is
not a useful continuous-volume control. Destination-capability filtering is
still proposed (HW-07).

For Button Bank → Control… both ends need a name. Materialize the target row
before completing the edge, and derive target ports through `effectiveInputs`;
otherwise the bank names its button after the trailing add socket. Pending
assignments are cancelled when the picker is dismissed. Loading unions declared
functions with actual wired function ids so existing edges remain legible.

Fixed music touch routes Panel Controls → Player Controls → Music Player.
Custom UI uses document widget outputs → named Player Controls actions, or
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
Share a resolved build/mounted-screen plan across validation, preparation,
capacity and generation (HW-03/04); retain specialized rendering adapters.

No pre-1.0 migration is required on Hardware. The v1 format becomes the new
compatibility baseline only after it ships.

## Remaining decisions

HW-01–08 cover selection, ownership, shared documents, diagnostics, live preview,
connected starters and generator-aware assignments. Broader structured bindings,
Performance Generator as a real Display source, density/size thresholds and
multi-screen scope are explicitly deferred in D-01/02. Useful driver, bus and
asset contracts remain in [auxiliary displays](auxiliary-displays.md).
