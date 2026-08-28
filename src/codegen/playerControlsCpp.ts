// The `playercontrols` bundle, in a normal sketch.
//
// The SD player builds this bundle inside its own template, from a fixed set
// of GPIO bindings, and applies it straight to its transport. A normal sketch
// cannot: the bundle's inputs are ordinary graph wires — a Button, a pot, an
// encoder, a touch panel — and the generator already has an expression for
// each. What it lacked was somewhere to put the result, and the edge rules to
// get there.
//
// Both halves are shared rather than restated. The debounce, repeat delay and
// repeat interval come from `state/transportBridge.ts`, the same numbers the
// evaluator runs, so a press means one thing in the preview and on the bench.
// What an LED output then does with the bundle lives in
// `state/ledOutputRuntime.ts` and is mirrored by `ledOutputLatchCpp` below.
//
// Every struct here carries its state in member functions rather than in free
// functions taking it by reference, which sidesteps the Arduino prototype
// hoist entirely — see codegen/infoDisplayCpp.ts for what that costs when it
// is not sidestepped.

import { type ButtonEdgeSettings } from '../state/transportBridge'
import { ENCODER_COUNTS_PER_STEP, ENCODER_RESEAT_COUNTS } from '../state/patternSelection'

/** One button feeding the bundle, and whether holding it should repeat. */
export interface PlayerControlButtonEmit {
  /** Bundle field this press contributes to. */
  port: string
  /** C++ bool expression for the raw contact. */
  expr: string
  /** Adjustment buttons repeat on a hold; one-shot actions do not. */
  repeat: boolean
}

export interface PlayerControlsEmit {
  /** Stable C identifier stem for this node's statics. */
  id: string
  /** Variable holding the finished bundle. */
  variable: string
  /** Upstream bundle variable, when `controlsIn` is wired. */
  upstream: string | null
  buttons: PlayerControlButtonEmit[]
  /** Absolute wires, by bundle field. */
  volumeExpr: string | null
  brightnessExpr: string | null
  /** Encoder position feeding pattern selection, in raw counts. */
  patternPositionExpr: string | null
  settings: ButtonEdgeSettings
  /** How much one up/down press moves each 0-1 value. */
  volumeStep: number
  brightnessStep: number
}

/**
 * The bundle as a plain value, and the debounce that fills it.
 *
 * `hasVolume` / `hasBrightness` rather than a sentinel: the evaluator's bundle
 * leaves those fields *absent* when nothing is wired, and "absent" has to
 * survive the crossing. A sentinel like -1 would be a value a slider could
 * legitimately produce after a rounding error, and the difference between "no
 * opinion" and "zero" is the difference between a fixture that keeps its
 * brightness and one that goes dark.
 */
export const PLAYER_CONTROLS_CPP = `// ── Player controls ─────────────────────────────────────────────────────────
struct PlayerControlsValue {
  bool  playPause = false, previous = false, next = false;
  float volumeDelta = 0.0f;
  bool  hasVolume = false;   float volume = 0.0f;
  bool  ledToggle = false;
  float brightnessDelta = 0.0f;
  bool  hasBrightness = false; float brightness = 0.0f;
  int   patternSteps = 0;
  bool  patternConfirm = false;
};

// Mirrors buttonEdge() in state/transportBridge.ts. A press is the debounced
// rising edge; a hold repeats only after a deliberate delay, so a fast tap
// cannot register twice and a held adjustment button ramps rather than crawls.
struct CtlEdge {
  bool raw = false, stable = false;
  uint32_t changedAt = 0, repeatAt = 0;
  bool update(bool nextRaw, uint32_t now, bool repeat,
              uint32_t debounceMs, uint32_t repeatDelayMs, uint32_t repeatIntervalMs) {
    if (nextRaw != raw) { raw = nextRaw; changedAt = now; }
    if (stable != raw && now - changedAt >= debounceMs) {
      stable = raw;
      if (stable) { repeatAt = now + repeatDelayMs; return true; }
    }
    if (repeat && stable && (int32_t)(now - repeatAt) >= 0) {
      repeatAt = now + repeatIntervalMs;
      return true;
    }
    return false;
  }
};

// Raw quadrature counts into whole detents, matching encoderSteps() in
// state/patternSelection.ts: four counts per click, and the first reading is
// never a step, because an encoder parked at 37 when the board boots has not
// asked for anything. The numbers are read from that module rather than from
// PATTERN_SELECTION_CPP's macros, which are emitted only when a browser or a
// physical pattern control needs them and are not this block's to depend on.
struct CtlDetent {
  bool seen = false;
  long last = 0, carry = 0;
  int update(long position) {
    if (!seen) { seen = true; last = position; carry = 0; return 0; }
    long delta = position - last;
    last = position;
    if (delta > ${ENCODER_RESEAT_COUNTS} || delta < -${ENCODER_RESEAT_COUNTS}) { carry = 0; return 0; }
    carry += delta;
    int steps = (int)(carry / ${ENCODER_COUNTS_PER_STEP});
    carry -= (long)steps * ${ENCODER_COUNTS_PER_STEP};
    return steps;
  }
};
`

/** C++ float literal — "4f" is not one, "4.0f" is. */
function fl(value: number): string {
  const rounded = (+value.toFixed(4)).toString()
  return (rounded.includes('.') ? rounded : `${rounded}.0`) + 'f'
}

