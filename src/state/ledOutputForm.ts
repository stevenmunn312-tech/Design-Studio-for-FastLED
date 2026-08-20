// What shape of LED product an output actually is.
//
// Before this, the same question was answered by two properties that never
// really meant it: `chipset === 'HUB75'` said "this is a scan panel" while
// pretending to name a wire protocol, and `layout === 'strip'` said "this is a
// run of tape" while pretending to describe a wiring order. Neither could
// express a ring at all, and both let a graph hold combinations that do not
// exist on a bench — a HUB75 panel with a custom XY permutation, a strip with
// a tile grid.
//
// `form` is the one property that says what the thing is. Everything else —
// how many LEDs there are, what the composition canvas looks like, which
// editors apply — follows from it.

/** The four things you can buy. */
export type LedOutputForm = 'strip' | 'matrix' | 'ring' | 'hub75'

export const LED_OUTPUT_FORMS: readonly LedOutputForm[] = ['strip', 'matrix', 'ring', 'hub75']

/**
 * The node's title per form, and the name of the part in the hardware view.
 *
 * "LED String" rather than "LED Strip" because that is what the Phase 1
 * hardware pane already called it, and the user's vocabulary is the one the
 * app should keep.
 */
export const LED_OUTPUT_FORM_LABELS: Record<LedOutputForm, string> = {
  strip: 'LED String',
  matrix: 'LED Matrix',
  ring: 'LED Ring',
  hub75: 'HUB75 Panel',
}

/**
 * The form-agnostic name, for copy that means "the output node" without
 * committing to one of the four forms — help prose, Graph Health fixes, and
 * the Start Gallery's graph maps, whose starters would otherwise all name the
 * matrix specifically. The per-form labels above stay the node's own title.
 */
export const LED_OUTPUT_GENERIC_LABEL = 'LED Output'

export type RingDirection = 'cw' | 'ccw'

/** Composition-canvas and LED-count bounds, shared by every caller so the
 *  preview, the validator and the generator clamp identically. */
export const MAX_LED_RUN = 300
export const MAX_MATRIX_SIDE = 64

function int(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Math.round(Number(value))
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback
}

/**
 * The form an output node is in.
 *
 * Explicit `form` wins. The fallback is the legacy read: a project saved before
 * this property existed still says "scan panel" by setting its chipset to
 * HUB75, and inferring that here means such a graph opens as the panel it
 * always was rather than as an addressable matrix that would drive the wrong
 * pins entirely. `graphStore`'s load migration writes the inferred value back,
 * so this only ever runs once per saved node.
 *
 * Deliberately *not* inferred from `layout: 'strip'`. That value never meant a
 * one-dimensional run — `xyLayout` treats it identically to `'matrix'`, so it
 * only ever said "this grid is wired as one continuous chain", and reading it
 * as the strip form would turn a saved 16x4 panel into a 60-LED string.
 */
export function outputForm(props: Record<string, unknown> | undefined | null): LedOutputForm {
  const explicit = props?.form
  if (explicit === 'strip' || explicit === 'matrix' || explicit === 'ring' || explicit === 'hub75') {
    return explicit
  }
  if (String(props?.chipset ?? '') === 'HUB75') return 'hub75'
  return 'matrix'
}

/** True for the forms that are physically one chain with no second axis. */
export function isLinearForm(form: LedOutputForm): boolean {
  return form === 'strip' || form === 'ring'
}

/**
 * How many physical LEDs the output drives — the length of the `leds` array in
 * firmware, and what the power and RAM estimates count.
 */
export function outputLedTotal(props: Record<string, unknown>): number {
  const form = outputForm(props)
  if (isLinearForm(form)) return int(props.ledCount, 60, 1, MAX_LED_RUN)
  return int(props.width, 16, 1, MAX_MATRIX_SIDE) * int(props.height, 16, 1, MAX_MATRIX_SIDE)
}

/**
 * The output's own pixel grid: the shape frames are routed *into*, and the
 * shape the physical chain is addressed through.
 *
 * A strip and a ring are both one row of N — a ring's circle is a fact about
 * where its LEDs sit in space, not about the order they are wired in, and the
 * wire order is what a frame buffer indexes.
 */
