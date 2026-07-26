# Node review — improvement findings

Running list from the category-by-category node review (nodeLibrary.ts /
graphEvaluator.ts / cppGenerator.ts). Each category is reviewed for: whether
0–1 normalization would make sense per field, whether the `clamp inputs`
checkbox applies, whether a slider vs. plain text box is the right control,
missing features, and input sanitization gaps. Updated as each category is
reviewed.

## Input (MicInput, ButtonInput, PotInput, EncoderInput, MidiInput)

None of these five nodes have any wired *inputs* (`inputs: []`), so the
`clamp inputs` checkbox never applies to this category at all — it only
appears on nodes with a wired float input.

### MicInput

- `gain`: slider 0–20 (`PROPERTY_META_OVERRIDES`). Good — a multiplier, so
  0–1 normalization would be wrong. No change needed.
- `i2sWs` / `i2sSck` / `i2sSd`: plain unbounded number box (no `PROPERTY_META`
  entry).
- `channel`: select (Left/Right). Fine as-is.
- `serialDebug`: checkbox. Fine as-is, but see finding below.

**Finding — I2S pin fields are unbounded in the UI but silently clamped in
codegen.** `cppGenerator.ts`'s `audioEngineForGraph()` rounds and clamps
`i2sWs/i2sSck/i2sSd` to `[0, 48]` before emitting firmware
(`ic(p.i2sWs, 39, 0, 48)`), but the node's UI has no matching bounds — it
falls through to the generic `type="number" step="any"` fallback in
`StudioNode.tsx`, so a user can type `-5`, `2.7`, or `9999`.
**Why:** the number displayed on the node and the number actually baked into
firmware can silently diverge (type 999, get 48, with zero on-screen
indication). What you see should be what ships.
**Fix:** give these three an integer-stepped slider or bounded number control
(0–48 to match the existing codegen clamp), so the UI and firmware agree.

