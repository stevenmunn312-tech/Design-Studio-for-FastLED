// Audio node definitions: ports, default properties, sidebar
// placement and Help descriptions. src/state/nodeLibrary.ts merges every
// category's definitions into NODE_LIBRARY in sidebar order.
import type { NodeDefinition } from '../../types'

export const AUDIO_DEFINITIONS: NodeDefinition[] = [
  {
    type: 'FFTAnalyzer',
    label: 'FFT Analyzer',
    category: 'audio',
    inputs: [
      { id: 'audio', label: 'Audio', dataType: 'audio' },
      { id: 'gain', label: 'Gain', dataType: 'float' },
      { id: 'smoothing', label: 'Smoothing', dataType: 'float' },
      { id: 'tilt', label: 'Tilt', dataType: 'float' },
    ],
    propertyInputs: {
      gain: 'gain', smoothing: 'smoothing', tilt: 'tilt',
    },

    outputs: [
      { id: 'bass', label: 'Bass', dataType: 'float' },
      { id: 'mids', label: 'Mids', dataType: 'float' },
      { id: 'treble', label: 'Treble', dataType: 'float' },
    ],
    defaultProperties: { bands: 24, gain: 1, smoothing: 0.72, tilt: 0 },
  },
  {
    type: 'BeatDetect',
    label: 'Beat Detect',
    category: 'audio',
    inputs: [
      { id: 'audio', label: 'Audio', dataType: 'audio' },
      { id: 'threshold', label: 'Threshold', dataType: 'float' },
      { id: 'attack', label: 'Attack', dataType: 'float' },
      { id: 'decay', label: 'Decay', dataType: 'float' },
    ],
    propertyInputs: {
      threshold: 'threshold', attack: 'attack', decay: 'decay',
    },

    outputs: [
      { id: 'beat', label: 'Beat', dataType: 'bool' },
      { id: 'bpm', label: 'BPM', dataType: 'float' },
      // The tuning diagnostics (threshold and cooldown on live audio; flux,
      // onset and contrast from a baked show's detector) are not ports: the
      // evaluator still reports them and BeatDetectBody shows them.
    ],
    defaultProperties: { threshold: 0.4, attack: 0.55, decay: 0.25 },
  },
  {
    type: 'PercussionDetect',
    label: 'Percussion Detect',
    category: 'audio',
    inputs: [
      { id: 'audio', label: 'Audio', dataType: 'audio' },
      { id: 'sensitivity', label: 'Sensitivity', dataType: 'float' },
      { id: 'decay', label: 'Decay', dataType: 'float' },
      { id: 'separation', label: 'Separation', dataType: 'float' },
    ],
    propertyInputs: {
      sensitivity: 'sensitivity', decay: 'decay', separation: 'separation',
    },

    outputs: [
      { id: 'kick', label: 'Kick', dataType: 'float' },
      { id: 'snare', label: 'Snare', dataType: 'float' },
      { id: 'hihat', label: 'Hi-Hat', dataType: 'float' },
    ],
    defaultProperties: { sensitivity: 0.55, decay: 0.72, separation: 0.4 },
  },
  {
    type: 'AudioFeatures',
    label: 'Audio Features',
    category: 'audio',
    inputs: [
      { id: 'audio', label: 'Audio', dataType: 'audio' },
      { id: 'sensitivity', label: 'Sensitivity', dataType: 'float' },
      { id: 'gate', label: 'Gate', dataType: 'float' },
      { id: 'smoothing', label: 'Smoothing', dataType: 'float' },
    ],
    propertyInputs: {
      sensitivity: 'sensitivity', gate: 'gate', smoothing: 'smoothing',
    },

    outputs: [
      { id: 'vocals', label: 'Vocals', dataType: 'float' },
      { id: 'energy', label: 'Energy', dataType: 'float' },
      // Loudness is the input's RMS on the VU meter scale (audio/stereoLevels.ts),
      // not adapted to the recent peak the way the spectrum and Energy are, so a
      // quiet verse reads quiet however loud the chorus before it was.
      { id: 'loudness', label: 'Loudness', dataType: 'float' },
      { id: 'silence', label: 'Silence', dataType: 'bool' },
      // Level is Loudness ready for a 0–1 input: Sensitivity's gain, about
      // 0.15 s of easing and a 0–1 clamp (audioLevel.ts). Declared last so
      // the ports before it keep their places.
      { id: 'level', label: 'Level', dataType: 'float' },
    ],
    defaultProperties: { sensitivity: 0.5, gate: 0.12, smoothing: 0.8 },
  },
  {
    // FastLED's Vibe detector: MilkDrop's self-normalising bass/mid/treble
    // model, which reports each band relative to the song's own running
    // average. Levels are about 1.0 on average and unbounded above, so this
    // is deliberately not in NORMALIZED_OUTPUTS; `unitRange` halves and
    // clamps them to 0–1 for a 0–1 input (vibeLevel in evaluate.ts).
    type: 'Vibe',
    label: 'Vibe',
    category: 'audio',
    inputs: [
      { id: 'audio', label: 'Audio', dataType: 'audio' },
      { id: 'gain', label: 'Gain', dataType: 'float' },
    ],
    propertyInputs: { gain: 'gain' },
    outputs: [
      { id: 'bass', label: 'Bass', dataType: 'float' },
      { id: 'mid', label: 'Mid', dataType: 'float' },
      { id: 'treble', label: 'Treble', dataType: 'float' },
      { id: 'volume', label: 'Volume', dataType: 'float' },
      { id: 'bassAtt', label: 'Bass smoothed', dataType: 'float' },
      { id: 'midAtt', label: 'Mid smoothed', dataType: 'float' },
      { id: 'trebleAtt', label: 'Treble smoothed', dataType: 'float' },
      { id: 'bassSpike', label: 'Bass spike', dataType: 'bool' },
      { id: 'midSpike', label: 'Mid spike', dataType: 'bool' },
      { id: 'trebleSpike', label: 'Treble spike', dataType: 'bool' },
    ],
    defaultProperties: { gain: 1, unitRange: false },
  },
  {
    // FastLED's downbeat, buildup, drop, mood and tempo detectors. `downbeat`
    // and `drop` are one-frame pulses; the rest are levels or states.
    type: 'SongStructure',
    label: 'Song Structure',
    category: 'audio',
    inputs: [
      { id: 'audio', label: 'Audio', dataType: 'audio' },
    ],
    outputs: [
      { id: 'downbeat', label: 'Downbeat', dataType: 'bool' },
      { id: 'beatNumber', label: 'Beat number', dataType: 'float' },
      { id: 'measurePhase', label: 'Measure phase', dataType: 'float' },
      { id: 'building', label: 'Building', dataType: 'bool' },
      { id: 'buildupProgress', label: 'Buildup progress', dataType: 'float' },
      { id: 'drop', label: 'Drop', dataType: 'bool' },
      { id: 'dropImpact', label: 'Drop impact', dataType: 'float' },
      { id: 'tempoStable', label: 'Tempo stable', dataType: 'bool' },
      { id: 'valence', label: 'Valence', dataType: 'float' },
      { id: 'arousal', label: 'Arousal', dataType: 'float' },
    ],
    defaultProperties: {},
  },
  {
    // Pitch, note and key. FastLED's Pitch needs more samples per chunk than its
    // I2S input delivers, so the firmware runs the same arithmetic over the lags
    // that fit (about 175 Hz to 1 kHz). `noteOn` is a one-frame pulse.
    type: 'PitchDetect',
    label: 'Pitch Detect',
    category: 'audio',
    inputs: [
      { id: 'audio', label: 'Audio', dataType: 'audio' },
    ],
    outputs: [
      { id: 'hz', label: 'Hz', dataType: 'float' },
      { id: 'note', label: 'Note', dataType: 'float' },
      // The note's place in the octave, 0 (C) to 11 (B): Note mod 12.
      { id: 'pitchClass', label: 'Pitch class', dataType: 'float' },
      { id: 'noteOn', label: 'Note on', dataType: 'bool' },
      { id: 'velocity', label: 'Velocity', dataType: 'float' },
      { id: 'confidence', label: 'Confidence', dataType: 'float' },
      { id: 'keyRoot', label: 'Key root', dataType: 'float' },
      { id: 'keyMinor', label: 'Key minor', dataType: 'bool' },
      { id: 'keyConfidence', label: 'Key confidence', dataType: 'float' },
    ],
    defaultProperties: {},
  },

  // ── Audio extras ──────────────────────────────────────────────────────
  {
    type: 'AudioHue',
    label: 'Audio → Hue',
    category: 'audio',
    inputs: [
      { id: 'bass',   label: 'Bass',   dataType: 'float' },
      { id: 'mids',   label: 'Mids',   dataType: 'float' },
      { id: 'treble', label: 'Treble', dataType: 'float' },
      { id: 'bassWeight', label: 'Bass Weight', dataType: 'float' },
      { id: 'midsWeight', label: 'Mids Weight', dataType: 'float' },
      { id: 'trebleWeight', label: 'Treble Weight', dataType: 'float' },
    ],
    propertyInputs: {
      bass: 'bass', mids: 'mids', treble: 'treble',
      bassWeight: 'bassWeight', midsWeight: 'midsWeight', trebleWeight: 'trebleWeight',
    },
    defaultExposedInputs: ['bass', 'mids', 'treble'],

    outputs: [{ id: 'hue', label: 'Hue (0–360)', dataType: 'float' }],
    // bass/mids/treble match the evaluator's own hardcoded fallback
    // (graphEvaluator.ts) so an unwired node still renders sliders instead of
    // nothing at all. A new node starts on Balance (where the sound sits
    // between bass and treble, over Hue Start and Span); Weighted Sum keeps
    // the original mix, and a node saved without a `mode` reads as Weighted
    // Sum (AUDIO_HUE in evaluate.ts). The three weights default to that mix.
    defaultProperties: {
      mode: 'balance', hueStart: 0, hueSpan: 240,
      bass: 0.5, mids: 0.5, treble: 0.5,
      bassWeight: 0.5, midsWeight: 0.3, trebleWeight: 0.2,
    },
  },
  {
    // One 0–1 level from a chosen frequency range, for a kick, a vocal
    // presence band or a snare's snap that the three fixed FFT groups cut
    // across. The spectrum stops at about 5.1 kHz, so it has no hi-hat air
    // band. Reads the spectrum slots whose centre falls inside the range,
    // named by a Band preset or set by Low and High (src/audio/frequencyBand.ts).
    type: 'FrequencyBand',
    label: 'Frequency Band',
    category: 'audio',
    inputs: [
      { id: 'audio', label: 'Audio', dataType: 'audio' },
      { id: 'lowHz', label: 'Low Hz', dataType: 'float' },
      { id: 'highHz', label: 'High Hz', dataType: 'float' },
      { id: 'gain', label: 'Gain', dataType: 'float' },
      { id: 'smoothing', label: 'Smoothing', dataType: 'float' },
    ],
    propertyInputs: { lowHz: 'lowHz', highHz: 'highHz', gain: 'gain', smoothing: 'smoothing' },
    outputs: [{ id: 'level', label: 'Level', dataType: 'float' }],
    defaultProperties: { band: 'Custom', lowHz: 90, highHz: 250, gain: 1, smoothing: 0.6 },
  },
  {
    // The channel levels the Stereo VU Meter already measures, as signals:
    // left, right and the balance between them.
    type: 'StereoLevels',
    label: 'Stereo Levels',
    category: 'audio',
    inputs: [{ id: 'audio', label: 'Audio', dataType: 'audio' }],
    outputs: [
      { id: 'left', label: 'Left', dataType: 'float' },
      { id: 'right', label: 'Right', dataType: 'float' },
      { id: 'balance', label: 'Balance', dataType: 'float' },
    ],
    defaultProperties: {},
  },
  {
    // A tempo clock: a 0–1 sawtooth per beat that a Beat input re-syncs,
    // plus a slower saw over a bar of `beatsPerBar` beats and a running beat
    // count. It runs at `bpm` until two beats arrive, then at the measured
    // beat, holding at 1 until the next one (audio/beatPhase.ts).
    // Wall-clock, like the music it follows — Master Speed does not scale it.
    type: 'BeatPhase',
    label: 'Beat Phase',
    category: 'audio',
    inputs: [
      { id: 'beat', label: 'Beat', dataType: 'bool' },
      { id: 'bpm', label: 'BPM', dataType: 'float' },
    ],
    propertyInputs: { bpm: 'bpm' },
    outputs: [
      { id: 'phase', label: 'Phase', dataType: 'float' },
      { id: 'bar', label: 'Bar', dataType: 'float' },
      { id: 'count', label: 'Count', dataType: 'float' },
    ],
    defaultProperties: { bpm: 120, beatsPerBar: 4 },
  },
]

export const AUDIO_DESCRIPTIONS: Record<string, string> = {
  FrequencyBand: 'One 0–1 level from a chosen frequency range of the spectrum.',
  StereoLevels: 'Left and right channel levels, and the balance between them.',
  BeatPhase: 'A 0–1 saw per beat, re-synced by Beat Detect, plus a bar phase and a beat count.',
  // audio
  FFTAnalyzer: 'Splits mic audio into bass/mids/treble; tilt boosts weak treble.',
  BeatDetect: 'Emits a beat pulse and estimated BPM from audio.',
  PercussionDetect: 'Heuristic kick, snare, and hi-hat envelopes from audio.',
  AudioFeatures: 'Heuristic vocals and energy, absolute loudness, a 0–1 level, and silence.',
  Vibe: 'MilkDrop-style bass/mid/treble relative to the song average (1.0), plus spikes.',
  SongStructure: 'Downbeats, beat number, buildups, drops, tempo stability and mood from audio.',
  PitchDetect: 'Pitch in Hz, MIDI note, note-on pulse and musical key from audio.',
  AudioHue: 'Turns the balance of bass, mids and treble into a hue.',
}
