# Show sequencing

One contract for weighted picks, entry policy, song lanes, ramps, named inputs
and looping sequences. The preview, the slideshow sketch, the generic SD player
and the Performance Generator all follow it. Steps that only store new fields
are additive: a missing field loads as the default below, and a `.show` that
does not use a new command stays byte-identical.

## Pick rule

Each Pattern Collection entry has a weight from 0 to 16, default 1, and an
optional set of energy tags (`calm`, `lively`, `peak`). Section tags stay the
ones `patternSections` already stores. Weight, energy and entry live on the
collection node (`patternWeights`, `patternEnergy`, `patternEntry`). The
`patternset` port stays a list of group ids.

`src/state/patterns/patternPick.ts` chooses the next index. Its C++ twin
`src/codegen/player/patternPickCpp.ts` is emitted only when the collection has
at least two patterns and some weight is 0, the weights are not all equal, any
entry has an energy tag, or a sequence step picks by section tag. Otherwise the
four historical expressions stay in the source, draw for draw:

- preview: `(cur + 1 + Math.floor(rnd() * (n - 1))) % n`
- slideshow: `(cur + 1 + random8(PATTERN_COUNT - 1)) % PATTERN_COUNT`
- SD player selection: `(selActive + 1 + random(PATTERN_COUNT - 1)) % PATTERN_COUNT`
- SD player rotate: `(rotateIndex + 1 + random(patternCount - 1)) % patternCount`

Eligibility, in order:

1. Filter only the dimensions the moment supplies. An empty tag list on an
   entry matches anything. The slideshow has no energy moment, so energy tags
   do not change its draw. The Music Player's moment is the band from
   `pacingIntensity` (calm below 1/3, lively below 2/3, otherwise peak), and
   only when some entry is tagged. The Performance Generator's moment is the
   section type, plus the band of that section's energy against the song's
   section-energy range (a spread under 0.05 is 0.5, the same floor as pacing).
2. If nobody matches, the whole collection is eligible.
3. Drop weight 0. If that leaves nobody, stay. Weight 0 is never auto-picked.
   A confirm, a timeline `SET_PATTERN`, or a sequence step that names the index
   can still reach it.
4. Sequential order walks forward through the positive eligible indices.
5. One remaining choice is taken without a draw.
6. Equal positive weights over the whole collection use the historical formula
   and draw once (sequential still does not draw). Anything else draws
   `floor(rand * totalWeight)` once. The sketch uses `random8` while the total
   is at most 255 and `random` otherwise, so a total above 255 still spreads.

A tagged Music Player turns the decoder tap on the way Energy Pacing does, and
reads that intensity. When Energy Pacing is already on, the pick reuses its
`intensity`. When it is off, the sketch emits the same tracker without leaning
the hold. Dwells & Bursts alone do not gain the tracker.

## Entry policy

Each entry is `restart` (the default, stored by omitting it) or `resume`
(`patternEntry[id] = 'resume'`). The policy applies from the first rendered
frame of the incoming transition.

Restart clears that pattern's preview state by key prefix and runs its clock
from zero. Resume keeps the state and the show clock. While a show is running,
the preview touches every Resume pattern's prefix each frame so the 30 s idle
sweep does not reap it; after the show stops, the sweep can collect it.

The sketch adds `, bool entry` only on a Restart pattern whose render function
has a non-const static or a persistent buffer. The flag is true on that first
frame. A post-pass resets each non-const static to its initializer and
`memset`s arrays and persistent buffers. `static const` and `static constexpr`
are left alone. Resume patterns, stateless patterns, and ordinary sketches do
not gain the parameter, so they stay byte-identical. A transition keeps two
slots. Committing it copies the incoming slot, so the next frame is not a
second entry. A same-pattern transition still renders once and is not a new entry.

## Song lanes

