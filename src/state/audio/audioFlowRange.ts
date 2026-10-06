const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

export const AUDIO_FLOW_PARAM_RANGES = {
  speed: { min: 0, max: 0.2 },
  scale: { min: 0, max: 0.2 },
} as const

export function denormalizeAudioFlowParam(
  key: keyof typeof AUDIO_FLOW_PARAM_RANGES,
  value: number,
): number {
  const range = AUDIO_FLOW_PARAM_RANGES[key]
  return range.min + clamp01(value) * (range.max - range.min)
}

export function audioFlowExpr(
  key: keyof typeof AUDIO_FLOW_PARAM_RANGES,
  expr: string,
): string {
  const range = AUDIO_FLOW_PARAM_RANGES[key]
  const min = Number(range.min)
  const span = Number(range.max) - min
  return `(${min.toFixed(3)}f + constrain((${expr}), 0.0f, 1.0f) * ${span.toFixed(3)}f)`
}
