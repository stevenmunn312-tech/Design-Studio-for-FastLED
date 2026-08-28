import type { StudioNode } from './graphStore'

export const DEFAULT_STANDALONE_VU_LED_COUNT = 16
export const VU_LED_COUNT_CUSTOM_KEY = '_ledCountCustom'

function matrixHeight(nodes: StudioNode[], outputId: string): number | null {
  if (!outputId) return null
  const output = nodes.find((node) => node.id === outputId && node.data.nodeType === 'MatrixOutput')
  if (!output) return null
  const form = String(output.data.properties.form ?? 'matrix')
  if (form !== 'matrix' && form !== 'hub75') return null
  const height = Math.round(Number(output.data.properties.height ?? DEFAULT_STANDALONE_VU_LED_COUNT))
  return Number.isFinite(height) ? Math.max(1, height) : DEFAULT_STANDALONE_VU_LED_COUNT
}

export function automaticStereoVuLedCount(nodes: StudioNode[], outputId: string): number {
  return matrixHeight(nodes, outputId) ?? DEFAULT_STANDALONE_VU_LED_COUNT
}

/** Keep non-custom meters aligned with their selected matrix. */
export function syncAutomaticStereoVuLedCounts(nodes: StudioNode[]): StudioNode[] {
  let changed = false
  const next = nodes.map((node) => {
    if (node.data.nodeType !== 'StereoVuMeter' || node.data.properties[VU_LED_COUNT_CUSTOM_KEY] === true) return node
    const count = automaticStereoVuLedCount(nodes, String(node.data.properties.targetOutputId ?? ''))
    if (Number(node.data.properties.ledCount) === count) return node
    changed = true
    return {
      ...node,
      data: {
        ...node.data,
        properties: { ...node.data.properties, ledCount: count },
      },
    }
  })
  return changed ? next : nodes
}
