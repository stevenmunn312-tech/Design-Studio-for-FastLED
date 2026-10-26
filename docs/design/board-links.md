# Board links: controls and readings between boards over ESP-NOW

Status: implemented, experimental (compiled on ESP32, ESP32-S3 and ESP8266;
bench runs 1, 2 and 3 passed) · Owner: app · Date: 2026-10-23 · Root todo, D-13
(v1)

Builds on [multi-board projects](multi-board.md), which lets a project carry
several boards but refuses any wire from one board's part to another's. A board
link lets the controls and readings that a wire carries travel between boards
over ESP-NOW, so one board can do the LEDs and the music while another does the
screen, the buttons and the encoders.

## Why

One ESP32 that renders LEDs, decodes audio and draws an LVGL screen runs short
of everything at once: the screen's SPI bus and the encoders use pins the LEDs
and the I2S chain want, LVGL's pool and draw buffers take heap the audio
buffers and the LED frame want, and redrawing the screen takes CPU time from
decoding and LED output. Moving the user interface to a second board frees all
three on the render board. The same link answers the smaller case of an ESP8266
serving a Web Remote that sets the brightness and volume of an ESP32.

The render board pays for the radio instead: the Wi-Fi driver ESP-NOW needs
takes heap of its own (see [Limits](#limits)). A screen with LVGL costs more
than that, so the split still frees memory, but a project with no screen gains
less than it might seem.

## What the user does

Nothing new. There is no link node to place and no link to configure: the
Hardware pane already says which controller each part belongs to, and that is
all a link needs. The user puts parts on two boards in the Hardware pane, as
today, and creates controls as usual: wires an encoder on Board 2 into the
Music Player's volume, or the Music Player's Display output into a colour
panel on Board 2. Studio sends the value behind the scenes or refuses the
wire with a message. Where the multi-board
model reports "A wire crosses boards", a wire that a link can carry is now
drawn as a **link wire**: dashed, with a radio mark, and a tooltip naming the
two boards ("Board 2 to Board 1 over ESP-NOW"). A wire a link cannot carry
stays the existing error, with a sentence saying what to move.

The preview is unchanged: it evaluates the whole root graph, so a linked value
reaches its consumer in the same pass, as if the link were perfect.

## The graph model

### Anchors

A node is **anchored** to a board when its value can only be computed there:

- a bench part or LED output, on the board in its `boardId` (as today);
- a **network endpoint**: the Web Remote, the DMX/Art-Net input, the DDP input
  and a networked Stream Output. Each is a radio or socket on one physical
  board, so it now carries `boardId` too (absent means the primary), and its
  inspector shows a "Runs on" board picker when the project has more than one
  board. Today these signal nodes land in every partition that reaches them,
  so two boards could each serve the same remote page; anchoring fixes that;
- a **generator owner**: Music Player, Performance Generator and Pattern
  Slideshow. Each one is the sketch generator of the board whose LED output it
  drives, so it is anchored to every board whose LED output it reaches
  downstream. Two boards showing one slideshow are both anchors, which is the
  synced-show case multi-board already supports.

Every other signal node (patterns, maths, palettes, controls such as Toggle) is
unanchored and is computed on each board that needs it, as it is today.

### Which nodes a board compiles

A board's partition becomes:

1. its Board node and the nodes anchored to it;
2. every node upstream of those, walking against the wires, where a node is
   **foreign** to this board if it is anchored to another board, or if it takes
   a wire that a link cannot carry from a node foreign to this board. The walk
   does not enter a foreign node;
3. for every wire from a foreign node into a node of this board, a **link-in**
   in place of the wire, when the wire's type can be carried; otherwise the
   wire is a cross-board error;
4. for every foreign-to-them value another board receives from this board, a
   **link-out**, plus the nodes upstream of it that this board must compute to
   send it;
5. the signal nodes no board needs at all (an unfinished patch, a sink such as
   Master Speed that every sketch applies) in every board where they are not
   foreign, as today.

This replaces today's walk "downstream from its inputs". With links, a node
downstream of Board 2's encoder that only feeds Board 1 is Board 1's business:
Board 1 computes it from the encoder's linked value, and Board 2 only sends the
encoder.

The cut is therefore as close to the source as a link can carry it. An encoder
on Board 2 feeding a Map Range that feeds Board 1's Player Controls sends the
encoder's raw value; Board 1 computes the Map Range. A Song Info node fed by
Board 1's Music Player takes a `music` wire, which cannot be carried, so it is
foreign to Board 2 and computed on Board 1; its numbers and text then travel
to Board 2's panel. (As built, Song Info takes the player's `display` wire,
so a Song Info on the receiving board reads the player's fields over the
link, one slot per Song Info output it wires onward.)

Two worked cases:

| Wire | Board 1 (LEDs, music) compiles | Board 2 (screen, controls) compiles |
| --- | --- | --- |
| Board 2 encoder into Player Controls volume | link-in for the encoder, Player Controls, Music Player | the encoder, link-out for its value |
| Music Player Display into Board 2's colour panel | Music Player, link-out for the bound fields | link-in for the bound fields, the panel |
| Board 2 panel's Next button into Music Player | link-in for the button | the panel, link-out for the button |
| Board 2 microphone into a pattern on Board 1 | error: audio cannot cross boards | |

### Synthetic link nodes

These are internal plumbing, not something the user sees. They never appear on
the canvas, in the node library or in a saved project; they exist only in the
board partition handed to validation and the generators, rebuilt from the
wires on every change. The alternative, teaching every generator and
validator to recognise a wire that leaves its board, would thread link logic
through code that today knows nothing about boards.

`boardPartition` emits two library-hidden node types that are never saved:
`BoardLinkIn` (no inputs, one output) and `BoardLinkOut` (one input, no
outputs), each carrying the link slot it stands for and the data type of the
wire it replaces. Every one-board consumer then works unchanged, which is the
partition model's whole point: the generator sees a source node and a sink
node. `BoardLinkOut` is a sink, so the derived `HOT_NODE_TYPES` and
`TERMINAL_NODE_TYPES` must include it or evaluation and codegen prune it.

`findCrossBoardIssues` keeps its name and reports only the wires a link cannot
carry. A second function, `boardLinkSchema(nodes, edges)`, returns the slot
table both sides compile from (below).

## What a link carries

| Wire type | Carried as | On the wire |
| --- | --- | --- |
| `float` | the value | 4 bytes, IEEE 754 little-endian |
| `bool` held (a Toggle, a switch, a PIR) | the level | 1 byte |
| `bool` momentary (a Button, a panel button, a keypad key, a remote Button) | a press counter and the level | 2 + 1 bytes |
| `color` | packed `0xRRGGBB` | 3 bytes |
| `string` | the text, at most 63 bytes, clamped as Text Entry is | 1 + n bytes |
| `datetime` | Unix seconds | 4 bytes |
| `display` | one slot per field the receiving panel binds | per field |
| `playercontrols` from a Touch Screen | one slot per press and level its panel publishes | per field |

`frame`, `audio`, `field`, `image`, `palette`, `music`, `patternset`,
`transitionset`, `playerparticles`, `storage` and `dmx` cannot cross, nor a
`playercontrols` bundle from anything but a Touch Screen (a Player Controls
node is computed on the board that reads it, from inputs a link carries). A frame stream needs far more bandwidth than ESP-NOW gives a
control link, and the others are structures the receiving sketch does not
have.

A display wire is decomposed at schema time into the fields the receiving
panel uses: the bound widgets' fields and the fixed layout's rows, read from
the same field catalogue `displaySourceFields.ts` already derives, answered on
the sending side by `PLAYER_SOURCE_EXPRESSIONS` or `SHOW_SOURCE_EXPRESSIONS`.
Only those fields are sent, so a panel that shows the track title and position
costs two slots. The LED picture (`picture` on the player and slideshow
signals) is never sent; a remote panel draws without it, and validation warns
where a layout binds it.

The receiving board answers those fields through a new source table beside
the existing ones, so a normal sketch can draw a linked `player` or
`slideshow` signal. `SKETCH_DISPLAY_SOURCE_KINDS` learns that a linked player
is answerable in a normal sketch, because the values arrive rather than being
computed.

A Touch Screen's Controls wire is carried in the same way, as the finished
bundle its board builds: one counted press per one-shot field (Play / Pause,
Previous, Next, LED On / Off, Previous and Next Pattern) and, per level
(Volume, Brightness), the level with a flag that a finger has set it. The
fields are the ones the panel publishes, read from the graph alone: a fixed
layout's touch regions, or the screen design's role-stamped widgets, which the
Touch Screen's ports carry with their role and type for exactly this
(`touchControlsFields` in `src/build/boardLinkControls.ts`). The receiving
board rebuilds the bundle with the service a Player Controls node uses, so a
Music Player, Pattern Slideshow, LED output or Player Controls node there reads
it as it would a Touch Screen of its own. The user wires one Controls wire,
as on one board.

### Values, presses and dropouts

- **Absolute values only.** Every slot is a value ("volume is 0.6"), never a
  step, so a lost frame heals at the next one.
- **Presses are counters.** A momentary source counts its presses; the
  receiver turns each increment into exactly one pass reading true, so a tap
  between two receiver passes, or a frame lost while the link is up, is never
  lost. Presses made while the link is down are dropped, not replayed late:
  on reconnect the receiver adopts the counter without firing.
- **Start values.** Before the first frame a link-in reads the sending node's
  start value, the value the preview has at time zero, compiled into both
  sketches.
- **Link lost** one second after the last valid frame. Held values keep their
  last value, so a Board 2 reset does not change the LEDs. Momentary levels
  fall to false, the Web Remote's rule for a held phone button. A linked
  display signal becomes absent, so the panel draws its existing
  "WAITING FOR A SIGNAL" screen, which is how the user sees the other board is
  gone.

## The protocol

Studio numbers the slots; both sketches are generated from the same table, so
neither side negotiates anything.

- **Addressing.** Frames go to the broadcast address. No board needs to know
  another's MAC address, so nothing has to be read off a board and typed into
  Studio. Broadcast frames are not acknowledged or retried by ESP-NOW; the
  heartbeat below covers that.
- **Frame.** Little-endian, written byte by byte as the clock-sync datagram is:
  `FLLK`, version, sender board index, flags, the project's link id (32 bits),
  the schema hash (32 bits), the sender's boot session (32 bits, random at
  boot), a frame counter (32 bits), then slots as an index byte and a value,
  then an 8-byte authentication tag. At most 250 bytes, the ESP-NOW v1 payload
  every supported core accepts.
