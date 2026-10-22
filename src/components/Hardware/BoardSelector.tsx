import { useUiStore } from '../../state/uiStore'
import { boardProfileLabel, resolveActiveBoardId, useBoardNodes } from './boardSelection'
import styles from './BoardSelector.module.css'

/**
 * Which board the Hardware pane, the Build Diagram and the Upload tab are
 * working on. One strip, the same gesture in all three tabs: a tab per Board
 * node in root order, the active one highlighted. A project with one board
 * has nothing to choose between, so the strip draws nothing at all.
 * See docs/design/multi-board.md.
 */
export default function BoardSelector({ className }: { className?: string }) {
  const boards = useBoardNodes()
  const activeBoardId = useUiStore((state) => state.activeBoardId)
  const setActiveBoardId = useUiStore((state) => state.setActiveBoardId)
  if (boards.length < 2) return null
  const activeId = resolveActiveBoardId(boards, activeBoardId)
  return (
    <div
      className={[styles.selector, className].filter(Boolean).join(' ')}
      role="tablist"
      aria-label="Boards"
    >
      {boards.map((board, index) => {
        const active = board.id === activeId
        return (
          <button
            key={board.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`${styles.tab} ${active ? styles.tabActive : ''}`}
            onClick={() => setActiveBoardId(board.id)}
          >
            <strong>Board {index + 1}</strong>
            <span>{boardProfileLabel(board)}</span>
          </button>
        )
      })}
    </div>
  )
}
