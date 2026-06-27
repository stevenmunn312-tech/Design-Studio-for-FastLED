import { BOARDS, boardByFqbn, useUploadStore } from '../../state/uploadStore'
import styles from './Upload.module.css'

// Popup launched from the MatrixOutput "Board" button. Top: a board manager to
// toggle which boards appear in the dropdown and install their cores. Then a
// board dropdown, a port dropdown, and the resolved "<board> · <port>" label.
export default function BoardPopup() {
  const {
    helper, ports, installedCores, myBoards, selectedFqbn, selectedPort, busy,
    toggleBoard, setSelectedFqbn, setSelectedPort, refreshPorts,
    installCore, closeBoardPopup, openCliPopup,
  } = useUploadStore()

  const cliReady = !!helper?.arduinoCli
  const selectable = BOARDS.filter((b) => myBoards.includes(b.fqbn))
  const board = boardByFqbn(selectedFqbn)
  const portLabel = ports.find((p) => p.address === selectedPort)?.label ?? selectedPort
  const target = `${board?.label ?? 'No board'} · ${portLabel || 'no port'}`

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) closeBoardPopup() }}>
      <div className={styles.popup} role="dialog" aria-label="Board settings">
        <div className={styles.popupHeader}>
          <span>Board &amp; Port</span>
          <button className={styles.closeBtn} onClick={closeBoardPopup} title="Close">×</button>
        </div>

        {/* CLI status / not-found bridge */}
        {helper === undefined ? (
          <div className={styles.note}>Checking for the upload helper…</div>
        ) : !helper ? (
          <div className={styles.note}>Upload helper not running — start the dev server, or run <code>npm run helper</code>.</div>
        ) : !cliReady ? (
          <div className={`${styles.note} ${styles.noteWarn}`}>
            arduino-cli not found. <button className={styles.linkBtn} onClick={openCliPopup}>Fix…</button>
          </div>
        ) : null}

        {/* Board manager */}
        <div className={styles.sectionTitle}>Boards manager</div>
        <div className={styles.boardList}>
          {BOARDS.map((b) => {
            const on = myBoards.includes(b.fqbn)
            const coreReady = installedCores.includes(b.core)
            return (
              <div key={b.fqbn} className={styles.boardRow}>
                <label className={styles.boardCheck}>
                  <input type="checkbox" checked={on} onChange={() => toggleBoard(b.fqbn)} />
                  <span>{b.label}</span>
                </label>
                {cliReady && (
                  coreReady ? (
                    <span className={styles.coreOk} title={`${b.core} installed`}>✓ core</span>
                  ) : (
                    <button
                      className={styles.coreBtn}
                      disabled={busy}
                      onClick={() => installCore(b.core)}
                      title={`Install ${b.core}${b.thirdParty ? ' (third-party core — downloads a few hundred MB)' : ''}`}
                    >
                      install core
                    </button>
                  )
                )}
              </div>
            )
          })}
        </div>

        {/* Board selection */}
        <div className={styles.sectionTitle}>Board</div>
        <select className={styles.select} value={selectedFqbn} onChange={(e) => setSelectedFqbn(e.target.value)}>
          {selectable.length === 0 && <option value="">No boards selected</option>}
          {selectable.map((b) => <option key={b.fqbn} value={b.fqbn}>{b.label}</option>)}
        </select>

        {/* Port selection */}
        <div className={styles.sectionTitle}>Port</div>
        <div className={styles.portRow}>
          <select
            className={styles.select}
            value={selectedPort}
            onChange={(e) => setSelectedPort(e.target.value)}
            disabled={!cliReady}
          >
            {ports.length === 0 && <option value="">No boards detected</option>}
            {ports.map((p) => (
              <option key={p.address} value={p.address}>
                {p.label}{p.boards[0]?.name ? ` · ${p.boards[0].name}` : ''}
              </option>
            ))}
          </select>
          <button className={styles.refreshBtn} onClick={refreshPorts} disabled={!cliReady} title="Refresh ports">↻</button>
        </div>

        <div className={styles.targetBig}>{target}</div>
      </div>
    </div>
  )
}
