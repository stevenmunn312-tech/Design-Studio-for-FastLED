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

/** The output forms the authoring geometry understands. */
export type LedOutputForm = 'strip' | 'matrix' | 'ring' | 'corkscrew' | 'hub75'

export const LED_OUTPUT_FORMS: readonly LedOutputForm[] = ['strip', 'matrix', 'ring', 'corkscrew', 'hub75']

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
  corkscrew: 'LED Corkscrew',
  hub75: 'HUB75 Panel',
}

export type RingDirection = 'cw' | 'ccw'
export type CorkscrewDirection = RingDirection

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
  if (explicit === 'strip' || explicit === 'matrix' || explicit === 'ring' || explicit === 'corkscrew' || explicit === 'hub75') {
    return explicit
  }
  if (String(props?.chipset ?? '') === 'HUB75') return 'hub75'
  return 'matrix'
}

/** True for the forms that are physically one chain with no second axis. */
export function isLinearForm(form: LedOutputForm): boolean {
  return form === 'strip' || form === 'ring' || form === 'corkscrew'
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
 * A string, ring, and corkscrew are all one row of N — their visible geometry
 * is a fact about where the chain sits in space, not about the order it is
 * wired in, and wire order is what a frame buffer indexes.
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
 * which is its own grid except for rings and corkscrews, whose physical forms
 * need two-axis authoring canvases (see the geometry helpers below).
 */
export function outputCanvasDims(props: Record<string, unknown>): { width: number; height: number } {
  if (outputForm(props) === 'ring') {
    const d = ringCanvasDiameter(Number(props.ledCount ?? 60))
    return { width: d, height: d }
  }
  if (outputForm(props) === 'corkscrew') return corkscrewCanvasDimsForProps(props)
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

/** Physical bounds for a corkscrew layout. These are authoring dimensions,
 *  not a guessed stock part: a strip can be wound around any cylinder, so the
 *  person building it supplies the diameter and finished height. */
export function corkscrewDiameterMm(props: Record<string, unknown>): number {
  const value = Number(props.corkscrewDiameterMm ?? 100)
  return Number.isFinite(value) ? Math.max(10, Math.min(2000, value)) : 100
}

export function corkscrewHeightMm(props: Record<string, unknown>): number {
  const value = Number(props.corkscrewHeightMm ?? 300)
  return Number.isFinite(value) ? Math.max(10, Math.min(4000, value)) : 300
}

export function corkscrewTurns(props: Record<string, unknown>): number {
  const value = Number(props.corkscrewTurns ?? 6)
  return Number.isFinite(value) ? Math.max(0.5, Math.min(32, value)) : 6
}

export function corkscrewDirection(props: Record<string, unknown>): CorkscrewDirection {
  return props.corkscrewDirection === 'ccw' ? 'ccw' : 'cw'
}

export function corkscrewStartAngle(props: Record<string, unknown>): number {
  const angle = Number(props.corkscrewStartAngle ?? 0)
  if (!Number.isFinite(angle)) return 0
  return ((angle % 360) + 360) % 360
}

/**
 * The unwrapped cylindrical canvas used to author a corkscrew.
 *
 * Width represents distance around the cylinder (pi * diameter); height is the
 * finished axial height. The grid keeps roughly one authoring pixel per LED
 * while preserving that physical aspect ratio, capped to the same 64-pixel
 * sides as every other composition canvas. This is deliberately not a matrix
 * disguised as a chain: `corkscrewSampleMap` below traces a helix across the
 * unwrapped surface and the physical output remains one N-LED run.
 */
export function corkscrewCanvasDims(
  ledCount: number,
  diameterMm: number,
  heightMm: number,
): { width: number; height: number } {
  const count = int(ledCount, 120, 1, MAX_LED_RUN)
  const diameter = Number.isFinite(diameterMm) ? Math.max(10, Math.min(2000, diameterMm)) : 100
  const physicalHeight = Number.isFinite(heightMm) ? Math.max(10, Math.min(4000, heightMm)) : 300
  const aspect = Math.max(1 / MAX_MATRIX_SIDE, Math.min(MAX_MATRIX_SIDE, (Math.PI * diameter) / physicalHeight))
  let width = Math.max(3, Math.round(Math.sqrt(count * aspect)))
  let height = Math.max(3, Math.round(count / width))
  if (width > MAX_MATRIX_SIDE) {
    width = MAX_MATRIX_SIDE
    height = Math.max(3, Math.min(MAX_MATRIX_SIDE, Math.round(count / width)))
  }
  if (height > MAX_MATRIX_SIDE) {
    height = MAX_MATRIX_SIDE
    width = Math.max(3, Math.min(MAX_MATRIX_SIDE, Math.round(count / height)))
  }
  return { width, height }
}

export function corkscrewCanvasDimsForProps(props: Record<string, unknown>): { width: number; height: number } {
  return corkscrewCanvasDims(
    Number(props.ledCount ?? 120),
    corkscrewDiameterMm(props),
    corkscrewHeightMm(props),
  )
}

/** The angular position of one physical LED around the corkscrew's cylinder.
 *  Shared by the authoring map and its dedicated physical preview. */
export function corkscrewAngleAt(
  index: number,
  ledCount: number,
  turns: number,
  startAngleDeg: number,
  direction: CorkscrewDirection,
): number {
  const count = Math.max(1, Math.round(ledCount))
  const progress = count <= 1 ? 0 : Math.max(0, Math.min(count - 1, index)) / (count - 1)
  const sign = direction === 'ccw' ? -1 : 1
  return (startAngleDeg * Math.PI / 180) + (sign * progress * turns * Math.PI * 2)
}

/**
 * One row-major composition index per LED in physical wire order.
 *
 * The cylinder is unwrapped into a rectangle: X travels around its
 * circumference, Y travels from the top of the build to the bottom, and the
 * LED chain crosses that surface `turns` times. Angle zero is the front-centre
 * seam in the physical preview; the back of the cylinder is placed at the two
 * horizontal canvas edges so designs can intentionally wrap through it.
 */
export function corkscrewSampleMap(
  ledCount: number,
  turns: number,
  startAngleDeg: number,
  direction: CorkscrewDirection,
  canvasW: number,
  canvasH: number,
): number[] {
  const count = int(ledCount, 120, 1, MAX_LED_RUN)
  const safeTurns = Number.isFinite(turns) ? Math.max(0.5, Math.min(32, turns)) : 6
  const w = Math.max(1, Math.round(canvasW))
  const h = Math.max(1, Math.round(canvasH))
  return Array.from({ length: count }, (_, index) => {
    const progress = count <= 1 ? 0 : index / (count - 1)
    const theta = corkscrewAngleAt(index, count, safeTurns, startAngleDeg, direction)
    // Put the front at the centre of the unwrapped canvas and the back at its
    // seam, matching the front-on corkscrew preview.
    const around = (((theta / (Math.PI * 2)) + 0.5) % 1 + 1) % 1
    const x = Math.min(w - 1, Math.max(0, Math.round(around * (w - 1))))
    const y = Math.min(h - 1, Math.max(0, Math.round(progress * (h - 1))))
    return (y * w) + x
  })
}

export function corkscrewSampleMapForProps(props: Record<string, unknown>): number[] {
  const { width, height } = corkscrewCanvasDimsForProps(props)
  return corkscrewSampleMap(
    Number(props.ledCount ?? 120),
    corkscrewTurns(props),
    corkscrewStartAngle(props),
    corkscrewDirection(props),
    width,
    height,
  )
}
