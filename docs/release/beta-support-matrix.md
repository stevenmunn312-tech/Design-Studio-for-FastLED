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
| Supported | Windows 11 Home (build 10.0.26200) | Chrome 150.0.7871.101 | ESP32-S3 | WS2812B | 16x16 | Single rectangular matrix (serpentine) | `fbuild` | 🧪 Flash Wiring Test | Flash the standalone wiring-diagnostic sketch and confirm LEDs display correctly | `CLAUDE.md` wiring-diagnostics note (`2026-07-15`) |
| Supported | Windows 11 Home (build 10.0.26200) | Chrome 150.0.7871.101 | ESP32-S3 | WS2812B | 16x16 | Single rectangular matrix (serpentine) | `fbuild` | ⚡ Flash Stream Receiver + 📡 Live Stream | Flash the Adalight stream receiver once, then push live-preview frames to the board over serial | `CLAUDE.md` live-streaming note (`2026-07-15`) |
| Supported | Windows 11 Home (build 10.0.26200) | Chrome 150.0.7871.101 | ESP32-S3 | WS2812B | 16x16 | Single rectangular matrix (serpentine) | `fbuild` | USB flash via `esptool` through the helper's normal Upload path | Generate a generative show controller sketch (`PatternCollection` → Show Engine → `MatrixOutput`), compile, flash, and run it on hardware | `CLAUDE.md` show-codegen note (`2026-06-26`) |
| Supported | Windows 11 Home (build 10.0.26200) | Chrome 150.0.7871.101 | ESP32-S3 + INMP441 | WS2812B | 16x16 | Single rectangular matrix (serpentine) | `fbuild` | USB flash via `esptool` through the helper's normal Upload path | Generate a sketch with an on-device INMP441 mic FFT path, compile, flash, and confirm it reacts to live audio | `CLAUDE.md` on-device-audio note (`2026-06-28`) |

These are the only fully recorded public-beta support rows today.

## Recorded validations that are not yet full support rows

None currently — every hardware validation recorded to date has captured all
six graduation fields and has been promoted to the Supported table above.
This section stays as a placeholder for future runs that record only a
partial combo.

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
- Baked song envelopes and collection-driven modulation in the music-show
  pipeline.

## How to graduate a new supported row

When a new combo is validated, record all of the following in the same note or
PR before promoting it here:

1. Host OS and version.
2. Browser and version.
3. Board and board core / build engine path.
4. LED chipset, matrix size, and physical layout mode.
5. Upload method used.
6. What was actually verified on hardware.

## Community beta reports

The Matrix Output **Upload...** panel includes an opt-in **Beta hardware
coverage** report. It compares the current target and graph features with the
recorded rows above, requests explicit Pass/Fail/Not tested observations, shows
the complete payload, and only then offers Copy, JSON download, or a pre-filled
GitHub report. Nothing is submitted automatically, and the report excludes
ports, project content, code, media, Wi-Fi details, and device identifiers.

See [`beta-hardware-validation.md`](beta-hardware-validation.md) for the tester
flow, maintainer triage rules, and the planned SD-show validation checklist.
