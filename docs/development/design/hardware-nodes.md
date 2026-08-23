# Hardware nodes — design note

Status: proposed, not implemented · Owner: app · Date: 2026-08-17 ·
Branch: `Hardware` (1.0.0, breaking)

Makes the app model hardware the way the user does. You choose a board, you
plug parts into it, and only then do you know what the thing can do. Today
Studio has none of that order: a microphone can be dragged onto an empty canvas
with no board anywhere, inventing pin defaults from an FQBN it does not really
know.

Builds on [`board-node-architecture.md`](board-node-architecture.md), whose
non-breaking half — the Board node, the capability model on
`PhysicalBoardProfile`, the imported profiles and the pinout view — already
shipped to the beta. This note is the breaking half.

## The model: one component, two views

A component exists **once** and appears **twice**:

- The **hardware view** shows the physical thing: the board with its parts
  arranged around it, connected automatically. This is where hardware comes
  into existence.
- The **graph view** shows only the parts that carry signal, as ordinary nodes
  with ordinary ports.

This is the schematic-symbol and PCB-footprint split that EDA tools have used
for decades. Neither view draws the other's edges, neither lies, and one object
underlies both.

The two panes share the canvas area, split by a resizeable divider.

## Decisions

### Hardware comes into existence in the hardware view, not the node library

There are no hardware nodes in the node library. You add a part in the hardware
view; its node appears in the graph, already attached to the board, already
carrying pins that suit that board, ready to connect.

This is the decision that earns the whole design. Every pin bug found during
hardware validation — the XIAO's GPIO39-42 underside pads, the SD chip-select
on a flash pin, the amplifier's 26/25/22 silently disagreeing with 27/26/25 —
exists because a hardware node could be created without a board. Sourcing parts
through the hardware view makes every hardware node attached-by-construction to
a known board with known-good pins. The class of bug stops being something
validation catches and becomes something the model cannot express.

It also matches the real order of work: capabilities are unknowable until the
user says what they are flashing.

### The graph still ends at the output node

A frame plugs into an LED output exactly as it plugs into the LED Matrix today.
Codegen, `outputRouting` and the composition canvas are unchanged.

Rejected: the frame terminating at the Board. It would need one frame input per
attached output, turning the board into a signal hub for no gain, and it would
invert a pipeline that already works.

### No attachment edges

Parts do not connect to the Board with an edge on the graph canvas.

Rejected — and this supersedes the earlier draft of this note, which specified
exactly that. Two reasons it was wrong:

1. **The Board is a singleton, so the edge carries no information.** Every
   hardware node is attached to the only board there is. Eight edges stating
   something already true is spaghetti that tells the user nothing.
2. **The two-view split does the job better.** Attachment is what the hardware
   view *shows*; drawing it again on the signal canvas is the duplication that
   made early mockups feel disconnected.

If multi-board ever becomes real, attachment stops being implicit and the edge
earns its place. That is the honest trigger for reintroducing it, rather than
building it now for a case that does not exist.

### Connections in the hardware view are automatic

The user does not draw wires there. Parts are laid out around the board and
connected by the view itself, radially.

Rejected: a draggable second canvas. A second layout to arrange is a second
layout to maintain, and the value here is confirmation — "yes, that is my
board with my parts on it" — not composition.

This is also what keeps the hardware view distinct from the **Build Diagram**,
which stays what it is: the full physical document with pin-level wiring, power
paths, level shifters and current budget. The hardware view answers "what is
plugged in"; the Build Diagram answers "how do I wire it".

### Some parts never appear in the graph

The Amplifier, SD Card and Board carry no signal. They live only in the
hardware view.

Far from awkward, this is the clarifying consequence: the hardware view shows
everything physical, the graph shows only what carries signal. Microphone,
button, pot, encoder and the LED outputs appear in both.

### Parts take their pins from the board when created

The payoff. A part is created with pins from the board profile's
`commonPeripheralStartingPoints` — add a microphone with a XIAO selected and it
gets GPIO 7/8/9; add the same part with a 38-pin DevKit and it gets 32/33/34.

Changing the board retargets only pins the user has not edited, matching the
existing rule in `micPinDefaults.ts`: edit a pin and the part is yours.

### Every part names its exact module

