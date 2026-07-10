---
name: record-demo
description: Record FastLED Studio demos with OBS using the real-cursor shot director (npm run demo), the ad-hoc freeform shot runner (npm run demo:shot), or the manual mouse-take choreographer. Use when the user wants to record a demo, capture a screen recording, film the app for a README/video, run demo shots, trim/cut a recording, or debug the OBS recording rig.
---

# Record a FastLED Studio demo (OBS + real cursor)

This repo has a purpose-built recording rig. **Do not** try to record with
Playwright video, headless capture, or a synthetic cursor — OBS records the
screen, so the cursor the viewer sees must be the *real* Windows cursor.
`scripts/real-mouse.ps1` drives it via `SetCursorPos`/`mouse_event`; the
front-ends below talk to it.

## The tools

| Tool | What it is | When to use |
|------|-----------|-------------|
| `npm run demo` (`scripts/record-demo.mjs`) | Interactive **shot director**: a persistent SHOTS menu, Playwright builds the graph state itself, real cursor for every click/drag | Scripted, repeatable shots of app features, canvas state composes across shots |
| `npm run demo:session` (`scripts/freeform-session.mjs`) | **Persistent browser session** (`start`/`status`/`stop`) that freeform shots reconnect to | Run `start` once before any freeform shots — the user builds their graph in that window with no time pressure |
| `npm run demo:shot` (`scripts/freeform-shot.mjs`) | **One-off ad-hoc shot**: plays a single hand-written shot module after a countdown, timestamps it for later trimming | The user describes a shot in chat; wires/clicks against whatever's on the canvas in the session above |
| `node scripts/mouse-take.mjs` | **Manual choreographer**: eased real-mouse moves at absolute screen coordinates from a take file or `-c` string; no browser automation | One-off motion over a screen the user arranged themselves, no Playwright element lookups needed |
| `npm run demo:trim` (`scripts/trim-dead-sections.mjs`) | **Post-processing**: cuts the dead gaps out of a raw OBS recording using the timing log `freeform-shot.mjs` writes | After recording one or more freeform shots into a single OBS file, to make it seamless |

## Shot-director workflow

```bash
# terminal 1 — leave running
npm run dev

# terminal 2
npm run demo                 # opens the demo browser + a shot prompt
npm run demo -- build tidy   # or queue shots up front
```

At the prompt: type a shot name or number, `list` to see all shots, `q` to
quit. Each shot starts with a countdown (default 3 s, `DEMO_COUNTDOWN` to
change) — **that pause is for the user to arm OBS**; the script never starts
or stops OBS itself. Canvas state persists between shots so they compose
(`build` → `pull` → `tidy`). Current shots include: `build`, `pull`, `music`,
`sliders`, `tidy`, `previews`, `fullscreen`, `pan`, `zoom`, `snap`, `clear` —
`SHOTS` in [record-demo.mjs](../../../scripts/record-demo.mjs) is authoritative.

If the dev server is not on 5173, point the director at it:
`DEMO_URL=http://localhost:5199 npm run demo`.

## Freeform shot workflow (one shot per turn, cut later)

For "the user describes a shot in chat, arranges the app themselves, then
just that motion gets recorded" — as opposed to the director's pre-registered
`SHOTS` menu. **Two things that aren't obvious going in:**

- Each `freeform-shot.mjs` invocation is a **separate OS process**, and by
  default launches its own **fresh, isolated Chromium instance** — no shared
  localStorage with the user's regular Chrome, and an empty canvas. A 10 s
  countdown is nowhere near enough time to hand-build a multi-node graph from
  scratch, and the user's "already set up" tab is a different browser
  profile the automation can't see. **Always start a persistent session
  first** (step 0) rather than letting a shot launch its own throwaway
  browser — that combination (fresh browser + short countdown assuming
  pre-built state) doesn't work and fails with "node not found on canvas".
- The shot itself still has a countdown before it plays — that's for arming
  OBS, not for building the graph.

