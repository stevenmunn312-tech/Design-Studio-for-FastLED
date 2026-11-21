import { useEffect, useRef } from 'react'
import { useModalFocus } from '../../hooks/useModalFocus'
import { useProjectStore } from '../../state/projectStore'
import { useUiStore } from '../../state/uiStore'
import styles from './NewProjectPrompt.module.css'

// Always mounted; the dialog is its own component so the modal focus trap
// finds its element on first mount and is torn down when the prompt closes.
export default function NewProjectPrompt() {
  const open = useUiStore((s) => s.newProjectPrompt.open)
  return open ? <NewProjectDialog /> : null
}

function NewProjectDialog() {
  const prompt = useUiStore((s) => s.newProjectPrompt)
  const resolveNewProjectDecision = useUiStore((s) => s.resolveNewProjectDecision)
  // The prompt is always about the open project.
  const draft = useProjectStore((s) => s.projects.find((project) => project.id === s.currentProjectId)?.draft === true)
  const primaryButtonRef = useRef<HTMLButtonElement>(null)

  const dialogRef = useModalFocus<HTMLDivElement>(() => resolveNewProjectDecision('cancel'))
  // The primary button is also the first focusable element, which is where the
  // modal focus lands; this keeps it explicit.
  useEffect(() => { primaryButtonRef.current?.focus() }, [])

  return (
    <div
      className={styles.overlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) resolveNewProjectDecision('cancel')
      }}
    >
      <div ref={dialogRef} className={styles.modal} role="dialog" aria-label="Save current project before continuing" aria-modal="true" tabIndex={-1}>
        <div className={styles.header}>
          <span className={styles.title}>Save current project before continuing?</span>
        </div>
        <div className={styles.body}>
          <p className={styles.text}>
            Current project <strong>"{prompt.projectName}"</strong> can be saved before {prompt.actionLabel}.
          </p>
          {draft && (
            <p className={styles.text}>
              It has not been saved yet, so continuing without saving discards it.
            </p>
          )}
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
