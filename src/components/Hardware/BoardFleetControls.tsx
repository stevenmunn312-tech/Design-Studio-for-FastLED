import { boardPartitionOf, useGraphStore } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'
import { EMPTY_CREDENTIALS, useNetworkCredentialsStore } from '../../state/peripherals/networkCredentials'
import { wiredNetworkIn } from '../../state/peripherals/ethernetModule'
import WifiPasswordInput from '../Canvas/WifiPasswordInput'
import { boardOrdinalLabel, defaultBoardHostname, useBoardNodes } from './boardSelection'
import styles from './BoardFleetControls.module.css'

/**
 * The part of the board menu that is about *several* boards: adding another
 * controller, removing this one, and keeping them in time. Lives under the
 * Board node's own settings in the Hardware pane's board menu, and acts on
 * the board that menu was opened for. See docs/design/multi-board.md.
 */
export default function BoardFleetControls({ boardNodeId, onClose }: { boardNodeId: string; onClose: () => void }) {
  const boards = useBoardNodes()
  const addBoard = useGraphStore((state) => state.addBoard)
  const removeBoard = useGraphStore((state) => state.removeBoard)
  const setBoardClockSync = useGraphStore((state) => state.setBoardClockSync)
  const updateNodeProperty = useGraphStore((state) => state.updateNodeProperty)
  // Wired through the board's own partition: an Ethernet module on another
  // board does not carry this one's datagrams.
  const wired = useGraphStore((state) => wiredNetworkIn(boardPartitionOf(state, boardNodeId).nodes) !== null)
  const setActiveBoardId = useUiStore((state) => state.setActiveBoardId)
  const requestConfirm = useUiStore((state) => state.requestConfirm)
  const setStatus = useUiStore((state) => state.setStatus)
  const credentials = useNetworkCredentialsStore((state) => state.byNodeId[boardNodeId] ?? EMPTY_CREDENTIALS)
  const setCredentials = useNetworkCredentialsStore((state) => state.setCredentials)

  const index = boards.findIndex((board) => board.id === boardNodeId)
  const board = index >= 0 ? boards[index] : undefined
  const props = (board?.data.properties ?? {}) as Record<string, unknown>
  const profileId = typeof props.profileId === 'string' && props.profileId ? props.profileId : undefined
  const clockSync = props.clockSync === 'leader' || props.clockSync === 'follower'
  const isPrimary = index <= 0
  const hostname = typeof props.wifiHostname === 'string' ? props.wifiHostname : ''
  const label = boardOrdinalLabel(boards, boardNodeId)

  const addAnother = () => {
    const id = addBoard(profileId)
    setActiveBoardId(id)
    setStatus(`Added Board ${boards.length + 1} — the bench now shows it`, 'success')
    onClose()
  }

  const removeThis = async () => {
    const ok = await requestConfirm({
      title: `Remove ${label}?`,
      message: 'Its hardware parts and LED outputs are removed with it. Patterns and controls stay in the graph.',
      confirmLabel: 'Remove',
      tone: 'danger',
    })
    if (!ok) return
    removeBoard(boardNodeId)
    setStatus(`Removed ${label}`, 'info')
    onClose()
  }

  const setSync = (enabled: boolean) => {
    setBoardClockSync(enabled)
    if (!enabled) return
    // A synced board announces itself; give each one its name the first time
    // sync is asked for, so a project that never syncs stays free of them.
    boards.forEach((entry, ordinal) => {
      const current = (entry.data.properties as Record<string, unknown>).wifiHostname
      if (typeof current === 'string' && current) return
      updateNodeProperty(entry.id, 'wifiHostname', defaultBoardHostname(ordinal))
    })
  }

  return (
    <div className={styles.fleet}>
      <div className={styles.header}>
        <span>Controllers</span>
        <strong>{boards.length > 1 ? `${label} of ${boards.length}` : 'One board'}</strong>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.button} onClick={addAnother}>
          Add another controller
        </button>
        {!isPrimary && (
          <button type="button" className={`${styles.button} ${styles.danger}`} onClick={() => { void removeThis() }}>
            Remove this controller
          </button>
        )}
      </div>
      {boards.length > 1 && (
        <>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={clockSync}
              onChange={(event) => setSync(event.target.checked)}
            />
            <span>Keep boards in time</span>
          </label>
          <div className={styles.note}>
            {clockSync
              ? 'Board 1 leads over the network; every other board follows its clock and show.'
              : 'Each board runs its own clock. Turn this on to sync animations and shows over Wi-Fi.'}
          </div>
          {clockSync && (
            <>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor={`${boardNodeId}-hostname`}>Hostname</label>
                <input
                  id={`${boardNodeId}-hostname`}
                  className={`nodrag ${styles.fieldInput}`}
                  type="text"
                  autoComplete="off"
                  value={hostname}
                  placeholder={defaultBoardHostname(Math.max(0, index))}
                  onChange={(event) => updateNodeProperty(boardNodeId, 'wifiHostname', event.target.value)}
                />
              </div>
              {wired ? (
                <div className={styles.note}>This board reaches the network through its wired link, so it needs no Wi-Fi credentials.</div>
              ) : (
                <>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel} htmlFor={`${boardNodeId}-ssid`}>Wi-Fi SSID</label>
                    <input
                      id={`${boardNodeId}-ssid`}
                      className={`nodrag ${styles.fieldInput}`}
                      type="text"
                      autoComplete="off"
                      value={credentials.ssid}
                      onChange={(event) => setCredentials(boardNodeId, { ssid: event.target.value })}
                      placeholder="network name"
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel} htmlFor={`${boardNodeId}-password`}>Wi-Fi password</label>
                    <WifiPasswordInput
                      id={`${boardNodeId}-password`}
                      className={`nodrag ${styles.fieldInput}`}
                      value={credentials.password}
                      onChange={(password) => setCredentials(boardNodeId, { password })}
                    />
                  </div>
                  <div className={styles.note}>Stored in this browser only — never saved in the project file or share links.</div>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
