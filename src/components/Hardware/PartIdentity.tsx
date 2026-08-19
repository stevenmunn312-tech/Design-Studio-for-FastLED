import { useGraphStore } from '../../state/graphStore'
import { partOptionProperty, partOptionsFor, resolvePartIdentity } from '../../state/partOptions'
import styles from './PartIdentity.module.css'

/**
 * What exactly this part is, and what that means for wiring it.
 *
 * Shown wherever a part is configured. Everything here comes from the modelled
 * asset's own `part.json` — the header order, the logic voltage, the caveats —
 * so it is the datasheet talking rather than the app remembering.
 *
 * The header order is the detail that earns its space: it is what you read off
 * while a jumper is in your hand, and getting it from a photograph means
 * counting pads in a picture that may be rotated.
 */
export default function PartIdentity({ nodeId, nodeType }: { nodeId: string; nodeType: string }) {
  const updateNodeProperty = useGraphStore((s) => s.updateNodeProperty)
  const properties = useGraphStore((s) => {
    const node = s.nodes.find((n) => n.id === nodeId)
    return (node?.data.properties ?? {}) as Record<string, unknown>
  })

  const identity = resolvePartIdentity(nodeType, properties)
  if (!identity) return null
  const options = partOptionsFor(nodeType)
  const property = partOptionProperty(nodeType)

  return (
    <div className={styles.identity}>
      <div className={styles.row}>
        <span className={styles.key}>Part</span>
        {identity.hasChoice && property ? (
          <select
            className={`nodrag ${styles.picker}`}
            value={identity.option.id}
            aria-label="Exact module"
            onChange={(event) => updateNodeProperty(nodeId, property, event.target.value)}
          >
            {options.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        ) : (
          // One supported module, so state it rather than offer a choice that
          // is not one.
          <strong className={styles.value}>{identity.option.label}</strong>
        )}
      </div>

      {identity.entry?.logicVoltage && (
        <div className={styles.row}>
          <span className={styles.key}>Logic</span>
          <span className={styles.value}>{identity.entry.logicVoltage}</span>
        </div>
      )}

      {identity.entry?.dimensionsMm && (
        <div className={styles.row}>
          <span className={styles.key}>Size</span>
          <span className={styles.value}>
            {identity.entry.dimensionsMm.width} × {identity.entry.dimensionsMm.height} mm
          </span>
        </div>
      )}

      {identity.entry?.pinLabelsLeftToRight?.length ? (
        <div className={styles.pins}>
          <span className={styles.key}>Header, left to right</span>
          <ol className={styles.pinList}>
            {identity.entry.pinLabelsLeftToRight.map((label, index) => (
              <li key={`${label}-${index}`}>{label}</li>
            ))}
          </ol>
        </div>
      ) : null}

      {identity.notes.length > 0 && (
        <ul className={styles.notes}>
          {identity.notes.map((note) => <li key={note}>{note}</li>)}
        </ul>
      )}

      {!identity.entry && (
        <p className={styles.unmodelled}>
          Not modelled yet — no verified dimensions or photo for this module, so
          the view falls back to the default part's size.
        </p>
      )}
    </div>
  )
}
