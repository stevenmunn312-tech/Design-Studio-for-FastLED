import { useMemo, useState, useRef, useEffect } from 'react'
import { useGraphStore, getGroupRegistry } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'
import { generateCpp } from '../../codegen/cppGenerator'
import { validateGraph } from '../../utils/validateGraph'
import styles from './UploadPanel.module.css'

// ── Boards ──────────────────────────────────────────────────────────────────
// Each board maps to an arduino-cli FQBN and the core that provides it. ESP32
// and RP2040 are third-party cores (need their board-manager URL configured).
interface Board { label: string; fqbn: string; core: string; thirdParty?: boolean }
const BOARDS: Board[] = [
  { label: 'ESP32-S3',              fqbn: 'esp32:esp32:esp32s3', core: 'esp32:esp32',   thirdParty: true },
  { label: 'ESP32',                 fqbn: 'esp32:esp32:esp32',   core: 'esp32:esp32',   thirdParty: true },
  { label: 'Arduino Uno',           fqbn: 'arduino:avr:uno',     core: 'arduino:avr' },
  { label: 'Arduino Nano',          fqbn: 'arduino:avr:nano',    core: 'arduino:avr' },
  { label: 'Teensy 4.1',            fqbn: 'teensy:avr:teensy41', core: 'teensy:avr',    thirdParty: true },
  { label: 'RP2040 (Pico)',         fqbn: 'rp2040:rp2040:rpipico', core: 'rp2040:rp2040', thirdParty: true },
]

const SKETCH = 'fastled_pattern'

function cliCommands(b: Board): string {
  return [
    '# 1. One-time setup — install the board core and FastLED',
    ...(b.thirdParty ? [`#    (${b.core} is a third-party core: add its URL via "arduino-cli config")`] : []),
    `arduino-cli core install ${b.core}`,
    'arduino-cli lib install FastLED',
    '',
    `# 2. Save the downloaded sketch as ${SKETCH}/${SKETCH}.ino`,
    '#    (Arduino requires the folder name to match the .ino name)',
    '',
    '# 3. Compile',
    `arduino-cli compile --fqbn ${b.fqbn} ${SKETCH}`,
    '',
    '# 4. Find your board, then upload (replace PORT, e.g. COM5 or /dev/ttyUSB0)',
    'arduino-cli board list',
    `arduino-cli upload -p PORT --fqbn ${b.fqbn} ${SKETCH}`,
  ].join('\n')
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function UploadPanel() {
  const { nodes, edges } = useGraphStore()
  const { setShowUploadPanel, setStatus } = useUiStore()

  const code = useMemo(() => generateCpp(nodes, edges, getGroupRegistry()), [nodes, edges])
  const validation = useMemo(() => validateGraph(nodes, edges), [nodes, edges])

  const [board, setBoard] = useState<Board>(BOARDS[0])
  const commands = useMemo(() => cliCommands(board), [board])
  const [log, setLog] = useState<string[]>([])
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log])

  function appendLog(msg: string) {
    setLog((prev) => [...prev.slice(-200), msg])
  }

  function handleDownload() {
    const blob = new Blob([code], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${SKETCH}.ino`
    a.click()
    URL.revokeObjectURL(url)
    appendLog(`Downloaded ${SKETCH}.ino — build it with the arduino-cli commands`)
    setStatus('Firmware downloaded', 'success')
  }

  function handleCopy() {
    navigator.clipboard.writeText(code).then(
      () => { appendLog('Sketch copied to clipboard'); setStatus('Code copied', 'success') },
      () => appendLog('Clipboard write failed'),
    )
  }

  function handleCopyCommands() {
    navigator.clipboard.writeText(commands).then(
      () => { appendLog('arduino-cli commands copied'); setStatus('Commands copied', 'success') },
      () => appendLog('Clipboard write failed'),
    )
  }

  function handleClose() { setShowUploadPanel(false) }

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose() }}>
      <div className={styles.panel}>
        {/* Header */}
        <div className={styles.header}>
          <span className={styles.title}>Build &amp; Upload</span>
          <button className={styles.closeBtn} onClick={handleClose} title="Close">×</button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {/* Code pane */}
          <div className={styles.codePane}>
            <div className={styles.codePaneHeader}>
              <span>{SKETCH}.ino — {code.split('\n').length} lines</span>
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
                value={board.label}
                onChange={(e) => setBoard(BOARDS.find((b) => b.label === e.target.value) ?? BOARDS[0])}
              >
                {BOARDS.map((b) => <option key={b.label}>{b.label}</option>)}
              </select>
            </div>

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
            </div>

            <div className={styles.divider} />

            <div className={styles.section}>
              <div className={styles.sectionTitle}>
                Build &amp; flash with <code>arduino-cli</code>
                <button className={styles.btn} style={{ width: 'auto', padding: '0 10px', marginLeft: 8 }} onClick={handleCopyCommands}>
                  Copy
                </button>
              </div>
              <pre className={styles.commands}>{commands}</pre>
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
