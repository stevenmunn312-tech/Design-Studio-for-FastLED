import type { Frame } from './graphEvaluator'
import type { StudioNode } from './graphStore'

export type OutputRouteMode = 'fit' | 'crop'

export interface OutputRoute {
  node: StudioNode
  id: string
  label: string
  width: number
  height: number
  supersample: number
  routeMode: OutputRouteMode
  routeX: number
  routeY: number
}

function int(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Math.round(Number(value))
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback
}

/** Matrix Output nodes are the routing table: each incoming Frame cable is an
 * independent route to that node's controller, layout, and brightness. */
export function outputRoutes(nodes: StudioNode[]): OutputRoute[] {
  return nodes
    .filter((node) => node.data.nodeType === 'MatrixOutput')
    .map((node) => {
      const props = node.data.properties as Record<string, unknown>
      return {
        node,
        id: node.id,
        label: String(node.data.label ?? 'Matrix Output'),
        width: int(props.width, 16, 1, 64),
        height: int(props.height, 16, 1, 64),
        supersample: props.supersample === true ? 2 : 1,
        routeMode: props.routeMode === 'crop' ? 'crop' : 'fit',
        routeX: int(props.routeX, 0, 0, 63),
        routeY: int(props.routeY, 0, 0, 63),
      }
    })
}

/** Shared logical canvas used by firmware before each route is fitted/cropped
 * into its physical output. A single-output graph retains its old dimensions. */
export function compositionDims(nodes: StudioNode[]): { w: number; h: number } {
  const routes = outputRoutes(nodes)
  if (routes.length === 0) return { w: 16, h: 16 }
  return {
    w: Math.max(...routes.map((route) => route.width * route.supersample)),
    h: Math.max(...routes.map((route) => route.height * route.supersample)),
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