**Finding — `serialDebug` has no tooltip.** It's a firmware-only,
preview-invisible toggle (prints processor/conditioner stats to serial
~10×/sec) — exactly the kind of "invisible in preview" case
`PROPERTY_DESCRIPTIONS` exists for (compare `powerLimit`'s "Preview-only — no
visible effect here"). Currently undocumented.
**Fix:** add a matching one-line description.

### ButtonInput / PotInput / EncoderInput

- `pin` (Button/Pot) / `pinA`, `pinB`, `pinSW` (Encoder): plain unbounded
  number box.
- `pullup`: checkbox. Works, but see finding below.

**Finding — pin fields aren't sanitized anywhere, not even in codegen.**
Unlike MicInput's I2S pins, `ButtonInput`/`PotInput`/`EncoderInput` pins go
straight from the property into generated C++ with a bare
`Number(p.pin ?? 0)` — no rounding, no clamping, no `Number.isFinite` guard
(`cppGenerator.ts:982,989,995`). A fractional or out-of-range pin sails into
`pinMode()`/`analogRead()`/`digitalRead()` calls unchecked.
**Why:** same category of bug as MicInput's I2S pins, but worse — there
isn't even a silent clamp to fall back on. An invalid pin only surfaces as a
confusing runtime failure on real hardware, long after upload.
**Fix:** route all hardware-pin properties (Mic's I2S pins, Button/Pot/
Encoder's pins, and MatrixOutput's `dataPin`/`clockPin`, SDCard's pins)
through one shared `sanitizePin()`-style helper used consistently by codegen.

**Finding — `validateGraph`'s GPIO check only catches duplicates, never
invalid ranges.** `collectPinUses()`/the conflict pass in `validateGraph.ts`
flags two roles sharing a GPIO number, but never flags a pin that's simply
out of range (negative, >48) or non-integer.
**Why:** duplicate-pin detection is good, but a nonsensical single pin
currently passes validation cleanly and only fails at compile/upload time
(or worse, at runtime on-device).
**Fix:** extend the existing pin-conflict pass to also emit a warning for
any collected pin outside `[0, 48]` or non-integer.

**Finding (feature, lower priority) — no board-aware pin picker.** Every pin
field is free-entry with zero board knowledge: no distinction between
input-only pins, ADC-incapable pins, WiFi-conflicting ADC2 pins on
`PotInput`, or SPI-flash-reserved strapping pins (6–11 on most ESP32 parts).
`uploadStore.ts`'s `Board` type currently has no pin-capability metadata to
draw from.
**Why:** this is the actual root cause behind the pin-sanitization findings
above — the real fix is a shared, board-aware pin-picker component (dropdown
of known-good pins per selected board, falling back to free numeric entry
for boards without a table), not just clamping numbers. Bigger lift (needs a
per-`Board` GPIO capability table first) but worth prioritizing — it
prevents a whole class of "compiles fine, doesn't work on the actual board"
bugs.

**Finding — `pullup`'s wiring implication isn't explained anywhere.** The
checkbox toggles `INPUT_PULLUP` vs `INPUT`, but nothing tells the user that
`pullup: false` needs an external pull-down resistor or risks a floating
pin. `PROPERTY_DESCRIPTIONS` already has a precedent for this kind of
hardware caveat (see `audioOutput`'s tooltip).
**Fix:** add a one-line `PROPERTY_DESCRIPTIONS.pullup` tooltip.

### MidiInput

- `note` / `cc`: plain unbounded number box.

**Finding — `note`/`cc` are unbounded and shown as bare numbers instead of
MIDI-conventional values.** MIDI note/CC numbers are conventionally 0–127;
nothing clamps or validates them, and there's no note-name readout (e.g.
"60 → C4"), so a non-musician has to know MIDI numbering by heart to pick a
useful key.
**Why:** typing `200` silently produces a node that will never receive a
value — dead, with no indication why.
**Fix:** add `note`/`cc` to `PROPERTY_META` as integer sliders `0–127`, and
— as a small usability win — show the conventional note name next to the raw
number in `MidiInputBody.tsx` (it already renders a readout row, so this is
a cheap addition).

### Cross-cutting (feature, minor)

**Finding — EncoderInput's push-button only reports continuous state, not
an edge.** The node exposes `pressed` as a live level, matching real
hardware, which is correct — but there's no convenient "reset position to 0
on press" behavior (a common encoder UX pattern), and getting a clean
single-click pulse out of the continuous `pressed` signal today requires
manually wiring it through `Trigger`'s `oneShot` mode.
**Why:** not a bug, just friction — worth considering a `resetOnPress`
boolean property (firmware: zero the running count when `pinSW` goes low)
since it's a one-line change in both the evaluator's encoder state and the
generated quadrature-decode block.

## Audio (FFTAnalyzer, BeatDetect, PercussionDetect, AudioFeatures, AudioHue)

### FFTAnalyzer

- `bands`: slider 8–32 (`PROPERTY_META_OVERRIDES`), default 24.
- `gain`: slider 0.25–4. Correctly not 0–1 (needs to boost, not just attenuate).
- `smoothing`: slider 0–0.95. Fine.
- `tilt`: slider 0–1. Fine.

**Finding — `bands` is a dead control.** It has a slider, a default (24),
and renders in the node body, but it is never read anywhere in
`graphEvaluator.ts`'s `FFTAnalyzer` case or `cppGenerator.ts`'s `FFTAnalyzer`
case (confirmed by grep — the only `p.bands`/`props.bands` reads in the
whole codebase belong to `SpectrumVisualizer`, a separate pattern node).
FFTAnalyzer only ever emits 3 fixed bands (bass/mids/treble) drawn from the
shared audio store; moving this slider does nothing in preview or firmware.
**Why:** a control that visibly exists but has zero effect is worse than no
control — it invites the user to "tune" something that can't be tuned, and
wastes time debugging "why doesn't changing bands do anything."
**Fix:** either (a) remove the property entirely, or (b) actually use it —
the audio store already keeps a 32-bin `spectrum`/`detectorSpectrum`, and
`SpectrumVisualizer` already has a `resampleSpectrumBins()` helper that could
give FFTAnalyzer a genuine variable-resolution band output (a real feature
upgrade, not just a bug fix — see feature note below).

### BeatDetect

- `threshold` / `attack` / `decay`: sliders 0–1, denormalized internally via
  `denormalizeBeatParam`. Good pattern — keeps the UI simple while the
  underlying units differ.

**Finding (feature) — rich internal diagnostics are computed but never
exposed.** The evaluator already computes `flux`, `onset`, `contrast`,
`threshold` (effective), and `cooldownMs` per frame (`graphEvaluator.ts`
`BeatDetect` case) but only `beat`/`bpm` are declared as connectable outputs
in `nodeLibrary.ts`. These are exactly the numbers a user needs to tell
*why* a beat isn't firing when tuning threshold/attack/decay.
**Why:** beat detection is inherently a "why isn't this triggering" tuning
problem, and right now the only feedback is a binary beat pulse — there's no
way to see how close `flux` is to `threshold` without instrumenting the code.
**Fix:** consider surfacing at least `flux`/`onset` as optional outputs (or a
small on-node readout like `FFTAnalyzerBody`'s live status pill) so tuning
is visual instead of trial-and-error.

### PercussionDetect / AudioFeatures

- `sensitivity`, `decay`, `separation` (Percussion); `sensitivity`, `gate`,
  `smoothing` (Features): all sliders 0–1 (0–0.95 for smoothing), all
  correctly consumed and clamped in both evaluator and codegen. No control
  issues found.

**Finding — `gate`'s name doesn't communicate what it does.** Unlike most
sliders in this app, `gate`'s effect (a silence-detection threshold — how
much energy is required before `silence` flips false) isn't inferable from
the label alone the way `decay` or `sensitivity` are.
**Why:** the project's own convention is that most sliders are
self-explanatory from label + range + live preview, but audio nodes are the
one category where there's no *visual* live preview of the effect — you
have to actually make noise and watch a downstream pattern react. That makes
a cryptic name more costly here than on a visual node.
**Fix (safe, no migration needed):** add a `PROPERTY_LABELS.AudioFeatures.gate`
display override (e.g. "Silence Gate") and a `PROPERTY_DESCRIPTIONS` tooltip
— both are display-only and don't touch the persisted property key, so this
doesn't trip the public-beta save-compatibility rule.

**Finding — audio disconnect causes an abrupt snap to zero instead of a
decay.** `BeatDetect`/`PercussionDetect`/`AudioFeatures` all call
`*.delete(key)` on their state map the instant `audioConnected && audio.active`
goes false, so `kick`/`snare`/`hihat`/`vocals`/`energy` jump straight to 0
next frame rather than following their own `decay`/`smoothing` curve down.
**Why:** a momentary mic hiccup (tab backgrounded, permission re-prompt,
brief device glitch) will read as a hard visual cut rather than a graceful
fade, which is more jarring than necessary for something that's meant to be
transient.
**Fix:** let the existing decay/smoothing curve carry the values toward 0
over a few frames instead of deleting state immediately; only clear it after
enough consecutive frames of no audio to avoid state ever growing unbounded.

### AudioHue

- `bass` / `mids` / `treble` (wired float inputs, no properties):
  `defaultProperties: {}`.

**Finding — no default properties means no fallback UI at all.** Almost
every other node with wired float inputs also carries a matching default
property so an unwired node still shows an editable slider (e.g. `Noise`'s
`speed`/`scale`). `AudioHue` is the exception — its three inputs have zero
entries in `defaultProperties`, so nothing renders for them in the node body
unless all three are wired, and the node can't be tuned/previewed in
isolation.
**Why:** breaks the otherwise-consistent "every node is explorable without
wiring anything first" pattern the rest of the library follows.
**Fix:** add `bass: 0.5, mids: 0.5, treble: 0.5` (matching the evaluator's
existing hardcoded fallback) to `defaultProperties` so the sliders appear.

**Finding (feature, minor) — the bass/mids/treble weighting (0.5/0.3/0.2) is
fixed and undocumented.** There's no way to adjust the mix ratio, and
nothing in the UI explains where the resulting hue baseline comes from.
**Why:** a fixed, invisible formula makes the node feel like a black box;
even a short tooltip stating "hue = 0.5·bass + 0.3·mids + 0.2·treble, scaled
to 0–360°" would remove the guesswork.
**Fix:** at minimum add a `PROPERTY_DESCRIPTIONS` note; as a larger feature,
consider exposing the three weights as properties.

## Signal (TimeNode, Interval, Counter, Random, Envelope, Sin, Cos, Wave, ComplexWave, BeatSin, Clock)

### Sin / Cos

- `x` (wired float input, no default property): `defaultProperties: {}`.

**Finding — Sin/Cos are inert (constant output) unless explicitly wired,
unlike every other node in this category.** Both compute `sin(x·2π)` /
`cos(x·2π)` from a raw `x` input with no property fallback and, critically,
**no dependency on time at all**. Left unwired, `x` defaults to 0, so `Sin`
outputs a constant `0` forever and `Cos` outputs a constant `1` forever —
they never animate on their own. Every sibling node in this category (Wave,
BeatSin, Clock, Counter, Interval) self-oscillates or free-runs from `t`/
`millis()` with zero wiring required.
**Why it matters:** a user dragging a node literally named "Sin" onto the
canvas has every reason to expect an oscillating wave, matching the mental
model every other signal-source node in the library reinforces. Instead
they get a flat line and no clue why — the node looks broken. Verified
identical (dead) behavior in both `graphEvaluator.ts` and `cppGenerator.ts`,
so it's a consistent design gap, not a preview/firmware mismatch.
**Fix (safe, no behavior change):** add a short tooltip/description —
"Computes sin(x·2π) from the wired X value; it does not animate on its own.
Wire Time or Counter into X for continuous oscillation, or use the Wave
node for a ready-made oscillator." A behavior change (e.g. defaulting X to
`TimeNode.time`) is a bigger, riskier call since it would change what
existing graphs render — flagging as a design question rather than a
prescribed fix.

### Wave / ComplexWave

- Wave's `amplitude` (0–5), `frequency` (0–4), `phase` (0–1): all correctly
  bounded sliders, and (unlike Sin/Cos) genuinely self-oscillate from `t` —
  good default behavior. Also correctly gains the `clamp inputs` checkbox
  since all three wired float inputs match a `PROPERTY_META` slider.
- ComplexWave's `a`/`b`: no clamp checkbox (no generic slider meta for bare
  `a`/`b`) — appropriate, since these are meant to carry arbitrary upstream
  wave signals rather than a fixed range.
- `operation`/`waveform` selects: fine, both evaluator and codegen dispatch
  identically (`combineWaves`/`waveSample` are shared, unit-tested helpers).

No issues found beyond Sin/Cos's naming trap above.

### Random

- `min` / `max`: plain unbounded number box. Appropriate as-is — this is a
  general-purpose range utility, not a normalized 0–1 quantity, so a slider
  or 0–1 normalization would actively get in the way. No `clamp inputs`
  checkbox applies (Random has no wired inputs at all).