- **When frames are sent.** On change, at most once every 20 ms, with only the
  changed slots; and a heartbeat every 200 ms with every number slot and one
  text slot in rotation, so a new or reset receiver has the whole state within
  about a second.
- **Authentication.** HMAC-SHA256 over the frame with a 128-bit project link
  key, truncated to 8 bytes. A receiver drops a frame whose link id, schema
  hash or tag is wrong, or whose counter is not above the last one seen in its
  session. A new session id is accepted with a valid tag; that is what a
  sender's reset looks like. ESP-NOW's own encryption is not used, because it
  works only on unicast peers.
- **Schema mismatch.** A board running firmware from before the last edit that
  changed the link sends a different schema hash. Its frames are dropped, the
  serial telemetry says "link schema mismatch", and the Upload tab warns first
  (below).

### Radio channel

ESP-NOW peers must share a Wi-Fi channel.

- If no linked board joins Wi-Fi, every linked board sets the channel stored
  on the primary Board (`linkChannel`, default 1).
- If any linked board joins Wi-Fi (clock sync, NTP, Web Remote, Art-Net), its
  channel is the access point's. Every linked board that joins Wi-Fi must join
  the same network; validation enforces it. Wired Ethernet does not move the
  radio, so a board on a cable alone counts as not on Wi-Fi.
