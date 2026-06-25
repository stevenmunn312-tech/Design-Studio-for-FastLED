import { useMusicStore } from '../../state/musicStore'
import styles from './MusicLibraryNodeBody.module.css'

// In-node body for the MusicLibrary node. The node itself has no properties and
// only a `songs` output, so without this it renders empty. This surfaces the
// loaded-song count + analysis status and the double-click affordance that opens
// the Music Library panel (the actual drop / analyse / export UI).
export default function MusicLibraryNodeBody() {
  const total     = useMusicStore((s) => s.entries.length)
  const done      = useMusicStore((s) => s.entries.reduce((n, e) => n + (e.status === 'done' ? 1 : 0), 0))
  const analyzing = useMusicStore((s) => s.entries.some((e) => e.status === 'analyzing'))

  return (
    <div className={styles.wrap}>
      {total === 0 ? (
        <div className={styles.empty}>
          <span className={styles.note}>♪</span>
          <span>Double-click to add music</span>
        </div>
      ) : (
        <>
          <span className={styles.count}>{total} song{total !== 1 ? 's' : ''}</span>
          <span className={`${styles.status}${analyzing ? ` ${styles.analyzing}` : ''}`}>
            {analyzing ? 'Analysing…' : `${done}/${total} analysed`}
          </span>
          <span className={styles.hint}>Double-click to open</span>
        </>
      )}
    </div>
  )
}
