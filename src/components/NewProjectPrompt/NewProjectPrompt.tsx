import { useEffect } from 'react'
import { useUiStore } from '../../state/uiStore'
import styles from './NewProjectPrompt.module.css'

export default function NewProjectPrompt() {
  const prompt = useUiStore((s) => s.newProjectPrompt)
  const resolveNewProjectDecision = useUiStore((s) => s.resolveNewProjectDecision)

  useEffect(() => {
    if (!prompt.open) return
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
      <div className={styles.modal} role="dialog" aria-label="Save current project first" aria-modal="true">
        <div className={styles.header}>
          <span className={styles.title}>Save current project first?</span>
        </div>
        <div className={styles.body}>
          <p className={styles.text}>
            Save current project "{prompt.projectName}" before {prompt.actionLabel}?
          </p>
        </div>
        <div className={styles.actions}>
          <button className={styles.primaryBtn} onClick={() => resolveNewProjectDecision('yes')}>
            Yes
          </button>
          <button className={styles.secondaryBtn} onClick={() => resolveNewProjectDecision('no')}>
            No
          </button>
          <button className={styles.ghostBtn} onClick={() => resolveNewProjectDecision('cancel')}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
