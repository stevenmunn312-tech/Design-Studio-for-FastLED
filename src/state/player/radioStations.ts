// The Internet Radio side of a Music Player: a list of stations, each a name
// and a stream URL, that the board plays over Wi-Fi with the same decoder,
// amplifier and analysis as a card's MP3s.
//
// Station URLs are user text (typed, pasted, or picked from a directory the
// app does not control) that ends up in a C++ string literal and in an HTTP
// request the board makes. They are checked here once, for the node body,
// validation and the generator alike. The firmware checks a station that
// arrives later (from the card's stations.m3u or the phone page) against the
// same rules: see `RADIO_URL_RULES_CPP` in codegen/player/internetRadioCpp.ts.

export interface RadioStation {
  name: string
  url: string
}

/** Stations compiled into one sketch. Each costs flash, not RAM. */
export const RADIO_STATIONS_MAX = 50

/** A station name is a display row: long names only get cut there. */
export const RADIO_STATION_NAME_MAX = 40

/**
 * ESP32-audioI2S refuses an address of 502 bytes or more; real stream URLs
 * are far shorter, and the firmware keeps every station in RAM.
 */
export const RADIO_URL_MAX = 255

/**
 * Printable ASCII without the characters a URL never needs raw and C, JSON
 * or HTML would have to escape. A URL with anything else is percent-encoded
 * by the browser or the directory before it gets here.
 */
const RADIO_URL_CHARS = /^[A-Za-z0-9\-._~:/?[\]@!$&'()*+,;=%]+$/

/** Why this stream URL cannot be played, or null when it can. */
export function radioStationUrlProblem(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return 'The stream URL is empty.'
  if (text.length > RADIO_URL_MAX) return `The stream URL is longer than ${RADIO_URL_MAX} characters.`
  if (!/^https?:\/\//i.test(text)) return 'The stream URL must start with http:// or https://.'
  if (!RADIO_URL_CHARS.test(text)) return 'The stream URL holds a space or a character a stream address cannot use.'
  let parsed: URL
  try {
    parsed = new URL(text)
  } catch {
    return 'The stream URL is not a valid address.'
  }
  if (!parsed.hostname) return 'The stream URL has no host name.'
  // The player's own address parser reads the host up to the first colon,
  // so a bracketed IPv6 address or a user name would be sent somewhere else.
  if (parsed.hostname.startsWith('[')) return 'The board cannot reach an IPv6 address; use the station’s host name.'
  if (parsed.username || parsed.password) return 'The stream URL may not carry a user name or password.'
  if (text.includes('#')) return 'The stream URL may not carry a # fragment.'
  return null
}

/** Why this station name cannot be shown, or null when it can. */
export function radioStationNameProblem(value: unknown): string | null {
  const name = typeof value === 'string' ? value.trim() : ''
  if (!name) return 'The station name is empty.'
  if ([...name].length > RADIO_STATION_NAME_MAX) return `The station name is longer than ${RADIO_STATION_NAME_MAX} characters.`
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(name)) return 'The station name holds a control character.'
  return null
}

/**
 * A name from outside (a directory listing, a pasted URL): control
 * characters and runs of white space become one space, and it is cut to fit.
 * Falls back to the stream's host so a station is never nameless.
 */
export function cleanRadioStationName(value: unknown, url = ''): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = [...String(value ?? '').replace(/[\u0000-\u001f\u007f\s]+/g, ' ').trim()]
    .slice(0, RADIO_STATION_NAME_MAX).join('').trim()
  if (cleaned) return cleaned
  try {
    return new URL(url).hostname.slice(0, RADIO_STATION_NAME_MAX) || 'Station'
  } catch {
    return 'Station'
  }
}

/**
 * The stations a node holds, as the generator and body read them: valid
 * entries only, duplicates of a URL dropped, at most `RADIO_STATIONS_MAX`.
 * The body never stores an invalid one; this keeps a hand-edited save from
 * putting one into C++.
 */
export function normalizeRadioStations(value: unknown): RadioStation[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: RadioStation[] = []
  for (const entry of value) {
    if (out.length >= RADIO_STATIONS_MAX) break
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    const url = typeof record.url === 'string' ? record.url.trim() : ''
    if (radioStationUrlProblem(url) !== null || seen.has(url)) continue
    seen.add(url)
    out.push({ name: cleanRadioStationName(record.name, url), url })
  }
  return out
}

/** The stored list's invalid entries, for validation to name. */
export function invalidRadioStations(value: unknown): { index: number; problem: string }[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry, index) => {
    const record = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {}
    const problem = radioStationUrlProblem(record.url) ?? radioStationNameProblem(record.name)
    return problem ? [{ index, problem }] : []
  })
}

/** The playlist file the board reads from its card at start-up. */
export const RADIO_CARD_PLAYLIST = '/stations.m3u'

/**
 * The stations as an extended M3U playlist, the format the board reads from
 * its card and VLC and most players write.
 */
export function radioStationsM3u(stations: readonly RadioStation[]): string {
  return ['#EXTM3U', ...stations.flatMap((station) => [`#EXTINF:-1,${station.name}`, station.url]), ''].join('\n')
}

/**
 * Stations from an M3U playlist or a plain list of URLs: `#EXTINF:-1,Name` names the
 * URL on the next line, other `#` lines are ignored, and each URL is held to
 * the same rules as one typed in. The board's reader follows the same rules.
 */
export function parseRadioPlaylist(text: string): RadioStation[] {
  const stations: RadioStation[] = []
  let pendingName = ''
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('#')) {
      if (/^#EXTINF:/i.test(line)) {
        const comma = line.indexOf(',')
        pendingName = comma >= 0 ? line.slice(comma + 1) : ''
      }
      continue
    }
    if (radioStationUrlProblem(line) === null) stations.push({ name: cleanRadioStationName(pendingName, line), url: line })
    pendingName = ''
  }
  return normalizeRadioStations(stations)
}

/** The phone station page's access code: what lets a phone add or remove stations. */
export const RADIO_ACCESS_CODE_MIN = 6
export const RADIO_ACCESS_CODE_MAX = 32

/** Why this access code cannot be used, or null when it can (empty means none). */
export function radioAccessCodeProblem(value: unknown): string | null {
  const code = typeof value === 'string' ? value : ''
  if (!code) return null
  if (code.length < RADIO_ACCESS_CODE_MIN) return `The access code is shorter than ${RADIO_ACCESS_CODE_MIN} characters.`
  if (code.length > RADIO_ACCESS_CODE_MAX) return `The access code is longer than ${RADIO_ACCESS_CODE_MAX} characters.`
  if (!/^[\x21-\x7e]+$/.test(code)) return 'The access code may hold only printable characters without spaces.'
  return null
}

/** The phone station page listens on 80 unless a Web Remote already does. */
export function radioStationPagePort(hasWebRemote: boolean): number {
  return hasWebRemote ? 8080 : 80
}
