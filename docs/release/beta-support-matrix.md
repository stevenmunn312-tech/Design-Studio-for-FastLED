# Beta Support Matrix

Design Studio for FastLED is still pre-release. For the public beta, a combination only
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
| Supported | Windows 11 Home (build 10.0.26200) | Chrome 150.0.7871.187 | ESP32-S3 | WS2812B | 16x16 | Single rectangular matrix (serpentine) | `fbuild` | 🧪 Flash Wiring Test | Flash the standalone wiring-diagnostic sketch and confirm LEDs display correctly | `CLAUDE.md` wiring-diagnostics note (`hw-59a1bb36`, `2026-07-24`): full diagnostic sequence confirmed correct; re-validation of the `2026-07-15` first pass |
| Supported | Windows 11 Home (build 10.0.26200) | Chrome 150.0.7871.187 | ESP32-S3 | WS2812B | 16x16 | Single rectangular matrix (serpentine) | `fbuild` | ⚡ Flash Stream Receiver + 📡 Live Stream | Flash the Adalight stream receiver once, then push live-preview frames to the board over serial, sustained | `CLAUDE.md` live-streaming note (`hw-f31a7f82`, `2026-07-24`): re-validated after fixing an intermittent freeze (root cause: the dev helper's unread stdout/stderr pipes, not the receiver or write path) — 5+ minutes of steady 30 fps with no freeze; supersedes the `2026-07-15` first pass |
| Supported | Windows 11 Home (build 10.0.26200) | Chrome 150.0.7871.101 | ESP32-S3 | WS2812B | 16x16 | Single rectangular matrix (serpentine) | `fbuild` | USB flash via `esptool` through the helper's normal Upload path | Generate a generative show controller sketch (`PatternCollection` → Show Engine → `MatrixOutput`), compile, flash, and run it on hardware | `CLAUDE.md` show-codegen note (`2026-06-26`) |
| Supported | Windows 11 Home (build 10.0.26200) | Chrome 150.0.7871.187 | ESP32-S3 + INMP441 | WS2812B | 16x16 | Single rectangular matrix (serpentine) | `fbuild` | USB flash via `esptool` through the helper's normal Upload path | Generate a generative show with on-device microphone, non-crossfade transitions, beat-triggered advance, and particle overlay; compile, flash, and run it on hardware | GitHub issue #106 (hw-e791188d, `2026-07-24`): all checks passed including show runtime, beat advance, and particle overlay |
| Supported | Windows 11 Home (build 10.0.26200) | Chrome 150.0.7871.187 | ESP8266 | WS2812B | 10x1 | Strip (non-matrix) | `arduino-cli` | USB flash via `esptool` through the helper's normal Upload path | Generate a live-graph sketch, compile, flash, and run it on hardware | `CLAUDE.md` physical-layout note (`hw-f57928b9`, `2026-07-25`): all checks passed including color order, orientation, and power cap |
| Supported | Windows 11 Home (build 10.0.26200) | Chrome 150.0.7871.187 | ESP8266 | WS2812B | 10x1 | Strip (non-matrix) | `arduino-cli` | 🧪 Flash Wiring Test | Flash the standalone wiring-diagnostic sketch and confirm LEDs display correctly | `CLAUDE.md` wiring-diagnostics note (`hw-7adaec6f`, `2026-07-25`): full diagnostic sequence confirmed correct on ESP8266 + strip layout |
| Supported | Windows 11 Home (build 10.0.26200) | Chrome 150.0.7871.187 | ESP8266 | WS2812B | 10x1 | Strip (non-matrix) | `arduino-cli` | ⚡ Flash Stream Receiver + 📡 Live Stream | Flash the Adalight stream receiver once, then push live-preview frames to the board over serial | `CLAUDE.md` live-streaming note (`hw-b0b34ed3`, `2026-07-25`): re-validated after fixing a frame-dimension bug that silently dropped every frame on 1-row strip layouts — all checks passed |

These are the only fully recorded public-beta support rows today.

## Recorded validations that are not yet full support rows

- **2026-08-09 — ESP32-S3, HUB75 output, 🧪 Flash Wiring Test (`fbuild`).**
  A real ESP32-S3 driving a P4 64×64 HUB75 panel (single panel, `layout:
  matrix`, default pinout) compiled, flashed, and booted cleanly, and the
  wiring-diagnostic pattern displayed correctly. Confirms both the pin fix and
  the GPIO0→CLK boot-strapping choice in `nodeLibrary.ts`'s HUB75 defaults are
  safe in practice on this board+panel combo. No full row yet — missing the
  exact host OS/browser version fields, and normal Upload, Live Stream, panel
  chaining, and the show/player generators (unimplemented for HUB75) remain
  unvalidated. See `docs/development/design/hub75-output.md` and `todo.md`.
- **2026-07-28 — classic ESP32, music-sync SD-show pipeline (`fbuild`),
  partial/failed bring-up.** The run reached the real provisioning/player path
  and exposed four defects: the provisioner's initial SD-write acknowledgement
  timeout was too short, the stock dual-OTA partition capped the Player sketch,
  `ESP32-audioI2S` releases ≥3.1.0 allocated more buffer than a non-PSRAM ESP32
  could provide, and the generated Player used the wrong DAC/time-position
  APIs. Commit `4dc22f1` fixes those findings (20 s acknowledgement timeout,
  `huge_app.csv`, pinned `ESP32-audioI2S` 3.0.12, and
  `getAudioCurrentTime()`), but no confirming end-to-end playback pass or full
  six-field environment record exists yet. SD-show provisioning therefore
  remains experimental.

## CI-covered host/platform coverage

These jobs reduce risk, but they are not substitutes for manual browser or
board validation:

| Status | Coverage | Environment | What it proves | What it does not prove |
| --- | --- | --- | --- | --- |
| CI-covered | Frontend lint/test/build | `ubuntu-latest`, Node 22, Vitest `jsdom`, Vite build | The web app compiles, tests pass, and the production bundle builds | Real browser behavior, USB upload, audio permissions, or hardware behavior |
| CI-covered | Backend helper tests | `ubuntu-latest`, Python 3.11 | API logic and helper request handling pass under pytest | Real serial ports, board flashing, or toolchain installs |
| CI-covered | Backend dependency install | `ubuntu-latest`, `macos-latest`, `windows-latest`, Python 3.11 | Pinned helper dependencies install cleanly and import successfully on all three desktop OS families | End-to-end helper launch, browser integration, or hardware upload |
| CI-covered | Portable desktop packaging | `windows-latest`, `ubuntu-22.04`, `macos-15` ARM64, and `macos-15-intel`; Python 3.11, Node 22, PyInstaller | The native archive builds, bundled `fbuild`/`esptool` tools execute, and the frozen launcher serves its status, health, and app-shell endpoints | Code signing/notarization, clean-user installation, default-browser behavior, physical serial ports, or hardware upload |

## Experimental until validated

Unless a future row says otherwise, treat the following as experimental:

- All browsers except Chrome 150.0.7871.101 / 150.0.7871.187, the only
  browser builds with a recorded manual validation pass.
- All host OS + browser combinations except Windows 11 Home (build
  10.0.26200) + Chrome 150.0.7871.101 or 150.0.7871.187, the recorded combos
  above.
- All boards except ESP32-S3 and ESP8266 (see the rows above).
- All LED chipsets except the recorded WS2812B row above.
- All matrix/strip sizes except the recorded 16x16 and 10x1 rows above.
- Tiled panels and custom XY maps (non-rectangular layouts) — strip layout
  has one recorded validation (see the ESP8266 row above).
- `arduino-cli` as an upload engine, beyond the recorded ESP8266 +
  strip-layout row above.
- PSRAM modes.
- Baked song envelopes and collection-driven modulation in the music-show
  pipeline.
- SD show provisioning and player upload (music-sync shows remain experimental).
- **DMX / Art-Net input, in every mode.** No hardware pass has been recorded
  for either transport. Two separate runs are needed before any part of this
  graduates:
  - **Art-Net firmware** (ESP32 / ESP8266): a generated sketch joins Wi-Fi,
    receives a universe from a real controller or desk, and drives the matrix.
  - **DMX512 firmware** (ESP32 only): a generated sketch reads a real DMX line
    through an RS-485 transceiver on the configured UART pins.
  - **Helper-backed Art-Net preview** is browser + helper only and never
    touches a board, so it graduates with the Art-Net firmware run rather than
    as its own row. Note that preview holds exactly one live universe.
- **Wi-Fi-dependent firmware generally**, including NTP time sync for the RTC
  Clock node — no board has confirmed a real network connection, and neither
  the software clock's drift nor an actual NTP sync has been validated.

  Everything above is covered by unit, codegen, and backend tests only. A DMX
  hardware row also needs the transceiver part number and wiring, the
  controller/desk software and version, and the universe and channels
  exercised, in addition to the six fields listed below.

### RTC Clock: board × time-source capability matrix

`RTCInput`'s `timeSource` picks how firmware seeds its clock; which boards
each source is allowed on is enforced in `validateGraph.ts`
(`findBoardCompatibilityErrors`), not just implied by the docs above:

| Time source | Allowed boards | Enforced by validation | Hardware validated |
| --- | --- | --- | --- |
| Compile Time | Every board in the catalogue | No board restriction | No |
| Manual | Every board in the catalogue | No board restriction | No |
| NTP | ESP32-family (S3, S2, C3, C6, H2, classic) and ESP8266 | Yes — blocked on every other board | No |
| DS3231 | Every board with the standard Arduino `Wire` API and a default I²C bus | No board restriction | No |

Notes:

- The NTP restriction is keyed on FQBN prefix (`esp32:` / `esp8266:`), not on
  whether a board actually has a Wi-Fi radio. **Arduino UNO R4 WiFi** is in the
  board catalogue and does have Wi-Fi hardware, but is not an ESP32/ESP8266
  FQBN, so NTP is currently blocked on it too — a known gap, not a validated
  "unsupported" result.
- Art-Net input (see above) is gated by the identical ESP32-family-or-ESP8266
  check and shares this same open hardware-validation gap.
- Compile Time and Manual need no network and are not blocked on any board,
  but neither has a recorded drift measurement — see the note below.
- DS3231 uses address `0x68` and the board core's default SDA/SCL pins. It has no
  third-party library dependency. Pin labels vary by board, and the current GPIO
  validator cannot infer those board-default aliases, so users must avoid
  assigning the same physical pins to a non-I²C role. Other RTC chips are not
  supported. See [`rtc-clock-and-schedule.md`](../development/design/rtc-clock-and-schedule.md)
  for the full contract.

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
