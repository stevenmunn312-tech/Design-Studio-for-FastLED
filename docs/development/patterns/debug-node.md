# Debug node

The Debug node helps users bench-test one hardware part on their own. It shows common issues, isolation steps, low-voltage meter checks and their verdicts, and it uploads targeted diagnostic sketches. It is a workshop instrument, not project content.

## Invariants

- **Never a sink.** `isSinkDefinition` (`src/state/nodeLibrary.ts`) is the one sink rule. The generator's `TERMINAL_NODE_TYPES`, the evaluator's `HOT_NODE_TYPES` and the partition's `SINK_NODE_TYPES` all use it. It excludes the `note` category (displayed as "Tools": Comment and Debug), so a Debug node never roots the part wired to it into the preview or the sketch. Its evaluator and emitter in `src/nodes/graph/` are empty.
- **Its wire is not a signal.** `withoutTransientNodes` (`src/state/debug/debugNode.ts`) drops Debug nodes and every edge touching them wherever an edge alone would count:
  - board membership (`membershipOf` in `boardPartition.ts`), so a debug wire never joins a board or becomes a board link;
  - `buildGraphDiagnostics` and `findDeployBlockingErrors`, so a debug wire never makes an unwired part look connected;
  - `stripRuntimeGraph` (`src/state/runtimeFields.ts`), so no save, autosave, recovery snapshot, project file or share link carries one.
- **Transient.** Readings, checklist ticks and probe results live in session state, never in node properties. The only property, `targetPartId`, is dropped with the node. The save format therefore never contains a Debug node and needs no migration.
- **Safety.** Guidance is general diagnostics only. It never asks the user to do anything dangerous: no mains measurements, and no opening a supply. Meter steps stay on the low-voltage DC side. Every continuity or resistance step starts with "unplug power".
- **No maintainer bench gate.** Probes are not listed in the support matrix and wait on no bench run. Verdicts are framed as based on the user's own readings. Unit tests prove behaviour on readings from deliberately faked faults.

`src/state/debug/__tests__/debugNode.test.ts` holds these invariants. It checks a byte-identical sketch with and without Debug wiring (with and without an LED output), the same preview frame, diagnostics, deploy errors and partition, and that every persistence path drops the node.

## Profiles

- Profiles live in `src/state/debug/profiles/` and are registered in `debugProfiles.ts`.
- A part has a profile when `debugProfileFor(part)` finds one. That lookup decides whether the part draws a debug socket and shows "Debug this part".
- A node type whose modules fail differently gets one profile per kind of module, each with an `applies(part)` test. Examples: an I2C light sensor versus an LDR, an SPI OLED versus an I2C one, HUB75 versus addressable LEDs.
- An I2C profile decides "on the bus" from `collectPinUses`, the same walk the wiring diagram draws from.
- The socket is drawn by `StudioNode`, never added to `data.outputs`.
- Most parts are built with `moduleProfile` (`profiles/moduleProfile.ts`). It produces one continuity check per wire the part really uses, a supply check and a 5 V-on-3.3 V warning, and each family adds its own steps on top.
  - The wires come from `collectPinUses` with a board present.
  - Pins that a part claims but that are not wires to its module are filtered out there. The internal DAC pins an SD show claims are the known case.
- Every shelf part except Pack Electronics has a profile. A test holds that.

## Diagnostic sketches

- **Probe:** a profile's optional `probe` names a sketch kind, generates it from the part's context, and turns its latest `FLS_DBG` line into a readout and findings.
- **Sketches:** live in `src/codegen/sketches/debug/`. Each one:
  - initialises only the board and the part;
  - prints `FLS_DBG v=1 probe=<kind> key=value…` from `loop()`, rate-limited, at 115200 (`PROBE_BAUD`);
  - reuses the project's own read code where there is one. The analog probe uses `ANALOG_FULL_SCALE_CPP`.
- **The run (`debugRunStore.ts`):**
  - It uploads with `cache: false`, so the probe never becomes the project's last upload.
  - It sets the monitor to the probe baud and reads lines through `deviceTelemetryStore.ingest`.
  - `debugRunBlocker` refuses before uploading when the workspace is untrusted, the part has no probe or pin, there is no port, or the part's board is not the bench's active board (each board has its own port).
- **The node:** asks before uploading, because the probe replaces the project on the board. When the run ends it offers "Re-upload project" (`runLastUpload`) when there is one.
- **Probes built from project code:** some probes come from the project's own generator with that part's serial debug turned on, so the test runs the code the project ships. The mic and line in (`MIC_DEBUG`) and the power monitor (`debug`) each print an extra `FLS_DBG` line beside their usual debug output.
- **LED probe:** the LED probe is the wiring test with `stageMarkers`. It prints the stage name as the cycle moves on. The node asks what colour red and green showed, and `actualColorOrder` works out the strip's real order from the answers.
- **Probe extras:**
  - Probes can ask `questions`; the answers are stored in the node's readings as `probe-<id>`.
  - Probes can refuse a board through `unavailable`. The SD and audio probes are ESP32-only, like the code they test.
  - `interpret` receives `max_<key>` for every number in the readings, so a brief event between lines (a clap, for example) still counts.
- **Compile fixtures:** each probe has a fixture in the `debug-probes` family (`scripts/compile-fixtures/debug-probes.ts`), built from the same profile on ESP32 and Uno. Run `compile-matrix.py --only debug-probes/ --every`: without `--every` the coverage step skips fixtures it judges covered.

## Adding a new transient node type

Add it to `TRANSIENT_NODE_TYPES`. Give it the `note` category, or otherwise make sure `isSinkDefinition` rejects it.
