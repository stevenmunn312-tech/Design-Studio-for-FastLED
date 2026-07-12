import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useUiStore, type AppDialogState } from '../../state/uiStore'
import styles from './AppDialogHost.module.css'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

function focusableElements(root: HTMLElement | null): HTMLElement[] {
  if (!root) return []
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute('hidden'))
}

function dialogName(dialog: AppDialogState): string {
  switch (dialog.kind) {
    case 'alert': return 'Notice'
    case 'confirm': return 'Confirm action'
    case 'prompt': return 'Enter a value'
  }
}

export default function AppDialogHost() {
  const dialog = useUiStore((s) => s.appDialog)
  const resolveAppDialog = useUiStore((s) => s.resolveAppDialog)
  const dialogRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const primaryBtnRef = useRef<HTMLButtonElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const [draft, setDraft] = useState('')
  const titleId = useId()
  const messageId = useId()
  const promptId = useId()

  useEffect(() => {
    if (!dialog) return
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setDraft(dialog.kind === 'prompt' ? dialog.initialValue ?? '' : '')
  }, [dialog])

  useEffect(() => {
    if (!dialog) {
      const target = restoreFocusRef.current
      if (target?.isConnected) target.focus()
      restoreFocusRef.current = null
      return
    }
    const timer = window.setTimeout(() => {
      if (dialog.kind === 'prompt' && inputRef.current) {
        inputRef.current.focus()
        if (dialog.readOnly || dialog.selectText) inputRef.current.select()
      } else {
        primaryBtnRef.current?.focus()
      }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [dialog])

  const canSubmit = useMemo(() => {
    if (!dialog) return false
    if (dialog.kind !== 'prompt') return true
    return dialog.readOnly || draft.trim().length > 0
  }, [dialog, draft])

  if (!dialog || typeof document === 'undefined') return null

  const close = () => {
    switch (dialog.kind) {
      case 'alert':
        resolveAppDialog(undefined)
        break
      case 'confirm':
        resolveAppDialog(false)
        break
      case 'prompt':
        resolveAppDialog(null)
        break
    }
  }

  const submit = () => {
    switch (dialog.kind) {
      case 'alert':
        resolveAppDialog(undefined)
        break
      case 'confirm':
        resolveAppDialog(true)
        break
      case 'prompt':
        if (!canSubmit) return
        resolveAppDialog(draft)
        break
    }
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }
    if (event.key === 'Enter' && dialog.kind === 'prompt' && event.target === inputRef.current) {
      event.preventDefault()
      submit()
      return
    }
    if (event.key !== 'Tab') return
    const items = focusableElements(dialogRef.current)
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement as HTMLElement | null
    if (event.shiftKey && active === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div
      className={styles.overlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <div
        ref={dialogRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        aria-label={dialogName(dialog)}
        onKeyDown={onKeyDown}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>{dialog.title}</h2>
        </div>
        <div className={styles.body}>
          <p id={messageId} className={styles.message}>{dialog.message}</p>
          {dialog.kind === 'prompt' && (
            <label className={styles.field}>
              {dialog.inputLabel && <span className={styles.fieldLabel}>{dialog.inputLabel}</span>}
              <input
                id={promptId}
                ref={inputRef}
                className={`${styles.input} ${dialog.monospace ? styles.inputMono : ''}`}
                value={draft}
                readOnly={dialog.readOnly}
                placeholder={dialog.placeholder}
                aria-label={dialog.inputLabel ?? dialog.title}
                onChange={(event) => setDraft(event.target.value)}
              />
            </label>
          )}
        </div>
        <div className={styles.actions}>
          {dialog.kind !== 'alert' && dialog.cancelLabel && (
            <button className={styles.secondaryBtn} onClick={close}>
              {dialog.cancelLabel}
            </button>
          )}
          <button
            ref={primaryBtnRef}
            className={dialog.tone === 'danger' ? styles.dangerBtn : styles.primaryBtn}
            onClick={submit}
            disabled={!canSubmit}
          >
            {dialog.confirmLabel ?? 'OK'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
