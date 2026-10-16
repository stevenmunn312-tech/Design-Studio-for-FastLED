import { useEffect, useMemo, useRef, useState } from 'react'
import { boardByFqbn, useUploadStore } from '../../state/upload/uploadStore'
import { useCapacityStore, type CapacityCheckPhase } from '../../state/upload/capacityStore'
import { formatElapsed, summarizeCapacity } from '../../utils/capacityFormat'
import { useElapsedSeconds } from '../../hooks/useElapsedSeconds'
import { condenseLogView } from '../../utils/logView'
import { describePort } from '../../utils/portStatus'
import styles from './Upload.module.css'

/**
 * The capacity meter's own result, as an Output-tab footer: the figures when it
 * measured, the compiler output when it failed.
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
function useCapacityReport(): string {
  const status = useCapacityStore((s) => s.status)
  const result = useCapacityStore((s) => s.result)
  const subject = useCapacityStore((s) => s.subject)
  const lastCheckMs = useCapacityStore((s) => s.lastCheckMs)
  const selectedFqbn = useUploadStore((s) => s.selectedFqbn)
  // A running check says so live (CapacityCheckProgress); the previous
  // answer would read as this one's. `busy` is not a result either — nothing
  // was compiled (see capacityStore).
  if (!result || result.busy || status === 'checking') return ''
  const rule = '─'.repeat(48)
  const took = lastCheckMs !== null ? ` · took ${formatElapsed(lastCheckMs / 1000)}` : ''
  if (result.ok || result.overflow) {
    const summary = summarizeCapacity(boardByFqbn(selectedFqbn), status, result, subject)
    return `\n${rule}\nLast capacity check · ${summary.line}${took}\n`
  }
  const detail = result.log?.trim()
  return `\n${rule}\nLast capacity check · ${result.target}${took}\n${result.error ?? 'check failed'}\n`
    + (detail ? `${rule}\n${detail}\n` : '')
}

const CHECK_PHASE_TEXT: Record<CapacityCheckPhase, string> = {
  generating: 'Writing the sketch from your graph…',
  compiling: 'Compiling for the board. The result appears here when the build finishes.',
  waiting: 'Another build is running on the helper. Trying again in a moment…',
}

/**
 * What a running capacity check is doing, and for how long. The helper
 * streams nothing back from a compile-only build, and a board's first build
 * takes minutes — without this the Output tab sat on "No output yet" the whole
 * time. Its own component so the once-a-second tick re-renders this line, not
 * a log that can reach megabytes.
 */
function CapacityCheckProgress() {
  const status = useCapacityStore((s) => s.status)
  const phase = useCapacityStore((s) => s.checkPhase)
  const startedAt = useCapacityStore((s) => s.checkStartedAt)
  const selectedFqbn = useUploadStore((s) => s.selectedFqbn)
  const running = status === 'checking'
  const elapsed = useElapsedSeconds(startedAt, running)
  if (!running) return null
  const board = boardByFqbn(selectedFqbn)?.label ?? 'the selected board'
  return (
    <div className={styles.consoleProgress} role="status" aria-label={`Checking capacity, ${formatElapsed(elapsed)} elapsed`}>
      <div className={styles.consoleProgressHead}>
        <i className={styles.consoleSpinner} aria-hidden="true" />
        <strong>Checking capacity · {board}</strong>
        <span className={styles.consoleProgressTime}>{formatElapsed(elapsed)}</span>
      </div>
      <div>{CHECK_PHASE_TEXT[phase ?? 'compiling']}</div>
      <div className={styles.consoleProgressNote}>
        Nothing is flashed. A board&apos;s first build can take a few minutes; later checks reuse the build cache.
      </div>
    </div>
  )
}

// Streams the detailed compile/upload output. In the Upload workbench it is a
// permanent right-hand surface; the standalone presentation remains available
// to callers that still need it outside that workbench.
export default function OutputConsole({ embedded = false }: { embedded?: boolean } = {}) {
  const {
    log, status, busy, selectedPort, ports, portsScanned, helper, serialLog, serialConnected, serialError, serialBaud,
    verboseOutput, setVerboseOutput,
    closeConsole, clearLog, clearSerialLog, startSerial, stopSerial, setSerialBaud,
  } = useUploadStore()
  const port = describePort({ helper, selectedPort, ports, portsScanned })
  const bodyRef = useRef<HTMLPreElement>(null)
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [tab, setTab] = useState<'output' | 'serial'>('output')
  const capacityReport = useCapacityReport()
  const capacityChecking = useCapacityStore((s) => s.status === 'checking')
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
    <div className={`${styles.consolePanel} ${embedded ? styles.consoleEmbedded : ''}`} role="log" aria-label="Upload and serial output">
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
        {!embedded && <button className={styles.consoleBtn} onClick={closeConsole} title="Hide">×</button>}
      </div>
      {tab === 'serial' && (
        <div className={styles.serialToolbar}>
          <span className={styles.serialPort} title={port.detail}>{port.text}</span>
          <select className={styles.serialBaud} value={serialBaud} onChange={(e) => setSerialBaud(Number(e.target.value))} disabled={serialConnected} aria-label="Baud rate">
            {[9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600].map((baud) => <option key={baud} value={baud}>{baud} baud</option>)}
          </select>
          <button className={styles.consoleBtn} onClick={serialConnected ? stopSerial : startSerial} disabled={!selectedPort || busy}>
            {serialConnected ? 'Disconnect' : 'Connect'}
          </button>
          <span className={serialError ? styles.stError : serialConnected ? styles.stDone : styles.serialIdle}>
            {/* The monitor's own state, named as such: beside "COM6 · connected"
                a bare "Disconnected" read as the board being unplugged. */}
            {serialError ? 'Error' : serialConnected ? 'Monitoring' : 'Monitor off'}
          </span>
        </div>
      )}
      {tab === 'output' && <CapacityCheckProgress />}
      <pre ref={bodyRef} className={styles.consoleBody}>{visibleLog || (tab === 'serial'
        ? 'Connect to view serial output from the selected board.'
        : capacityChecking ? '' : 'No output yet. Upload, install or check capacity to see logs here.')}</pre>
    </div>
  )
}