**Finding — firmware quantizes to 256 steps; preview is continuous.**
`cppGenerator.ts`'s `Random` case emits `random8() / 255.0f * (hi - lo)` —
only 256 discrete output values across the whole range — while the
evaluator uses `Math.random()` (full float precision). For a narrow 0–1
range this is barely visible, but for a wider range (e.g. `min: 0, max: 1000`)
firmware output will visibly step in ~4-unit increments where preview shows
smooth continuous values.
**Why it matters:** this is a genuine preview/firmware fidelity mismatch —
what you tune in the browser doesn't fully match what ships.
**Fix:** switch codegen to `random16()` (65,536 steps) for materially finer
resolution at negligible cost.

**Finding (feature) — no `seed` property, unlike every other randomized
node in the library.** `Noise`, `Particles`, `Fire`/`Fire2012`, `TwinkleFox`,
`Confetti`, `Juggle`, `FlowField`, `Starfield`, `Boids`, `GameOfLife`,
`ReactionDiffusion`, `FractalNoise`, and `GaborNoise` all share the same
`seed` convention (0 = free-running, any other value = fully reproducible
via a deterministic per-instance LCG). `Random` — arguably the most
fundamental "randomness" building block in the whole library — has no such
property.
**Why it matters:** it's the one place in the codebase where the established
"make randomness reproducible on demand" pattern is conspicuously absent,
and it's the node most likely to get composed into something a user wants
to reproduce exactly (e.g. `Random → SampleHold` step sequences, or a fixed
show recording).
**Fix:** add the standard `seed` property/slider and switch `Math.random()`/
`random8()` to the same seeded-LCG pattern already used elsewhere when
`seed > 0`.

### Counter / Interval / Envelope

- Counter's `rate` (0–5 slider) and Interval's `interval` (0.1–20 slider):
  correctly bounded, clamped consistently in evaluator (`Math.max(0.05, …)`
  for Interval) and codegen. No issues.
- Envelope's `decay` (0.05–5 slider): correctly bounded and clamped
  identically on both sides. No issues.

**Finding (feature, minor) — Envelope has no `attack` time, unlike its
pattern-node sibling BeatFlash.** Envelope jumps instantly to 1 on a rising
trigger edge, then decays linearly — by design, and documented as such —
but `BeatFlash` (the equivalent idea applied directly to a frame) exposes
both `attack` and `decay`. For symmetry and to let a wired envelope ease in
instead of snapping, consider an optional `attack` property mirroring
BeatFlash's.

### BeatSin / Clock

- Clock's `bpm` (40–220), `beatsPerBar` (1–16), `subdivision` (1–8): all
  correctly bounded and consumed identically in evaluator and codegen
  (matching tap/sync EMA and edge semantics). No issues.

**Finding — BeatSin's `bpm` has no bounds at all, unlike Clock's.** Both
nodes represent the same underlying "beats per minute" concept, but `Clock`
thoughtfully bounds it to a realistic 40–220 range while `BeatSin.bpm` falls
through to the generic unbounded number box (no `PROPERTY_META` entry).
**Why it matters:** inconsistent treatment of the identical concept across
two sibling nodes in the same category — a user who's seen Clock's sensible
range has no reason to expect BeatSin's to be wide open.
**Fix:** add a `BeatSin` override matching (or close to) Clock's `bpm` range.
`low`/`high` are fine as plain numbers, same reasoning as `Random`'s
`min`/`max` — they define an arbitrary output range, not a normalized
quantity.

### TimeNode

- No properties — a pure source. Fine.

**Finding (very minor) — `dt` differs slightly between preview and
firmware.** Evaluator emits the exact `1/60` (0.01666...7); codegen emits
the literal `0.016f` (0.016 exactly), a ~4% discrepancy. In practice this is
low-impact: no built-in node currently consumes `dt` as a named input — it
only matters if a user's own graph wires it into a custom calculation.
Worth a one-line fix (emit `1.0f/60.0f` instead of the truncated literal)
but not worth prioritizing.

## Math (Math, Clamp, MapRange, Lerp, Ease, Abs, Mod, Compare, Not, Gate, Smooth, SampleHold, Switch, XYMapper, Trigger)

### Headline finding — most of this category can't be tuned without wiring something in first

**10 of 15 nodes are missing a default property for at least one primary
float input, so nothing renders in the node body until it's wired.** Unlike
the "control choice" question elsewhere in this review, the *control type*
these nodes use is actually correct: `value`/`a`/`b`/`x`/`m` are
arbitrary-range generic signals, so a plain number box (not a slider, not
0–1 normalization) is the right choice. The problem is narrower and more
mechanical — the property simply doesn't exist, so no row renders at all:

| Node | Missing default | Evaluator's existing hardcoded fallback |
|---|---|---|
| `Math` | `a`, `b` | mode-dependent identity (see caveat below) |
| `Clamp` | `value` | `0` |
| `MapRange` | `value` | `0` |
| `Lerp` | `a`, `b`, `t` | `0`, `1`, `0.5` |
| `Abs` | `x` | `0` |
| `Mod` | `x` | `0` |
| `Compare` | `a` | `0` |
| `Gate` | `value` | `0` |
| `Smooth` | `value` | `0` |
| `SampleHold` | `value` | `0` |
| `XYMapper` | `x`, `y` | `0`, `0` |

