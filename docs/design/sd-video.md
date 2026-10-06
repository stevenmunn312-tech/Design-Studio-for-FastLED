# SD Video

`SDVideo` plays a video clip from the SD card on a normal sketch. It is Phase 11
of the [pattern node expansion plan](../plans/pattern-node-expansion.md).

## Why not FastLED's video path

The plan first named FastLED's codec module and `fl::Video`. Neither fits:

- `fl::Video` reads headerless `.rgb` frames, or its own FLED container. Its
  MPEG1 path (`openMpeg1Video`) needs an MPEG1 file, and a browser has no MPEG1
  encoder, so the Studio could not produce one from an MP4.
- `fl::FileSystem::beginSd` takes a chip-select pin only. The SD Card part sets
  all four SPI pins, and the music player already mounts the card on them.

So the Studio decodes the video in the browser and writes raw frames. The sketch
reads bytes off the card. No decoder, no frame buffer beyond the node's own.

## Clip file

`.sdv`, little-endian. Defined once in `src/state/evaluator/sdVideo.ts`.

| Bytes | Field |
|---|---|
| 0–3 | magic `SDV1` |
| 4–5 | width |
| 6–7 | height |
| 8–9 | frames per second |
| 10–13 | frame count |
| 14–15 | reserved, zero |
| 16– | frames, `width × height × 3` bytes each, R G B |

The clip is sized to the LED canvas when it is imported. Playback at any other
canvas size stretches it by nearest pixel on both sides (`sdvSourceIndex`).

## Import

`decodeVideoToClip` (`src/utils/sdVideoImport.ts`) seeks an `<video>` element to
the middle of each output frame's slot and draws it, cover-fitted, onto a canvas
the size of the LED canvas (at most 64 × 64). Limits: 60 fps, 120 seconds.
The node keeps a small record in `properties.clip`
(`{ id, name, w, h, fps, frames }`); the bytes live in IndexedDB
(`src/state/sdVideoStore.ts`), not in the project. A project moved to another
machine keeps the record and loses the bytes, so the clip is imported again.

## Playback

Both sides use `sdvFrameIndex(t, fps, speed, frames, loop)`. `t` is the graph
clock in seconds. The sketch's `t` is a `float`, so after many hours a frame can
land one off from the preview's `double`; this is not corrected.

The sketch opens the file on first use and checks the header against the clip
record. A missing card, missing file or mismatched header leaves the node's
buffer black. When the clip is the canvas size it reads the whole frame straight
into the buffer. Otherwise it reads one clip row per canvas row into a row
buffer. It only touches the card when the frame index changes.

## Card and upload

The clip goes to `/video/<name>.sdv`. The node's *Write to card* button copies
it with the existing card-reader route (`/api/sd-copy`), whose folder list now
includes `video`. There is no serial route: only the music player carries the
file-receive protocol, and a normal sketch does not.

The SD bus comes from the SD Card part on the bench, mounted once per sketch
(20 MHz, falling back to 4 MHz).

## Limits

- ESP32 family only. Everything on the card path is inside `#if defined(ESP32)`.
- Normal sketches only. The music player and show builds mount the card
  themselves, so `findSdVideoErrors` blocks a graph that mixes them.
- Bandwidth: the node warns above 400 KB/s (about 64 × 64 at 33 fps, or 32 × 32
  at 130 fps). That figure is an estimate for a 20 MHz SPI bus and a typical
  card, not a bench measurement. Bench results per board belong in the
  [hardware support matrix](../release/beta-support-matrix.md) when taken.
