import { useEffect, useRef } from 'react'
import { useAudioStore } from '../../state/audioStore'
import { useUiStore } from '../../state/uiStore'
import { usePreviewStore } from '../../state/previewStore'
import { useGraphStore } from '../../state/graphStore'
import styles from './FFTAnalyzerBody.module.css'

interface Props {
  nodeId: string
  bands: number
}

const clamp01 = (value: unknown) =>
  Math.max(0, Math.min(1, typeof value === 'number' && Number.isFinite(value) ? value : 0))

function resample(values: number[], count: number): number[] {
  if (!values.length) return Array(count).fill(0)
  return Array.from({ length: count }, (_, i) => {
    const start = Math.floor((i * values.length) / count)
    const end = Math.max(start + 1, Math.ceil(((i + 1) * values.length) / count))
    const slice = values.slice(start, end)
    return slice.reduce((sum, value) => sum + value, 0) / slice.length
  })
}

export default function FFTAnalyzerBody({ nodeId, bands }: Props) {
  const active = useAudioStore((s) => s.active)
  const wired = useGraphStore((s) => s.edges.some((e) => e.target === nodeId && e.targetHandle === 'audio'))
  const testSignal = useUiStore((s) => s.testSignal)
  const toggleTestSignal = useUiStore((s) => s.toggleTestSignal)
  const outputs = usePreviewStore((s) => s.outputs.get(nodeId))
  const levels = [
    { key: 'bass', label: 'LOW', value: clamp01(outputs?.bass) },
    { key: 'mids', label: 'MID', value: clamp01(outputs?.mids) },
    { key: 'treble', label: 'HIGH', value: clamp01(outputs?.treble) },
  ]
  const count = Math.max(8, Math.min(32, Math.round(bands || 24)))
  const nodeLive = wired && active

  // The spectrum spans are animated by writing heights directly from an
  // audio-store subscription — the live mic publishes a fresh spectrum every
  // animation frame, and re-rendering up to 32 spans through React at that
  // rate is pure overhead. The 8 fps band readout below stays React-driven.
  const spectrumRef = useRef<HTMLDivElement>(null)
  const paintRef = useRef<() => void>(() => {})
  const stateRef = useRef({ nodeLive, count, anchors: [0, 0, 0] })
  stateRef.current = { nodeLive, count, anchors: levels.map((level) => level.value) }

  useEffect(() => {
    const el = spectrumRef.current
    if (!el) return

    const paint = () => {
      const { nodeLive: live, count: n, anchors } = stateRef.current
      const values = live
        ? resample(useAudioStore.getState().spectrum, n)
        // With the mic off the evaluator emits zero — unless the Test Signal
        // toggle is on, when it supplies an animated demo. Shape whatever the
        // levels are (flat or animated) into a spectrum so the node reflects
        // its real output.
        : Array.from({ length: n }, (_, i) => {
            const p = (i / Math.max(1, n - 1)) * 2
            const band = Math.min(1, Math.floor(p))
            const t = p - band
            const envelope = anchors[band] * (1 - t) + anchors[band + 1] * t
            return envelope * (0.72 + 0.28 * Math.sin(i * 2.37) ** 2)
          })
      const spans = el.children
      for (let i = 0; i < spans.length && i < values.length; i++) {
        ;(spans[i] as HTMLElement).style.height = `${Math.max(3, clamp01(values[i]) * 100)}%`
      }
    }
    paintRef.current = paint
    paint()

    let lastSpectrum: number[] | null = null
    return useAudioStore.subscribe((state) => {
      if (!stateRef.current.nodeLive) return
      if (state.spectrum === lastSpectrum) return
      lastSpectrum = state.spectrum
      paint()
    })
  }, [])

  // Repaint when the React-visible inputs change (band levels at the preview
  // publish cadence, live-mode flips, or a bands-count edit).
  useEffect(() => {
    paintRef.current()
  }, [outputs, nodeLive, count])

  return (
    <div className={styles.analyzer} aria-label="Live FFT analysis">
      <div ref={spectrumRef} className={styles.spectrum} aria-hidden="true">
        {Array.from({ length: count }, (_, i) => (
          <span key={i} style={{ height: '3%' }} />
        ))}
      </div>
      <div className={styles.readout}>
        {levels.map((level) => (
          <div className={styles.band} data-band={level.key} key={level.key}>
            <span className={styles.bandLabel}>{level.label}</span>
            <span className={styles.meter}><span style={{ width: `${level.value * 100}%` }} /></span>
            <output aria-label={`${level.key} level`}>{Math.round(level.value * 100)}</output>
          </div>
        ))}
      </div>
      <div className={styles.footer}>
        <button
          type="button"
          className={`${styles.testBtn} nodrag ${testSignal ? styles.testOn : ''}`}
          onClick={toggleTestSignal}
          aria-pressed={testSignal}
          title="Test signal — animate this node without a mic or song"
        >
          Test {testSignal ? 'On' : 'Off'}
        </button>
        <div className={styles.status} data-active={nodeLive}>
          <span />{nodeLive ? 'MIC LIVE' : testSignal ? 'TEST SIGNAL' : 'SILENT'}
        </div>
      </div>
    </div>
  )
}
