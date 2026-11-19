import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import type { StudioNode, StudioEdge, WorkspaceExtras } from '../state/graphStore'
import type { SavedParts } from '../build/parts/savedParts'
import { isWorkspacePayload, sanitizeWorkspacePayload } from './workspacePayload'

const HASH_KEY = 'share'

/** Browsers and chat apps start dropping links around here. The builder still
 *  returns the full URL; copying one longer than this warns. */
export const SHARE_URL_WARN_BYTES = 30 * 1024

type WorkspacePayload = { nodes: StudioNode[]; edges: StudioEdge[] } & WorkspaceExtras

export interface SharedWorkspaceRead {
  workspace: WorkspacePayload
  /** Nodes and edges left out because they had no loadable shape. */
  dropped: number
}

function urlFor(workspace: WorkspacePayload): string {
  const compressed = compressToEncodedURIComponent(JSON.stringify(workspace))
  const url = new URL(window.location.href)
  url.hash = `${HASH_KEY}=${compressed}`
  return url.toString()
}

/**
 * The link for a workspace. Downloaded parts travel as their signed envelopes
 * so the link opens offline and in an app with no parts host. A signed package
 * adds roughly 1 to 4 KB per part to the compressed link; when those envelopes
 * would push it past `SHARE_URL_WARN_BYTES`, the link carries only each part's
 * id and revision instead, and the receiving app fetches them from the signed
 * index (`PartsLibrary.resolveReferenced`), telling the user about any it
 * cannot find. Part ids and revisions are public, so the short form leaks nothing.
 */
export function buildShareUrl(workspace: WorkspacePayload): string {
  const full = urlFor(workspace)
  const parts = workspace.parts
  if (full.length <= SHARE_URL_WARN_BYTES || !parts) return full
  if (!Object.values(parts).some((entry) => entry.envelope)) return full
  const refs: SavedParts = {}
  for (const [id, entry] of Object.entries(parts)) refs[id] = { revision: entry.revision }
  return urlFor({ ...workspace, parts: refs })
}

/** Null while the link is within the size most apps will carry. */
export function shareUrlSizeWarning(url: string): string | null {
  if (url.length <= SHARE_URL_WARN_BYTES) return null
  const kb = Math.ceil(url.length / 1024)
  return `This share link is ${kb} KB. Links past about 30 KB get cut off by browsers and chat apps. Use Save Project File for a project this size.`
}

export function readSharedWorkspace(): SharedWorkspaceRead | null {
  const hash = window.location.hash.replace(/^#/, '')
  if (!hash.startsWith(`${HASH_KEY}=`)) return null
  const compressed = hash.slice(HASH_KEY.length + 1)
  try {
    const json = decompressFromEncodedURIComponent(compressed)
    if (!json) return null
    const parsed: unknown = JSON.parse(json)
    if (!isWorkspacePayload(parsed)) return null
    const sanitized = sanitizeWorkspacePayload(parsed)
    if (!sanitized) return null
    return { workspace: sanitized.workspace, dropped: sanitized.dropped }
  } catch {
    return null
  }
}

export function clearShareHash() {
  history.replaceState(null, '', window.location.pathname + window.location.search)
}