0. **Start the persistent session once, before any shots — as a background
   command, not a foreground one:**

   ```bash
   npm run demo:session -- start
   ```

   Run this with the tool's background-execution option. `start` blocks
   forever by design and must keep running for the whole recording session:
   the spawned browser is a child process of `start`, and in this sandboxed
   shell the whole process tree dies the instant its owning command exits
   (confirmed empirically — not a Playwright default) — so a foreground
   `start` that runs to completion leaves no browser behind at all, even
   though it reports success.

   This opens a window titled "FastLED Studio DEMO RIG" (backed by
   `chromium.launchServer()`, address saved to
   `video-shots/.freeform-session.json`). **The user builds their graph in
   THAT window**, not their regular Chrome tab — with no time limit, since
   nothing is counting down yet. `npm run demo:session -- status` (a normal
   foreground command — it only opens a network connection, no child
   process) checks whether it's still alive; `npm run demo:session -- stop`
   closes it remotely, which the backgrounded `start` process detects and
   exits from on its own. Do this when the whole recording session is over,
   not between shots.

1. Write a small shot module to the scratchpad (or anywhere outside the
   repo) implementing the described motion:

   ```js
   // export default async function run(ctx)
   // ctx = { page, cursor, mouse, nodeByLabel, nodeHandle, addNode,
   //         ensureVisible, centerOf, VIEWPORT, sleep }
   export default async function run({ page, cursor, nodeByLabel, nodeHandle }) {
     const fire = nodeByLabel(page, 'Fire 2012')
     const output = nodeByLabel(page, 'Matrix Output')
     await cursor.dragTo(nodeHandle(output, 'frame', 'left'), {
       from: nodeHandle(fire, 'frame', 'right'),
       duration: 750,
     })
   }
   ```

   Same rules as director shots: use `cursor`/`mouse`, never `page.mouse`;
   resolve locators right before pressing (rule 4 below). Assume the nodes
   this shot needs already exist on the canvas (the user built them in step
   0) — a shot wires/clicks, it doesn't add or position nodes unless asked.

2. Run it:

   ```bash
   npm run demo:shot -- path/to/shot.mjs --countdown 10 --label wire-fire
   ```

   `freeform-shot.mjs` reconnects to the session from step 0 if one is
   running (same tab, same graph state — falls back to a fresh one-off
   browser with a warning if no session is found, which almost always means
   step 0 was skipped). It then counts down (default 10 s, `--countdown` to
   change) — **that's the window to arm OBS**, not to build anything. It
   logs the wall-clock start/end of the actual motion (not the countdown) to
   `video-shots/timing-log.json`, appending across runs.

3. Repeat for each shot the user describes, all against the *same* OBS
   recording if desired, and all against the *same* browser session (so
   graph state accumulates too, e.g. wiring done in shot 1 is still there
   for shot 2) — the timing log accumulates entries across process
   invocations regardless.

4. When done, trim the dead time out (see below), then
   `npm run demo:session -- stop`.

`--keep-open` skips a shot's own end-of-run cleanup: when reusing the
persistent session (the normal case) that only means the per-process
real-mouse driver is left running for you to kill yourself; the shared
browser is never touched by a shot regardless — only `demo:session -- stop`
closes it. `--keep-open` matters more for the one-off fallback path (no
session running), where it also skips closing that throwaway browser.

## Trimming the recording

Once the user turns OBS off and gives the go-ahead:

```bash
npm run demo:trim                              # auto-picks the newest file in C:\Users\User\Videos
npm run demo:trim -- "C:\path\to\specific.mp4"  # or name one explicitly
```

