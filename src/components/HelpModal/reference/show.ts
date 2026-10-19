import { example, MATRIX } from './example'
import type { NodeReferenceMap } from './types'

const SHOW_OUTCOME = 'Add saved patterns to the Pattern Collection to see the show play.'

export const SHOW_REFERENCE: NodeReferenceMap = {
  MusicLibrary: {
    overview: [
      'Music Library holds the songs for a music-synced show. Double-click it to open the library: drop in MP3 files and Studio analyses each one — beats, sections, energy and mood — in the browser.',
      'Its Music output feeds a Performance Generator, which turns the analysis into a timed light show for each song. The songs and their shows are written to the SD card when you upload.',
    ],
    steps: [
      'Double-click the node and drop MP3 files into the library. Wait for each analysis to finish.',
      'Wire Music into a Performance Generator, and the generator’s Show into the LED output.',
      'Add an SD Card part and an amplifier on the Hardware tab, then upload to write the card and flash the player.',
    ],
    outputs: {
      music: 'The analysed songs, for a Performance Generator.',
    },
    outcome: 'Drop songs into the library and the Performance Generator builds a show for each one.',
    example: example({
      featured: 'MusicLibrary',
      title: 'Songs in, timed shows out',
      nodes: {
        songs: ['MusicLibrary'],
        shows: ['PerformanceGenerator', { paletteMode: 'mood' }],
      },
      wires: ['songs.music > shows.music'],
      explanation: 'Music Library analyses the songs you drop into it and passes them to Performance Generator, which plans a show for each: patterns on the sections, flashes on the beats, palettes from the mood. The generator’s Show goes to the LED output that will play it.',
      preview: 'The {output} plays the generated show once songs are analysed; press play in the Performance Generator body to watch it.',
      workflow: true,
    }),
  },

  Transition: {
    overview: [
      'Transition moves from one frame to another in one of twenty-one styles: crossfade, wipe, dissolve, iris, clock wipe, push, checkerboard, blinds, ripple, spiral, curtain, zoom, dolly, card flip, cube rotate, door swing and more.',
      'T is how far the change has gone: 0 shows only From, 1 only To. Wire a ramp, a beat envelope or a knob into T. Direction, axis, tile size, slat count and turns tune the styles that use them.',
      'On the canvas the node takes the name of its style. The Music Player picks transitions for itself from a Transition Pool; this node is for building your own.',
    ],
    inputs: {
      a: 'The frame to change from.',
      b: 'The frame to change to.',
      t: 'How far through the change, 0 (From) to 1 (To).',
    },
    outputs: {
      frame: 'The mix of the two frames at T.',
    },
    example: example({
      featured: 'Transition',
      title: 'An iris opening from night into day',
      nodes: {
        night: ['Starfield', { speed: 0.25, palette: 'ice' }],
        day: ['Sunrise', { mode: 'manual', progress: 0.9 }],
        open: ['Wave', { frequency: 0.1, amplitude: 1, unipolar: true, waveform: 'triangle' }],
        iris: ['Transition', { transitionType: 'iris' }],
      },
      wires: ['night.frame > iris.a', 'day.frame > iris.b', 'open.result > iris.t'],
      explanation: 'A slow triangle Wave drives Transition’s T from 0 to 1 and back. In Iris style a circle of warm daylight opens from the centre over the starfield, grows to fill the matrix, then closes again.',
      preview: 'The {output} shows a circle of warm light opening over a field of stars.',
    }),
  },

  ControlMap: {
    overview: [
      'Player Controls gathers buttons, knobs and other controls onto one Controls wire for a Music Player, a Pattern Slideshow, a Performance Generator or an LED output.',
      'Each function has its own input: play/pause, previous and next track, volume, volume up and down, LED on/off, brightness and its steps, and pattern selection. A fresh node shows the four transport rows; Expose input… reveals the rest.',
      'Debounce cleans up mechanical buttons, and the step and repeat settings decide how far a held Up or Down button moves volume or brightness and how fast. Controls In chains another bundle — a touch screen, another Player Controls — into this one.',
    ],
    inputs: {
      controlsIn: 'Another Controls bundle to merge in: a touch screen or a second Player Controls.',
    },
    outputs: {
      controls: 'Every connected control, as one Controls bundle.',
    },
    outcome: 'Add patterns to the collection, then press the Button node to pause and turn the knob to set the volume.',
    example: example({
      featured: 'ControlMap',
      title: 'A play button and a volume knob for the player',
      nodes: {
        play: ['ButtonInput'],
        volume: ['PotInput'],
        controls: ['ControlMap'],
        patterns: ['PatternCollection'],
        player: ['PatternMaster'],
      },
      wires: ['play.pressed > controls.playPause', 'volume.value > controls.volume', 'controls.controls > player.controls', 'patterns.patternset > player.patternset'],
      explanation: 'Player Controls takes a Button on Play / Pause and a Potentiometer on Volume, and sends both to the Music Player on one Controls wire. Add more buttons on the other rows without adding more wires to the player.',
      preview: SHOW_OUTCOME + ' The Button then pauses and resumes it, and the knob sets the music volume of the {output} show.',
      workflow: true,
    }),
  },

  PlayerParticles: {
    overview: [
      'Player Particles configures the burst of sparks a Music Player can throw over its patterns on each beat. It starts switched on: pick one of seventeen spark styles, set the colour and intensity, or let each burst choose a random style or colour.',
      'The bursts are independent of pattern changes: they follow the beat whether or not Beat Transitions is on. Under Frequency, Bursts in a Row sets how many beats in a row each throw a burst, and Rest sets the pause before the next run; a Rest of 0 bursts on every beat. Min Energy skips beats while the track is quieter than its level, so sparks keep to the loud passages. Wire buttons, knobs or colours into its inputs to change the effect live.',
    ],
    inputs: {
      color: 'Spark colour while Random Color is off.',
    },
    outputs: {
      particleFx: 'The overlay settings, for the Music Player’s Particle FX input.',
    },
    outcome: SHOW_OUTCOME + ' With Enabled on, sparks burst over them in runs of beats with a rest between.',
    example: example({
      featured: 'PlayerParticles',
      title: 'Golden sparks on every beat, at the press of a button',
      nodes: {
        sparks: ['ButtonInput'],
        gold: ['Color', { color: '#ffb020' }],
        fx: ['PlayerParticles', { style: 4, intensity: 0.85 }],
        mic: ['MicInput'],
        patterns: ['PatternCollection'],
        player: ['PatternMaster'],
      },
      wires: ['sparks.pressed > fx.enabled', 'gold.color > fx.color', 'fx.particleFx > player.particleFx', 'mic.audio > player.audio', 'patterns.patternset > player.patternset'],
      explanation: 'Player Particles sets up a golden spark burst and hands it to the Music Player. The Button enables the overlay while held, so a performer can add sparks to the beat on demand.',
      preview: 'Once patterns play on the {output}, hold the Button node and golden sparks burst on the beat.',
      workflow: true,
    }),
  },

  PatternMaster: {
    overview: [
      'Music Player runs saved patterns from a Pattern Collection and sends the finished frame to an LED output. Sequential follows collection order; Random chooses a different pattern at each change. Sequence plays the steps you edit, and with Beat Transitions on a hold counts beats. An empty collection produces a black preview. Energy Pacing and Dwells & Bursts stay off during a sequence.',
      'With Beat Transitions off, each pattern holds for a random time between Min Time and Max Time before changing. With it on, that time becomes a cooldown: once it expires, the next fresh beat starts the transition. The next cooldown begins after the transition finishes. No new beat means no automatic pattern change.',
      'Two options vary that rhythm. Energy Pacing leans each hold toward Min Time while the music is intense and toward Max Time while it is calm, judged against the track’s own recent loud and quiet passages. Dwells & Bursts now and then keeps one pattern for four times Max Time, and now and then changes three to five patterns in quick succession. With Beat Transitions on, every change still lands on a beat.',
      'Audio supplies the collected patterns and the default beat signal in preview. Connect a separate Beat Detect output to Beat when you want an explicit trigger; that wire takes priority. Player Particles can add beat-triggered bursts independently of whether Beat Transitions is enabled.',
      'Use the preview transport for local music. On hardware, the SD music player needs an SD Card and an audio output stage, and can play tracks without pre-analysed show files. Performance Generator is the separate workflow for an authored, track-timed show. The SD player uses decoder beats when Beat is unwired.',
    ],
    steps: [
      'Add saved patterns to Pattern Collection, connect its Patterns output to Music Player’s Patterns input, then connect Frame to the LED output. Use at least two patterns to see automatic changes.',
      'Connect Audio to the player. Choose the microphone, line input, or Music Player decoder source on the Audio node. For explicit beat control in preview, feed the same Audio into Beat Detect and connect Beat Detect’s Beat output to the player’s Beat input.',
      'Choose Pattern Order and set Min Time, Max Time, and the transition duration. Enable Beat Transitions to wait for a beat after each cooldown. For example, 4–12 seconds means a random cooldown in that range, then a wait for the next beat; 12 seconds is not a forced change deadline.',
      'Optionally connect a Transition Pool for transition styles, Player Particles for bursts, and Player Controls for transport or lighting controls. Use Expose input… to reveal individual control actions or timing and volume sockets. Previous and Next track change the song; Previous and Next Pattern browse the collection, and Confirm commits that choice. A connected socket remains visible.',
    ],
    propertyNote: 'Values below are factory defaults. Timing values are in seconds. Wired Min Time, Max Time, Transition, and Volume inputs override their matching fields. Beat Transitions starts off, so adding a player does not require a beat source.',
    inputs: {
      audio: 'Audio for the collected patterns and, in preview, the default beat signal. Choose the source on an Audio node. Without Audio or a wired Beat signal, beat-driven changes cannot advance in preview; timed changes still work.',
      controls: 'A Player Controls node or compatible Controls bundle supplies play/pause, previous/next track, volume, LED on/off, brightness, and pattern-selection commands. Without this wire, use the preview transport and the player’s own settings.',
      patternset: 'Connect Pattern Collection’s Patterns output. Collection order defines Sequential playback. No selected patterns produces a black frame; one pattern keeps playing without automatic transitions.',
      transitions: 'Connect a Transition Pool to choose the styles available in preview. An unwired or empty pool uses crossfade. The generic SD music player currently uses crossfade.',
      particleFx: 'Connect Player Particles to configure beat-triggered bursts, colour, style, and intensity. Bursts do not wait for the pattern cooldown and do not require Beat Transitions to be enabled. Unwired means no overlay.',
      beat: 'An optional boolean trigger that overrides the default audio beat. A false-to-true edge can start a pattern change only after the cooldown and with Beat Transitions enabled. A held true value cannot trigger repeatedly. For SD builds, use decoder-fed Beat Detect or a supported control signal; microphone-fed Beat Detect is not supported by the SD control graph.',
    },
    outputs: {
      frame: 'The current pattern, including any transition and particle overlay. Connect it to the LED output, or process it through frame effects first.',
      display: 'The player’s track, playback, and pattern information in one connection. Feed a display panel for a now-playing screen, or Song Info to expose fields such as title and artist. Missing track metadata stays blank.',
    },
    outcome: 'Add saved patterns in Pattern Collection, then choose timed or beat-triggered changes on Music Player.',
    example: example({
      featured: 'PatternMaster',
      title: 'Run a collection with beat-triggered changes',
      nodes: {
        patterns: ['PatternCollection'],
        mic: ['MicInput'],
        transitions: ['TransitionSet'],
        beat: ['BeatDetect'],
        controls: ['ControlMap'],
        particles: ['PlayerParticles'],
        target: ['PatternMaster'],
      },
      wires: [
        'patterns.patternset > target.patternset',
        'mic.audio > target.audio',
        'mic.audio > beat.audio',
        'beat.beat > target.beat',
        'transitions.transitions > target.transitions',
        'controls.controls > target.controls',
        'particles.particleFx > target.particleFx',
      ],
      explanation: 'Add at least two saved patterns to Pattern Collection. Audio feeds the player and Beat Detect; Beat Detect supplies the explicit Beat trigger. Enable Beat Transitions on Music Player to wait for a fresh beat after the Min Time–Max Time cooldown. Transition Pool chooses the preview transition styles, Player Controls carries transport and lighting commands, and Player Particles configures independent beat bursts.',
      preview: 'The collection starts empty, so the {output} is black until you add patterns. With Beat Transitions off, patterns change on the random timer. With it on, early beats are ignored and the next beat after the cooldown starts the change.',
      workflow: true,
    }),
  },

  SongInfo: {
    overview: [
      'Song Info opens a Music Player’s report into one wire per field: title, artist, album, genre, year, status, whether it is playing, elapsed, duration, remaining, progress, volume and bitrate.',
      'You rarely need it for a display — a Display Panel reads the player’s Display wire directly. Use Song Info when one field must travel on its own cable: a title scrolling across the LEDs, a progress bar, a light that turns on only while music plays.',
    ],
    inputs: {
      display: 'A Music Player’s or Performance Generator’s Display output.',
    },
    outputs: {
      title: 'Track title.',
      artist: 'Artist.',
      album: 'Album.',
      genre: 'Genre.',
      year: 'Year, as text.',
      status: 'Playback state, as text.',
      playing: 'True while a track is playing.',
      elapsed: 'Seconds into the track.',
      duration: 'Track length in seconds.',
      remaining: 'Seconds left.',
      progress: 'How far through the track, 0 to 1.',
      volume: 'Playback volume, 0 to 1.',
      bitrate: 'The file’s bitrate in kbit/s.',
    },
    outcome: 'Play a track with tags and the title scrolls along the bottom of the show.',
    example: example({
      featured: 'SongInfo',
      title: 'Scroll the song title over the show',
      nodes: {
        patterns: ['PatternCollection'],
        player: ['PatternMaster'],
        info: ['SongInfo'],
        title: ['Text', { scroll: 8, wrap: true, y: 1, vAlign: 'bottom', r: 255, g: 255, b: 255 }],
        overlay: ['Blend', { blendMode: 'screen', amount: 1 }],
        output: ['MatrixOutput', MATRIX(32, 16)],
      },
      wires: ['patterns.patternset > player.patternset', 'player.display > info.display', 'info.title > title.text', 'player.frame > overlay.a', 'title.frame > overlay.b'],
      explanation: 'Song Info pulls the track title out of the Music Player’s Display wire. Text scrolls it along the bottom of the matrix, and Blend screens it over the player’s own frame.',
      preview: 'With patterns in the collection and a tagged track playing, the {output} shows the show with the song title scrolling along its bottom edge.',
      workflow: true,
    }),
  },

  Sequencer: {
    overview: [
      'Sequencer plays up to four frames in turn: each holds for Interval seconds, then crossfades into the next over Fade seconds. Unwired slots are skipped.',
      'It is the simplest way to rotate between a few looks without a Pattern Collection. For many patterns, random order or music, use Pattern Slideshow or Music Player.',
    ],
    inputs: {
      p0: 'The first frame.',
      p1: 'The second frame.',
      p2: 'The third frame.',
      p3: 'The fourth frame.',
    },
    outputs: {
      frame: 'The current frame, or the crossfade between two.',
    },
    example: example({
      featured: 'Sequencer',
      title: 'Four moods on rotation',
      nodes: {
        sea: ['Pacifica', { palette: 'ocean' }],
        hearth: ['Fire', { fireStyle: 'classic', palette: 'fire' }],
        aurora: ['Noise', { noiseType: 'fbm', palette: 'aurora', speed: 0.25 }],
        stars: ['TwinkleFox', { palette: 'party', density: 0.5 }],
        rotation: ['Sequencer', { interval: 3, fade: 1 }],
      },
      wires: ['sea.frame > rotation.p0', 'hearth.frame > rotation.p1', 'aurora.frame > rotation.p2', 'stars.frame > rotation.p3'],
      explanation: 'Sequencer holds each of four looks — sea, hearth, aurora and twinkling lights — for three seconds, crossfading over one second into the next, then loops.',
      preview: 'The {output} moves from ocean waves to fire to aurora clouds to twinkling lights, blending between each.',
    }),
  },

  PatternCollection: {
    overview: [
      'Pattern Collection is the set of patterns a show plays. Pick saved patterns from your Pattern Library in its body, in the order you want them, or wire a group’s frame into Pattern and confirm to absorb it.',
      'Each row has a weight, calm / lively / peak tags, and a restart or resume entry. Weight 1 is the usual pick. Weight 0 is skipped automatically and can still be chosen by hand, by a timeline, or by a sequence step. Restart clears the pattern as the transition that brings it in begins. Resume keeps what it was doing.',
      'Tag a pattern with song sections to limit where a Performance Generator show may use it; untagged patterns can play anywhere. Energy tags are separate and steer the Music Player and the Performance Generator.',
      'Its Patterns output feeds a Music Player, a Pattern Slideshow or a Performance Generator. Each collected pattern is compiled into the sketch as its own function.',
    ],
    inputs: {
      pattern: 'Wire a group’s frame here and confirm to absorb it into the collection. It leaves the canvas.',
    },
    outputs: {
      patternset: 'The collected patterns, in play order.',
    },
    outcome: 'Pick saved patterns in the collection’s body and the slideshow starts showing them.',
    example: example({
      featured: 'PatternCollection',
      title: 'The smallest show there is',
      nodes: {
        patterns: ['PatternCollection'],
        slideshow: ['PatternSlideshow', { order: 'Sequential', interval: 8 }],
      },
      wires: ['patterns.patternset > slideshow.patternset'],
      explanation: 'Pattern Collection holds the patterns; Pattern Slideshow plays them eight seconds each, in order, blending between them. Swap the slideshow for a Music Player to make the same collection dance to music.',
      preview: SHOW_OUTCOME + ' The {output} then shows each one for eight seconds.',
      workflow: true,
    }),
  },

  TransitionSet: {
    overview: [
      'Transition Pool is a set of transition styles for a show to choose from. Tick the styles you want in its body; the player picks among them at each pattern change.',
      'Wire it into a Music Player or a Pattern Slideshow for live shows, or a Performance Generator for a music-synced one. Without a pool, shows crossfade.',
    ],
    outputs: {
      transitions: 'The chosen styles.',
    },
    outcome: SHOW_OUTCOME + ' Each change then uses one of the ticked transition styles.',
    example: example({
      featured: 'TransitionSet',
      title: 'Give a show its own set of moves',
      nodes: {
        patterns: ['PatternCollection'],
        moves: ['TransitionSet', { transitions: ['iris', 'spiral', 'cube', 'blinds'] }],
        player: ['PatternMaster'],
      },
      wires: ['patterns.patternset > player.patternset', 'moves.transitions > player.transitions'],
      explanation: 'Transition Pool offers iris, spiral, cube and blinds, and the Music Player picks one of them at random each time it changes pattern instead of always crossfading.',
      preview: 'Once patterns play on the {output}, each change uses one of the four chosen transitions.',
      workflow: true,
    }),
  },

  PatternSlideshow: {
    overview: [
      'Pattern Slideshow plays a Pattern Collection on a timer — the show without the music. Each pattern holds for its Hold time, then blends into the next.',
      'Sequential walks the collection in order; Random never repeats the pattern just shown. Sequence loops the steps you edit: a pattern or a tag, a hold, and a transition. Previous and Next move between those steps. Display feeds a panel that shows which pattern is playing.',
      'Turn on Audio Reactive to let audio patterns in the collection listen to a wired Audio source; in silence they fade to black.',
    ],
    inputs: {
      audio: 'Sound for audio patterns in the collection, used when Audio Reactive is on.',
      controls: 'A Controls bundle for pattern browsing.',
      patternset: 'The patterns to play, from a Pattern Collection.',
      transitions: 'A Transition Pool to choose blend styles from.',
    },
    outputs: {
      frame: 'The current pattern, including any blend.',
      display: 'Which pattern is playing, for a display.',
    },
    outcome: SHOW_OUTCOME + ' The Button then skips to the next one.',
    example: example({
      featured: 'PatternSlideshow',
      title: 'A slideshow with a skip button',
      nodes: {
        patterns: ['PatternCollection'],
        skip: ['ButtonInput'],
        slideshow: ['PatternSlideshow', { order: 'Random', interval: 20, transitionSec: 1.5 }],
      },
      wires: ['patterns.patternset > slideshow.patternset', 'skip.pressed > slideshow.patternNext'],
      explanation: 'Pattern Slideshow shows a random pattern from the collection every twenty seconds, blending over a second and a half. A Button on Next Pattern lets anyone skip ahead.',
      preview: 'Once the collection holds patterns, the {output} shows one for twenty seconds before blending to the next. Press the Button node to skip.',
      workflow: true,
    }),
  },

  PerformanceGenerator: {
    overview: [
      'Performance Generator turns analysed songs into choreographed light shows. It reads each song’s beats, sections and energy, and plans what plays when: which pattern for the verse and the chorus, flashes on the beats, surges in loud passages, palettes from the mood. Edit lanes opens the same show under the section bands, beat grid and energy envelope. Speed, brightness and energy can ramp, and an edit locks the section it falls in so Regenerate keeps that span.',
      'With a Pattern Collection wired, it schedules your own patterns; Use Group Inputs also feeds each pattern’s exposed speed, energy and palette from the music. Without one it uses its built-in patterns. A Transition Pool widens the styles it moves between.',
      'Its Show output names the LED output the show plays on. The shows and songs are written to the SD card at upload, and the board plays them with no graph running — press play in the node body to watch a show first.',
    ],
    steps: [
      'Wire a Music Library into Music, and optionally a Pattern Collection and a Transition Pool.',
      'Wire Show to the LED output the show should play on.',
      'Add an SD Card part and an amplifier on the Hardware tab, then upload.',
    ],
    inputs: {
      music: 'The analysed songs, from a Music Library.',
      patternset: 'Your patterns to schedule, from a Pattern Collection. Unwired, the built-in patterns are used.',
      transitions: 'Transition styles to choose from, from a Transition Pool.',
      controls: 'A Controls bundle for the SD player’s transport, volume and lights.',
    },
    outputs: {
      frame: 'Names the LED output the show plays on. The board plays the show from the card, not from this wire.',
      display: 'The playing track and pattern, for a display.',
    },
    outcome: 'Analyse songs in the Music Library, then press play in the generator’s body to watch the show.',
    example: example({
      featured: 'PerformanceGenerator',
      title: 'A show planned from the music',
      nodes: {
        music: ['MusicLibrary'],
        patterns: ['PatternCollection'],
        transitions: ['TransitionSet'],
        generator: ['PerformanceGenerator', { paletteMode: 'mood', patternHold: 8 }],
      },
      wires: ['music.music > generator.music', 'patterns.patternset > generator.patternset', 'transitions.transitions > generator.transitions'],
      explanation: 'Performance Generator plans a show for every song in the Music Library, choosing among your collected patterns for each section, holding each for at least eight seconds, and moving between them with styles from the Transition Pool.',
      preview: 'Once songs are analysed and patterns collected, the generator’s player shows what the {output} will do for each track.',
      workflow: true,
    }),
  },

  SDCard: {
    overview: [
      'SD Card is the card module the music-synced player reads from. It is a bench part, not something you wire: it configures the four SPI pins, and upload writes the songs and shows onto it.',
      'The audio itself goes through a separate Amplifier part, and the LED settings come from the LED output.',
    ],
    steps: [
      'Add the SD Card from the Hardware tab and wire CS, SCK, MISO and MOSI to the pins shown.',
      'Format the card FAT32 and insert it. Upload writes the songs and show files.',
    ],
    outcome: 'The card holds the songs and shows; nothing changes in the LED preview.',
    example: example({
      featured: 'SDCard',
      title: 'Where the songs and shows are stored',
      nodes: {
        music: ['MusicLibrary'],
        generator: ['PerformanceGenerator'],
        card: ['SDCard'],
      },
      wires: ['music.music > generator.music'],
      explanation: 'The SD Card sits on the bench without wires. When you upload, the songs from the Music Library and the shows from the Performance Generator are written to it, and the player reads them from there.',
      preview: 'SD Card has no picture of its own; the {output} plays whatever the generator planned.',
      workflow: true,
    }),
  },
}
