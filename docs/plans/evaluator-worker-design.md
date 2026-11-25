# Design: evaluate the preview graph in a worker

Written 2026-11-25 from the [handoff](evaluator-worker-handoff.md). It answers
the handoff's seven questions with measurements, and proposes a first step.

**Status, 2026-11-25:** phases 1 and 2 are built (see [Phase 1 as built](#phase-1-as-built)
and [Phase 2 as built](#phase-2-as-built)). Phase 2 waits on Steve's listening
check before it ships; phases 3 and 4 each wait on his go-ahead.

## Recommendation in one paragraph

Move the **whole** live-preview evaluation into one module worker, but only
for graphs that pass a **closed allow-list**: every node, through every group,
is a type whose preview reads no store. Every other graph keeps today's path,
unchanged. The main thread sends one small message a frame (the tick, the
live state, and graph changes when there are any) and gets back packed
frames. It draws them where it draws them now. The allow-list then grows a
phase at a time (audio, then hardware inputs, then shows) until today's path
is only the fallback. The first phase covers Field Transform and most
non-audio patterns.

## Measurements

Taken on 2026-11-25 in Node (V8, the engine Chromium uses) with the real
evaluator. The method is below; repeat it before relying on a number. The
evaluator figures agree with the browser profile in
[performance profile](../development/testing/performance-profile.md): about
15 ms a pass at 128 x 128 against that document's "about 15".

| What | 64 x 64 | 128 x 128 |
| --- | --- | --- |
| Field-warp starter, one hot pass | 4.0 ms | 15.5 ms |
| Of that, the three Field Noise nodes | | 11.6 ms |
| Of that, Field Transform | | 0.4 ms |
| Of that, Field → Frame and the LED output | | 3.5 ms |
| `structuredClone` of the terminal `Frame` (`RGB` objects) | 1.8 ms | 9.8 ms |
| Pack that `Frame` into a `Uint8Array` | 0.016 ms | 0.07 ms |
| `structuredClone` of the packed bytes | 0.007 ms | 0.03 ms |
| `structuredClone` of a `Field` | 0.01 ms | 0.06 ms |
| `structuredClone` of a full pass's outputs (every node, for previews) | 3.8 ms (0.5 MB) | 17.9 ms (2 MB) |

Live state, everything the evaluator reads from stores (both audio stores
with full-length spectra and samples, hardware inputs with eight buttons and
eight pots, player transport, touch, display runtime, MIDI, DMX, DDP, UI
flags): about 12 KB, **0.05 ms** to clone. Audio alone: 0.02 ms.

Graph: the Music Player starter's 100 collected patterns are 1.5 MB as JSON
and take **20 ms** to clone.

Worker bundle: the evaluator bundled on its own (esbuild, minified) is
2.5 MB, 600 KB gzipped. It reaches `graphStore`, React Flow and the board and
part catalogues through the node modules that read stores.

The evaluator also loads and runs with no `window` and no `document`: the
measurement ran in Vitest's `node` environment. Only one node reads a clock
of its own (`Date.now()` in `src/nodes/output/evaluate.ts`, a display node);
`stateClock` in `memory.ts` uses one only for idle sweeps.

### How it was measured

A throwaway Vitest file with `// @vitest-environment node` at the top:
build the `field-warp` starter, time `evaluateGraphFull` (hot-only, the
loop's every-frame pass) for 60 ticks after 20 warm-up runs and take the
median, and time `structuredClone` of each payload the same way. A message
to a worker costs about one `structuredClone`: the sender serialises, the
receiver deserialises. Run it with `--reporter=verbose` or the output is
hidden. The bundle size came from `npx esbuild` on an entry that imports
`evaluateGraphFull`, with `--metafile`.

## The seven questions

### 1. What moves?

The whole evaluation of a graph that passes the gate, not only its pure
field nodes.

Moving only the field nodes would take 11.6 ms of the 15.5 ms off the main
thread and leave Field → Frame, the output and routing there. It needs two
evaluators to share one pass: the worker computes some nodes' outputs ahead
of time and the main thread's memo is seeded with them. That code helps
field graphs only and is thrown away when the rest moves. Moving the whole
graph under a gate needs about the same protocol, frees the main thread
completely for the graphs it covers, and is the first phase of the end state
rather than a detour.

The gate, `workerEvaluable(nodes, edges, groups)`, is a closed allow-list:
every node in the graph, and in every group it reaches, is an allowed type.
Store reads happen either in a node's own handler or because a store-reading
node is upstream (a Touch widget wired into a Palette Bank goes through
`toggleTapPress`, which reads `useGraphStore` and `useDisplayRuntimeStore`).
A closed list rules out both. A per-category list would not: the colour
category imports `toggleTapPress`.

Phase 1 allows the field, generative, shapes, simulations, composite and
math types, and the colour and signal types that read no store, plus
`MatrixOutput` and `GroupOutput` with their Controls and action ports
unwired. It excludes Code (its own worker; see below), every audio,
audio-reactive, input, show and display type, and Master Speed. A test
holds the list honest: it spies on `getState` of every store the evaluator
imports, evaluates each allowed type at its defaults, and fails on any call.
Inside the worker the stores exist but are empty, so a missed read would
not crash. It would silently read defaults, which is why the test is the
guard and not the worker.

Later phases, each its own change with its own go-ahead:

| Phase | Adds | What it needs |
| --- | --- | --- |
| 1 | Store-free types | The worker, the protocol, packing, the gate |
| 2 | Audio and audio-reactive, Master Speed | The audio stores in the snapshot; beats in the snapshot; `beat` and Master Speed read back from the result; the latency decision below |
| 3 | Hardware inputs, MIDI, DMX, DDP, touch, displays | Those stores in the snapshot; touch and control drivers that write back become messages to the main thread |
| 4 | Shows, Music Player, Slideshow | `useGraphStore` reads mid-evaluation replaced by values passed in; selection and player state the main thread reads (`getPatternShowSelection`, `getMusicPlayerControls`) sent back with each result |

### 2. How does live state get in?

A snapshot every frame. It is 0.05 ms and about 12 KB for every store the
evaluator reads, so there is nothing to win by mirroring stores into the
worker and keeping them in step, and much to lose: a mirror is a second copy
of each store's update logic. In phase 1 the snapshot is empty; it is
defined in phase 2.

The graph is different. Cloning the Music Player's collected patterns takes
20 ms, so a slider drag cannot send the whole graph on each move. The main
thread sends changes only, by object identity: a node whose object is the
same as last frame's is not sent, and the same for each group in the
registry. The store already keeps a node's `data` object across a move, which
`codegenSignature` relies on (performance profile, row 4). The worker keeps
the last graph it was sent and patches it.

### 3. What is a frame?

`Frame` stays `RGB[][]`. Changing it everywhere is **not** a precondition.
Packing a frame into bytes at the boundary costs 0.016 ms at 64 x 64 and
0.07 ms at 128 x 128, against 1.8 ms and 9.8 ms to send the objects. The
worker packs each frame it returns into a transferred `Uint8Array`, and the
main thread unpacks it into the route buffer it already keeps
(`routeBufRef`), so no frame is allocated per pass. Changing the frame
format would touch 86 `buildFrame` call sites and 76 direct pixel reads in
`src/nodes` alone, plus every consumer, and buys under 0.1 ms here.

One later saving, not needed for phase 1: the WebGL renderer turns the frame
into bytes for its texture; it could take the packed bytes directly.

Node previews need the same treatment. A full pass's outputs take 3.8 ms to
clone at 64 x 64 and 18 ms at 128 x 128, at the 8 fps publish. The worker
sends only what `usePreviewStore` keeps, with frames and fields packed.

### 4. Where is it drawn?

Where it is now. The draw is 4 ms in every five seconds at 64 x 64, and the
main thread needs the frame anyway: for the Canvas 2D shapes, the
full-screen stage, the ambilight colours, the live stream, the showcase tap
and the node previews. `transferControlToOffscreen` is one-way, so drawing in
the worker would mean sending the frame back as well.

### 5. How late may a frame be?

The worker renders for the time the frame will be shown, not the time it was
asked for: the main thread sends the next step's tick (`now` plus one frame
step, on the same `frameGate` clock), and draws the newest result it has.
Only one request is in flight. If the worker is late, the main thread draws
the last frame again; the preview stutters and the editor does not.

- **Time-driven animation** (phase 1): no added latency while the worker
  keeps up. The tick is the same one the main thread would have used.
- **Live inputs** (phase 2 on): the snapshot is taken when the request is
  posted and its frame is shown one frame later, so audio and buttons reach
  the LEDs 17 ms later than today. Decoded music can absorb that: the
  decoder already holds analysis for the speaker delay less
  `PICTURE_LATENCY_MS` (`src/audio/analysisDelay.ts`), and that figure can
  grow by one step while the worker path runs. The microphone cannot; it is
  17 ms later on top of its capture latency. Steve judges audio-reactive
  patterns by ear, so phase 2 asks him to listen before it ships.
- **Beats** are latched until a pass reads them. With one request in flight
  and `consumeLiveBeats` called when a snapshot is taken, each beat is in
  exactly one snapshot: none dropped, none doubled.
- **The recorder** evaluates offline, frame by frame, on the main thread, and
  is not affected. **The live stream** publishes the frame that is shown, as
  it does now.

### 6. What stays synchronous?

Every caller other than the live loop: the recorder, pattern thumbnails,
Studio Scores, show preview, scopes (`evaluateScalarSeries`), and nested
evaluation inside show and output nodes. They keep calling the main thread's
evaluator, which is the same module the worker loads. The two copies hold
separate state, which is already how it works: each caller has its own
namespace, and the live preview's namespaces (`__output_pass_*`) simply live
in the worker while the worker path runs.

The Code node is excluded until it is decided whether the evaluator worker
starts the Code sandbox as a nested worker (Chromium, Firefox and current
Safari support nested dedicated workers) or asks the main thread to run it.
Its editor reads the sandbox's error (`getCodeError`) on the main thread, so
the second keeps that working unchanged.

### 7. What is the fallback?

Today's path, kept whole, chosen each frame. It runs when `Worker` or module
workers are unavailable, when the worker has not started or has thrown, and
when the graph fails the gate. The embed, the nginx image and the desktop
helper need nothing new: the app already starts three module workers this
way (`songAnalyzer.ts`, `codeSandboxRuntime.ts`, `gifWorkerClient.ts`), and
nothing here needs `SharedArrayBuffer`.

Moving a graph between the paths, which happens when an edit takes it in or
out of the gate, starts stateful nodes (Fire, Game of Life, trails) from
cold once. That is acceptable while the gate is growing and disappears when
the fallback is only for browsers without workers.

## Constraints, checked

- **Parity**: the worker loads the same evaluator modules. The parity tests
  do not change. A new test runs the worker's message handler in Node (no
  real `Worker`) on the field-warp graph and compares the unpacked frame,
  byte for byte, with the main thread's evaluation at the same ticks.
- **Trust**: `trusted` travels with each request and the evaluator applies it
  as it does now, through groups and patterns. Phase 1 excludes Code; Formula
  nodes are in the gate only as far as they read no store.
- **One clock**: the main thread keeps the clock, pause and (in phase 2)
  the Master Speed origin shift. The worker never reads its own clock for
  animation; a worker's `performance.now()` has a different time origin.
- **No redrawn canvas in the node graph**: nothing changes there.
- **No dead end without the feature**: the fallback is today's path.

## Costs and risks

- **Bundle size.** The worker bundle is about 600 KB gzipped, mostly
  catalogues and React Flow reached through `graphStore`. It parses off the
  main thread, but it adds to the download and to the service-worker
  precache, which already reports a file too large. Making the node modules
  import only graph *types* would cut it; that is phase 4's work anyway,
  since that phase removes the mid-evaluation store reads.
- **Memory.** A second copy of the evaluator's pools and node state, at most
  the size of the live preview's.
- **Two paths to keep correct** until the gate covers everything. The
  parity test above and the store-read test are what keep them one.
- **Not measured yet**: worker start-up time in the browser, the real
  `postMessage` cost in Chromium (the clones above stand in for it), and
  Firefox and Safari.

## Proposed first step

Phase 1, sized to prove the idea and nothing more:

1. `workerEvaluable` gate and its store-read test.
2. The worker: graph patching by identity, one request in flight, packed
   frames back, packed previews on full passes.
3. `LEDPreview.tsx`'s loop: post and draw-latest when the gate passes and
   the worker is ready; today's code otherwise.
4. The parity test above.
5. A perf scenario that drags a node with the 64 x 64 matrix at
   **2x smooth** on field-warp. Today the editor drops with the preview
   there; that is the number this step exists to move.

It has worked when, at full processor speed:

| Scenario | Now | Target |
| --- | --- | --- |
| Drag node, 64 x 64 at 2x smooth, field-warp | not measured (new) | 60 fps page |
| Matrix 64 x 64 at 2x smooth, field-warp | 51 fps | 60 fps preview |
| Matrix 64 x 64, field-warp | 60 fps, main thread about 60% busy | 60 fps, main thread mostly idle |
| Every other scenario | 60 fps | 60 fps |

and `npm test` passes as before.

## Phase 1 as built

| Piece | Where |
| --- | --- |
| The gate and its allow-list | `src/components/Preview/workerGate.ts` |
| The stores the worker blocks and the test spies on | `src/components/Preview/evaluatorStores.ts` |
| One frame's evaluation, shared by both threads | `src/components/Preview/previewEvaluation.ts` |
| Protocol, packing and the worker's handler | `src/components/Preview/previewWorker.ts` |
| The worker entry | `src/components/Preview/previewEvaluation.worker.ts` |
| The main thread's side | `src/components/Preview/previewWorkerClient.ts` |
| The loop's choice of path | `LEDPreview.tsx`, the `loop` function |

How it differs from the plan above:

- **Frames cross as `Float64Array`, not bytes.** Routed frames carry
  fractional channels (a 2x smooth average is a quarter step), and the test
  holds the worker to the main thread exactly.
- **A type with no preview passes the gate.** The Board and other hardware
  sit in every root graph and publish nothing; refusing them refused every
  project.
- **The gate allows every type in the colour, composite, field, generative,
  graph, math, shapes, signal and simulations tables, plus Formula Pattern
  and the LED output; only SD Video is taken out** (it reads a cache the main
  thread fills from IndexedDB). The spy test found no other store read, wired
  or unwired, once `toggleTapPress` asked for a Touch widget before reading
  the stores.
- **The worker starts the first time a graph qualifies**, so a project that
  never qualifies never downloads it. It is kept out of the service worker's
  precache and cached on first use (`vite.config.ts`): at 2.4 MB minified it
  is over the precache limit, and offline before first use the preview
  evaluates on the main thread.
- **Until the worker's first answer the main thread evaluates**, so the
  preview never shows the idle sweep on the way in.
- **A store read in the worker turns the worker off for the session**, with
  a console warning, rather than per graph. The gate test is what keeps that
  from happening.

Measured 2026-11-25 with `scripts/perf/profile.mjs --no-profile`, the build
before this change against the build after:

| Scenario | Before | After |
| --- | --- | --- |
| Matrix 64 x 64 at 2x smooth, field-warp | 53.7 fps, 31 dropped, main thread 99% busy (full speed) | 60.0 fps, 0 dropped, main thread 0% busy (at half speed) |
| Drag node, 64 x 64 at 2x smooth, field-warp | 23 fps, 1155 dropped (half speed); 50.5 fps (full speed) | 57 fps, 6 to 15 dropped, one 267 ms frame (half speed) |
| Matrix 64 x 64, field-warp | 59.6 fps, 2 dropped | 60.0 fps, 0 dropped |
| Drag node, warm, field-warp | 59.6 fps, 7 dropped | 59.5 fps, 1 dropped |
| Matrix 64 x 64, Music Player (main-thread path) | 59.6 fps | 60.0 fps |
| Pan, 64 x 64, Music Player (main-thread path) | 54.2 fps | 53.5 fps |

"Half speed" is the harness's `pace` near 400 ms (the laptop on battery); a
before and after at the same speed are the comparison, and the drag row
before was also measured with the gate forced off in the new build: 22.6 fps
against HEAD's 23.1, so the main-thread path did not slow down. The drag
after at full speed was not measured. Not checked: Firefox, Safari, the
desktop app, and a real 2x smooth graph with groups.

## Phase 2 as built

Audio, audio-reactive, Master Speed and the Stereo VU now run in the worker:
the gate adds the `audio` and `audioReactive` tables and the `Audio`,
`MasterSpeed` and `StereoVuMeter` types. A Microphone or Line Input part has
no preview, so it already passed.

- **Live state is a snapshot written into the worker's own stores.** Each
  request carries the two audio stores' data (`plainData`: no actions, no
  media element) and the test-signal switch (`snapshotLiveState` in
  `previewWorker.ts`), and the handler `setState`s them before the pass, so
  the audio nodes read them exactly as on the main thread. The worker blocks
  every other store. `workerGate.test.ts` now records which fields of the
  live stores each type reads, wired and unwired, with the test signal off
  and on, and fails on any the snapshot does not carry; a negative control
  shows it can.
- **Beats** are released when the snapshot is taken (`consumeLiveBeats`
  after `post`), and only by the main-thread pass otherwise, so each beat is
  in exactly one pass. A beat in the worker comes back as `sawBeat`, and the
  answer then carries every node's ports, so the previews publish on the
  beat's frame as before.
- **Master Speed and the VU** come back on every answer (`liveOutputs`), so
  the clock's origin slides and the rails move each frame.
- **A group opened on the canvas** now runs in the worker too: the main
  thread resolves the root graph's audio source (`openGroupAudioKind`) and
  the worker binds the group's audio inputs to it (`openGroupInputsFor`).
- **Latency.** The worker's frame shows a step after the audio it read. The
  decoder holds its analysis that step less (`setPreviewPipelineMs` in
  `audio/analysisDelay.ts`, set by the loop each frame), which absorbs it
  where the speaker delay is longer than the picture's 50 ms plus a step
  (Bluetooth); on a wired laptop (about 59 ms) the hold was 9 ms and is now
  0, so the decoded music's light is about 8 ms later than before. The
  microphone cannot be compensated: its light is one step (17 ms at 60 fps)
  later than before.
- **The terminal frame unpacks only when read.** While the worker runs,
  only the first-launch showcase reads it (and the loop, for a graph with no
  LED output), so `terminalFrameTap` takes a function that unpacks it on
  demand. Unpacking it every frame had cost more than evaluating the
  microphone starter on the main thread.

The parity test now also runs the microphone starter with a Beat Detect
through eight steps of changing spectrum and two beats: the worker run's
stores are silent and it hears only the snapshots the main run read, and its
frames, beats and node outputs match.

Measured 2026-11-25, full processor speed, `--no-profile --repeat 3`:

| Scenario | Phase 1 | Phase 2 |
| --- | --- | --- |
| Microphone starter, idle | 60.0 fps, 0 dropped | 60.0 fps, 0 dropped |
| Microphone starter, 64 x 64 at 2x smooth | 60.0 fps, 0 dropped | 60.0 fps, 0 dropped |
| Drag node over it | 59.1 fps, 3 dropped | 59.1 fps, 3 dropped |
| Drag node, field-warp at 2x smooth | (half speed only: 57 fps) | 59.1 fps, 3 dropped |

The microphone starter is too light for its frame rate to move; the CPU
profile shows the change: in phase 1 the main thread ran
`evalSpectrumVisualizer`, in phase 2 it runs no evaluator, only the unpack
and `postMessage`. The Music Player starter still evaluates on the main
thread (its collection is a show, phase 4).

Not checked: listening. Steve judges audio-reactive patterns by ear, so the
microphone's extra step and the decoder's shorter hold need his ear on a
real song before this ships.
