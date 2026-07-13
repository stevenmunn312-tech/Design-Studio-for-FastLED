export interface RGB { r: number; g: number; b: number }

export const DEFAULT_CUSTOM_COLORS = ['#ff3b8a', '#ffc247', '#32f2ff', '#7b5cff'] as const
export const DEFAULT_CUSTOM_POSITIONS = [0, 0.33, 0.67, 1] as const

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
}

export function rgbToHex({ r, g, b }: RGB): string {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
}

export function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return { r: 0, g: 0, b: 0 }
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export function normalizeCustomPalette(
  colors: unknown,
  positions: unknown,
): { colors: string[]; positions: number[] } {
  const rawColors = Array.isArray(colors)
    ? colors.filter(isHexColor)
    : [...DEFAULT_CUSTOM_COLORS]
  const safeColors = rawColors.slice(0, 8)
  if (safeColors.length === 0) safeColors.push(...DEFAULT_CUSTOM_COLORS.slice(0, 2))
  if (safeColors.length === 1) safeColors.push(safeColors[0])

  const rawPositions = Array.isArray(positions)
    ? positions.map(Number).filter(Number.isFinite)
    : []
  const safePositions = safeColors.map((_, i) => {
    const fallback = safeColors.length === 1 ? 0 : i / (safeColors.length - 1)
    return clamp01(rawPositions[i] ?? fallback)
  })

  const zipped = safeColors.map((color, i) => ({ color, position: safePositions[i] }))
    .sort((a, b) => a.position - b.position)
  zipped[0].position = 0
  zipped[zipped.length - 1].position = 1
  return {
    colors: zipped.map((stop) => stop.color),
    positions: zipped.map((stop) => stop.position),
  }
}

export function sampleCustomPalette(colors: RGB[], positions: number[], t: number): RGB {
  if (colors.length === 0) return { r: 0, g: 0, b: 0 }
  if (colors.length === 1) return colors[0]
  const x = clamp01(t)
  for (let i = 1; i < colors.length; i++) {
    const left = positions[i - 1] ?? 0
    const right = positions[i] ?? 1
    if (x <= right || i === colors.length - 1) {
      const span = Math.max(1e-6, right - left)
      const k = clamp01((x - left) / span)
      const a = colors[i - 1]
      const b = colors[i]
      return {
        r: Math.round(a.r + (b.r - a.r) * k),
        g: Math.round(a.g + (b.g - a.g) * k),
        b: Math.round(a.b + (b.b - a.b) * k),
      }
    }
  }
  return colors[colors.length - 1]
}

export function customPaletteStops16(colors: RGB[], positions: number[]): RGB[] {
  return Array.from({ length: 16 }, (_, i) => sampleCustomPalette(colors, positions, i / 15))
}
