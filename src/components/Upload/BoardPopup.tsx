import { useMemo, useState } from 'react'
import { useGraphStore } from '../../state/graphStore'
import { allBoards, boardByFqbn, engineReady, useUploadStore } from '../../state/uploadStore'
import { estimateFirmwareRam } from '../../utils/validateGraph'
import styles from './Upload.module.css'

const EMPTY_CUSTOM_BOARD = { label: '', fqbn: '', core: '', boardUrl: '' }

// Popup launched from the MatrixOutput "Board" button. Top: a board manager to
// toggle which boards appear in the dropdown (plus, on the arduino-cli
// fallback engine, install their cores, add a custom board by URL, and check
// for core updates). Then a board dropdown, a port dropdown, and the resolved
// "<board> · <port>" label.
export default function BoardPopup() {
  const {
    helper, ports, installedCores, myBoards, selectedFqbn, selectedPort, busy,
    checkingUpdates, availableUpdates, updatesPopupOpen,
    toggleBoard, setSelectedFqbn, setSelectedPort, refreshPorts, setEngine,
    installCore, closeBoardPopup, openCliPopup,
    addCustomBoard, removeCustomBoard, checkForUpdates, closeUpdatesPopup, upgradeCores,
  } = useUploadStore()
  const { nodes, edges, updateNodeProperty } = useGraphStore()
  const [newBoard, setNewBoard] = useState(EMPTY_CUSTOM_BOARD)
  const [addError, setAddError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)

  const usingFbuild = helper?.engine === 'fbuild'
  const ready = engineReady(helper)
  const boards = allBoards()
  const selectable = boards.filter((b) => myBoards.includes(b.fqbn))
  const board = boardByFqbn(selectedFqbn)
  const portLabel = ports.find((p) => p.address === selectedPort)?.label ?? selectedPort
  const target = `${board?.label ?? 'No board'} · ${portLabel || 'no port'}`
  const outputNode = nodes.find((n) => n.data.nodeType === 'MatrixOutput')
  const ownProps = (outputNode?.data.properties ?? {}) as Record<string, unknown>
  const psramOptions = board?.psram
  const usePsram = !!psramOptions && ownProps.usePsram === true
  const psramChoice = psramOptions?.find((option) => option.id === ownProps.psramMode) ?? psramOptions?.[0]
  const ram = useMemo(() => estimateFirmwareRam(nodes, edges), [nodes, edges])

  const handleAddBoard = () => {
    const result = addCustomBoard(newBoard)
    if (result.ok) {
      setNewBoard(EMPTY_CUSTOM_BOARD)
      setAddError(null)
      setShowAddForm(false)
    } else {
      setAddError(result.error ?? 'Could not add board.')
    }
  }

  // "Update available" result popup, shown in place of the normal board
  // manager after a "Check for updates" run.
  if (updatesPopupOpen) {
    return (
      <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) closeBoardPopup() }}>
        <div className={styles.popup} role="dialog" aria-label="Board updates">
          <div className={styles.popupHeader}>
            <span>Board Updates</span>
            <button className={styles.closeBtn} onClick={closeBoardPopup} title="Close">×</button>
          </div>
          {availableUpdates.length === 0 ? (
            <div className={styles.note}>All your installed boards are up to date.</div>
          ) : (
            <div className={styles.boardList}>
              {availableUpdates.map((u) => {
                const label = boards.find((b) => b.core === u.core)?.label ?? u.core
                return (
                  <div key={u.core} className={styles.note}>
                    Update available for the {label} board. ({u.installed} → {u.latest})
                  </div>
                )
              })}
            </div>
          )}
          <div className={styles.wizardFooter}>
            <button className={styles.wizardButtonBase} onClick={closeUpdatesPopup}>Cancel</button>
            {availableUpdates.length > 0 && (
              <button
                className={`${styles.wizardButtonBase} ${styles.uploadOpenBtn}`}
                disabled={busy}
                onClick={() => upgradeCores()}
              >
                {availableUpdates.length > 1 ? 'Update all' : 'Update'}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) closeBoardPopup() }}>
      <div className={styles.popup} role="dialog" aria-label="Board settings">
        <div className={styles.popupHeader}>
          <span>Board &amp; Port</span>
          <button className={styles.closeBtn} onClick={closeBoardPopup} title="Close">×</button>
        </div>

        {/* Build engine switcher — fbuild manages its own per-board toolchains
            automatically; arduino-cli additionally supports custom boards by
            URL and core update checks. Persisted by the helper. */}
        {helper && (
          <>
            <div className={styles.sectionTitle}>Build engine</div>
            <div className={styles.consoleTabs}>
              <button
                className={usingFbuild ? styles.consoleTabActive : styles.consoleTab}
                disabled={busy || !helper.fbuild}
                onClick={() => setEngine('fbuild')}
                title={helper.fbuild ? 'fbuild — manages its own per-board toolchains automatically' : 'fbuild not found on this machine'}
              >
                fbuild
              </button>
              <button
                className={!usingFbuild ? styles.consoleTabActive : styles.consoleTab}
                disabled={busy || !helper.arduinoCli}
                onClick={() => setEngine('arduino-cli')}
                title={helper.arduinoCli ? 'arduino-cli — supports custom boards by URL and core update checks' : 'arduino-cli not found — see "Fix…" below'}
              >
                arduino-cli
              </button>
            </div>
          </>
        )}

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
          {boards.map((b) => {
            const on = myBoards.includes(b.fqbn)
            const coreReady = installedCores.includes(b.core)
            return (
              <div key={b.fqbn} className={styles.boardRow}>
                <label className={styles.boardCheck}>
                  <input type="checkbox" checked={on} onChange={() => toggleBoard(b.fqbn)} />
                  <span>{b.label}</span>
                </label>
                <div className={styles.targetRow}>
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
                  {b.boardUrl && (
                    <button
                      className={styles.coreBtn}
                      onClick={() => removeCustomBoard(b.fqbn)}
                      title="Remove this custom board"
                    >
                      remove
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className={styles.sectionTitle}>Custom boards &amp; updates</div>
        {usingFbuild ? (
          <div className={styles.note}>
            Adding a custom board and checking for core updates need the arduino-cli engine — fbuild manages its own
            per-board toolchains from a fixed list and can't build for an ad-hoc board yet.
          </div>
        ) : (
          <>
            {showAddForm ? (
              <div className={styles.wizardChecklist}>
                <div className={styles.fieldBlock}>
                  <span className={styles.fieldLabel}>Board label</span>
                  <input
                    className={styles.textInput}
                    placeholder="e.g. ESP8266"
                    value={newBoard.label}
                    onChange={(e) => setNewBoard({ ...newBoard, label: e.target.value })}
                  />
                </div>
                <div className={styles.fieldBlock}>
                  <span className={styles.fieldLabel}>FQBN</span>
                  <input
                    className={styles.textInput}
                    placeholder="e.g. esp8266:esp8266:nodemcuv2"
                    value={newBoard.fqbn}
                    onChange={(e) => setNewBoard({ ...newBoard, fqbn: e.target.value })}
                  />
                </div>
                <div className={styles.fieldBlock}>
                  <span className={styles.fieldLabel}>Core</span>
                  <input
                    className={styles.textInput}
                    placeholder="e.g. esp8266:esp8266"
                    value={newBoard.core}
                    onChange={(e) => setNewBoard({ ...newBoard, core: e.target.value })}
                  />
                </div>
                <div className={styles.fieldBlock}>
                  <span className={styles.fieldLabel}>Board manager URL</span>
                  <input
                    className={styles.textInput}
                    placeholder="e.g. http://arduino.esp8266.com/stable/package_esp8266com_index.json"
                    value={newBoard.boardUrl}
                    onChange={(e) => setNewBoard({ ...newBoard, boardUrl: e.target.value })}
                  />
                </div>
                {addError && <div className={`${styles.note} ${styles.noteWarn}`}>{addError}</div>}
                <div className={styles.wizardFooter}>
                  <button
                    className={styles.wizardButtonBase}
                    onClick={() => { setShowAddForm(false); setNewBoard(EMPTY_CUSTOM_BOARD); setAddError(null) }}
                  >
                    Cancel
                  </button>
                  <button className={`${styles.wizardButtonBase} ${styles.uploadOpenBtn}`} onClick={handleAddBoard}>
                    Add board
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.linkRow}>
                <button className={styles.linkBtn} onClick={() => setShowAddForm(true)}>+ Add board by URL…</button>
                <button className={styles.linkBtn} disabled={checkingUpdates || !ready} onClick={checkForUpdates}>
                  {checkingUpdates ? 'Checking…' : 'Check for updates'}
                </button>
              </div>
            )}
          </>
        )}

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
