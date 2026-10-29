// What the player knows about the track it is playing, on the device.
//
// The whole reason this exists in firmware rather than being handed down from
// the app: a finished build gets a card of files that have never been near the
// browser. Whatever those files carry in their tags is the only thing anyone
// can put on the display, and only the player is in a position to read it.
//
// ESP32-audioI2S reports tags through a weak `audio_id3data` callback, one
// "Field: value" line at a time, and the bitrate through `audio_bitrate`. Both
// arrive some time after playback starts and neither is guaranteed — a file
// with no tags simply never calls back, which is why every field starts empty
// and a missing one stays that way rather than showing a stale value from the
// previous track.

import { SONG_TAG_FIELDS } from '../../state/player/songInfo'
import type { MusicPlayerSource } from '../../state/upload/buildMode'

/** Bytes each tag field is stored in. A display row holds far less than this. */
export const SONG_FIELD_BYTES = 64

/**
 * Globals, tag callbacks and the small accessors a display reads.
 *
 * `songReset()` is called when a track opens. Without it a file with no artist
 * tag would show the *previous* track's artist, which is the most convincing
 * kind of wrong: everything on the panel looks right except the one line
 * nobody thinks to doubt.
 */
const SONG_INFO_INTRO = {
  'SD Card': `// ── Song information ────────────────────────────────────────────────────────
// Scraped from the file's own tags. A card the app has never seen is the normal
// case, so whatever the file carries is what the display can show.
`,
  // AVRCP sends the phone's own track details; a phone that sends none leaves
  // every field blank, which reads as no track rather than a stale one.
  Bluetooth: `// ── Song information ────────────────────────────────────────────────────────
// What the phone reports over AVRCP for the track it is streaming.
`,
  // The station's own stream title fills Title and Artist; the station name
  // is the Album (internetRadioCpp.ts).
  'Internet Radio': `// ── Song information ────────────────────────────────────────────────────────
// The station's name, and the title its stream sends for what is on air.
`,
} as const

const SONG_INFO_FIELDS_CPP = `#define SONG_FIELD_BYTES ${SONG_FIELD_BYTES}

static char songTitle[SONG_FIELD_BYTES]  = "";
static char songArtist[SONG_FIELD_BYTES] = "";
static char songAlbum[SONG_FIELD_BYTES]  = "";
static char songGenre[SONG_FIELD_BYTES]  = "";
static char songYear[SONG_FIELD_BYTES]   = "";
static uint32_t songBitrateKbps = 0;

static void _songSet(char *dst, const char *value) {
  size_t n = 0;
  while (value[n] != 0 && n < (size_t)(SONG_FIELD_BYTES - 1)) n++;
  memcpy(dst, value, n);
  dst[n] = 0;
}

// Cleared when a track opens: a file with no artist tag never calls back, and
// without this it would wear the previous track's artist — the most convincing
// kind of wrong, because every other line on the panel is right.
static void songReset(const char *fallbackTitle) {
  songTitle[0] = 0; songArtist[0] = 0; songAlbum[0] = 0;
  songGenre[0] = 0; songYear[0] = 0;
  songBitrateKbps = 0;
  if (fallbackTitle && fallbackTitle[0]) _songSet(songTitle, fallbackTitle);
}

`

/** Tag and bitrate callbacks from ESP32-audioI2S, and the filename fallback. */
const SONG_INFO_FILE_TAGS_CPP = `// "Title: x", "Artist: x", ... one line per call, arriving after playback
// starts rather than at open.
void audio_id3data(const char *info) {
  const char *sep = strchr(info, ':');
  if (!sep) return;
  size_t keyLen = (size_t)(sep - info);
  const char *value = sep + 1;
  while (*value == ' ') value++;
  if (!strncasecmp(info, "Title", keyLen) && keyLen == 5)        _songSet(songTitle, value);
  else if (!strncasecmp(info, "Artist", keyLen) && keyLen == 6)  _songSet(songArtist, value);
  else if (!strncasecmp(info, "Album", keyLen) && keyLen == 5)   _songSet(songAlbum, value);
  // ID3v2 names the genre frame TCON, which the library reports as
  // "ContentType"; only the older ID3v1 path says "Genre". Matching just the
  // latter left the field blank on virtually every modern file — verified
  // against ESP32-audioI2S 3.0.12, which emits both spellings.
  else if (!strncasecmp(info, "Genre", keyLen) && keyLen == 5)   _songSet(songGenre, value);
  else if (!strncasecmp(info, "ContentType", keyLen) && keyLen == 11) _songSet(songGenre, value);
  else if (!strncasecmp(info, "Year", keyLen) && keyLen == 4)    _songSet(songYear, value);
}

void audio_bitrate(const char *info) {
  // Reported in bits per second; a display has room for kbps.
  songBitrateKbps = (uint32_t)(atol(info) / 1000);
}

// A file with no tags still has a name, and a name on the panel beats a blank
// row. Called at open, before any tag callback has had a chance to fire.
static void songResetFromFile(const char *fileName) {
  char base[SONG_FIELD_BYTES];
  size_t n = 0;
  while (fileName[n] != 0 && n < (size_t)(SONG_FIELD_BYTES - 1)) { base[n] = fileName[n]; n++; }
  base[n] = 0;
  char *dot = strrchr(base, '.');
  if (dot) *dot = 0;
  songReset(base);
}

`

