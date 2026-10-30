# Internet radio on the Music Player

A Music Player whose Music Source is **Internet Radio** streams stations over
Wi-Fi through the same ESP32-audioI2S decoder, I2S stage, decoder tap, volume
and transport as the SD player. Only where the music comes from changes:
`audio.connecttohost(url)` in place of `connecttoFS(SD, path)`.

Code: `src/state/player/radioStations.ts` (rules, shared by the body,
validation and the generator), `src/state/player/radioBrowser.ts` (directory
search), `src/components/Canvas/bodies/RadioStationsBody.tsx` (the Music Player's
Internet Radio group: always shown, disabled unless that is the Music Source,
explanations in tooltips),
`src/codegen/player/internetRadioCpp.ts` (firmware).

## Where stations come from

1. **The node.** The Internet Radio group lists stations, each a name and a stream URL, in the
   order Next walks them. A station is added by URL, or from a search of the
   [radio-browser.info](https://www.radio-browser.info/) directory. The list is
   compiled into flash; stations cost no RAM.
2. **The directory search.** User-initiated only, straight from the browser
   (the directory serves CORS to everyone and needs no key). Results the board
   could not play are not shown: HLS streams, codecs other than MP3, AAC, OGG,
   FLAC and Opus, stations the directory's own check marks broken, and any URL
   that fails the typed-URL rules. The directory is untrusted: a result's name
   is cleaned and rendered as text, and its URL meets the same rules as a
   typed one.
3. **`/stations.m3u` on the card.** With an SD Card on the bench the board
   reads this extended M3U once at start-up (`#EXTINF:-1,Name` names the URL
   on the next line). When it yields at least one valid station it replaces
   the compiled list, so stations change without a new build. The firmware
   checks every URL against `RADIO_URL_RULES_CPP`, the twin of
   `radioStationUrlProblem`; a line too long to be a station is skipped whole.
4. **The phone station page** (below).

## URL rules

One rule set, enforced in the studio and again on the board: `http://` or
`https://`; at most 255 bytes; printable ASCII without space, `"`, `#`, `<`,
`>`, `\`, `^`, `` ` ``, `{`, `|`, `}`; no IPv6 literal (the library's address
parser splits the host at the first colon); no user name or password; no
fragment. A URL that passes is safe in a C string literal, in JSON and in the
library's HTTP request line. Names are cut to 40 characters at a character
boundary, and control characters become spaces.

HTTPS streams use the library's `WiFiClientSecure` with `setInsecure()`: the
stream is encrypted but the server is not authenticated.

## Dead stations

ESP32-audioI2S does not give up on a station by itself: one that connects and
sends no header is reconnected forever inside `Audio::loop()`. That is the
same trap as the card player's header timeout (a file that opens and never
plays, see the AudioI2S header-timeout note in the player patterns), so it
gets the same answer, a watchdog around the library:

- From connect to the first decoded frame (`getBitRate() != 0`) a station has
  `RADIO_START_TIMEOUT_MS` (12 s). A refused connection or a closed stream
  fails at once.
- A playing station whose stream data stops moving for `RADIO_STALL_MS`
  (10 s), or whose stream ends, is reconnected once, then skipped. Progress is
  the input buffer's fill (`inBufferFilled()`), never `getAudioCurrentTime()`:
  3.0.12 computes that only for files, so on a stream it stays 0 and every
  station was reconnected every 10 s.
- When every station has failed in a row the player rests `RADIO_BACKOFF_MS`
  (30 s) before going round again.
- Without Wi-Fi nothing is attempted; a paused stream is judged from the
  moment it resumes.

`connecttohost` waits for the TCP connection, so a dead host freezes the LED
loop for up to the connect timeout; the sketch sets 1.5 s (4 s for TLS). The
sketch looks the host up first, so the log says whether the name lookup or
the server failed (the library prints only "Request failed!" for both). A
lookup can stall far longer than the connect timeout on a flaky DNS server
(16 s seen on a phone hotspot) and then report success with `0.0.0.0`, which
counts as a failed lookup.

The show clock is the time the current station has played, held while paused
and rewound by a station change, as a new track rewinds the card player's.

