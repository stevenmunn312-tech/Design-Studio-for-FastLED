import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import type { StudioNode, StudioEdge, WorkspaceExtras } from '../state/graphStore'

const HASH_KEY = 'share'

type WorkspacePayload = { nodes: StudioNode[]; edges: StudioEdge[] } & WorkspaceExtras

export function buildShareUrl(workspace: WorkspacePayload): string {
  const compressed = compressToEncodedURIComponent(JSON.stringify(workspace))
  const url = new URL(window.location.href)
  url.hash = `${HASH_KEY}=${compressed}`
  return url.toString()
}

export function readSharedWorkspace(): WorkspacePayload | null {
  const hash = window.location.hash.replace(/^#/, '')
  if (!hash.startsWith(`${HASH_KEY}=`)) return null
  const compressed = hash.slice(HASH_KEY.length + 1)
  try {
    const json = decompressFromEncodedURIComponent(compressed)
    if (!json) return null
    return JSON.parse(json) as WorkspacePayload
  } catch {
    return null
  }
}

export function clearShareHash() {
  history.replaceState(null, '', window.location.pathname + window.location.search)
}
