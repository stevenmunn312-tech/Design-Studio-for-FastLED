import { useState } from 'react'
import { partOrigin, partRenderSrc, registeredPartManifests } from '../../build/parts/partCatalogue'
import { getPartsLibrary, type PartsLibrary } from '../../build/parts/partsLibrary'
import { usePartCatalogueVersion } from '../../build/parts/usePartCatalogueVersion'
import { partIdsInUse } from '../../state/graphStore'
import { Icon } from '../icons/Icon'
import styles from './RemotePartsSection.module.css'

interface InstalledPartsSectionProps {
  /** Test seam; the app uses the shared library. */
  library?: PartsLibrary
}

/**
 * The parts downloaded into this app, each with an Uninstall action. A part the
 * open project (or its undo history or copy clipboard) still uses is refused
 * with a plain reason rather than vanishing under its nodes. Saves keep working
 * either way: they embed the signed part.
 */
export default function InstalledPartsSection({ library = getPartsLibrary() }: InstalledPartsSectionProps) {
  // The catalogue moves when a part registers, gets its picture or is removed.
  usePartCatalogueVersion()
  const [messages, setMessages] = useState<Record<string, string>>({})
  const downloaded = registeredPartManifests().filter((manifest) => partOrigin(manifest.partId) === 'downloaded')
  if (downloaded.length === 0) return null

  const uninstall = async (partId: string) => {
    const outcome = await library.uninstall(partId, { inUse: (id) => partIdsInUse().has(id) })
    setMessages((current) => {
      const next = { ...current }
      if (outcome.ok) delete next[partId]
      else if (outcome.reason === 'in-use') {
        next[partId] = 'This part is used by the open project. Remove its nodes from the project (and clear the copy buffer) before uninstalling.'
      } else next[partId] = 'This part is not a downloaded part.'
      return next
    })
  }

  return (
    <section className={styles.section} aria-label="Downloaded parts">
      <h3 className={styles.heading}>Downloaded parts</h3>
      <ul className={styles.list}>
        {downloaded.map((manifest) => {
          const src = partRenderSrc(manifest.partId)
          const message = messages[manifest.partId]
          return (
            <li key={manifest.partId} className={styles.part}>
              <span className={styles.thumb} aria-hidden="true">
                {src
                  ? <img src={src} alt="" draggable={false} />
                  : <Icon name="field" size={18} />}
              </span>
              <span className={styles.copy}>
                <strong>{manifest.label}</strong>
                <small>Revision {manifest.revision}</small>
                {message && <small className={styles.error} role="alert">{message}</small>}
              </span>
              <button
                type="button"
                className={styles.action}
                aria-label={`Uninstall ${manifest.label}`}
                onClick={() => { void uninstall(manifest.partId) }}
              >
                Uninstall
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
