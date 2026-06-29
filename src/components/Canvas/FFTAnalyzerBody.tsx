import { useAudioStore } from '../../state/audioStore'
import { usePreviewStore } from '../../state/previewStore'
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
  const liveSpectrum = useAudioStore((s) => s.spectrum)
  const outputs = usePreviewStore((s) => s.outputs.get(nodeId))
  const levels = [
    { key: 'bass', label: 'LOW', value: clamp01(outputs?.bass) },
    { key: 'mids', label: 'MID', value: clamp01(outputs?.mids) },
    { key: 'treble', label: 'HIGH', value: clamp01(outputs?.treble) },
  ]
  const count = Math.max(8, Math.min(32, Math.round(bands || 24)))
  const spectrum = (() => {
    if (active) return resample(liveSpectrum, count)
    // The evaluator supplies animated demo levels while the mic is off. Shape
    // them into a spectrum so the node still explains itself before wiring.
    const anchors = levels.map((level) => level.value)
    return Array.from({ length: count }, (_, i) => {
      const p = (i / Math.max(1, count - 1)) * 2
      const band = Math.min(1, Math.floor(p))
      const t = p - band
      const envelope = anchors[band] * (1 - t) + anchors[band + 1] * t
      return envelope * (0.72 + 0.28 * Math.sin(i * 2.37) ** 2)
    })
  })()

  return (
    <div className={styles.analyzer} aria-label="Live FFT analysis">
      <div className={styles.spectrum} aria-hidden="true">
        {spectrum.map((value, i) => (
          <span key={i} style={{ height: `${Math.max(3, clamp01(value) * 100)}%` }} />
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
      <div className={styles.status} data-active={active}>
        <span />{active ? 'MIC LIVE' : 'DEMO SIGNAL'}
      </div>
    </div>
  )
}
