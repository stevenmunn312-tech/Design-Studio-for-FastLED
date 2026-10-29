// The Internet Radio source for the generic Music Player sketch.
//
// The board streams stations with the same ESP32-audioI2S `Audio` object the
// SD player uses (`connecttohost` in place of `connecttoFS`), so the decoder
// tap, I2S stage, volume, transport and song accessors are the SD player's.
// What this module adds is the station list and the rules for living with
// stations that are down:
//
// - A station gets RADIO_START_TIMEOUT_MS from the connect to its first
//   decoded frame. ESP32-audioI2S never gives up on its own: a station that
//   connects and sends no header is reconnected forever inside the library.
//   That is the same trap as the card player's header timeout (a file that
//   opens and never plays), so it gets the same answer: watch for the first
//   frame, and skip the station when it does not come.
// - A playing station whose decoded time stops moving for RADIO_STALL_MS, or
//   whose stream ends, is reconnected once and then skipped.
// - When every station has failed in a row the player waits RADIO_BACKOFF_MS
//   before going round again, rather than hammering dead hosts at loop speed.
// - Without Wi-Fi nothing is tried; the stations are judged once it is up.
//
// Stations come from three places, held in one list: the stations compiled in
// from the node, a `/stations.m3u` on the card (which replaces them when it
// holds at least one valid station), and stations added from the phone page
// (kept in NVS). Every URL from the card or the phone meets
// `RADIO_URL_RULES_CPP`, the firmware twin of `radioStationUrlProblem`.

import { cppStringLiteral } from '../cppLiterals'
import {
  RADIO_CARD_PLAYLIST, RADIO_STATION_NAME_MAX, RADIO_URL_MAX, type RadioStation,
} from '../../state/player/radioStations'

/** How long a station has from connect to its first decoded frame. */
export const RADIO_START_TIMEOUT_MS = 12000
/** How long a playing station may decode nothing before it is reconnected. */
export const RADIO_STALL_MS = 10000
/** The pause after every station has failed in a row. */
export const RADIO_BACKOFF_MS = 30000
/** Stations a phone may add; each lives in NVS. */
export const RADIO_PHONE_MAX = 20
/** The card's list, or the compiled one, plus the phone's. */
export const RADIO_LIST_MAX = 50 + RADIO_PHONE_MAX

export interface InternetRadioPage {
  port: number
  /** The mDNS name to announce, or null when a Web Remote already announces the board. */
  mdnsName: string | null
  /** Lets the page add and remove stations; empty means choose only. */
  accessCode: string
}

export interface InternetRadioOptions {
  stations: readonly RadioStation[]
  /** Read `/stations.m3u` from the card at start-up. */
  card: boolean
  page: InternetRadioPage | null
  /** The song fields exist (a panel, link or graph reads them). */
  songInfo: boolean
  /** The transport exists, so `playerPaused` is declared. */
  transport: boolean
}

export interface InternetRadioFirmware {
  includes: string
  /** File scope, before the song helpers and controls: data, state and forwards. */
  globals: string
  /** File scope, after the controls: the functions. */
  functions: string
  /** `setup()` lines, after the audio pins and volume are set. */
  setup: string[]
  /** `loop()` lines, after `audio.loop()`. */
  loop: string[]
}

/**
 * The URL and name rules. A station from the card or a phone was never seen
 * by the studio, so it is held to the same rules here: http or https, at most
 * RADIO_URL_MAX bytes, printable ASCII without the characters a URL never
 * holds raw, no IPv6 literal, no user name and no fragment.
 */
