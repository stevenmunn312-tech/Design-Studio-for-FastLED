import type { Frame } from './graphEvaluator'
import type { StudioNode } from './graphStore'
import {
  isLinearForm,
  LED_OUTPUT_FORM_LABELS,
  outputCanvasDims,
  outputForm,
  outputGridDims,
  ringDirection,
  ringSampleMap,
  ringStartAngle,
  type LedOutputForm,
  type RingDirection,
} from './ledOutputForm'

export type OutputRouteMode = 'fit' | 'crop'

export interface OutputRoute {
  node: StudioNode
  id: string
  label: string
  /** What this output physically is; every field below follows from it. */
  form: LedOutputForm
  /** The output's own pixel grid — a matrix's panel, or a chain's 1 x N. */
  width: number
  height: number
  /** The footprint this route claims on the shared composition canvas. Equal to
   *  width x height except for a ring, whose circle needs two real axes. */
  canvasW: number
  canvasH: number
  supersample: number
  routeMode: OutputRouteMode
  routeX: number
  routeY: number
  /** For a ring: the geometry its XY mapping is built from. Null otherwise.
   *
   *  Deliberately the parameters rather than a finished map. The map's indices
   *  are into the *composition* canvas, which a route does not know — a ring
   *  beside a bigger matrix reads a 16x16 canvas, not the 8x8 its own
   *  circumference asked for — so baking one here would index the wrong pixels
   *  the moment a second output widened the canvas. `ringMapFor` builds it
   *  against the canvas that actually exists. */
  ring: { ledCount: number; startAngle: number; direction: RingDirection } | null
}

// One map per (ring, canvas size). The preview asks for the same one 60 times a
// second and the geometry only changes when the user edits the node.
const ringMapCache = new Map<string, number[]>()

/**
 * A ring's sample map against a specific composition canvas: one canvas index
 * per LED, in wire order.
 *
 * Shared by the live preview, the hardware view's ring, and the PROGMEM table
 * the sketch bakes, so all three light the same LED from the same pixel.
 */
export function ringMapFor(route: OutputRoute, canvasW: number, canvasH: number): number[] | null {
  const ring = route.ring
  if (!ring) return null
  const w = Math.max(1, Math.round(canvasW))
  const h = Math.max(1, Math.round(canvasH))
  const key = `${ring.ledCount}:${ring.startAngle}:${ring.direction}:${w}:${h}`
  const cached = ringMapCache.get(key)
  if (cached) return cached
  const map = ringSampleMap(ring.ledCount, ring.startAngle, ring.direction, w, h)
  // Bounded: a project holds a handful of rings and the canvas rarely changes.
  if (ringMapCache.size > 64) ringMapCache.clear()
  ringMapCache.set(key, map)
  return map
}

function int(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Math.round(Number(value))
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback
}

/** LED Output nodes are the routing table: each incoming Frame cable is an
 * independent route to that node's controller, layout, and brightness. */
export function outputRoutes(nodes: StudioNode[]): OutputRoute[] {
  return nodes
    .filter((node) => node.data.nodeType === 'MatrixOutput')
    .map((node) => {
      const props = node.data.properties as Record<string, unknown>
      const form = outputForm(props)
      const linear = isLinearForm(form)
      const grid = outputGridDims(props)
      const canvas = outputCanvasDims(props)
      return {
        node,
        id: node.id,
        label: String(node.data.label ?? LED_OUTPUT_FORM_LABELS[form]),
        form,
        width: grid.width,
        height: grid.height,
        canvasW: canvas.width,
        canvasH: canvas.height,
        // A chain has no 2 x 2 block to average down, and no viewport to offset
        // within — it takes the whole composition either way.
        supersample: linear ? 1 : props.supersample === true ? 2 : 1,
        routeMode: linear ? 'fit' : props.routeMode === 'crop' ? 'crop' : 'fit',
        routeX: int(props.routeX, 0, 0, 63),
        routeY: int(props.routeY, 0, 0, 63),
        ring: form === 'ring'
          ? {
            ledCount: grid.width,
            startAngle: ringStartAngle(props),
            direction: ringDirection(props),
          }
          : null,
      }
    })
}

/** Just enough of an edge to ask "is anything wired into this output?". */
export interface FrameFeedEdge {
  target: string
  targetHandle?: string | null
}

