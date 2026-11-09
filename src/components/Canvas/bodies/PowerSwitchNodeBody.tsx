import { usePreviewStore } from '../../../state/previewStore'
import { powerSwitchRgb, powerSwitchSeparateChannels } from '../../../state/peripherals/powerSwitch'
import styles from './PowerSwitchNodeBody.module.css'

function percentOf(value: unknown): number {
  const load = typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
  return Math.round(load * 100)
}

function byteOf(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(255, Math.round(value))) : 0
}

/*
 * The share of full power each channel will give its load, as the preview
 * evaluates it (`load`, `load2` and on, published by the PowerSwitchOutput
 * evaluator with the same rule firmware emits). There is no simulated load to
 * draw, so this is the one place a dimmer's effect can be seen before it is on
 * the bench. A one-channel board shows one "Load" bar; a Mosfetti shows A to D.
 *
 * An RGB strip on the first three channels is drawn as the one colour it
 * shows instead (`stripColor`, the duties firmware writes), with a bar for
 * each channel it leaves free.
 */
export default function PowerSwitchNodeBody({ nodeId, partId, loadType }: { nodeId: string; partId: unknown; loadType: unknown }) {
  const properties = { partId, loadType }
  const strip = powerSwitchRgb(properties)
  const channels = powerSwitchSeparateChannels(properties)
  // A string, so the node re-renders when a percentage changes, not on every publish.
  const readout = usePreviewStore((state) => {
    const outputs = state.outputs.get(nodeId)
    const color = outputs?.stripColor as { r?: unknown; g?: unknown; b?: unknown } | undefined
    const rgb = strip ? `${byteOf(color?.r)},${byteOf(color?.g)},${byteOf(color?.b)}` : ''
    return [rgb, ...channels.map((channel) => percentOf(outputs?.[channel.load]))].join('|')
  }).split('|')
  const [rgb, ...percents] = readout
  return (
    <>
      {strip && (
        <div className={styles.row}>
          <span className={styles.label}>Strip</span>
          <div
            className={styles.strip}
            role="img"
            aria-label={rgb === '0,0,0' ? 'RGB strip off' : `RGB strip colour rgb(${rgb})`}
            style={{ background: `rgb(${rgb})` }}
          />
          <span className={styles.readout}>{rgb === '0,0,0' ? 'off' : ''}</span>
        </div>
      )}
      {channels.map((channel, row) => {
        const percent = Number(percents[row] ?? 0)
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
