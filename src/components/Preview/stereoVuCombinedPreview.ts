import type { StudioNode } from '../../state/graphStore'
import type { RGB } from '../../state/ledColor'

export interface CombinedStereoVuFixture {
  id: string
  swapChannels: boolean
}

/** Find the root-owned fixture assigned to the route currently on screen. */
export function combinedStereoVuFixture(
  nodes: StudioNode[],
  outputId: string,
): CombinedStereoVuFixture | null {
  if (!outputId) return null
  const fixture = nodes.find((node) => (
    node.data.nodeType === 'StereoVuMeter'
    && String(node.data.properties.targetOutputId ?? '') === outputId
  ))
  return fixture
    ? { id: fixture.id, swapChannels: fixture.data.properties.swapChannels === true }
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
  ctx.fillStyle = '#020405'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  for (const segment of stereoVuRailSegments(pixels, canvas.height)) {
    const { r, g, b } = segment.color
    ctx.fillStyle = `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`
    ctx.fillRect(0, segment.y, canvas.width, segment.height)
  }
}
