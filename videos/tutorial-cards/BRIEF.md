---
workflow: motion-graphics
flow: automation
storyboard: no
message: "Every tutorial card should feel like a native extension of Design Studio for FastLED."
destination: youtube
aspect: 1920x1080
language: en
audience: beginner Design Studio for FastLED users
length: 4s per card
angle: branded tutorial title-and-next-card system
style_preset: fastled-lighting-console
---

## Intent

Create one reusable animated identity system for an eleven-part onboarding
series. Deliver an opening card and an end card for every tutorial. The visual
language should match the application: a precise dark lighting console with
large readable typography, restrained node-graph geometry, LED pixels, and a
cyan-to-purple-to-magenta signal path. Motion should feel confident, technical,
and approachable.

## Assets

- `../../public/brand-concepts/concept-1-pixel.png` — official pixel brand
  lockup; use without redrawing or restyling it.
- `../../docs/images/readme/design-studio-overview.png` — visual reference for
  the application’s layout, palette, panel treatment, and signal-path language.
- `../../src/themes/tokens.css` — authoritative application colors and font
  families.
- `../../public/fonts/Audiowide-Regular.ttf` — display typeface.
- `../../index.html` — the app’s official Google Fonts declarations for Inter
  and JetBrains Mono.

## Customizations

- Opening cards identify the series, tutorial number, tutorial title, and one
  supporting line.
- End cards announce the next tutorial and show progress across eleven LED
  squares.
- Tutorial-specific node-path illustrations change while the layout, logo, and
  title positions remain consistent.
- Tutorial 11 ends with `SERIES COMPLETE` and `YOU’RE READY TO BUILD`.
- Export a 1920×1080 MP4 for every opening and end card.

## Notes

- No narration, music, or sound effects.
- Do not use generic cyberpunk HUD styling, glitch effects, scan lines, dense
  circuitry, metallic textures, excessive haze, or full-screen linear
  gradients.
- Keep all important content inside a ten-percent title-safe margin.
- Avoid details thinner than two pixels and verify readability at reduced size.
- Use the exact application palette: `#0D0F12`, `#161A1F`, `#1F242B`,
  `#E0E0E0`, `#A0A0A0`, `#33D6FF`, `#8533FF`, `#D633FF`, `#FF3385`, and
  `#85FF33`.
