# On-glass widget labels

Status: **complete** in the browser, landed 2026-09-17. The LVGL half is
asserted line by line but has **not been on glass** — see the bench note.
Target: Hardware, ahead of v1.0.0.

## The gap

A readout on a screen design had no way of saying what it was reading. Every
widget carries a Label, but the label named it on the canvas, in the inspector
and on the graph socket it mints — never on the panel. So a screen with a
number on it showed a number, and the author had to place a separate Text
widget beside every readout to caption it.

**Show Label** draws it. It is a checkbox on every widget, because the
question is "does this widget say its own name", which is true of all of them,
so it sits beside Label itself rather than being restated in each type's
property list.

## The label is drawn once

The governing rule, and the one worth keeping:

> A widget's label is drawn **once**. Off, it is the widget's own content.
> On, it moves out to a caption and the body falls back to nothing.

`displayWidgetShowsLabel` / `displayWidgetOnScreenCaption` /
`displayWidgetBodyFallback` (`displayRegistry.ts`) are the two halves of that
one rule, and nothing else may decide where a label goes.

The rule is what keeps the feature from drawing the same word twice, which is
what a reader takes for a fault. It also does something useful for a wired
Text widget: with Show Label on, its body no longer falls back to the label, so
it reads as the value it is being told rather than repeating its own caption
while it waits for one.

An earlier attempt reached the same place by special-casing each type — a Text
with no other string, a Button whose face already says it, an icon-only Button
that has no words at all. That table was longer, it needed a new row whenever
a widget type learned a second string, and it still had a hole: an icon Button
whose asset had not been baked fell back to drawing its label *and* drew the
caption. Moving the label instead of suppressing the caption removed the table
and the hole together.

## Off by default

The caption is opt-in. Missing means no caption.

This is not the usual "new flag defaults off" caution. The caption is drawn
**inside** the widget's own box (below), so on-by-default would have re-laid-out
every design ever saved and every shipped template, and put the word "Slider"
on the glass the moment one was placed — a freshly placed widget's label is its
type name. The templates' transport rows would have grown text over their
icons. On the Hardware line nothing forces compatibility, so this was a choice
rather than an obligation; it was made because the alternative changes work
people have already done, for a feature none of it asked for.

## The strip comes out of the widget

The caption takes its strip out of the widget's authored box and the widget is
drawn in what is left:

```text
 authored bounds            Show Label off        Show Label on
 ┌──────────────────┐      ┌──────────────────┐  ┌──────────────────┐
 │                  │      │                  │  │      Petals      │  caption
 │                  │  ->  │  ══════o═══════  │  │                  │  gap
 └──────────────────┘      │                  │  │  ══════o═══════  │  body
                           └──────────────────┘  └──────────────────┘
```

It does not float over the widget. A name painted across a slider's track
cannot be read, and the box is the only space the author gave us.

That makes the strip a contract between two renderers that must agree exactly,
so it is resolved once. `displayWidgetCaptionLayout(widget, fontSize, height)`
returns the caption's own font size, its row height, the gap and the resulting
offset, in pixels:

- the **DOM preview** lays the caption out in those pixels rather than in ems;
- the **LVGL emitter** offsets its object by the same `offset` and shortens it
  by the same amount.

Everything that means "how big is the widget itself" reads
`displayWidgetContentBounds` rather than the authored bounds — the emitted
object's position and size, and a baked icon's height in
`customDisplayResources.ts` — or the caption's space is charged to nobody and
an icon-only control's glyph arrives taller than the control drawing it.

The caption also pins a font size of its own, smaller than the widget's, or a
screen of nothing but captioned sliders paints text in a face `lv_conf.h` never
enabled.

A box too short to hold both drops the caption in **both** renderers, and
`displayLayoutIssues` says so — the author ticked a box and the thing they
asked for did not appear, which is worth a sentence.

### Two traps this hit

**The preview stretched the body.** The first DOM implementation was a column
flexbox with `flex: 1 1 auto` on the body. A slider's track is a fixed 8px
element that an uncaptioned widget centres via `.widget`'s own
`place-items: center`; stretching it instead drew the track as tall as whatever
row the caption left, so ticking Show Label made the control visibly *fatter*
rather than shorter. The wrapper is a grid with `place-self: center` on the
body for that reason: it reproduces the box the uncaptioned widget already got,
only shorter.

**The shrunken touch target is deliberately not reported.** A captioned Slider
at its default 48px is left 32px, under the registry's 48px finger target, and
a check for that fired on the most ordinary use of the feature. It was removed
rather than kept, because the emitter has never called
`lv_obj_set_ext_click_area` at all — the DOM preview's grown hit region is
already fiction on device. Reporting the shrink while never reporting its
absence explains nothing. Restore the target in the emitter first, then report
its loss.

## Bench note

The LVGL half is covered by `customDisplayLvglCpp.test.ts`, which asserts the
caption's position and size and that the widget object is offset and shortened
by the same layout the preview uses. That is a text-level check of generated
C++. It has not been compiled or seen on a panel, and the fixed-layout
displays beside it are unaffected, so a captioned screen is the only thing at
risk. A compile and one photograph would close it.

## Checklist

- [x] `showLabel` normalized widget-wide, missing means off.
- [x] Draw-once rule as two derived helpers; no per-type table.
- [x] `displayWidgetCaptionLayout` / `displayWidgetContentBounds` as the one
      geometry contract, read by the preview, the emitter and asset baking.
- [x] Caption pins its own font size in `customDisplayFontSizes`.
- [x] A box too short for both reports a layout issue.
- [x] Show Label checkbox in the designer's inspector.
- [ ] Bench: a captioned screen compiled and photographed on a panel.
