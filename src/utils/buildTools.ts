// What the Upload tab calls the local helper (`backend/`): the build tools.
//
// "Helper" is its name in the code and on the command line; to someone
// flashing a board it is the thing that compiles and uploads, so every piece
// of user copy says "build tools", as the First project guide does. This is
// also the one place that says how to start them, because the answer differs
// by how Studio was opened: the portable desktop build starts them itself,
// while a source checkout starts them from the terminal.

import { BACKEND_URL } from './backendClient'

/**
 * True when this page is served by the build tools themselves, which is how
 * the portable desktop build runs: the launcher serves the static site from
 * the same process as the helper. A Vite dev or preview server has its own
 * origin.
 */
export function servedByBuildTools(pageUrl = typeof window === 'undefined' ? undefined : window.location.href): boolean {
  if (!pageUrl) return false
  try {
    return loopbackOrigin(new URL(pageUrl)) === loopbackOrigin(new URL(BACKEND_URL))
  } catch {
    return false
  }
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/** An origin with every loopback name read as one, since the launcher's
 *  `localhost:8008` is the same process when opened as `127.0.0.1:8008`. */
function loopbackOrigin(url: URL): string {
  const host = LOOPBACK_HOSTS.has(url.hostname) ? 'loopback' : url.hostname
  return `${url.protocol}//${host}:${url.port}`
}

/** The "not running" sentence, with the way to start them for this setup. */
export function buildToolsOfflineHint(bundled = servedByBuildTools()): string {
  return bundled
    ? 'Build tools are not running. The desktop build starts them with Studio: close Studio and open it again from its launcher, then press Retry.'
    : 'Build tools are not running. In a source checkout, run npm run helper in a second terminal (npm run dev starts them too), then press Retry.'
}
