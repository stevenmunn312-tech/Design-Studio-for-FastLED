import { useEffect, useState } from 'react'
import {
  formatRtcDate, formatRtcTime, rtcPreviewSnapshot, rtcTimeSource,
  type RtcPreview,
} from '../../state/rtc'
import { useGraphStore } from '../../state/graphStore'
import { usePreviewStore } from '../../state/previewStore'
import { useNetworkCredentialsStore, EMPTY_CREDENTIALS } from '../../state/networkCredentials'
import styles from './RtcInputBody.module.css'

const REFRESH_MS = 250

function sourceLabel(timeSource: string): string {
  switch (timeSource) {
    case 'Manual': return 'MANUAL SEED'
    case 'NTP': return 'NTP / UTC OFFSET'
    case 'DS3231': return 'DS3231 / I2C'
    default: return 'COMPILE TIME'
  }
}

/** The node's live evaluator outputs, when the preview loop has published them —
 *  so this readout shows exactly the values downstream nodes are seeing rather
 *  than a second, separately-ticking clock. */
function publishedSnapshot(ports: Record<string, unknown> | undefined): RtcPreview | null {
  if (!ports || typeof ports.secondsOfDay !== 'number') return null
  const n = (key: string) => Number(ports[key] ?? 0)
  return {
    hour: n('hour'), minute: n('minute'), second: n('second'),
    weekday: n('weekday'), day: n('day'), month: n('month'), year: n('year'),
    secondsOfDay: n('secondsOfDay'),
    weekend: Boolean(ports.weekend),
    valid: Boolean(ports.valid),
    synced: Boolean(ports.synced),
    stale: Boolean(ports.stale),
  }
}

export default function RtcInputBody({ nodeId }: { nodeId: string }) {
  const properties = useGraphStore((s) => s.nodes.find((node) => node.id === nodeId)?.data.properties)
  const timeSource = rtcTimeSource(properties)
  // Local fallback for when the render loop isn't publishing this node (preview
  // paused, or the node is outside the evaluated hot set).
  const [fallback, setFallback] = useState(() => rtcPreviewSnapshot(properties))
  const live = usePreviewStore((s) => publishedSnapshot(s.outputs.get(nodeId)))
  const snapshot = live ?? fallback
  const credentials = useNetworkCredentialsStore((s) => s.byNodeId[nodeId] ?? EMPTY_CREDENTIALS)
  const setCredentials = useNetworkCredentialsStore((s) => s.setCredentials)

  useEffect(() => {
    setFallback(rtcPreviewSnapshot(properties))
    const timer = window.setInterval(() => setFallback(rtcPreviewSnapshot(properties)), REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [properties])

  return (
    <div className={styles.body}>
      <div className={`${styles.status} ${snapshot.valid ? '' : styles.statusBad}`}>
        <span />
        {snapshot.valid ? 'PREVIEW CLOCK' : 'CLOCK INVALID'}
      </div>
      <div className={styles.readout}>
        <span>{snapshot.valid ? formatRtcTime(snapshot) : '--:--:--'}</span>
        <span>{snapshot.valid ? 'valid' : 'invalid'}</span>
      </div>
      <div className={styles.readout}>
        <span>{snapshot.valid ? formatRtcDate(snapshot) : '--'}</span>
        <span>{snapshot.weekend ? 'weekend' : 'weekday'}</span>
      </div>
      <div className={styles.readout}>
        <span>{sourceLabel(timeSource)}</span>
        <span>{timeSource}</span>
      </div>
      {timeSource === 'Manual' && !snapshot.valid && (
        <div className={styles.note}>
          The manual start date/time is not a real calendar instant, so the firmware clock
          never starts and every output stays at zero. Fix the Manual Start fields below.
        </div>
      )}
      {timeSource === 'DS3231' && (
        <div className={styles.note}>
          Preview simulates a healthy module with the browser clock. Firmware reads address
          0x68 on the board&apos;s default SDA/SCL pins; stale means the oscillator-stop flag is set.
        </div>
      )}
      {String(timeSource ?? 'Compile Time') === 'NTP' && (
        <>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor={`${nodeId}-rtc-ssid`}>Wi-Fi SSID</label>
            <input
              id={`${nodeId}-rtc-ssid`}
              className={`nodrag ${styles.fieldInput}`}
              type="text"
              autoComplete="off"
              value={credentials.ssid}
              onChange={(e) => setCredentials(nodeId, { ssid: e.target.value })}
              placeholder="network name"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor={`${nodeId}-rtc-password`}>Wi-Fi password</label>
            <input
              id={`${nodeId}-rtc-password`}
              className={`nodrag ${styles.fieldInput}`}
              type="password"
              autoComplete="off"
              value={credentials.password}
              onChange={(e) => setCredentials(nodeId, { password: e.target.value })}
              placeholder="password"
            />
          </div>
          <div className={styles.note}>Stored in this browser only — never saved in the project file or share links.</div>
        </>
      )}
    </div>
  )
}
