# Transition catalogue — design note

Status: implemented (21 styles) · Owner: app · Date: 2026-09-04

How an A→B transition style is defined, where each of its pieces lives, and the
rules that keep the browser preview and three different generators drawing the
same frame. Written when the 3D styles were added, because the catalogue had
grown to the point where "add a style" touched more places than anyone could
hold in their head, and two of those places were quietly a copy of each other.

The show that *chooses* transitions is [generative pattern
show](generative-pattern-show.md); this note is only about what a style **is**.

## The shape of a style

**Every transition is an inverse per-pixel sample.** For each output pixel, a
style decides where to read from A and from B, and how to combine them. Nothing
in the catalogue is a forward blit, a particle system, or stateful — a style is
a pure function of `(A, B, t, W, H)`.

That is the whole contract, and it is why the 3D styles needed no new plumbing:
a perspective divide is the same shape of work as `zoom`'s linear scale, just
with a division per pixel. Anything that cannot be expressed as one inverse
sample — a correspondence-driven morph, say — does not belong here without
first changing the contract. See [what is deliberately absent](#what-is-not-here).

## Where a style lives

A style is spread over three implementations and two registries. Missing one
fails quietly and differently each time, so they are listed exhaustively:

| Site | What it is | Failure if omitted |
| --- | --- | --- |
| `src/state/graphEvaluator.ts` — `compositeTransition` | The browser preview | Preview silently falls through to crossfade |
| `src/codegen/transitionHelperCpp.ts` — `TRANSITION_HELPER_CPP` | The show generator **and** the SD player | Device crossfades where the preview does not |
| `src/codegen/cppGenerator.ts` — the `Transition` node arm | A normal sketch's `Transition` node | Normal-sketch export crossfades |
| `src/codegen/performanceGenerator.ts` — `TRANSITION_IDS` | The numeric id | Style cannot be named in a show or a pool |
| `src/state/nodeLibrary.ts` — `PROPERTY_META.transitionType` | The option list and its labels | Style exists but nobody can pick it |

Everything else is **derived and needs no row**. Prefer extending a derivation
over adding a fifth list:

- `SHOW_TRANSITIONS` is `Object.keys(TRANSITION_IDS)`.
- The `Transition` node's chip grid and the `TransitionSet` picker read
  `PROPERTY_META.transitionType.options` and render live thumbnails by calling
  `compositeTransition` directly — so a new style gets a working preview chip
  for free, and a broken one is visible in the picker before it is ever wired.
- The Performance timeline's Style dropdown reads `SHOW_TRANSITIONS`.
- `showGenerator`'s transition pool maps wired names through the same list.

`isPropertyEnabled` in `nodeLibrary.ts` gates the variant properties
(`direction`, `axis`, `tileSize`, `count`, `turns`) to the styles that use them.
A style with no extra properties needs no entry there.

### The two option lists must agree in order

`PROPERTY_META.transitionType.options` and `SHOW_TRANSITIONS` are separate
arrays that must hold the same names in the same order — the node picker reads
one and the timeline reads the other. `transition3d.test.ts` asserts they are
equal rather than trusting anyone to remember.

## Style ids are append-only, dense, and ordered

A style's id is written into exported `.show` files, so **ids are never
renumbered and never reused**. A new style takes the next free number.

Less obviously, the table must also stay **dense and in ascending order**,
because the codebase derives the id two different ways:

- `performanceGenerator.ts` writes the binary with `TRANSITION_IDS[name]` — by
  **value**.
- `showGenerator.ts` builds a show's pool with `SHOW_TRANSITIONS.indexOf(name)`
  — by **position**.

These agree today only because every entry's value equals its index. Renumber,
leave a gap, or reorder the object literal, and a generated show would pick a
different transition than the one the user chose — with no error anywhere,
because both lookups still succeed. If a gap ever becomes necessary, fix the
position-based lookup first.

## A style must reach its endpoints geometrically

**At `t=0` the output must equal A exactly, and at `t=1` it must equal B
exactly — through the maths, not through a special case.**

The evaluator may keep `if (tt <= 0)` / `if (tt >= 1)` guards as a fast path,
but they cannot be the mechanism, because the generators emit a loop over a
*runtime* `t` and have no way to branch on it. A style that only lands on its
endpoints via a guard diverges from firmware at both ends of every transition.

This is a real design constraint, not a formality. Cube Rotate is the case where
it costs something: a real cube's side face ends up nearer the camera than its
front face started, so a literal cube cannot be an exact A→B transition. Setting
the focal length to `depth - 1` puts whichever face is square to the camera on
the screen plane at both ends, which makes both exact without a fudge factor.

Slab Tilt hits the same wall from another side — a hinge line never moves, so a
tipping panel can never clear the frame on its own. B sliding in over it is what
makes the ending exact rather than leaving a residual strip.

`transition3d.test.ts` checks both the guarded endpoints and, separately,
convergence at `t=0.0001` / `t=0.9999` with the guards bypassed. The second is
the one that catches a firmware divergence. It asserts *convergence* rather than
equality: depth shading is continuous, so a hair short of the end a surface is
still a fraction of a percent dim.

## Parity hazards

**Rounding ties.** C++ `roundf` breaks `.5` away from zero; JS `Math.round`
breaks it toward `+Infinity`. A warp produces negative half-steps constantly, so
both sides use `floor(v + 0.5)` instead (`sampleRound` / `_sampleRound`). This
was the first thing to go wrong and would have shown up as a one-pixel seam that
only appears on some frames.

**float versus double.** The generators emit `float`; the evaluator computes in
double. Near a pixel boundary the two can land on different source pixels. This
is inherent and shared with every pre-existing style; it is a reason not to add
*more* precision-sensitive per-pixel state, not something to try to fix.

**Restated constants.** A style's numbers (depth curve, camera distance, angle
range) appear in three emitters. The shared parts of the 3D family — the depth
curve, the tie-breaking rounding, the unit sampler — live once in
`TRANSITION_3D_HELPERS_CPP`, which both the shared helper *and* the normal-sketch
generator emit. The per-style geometry is still transcribed three times; that is
the current cost of a style, and it is why a style should be as simple as it can
be while still reading.

