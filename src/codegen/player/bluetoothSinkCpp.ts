// The Music Player's Bluetooth source, on the device.
//
// A phone pairs with the board as it would with any speaker and streams its
// music over A2DP. ESP32-A2DP receives and decodes the stream and writes the
// PCM to the I2S amplifier through arduino-audio-tools; AVRCP brings the
// phone's track details and takes play, pause and skip back to it.
//
// The rest of the player was written against ESP32-audioI2S's `Audio` object:
// the transport, the panels and the song accessors all call `audio.*`. So the
// Bluetooth link is given that object's shape, `BluetoothAudio`, and the player
// keeps one vocabulary whichever source plays. Only the calls the player makes
// exist on it.

import { cppStringLiteral } from '../cppLiterals'

export interface BluetoothSinkCpp {
  /** The name phones list, already validated (see state/player/bluetoothSink). */
  name: string
  /** The decoder tap is compiled: feed it the stream before volume is applied. */
  tap: boolean
  /** A panel shows the track: keep AVRCP metadata for songPoll(). */
  songInfo: boolean
  /** Player Controls or a touch panel can play and pause. Skips call the sink directly. */
  transport: boolean
}

/** Pinned with the backend's vendored copies (backend/toolchain.py). */
export const BLUETOOTH_A2DP_INCLUDE = '#include "BluetoothA2DPSink.h"'

/**
 * Both headers come before <FastLED.h>, like the SD player's Audio.h. The
 * audio-tools namespace stays closed in the sketch: opened, its names (a
 * Vector, a Stream) sit beside FastLED's in the global namespace.
 */
export const BLUETOOTH_INCLUDES_CPP = `#define USE_AUDIOTOOLS_NS false
#include "AudioTools.h"          // arduino-audio-tools: the I2S output
${BLUETOOTH_A2DP_INCLUDE}  // ESP32-A2DP: the phone's stream and AVRCP`

/** A2DP volume runs 0-127; the player's own volume steps run 0-21 like ESP32-audioI2S. */
const A2DP_VOLUME_MAX = 127

