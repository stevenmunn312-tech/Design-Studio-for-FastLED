import { usePreviewStore } from '../../state/previewStore'
import { powerSwitchChannels } from '../../state/powerSwitch'
import styles from './PowerSwitchNodeBody.module.css'

function percentOf(value: unknown): number {
  const load = typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
  return Math.round(load * 100)
}

/*
 * The share of full power each channel will give its load, as the preview
 * evaluates it (`load`, `load2` and on, published by the PowerSwitchOutput
 * evaluator with the same rule firmware emits). There is no simulated load to
 * draw, so this is the one place a dimmer's effect can be seen before it is on
 * the bench. A one-channel board shows one "Load" bar; a Mosfetti shows A to D.
 */
export default function PowerSwitchNodeBody({ nodeId, partId }: { nodeId: string; partId: unknown }) {
  const channels = powerSwitchChannels(partId)
  // A string, so the node re-renders when a percentage changes, not on every publish.
  const percents = usePreviewStore((state) => {
    const outputs = state.outputs.get(nodeId)
    return channels.map((channel) => percentOf(outputs?.[channel.load])).join(',')
  }).split(',').map(Number)
  return (
    <>
      {channels.map((channel) => {
        const percent = percents[channel.index] ?? 0
        return (
          <div key={channel.index} className={styles.row}>
            <span className={styles.label}>{channel.label ?? 'Load'}</span>
            <div
              className={styles.track}
              role="meter"
              aria-label={channel.label === null ? 'Load power' : `Channel ${channel.label} load power`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <div className={styles.fill} style={{ width: `${percent}%` }} />
            </div>
            <span className={styles.readout}>{percent === 0 ? 'off' : `${percent}%`}</span>
          </div>
        )
      })}
    </>
  )
}
