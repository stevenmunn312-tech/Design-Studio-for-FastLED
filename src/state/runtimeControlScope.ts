/*
 * Step 9 of docs/development/design/direct-controls-and-output-status.md.
 *
 * A property input is only honest if preview and firmware both read it
 * wire-then-field. This module names the player/show/group fields that meet
 * that bar, and the ones that must stay sliders-on-the-card because they are
 * baked when the sketch is generated.
 *
 * Group instances are not in NODE_LIBRARY. Their published ports are minted
 * from GroupInput nodes inside the subgraph; those ports stay visible because
 * they *are* the group's interface, not optional tuning on a pattern card.
 */

/** Ports that carry the node's primary substance and must stay drawn. */
export const MAIN_SUBSTANCE_TYPES = new Set([
  'frame',
  'display',
  'audio',
  'field',
  'patternset',
  'transitionset',
  'music',
  'image',
  'dmx',
  'datetime',
  'playercontrols',
  'controls',
])

/** Live runtime fields that already have a verified property input. */
export const LIVE_PLAYER_SHOW_PROPERTIES: Record<string, readonly string[]> = {
  PatternMaster: ['volume', 'minTime', 'maxTime', 'transitionSec'],
  PatternSlideshow: ['interval'],
  PlayerParticles: ['enabled', 'intensity', 'randomStyle', 'randomColor'],
  MatrixOutput: ['enabled', 'outputBrightness'],
  TransportDisplay: ['enabled'],
  InfoDisplay: ['enabled'],
  SegmentDisplay: ['enabled'],
}

/**
 * Authoring / generate-time fields. They have defaultProperties (or will)
 * but must not grow a property input until both engines read a port.
 *
 * Reasons are the contract, not a backlog: offering one of these as a socket
 * would work in preview and compile to the value frozen at Generate.
 */
export const BAKE_TIME_PROPERTIES: Record<string, readonly string[]> = {
  PatternMaster: ['seed'],
  PatternSlideshow: ['order', 'transitionsEnabled', 'transitionSec', 'audioReactive', 'seed'],
  PerformanceGenerator: [
    'beatIntensity',
    'energySensitivity',
    'transitionDuration',
    'patternHold',
    'paletteMode',
    'fixedPalette',
    'useGroupInputs',
    'showInMainPreview',
  ],
  Sequencer: ['interval', 'fade'],
  Transition: ['transitionType', 'direction', 'axis', 'tileSize', 'count', 'turns'],
}

/**
 * Group-boundary rules, stated so a test can fail if someone "helps" by
 * exposing a bake-time group binding as if it were a live wire.
 */
export const GROUP_BOUNDARY = {
  /**
   * Published GroupInput ports on a Group instance are live in a normal
   * sketch: the subgraph evaluates them each frame. They are the group's
   * main data ports and stay visible.
   */
  publishedPortsAreMain: true,
  /**
   * `useGroupInputs` on PerformanceGenerator binds the show preview (and the
   * baked envelope) to semantic roles inside collected groups. It is a
   * generate-time switch, not a runtime socket.
   */
  useGroupInputsIsBakeTime: true,
  /**
   * Pattern parameters inside a collected group are live only while that
   * group is evaluated as a subgraph (normal sketch, preview with
   * useGroupInputs). A performance/SD show bakes the envelope; those inner
   * sliders are not firmware inputs unless the group is inlined as a sketch.
   */
  collectedGroupParamsAreBakeTimeInPerformance: true,
} as const
