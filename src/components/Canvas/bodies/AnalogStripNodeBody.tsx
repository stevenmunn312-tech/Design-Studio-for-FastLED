import { usePreviewStore } from '../../../state/previewStore'
import styles from './AnalogStripNodeBody.module.css'

function channel(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(255, Math.round(value))) : 0
}

/*
 * The one colour the whole strip shows, as the preview evaluates it (`color`,
 * published by the AnalogStripOutput evaluator with the rule the firmware
 * writes to its three PWM pins). The strip is not part of any LED output's
 * frame, so this bar is the only place its colour can be seen before it is on
 * the bench.
 */
export default function AnalogStripNodeBody({ nodeId }: { nodeId: string }) {
  // A string, so the node re-renders when the colour changes, not on every publish.
  const rgb = usePreviewStore((state) => {
    const color = state.outputs.get(nodeId)?.color as { r?: unknown; g?: unknown; b?: unknown } | undefined
    return `${channel(color?.r)},${channel(color?.g)},${channel(color?.b)}`
  })
  return (
    <div className={styles.row}>
      <span className={styles.label}>Strip</span>
      <div
        className={styles.strip}
        role="img"
        aria-label={`Strip colour rgb(${rgb})`}
        style={{ background: `rgb(${rgb})` }}
      />
    </div>
  )
}