/** A stream reports its bitrate the way a file does. */
const SONG_INFO_STREAM_BITRATE_CPP = `void audio_bitrate(const char *info) {
  songBitrateKbps = (uint32_t)(atol(info) / 1000);
}

`

const SONG_INFO_ACCESSORS_CPP = `static float songElapsedSec() { return (float)audio.getAudioCurrentTime(); }
static float songDurationSec() { return (float)audio.getAudioFileDuration(); }

static float songRemainingSec() {
  float d = songDurationSec(), e = songElapsedSec();
  return d > e ? d - e : 0.0f;
}

static float songProgress() {
  float d = songDurationSec();
  if (d <= 0.0f) return 0.0f;
  float p = songElapsedSec() / d;
  return p < 0.0f ? 0.0f : (p > 1.0f ? 1.0f : p);
}

static bool songPlaying() { return audio.isRunning(); }

static const char *songStatus() {
  if (songPlaying()) return "PLAYING";
  if (!songTitle[0]) return "STOPPED";
  // A track that never produced a sample was not paused by anyone — it failed
  // to start. Reporting PAUSED there sends people hunting for a stuck button
  // when the decoder gave up on the file.
  return songElapsedSec() > 0.0f ? "PAUSED" : "STOPPED";
}
`

/**
 * The song block for the player's music source. The SD player fills the
 * fields from the file's tags; the Bluetooth player from what the phone
 * reports, copied in by songPoll() (bluetoothSinkCpp.ts).
 */
export function playerSongInfoCpp(source: MusicPlayerSource = 'SD Card'): string {
  return SONG_INFO_INTRO[source] + SONG_INFO_FIELDS_CPP
    + (source === 'SD Card' ? SONG_INFO_FILE_TAGS_CPP : source === 'Internet Radio' ? SONG_INFO_STREAM_BITRATE_CPP : '')
    + SONG_INFO_ACCESSORS_CPP
}

export const PLAYER_SONG_INFO_CPP = playerSongInfoCpp()

/**
 * The player-side expression behind each Music Player output port.
 *
 * Keyed by the port id the graph offers, so a display wired to Music Player's
 * `artist` reads the artist the file declared. A port with no entry cannot be
 * resolved in this sketch and the caller says so rather than emitting
 * something that looks right.
 */
export const PLAYER_SONG_EXPRESSIONS: Record<string, string> = {
  title: 'songTitle',
  artist: 'songArtist',
  album: 'songAlbum',
  genre: 'songGenre',
  year: 'songYear',
  status: 'songStatus()',
  playing: 'songPlaying()',
  elapsed: 'songElapsedSec()',
  duration: 'songDurationSec()',
  remaining: 'songRemainingSec()',
  progress: 'songProgress()',
  // On the scale applyPlayerVolume() sets, so a panel that reads it back and
  // sends it on (a slider across a board link) holds still instead of
  // shrinking it a step each round trip.
  volume: '(PLAYER_MAX_VOLUME ? audio.getVolume() / (float)PLAYER_MAX_VOLUME : 0.0f)',
  bitrate: '((float)songBitrateKbps)',
}

/** Tag fields, for a generator that wants to name what only the device reads. */
export const PLAYER_TAG_EXPRESSIONS = SONG_TAG_FIELDS.map((field) => PLAYER_SONG_EXPRESSIONS[field])