/**
 * The shared logical canvas every output renders on.
 *
 * Pass `edges` so outputs with nothing wired into their Frame input are left
 * out of the sizing. They render nothing, but counting them still stretches the
 * canvas — a 60-LED strip sitting unconnected beside a 16x16 matrix makes the
 * canvas 60 wide, and the matrix then fits that whole width into 16 columns and
 * shows a squashed sliver of the pattern. An output the user has not wired must
 * not degrade the ones they have.
 *
 * With no connected outputs at all, every route sizes the canvas as before, so
 * a patch that is still being wired up keeps a sensible preview.
 */
export function compositionDims(nodes: StudioNode[], edges?: FrameFeedEdge[]): { w: number; h: number } {
  const routes = outputRoutes(nodes)
  if (routes.length === 0) return { w: 16, h: 16 }
  const connected = edges
    ? routes.filter((route) => edges.some((edge) =>
        edge.target === route.id && (edge.targetHandle ?? 'frame') === 'frame'))
    : routes
  const sizing = connected.length > 0 ? connected : routes
  return {
    w: Math.max(...sizing.map((route) => route.canvasW * route.supersample)),
    h: Math.max(...sizing.map((route) => route.canvasH * route.supersample)),
  }
}

/** Map a logical composition frame into one output's local grid. `fit` scales
 * the whole composition; `crop` selects a wrapped output-sized viewport.
 *
 * Pass `reuse` (a buffer from a previous call) to route in place: the output is
 * a per-call throwaway on the 60fps preview path, and a fresh Frame + one RGB
 * object per pixel every frame is the dominant source of GC churn. The returned
 * buffer always owns its pixels (crop mode copies values rather than aliasing
 * the pooled source frame), so callers may safely mutate it downstream (e.g.
 * master-brightness). Omit `reuse` for a fresh allocation. */
export function routeFrame(frame: Frame | null, route: OutputRoute, compositionW: number, compositionH: number, reuse?: Frame | null): Frame | null {
  if (!frame) return null
  const out: Frame = reuse && reuse.length === route.height && reuse[0]?.length === route.width
    ? reuse
    : Array.from({ length: route.height }, () => Array.from({ length: route.width }, () => ({ r: 0, g: 0, b: 0 })))
  // A ring reads a circle out of the composition rather than a rectangle: one
  // source pixel per LED, from the same helper the sketch bakes as PROGMEM, so
  // the circle on the bench and the circle in the preview cannot drift.
  const ringMap = ringMapFor(route, compositionW, compositionH)
  if (ringMap) {
    const orow = out[0]
    const stride = Math.max(1, compositionW)
    for (let i = 0; i < route.width; i++) {
      const px = orow[i]
      const index = ringMap[i] ?? 0
      const src = frame[Math.floor(index / stride)]?.[index % stride]
      px.r = src?.r ?? 0; px.g = src?.g ?? 0; px.b = src?.b ?? 0
    }
    return out
  }
  for (let y = 0; y < route.height; y++) {
    const orow = out[y]
    for (let x = 0; x < route.width; x++) {
      const px = orow[x]
      if (route.routeMode === 'crop') {
        const sx = (route.routeX + x) % Math.max(1, compositionW)
        const sy = (route.routeY + y) % Math.max(1, compositionH)
        const src = frame[sy]?.[sx]
        px.r = src?.r ?? 0; px.g = src?.g ?? 0; px.b = src?.b ?? 0
        continue
      }
      const x0 = Math.floor(x * compositionW / route.width)
      const x1 = Math.max(x0 + 1, Math.ceil((x + 1) * compositionW / route.width))
      const y0 = Math.floor(y * compositionH / route.height)
      const y1 = Math.max(y0 + 1, Math.ceil((y + 1) * compositionH / route.height))
      let r = 0, g = 0, b = 0, count = 0
      for (let sy = y0; sy < Math.min(compositionH, y1); sy++) {
        for (let sx = x0; sx < Math.min(compositionW, x1); sx++) {
          const pixel = frame[sy]?.[sx]
          if (!pixel) continue
          r += pixel.r; g += pixel.g; b += pixel.b; count++
        }
      }
      if (count) { px.r = r / count; px.g = g / count; px.b = b / count }
      else { px.r = 0; px.g = 0; px.b = 0 }
    }
  }
  return out
}
