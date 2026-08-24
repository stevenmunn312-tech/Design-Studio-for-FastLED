import { useUiStore } from '../../state/uiStore'
import { usePreviewStore } from '../../state/previewStore'
import { useGraphStore } from '../../state/graphStore'
import type { AudioSignal } from '../../state/graphEvaluator'
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
  const source = useGraphStore((state) => {
    const edge = state.edges.find((entry) => entry.target === nodeId && entry.targetHandle === 'audio')
    return edge?.source && edge.sourceHandle ? `${edge.source}:${edge.sourceHandle}` : ''
  })
  const audio = usePreviewStore((state) => {
    if (!source) return null
    const [sourceId, sourcePort] = source.split(':')
    const value = state.outputs.get(sourceId)?.[sourcePort]
    return value && typeof value === 'object' && !Array.isArray(value) ? value as AudioSignal : null
  })
  const testSignal = useUiStore((s) => s.testSignal)
  const toggleTestSignal = useUiStore((s) => s.toggleTestSignal)
  const outputs = usePreviewStore((s) => s.outputs.get(nodeId))
  const levels = [
    { key: 'bass', label: 'LOW', value: clamp01(outputs?.bass) },
    { key: 'mids', label: 'MID', value: clamp01(outputs?.mids) },
    { key: 'treble', label: 'HIGH', value: clamp01(outputs?.treble) },
  ]
  const count = Math.max(8, Math.min(32, Math.round(bands || 24)))
  const nodeLive = Boolean(audio && (audio.active || audio.micActive))
  const spectrum = nodeLive
    ? resample(audio?.previewSpectrum?.length ? audio.previewSpectrum : audio?.spectrum ?? [], count)
    // With the source off the evaluator emits zero — unless Test Signal is on.
    // Shape the node's actual outputs into a spectrum so this view never reads
    // around its Audio cable.
    : Array.from({ length: count }, (_, i) => {
        const p = (i / Math.max(1, count - 1)) * 2
        const band = Math.min(1, Math.floor(p))
        const mix = p - band
        const anchors = levels.map((level) => level.value)
        const envelope = anchors[band] * (1 - mix) + anchors[band + 1] * mix
        return envelope * (0.72 + 0.28 * Math.sin(i * 2.37) ** 2)
      })

  return (
    <div className={styles.analyzer} aria-label="Live FFT analysis">
      <div className={styles.spectrum} aria-hidden="true">
        {Array.from({ length: count }, (_, i) => (
          <span key={i} style={{ height: `${Math.max(3, clamp01(spectrum[i]) * 100)}%` }} />
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
          <span />{nodeLive ? 'AUDIO LIVE' : testSignal ? 'TEST SIGNAL' : 'SILENT'}
        </div>
      </div>
    </div>
  )
}
