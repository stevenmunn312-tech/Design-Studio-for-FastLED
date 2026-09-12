import { useMemo } from 'react'
import { useUploadStore } from '../../state/uploadStore'
import { useDeviceTelemetryStore } from '../../state/deviceTelemetryStore'
import {
  TELEMETRY_INTERVAL_MS,
  telemetryHeapSlopeBytesPerHour,
  telemetryLeaking,
  telemetryMeanFps,
} from '../../state/deviceTelemetry'
import styles from './DeviceTelemetryCard.module.css'

/**
 * What a running board reports about itself, while it runs.
 *
 * The bench instrument HW-11 asks for: free heap and its drift over a soak,
 * PSRAM, frame rate, the worst touch response and the draw buffer the build
 * actually allocated. It reads the Output console's serial connection rather
 * than opening one — the helper holds a port exclusively, so a second reader
 * is not a thing that can work — which is why the button here starts *that*
 * connection instead of one of its own.
 *
 * Every figure is the device's, not this component's: the accumulation lives in
 * `deviceTelemetry.ts` so the saved report and the card cannot disagree about
 * what an hour showed.
 */
export default function DeviceTelemetryCard() {
  const { selectedPort, serialConnected, serialError, busy, startSerial, stopSerial } = useUploadStore()
  const run = useDeviceTelemetryStore((s) => s.run)
  const otherLines = useDeviceTelemetryStore((s) => s.otherLines)
  const reset = useDeviceTelemetryStore((s) => s.reset)
  const report = useDeviceTelemetryStore((s) => s.report)

  const slope = useMemo(() => (run ? telemetryHeapSlopeBytesPerHour(run) : null), [run])
  const leaking = useMemo(() => (run ? telemetryLeaking(run) : false), [run])

  const save = () => {
    const text = report()
    if (!text) return
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `device-telemetry-${stamp}.txt`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <span className={styles.title}>Device telemetry</span>
        <span className={styles.uptime}>
          {run ? `uptime ${clock(run.latest.uptimeSec)}` : serialConnected ? 'listening…' : 'not connected'}
        </span>
      </div>

      {run ? (
        <div className={styles.grid}>
          <Field label="Free heap" value={bytes(run.latest.heapFree)} />
          <Field label="Lowest heap" value={bytes(run.heapMinReported)} />
          <Field
            label="Heap drift"
            value={slope === null ? 'measuring…' : `${bytes(slope)}/h`}
            tone={leaking ? 'bad' : slope === null ? 'idle' : undefined}
          />
          <Field label="PSRAM free" value={psram(run.latest.psramFree, run.latest.psramTotal)} />
          <Field label="Frames/sec" value={`${run.latest.fps.toFixed(1)} (min ${run.fpsMin.toFixed(1)})`} />
          <Field label="Mean fps" value={telemetryMeanFps(run).toFixed(1)} />
          <Field
            label="Longest pass"
            value={run.loopMaxMs === null ? '—' : `${run.loopMaxMs.toFixed(1)} ms`}
          />
          <Field
            label="Worst touch"
            value={run.touchWorstMs === null ? 'untouched' : `${run.touchWorstMs.toFixed(1)} ms`}
            tone={run.touchWorstMs === null ? 'idle' : undefined}
          />
          <Field label="Draw buffer" value={bytes(run.latest.drawBufferBytes)} />
          <Field label="Samples" value={`${run.samples}`} />
        </div>
      ) : (
        <p className={styles.note}>
          {serialConnected
            ? `Listening on ${selectedPort}. Nothing reported yet — turn on “Report telemetry” on the Board node, upload, and a line arrives every ${Math.round(TELEMETRY_INTERVAL_MS / 1000)} s.`
            : 'Connect to the board’s serial port to read what it reports. Needs “Report telemetry” on the Board node and a fresh upload.'}
          {otherLines > 0 ? ` (${otherLines} other lines seen.)` : ''}
        </p>
      )}

      {leaking && (
        <p className={`${styles.note} ${styles.bad}`}>
          Heap is falling at {bytes(slope ?? 0)}/h — this run fails the soak condition.
        </p>
      )}
      {serialError && <p className={`${styles.note} ${styles.bad}`}>{serialError}</p>}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.button}
          onClick={() => (serialConnected ? stopSerial() : void startSerial())}
          disabled={!selectedPort || busy}
          title={selectedPort ? undefined : 'Choose the board’s port first'}
        >
          {serialConnected ? 'Stop listening' : 'Listen'}
        </button>
        <button type="button" className={styles.button} onClick={reset} disabled={!run}>
          Restart run
        </button>
        <button type="button" className={styles.button} onClick={save} disabled={!run}>
          Save report
        </button>
      </div>
    </div>
  )
}

function Field({ label, value, tone }: { label: string; value: string; tone?: 'bad' | 'idle' }) {
  return (
    <span className={styles.field}>
      <span className={styles.label}>{label}</span>
      <span className={`${styles.value} ${tone ? styles[tone] : ''}`}>{value}</span>
    </span>
  )
}

function bytes(value: number | null): string {
  if (value === null) return '—'
  const size = Math.abs(value)
  const sign = value < 0 ? '−' : ''
  if (size >= 1024 * 1024) return `${sign}${(size / (1024 * 1024)).toFixed(2)} MB`
  if (size >= 1024) return `${sign}${(size / 1024).toFixed(1)} KB`
  return `${sign}${Math.round(size)} B`
}

/** A board with no PSRAM says so, rather than reporting nought free. */
function psram(free: number | null, total: number | null): string {
  if (free === null || total === null) return '—'
  if (total === 0) return 'none fitted'
  return `${bytes(free)} of ${bytes(total)}`
}

function clock(totalSeconds: number): string {
  const whole = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(whole / 3600)
  const m = Math.floor((whole % 3600) / 60)
  const s = whole % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
