// Show node definitions: ports, default properties, sidebar
// placement and Help descriptions. src/state/nodeLibrary.ts merges every
// category's definitions into NODE_LIBRARY in sidebar order.
import type { NodeDefinition } from '../../types'
import { playerControlActionPortsFor, playerControlInputs } from '../../state/player/playerControlAssignments'
import { SONG_INFO_PORTS } from '../../state/player/songInfo'

export const SHOW_DEFINITIONS: NodeDefinition[] = [
  // ── Show pipeline source ───────────────────────────────────────────────
  {
    // Music source for the pre-planned show pipeline. Double-click on the canvas
    // opens the Music Library panel (drop MP3s, analyse, export).
    type: 'MusicLibrary',
    label: 'Music Library',
    category: 'show',
    inputs: [],
    outputs: [{ id: 'music', label: 'Music', dataType: 'music' }],
    defaultProperties: {},
  },

  // ── Transition nodes ──────────────────────────────────────────────────
  {
    // Bundled transitions — `transitionType` selects one of 21 A→B effects.
    // All share the (a, b, t)→frame signature; the variant-specific properties
    // (`direction`, `axis`, `tileSize`, `count`, `turns`) only apply to some
    // variants (the inline editor disables the others via isPropertyEnabled).
    // See the `Transition` case in graphEvaluator/cppGenerator.
    type: 'Transition',
    label: 'Transition',
    category: 'show',
    inputs: [
      { id: 'a', label: 'From', dataType: 'frame' },
      { id: 'b', label: 'To', dataType: 'frame' },
      { id: 't', label: 'T (0–1)', dataType: 'float' },
    ],
    propertyInputs: { t: 't' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {
      transitionType: 'crossfade', t: 0.5,
      direction: 'right', axis: 'horizontal', tileSize: 4, count: 4, turns: 2,
    },
  },

  // ── Music Player controls and effects ───────────────────────────────
  {
    type: 'ControlMap',
    label: 'Control Map',
    category: 'show',
    // The real inputs are derived from `controls`, the way a Button Bank's
    // outputs are derived from `buttons`. This declares the bundle input and
    // the trailing invitation; completing a connection onto that socket opens
    // the function picker, and the choice mints a port named for it.
    //
    // Port ids are unchanged from when all fourteen were declared here, so the
    // evaluator, the generators and the firmware read exactly what they read
    // before — only whether the socket exists is new.
    inputs: playerControlInputs([]),
    outputs: [{ id: 'controls', label: 'Controls', dataType: 'playercontrols' }],
    defaultProperties: {
      controls: [],
      debounceMs: 30, volumeStep: 0.05, brightnessStep: 0.05,
      repeatDelayMs: 400, repeatIntervalMs: 120,
    },
  },
  {
    type: 'PlayerParticles',
    label: 'Player Particles',
    category: 'show',
    inputs: [
      { id: 'enabled', label: 'Enabled', dataType: 'bool' },
      { id: 'color', label: 'Color', dataType: 'color' },
      { id: 'intensity', label: 'Intensity', dataType: 'float' },
      { id: 'randomStyle', label: 'Random Style', dataType: 'bool' },
      { id: 'randomColor', label: 'Random Color', dataType: 'bool' },
    ],
    propertyInputs: {
      enabled: 'enabled', intensity: 'intensity',
      randomStyle: 'randomStyle', randomColor: 'randomColor',
    },
    outputs: [{ id: 'particleFx', label: 'Particle FX', dataType: 'playerparticles' }],
    defaultProperties: {
      enabled: false, style: 0, color: '#ff8000', intensity: 0.8,
      randomColor: false, randomStyle: false,
    },
  },

  // ── Music Player — the live, decoder-driven pattern player ───────────────
  {
    // Runs a sequential or random show from a Pattern Collection: holds a pattern for
    // a random dwell (minTime…maxTime), then transitions (a random style from
    // the chosen pool) into another. A wired `beat` advances early (after
    // minTime). See docs/design/generative-pattern-show.md.
    type: 'PatternMaster',
    label: 'Music Player',
    category: 'show',
    inputs: [
      { id: 'audio',       label: 'Audio',       dataType: 'audio' },
      { id: 'controls',    label: 'Controls',    dataType: 'playercontrols' },
      { id: 'patternset',  label: 'Patterns',    dataType: 'patternset' },
      { id: 'transitions', label: 'Transitions', dataType: 'transitionset' },
      { id: 'particleFx',  label: 'Particle FX', dataType: 'playerparticles' },
      { id: 'beat',        label: 'Beat',        dataType: 'bool' },
      { id: 'volume',      label: 'Volume',      dataType: 'float' },
      { id: 'minTime',     label: 'Min Time',    dataType: 'float' },
      { id: 'maxTime',     label: 'Max Time',    dataType: 'float' },
      { id: 'transitionSec', label: 'Transition', dataType: 'float' },
      ...playerControlActionPortsFor('player'),
    ],
    propertyInputs: { volume: 'volume', minTime: 'minTime', maxTime: 'maxTime', transitionSec: 'transitionSec' },
    actionInputs: playerControlActionPortsFor('player').map((port) => port.id),
    outputs: [
      { id: 'frame', label: 'Frame', dataType: 'frame' },
      // Technically I/O: commands arrive on `controls` and the resulting
      // selection leaves here, which is what makes the round trip visible on
      // the canvas instead of hidden in a display's private state.
      { id: 'patternSelect', label: 'Pattern Select', dataType: 'patternselect' },
      // Everything the player knows about what it is playing, in one envelope:
      // the track, and the selection identifying the pattern running under it.
      // The thirteen per-field ports this replaces are minted by the Song Info
      // node instead, which appears on a canvas only when a graph genuinely
      // needs a field on a wire.
      { id: 'display', label: 'Display', dataType: 'display' },
    ],
    defaultProperties: {
      volume: 1, order: 'Random', minTime: 4, maxTime: 12, transitionSec: 1,
      // Transition styles come from a wired TransitionSet; unwired ⇒ crossfade.
      // Controls and particle FX are supplied by their dedicated bundle nodes.
      seed: 0,
    },
  },
  {
    /*
     * The player's track report, opened up.
     *
     * Music Player used to declare these thirteen as outputs, which meant
     * every player graph drew thirteen sockets whether or not anything read
     * one. A panel takes the whole `display` envelope and a custom screen
     * reads widget roles by name, so nothing consumes them one wire at a time
     * any more — except the occasional graph that genuinely wants a field
     * (text into a pattern, say, or gating on `playing`). This is that graph's
     * node, and it costs nothing to the rest.
     *
     * It takes the same envelope a panel does, because that envelope already
     * carries a whole `SongInfo` for the player arm. `songInfo.ts` stays the
     * one list behind these ports; only the node that spreads it changed.
     */
    type: 'SongInfo',
    label: 'Song Info',
    category: 'show',
    inputs: [{ id: 'display', label: 'Player', dataType: 'display' }],
    outputs: SONG_INFO_PORTS.map((port) => ({ id: port.id, label: port.label, dataType: port.dataType })),
    defaultProperties: {},
  },
  {
    // Timeline-as-a-node: cycles its inputs with a timed crossfade.
    type: 'Sequencer',
    label: 'Sequencer',
    category: 'show',
    inputs: [
      { id: 'p0', label: 'Pattern 1', dataType: 'frame' },
      { id: 'p1', label: 'Pattern 2', dataType: 'frame' },
      { id: 'p2', label: 'Pattern 3', dataType: 'frame' },
      { id: 'p3', label: 'Pattern 4', dataType: 'frame' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { interval: 4.0, fade: 1.0 },
  },

  // ── Generative pattern show (Phase 2) ──────────────────────────────────
  {
    // Holds a chosen subset of pattern groups for a show. Wire a Group node's
    // frame output here and confirm to *absorb* it into the collection's list
    // (it leaves the canvas). Outputs a `patternset` for the Show Engine.
    // See docs/design/generative-pattern-show.md.
    type: 'PatternCollection',
    label: 'Pattern Collection',
    category: 'show',
    inputs: [{ id: 'pattern', label: 'Pattern', dataType: 'frame' }],
    outputs: [{ id: 'patternset', label: 'Patterns', dataType: 'patternset' }],
    defaultProperties: { patternIds: [], patternSections: {} },
  },
  {
    // A pool of extra transition styles (toggled via the chip grid, same
    // catalogue as the Transition node) for a Performance Generator's
    // `transitions` input — when wired, generateShow mixes these into its
    // rule-based crossfade/wipe/dissolve picks instead of only ever using those three.
    type: 'TransitionSet',
    label: 'Transitions',
    category: 'show',
    inputs: [],
    outputs: [{ id: 'transitions', label: 'Transitions', dataType: 'transitionset' }],
    defaultProperties: { transitions: [] },
  },
  {
    /*
     * The same show as the Music Player, without the music.
     *
     * `showGenerator.ts` never needed a card, an amplifier or a decoder, but
     * the only way to reach it was a Music Player with no card attached — a
     * node whose every port is music, standing in for the music-free case. So
     * the workflow existed and was undiscoverable. This node is the way in, and
     * `isPatternShow` keys on it, so the three generators are told apart by
     * which node is present rather than by which hardware is absent.
     *
     * What differs from the player is what a slideshow actually needs: one
     * interval rather than a randomised min/max pair (the randomisation exists
     * to keep a beat-driven show from feeling metronomic, and there is no beat
     * here), an explicit order, transitions that default to a fade without
     * requiring a TransitionSet, and reactivity off unless asked for — the
     * point of the mode is slow patterns that do not twitch at room noise.
     * See docs/design/generative-pattern-show.md#pattern-slideshow.
     */
    type: 'PatternSlideshow',
    label: 'Pattern Slideshow',
    category: 'show',
    inputs: [
      // Live sources only. A music-free player hosts no decoder to tap, which
      // `findAudioSourceIssues` enforces rather than leaving it to fail on a
      // bench.
      { id: 'audio',       label: 'Audio',       dataType: 'audio' },
      { id: 'controls',    label: 'Controls',    dataType: 'playercontrols' },
      { id: 'patternset',  label: 'Patterns',    dataType: 'patternset' },
      { id: 'transitions', label: 'Transitions', dataType: 'transitionset' },
      { id: 'interval',    label: 'Interval',    dataType: 'float' },
      ...playerControlActionPortsFor('engine'),
    ],
    propertyInputs: { interval: 'interval' },
    actionInputs: playerControlActionPortsFor('engine').map((port) => port.id),
    outputs: [
      { id: 'frame', label: 'Frame', dataType: 'frame' },
      // Published for a panel to read, exactly as the player publishes its own.
      { id: 'patternSelect', label: 'Pattern Select', dataType: 'patternselect' },
      { id: 'display', label: 'Display', dataType: 'display' },
    ],
    defaultProperties: {
      order: 'Random',
      interval: 20,
      transitionsEnabled: true,
      transitionSec: 1.5,
      audioReactive: false,
      seed: 0,
    },
  },

  // ── Music-sync pipeline (the Music Library source lives in Show) ───────
  {
    // The `frame` output is the show's destination, and the reason it exists is
    // not that a normal sketch renders it — it doesn't; the SD player drives
    // the LEDs itself, from the card, with no evaluator in the loop.
    //
    // It exists because *something* has to say which output the show plays on,
    // and every alternative was worse. This port used to be deliberately
    // absent, on the reasoning that a firmware-facing frame port could only
    // ever render black. True, and beside the point: with no port, the player
    // took its LED configuration from `nodes.find(n => nodeType ===
    // 'MatrixOutput')` — array order — so a bench with two outputs was chosen
    // between silently, and a bench with none flashed a hardcoded 16x16
    // WS2812B on GPIO18 at a board wired to something else. It also left the
    // chain ending mid-air: the canvas said patterns and music go into a
    // generator, and then nothing, while the LED output sat there asking to be
    // fed and the graph diagnostics told the user to feed it. Building this
    // patch from scratch, the honest reading of that canvas is "I am done",
    // and the reward is a board that lights nothing.
    //
    // So the edge carries no pixels and states the thing that matters anyway:
    // this performance goes to that hardware. It makes the target explicit,
    // makes an unconnected generator dead code like every other unconnected
    // node (`reachableFromOutputs`), and gives validation something concrete to
    // require. `PatternMaster` already works exactly this way — `isPatternShow`
    // demands its frame actually reach a MatrixOutput.
    type: 'PerformanceGenerator',
    label: 'Performance Generator',
    category: 'show',
    inputs: [
      // Music first, then the collection it schedules, then the pool of styles
      // it moves between them: the order a show is actually described in, and
      // the order a drag-to-splice drop walks (`spliceTargetPorts`).
      { id: 'music', label: 'Music', dataType: 'music' },
      { id: 'patternset', label: 'Patterns', dataType: 'patternset' },
      { id: 'transitions', label: 'Transitions', dataType: 'transitionset' },
      // Last, because it is the only input that is not part of authoring the
      // show. The SD performance player holds the track and the lamp exactly
      // as the SD music player does, so the same bundle drives its transport,
      // volume, blackout and dimming — but not its patterns, which come from
      // the timed show file rather than from a cursor anyone can turn. That is
      // why it is its own `PlayerControlDestination` ('performance') rather
      // than reusing the player's: a Next Pattern button here would mint a
      // port, wire, validate, and be overwritten by the next SET_PATTERN.
      { id: 'controls', label: 'Controls', dataType: 'playercontrols' },
      ...playerControlActionPortsFor('performance'),
    ],
    actionInputs: playerControlActionPortsFor('performance').map((port) => port.id),
    outputs: [
      { id: 'frame', label: 'Show', dataType: 'frame' },
      // The same envelope Music Player publishes, because the firmware behind
      // both is the same SD player sketch: it is holding a file, so it can
      // answer for the track, and the show file says which pattern is running.
      // A panel wired here therefore gets the player layouts and the player
      // field list, not a second vocabulary that means the same things.
      { id: 'display', label: 'Display', dataType: 'display' },
    ],
    defaultProperties: {
      beatIntensity:      0.8,
      energySensitivity:  0.7,
      transitionDuration: 0.5,
      patternHold:        10,
      paletteMode:        'mood',
      fixedPalette:       'rainbow',
      useGroupInputs:     true,
      showInMainPreview:  false,
    },
  },
  {
    // The SD storage module. Its SPI bus is configured here; audio output is a
    // separate physical part and the LED config belongs to the LED output.
    type: 'SDCard',
    label: 'SD Card',
    category: 'show',
    // Portless. Both of its cables carried nothing: the evaluator returned {}
    // for this node and `{ shows: null }` for the generator feeding it, and no
    // code ever read either edge. Every consumer — buildShowPayload,
    // playerConfigFromGraph — finds this node by scanning the graph. The chain
    // on canvas was a picture of a pipeline rather than the pipeline, and the
    // card is a bench part, so it lives in the hardware view now.
    inputs: [],
    outputs: [],
    defaultProperties: {
      // ESP32-S3 core fallback for a graph with no exact board. Hardware
      // creation and board retargeting replace the complete bus with the
      // selected board/core defaults.
      sdCsPin:     10,
      sdSckPin:    12,
      sdMisoPin:   13,
      sdMosiPin:   11,
      // Audio output is no longer asked here. Adding an Amplifier part *is* the
      // statement that this build uses I2S, and a classic ESP32 with no amp
      // falls back to its built-in DAC — see state/audio/audioOutput.ts. Volume moved
      // to the amplifier with it: where the music is stored and how loudly it
      // comes out are different questions about different parts.
    },
  },
]

export const SHOW_DESCRIPTIONS: Record<string, string> = {
  MusicLibrary: 'Music source — double-click to drop tracks, analyse and export.',
  Transition: 'Transitions A→B — 21 styles: wipe, iris, push, spiral, dolly, cube + more.',
  ControlMap: 'Maps buttons and knobs to Music Player transport, volume, and LED controls.',
  PlayerParticles: 'Configures the Music Player\'s beat-triggered particle overlay.',
  PatternMaster: 'Plays a Pattern Collection in order or randomly, with transitions and music.',
  SongInfo: 'Opens the Music Player’s track report into one wire per field.',
  Sequencer: 'Crossfades through its inputs on a timer.',
  PatternCollection: 'Absorbs pattern groups into a set for the Music Player or Performance Generator.',
  TransitionSet: 'A pool of transition styles for the Music Player / Performance Generator.',
  PatternSlideshow: 'Plays a Pattern Collection on a timer — the show without the music.',
  PerformanceGenerator: 'Converts analysed music into timed LED show files.',
  SDCard: 'SD card and audio pins for the music-sync player; a bench part, not wired.',
}
