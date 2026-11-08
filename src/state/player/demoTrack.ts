// The demo track bundled with the app, so a Music Player opens with something
// to play and its audio-reactive patterns answer straight away instead of
// waiting for the user to find a song.
//
// "Ethereal Pulse" was generated with ACE-Step v1.5 (acestep-v15-xl-turbo) on
// acemusic.ai. Its terms let ACE-Step v1.5 output be used commercially on any
// plan, with no attribution required; the ACE-Step project asks that AI
// involvement be disclosed, which the credit below does. The file is served
// from `public/demo-music/` as a tag-free MP3 — no ID3 header for the board's
// decoder to time out on.

export const DEMO_TRACK_FILE = 'Ethereal Pulse.mp3'

export const DEMO_TRACK_CREDIT = 'Ethereal Pulse · generated with ACE-Step v1.5'

/** The demo track's bytes, for writing to a Music Player's SD card. */
export async function fetchDemoTrack(): Promise<Blob> {
  const response = await fetch(demoTrackUrl())
  if (!response.ok) throw new Error(`The demo track could not be loaded (HTTP ${response.status}).`)
  return response.blob()
}

/** Same-origin URL of the bundled demo track, honouring Vite's base path. */
export function demoTrackUrl(base: string = import.meta.env.BASE_URL): string {
  const root = base.endsWith('/') ? base : `${base}/`
  return `${root}demo-music/${encodeURIComponent(DEMO_TRACK_FILE)}`
}