`ShowTimeline` stays the overview strip on the Performance Generator. Edit lanes
opens a full-size dialog (`ShowLaneEditor`) named "Show lanes". It closes on
Escape through `useEscapeLayer`. Lanes are pattern, transition, palette, speed,
brightness, energy, flash, particles, and one lane per named input. Under them
sit the section bands, the beat grid and the energy envelope.

A pattern clip runs from one `SET_PATTERN` to the next. The transition is the
overlap at the boundary; dragging it changes `duration`. Zoom and scroll, drag
to retime with snap to beat, section or nothing, box and shift selection, copy,
paste, delete, keyboard nudges, and undo/redo. Only events in the visible time
window are drawn.

## Ramps and named inputs

`SET_SPEED`, `SET_BRIGHTNESS`, `SET_ENERGY` and `SET_PARAM` take an optional
`rampMs`. The rule in `showRamp.ts` (and `sampleRamp` in a player that uses a
ramp): at the start instant the value is still the previous one; a missing or
zero ramp lands on the new value immediately; in between it interpolates.
`showStateAt` and the performance player both sample it every frame.

The generator writes one ramp where it used to write a ladder: a buildup ramp
to `min(3, baseSpeed * (1 + 1.5 * energySensitivity))` and brightness 255, a
silence ramp to 0 and back, and the five-second boundary. The opening boundary
is a brightness step to 0 at t = 0 followed by a ramp back to the section
brightness over five seconds, so the sampled value is 0 at the start, halfway
at 2.5 s and the section brightness at 5 s. The closing ramp reaches 0 at the
end. Shows with no ramp keep a one-float parameter and the exact loader check.
A show that uses a ramp accepts `count` or `count + 1` on those four commands.

`SET_PARAM` (command byte 8) carries an index into `ShowFile.params`, a float,
and an optional ramp. The name list is a `PARM` trailer after the events and
before `AENV`, written only when the show has one, so other binaries stay
identical. A Group Input whose name is on that list and is a legal identifier
becomes a `float` argument of `render_pN`, the same widening `ROLE_CPP_TYPE`
already does, and a `groupInputs` entry in the preview. A pattern that does not
read the input drops the argument. `CMD_TRANSITION` copies the outgoing values
with the roles.

`ShowFile.version` stays `1 | 2`. New fields:

| Field | When it is absent |
| --- | --- |
| `params` | The show names no inputs. |
| `locks` | No locked span. Combined with `edited` on the music entry, the whole duration is locked (the previous freeze). |
| `sections` | Regeneration reads the analysis sections. |

## Locked ranges

An edit locks the section that contains the changed event. A section band can
also be locked, unlocked, moved or retyped; the moved sections are
`ShowFile.sections`, and regeneration reads those. `regenerateShow` keeps
events inside each lock and regenerates the rest. At `lock.start` it restates
the locked show's pattern, palette, speed, energy and brightness. At `lock.end`
it restates the fresh show's five channels. Revert clears the locks and
regenerates everything. The generator node regenerates even when the entry is
edited; the locks are what protect the manual spans.

`showFreshnessIssues` reports a stale collection or a missing group only when a
locked span still depends on it, and the message names the span. An unlocked
show is regenerated instead of refused.

## Sequences

`Sequence` sits beside Random and Sequential on the Pattern Slideshow and the
Music Player. `sequence` is a list of steps. Each step is a collection index,
or a tag pick (the pick rule above; an explicit index may be weight 0), a hold,
a transition style and length, and optional role and named-input values with a
ramp. An empty list holds the current pattern.

The lane editor edits the sequence on an axis that is the sum of the holds.
With Beat Transitions on, a Music Player hold counts beats from the player's
beat source. Energy Pacing and Dwells & Bursts do not apply. Next and Previous
move between steps and do not also walk the collection index.

The slideshow sketch compiles the steps into a PROGMEM table and drops the
dwell / next-pattern logic. Transition arms narrow to the styles the steps
name. It needs no card. The generic SD player reads the same table.
