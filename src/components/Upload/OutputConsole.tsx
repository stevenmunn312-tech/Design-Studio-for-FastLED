import { useEffect, useRef, useState } from 'react'
import { useUploadStore } from '../../state/uploadStore'
import styles from './Upload.module.css'

// Dismissible slide-over that streams the detailed compile/upload output. Opens
// automatically on error; stays put otherwise so the user can pop it open from
// the node's "Output" button.
export default function OutputConsole() {
  const { log, status, busy, closeConsole, clearLog } = useUploadStore()
  const bodyRef = useRef<HTMLPreElement>(null)
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  }, [log])

  useEffect(() => () => {
    if (copyResetRef.current) clearTimeout(copyResetRef.current)
  }, [])

  const copyLog = async () => {
    if (!log) return
    try {
      await navigator.clipboard.writeText(log)
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
    <div className={styles.consolePanel} role="log" aria-label="Upload output">
      <div className={styles.consoleHeader}>
        <span className={styles.consoleTitle}>Output</span>
        {status.phase !== 'idle' && (
          <span className={`${styles.consoleStatus} ${status.phase === 'error' ? styles.stError : status.phase === 'done' ? styles.stDone : styles.stBusy}`}>
            {status.message}
          </span>
        )}
        <span className={styles.spacer} />
        <button
          className={styles.consoleCopyBtn}
          onClick={copyLog}
          disabled={!log}
          title="Copy the complete output as text"
          aria-live="polite"
        >
          {copyLabel}
        </button>
        <button className={styles.consoleBtn} onClick={clearLog} disabled={busy} title="Clear">Clear</button>
        <button className={styles.consoleBtn} onClick={closeConsole} title="Hide">×</button>
      </div>
      <pre ref={bodyRef} className={styles.consoleBody}>{log || 'No output yet. Upload or install something to see logs here.'}</pre>
    </div>
  )
}
