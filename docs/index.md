# Documentation index

This checkout documents the active `Hardware` development line. The frozen
public-beta line is `main`; see [versioning and releases](release/versioning-and-releases.md)
for the distinction. [README](../README.md) introduces the product and
[CONTRIBUTING](../CONTRIBUTING.md) explains the contribution workflow.

## Getting started

- [Development setup](getting-started/development-setup.md)
- [Your first project](getting-started/first-project.md)
- [Upload-helper setup](getting-started/upload-helper.md)

## User guides

- [Hardware workbench guide](user/hardware-workbench.md)
- [Stereo VU Meter](user/stereo-vu-meter.md)

## Architecture and decisions

- [Board node and hardware capability model](architecture/board-capabilities.md)
- [Build Diagram Architecture](architecture/build-diagram.md)
- [Desktop Viewport Contract](architecture/desktop-viewport-contract.md)
- [Hardware model](architecture/hardware-model.md)
- [Multi-output routing](architecture/multi-output-routing.md)
- [Per-output native rendering](architecture/per-output-native-render.md)
- [1. Pattern node-group architecture (two-tier dataflow)](architecture/decisions/0001-pattern-node-group-architecture.md)

## Feature design

Feature contracts and rationale live here. Task ordering belongs in
[root todo](../todo.md); compile results and physical validation belong in reports.

### Patterns and rendering

- [ANIMartRIX patterns — Float Field design note](design/animartrix-float-field.md)
- [Code node](design/code-node.md)
- [Formula-driven pattern nodes](design/formula-pattern-nodes.md)
- [Fourier Epicycles](design/fourier-epicycles.md)
- [Frame Warp](design/frame-warp.md)
- [SD Video](design/sd-video.md)
- [Simulations, fractals and classics](design/simulation-fields.md)
- [Slice Tiling](design/slice-tiling.md)
- [Strings and rings: the track contract](design/strings-and-rings.md)
- [Wallpaper symmetry groups](design/symmetry-groups.md)
- [Transition catalogue](design/transition-catalogue.md)
- [Truchet Tiles](design/truchet-tiles.md)
- [Turing Field and Reaction Diffusion companions](design/turing-field.md)

### Audio and shows