export const RADIO_URL_RULES_CPP = `static bool _radioUrlOk(const char *url) {
  size_t n = strlen(url);
  if (n >= RADIO_URL_BYTES) return false;
  const char *host;
  if (!strncasecmp(url, "http://", 7)) host = url + 7;
  else if (!strncasecmp(url, "https://", 8)) host = url + 8;
  else return false;
  if (*host == 0 || *host == '/' || *host == ':' || *host == '[') return false;
  for (const char *c = url; *c; c++) {
    if (*c <= ' ' || *c >= 0x7F || strchr("\\"#<>\\\\^\`{|}", *c)) return false;
  }
  const char *slash = strchr(host, '/');
  const char *at = strchr(host, '@');
  return !(at && (!slash || at < slash));
}

// A name from outside: control characters become spaces, it is cut at a
// character boundary to fit a display row, and an empty one becomes the host.
static char *_radioNameDup(const char *name, const char *url) {
  size_t n = strnlen(name, RADIO_NAME_BYTES - 1);
  while (n > 0 && n < strlen(name) && ((uint8_t)name[n] & 0xC0) == 0x80) n--;
  while (n > 0 && name[n - 1] == ' ') n--;
  while (n > 0 && *name == ' ') { name++; n--; }
  if (n == 0) {
    const char *host = strstr(url, "://");
    host = host ? host + 3 : url;
    n = strcspn(host, "/:?");
    if (n > RADIO_NAME_BYTES - 1) n = RADIO_NAME_BYTES - 1;
    name = host;
  }
  char *out = (char *)malloc(n + 1);
  if (!out) return nullptr;
  for (size_t i = 0; i < n; i++) out[i] = ((uint8_t)name[i] < 0x20 || name[i] == 0x7F) ? ' ' : name[i];
  out[n] = 0;
  return out;
}`

function stationTableCpp(stations: readonly RadioStation[]): string {
  if (stations.length === 0) return '// No stations compiled in: the card or the phone page supplies them.\n#define RADIO_BUILTIN_COUNT 0'
  return [
    '// The stations compiled in from the node, in its order. They stay in flash.',
    'static const char *const RADIO_BUILTIN[][2] = {',
    ...stations.map((station) => `  { ${cppStringLiteral(station.name)}, ${cppStringLiteral(station.url)} },`),
    '};',
    `#define RADIO_BUILTIN_COUNT ${stations.length}`,
  ].join('\n')
}

/** The phone page. Station names reach it only as JSON and leave it only as text. */
export function radioStationPageHtml(editable: boolean): string {
  return [
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1"><title>Radio</title><style>',
    'body{margin:0;padding:16px;font:16px system-ui,sans-serif;background:#0d1117;color:#e6edf3}',
    'h1{margin:0 0 4px;font-size:20px}#now{min-height:1.3em;margin-bottom:12px;color:#8b949e}',
    'ul{margin:0;padding:0;list-style:none}li{display:flex;gap:8px;margin:6px 0}',
    'button,input{font:inherit;color:inherit;border:1px solid #30363d;border-radius:8px;padding:10px}',
    'button{background:#161b22}.s{flex:1;text-align:left}.on{border-color:#58a6ff;background:#1f2a3a}',
    'form{display:none;flex-direction:column;gap:8px;margin-top:20px}input{background:#0d1117}#msg{min-height:1.3em;color:#f0883e}',
    '</style></head><body><h1>Radio</h1><div id="now"></div><ul id="list"></ul>',
    ...(editable
      ? [
          '<form id="add"><b>Add a station</b><input id="name" maxlength="40" placeholder="Name">',
          '<input id="url" maxlength="255" placeholder="http://stream address" inputmode="url" autocapitalize="off">',
          '<input id="code" type="password" placeholder="Access code" autocomplete="off"><button>Add</button></form>',
        ]
      : []),
    '<div id="msg"></div><script>',
    "let st={s:[]};const $=(id)=>document.getElementById(id);",
    'async function post(path,body,withCode){',
    "const h={'X-Radio':'1'};",
    ...(editable ? ["if(withCode)h['X-Radio-Code']=$('code').value;"] : []),
    "const r=await fetch(path,{method:'POST',headers:h,body:new URLSearchParams(body)});",
    "$('msg').textContent=r.ok?'':await r.text();load()}",
    "function render(){const ul=$('list');ul.replaceChildren();st.s.forEach((s,i)=>{",
    "const li=document.createElement('li');const b=document.createElement('button');",
    "b.className='s'+(i===st.i?' on':'');b.textContent=s[0];b.onclick=()=>post('/radio/play',{i});li.append(b);",
    ...(editable
      ? ["if(s[1]===2){const x=document.createElement('button');x.textContent='×';x.setAttribute('aria-label','Remove '+s[0]);x.onclick=()=>post('/radio/remove',{i},true);li.append(x)}"]
      : []),
    "ul.append(li)});$('now').textContent=st.n||''}",
    "async function load(){try{st=await(await fetch('/radio',{cache:'no-store'})).json();render()}catch(e){}}",
    ...(editable
      ? ["$('add').style.display='flex';$('add').onsubmit=(e)=>{e.preventDefault();post('/radio/add',{name:$('name').value,url:$('url').value},true)};"]
      : []),
    'load();setInterval(load,4000);',
    '</script></body></html>',
  ].join('\n')
}

