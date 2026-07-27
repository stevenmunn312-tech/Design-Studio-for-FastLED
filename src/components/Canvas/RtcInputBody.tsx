import { useEffect, useState } from 'react'
import { formatRtcDate, formatRtcTime, readRtcSnapshot } from '../../state/rtc'
import styles from './RtcInputBody.module.css'

const REFRESH_MS = 250

export default function RtcInputBody() {
  const [snapshot, setSnapshot] = useState(() => readRtcSnapshot())

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
    </div>
  )
}
