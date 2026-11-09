import { outputForm } from './ledOutputForm'

// Render resolution: one choice where there were two switches that greyed
// each other out. Half renders the graph at half the panel's resolution and
// upscales bilinearly into the physical LEDs; 2x smooth (supersampling)
// renders at twice the size and averages each 2 x 2 block down to one LED.
// One select makes the two exclusive by construction.
//
// The preview (`routeFrame`) and the sketch both take their source position
// from `upscaleTap`, so they sample the same pixels with the same weights.

export const RENDER_RESOLUTIONS = ['Half', 'Full', '2x smooth'] as const
export type RenderResolution = (typeof RENDER_RESOLUTIONS)[number]
export const DEFAULT_RENDER_RESOLUTION: RenderResolution = 'Full'

/** The stored choice, or Full for anything else. */
export function renderResolution(props: Record<string, unknown> | undefined | null): RenderResolution {
  const value = props?.renderResolution
  return (RENDER_RESOLUTIONS as readonly unknown[]).includes(value) ? value as RenderResolution : DEFAULT_RENDER_RESOLUTION
}

/** The output asks to render at 2x and average down. Each reader still gates
 *  it by form, since a chain has no 2 x 2 block to average. */
export function wantsSupersample(props: Record<string, unknown> | undefined | null): boolean {
  return renderResolution(props) === '2x smooth'
}

/** Half a panel side, rounded up so an odd panel keeps its last column. */
export function halfDim(n: number): number {
  return Math.max(1, Math.ceil(n / 2))
}

/** The half-resolution render is offered on matrix panels only: a chain has no
 *  second axis to save on, and HUB75 does not resample its framebuffer. */
export function renderScaleHalf(props: Record<string, unknown> | undefined | null): boolean {
  if (!props) return false
  return outputForm(props) === 'matrix' && renderResolution(props) === 'Half'
}

/** Where output index `i` of `dst` reads its source of `src` samples: the two
 *  neighbouring source indices and the weight of the second. Pixel centres
 *  align, and reads clamp at the edges. */
export function upscaleTap(i: number, src: number, dst: number): { i0: number; i1: number; f: number } {
  const s = Math.min(Math.max((i + 0.5) * src / dst - 0.5, 0), src - 1)
  const i0 = Math.floor(s)
  return { i0, i1: Math.min(i0 + 1, src - 1), f: s - i0 }
}
