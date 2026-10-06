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
      // Internal tuning diagnostics — surfaced so threshold/attack/decay can
      // be dialed in visually instead of trial-and-error against a silent
      // binary pulse. See graphEvaluator.ts's BeatDetect case.
      { id: 'flux', label: 'Flux', dataType: 'float' },
      { id: 'onset', label: 'Onset', dataType: 'float' },
      { id: 'contrast', label: 'Contrast', dataType: 'float' },
      { id: 'threshold', label: 'Threshold', dataType: 'float' },
      { id: 'cooldownMs', label: 'Cooldown (ms)', dataType: 'float' },
    ],
    defaultProperties: { threshold: 0.2, attack: 0.55, decay: 0.25 },
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
      { id: 'silence', label: 'Silence', dataType: 'bool' },
    ],
    defaultProperties: { sensitivity: 0.5, gate: 0.12, smoothing: 0.8 },
  },
  {
    // FastLED's Vibe detector: MilkDrop's self-normalising bass/mid/treble
    // model, which reports each band relative to the song's own running
    // average. Levels are about 1.0 on average and unbounded above, so this
    // is deliberately not in NORMALIZED_OUTPUTS.
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
    defaultProperties: { gain: 1 },
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
      bassWeight: 'bassWeight', midsWeight: 'midsWeight', trebleWeight: 'trebleWeight',
    },

    outputs: [{ id: 'hue', label: 'Hue (0–360)', dataType: 'float' }],
    // bass/mids/treble match the evaluator's own hardcoded fallback
    // (graphEvaluator.ts) so an unwired node still renders sliders instead of
    // nothing at all. The three weights default to the mix that used to be
    // hardcoded in both the evaluator and the C++ generator, so an existing
    // patch keeps its exact hue.
    defaultProperties: {
      bass: 0.5, mids: 0.5, treble: 0.5,
      bassWeight: 0.5, midsWeight: 0.3, trebleWeight: 0.2,
    },
  },
]

export const AUDIO_DESCRIPTIONS: Record<string, string> = {
  // audio
  FFTAnalyzer: 'Splits mic audio into bass/mids/treble; tilt boosts weak treble.',
  BeatDetect: 'Emits a beat pulse and estimated BPM from audio.',
  PercussionDetect: 'Heuristic kick, snare, and hi-hat envelopes from audio.',
  AudioFeatures: 'Heuristic vocals, energy, and silence features from audio.',
  Vibe: 'MilkDrop-style bass/mid/treble relative to the song average (1.0), plus spikes.',
  SongStructure: 'Downbeats, beat number, buildups, drops, tempo stability and mood from audio.',
  PitchDetect: 'Pitch in Hz, MIDI note, note-on pulse and musical key from audio.',
  AudioHue: 'Maps bass/mids/treble to a hue value.',
}
