# Performance profile: frame rate and main-thread spikes

How to measure the web app's frame rate and find what drops a frame, and what
the 2026-11-25 pass found and fixed. The rules that came out of it for UI code
are in [workspace UI](../patterns/workspace-ui.md#layout-and-input-traps).

## Running it

```
npx vite build --outDir tmp/perf-dist --minify false --emptyOutDir
node scripts/perf/profile.mjs --no-profile --repeat 3          # frame rates, every scenario
node scripts/perf/profile.mjs --no-profile --repeat 3 --warm   # interactions, shaders compiled
node scripts/perf/profile.mjs --only "pan canvas"              # CPU profile: who is busy
node scripts/perf/profile.mjs --trace --only "zoom"            # DevTools trace: what kind of work
node scripts/perf/profile.mjs --uncapped --no-profile          # no 60 Hz limit: how much headroom
node scripts/perf/report.mjs <label> [scenario]                # print spikes from a run
node scripts/perf/gap.mjs artifacts/perf/<label>-<scenario>.trace.json   # every thread, longest frame gap
```

The build step ends with an error from the service-worker plugin about a file
too large to precache; the app bundle is written before it and is all the
profile needs. The script serves that build itself. Never use `vite preview`
for this: it starts a real upload helper.

`scripts/perf/profile.mjs` drives Playwright's Chromium on the real GPU. Each
scenario opens in a fresh browser in embed mode (`?iframe=true`: storage in
memory, no helper), and records every `requestAnimationFrame` interval, the
browser's long-animation-frame reports, and either a sampling CPU profile or a
DevTools trace. Results go to `artifacts/perf/<label>.json`; a trace file
opens in the DevTools Performance panel.

Scenarios:

- the Graph workspace idle on five starters, the microphone starter included
  (fed by Chromium's fake capture device);
- Hardware, Upload, Build Diagram and Stage, on a small project and on the
  starters with the most parts;
- the largest outputs the app allows: a 64 x 64 matrix on three starters, the
  same matrix evaluated at 128 x 128 ("2x smooth"), a 4096-LED string, rings of
  240 and 1024 LEDs and a 600-LED corkscrew (shaped outputs draw through
  Canvas 2D, not the shader);
- the five diffused preview styles and the 3D preview on the Music Player
  starter (86 patterns, the heaviest shipped project);
- pan, zoom, node drag, slider drag and node-library scroll, and a node drag
  over the 2x smooth matrix, where the page, not the preview, is measured.

A scenario sets the LED output through the page's own controls. One that needs
a project no starter builds (a ring) takes File > Copy Graph Link, changes the
workspace and opens the changed link.

## Rules for a measurement you can trust

Each of these cost time to learn on this pass.

- **Measure frame rate without the profiler.** The sampling profiler slows the
  page enough to drop frames by itself: the same scenario read 38 fps profiled
  and 59 fps unprofiled. Profile to find who is busy; pass `--no-profile` to
  say how fast it is.
- **Skip the first frame after the profiler or a trace starts.** Starting
  either stalls the page once for 150 to 200 ms.
- **Send input at a device's rate.** Events sent through the debugging
  protocol are not merged into one per frame as a real mouse's are. Sent as
  fast as the protocol allows, a drag delivers dozens of moves a frame and
  measures the protocol. The script sends about 125 a second.
- **Run each scenario more than once** (`--repeat 3` reports the median and
  every run's dropped frames). The machine is a desktop in use, and a batch of
  half an hour heats a laptop: the same build read 60.0 and 58.6 fps on the
  64 x 64 matrix an hour apart.
- **Separate a cold run from a warm one.** The first time the browser draws an
  effect, its GPU process stalls for 75 to 180 ms, off the main thread
  (`DawnPlatformImpl::RunWorkerTask` under a raster flush in the trace).
  `--warm` performs the interaction once before recording.
- **A long frame with no script in it is not a main-thread problem.**
  `gap.mjs` shows what every thread, the GPU process included, did during the
  longest gap between frames.
- **Test a guess before changing the app.** `--css "<rules>"` injects a
  stylesheet into a scenario. Hiding the pointer glow, or promoting the
  viewport layer, took one run each to confirm or rule out.
- **Check that the browser was not slowed while you measured.** About one
  run in ten of the same scenario came out several times slower than its
  neighbours, with the same zoom, the same thumbnails and the same machine
  speed going in. The script now times one fixed loop of arithmetic inside
  the page before and after each recording. In every slow run that loop took
  1.3 to 10 times longer afterwards (229 to 1861 ms against 178), and in no
  fast run did it: the whole page was running slowly, an unrelated loop as
  much as the app. A profile taken during one showed the noise functions
  costing 40 ms a frame instead of 6 and no new function at the top. Runs
  like that are set aside and counted in the summary line. What slows the
  process was not established (it happens in headless Chromium here, more
  often when the frame limit is lifted); nothing says a visible Chrome window
  does it, and nothing says it does not.
- **Know how fast the machine was.** The same build measured 51 fps and
  26 fps on the 128 x 128 case in two sessions. The fixed loop the script
  times in the page took 178 to 197 ms in the first and about 390 ms, before
  and after every run, in the second: the processor was running at half
  speed throughout, with the laptop on battery. The check above compares a
  run's two readings, so it does not catch a machine that is slow the whole
  time. Read the `machine` values in the results (`pace` with `--repeat`), and
  compare numbers only between runs where they agree. The figures in this
  document are at 178 to 200 ms unless they say otherwise.
- **Size matters more than the project.** Everything held 60 fps on the
  starters' 16 x 16 matrix. The same field-warp starter at 64 x 64 ran at 17.

## What was found, 2026-11-25

Machine: a laptop with AMD Radeon integrated graphics (ANGLE, Direct3D 11),
Chromium 1255, 1600 x 900. Its power state was not recorded for each run; see
"Know how fast the machine was" above. On a starter's own small output every page held 60 fps idle, bar
one dropped frame every five seconds on the Music Player starter. The spikes
were in interactions, in autosave, and in everything a large output touches.

| # | Spike | Cause | Fix |
| --- | --- | --- | --- |
| 1 | Pan, node drag and slider drag: frames of 100 to 200 ms (250 ms when input is flooded) | The canvas wrapper took inherited custom properties (`--field-x`, `--field-y` on every pointer move; five `--field-*` values ten times a second), so each one restyled every node. A drag reads layout on every move, and paid for that restyle each time. | Written on the two elements that draw them; the pointer glow updates once a frame; four properties nothing read are no longer written (`NodeGraphCanvas.tsx`) |
| 2 | Zoom: a 180 ms frame as it starts, 5 to 6 dropped | Each wheel step rastered every node again at the new scale | The viewport is a compositor layer for the length of the gesture (`holdViewportLayer`) |
| 3 | A 49 ms block ten seconds after an edit, on a large project | Autosave copied the workspace twice, then wrote it out as text twice, with every other saved project beside it | One copy (`ownedWorkspace`); each project's text is kept until that project changes (`projectJson`); copy and write run in separate idle slices: 22 ms and 9 ms |
| 4 | Node drag: every property of every node serialised on each move | `codegenSignature` ran on each new node array | Signed per node `data` object, which a move does not replace (`codegenGraph.ts`) |
| 5 | Layout forced on every spectrum paint | `PreviewSpectrum` measured its canvas each time it painted | Measured in its resize observer |
| 6 | The pointer glow was a mask over the whole canvas | Painted again in full for each pointer move | A 300 px box moved by a transform (`.cursorWake`) |
| 7 | A large output: 58 ms frames eight times a second | A node thumbnail was one SVG group and two rects per LED: 8192 rects for a 64 x 64 output, restyled and repainted whenever its colours changed (17 ms of style and 5 ms of paint for two 32 x 32 thumbnails) | Above 256 LEDs a plain grid is one picture behind a mask of LED shapes: two elements, 0.7 ms an update (`ledPreviewRaster.ts`) |
| 8 | A large output: 8 ms on every publish, per wired node | A node's live-value lookup serialised whole fields (one number per LED) to JSON and re-rendered the node | Arrays are left out: an inline editor shows a number, a switch or a colour (`StudioNode.tsx`) |
| 9 | Field noise: 40% of a frame at 64 x 64 | `inoise8x3` allocated a closure per call, branched through a sixteen-way switch and compared in every interpolation: fifteen branches on noise a call, each a coin toss to the processor | The same function, bit for bit, with typed tables and no branch on the data, and a field evaluated a row at a time so what depends only on the row is worked out once (`inoise8x3Row`, `noiseFieldRow`): 20.5 ms to 11.6 ms for three four-octave fields at 128 x 128. `lib8tionNoise.test.ts` checks both against the plain transcription |

Row 6's old glow also declared two colour washes that never drew: its box had
no height (measured 1600 x 0 px in the old build), so only its dotted
pseudo-element showed. The new box draws those same dots and nothing was taken
off the screen.

Row 7's choice was measured, because a redrawn canvas has leaked renderer
memory in this app before. Two 32 x 32 thumbnails updated on every frame for
five minutes: the picture levelled off at 127 MB of renderer memory and stayed
flat for the last three and a half; the same thumbnails as one `box-shadow`
per LED held 203 MB at 6 ms an update; as SVG groups, 690 MB at 26 ms.

Same protocol before and after (`--no-profile --repeat 2`, the median run):

| Scenario | Before | After |
| --- | --- | --- |
| Every idle page on field-warp, juggle, fire | 60.0 fps, 0 dropped | 60.0 fps, 0 dropped |
| Every Music Player starter page and preview style, idle | 59.8 fps, 1 dropped in 5 s | 60.0 fps, 0 dropped |
| Microphone starter, idle | 58.2 fps, 9 dropped | 59.6 fps, 2 dropped |
| Hardware and Build Diagram, starters with the most parts | 60.0 fps, 0 dropped | 60.0 fps, 0 dropped |
| Matrix 64 x 64, field-warp | 16.9 to 45 fps, 100 to 200 ms frames | 60.0 fps, 0 dropped, 17 ms worst, in 11 runs of 12 at full processor speed (the twelfth was a browser-slowed run); 59 to 60 fps with 1 to 5 single 33 ms frames in 5 s when the processor ran at half speed |
| Matrix 64 x 64, fire | 37.7 fps, 100 ms frames | 60.0 fps, 0 dropped |
| Matrix 64 x 64, Music Player (Standard and Neon) | 59.8 / 59.6 fps | 60.0 fps, 0 dropped |
| Ring of 240 / 1024 LEDs | 52.3 / 45.9 fps | 60.0 fps, 0 dropped |
| Corkscrew of 600 LEDs | 50.4 fps | 59.8 fps, 1 dropped |
| String of 4096 LEDs | 58.4 to 60.0 fps | 60.0 fps, 0 dropped |
| Pan, warm (field-warp / Music Player) | 58.4 / 59.0 fps, 23 / 16 dropped | 60.0 fps, 0 dropped |
| Node drag, warm (field-warp / Music Player) | 57.5 / 53.1 fps, 31 / 144 dropped | 60.0 fps, 0 dropped |
| Slider drag, warm | 56.9 fps, 44 dropped | 60.0 fps, 0 dropped |
| Zoom, warm | 60.0 fps, 1 dropped, 33 ms worst | 60.0 fps, 0 dropped, 17 ms worst |
| Node-library scroll, warm | 60.0 fps, 0 dropped | 60.0 fps, 0 dropped |
| Pan with a 64 x 64 matrix, Music Player, cold | 18.9 fps, 558 dropped | 56.9 fps, 36 dropped |
| Zoom, cold | 6 dropped, 183 ms worst | 3 dropped, 117 ms worst |
| Matrix 64 x 64 evaluated at 128 x 128, field-warp | 4.3 fps | 51 fps at full processor speed, 26 fps at half |

With the 60 Hz limit lifted (`--uncapped`), after the fixes:

| Scenario | Animation frames a second |
| --- | --- |
| Idle, six starters | 215 to 486 |
| Pan, zoom, slider drag, node-library scroll (field-warp), warm | 241, 242, 299, 300 |
| Node drag, warm (field-warp / Music Player) | 169 / 146 |
| Pan, warm (Music Player) | 130 |
| Pan with a 64 x 64 matrix, warm (Music Player) | 76 |

## Still below 60, and why

- **Headroom at the largest matrix is thin.** Field-warp at 64 x 64 holds 60,
  with the main thread busy 60 to 65% of the time under the profiler: the
  noise functions are 35% of the profile. A slower processor than this
  laptop's would not hold it.

- **A 64 x 64 matrix evaluated at 128 x 128 ("2x smooth") on field-warp**
  was 51 fps at full processor speed and 26 at half: three four-octave
  noise fields over 16,384 cells, on the main thread. Since 2026-11-25 a
  graph built only from node types that read no store but the audio ones is
  evaluated in a worker ([evaluator worker design](../../plans/evaluator-worker-design.md)):
  the same case holds 60 fps with the main thread idle, at half speed, and
  dragging a node over it runs at 57 fps where it ran at 23. Audio, inputs
  and shows followed: only a graph with a Touch node or a display panel
  still evaluates on the main thread. Panning over the Music Player's
  64 x 64 matrix with the frame limit lifted went from 71 to 94 frames a
  second at half processor speed.
- **Pan with a 64 x 64 matrix on the Music Player starter, cold: 56.9 fps.**
  Warm and uncapped the same pan runs at 76 frames a second, so it holds 60
  once the first-use stall below is behind it, with the least headroom of
  anything measured.
- **The first use of an interaction after the browser starts: 2 to 5 dropped
  frames, 100 to 180 ms.** The trace puts it in the GPU process, not the page.
  Two ways round it were measured and neither works: a browser profile kept
  between launches (`--profile-dir`) pays it again each launch, and drawing the
  pointer glow nearly invisible at load does not move the stall there. With UI
  effects off (View menu) the glow is not drawn and a cold pan drops nothing.

## What was left alone, and why

- **The WebGL preview: no `OffscreenCanvas`, no batching.** Measured at the
  largest output, not only the starters'. At 64 x 64 a frame's texture upload
  and draw take 4 ms of main-thread time in every five seconds (7 ms at
  128 x 128), and the GPU process is busy 16% of the time in the heaviest
  style (169 texture reads a pixel) with no task over 16 ms. There is one draw
  call a frame, so nothing to batch. The preview is also paced to the
  controller's frame rate on purpose (60 steps a second by default,
  `LEDPreview.tsx`), because it shows what the LEDs will do; a faster display
  does not get more preview frames whichever thread draws them. What limited a large output was rows 7,
  8 and 9: thumbnails in the page, a JSON round trip and noise arithmetic.
  A worker drawing to an `OffscreenCanvas` would move the 0.1% that is drawing
  and leave the evaluation that feeds it where it is; moving the evaluator
  itself to a worker is the change that would help the one case still below
  60, and it is a redesign of how the preview reads the graph, audio and
  player state.
- **Autosave's copy slice** is still 22 ms on the Music Player starter, a few
  milliseconds over one frame, in idle time. Copying only the sub-graphs that
  changed would shorten it, at the price of saved versions sharing objects.
- **Not measured:** a display above 60 Hz (the uncapped runs stand in for it),
  a real microphone, headed Chrome, Firefox and Safari, the Help, Projects and
  Start Gallery dialogs, and a bench with more parts than a starter carries.
