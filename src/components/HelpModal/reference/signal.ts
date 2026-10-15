import { example, RING, STRIP } from './example'
import type { NodeReferenceMap } from './types'

export const SIGNAL_REFERENCE: NodeReferenceMap = {
  Wave: {
    overview: [
      'Wave is an oscillator: a value that swings smoothly and endlessly. Choose sine, triangle, square or sawtooth, and give its rate in hertz or in beats per minute.',
      'By default it swings from −Amplitude to +Amplitude around Offset. Turn on Unipolar to swing from Offset up to Offset + Amplitude instead — a unipolar sawtooth is a 0-to-1 ramp, and a unipolar sine at a BPM is FastLED’s beatsin.',
      'Two waves at slightly different rates drifting against each other are a classic way to make motion that never quite repeats.',
    ],
    outputs: {
      result: 'The wave’s current value.',
    },
    propertyNote: 'Frequency is used when the rate is in Hz, BPM when it is in BPM. Amplitude and Offset accept expressions such as w / 2.',
    example: example({
      featured: 'Wave',
      title: 'Draw a Lissajous figure with two waves',
      nodes: {
        across: ['Wave', { frequency: 0.6, amplitude: 0.38, offset: 0.5, waveform: 'sine' }],
        down: ['Wave', { frequency: 0.9, amplitude: 0.38, offset: 0.5, phase: 0.25, waveform: 'sine' }],
        pen: ['Shape', { shape: 'ellipse', size: 1.2, filled: true, fill: '#ffe08a', edge: '#ff8a00', thickness: 0.5 }],
        trails: ['Trails', { decay: 0.35 }],
      },
      wires: ['across.result > pen.cx', 'down.result > pen.cy', 'pen.frame > trails.frame'],
      explanation: 'One Wave moves a small dot across the matrix and a second, slightly faster Wave moves it up and down. Because the two rates are in a 2:3 ratio the dot traces a looping Lissajous figure, and Trails keeps the path glowing.',
      preview: 'The {output} shows a golden pen drawing a looping figure-of-eight pattern over and over.',
    }),
  },

  Interval: {
    overview: [
      'Interval is a metronome. Every Interval seconds its Pulse output is true for exactly one frame — FastLED’s EVERY_N_MILLISECONDS as a node.',
      'Use it wherever something should happen regularly without music: spawn a particle, step a sequence, sample a new random value, advance a palette.',
      'For musical timing with beats and bars use Clock instead; for a pulse that follows the song use Beat Detect.',
    ],
    outputs: {
      pulse: 'True for one frame every Interval seconds.',
    },
    example: example({
      featured: 'Interval',
      title: 'Launch a meteor every two seconds',
      nodes: {
        every: ['Interval', { interval: 2 }],
        sky: ['StringParticles', { track: 'row', mode: 'meteors', palette: 'emberglow', bed: 0.35, fade: 0.9 }],
      },
      wires: ['every.pulse > sky.trigger'],
      output: STRIP(60),
      explanation: 'Interval fires once every two seconds, and each pulse launches a meteor along String Particles, which streaks down the string scattering debris over a dim noise bed.',
      preview: 'The {output} glows faintly, and every two seconds a bright meteor streaks along it.',
    }),
  },

  Envelope: {
    overview: [
      'Envelope turns a trigger into a shaped swell. On each trigger it rises from 0 to 1 over Attack seconds, then falls back to 0 over Decay seconds.',
      'Any one-frame pulse makes it a smooth event: a beat becomes a punch, a button press becomes a glow that fades, an interval becomes a slow beacon. Attack 0 jumps straight to full.',
      'Each new trigger restarts the envelope from the beginning. With Attack at 0 that keeps it topped up at full; with a longer Attack it drops to 0 and climbs again, so space the triggers further apart than the Attack.',
    ],
    inputs: {
      trigger: 'Each rising edge starts the envelope.',
    },
    outputs: {
      result: 'The envelope’s current level, 0 to 1.',
    },
    example: example({
      featured: 'Envelope',
      title: 'A harbour beacon that swells and fades',
      nodes: {
        every: ['Interval', { interval: 3 }],
        swell: ['Envelope', { attack: 0.6, decay: 1.8 }],
        lamp: ['SolidColor', { r: 255, g: 150, b: 40 }],
        output: ['MatrixOutput', RING(16)],
      },
      wires: ['every.pulse > swell.trigger', 'swell.result > output.brightness', 'lamp.frame > output.frame'],
      explanation: 'Interval fires every three seconds. Envelope turns each pulse into a slow swell — 0.6 s up, 1.8 s down — and that level sets the LED ring’s brightness, so an amber lamp breathes in and out like a harbour beacon.',
      preview: 'The {output} glows amber, swelling to full and fading away every three seconds.',
    }),
  },

  TimeNode: {
    overview: [
      'Time reports how long the preview — or the board — has been running, in seconds, and dt, the seconds since the previous frame.',
      'Time is a steadily rising number: feed it to a formula, a function or a format to make your own motion. It follows Master Speed, so slowing the master clock slows every patch built on it.',
      'dt is for anything you integrate yourself, so motion stays the same speed whatever the frame rate.',
    ],
    outputs: {
      time: 'Seconds since start-up, rising steadily.',
      dt: 'Seconds since the previous frame.',
    },
    example: example({
      featured: 'TimeNode',
      title: 'A stopwatch from the running clock',
      nodes: {
        clock: ['TimeNode'],
        reading: ['FormatNumber', { decimals: 1, padWidth: 2, suffix: 's' }],
        digits: ['Text', { r: 120, g: 255, b: 160, x: 0.5, y: 0.5 }],
      },
      wires: ['clock.time > reading.value', 'reading.text > digits.text'],
      output: { form: 'matrix', width: 32, height: 8 },
      explanation: 'Time counts seconds since the preview started. Format Number shows it to one decimal place with an “s”, and Text draws it on a long, thin matrix.',
      preview: 'The {output} shows the elapsed seconds counting up in green, a tenth of a second at a time.',
    }),
  },

  Random: {
    overview: [
      'Random draws a new number between Min and Max every frame. On its own that is fast flicker — static, sparks, a guttering light.',
      'For a value that changes less often, pair it with Sample & Hold and a trigger. For a value that wanders smoothly, use Noise LFO instead.',
      'Seed 0 runs freely. Any other seed repeats exactly the same sequence every run, in the preview and on the board.',
    ],
    outputs: {
      value: 'A fresh random number between Min and Max, every frame.',
    },
    example: example({
      featured: 'Random',
      title: 'A neon sign on its last legs',
      nodes: {
        flicker: ['Random', { min: 0.45, max: 1 }],
        sign: ['Text', { text: 'OPEN', r: 255, g: 40, b: 150 }],
        output: ['MatrixOutput', { form: 'matrix', width: 24, height: 8 }],
      },
      wires: ['flicker.value > output.brightness', 'sign.frame > output.frame'],
      explanation: 'Random picks a brightness between 45% and full on every frame and sets the LED output’s Brightness with it, so a pink OPEN sign buzzes and stutters like an old neon tube.',
      preview: 'The {output} shows a pink OPEN that flickers unevenly, never quite steady.',
    }),
  },

  NoiseSignal: {
    overview: [
      'Noise LFO is a value that wanders smoothly between Min and Max, never repeating — the organic cousin of Wave. It is how to make a light feel alive rather than mechanical.',
      'Speed sets how quickly it drifts. Octaves adds layers of finer movement on top of the slow drift, from smooth (1) to jittery (3).',
      'Seed 0 runs freely; any other seed replays the same drift every run.',
    ],
    outputs: {
      value: 'The current drifting value, between Min and Max.',
    },
    example: example({
      featured: 'NoiseSignal',
      title: 'Clouds drifting across the sun',
      nodes: {
        clouds: ['NoiseSignal', { speed: 0.3, min: 0.55, max: 1, octaves: 2 }],
        sun: ['Sunrise', { mode: 'manual' }],
      },
      wires: ['clouds.value > sun.progress'],
      explanation: 'Noise LFO wanders between 0.55 and 1 and sets how far along its dawn ramp Sunrise sits. The light dims toward a golden morning and brightens to daylight unpredictably, like clouds passing over the sun.',
      preview: 'The {output} glows warm white, dimming and brightening slowly and irregularly.',
    }),
  },

  ScheduleTrigger: {
    overview: [
      'Schedule Trigger watches an RTC Clock and switches on a timetable. In Window mode Active stays true between the start and end times; in Trigger mode Start pulses once at the start time.',
      'Start and End pulse on the edges of a window too, and Progress runs from 0 to 1 across it — enough to fade in at opening time or run a slow sunset across an evening. An end before the start wraps past midnight.',
      'Days limits it to weekdays, weekends, or the days you tick. Require Synced Time keeps it off until the clock has a real NTP sync, so a board that lost power never runs the schedule at the wrong hour.',
    ],
    steps: [
      'Add an RTC Clock and choose a reliable time source: NTP or a DS3231.',
      'Wire the clock’s Valid, Synced, Seconds Today and Weekday outputs into the matching inputs.',
      'Set the window and days, then wire Active, Start or Progress to what should follow the schedule.',
    ],
    inputs: {
      valid: 'The clock’s Valid output. Nothing fires until the time is real.',
      synced: 'The clock’s Synced output, used by Require Synced Time.',
      secondsOfDay: 'The clock’s Seconds Today output: the time of day the schedule is compared with.',
      weekday: 'The clock’s Weekday output, for the day rules.',
      day: 'Day of the month, from the clock. With Month and Year it lets Trigger mode fire once per calendar day.',
      month: 'Month, from the clock.',
      year: 'Year, from the clock.',
    },
    outputs: {
      active: 'True while inside the window on an allowed day.',
      start: 'True for one frame when the window opens, or at the trigger time.',
      end: 'True for one frame when the window closes.',
      progress: 'How far through the window, 0 to 1. 0 outside it.',
    },
    example: example({
      featured: 'ScheduleTrigger',
      title: 'A shop sign that keeps opening hours',
      nodes: {
        clock: ['RTCInput', { timeSource: 'DS3231' }],
        hours: ['ScheduleTrigger', { scheduleMode: 'Window', dayMode: 'Weekdays', startHour: 9, startMinute: 0, endHour: 17, endMinute: 30 }],
        sign: ['TheaterChase', { palette: 'citrus', spacing: 3, speed: 0.4 }],
        output: ['MatrixOutput', STRIP(60)],
      },
      wires: [
        'clock.valid > hours.valid',
        'clock.synced > hours.synced',
        'clock.secondsOfDay > hours.secondsOfDay',
        'clock.weekday > hours.weekday',
        'hours.active > output.enabled',
        'sign.frame > output.frame',
      ],
      explanation: 'RTC Clock reads a battery-backed DS3231, and Schedule Trigger compares its time with a weekday window from 9:00 to 17:30. Active switches the LED output’s Enabled input, so the citrus marquee chases only while the shop is open.',
      preview: 'The reference time is a Friday morning, so the {output} shows the marquee running. Move the window to the evening and it goes dark.',
    }),
  },

  Clock: {
    overview: [
      'Clock is a musical metronome. It runs at a BPM and pulses Beat on every beat, Bar on the first beat of each bar, and Subdivision on finer steps within the beat. Phase rises 0 to 1 across each beat.',
      'Tap Tempo sets the BPM from your own taps; Sync locks it to an incoming beat such as Beat Detect’s; Reset restarts the bar. With nothing wired it simply keeps the tempo you set.',
      'It suits shows that run to a known tempo without a microphone — a DJ set at 128 BPM, a dance class, a light show synced by hand.',
    ],
    inputs: {
      tap: 'Tap repeatedly to set the tempo from the gaps between taps.',
      sync: 'A beat pulse to lock the clock to, such as Beat Detect’s Beat.',
      reset: 'Restarts the bar at beat one.',
    },
    outputs: {
      bpm: 'The current tempo.',
      phase: 'Position through the current beat, 0 to 1.',
      beat: 'True for one frame on every beat.',
      bar: 'True for one frame on the first beat of each bar.',
      sub: 'True for one frame on each subdivision of the beat.',
    },
    example: example({
      featured: 'Clock',
      title: 'Strobe the party at 128 BPM, no microphone needed',
      nodes: {
        clock: ['Clock', { bpm: 128, beatsPerBar: 4, subdivision: 2 }],
        party: ['Confetti', { palette: 'party', speed: 0.55, fade: 0.25 }],
        strobe: ['BeatFlash', { intensity: 0.8, decay: 0.75, palette: 'party' }],
      },
      wires: ['clock.beat > strobe.beat', 'party.frame > strobe.frame'],
      explanation: 'Clock ticks at 128 BPM, the tempo of most house music, and every beat fires Beat Flash over a bed of Confetti. The flash sweeps through the party palette as it fades, so each beat lands in a different colour.',
      preview: 'The {output} shows confetti speckles, flashing brightly a little over twice a second.',
    }),
  },

  DMXChannel: {
    overview: [
      'DMX Channel picks one channel out of a DMX universe and gives it to the graph three ways: Value from 0 to 1, Byte from 0 to 255, and Active when the byte reaches a threshold.',
      'Changed is true for one frame whenever the channel’s value moves, which is handy for reacting to a desk operator without polling.',
      'Use one DMX Channel per channel you patch. Together they turn the build into a fixture with as many channels as you like.',
    ],
    inputs: {
      dmx: 'A DMX universe, from a DMX / Art-Net node.',
    },
    outputs: {
      value: 'The channel as 0 to 1.',
      byte: 'The channel as its raw byte, 0 to 255.',
      active: 'True while the byte is at or above the Active threshold.',
      changed: 'True for one frame when the channel’s value changes.',
    },
    example: example({
      featured: 'DMXChannel',
      title: 'A desk fader that adds sparkle',
      nodes: {
        dmx: ['DMXInput', { inputMode: 'sACN', universe: 1, previewPort: 5568 }],
        sparkle: ['DMXChannel', { channel: 12 }],
        sea: ['Pacifica', { palette: 'ocean', speed: 0.35 }],
        glitter: ['Glitter', { glitterMode: 'add', r: 255, g: 255, b: 255 }],
      },
      wires: ['dmx.dmx > sparkle.dmx', 'sparkle.value > glitter.density', 'sea.frame > glitter.frame'],
      explanation: 'DMX Channel reads channel 12 of an sACN universe as 0 to 1 and feeds it straight into Glitter’s density. The operator brings the fader up and the Pacifica waves start to shimmer with white sparkles.',
      preview: 'With nothing sending, channel 12 reads 0 and the {output} shows calm Pacifica waves. Raise channel 12 on the desk to sprinkle sparkles over them.',
    }),
  },
}
