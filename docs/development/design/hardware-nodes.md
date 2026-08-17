# Hardware nodes — design note

Status: proposed, not implemented · Owner: app · Date: 2026-08-17 ·
Branch: `Hardware` (1.0.0, breaking)

Makes the graph model the hardware the way the user does. You buy a board, and
you plug parts into it: a microphone, an amplifier, a card reader, a ring of
LEDs. Today Studio scatters those facts across property bags on unrelated
nodes — the amplifier's pins lived on the SD Card node, the microphone is a
signal source with no physical existence, and the board itself was invisible.

Builds on [`board-node-architecture.md`](board-node-architecture.md), which
introduced the Board node and the capability model. That note's non-breaking
half already shipped to the beta; this one is the breaking half.

## The rule

**A hardware part attaches to the board. A capability node abstracts it for the
graph.**

Stated once here so it does not have to be rediscovered per peripheral:

- **Hardware nodes** name a physical part you can hold — Microphone, Amplifier,
  SD Card, LED Output, Board. They carry the part's identity, its pins, and its
  quirks. They attach to the Board and produce no signal.
- **Capability nodes** are what the rest of the graph consumes — Audio today,
  probably Storage later. They abstract *what the board can do* from *which
  part does it*, so a pattern chain never has to care.

The split exists because the two answer different questions. "Which mic did I
buy?" is a hardware question. "Is there audio?" is a graph question, and it has
the same answer whether the source is a microphone, a line input, a track
playing off the card, or a baked envelope.

## Decisions

### Attachment is an edge, and it is not wiring

A part attaches to the Board with a single edge of a dedicated `attach` type:
one hop, part → board, never anything else.

This is deliberately not a contradiction of "the Build Diagram owns physical
wiring". The edge declares *"this module is on this controller"*. It does not
say which pad connects to which pad — that stays in the Build Diagram, which
has the room to draw it properly and already does.

Rejected: no edge at all, with the Board scanning the graph for hardware nodes
(the shape the shipped Board node and Amplifier use today). That works, but it
makes attachment invisible: nothing on the canvas shows a mic belongs to this
board, a two-board future has no way to express which part is on which, and the
user's own mental picture — *the module plugs into the board* — is the one thing
the diagram refuses to draw.

Rejected: power and data wires on the canvas. Two edge kinds meaning different
things is a tax on every user, and the Build Diagram already exists.

### Attaching a part sets its pins from the board

The point of the whole exercise. On attach, a part takes its pins from the
board profile's `commonPeripheralStartingPoints` — attach a microphone to a
XIAO and it gets GPIO 7/8/9; attach the same node to a 38-pin DevKit and it
gets 32/33/34.

Retarget only ever touches pins the user has not edited, matching the existing
rule in `micPinDefaults.ts`: edit any pin and the part is yours, and a board
change leaves it alone.

This is what would have prevented the amplifier pin mismatch found on hardware
on 2026-08-16, where the node's defaults (26/25/22) silently disagreed with the
wiring guide (27/26/25) and produced silence that looked like a dead amp.

### Every hardware node names its exact part

A dropdown per node — INMP441 for the microphone, MAX98357A for the amplifier,
and so on — which drives the pin roles, the thumbnail, and the part-specific
caveats.

Naming the part is what makes the thumbnail honest rather than decorative, and
it forces assumptions into the open: the player generator has always assumed a
MAX98357A, and nothing in the UI ever said so.

### Thumbnails, not portraits

Hardware nodes show a small module image in the existing preview slot — the one
`NodePreview` occupies for frame/palette/colour nodes, with `WaveScope`'s
`previewOffset` proving the handle-offset mechanism.

Rejected: the node *becoming* the module image. A photoreal module is either
too small to recognise or big enough to wreck the density that makes a node
graph readable, and Matrix Output already carries ~20 properties, the upload UI
and a capacity meter competing for that space. The full pictorial treatment
belongs in the Build Diagram and the pinout view, which have room.

### One Audio node, abstracting the source

`Audio` is a capability node with a source dropdown and an honest empty state:
*"No audio source connected. Attach a microphone or another audio source to the
board."*

Sources, from the board's capabilities:

| Source | Who plays it | Analysis | Requires |
| --- | --- | --- | --- |
| Microphone | something external | live | mic in |
| Line in | something external | live | line-level in |
| Decoder tap | the board | live | MCU-decoded playback |
| Baked envelope | the board | offline | storage + an analysed show |

It defaults to the only attached source when there is one, so the dropdown only
appears as a choice when a choice actually exists.

This is what earns the extra node: without it, every new audio source means
rewiring every graph that consumes audio, and a pattern can never be
source-agnostic. With it, "react to audio" is one chain that works whether the
signal is a microphone or a track playing off the card.

Rejected: the microphone keeping its `audio` output and feeding FFT directly
(today's shape). Simpler, and it makes "no audio source" unrepresentable and
every source swap a rewire.

### Analysis nodes never read audio ambiently

`FFTAnalyzer`, `BeatDetect`, `PercussionDetect` and `AudioFeatures` consume the
`Audio` node's output through ordinary ports. They must not keep reading
`useAudioStore.getState()` directly.

This mirrors the reasoning already recorded for the clock in
[`rtc-clock-and-schedule.md`](rtc-clock-and-schedule.md): an ambient global is
invisible to the cycle guard, to the group registry, and to Graph Health's node
attribution, and a patch can never feed it a synthetic source for testing.

### Node inflation is a UX problem, solved in UX

"Make lights react to sound" is four nodes today and would be six or seven
here, none of the first three making a pixel. That is a worse first ten minutes
for a beginner and has to be paid for somewhere.

It is **not** paid for with implicit resolution — see above. Instead:

- Starter templates and quick recipes ship the whole chain pre-wired.
- Dropping a hardware node auto-creates the Board and the matching capability
  node when they are absent, and attaches them.

The graph stays explicit; the user just does not assemble it by hand.

### LED outputs: one node, four sidebar entries

Strip, matrix, ring and HUB75 panel are different objects to buy, and the
sidebar should say so — "I bought a ring, where is the ring?" is a fair
question that a hidden dropdown answers badly.

But all four have an identical port signature (`frame` in, `sdcard` in, nothing
out), and CLAUDE.md's bundling rule is explicit that identical signatures bundle
into one node with a variant property — the pattern Noise, Transition, Blend and
Particles all follow.

Both, therefore: **one node type with a `form` property, presented as four
sidebar entries** that each drop it pre-set. Search finds "ring", the user sees
the part they bought, and `outputRouting`/`cppGenerator` keep one path instead
of four.

Ring is a genuinely new form and needs its own XY mapping — LED count, start
angle and direction rather than width and height.

Rejected: four node types. It buys discoverability that a preset drop already
buys, at the cost of four codegen paths and a break with the bundling
convention.

### In-node previews complement the side panel

Each output node previews in its own shape — a ring draws a ring, a strip draws
a strip. The current design can only draw a grid, which is a visual lie about
the hardware.

The side panel stays. It answers a different question: in-node previews show
"what is *this* output showing", the panel shows "what does the audience see",
and Stage mode, the composed multi-route view and recording all depend on it.

## Open questions

1. Does **Storage** get a capability node too (SD card / onboard flash / USB),
   mirroring Audio? The show pipeline needs the distinction regardless.
2. What happens to a graph with **two boards**? Attachment makes it
   representable for the first time, but codegen is still one sketch.
3. Does the **Board node's port list** stay readable with eight parts attached,
   or does it become a spaghetti hub? Worth prototyping before committing.
4. Does `MicInput` become `Microphone` (a rename, breaking) or stay?
