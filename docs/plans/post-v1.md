# Deferred until after v1

Moved out of the [root todo](../../todo.md) on 2026-11-12. Nothing here is
needed to release v1.

Scope set item by item on 2026-10-21. Items dropped then are recorded in
their design notes: free drawing, XY Pad, Launch Pad and TFT video in
[auxiliary displays](../design/auxiliary-displays.md#deferred-dropped-and-why);
per-input modulation from song analysis in
[collection-driven performance](../design/collection-driven-performance.md);
colour profile in
[pattern node expansion](pattern-node-expansion.md#phase-11--output-layout-and-media-follow-ons);
and an Upload information shelf in
[workspace shelves](workspace-shelves.md#order).

- [ ] **D-02 · Large display panels.** Parallel-RGB LCD panels and HDMI output
  as display targets. Each is a different runtime class, with new board
  profiles, a display driver and its own LVGL memory budget
  ([auxiliary displays](../design/auxiliary-displays.md#deferred-dropped-and-why)).
- [ ] **D-03 · Linux backend and show-side Art-Net.** A Raspberry Pi/Linux
  code-generation backend beside the C++ firmware path. Art-Net in the show and
  SD-player generators is an open question, because a show already owns its
  LEDs: take the LEDs over while packets arrive, or act only as remote control.
  NTP in those generators shipped with D-03.
- [ ] **User font import for LED text (M).** Import a bitmap font (BDF, or a
  pasted glyph sheet) as a `BitmapFont` saved with the project, validated
  before any glyph byte reaches generated C++. Follows the built-in Font
  select that landed on 2026-11-11. Proportional widths and kerning are a separate
  decision: every layout helper assumes a fixed advance today.
- [ ] **More typefaces on custom screens (M).** LVGL screens use Montserrat
  only, at even sizes 8 to 48. Extra faces, built in or imported, need an
  `lv_font_conv` step in the build helper and a flash budget per face and
  size.
- [ ] **TrueType text on LED matrices (L).** FastLED 3.10.9 carries
  `fl::TrueType` (stb_truetype). Not planned: the preview would need the
  same rasteriser in TypeScript, and the flash and RAM cost is unmeasured.
  Revisit only if large panels make the bitmap fonts look coarse.

- [ ] **Node review: Category: Grow field nodes so pattern/field twins are not subsets
  (Low, M).** Noise has 9 algorithms vs Field Noise's fBm only; Game of Life
  has no Automaton equivalent; Reaction Diffusion/Turing Field, Custom
  Formula/Field Formula and the gradient patterns repeat likewise. Add
  `noiseType` to Field Noise and a Conway `life` type to Automaton so field
  chains are not stuck with the subset.
- [ ] **Node review: Clock Display: Split Stopwatch/Timer into a signal node (Low, M).**
  A transport lives inside a drawing node; anyone wanting only `done` still
  draws digits. Consider a small Timer signal node with Clock Display drawing
  a wired `seconds`.
- [ ] **Node review: Category: Default Ripple and String Particles to the LED output's
  network (Med, M).** Ripple needs the output's network preset, JSON and LEDs
  per edge, and String Particles needs the ring LED count, all copied by hand
  with nothing keeping them in sync. Default both to "match LED output" read
  from the root graph's MatrixOutput, with the current fields as an override.
  The Ripple default `ledsPerEdge: 14` rarely matches a real build and the
  Help example uses 4. For String Particles, a ring form gives the ring track
  and LED count and a strip form gives row. Open questions before building
  it: which output to match when a board drives several (the multi-board
  partition model feeds consumers the active board's partition), what the
  preview does inside a group or pattern where no LED output is reachable,
  and how a "match" value is saved so a later output change follows it.
  Evidence `src/state/nodeLibrary.ts:2244`, `:2261`.
