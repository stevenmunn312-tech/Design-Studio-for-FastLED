import { useEffect, useState } from 'react'
import { formatRtcDate, formatRtcTime, readRtcSnapshot } from '../../state/rtc'
import { useGraphStore } from '../../state/graphStore'
import { useNetworkCredentialsStore, EMPTY_CREDENTIALS } from '../../state/networkCredentials'
import styles from './RtcInputBody.module.css'

const REFRESH_MS = 250

function firmwareSourceLabel(timeSource: unknown): string {
  switch (String(timeSource ?? 'Compile Time')) {
    case 'Manual': return 'FIRMWARE MANUAL'
    case 'NTP': return 'FIRMWARE NTP'
    default: return 'FIRMWARE COMPILE TIME'
  }
}

export default function RtcInputBody({ nodeId }: { nodeId: string }) {
  const [snapshot, setSnapshot] = useState(() => readRtcSnapshot())
  const timeSource = useGraphStore((s) =>
    s.nodes.find((node) => node.id === nodeId)?.data.properties.timeSource ?? 'Compile Time'
  )
  const credentials = useNetworkCredentialsStore((s) => s.byNodeId[nodeId] ?? EMPTY_CREDENTIALS)
  const setCredentials = useNetworkCredentialsStore((s) => s.setCredentials)

  useEffect(() => {
    const timer = window.setInterval(() => setSnapshot(readRtcSnapshot()), REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className={styles.body}>
      <div className={styles.status}>
        <span />
        PREVIEW CLOCK
      </div>
      <div className={styles.readout}>
        <span>{formatRtcTime(snapshot)}</span>
        <span>{snapshot.valid ? 'valid' : 'invalid'}</span>
      </div>
      <div className={styles.readout}>
        <span>{formatRtcDate(snapshot)}</span>
        <span>{snapshot.weekend ? 'weekend' : 'weekday'}</span>
      </div>
      <div className={styles.readout}>
        <span>{firmwareSourceLabel(timeSource)}</span>
        <span>{String(timeSource ?? 'Compile Time')}</span>
      </div>
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