export function bluetoothSinkGlobalsCpp(sink: BluetoothSinkCpp): string {
  return `// ── Bluetooth audio ──────────────────────────────────────────────────────────
// The phone owns the music: it picks the track and the order, and the board
// plays what arrives. A2DP volume is 0-${A2DP_VOLUME_MAX}; the player's steps are
// 0-21 with PLAYER_MAX_VOLUME as the ceiling, the same scale the SD player uses,
// so a phone turned past the ceiling is brought back to it.
#define BT_DEVICE_NAME ${cppStringLiteral(sink.name)}
#define A2DP_VOLUME_MAX ${A2DP_VOLUME_MAX}
audio_tools::I2SStream _btI2s;
BluetoothA2DPSink _a2dp(_btI2s);
// The A2DP callbacks run in the Bluetooth task; the loop reads under this lock.
static portMUX_TYPE _btMux = portMUX_INITIALIZER_UNLOCKED;
static volatile bool _btTrackChanged = false;
${sink.tap ? 'void _btTap(const uint8_t *data, uint32_t length);  // defined beside the decoder tap\n' : ''}${sink.songInfo ? `#define BT_FIELD_BYTES 64
static char _btTitle[BT_FIELD_BYTES], _btArtist[BT_FIELD_BYTES], _btAlbum[BT_FIELD_BYTES], _btGenre[BT_FIELD_BYTES];
static uint32_t _btDurationMs = 0;
static bool _btMetaDirty = false;

static void _btCopy(char *dst, const uint8_t *text) {
  size_t n = 0;
  while (text[n] != 0 && n < BT_FIELD_BYTES - 1) { dst[n] = (char)text[n]; n++; }
  dst[n] = 0;
}

// AVRCP sends each field separately after a track change. The fields are
// cleared when the track changes, so a song with no album never shows the last one's.
void _btMetadata(uint8_t id, const uint8_t *text) {
  portENTER_CRITICAL(&_btMux);
  switch (id) {
    case ESP_AVRC_MD_ATTR_TITLE:        _btCopy(_btTitle, text); break;
    case ESP_AVRC_MD_ATTR_ARTIST:       _btCopy(_btArtist, text); break;
    case ESP_AVRC_MD_ATTR_ALBUM:        _btCopy(_btAlbum, text); break;
    case ESP_AVRC_MD_ATTR_GENRE:        _btCopy(_btGenre, text); break;
    case ESP_AVRC_MD_ATTR_PLAYING_TIME: _btDurationMs = (uint32_t)strtoul((const char *)text, nullptr, 10); break;
    default: break;
  }
  _btMetaDirty = true;
  portEXIT_CRITICAL(&_btMux);
}
` : ''}
void _btTrackChange(uint8_t *) {
  portENTER_CRITICAL(&_btMux);
  _btTrackChanged = true;
${sink.songInfo ? `  _btTitle[0] = _btArtist[0] = _btAlbum[0] = _btGenre[0] = 0;
  _btDurationMs = 0;
  _btMetaDirty = true;
` : ''}  portEXIT_CRITICAL(&_btMux);
}

// ESP32-audioI2S's Audio, as far as the player uses it.
class BluetoothAudio {
 public:
  void begin() {
    auto config = _btI2s.defaultConfig(audio_tools::TX_MODE);
    config.pin_bck = I2S_BCLK;
    config.pin_ws = I2S_LRC;
    config.pin_data = I2S_DOUT;
    _btI2s.begin(config);
${sink.songInfo ? `    _a2dp.set_avrc_metadata_attribute_mask(ESP_AVRC_MD_ATTR_TITLE | ESP_AVRC_MD_ATTR_ARTIST
      | ESP_AVRC_MD_ATTR_ALBUM | ESP_AVRC_MD_ATTR_GENRE | ESP_AVRC_MD_ATTR_PLAYING_TIME);
    _a2dp.set_avrc_metadata_callback(_btMetadata);
` : ''}    _a2dp.set_avrc_rn_track_change_callback(_btTrackChange);
${sink.tap ? '    _a2dp.set_raw_stream_reader(_btTap);   // before the volume, so analysis hears the song\n' : ''}    _a2dp.start(BT_DEVICE_NAME);
    setVolume(PLAYER_MAX_VOLUME);
  }

  // The playback clock: the time this track has been streaming. A new track
  // rewinds it, which the rotation and the particle volleys read as a new song.
  void loop() {
    uint32_t now = millis();
    bool changed;
    portENTER_CRITICAL(&_btMux);
    changed = _btTrackChanged;
    _btTrackChanged = false;
    portEXIT_CRITICAL(&_btMux);
    if (changed) _elapsedMs = 0;
    else if (isRunning()) _elapsedMs += now - _lastMs;
    _lastMs = now;
    if (_a2dp.get_volume() > _ceiling) _a2dp.set_volume(_ceiling);
  }

  bool isRunning() {
    return _a2dp.is_connected() && _a2dp.get_audio_state() == ESP_A2D_AUDIO_STATE_STARTED;
  }
  float getAudioCurrentTime() { return _elapsedMs / 1000.0f; }
${sink.songInfo ? '  float getAudioFileDuration() { return _btDurationMs / 1000.0f; }\n' : ''}
${sink.transport ? `
  // Ask the phone; its play state comes back in the stream.
  bool pauseResume() {
    if (isRunning()) _a2dp.pause(); else _a2dp.play();
    return true;
  }
` : ''}
  void setVolume(uint8_t step) {
    if (step > PLAYER_MAX_VOLUME) step = PLAYER_MAX_VOLUME;
    _a2dp.set_volume((uint8_t)((step * A2DP_VOLUME_MAX + 10) / 21));
  }
${sink.songInfo ? `  uint8_t getVolume() {
    return (uint8_t)((_a2dp.get_volume() * 21 + A2DP_VOLUME_MAX / 2) / A2DP_VOLUME_MAX);
  }
` : ''}
 private:
  const uint8_t _ceiling = (uint8_t)((PLAYER_MAX_VOLUME * A2DP_VOLUME_MAX + 10) / 21);
  uint32_t _elapsedMs = 0;
  uint32_t _lastMs = 0;
};
BluetoothAudio audio;`
}

/**
 * The phone's stream into the decoder tap. A2DP delivers 16-bit stereo at
 * the phone's rate, interleaved, before the sink applies its volume, so the
 * tap measures the song rather than how loud the listener set it.
 */
export const BLUETOOTH_TAP_CPP = `// The SD player's tap entry point, fed by the Bluetooth task instead of the
// decoder task: the same ring, lock and analysis serve both.
void _btTap(const uint8_t *data, uint32_t length) {
  bool cont = true;
  audio_process_i2s((int16_t *)data, (uint16_t)(length / 4), 16, 2, &cont);
}`

/**
 * Copy the phone's latest track details into the song fields a panel reads.
 * In the loop, so a display never sees a half-written title.
 */
export const BLUETOOTH_SONG_POLL_CPP = `static void songPoll() {
  portENTER_CRITICAL(&_btMux);
  if (_btMetaDirty) {
    songReset(nullptr);
    _songSet(songTitle, _btTitle);
    _songSet(songArtist, _btArtist);
    _songSet(songAlbum, _btAlbum);
    _songSet(songGenre, _btGenre);
    _btMetaDirty = false;
  }
  portEXIT_CRITICAL(&_btMux);
}`
