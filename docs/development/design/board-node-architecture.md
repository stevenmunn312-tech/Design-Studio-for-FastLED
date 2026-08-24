# Board node and hardware capability model — design note

Status: proposed, not implemented · Owner: app · Date: 2026-08-14

Studio has never known what hardware a design targets. The board is chosen in a
popup and stored beside the graph, so every node that touches hardware carries
its own pin numbers with no idea what they are attached to. This note proposes a
**Board node** that owns the board choice, derives what that board can do, and
becomes the single thing every hardware-facing decision asks.

Written before implementation, so it records intent rather than the built
contract. Targets a breaking 1.0.0 branch.

## Why now

Three symptoms, all the same missing abstraction:

- **Pins are validated against the chip, not the board.** A Seeed XIAO ESP32S3
  gets microphone defaults of GPIO 39/40/41. Those are real ESP32-S3 pins, so
  validation passes and the sketch compiles — but on that board they are
  underside pads, not header pins. [`boardProfiles.ts`](../../../src/build/boardProfiles.ts)
  already records them as `Underside pad`; nothing consults it.
- **Every hardware node grew its own private workaround.**
  [`micPinDefaults.ts`](../../../src/state/micPinDefaults.ts) exists purely to
  retarget microphone pins when the board changes, keyed by FQBN, for one node.
  The HUB75 defaults in `nodeLibrary.ts` are a hand-derived intersection of three
  boards' GPIO sets, with a comment conceding that per-board remapping remains a
  follow-up "same as every other hardware node."
- **The build diagram is told the board out of band.** `buildHardwareManifest`
  takes `selectedFqbn` as a parameter alongside the graph, because the graph does
  not contain it.

## Decisions

### One Board node, selecting a profile rather than a chip target

Exactly one Board node per graph. This is not a new constraint — it is an
existing one becoming visible. `selectedFqbn` is already a single scalar on
`uploadStore` mirrored into `projectStore.uploadTarget`, and
[`outputRouting.ts`](../../../src/state/outputRouting.ts) has no board awareness
at all. Multiple LED outputs have always meant multiple routes on one
controller, which is what codegen emits: one sketch, one `FastLED.show()`.

The node selects a **board profile**, not an FQBN. This matters: `esp32:esp32:esp32`
is currently claimed by two different profiles — a 38-pin DevKit and a 30-pin
DevKit v1 — whose headers differ. Choosing "ESP32" identifies the chip and
leaves the pinout ambiguous, which is the exact failure this note exists to
remove. The FQBN becomes a field the profile carries.

Rejected: keeping board selection in the deploy popup and having nodes read it.
That is today's design, and it is what produced all three symptoms above.

### The Board node is a capability model, not a pin table

The profile resolves to a set of capabilities that the rest of the app queries:

- pin map and per-pin capabilities (output-capable, input-only, strapping, bus-reserved)
- storage: none / onboard flash / SD / USB / NVMe
- audio in: I2S mic, PDM, ADC, line-level
- audio out: I2S DAC, PWM, analog
- **control channel**: serial command links to peripherals that manage themselves
- network: Wi-Fi, Ethernet
- codegen backend and deploy path

Anything the selected board cannot do is disabled with a plain reason, rather
than failing at compile time or, worse, on the bench.

The control channel is new. Nothing in the codebase holds a conversation with a
peripheral today — every hardware node reads or writes pins.

### Audio source and schedule source are independent

These are welded together today: choosing the music-sync workflow also chooses
the scheduling behaviour, and choosing the generative workflow forces the
microphone. They are orthogonal, and separating them is most of this note's
value. Any audio source should work with any schedule.

### Five audio sources, derived from capabilities

| Source | Who plays it | Analysis | Requires |
| --- | --- | --- | --- |
| None | — | — | — |
| Microphone | something external | live | mic in |
| Line in | something external | live | line-level in |
| Decoder tap | the board | live | MCU-decoded playback + audio out |
| Baked envelope | the board | offline, precomputed | storage + a Studio-analysed show |

Availability is **derived** from the capability flags rather than enumerated as
hardware combinations. The combinatorics then stay correct as capabilities are
added, instead of needing the table rewritten.

Decoder tap is the source that does not exist today and is the reason to do this
work: the board plays the music and analyses its own PCM before it reaches the
DAC. Perfect sync, no microphone, no acoustic round trip.

Baked envelope is gated by workflow as well as hardware. The Board node can say
it is *possible*; only the graph can say it is *available*.

### "Player" is two devices, and only one can be tapped

**MCU-decoded playback** — the board decodes from storage or a network stream
into a PCM buffer and out to an I2S DAC. Decoder tap is available.

**Self-contained player module** — DFPlayer Mini and similar. Own storage, own
decoder, controlled over serial. The MCU never sees a sample, so decoder tap is
impossible and line in is the only live option. In scope for 1.0.0, which is
what makes line in mandatory rather than optional polish.

A module also reports only track-start and track-finished, with no sample
position. "Locked to a song" therefore still works — fire the timeline on the
start command and free-run, which for lighting is fine — but **scrubbing,
seeking, and mid-track resync are not possible.** The authoring UI must say so
rather than offering a scrub bar that silently lies.

### Three schedule kinds, one of which needs no audio

- **Live / generative** — patterns chosen as it runs, reacting to whatever audio
  exists. Runs with no audio at all.
