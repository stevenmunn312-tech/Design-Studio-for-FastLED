import { useEffect, useRef, useState } from 'react'
import { useUploadStore } from '../../state/uploadStore'
import styles from './Upload.module.css'

// Dismissible slide-over that streams the detailed compile/upload output. Opens
// automatically on error; stays put otherwise so the user can pop it open from
// the node's "Output" button.
export default function OutputConsole() {
  const {
    log, status, busy, selectedPort, serialLog, serialConnected, serialError, serialBaud,
    closeConsole, clearLog, clearSerialLog, startSerial, stopSerial, setSerialBaud,
  } = useUploadStore()
  const bodyRef = useRef<HTMLPreElement>(null)
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [tab, setTab] = useState<'output' | 'serial'>('output')
  const visibleLog = tab === 'output' ? log : serialLog

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
        <button
          className={styles.consoleCopyBtn}
          onClick={copyLog}
          disabled={!visibleLog}
          title="Copy the complete output as text"
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
