/**
 * A Touch Screen's Controls bundle over the board link.
 *
 * The sending board already builds the bundle (`PlayerControlsValue`) from its
 * panel's touch regions or screen design. It sends that finished bundle as
 * separate values, decided by `touchControlsFields`: each one-shot field as a
 * counted press, each level with a flag saying a finger has set it. The
 * receiving board rebuilds a bundle from them with the same service a Player
 * Controls node uses (`playerControlsServiceCpp`), so whatever reads Controls
 * there, in a normal sketch or a template, is handed an ordinary bundle
 * variable. See docs/design/board-links.md.
 */

import { boardLinkPropertiesOf } from '../../build/boardLinks'
import { BUNDLE_LEVEL_FIELDS, BUNDLE_PRESS_FIELDS, bundleLevelSetField } from '../../build/boardLinkControls'
import type { StudioNode } from '../../state/graphStore'
import type { PlayerControlsEmit } from '../player/playerControlsCpp'
import { boardLinkFieldExpressions, type BoardLinkPlan } from './espNowLinkCpp'

const PRESS = new Set<string>(BUNDLE_PRESS_FIELDS)

/**
 * What one field of a sending board's bundle `bundle` (a `PlayerControlsValue`
 * variable) is staged from. A press is the bundle's one-pass pulse; the
 * pattern steps split into their two directions. A level is held at the last
 * value a finger set, and its flag stays true once one has, because the
 * bundle names a level only on the passes a finger sets it and the receiver
 * must not drop back to "no opinion" between frames.
 */
export function boardLinkControlsSendExpr(bundle: string, field: string): string | null {
  if (field === 'patternNext') return `(${bundle}.patternSteps > 0)`
  if (field === 'patternPrevious') return `(${bundle}.patternSteps < 0)`
  if (PRESS.has(field)) return `${bundle}.${field}`
  for (const level of BUNDLE_LEVEL_FIELDS) {
    const has = level === 'volume' ? 'hasVolume' : 'hasBrightness'
    if (field === level) {
      return `([&]() { static float held = 0.0f; if (${bundle}.${has}) held = ${bundle}.${level}; return held; }())`
    }
    if (field === bundleLevelSetField(level)) {
      return `([&]() { static bool set = false; if (${bundle}.${has}) set = true; return set; }())`
    }
  }
  return null
}

/**
 * The bundle a link-in carrying Controls stands for, as a Player Controls
 * service over the received fields, filling `variable`. Each press reads true
 * for exactly one pass per press the sender counted, so it takes no debounce
 * and no repeat: the sending board already applied both. Null when `node` is
 * not such a link-in.
 */
export function boardLinkControlsEmit(
  plan: BoardLinkPlan | null,
  node: StudioNode,
  id: string,
  variable: string,
): PlayerControlsEmit | null {
  const props = boardLinkPropertiesOf(node)
  if (!plan || !props || props.dataType !== 'playercontrols') return null
  const fields = boardLinkFieldExpressions(plan, props)
  const level = (field: (typeof BUNDLE_LEVEL_FIELDS)[number]) => fields[field] ?? null
  const gate = (field: (typeof BUNDLE_LEVEL_FIELDS)[number]) => fields[bundleLevelSetField(field)] ?? null
  return {
    id,
    variable,
    upstream: null,
    buttons: BUNDLE_PRESS_FIELDS
      .filter((field) => fields[field])
      .map((field) => ({ port: field, expr: fields[field], repeat: false, debounce: false })),
    volumeExpr: level('volume'),
    volumeGateExpr: gate('volume'),
    brightnessExpr: level('brightness'),
    brightnessGateExpr: gate('brightness'),
    patternPositionExpr: null,
    settings: { debounceMs: 0, repeatDelayMs: 400, repeatIntervalMs: 120 },
    volumeStep: 0.05,
    brightnessStep: 0.05,
  }
}