- A linked board that joins no Wi-Fi beside one that does follows that
  network's channel: it scans for the network by name (never joining it, so
  only the name reaches its sketch) at start, and again once it has heard
  nothing for three seconds, at most every ten. A board that only sends cannot
  tell it is unheard, so it scans every minute. A scan takes about 1.6 seconds
  and runs alongside the loop; frames sent or due during it are lost.
- A board that is on Wi-Fi and linked turns modem sleep off, or frames are
  missed between beacons.

### Key and link id

The link id is generated once per project and stored on the primary Board node
(`linkId`). The key is a secret, so it is not in the project file: it lives in
the same browser-local credentials store as the Wi-Fi passwords, keyed by the
link id. A project opened on another machine has no key; validation says so and
offers to make a new one, which means reflashing every linked board.

## Firmware

`src/codegen/peripherals/espNowLinkCpp.ts`, emitted only when the partition
holds a link-in or link-out, with only the parts that partition uses (no
receive path on a board that only sends, no text helpers without a text slot):

- **ESP32** through `esp_now.h`, on core 3.x and core 2.0.17. The receive
  callback's signature differs between them (core 3 passes
  `esp_now_recv_info_t *`), chosen by `ESP_ARDUINO_VERSION_MAJOR`. HMAC through
  mbedTLS.
