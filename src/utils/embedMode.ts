// Embed mode: the Studio as a live demo inside an <iframe> on someone else's
// page, opened with `?embed` or `?embed=<starter id>`. The session opens on a
// starter, keeps everything in memory and never contacts the upload helper.
// See docs/design/embed-mode.md.

/** The query parameter. `index.html` reads the same name before any module
 *  loads, to swap `localStorage` for memory; `embedMode.test.ts` keeps the two
 *  in step. */
export const EMBED_PARAM = 'embed'

/** The starter an embed link asks for: '' when it names none, null when the
 *  page is not embedded at all. */
export function embedRequest(search: string): string | null {
  return new URLSearchParams(search).get(EMBED_PARAM)
}

export const EMBED_REQUEST = typeof window === 'undefined' ? null : embedRequest(window.location.search)

export const EMBEDDED = EMBED_REQUEST !== null
