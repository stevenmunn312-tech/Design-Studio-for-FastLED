// The runtime pattern selection, on the device.
//
// The rules come from `state/patterns/patternSelection.ts` and the constants are read
// from it rather than restated, so a browse timeout or a detent size cannot
// drift between the preview and the panel.
//
// One half is deliberately missing. Collection reconciliation — the id/index
// cursor that keeps a show on the same pattern when the collection is
// reordered — has nothing to do here: a device's collection is fixed at
// compile time, so there is no "underneath you" for it to change. What is
// shared is the part a user can feel: one cursor that a step moves straight
// away, wrapping at both ends, and an encoder that steps once per detent.

import { ENCODER_COUNTS_PER_STEP, ENCODER_RESEAT_COUNTS } from '../../state/patterns/patternSelection'

/**
 * Forward declaration for the sketch preamble.
 *
 * The Arduino .ino preprocessor hoists a prototype for every function above
 * all user type definitions, so `_selUpdate(PatternSel &s, ...)` names a type
 * that does not exist yet and the build fails on a line no generator wrote.
 * The third struct to need this after OledPanel and SegDisplay — which is why
 * the test asserting it now derives the rule from the emitted source rather
 * than listing the structs by hand.
 */
export const PATTERN_SELECTION_CPP_FORWARD = 'struct PatternSel;'

export const PATTERN_SELECTION_CPP = `// ── Pattern selection ───────────────────────────────────────────────────────
// Mirrors state/patterns/patternSelection.ts. One cursor, the pattern that is
// running: Previous, Next and an encoder move it straight away, so choosing
// the next pattern shows it on the LEDs with nothing to confirm.
#define SEL_COUNTS_PER_STEP ${ENCODER_COUNTS_PER_STEP}
#define SEL_RESEAT_COUNTS   ${ENCODER_RESEAT_COUNTS}

struct PatternSel {
  uint16_t active;
  bool     encSeen;
  long     encLast;
  long     encCarry;
};

static void _selBegin(PatternSel &s) {
  s.active = 0;
  s.encSeen = false; s.encLast = 0; s.encCarry = 0;
}

/*
 * A running encoder count turned into whole selection steps.
 *
 * The generated decoder counts every A/B transition, so one detent of a KY-040
 * is four counts; stepping per count scrolls four patterns per click and reads
 * as a broken encoder rather than a fast one. The first reading is never a
 * step — an encoder parked at 37 when the board boots has not asked for
 * anything — and a jump beyond SEL_RESEAT_COUNTS is a re-seat rather than
 * travel, which is what Reset On Press slamming the count to zero looks like.
 */
static int _selEncoderSteps(PatternSel &s, long position) {
  if (!s.encSeen) { s.encSeen = true; s.encLast = position; s.encCarry = 0; return 0; }
  long delta = position - s.encLast;
  s.encLast = position;
  if (delta > SEL_RESEAT_COUNTS || delta < -SEL_RESEAT_COUNTS) { s.encCarry = 0; return 0; }
  s.encCarry += delta;
  int steps = (int)(s.encCarry / SEL_COUNTS_PER_STEP);
  s.encCarry -= (long)steps * SEL_COUNTS_PER_STEP;
  return steps;
}

/*
 * The user's steps: move the running pattern, wrapping at both ends — a shaft
 * that keeps turning at the end of the list and does nothing feels broken,
 * and an encoder has no ends to hit.
 */
static void _selUpdate(PatternSel &s, uint16_t count, int steps) {
  if (count == 0) { s.active = 0; return; }
  if (s.active >= count) s.active = (uint16_t)(count - 1);
  if (steps == 0) return;
  long n = (long)count;
  s.active = (uint16_t)((((long)s.active + steps) % n + n) % n);
}

/*
 * The show's own advance, by index. Goes through the selection rather than
 * assigning a pattern id directly, so a dwell-driven change and a stepped one
 * move the same cursor.
 */
static void _selSetActive(PatternSel &s, uint16_t count, uint16_t index) {
  if (count == 0) return;
  if (index >= count) index = (uint16_t)(count - 1);
  s.active = index;
}
`
