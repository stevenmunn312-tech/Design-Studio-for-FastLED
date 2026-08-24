# Hardware branch — active work

Active backlog for the breaking `Hardware` line. The implemented two-view hardware model is documented in [`hardware-nodes.md`](../design/hardware-nodes.md) and [`board-node-architecture.md`](../design/board-node-architecture.md); completed implementation history is in Git and `CHANGELOG.md`.

`main` is frozen. Do not merge these changes into the public-beta line.

## Audio capability

- [x] Add an `Audio` capability node with a source dropdown over attached board capabilities, an honest empty state, and a sensible single-source default.
- [x] Route `FFTAnalyzer`, `BeatDetect`, `PercussionDetect`, and `AudioFeatures` through explicit ports instead of ambient `useAudioStore.getState()` reads.
- [x] Add a decoder tap so on-board playback can analyse PCM before the DAC and drive generative shows without a microphone.
- [x] Add ESP32-S3 PCM1802 line-in hardware/capability support for player modules that cannot expose decoded PCM.

## Deferred model work

- [x] Add a Storage capability abstraction covering SD, onboard flash, and USB.
- [ ] Implement per-output native rendering so differently shaped outputs do not distort one shared composition. Keep preview and firmware changes together; see [`per-output-native-render.md`](../design/per-output-native-render.md).
- [ ] Support two-board graphs if the product needs attachment edges again.
- [ ] Add a Raspberry Pi codegen backend after the controller model is stable; this remains outside the initial hardware release.

## Bench findings

- [x] Retest MAX98357A audio with a replacement module before changing generator code. The replacement-module test produced successful audio output; the earlier failure was at least partly due to wiring.
- [ ] Report that fbuild can silently ignore a pinned `platform = espressif32@...` version.
- [ ] Report the reproducible fbuild deploy/serial-port failure where shell `esptool` opens the same port successfully; use `arduino-cli` as the current workaround.
