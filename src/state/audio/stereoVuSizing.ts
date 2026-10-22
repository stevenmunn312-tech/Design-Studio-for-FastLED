import type { StudioNode } from '../graphStore'

export const DEFAULT_STANDALONE_VU_LED_COUNT = 16
/** The longest rail the renderer sizes a history for; the slider's ceiling too. */
export const MAX_STEREO_VU_RAIL_LEDS = 1024
export const VU_LED_COUNT_CUSTOM_KEY = '_ledCountCustom'
export const STEREO_VU_RAIL_COUNT_KEYS = ['leftLedCount', 'rightLedCount'] as const

export interface StereoVuRailCounts {
  left: number
  right: number
}

function railCount(value: unknown): number {
  const count = Math.round(Number(value ?? DEFAULT_STANDALONE_VU_LED_COUNT))
  return Number.isFinite(count)
    ? Math.max(1, Math.min(MAX_STEREO_VU_RAIL_LEDS, count))
    : DEFAULT_STANDALONE_VU_LED_COUNT
}

/**
 * Each rail's own length, clamped the way the renderer and firmware clamp it.
 *
 * Every reader of a rail's size — preview, power, RAM, wire time, the manifest,
 * the bench — goes through here so a missing or absurd value resolves to the
 * same number everywhere. The rails are independent: nothing here, or anywhere
 * downstream, maps one rail's pixels onto the other's.
 */
export function stereoVuRailCounts(properties: Record<string, unknown>): StereoVuRailCounts {
  return { left: railCount(properties.leftLedCount), right: railCount(properties.rightLedCount) }
}

/** Both rails' pixels together: the figure power, RAM and the scheduler sum. */
export function stereoVuTotalLeds(properties: Record<string, unknown>): number {
  const counts = stereoVuRailCounts(properties)
  return counts.left + counts.right
}

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
 * standalone pair of rails. A fixture that has never had a rail length typed
 * in follows the matrix on both rails; typing either length makes the pair
 * custom and leaves both alone from then on. */
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
    const automatic = automaticStereoVuLedCount(nodes, normalizedTargetOutputId)
    const targetChanged = normalizedTargetOutputId !== targetOutputId
    const countChanged = !customLedCount && STEREO_VU_RAIL_COUNT_KEYS.some((key) => Number(properties[key]) !== automatic)
    if (!targetChanged && !countChanged) return node
    changed = true
    return {
      ...node,
      data: {
        ...node.data,
        properties: {
          ...properties,
          ...(targetChanged ? { targetOutputId: normalizedTargetOutputId } : {}),
          ...(countChanged ? { leftLedCount: automatic, rightLedCount: automatic } : {}),
        },
      },
    }
  })
  return changed ? next : nodes
}