/**
 * Build one node's bundle for this pass of the loop.
 *
 * An upstream bundle is folded in the way the evaluator folds it: an action is
 * true if either end pressed it, deltas add, and an absolute value wired here
 * wins over one arriving from upstream — the nearer control is the one the
 * user just touched.
 */
export function playerControlsServiceCpp(emit: PlayerControlsEmit): string[] {
  const { id, variable, settings } = emit
  const lines: string[] = []
  for (const button of emit.buttons) {
    lines.push(`  static CtlEdge _pcE_${id}_${button.port};`)
  }
  if (emit.patternPositionExpr) lines.push(`  static CtlDetent _pcD_${id};`)

  lines.push(`  PlayerControlsValue ${variable};`)
  lines.push(`  { // Player Controls`)
  if (emit.upstream) lines.push(`    ${variable} = ${emit.upstream};`)
  lines.push(`    uint32_t _pcNow_${id} = millis();`)

  const edge = (button: PlayerControlButtonEmit) =>
    `_pcE_${id}_${button.port}.update(${button.expr}, _pcNow_${id}, ${button.repeat}, `
    + `${Math.round(settings.debounceMs)}u, ${Math.round(settings.repeatDelayMs)}u, ${Math.round(settings.repeatIntervalMs)}u)`

  // Actions: either end pressing it is a press.
  for (const port of ['playPause', 'previous', 'next', 'ledToggle', 'patternConfirm'] as const) {
    const button = emit.buttons.find((b) => b.port === port)
    if (button) lines.push(`    if (${edge(button)}) ${variable}.${port} = true;`)
  }

  // Adjustments: a step per press, accumulating onto anything upstream sent.
  const stepPair = (up: string, down: string, field: string, step: number) => {
    const upButton = emit.buttons.find((b) => b.port === up)
    const downButton = emit.buttons.find((b) => b.port === down)
    if (upButton) lines.push(`    if (${edge(upButton)}) ${variable}.${field} += ${fl(step)};`)
    if (downButton) lines.push(`    if (${edge(downButton)}) ${variable}.${field} -= ${fl(step)};`)
  }
  stepPair('volumeUp', 'volumeDown', 'volumeDelta', emit.volumeStep)
  stepPair('brightnessUp', 'brightnessDown', 'brightnessDelta', emit.brightnessStep)

  // Pattern intent: buttons step by one, an encoder by however many detents it
  // turned. Both, because a panel may have three buttons and no encoder.
  const patternNext = emit.buttons.find((b) => b.port === 'patternNext')
  const patternPrevious = emit.buttons.find((b) => b.port === 'patternPrevious')
  if (patternNext) lines.push(`    if (${edge(patternNext)}) ${variable}.patternSteps += 1;`)
  if (patternPrevious) lines.push(`    if (${edge(patternPrevious)}) ${variable}.patternSteps -= 1;`)
  if (emit.patternPositionExpr) {
    lines.push(`    ${variable}.patternSteps += _pcD_${id}.update((long)(${emit.patternPositionExpr}));`)
  }

  // Absolutes: wired here beats wired upstream, and unwired stays absent.
  if (emit.volumeExpr) {
    lines.push(`    ${variable}.hasVolume = true;`)
    lines.push(`    ${variable}.volume = constrain(${emit.volumeExpr}, 0.0f, 1.0f);`)
  }
  if (emit.brightnessExpr) {
    lines.push(`    ${variable}.hasBrightness = true;`)
    lines.push(`    ${variable}.brightness = constrain(${emit.brightnessExpr}, 0.0f, 1.0f);`)
  }
  lines.push(`  }`)
  return lines
}

export interface LedOutputLatchEmit {
  /** Stable C identifier fragment, shared with this output's other locals. */
  id: string
  /** The bundle variable feeding this output. */
  controls: string
}

/** File-scope state for one output's latch, by identifier stem. */
export function ledOutputLatchGlobalCpp(id: string): string {
  return `static bool _ledOn_${id} = true; static float _ledLevel_${id} = 1.0f;`
}

/**
 * Fold one frame's bundle into an output's latch.
 *
 * The firmware mirror of `applyLedControls` in `state/ledOutputRuntime.ts`,
 * in the same order for the same reason: absolute first so a wired knob sets
 * the level, then the delta so up/down buttons nudge it, rather than the knob
 * silently undoing every press on the next frame.
 *
 * Emitted at the top of the output's own case, which topological order puts
 * after the node that built the bundle and before anything reads the latch.
 * Per output rather than per bundle: two fixtures wired to one Player Controls
 * both go dark on a press, and each remembers its own level from there.
 */
export function ledOutputLatchCpp(emit: LedOutputLatchEmit): string[] {
  const { id, controls } = emit
  return [
    `  { // LED output controls latch`,
    `    if (${controls}.hasBrightness) _ledLevel_${id} = constrain(${controls}.brightness, 0.0f, 1.0f);`,
    `    if (${controls}.brightnessDelta != 0.0f) _ledLevel_${id} = constrain(_ledLevel_${id} + ${controls}.brightnessDelta, 0.0f, 1.0f);`,
    `    if (${controls}.ledToggle) _ledOn_${id} = !_ledOn_${id};`,
    `  }`,
  ]
}