- **Locked to a song** — a timeline following music position. Today's SD show.
- **Timed sequence** — a timeline following the clock, no audio. Christmas
  lights, model railway scenes, shop signage. A product in its own right, and
  the `RTCInput` / `ScheduleTrigger` nodes already cover half of it.

### The timed sequence is two layers, not one timeline

Two different time scales were being asked of one screen:

- **When it runs** — day scale, sparse. "On at dusk, off at 23:00." Served by the
  existing clock nodes.
- **What happens while it runs** — seconds scale, dense, usually looping.

One timeline showing both a 24-hour span and 90 seconds of detail is unreadable.
The schedule decides *whether the sequence is playing*; the sequence timeline
decides *what it does*. The existing show timeline is a good base for the second
layer — marker track, event list and per-command editors all transfer — with the
audio track removed and the x-axis changed.

Rejected: reusing the show timeline directly with the music track hidden. The
scales are too far apart for one control.

### Outputs attach to the board, and no other wires are added

The LED output continues to take a `frame` and gains a `route` output that plugs
into the Board node. One new data type, one legal hop, fixture to board only.

This keeps `frame` meaning pixel data everywhere. It also makes "three panels on
one controller" visible rather than assumed, and gives the pin assignment an
honest conceptual home as a property of the attachment.

Rejected: `frame` edges into the Board node. That would overload `frame` with a
second meaning — physical attachment — and it reads wrong the first time someone
wires an effect straight into the board.

Rejected: power and data wires on the canvas. The build diagram is the physical
view; duplicating it in the node graph would tax every user with two edge kinds
that mean different things.

### What moves off the LED output, and what stays

Moves: the board target and the PSRAM options. These are board-scoped and
already sit awkwardly — the PSRAM toggle is rendered outside the generic property
list precisely because its visibility depends on the selected board.

PSRAM uses an `Auto / On / Off` policy. Auto is deliberately conservative: it
enables external render buffers only when the exact physical profile records
both PSRAM capacity and its QSPI/OPI interface. An FQBN merely exposing PSRAM
menu choices is not proof that the selected module contains either variant.
Legacy boolean saves are read as explicit On or Off choices.

Stays: everything genuinely about the panel — size, chipset, colour order,
layout, tiling, brightness, correction. The LED output is deliberately
multi-instance, and three panels legitimately have three sizes.

The Board node joins `GROUP_EXCLUDED_TYPES` alongside `MatrixOutput`, `MicInput`
and `MusicLibrary`, so grouping leaves it in the parent graph. A saved pattern
should stay board-agnostic.

### The board picker is tiered

Two catalogues exist and they are very different sizes: boards we can compile for
(`BOARDS` in `uploadStore.ts`, many) and boards whose physical pinout we know
(`BOARD_PROFILES`, six). Presenting them as one list would promise pin accuracy
deliverable for six of them — the original problem in new clothing.

**Profiled boards** get the pin map, the render, the eye-icon pinout view, and
pin-level validation. **Compile targets** get chip-level validation only and say
so on the node face. Searchable across both, never silently mixed. The tiering
also makes profile coverage visible as it grows.

### The deploy popup keeps what is only true on this desk

Split on this line: the design owns what is true everywhere, the popup owns what
is true on this machine right now. Board choice moves to the node. Serial port,
core installation and the readiness checklist stay in the popup — the port is
already stored per project rather than in the graph.

The Board's serial policy is `Auto / Native USB / UART bridge`, but Auto is
resolved at build/upload time from that desk-local selected port. The helper
returns its USB VID/PID, manufacturer, product, interface, serial number,
location and hardware id without opening the port. Known Espressif native USB
and common CP210x/CH34x/FTDI/Prolific bridges resolve automatically; an unknown
identity safely uses the UART build unless the user chooses a manual override.

### Raspberry Pi is deferred but accommodated

A Linux Pi shares almost nothing with the ESP32 path: no sketch, no
arduino-cli/fbuild, a real filesystem, ALSA instead of I2S peripherals, and LED
output through a DMA-backed driver rather than FastLED's clockless ESP32 drivers.
It is a separate backend, not a board profile entry.

Explicitly out of scope for 1.0.0. The codegen backend is a **field on the
profile** rather than an assumption, so adding the Pi later is an entry rather
than a second refactor.

## Scope and sequencing

Breaking change on a 1.0.0 branch. No migration layer and no backwards
compatibility, on the basis that the current beta is a small hardware-testing
group. This is what allows board ownership and pin authority to land as one
change rather than two.

**Prerequisite: classic ESP32 hardware validation.** The refactor should start
from a known-good system. The support matrix currently records only ESP32-S3 and
ESP8266 as validated, and carries an unconfirmed classic-ESP32 SD-show bring-up
from 2026-07-28 whose four fixes have never been verified on hardware. Closing
that, plus basic LED output on a classic ESP32, comes first.

Note that both of those fixes — the `huge_app.csv` partition table and the
ESP32-audioI2S 3.0.12 pin — exist only on the **fbuild** path. Validation runs
must confirm the active engine first or they will reproduce the original defects.

## Open questions

1. Do pin assignments eventually move onto the `route` attachment, or stay as
   properties on the peripheral node with the Board node as authority? The
   second is cheaper and gets most of the benefit.
2. What line-level input hardware do we actually support — plain ADC, or an I2S
   codec? This decides how much of the audio path is shared with the mic.
3. Does the default board stay ESP32-S3, the only validated target, or move to a
   specific classic ESP32 profile as the more common first board? The choice must
   name a profile either way.
4. Does the timed sequence reuse the `.show` event format, or need its own?
