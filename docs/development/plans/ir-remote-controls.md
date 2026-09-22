# IR remote controls for graph properties

Active execution is tracked by the ordered checkbox list under
[D-05a in the root todo](../../../todo.md). This document defines the feature
contract so the checklist does not have to repeat the design.

Status: **in progress.** Mapping primitives, the Step Value adapter, receiver
registration, the two bench parts, and browser press/hold plus key editing are
implemented, including the diagnostic learn workflow, the pinned
Arduino-IRremote 4.7.1 dependency, project-sketch polling in the normal,
slideshow, and SD/performance-player generators, and shared deploy/Graph Health
validation. The end-to-end Power/brightness property workflow is covered in
preview and all three firmware paths. Node reference assets, Help, README,
[Hardware workbench guidance](../../user/hardware-workbench.md#add-an-ir-remote-receiver),
dependency/export notes, Graph Health repairs, and the experimental
[beta-matrix boundary](../../release/beta-support-matrix.md#experimental-until-validated)
are complete. Compile and hardware evidence remain.
Keep the feature experimental until a generated sketch has been compiled on
every claimed board family and the receiver, repeat handling and LED timing
have been exercised on hardware.

## Goal

Let a common handheld IR remote change runtime graph properties and invoke
existing actions without creating a second, hidden control system.

The graph remains the explanation of the behavior:

```text
IR Receiver: Brightness + ----> Step Value: Increase
IR Receiver: Brightness - ----> Step Value: Decrease
Step Value: Value ------------> Juggle: Speed

IR Receiver: Power -----------> Trigger (Toggle) ---> LED output: Enabled
IR Receiver: Next ------------> Control Map: Next --> Music Player: Controls
```

The first path is the important new one. An IR key is an event, while a graph
property normally expects a sustained value. A reusable stateful adapter must
bridge those meanings; the IR node must not mutate another node's saved
properties directly.

## Scope for the first release

- One demodulating IR receiver module on one exclusive digital-input GPIO.
  This is a three-pin receiver module, not a bare photodiode, transmitter or
  IR blaster.
- One `IRRemoteInput` per root graph. The firmware library's ordinary receiver
  API is global; multiple receivers remain out of scope until there is a tested
  multi-instance design.
- Learned, named buttons with stable entry ids. Each entry produces a boolean
  event output and stores a canonical protocol/address/command tuple plus its
  repeat policy.
- Recognized protocols only. Start with the protocol families supported and
  bench-proven by the selected version of
  [Arduino-IRremote](https://github.com/Arduino-IRremote/Arduino-IRremote).
  Do not persist the library's numeric protocol enum or treat an unstable raw
  timing capture as a portable button identity.
- A general `StepValue` graph node that converts Increase, Decrease and Reset
  events into a bounded numeric value. It is useful for physical buttons and
  touch controls as well as IR.
- Existing `Trigger` modes remain the explicit way to debounce, pulse or toggle
  a boolean destination. Existing action ports and Control Map remain the path
  for playback, pattern and LED-output commands.
- Normal sketches, slideshow shows and SD/performance-player sketches are all
  in scope. A graph accepted by deploy validation may not silently lose IR
  controls in one generator.

Transmitters, macros, multi-key chords, arbitrary raw waveform replay, phone
remotes and persisted runtime values are non-goals. `StepValue` starts from its
authored initial value after reset; EEPROM/NVS persistence is a separate
cross-board feature.

## Saved model

`IRRemoteInput` is a hardware-managed, root-owned signal node. Its properties
have this conceptual shape:

```ts
interface IRRemoteButton {
  id: string              // stable port identity; never derived from label/code
  label: string
  protocol: string        // allow-listed canonical name, not a library enum
  address: number
  command: number
  repeat: 'once' | 'held'
}

interface IRRemoteProperties {
  pin: number
  partId: string
  buttons: IRRemoteButton[]
}
```

The real output handle is derived from the entry id, following `ButtonBank`.
A trailing **Learn button…** affordance creates a pending entry rather than a
persisted fake port. Renaming a button keeps every wire. Removing a mapped
button names the affected wires, is undoable, and never silently retargets
them. Load normalization bounds the button count, strings and integer widths,
deduplicates ids, and unions stored mappings with handles already targeted by
edges so a valid connection is never hidden by damaged metadata.

`StepValue` has boolean `increase`, `decrease` and `reset` inputs, a float
`value` output, and authored `initial`, `minimum`, `maximum`, `step` and
`wrap` properties. Increase/decrease react to rising event pulses, clamp by
default, optionally wrap, and reset to the sanitized initial value. Values are
rounded to six decimal places after each step so browser arithmetic and the
generated `float` state do not drift apart. Reset wins a simultaneous pass;
simultaneous Increase and Decrease edges cancel. Stateful evaluation is keyed
through the graph/group instance exactly like other stateful nodes, so two
pattern instances do not share a value. Runtime state is deliberately volatile:
resetting the preview or rebooting the controller starts again at `initial`.

## Event and repeat semantics

The decoder snapshots at most one completed frame per control pass and clears
all outputs before publishing it. A matched initial frame emits a one-pass
`true` pulse. A repeat frame emits another pulse only when that button's repeat
policy is `held`; `once` suppresses it. This makes a held Volume Up useful while
Power still toggles once.

Matching uses canonical protocol, address and command. A repeat frame inherits
the last non-repeat identity only inside a short, bounded hold window. Unknown,
overflowed or stale repeats produce no control event. If two authored mappings
have the same identity, validation blocks deploy rather than firing both.

The same pure decode/match/repeat reducer must drive browser simulation tests
and generated-firmware golden cases. The browser cannot receive physical IR;
the node body therefore offers press/hold simulator controls backed by the
transient hardware-input store. Simulation state is not persisted or undoable.

## Learning workflow

Learning is an explicit hardware operation, modelled after touch calibration:

1. The user chooses **Learn button…** on the IR receiver and enters a label.
2. The app generates a receiver-only diagnostic sketch for the selected board
   and uploads it with `cache: false`, so **Upload last sketch** cannot later
   flash the learner in place of the project.
3. The existing serial connection carries a named, versioned line such as
   `FLS_IR protocol=NEC address=0x00 command=0x45 repeat=0`.
4. A bounded parser accepts one recognized, non-repeat frame, previews the
   result and asks the user to confirm it.
5. Confirmation adds the mapping and its stable output in one undo step;
   cancel changes nothing. The workflow always releases the serial port.

The diagnostic upload and serial read are gated on workspace trust. Manual
entry of protocol/address/command remains available for documented remotes and
for automated tests, but receives the same normalization and duplicate checks.

## Firmware and dependency strategy

Pin the supported Arduino-IRremote version in the helper/toolchain path instead
of compiling against whichever API happens to be installed. Emit only the
allow-listed decoder macros needed by the authored mappings, before
`#include <IRremote.hpp>`, then use `IrReceiver.decode()`, the structured
decoded fields and the repeat flag. Keep the include/setup/polling emitter in
one module shared by the normal generator and the two template generators.

The dependency must participate in both build engines:

- arduino-cli readiness/install reporting and exported-sketch instructions;
- fbuild's lazy optional-library vendoring and include-based library exposure;
- build-cache invalidation when the pinned version changes;
- compile fixtures that prove sketches without an IR receiver do not acquire
  the library or its flash/RAM cost.

IR polling is an input phase. It must complete before graph resolution and
destination application, alongside the existing control snapshot, and must be
added to the shared control-phase assertion rather than tested as a private
ordering rule.

## Hardware registration

Adding the receiver touches the same ownership and pin surfaces as the existing
button, pot and encoder inputs:

- `NODE_LIBRARY`, hardware ownership/library hiding, and the input category;
- GPIO property metadata and a `digitalInput`, no-pull-up requirement;
- exclusive/no-bus pin topology, pin retargeting and app-owned pin metadata;
- `collectPinUses`, Build Diagram support and the hardware manifest item;
- Hardware shelf fixture, verified catalogue part/render/dimensions/pad labels;
- node body simulation, descriptions, Help live example, README inventory and
  generated node card coverage.

Prefer a single verified receiver module for the first support row. Additional
modules that are electrically and behaviorally identical should not earn
separate UI choices without a real wiring or firmware distinction.

## Validation and user guidance

Graph Health and the deploy gate must share these failures:

- more than one IR receiver in the root graph;
- receiver pin unavailable, reserved, output-only or colliding;
- no learned buttons, malformed/unsupported protocol values, or duplicate
  protocol/address/command mappings;
- a wired output whose mapping is missing after normalization;
- IR present on a board/toolchain for which the pinned dependency is unsupported;
- a `StepValue` with non-finite values, zero/negative step, inverted bounds or
  an initial value outside its bounds.

Implemented by one structured issue walk projected into both
`findDeployBlockingErrors` and `buildGraphDiagnostics`. Selected-board support
follows Arduino-IRremote 4.7.1's declared architecture list, excluding the
ESP32-S3 target that the pinned release explicitly marks unsupported. Pin
collisions and signal-range mismatches continue through their existing shared
diagnostics rather than being duplicated here.

Range mismatches remain ordinary graph concerns. `StepValue.value` carries the
authored min/max domain into the connection hint where possible; the destination
still controls its own clamping/rounding, and Map Range remains the explicit
repair when domains differ. No IR-specific code writes into `properties` at
runtime.

## Acceptance evidence

Software completion requires focused unit/workflow coverage, all repository
quality gates, and representative compile fixtures on both build engines. The
minimum end-to-end workflow is:

1. learn Power, Brightness Up and Brightness Down;
2. wire Power through Trigger/Toggle to LED-output Enabled;
3. wire Up/Down through `StepValue` to an exposed pattern Speed property;
4. save, reload and undo/redo without changing port identities;
5. verify browser simulation and generated firmware produce the same steps,
   bounds, wrapping and repeat behavior in normal, show and player builds.

`src/state/__tests__/irRemoteWorkflow.test.ts` holds this workflow as one graph.
The SD/player variant routes LED Toggle and continuous Brightness through
Control Map into Music Player, because that generator deliberately rejects
runtime controls wired straight to the LED output. Browser-held keys emit
repeat pulses at a 100 ms simulation cadence with false passes between them;
those idle passes are what let Step Value's rising-edge contract observe every
repeat just as it does between physical decoder frames.

Hardware completion requires a support-matrix/bench record with the exact
receiver, remote, board, FQBN, GPIO, library version and toolchain. Exercise
short presses, long holds, alternating keys, unknown keys and rapid presses
while the LED output is actively calling `show()`. Test at least one long
clockless LED run: interrupt blocking can lose IR frames even when a minimal
receiver sketch works. Record the measured limit or validation warning instead
of promoting an unreliable combination.
