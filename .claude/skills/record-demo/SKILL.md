---
name: record-demo
description: Record FastLED Studio demos with OBS using the real-cursor shot director (npm run demo) or the manual mouse-take choreographer. Use when the user wants to record a demo, capture a screen recording, film the app for a README/video, run demo shots, or debug the OBS recording rig.
---

# Record a FastLED Studio demo (OBS + real cursor)

This repo has a purpose-built recording rig. **Do not** try to record with
Playwright video, headless capture, or a synthetic cursor — OBS records the
screen, so the cursor the viewer sees must be the *real* Windows cursor.
`scripts/real-mouse.ps1` drives it via `SetCursorPos`/`mouse_event`; the two
front-ends below talk to it.

## The two tools

| Tool | What it is | When to use |
|------|-----------|-------------|
| `npm run demo` (`scripts/record-demo.mjs`) | Interactive **shot director**: Playwright opens Chromium, finds elements, and types — but every click/drag is the real cursor | Scripted, repeatable shots of app features |
| `node scripts/mouse-take.mjs` | **Manual choreographer**: eased real-mouse moves at absolute screen coordinates from a take file or `-c` string; no browser automation | One-off motion over a screen the user arranged themselves |

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

Add an entry to `SHOTS` in [record-demo.mjs](../../../scripts/record-demo.mjs):
locate elements with Playwright locators, move/click through `ctx.cursor` /
`ctx.mouse` (never `page.mouse` — Playwright clicks don't move the real
cursor, so OBS records a teleporting UI). Follow rule 4: resolve
`boundingBox()` right before the press, not at shot start.

## One-time setup (new machine)

```bash
npm install --save-dev playwright
npx playwright install chromium
```

OBS itself is the user's own install and scene setup — the rig only assumes
"OBS is recording the screen while shots run".
