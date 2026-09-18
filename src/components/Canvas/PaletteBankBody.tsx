import { useState } from 'react'
import { useGraphStore } from '../../state/graphStore'
import { PALETTE_DEFS } from '../../state/paletteCatalog'
import { movePaletteBankEntry, paletteBankEntries, paletteBankLabel } from '../../state/paletteBank'
import styles from './PaletteBankBody.module.css'

const PALETTE_BANK_OPEN_KEY = 'fls.paletteBank.open'

/** A palette's own stops, for the swatch both lists draw. */
function stopsFor(id: string): readonly string[] {
  return PALETTE_DEFS.find((palette) => palette.id === id)?.stops ?? []
}

/**
 * The bank's contents, then the catalogue to add from.
 *
 * Two lists rather than one, because they answer different questions. Order is
 * the node's whole contract — Next steps through the bank in this order — and
 * that order is not the catalogue's, so the bank is drawn as its own ordered
 * strip you can drag, while the grid below stays in catalogue order for
 * finding a palette by sight.
 */
export default function PaletteBankBody({ nodeId }: { nodeId: string }) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(PALETTE_BANK_OPEN_KEY) !== 'false'
    } catch {
      return true
    }
  })
  const properties = useGraphStore(
    (s) => s.nodes.find((n) => n.id === nodeId)?.data.properties as Record<string, unknown> | undefined,
  )
  const updateNodeProperty = useGraphStore((s) => s.updateNodeProperty)
  // Which row is being dragged, and where it would land. Held here rather than
  // read back out of the drag event, because `dragover` fires on the row being
  // crossed and only this side knows what started moving.
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  // Read through the same normalizer the evaluator and the generator use, so
  // the chips can never show a bank different from the one that renders.
  const bank = paletteBankEntries(properties ?? {})

  const reorder = (from: number, to: number) => {
    const next = movePaletteBankEntry(bank, from, to)
    if (next.join() !== bank.join()) updateNodeProperty(nodeId, 'palettes', next)
  }
  const endDrag = () => {
    setDragFrom(null)
    setDragOver(null)
  }

  const toggle = (id: string) => {
    const next = bank.includes(id) ? bank.filter((entry) => entry !== id) : [...bank, id]
    updateNodeProperty(nodeId, 'palettes', next)
  }
  const allOn = bank.length === PALETTE_DEFS.length
  const toggleAll = () => updateNodeProperty(
    nodeId, 'palettes', allOn ? [] : PALETTE_DEFS.map((palette) => palette.id))
  const toggleOpen = () => {
    setOpen((current) => {
      const next = !current
      try {
        localStorage.setItem(PALETTE_BANK_OPEN_KEY, String(next))
      } catch {
        // localStorage unavailable — the section still works this session.
      }
      return next
    })
  }

  return (
    <div className={`nodrag ${styles.wrap}`}>
      <button
        type="button"
        className={styles.sectionToggle}
        onClick={toggleOpen}
        aria-expanded={open}
      >
        <span className={`${styles.sectionCaret}${open ? ` ${styles.sectionCaretOpen}` : ''}`}>▸</span>
        <span>Palettes</span>
        <span className={styles.sectionCount}>{bank.length} in bank</span>
      </button>
      {open && (
        <div className={styles.sectionContent}>
          <div className={styles.setActions}>
            {/* The economy the node exists for, where the decision is made. */}
            <span className={styles.cost}>{bank.length * 48} bytes</span>
            <button type="button" className={styles.allBtn} onClick={toggleAll}>
              {allOn ? 'clear' : 'all'}
            </button>
          </div>
          {bank.length > 0 && (
            <ol
              className={styles.bank}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                if (dragFrom !== null && dragOver !== null) reorder(dragFrom, dragOver)
                endDrag()
              }}
            >
              {bank.map((id, position) => (
                <li
                  key={id}
                  className={[
                    styles.bankRow,
                    dragFrom === position ? styles.bankRowDragging : '',
                    dragOver === position && dragFrom !== position ? styles.bankRowOver : '',
                  ].filter(Boolean).join(' ')}
                  draggable
                  onDragStart={(event) => {
                    setDragFrom(position)
                    setDragOver(position)
                    // Firefox starts no drag at all without payload on the event.
                    event.dataTransfer.setData('text/plain', id)
                    event.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragOver={(event) => {
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                    setDragOver(position)
                  }}
                  onDragEnd={endDrag}
                >
                  <span className={styles.bankOrder}>{position + 1}</span>
                  <span
                    className={styles.bankSwatch}
                    style={{ background: `linear-gradient(90deg, ${stopsFor(id).join(', ')})` }}
                    aria-hidden="true"
                  />
                  <span className={styles.label}>{paletteBankLabel(id)}</span>
                  {/* Drag is the tool; these are the same edit for anyone not
                      using a pointer, and what the reorder tests drive. */}
                  <span className={styles.bankMoves}>
                    <button
                      type="button"
                      className={styles.moveBtn}
                      disabled={position === 0}
                      aria-label={`Move ${paletteBankLabel(id)} earlier`}
                      onClick={() => reorder(position, position - 1)}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className={styles.moveBtn}
                      disabled={position === bank.length - 1}
                      aria-label={`Move ${paletteBankLabel(id)} later`}
                      onClick={() => reorder(position, position + 1)}
                    >
                      ▼
                    </button>
                  </span>
                </li>
              ))}
            </ol>
          )}
          <div className={styles.grid}>
            {PALETTE_DEFS.map((palette) => {
              const position = bank.indexOf(palette.id)
              const included = position >= 0
              return (
                <button
                  key={palette.id}
                  type="button"
                  className={`${styles.card}${included ? ` ${styles.on}` : ''}`}
                  onClick={() => toggle(palette.id)}
                  aria-pressed={included}
                  title={included
                    ? `${palette.label} — position ${position + 1} in the bank`
                    : `Add ${palette.label} to the bank`}
                >
                  <span
                    className={styles.swatch}
                    style={{ background: `linear-gradient(90deg, ${palette.stops.join(', ')})` }}
                    aria-hidden="true"
                  />
                  <span className={styles.label}>{palette.label}</span>
                  {included && <span className={styles.order}>{position + 1}</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