## Phone station page

The group shows the board's own name and Wi-Fi fields only when the Music
Player holds the board's one network connection (`networkSourceIn`). When a
Web Remote or another network node comes first, it shows `network: via <node>`
and the page address uses that node's name, because that is what the board
announces.

`stationPage` serves a page for choosing a station from a phone on the same
network, on port 80, or 8080 when a Web Remote already serves port 80. It
announces the board over mDNS unless a Web Remote already does. Its address
by IP is in the serial log when Wi-Fi comes up and in every 2-second status
line (`page=`), since a `.local` name does not resolve everywhere: Chrome on
Windows answers `DNS_PROBE_FINISHED_NXDOMAIN` for a board that is up.

### Security

- **Choosing a station needs no password**, as with the Web Remote: anyone on
  the network can do it, as anyone on the network can move a Web Remote's
  controls. It cannot change the sketch, the Wi-Fi settings or anything else.
- **Adding and removing stations needs the access code** set on the node (6 to
  32 printable characters). Without one the page cannot edit at all. The code
  is a secret like the Wi-Fi password: it lives in this browser's credential
  store, never in the project file or a share link, and is embedded in the
  firmware. It travels as plain HTTP on the local network, so it keeps out
  other people on the network, not someone reading its traffic. The board
  compares it in constant time and refuses code checks for 2 s after a wrong
  one.
- **No cross-site requests.** Every POST must carry an `X-Radio` header. A page
  on another site cannot add a custom header without a CORS preflight, which
  the board never answers, so a link or hidden form elsewhere cannot change
  station or add one through the phone's browser.
- **The page treats every name as text.** Names from the card, the phone and a
  station's own stream title reach the page only as JSON strings and are
  rendered with `textContent`. The page is sent with a Content Security Policy
  that allows only its own inline script and style, requests to its own
  origin, no form posts and no framing.
- **Bounded input.** The station index is one or two digits naming an existing
  station; an added URL meets the URL rules; phone stations are capped at 20
  and kept in NVS. Only stations added from the phone can be removed from it.

## Validation

- Not an ESP32, or an ESP32 with neither Wi-Fi nor a cable: error
  (`-radio-board`), in place of the shared Art-Net/NTP network board error.
- An output stage without an I2S stage: error (`-radio-i2s`).
- No stations: error, or a warning when a card playlist or an editing page
  can supply them (`-radio-stations`).
- Stations a hand-edited save holds that fail the rules: warning
  (`-radio-invalid`); the generator drops them.
- An access code that fails its rules: error (`-radio-access-code`).
- The missing Wi-Fi name and disagreeing network settings are the shared
  network warnings: the radio player is a `usesNetwork` user.

## Preview

With Music Source on Internet Radio, the preview's player plays the stations
in place of local tracks: Play, Next and Previous walk them as on the board,
and Song Info shows the station as the album and its stream title as title and
artist (`state/player/radioPreview.ts`).

Stations play through the helper's relay, `GET /api/radio/stream?url=`
(`backend/radio.py`), never straight from their servers. The preview analyses
what it plays through Web Audio, which reads only audio shared across origins
(CORS), and most station servers do not share it: played directly, those
stations would drive the patterns with silence. The relay answers with the
helper's CORS headers, asks the station for ICY metadata, strips the metadata
blocks from the audio, and keeps the last `StreamTitle`, which the preview
polls from `GET /api/radio/now?url=` every 4 s. It follows one `.m3u` or
`.pls` playlist, refuses a URL that fails the station rules before fetching
it, and like every helper route answers only local pages. HTTPS stations are
verified here, unlike on the board.

The preview skips a station as the board does: the relay failing, the stream
ending, or no audio within 12 s moves to the next one, and once every station
has failed in a row it stops and says so (naming the helper when it is
offline). A station opens no connection until it is played. Without the
helper the stations cannot play in the preview; the board does not need it.

## Not done

- The phone page cannot reorder stations or edit the compiled ones.
- The board does not write `stations.m3u`; edit it on a computer.
- Nothing has run on a board yet; see the support matrix.
