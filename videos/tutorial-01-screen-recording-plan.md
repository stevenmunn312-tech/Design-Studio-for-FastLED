# Tutorial 01 screen-recording plan and execution prompt

## Scope

Plan only. Do not start OBS or create any recording while preparing this
document.

Tutorial: **Build your first pattern with Juggle**

The eventual screen-capture deliverable is:

- `tutorial-01-juggle-screen-1920x1080.mp4`
- 1920 × 1080
- 30 fps
- H.264 MP4
- approximately 32 seconds
- visible highlighted mouse cursor
- app footage only; do not bake in the title card, end card, or narration

The proposed assembled tutorial is 46 seconds:

| Section | Duration | Final timeline |
| --- | ---: | ---: |
| Existing title card | 7.00 s | 00:00–00:07 |
| New Studio screen capture | 32.00 s | 00:07–00:39 |
| Existing end card | 7.00 s | 00:39–00:46 |

## Approved source assets

- Tutorial script:
  `C:\dev\Design-Studio-for-FastLED\tutorials.md`
- Title card:
  `C:\dev\Design-Studio-for-FastLED\videos\tutorial-cards\renders\title-01-juggle.mp4`
- End card:
  `C:\dev\Design-Studio-for-FastLED\videos\tutorial-cards\renders\end-01-next-interface.mp4`
- Narration:
  `C:\dev\Design-Studio-for-FastLED\outputs\tutorial-narration\2026-07-30-chatterbox-elements\audio\t1-e01.wav`
  (2.28 s)
- Narration:
  `C:\dev\Design-Studio-for-FastLED\outputs\tutorial-narration\2026-07-30-chatterbox-elements\audio\t1-e02.wav`
  (8.36 s)
- Narration:
  `C:\dev\Design-Studio-for-FastLED\outputs\tutorial-narration\2026-07-30-chatterbox-elements\audio\t1-e03.wav`
  (7.28 s)
- Narration:
  `C:\dev\Design-Studio-for-FastLED\outputs\tutorial-narration\2026-07-30-chatterbox-elements\audio\t1-e04.wav`
  (6.64 s)

The narration totals 24.56 seconds. Both cards are already 1920 × 1080,
30 fps, and 7.00 seconds long.

## Recommended capture workflow

Use **OBS Studio for capture and AutoHotkey v2 for repeatable pointer motion**.
OBS is still the simplest reliable way to capture a real visible Windows
cursor. AutoHotkey makes practice runs reproducible and gives smooth,
time-controlled pointer movement and drags. Browser-only automation is less
suitable because its synthetic pointer is not reliably visible in the captured
video.

Do the first rehearsal manually to learn the targets. If the movements are
stable, encode the exact screen coordinates and cue times in AutoHotkey for the
recorded takes. Coordinates must only be measured after Chrome is maximized and
the app layout is locked.

## Capture setup

1. Use a 1920 × 1080 monitor at 100% Windows display scaling.
2. Open `http://127.0.0.1:5173/` in Chrome.
3. **Maximize Chrome with the Windows maximize button and keep it maximized for
   the entire take.** Do not restore, resize, switch windows, or use F11 during
   the recording.
4. Set Chrome page zoom to 100%.
5. Hide the bookmarks bar and downloads shelf. Enable Focus Assist and
   auto-hide the Windows taskbar.
6. Use a clean temporary Chrome profile where practical. Never erase the
   normal profile or the repository's saved Projects/My Patterns data.
7. If helper-backed project sync repopulates a clean profile, create a new
   blank project through the UI. The visual starting state must be the empty
   welcome canvas with **Start with Juggle**, zero graph nodes, both side panels
   open, dark theme, Standard preview, All library scope, evaluation running,
   and microphone off.
8. In OBS, use a native 1920 × 1080 Display Capture source with **Capture
   Cursor** enabled. Do not scale or stretch the source.
9. OBS video settings: base/output 1920 × 1080, 30 fps, Rec.709, H.264 High
   profile, CQP/CRF about 18, keyframe interval 2 seconds.
10. Record to MKV for crash safety, then use OBS **Remux Recordings** to produce
    the required MP4.
11. Route the narration to the operator's headphones as a guide, but do not
    capture it in the app-footage master. The original WAV files remain the
    editorial audio source.
