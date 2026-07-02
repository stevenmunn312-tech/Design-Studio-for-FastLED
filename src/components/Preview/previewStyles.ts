export type PreviewStyle = 'standard' | 'soft' | 'dreamy' | 'cyberpunk' | 'neon' | 'crt'

export const PREVIEW_STYLE_OPTIONS: Array<{ value: PreviewStyle; label: string }> = [
  { value: 'standard', label: 'Standard' },
  { value: 'soft', label: 'Soft' },
  { value: 'dreamy', label: 'Dreamy' },
  { value: 'cyberpunk', label: 'Cyberpunk' },
  { value: 'neon', label: 'Neon' },
  { value: 'crt', label: 'CRT' },
]

export const PREVIEW_STYLE_CODE: Record<PreviewStyle, number> = {
  standard: 0,
  soft: 1,
  dreamy: 2,
  cyberpunk: 3,
  neon: 4,
  crt: 5,
}

export function isDiffusedStyle(style: PreviewStyle): boolean {
  return style !== 'standard'
}

export function nextPreviewStyle(style: PreviewStyle): PreviewStyle {
  const index = PREVIEW_STYLE_OPTIONS.findIndex((option) => option.value === style)
  return PREVIEW_STYLE_OPTIONS[(index + 1 + PREVIEW_STYLE_OPTIONS.length) % PREVIEW_STYLE_OPTIONS.length].value
}

export function previewStyleLabel(style: PreviewStyle): string {
  return PREVIEW_STYLE_OPTIONS.find((option) => option.value === style)?.label ?? 'Standard'
}
