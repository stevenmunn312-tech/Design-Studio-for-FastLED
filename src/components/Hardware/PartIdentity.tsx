import { rootGraphNodes, useGraphStore } from '../../state/graphStore'
import { resolvePartIdentity } from '../../state/partOptions'
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
  const properties = useGraphStore((s) => {
    const node = rootGraphNodes(s).find((n) => n.id === nodeId)
    return (node?.data.properties ?? {}) as Record<string, unknown>
  })

  const identity = resolvePartIdentity(nodeType, properties)
  if (!identity) return null

  return (
    <div className={styles.identity}>
      <div className={styles.row}>
        <span className={styles.key}>Part</span>
        {/*
          * States the module rather than offering to change it.
          *
          * Add Hardware names every module separately, so the choice is made
          * once, when the part is put on the bench. A picker here would be the
          * same question asked a second time, and it let a generic answer
          * stand — which stopped being harmless with the PAM8403, an amplifier
          * that cannot take I2S. To use a different module, remove this part
          * and add the one you have.
          */}
        <strong className={styles.value}>{identity.option.label}</strong>
      </div>

      {identity.entry?.logicVoltage && (
        <div className={styles.row}>
          <span className={styles.key}>Logic</span>
          <span className={styles.value}>{identity.entry.logicVoltage}</span>
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
