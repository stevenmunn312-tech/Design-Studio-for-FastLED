import { portColor } from '../../state/nodeLibrary'

/**
 * Resolve a noodle's visible colour from live light first, then its current
 * declared type. Persisted strokes are only a fallback for legacy/custom ports;
 * otherwise old edges would keep obsolete palette colours forever.
 */
export function edgeDisplayColor(
  signalEmissive: string | undefined,
  sourceType: string | undefined,
  storedStroke: unknown,
  categoryColor: string | undefined,
): string {
  if (signalEmissive) return signalEmissive
  if (sourceType) return portColor(sourceType)
  if (typeof storedStroke === 'string') return storedStroke
  return categoryColor || '#00bfff'
}
