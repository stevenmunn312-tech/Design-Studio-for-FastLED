import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useUploadStore } from '../../state/uploadStore'
import styles from './Upload.module.css'

// Read-only "show me the code" panel — the exact string MatrixOutputUpload
// would export/upload, for learning the generated firmware or debugging a
// preview-vs-firmware mismatch. Opened from the node's "View Code" button.
// Line numbers are a display-only gutter (aria-hidden, unselectable) so they
// never end up in the Copy/Download text, which stay the raw generated code.
export default function CodeViewPopup({
  code,
  onUpload,
  uploadDisabled,
  uploadTitle,
  busy,
}: {
  code: string
  onUpload?: () => void
  uploadDisabled?: boolean
  uploadTitle?: string
  busy?: boolean
}) {
  const closeCodeView = useUploadStore((s) => s.closeCodeView)
  const exportIno = useUploadStore((s) => s.exportIno)
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
  const lines = useMemo(() => (code ? code.split('\n') : []), [code])
  const lineCount = lines.length

  return createPortal(
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) closeCodeView() }}>
      <div className={styles.codePopup} role="dialog" aria-label="Generated code">
        <div className={styles.popupHeader}>
          <span>Generated Sketch <span className={styles.codeLineCount}>{lineCount} lines</span></span>
          <div className={styles.codeHeaderActions}>
            {onUpload && (
              <button
                className={styles.consoleUploadBtn}
                onClick={onUpload}
                disabled={uploadDisabled}
                title={uploadTitle ?? 'Compile & upload this sketch to the board'}
              >
                {busy ? 'Uploading…' : '↑ Upload'}
              </button>
            )}
            <button className={styles.consoleCopyBtn} onClick={() => exportIno(code)} disabled={!code} title="Download the generated .ino sketch">
              Download
            </button>
            <button className={styles.consoleCopyBtn} onClick={copyCode} disabled={!code} title="Copy the full sketch as text" aria-live="polite">
              {copyLabel}
            </button>
            <button className={styles.closeBtn} onClick={closeCodeView} title="Close">×</button>
          </div>
        </div>
        {code ? (
          <div className={styles.codeBody}>
            <div className={styles.codeGutter} aria-hidden="true">
              {lines.map((_, i) => <span key={i}>{i + 1}</span>)}
            </div>
            <pre className={styles.codeText}>{code}</pre>
          </div>
        ) : (
          <div className={styles.codeBody}>
            <pre className={styles.codeText}>// nothing to generate yet</pre>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
