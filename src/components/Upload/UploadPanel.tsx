import { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import { useGraphStore, getGroupRegistry } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'
import { generateCpp } from '../../codegen/cppGenerator'
import { validateGraph } from '../../utils/validateGraph'
import { useMusicStore } from '../../state/musicStore'
import { checkBackend, listPorts, uploadSketch, uploadShow, type BackendHealth, type SerialPort } from '../../utils/backendClient'
import { sdCardConnected, readySongCount, buildShowPayload } from '../../utils/showUpload'
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
  const entries = useMusicStore((s) => s.entries)
  const sdConnected = useMemo(() => sdCardConnected(nodes, edges), [nodes, edges])
  const readySongs = readySongCount(entries)

  const code = useMemo(() => generateCpp(nodes, edges, getGroupRegistry()), [nodes, edges])
  const validation = useMemo(() => validateGraph(nodes, edges), [nodes, edges])

  const [board, setBoard] = useState<Board>(BOARDS[0])
  const commands = useMemo(() => cliCommands(board), [board])
  // Single growing string so streamed compile/upload output (which arrives in
  // arbitrary, not line-aligned chunks) renders correctly; capped to stay light.
  const [log, setLog] = useState('')
  const logRef = useRef<HTMLDivElement>(null)

  // Probe the optional local upload helper so we can show its status and, when
  // present, drive one-click compile+upload. `undefined` = still checking.
  const [helper, setHelper] = useState<BackendHealth | null | undefined>(undefined)
  const [ports, setPorts] = useState<SerialPort[]>([])
  const [selectedPort, setSelectedPort] = useState('')
  const [uploading, setUploading] = useState(false)
  const helperReady = !!helper?.arduinoCli

  useEffect(() => {
    const ctrl = new AbortController()
    checkBackend(ctrl.signal).then(setHelper).catch(() => setHelper(null))
    return () => ctrl.abort()
  }, [])

  const refreshPorts = useCallback(async () => {
    const p = await listPorts()
    setPorts(p)
    setSelectedPort((prev) => prev || p[0]?.address || '')
  }, [])

  // Once the helper reports arduino-cli, list the connected boards.
  useEffect(() => { if (helperReady) refreshPorts() }, [helperReady, refreshPorts])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log])

  const appendLog = useCallback((msg: string) => {
    setLog((prev) => (prev + msg + '\n').slice(-40000))
  }, [])

  async function handleUpload() {
    if (!selectedPort || uploading) return
    setUploading(true)
    setLog(`Uploading to ${selectedPort} (${board.fqbn})…\n`)
    try {
      await uploadSketch(code, board.fqbn, selectedPort, (chunk) =>
        setLog((prev) => (prev + chunk).slice(-40000)),
      )
      setStatus('Upload finished — see the log', 'success')
    } catch (err) {
      appendLog(`\n[error] ${err}`)
      setStatus('Upload failed — is the helper running?', 'error')
    } finally {
      setUploading(false)
    }
  }

  async function handleUploadShow() {
    if (!selectedPort || uploading) return
    const payload = buildShowPayload(nodes, entries)
    if (!payload) { setStatus('Analyse some songs in the Music Library first', 'error'); return }
    setUploading(true)
    setLog(`Provisioning ${readySongs} song(s) to ${selectedPort} (${board.fqbn})…\n`)
    try {
      await uploadShow(
        { fqbn: board.fqbn, port: selectedPort, ...payload },
        (chunk) => setLog((prev) => (prev + chunk).slice(-40000)),
      )
      setStatus('Show upload finished — see the log', 'success')
    } catch (err) {
      appendLog(`\n[error] ${err}`)
      setStatus('Show upload failed — is the helper running?', 'error')
    } finally {
      setUploading(false)
    }
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
              <div className={styles.sectionTitle}>Upload helper</div>
              <div className={styles.helperStatus}>
                {helper === undefined ? (
                  <span className={styles.chip}>Checking…</span>
                ) : helper && helper.arduinoCli ? (
                  <span className={`${styles.chip} ${styles.chipOk}`}>
                    ✓ Connected{helper.version ? ` · ${helper.version}` : ''}
                  </span>
                ) : helper ? (
                  <span className={`${styles.chip} ${styles.chipWarning}`}>
                    ⚠ Running, but arduino-cli not found — see backend/README.md
                  </span>
                ) : (
                  <span className={styles.chip}>
                    Not running — start it with <code>npm run helper</code> for one-click upload, or use the commands below
                  </span>
                )}
              </div>

              {helperReady && (
                <div className={styles.uploadRow}>
                  <select
                    className={styles.select}
                    value={selectedPort}
                    onChange={(e) => setSelectedPort(e.target.value)}
                    disabled={uploading}
                  >
                    {ports.length === 0 && <option value="">No boards detected</option>}
                    {ports.map((p) => (
                      <option key={p.address} value={p.address}>
                        {p.label}{p.boards[0]?.name ? ` · ${p.boards[0].name}` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    className={styles.btn}
                    style={{ width: 'auto', padding: '0 10px' }}
                    onClick={refreshPorts}
                    disabled={uploading}
                    title="Refresh the list of connected boards"
                  >
                    ↻
                  </button>
                  <button
                    className={styles.btnPrimary}
                    onClick={handleUpload}
                    disabled={uploading || !selectedPort || validation.errors.length > 0}
                    title={validation.errors.length > 0 ? validation.errors[0] : 'Compile & upload to the board'}
                  >
                    {uploading ? 'Uploading…' : '↑ Upload to board'}
                  </button>
                </div>
              )}

              {helperReady && sdConnected && (
                <div className={styles.uploadRow}>
                  <button
                    className={styles.btnPrimary}
                    onClick={handleUploadShow}
                    disabled={uploading || !selectedPort || readySongs === 0}
                    title={readySongs === 0
                      ? 'Analyse songs in the Music Library node first'
                      : 'Flash the provisioner, write songs/shows to the SD card, then flash the player'}
                  >
                    {uploading ? 'Working…' : `♪ Upload show to SD (${readySongs})`}
                  </button>
                </div>
              )}
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

            {log && (
              <>
                <div className={styles.divider} />
                <div className={styles.section}>
                  <div className={styles.sectionTitle}>Log</div>
                  <div ref={logRef} className={styles.log}>{log}</div>
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
