export const WALLPAPER_GROUPS = ['p1', 'p2', 'pm', 'pmm', 'p4', 'p4m', 'p3', 'p6', 'p6m'] as const

export type WallpaperGroup = typeof WALLPAPER_GROUPS[number]

/** What each group's crystallographic code does, for the group dropdown. */
export const WALLPAPER_GROUP_LABELS: Readonly<Record<WallpaperGroup, string>> = {
  p1: 'p1: square, plain repeats',
  p2: 'p2: square, half turns',
  pm: 'pm: square, mirrors one way',
  pmm: 'pmm: square, mirrors both ways',
  p4: 'p4: square, quarter turns',
  p4m: 'p4m: square, mirrors + quarter turns',
  p3: 'p3: hexagonal, third turns',
  p6: 'p6: hexagonal, sixth turns',
  p6m: 'p6m: hexagonal, mirrors + sixth turns',
}

const GROUP_INDEX = new Map<string, number>(WALLPAPER_GROUPS.map((group, index) => [group, index]))

/** Unknown persisted values fail back to translation-only p1. */
export function wallpaperGroupIndex(group: unknown): number {
  return GROUP_INDEX.get(String(group)) ?? 0
}

/** The spin rate both symmetry nodes integrate (deg/s, clamped). */
export function wallpaperSpinRate(spinDeg: number): number {
  return Math.max(-360, Math.min(360, spinDeg))
}
