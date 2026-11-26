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

## Adding a new transient node type

Add it to `TRANSIENT_NODE_TYPES`. Give it the `note` category, or otherwise make sure `isSinkDefinition` rejects it.
