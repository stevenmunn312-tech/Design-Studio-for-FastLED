import { useState } from 'react'
import { useGraphStore } from '../../state/graphStore'
import { PALETTE_DEFS } from '../../state/paletteCatalog'
import { paletteBankEntries } from '../../state/paletteBank'
import styles from './PaletteBankBody.module.css'

const PALETTE_BANK_OPEN_KEY = 'fls.paletteBank.open'

/**
 * The bank's chip grid.
 *
 * Order is the node's whole contract — Next steps through this list in the
 * order it was ticked — so each chip carries its position rather than leaving
 * the author to infer it from the catalogue's order, which is not the bank's.
 * Ticking appends and unticking removes, so re-ordering is untick/retick; a
 * drag reorder would be the better tool and is deliberately not invented here
 * before anyone has asked for it.
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
  // Read through the same normalizer the evaluator and the generator use, so
  // the chips can never show a bank different from the one that renders.
  const bank = paletteBankEntries(properties ?? {})

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
