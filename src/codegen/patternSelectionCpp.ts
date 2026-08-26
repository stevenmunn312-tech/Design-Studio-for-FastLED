// The runtime pattern selection, on the device.
//
// The rules come from `state/patternSelection.ts` and the constants are read
// from it rather than restated, so a browse timeout or a detent size cannot
// drift between the preview and the panel.
//
// One half is deliberately missing. Collection reconciliation — the id/index
// cursor that keeps a show on the same pattern when the collection is
// reordered — has nothing to do here: a device's collection is fixed at
// compile time, so there is no "underneath you" for it to change. What is
// shared is the part a user can feel: wrapping at both ends, confirm-commits,
// and the split between the pattern that is running and the one being looked
// at.

import {
  PATTERN_BROWSE_TIMEOUT_MS, ENCODER_COUNTS_PER_STEP, ENCODER_RESEAT_COUNTS,
} from '../state/patternSelection'

export const PATTERN_SELECTION_CPP = `// ── Pattern selection ───────────────────────────────────────────────────────
// Mirrors state/patternSelection.ts. active is what is running; highlight is
// what you are looking at. They are the same until the encoder moves, and
// converge again on a press or after the browse window closes — without that
// split, scrolling past a pattern would play it.
#define SEL_BROWSE_MS       ${PATTERN_BROWSE_TIMEOUT_MS}
#define SEL_COUNTS_PER_STEP ${ENCODER_COUNTS_PER_STEP}
#define SEL_RESEAT_COUNTS   ${ENCODER_RESEAT_COUNTS}

struct PatternSel {
  uint16_t active;
  uint16_t highlight;
  uint32_t browseUntilMs;   // 0 = not browsing
  bool     encSeen;
  long     encLast;
  long     encCarry;
};

static void _selBegin(PatternSel &s) {
  s.active = 0; s.highlight = 0; s.browseUntilMs = 0;
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
 * One update, in the order the rules have to happen.
 *
 * Expire first so a closed browse window snaps the highlight back, then the
 * user's turn, then the confirm — a press and a timeout landing on the same
 * frame resolve in the user's favour rather than by whichever ran first.
 * Returns true when the active pattern changed.
 */
static bool _selUpdate(PatternSel &s, uint16_t count, uint32_t now, int steps, bool confirm) {
  if (count == 0) { s.active = 0; s.highlight = 0; s.browseUntilMs = 0; return false; }
  if (s.active >= count) s.active = (uint16_t)(count - 1);
  if (s.browseUntilMs != 0 && (int32_t)(now - s.browseUntilMs) >= 0) s.browseUntilMs = 0;
  if (s.browseUntilMs == 0) s.highlight = s.active;
  if (s.highlight >= count) s.highlight = (uint16_t)(count - 1);

  if (steps != 0) {
    // Wraps rather than stopping: a shaft that keeps turning at the end of the
    // list and does nothing feels broken, and an encoder has no ends to hit.
    long next = (long)s.highlight + steps;
    long n = (long)count;
    next = ((next % n) + n) % n;
    s.highlight = (uint16_t)next;
    s.browseUntilMs = now + SEL_BROWSE_MS;
    if (s.browseUntilMs == 0) s.browseUntilMs = 1;   // 0 means "not browsing"
  }

  if (confirm) {
    bool changed = s.highlight != s.active;
    s.active = s.highlight;
    // Confirming what is already playing changes nothing but still ends the
    // browse, which is what a press means when you land back where you started.
    s.browseUntilMs = 0;
    return changed;
  }
  return false;
}

static bool _selBrowsing(const PatternSel &s) { return s.browseUntilMs != 0; }
`
