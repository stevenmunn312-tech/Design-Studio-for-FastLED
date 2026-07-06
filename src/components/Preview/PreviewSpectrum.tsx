import { useRef, type CSSProperties } from 'react'
import { useAudioStore } from '../../state/audioStore'
import styles from './LEDPreview.module.css'

const NUM_BARS = 28

const clamp01 = (value: unknown) =>
  Math.max(0, Math.min(1, typeof value === 'number' && Number.isFinite(value) ? value : 0))

function resample(values: number[], count: number): number[] {
  if (!values.length) return Array(count).fill(0)
  return Array.from({ length: count }, (_, i) => {
    const start = Math.floor((i * values.length) / count)
    const end = Math.max(start + 1, Math.ceil(((i + 1) * values.length) / count))
    const slice = values.slice(start, end)
    return clamp01(slice.reduce((sum, value) => sum + clamp01(value), 0) / slice.length)
  })
}

export default function PreviewSpectrum({ audioVisualizerLive }: { audioVisualizerLive: boolean }) {
  const previewSpectrum = useAudioStore((s) => s.previewSpectrum)
  const peakRef = useRef(Array(NUM_BARS).fill(0))

  const displaySpectrum = resample(audioVisualizerLive ? previewSpectrum : [], NUM_BARS).map((value, i, arr) => {
    const prev = arr[i - 1] ?? value
    const next = arr[i + 1] ?? value
    return clamp01(value * 0.55 + ((prev + value + next) / 3) * 0.45)
  })

  peakRef.current = audioVisualizerLive
    ? displaySpectrum.map((value, i) => clamp01(Math.max(value, peakRef.current[i] - 0.02)))
    : Array(NUM_BARS).fill(0)

  return (
    <div className={styles.spectrum} aria-hidden>
      {displaySpectrum.map((value, i) => {
        const hue = 188 + (i / Math.max(1, NUM_BARS - 1)) * 148
        const colorVars = { '--bar-hue': `${hue}` } as CSSProperties
        return (
          <div key={i} className={styles.barWrap}>
            <div
              className={styles.bar}
              style={{
                height: `${Math.max(6, value * 100)}%`,
                ...colorVars,
              }}
            />
            <div
              className={styles.peak}
              style={{
                bottom: `${Math.max(0, peakRef.current[i] * 100 - 3)}%`,
                ...colorVars,
              }}
            />
          </div>
        )
      })}
    </div>
  )
}
