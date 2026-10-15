import { example, RING } from './example'
import type { NodeReferenceMap } from './types'

const LIVE_ONLY = 'It reads FastLED’s own detector, so it needs live sound from a microphone, line input or the decoder. With no live source, or a recording made before the detector existed, every output reads zero or false.'

export const AUDIO_REFERENCE: NodeReferenceMap = {
  FFTAnalyzer: {
    overview: [
      'FFT Analyzer splits sound into three levels — bass, mids and treble — each from 0 to 1. It is the usual first step after an Audio node when a patch should move with the music.',
      'Give each band its own job: bass for size and weight, mids for body and colour, treble for sparkle and fine detail. Three separate wires make it easy to try a band on a different input.',
      'Bands sets how finely the spectrum is cut before it is averaged into the three outputs. Gain lifts a quiet source, Smoothing steadies jitter at the cost of slower hits, and Tilt lifts the highs so cymbals register as strongly as the kick.',
    ],
    inputs: {
      audio: 'The sound to analyse, from an Audio node.',
    },
    outputs: {
      bass: 'Low-frequency level, 0 to 1: kick drum and bass line.',
      mids: 'Midrange level, 0 to 1: vocals, guitars, keys.',
      treble: 'High-frequency level, 0 to 1: cymbals, hi-hats, air.',
    },
    propertyNote: 'Smoothing and Gain have the most effect on how a patch feels: try a lower Smoothing for snappy drums and a higher one for slow washes.',
    example: example({
      featured: 'FFTAnalyzer',
      title: 'A hexagon that thumps with the bass and fizzes with the treble',
      nodes: {
        mic: ['MicInput'],
        fft: ['FFTAnalyzer', { smoothing: 0.6, gain: 1.3, tilt: 0.4 }],
        size: ['MapRange', { inMin: 0, inMax: 1, outMin: 2.5, outMax: 7.5 }],
        hex: ['Shape', { shape: 'polygon', sides: 6, fill: '#2a0a5e', edge: '#ff4fd8', thickness: 1.5 }],
        fizz: ['Glitter', { glitterMode: 'add', r: 180, g: 255, b: 255 }],
      },
      wires: [
        'mic.audio > fft.audio',
        'fft.bass > size.value',
        'size.result > hex.size',
        'hex.frame > fizz.frame',
        'fft.treble > fizz.density',
      ],
      explanation: 'FFT Analyzer gives each band its own job. Bass, through Map Range, swells the hexagon from a small outline to most of the matrix; treble goes straight to Glitter’s density, so cymbals spray cyan sparkles over it.',
      preview: 'Play music near the microphone. The {output} shows a hexagon that punches outward on every kick, with sparkles that thicken on the hi-hats.',
    }),
  },

  BeatDetect: {
    overview: [
      'Beat Detect listens for the beat. Beat is true for one frame on each hit, and BPM estimates the tempo — enough to flash, step, or change something exactly on the music.',
      'On live audio the beat comes from FastLED’s own detector. Threshold is how sure it must be before it fires: raise it if every snare counts, lower it if obvious kicks are missed. After a beat it waits a little over half a beat before it can fire again, so a flam fires once.',
      'The other outputs are tuning diagnostics. On live audio Threshold and Cooldown report the gate FastLED’s beat passes through; Flux, Onset and Contrast come from the spectral-flux detector a baked show envelope runs, and read 0 on live audio. Attack and Decay shape only that baked envelope.',
    ],
    inputs: {
      audio: 'The sound to listen to, from an Audio node.',
    },
    outputs: {
      beat: 'True for one frame on each detected beat.',
      bpm: 'Estimated tempo in beats per minute.',
      flux: 'Spectral flux from a baked show’s detector: how fast the spectrum is changing. 0 on live audio.',
      onset: 'Onset strength from a baked show’s detector. 0 on live audio.',
      contrast: 'How far the onset stands above its baseline, from a baked show’s detector. 0 on live audio.',
      threshold: 'The threshold the beat is currently gated by.',
      cooldownMs: 'How long after a beat the next one is held off, in milliseconds.',
    },
    propertyNote: 'Threshold is the setting to tune. Attack and Decay shape only a baked show envelope; live audio uses FastLED’s detector.',
    example: example({
      featured: 'BeatDetect',
      title: 'A raindrop falls into the pond on every beat',
      nodes: {
        mic: ['MicInput'],
        beat: ['BeatDetect', { threshold: 0.45 }],
        drops: ['RainRipples', { palette: 'laguna', spawnSpread: 0.8, decay: 1.4 }],
        pond: ['Pacifica', { palette: 'deepsea', speed: 0.2 }],
        surface: ['Blend', { blendMode: 'screen', amount: 1 }],
      },
      wires: ['mic.audio > beat.audio', 'beat.beat > drops.trigger', 'pond.frame > surface.a', 'drops.frame > surface.b'],
      explanation: 'Beat Detect turns the music into one pulse per beat, and each pulse drops a new ripple into Rain Ripples. Blend screens the ripples over a dark Pacifica pond, so steady four-on-the-floor music rings the water in time and quiet passages leave it still.',
      preview: 'Play music near the microphone. The {output} shows a dark, gently moving pond with a new ring spreading on every beat.',
    }),
  },

  PercussionDetect: {
    overview: [
      'Percussion Detect pulls three drum lanes out of one audio stream: Kick for low thumps, Snare for midrange cracks, and Hi-Hat for fast high ticks. Each is an envelope that jumps on a hit and rings down.',
      'Use it when a single beat is too blunt — let the kick move something big, the snare add a burst, and the hi-hat scatter fine detail.',
      'Sensitivity lowers the hit threshold for all three lanes. Decay sets how long each envelope rings, and Separation stops one loud drum from lighting all three.',
    ],
    inputs: {
      audio: 'The sound to listen to, from an Audio node.',
    },
    outputs: {
      kick: 'Kick drum envelope, 0 to 1. Jumps on a low thump and rings down.',
      snare: 'Snare envelope, 0 to 1. Jumps on a midrange crack.',
      hihat: 'Hi-hat envelope, 0 to 1. Jumps on fast high ticks.',
    },
    propertyNote: 'If every hit lights every lane, raise Separation. If the lanes miss hits on a quiet source, raise Sensitivity.',
    example: example({
      featured: 'PercussionDetect',
      title: 'A bonfire that roars with the kick drum',
      nodes: {
        mic: ['MicInput'],
        drums: ['PercussionDetect', { sensitivity: 0.6, separation: 0.6, decay: 0.75 }],
        fire: ['Fire', { fireStyle: 'classic', palette: 'fire', cooling: 65 }],
        sparks: ['Glitter', { glitterMode: 'add', r: 255, g: 200, b: 90 }],
      },
      wires: [
        'mic.audio > drums.audio',
        'drums.kick > fire.intensity',
        'fire.frame > sparks.frame',
        'drums.hihat > sparks.density',
      ],
      explanation: 'Percussion Detect separates the drums. The kick envelope sets Fire’s intensity, so the flames leap on every thump and sink between them; the hi-hat envelope sets Glitter’s density, throwing sparks above the fire on each tick.',
      preview: 'Play a track with a clear drum kit. The {output} shows a fire that jumps up the matrix on the kicks, with golden sparks on the hi-hats.',
    }),
  },

  AudioFeatures: {
    overview: [
      'Audio Features listens for the shape of the music rather than individual hits. Vocals estimates how much voice-like midrange there is, Energy tracks overall loudness, and Silence goes true when the sound drops below the gate.',
      'Energy is a good master intensity for a whole patch. Vocals can bring in a melodic layer when the singer comes in. Silence is the switch for between songs: dim, pause, or swap to a calm idle look.',
      'Sensitivity scales Energy and Vocals, Silence Gate sets how quiet counts as silence, and Smoothing keeps the outputs from twitching.',
    ],
    inputs: {
      audio: 'The sound to listen to, from an Audio node.',
    },
    outputs: {
      vocals: 'How voice-like the midrange is, 0 to 1. A heuristic, not a singer detector.',
      energy: 'Overall loudness, 0 to 1, smoothed.',
      silence: 'True while the energy is below the Silence Gate.',
    },
    propertyNote: 'Raise Silence Gate if room noise keeps the patch awake between songs.',
    example: example({
      featured: 'AudioFeatures',
      title: 'Settle into a calm breath between songs',
      nodes: {
        mic: ['MicInput'],
        features: ['AudioFeatures', { sensitivity: 0.6, gate: 0.15, smoothing: 0.8 }],
        party: ['Spiral', { palette: 'cottoncandy', arms: 3 }],
        idle: ['Breathe', { palette: 'deepsea', bpm: 8, minLevel: 0.08 }],
        choose: ['FrameSwitch'],
      },
      wires: [
        'mic.audio > features.audio',
        'features.energy > party.speed',
        'party.frame > choose.a',
        'idle.frame > choose.b',
        'features.silence > choose.sel',
      ],
      explanation: 'Audio Features drives two things. Energy sets how fast the Spiral turns, so loud sections spin and quiet ones drift. Silence switches Frame Switch to a slow deep-sea Breathe whenever the music stops, and back the moment it returns.',
      preview: 'Play music and the {output} shows a pastel spiral spinning with the loudness. Stop the music and it fades into a slow blue breath.',
    }),
  },

  Vibe: {
    overview: [
      'Vibe is the MilkDrop music model, ported from FastLED. Each band is divided by its own slow running average, so a level of 1.0 means “average for this song” and 2.0 means twice as loud as usual. A quiet track and a loud one drive a patch the same way.',
      'The levels are not limited to 0–1, so send them through Map Range before a 0–1 input. Each band also has a smoothed copy, and a Spike output that is true while the immediate level is above the smoothed one — a hit in progress.',
      LIVE_ONLY,
    ],
    inputs: {
      audio: 'The sound to listen to, from an Audio node.',
    },
    outputs: {
      bass: 'Bass relative to this song’s average: 1.0 is average, 2.0 twice as loud.',
      mid: 'Mids relative to this song’s average.',
      treble: 'Treble relative to this song’s average.',
      volume: 'Overall level relative to this song’s average.',
      bassAtt: 'A smoothed copy of Bass.',
      midAtt: 'A smoothed copy of Mid.',
      trebleAtt: 'A smoothed copy of Treble.',
      bassSpike: 'True while Bass is above its smoothed copy.',
      midSpike: 'True while Mid is above its smoothed copy.',
      trebleSpike: 'True while Treble is above its smoothed copy.',
    },
    propertyNote: 'Gain scales the levels and their smoothed copies. Spikes compare the two, so Gain never changes them.',
    example: example({
      featured: 'Vibe',
      title: 'Jump to warp speed on the cymbals',
      nodes: {
        mic: ['MicInput'],
        vibe: ['Vibe', { gain: 1 }],
        warp: ['MapRange', { inMin: 0.5, inMax: 2, outMin: 0.1, outMax: 1 }],
        stars: ['Starfield', { palette: 'ice', count: 90 }],
        kick: ['BeatFlash', { intensity: 0.6, decay: 0.8, r: 120, g: 160, b: 255 }],
      },
      wires: [
        'mic.audio > vibe.audio',
        'vibe.treble > warp.value',
        'warp.result > stars.speed',
        'stars.frame > kick.frame',
        'vibe.bassSpike > kick.beat',
      ],
      explanation: 'Vibe’s Treble is about 1.0 at this song’s average, so Map Range turns half-average into a gentle drift and double into full warp. Bass Spike fires Beat Flash whenever the bass jumps above its own smoothed level, lighting the starfield blue on each hit.',
      preview: 'Play music near the microphone. The {output} shows stars streaming outward, racing during bright passages and flashing on bass hits, at any volume.',
    }),
  },

  SongStructure: {
    overview: [
      'Song Structure follows the arc of a song: downbeats, buildups, drops, a stable tempo and the overall mood. It is FastLED’s structure detectors, brought out as wires.',
      'Downbeat and Drop are true for a single frame. Building stays true while energy climbs, and Buildup Progress runs from 0 to 1 across it. Beat Number counts through the measure and Measure Phase runs 0 to 1 across it. Valence (−1 dark to 1 bright) and Arousal (0 calm to 1 energetic) are heuristics from the spectrum, not a judgement of the music.',
      LIVE_ONLY,
    ],
    inputs: {
      audio: 'The sound to listen to, from an Audio node.',
    },
    outputs: {
      downbeat: 'True for one frame on the first beat of each measure.',
      beatNumber: 'Which beat of the measure this is, from 1.',
      measurePhase: 'Position through the current measure, 0 to 1.',
      building: 'True while energy is climbing toward a drop.',
      buildupProgress: 'How far through the buildup, 0 to 1. Reads 0 outside one.',
      drop: 'True for the one frame a bass burst follows a buildup.',
      dropImpact: 'Strength of the most recent drop.',
      tempoStable: 'True while the tempo has held steady.',
      valence: 'Mood from −1 (dark, unstable) to 1 (bright, calm).',
      arousal: 'Energy of the mood, 0 (calm) to 1 (energetic).',
    },
    example: example({
      featured: 'SongStructure',
      title: 'Race the heart through the buildup, strike on the drop',
      nodes: {
        mic: ['MicInput'],
        song: ['SongStructure'],
        racing: ['MapRange', { inMin: 0, inMax: 1, outMin: 50, outMax: 200 }],
        heart: ['Heartbeat', { palette: 'lava', strength: 0.7 }],
        strike: ['Lightning', { rate: 0.5, color: '#f2f6ff' }],
        storm: ['Blend', { blendMode: 'screen', amount: 1 }],
      },
      wires: [
        'mic.audio > song.audio',
        'song.buildupProgress > racing.value',
        'racing.result > heart.bpm',
        'song.drop > strike.trigger',
        'heart.frame > storm.a',
        'strike.frame > storm.b',
      ],
      explanation: 'Song Structure’s Buildup Progress, through Map Range, quickens Heartbeat from a resting 50 beats a minute to a frantic 200 as the tension builds. The Drop pulse fires Lightning, and Blend screens the white flash over the heart at the moment the bass lands.',
      preview: 'Play an electronic track. The {output} beats slowly in red, speeds up through each buildup, and flashes white on the drop.',
    }),
  },

  PitchDetect: {
    overview: [
      'Pitch Detect finds the note being sung or played. Hz is the frequency, Note is the MIDI note number (69 is A4 at 440 Hz), and Confidence says how clearly pitched the sound is. Note On is true for the single frame a new note starts.',
      'It listens between about 175 Hz and 1 kHz — roughly F3 to B5 — which covers voices, whistling and most melody lines. Bass notes, drums, chords and dense mixes read as unpitched, so Hz and Note fall to 0.',
      'Key Root (0 is C, 11 is B), Key Minor and Key Confidence come from FastLED’s key detector. They settle slowly; treat them as a mood rather than a chord chart.',
      LIVE_ONLY,
    ],
    inputs: {
      audio: 'The sound to listen to, from an Audio node.',
    },
    outputs: {
      hz: 'Frequency of the current note in hertz. 0 when nothing is pitched.',
      note: 'MIDI note number: 60 is middle C, 69 is A4.',
      noteOn: 'True for one frame when a note starts or moves by a semitone.',
      velocity: 'How strongly the note sounds while it is held, 0 to 1.',
      confidence: 'How clearly pitched the sound is, 0 to 1.',
      keyRoot: 'Detected key, 0 (C) to 11 (B).',
      keyMinor: 'True when the detected key is minor.',
      keyConfidence: 'How sure the key detector is, 0 to 1.',
    },
    example: example({
      featured: 'PitchDetect',
      title: 'Every note of the scale has its own colour',
      nodes: {
        mic: ['MicInput'],
        pitch: ['PitchDetect'],
        wheel: ['Expression', { formula: '(a - 12*floor(a/12)) * 30' }],
        hue: ['HSVToRGB', { s: 0.9, v: 1 }],
        swatch: ['GradientFrame', { rB: 0, gB: 0, bB: 0, vertical: true }],
      },
      wires: [
        'mic.audio > pitch.audio',
        'pitch.note > wheel.a',
        'wheel.result > hue.h',
        'hue.color > swatch.colorA',
      ],
      explanation: 'Pitch Detect reports the MIDI note being sung. Expression keeps only the note’s place in the octave and multiplies it by 30°, so C is red, E is green, G# is blue, and every octave of the same note shares its colour. HSV → RGB makes the colour and Gradient Frame fades it to black down the matrix.',
      preview: 'Sing or whistle steady notes near the microphone. The {output} turns a new colour with each note of the scale and returns to red when you stop.',
    }),
  },

  AudioHue: {
    overview: [
      'Audio → Hue turns the balance of bass, mids and treble into one hue from 0 to 360 degrees. A bass-heavy passage leans one way round the colour wheel; bright, cymbal-heavy passages lean the other.',
      'It is a shortcut for “colour follows the mix” without building the maths yourself. Wire FFT Analyzer’s three bands in and send Hue to HSV → RGB, a Beat Kaleidoscope’s Hue, or anything else that takes degrees.',
      'The three weights decide how much each band moves the hue. Their weighted sum is scaled to 0–360 and wraps past a full turn.',
    ],
    inputs: {
      bass: 'Bass level, 0 to 1, usually from FFT Analyzer.',
      mids: 'Mids level, 0 to 1.',
      treble: 'Treble level, 0 to 1.',
    },
    outputs: {
      hue: 'A hue in degrees, 0 to 360, wrapping past a full turn.',
    },
    propertyNote: 'The Bass, Mids and Treble fields are used only while their inputs are unwired.',
    example: example({
      featured: 'AudioHue',
      title: 'A flock that changes colour with the mix',
      nodes: {
        mic: ['MicInput'],
        fft: ['FFTAnalyzer', { smoothing: 0.75 }],
        hue: ['AudioHue', { bassWeight: 0.6, midsWeight: 0.3, trebleWeight: 0.4 }],
        colour: ['HSVToRGB', { s: 0.85, v: 1 }],
        flock: ['Boids', { colorMode: 'solid', count: 28, speed: 0.55 }],
      },
      wires: [
        'mic.audio > fft.audio',
        'fft.bass > hue.bass',
        'fft.mids > hue.mids',
        'fft.treble > hue.treble',
        'hue.hue > colour.h',
        'colour.color > flock.color',
      ],
      explanation: 'FFT Analyzer feeds all three bands to Audio → Hue, which turns their balance into a hue. HSV → RGB makes it a colour, and Boids paints its whole flock with it, so the swarm shifts colour as the music moves between bass and treble.',
      preview: 'Play music near the microphone. The {output} shows a flock wheeling across the matrix, its colour drifting round the wheel as the mix changes.',
    }),
  },

  FrequencyBand: {
    overview: [
      'Frequency Band gives one 0–1 level from a range of the spectrum you choose in hertz. Where FFT Analyzer splits sound into three fixed bands, this picks out exactly the part you care about: a kick at 60–120 Hz, a voice at 300–3000 Hz, a snare’s snap.',
      'The spectrum covers about 90 Hz to 5 kHz in sixteen bins, spaced logarithmically. A range narrower than one bin reads the nearest bin.',
      'Use several Frequency Band nodes on one Audio node to build your own set of bands.',
    ],
    inputs: {
      audio: 'The sound to listen to, from an Audio node.',
    },
    outputs: {
      level: 'Level of the chosen range, 0 to 1, after Gain and Smoothing.',
    },
    example: example({
      featured: 'FrequencyBand',
      title: 'Twinkles that open up when the singer comes in',
      nodes: {
        mic: ['MicInput'],
        voice: ['FrequencyBand', { lowHz: 300, highHz: 3000, gain: 1.6, smoothing: 0.75 }],
        stars: ['TwinkleFox', { palette: 'rosegold', speed: 0.45 }],
      },
      wires: ['mic.audio > voice.audio', 'voice.level > stars.density'],
      explanation: 'Frequency Band listens only to the 300–3000 Hz range where most singing sits, and its level sets how many of TwinkleFox’s lights are glowing. A sparse sky through the intro fills with rose-gold twinkles when the vocal starts.',
      preview: 'Play a song with vocals near the microphone. The {output} shows only a few twinkles during instrumental parts and fills with light while someone sings.',
    }),
  },

  StereoLevels: {
    overview: [
      'Stereo Levels reports the left and right channels separately, plus their Balance: 0 is all left, 1 is all right, and 0.5 is centred.',
      'Stereo needs a stereo source, such as the Line In part or the decoder. A microphone is mono, so both sides move together and Balance sits at 0.5.',
      'Use the levels to light the two ends of a build separately, or Balance to show where a sound sits in the mix.',
    ],
    inputs: {
      audio: 'The sound to listen to, from an Audio node with a stereo source.',
    },
    outputs: {
      left: 'Left channel level, 0 to 1.',
      right: 'Right channel level, 0 to 1.',
      balance: 'Where the sound sits: 0 all left, 0.5 centre, 1 all right.',
    },
    example: example({
      featured: 'StereoLevels',
      title: 'A dot that follows the sound across the stereo field',
      nodes: {
        line: ['LineInput'],
        stereo: ['StereoLevels'],
        pan: ['MapRange', { inMin: 0, inMax: 1, outMin: 0.08, outMax: 0.92 }],
        dot: ['Shape', { shape: 'ellipse', size: 2.5, filled: true, fill: '#ffd040', edge: '#ff6a00', thickness: 1 }],
        trails: ['Trails', { decay: 0.4 }],
      },
      wires: [
        'line.audio > stereo.audio',
        'stereo.balance > pan.value',
        'pan.result > dot.cx',
        'dot.frame > trails.frame',
      ],
      explanation: 'Stereo Levels compares the two channels of a line input. Balance, stretched across the matrix by Map Range, moves a golden dot left or right as instruments pan, and Trails leaves a glowing wake behind it.',
      preview: 'Play a stereo track into the line input. The {output} shows a golden dot sliding toward whichever side is louder, leaving a trail.',
    }),
  },

  BeatPhase: {
    overview: [
      'Beat Phase turns beats into smooth motion. Phase is a saw that rises from 0 to 1 across each beat and snaps back to 0 on the next one, so anything it drives moves in step with the music between hits.',
      'Wire Beat Detect’s Beat into Beat to keep it in sync with the song; between beats, or with nothing wired, it runs at its own BPM. Bar rises 0 to 1 over a whole bar and Count numbers the beats.',
      'Phase is ideal for anything that should travel once per beat: a dot round a ring, a palette scroll, a sweep.',
    ],
    inputs: {
      beat: 'A beat pulse, usually from Beat Detect. Each rising edge restarts Phase at 0.',
    },
    outputs: {
      phase: 'Position through the current beat, 0 to 1.',
      bar: 'Position through the current bar, 0 to 1.',
      count: 'Beats counted since start-up.',
    },
    example: example({
      featured: 'BeatPhase',
      title: 'A ring that fills once per bar, in time',
      nodes: {
        mic: ['MicInput'],
        beat: ['BeatDetect', { threshold: 0.45 }],
        phase: ['BeatPhase', { bpm: 100, beatsPerBar: 4 }],
        fill: ['Gauge', { gaugeStyle: 'ring', ringLeds: 24, arcStart: 0, palette: 'synthwave' }],
      },
      wires: ['mic.audio > beat.audio', 'beat.beat > phase.beat', 'phase.bar > fill.value'],
      output: RING(24),
      explanation: 'Beat Detect resyncs Beat Phase on every beat, and Bar rises from 0 to 1 over four of them. Gauge in ring style fills the LED ring with it, so the ring fills exactly once per bar and empties on the downbeat.',
      preview: 'Play music with a steady beat. The {output} fills clockwise from the top over each bar and starts again on the next.',
    }),
  },
}
