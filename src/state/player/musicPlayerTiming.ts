/** Timing values shared by preview and the SD music player, in seconds. */
export function musicPlayerTiming(properties: Record<string, unknown>) {
  const seconds = (value: unknown, fallback: number) => {
    const number = Number(value ?? fallback)
    // Keep milliseconds representable by the firmware's unsigned clock.
    return Number.isFinite(number) ? Math.max(0, Math.min(86400, number)) : fallback
  }
  const minTime = seconds(properties.minTime, 4)
  return {
    minTime,
    maxTime: Math.max(minTime, seconds(properties.maxTime, 12)),
    transitionSec: seconds(properties.transitionSec, 1),
    beatTransitions: properties.beatTransitions === true,
  }
}
