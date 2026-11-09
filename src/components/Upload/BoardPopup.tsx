import { useMemo, useState } from 'react'
import { useGroupRegistry } from '../../hooks/useGroupRegistry'
import { useBoardPartition, useGraphStore } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'
import { allBoards, boardByFqbn, engineReady, useUploadStore } from '../../state/upload/uploadStore'
import { estimateFirmwareRam } from '../../utils/validateGraph'
import { describePort } from '../../utils/portStatus'
import { buildToolsOfflineHint } from '../../utils/buildTools'
import styles from './Upload.module.css'
import { Icon } from '../icons/Icon'
import { controllerSettings } from '../../build/controllerSettings'
import { selectedPhysicalBoardProfile } from '../../build/boards/boardProfiles'

const EMPTY_CUSTOM_BOARD = { label: '', fqbn: '', core: '', boardUrl: '' }

// The Upload tab's "Board & Port" popup. Top: the build engine and custom
// boards (add by URL, remove, check for core updates). Then the board, read
// from the Board node — the one place a board is chosen, since `App.tsx`
// mirrors that node's profile into `selectedFqbn` and would snap any choice
// made here straight back — a Port dropdown, and the resolved
// "<board> · <port>" label.
export default function BoardPopup() {
  const {
    helper, ports, portsScanned, customBoards, selectedFqbn, selectedPort, busy,
    checkingUpdates, availableUpdates, updatesPopupOpen,
    setSelectedPort, refreshPorts, setEngine,
    closeBoardPopup, openCliPopup,
    addCustomBoard, removeCustomBoard, checkForUpdates, closeUpdatesPopup, upgradeCores,
  } = useUploadStore()
  // The controller settings, PSRAM and RAM are facts about one firmware
  // image: the active board's partition, whose one Board is the board this
  // popup is choosing for (with one board, the whole root graph).
  const activeBoardId = useUiStore((s) => s.activeBoardId)
  const { nodes, edges } = useBoardPartition(activeBoardId)
  const displayDocuments = useGraphStore((state) => state.displayDocuments)
  const [newBoard, setNewBoard] = useState(EMPTY_CUSTOM_BOARD)
  const [addError, setAddError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)

  const usingFbuild = helper?.engine === 'fbuild'
  const ready = engineReady(helper)
  const boards = allBoards()
  const board = boardByFqbn(selectedFqbn)
  const boardProfile = selectedPhysicalBoardProfile(nodes)
  const boardLabel = boardProfile?.label ?? board?.label ?? 'No board chosen'
  const changeBoard = () => {
    closeBoardPopup()
    useUiStore.getState().openHardwareBoardMenu()
  }
  const port = describePort({ helper, selectedPort, ports, portsScanned })
  const target = `${board?.label ?? 'No board'} · ${port.text}`
  const controller = controllerSettings(nodes)
  const psramOptions = board?.psram
  const psramSupported = !!psramOptions || !!selectedPhysicalBoardProfile(nodes)?.psramMode
  const usePsram = psramSupported && controller.usePsram
  const psramChoice = psramOptions?.find((option) => option.id === controller.psramMode) ?? psramOptions?.[0]
  const groups = useGroupRegistry()
  const ram = useMemo(() => estimateFirmwareRam(nodes, edges, displayDocuments, groups), [nodes, edges, displayDocuments, groups])

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

        {/* Compiler switcher. fbuild is the default whenever it is
            installed; arduino-cli stays available as a persisted, explicit
            choice. */}
        {helper && (
          <>
            <div className={styles.sectionTitle}>Compiler (advanced)</div>
            <div className={styles.consoleTabs}>
              <button
                className={usingFbuild ? styles.consoleTabActive : styles.consoleTab}
                disabled={busy || !helper.fbuild}
                onClick={() => setEngine('fbuild')}
                title={helper.fbuild
                  ? 'fbuild — manages its own per-board toolchains automatically'
                  : 'fbuild is not installed on this machine'}
              >
                fbuild
              </button>
              <button
                className={!usingFbuild ? styles.consoleTabActive : styles.consoleTab}
                disabled={busy || !helper.arduinoCli}
                onClick={() => setEngine('arduino-cli')}
                title={helper.arduinoCli
                  ? 'arduino-cli — supports custom boards by URL and core update checks'
                  : 'arduino-cli is not installed — see "Set it up…" below'}
              >
                arduino-cli
              </button>
            </div>
          </>
        )}

        {/* Engine status / not-found bridge. */}
        {helper === undefined ? (
          <div className={styles.note}>Checking for the build tools…</div>
        ) : !helper ? (
          <div className={styles.note}>{buildToolsOfflineHint()}</div>
        ) : !ready && !usingFbuild ? (
          <div className={`${styles.note} ${styles.noteWarn}`}>
            The arduino-cli compiler was not found. <button className={styles.linkBtn} onClick={openCliPopup}>Set it up…</button>
          </div>
        ) : usingFbuild ? (
          <div className={styles.note}>
            Using fbuild — the first build for a new board downloads its board support package (a few minutes); after that, builds are fast.
          </div>
        ) : null}

        {/* Custom boards & updates */}
        <div className={styles.sectionTitle}>Custom boards &amp; updates</div>
        {usingFbuild ? (
          <div className={styles.note}>
            Adding a custom board and checking for board support updates need the arduino-cli compiler — fbuild manages its own
            board support packages from a fixed list and can't build for an ad-hoc board yet.
          </div>
        ) : (
          <>
            {customBoards.length > 0 && (
              <div className={styles.boardList}>
                {customBoards.map((b) => (
                  <div key={b.fqbn} className={styles.boardRow}>
                    <span>{b.label}</span>
                    <button
                      className={styles.coreBtn}
                      onClick={() => removeCustomBoard(b.fqbn)}
                      title="Remove this custom board"
                    >
                      remove
                    </button>
                  </div>
                ))}
              </div>
            )}
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

        {/* The board is the Board node's choice; this popup only reports it. */}
        <div className={styles.sectionTitle}>Board</div>
        <div className={styles.wizardChecklistRow}>
          <span>{boardLabel}</span>
          <button className={styles.linkBtn} onClick={changeBoard} title="Choose the board on the Hardware bench">
            Change board in Hardware
          </button>
        </div>

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
          <button className={styles.refreshBtn} onClick={refreshPorts} disabled={!ready} title="Refresh ports"><Icon name="refresh" /></button>
        </div>

        <div className={styles.targetBig} title={port.detail}>{target}</div>

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

        <div className={styles.sectionTitle}>Controller settings</div>
        <div className={styles.note}>
          Brightness {controller.brightness} · overclock {controller.overclock.toFixed(2)}× · power cap {controller.powerLimit ? `${controller.volts} V / ${controller.milliamps} mA` : 'off'}
          {psramSupported ? ` · PSRAM ${usePsram ? (psramChoice?.label ?? controller.psramMode) : 'off'} (${controller.psramPolicy})` : ' · PSRAM unavailable'}.
          Edit these on the Board in Hardware.
        </div>
      </div>
    </div>
  )
}
