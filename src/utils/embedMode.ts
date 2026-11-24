// Embed mode: the Studio as a live demo inside an <iframe> on someone else's
// page, opened with `?iframe=true`, and `&starter=<starter id>` to choose what
// it opens on. The session opens on a starter, keeps everything in memory and
// never contacts the upload helper. See docs/design/embed-mode.md.

/** The query parameter that turns embed mode on, when it is `true`.
 *  `index.html` reads the same name before any module loads, to swap
 *  `localStorage` for memory; `embedMode.test.ts` keeps the two in step. */
export const EMBED_PARAM = 'iframe'

/** The query parameter naming the starter an embedded demo opens on. */
export const EMBED_STARTER_PARAM = 'starter'

/** The starter an embed link asks for: '' when it names none, null when the
 *  page is not embedded at all. */
export function embedRequest(search: string): string | null {
  const params = new URLSearchParams(search)
  if (params.get(EMBED_PARAM) !== 'true') return null
  return params.get(EMBED_STARTER_PARAM) ?? ''
}

export const EMBED_REQUEST = typeof window === 'undefined' ? null : embedRequest(window.location.search)

export const EMBEDDED = EMBED_REQUEST !== null
