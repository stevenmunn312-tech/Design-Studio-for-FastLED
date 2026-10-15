/** Music Player guidance shared by the reference overview and wiring panels. */
export const MUSIC_PLAYER_REFERENCE = {
  overview: [
    'Music Player runs saved patterns from a Pattern Collection and sends the finished frame to an LED output. Sequential follows collection order; Random chooses a different pattern at each change. An empty collection produces a black preview.',
    'With Beat Transitions off, each pattern holds for a random time between Min Time and Max Time before changing. With it on, that time becomes a cooldown: once it expires, the next fresh beat starts the transition. The next cooldown begins after the transition finishes. No new beat means no automatic pattern change.',
    'Audio supplies the collected patterns and the default beat signal in preview. Connect a separate Beat Detect output to Beat when you want an explicit trigger; that wire takes priority. Player Particles can add beat-triggered bursts independently of whether Beat Transitions is enabled.',
    'Use the preview transport for local music. On hardware, the SD music player needs an SD Card and an audio output stage, and can play tracks without pre-analysed show files. Performance Generator is the separate workflow for an authored, track-timed show. The SD player uses decoder beats when Beat is unwired.',
  ],
  steps: [
    'Add saved patterns to Pattern Collection, connect its Patterns output to Music Player’s Patterns input, then connect Frame to the LED output. Use at least two patterns to see automatic changes.',
    'Connect Audio to the player. Choose the microphone, line input, or Music Player decoder source on the Audio node. For explicit beat control in preview, feed the same Audio into Beat Detect and connect Beat Detect’s Beat output to the player’s Beat input.',
    'Choose Pattern Order and set Min Time, Max Time, and the transition duration. Enable Beat Transitions to wait for a beat after each cooldown. For example, 4–12 seconds means a random cooldown in that range, then a wait for the next beat; 12 seconds is not a forced change deadline.',
    'Optionally connect Transitions for a transition pool, Player Particles for bursts, and Player Controls for transport or lighting controls. Use Expose inputs… to reveal individual control actions or timing/volume sockets. A connected socket remains visible.',
  ],
  propertyNote: 'Values below are factory defaults. Timing values are in seconds. Wired Min Time, Max Time, Transition, and Volume inputs override their matching fields. Beat Transitions starts off, so adding a player does not require a beat source.',
  inputs: {
    audio: 'Audio for the collected patterns and, in preview, the default beat signal. Choose the source on an Audio node. Without Audio or a wired Beat signal, beat-driven changes cannot advance in preview; timed changes still work.',
    controls: 'A Player Controls node or compatible Controls bundle supplies play/pause, previous/next track, volume, LED on/off, brightness, and pattern-selection commands. Without this wire, use the preview transport and the player’s own settings.',
    patternset: 'Connect Pattern Collection’s Patterns output. Collection order defines Sequential playback. No selected patterns produces a black frame; one pattern keeps playing without automatic transitions.',
    transitions: 'Connect a Transitions node to choose the styles available in preview. An unwired or empty pool uses crossfade. The generic SD music player currently uses crossfade.',
    particleFx: 'Connect Player Particles to configure beat-triggered bursts, colour, style, and intensity. Bursts do not wait for the pattern cooldown and do not require Beat Transitions to be enabled. Unwired means no overlay.',
    beat: 'An optional boolean trigger that overrides the default audio beat. A false-to-true edge can start a pattern change only after the cooldown and with Beat Transitions enabled. A held true value cannot trigger repeatedly. For SD builds, use decoder-fed Beat Detect or a supported control signal; microphone-fed Beat Detect is not supported by the SD control graph.',
  } as Record<string, string>,
  outputs: {
    frame: 'The current pattern, including any transition and particle overlay. Connect it to the LED output, or process it through frame effects first.',
    display: 'The player’s track, playback, and pattern information in one connection. Feed a display panel for a now-playing screen, or Song Info to expose fields such as title and artist. Missing track metadata stays blank.',
  } as Record<string, string>,
}