12. Use a clearly visible cursor with a subtle cyan or yellow halo. A click
    pulse is welcome, but it must not obscure labels or leave persistent marks.

## Locked app actions

1. Start on the empty welcome canvas.
2. Click **Start with Juggle**.
3. Let the starter fit itself on screen.
4. Move to the Comment node and visibly follow its three-line challenge.
5. Change Juggle **Count** from 4 to **5**.
6. Raise Juggle **Speed** from 0.50 to approximately **0.78**.
7. Move to the LED Preview long enough to show the immediate change.
8. Open **Effects** in the Node Library.
9. Drag **Trails** onto the existing Juggle → Matrix Output blue Frame wire.
10. Drag **Transform** onto the new Trails → Matrix Output blue Frame wire so
    the final signal order is:
    `Juggle → Trails → Transform → Matrix Output`.
11. During the closing narration, trace that chain from left to right and
    finish on the animated LED Preview.

Do not pan, zoom, open unrelated menus, change any other control, or move nodes
by hand.

## 32-second app-footage cue sheet

Times below are relative to the start of the screen recording. Add 7 seconds to
obtain the assembled tutorial time.

| App time | Final time | Audio/action cue |
| ---: | ---: | --- |
| 00:00.00–00:00.80 | 00:07.00–00:07.80 | Hold the empty welcome canvas. Cursor starts in neutral canvas space, then begins a smooth move toward **Start with Juggle**. |
| 00:00.80–00:03.08 | 00:07.80–00:10.08 | Play `t1-e01.wav`. Click **Start with Juggle** at about 00:02.65, on the spoken word “Juggle.” |
| 00:03.08–00:03.75 | 00:10.08–00:10.75 | Let the starter finish its fit-view animation; glide toward the Comment node. |
| 00:03.75–00:06.25 | 00:10.75–00:13.25 | Start `t1-e02.wav`. Follow the Comment text with the cursor while “The Comment node contains a short challenge…” is spoken. Do not click into the textbox. |
| 00:06.25–00:08.55 | 00:13.25–00:15.55 | Use the natural sentence pause to move to Juggle. Drag **Count** one step from 4 to 5, releasing near 00:08.20. |
| 00:08.55–00:10.20 | 00:15.55–00:17.20 | Smoothly drag **Speed** from 0.50 to about 0.78, releasing near 00:09.65. |
| 00:10.20–00:12.11 | 00:17.20–00:19.11 | Move to the LED Preview as “updates immediately” is spoken. Hold long enough to show the faster five-dot result. |
| 00:12.11–00:12.80 | 00:19.11–00:19.80 | Glide back to the Node Library; no static pause. |
| 00:12.80–00:13.75 | 00:19.80–00:20.75 | Start `t1-e03.wav`. Click **Effects** as “open Effects” is spoken. |
| 00:13.75–00:16.65 | 00:20.75–00:23.65 | Move to **Trails**, pause briefly so its label is readable, then drag it smoothly to the center of the Juggle → Matrix Output blue wire. Release by about 00:16.45 and show the splice settling. |
| 00:16.65–00:19.90 | 00:23.65–00:26.90 | On “Then splice Transform…,” move to **Transform**, pause briefly over its label, and drag it onto the Trails → Matrix Output blue wire. Release by about 00:19.55. |
| 00:19.90–00:20.75 | 00:26.90–00:27.75 | Let the final graph settle and move back toward Juggle. |
| 00:20.75–00:22.60 | 00:27.75–00:29.60 | Start `t1-e04.wav`. Hover Juggle as “Juggle creates the pixels” is spoken. |
| 00:22.60–00:24.60 | 00:29.60–00:31.60 | Trace Trails and Transform as “the effects modify them” is spoken. |
| 00:24.60–00:27.39 | 00:31.60–00:34.39 | Trace to Matrix Output, then glide to the LED Preview as its role is explained. |
| 00:27.39–00:32.00 | 00:34.39–00:39.00 | Keep the final animated preview visible. Park the cursor in an unobtrusive dark area beside the matrix; do not wiggle it. The animation supplies the motion. |

## Pointer-performance rules

