// The preview's side of Internet Radio: a Music Player whose Music Source is
// Internet Radio plays its stations in the preview instead of local tracks.
//
// Stations play through the helper's relay (backend/radio.py), not straight
// from their servers: the preview analyses what it plays through Web Audio,
// which can read only audio shared across origins, and most station servers
// do not share it. The relay also reports each station's `StreamTitle`.
// Without the helper the stations cannot play here; the board does not care.

import { BACKEND_URL } from '../../utils/backendClient'
import type { RadioStation } from './radioStations'

/** As on the board (RADIO_START_TIMEOUT_MS): a station has this long to start. */
export const RADIO_PREVIEW_START_TIMEOUT_MS = 12000

/** How often the preview asks the relay what is on air. */
export const RADIO_PREVIEW_TITLE_POLL_MS = 4000

export interface RadioPreviewTrack {
  id: string
  name: string
  /** The relay's address for this station, what the `<audio>` element plays. */
  url: string
  /** The station's own stream address, what the relay and its titles are keyed by. */
  stationUrl: string
}

export function radioRelayUrl(stationUrl: string, base = BACKEND_URL): string {
  return `${base}/api/radio/stream?url=${encodeURIComponent(stationUrl)}`
}

/** The stations as the preview's playlist, in the node's order. */
export function radioPreviewTracks(stations: readonly RadioStation[], base = BACKEND_URL): RadioPreviewTrack[] {
  return stations.map((station) => ({
    id: `radio:${station.url}`,
    name: station.name,
    url: radioRelayUrl(station.url, base),
    stationUrl: station.url,
  }))
}

/**
 * "Artist - Title", the convention stations follow, split as the board splits
 * it (`audio_showstreamtitle`); a title with no separator is all title.
 */
export function splitStreamTitle(streamTitle: string): { title: string; artist?: string } {
  const at = streamTitle.indexOf(' - ')
  if (at < 0) return { title: streamTitle }
  return { artist: streamTitle.slice(0, at), title: streamTitle.slice(at + 3) }
}

/** What the station last said is on air, or '' when it said nothing or the helper is away. */
export async function fetchRadioTitle(stationUrl: string, signal?: AbortSignal): Promise<string> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/radio/now?url=${encodeURIComponent(stationUrl)}`, { signal })
    const data = await response.json() as { title?: unknown }
    return typeof data.title === 'string' ? data.title : ''
  } catch {
    return ''
  }
}
