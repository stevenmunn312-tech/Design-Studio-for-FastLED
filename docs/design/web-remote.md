# Web Remote: a phone control page over Wi-Fi

Status: **landed** on Hardware, 2026-10-21, as part of D-02's remote/network
UI. Compiles and device readings wait for the v1 freeze like every other
firmware feature.

## What it is

A **Web Remote** node is an input whose outputs are controls on a web page the
board serves over its own Wi-Fi. Open `http://<hostname>.local` (or the board's
IP address) on a phone on the same network and the page shows one large,
touch-sized row per control. Each control is an output of the node, so the rest
of the graph cannot tell a phone from a pot or a touch screen.

The controls are the custom-screen control widgets, used for their meaning
rather than their drawing:

| Control | Output | Behaviour |
| --- | --- | --- |
| Button | bool | True while held |
| Toggle | bool | A latch |
| Slider | float | Ranged by Minimum, Maximum, Step |
| Step Control | float | The same range, moved by minus and plus keys |
| Choice Strip | float | The chosen option's index, counting the first as 0 |
| Colour Picker | colour | A hue at a set saturation and brightness |

Everything a control needs is read from `displayRegistry.ts`:
`displayControlRange`, `displayControlStartValue`, `displayChoiceOptions`,
`displayPickerTone` and `displayControlOutput`. A phone control and a screen
control of the same type therefore start at the same value, move in the same
range and report the same thing.

## The control list

The node stores `controls: { id, type, label, properties }[]`, normalised by
`normalizeWebRemoteControls` (`src/state/peripherals/webRemote.ts`): at most 16,
each a known type, a unique id of lower-case letters, digits and hyphens, a
label of at most 40 characters with control characters removed, and only the
properties its widget type declares, bounded by the widget inspector's own
ranges (`normalizeDisplayWidgetProperties`). A Button keeps its text, a Toggle
its on and off words, a ranged control its range and start, a Choice Strip its
options, a Colour Picker its start hue, saturation and brightness.

Ports are `remote:<id>`, derived from the id and never the label, so renaming
a control keeps its wires. The trailing **Add control…** socket is the Touch
node's `add-control` handle with its `newcontrol` type, which nothing can
connect to, so the only thing it does is the wire-first gesture.

### Adding a text control later

`WEB_REMOTE_CONTROL_TYPES` is the one list, and `webRemoteControlKind` maps a
type to how it behaves. Adding a string-output Text Entry widget is: add it to
the list, give it a `text` kind, and fill the switches the compiler then points
at (the page's `controlHtml`, the body's `MiniControl`, the firmware's value
storage, which would need a bounded `char` buffer per text control beside
`_wrVal`). `webRemoteControlDataType` already reads the output type off the
widget's `out` role, so a `string` output needs no new rule there.

## Wiring a control into existence

Dragging Add control… onto a property row goes through the same derivation as a
touch control: `touchControlPlan` picks a Slider for a ranged number, a Toggle
for a switch, a momentary Button for an action and a Colour Picker for a
colour, named and ranged after the property, or refuses with the same
sentences (including a second control on one value). `connectWireFirstControl`
in `graphStore.ts` is the one entry the canvas calls; it hands a Touch node to
`connectTouchControl` and a Web Remote to `connectWebRemoteControl`, which adds
the control, exposes the property socket and draws the edge in one `set`, then
starts the control at the property's current value. There is no placement
step, because the page lists every control.

A property driven by a remote control stays editable, as one driven by a touch
widget does: `isControlDriverPort` and `writeControlDriverValue`
(`wireFirstControls.ts`) recognise either host and write the typed value back to
the control, clamped and snapped as a phone would set it.

## Preview

The node body is an operable mini remote. Its values live in
`webRemoteRuntime.ts`, a transient store that mutates in place and notifies a
per-node revision, so nothing goes through a React `set` per frame. A Button
pressed and released between two evaluator passes stays true for exactly one
sample, the screen widget's `touchPending` rule.

