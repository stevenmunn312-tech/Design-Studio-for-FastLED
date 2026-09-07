# Large displays and control routing — design note

Status: designed, not implemented · Owner: app · Date: 2026-09-07

What a large panel is told, who tells it, and how a physical button gets a job.
Decided 2026-09-07. This is tiers 2 and 3 of the split laid out in [simple
displays](simple-displays.md), which deliberately left touch panels alone; the
parts themselves — controllers, transports, pins, the registries a display has
to join — stay in [auxiliary displays](auxiliary-displays.md).

The two halves are one note because they meet at the same wire. A touch panel
publishes a `playercontrols` bundle, and so does a row of buttons; whatever we
decide about panels lands on `PlayerControls` either way.

## The problem, in port counts

Nothing here is broken. It is unreadable.

| Node | Ports today | After |
| --- | --- | --- |
| `TransportDisplay` (Transport Display) | 17 in, 1 out | 2 in, 1 out |
| `PatternMaster` (Music Player) | 9 in, 16 out | 9 in, 3 out |
| `PlayerControls` | 15 in, 1 out | 1 in + as many as you wired, 1 out |
| `Display` (Custom Display) | 0 in, 0 out, 18 properties | folded into two nodes |

A four-node player graph currently draws about sixty sockets, most of them
empty. The wires that matter are lost among the ones nobody used.

## Decision 1 — one large-panel node, and a separate node for the design

**The clinching evidence:** `st7789v-xpt2046-touch-240x320` appears in
`partOptions.ts` **twice** — once under `TransportDisplay` and once under
`Display`. The same physical module is modelled as two different node types
depending on whether the user wants a fixed layout or a custom one. That is a
content decision leaking into the hardware model. A panel is a piece of glass
with pins; what it draws is not part of its identity.

So the split runs the other way:

- **The panel node** owns the glass. `partId`, rotation, SPI pins, touch pins,
  touch calibration, `enabled`. One content input, plus a `Controls` output on
  a touch-capable module. This is `TransportDisplay`, generalised — the same
  shape `InfoDisplay` and `SegmentDisplay` already have for small panels.
- **The document node** owns the design. `displayId`, the widget list, the
  theme, the `Edit display` button, and the per-widget `widget:<id>:<role>`
  ports. It outputs a `customdisplay` signal. This is today's `Display` node
  with every pin property removed.

Net node-type count is unchanged: two large-panel node types become one panel
node and one document node. The panel node loses fifteen properties and the
document node loses the reason it ever had them.

This is smaller at the data layer than it looks. `DisplayDocument` is already
stored apart from the graph — `graphStore` holds a `displayDocuments` registry
keyed by `displayId`, snapshotted alongside `nodes`/`edges` for undo. Only the
node that *references* a `displayId` changes, and the widget ports move to the
node that actually has widgets.

Three things fall out for free:

- `Edit display` stops being ambiguous. It lives on the node that holds the
  document, so it is never greyed out on a panel waiting for a wire.
- One document can drive two identical panels — two wires out of one design.
- Every panel in the app now reads the same way: one content input, pins,
  maybe a controls output. Large or small.

## Decision 2 — a large panel takes `Display` **or** `Custom Display`

Two content inputs, distinguished by dataType, and the wire is still the
setting.

| Wired into | The panel becomes |
| --- | --- |
| `Display` ← `RTCInput` | a clock |
| `Display` ← `PatternMaster` | Now Playing / Fixed Transport |
| `Display` ← `PatternSlideshow` | Show Status |
| `Custom Display` ← document node | the authored screen |
| nothing | "Waiting for a signal" |

The new `customdisplay` dataType costs one entry in `PORT_COLORS` and nothing
else: `portsCompatible()` is exact-match for every pair except float↔bool, so a
small OLED physically cannot accept a custom-display wire. The user-visible
rule — a different-coloured port the small screens refuse — is what the type
system already does.

