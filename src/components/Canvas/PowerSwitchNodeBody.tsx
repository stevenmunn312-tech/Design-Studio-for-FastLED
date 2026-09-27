import { usePreviewStore } from '../../state/previewStore'
import styles from './PowerSwitchNodeBody.module.css'

/*
 * The share of full power this switch will give its load, as the preview
 * evaluates it (`load`, published by the PowerSwitchOutput evaluator with the
 * same rule firmware emits). There is no simulated load to draw, so this is
 * the one place a dimmer's effect can be seen before it is on the bench.
 */
export default function PowerSwitchNodeBody({ nodeId }: { nodeId: string }) {
  const live = usePreviewStore((state) => state.outputs.get(nodeId)?.load)
  const load = typeof live === 'number' && Number.isFinite(live) ? Math.max(0, Math.min(1, live)) : 0
  const percent = Math.round(load * 100)
  return (
    <div className={styles.row}>
      <span className={styles.label}>Load</span>
      <div
        className={styles.track}
        role="meter"
        aria-label="Load power"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className={styles.fill} style={{ width: `${percent}%` }} />
      </div>
      <span className={styles.readout}>{percent === 0 ? 'off' : `${percent}%`}</span>
    </div>
  )
}
