/** Shortest hold the Music Player accepts, in seconds. A hold of 0 s ends the
 *  moment a transition finishes, so the player chains transitions back to
 *  back with nothing held in between; the property sliders share this floor. */
export const MUSIC_PLAYER_MIN_HOLD_SEC = 1

/** Timing values shared by preview and the SD music player, in seconds. */
export function musicPlayerTiming(properties: Record<string, unknown>) {
  const seconds = (value: unknown, fallback: number, floor = 0) => {
    const number = Number(value ?? fallback)
    // Keep milliseconds representable by the firmware's unsigned clock.
    return Number.isFinite(number) ? Math.max(floor, Math.min(86400, number)) : fallback
  }
  const minTime = seconds(properties.minTime, 4, MUSIC_PLAYER_MIN_HOLD_SEC)
  return {
    minTime,
    maxTime: Math.max(minTime, seconds(properties.maxTime, 12, MUSIC_PLAYER_MIN_HOLD_SEC)),
    transitionSec: seconds(properties.transitionSec, 1),
    beatTransitions: properties.beatTransitions === true,
    // Hold pacing; see patternPacing.ts.
    energyPacing: properties.energyPacing === true,
    dwellsAndBursts: properties.dwellsAndBursts === true,
  }
}