A dropdown per part — INMP441 for the microphone, MAX98357A for the amplifier —
driving the pin roles, the thumbnail, and part-specific caveats.

Naming the part is what makes its picture honest rather than decorative, and it
forces assumptions into the open: the player generator has always assumed a
MAX98357A and nothing in the UI ever said so.

### Thumbnails in the graph, the real thing in the hardware view

Graph nodes show a small module image in the existing preview slot — the one
`NodePreview` occupies, with `WaveScope`'s `previewOffset` proving the
handle-offset mechanism. The hardware view is where parts are drawn at a size
worth looking at.

Rejected: the graph node *becoming* the module image. A photoreal module is
either too small to recognise or big enough to wreck the density that makes a
node graph readable, and the output node already carries ~20 properties, the
upload UI and a capacity meter competing for that space.

### One Audio node, abstracting the source

`Audio` is a capability node with a source dropdown and an honest empty state:
*"No audio source connected. Add a microphone or another audio source in the
hardware view."*

| Source | Who plays it | Analysis | Requires |
| --- | --- | --- | --- |
| Microphone | something external | live | mic in |
| Line in | something external | live | line-level in |
| Decoder tap | the board | live | MCU-decoded playback |
| Baked envelope | the board | offline | storage + an analysed show |

It defaults to the only attached source when there is one, so the dropdown
appears as a choice only when a choice exists.

This is what earns the node: without it every new source means rewiring every
graph that consumes audio, and a pattern can never be source-agnostic. With it,
"react to audio" is one chain that works whether the signal is a microphone or a
track playing off the card.

Rejected: the microphone keeping an `audio` output and feeding FFT directly
(today's shape). Simpler, and it makes "no audio source" unrepresentable and
every source swap a rewire.

### Analysis nodes never read audio ambiently

`FFTAnalyzer`, `BeatDetect`, `PercussionDetect` and `AudioFeatures` consume the
`Audio` node's output through ordinary ports rather than reading
`useAudioStore.getState()`.

This mirrors the reasoning recorded for the clock in
[`rtc-clock-and-schedule.md`](rtc-clock-and-schedule.md): an ambient global is
invisible to the cycle guard, to the group registry and to Graph Health's node
attribution, and a patch can never feed it a synthetic source for testing.

### LED outputs: one node, four sidebar entries

Strip, matrix, ring and HUB75 panel are different objects to buy, and the
sidebar should say so — "I bought a ring, where is the ring?" is a fair
question a hidden dropdown answers badly.

But all four share an identical port signature (`frame` in, `sdcard` in, nothing
out), and CLAUDE.md's bundling rule is explicit that identical signatures bundle
into one node with a variant property — the pattern Noise, Transition, Blend and
Particles all follow.

Both: **one node type with a `form` property, presented as four entries** that
each create it pre-set. Ring is a genuinely new form needing its own XY mapping
— LED count, start angle and direction rather than width and height.

Rejected: four node types. It buys discoverability a preset already buys, at
the cost of four codegen paths and a break with the bundling convention.

### Previews render in the graph, in the output's own shape

A ring node draws a ring, a strip draws a strip. The current design can only
draw a grid, which is a visual lie about the hardware.

The side preview panel stays. It answers a different question — in-graph
previews show "what is *this* output showing", the panel shows "what does the
audience see" — and Stage mode, the composed multi-route view and recording all
depend on it. Stage becomes the audience view: lights only.

### Empty states name what is missing

With no board or no audio source, capability nodes still exist and say what to
add. Hiding them would teach the user the app is broken.

### The hardware view owns existence; the graph owns connection

Deleting a graph node disconnects the part; it does not unplug it. Removal
happens in the hardware view.

Otherwise deleting a node silently changes what firmware is generated, which is
the same class of surprise as a stale pin default.

## Open questions

1. Does **Storage** get a capability node too (SD card / onboard flash / USB),
   mirroring Audio? The show pipeline needs the distinction regardless.
2. Do `MicInput` and `MatrixOutput` get renamed — `Microphone`, `LED Output` —
   now that the latter covers four forms? Breaking either way.
3. Should the hardware pane be open by default on a new project? Hardware-first
   sequencing says yes; the 1280×720 supported minimum says it must collapse to
   nothing.
4. What happens to a graph with **two boards**? Out of scope for 1.0.0, but it
   is the trigger that would bring attachment edges back.
