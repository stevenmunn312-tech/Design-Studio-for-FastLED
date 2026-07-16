export const SPECTRUM_VISUALIZER_STYLES = [
  'bars',
  'mirror',
  'ribbon',
  'orbit',
  'waterfall',
  'stacks',
  'constellation',
] as const

export type SpectrumVisualizerStyle = (typeof SPECTRUM_VISUALIZER_STYLES)[number]
export type SpectrumVisualizerMode = 'auto' | SpectrumVisualizerStyle

const clamp01 = (value: unknown) =>
  Math.max(0, Math.min(1, typeof value === 'number' && Number.isFinite(value) ? value : 0))

export function resampleSpectrum(values: readonly number[], count = 32): number[] {
  if (!values.length) return Array(count).fill(0)
  return Array.from({ length: count }, (_, i) => {
    const start = Math.floor((i * values.length) / count)
    const end = Math.max(start + 1, Math.ceil(((i + 1) * values.length) / count))
    let total = 0
    for (let sourceIndex = start; sourceIndex < end; sourceIndex++) total += clamp01(values[sourceIndex])
    return clamp01(total / (end - start))
  })
}

export const SPECTRUM_VISUALIZER_OPTIONS: ReadonlyArray<{
  value: SpectrumVisualizerMode
  label: string
}> = [
  { value: 'auto', label: 'Auto mix' },
  { value: 'bars', label: 'Classic bars' },
  { value: 'mirror', label: 'Centre mirror' },
  { value: 'ribbon', label: 'Spectrum ribbon' },
  { value: 'orbit', label: 'Orbit' },
  { value: 'waterfall', label: 'Waterfall' },
  { value: 'stacks', label: 'LED stacks' },
  { value: 'constellation', label: 'Constellation' },
]

export function isSpectrumVisualizerMode(value: unknown): value is SpectrumVisualizerMode {
  return value === 'auto' || SPECTRUM_VISUALIZER_STYLES.includes(value as SpectrumVisualizerStyle)
}

export function spectrumVisualizerLabel(mode: SpectrumVisualizerMode): string {
  return SPECTRUM_VISUALIZER_OPTIONS.find((option) => option.value === mode)?.label ?? 'Classic bars'
}

export function nextSpectrumVisualizerMode(mode: SpectrumVisualizerMode): SpectrumVisualizerMode {
  const index = SPECTRUM_VISUALIZER_OPTIONS.findIndex((option) => option.value === mode)
  return SPECTRUM_VISUALIZER_OPTIONS[(index + 1) % SPECTRUM_VISUALIZER_OPTIONS.length].value
}
