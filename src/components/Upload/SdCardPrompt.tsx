import { useCallback, useEffect, useState } from 'react'
import { useUploadStore } from '../../state/uploadStore'
import { listRemovableDrives, type RemovableDrive } from '../../utils/backendClient'
import styles from './Upload.module.css'

/** How often to re-look for a card while the insert prompt is open. The user
 *  is being asked to plug something in *now*, so the list has to keep up with
 *  them rather than being a snapshot from before they were asked. */
const RESCAN_MS = 1500

/**
 * The pause in a show upload while the user physically moves the SD card.
 *
 * Serial is the universal path but slow — a 7 MB song is minutes even at
 * 921600 baud. A card in a reader is seconds, at the cost of two card swaps,
 * so the studio asks rather than guessing: only the user knows whether a
 * reader is on the desk.
 *
 * Two stages. `insert` needs a destination chosen and is cancellable — nothing
 * has been written or flashed yet, so backing out here is free. `reinsert` is
 * an acknowledgement once the files are on the card: the flash needs the board
 * rather than the card, but a player that boots without one has nothing to
 * play.
 */
export default function SdCardPrompt() {
  const sdPrompt = useUploadStore((s) => s.sdPrompt)
  const resolveSdPrompt = useUploadStore((s) => s.resolveSdPrompt)
  const [drives, setDrives] = useState<RemovableDrive[]>([])
  const [drive, setDrive] = useState('')
  const [scanning, setScanning] = useState(false)

  const insert = sdPrompt?.stage === 'insert'

  const rescan = useCallback(async () => {
    setScanning(true)
    const found = await listRemovableDrives()
    setScanning(false)
    setDrives(found)
    // Default to the only candidate — with one reader attached, the ordinary
    // case, that turns this dialog into a single confirm. Any existing choice
    // is kept as long as it is still mounted.
    setDrive((current) => (found.some((d) => d.path === current) ? current : found[0]?.path ?? ''))
  }, [])

  useEffect(() => {
    if (!insert) return
    void rescan()
    const id = setInterval(() => { void rescan() }, RESCAN_MS)
    return () => clearInterval(id)
  }, [insert, rescan])

  if (!sdPrompt) return null
  const { fileCount, totalBytes } = sdPrompt
  const chosen = drives.find((d) => d.path === drive)

  return (
    <div className={styles.overlay}>
      <div className={styles.popup} role="dialog" aria-label={insert ? 'Insert the SD card' : 'Return the SD card'}>
        <div className={styles.popupHeader}>
          <span>{insert ? 'Put the SD card in the reader' : 'Put the SD card back'}</span>
        </div>

        {insert ? (
          <>
            <div className={styles.note}>
              Insert the card into your reader — it will appear below. Songs already on
              the card at the same size are skipped, so re-uploading a show only writes
              the show files.
            </div>

            {drives.length === 0 ? (
              <div className={`${styles.note} ${styles.noteWarn}`}>
                {scanning ? 'Looking for a card…' : 'No removable drive found yet.'} If your
                reader doesn't appear, Cancel and untick <strong>Card reader available</strong> to
                send the files over serial instead.
              </div>
            ) : (
              <>
                <div className={styles.sectionTitle}>Destination</div>
                <div className={styles.portRow}>
                  <select
                    className={styles.select}
                    value={drive}
                    onChange={(e) => setDrive(e.target.value)}
                    aria-label="Removable drive"
                  >
                    {drives.map((d) => (
                      <option key={d.path} value={d.path}>
                        {d.path} — {d.label} ({formatBytes(d.freeBytes)} free)
                      </option>
                    ))}
                  </select>
                </div>
                <div className={styles.note}>
                  Writes {fileCount} file{fileCount === 1 ? '' : 's'} ({formatBytes(totalBytes)})
                  into <code>/music</code> and <code>/shows</code>.
                </div>
                {chosen && chosen.freeBytes < totalBytes && (
                  <div className={`${styles.note} ${styles.noteWarn}`}>
                    Free space on that drive is below the total to write. Files already on
                    the card don't need copying again, so this can still succeed.
                  </div>
                )}
              </>
            )}

            <div className={styles.divider} />
            <div className={styles.portRow}>
              <button className={styles.installBtn} disabled={!drive} onClick={() => resolveSdPrompt(drive)}>
                Write to card
              </button>
              <button className={styles.refreshBtn} onClick={() => resolveSdPrompt(null)}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            <div className={styles.note}>
              The card is written. Put it back in the SD Card module on the board, then
              continue — the player is flashed next.
            </div>
            <div className={styles.divider} />
            <button className={styles.installBtn} onClick={() => resolveSdPrompt('')}>
              Card is back — flash the player
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function formatBytes(n: number) {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${Math.round(n / 1024)} KB`
}
