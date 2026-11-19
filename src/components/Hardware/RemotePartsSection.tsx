import { useEffect, useMemo, useState } from 'react'
import { usePartCatalogueVersion } from '../../build/parts/usePartCatalogueVersion'
import {
  getPartsLibrary,
  installedState,
  type InstallOutcome,
  type PartsLibrary,
} from '../../build/parts/partsLibrary'
import { searchParts, type CategoryTree, type IndexPart } from '../../build/parts/remote'
import { offeredParts } from '../../build/parts/remote/indexSchema'
import styles from './RemotePartsSection.module.css'
import { Icon } from '../icons/Icon'
import { useRemoteParts } from './useRemoteParts'

const MAX_RESULTS = 12

type Row = { kind: 'error'; text: string } | { kind: 'working' }

/** The sentence shown on a part when installing it did not work. */
function installFailureMessage(outcome: Exclude<InstallOutcome, { ok: true }>): string {
  switch (outcome.reason) {
    case 'needs-newer-app':
      return 'Needs a newer Design Studio. Update the app to use this part.'
    case 'network':
      return 'Could not download this part. Check your connection and try again.'
    case 'unverified':
      return 'This download could not be verified, so it was not installed.'
    case 'invalid':
      return 'This part’s data is not valid for this version, so it was not installed.'
    case 'kept':
      return 'A bundled or newer copy of this part is already in use.'
    default:
      return 'This part is not available to install.'
  }
}

function verificationLabel(part: IndexPart): string {
  return part.verification === 'bench' ? 'Bench-tested' : 'Reviewed'
}

function categoryPath(part: IndexPart, tree: CategoryTree): string {
  const first = part.categories[0]
  if (!first) return ''
  return tree.lineage(first).map((node) => node.label).reverse().join(' › ')
}

/**
 * The part's picture, fetched on demand and checked against the signed index
 * (hash, WebP, size bound) before it is shown. No picture, or one that fails
 * the check, shows the placeholder.
 */
function PartThumb({ part, library }: { part: IndexPart; library: PartsLibrary }) {
  const [src, setSrc] = useState<string | null>(null)
  const render = part.render
  useEffect(() => {
    if (!render || typeof URL.createObjectURL !== 'function') return
    let cancelled = false
    let url: string | null = null
    void library.renderBytes({ render }).then((bytes) => {
      if (cancelled || !bytes) return
      url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/webp' }))
      setSrc(url)
    })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [library, render])
  return (
    <span className={styles.thumb} aria-hidden="true">
      {src ? <img src={src} alt="" draggable={false} /> : <Icon name="field" size={18} />}
    </span>
  )
}

interface RemotePartsSectionProps {
  query: string
  /** Test seam; the app uses the shared library. */
  library?: PartsLibrary
}

/**
 * Parts from the signed online library: matches for the search, and updates for
 * parts already installed. Renders nothing when no parts host is configured.
 */
export default function RemotePartsSection({ query, library = getPartsLibrary() }: RemotePartsSectionProps) {
  const remote = useRemoteParts(library)
  // The catalogue moves when a part registers, which flips its row to Installed.
  const catalogueVersion = usePartCatalogueVersion()
  const [rows, setRows] = useState<Record<string, Row>>({})
  const trimmed = query.trim()

  const { matches, updates, total } = useMemo(() => {
    if (remote.status !== 'ready') return { matches: [] as IndexPart[], updates: [] as IndexPart[], total: 0 }
    const offered = offeredParts(remote.index)
    const updatable = offered.filter((part) => installedState(part) === 'update')
    const found = trimmed === ''
      ? []
      : searchParts(offered, trimmed, remote.tree).filter((part) => installedState(part) !== 'bundled')
    return { matches: found.slice(0, MAX_RESULTS), updates: updatable, total: found.length }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- installedState reads the catalogue
  }, [remote, trimmed, catalogueVersion])

  if (remote.status === 'off' || remote.status === 'loading') return null
  if (remote.status === 'unavailable') {
    if (trimmed === '') return null
    const text = remote.reason === 'needs-newer-app'
      ? 'The online parts library needs a newer Design Studio.'
      : remote.reason === 'cannot-verify'
        ? 'This app cannot verify downloads here, so the online parts library is off.'
        : 'The online parts library is unavailable right now.'
    return <p className={styles.note} role="status">{text}</p>
  }

  const install = async (part: IndexPart) => {
    setRows((current) => ({ ...current, [part.partId]: { kind: 'working' } }))
    const outcome = await library.install(part)
    setRows((current) => {
      const next = { ...current }
      if (outcome.ok) delete next[part.partId]
      else next[part.partId] = { kind: 'error', text: installFailureMessage(outcome) }
      return next
    })
  }

  const renderPart = (part: IndexPart) => {
    const state = installedState(part)
    const row = rows[part.partId]
    const working = row?.kind === 'working'
    const path = categoryPath(part, remote.tree)
    return (
      <li key={part.partId} className={styles.part}>
        <PartThumb part={part} library={library} />
        <span className={styles.copy}>
          <strong>{part.label}</strong>
          <small>
            {[part.manufacturer, path, verificationLabel(part)].filter(Boolean).join(' · ')}
          </small>
          {row?.kind === 'error' && <small className={styles.error} role="alert">{row.text}</small>}
        </span>
        {state === 'installed' && <span className={styles.badge}>Installed</span>}
        {state !== 'installed' && (
          <button
            type="button"
            className={styles.action}
            disabled={working}
            aria-label={`${state === 'update' ? 'Update' : 'Download'} ${part.label}`}
            onClick={() => { void install(part) }}
          >
            {working ? 'Working…' : state === 'update' ? `Update to rev ${part.revision}` : 'Download'}
          </button>
        )}
      </li>
    )
  }

  const updateOnly = updates.filter((part) => !matches.some((match) => match.partId === part.partId))
  if (trimmed === '' && updateOnly.length === 0) return null

  return (
    <section className={styles.section} aria-label="Online parts library">
      {updateOnly.length > 0 && (
        <>
          <h3 className={styles.heading}>Updates available</h3>
          <ul className={styles.list}>{updateOnly.map(renderPart)}</ul>
        </>
      )}
      {trimmed !== '' && (
        <>
          <h3 className={styles.heading}>
            Online parts library{remote.offline ? ' (saved copy)' : ''}
          </h3>
          {matches.length > 0
            ? <ul className={styles.list}>{matches.map(renderPart)}</ul>
            : <p className={styles.note}>No online parts match “{trimmed}”.</p>}
          {total > matches.length && (
            <p className={styles.note}>Showing {matches.length} of {total}. Narrow the search to see the rest.</p>
          )}
        </>
      )}
    </section>
  )
}
