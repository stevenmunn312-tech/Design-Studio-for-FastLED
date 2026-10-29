// Station search for the Music Player's Internet Radio list, from the
// radio-browser.info directory: a free, open, community-run index of about
// 50,000 stations with no key and CORS open to browsers.
//
// The directory is outside the app's control, so every field it returns is
// untrusted: a result reaches the station list only through the same URL and
// name rules a typed station meets (radioStations.ts), and nothing it returns
// is rendered as markup. Searches run only when the user presses Search.

import { cleanRadioStationName, radioStationUrlProblem, type RadioStation } from './radioStations'

/** DNS round robin over the directory's mirrors, as its documentation asks. */
export const RADIO_BROWSER_API = 'https://all.api.radio-browser.info'

/** Results per search: enough to choose from, small enough to read. */
export const RADIO_BROWSER_LIMIT = 30

/**
 * Codecs ESP32-audioI2S decodes from a stream. HLS playlists are left out:
 * the library's support for them is partial and they are the usual cause
 * of a station that connects and never plays.
 */
const PLAYABLE_CODECS = new Set(['MP3', 'AAC', 'AAC+', 'OGG', 'FLAC', 'OPUS'])

export interface RadioBrowserResult extends RadioStation {
  codec: string
  bitrateKbps: number
  country: string
  tags: string
}

function text(value: unknown, max: number): string {
  // eslint-disable-next-line no-control-regex
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max)
}

/** One directory entry as a station, or null when the board could not play it. */
export function radioBrowserResult(entry: unknown): RadioBrowserResult | null {
  if (!entry || typeof entry !== 'object') return null
  const record = entry as Record<string, unknown>
  if (Number(record.hls) === 1 || Number(record.lastcheckok) === 0) return null
  const codec = text(record.codec, 12).toUpperCase()
  if (!PLAYABLE_CODECS.has(codec)) return null
  // `url_resolved` is the stream itself; `url` may be a playlist the
  // directory has already followed.
  const url = text(record.url_resolved, 300) || text(record.url, 300)
  if (radioStationUrlProblem(url) !== null) return null
  const bitrate = Math.round(Number(record.bitrate))
  return {
    name: cleanRadioStationName(record.name, url),
    url,
    codec,
    bitrateKbps: Number.isFinite(bitrate) && bitrate > 0 ? bitrate : 0,
    country: text(record.countrycode, 4).toUpperCase(),
    tags: text(record.tags, 80),
  }
}

/** The search request: by name, most-listened first, broken stations hidden. */
export function radioBrowserSearchUrl(query: string, base = RADIO_BROWSER_API): string {
  const params = new URLSearchParams({
    name: query.trim().slice(0, 80),
    hidebroken: 'true',
    order: 'clickcount',
    reverse: 'true',
    limit: String(RADIO_BROWSER_LIMIT * 2),
  })
  return `${base}/json/stations/search?${params.toString()}`
}

/** Stations matching `query`, playable ones only, without duplicate streams. */
export async function searchRadioBrowser(
  query: string,
  init: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<RadioBrowserResult[]> {
  if (!query.trim()) return []
  const response = await (init.fetchImpl ?? fetch)(radioBrowserSearchUrl(query), {
    signal: init.signal,
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`radio-browser.info answered ${response.status}`)
  const body: unknown = await response.json()
  if (!Array.isArray(body)) throw new Error('radio-browser.info sent an unexpected answer')
  const seen = new Set<string>()
  const results: RadioBrowserResult[] = []
  for (const entry of body) {
    const result = radioBrowserResult(entry)
    if (!result || seen.has(result.url)) continue
    seen.add(result.url)
    results.push(result)
    if (results.length >= RADIO_BROWSER_LIMIT) break
  }
  return results
}