**The two inputs are exclusive.** `displaySignal.ts` argues that two sources can
never fight over one panel *because there is only one socket*, and that
argument stops holding the moment there are two. Connecting one drops the
other, the same way connecting to any single-source input replaces what was
there. It is not a validation error, because there is nothing to warn about — a
panel showing the last thing you plugged in is the behaviour you wanted.

### `tftLayout` is demoted, not deleted

Now Playing and Fixed Transport are two treatments of the *same* source, so
source-derived layout cannot choose between them. Keeping `tftLayout` as a
content property would reintroduce exactly the dropdown this model exists to
remove.

It survives as a **presentation** property — density, or skin — offered only
when the wired source has more than one treatment. It decides how a screen is
drawn, never what is on it, so the invariant holds: you can still read what a
panel does off the wire, and the property can only change how much of it fits.

### Two honest gaps this exposes

- **There is no TFT clock layout.** `RTCInput` on a large panel currently has
  nowhere to land. The table above promises one; it has to be built, or RTC is
  not yet a legal source for a large panel and the panel says so. Better to see
  the hole in a table than to discover it on a bench.
- **Diagnostics is not a source.** `TRANSPORT_DISPLAY_LAYOUTS` carries a fourth
  entry, `Diagnostics`, that no node publishes. It is device lifecycle — the
  same category as the OLED boot and fault overlay — not content a cable
  selects. It stays off the source table and is reached some other way, which
  closes the open question simple-displays.md left about where it lives.

## Decision 3 — Music Player stops fanning out song fields

`PatternMaster` publishes thirteen `SONG_INFO_PORTS` outputs alongside `frame`,
`patternSelect` and `display`. With fixed panels reading the `display` envelope
and custom panels reading widget roles by name, **nothing consumes those ports
one wire at a time any more.** They are thirteen sockets kept for a case that
the two decisions above just removed.

They go, and a small **Song Info** unpacker node takes their place: wire the
player into it, take `title`/`artist`/`elapsed`/… out of it. It appears on the
canvas only in the graph that genuinely needs a field on a wire — feeding text
into a pattern, say, or gating on `playing`.

`songInfo.ts`'s `SONG_INFO_PORTS` stays the one list behind those ports, as it
is today. Only the node that spreads it changes, so the invariant that a port
cannot exist with nothing behind it is untouched. The unpacker is the same
species as `PlayerControls`, `TransitionSet` and `PatternCollection` — a bundle
node that exists so a bundle can be opened where someone wants it opened, and
nowhere else.

Music Player drops from sixteen outputs to three.

## Decision 4 — Player Controls grows the ports you use

Fifteen inputs, of which a real build wires three or four. The fix is to mint
ports on demand — but the interesting part is where the *name* comes from.

### Why a dropdown on the hardware node loses

Putting a `function` property on `ButtonInput`/`PotInput`/`EncoderInput` fails
three ways:

- It hides routing in a property. You cannot read the graph off the canvas; you
  open every button to find out what it does.
- Those nodes are generic. The same Button triggers a pattern, toggles an LED
  output, or arms a sequencer, and in those graphs a "player function" dropdown
  is meaningless.
- One control feeding two things has nowhere to go.

### Why the growing socket cannot name itself

`ButtonBank` already implements the mechanic: a trailing `add-button` socket
that, on connection, becomes a named row and grows a fresh empty socket
beneath. Crucially **it takes its name from the target** — dropped on
`PlayerControls.playPause`, the row becomes "Play / Pause".

Mirroring it does not work, and this is the whole difficulty. Drag a Button
into a generic `Control` input and the source side offers only `pressed`. There
is no name to adopt. You would get "Control 1, Control 2" and then need a
dropdown to say what each one *is* — the rejected design, relocated.

### The picker

Keep the growing socket; move the naming to connection time.

1. `PlayerControls` shows one empty **`Control…`** socket.
2. Dropping a wire on it opens a small inline menu of the functions **not yet
   assigned**, filtered by what the source can sensibly drive.
