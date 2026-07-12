import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useUploadStore } from '../../state/uploadStore'
import styles from './Upload.module.css'

// Read-only "show me the code" panel — the exact string MatrixOutputUpload
// would export/upload, for learning the generated firmware or debugging a
// preview-vs-firmware mismatch. Opened from the node's "View Code" button.
export default function CodeViewPopup({ code }: { code: string }) {
  const closeCodeView = useUploadStore((s) => s.closeCodeView)
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')

  useEffect(() => () => {
    if (copyResetRef.current) clearTimeout(copyResetRef.current)
  }, [])

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
    if (copyResetRef.current) clearTimeout(copyResetRef.current)
    copyResetRef.current = setTimeout(() => setCopyState('idle'), 2000)
  }

  const copyLabel = copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy'
  const lineCount = code ? code.split('\n').length : 0

  return createPortal(
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) closeCodeView() }}>
      <div className={styles.codePopup} role="dialog" aria-label="Generated code">
        <div className={styles.popupHeader}>
          <span>Generated Sketch <span className={styles.codeLineCount}>{lineCount} lines</span></span>
          <div className={styles.codeHeaderActions}>
            <button className={styles.consoleCopyBtn} onClick={copyCode} disabled={!code} title="Copy the full sketch as text" aria-live="polite">
              {copyLabel}
            </button>
            <button className={styles.closeBtn} onClick={closeCodeView} title="Close">×</button>
          </div>
        </div>
        <pre className={styles.codeBody}>{code || '// nothing to generate yet'}</pre>
      </div>
    </div>,
    document.body
  )
}