function pageGlobalsCpp(page: InternetRadioPage): string {
  return `// The phone station page. Every POST must carry an X-Radio header: a page on
// another site cannot add one without a CORS preflight, which this server
// never answers, so a link or a hidden form elsewhere cannot change station.
WebServer _radioServer(${page.port});
static bool _radioServerStarted = false;
static char _radioTitle[96] = "";   // the stream's own title, for the page
${page.accessCode ? `// Adding and removing stations also needs this code. Plain HTTP on the local
// network: it keeps out other people on the network, not someone reading it.
static const char RADIO_ACCESS_CODE[] = ${cppStringLiteral(page.accessCode)};
static uint32_t _radioCodeLockMs = 0;   // a wrong code locks out code checks briefly
` : ''}`
}

function pageFunctionsCpp(page: InternetRadioPage): string {
  const editable = page.accessCode.length > 0
  const pageLines = radioStationPageHtml(editable).split('\n')
  return `static const char RADIO_PAGE[] =
${pageLines.map((line, index) => `  ${cppStringLiteral(index < pageLines.length - 1 ? `${line}\n` : line)}`).join('\n')};

static void _radioPageHeaders() {
  _radioServer.sendHeader("Cache-Control", "no-store");
  _radioServer.sendHeader("X-Content-Type-Options", "nosniff");
}

static void _radioSendPage() {
  _radioPageHeaders();
  _radioServer.sendHeader("Content-Security-Policy",
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'");
  _radioServer.send(200, "text/html; charset=utf-8", RADIO_PAGE);
}

// Text from a card, a phone or a station's stream title, as a JSON string.
static void _radioJson(String &out, const char *text) {
  out += '"';
  for (const uint8_t *c = (const uint8_t *)text; *c; c++) {
    if (*c == '"' || *c == '\\\\') { out += '\\\\'; out += (char)*c; }
    else if (*c < 0x20 || *c == 0x7F) out += ' ';
    else out += (char)*c;
  }
  out += '"';
}

static void _radioSendState() {
  String out;
  out.reserve(64 + _radioCount * 48);
  out += "{\\"i\\":";
  out += radioIndex;
  out += ",\\"n\\":";
  _radioJson(out, _radioTitle);
  out += ",\\"s\\":[";
  for (uint16_t i = 0; i < _radioCount; i++) {
    if (i) out += ',';
    out += '[';
    _radioJson(out, _radioList[i].name);
    out += ',';
    out += _radioList[i].origin;
    out += ']';
  }
  out += "]}";
  _radioPageHeaders();
  _radioServer.send(200, "application/json", out);
}

static bool _radioFromPage() {
  if (_radioServer.hasHeader("X-Radio")) return true;
  _radioServer.send(403, "text/plain", "Use the station page.");
  return false;
}

// One or two digits naming a station, or -1.
static int _radioIndexArg() {
  String text = _radioServer.arg("i");
  if (text.length() == 0 || text.length() > 2) return -1;
  for (size_t k = 0; k < text.length(); k++) if (!isdigit((unsigned char)text[k])) return -1;
  int index = text.toInt();
  return index < (int)_radioCount ? index : -1;
}

static void _radioHandlePlay() {
  if (!_radioFromPage()) return;
  int index = _radioIndexArg();
  if (index < 0) { _radioServer.send(400, "text/plain", "No such station."); return; }
  radioSelect((uint16_t)index);
  _radioServer.send(204);
}
${editable ? `
static bool _radioCodeOk() {
  if ((int32_t)(millis() - _radioCodeLockMs) < 0) return false;
  String given = _radioServer.header("X-Radio-Code");
  size_t want = strlen(RADIO_ACCESS_CODE);
  // Compares every byte whatever the answer, so timing says nothing.
  uint8_t diff = given.length() == want ? 0 : 1;
  for (size_t k = 0; k < want; k++) diff |= (uint8_t)(k < given.length() ? given[k] : 0) ^ (uint8_t)RADIO_ACCESS_CODE[k];
  if (diff) _radioCodeLockMs = millis() + 2000;
  return diff == 0;
}

static void _radioHandleAdd() {
  if (!_radioFromPage()) return;
  if (!_radioCodeOk()) { _radioServer.send(403, "text/plain", "Wrong access code."); return; }
  String name = _radioServer.arg("name");
  String url = _radioServer.arg("url");
  url.trim();
  if (name.length() > 200) name = name.substring(0, 200);
  if (!_radioUrlOk(url.c_str())) {
    _radioServer.send(400, "text/plain", "That is not a stream address the board can play (http:// or https://, no spaces).");
    return;
  }
  uint16_t phone = 0;
  for (uint16_t i = 0; i < _radioCount; i++) if (_radioList[i].origin == RADIO_FROM_PHONE) phone++;
  if (phone >= RADIO_PHONE_MAX) { _radioServer.send(400, "text/plain", "The phone list is full; remove a station first."); return; }
  if (!_radioAdd(name.c_str(), url.c_str(), RADIO_FROM_PHONE)) {
    _radioServer.send(400, "text/plain", "That station is already in the list, or the list is full.");
    return;
  }
  _radioSavePhone();
  _radioServer.send(204);
}

static void _radioHandleRemove() {
  if (!_radioFromPage()) return;
  if (!_radioCodeOk()) { _radioServer.send(403, "text/plain", "Wrong access code."); return; }
  int index = _radioIndexArg();
  if (index < 0 || _radioList[index].origin != RADIO_FROM_PHONE) {
    _radioServer.send(400, "text/plain", "Only stations added here can be removed here.");
    return;
  }
  bool playing = (uint16_t)index == radioIndex;
  free((void *)_radioList[index].name);
  free((void *)_radioList[index].url);
  for (uint16_t i = (uint16_t)index; i + 1 < _radioCount; i++) _radioList[i] = _radioList[i + 1];
  _radioCount--;
  _radioSavePhone();
  if (_radioCount == 0) { audio.stopSong(); radioIndex = 0; _radioState = RADIO_IDLE; }
  else if (playing) radioSelect((uint16_t)(index % _radioCount));
  else if ((uint16_t)index < radioIndex) radioIndex--;
  _radioServer.send(204);
}
` : ''}
static void radioPageSetup() {
  static const char *headers[] = { "X-Radio"${editable ? ', "X-Radio-Code"' : ''} };
  _radioServer.collectHeaders(headers, ${editable ? 2 : 1});
  _radioServer.on("/", HTTP_GET, _radioSendPage);
  _radioServer.on("/radio", HTTP_GET, _radioSendState);
  _radioServer.on("/radio/play", HTTP_POST, _radioHandlePlay);
${editable ? `  _radioServer.on("/radio/add", HTTP_POST, _radioHandleAdd);
  _radioServer.on("/radio/remove", HTTP_POST, _radioHandleRemove);
` : ''}  _radioServer.onNotFound([]() { _radioServer.send(404, "text/plain", "Not found"); });
}

// Serves at most one waiting request per pass, never waits for one.
static void radioPageService() {
  if (!_netConnected()) return;
  if (!_radioServerStarted) {
    _radioServer.begin();
${page.mdnsName ? `    if (MDNS.begin(${cppStringLiteral(page.mdnsName)})) MDNS.addService("http", "tcp", ${page.port});\n` : ''}    _radioServerStarted = true;
    Serial.println("[radio] station page started on port ${page.port}");
  }
  _radioServer.handleClient();
}
`
}

