// What the Music Player knows about the track it is playing.
//
// The player is the thing holding the music, so it is the thing that reports
// what the music is. That matters most in the case the app cannot see at all:
// a card full of files that have never been near the browser, slotted into a
// finished build. The player reads whatever tags the files carry and puts them
// on the display.
//
// Which means the browser genuinely does not know most of this, and should not
// pretend to. An unread field is empty rather than invented — the same choice
// the clock makes when it shows dashes instead of midnight. This is not a
// preview/firmware disagreement about one value; it is a value that only exists
// where the music does.

/** Playback state as a word, for a display that has a row to spare. */
export const SONG_STATUSES = ['STOPPED', 'PLAYING', 'PAUSED'] as const
export type SongStatus = (typeof SONG_STATUSES)[number]

/**
 * A track's tags and position.
 *
 * Text fields are empty when the file carries no such tag, which on a typical
 * card is most of them. `bitrateKbps` is 0 when unknown.
 */
export interface SongInfo {
  title: string
  artist: string
  album: string
  genre: string
  year: string
  status: SongStatus
  playing: boolean
  elapsedSec: number
  durationSec: number
  remainingSec: number
  progress: number
  volume: number
  bitrateKbps: number
}

export function blankSongInfo(): SongInfo {
  return {
    title: '', artist: '', album: '', genre: '', year: '',
    status: 'STOPPED', playing: false,
    elapsedSec: 0, durationSec: 0, remainingSec: 0, progress: 0,
    volume: 0, bitrateKbps: 0,
  }
}

/**
 * The output ports the Music Player publishes, and the field each carries.
 *
 * One list, read by the node definition, the evaluator and the player
 * generator, so a port cannot exist in the library with nothing behind it or be
 * populated under a name the graph does not offer.
 */
export const SONG_INFO_PORTS = [
  { id: 'title', label: 'Title', dataType: 'string', field: 'title' },
  { id: 'artist', label: 'Artist', dataType: 'string', field: 'artist' },
  { id: 'album', label: 'Album', dataType: 'string', field: 'album' },
  { id: 'genre', label: 'Genre', dataType: 'string', field: 'genre' },
  { id: 'year', label: 'Year', dataType: 'string', field: 'year' },
  { id: 'status', label: 'Status', dataType: 'string', field: 'status' },
  { id: 'playing', label: 'Playing', dataType: 'bool', field: 'playing' },
  { id: 'elapsed', label: 'Elapsed', dataType: 'float', field: 'elapsedSec' },
  { id: 'duration', label: 'Duration', dataType: 'float', field: 'durationSec' },
  { id: 'remaining', label: 'Remaining', dataType: 'float', field: 'remainingSec' },
  { id: 'progress', label: 'Progress', dataType: 'float', field: 'progress' },
  { id: 'volume', label: 'Volume', dataType: 'float', field: 'volume' },
  { id: 'bitrate', label: 'Bitrate', dataType: 'float', field: 'bitrateKbps' },
] as const satisfies ReadonlyArray<{
  id: string
  label: string
  dataType: 'string' | 'bool' | 'float'
  field: keyof SongInfo
}>

/** The fields a file's own tags supply, which only the player can read. */
export const SONG_TAG_FIELDS = ['title', 'artist', 'album', 'genre', 'year'] as const

/** Port values for one `SongInfo`, keyed as the graph expects them. */
export function songInfoOutputs(info: SongInfo): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  for (const port of SONG_INFO_PORTS) out[port.id] = info[port.field]
  return out
}

/** The readings the browser can honestly supply. */
export interface SongInfoSources {
  /** Track name the library knows, which is a filename rather than a tag. */
  title?: string | null
  posMs?: number | null
  durationMs?: number | null
  playing?: boolean | null
  /** Whether a transport is loaded at all; without one the player is stopped. */
  loaded?: boolean | null
  volume?: number | null
}

function finite(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * Fold what the browser knows into the same shape the device reports.
 *
 * Tag fields stay empty on purpose. The browser has a filename and an analysis,
 * not an ID3 frame, and filling artist with a guess taken from the filename
 * would put a wrong name on a screen — which is worse than a blank row, because
 * a blank row is obviously blank.
 */
export function resolveSongInfo(sources: SongInfoSources): SongInfo {
  const durationSec = Math.max(0, finite(sources.durationMs) / 1000)
  const rawElapsed = Math.max(0, finite(sources.posMs) / 1000)
  const elapsedSec = durationSec > 0 ? Math.min(rawElapsed, durationSec) : rawElapsed
  const loaded = sources.loaded === true || Boolean(sources.title)
  const playing = sources.playing === true

  return {
    ...blankSongInfo(),
    title: String(sources.title ?? ''),
    status: !loaded ? 'STOPPED' : playing ? 'PLAYING' : 'PAUSED',
    playing,
    elapsedSec,
    durationSec,
    remainingSec: Math.max(0, durationSec - elapsedSec),
    progress: durationSec > 0 ? elapsedSec / durationSec : 0,
    volume: Math.max(0, Math.min(1, finite(sources.volume))),
  }
}
