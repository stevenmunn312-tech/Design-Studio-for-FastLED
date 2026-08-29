import type { StudioNode } from '../../state/graphStore'
import type { RGB } from '../../state/ledColor'
import { renderGridFrame } from './frameCanvas'

export interface CombinedStereoVuFixture {
  id: string
  swapChannels: boolean
  ledCount: number
  standalone: boolean
}

/** Find the root-owned fixture assigned to the route currently on screen. */
export function combinedStereoVuFixture(
  nodes: StudioNode[],
  outputId: string,
): CombinedStereoVuFixture | null {
  const isMatrixOutput = (node: StudioNode) => node.data.nodeType === 'MatrixOutput'
    && ['matrix', 'hub75'].includes(String(node.data.properties.form ?? 'matrix'))
  const hasMatrix = nodes.some(isMatrixOutput)
  const selectedOutputIsMatrix = nodes.some((node) => node.id === outputId && isMatrixOutput(node))
  const fixture = nodes.find((node) => node.data.nodeType === 'StereoVuMeter' && (
    (outputId && String(node.data.properties.targetOutputId ?? '') === outputId)
    // Standalone is a hardware-routing choice, not a reason to hide the rails
    // from an available matrix composition in Preview or Stage.
    || (selectedOutputIsMatrix && String(node.data.properties.targetOutputId ?? '') === '')
    || (!hasMatrix && String(node.data.properties.targetOutputId ?? '') === '')
  ))
  return fixture
    ? {
        id: fixture.id,
        swapChannels: fixture.data.properties.swapChannels === true,
        ledCount: Math.max(1, Math.round(Number(fixture.data.properties.ledCount ?? 16))),
        standalone: !hasMatrix && String(fixture.data.properties.targetOutputId ?? '') === '',
      }
    : null
}

export interface StereoVuRailSegment {
  y: number
  height: number
  color: RGB
}

/** Map logical bottom-to-top pixels onto a vertical screen rail. Long strings
 * share the available height, so they never force the matrix to shrink. */
export function stereoVuRailSegments(pixels: RGB[], height: number): StereoVuRailSegment[] {
  if (pixels.length === 0 || height <= 0) return []
  const cell = height / pixels.length
  const gap = cell >= 4 ? Math.min(2, cell * 0.22) : cell >= 2 ? 0.5 : 0
  return pixels.map((color, index) => ({
    y: height - (index + 1) * cell + gap / 2,
    height: Math.max(0.35, cell - gap),
    color,
  }))
}

export function drawStereoVuRail(canvas: HTMLCanvasElement | null, pixels: RGB[]): void {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (pixels.length === 0) return
  const pixel = canvas.height / pixels.length
  const railFrame = [...pixels].reverse().map((color) => [color])
  ctx.save()
  ctx.translate((canvas.width - pixel) / 2, 0)
  // The main live matrix uses the WebGL standard shader, whose bright emitter
  // is ~0.58 of a cell. The Canvas fallback's photographic core is larger, so
  // scale this auxiliary column to the shader's on-screen package size.
  renderGridFrame(ctx, railFrame, pixel, 0.55)
  ctx.restore()
}
