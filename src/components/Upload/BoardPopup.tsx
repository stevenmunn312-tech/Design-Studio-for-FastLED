import { useMemo } from 'react'
import { useGraphStore } from '../../state/graphStore'
import { BOARDS, boardByFqbn, engineReady, useUploadStore } from '../../state/uploadStore'
import { estimateFirmwareRam } from '../../utils/validateGraph'
import styles from './Upload.module.css'

// Popup launched from the MatrixOutput "Board" button. Top: a board manager to
// toggle which boards appear in the dropdown (plus, on the arduino-cli
// fallback engine, install their cores). Then a board dropdown, a port
// dropdown, and the resolved "<board> · <port>" label.
export default function BoardPopup() {
  const {
    helper, ports, installedCores, myBoards, selectedFqbn, selectedPort, busy,
    toggleBoard, setSelectedFqbn, setSelectedPort, refreshPorts,
    installCore, closeBoardPopup, openCliPopup,
  } = useUploadStore()
  const { nodes, edges, updateNodeProperty } = useGraphStore()

  const usingFbuild = helper?.engine === 'fbuild'
  const ready = engineReady(helper)
  const selectable = BOARDS.filter((b) => myBoards.includes(b.fqbn))
  const board = boardByFqbn(selectedFqbn)
  const portLabel = ports.find((p) => p.address === selectedPort)?.label ?? selectedPort
  const target = `${board?.label ?? 'No board'} · ${portLabel || 'no port'}`
  const outputNode = nodes.find((n) => n.data.nodeType === 'MatrixOutput')
  const ownProps = (outputNode?.data.properties ?? {}) as Record<string, unknown>
  const psramOptions = board?.psram
  const usePsram = !!psramOptions && ownProps.usePsram === true
  const psramChoice = psramOptions?.find((option) => option.id === ownProps.psramMode) ?? psramOptions?.[0]
  const ram = useMemo(() => estimateFirmwareRam(nodes, edges), [nodes, edges])

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) closeBoardPopup() }}>
      <div className={styles.popup} role="dialog" aria-label="Board settings">
        <div className={styles.popupHeader}>
          <span>Board &amp; Port</span>
          <button className={styles.closeBtn} onClick={closeBoardPopup} title="Close">×</button>
        </div>

        {/* Engine status / not-found bridge (arduino-cli fallback only — fbuild
            manages its own toolchains, so there's nothing to "fix" here). */}
        {helper === undefined ? (
          <div className={styles.note}>Checking for the upload helper…</div>
        ) : !helper ? (
          <div className={styles.note}>Upload helper not running — start the dev server, or run <code>npm run helper</code>.</div>
        ) : !ready && !usingFbuild ? (
          <div className={`${styles.note} ${styles.noteWarn}`}>
            arduino-cli not found. <button className={styles.linkBtn} onClick={openCliPopup}>Fix…</button>
          </div>
        ) : usingFbuild ? (
          <div className={styles.note}>
            Using fbuild — the first build for a new board downloads its toolchain (a few minutes); after that, builds are fast.
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
                {!usingFbuild && ready && (
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
            disabled={!ready}
          >
            {ports.length === 0 && <option value="">No boards detected</option>}
            {ports.map((p) => (
              <option key={p.address} value={p.address}>
                {p.label}{p.boards[0]?.name ? ` · ${p.boards[0].name}` : ''}
              </option>
            ))}
          </select>
          <button className={styles.refreshBtn} onClick={refreshPorts} disabled={!ready} title="Refresh ports">↻</button>
        </div>

        <div className={styles.targetBig}>{target}</div>

        {ram && ram.ledCount > 0 && (
          <>
            <div className={styles.sectionTitle}>Memory</div>
            <div
              className={styles.note}
              title="Internal RAM = the physical LED array plus any render buffers not offloaded to PSRAM, plus fixed simulation-node state (heat maps, particle pools, etc.) which always stays internal. Rough estimate — actual usage also depends on the rest of the sketch."
            >
              ~{(ram.internalBytes / 1024).toFixed(1)} KB internal
              {ram.psramBytes > 0 ? ` · ~${(ram.psramBytes / 1024).toFixed(1)} KB PSRAM` : ''}
            </div>
          </>
        )}

        {psramOptions && outputNode && (
          <>
            <div className={styles.sectionTitle}>PSRAM</div>
            <div className={styles.psramRow}>
              <label className={styles.psramCheck} title="Put the render buffers in external PSRAM — frees internal RAM for designs too big to link. Needs a module with PSRAM (falls back to internal heap without one).">
                <input
                  type="checkbox"
                  checked={usePsram}
                  onChange={(e) => updateNodeProperty(outputNode.id, 'usePsram', e.target.checked)}
                />
                Use PSRAM
              </label>
              {usePsram && psramOptions.length > 1 && (
                <select
                  className={`nodrag ${styles.psramSelect}`}
                  value={psramChoice?.id}
                  onChange={(e) => updateNodeProperty(outputNode.id, 'psramMode', e.target.value)}
                  title="PSRAM interface — set by the module package (picking the wrong one makes the board boot-loop)"
                >
                  {psramOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