3. Picking one materialises the port, named for the function. The wire lands on
   it and a fresh `Control…` socket grows below.
4. Disconnecting **keeps the row**, exactly as `ButtonBank` retains a row after
   its noodle is cut, so rewiring is a drag rather than a re-decision. A row's
   context menu removes it.

The node then carries only the ports actually used, and the assignment stays
legible on the canvas rather than buried in a property. A three-button build
draws three sockets.

**Sensible is narrower than compatible.** `portsCompatible` lets float↔bool
through, so the menu needs its own notion of what a source can drive: a Button
offers the momentary functions (Play/Pause, Next, Previous, Volume Up/Down,
Confirm); a Potentiometer offers the continuous ones (Volume, Brightness,
Pattern Selection); an Encoder offers both, through its two outputs. This is a
judgement about physical controls, not a type rule, and belongs beside the
function list rather than in `nodeLibrary.ts`.

**Two dynamic ends can meet.** Dragging from `ButtonBank`'s trailing socket to
`PlayerControls`' trailing socket leaves neither side able to name itself. The
picker resolves it — the menu supplies the name and both ends adopt it — but
only if it fires on that combination too. This is the case to write the test
for first.

**Implementation note.** `ButtonBank` materialises inside `onConnect` via
`materializeButtonBankConnection`, which is synchronous: the connection arrives
already knowing its name. A picker is asynchronous — the connection has to be
held pending while the menu is open, and abandoned if the user dismisses it.
That is the one genuinely new piece of machinery in this note.

## What this removes

- **`TransportDisplay`'s seventeen content inputs**, replaced by two.
- **`Display`'s fifteen pin and calibration properties**, which move to the
  panel node where the pins are.
- **A second large-panel node type** for the same physical modules.
- **`PatternMaster`'s thirteen song-field outputs**, replaced by a node that
  exists only when wanted.
- **`PlayerControls`' fourteen always-present function inputs**, replaced by
  the ones a build uses.
- **`tftLayout` as a content choice.**

This breaks persisted graphs. `Hardware` is targeting v1.0.0 and is explicitly
not carrying pre-1.0 compatibility, so no migration is provided.

## What this does not change

The `playercontrols` bundle itself. `transportBridge.ts` still owns debounce
and rising-edge rules, `patternSelection.ts` still owns detents and the
active/highlight cursor, the LED output's `Controls` latch is untouched, and
the firmware half emits as it does today. **This note is entirely about how the
bundle is authored, not what it is.** Same for `DisplaySignal`: the envelope
gains no arm, it just gains a second class of panel that reads it.

## Registries to touch

Merging two panel node types into one and adding a document node hits the
registration points [auxiliary displays](auxiliary-displays.md) lists, each of
which fails quietly on its own: `hardware.ts` (both ownership sets),
`partOptions.ts`, `nodeLibrary.ts` `GPIO_PIN_PROPERTIES`, `busTopology.ts`
`BUS_ASSIGNMENTS`, `hardwareManifest.ts` `collectPinUses`, `pinRetarget.ts`
`PART_PIN_PLANS`, `HardwarePane.tsx` `FIXTURE_PARTS`, and `playerDisplays.ts`
for both template sketches. `hardwareRegistries.test.ts` holds them in step.

The document node joins **none** of them: it has no pins, no bus, and no
physical existence. That is the test that the split is drawn in the right
place.

## Open

- The TFT clock layout, or an explicit statement that RTC is not yet a large-
  panel source.
- Where Diagnostics is reached from, now that it is not a wired source.
- Whether `tftLayout`-as-presentation should be a property or derived from
  panel size, which is what `simple-displays.md`'s geometry functions do.
- The size boundary between a tier-1 and a tier-2 panel, still unsettled.
- Whether the picker's "sensible sources" table should also gate what a touch
  panel may publish, or whether touch stays free to publish anything.
- `PerformanceGenerator` as a `player` source, carried over from
  [simple displays](simple-displays.md).