This reads `video-shots/timing-log.json` and estimates when the recording
started, in priority order: OBS's default filename timestamp
(`YYYY-MM-DD_HH-MM-SS.mp4`, stamped at record-start off the same local clock
`freeform-shot.mjs` used) → the container's `creation_time` tag → the file's
last-write time minus its duration. `--rec-start <ISO>` overrides outright.
It then maps each logged shot window onto video-relative seconds, pads it
(`--pad`, default 0.6 s), merges windows closer than `--merge-gap` (default
1.2 s) so it doesn't make pointless micro-cuts, and re-encodes only those
windows back-to-back via an ffmpeg `trim`+`concat` filter — so the
countdowns and idle gaps between shots disappear and the cuts land clean.
Output defaults to `video-shots/<input-basename>-trimmed.mp4`; `--out` to
override. `--clear-log` deletes the timing log after a successful trim so
the next recording session starts fresh. `--videos-dir` overrides where the
"newest recording" search looks (default `C:\Users\User\Videos`).

`ffmpeg`/`ffprobe` are resolved via `PATH`, then a `winget install
Gyan.FFmpeg` fallback location, then error out with install instructions —
pass `--ffmpeg <path>` to override.

**This only works for recordings made through `npm run demo:shot`** — the
alignment depends on the timing log. A recording made purely by hand (or via
the shot director's own SHOTS menu, which doesn't write the log) has nothing
to trim against.

## Manual-take workflow

```bash
node scripts/mouse-take.mjs --where            # hover targets, read live coords
node scripts/mouse-take.mjs --delay 10 take.txt
node scripts/mouse-take.mjs --delay 10 -c "move 664 479; drag 773 490; wait 2; click"
```

Take commands (one per line or `;`-separated, `#` comments): `move x y [ms]`,
`click [x y [ms]]`, `dblclick`, `drag x y [ms]`, `down`/`up`, `wheel n`,
`wait s`, `end`. Coordinates are physical screen pixels — exactly what
`--where` prints, so always grab them by hovering, never by arithmetic.

## Hard-won environment rules (violating these broke past recordings)

1. **The user is present and shares the cursor.** Announce clearly before any
   run that hijacks the real mouse, and remind them not to touch it while a
   shot plays — the script and the human fight over one physical cursor.
2. **Never assume window geometry.** The display is 1920×1080 at 125 %
   scaling (≈1536×864 usable DIPs); a fixed window ≥900 px tall hangs off the
   bottom and clicks silently land on the taskbar. The director maximizes the
   window and measures it — keep it that way in any new shot code.
3. **Never match windows by the app's plain title.** The user usually has
   their own Chrome tab called "FastLED Studio" open. The director retitles
   its window `FastLED Studio DEMO RIG` (ASCII only — the title crosses a
   stdin pipe to PowerShell) and foregrounds by that unique prefix.
4. **Re-measure element positions immediately before pressing the mouse
   button.** Node previews popping in shift ports by ~100 px between "locate"
   and "click" — a stale coordinate wires the wrong port.
5. **Keep the demo browser fully visible on the primary display** — not
   covered by OBS or the terminal. Real clicks land wherever the pixels are.

## Adding a shot

To make a freeform shot permanent (reusable without re-describing it), move
its module into an entry in `SHOTS` in
[record-demo.mjs](../../../scripts/record-demo.mjs): locate elements with
Playwright locators, move/click through `ctx.cursor` / `ctx.mouse` (never
`page.mouse` — Playwright clicks don't move the real cursor, so OBS records
a teleporting UI). Follow rule 4: resolve `boundingBox()` right before the
press, not at shot start.

`record-demo.mjs` exports `startSession`, `addNode`, `ensureVisible`,
`nodeByLabel`, `nodeHandle`, `centerOf`, `RealMouse`, `Cursor`, `calibrate`,
and `VIEWPORT` — both the director and `freeform-shot.mjs` build on the same
`startSession()` (browser launch, real-mouse start, window maximize, cursor
calibration), so fixes to session bootstrap only need to happen once.

## One-time setup (new machine)

```bash
npm install --save-dev playwright
npx playwright install chromium
```

OBS itself is the user's own install and scene setup — the rig only assumes
"OBS is recording the screen while shots run".
