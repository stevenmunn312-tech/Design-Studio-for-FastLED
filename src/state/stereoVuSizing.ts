import type { StudioNode } from './graphStore'

export const DEFAULT_STANDALONE_VU_LED_COUNT = 16
export const VU_LED_COUNT_CUSTOM_KEY = '_ledCountCustom'

export function isActiveStandaloneStereoVuMeter(node: StudioNode): boolean {
  if (node.data.nodeType !== 'StereoVuMeter') return false
  const properties = node.data.properties as Record<string, unknown>
  return properties.enabled !== false && String(properties.targetOutputId ?? '') === ''
}

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

/** Keep non-custom meters aligned with their selected matrix, and make a
 * removed matrix mean the same thing in state that the picker shows: a
 * standalone pair of rails. */
export function syncAutomaticStereoVuLedCounts(nodes: StudioNode[]): StudioNode[] {
  let changed = false
  const next = nodes.map((node) => {
    if (node.data.nodeType !== 'StereoVuMeter') return node
    const properties = node.data.properties as Record<string, unknown>
    const targetOutputId = String(properties.targetOutputId ?? '')
    const targetExists = !targetOutputId || nodes.some((candidate) =>
      candidate.id === targetOutputId && candidate.data.nodeType === 'MatrixOutput')
    const normalizedTargetOutputId = targetExists ? targetOutputId : ''
    const customLedCount = properties[VU_LED_COUNT_CUSTOM_KEY] === true
    const count = customLedCount
      ? Number(properties.ledCount)
      : automaticStereoVuLedCount(nodes, normalizedTargetOutputId)
    const targetChanged = normalizedTargetOutputId !== targetOutputId
    const countChanged = !customLedCount && Number(properties.ledCount) !== count
    if (!targetChanged && !countChanged) return node
    changed = true
    return {
      ...node,
      data: {
        ...node.data,
        properties: {
          ...properties,
          ...(targetChanged ? { targetOutputId: normalizedTargetOutputId } : {}),
          ...(countChanged ? { ledCount: count } : {}),
        },
      },
    }
  })
  return changed ? next : nodes
}
