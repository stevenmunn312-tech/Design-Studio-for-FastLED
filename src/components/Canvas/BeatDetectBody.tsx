import { useAudioStore } from '../../state/audioStore'
import { usePreviewStore } from '../../state/previewStore'
import styles from './BeatDetectBody.module.css'

function clamp01(value: unknown) {
  return Math.max(0, Math.min(1, typeof value === 'number' && Number.isFinite(value) ? value : 0))
}

export default function BeatDetectBody({ nodeId }: { nodeId: string }) {
  const active = useAudioStore((s) => s.active)
  const output = usePreviewStore((s) => s.outputs.get(nodeId))
  const beat = Boolean(output?.beat)
  const bpm = Math.max(0, Math.round(Number(output?.bpm ?? 120)))
  const intensity = beat ? 1 : clamp01((bpm - 60) / 120)
  const flux = clamp01(output?.flux)
  const onset = clamp01(output?.onset)
  const threshold = clamp01(output?.threshold)
  const contrast = Math.max(0, Number(output?.contrast ?? 0))
  const cooldownMs = Math.max(0, Math.round(Number(output?.cooldownMs ?? 0)))

  return (
    <div className={styles.wrap} aria-label="Beat detector status">
      <div className={styles.topLine}>
        <span className={styles.label}>Beat Detect</span>
        <span className={styles.mode} data-live={active}>
          {active ? 'LIVE' : 'PREVIEW'}
        </span>
      </div>

      <div className={styles.readout} data-beat={beat}>
        <span className={styles.pulse} aria-hidden="true">
          <span className={styles.pulseCore} style={{ opacity: intensity }} />
        </span>
        <div className={styles.stats}>
          <div className={styles.valueRow}>
            <strong className={styles.value}>{beat ? 'BEAT' : 'idle'}</strong>
            <span className={styles.bpm}>{bpm} BPM</span>
          </div>
          <div className={styles.barTrack} aria-hidden="true">
            {Array.from({ length: 8 }).map((_, i) => (
              <span
                key={i}
                className={styles.bar}
                style={{ opacity: beat ? 1 - i * 0.07 : 0.18 + i * 0.03 }}
              />
            ))}
          </div>
          <div className={styles.debugGrid}>
            <span>flux {flux.toFixed(2)}</span>
            <span>onset {onset.toFixed(2)}</span>
            <span>thr {threshold.toFixed(2)}</span>
            <span>x {contrast.toFixed(1)}</span>
          </div>
          <div className={styles.debugFoot}>gap {cooldownMs}ms</div>
        </div>
      </div>
    </div>
  )
}