- **ESP8266** through `espnow.h` with the combo role, HMAC through the core's
  BearSSL. Chosen by `#if defined(ESP32)` as the Web Remote is, so the sketch
  specialiser keeps one branch.
- **No work in the callback.** It runs in the Wi-Fi task, so it only copies a
  frame into a small ring under a lock; `loop()` verifies and applies frames
  once per pass, before the graph is evaluated, and sends after it.
- **No send callback.** Broadcast frames have no delivery report worth
  reading, and the send-callback signature changed across IDF versions.
- **Generators.** In a normal sketch a link-in is a value expression and a
  link-out a terminal. In the show and player sketches a link-in is a typed
  source in `createControlGraph`, as `webRemoteControlEmission` is, and a
  link-out reads the control graph's value or the generator's field
  expression.
- **Telemetry.** The serial telemetry line gains frames received, frames
  dropped by reason, and milliseconds since the last valid frame.
- **Escaping.** No user text reaches the C++ except labels in comments through
  `cppComment`; the key is a byte array Studio writes from validated bytes.

## Validation

- A link needs ESP-NOW on both ends: an ESP32 with a radio (classic, S2, S3,
  C3, C6) or an ESP8266. Anything else is an error naming the board.
- A wire a link cannot carry is the existing cross-board error, with the type
  and the fix: "Audio cannot cross boards. Put the microphone on Board 1."
- Linked boards on Wi-Fi must share one network: an error naming both boards
  and both networks.
- A board's slots are bounded (64 slots, 8 text slots per sending board, a
  bound to confirm at the first bench run); over it is an error.
- No link key on this machine: an error with a fix that makes one.
- A remote panel binding the LED picture: a warning.
- The existing per-board RAM estimate adds the Wi-Fi driver's cost on a linked
  board that was not already on the network.

## Upload

Each board's status line already lives per board. The Upload tab also keeps
the schema hash each board was last flashed with, and warns when a board's
flashed hash differs from the project's: "The link changed since Board 2 was
uploaded. Upload Board 2 as well." Order does not matter: an out-of-date board
drops frames until both match.

## Build Diagram

No wire is drawn between boards: the link is radio. Each board's sheet says
which boards it links to, and that ESP-NOW range drops through metal
enclosures, so antennas stay clear. Grounds need no bond for a radio link.

## Implementation order

1. Partition rework: anchors, the foreign rule, `BoardLinkIn` and
   `BoardLinkOut`, `boardLinkSchema` and its hash, `findCrossBoardIssues`
   narrowed. Partition and schema tests.
