// Signal node definitions: ports, default properties, sidebar
// placement and Help descriptions. src/state/nodeLibrary.ts merges every
// category's definitions into NODE_LIBRARY in sidebar order.
import type { NodeDefinition } from '../../types'

export const SIGNAL_DEFINITIONS: NodeDefinition[] = [
  {
    type: 'Sin',
    label: 'Sin',
    category: 'signal',
    inputs: [{ id: 'x', label: 'X', dataType: 'float' }],
    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    defaultProperties: {},
  },
  {
    type: 'Cos',
    label: 'Cos',
    category: 'signal',
    inputs: [{ id: 'x', label: 'X', dataType: 'float' }],
    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    defaultProperties: {},
  },
  {
    // Waveform oscillator over time: amplitude · wave(frequency·t + phase).
    type: 'Wave',
    label: 'Wave',
    category: 'signal',
    inputs: [
      { id: 'amplitude', label: 'Amplitude', dataType: 'float' },
      { id: 'frequency', label: 'Frequency', dataType: 'float' },
      { id: 'phase', label: 'Phase', dataType: 'float' },
    ],
    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    defaultProperties: { amplitude: 1, frequency: 1, phase: 0, waveform: 'sine' },
  },
  {
    // Combines two wave (float) signals via a selectable operation.
    type: 'ComplexWave',
    label: 'Complex Wave',
    category: 'signal',
    inputs: [
      { id: 'a', label: 'Wave A', dataType: 'float' },
      { id: 'b', label: 'Wave B', dataType: 'float' },
    ],
    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    defaultProperties: { operation: 'add' },
  },
  {
    // Metronome — emits a boolean pulse once every `interval` seconds (a non-audio
    // rhythmic trigger; the software analogue of FastLED's EVERY_N_MILLISECONDS).
    type: 'Interval',
    label: 'Interval',
    category: 'signal',
    inputs: [
            { id: 'interval', label: 'Interval', dataType: 'float' },
    ],
    propertyInputs: { interval: 'interval' },

    outputs: [{ id: 'pulse', label: 'Pulse', dataType: 'bool' }],
    defaultProperties: { interval: 0.5 },
  },
  {
    // Trigger envelope — jumps to 1 on a rising edge of `trigger`, then decays
    // linearly to 0 over `decay` seconds; `attack` optionally ramps the rise.
    // Pipe through Ease for a curve. The generic float analogue of BeatFlash:
    // drive any knob from a beat/button.
    type: 'Envelope',
    label: 'Envelope',
    category: 'signal',
    inputs: [
      { id: 'trigger', label: 'Trigger', dataType: 'bool' },
      { id: 'attack', label: 'Attack', dataType: 'float' },
      { id: 'decay', label: 'Decay', dataType: 'float' },
    ],
    propertyInputs: { attack: 'attack', decay: 'decay' },

    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    defaultProperties: { attack: 0, decay: 0.5 },
  },
  {
    type: 'TimeNode',
    label: 'Time',
    category: 'signal',
    inputs: [],
    outputs: [
      { id: 'time', label: 'Time', dataType: 'float' },
      { id: 'dt', label: 'dt', dataType: 'float' },
    ],
    defaultProperties: {},
  },
  {
    type: 'Random',
    label: 'Random',
    category: 'signal',
    inputs: [],
    outputs: [{ id: 'value', label: 'Value', dataType: 'float' }],
    defaultProperties: { min: 0, max: 1, seed: 0 },
  },
  {
    // Smooth random value: fBm of the same noise Field Noise uses, sampled along
    // one axis in time. The FastLED modulator idiom (`inoise8(millis())`) that
    // Random, a fresh draw per frame, is not.
    type: 'NoiseSignal',
    label: 'Noise LFO',
    category: 'signal',
    inputs: [
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'min', label: 'Min', dataType: 'float' },
      { id: 'max', label: 'Max', dataType: 'float' },
    ],
    propertyInputs: { speed: 'speed', min: 'min', max: 'max' },
    outputs: [{ id: 'value', label: 'Value', dataType: 'float' }],
    defaultProperties: { speed: 0.25, min: 0, max: 1, octaves: 1, seed: 0 },
  },
  {
    type: 'Counter',
    label: 'Counter',
    category: 'signal',
    inputs: [{ id: 'rate', label: 'Rate', dataType: 'float' }],
    outputs: [{ id: 'value', label: 'Value 0–1', dataType: 'float' }],
    defaultProperties: { rate: 0.5 },
  },
  {
    // Scheduled trigger/window logic driven by RTCInput's clock/date fields.
    // `active` stays high while the schedule is in-range; `start`/`end` pulse
    // once on the transitions. Trigger mode collapses the window to a single
    // moment-of-day pulse on matching days.
    type: 'ScheduleTrigger',
    label: 'Schedule Trigger',
    category: 'signal',
    inputs: [
      { id: 'valid', label: 'Valid', dataType: 'bool' },
      { id: 'synced', label: 'Synced', dataType: 'bool' },
      { id: 'secondsOfDay', label: 'Seconds Today', dataType: 'float' },
      { id: 'weekday', label: 'Weekday', dataType: 'float' },
      { id: 'day', label: 'Day', dataType: 'float' },
      { id: 'month', label: 'Month', dataType: 'float' },
      { id: 'year', label: 'Year', dataType: 'float' },
      { id: 'enable', label: 'Enable', dataType: 'bool' },
    ],
    outputs: [
      { id: 'active', label: 'Active', dataType: 'bool' },
      { id: 'start', label: 'Start Pulse', dataType: 'bool' },
      { id: 'end', label: 'End Pulse', dataType: 'bool' },
      // How far through the window we are (0→1), so a schedule can drive a
      // fade or ramp instead of only a hard on/off. Always 0 in Trigger mode.
      { id: 'progress', label: 'Progress', dataType: 'float' },
    ],
    defaultProperties: {
      scheduleMode: 'Window',
      dayMode: 'Every day',
      startHour: 18,
      startMinute: 0,
      startSecond: 0,
      endHour: 23,
      endMinute: 0,
      endSecond: 0,
      monday: true,
      tuesday: true,
      wednesday: true,
      thursday: true,
      friday: true,
      saturday: true,
      sunday: true,
      requireSync: false,
      enable: true,
    },
  },
  {
    type: 'BeatSin',
    label: 'BeatSin',
    category: 'signal',
    inputs: [
            { id: 'bpm', label: 'BPM', dataType: 'float' },
    ],
    propertyInputs: { bpm: 'bpm' },

    outputs: [{ id: 'value', label: 'Value (0–1)', dataType: 'float' }],
    defaultProperties: { bpm: 60, low: 0, high: 1 },
  },
  {
    // Free-running BPM clock / transport — the show-timing counterpart to
    // BeatSin's single oscillator. Free-runs from the `bpm` property; wiring a
    // pulse (e.g. a BeatDetect.beat) into `sync` locks phase + derives a live
    // BPM from the pulse interval — the same mechanism `tap` uses for manual
    // tap-tempo. `reset` re-zeros phase/bar/subdivision counters.
    type: 'Clock',
    label: 'Clock',
    category: 'signal',
    inputs: [
      { id: 'tap', label: 'Tap Tempo', dataType: 'bool' },
      { id: 'sync', label: 'Sync', dataType: 'bool' },
      { id: 'reset', label: 'Reset', dataType: 'bool' },
      { id: 'bpm', label: 'BPM', dataType: 'float' },
      { id: 'beatsPerBar', label: 'Beats/Bar', dataType: 'float' },
      { id: 'subdivision', label: 'Subdivision', dataType: 'float' },
    ],
    propertyInputs: { bpm: 'bpm', beatsPerBar: 'beatsPerBar', subdivision: 'subdivision' },

    outputs: [
      { id: 'bpm', label: 'BPM', dataType: 'float' },
      { id: 'phase', label: 'Phase (0–1)', dataType: 'float' },
      { id: 'beat', label: 'Beat', dataType: 'bool' },
      { id: 'bar', label: 'Bar', dataType: 'bool' },
      { id: 'sub', label: 'Subdivision', dataType: 'bool' },
    ],
    defaultProperties: { bpm: 120, beatsPerBar: 4, subdivision: 2 },
  },
  {
    // Focused DMX decoder: reads one channel from the raw universe buffer and
    // exposes it as normalized float, raw byte, plus activity/change booleans.
    type: 'DMXChannel',
    label: 'DMX Channel',
    category: 'signal',
    inputs: [
      { id: 'dmx', label: 'DMX', dataType: 'dmx' },
      { id: 'activeThreshold', label: 'Threshold', dataType: 'float' },
    ],
    propertyInputs: { activeThreshold: 'activeThreshold' },

    outputs: [
      { id: 'value', label: 'Value (0–1)', dataType: 'float' },
      { id: 'byte', label: 'Byte (0–255)', dataType: 'float' },
      { id: 'active', label: 'Active', dataType: 'bool' },
      { id: 'changed', label: 'Changed', dataType: 'bool' },
    ],
    defaultProperties: { channel: 1, activeThreshold: 1 },
  },
]

export const SIGNAL_DESCRIPTIONS: Record<string, string> = {
  Sin: 'Sine of the input (×2π).',
  Cos: 'Cosine of the input (×2π).',
  Wave: 'Oscillator — sine, triangle, square or sawtooth over time.',
  ComplexWave: 'Combines two waves (add, multiply, average, min/max, difference).',
  Interval: 'Metronome — pulses true every N seconds (EVERY_N_MILLISECONDS).',
  Envelope: 'Ramps up on a trigger, then decays to 0 over the decay time.',
  TimeNode: 'Elapsed time in seconds, plus a frame delta.',
  Random: 'Random value in a range.',
  NoiseSignal: 'Smooth random value drifting between min and max: a noise-driven LFO.',
  Counter: 'Ramps 0→1 over time at a set rate.',
  ScheduleTrigger: 'Time-of-day window/trigger driven by RTCInput clock and calendar fields.',
  BeatSin: 'Beat-synced sine oscillator — outputs a normalized low↔high value at a BPM.',
  Clock: 'BPM clock — phase/beat/bar/subdivision pulses; tap tempo, sync, and reset.',
  DMXChannel: 'Reads one channel from a raw DMX/Art-Net universe buffer.',
}
