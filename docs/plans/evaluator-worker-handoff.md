# Handoff: evaluate the graph off the main thread

Written 2026-11-25 for the session that takes this on. It is a plan to make
first, not a task to begin typing.

**Status, 2026-11-25:** the plan is made:
[evaluator worker design](evaluator-worker-design.md) answers the seven
questions below with measurements and proposes a first step. No app code has
changed. Building it waits on Steve's go-ahead.

## What this is for

The preview evaluates the node graph on the browser's main thread, sixty
times a second. For almost every project that leaves the page plenty of room.
For one measured case it does not: the Field Transform starter on a 64 x 64
matrix with **render resolution: 2x smooth**, which evaluates at 128 x 128.
That runs at 51 frames a second with the laptop on mains and 26 on battery,
and because the evaluation is on the main thread the whole editor stutters
with it, not just the preview.

Moving evaluation to a worker would let the editor stay at 60 whatever the
graph costs, and is the only route left to that case reaching 60.

## Where things stand

The performance pass of 2026-11-25 is finished and deployed (commits
`774ff603`, `9dc87583`, `d72e42f8`, `ff3ee815` on `main`). Read
[performance profile](../development/testing/performance-profile.md) first:
it has the method, every number, and the measuring traps.

Steve was offered three ways to deal with the 128 x 128 case (accept it,
clamp the setting, or this) and chose **accept it as a limit**. So this work
is optional. Before planning it, confirm with him that he wants it now: it
changes how the preview works, and v1.0.0 is close.

What was already taken out of the evaluation's cost, so do not look there
again:

- `inoise8x3` is branch-free and field noise runs a row at a time
  (`src/nodes/shared/lib8tion.ts`, `noiseFieldRow` in `integerPatterns.ts`):
  20.5 ms to 11.6 ms for three four-octave fields at 128 x 128. A gradient
  lookup table was tried and gained 4%.
- Large node thumbnails are one picture, not an element per LED
  (`src/components/Hardware/ledPreviewRaster.ts`).
- A node no longer serialises whole fields to show a live value.

What is known **not** to be worth doing:

- **Moving only the WebGL draw to an `OffscreenCanvas`.** Upload and draw are
  4 ms in every five seconds at 64 x 64, with one draw call a frame. Three
  independent reviews accepted that it would change nothing. If the evaluator
  moves to a worker, drawing there too becomes natural, because the frame is
  already there; on its own it is not a goal.

## What the evaluator touches today

This is why it is a redesign and not a wrapper. All of it is reachable from
`evaluateGraphFull` (`src/state/graphEvaluator.ts`), which is called
synchronously from the animation loop in
`src/components/Preview/LEDPreview.tsx` (the `loop` function, from about line
607).

**It reads live state from stores while it runs.** A worker has none of
these; each needs a snapshot sent in, or a copy kept in step:

| Read | From | Used by |
| --- | --- | --- |
| Hardware inputs: buttons, pots, encoders, touch | `useHardwareInputStore` (18 reads) | `src/nodes/input/evaluate.ts` |
| Touch-screen widget values | `useTransportDisplayTouchStore`, `useDisplayRuntimeStore` | input, output nodes, `evaluator/signals.ts` |
| MIDI, DMX / Art-Net, DDP | `useMidiStore`, `useDmxStore`, `useDdpStore` | `src/nodes/input/evaluate.ts` |
| Player transport, show ramp, pacing, song info | `usePlayerTransport` and `state/player/*` | `src/nodes/show/evaluate.ts` |
| The graph itself, mid-evaluation | `useGraphStore.getState()` | show, output and input nodes, `evaluator/signals.ts` |
| UI flags (test signal and others) | `useUiStore` | audio and audio-reactive nodes |
| Live audio: levels, bands, spectrum, beats | `audio/liveAudioSignal`, `audio/stereoLevels`, `state/audio/beatLatch` | audio nodes |
| SD Video frames | `state/sdVideoStore` (IndexedDB) | `evaluator/sdVideo.ts` |

**It writes state too.** Nodes with memory keep it between frames in
module-level maps (`instanceState` in `src/state/evaluator/memory.ts`), and
fields and frames come from pools that are recycled every pass
(`advanceFramePool`, `allocField`). Some nodes also write back: touch and
control drivers, the beat latch (`consumeLiveBeats` in the loop).

**Its results are objects, not buffers.** A `Field` is a `Float32Array`,
which transfers cheaply. A `Frame` is an array of rows of `{ r, g, b }`
objects, which does not: copying a 64 x 64 frame of 4096 objects across a
thread boundary every frame would cost more than it saves. A frame format
that is one typed array is probably a precondition, and that touches every
node that makes or reads a frame.

**Other callers evaluate the same graph synchronously** and would have to
keep working, on the main thread or through the same worker: the recorder
(`Preview/recordCapture.ts`), pattern thumbnails
(`utils/bakePatternThumbnails.ts`), Studio Scores
(`state/patterns/patternRating.ts`), show preview
(`state/player/showPreview.ts`), the first-launch showcase, and nested
evaluation inside show and output nodes.

