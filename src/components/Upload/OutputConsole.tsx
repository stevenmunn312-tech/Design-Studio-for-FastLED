import { useEffect, useMemo, useRef, useState } from 'react'
import { useUploadStore } from '../../state/uploadStore'
import { useCapacityStore } from '../../state/capacityStore'
import { condenseLogView } from '../../utils/logView'
import styles from './Upload.module.css'

/**
 * The capacity meter's own compile log, as an Output-tab footer.
 *
 * The meter is a three-word chip under the preview, and when its check fails
 * it says "see helper log" — while the helper log lives down here, showing
 * only what an *Upload* streamed. So the one place that reports the failure is
 * the one place that cannot show why, and the place that could show why does
 * not know it happened. This closes that loop.
 *
 * Deliberately kept out of `log` rather than appended to it: `parseStatus`
 * scans that string for failure markers, so folding a capacity check's
 * compiler errors into it would flip a healthy upload's status to "Error", and
 * the next upload clears `log` and would take the explanation with it.
 */
function useCapacityFailureReport(): string {
  const result = useCapacityStore((s) => s.result)
  // `busy` is not a failure — nothing was compiled (see capacityStore).
  if (!result || result.ok || result.busy) return ''
  const rule = '─'.repeat(48)
  const detail = result.log?.trim()
  return `\n${rule}\nLast capacity check · ${result.target}\n${result.error ?? 'check failed'}\n`
    + (detail ? `${rule}\n${detail}\n` : '')
}

// Dismissible slide-over that streams the detailed compile/upload output. Opens
// automatically on error; stays put otherwise so the user can pop it open from
// the node's "Output" button.
export default function OutputConsole() {
  const {
    log, status, busy, selectedPort, serialLog, serialConnected, serialError, serialBaud,
    verboseOutput, setVerboseOutput,
    closeConsole, clearLog, clearSerialLog, startSerial, stopSerial, setSerialBaud,
  } = useUploadStore()
  const bodyRef = useRef<HTMLPreElement>(null)
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [tab, setTab] = useState<'output' | 'serial'>('output')
  const capacityReport = useCapacityFailureReport()
  // Filtering is display-only — the store keeps every byte, so ticking Verbose
  // reveals this same run rather than needing another. Memoised because this
  // re-renders on every streamed chunk of a log that can reach megabytes.
  const outputLog = log + capacityReport
  const output = useMemo(() => condenseLogView(outputLog, verboseOutput), [outputLog, verboseOutput])
  const visibleLog = tab === 'output' ? output.text : serialLog
  const hidden = tab === 'output' ? output.hidden : 0

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  }, [visibleLog])

  useEffect(() => () => {
    if (copyResetRef.current) clearTimeout(copyResetRef.current)
  }, [])

  const copyLog = async () => {
    if (!visibleLog) return
    try {
      await navigator.clipboard.writeText(visibleLog)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
    if (copyResetRef.current) clearTimeout(copyResetRef.current)
    copyResetRef.current = setTimeout(() => setCopyState('idle'), 2000)
  }

  const copyLabel = copyState === 'copied'
    ? 'Copied'
    : copyState === 'failed' ? 'Copy failed' : 'Copy text'

  return (
    <div className={styles.consolePanel} role="log" aria-label="Upload and serial output">
      <div className={styles.consoleHeader}>
        <div className={styles.consoleTabs} role="tablist" aria-label="Output type">
          <button className={tab === 'output' ? styles.consoleTabActive : styles.consoleTab} onClick={() => setTab('output')} role="tab" aria-selected={tab === 'output'}>Output</button>
          <button className={tab === 'serial' ? styles.consoleTabActive : styles.consoleTab} onClick={() => setTab('serial')} role="tab" aria-selected={tab === 'serial'}>Serial</button>
        </div>
        {tab === 'output' && status.phase !== 'idle' && (
          <span className={`${styles.consoleStatus} ${status.phase === 'error' ? styles.stError : status.phase === 'done' ? styles.stDone : styles.stBusy}`}>
            {status.message}
          </span>
        )}
        <span className={styles.spacer} />
        {tab === 'output' && (
          <label className={styles.consoleToggle} title="Show the toolchain's own output too — compiler warnings, include chains, and the source echoed under each one">
            <input
              type="checkbox"
              checked={verboseOutput}
              onChange={(e) => setVerboseOutput(e.target.checked)}
            />
            Verbose
            {hidden > 0 && <span className={styles.consoleToggleCount}>+{hidden}</span>}
          </label>
        )}
        <button
          className={styles.consoleCopyBtn}
          onClick={copyLog}
          disabled={!visibleLog}
          title={hidden > 0
            ? 'Copies what is shown here — tick Verbose first if you need the whole log'
            : 'Copy the complete output as text'}
          aria-live="polite"
        >
          {copyLabel}
        </button>
        <button className={styles.consoleBtn} onClick={tab === 'output' ? clearLog : clearSerialLog} disabled={tab === 'output' && busy} title="Clear">Clear</button>
        <button className={styles.consoleBtn} onClick={closeConsole} title="Hide">×</button>
      </div>
      {tab === 'serial' && (
        <div className={styles.serialToolbar}>
          <span className={styles.serialPort}>{selectedPort || 'No port selected'}</span>
          <select className={styles.serialBaud} value={serialBaud} onChange={(e) => setSerialBaud(Number(e.target.value))} disabled={serialConnected} aria-label="Baud rate">
            {[9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600].map((baud) => <option key={baud} value={baud}>{baud} baud</option>)}
          </select>
          <button className={styles.consoleBtn} onClick={serialConnected ? stopSerial : startSerial} disabled={!selectedPort || busy}>
            {serialConnected ? 'Disconnect' : 'Connect'}
          </button>
          <span className={serialError ? styles.stError : serialConnected ? styles.stDone : styles.serialIdle}>
            {serialError ? 'Error' : serialConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      )}
      <pre ref={bodyRef} className={styles.consoleBody}>{visibleLog || (tab === 'output' ? 'No output yet. Upload or install something to see logs here.' : 'Connect to view serial output from the selected board.')}</pre>
    </div>
  )
}