`Switch` is the one node in this category that already does this correctly
(`defaultProperties: { a: 0, b: 1 }`), which is exactly the pattern to copy
— it proves the fix is low-risk: the evaluator/codegen already hardcode an
identical fallback number whenever the property is absent, so adding the
matching `defaultProperties` entry is a pure UI-completeness fix with **no
behavior change** for every node above except `Math` (see below).
**Why it matters:** a math-utility node with nothing to look at and no way
to nudge a value pre-wiring is much harder to learn by playing with than the
rest of the library, which almost universally lets you explore a node in
isolation before connecting anything.
**Caveat — `Math` is the one exception requiring a decision, not a
mechanical copy-paste.** Its fallback for `a`/`b` is mode-dependent (`1` for
multiply/divide so an unwired chain doesn't collapse to zero, `0` otherwise)
— a static `defaultProperties` entry can't express "the identity element for
whatever `mathOp` is currently selected." Adding a flat `a: 0, b: 0` would
change today's unwired-multiply/divide output from `1` to `0`. Low risk in
practice (a bare unwired Math node is a degenerate case), but flagging as a
decision rather than a drop-in fix.

### A clean, self-contained quick win: `Ease.t`

**`Ease`'s input port is literally named `t`, and a generic `t` entry
already exists in `PROPERTY_META` as a bounded 0–1 slider** — it's simply
never used because `Ease`'s `defaultProperties` only sets `easeType`, not
`t`. Adding `t: 0` (or `0.5`) to `Ease`'s `defaultProperties` is enough, on
its own, to make **both** the slider **and** the `clamp inputs` checkbox
appear (since `hasClampableInputs` only requires a float input whose id
resolves to a slider meta — which `t` already does generically). No other
code change needed anywhere.

### MapRange — output range isn't wireable

**`inMin`/`inMax` are wired input ports, but `outMin`/`outMax` are
plain (non-wireable) properties.** There's no way to animate the output
range the way the input range already can be.
**Why it matters:** inconsistent capability on two conceptually symmetric
pairs of the same node — a user who successfully wires an animated `inMax`
has no reason to expect `outMax` can't be wired the same way.
**Fix (feature):** promote `outMin`/`outMax` to wired input ports (with
matching default properties), mirroring `inMin`/`inMax`.

### Everything else

- `Clamp.min`/`max`, `MapRange.inMin`/`inMax`/`outMin`/`outMax`,
  `Mod.m`, `Compare.b`, `Gate.fallback`, `Smooth.response`, `Switch.a`/`b`:
  all correctly bounded/typed where a slider is warranted (`response`) and
  correctly left as plain numbers where an arbitrary range is the point
  (`min`/`max`/`m`/`b`/`fallback`). No control-type issues found beyond the
  missing-default pattern above.
- `Not`, `Trigger`'s `trigger` input, `Gate`'s `gate` input, `SampleHold`'s
  `trigger` input: all bool-typed with no default property, which is fine —
  `false` is a universally sensible fallback for a boolean with nothing
  wired, unlike a float where the "right" default varies per node.
- `Trigger`'s `stableTime`/`holdTime`/`divideBy`/`delayTime`: correctly
  bounded sliders, correctly gated to the selected `triggerOp` via
  `isPropertyEnabled`, correctly mirrored between evaluator and codegen
  (millis()-based statics matching the evaluator's wall-clock state). No
  issues found.

## Color (HueCycle, HSVToRGB, RGBToHSV, CHSV, Temperature, HeatColor, BlendColors, GradientSampler, PaletteSampler, PaletteSweep, PaletteSelector, CustomPalette, Poline, PaletteBlend)

### BlendColors — the standout finding: preview and firmware genuinely disagree

**`a`/`b` (color inputs) have no default properties, and — unlike every
other missing-default case found so far — this one causes a real behavioral
mismatch, not just a missing slider.** The evaluator hardcodes tasteful
fallbacks when unwired (`a: {r:255,g:0,b:0}` red, `b: {r:0,g:0,b:255}`
blue), but `cppGenerator.ts`'s generic `colorExpr()` helper falls back to
`CRGB::Black` for *any* unwired color port with no node-specific override.
Sibling nodes `GradientFrame`/`GradientSampler` avoid this because they read
their own `rA/gA/bA`/`rB/gB/bB` properties directly instead of going through
`colorExpr()` — `BlendColors` is the one node in this category that doesn't.
**Why it matters:** an unwired `BlendColors` node shows a red→blue blend
live in the browser, but the generated firmware renders solid black
(black blended with black) — a real, visible preview/firmware divergence,
not just a cosmetic UI gap.
**Fix:** give `BlendColors` its own `rA/gA/bA`/`rB/gB/bB`-style default
properties (mirroring `GradientFrame`/`GradientSampler`) and read them
directly in the codegen case instead of falling through to `colorExpr()`'s
generic black default.

### RGBToHSV — missing default, but at least consistent

**`rgb` (color input) has no default property** (`defaultProperties: {}`),
so nothing renders until it's wired. Unlike `BlendColors`, this one doesn't
cause a preview/firmware mismatch — both evaluator and codegen consistently
fall back to black — so it's a pure UI-completeness gap, not a behavior bug.
**Fix:** add an `rgb`-equivalent hex/rgb fallback property so the node is
explorable without wiring.

### HSVToRGB.h has no bounds despite its own label promising one

**The port is labeled "H (0–360)" but has no `PROPERTY_META` entry**, so it
falls through to the plain unbounded number box. Compare `CHSV`'s `hue`
input, which correctly gets a bounded 0–255 slider from the generic table —
two "build a color from a hue" nodes, inconsistent unit *and* control
treatment (which is arguably fine, since 0–360° vs. 0–255 CHSV-byte are
legitimately different, FastLED-accurate conventions — but only one of the
two actually gets a slider matching its documented range).
**Fix:** add an `HSVToRGB` override for `h`: a 0–360 slider.

### GradientSampler.t — the same quick win as Ease.t last category

**`t` is missing from `defaultProperties` despite already being a ready-made
generic 0–1 slider** in `PROPERTY_META`, and inconsistent with sibling
`PaletteSampler`, which already sets `t: 0` correctly. Because
`hasClampableInputs` only checks the port's *metadata* (not whether a
property row currently renders), the `clamp inputs` checkbox already
silently applies to a slider that doesn't exist yet — adding `t: 0` to
`defaultProperties` makes the slider appear and finishes the feature that's
already half-wired.

### Poline — a real, already-documented limitation that's invisible in the UI

**Wired anchor colors (`colorA`/`colorB`/`colorC`) drive only the live
preview; the generated firmware always bakes the anchor *swatches* instead**
(`cppGenerator.ts`'s `Poline` case even comments this explicitly). This is a
deliberate, reasonable design choice — not a bug — but there's currently no
in-app indication of it, so a user who wires a dynamic color into an anchor
could reasonably be surprised when the uploaded firmware ignores it.
**Fix (feature, minor):** a small on-node badge/tooltip when any anchor is
wired, e.g. "wired anchors preview only — firmware uses the swatches below."

### Everything else

- `HueCycle` (`rate` 0–4, `s`/`v` 0–1), `Temperature` (`kelvin` 0–1),
  `HeatColor` (`heat` 0–1), `CHSV` (`hue`/`sat`/`val` 0–255 — intentionally
  the FastLED-native byte convention, correctly *not* normalized to 0–1),
  `PaletteSelector`, `PaletteSweep` (`rate` 0–4), `PaletteBlend`
  (`paletteA`/`paletteB`/`amount`, all with correct defaults): all correctly
  bounded/typed/consumed in both evaluator and codegen. No issues found.
- `CustomPalette` looks like it has the same "missing default" problem at
  first glance (`defaultProperties: {}`), but it isn't one — its editor body
  (`PaletteEditorBody.tsx`) always runs `props.colors`/`props.positions`
  through `normalizeCustomPalette()`, which gracefully falls back to
  `DEFAULT_CUSTOM_COLORS`/`DEFAULT_CUSTOM_POSITIONS` when both are absent —
  so the node shows a sensible default gradient regardless. Its wired
  `color0`–`color3` inputs also correctly resolve in firmware (unlike
  Poline's anchors). No issue.

## Pattern → Shapes & Text (SolidColor, Circle, Line, Shape, Path, Text, GradientFrame, PaletteGradient, Image)

(Note: `Path` exists in code with `subcategory: 'Shapes & Text'` but isn't
listed in `CLAUDE.md`'s node inventory for this subcategory — a small doc
gap, not a node issue.)

### Image.rotation — the standout finding: preview and firmware disagree on wired rotation

**The `rotation` port is wireable (`dataType: 'float'`) and documented as a
continuous input, but the evaluator only special-cases the exact values
`90`/`180`/`270` (strict `===`) — any other angle, including anything a live
wired signal would actually produce, silently renders unrotated (0°).**
Codegen, however, computes `_rot = round(rotation / 90) % 4`, which rounds
*any* input angle to the nearest quarter turn. Concretely: wiring a
slowly-varying rotation signal (e.g. a `Sin`/`Counter` scaled to 0–360) will
look essentially static in the browser preview (since it almost never lands
on exactly 90.000, 180.000, or 270.000), but will visibly **snap between the
four orientations** on real hardware, because firmware rounds instead of
requiring an exact match.
**Why it matters:** this is a genuine, concrete preview/firmware behavioral
divergence (in the same family as the `BlendColors` finding in the Color
category) — someone building a "spinning image" effect would see nothing
happen in preview and then be surprised when the uploaded firmware snaps
between four fixed orientations instead of rotating smoothly (since neither
side actually supports continuous-angle image rotation — only 90° steps —
but only one side tells the truth about that).
**Fix:** make the evaluator round to the nearest 90° step the same way
codegen does (`src/state/image.ts`'s rotation branch), so preview and
firmware agree on what a wired value actually does. A larger follow-up
feature would be true continuous-angle rotation (real interpolation instead
of 90° snapping) on both sides, but that's a bigger lift than this
consistency fix.

### Line — coordinates are raw pixels with defaults sized for a 16×16 grid

**`x1`/`y1`/`x2`/`y2` are absolute pixel coordinates (default `(0,0)`–
`(15,15)`), unlike `Circle`/`Shape`'s `cx`/`cy`, which are explicitly
normalized 0–1 fractions of the matrix (`PROPERTY_META_OVERRIDES` gives them
`N01`).** A fresh `Line` node dropped onto a matrix larger than 16×16 (e.g.
a 64-wide panel) will only draw a short line tucked in the top-left corner
by default.
**Why it matters — but with an important mitigation:** the app's
scalar-expression system (`supportsScalarExpression()`) already covers this
exact case — since none of `x1`/`y1`/`x2`/`y2` has a `PROPERTY_META` slider
entry, the field already renders as expression-capable, so typing `W-1`/
`H-1` instead of a literal number already makes the line span the actual
matrix size. The real gap is **discoverability and defaults**, not
capability: the shipped defaults are static numbers rather than
matrix-relative expressions, and nothing in the UI hints that the field
accepts expressions until a user already knows to try.
**Fix (low-risk):** ship the defaults as `"W-1"`/`"H-1"`-style expressions
instead of literal `15`/`15`, so a fresh `Line` node spans the actual matrix
out of the box on any size. (Contrast: `Circle`/`Shape`'s normalized
position sidesteps this problem entirely by design, which is the more
robust pattern — worth keeping in mind for any new position-like field.)

### Everything else

- `SolidColor`, `GradientFrame`: both correctly expose their own `r/g/b`-
  style default properties as the fallback for their color inputs — the
  pattern `BlendColors` (Color category) should have followed. No issues.
- `Text`: `x`/`y` correctly normalized (`N01` override); `letterSpacing`
  correctly bounded; `text` correctly a free string; `scroll` correctly a
  plain/expression-capable field (an unbounded scroll rate has no natural
  0–1 range). No issues.
- `Circle`/`Shape`: `cx`/`cy` correctly normalized; `radius`/`size`/
  `thickness`/`rotation`/`sides`/`aspect` correctly left as plain
  expression-capable pixel/degree values (a shape's absolute size in pixels
  is meaningful regardless of matrix resolution, unlike its position). Fill
  colors correctly gated off via `isPropertyEnabled` when `filled` is false.
  No issues.
- `Path`: `pathShape`, `t` (0–1), `scale`, `thickness`, and its `r/g/b`
  fallback are all present and correctly bounded — one of the more
  complete node definitions reviewed so far. No issues.
- `PaletteGradient`: `angle` (0–360), `repeat` (1–8), `speed` (0–1
  normalized): all correctly bounded and defaulted. No issues.
- `Image`: every other property (`brightness`/`saturation`/`contrast`/
  `hueShift`/`gamma`/`zoom`/`cropX`/`cropY`/`positionX`/`positionY`/
  `playbackRate`/`paletteLevels`/`dithering`/`fit`/`sampling`) has a
  dedicated, well-bounded override and is consistently sanitized in both
  evaluator and codegen (`finite()` helper clamps NaN/out-of-range in
  codegen; `Number.isFinite` guards in the evaluator). No issues beyond
  `rotation` above.

## Pattern → Generative (Noise, FractalNoise, GaborNoise, Plasma, Rainbow, Pride2015, Pacifica, TwinkleFox, Scanner, Confetti, Juggle, RadialBurst, Spiral, Kaleidoscope)

(Note: `Scanner`, `Confetti`, and `Juggle` exist in code with
`subcategory: 'Generative'` but aren't listed in `CLAUDE.md`'s node
inventory for this subcategory — a doc gap, not a node issue, mirroring the
`Path` omission noted in Shapes & Text.)

### RadialBurst.arms — a fully dead, wireable port (the strongest finding of this review so far)

**The `arms` input port is declared, connectable, and visible in the node's
UI, but it is never read anywhere — not in the evaluator, not in codegen.**
Verified by reading both implementations end to end:
`evalRadialBurst(speed, palette, t, W, H)` in `graphEvaluator.ts` takes no
`arms` parameter at all (its ring pattern uses a hardcoded `dist * 8`
constant), and `cppGenerator.ts`'s `RadialBurst` case likewise hardcodes
`_d*8` with no reference to `arms` anywhere. Wiring anything into `Arms`, or
looking for a slider to adjust it, does precisely nothing in both preview
and firmware.
**Why it matters:** this is qualitatively worse than the "missing default"
findings elsewhere in this review — those nodes are inert until wired; this
port is wired-*and-inert*, silently discarding whatever's connected to it.
It's also conceptually confused: "Arms" implies angular spokes (the way
`Spiral`'s `arms` genuinely multiplies angular repetition via
`angle * arms`), but `RadialBurst`'s formula only ever varies with radial
`dist`, never `angle` — so even the *idea* of "arms" doesn't fit what this
node currently draws (concentric expanding rings, not radiating spokes).
**Fix — two reasonable paths:**
1. **Remove the port** if the ring-only look is intentional — it's pure
   dead weight otherwise.
2. **Wire it up for real** — replace the hardcoded `8` in both
   `dist * 8`/`_d*8` with the (renamed, e.g. `rings`) parameter, giving the
   node a genuinely adjustable ring density. This is the more valuable
   option since the UI affordance (a labeled, connectable port) already
   implies this capability exists.

### Spiral vs. RadialBurst vs. Kaleidoscope — inconsistent "count" treatment (context for the finding above)

For comparison, three sibling "radiating pattern" nodes handle their count
parameter three different ways:
- `Kaleidoscope.segments`: wireable port **and** has a default — the
  correct pattern.
- `Spiral.arms`: **not** a wireable port, plain property only, has a
  default (`2`) — a deliberate, self-consistent design (design choice, not
  a bug, since the evaluator correctly treats it as property-only, matching
  its own node definition).
- `RadialBurst.arms`: wireable port, **no** default, **and never read at
  all** — the dead-port bug above.

### Everything else

- `Noise` (all 7 variants — field/simplex/noise3d/noise4d/worley/plasma/
  sine), `Plasma`, `Rainbow`, `Pride2015`, `Pacifica`, `TwinkleFox`,
  `Scanner`, `Confetti`, `Juggle`, `FractalNoise`, `GaborNoise`, `Blobs`:
  systematically cross-checked each node's declared input ports against
  what its evaluator case actually reads — every port on every one of these
  nodes is genuinely consumed, with matching defaults and correctly bounded
  sliders (`speed`/`scale` normalized 0–1 via `speedRange.ts`,
  `frequency`/`orientation`/`deltaHue`/`count`/`width` correctly left as
  their own bounded ranges rather than force-normalized). No further issues
  found in this subcategory.

## Pattern → Simulations (Fire, Fire2012, Particles, FlowField, Starfield, Boids, ReactionDiffusion, GameOfLife)

(Note: `Boids` exists in code with `subcategory: 'Simulations'` but isn't
listed in `CLAUDE.md`'s inventory for this subcategory — same doc-gap
pattern as `Path`/`Scanner`/`Confetti`/`Juggle` in earlier subcategories.)

### Dead-port audit — clean

Applied the same "does every declared port actually get read" check that
found `RadialBurst.arms` last round to `FlowField`, `Starfield`, `Boids`,
`ReactionDiffusion`, and `GameOfLife`. All ports on all five are genuinely
consumed by their evaluator case, with matching defaults and correctly
bounded controls (`GameOfLife`/`ReactionDiffusion`'s `speed` is intentionally
a steps/sec rate — 1–30 — rather than the usual 0–1 normalization, which the
codebase's own conventions already document explicitly). No dead ports
found in this subcategory.

### Fire / Fire2012 shared controls — verified consistent

The five controls shared between `Fire` and `Fire2012` (`direction`,
`turbulence`, `paletteMix`, `mirror`, `seed`) are implemented once as a
canonical primary/secondary grid remapped at the final palette-sampling
step, and both nodes correctly expose the exact same five properties with
matching bounds. Codegen mirrors this with the same `fireGrid`/`fireXYExpr`
approach, using `WIDTH`/`HEIGHT` macro names rather than baked numbers so
the heat array stays correctly sized under supersampling. No issues found.

### Particles — spot-checked, not exhaustively verified

This is the largest single node in the library (20 movement variants, 5
gated extra controls) and a full line-by-line audit of every mode in both
`evalParticles` and the codegen `Particles` case was outside what's
reasonable to do by hand in this pass. What I did check: the five gated
controls (`count`/`spread`/`gravity`/`bounce`/`size`) are genuinely read in
codegen (`spreadP`/`gravityP`/`bounceP` all feed into mode-specific
branches, not dead), and both implementations carry matching comments
cross-referencing `PARTICLE_*_MODES` in `nodeLibrary.ts`, which is a good
sign of deliberate, maintained parity. I'd flag this node as the one place
in the library where a dedicated, narrower follow-up pass (comparing each of
the 20 modes' evaluator/codegen bodies side by side) would be worth doing on
its own, given its size — I did not find a concrete bug, but I also can't
claim the same exhaustive confidence here that I have for the smaller nodes
in this review.

## Pattern → Audio-Reactive (SpectrumBars, SpectrumVisualizer, BassPulse, BassRings, MidrangeWaves, MidrangeBloom, TrebleSparks, TreblePrism, AudioCascade, BeatFlash, KickShock, VocalAurora, BeatKaleidoscope, SpectraMosaic, PercussionBlobs, EmberPulse, TurbulentBloom, GravityWell, RainRipples, PrismStorm, AudioFlow, ColorTrails)

### Documentation gap escalates sharply in this subcategory

**11 of this subcategory's 22 actual nodes — exactly half — aren't listed
in `CLAUDE.md`'s Audio-Reactive inventory**: `SpectrumVisualizer`,
`KickShock`, `VocalAurora`, `BeatKaleidoscope`, `SpectraMosaic`,
`PercussionBlobs`, `EmberPulse`, `TurbulentBloom`, `GravityWell`,
`RainRipples`, `PrismStorm`. This is the same doc-gap pattern flagged as a
minor aside in earlier subcategories (`Path`; `Scanner`/`Confetti`/`Juggle`;
`Boids`), but here it's roughly a dozen nodes rather than one or two —
worth a dedicated doc pass rather than a one-line fix.

### KickShock.tiles — a second dead port, same bug shape as RadialBurst.arms

**The `tiles` input port is declared and connectable, but it's never read
in either the evaluator or codegen.** Verified end to end: `evalKickShock()`'s
full parameter list is `(key, kick, snare, hihat, energy, speed, t,
palette, W, H, count, decay, thickness, spawnSpread, blendMode)` — no
`tiles` anywhere — and the `KickShock` case in `graphEvaluator.ts` never
calls `num(id, 'tiles', ...)` or reads `props.tiles` at all (confirmed by
reading the full case). `cppGenerator.ts`'s `KickShock` case is the same:
no reference to `p.tiles` anywhere in the emitted code. Wiring anything
into "Tiles" — or trying to find a slider for it — has zero effect, in
both preview and firmware, exactly like `RadialBurst.arms` last round.
**Why it matters:** the sibling node `SpectraMosaic` has a genuinely
functional `tiles` property (grid subdivision count), which makes it very
likely `KickShock` inherited the port from a shared template/copy-paste
during development and it was simply never wired up or removed.
**Fix:** same two options as `RadialBurst.arms` — either remove the dead
port, or actually wire it to something meaningful (e.g. splitting the
shockwave rings across a `tiles`×`tiles` grid, mirroring what
`SpectraMosaic` already does with the same property name).

### Dead-port audit — otherwise clean

Checked every remaining node's declared ports against what its evaluator
case actually reads: `SpectrumBars`, `SpectrumVisualizer`, `BassPulse`,
`BassRings`, `MidrangeWaves`, `MidrangeBloom`, `TrebleSparks`,
`TreblePrism`, `AudioCascade`, `BeatFlash` (including its more intricate
`paletteWired` conditional, which matches exactly between evaluator and
codegen), `VocalAurora`, `BeatKaleidoscope`, `SpectraMosaic`,
`PercussionBlobs`, `EmberPulse`, `TurbulentBloom`, `GravityWell`,
`RainRipples`, `PrismStorm` all correctly consume every declared port, with
matching defaults and consistently applied `energy`/`speed` normalization
(0–1 via the shared `N01` override, same convention as the Generative
subcategory). No further issues found.

## Pattern → Code (CustomFormula, Code)

### CustomFormula.a/b — the same recurring missing-default pattern

**`a`/`b` (float inputs feeding the formula's `a`/`b` variables) have no
default properties** (`defaultProperties: { formula: '...', palette:
'rainbow' }` — no `a`/`b`), so nothing renders for them until wired. Same
shape as the many other instances of this pattern found throughout the
review (Math category especially); fix is the same — add matching defaults
(`0` each, matching the evaluator's `num(id, 'a', props, 'a', 0)` fallback).

### No in-app help for the formula language's vocabulary

**The `formula` text field has zero discoverability aid** — no tooltip, no
hint listing the available variables (`x`, `y`, `t`, `cx`, `cy`, `r`,
`angle`, …) or functions (`sin8`, `beatsin8`, `scale8`, …) documented
extensively in `CLAUDE.md` but invisible from inside the app itself. This
is a real contrast: the app's *other* free-text power-user feature — the
scalar-expression system used by fields like `Line.x1` — already has
exactly this kind of help (`SCALAR_EXPRESSION_HELP`, surfaced as a tooltip
whenever the expression is invalid or being edited). `formula` has no
equivalent.
**Why it matters:** this is the single most advanced, cryptic feature
surface in the whole node library (a full expression language with
FastLED-specific shims), and it's the one place a first-time user has
*zero* in-app guidance — they'd need to already know the vocabulary or go
find the docs outside the app.
**Fix:** add a short `FORMULA_LANG_HELP`-style constant (mirroring
`SCALAR_EXPRESSION_HELP`'s pattern) listing the core variables/functions,
surfaced as a tooltip on the `formula` row for both `CustomFormula` and
`FieldFormula`.

### Security/sandboxing — verified intact, no issues found

Given how much trust these two nodes carry (a formula language and literal
pasted C++), I specifically re-verified the safeguards `CLAUDE.md` documents:
- No `new Function`/`eval` remain anywhere in `formulaLang.ts` — confirmed
  by direct search; the only hits are comments describing the historical
  migration away from it.
- The `Code` node's preview execution still runs through a genuinely
  time-boxed Web Worker (`codeSandboxRuntime.ts`): a 100 ms
  (`RUN_TIMEOUT_MS`) timeout terminates and respawns the worker on a hang,
  confirmed present and wired up.
- The `trusted` workspace flag correctly gates all three formula/code entry
  points (`CustomFormula`, `FieldFormula`, `Code`) — each explicitly checks
  `trusted` before evaluating and falls back to a blank frame/field
  otherwise, matching the documented trust-boundary contract exactly.
No changes needed here — flagging as verified rather than silently assumed,
given how much weight this boundary carries.

---

## Pattern category — wrap-up

That's all five Pattern subcategories (Shapes & Text, Generative,
Simulations, Audio-Reactive, Code) — the two most significant findings from
the whole category were the dead `arms`/`tiles` ports on `RadialBurst`/
`KickShock`, and the `Image.rotation` preview/firmware divergence. The
documentation gap (undocumented nodes missing from `CLAUDE.md`'s inventory)
recurred in every subcategory and is worth a dedicated cleanup pass on its
own, separate from the node-behavior fixes above.

## Field (FieldFormula, FieldNoise, DistanceField, FrameToField, FieldMath, FieldWarp, FieldRotate, FieldTile, FieldToFrame, WaveSim)

(Note: `WaveSim` exists in code with `category: 'field'` but isn't listed in
`CLAUDE.md`'s field-category inventory — same recurring doc gap as every
prior category/subcategory in this review. `FieldFormula` was already
covered under Pattern → Code, since it shares the formula-language findings
with `CustomFormula`.)

### The cleanest category reviewed so far — no bugs found

Ran the full checklist against every node here: declared-port-vs-consumed
audit (the check that found `RadialBurst.arms`/`KickShock.tiles`), default-
property completeness (the check that found the widespread Math/Color/Code
gaps), and evaluator/codegen parity (the check that found `BlendColors`/
`Image.rotation`'s divergences). Every single node passed on all three:

- **Every declared port is genuinely consumed** in `FieldNoise`,
  `DistanceField`, `FrameToField`, `FieldMath`, `FieldWarp`, `FieldRotate`,
  `FieldTile`, `FieldToFrame`, and `WaveSim`. No dead ports.
- **Every float input has a matching default property**, all correctly
  normalized where it makes sense (`DistanceField.px`/`py` reuse the
  generic 0–1 position convention; `FieldWarp.strength`,
  `FieldRotate.angle`/`spin`, `FieldTile.tilesX`/`tilesY` all correctly left
  as their own bounded (non-0–1) ranges via the generic `PROPERTY_META`
  table). This is the first category in the review where the missing-
  default pattern (found in the large majority of nodes elsewhere) doesn't
  show up at all.
- **Evaluator and codegen implementations are formula-for-formula
  identical** — I compared `evalDistanceField`/`evalFieldMath`/
  `evalFieldWarp`/`evalFieldRotate` against their codegen counterparts line
  by line: the same clamping (`FieldMath` clamps every op to 0–1 on both
  sides), the same edge handling (`FieldWarp` clamps out-of-bounds samples
  to the matrix edge; `FieldRotate` wraps around it instead — a deliberate,
  *consistent* difference between the two nodes' semantics, not a mismatch
  within either one), and `WaveSim`'s stateful ripple injection/decay logic
  matches exactly, including the "re-inject an impulse if the simulation
  goes quiet" stagnation recovery on both sides.

No findings to act on for this category — flagging it as a positive
reference point: this is what "done well" looks like for the rest of the
library to converge toward (particularly the Field↔Frame conversion pair
and the coordinate-transform nodes, which are good models for how
`RadialBurst`/`KickShock`'s dead ports and `BlendColors`/`Image.rotation`'s
divergences should have been built in the first place).

## Effects / composite (Blend, BrightnessMod, Fade, HueShift, Gamma, Saturation, ColorBoost, Transform, Array, Invert, Mirror, Trails, FrameFeedback, FrameSwitch, Zones, Blur2D, Mask)

(Note: `ColorBoost`, `Mirror`, and `FrameFeedback` exist in code with
`category: 'composite'` but aren't listed in `CLAUDE.md`'s Effects
inventory — same recurring doc gap as every prior category.)

### BrightnessMod — a genuine preview/firmware divergence, and a UI cap that blocks a legitimate use case

**Two related problems, both centered on the same field:**

1. **Firmware can only dim, never brighten — even when the evaluator
   would.** The evaluator's `br` multiplier is unclamped
   (`Math.min(255, Math.round(px.r * br))` only clamps the *final pixel*,
   not the multiplier), so wiring a signal above `1` into `brightness`
   genuinely amplifies a dim frame in the live preview. Codegen, however,
   explicitly clamps the multiplier itself: `_br = (uint8_t)(constrain(br,
   0, 1) * 255)`. Wiring anything above `1` into `brightness` visibly
   brightens the preview but is silently capped back to "no change" in the
   generated firmware — the same class of bug as `BlendColors` and
   `Image.rotation` earlier in this review, just less obvious since it only
   shows up when something upstream actually drives the value past 1.
2. **The property's own slider can't express amplification either.**
   `brightness` has no `BrightnessMod`-specific `PROPERTY_META` override, so
   it falls back to the generic 0–1 `brightness` meta — meaning even a
   *static* boost value (no wiring at all, just "always brighten this frame
   by 1.5×") isn't reachable from the UI, despite the evaluator's own math
   already being safe for it (final-pixel clamp, not multiplier clamp).
**Why it matters:** amplifying a dim upstream pattern is an entirely
reasonable, common use for a node called "Brightness" — right now it's
silently impossible in firmware and only reachable in preview via an
indirect wired signal that firmware will then ignore.
**Fix:** widen codegen's clamp to match the evaluator's actual capability
(clamp the final pixel to 255, not the multiplier to 1), and add a
`BrightnessMod`-specific override letting the slider go up to at least ~2–3×
so a static boost is directly settable.

### Dead-port audit and fallback-color audit — otherwise clean

- **Dead ports:** checked `Fade`, `Transform`, `Array`, `FrameSwitch`,
  `Zones`, `Trails`, `FrameFeedback`, `Mask`, `HueShift`, `Saturation`,
  `ColorBoost`, `Gamma`, `Blur2D` — every declared port is genuinely
  consumed on both sides. No `RadialBurst.arms`/`KickShock.tiles`-style dead
  ports found here.
- **Color fallback parity:** `Mirror`'s `color` (tint) input was worth
  double-checking given the `BlendColors` bug found earlier — but `Mirror`
  correctly reads its own `r`/`g`/`b` properties as the unwired fallback
  (matching the evaluator's white default) rather than falling through to
  the generic `colorExpr()` black default. No mismatch here.
- `Zones`' zone rectangles, `Array`'s repeat/offset/blend controls, and
  `Trails`/`FrameFeedback`'s persistent-buffer state all have matching
  defaults and consistent evaluator/codegen behavior. No further issues
  found in this category.

## Show (MusicLibrary, PatternCollection, TransitionSet, PatternMaster/Show Engine, Sequencer, Transition, PerformanceGenerator, SDCard)

### MusicLibrary.colors/positions — fully dead properties

**`colors`/`positions` (defaulted from `DEFAULT_CUSTOM_COLORS`/
`DEFAULT_CUSTOM_POSITIONS`) are never read anywhere** — `MusicLibrary`'s
evaluator case is just `out = { music: true }`, and its dedicated node body
(`MusicLibraryNodeBody.tsx`) never touches `colors`/`positions` either.
Every `MusicLibrary` node carries this unused data in its saved properties
for no functional purpose — almost certainly copy-pasted from a
palette-editor-style node during scaffolding and never removed.
**Fix:** drop them from `defaultProperties`. Since nothing reads them, this
is safe for existing saved projects too — old saves simply carry a couple
of harmless extra keys that were never read either way, no migration
needed.

### Sequencer.fade — the slider is capped far below what the node actually supports

**`fade` is genuinely a crossfade *duration in seconds* (up to the full
`interval`, which itself ranges 0.1–20s), in both the evaluator
(`fadeDur = Math.max(0, Math.min(fade, iv))`) and codegen (identical
clamp) — but the UI slider caps it at `1` because `fade` has no
`Sequencer`-specific `PROPERTY_META` override and falls back to the
generic 0–1 "opacity fraction" meta used everywhere else in the app.**
Confirmed by reading both implementations: neither one restricts `fade` to
0–1 internally, only to the interval length — a 5-second slow cross-dissolve
between two held patterns is fully supported by the underlying code but
completely unreachable from the slider.
**Why it matters:** same shape as `BrightnessMod` last round — a control
whose range doesn't match what the node can actually do, because it reused
a generic meta whose 0–1 convention happens to not fit this node's
different semantics (a duration, not a fraction).
**Fix:** add a `Sequencer`-specific override for `fade`, e.g. a slider
spanning something like 0–10s (or ideally dynamically capped to the current
`interval` value, matching the runtime clamp exactly).

### SDCard — pin fields share the Input category's sanitization gap

**`sdCsPin`/`i2sBclk`/`i2sLrc`/`i2sDout` have no `PROPERTY_META` bounds and
no codegen-side sanitization** (`provisionerSketchGenerator.ts` substitutes
`c.sdCsPin` directly into `#define SD_CS ...` with no rounding/range check)
— the same gap already documented in the **Input** category for
`ButtonInput`/`PotInput`/`EncoderInput`. Extending that earlier
recommendation (a shared, board-aware pin-sanitizing helper) to `SDCard` as
well would close this out in one pass rather than needing a separate fix.

**Also unbounded: `maxVolume` (default `18`).** The `ESP32-audioI2S`
library's practical volume range is a small fixed scale (0–21); a plain
unbounded number box invites an out-of-range value with no feedback. Worth
a `SDCard`-specific `PROPERTY_META` override matching the library's actual
range.

### Everything else

`PatternCollection`'s `pattern` input port looks like it could be another
dead port (its evaluator case never reads it — only `props.patternIds`) —
but this is **intentional and already well-documented**: connecting
anything to `pattern` is intercepted at the UI's connect-handler
(`NodeGraphCanvas.handleConnect`) before an edge is ever created, absorbing
the source group into `patternIds` instead. By the time the evaluator runs,
there's genuinely never a live wire to read, so this is correctly designed,
not a bug — worth explicitly noting since it looks identical to the
`RadialBurst.arms`-style dead-port bug at a glance. `Transition`,
`PatternMaster`, `TransitionSet`, and `SDCard`'s own `shows` input (a
no-op in the frame-eval graph by design, since SD packaging happens outside
it during upload) were all checked and are correctly implemented. No
further issues found.

## Output (MatrixOutput)

### dataPin/clockPin — the same pin-sanitization gap, one final time

**`dataPin`/`clockPin` have no `PROPERTY_META` bounds and fall through to
the plain unbounded number box**, same as every hardware pin field flagged
across this review (Input category's `ButtonInput`/`PotInput`/
`EncoderInput`, Show category's `SDCard`). `validateGraph.ts`'s
`collectPinUses()` does cover both for *duplicate*-pin detection, but not
range/integer validation, consistent with everywhere else this gap showed
up. This is the last instance of what is clearly a single, systemic issue
across the whole hardware-facing surface of the library — restating it here
mainly to confirm `MatrixOutput` (the most important hardware-output node
in the app) needs the same shared pin-sanitizing helper recommended earlier,
not a bespoke fix.

### width/height — verified well-built, flagging the 64×64 ceiling as a question rather than a bug

**Unlike every other pin/numeric field flagged in this review, `width`/
`height` are a genuinely good example of validation done right.** They're
deliberately excluded from the generic property list and instead edited via
a dedicated preset dropdown (16/32/64/Custom) backed by `MatrixSizePopup`,
which clamps to `[1, 64]`, rounds, and falls back to `1` on invalid input —
no gaps found.
**One open question, not a bug:** the ceiling is a hardcoded `64` in
`MatrixSizePopup.tsx`. That's probably a deliberate cap for browser preview
performance/RAM (matches the project's extensive RAM-estimation and
capacity-meter tooling elsewhere), but it's worth confirming intentionally
— a 64×64 max (4,096 pixels) would exclude larger installations (e.g. a
100×50 video wall) from the *design* tool even if the exported firmware
could technically address more pixels via multi-output routing. Flagging as
a question for you rather than asserting it's wrong, since I don't have
visibility into why 64 specifically was chosen.

### customXYMap — verified robust, no issues

Specifically checked this since it parses user-supplied JSON into a raw
LED-index permutation table baked directly into generated firmware.
`customXYMapError()` (`xyLayout.ts`) wraps `JSON.parse` in a try/catch,
validates the result is an array of the exact expected length, checks every
entry is an in-range integer, and checks for duplicate indices (a valid
permutation) — with clear, specific user-facing error messages for each
failure mode, and `validateMatrixLayout()` blocks upload until it's clean.
No crash risk, no gaps found. Good example of defensive input handling.

### Everything else

`chipset`/`colorOrder`/`correction` selects, `overclock` (correctly
disabled for SPI chipsets via `isPropertyEnabled`), `powerLimit`/`volts`/
`milliamps`, and `brightness` (correctly overridden to MatrixOutput's own
0–255 FastLED-native range rather than the shared 0–1 frame-level meta) are
all well-bounded and consistently handled between preview and firmware,
matching the extensive design notes already in `CLAUDE.md`. No further
issues found.

---

# Node additions worth considering

You asked whether any new nodes — especially ones tied to the FastLED
library itself — would be worth adding. In rough priority order:

1. **More `Ease` curve variants (low effort, high value).** `Ease`
   currently exposes 5 curves (`inOutCubic`/`inOutQuad`/`triwave`/
   `quadwave`/`cubicwave`) via a bundled-variant dispatch that's already
   proven cheap to extend elsewhere in the library (`Noise`, `Particles`,
   `Transition` all use the same pattern). FastLED's `lib8tion` has more
   built-in 8-bit easing/wave functions than are currently exposed
   (`ease8InOutApprox`, plus sine-based variants) that would slot into the
   existing dispatch with minimal new code on either the evaluator or
   codegen side, since the plumbing already exists.

2. **A palette-from-image extraction node (moderate effort, creative
   value).** The `Image` node already has an uploaded image's pixel data
   in hand (`src/state/image.ts`); a node (or a mode on `CustomPalette`)
   that samples an uploaded image's dominant/representative colors into a
   ready-made palette would be a natural, well-scoped addition that
   reuses existing infrastructure (`customPaletteStops16`, the image
   upload pipeline) rather than requiring new plumbing.

3. **A DMX/Art-Net input node (larger effort, real installation value).**
   Not part of FastLED itself, but a very common integration point for
   permanent/professional lighting installations that want the matrix
   synced to a lighting console or other DMX-driven fixtures. This is a
   genuinely bigger lift — it needs a DMX-capable library
   (e.g. `esp_dmx`), new wiring/pin config on par with `SDCard`'s I2S
   setup, and a new `dataType` for the incoming channel data — so I'd
   treat it as a candidate for a dedicated design doc rather than a quick
   add, but it's the single most-requested-feature-shaped gap I can infer
   from what's already built (the project already treats "sync multiple
   physical outputs" and "sync to an external audio source" as first-class
   problems; DMX sync is the same problem from a different professional-
   lighting angle).

4. **Time-of-day/scheduled triggers — flagged as a non-starter for now,
   not a recommendation.** A "dim after 10pm" or "different show on
   weekends" node would be valuable for permanent installations, but the
   project currently has no RTC or network (WiFi/NTP) infrastructure at
   all — this would be a foundational addition, not a node addition, so I
   wouldn't pursue it as a simple library entry unless/until the project
   takes on real-time-clock support as its own initiative.

That's the full category-by-category review. The two or three findings
I'd personally prioritize fixing first, across everything above: the dead
`RadialBurst.arms`/`KickShock.tiles` ports (concrete, zero-risk removal or
completion), the `BlendColors`/`Image.rotation`/`BrightnessMod` preview-
firmware divergences (each a small, well-scoped fix), and the pin-
sanitization gap that recurred in every hardware-facing node (`MicInput`'s
I2S pins, `ButtonInput`/`PotInput`/`EncoderInput`, `SDCard`, `MatrixOutput`)
— one shared helper would close out five separate findings at once.
