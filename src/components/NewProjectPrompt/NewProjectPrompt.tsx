import { useEffect, useRef } from 'react'
import { useUiStore } from '../../state/uiStore'
import styles from './NewProjectPrompt.module.css'

export default function NewProjectPrompt() {
  const prompt = useUiStore((s) => s.newProjectPrompt)
  const resolveNewProjectDecision = useUiStore((s) => s.resolveNewProjectDecision)
  const primaryButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!prompt.open) return
    primaryButtonRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') resolveNewProjectDecision('cancel')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [prompt.open, resolveNewProjectDecision])

  if (!prompt.open) return null

  return (
    <div
      className={styles.overlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) resolveNewProjectDecision('cancel')
      }}
    >
      <div className={styles.modal} role="dialog" aria-label="Save current project before continuing" aria-modal="true">
        <div className={styles.header}>
          <span className={styles.title}>Save current project before continuing?</span>
        </div>
        <div className={styles.body}>
          <p className={styles.text}>
            Current project <strong>"{prompt.projectName}"</strong> can be saved before {prompt.actionLabel}.
          </p>
          <p className={styles.text}>
            Destination: <strong>{prompt.destinationLabel}</strong>
          </p>
        </div>
        <div className={styles.actions}>
          <button ref={primaryButtonRef} className={styles.primaryBtn} onClick={() => resolveNewProjectDecision('yes')}>
            Save and continue
          </button>
          <button className={styles.secondaryBtn} onClick={() => resolveNewProjectDecision('no')}>
            Continue without saving
          </button>
          <button className={styles.ghostBtn} onClick={() => resolveNewProjectDecision('cancel')}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
