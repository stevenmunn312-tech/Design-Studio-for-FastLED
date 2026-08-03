const DEFAULT_COMMUNITY_SITE = 'https://design-studio-for-fastled.design-studio-for-fastled.workers.dev'

/**
 * A single, hardware-agnostic pattern: a name plus a subgraph (nodes/edges).
 * No MatrixOutput, pins, or chipset — the same shape whether it came from a
 * saved Pattern Library entry or the active project's whole graph.
 */
export interface CommunitySharePattern {
  name: string
  fileName: string
  patternJson: string
  controller: string
  ledCount: number
  /** A short looping capture of the pattern, so the community gallery can
   *  show a real animation without evaluating the graph in every visitor's
   *  browser. Omitted when capture wasn't possible — the site falls back to
   *  live evaluation for that pattern. */
  previewMedia?: Blob
}

function communitySiteUrl(): URL {
  const configured = (import.meta.env as Record<string, string | undefined>).VITE_COMMUNITY_SITE_URL?.trim()
  return new URL(configured || DEFAULT_COMMUNITY_SITE)
}

function hiddenField(form: HTMLFormElement, name: string, value: string) {
  const field = document.createElement('textarea')
  field.name = name
  field.value = value
  field.hidden = true
  form.appendChild(field)
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

const RESERVED_FILENAME_CHARS = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*'])

export function suggestPatternFileName(name: string): string {
  const safe = Array.from(name.trim().slice(0, 80))
    .map((char) => (RESERVED_FILENAME_CHARS.has(char) || char.codePointAt(0)! < 0x20 ? '-' : char))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
  return `${safe || 'Untitled Pattern'}.fastled-pattern.json`
}

/**
 * Opens a blank, named tab for the community handoff. Must be called
 * synchronously from the click handler — a browser only allows window.open
 * without a popup block inside a direct user-gesture call stack. Any slow
 * work (like capturing a preview clip) has to happen after this, then post
 * into the tab by name via postToCommunityTab — navigating an already-open
 * window is not itself subject to the popup blocker.
 */
export function openCommunityTab(): { target: string; opened: boolean } {
  const target = `design-studio-community-${Date.now()}`
  const popup = window.open('', target)
  return { target, opened: Boolean(popup) }
}

/**
 * Posts a pattern into the tab opened by openCommunityTab. A form navigation
 * is used because Design Studio's cross-origin isolation intentionally
 * severs normal opener messaging. The community endpoint validates the
 * pattern and places it only in that tab's session storage before showing
 * confirmation.
 */
export async function postToCommunityTab(target: string, pattern: CommunitySharePattern): Promise<void> {
  const destination = communitySiteUrl()
  destination.pathname = '/upload/handoff'
  destination.search = ''

  const form = document.createElement('form')
  form.method = 'POST'
  form.action = destination.toString()
  form.target = target
  form.hidden = true
  hiddenField(form, 'patternName', pattern.name)
  hiddenField(form, 'fileName', pattern.fileName)
  hiddenField(form, 'patternJson', pattern.patternJson)
  hiddenField(form, 'controller', pattern.controller)
  hiddenField(form, 'ledCount', String(pattern.ledCount))
  if (pattern.previewMedia) {
    hiddenField(form, 'previewMediaBase64', await blobToBase64(pattern.previewMedia))
    hiddenField(form, 'previewMediaType', pattern.previewMedia.type)
  }
  document.body.appendChild(form)
  form.submit()
  form.remove()
}
