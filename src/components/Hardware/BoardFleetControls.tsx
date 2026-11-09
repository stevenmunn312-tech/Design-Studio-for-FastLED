import { useGraphStore } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'
import { BOARD_LINK_CHANNEL_MAX, BOARD_LINK_CHANNEL_MIN, boardLinkSettings } from '../../state/peripherals/boardLinkKey'
import ClampedNumberInput from '../Canvas/ClampedNumberInput'
import { boardOrdinalLabel, useBoardNodes } from './boardSelection'
import { EXPERIMENTAL_LABEL, EXPERIMENTAL_NOTE } from '../../utils/experimentalFeatures'
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
  const setActiveBoardId = useUiStore((state) => state.setActiveBoardId)
  const requestConfirm = useUiStore((state) => state.requestConfirm)
  const setStatus = useUiStore((state) => state.setStatus)

  const index = boards.findIndex((board) => board.id === boardNodeId)
  const board = index >= 0 ? boards[index] : undefined
  const props = (board?.data.properties ?? {}) as Record<string, unknown>
  const profileId = typeof props.profileId === 'string' && props.profileId ? props.profileId : undefined
  const clockSync = props.clockSync === 'leader' || props.clockSync === 'follower'
  const isPrimary = index <= 0
  const label = boardOrdinalLabel(boards, boardNodeId)
  // The link channel is the project's, stored on the primary Board, so every
  // board's menu shows and sets the same one.
  const primary = boards[0]
  const linkChannel = boardLinkSettings(primary?.data.properties).channel

  const addAnother = () => {
    const id = addBoard(profileId)
    setActiveBoardId(id)
    setStatus(`Added Board ${boards.length + 1} — the bench now shows it`, 'success')
    onClose()
  }

  const removeThis = async () => {
    const ok = await requestConfirm({
      title: `Remove ${label}?`,
      message: 'Its hardware parts and LED outputs are removed with it. Network inputs and outputs on it move to Board 1; patterns and controls stay in the graph.',
      confirmLabel: 'Remove',
      tone: 'danger',
    })
    if (!ok) return
    removeBoard(boardNodeId)
    setStatus(`Removed ${label}`, 'info')
    onClose()
  }

  // Each board already announces a name of its own (`defaultBoardHostname`
  // from its id), so turning sync on changes nothing but the role.
  const setSync = (enabled: boolean) => setBoardClockSync(enabled)

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
            <span className={styles.experimental} title={EXPERIMENTAL_NOTE}>{EXPERIMENTAL_LABEL}</span>
            {' '}
            {clockSync
              ? 'Board 1 leads over the network; every other board follows its clock and show.'
              : 'Each board runs its own clock. Turn this on to sync animations and shows over Wi-Fi.'}
          </div>
          {clockSync && (
            <div className={styles.note}>
              Each board keeps time over its own connection, set in its Network settings above.
            </div>
          )}
          {primary && (
            <>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor={`${boardNodeId}-link-channel`}>Link channel</label>
                <ClampedNumberInput
                  id={`${boardNodeId}-link-channel`}
                  className={`nodrag ${styles.fieldInput}`}
                  value={linkChannel}
                  min={BOARD_LINK_CHANNEL_MIN}
                  max={BOARD_LINK_CHANNEL_MAX}
                  step={1}
                  ariaLabel="Link channel"
                  onCommit={(channel) => updateNodeProperty(primary.id, 'linkChannel', Math.round(channel))}
                />
              </div>
              <div className={styles.note}>The Wi-Fi channel boards link on, used only when no linked board joins a network.</div>
            </>
          )}
        </>
      )}
    </div>
  )
}
