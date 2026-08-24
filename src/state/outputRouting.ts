import type { Frame } from './graphEvaluator'
import type { StudioNode } from './graphStore'
import {
  corkscrewDiameterMm,
  corkscrewDirection,
  corkscrewHeightMm,
  corkscrewSampleMap,
  corkscrewStartAngle,
  corkscrewTurns,
  isLinearForm,
  LED_OUTPUT_FORM_LABELS,
  outputCanvasDims,
  outputForm,
  outputGridDims,
  ringDirection,
  ringSampleMap,
  ringStartAngle,
  type LedOutputForm,
  type CorkscrewDirection,
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
   *  width x height except for shape-mapped chains, which need two axes. */
  canvasW: number
  canvasH: number
  supersample: number
  /** The GPIO this run's data line is on. Two runs on the same pin, fed the
   *  same frame, are wired in parallel — see `outputMirrorLeaders`. */
  dataPin: number
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
  /** For a corkscrew: the helix parameters used to build its unwrapped
   *  cylindrical sample map and dedicated physical preview. Null otherwise. */
  corkscrew: {
    ledCount: number
    turns: number
    startAngle: number
    direction: CorkscrewDirection
    diameterMm: number
    heightMm: number
  } | null
}

// One map per (shape, canvas size). The preview asks for the same one 60 times a
// second and the geometry only changes when the user edits the node.
const ringMapCache = new Map<string, number[]>()
const corkscrewMapCache = new Map<string, number[]>()

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

/** A corkscrew's helix map against the composition canvas that actually exists. */
export function corkscrewMapFor(route: OutputRoute, canvasW: number, canvasH: number): number[] | null {
  const corkscrew = route.corkscrew
  if (!corkscrew) return null
  const w = Math.max(1, Math.round(canvasW))
  const h = Math.max(1, Math.round(canvasH))
  const key = `${corkscrew.ledCount}:${corkscrew.turns}:${corkscrew.startAngle}:${corkscrew.direction}:${w}:${h}`
  const cached = corkscrewMapCache.get(key)
  if (cached) return cached
  const map = corkscrewSampleMap(
    corkscrew.ledCount,
    corkscrew.turns,
    corkscrew.startAngle,
    corkscrew.direction,
    w,
    h,
  )
  if (corkscrewMapCache.size > 64) corkscrewMapCache.clear()
  corkscrewMapCache.set(key, map)
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
        dataPin: int(props.dataPin, 5, 0, 255),
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
        corkscrew: form === 'corkscrew'
          ? {
            ledCount: grid.width,
            turns: corkscrewTurns(props),
            startAngle: corkscrewStartAngle(props),
            direction: corkscrewDirection(props),
            diameterMm: corkscrewDiameterMm(props),
            heightMm: corkscrewHeightMm(props),
          }
          : null,
      }
    })
}

/** Just enough of an edge to ask "is anything wired into this output?" — and,
 *  with the source fields, "is this the same frame as that one?". */
export interface FrameFeedEdge {
  source?: string
  sourceHandle?: string | null
  target: string
  targetHandle?: string | null
}

/** The frame a route is fed by, as a key two routes can be compared on. */
function frameFeedKey(routeId: string, edges: readonly FrameFeedEdge[]): string | null {
  const feed = edges.find((edge) => edge.target === routeId && (edge.targetHandle ?? 'frame') === 'frame')
  return feed?.source ? `${feed.source}:${feed.sourceHandle ?? 'frame'}` : null
}

/**
 * Which runs are wired in parallel off one GPIO, showing the same thing.
 *
 * Two LED outputs fed the same frame *and* assigned the same data pin are not
 * two controllers — they are one, with both runs' data lines soldered to that
 * pin. This is the "two identical panels showing the same thing" case, and it
 * is what the app defaults to when a second output is wired to a frame that
 * already drives one (`graphStore.onConnect` adopts the existing pin).
 *
 * Returns route id -> the id of the run that owns the controller. A route that
 * maps to itself is a leader and gets its own `leds` array, `addLeds`, and
 * blit; a route that maps to another is a mirror of it and gets none of those,
 * because the pixels reach it down the leader's wire.
 *
 * Two things are deliberately *not* grouped. A HUB75 panel has a signal ribbon
 * rather than a data pin, so "same pin" means nothing for it. And two outputs
 * on the same frame with *different* pins stay independent — that is a real
 * setup (separate GPIOs for cable length or signal integrity), and reading it
 * as a mirror would silently drop one of the user's runs.
 */
export function outputMirrorLeaders(
  routes: readonly OutputRoute[],
  edges: readonly FrameFeedEdge[],
): Map<string, string> {
  const leaders = new Map<string, string>()
  const leaderByGroup = new Map<string, string>()
  for (const route of routes) {
    const feed = route.form === 'hub75' ? null : frameFeedKey(route.id, edges)
    if (!feed) {
      leaders.set(route.id, route.id)
      continue
    }
    const group = `${feed}|${route.dataPin}`
    const existing = leaderByGroup.get(group)
    if (existing) {
      leaders.set(route.id, existing)
    } else {
      leaderByGroup.set(group, route.id)
      leaders.set(route.id, route.id)
    }
  }
  return leaders
}

/** The routes that own a controller: every output except the parallel mirrors.
 *  Graph order, so the leader of a group is the one the user wired first. */
export function leadingOutputRoutes(
  nodes: StudioNode[],
  edges: readonly FrameFeedEdge[],
): OutputRoute[] {
  const routes = outputRoutes(nodes)
  const leaders = outputMirrorLeaders(routes, edges)
  return routes.filter((route) => leaders.get(route.id) === route.id)
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
  const mirrorLeaders = edges ? outputMirrorLeaders(routes, edges) : null
  const connected = edges
    ? routes.filter((route) =>
      // A mirror shows the leader's array, so its own size must not stretch
      // the canvas — nothing ever renders at it.
      (mirrorLeaders?.get(route.id) ?? route.id) === route.id
      && edges.some((edge) => edge.target === route.id && (edge.targetHandle ?? 'frame') === 'frame'))
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
  // Shape-mapped chains read dedicated paths out of the composition: one
  // source pixel per LED, from the same helpers the sketch bakes as PROGMEM.
  const shapeMap = ringMapFor(route, compositionW, compositionH)
    ?? corkscrewMapFor(route, compositionW, compositionH)
  if (shapeMap) {
    const orow = out[0]
    const stride = Math.max(1, compositionW)
    for (let i = 0; i < route.width; i++) {
      const px = orow[i]
      const index = shapeMap[i] ?? 0
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
