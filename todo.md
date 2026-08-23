# TODO

Active work only. Completed work belongs in [`CHANGELOG.md`](CHANGELOG.md), Git history, or the relevant report. Hardware support evidence and remaining validation gaps are authoritative in [`docs/release/beta-support-matrix.md`](docs/release/beta-support-matrix.md).

## Release readiness

- [ ] Run a first-user journey from a clean account: launch, load a starter, see animation, configure supported hardware, and export or upload without source-code documentation.
- [ ] Exercise every blocking-validation class—pins, layout, power, board/toolchain, capacity, and graph structure—and confirm each failure gives an actionable repair message.
- [ ] Complete a clean-browser/account offline-PWA relaunch and an end-user-machine desktop smoke test; finish platform signing/notarization before publishing desktop artifacts.
- [ ] Record the remaining support rows listed in the support matrix rather than promoting configurations from automated coverage alone.

## Hardware validation

- [ ] Confirm the classic-ESP32 SD-show provisioning/player path end to end after the timeout, partition, audio-library, and playback-position fixes.
- [ ] Validate ESP32-S3 PSRAM modes, tiled/rotated panels, custom XY maps, baked song envelopes, and collection group-input modulation.
- [ ] Validate Art-Net firmware against a real controller and DMX512 firmware through a real RS-485 transceiver. Keep both experimental until recorded.
- [ ] Validate RTC Compile Time/Manual drift and a real NTP sync. DS3231 already has a recorded hardware pass.
- [ ] Complete HUB75 evidence: a full single-panel support row plus Live Stream, folded/chained/rotated layouts, and show/player generators on real hardware.

## Engineering follow-ups

- [ ] Make `buildXYTable` reject or safely normalize negative dimensions instead of throwing `RangeError`; production callers currently clamp dimensions first.
- [ ] Stop `publishStreamFrame` retaining a raw reference to a pooled evaluator frame; correctness currently relies on the render loop and sender never interleaving.
- [ ] Add dedicated authoring geometry for remaining non-matrix forms such as corkscrew layouts. Strip, ring, and custom mapping already exist; avoid describing the whole application as matrix-only.

## Active development line

Breaking hardware work is tracked in [`docs/development/plans/hardware-todo.md`](docs/development/plans/hardware-todo.md). Detailed feature contracts are routed through [`docs/NAVIGATOR.md`](docs/NAVIGATOR.md).
