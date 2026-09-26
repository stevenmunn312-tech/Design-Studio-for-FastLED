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

/** Adjustment buttons repeat; transport and blackout fire once per press. */
export const PLAYER_CONTROL_BUTTONS: ReadonlyArray<readonly [string, boolean]> = [
  ['playPause', false], ['previous', false], ['next', false],
  ['volumeUp', true], ['volumeDown', true], ['ledToggle', false],
  ['brightnessUp', true], ['brightnessDown', true],
  ['patternPrevious', true], ['patternNext', true], ['patternConfirm', false],
]

/** One button feeding the bundle, and whether holding it should repeat. */
export interface PlayerControlButtonEmit {
  /** Bundle field this press contributes to. */
  port: string
  /** C++ bool expression for the raw contact — or, for a `tap`, an integer count. */
  expr: string
  /** Adjustment buttons repeat on a hold; one-shot actions do not. */
  repeat: boolean
  /**
   * `press` (the default) is the debounced rising edge of a contact. `tap`
   * fires once each time an integer gesture count moves: a screen Toggle's
   * value also follows its Set feedback, so only the count says a finger did
   * it. See state/designControlBundle.ts.
   */
  edge?: 'press' | 'tap'
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
  /** Master Speed, when a control has been given that job. */
  speedExpr?: string | null
  brightnessExpr: string | null
  /**
   * Holds an absolute back until it is true: a screen slider on the Controls
   * wire commands nothing until a finger has moved it, or its starting value
   * would override the LED output's level and the player's volume at boot.
   */
  volumeGateExpr?: string | null
  brightnessGateExpr?: string | null
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
  // Master Speed, present only while a control has been given that job — the
  // same has/value pair volume and brightness use, and for the same reason: an
  // unwired bundle must not overrule the node's own setting.
  bool  hasSpeed = false;    float speed = 1.0f;
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

// A finger's gesture count, as one event per change. The first reading is
// never an event, for the same reason an encoder's is not: a count found at
// boot is not something anybody just did.
struct CtlTap {
  bool seen = false;
  uint32_t last = 0;
  bool update(uint32_t count) {
    if (!seen) { seen = true; last = count; return false; }
    bool moved = count != last;
    last = count;
    return moved;
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
    lines.push(`  static ${button.edge === 'tap' ? 'CtlTap' : 'CtlEdge'} _pcE_${id}_${button.port};`)
  }
  if (emit.patternPositionExpr) lines.push(`  static CtlDetent _pcD_${id};`)

  lines.push(`  PlayerControlsValue ${variable};`)
  lines.push(`  { // Control Map`)
  if (emit.upstream) lines.push(`    ${variable} = ${emit.upstream};`)
  // Only a debounced press reads the clock; a bundle of taps and levels alone
  // would otherwise carry an unused local and a warning with it.
  if (emit.buttons.some((button) => button.edge !== 'tap')) lines.push(`    uint32_t _pcNow_${id} = millis();`)

  const edge = (button: PlayerControlButtonEmit) => button.edge === 'tap'
    ? `_pcE_${id}_${button.port}.update((uint32_t)(${button.expr}))`
    : `_pcE_${id}_${button.port}.update(${button.expr}, _pcNow_${id}, ${button.repeat}, `
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
    const pad = emit.volumeGateExpr ? '  ' : ''
    if (emit.volumeGateExpr) lines.push(`    if (${emit.volumeGateExpr}) {`)
    lines.push(`    ${pad}${variable}.hasVolume = true;`)
    lines.push(`    ${pad}${variable}.volume = constrain(${emit.volumeExpr}, 0.0f, 1.0f);`)
    if (emit.volumeGateExpr) lines.push(`    }`)
  }
  if (emit.brightnessExpr) {
    const pad = emit.brightnessGateExpr ? '  ' : ''
    if (emit.brightnessGateExpr) lines.push(`    if (${emit.brightnessGateExpr}) {`)
    lines.push(`    ${pad}${variable}.hasBrightness = true;`)
    lines.push(`    ${pad}${variable}.brightness = constrain(${emit.brightnessExpr}, 0.0f, 1.0f);`)
    if (emit.brightnessGateExpr) lines.push(`    }`)
  }
  if (emit.speedExpr) {
    lines.push(`    ${variable}.hasSpeed = true;`)
    lines.push(`    ${variable}.speed = ${emit.speedExpr};`)
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
 * Per output rather than per bundle: two fixtures wired to one Control Map
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

/**
 * A screen design's Controls, as the same bundle a Control Map builds.
 *
 * `controls` is `designControlBundle`'s answer for one panel. Each generator
 * supplies how it names a sampled widget output and a Toggle's gesture count,
 * which is the only part that differs between them. A touch sample needs no
 * debounce — LVGL has already decided what the finger did — so none is added.
 */
export function designControlBundleEmit(
  id: string,
  variable: string,
  controls: readonly { widgetId: string; portId: string; field: string; edge: 'press' | 'tap' | 'level' }[],
  sampleExpr: (portId: string, type: 'bool' | 'float') => string | null,
  tapExpr: (widgetId: string) => string | null,
): PlayerControlsEmit {
  const buttons: PlayerControlButtonEmit[] = []
  let volumeExpr: string | null = null
  let brightnessExpr: string | null = null
  let volumeGateExpr: string | null = null
  let brightnessGateExpr: string | null = null
  for (const control of controls) {
    if (control.edge === 'level') {
      const expr = sampleExpr(control.portId, 'float')
      // Commands nothing until moved, as in the preview's bundle.
      const moved = tapExpr(control.widgetId)
      const gate = moved ? `${moved} > 0` : null
      if (control.field === 'volume') { volumeExpr = expr; volumeGateExpr = gate }
      else if (control.field === 'brightness') { brightnessExpr = expr; brightnessGateExpr = gate }
      continue
    }
    const expr = control.edge === 'tap' ? tapExpr(control.widgetId) : sampleExpr(control.portId, 'bool')
    if (!expr) continue
    buttons.push({ port: control.field, expr, repeat: false, edge: control.edge === 'tap' ? 'tap' : 'press' })
  }
  return {
    id, variable, upstream: null, buttons, volumeExpr, brightnessExpr, volumeGateExpr, brightnessGateExpr, patternPositionExpr: null,
    settings: { debounceMs: 0, repeatDelayMs: 400, repeatIntervalMs: 120 },
    volumeStep: 0.05, brightnessStep: 0.05,
  }
}
