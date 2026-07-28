import { useEffect, useState } from 'react'
import { formatRtcDate, formatRtcTime, readRtcSnapshot } from '../../state/rtc'
import { useGraphStore } from '../../state/graphStore'
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
    </div>
  )
}
