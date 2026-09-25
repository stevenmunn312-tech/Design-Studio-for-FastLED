import type { ReadinessLayer, ReadinessTone } from '../../utils/readinessLayers'
import styles from './Upload.module.css'

// A glyph beside each reading so the tone is not carried by colour alone.
const TONE_MARK: Record<ReadinessTone, string> = {
  ok: '✓',
  warn: '△',
  blocked: '✕',
  pending: '…',
}

const TONE_WORD: Record<ReadinessTone, string> = {
  ok: 'established',
  warn: 'caution',
  blocked: 'blocks upload',
  pending: 'not known yet',
}

const TONE_CLASS: Record<ReadinessTone, string> = {
  ok: styles.layerOk,
  warn: styles.layerWarn,
  blocked: styles.layerBlocked,
  pending: styles.layerPending,
}

/**
 * The five kinds of readiness, one row each, so a live preview cannot be read
 * as a compiled build or a tested board. Each row opens (keyboard or pointer)
 * to say what its reading establishes and what it does not.
 */
export default function ReadinessLayers({ layers }: { layers: ReadinessLayer[] }) {
  return (
    <section className={styles.layers} aria-labelledby="readiness-layers-title">
      <div id="readiness-layers-title" className={styles.layersTitle}>What is established</div>
      {layers.map((layer) => (
        <details key={layer.kind} className={`${styles.layer} ${TONE_CLASS[layer.tone]}`} data-kind={layer.kind} data-tone={layer.tone}>
          <summary className={styles.layerSummary} aria-label={`${layer.label}: ${layer.status} (${TONE_WORD[layer.tone]})`}>
            <span className={styles.layerLabel}>{layer.label}</span>
            <span className={styles.layerStatus}>
              <span className={styles.layerMark} aria-hidden="true">{TONE_MARK[layer.tone]}</span>
              {layer.status}
            </span>
          </summary>
          <p className={styles.layerDetail}>{layer.detail}</p>
        </details>
      ))}
    </section>
  )
}
