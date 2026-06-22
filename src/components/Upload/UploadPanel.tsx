import { useMemo, useState, useRef, useEffect } from 'react'
import { useGraphStore } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'
import { generateCpp } from '../../codegen/cppGenerator'
import type { StudioNode, StudioEdge } from '../../state/graphStore'
import styles from './UploadPanel.module.css'

// ── Graph validation ──────────────────────────────────────────────────────────

interface ValidationResult {
  errors:   string[]
  warnings: string[]
}

function validateGraph(nodes: StudioNode[], edges: StudioEdge[]): ValidationResult {
  const errors: string[] = [], warnings: string[] = []
  if (nodes.length === 0) { errors.push('No nodes in graph'); return { errors, warnings } }

  const hasOutput = nodes.some(n => n.data.nodeType === 'MatrixOutput')
  if (!hasOutput) errors.push('Missing MatrixOutput node')

  const incoming = new Set(edges.filter(e => e.target && e.targetHandle).map(e => `${e.target}:${e.targetHandle}`))
  if (hasOutput) {
    const out = nodes.find(n => n.data.nodeType === 'MatrixOutput')!
    if (!incoming.has(`${out.id}:frame`)) errors.push('MatrixOutput has no Frame input connected')
  }

  const master = nodes.find(n => n.data.nodeType === 'PatternMaster')
  if (master) {
    const hasPat = ['p0','p1','p2','p3'].some(p => incoming.has(`${master.id}:${p}`))
    if (!hasPat) warnings.push('Pattern Master has no pattern inputs wired')
  }

  const isolated = nodes.filter(n =>
    n.data.nodeType !== 'MatrixOutput' &&
    !edges.some(e => e.source === n.id || e.target === n.id)
  )
  if (isolated.length > 0)
    warnings.push(`${isolated.length} node${isolated.length > 1 ? 's' : ''} not connected to anything`)

  return { errors, warnings }
}

// ── Component ─────────────────────────────────────────────────────────────────

const BOARDS = [
  'ESP32-S3 (FastLED)',
  'ESP32 (FastLED)',
  'Arduino Uno',
  'Arduino Nano',
  'Teensy 4.1',
  'RP2040 (Raspberry Pi Pico)',
]

const hasSerial = typeof navigator !== 'undefined' && 'serial' in navigator

export default function UploadPanel() {
  const { nodes, edges } = useGraphStore()
  const { setShowUploadPanel, setStatus } = useUiStore()

  const code = useMemo(() => generateCpp(nodes, edges), [nodes, edges])
  const validation = useMemo(() => validateGraph(nodes, edges), [nodes, edges])

  const [board, setBoard]       = useState(BOARDS[0])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [port, setPort]         = useState<any | null>(null)
  const [connecting, setConn]   = useState(false)
  const [log, setLog]           = useState<string[]>([])
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log])

  function appendLog(msg: string) {
    setLog(prev => [...prev.slice(-200), msg])
  }

  async function handleConnect() {
    setConn(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = await (navigator as any).serial.requestPort()
      await p.open({ baudRate: 115200 })
      setPort(p)
      appendLog('✓ Connected — 115200 baud')
    } catch (e: unknown) {
      appendLog(`✗ ${e instanceof Error ? e.message : String(e)}`)
    }
    setConn(false)
  }

  async function handleDisconnect() {
    if (!port) return
    try { await port.close() } catch { /* ignore */ }
    setPort(null)
    appendLog('Disconnected')
  }

  function handleDownload() {
    const blob = new Blob([code], { type: 'text/plain' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `fastled_pattern_${Date.now()}.ino`
    a.click()
    URL.revokeObjectURL(url)
    appendLog('Downloaded .ino — open in Arduino IDE or PlatformIO to flash')
    setStatus('Firmware downloaded', 'success')
  }

  function handleCopy() {
    navigator.clipboard.writeText(code).then(
      () => { appendLog('Code copied to clipboard'); setStatus('Code copied', 'success') },
      () => appendLog('Clipboard write failed')
    )
  }

  function handleClose() { setShowUploadPanel(false) }

  const canFlash = hasSerial && port !== null && validation.errors.length === 0

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose() }}>
      <div className={styles.panel}>
        {/* Header */}
        <div className={styles.header}>
          <span className={styles.title}>Upload to Board</span>
          <button className={styles.closeBtn} onClick={handleClose} title="Close">×</button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {/* Code pane */}
          <div className={styles.codePane}>
            <div className={styles.codePaneHeader}>
              <span>fastled_pattern.ino — {code.split('\n').length} lines</span>
              <button className={styles.btn} style={{ width: 'auto', padding: '0 10px' }} onClick={handleCopy}>
                Copy
              </button>
            </div>
            <textarea className={styles.codeArea} readOnly value={code} />
          </div>

          {/* Controls */}
          <div className={styles.controls}>
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Board</div>
              <select
                className={styles.select}
                value={board}
                onChange={(e) => setBoard(e.target.value)}
              >
                {BOARDS.map(b => <option key={b}>{b}</option>)}
              </select>
            </div>

            <div className={styles.divider} />

            {hasSerial ? (
              <div className={styles.section}>
                <div className={styles.sectionTitle}>WebSerial</div>
                <span className={`${styles.serialStatus} ${port ? styles.connected : ''}`}>
                  {port ? '● Connected' : '○ Not connected'}
                </span>
                {!port ? (
                  <button
                    className={styles.btnPrimary}
                    onClick={handleConnect}
                    disabled={connecting}
                  >
                    {connecting ? 'Connecting…' : 'Connect Board'}
                  </button>
                ) : (
                  <button className={styles.btnDanger} onClick={handleDisconnect}>
                    Disconnect
                  </button>
                )}
              </div>
            ) : (
              <div className={styles.section}>
                <div className={styles.sectionTitle}>WebSerial</div>
                <p className={styles.noSerial}>
                  WebSerial not available.<br />
                  Use Chrome/Edge 89+ and enable it in Flags, or download the .ino and flash with Arduino IDE.
                </p>
              </div>
            )}

            <div className={styles.divider} />

            <div className={styles.section}>
              <button
                className={styles.btnPrimary}
                onClick={handleDownload}
                disabled={validation.errors.length > 0}
                title={validation.errors.length > 0 ? validation.errors[0] : 'Download .ino file'}
              >
                ↓ Download .ino
              </button>
              <button
                className={styles.btnPrimary}
                disabled={!canFlash}
                title={canFlash ? 'Flash via WebSerial' : 'Connect a board first, then flash'}
                onClick={() => appendLog('Flash via WebSerial: connect to a board running the Arduino bootloader.')}
              >
                ⚡ Flash Board
              </button>
            </div>

            {log.length > 0 && (
              <>
                <div className={styles.divider} />
                <div className={styles.section}>
                  <div className={styles.sectionTitle}>Log</div>
                  <div ref={logRef} className={styles.log}>{log.join('\n')}</div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Validation footer */}
        <div className={styles.validation}>
          {validation.errors.length === 0 && validation.warnings.length === 0 ? (
            <span className={`${styles.chip} ${styles.chipOk}`}>✓ Graph valid</span>
          ) : null}
          {validation.errors.map((e, i) => (
            <span key={i} className={`${styles.chip} ${styles.chipError}`}>✗ {e}</span>
          ))}
          {validation.warnings.map((w, i) => (
            <span key={i} className={`${styles.chip} ${styles.chipWarning}`}>⚠ {w}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