2. `boardId` and the "Runs on" picker for the network endpoints.
3. Canvas link wires; the link channel in the board options; the link id and
   key in the credentials store.
4. `espNowLinkCpp.ts` and its use in the three generators, display-field slots
   and the receiving source table, telemetry. Generator tests, and host native
   tests for the frame codec and the HMAC.
5. Validation and the Upload tab warning.
6. Help and guides, an experimental row in the
   [support matrix](../release/beta-support-matrix.md), and this note's status.
7. Compile at the v1 freeze with the rest of the matrix; the bench row is in
   the root todo, section 4.

## Limits

- Range and reliability are ESP-NOW's: a few tens of metres indoors, less
  through metal; the bench held 15 m through four walls without loss.
  Latency is a few milliseconds per frame on the radio, but a press waits
  for the sender's next frame and the receiver's next loop: about 250 ms end
  to end on the bench's Music Player.
- The radio costs the render board about 75 KB of internal heap (130 KB free
  without the link, 55 KB with it, on an ESP32-S3 Music Player), on or off
  Wi-Fi. A screen with LVGL still costs more.
  ([bench record](../reports/bench/board-link-bench.md))
- Only boards from one project link to each other.

## As built

Where the build differs from, or narrows, the design above:

- The slot table lives in `src/build/boardPartition.ts` (`boardLinkSchema`,
  `boardLinkWires`) with the vocabulary in `src/build/boardLinks.ts`; display
  fields are decomposed in `src/build/boardLinkDisplay.ts`. A display slot
  takes one frame index per field, and the slot bounds count frame indexes.
- The firmware is `src/codegen/peripherals/espNowLinkCpp.ts`, with the show and
  player plumbing in `boardLinkTemplate.ts`; its codec is checked byte for
  byte against a TypeScript mirror on the host (WSL g++). Both boards of
  each bench run compile for ESP32, ESP32-S3 and ESP8266
  ([compile checks](../reports/compile/board-link-compile-checks.md)).
- Validation is `src/utils/boardLinkValidation.ts`. Beyond the design it warns
  when a linked board off Wi-Fi sits beside one on Wi-Fi ("may not hear"),
  and refuses a linked screen reading or time into a board whose sketch is a
  show or a Music Player, whose control graph carries only numbers, switches,
  presses, colours and text.
- Channel following was out of scope here until the D-13 bench: a Music
  Player sketch has no Wi-Fi of its own, so beside a CYD on clock sync the two
  radios sat on different channels and heard nothing. The scan replaced
  validation's "may not hear" warning, whose remedy was a channel set by hand.
- The key is made when the first link wire is drawn, never on load; a project
  opened elsewhere gets a new key only from Graph Health's fix.
- A Duplicate or Save As of a linked project takes a new link id and key
  (`src/state/peripherals/boardLinkCopy.ts`), so the copy's boards and the
  original's never accept each other's frames. Save As adopts the id only
  once the copy is saved.
- The Upload tab records a fingerprint of the schema hash, link id and key for
  each board's last flash, so a new key or a copy asks for every other linked
  board to be uploaded again, as a changed slot table does.
- Removing a board moves its network endpoints to the primary rather than
  deleting them, since they carry design.
- Start values: Web Remote controls start at their real start state; every
  other source starts at 0, false, black or empty text.
- Not carried: a linked LED-output status, and a Pattern Browser's
  thumbnails (they exist only on the sending board, so a remote OLED Pattern
  Browser shows its waiting screen). A screen design has no waiting screen of
  its own; while the link is lost its bound widgets read blank.

## Deliberately out of scope for v1

- Frames or audio between boards.
- A wired link (UART or RS-485) as a second transport. It costs no radio heap
  and suits a fixed install, and is the first follow-on.
- UDP as a transport, and clock sync carried over ESP-NOW so synced shows work
  without a router.
- A Link Status node; the waiting screen and telemetry report a lost link.
- Boards from different projects, and links to devices Studio did not build.
