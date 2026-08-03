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
}

export interface CommunityUploadResult {
  opened: boolean
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
 * Posts a pattern into a new community-site tab. A form navigation is
 * used because Design Studio's cross-origin isolation intentionally severs
 * normal opener messaging. The community endpoint validates the pattern and
 * places it only in that tab's session storage before showing confirmation.
 */
export function openCommunityUpload(pattern: CommunitySharePattern): CommunityUploadResult {
  const destination = communitySiteUrl()
  destination.pathname = '/upload/handoff'
  destination.search = ''
  const target = `design-studio-community-${Date.now()}`
  const popup = window.open('', target)
  if (!popup) return { opened: false }

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
  document.body.appendChild(form)
  form.submit()
  form.remove()
  return { opened: true }
}
