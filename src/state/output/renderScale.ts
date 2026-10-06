import { outputForm } from './ledOutputForm'

// Render scale: render the graph at half the panel's resolution and upscale
// bilinearly into the physical LEDs. The counterpart of supersample, which
// renders larger and averages down; the two are mutually exclusive and
// supersample wins if a saved node somehow holds both.
//
// The preview (`routeFrame`) and the sketch both take their source position
// from `upscaleTap`, so they sample the same pixels with the same weights.

export const RENDER_SCALE_OPTIONS = ['1', '1/2'] as const
export type RenderScale = (typeof RENDER_SCALE_OPTIONS)[number]

/** Half a panel side, rounded up so an odd panel keeps its last column. */
export function halfDim(n: number): number {
  return Math.max(1, Math.ceil(n / 2))
}

/** The half-resolution render is offered on matrix panels only: a chain has no
 *  second axis to save on, and HUB75 does not resample its framebuffer. */
export function renderScaleHalf(props: Record<string, unknown> | undefined | null): boolean {
  if (!props) return false
  return outputForm(props) === 'matrix' && props.supersample !== true && props.renderScale === '1/2'
}

/** Where output index `i` of `dst` reads its source of `src` samples: the two
 *  neighbouring source indices and the weight of the second. Pixel centres
 *  align, and reads clamp at the edges. */
export function upscaleTap(i: number, src: number, dst: number): { i0: number; i1: number; f: number } {
  const s = Math.min(Math.max((i + 0.5) * src / dst - 0.5, 0), src - 1)
  const i0 = Math.floor(s)
  return { i0, i1: Math.min(i0 + 1, src - 1), f: s - i0 }
}
