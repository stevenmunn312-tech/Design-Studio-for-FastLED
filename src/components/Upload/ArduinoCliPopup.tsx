import { useState } from 'react'
import { useUploadStore } from '../../state/uploadStore'
import styles from './Upload.module.css'

// Shown when the helper is running but arduino-cli isn't found. Two ways out:
// point the helper at an existing binary, or have it download + install one.
export default function ArduinoCliPopup() {
  const { busy, locate, installCli, closeCliPopup } = useUploadStore()
  const [path, setPath] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleLocate() {
    setError(null)
    const res = await locate(path.trim())
    if (!res.ok) setError(res.error ?? 'Could not use that file')
  }

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) closeCliPopup() }}>
      <div className={styles.popup} role="dialog" aria-label="arduino-cli not found">
        <div className={styles.popupHeader}>
          <span>arduino-cli not found</span>
          <button className={styles.closeBtn} onClick={closeCliPopup} title="Close">×</button>
        </div>

        <div className={styles.note}>
          The helper couldn't find <code>arduino-cli</code>. Point it at an existing binary, or install one.
        </div>

        <div className={styles.sectionTitle}>Specify its location</div>
        <div className={styles.portRow}>
          <input
            className={styles.textInput}
            type="text"
            placeholder="e.g. C:\\tools\\arduino-cli.exe"
            value={path}
            onChange={(e) => setPath(e.target.value)}
          />
          <button className={styles.refreshBtn} onClick={handleLocate} disabled={!path.trim() || busy} title="Use this path">Set</button>
        </div>
        {error && <div className={`${styles.note} ${styles.noteWarn}`}>{error}</div>}

        <div className={styles.divider} />

        <div className={styles.sectionTitle}>Or install it</div>
        <button className={styles.installBtn} onClick={installCli} disabled={busy}>
          {busy ? 'Installing…' : '⤓ Download & install arduino-cli'}
        </button>
        <div className={styles.note}>
          Downloads the official binary. You'll still need to install your board's core (from the Board popup) before the first upload.
        </div>
      </div>
    </div>
  )
}
