# App review baseline — 24 September 2026

This is the repeatable visual baseline for item 1 of
[`review 24-9-2026.md`](../../../review%2024-9-2026.md). Each capture uses a
disposable project in a fresh headless-Chromium context with empty storage, at
an exact viewport of 1920×1080 or 1366×768. Requests to the upload helper are
refused during capture, so a running helper cannot restore a saved project into
the scenario.

The baseline set shows the app before items 2–4: it was captured from a
worktree at commit `f862de60`, and the after set from the current `Hardware`
build, both with the same capture script. The images are stored as WebP
(quality 88) to keep the repository small, at their exact pixel dimensions.

## Scenarios

| Scenario | Repeat from a new disposable project | 1920×1080 | 1366×768 |
| --- | --- | --- | --- |
| Blank workspace | Open **Graph** without loading a starter. | [image](../../images/review-2026-09-24/baseline/blank-workspace-1920x1080.webp) | [image](../../images/review-2026-09-24/baseline/blank-workspace-1366x768.webp) |
| Juggle → LED String | Choose **Start with Juggle**. Keep the starter's default controls and fit. | [image](../../images/review-2026-09-24/baseline/juggle-led-string-1920x1080.webp) | [image](../../images/review-2026-09-24/baseline/juggle-led-string-1366x768.webp) |
| Music player with display | Open **Start Gallery** and load **Player Buttons and Screen**. This gives a Music Player, three buttons, Control Map, LED Matrix and Info Display. | [image](../../images/review-2026-09-24/baseline/music-player-display-1920x1080.webp) | [image](../../images/review-2026-09-24/baseline/music-player-display-1366x768.webp) |
| One blocking error | Load **Juggle**, expand the LED String's **Wiring**, and change **chipset** from WS2812B to APA102. The automatically assigned clock pin is GPIO 6, producing exactly one error: **Pin is incompatible with the selected board**. | [image](../../images/review-2026-09-24/baseline/single-blocking-error-1920x1080.webp) | [image](../../images/review-2026-09-24/baseline/single-blocking-error-1366x768.webp) |
| Empty screen design | In **Hardware**, add **Displays → ST7789V 2.4-inch + touch**. In **Graph**, set the Display Panel layout to **Custom design**, then choose **Edit screen design** without adding widgets. | [image](../../images/review-2026-09-24/baseline/empty-screen-design-1920x1080.webp) | [image](../../images/review-2026-09-24/baseline/empty-screen-design-1366x768.webp) |

## Baseline observations

- Graph Health starts expanded on this clean origin. Its body occupies roughly
  270 px vertically even for a healthy Juggle graph, visibly taking useful
  canvas space at both target sizes.
- The blank and empty-screen scenarios make the same space cost especially
  obvious: a short diagnostic is followed by a large unused drawer area.
- The LED preview keeps the large idle spectrum, transport and logo treatment
  in all five scenarios, including the blank graph and screen designer.
- At 1366×768 the useful graph or designer surface is compressed between the
  persistent left/right panels and the expanded diagnostics, while all controls
  remain present for later regression comparison.

These images are browser evidence only. They do not claim a successful compile,
upload, serial connection or physical-device test.

## Item 2 comparison — compact Graph Health

After the baseline capture, Graph Health was changed to start as a 40 px summary
rail. The rail shows its error/warning counts and the highest-priority issue, and
the full inspector remains available on demand. With the single-error fixture,
the expanded inspector measured 195 px high at both 1366×768 and 1920×1080;
its body matched its 154 px content rather than claiming a fixed portion of the
workspace. Longer issue lists are capped at 34% of the viewport (up to 360 px)
and scroll internally. An explicit saved open/closed choice is still restored.

## Item 3 comparison — workspace panel defaults

The Graph workspace keeps its original preview-first layout. Hardware, Upload
and Build Diagram now start with the secondary LED/audio preview collapsed, so
their primary bench, upload controls and diagram receive the reclaimed width.
Each workspace independently persists its sidebar/preview visibility, widths and
active layout preset. Live browser verification at 1920 px confirmed that a
Hardware preview changed from its 380 px default to 396 px remained open and at
396 px after visiting Graph and after a page reload, while Graph stayed open at
its own 496 px width. The browser console reported no warnings or errors during
the workspace round trip.

## Item 4 comparison — task-focused preview chrome

When there is no audio visualizer, show, playlist, VU meter, performance mode or
Stage session, the preview now replaces the idle spectrum, disabled transport
and animated wordmark with a 38 px Audio tools row and a direct **Add track**
action. In the 1920 px blank-workspace fixture this increased the useful output
matrix from 339 px to 447 px high, a 108 px gain. Loading the Audio Spectrum
starter restored the complete spectrum and transport immediately; its remaining
brand signature measured 38 px high. No browser warnings or errors were emitted.

## Item 5 verification — usable working space

All five scenarios were repeated at both sizes in fresh browser contexts, so no
saved layout from an earlier run could leak in. The resulting
[after images](../../images/review-2026-09-24/after/) keep the baseline
filenames. They were checked for exact pixel dimensions and captured with no
horizontal page scroll. Graph Health measured 40 px in every capture.

| Check | 1920×1080 | 1366×768 |
| --- | --- | --- |
| Graph fit (music player, 10 visible nodes) | all nodes inside the canvas | all nodes inside the canvas |
| Node library sidebar | content fits (729 px) | scrolls internally |
| Hardware → Upload → Build Diagram → Graph | each tab activates, no page scroll | each tab activates, no page scroll |
| Hardware bench and part labels | readable, unclipped | readable, unclipped |
| Build Diagram labels at Fit | legible; panel and filters visible | legible at 32 %; panel and filters visible |
| Upload Output console | fills the workspace beside the deploy controls | fills the workspace beside the deploy controls |
| Keyboard focus after tab switching | 2 px solid outline | 2 px solid outline |
| Browser warnings or errors (helper offline excluded) | none | none |

One regression was found and fixed. At 1366×768 the music-player preview is
height-limited, and the **Output matrix** heading was clipped by 4 px above
its frame. It already appeared in the baseline and had become more visible
next to the expanded audio tools. `.canvasWrap` now reserves the heading's
offset as top padding. `matrixHeadingRoom.test.ts` checks that every
padding-top rule for the wrap covers every heading offset, including the
short-viewport rule.

A cold dev server once painted Build Diagram blank on its first open while
the lazy module compiled. It rendered on every later visit, so this is not
treated as a layout fault.

Remaining observations are outside item 5 and are carried to their own items:

- At 1366 px the status bar runs off the right edge (Port, Chip and Size chips
  are cut), and the toolbar truncates **Start** to its icon (item 18).
- The Signal Overview minimap can sit over the node being edited at 1366 px,
  for example the LED String's Wiring fields in the single-error scenario.
- The status bar reads "capacity: install toolchain to check" beside the
  "FITS" label (item 6), and Upload reads "ESP32 · no port" (item 7).
- The MIC OFF tooltip still says to add a microphone "in the Hardware bench
  below" (item 23).