export function outputGridDims(props: Record<string, unknown>): { width: number; height: number } {
  const form = outputForm(props)
  if (isLinearForm(form)) return { width: int(props.ledCount, 60, 1, MAX_LED_RUN), height: 1 }
  return {
    width: int(props.width, 16, 1, MAX_MATRIX_SIDE),
    height: int(props.height, 16, 1, MAX_MATRIX_SIDE),
  }
}

/**
 * The diameter, in composition pixels, of the canvas a ring reads from.
 *
 * A ring cannot share the strip's "N wide, 1 tall" footprint on the shared
 * composition canvas: sampling a circle out of a single row is meaningless, and
 * a ring-only graph would size the canvas 1 pixel tall and render nothing a
 * radial pattern could be seen in. So a ring asks for the square that its own
 * circumference implies — `circumference = pi * D`, so `D = N / pi` — which
 * puts roughly one canvas pixel under each LED. A 24-LED ring reads an 8x8
 * canvas, a 60-LED ring a 19x19 one.
 */
export function ringCanvasDiameter(ledCount: number): number {
  return Math.max(3, Math.min(MAX_MATRIX_SIDE, Math.round(int(ledCount, 60, 1, MAX_LED_RUN) / Math.PI)))
}

/**
 * The footprint this output contributes to the shared composition canvas —
 * which is its own grid for every form except a ring, whose circle needs two
 * real axes (see `ringCanvasDiameter`).
 */
export function outputCanvasDims(props: Record<string, unknown>): { width: number; height: number } {
  if (outputForm(props) === 'ring') {
    const d = ringCanvasDiameter(Number(props.ledCount ?? 60))
    return { width: d, height: d }
  }
  return outputGridDims(props)
}

export function ringDirection(props: Record<string, unknown>): RingDirection {
  return props.ringDirection === 'ccw' ? 'ccw' : 'cw'
}

export function ringStartAngle(props: Record<string, unknown>): number {
  const angle = Number(props.ringStartAngle ?? 0)
  if (!Number.isFinite(angle)) return 0
  // Any full turn is the same ring, so fold rather than clamp — an angle
  // arrived at by dragging past 360 should keep going, not stick.
  return ((angle % 360) + 360) % 360
}

/**
 * Where each LED of a ring reads from on the composition canvas: one row-major
 * canvas index per physical LED, in wire order.
 *
 * This is the ring's XY mapping, and it is the whole difference between a ring
 * and a strip of the same length — a strip reads a line, a ring reads a circle.
 * Angles are measured from 12 o'clock so `startAngle: 0` is the top of the ring
 * (where the data-in pad usually sits on the rings people buy), and `cw` runs
 * the way a clock does when you look at the front of the ring.
 *
 * Pure and integer-valued so the live preview and the generated PROGMEM table
 * are the same map by construction, not by two implementations agreeing.
 */
export function ringSampleMap(
  ledCount: number,
  startAngleDeg: number,
  direction: RingDirection,
  canvasW: number,
  canvasH: number,
): number[] {
  const count = int(ledCount, 60, 1, MAX_LED_RUN)
  const w = Math.max(1, Math.round(canvasW))
  const h = Math.max(1, Math.round(canvasH))
  const cx = (w - 1) / 2
  const cy = (h - 1) / 2
  // The inscribed circle through pixel centres: the ring sits on the outermost
  // ring of pixels the canvas actually has, so a pattern drawn to the edge
  // reaches it.
  const radius = Math.max(0, Math.min(cx, cy))
  const sign = direction === 'ccw' ? -1 : 1
  const start = (((startAngleDeg % 360) + 360) % 360) * Math.PI / 180
  const map = new Array<number>(count)
  for (let i = 0; i < count; i++) {
    const theta = start + (sign * i * 2 * Math.PI / count)
    const x = Math.min(w - 1, Math.max(0, Math.round(cx + (radius * Math.sin(theta)))))
    // Canvas y grows downward, so 12 o'clock is -cos.
    const y = Math.min(h - 1, Math.max(0, Math.round(cy - (radius * Math.cos(theta)))))
    map[i] = (y * w) + x
  }
  return map
}

/** The ring map for an output node's own properties, against its own canvas. */
export function ringSampleMapForProps(props: Record<string, unknown>): number[] {
  const { width, height } = outputCanvasDims(props)
  return ringSampleMap(
    Number(props.ledCount ?? 60),
    ringStartAngle(props),
    ringDirection(props),
    width,
    height,
  )
}