**Phone preview** loads the page into a sandboxed `srcdoc` frame. It is the
same text the firmware embeds, from the same `webRemotePageHtml`. The page
recognises the frame by its `about:srcdoc` address and posts each change to the
studio with `postMessage` instead of fetching from the board; the studio answers
with the whole state, exactly as `/s` and `/set` do on the device. The frame has
`allow-scripts` only, so the page cannot reach the app, and the studio accepts
messages only from that frame.

## Firmware

`webRemoteFirmware` (`src/codegen/peripherals/webRemoteCpp.ts`):

- **Server.** The core library on each platform, `WebServer` on ESP32 and
  `ESP8266WebServer` on ESP8266, chosen by `#if defined(ESP32)` so the sketch
  specialiser keeps only the selected board's branch. No AsyncWebServer.
- **Routes.** `/` sends the page from PROGMEM (`send_P`), `/s` the state as a
  JSON array with one number per control, a POST to `/set` one control's new
  value. The page polls `/s` every second, so two phones converge.
- **Network.** The Web Remote is a `usesNetwork` user, so the sketch has one
  connection, one hostname and the credentials stored by node id, exactly as
  for Art-Net or NTP. The server and mDNS (`<hostname>.local`, sanitised by
  `webRemoteMdnsName`) start the first time `_netConnected()` is true; a wired
  Ethernet link on an ESP32 serves the page too.
- **Never blocking.** `handleClient()` once per pass serves at most one waiting
  request and returns immediately when none is waiting.
- **Bounded input.** The index must be one or two ASCII digits naming a control;
  the value must be at most 16 characters and finite. Each control then clamps
  and snaps it in a generated `switch` (`_wrQuantize`), the same arithmetic as
  `webRemoteQuantize` in the preview and `q()` on the page.
- **Buttons.** The page repeats a held press every 400 ms; a press not repeated
  for 1.5 s reads as released, so a phone locked mid-press cannot latch a
  Button on. Each request is served in its own pass, so a quick tap is visible
  for at least one pass without a separate pending flag.
- **No dead code.** The quantiser exists only with a ranged control, the hold
  timer only per Button, the hue helper only with a Colour Picker. An unread
  output is pruned like any unused local.
- **Escaping.** Authored text reaches the page only HTML-escaped
  (`escapeHtml`), and the page reaches C++ only through `cppStringLiteral`, one
  literal per page line; labels in comments go through `cppComment`. The page's
  script is static and reads numbers from `data-` attributes, so no label can
  become code.

The Colour Picker's colour is a packed `0xRRGGBB` from `_wrHueRgb`, the
six-sector conversion `displayHueColor` uses, so no generated function returns
`CRGB` (the `.ino` prototype hoist would put it above the FastLED include).

### Generators

| Generator | Support |
| --- | --- |
| Normal sketch | Every control, every output type |
| Pattern show | Through the bounded control graph: floats and booleans to any destination the show accepts, a colour to a destination that takes a self-contained colour |
| SD player | The same, through the player's control graph |

`createControlGraph` builds a Web Remote as a typed source with
`webRemoteControlEmission`, which carries the shared network with it, as an
NTP clock's emission does, so the template starts the same connection and the
graph dedupes the identical blocks. A wire the template cannot evaluate is
refused by the existing routing with its own message; a colour offered where a
number is wanted is refused by name.

Outputs only: the remote does not take a Set input. A screen control's
synchronised Set would need a second channel back to every phone, and the poll
already shows the board's state.

## Validation

- A board without Wi-Fi (anything but ESP32 and ESP8266, and the ESP32-H2 and
  P4, which have no radio) is an error naming the board, unless a wired link is
  on the bench. `fqbnHasWifi` answers it.
- Two Web Remotes are an error: the sketch has one server on port 80.
- A remote with no controls is a warning: the build is correct, the page empty.
- The Wi-Fi name and disagreeing network settings are the existing network
  warnings, now asked of `usesNetwork` rather than a copied predicate.

## Security

The page has no password. Anyone on the same network can open it and move the
controls, as anyone on the network can send Art-Net. The page reads and writes
only the controls' numbers; it cannot change the sketch, the Wi-Fi settings or
anything else on the board.

## Not done

- No text control yet (see above).
- The board's IP address is not shown in the studio; mDNS covers phones that
  resolve `.local`, and the router shows the address.