export function internetRadioFirmware(options: InternetRadioOptions): InternetRadioFirmware {
  const { page, songInfo, transport } = options
  const editable = !!page && page.accessCode.length > 0
  const paused = transport ? 'playerPaused' : 'false'
  const includes = [
    '#include <Preferences.h>',
    ...(page ? ['#include <WebServer.h>', '#include <ESPmDNS.h>'] : []),
  ].join('\n')

  const globals = `// ── Internet radio ────────────────────────────────────────────────────────────
#define RADIO_URL_BYTES        ${RADIO_URL_MAX + 1}
#define RADIO_NAME_BYTES       ${RADIO_STATION_NAME_MAX + 1}
#define RADIO_MAX_STATIONS     ${RADIO_LIST_MAX}
#define RADIO_PHONE_MAX        ${RADIO_PHONE_MAX}
#define RADIO_START_TIMEOUT_MS ${RADIO_START_TIMEOUT_MS}u  // connect to first decoded frame
#define RADIO_STALL_MS         ${RADIO_STALL_MS}u  // playing, but no new audio decoded
#define RADIO_BACKOFF_MS       ${RADIO_BACKOFF_MS}u  // every station failed in a row
#define RADIO_FROM_NODE        0
#define RADIO_FROM_CARD        1
#define RADIO_FROM_PHONE       2
${stationTableCpp(options.stations)}

// Compiled-in stations point into flash; card and phone ones own their text.
struct RadioStation { const char *name; const char *url; uint8_t origin; };
static RadioStation _radioList[RADIO_MAX_STATIONS];
static uint16_t _radioCount = 0;
uint16_t radioIndex = 0;

enum : uint8_t { RADIO_IDLE, RADIO_OFFLINE, RADIO_CONNECTING, RADIO_PLAYING, RADIO_BACKOFF };
static uint8_t  _radioState = RADIO_IDLE;
static uint32_t _radioStateMs = 0;      // when the current state began
static uint32_t _radioProgressMs = 0;   // when decoded time last moved
static uint32_t _radioLastSec = 0;
static uint16_t _radioFailStreak = 0;   // stations failed in a row
static uint8_t  _radioRetries = 0;      // reconnects to the playing station
static uint32_t _radioClockMs = 0;      // the show clock: time this station has played
static uint32_t _radioTickMs = 0;
static int32_t  _radioSavedIndex = -1;  // the station NVS remembers

// Next, Previous and the phone page all land here.
static void radioSelect(uint16_t index);
${page ? pageGlobalsCpp(page) : ''}`

  const functions = `// ── Internet radio: stations ─────────────────────────────────────────────────
${RADIO_URL_RULES_CPP}

static bool _radioAdd(const char *name, const char *url, uint8_t origin) {
  if (_radioCount >= RADIO_MAX_STATIONS || !_radioUrlOk(url)) return false;
  for (uint16_t i = 0; i < _radioCount; i++) if (!strcmp(_radioList[i].url, url)) return false;
  char *ownName = _radioNameDup(name, url);
  char *ownUrl = strdup(url);
  if (!ownName || !ownUrl) { free(ownName); free(ownUrl); return false; }
  _radioList[_radioCount++] = { ownName, ownUrl, origin };
  return true;
}
${options.card ? `
// ${RADIO_CARD_PLAYLIST}: "#EXTINF:-1,Name" names the URL on the next line,
// other # lines are skipped, and each URL meets the same rules as a typed one.
// A line too long to be a station is skipped whole.
static void radioLoadCard() {
  File file = SD.open(${cppStringLiteral(RADIO_CARD_PLAYLIST)});
  if (!file) return;
  char line[RADIO_URL_BYTES + 64];
  char name[RADIO_NAME_BYTES * 2] = "";
  bool first = true;
  while (file.available() && _radioCount < RADIO_MAX_STATIONS - RADIO_PHONE_MAX) {
    size_t n = file.readBytesUntil('\\n', line, sizeof(line) - 1);
    line[n] = 0;
    if (n == sizeof(line) - 1) {   // longer than any station: drop the rest of it
      while (file.available() && file.read() != '\\n') {}
      name[0] = 0;
      continue;
    }
    char *text = line;
    if (first && (uint8_t)text[0] == 0xEF && (uint8_t)text[1] == 0xBB && (uint8_t)text[2] == 0xBF) text += 3;
    first = false;
    while (*text == ' ' || *text == '\\t') text++;
    size_t len = strlen(text);
    while (len && (text[len - 1] == '\\r' || text[len - 1] == ' ' || text[len - 1] == '\\t')) text[--len] = 0;
    if (!len) continue;
    if (text[0] == '#') {
      if (!strncasecmp(text, "#EXTINF:", 8)) {
        const char *comma = strchr(text, ',');
        strlcpy(name, comma ? comma + 1 : "", sizeof(name));
      }
      continue;
    }
    if (!_radioAdd(name, text, RADIO_FROM_CARD)) Serial.printf("[radio] card: skipped %s\\n", text);
    name[0] = 0;
  }
  file.close();
  if (_radioCount) Serial.printf("[radio] %u stations from the card\\n", _radioCount);
}
` : ''}
static void _radioSavePhone() {
  Preferences prefs;
  if (!prefs.begin("flsradio", false)) return;
  uint8_t n = 0;
  char key[8];
  for (uint16_t i = 0; i < _radioCount && n < RADIO_PHONE_MAX; i++) {
    if (_radioList[i].origin != RADIO_FROM_PHONE) continue;
    snprintf(key, sizeof key, "n%u", n); prefs.putString(key, _radioList[i].name);
    snprintf(key, sizeof key, "u%u", n); prefs.putString(key, _radioList[i].url);
    n++;
  }
  prefs.putUChar("pc", n);
  prefs.end();
}

static void radioSetup() {
${options.card ? '  if (sdMounted) radioLoadCard();\n' : ''}  if (_radioCount == 0) {
    for (uint16_t i = 0; i < RADIO_BUILTIN_COUNT; i++) _radioList[_radioCount++] = { RADIO_BUILTIN[i][0], RADIO_BUILTIN[i][1], RADIO_FROM_NODE };
  }
  Preferences prefs;
  if (prefs.begin("flsradio", true)) {
${editable ? `    uint8_t phone = prefs.getUChar("pc", 0);
    char key[8];
    for (uint8_t i = 0; i < phone && i < RADIO_PHONE_MAX; i++) {
      snprintf(key, sizeof key, "n%u", i); String name = prefs.getString(key, "");
      snprintf(key, sizeof key, "u%u", i); String url = prefs.getString(key, "");
      _radioAdd(name.c_str(), url.c_str(), RADIO_FROM_PHONE);
    }
` : ''}    _radioSavedIndex = prefs.getUShort("last", 0);
    prefs.end();
  }
  if (_radioSavedIndex >= 0 && _radioSavedIndex < _radioCount) radioIndex = (uint16_t)_radioSavedIndex;
  if (_radioCount == 0) Serial.println("[radio] no stations: add some on the node${options.card ? `, in ${RADIO_CARD_PLAYLIST} on the card` : ''}${editable ? ' or from the phone page' : ''}");
  // The library's own connect timeouts, in ms: a dead host costs this much of
  // a frozen LED loop, since connecttohost waits for the connection.
  audio.setConnectionTimeout(1500, 4000);
}

// The station NVS starts on next time, written once it has actually played.
static void _radioRemember() {
  if ((int32_t)radioIndex == _radioSavedIndex) return;
  Preferences prefs;
  if (!prefs.begin("flsradio", false)) return;
  prefs.putUShort("last", radioIndex);
  prefs.end();
  _radioSavedIndex = radioIndex;
}

// ── Internet radio: playing ──────────────────────────────────────────────────
// "Artist - Title" by convention; a station that sends one string keeps it
// as the title. Arrives from audio.loop(), so on the loop's own task.
void audio_showstreamtitle(const char *info) {
${page ? '  strlcpy(_radioTitle, info, sizeof(_radioTitle));\n' : ''}${songInfo ? `  const char *dash = strstr(info, " - ");
  if (dash) {
    size_t n = (size_t)(dash - info);
    if (n > SONG_FIELD_BYTES - 1) n = SONG_FIELD_BYTES - 1;
    memcpy(songArtist, info, n);
    songArtist[n] = 0;
    _songSet(songTitle, dash + 3);
  } else {
    songArtist[0] = 0;
    _songSet(songTitle, info);
  }
` : ''}  Serial.printf("[radio] now playing: %s\\n", info);
}

static void _radioConnect() {
  const RadioStation &station = _radioList[radioIndex];
${songInfo ? '  songReset(nullptr);\n  _songSet(songAlbum, station.name);   // the station is the album a panel shows\n' : ''}${page ? '  _radioTitle[0] = 0;\n' : ''}  Serial.printf("[radio] %u/%u %s  %s\\n", radioIndex + 1, _radioCount, station.name, station.url);
  _radioClockMs = 0;
  _radioStateMs = millis();
  _radioState = RADIO_CONNECTING;
  if (!audio.connecttohost(station.url)) _radioState = RADIO_IDLE;
}

// The station did not play: move on, and rest once every station has failed.
static void _radioSkip(const char *why) {
  Serial.printf("[radio] %s: %s, skipping it\\n", _radioList[radioIndex].name, why);
  audio.stopSong();
  _radioRetries = 0;
  radioIndex = (uint16_t)((radioIndex + 1) % _radioCount);
  if (++_radioFailStreak >= _radioCount) {
    _radioFailStreak = 0;
    _radioState = RADIO_BACKOFF;
    _radioStateMs = millis();
    Serial.printf("[radio] no station played; trying again in %us\\n", RADIO_BACKOFF_MS / 1000);
  } else {
    _radioState = RADIO_IDLE;
  }
}

static void radioSelect(uint16_t index) {
  if (index >= _radioCount) return;
  radioIndex = index;
  audio.stopSong();
${transport ? '  playerPaused = false;\n' : ''}  _radioFailStreak = 0;
  _radioRetries = 0;
  _radioState = RADIO_IDLE;   // connects on the next service pass
}

static void radioService() {
  uint32_t now = millis();
  if (_radioState == RADIO_PLAYING && !${paused}) _radioClockMs += now - _radioTickMs;
  _radioTickMs = now;
  if (_radioCount == 0) return;
  if (!_netConnected()) {
    if (_radioState != RADIO_OFFLINE) {
      audio.stopSong();
      _radioState = RADIO_OFFLINE;
      Serial.println("[radio] waiting for Wi-Fi");
    }
    return;
  }
  // A paused stream is judged from the moment it resumes.
  if (${paused}) { _radioStateMs = now; _radioProgressMs = now; return; }
  switch (_radioState) {
    case RADIO_IDLE:
    case RADIO_OFFLINE:
      _radioConnect();
      if (_radioState == RADIO_IDLE) _radioSkip("no connection");
      break;
    case RADIO_CONNECTING:
      if (audio.getBitRate() != 0) {
        _radioState = RADIO_PLAYING;
        _radioFailStreak = 0;
        _radioRetries = 0;
        _radioProgressMs = now;
        _radioLastSec = audio.getAudioCurrentTime();
        _radioRemember();
      } else if (!audio.isRunning()) {
        _radioSkip("the stream closed");
      } else if (now - _radioStateMs > RADIO_START_TIMEOUT_MS) {
        _radioSkip("no audio in time");
      }
      break;
    case RADIO_PLAYING: {
      uint32_t sec = audio.getAudioCurrentTime();
      if (sec != _radioLastSec) { _radioLastSec = sec; _radioProgressMs = now; }
      if (audio.isRunning() && now - _radioProgressMs <= RADIO_STALL_MS) break;
      if (_radioRetries == 0) {
        _radioRetries = 1;
        Serial.println("[radio] stream dropped, reconnecting");
        audio.stopSong();
        _radioConnect();
        if (_radioState == RADIO_IDLE) _radioSkip("no connection");
      } else {
        _radioSkip("the stream keeps dropping");
      }
      break;
    }
    case RADIO_BACKOFF:
      if (now - _radioStateMs >= RADIO_BACKOFF_MS) _radioState = RADIO_IDLE;
      break;
  }
}

// The show clock: how long this station has played, held while paused and
// rewound by a station change, as a new track rewinds the card player's.
static uint32_t radioClockMs() { return _radioClockMs; }

static const char *radioStateName() {
  switch (_radioState) {
    case RADIO_OFFLINE: return "no-wifi";
    case RADIO_CONNECTING: return "connecting";
    case RADIO_PLAYING: return "playing";
    case RADIO_BACKOFF: return "resting";
    default: return _radioCount ? "starting" : "no-stations";
  }
}
${page ? pageFunctionsCpp(page) : ''}`

  return {
    includes,
    globals,
    functions,
    setup: ['  radioSetup();', ...(page ? ['  radioPageSetup();'] : [])],
    loop: ['  radioService();', ...(page ? ['  radioPageService();'] : [])],
  }
}
