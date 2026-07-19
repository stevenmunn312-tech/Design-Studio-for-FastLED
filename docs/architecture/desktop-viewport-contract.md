# Desktop Viewport Contract

Design Studio for FastLED is a desktop-first app. The supported viewport contract for the
public beta is:

- **Target viewport:** `1440 × 900` or larger
- **Supported minimum viewport:** `1280 × 720`
- **Below the minimum:** best-effort only; the app should remain usable, but the
  workflow may require collapsing panels or switching to Stage mode

## Graceful Degradation Rules

When the viewport is narrower or shorter than the target size, the app should
degrade in this order instead of letting controls become unreachable:

1. The top bar keeps button labels intact and scrolls horizontally inside the
   nav rail instead of crushing or clipping buttons.
2. File/View menus cap their height to the visible viewport and scroll
   internally when the window is short.
3. The status bar keeps the live message visible first; the hardware/info chips
   move into a horizontally scrollable rail instead of spilling off-screen.
4. Sidebar, Inspector, and Preview contents remain vertically scrollable within
   their own panels.
5. Users can collapse the node library and preview panel independently, and
   **Stage mode** remains the fallback for a preview-first layout.

## What Must Stay Reachable

At the supported minimum (`1280 × 720`), the following must remain reachable
without browser zoom hacks:

- File, Start, Perform, Stage, preview-style, and Mic controls
- The main LED preview and its transport/actions
- Node bodies and inspector/upload controls through panel scrolling
- Dialog actions and content through dialog-body scrolling/focus trapping
- Status messages plus board/port/chip/size chips through the status rails

## Verification Notes

This contract is backed by the current implementation:

- `MenuBar.module.css`: the nav rail already scrolls horizontally; menus now
  cap their height and scroll vertically.
- `StatusBar.module.css`: the right-hand chip rail now scrolls horizontally
  while the left status message keeps priority.
- `App.tsx` / `App.module.css`: hidden panels are inert, panel interiors scroll,
  and Stage mode can hand the full viewport to the preview.

If a future UI change violates one of these rules, update both the layout code
and this contract in the same change.
