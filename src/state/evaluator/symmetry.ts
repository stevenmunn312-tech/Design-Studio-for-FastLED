export const WALLPAPER_GROUPS = ['p1', 'p2', 'pm', 'pmm', 'p4', 'p4m', 'p3', 'p6', 'p6m'] as const

export type WallpaperGroup = typeof WALLPAPER_GROUPS[number]

const GROUP_INDEX = new Map<string, number>(WALLPAPER_GROUPS.map((group, index) => [group, index]))

/** Unknown persisted values fail back to translation-only p1. */
export function wallpaperGroupIndex(group: unknown): number {
  return GROUP_INDEX.get(String(group)) ?? 0
}

/** The spin rate both symmetry nodes integrate (deg/s, clamped). */
export function wallpaperSpinRate(spinDeg: number): number {
  return Math.max(-360, Math.min(360, spinDeg))
}
