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
| `npm run demo:shot` (`scripts/freeform-shot.mjs`) | **One-off ad-hoc shot**: plays a single hand-written shot module after a long countdown, timestamps it for later trimming | The user describes a shot in chat, arranges the on-screen state themselves, and wants just that motion recorded |
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

For "the user describes a shot in chat, arranges the app themselves during a
long countdown, then just that motion gets recorded" — as opposed to the
director's pre-registered `SHOTS` menu:

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
   resolve locators right before pressing (rule 4 below).

2. Run it:

   ```bash
   npm run demo:shot -- path/to/shot.mjs --countdown 10 --label wire-fire
   ```

   The script launches its own browser + real-mouse session (same
   `startSession()` the director uses), then counts down (default 10 s,
   `--countdown` to change) — **that's the window for the user to arrange the
   on-screen state and arm OBS**, exactly like the director's countdown but
   longer since there's no scripted setup to skip. It logs the wall-clock
   start/end of the actual motion (not the countdown) to
   `video-shots/timing-log.json`, appending across runs.

3. Repeat for each shot the user describes, all against the *same* OBS
   recording if desired — the timing log accumulates entries across process
   invocations.

4. When done, trim the dead time out (see below).

Add `--keep-open` to leave the browser/mouse driver running after a shot (so
you can immediately eyeball the result) — you're then responsible for
killing that process before starting a fresh session.

## Trimming the recording

Once OBS's raw file is saved:

```bash
npm run demo:trim -- "C:\path\to\obs-recording.mp4"
```

This reads `video-shots/timing-log.json`, estimates when the recording
started (container `creation_time` tag if present, else the file's
last-write time minus its duration — OBS finalizes the file right when
recording stops), maps each logged shot window onto video-relative seconds,
pads it (`--pad`, default 0.6 s), merges windows closer than `--merge-gap`
(default 1.2 s) so it doesn't make pointless micro-cuts, and re-encodes only
those windows back-to-back via an ffmpeg `trim`+`concat` filter — so the
countdowns and idle gaps between shots disappear and the cuts land clean.
Output defaults to `<input>-trimmed.mp4` next to the input; `--out` to
override. `--clear-log` deletes the timing log after a successful trim so
the next recording session starts fresh.

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
