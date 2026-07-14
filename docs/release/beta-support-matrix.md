# Beta Support Matrix

FastLED Studio is still pre-release. For the public beta, a combination only
counts as **supported** when the repo contains a recorded validation note for
the exact environment and path that were exercised. Everything else stays
**experimental** until the record is expanded.

## Status levels

- **Supported**: validated end-to-end on real hardware and recorded with the
  exact combo below.
- **CI-covered**: exercised by automated install/test/build jobs only; not a
  browser + board guarantee.
- **Experimental**: present in the product, but not yet validated enough for a
  beta support promise.

## Supported end-to-end combo

| Status | Host OS | Browser | Board | Chipset | Matrix | Layout | Build engine | Upload method | Scope | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Supported | Windows 11 Home (build 10.0.26200) | Chrome 150.0.7871.101 | ESP32-S3 | WS2812B | 16x16 | Single rectangular matrix (serpentine) | `fbuild` | USB flash via `esptool` through the helper's normal Upload path | Generate a live-graph sketch, compile, flash, and run it on hardware | `backend/README.md` and `CLAUDE.md` build-engine note (`2026-06-26`) |

This is the only fully recorded public-beta support row today.

## Recorded validations that are not yet full support rows

These runs are useful confidence signals, but the note that recorded them did
not capture every field needed for a full matrix row.

| Validation | Host OS | Browser | Board | Chipset | Matrix | Layout | Build engine | Upload method | Recorded result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Generative show controller sketch | Windows 11 Home (build 10.0.26200) | Chrome 150.0.7871.101 | ESP32-S3 | WS2812B | 16x16 | Single rectangular matrix (serpentine) | `fbuild` | Not recorded | Two-pattern collection compiled and ran with smooth crossfades and ~5 s dwell matching preview (`2026-06-26`) |
| On-device mic FFT path | Windows 11 Home (build 10.0.26200) | Chrome 150.0.7871.101 | ESP32-S3 + INMP441 | WS2812B | 16x16 | Single rectangular matrix (serpentine) | `fbuild` | Not recorded | Compiled, uploaded, and reacted to live audio on hardware (`2026-06-28`) |
| Flash Wiring Test diagnostic sketch | Windows 11 Home (build 10.0.26200) | Chrome 150.0.7871.101 | ESP32-S3 | WS2812B | 16x16 | Single rectangular matrix (serpentine) | `fbuild` | 🧪 Flash Wiring Test | LEDs displayed correctly across the diagnostic checks (`2026-07-15`) |
| Live Stream via Flash Stream Receiver | Windows 11 Home (build 10.0.26200) | Chrome 150.0.7871.101 | ESP32-S3 | WS2812B | 16x16 | Single rectangular matrix (serpentine) | `fbuild` | ⚡ Flash Stream Receiver + 📡 Live Stream | Flashed the Adalight receiver, then streamed live-preview frames over serial successfully (`2026-07-15`) |

Until those missing fields are captured, they do **not** expand the supported
matrix beyond the single row above.

## CI-covered host/platform coverage

These jobs reduce risk, but they are not substitutes for manual browser or
board validation:

| Status | Coverage | Environment | What it proves | What it does not prove |
| --- | --- | --- | --- | --- |
| CI-covered | Frontend lint/test/build | `ubuntu-latest`, Node 22, Vitest `jsdom`, Vite build | The web app compiles, tests pass, and the production bundle builds | Real browser behavior, USB upload, audio permissions, or hardware behavior |
| CI-covered | Backend helper tests | `ubuntu-latest`, Python 3.11 | API logic and helper request handling pass under pytest | Real serial ports, board flashing, or toolchain installs |
| CI-covered | Backend dependency install | `ubuntu-latest`, `macos-latest`, `windows-latest`, Python 3.11 | Pinned helper dependencies install cleanly and import successfully on all three desktop OS families | End-to-end helper launch, browser integration, or hardware upload |

## Experimental until validated

Unless a future row says otherwise, treat the following as experimental:

- All browsers except Chrome 150.0.7871.101, the only browser with a recorded
  manual validation pass.
- All host OS + browser combinations except Windows 11 Home (build
  10.0.26200) + Chrome 150.0.7871.101, the recorded combo above.
- All boards except ESP32-S3.
- All LED chipsets except the recorded WS2812B row above.
- All matrix sizes except the recorded 16x16 row above.
- All non-rectangular physical layouts: strip, tiled panels, and custom XY
  maps.
- `arduino-cli` as an upload engine.
- SD show provisioning and player upload.
- PSRAM modes.
- Non-crossfade show transitions, beat-triggered show advance, and particle
  overlay in generative shows.
- Baked song envelopes, collection-driven modulation, and serial live
  streaming in the music-show pipeline.

## How to graduate a new supported row

When a new combo is validated, record all of the following in the same note or
PR before promoting it here:

1. Host OS and version.
2. Browser and version.
3. Board and board core / build engine path.
4. LED chipset, matrix size, and physical layout mode.
5. Upload method used.
6. What was actually verified on hardware.
