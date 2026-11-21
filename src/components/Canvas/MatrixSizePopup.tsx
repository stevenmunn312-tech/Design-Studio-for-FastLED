import { useRef, useState, type KeyboardEvent } from 'react'
import { useModalFocus } from '../../hooks/useModalFocus'
import { useModalInitialFocus } from '../../hooks/useModalInitialFocus'
import styles from './MatrixSizePopup.module.css'

interface Props {
  width: number
  height: number
  onApply: (width: number, height: number) => void
  onClose: () => void
}

// Opened from MatrixOutput's size dropdown when "Custom" is picked, so the
// user can dial in an X,Y that isn't one of the 16/32/64 presets. The 64×64
// ceiling is intentional: larger compositions multiply preview work and
// firmware buffer demand too aggressively for the supported design envelope.
export default function MatrixSizePopup({ width, height, onApply, onClose }: Props) {
  const [w, setW] = useState(String(width))
  const [h, setH] = useState(String(height))

  const dialogRef = useModalFocus<HTMLDivElement>(onClose)
  const widthRef = useRef<HTMLInputElement>(null)
  useModalInitialFocus(widthRef)

  const clamp = (v: string) => Math.max(1, Math.min(64, Math.round(Number(v)) || 1))

  const apply = () => {
    onApply(clamp(w), clamp(h))
    onClose()
  }

  // Escape in a field answers here, so the escape-layer stack (this popup's
  // own entry included) leaves it alone: one keystroke, one close.
  const closeFromField = (e: KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    onClose()
  }

  return (
    <div
      className={`nodrag nowheel ${styles.overlay}`}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div ref={dialogRef} className={styles.popup} role="dialog" aria-modal="true" aria-label="Custom matrix size" tabIndex={-1}>
        <div className={styles.header}>
          <span>Custom Size</span>
          <button className={styles.closeBtn} onClick={onClose} title="Cancel">×</button>
        </div>
        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Width (X)</span>
            <input
              ref={widthRef}
              className={styles.numInput}
              type="number"
              min={1}
              max={64}
              autoFocus
              value={w}
              onChange={(e) => setW(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') apply()
                if (e.key === 'Escape') closeFromField(e)
              }}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Height (Y)</span>
            <input
              className={styles.numInput}
              type="number"
              min={1}
              max={64}
              value={h}
              onChange={(e) => setH(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') apply()
                if (e.key === 'Escape') closeFromField(e)
              }}
            />
          </label>
        </div>
        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button className={styles.applyBtn} onClick={apply}>Apply</button>
        </div>
      </div>
    </div>
  )
}
