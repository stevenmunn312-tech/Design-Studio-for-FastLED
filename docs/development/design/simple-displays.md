# Simple displays — design note

Status: in progress · Owner: app · Date: 2026-08-29

What a small, non-touch display shows, and how it is told. Decided 2026-08-27,
scoped 2026-08-29. The companion half of this note is [Pattern
Slideshow](generative-pattern-show.md#pattern-slideshow), the third source a
simple display can be plugged into.

Detail on the parts themselves — controllers, transports, pins, the registries a
new display has to join — stays in [auxiliary displays](auxiliary-displays.md).
This note is only about where the *content* comes from.

## The class of display this covers

Three tiers, separated by what a panel is physically good for:

1. **Simple displays** — small, non-touch, roughly 128x128 or less. The
   `InfoDisplay` OLED and the `SegmentDisplay` module. One predetermined layout,
   no user arrangement, input limited to a couple of buttons or an encoder
   elsewhere in the graph. **This note.**
2. **Custom-UI displays** — big enough to be worth arranging. A user-authored UI
   driven by hardware controls, alongside the same `Display` input for anyone
   who does not want to author one.
3. **Touch displays** — as above, plus touch as a control source.

Tiers 2 and 3 take two inputs, `Display` and `Custom UI`, and their predetermined
layouts may say *more* than a simple panel does — album art where the file
carries it, for instance. The exact size boundary is not settled and does not
need to be until tier 2 is built. `TransportDisplay` (ST7789) is a tier-3 part
and is deliberately untouched by this note; so is its Diagnostics screen.

## The model

**A simple display has exactly one content input, `Display`, and no layout
property. What is plugged in decides what it shows.**

| Source | The panel becomes |
| --- | --- |
| `RTCInput` (RTC Clock) | a clock |
| `PatternMaster` (Music Player) | transport: track, position, play state, volume |
| `PatternSlideshow` | pattern selection: which pattern, where in the collection |

One layout per source. No variants, no dropdown, no properties to get wrong. The
wire *is* the setting, so you can read what a screen does by looking at what is
plugged into it, and two sources can never fight over one panel because there is
only one socket.

A Music Player screen shows the transport and nothing else — **no pattern
selection**. Pattern selection is the Slideshow's screen. "Music player *plus*
pattern browsing" is a custom UI, which is tier 2.

### Unwired says so

A simple display with nothing in `Display` reads **"Waiting for a signal"**. Not
blank: a blank OLED and a dead OLED look identical on a bench, and the panel
that says which one it is costs nothing.

A segment module cannot render words. It already shows dashes for a reading it
does not have, so dashes are its form of the same statement rather than four
digits of scrolling text.

`enabled` is unchanged and still means unlit. Unlit and waiting are different
states and look different.

### What this removes

- **The `Status` layout** and the four `indicator` inputs, along with `title` /
  `line2` / `value` / `progress` / `playing` / `volume` as separate ports.
  Wiring arbitrary graph signals to a panel is a custom-UI capability, and it
  moves there wholesale rather than surviving as a fourth layout.
- **`SegmentDisplay`'s `segmentMode` property** and its raw `value` float. A
  segment module plugged into a Music Player shows elapsed time as `M:SS`, using
  the colon the TM1637 already has; into an RTC, the time; into a Slideshow, the
  pattern's ordinal. A bare number on a wall is a custom UI.
- **The per-field song ports as a display feed.** `PatternMaster` keeps its
  `SONG_INFO_PORTS` outputs — they are what a custom UI will read, and
  `songInfo.ts` is still the one list behind them — but a simple display no
  longer consumes them one wire at a time.

This is a breaking change to persisted graphs. That is allowed on `Hardware`
ahead of v1.0.0 and no migration is provided.

## The signal

`src/state/displaySignal.ts` owns the contract. A `DisplaySignal` is a
discriminated union whose `kind` *is* the layout choice:

```ts
type DisplaySignal =
  | { kind: 'clock';     clock: RtcReading }
  | { kind: 'player';    song: SongInfo }
  | { kind: 'slideshow'; selection: PatternSelectValue }
```

Each arm carries a type that already exists and is already the authority for its
subject — `SongInfo` from `songInfo.ts`, `PatternSelectValue` from
`patternSelection.ts`, the RTC preview from `rtc.ts`. The signal is a routing
envelope, not a fourth place those readings get defined.

Sources publish it on a `display` output of dataType `display`. A source may
publish it alongside its existing ports; the envelope is an additional view of
what the node already knows, never a second computation of it.

`PerformanceGenerator` is listed in the original decision as a player-like
source and is **not** wired up yet: its playback lives outside the evaluator
(`showPlayback.ts`, the node body), so its `display` output would publish a
blank transport in preview and lie about a build. It joins when it has a
reading to publish.

## Firmware resolution

`playerDisplays.ts` resolved a display's ports one at a time and reported any
the template could not honour. It now resolves one edge and asks a smaller
question: **which kind is plugged in, and can this generator honour that kind?**

| Generator | Honours |
| --- | --- |
| `cppGenerator` (normal sketch) | `clock` |
| `playerSketchGenerator` (SD player) | `player` |
| `showGenerator` (slideshow) | `slideshow` |

Anything else is a validation error naming the display, the source and the
generator the graph would actually build with — the same failure the old
`unresolved` list existed to prevent, asked once instead of per port. A display
wired to a Music Player in a normal sketch is the case this catches: a normal
sketch has no decoder, so that panel would compile and then show nothing.

The `duration` gap disappears with the per-field ports. A Now Playing panel
could never show a track length in preview, because `InfoDisplay` had no
`duration` port to wire and the property behind it did not exist, while
[playerSketchGenerator.ts](../../../src/codegen/playerSketchGenerator.ts) fell
back to `songDurationSec()` on the device. One envelope carrying a whole
`SongInfo` has no port to forget.

## Open

- The size boundary between tiers 1 and 2.
- Tier 2: the `Custom UI` input, the authoring surface, and what a predetermined
  layout adds when it has the room (album art, more rows).
- Where the TFT's Diagnostics screen lives once tier 3 is designed.
- `PerformanceGenerator` as a `player` source.