- Never teleport the cursor.
- Normal moves should last 0.45–0.80 seconds with ease-in/ease-out.
- Pause 0.15–0.25 seconds over a target before clicking or beginning a drag.
- Use a 0.65–1.00 second curved drag path for node splices.
- Release near the centre of the intended wire, not on a port or node.
- After each click or drop, allow 0.25–0.45 seconds for the visible response.
- Do not let an unmotivated idle pause exceed about 0.8 seconds.
- The final preview hold is intentional; the app remains visibly animated.
- Keep the cursor away from narration-relevant text and the centre of the LED
  matrix.

## Practice and acceptance plan

1. **Layout rehearsal:** no recording and no narration. Confirm the maximized
   layout exposes the Comment, Juggle controls, blue wire, Matrix Output,
   Effects cards, and LED Preview without panning or zooming.
2. **Narrated rehearsal:** play the four WAV files at the cue-sheet offsets.
   Practise all mouse moves and both wire splices. Adjust only movement start
   times, not the locked action order.
3. **Scratch capture:** record one disposable take and inspect it at 100% size.
   Confirm the cursor is visible, no controls are obscured, both drops splice
   correctly, and the final graph order is correct.
4. **Final takes:** reset to the same empty welcome state and capture at least
   two clean takes. Keep the better one.
5. **Technical QA:** verify 1920 × 1080, 30 fps, H.264, no dropped/duplicated
   frames, no notifications/taskbar/OBS exposure, no accidental browser resize,
   and no captured guide audio.
6. **Editorial QA:** verify the body is approximately 32.00 seconds and aligns
   with the cue sheet. Do not assemble the cards or narration until the screen
   recording is approved.

## Copy/paste execution prompt

```text
Create only the screen recording for Tutorial 01, “Build your first pattern
with Juggle,” using the plan in:

C:\dev\Design-Studio-for-FastLED\videos\tutorial-01-screen-recording-plan.md

Do not record any other tutorial and do not edit application source code.

Use the live app at http://127.0.0.1:5173/. Start from the empty, just-installed
welcome state with zero graph nodes and the “Start with Juggle” button visible.
Preserve all existing saved projects and patterns; use a clean temporary Chrome
profile or create a new blank project through the UI instead of deleting user
data.

Chrome must be maximized with the Windows maximize button before any rehearsal
or take, and it must remain maximized for the entire recording. Use 100% Windows
display scaling and 100% Chrome zoom. Do not resize or restore Chrome, switch
windows, or use F11 during a take.

Use OBS Studio at 1920x1080, 30 fps, with a visible highlighted cursor. Prefer a
native Display Capture at 1:1 scale with Capture Cursor enabled. Record safely
to MKV and remux the selected take to H.264 MP4. The final app-footage file must
be:

tutorial-01-juggle-screen-1920x1080.mp4

Target a 32-second app capture. Use the four narration WAV files as a private
headphone timing guide at exactly these app-footage offsets:

- 00:00.80  t1-e01.wav
- 00:03.75  t1-e02.wav
- 00:12.80  t1-e03.wav
- 00:20.75  t1-e04.wav

Do not capture the guide narration in the app-footage master. Do not include or
assemble the existing 7-second title/end cards yet.

Perform these visible actions smoothly and in narration order:

1. Hold the empty welcome canvas briefly, then click Start with Juggle on the
   spoken word “Juggle.”
2. Follow the Comment node’s challenge with the cursor without editing it.
3. Set Juggle Count from 4 to 5.
4. Raise Juggle Speed from 0.50 to about 0.78.
5. Move to the LED Preview to show the immediate change.
6. Open Effects.
7. Drag Trails onto the Juggle → Matrix Output blue Frame wire.
8. Drag Transform onto the Trails → Matrix Output blue Frame wire.
9. Trace Juggle → Trails → Transform → Matrix Output while the last narration
   clip explains the flow.
10. Finish with the animated LED Preview visible until 00:32.00.

Use eased cursor moves rather than jumps. Pause briefly over each target so the
label is readable, use smooth curved drags, and keep unmotivated pauses below
about 0.8 seconds. The final preview hold is intentional because the animation
continues moving.

Complete a layout rehearsal, a narrated rehearsal, and one scratch capture
before recording at least two final takes. Reject any take with a failed splice,
hidden cursor, long dead pause, notification, taskbar, OBS exposure, accidental
Chrome resize, dropped frames, or timing drift. Verify the selected MP4 is
1920x1080 at 30 fps. Stop after producing the Tutorial 01 screen-recording
candidate for approval.
```
