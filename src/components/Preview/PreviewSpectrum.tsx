import { useEffect, useRef, type CSSProperties } from 'react'
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

/**
 * Spectrum bars under the LED preview. The bar/peak elements are rendered once
 * and animated by writing styles directly from an audio-store subscription —
 * the live mic publishes a fresh spectrum every animation frame, and driving
 * 28×2 elements through React re-renders at that rate is pure overhead.
 */
export default function PreviewSpectrum({
  audioVisualizerLive,
  spectrumOverride,
}: {
  audioVisualizerLive: boolean
  spectrumOverride?: number[] | null
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const peaksRef = useRef<number[]>(Array(NUM_BARS).fill(0))
  const propsRef = useRef({ audioVisualizerLive, spectrumOverride })
  propsRef.current = { audioVisualizerLive, spectrumOverride }
  const paintRef = useRef<() => void>(() => {})

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    // The bar wrappers are static; cache their children once.
    const bars: HTMLElement[] = []
    const peaks: HTMLElement[] = []
    for (const barWrap of wrap.children) {
      bars.push(barWrap.children[0] as HTMLElement)
      peaks.push(barWrap.children[1] as HTMLElement)
    }

    const paint = () => {
      const { audioVisualizerLive: live, spectrumOverride: override } = propsRef.current
      const source = override?.length ? override : useAudioStore.getState().previewSpectrum
      const sampled = resample(live ? source : [], NUM_BARS)
      const held = peaksRef.current
      for (let i = 0; i < NUM_BARS; i++) {
        const prev = sampled[i - 1] ?? sampled[i]
        const next = sampled[i + 1] ?? sampled[i]
        const value = clamp01(sampled[i] * 0.55 + ((prev + sampled[i] + next) / 3) * 0.45)
        held[i] = live ? clamp01(Math.max(value, held[i] - 0.02)) : 0
        bars[i].style.height = `${Math.max(6, value * 100)}%`
        peaks[i].style.bottom = `${Math.max(0, held[i] * 100 - 3)}%`
      }
    }
    paintRef.current = paint
    paint()

    // Live microphone data arrives via the audio store; an active show override
    // is painted by the prop effect below instead.
    let lastSpectrum: number[] | null = null
    return useAudioStore.subscribe((state) => {
      if (propsRef.current.spectrumOverride?.length) return
      if (state.previewSpectrum === lastSpectrum) return
      lastSpectrum = state.previewSpectrum
      paint()
    })
  }, [])

  // Repaint when the show override or live flag changes (playback cadence).
  useEffect(() => {
    paintRef.current()
  }, [audioVisualizerLive, spectrumOverride])

  return (
    <div ref={wrapRef} className={styles.spectrum} aria-hidden>
      {Array.from({ length: NUM_BARS }, (_, i) => {
        const hue = 188 + (i / Math.max(1, NUM_BARS - 1)) * 148
        const colorVars = { '--bar-hue': `${hue}` } as CSSProperties
        return (
          <div key={i} className={styles.barWrap}>
            <div className={styles.bar} style={{ height: '6%', ...colorVars }} />
            <div className={styles.peak} style={{ bottom: '0%', ...colorVars }} />
          </div>
        )
      })}
    </div>
  )
}
