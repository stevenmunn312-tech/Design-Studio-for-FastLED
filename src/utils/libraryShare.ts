// The two transports a library bundle has besides the OS file drop: a
// downloaded `.fastled-*.json` file and a `#library=` link on the clipboard.
// Status wording is the caller's; this only moves bytes and says what happened.
import {
  buildLibraryLink,
  exportLibraryBundle,
  libraryLinkSizeWarning,
  type LibraryBundle,
  type LibraryBundleParts,
} from '../state/library/libraryBundle'

const RESERVED_FILENAME_CHARS = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*'])

export type LibraryFileKind = 'pattern' | 'palette' | 'collection' | 'library'

/** `<name>.fastled-<kind>.json`, with characters a file system refuses replaced. */
export function libraryFileName(name: string, kind: LibraryFileKind): string {
  const safe = Array.from(name.trim().slice(0, 80))
    .map((char) => (RESERVED_FILENAME_CHARS.has(char) || char.codePointAt(0)! < 0x20 ? '-' : char))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
  return `${safe || `Untitled ${kind}`}.fastled-${kind}.json`
}

/** Save the bundle through the browser's download path. A data URL rather
 *  than a blob URL so nothing has to be revoked and the call works wherever
 *  an anchor click does. */
export function downloadLibraryFile(parts: LibraryBundleParts, fileName: string): void {
  const anchor = document.createElement('a')
  anchor.href = `data:application/json;charset=utf-8,${encodeURIComponent(exportLibraryBundle(parts))}`
  anchor.download = fileName
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

export interface CopiedLibraryLink {
  url: string
  /** Set when the link is past the size chat apps and browsers carry intact. */
  warning: string | null
  /** False when the clipboard refused; the caller shows the URL instead. */
  copied: boolean
}

export async function copyLibraryLink(bundle: LibraryBundle): Promise<CopiedLibraryLink> {
  const url = buildLibraryLink(bundle)
  const warning = libraryLinkSizeWarning(url)
  try {
    await navigator.clipboard.writeText(url)
    return { url, warning, copied: true }
  } catch {
    return { url, warning, copied: false }
  }
}