**Code nodes already run in a worker** (`state/codeSandbox.worker.ts`,
driven by `evalCodeAsync` in `codeSandboxRuntime.ts`). A worker cannot start
that worker the same way in every browser; how the two relate needs
deciding.

**What the loop does with a result**, all on the main thread today: draws
the matrix (`WebGLLEDRenderer`), routes frames to outputs (`routeFrame`),
publishes to `usePreviewStore` at 8 fps for thumbnails, feeds the live
stream (`publishStreamFrame`), the VU rails, the ambilight colours and the
showcase (`terminalFrameTap`).

## Constraints that must survive

From `CLAUDE.md` and the pattern documents; read
[graph and nodes](../development/patterns/graph-and-nodes.md) and
[player, shows and controls](../development/patterns/player-shows-and-controls.md)
before designing.

- **Preview and firmware parity.** A node's preview must produce what its
  firmware produces. Moving where evaluation runs must not change one value.
  The parity tests are the check.
- **Trust.** Untrusted workspaces do not evaluate formula or code nodes.
  That gate has to hold in the worker, through groups and patterns.
- **One clock.** Preview animation is wall-clock driven; Master Speed scales
  the evaluator's single clock; the Music Player's clock is track position.
  A worker adds latency between "now" and the frame shown, and audio-reactive
  patterns are judged by ear against the music.
- **Beats last one evaluation frame.** They are latched and consumed once
  per pass. A snapshot design must not drop or double them.
- **No visible, redrawn canvas in the node graph**, for the renderer-memory
  leak described in `HardwareLedPreview.tsx`. The main LED Output canvas is
  the one exception that exists.
- **No dead ends for a browser without the feature.** The embed runs inside
  other sites' iframes. `SharedArrayBuffer` needs cross-origin isolation:
  the Vite dev and preview servers send those headers, but the nginx image
  (`deploy/nginx.conf.template`) and the desktop helper do not, and an
  iframe is only isolated if its parent is. Plan on `postMessage` with
  transferable buffers as the baseline; treat shared memory as an extra.

## Questions the plan has to answer

1. **What moves?** The whole evaluator, or only the expensive, pure part
   (field and pattern nodes with no live inputs)? The second is far smaller
   but only helps graphs like Field Transform.
2. **How does live state get in?** A snapshot per frame of everything in the
   table above, or stores mirrored into the worker and kept in step. Measure
   the snapshot's size and cost before choosing.
3. **What is a frame?** Whether to change `Frame` to a typed array
   everywhere first, as its own change, with the worker to follow.
4. **Where is it drawn?** In the worker to an `OffscreenCanvas`, or sent
   back and drawn where it is now.
5. **How late may a frame be?** One frame of latency is 17 ms. Decide what
   audio-reactive preview tolerates, and how the recorder and the live
   stream stay frame-exact.
6. **What stays synchronous?** The thumbnail baker, the ratings and the
   recorder call the evaluator directly and expect an answer.
7. **What is the fallback** when a worker cannot be used, and is it simply
   today's path kept alive?

## How to tell whether it worked

The harness exists: `scripts/perf/profile.mjs`. Build with
`npx vite build --outDir tmp/perf-dist --minify false --emptyOutDir`, then:

```
node scripts/perf/profile.mjs --no-profile --repeat 5 --only "2x smooth (field"
node scripts/perf/profile.mjs --no-profile --repeat 5 --only "matrix 64x64"
node scripts/perf/profile.mjs --no-profile --repeat 3 --warm --only "drag node"
```

Numbers to beat, at full processor speed (the harness's in-page workload
reading 178 to 200 ms; on battery it reads about 390 and everything halves):

| Scenario | Now |
| --- | --- |
| Matrix 64 x 64 at 2x smooth, field-warp | 51 fps |
| Matrix 64 x 64, field-warp | 60 fps, main thread about 60% busy |
| Every other scenario | 60 fps |

Success is not only the preview's rate. The point is that the **page** holds
60 while the preview is slow, so measure an interaction (pan, node drag)
with the 128 x 128 graph loaded: today the editor drops with the preview.
There is no scenario for that yet; add one.

Run the whole suite before and after (`npm test`; about six minutes, 11,044
tests). `bundledAudioRelease.test.ts` times out under full-run load and
passes alone; that is not yours.

## Traps met while measuring

- Never use `vite preview` or `npm run preview`: it starts a real upload
  helper on port 8008, and a page without `?iframe=true` then writes into
  Steve's real Projects folder. The harness serves the build itself, in
  embed mode.
- Measure frame rate with `--no-profile`. The sampling profiler alone drops
  frames.
- About one headless run in ten is slowed by the browser itself; the harness
  sets those aside and says so.
- Shell heredocs halve backslashes on this machine. Write scripts with the
  file tool.

## Suggested first session

Plan only. Read the three documents linked above and the loop in
`LEDPreview.tsx`, measure what a per-frame snapshot of the live state would
cost, and bring Steve a design that answers the seven questions, with the
smallest first step that proves the idea: most likely the pure field nodes
of one graph, in a worker, behind the existing path.