- [Audio detectors from FastLED's processor](design/audio-detectors.md)
- [Audio hardware — microphones and amplifiers](design/audio-hardware.md)
- [Collection-driven performance](design/collection-driven-performance.md)
- [Generative pattern show](design/generative-pattern-show.md)

### Hardware and interfaces

- [Generic custom board with configurable pin headers](design/custom-board-pin-layouts.md)
- [DMX / Art-Net input](design/dmx-artnet-input.md)
- [HUB75 output](design/hub75-output.md)
- [IR remote controls for graph properties](design/ir-remote-controls.md)
- [RTC clock and scheduled triggers](design/rtc-clock-and-schedule.md)
- [Wired Ethernet](design/wired-ethernet.md)

### Displays and controls

- [Auxiliary displays](design/auxiliary-displays.md)
- [Direct controls and LED output status](design/direct-controls-and-output-status.md)
- [Large displays and control routing](design/large-displays-and-control-routing.md)
- [The live touch screen](design/live-touch-screen.md)
- [On-glass widget labels](design/on-glass-widget-labels.md)
- [Simple displays](design/simple-displays.md)
- [Wire-first touch controls](design/wire-first-touch-controls.md)

### Workspace and reference design

- [Node reference layout and upkeep](design/node-reference-layout.md)
- [One canvas, four workspaces](design/workspace-tabs.md)

## Reference and API

- [Display node reference](reference/displays.md)
- [Node cards](reference/node-cards.md)
- [Upload-helper API](reference/api/upload-helper.md)

Node cards are generated from the node registry. The
[property-input audit](reports/reviews/property-input-audit.md) is a historical
snapshot and is indexed with reports.

## Development

- [Backend Python Dependencies](development/backend-dependencies.md)
- [Maintaining documentation](development/documentation.md)
- [Hardware asset import contract](development/hardware-asset-import.md)

### Subsystem patterns

Read the matching file before changing an area. These are implementation rules
and known traps; [CLAUDE.md](../CLAUDE.md) routes agents to the same files.

- [Build helper](development/patterns/build-helper.md)
- [Custom screens](development/patterns/custom-screens.md)
- [Firmware generation](development/patterns/firmware-generation.md)
- [Fixed displays](development/patterns/fixed-displays.md)
- [Graph and nodes](development/patterns/graph-and-nodes.md)
- [Hardware and the Build Diagram](development/patterns/hardware-and-build-diagram.md)
- [Player, shows and controls](development/patterns/player-shows-and-controls.md)
- [Testing](development/patterns/testing.md)
- [Validation and deploy](development/patterns/validation-and-deploy.md)
- [Workspace UI](development/patterns/workspace-ui.md)

### Repeatable testing

- [Touch, LVGL and heap budgets: the bench procedure](development/testing/display-budget-bench.md)

## Active plans

[Root todo](../todo.md) owns cross-project ordering. These documents own detailed
rollout steps or explicitly proposed work, not a second copy of the root checklist.

- [App review — 24 September 2026](plans/2026-09-24-app-review.md)
- [Hardware expansion roadmap](plans/hardware-expansion-roadmap.md)
- [Pattern node expansion — tiling, warp, Turing and Fourier nodes](plans/pattern-node-expansion.md)
- [Power conversion and supply protection](plans/power-conversion-and-protection.md)
- [Plan — Workspace-owned sidebars, and a preview that never leaves](plans/workspace-shelves.md)

## Runbooks

- [fbuild workarounds in the upload helper](runbooks/fbuild-workarounds.md)

## Reports and evidence

Reports preserve what was observed in a particular configuration. A successful
compile does not establish physical validation or change a support promise.

### Compile checks

`scripts/compile-fixtures/compile-matrix.py` runs the fixture families on
record on Arduino CLI, one at a time, and writes a log and summary to
`artifacts/compile-matrix/`. Run it with `--list` to see the plan. Development
compiles on Arduino CLI alone for now; the fbuild legs stay in the plan and run
with `--engine fbuild` or `--engine all`.

- [Buzzer compile checks](reports/compile/buzzer-compile-checks.md)
- [Custom-board compile checks](reports/compile/custom-board-compile-checks.md)
- [Darlington-driver compile checks](reports/compile/darlington-compile-checks.md)
- [Display firmware compile checks](reports/compile/display-compile-checks.md)
- [Distance-sensor compile checks](reports/compile/distance-sensor-compile-checks.md)
- [BME280 environment-sensor compile checks](reports/compile/environment-sensor-compile-checks.md)
- [Wired-Ethernet firmware compile checks](reports/compile/ethernet-compile-checks.md)
- [INA226 compile checks](reports/compile/ina226-compile-checks.md)
- [IR remote firmware compile checks](reports/compile/ir-compile-checks.md)
- [Joystick compile checks](reports/compile/joystick-compile-checks.md)
- [Keypad compile checks](reports/compile/keypad-compile-checks.md)
- [Light-sensor firmware compile checks](reports/compile/light-sensor-compile-checks.md)
- [Motion-sensor compile checks](reports/compile/motion-sensor-compile-checks.md)
- [Pattern-node firmware compile checks](reports/compile/pattern-node-compile-checks.md)
- [Power-switch compile checks](reports/compile/power-switch-compile-checks.md)
- [HLK-LD2410C firmware compile checks](reports/compile/presence-sensor-compile-checks.md)
- [PWM-driver compile checks](reports/compile/pwm-driver-compile-checks.md)
- [Temperature-probe compile checks](reports/compile/temperature-sensor-compile-checks.md)
- [Grove Touch Sensor firmware compile checks](reports/compile/touch-button-compile-checks.md)
- [Touch-pad compile checks](reports/compile/touch-pad-compile-checks.md)
- [VL53L0X compile checks](reports/compile/vl53l0x-compile-checks.md)
- [VL53L1X compile checks](reports/compile/vl53l1x-compile-checks.md)

### Physical bench and bring-up

- [Input Peripheral Bench Records](reports/bench/input-peripheral-bench.md)
- [Stereo VU Meter — physical validation](reports/bench/stereo-vu-bench.md)
- [XC4630 parallel touch panel — bring-up state](reports/bench/xc4630-bring-up.md)

### Reviews and audits

- [Hardware branch review — 2026-09-08](reports/reviews/2026-09-08-hardware-branch-review.md)
- [App review baseline — 24 September 2026](reports/reviews/2026-09-24-app-review-baseline.md)
- [Property input audit](reports/reviews/property-input-audit.md)

## Release and support

The [beta support matrix](release/beta-support-matrix.md) is the authority for
supported versus experimental hardware. Policy, reporting procedure and release
gates are separate documents.

- [Keyboard and Screen-Reader Smoke Test](release/accessibility-smoke-test.md)
- [Beta Hardware Validation](release/beta-hardware-validation.md)
- [Beta Support Matrix](release/beta-support-matrix.md)
- [Desktop Distribution](release/desktop-distribution.md)
- [Supported Platform Policy](release/supported-platform-policy.md)
- [Versioning and Releases](release/versioning-and-releases.md)

## Archive

Historical context, not current task status.

- [> **Archived 2026-09-24.** This is the backlog as it stood before it was](archive/hardware-todo-to-2026-09-24.md)

## Maintaining these docs

Follow [documentation maintenance](development/documentation.md) for document
ownership, naming, lifecycle, generated references and move/link checks.