## What reads at LED resolution

The catalogue's real constraint is not compute, it is size. The default frame is
16x16; a large HUB75 panel is 64x32. At 16x16 a perspective divide gives roughly
four distinguishable depth slabs, which splits the design space cleanly:

**Works** — anything perceived from its *silhouette* rather than its surface: a
rectangle growing from a vanishing point, a card narrowing to a line, a seam
sweeping across a turning cube, panels swinging open, a slab tipping away.

**Does not** — anything selling depth through shading gradients, arbitrary
multi-axis tumbles, sphere or globe wraps. At this size they are indistinguishable
from noise, and they cost the same to run.

Cost is not the gate. `clockwipe`, `iris`, `ripple` and `spiral` already run
`atan2f`/`sqrtf` per pixel on device; a perspective divide is cheaper than what
already shipped.

**Non-matrix outputs.** LED String, Ring and Corkscrew are effectively `H = 1`.
Styles degrade rather than blank — Card Flip becomes a horizontal squeeze, Dolly
a centred expansion — and the tests assert a one-row output still lights. A style
that would no-op entirely on a strip should say so before it lands.

## Flash: the show narrows, the player cannot

`transitionHelperCpp(styleIds)` strips the `case` arms a sketch cannot reach.

- The **show generator** knows its pool at generation time (a `TransitionSet`
  baked into a const array), so it narrows, and a crossfade-only show carries
  none of the other twenty.
- The **SD player** selects styles at runtime from the `.show` file and can be
  handed any of them, so it emits every arm unconditionally.

That asymmetry is why a style's code size matters more than its speed, and why
the narrowing works by scanning for `    case N: {` at a fixed indent — a new
arm must match that shape or it will never be strippable. Braces inside an arm's
comments break the brace counter; keep them out.

## What is not here

**Bilinear sampling.** Everything samples nearest-neighbour, matching `zoom`.
This is the largest available quality win — a non-uniform warp shimmers more
than a uniform scale does, and rotation is the worst case — but it changes the
character of every existing arm and has to land identically in three emitters,
so it wants its own pass rather than riding along with a style.

**A correspondence morph.** Classic image morphing needs a displacement field,
and both ways of getting one are closed here: authored feature lines need a
human in a loop that does not exist (pattern pairs are chosen at runtime), and
optical flow between two unrelated procedural patterns is both out of the ESP32's
budget and semantically empty — there is no true correspondence between a fire
and a kaleidoscope.

What *would* fit the contract is a **moment-matching morph**: reduce each frame
to its luminance centroid and second moment, warp each toward the other's, then
crossfade. At 16x16 there is no detail to morph, so aligning the mass *is* the
morph, and it degrades honestly onto a strip. It would be the first style needing
a reduction pass before the per-pixel loop, which is a change to the shape
described at the top of this note — cheap on device, but it breaks the "pure
per-pixel" property, so it deserves its own decision.

A noise-displaced liquefy morph is the flashier alternative and is **not**
recommended without care: there is no shared noise between the two sides (C++
uses FastLED's `inoise8`, the TS side has no equivalent), so it would either
require porting `inoise8` bit-exactly or building the field from a shared
analytic hash the way `prnd()` already is.

## Adding a style: checklist

1. Decide it reads at 16x16 from its silhouette, and what it does on `H = 1`.
2. Evaluator: an `eval*` function plus a `compositeTransition` case.
3. `TRANSITION_HELPER_CPP`: a `    case N: {` arm, braces balanced, none in
   comments.
4. `cppGenerator.ts`: the `Transition` node arm.
5. `TRANSITION_IDS`: the next free id — appended, never renumbered.
6. `PROPERTY_META.transitionType`: the name and its label, in the same order as
   the id table. Add an `isPropertyEnabled` row only if it takes a variant
   property.
7. Tests: endpoint exactness and guard-free convergence at several frame sizes,
   plus one assertion that identifies the style by *where* B appears rather than
   how much of it there is — a coverage curve alone passes for anything that
   ends on B.
8. Render it before believing it. A test pattern of vertical bars is invariant
   under vertical compression and will make a tilt look like a wipe.
