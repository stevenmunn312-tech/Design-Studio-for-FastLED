import { useGraphStore } from '../../state/graphStore'
import { ledPartId, ledProductOf, lockedLedKeys } from '../../state/output/ledProduct'
import { ledCountHint, ledProducts } from '../../state/output/ledProductCatalogue'
import { usePartCatalogueVersion } from '../../build/parts/usePartCatalogueVersion'
import styles from './LedPartPicker.module.css'

/** Reads for the fields a part locks, in the words the node uses. */
const LOCK_WORDS: Record<string, string> = {
  chipset: 'chipset',
  ledCount: 'LED count',
  width: 'size',
  height: 'size',
  hub75WideScan: 'scan',
  serpentine: 'wiring',
  startCorner: 'wiring',
  firstRun: 'wiring',
}

export interface LedPartPickerProps {
  nodeId: string
  properties: Record<string, unknown>
  disabled?: boolean
  /** A roomier layout for a dialog than the node's narrow rows. */
  wide?: boolean
}

/**
 * Which LED product an LED output is. Custom (no part) is the default and a
 * first-class choice: the output's form, chipset and size are its own to edit.
 * Naming a part stamps its facts into the node and locks them; Make custom
 * keeps the values and lets go of the part. Colour order stays editable.
 */
export default function LedPartPicker({ nodeId, properties, disabled = false, wide = false }: LedPartPickerProps) {
  usePartCatalogueVersion()
  const setLedOutputPart = useGraphStore((s) => s.setLedOutputPart)
  const makeLedOutputCustom = useGraphStore((s) => s.makeLedOutputCustom)
  const products = ledProducts()
  const saved = ledPartId(properties)
  const product = ledProductOf(properties)
  // A part this version lacks is kept and named, never silently replaced.
  const unknown = saved !== null && product === null
  const locked = product ? [...new Set(lockedLedKeys(product.spec).map((key) => LOCK_WORDS[key] ?? key))] : []
  const hint = product ? ledCountHint(product) : null
  const label = `LED part`

  return (
    <div className={`${styles.picker}${wide ? ` ${styles.wide}` : ''}`} data-testid="led-part-picker">
      <div className={styles.row} title="Which LED product this output is. Custom keeps every field editable.">
        <span className={styles.key}>{label}</span>
        <select
          className={`nodrag ${styles.select}`}
          disabled={disabled}
          value={saved ?? ''}
          aria-label="LED part"
          onChange={(event) => {
            const next = event.target.value
            if (next === '') makeLedOutputCustom(nodeId)
            else setLedOutputPart(nodeId, next)
          }}
        >
          <option value="">Custom</option>
          {unknown && <option value={saved}>{saved} (not in this version)</option>}
          {products.map((entry) => <option key={entry.partId} value={entry.partId}>{entry.label}</option>)}
        </select>
      </div>
      {product && (
        <>
          <p className={styles.note}>
            Set by the part: {locked.join(', ')}. Colour order{hint ? ' and LED count stay' : ' stays'} yours to change.
          </p>
          {hint && <p className={styles.note}>{hint}</p>}
          <button type="button" className={`nodrag ${styles.makeCustom}`} disabled={disabled}
            onClick={() => makeLedOutputCustom(nodeId)}>
            Make custom
          </button>
        </>
      )}
      {unknown && (
        <p className={styles.note}>This version of Design Studio does not have that LED part. The output is kept as saved.</p>
      )}
    </div>
  )
}
