import { example, RING, STRIP } from './example'
import type { NodeReferenceMap } from './types'

export const MATH_REFERENCE: NodeReferenceMap = {
  Constant: {
    overview: [
      'Constant holds one number and offers it on a wire. Wire it into several inputs and they all share the value: change it once and every input follows.',
      'It is the way to keep related settings in step — a star’s points and its kaleidoscope’s mirrors, three patterns’ speeds, a shared scale.',
      'Value accepts matrix-relative expressions such as w/2 or max_x, so a constant can follow the size of the LED output.',
    ],
    outputs: {
      value: 'The number, for every input it is wired to.',
    },
    example: example({
      featured: 'Constant',
      title: 'Keep a star and its mirrors in step',
      nodes: {
        points: ['Constant', { value: 5 }],
        star: ['Shape', { shape: 'polygon', size: 6, fill: '#1a0638', edge: '#ffcc33', thickness: 1.5, rotation: 18 }],
        mirror: ['Kaleidoscope'],
        spin: ['Transform', { transform: 'rotate', rate: 25 }],
      },
      wires: ['points.value > star.sides', 'points.value > mirror.segments', 'star.frame > spin.frame', 'spin.frame > mirror.frame'],
      explanation: 'One Constant sets both the star’s number of points and the kaleidoscope’s number of mirrors. Transform turns the star, and Kaleidoscope folds it into the same five-fold symmetry. Set the Constant to 6 or 8 and both follow at once.',
      preview: 'The {output} shows a slowly turning golden five-pointed pattern, mirrored five ways.',
    }),
  },

  Math: {
    overview: [
      'Math combines two numbers: add, subtract, multiply, divide, modulo, average, min or max. Wire signals into A and B, or leave one unwired to use its field.',
      'Multiply scales one signal by another — a slow swell times a fast tremolo. Add offsets. Min and Max keep the lower or higher of two levels. Modulo wraps a rising value into a repeating range.',
      'Divide or modulo by zero gives 0 rather than an error, so a patch never stalls.',
    ],
    inputs: {
      a: 'The left number.',
      b: 'The right number.',
    },
    outputs: {
      result: 'A combined with B by the chosen operation.',
    },
    example: example({
      featured: 'Math',
      title: 'A slow swell with a fast shimmer on top',
      nodes: {
        swell: ['Wave', { frequency: 0.15, amplitude: 0.45, offset: 0.55, unipolar: true }],
        shimmer: ['Wave', { frequency: 4, amplitude: 0.25, offset: 0.75, unipolar: true }],
        mix: ['Math', { mathOp: 'multiply' }],
        aurora: ['Noise', { noiseType: 'fbm', palette: 'cottoncandy', speed: 0.25, scale: 0.35 }],
      },
      wires: ['swell.result > mix.a', 'shimmer.result > mix.b', 'mix.result > output.brightness', 'aurora.frame > output.frame'],
      explanation: 'Math, set to Multiply, multiplies a slow seven-second swell by a fast four-times-a-second shimmer. The product sets the LED output’s Brightness, so the pastel clouds rise and fall in long breaths with a constant tremble on top.',
      preview: 'The {output} shows pastel clouds swelling and fading slowly, shimmering quickly all the while.',
    }),
  },

  Clamp: {
    overview: [
      'Clamp keeps a number between Min and Max. Anything below Min comes out as Min, anything above Max as Max, and everything between passes unchanged.',
      'Use it to stop a sensor or an over-driven signal from pushing a control past where it looks good, or to hold a sweep at its ends for a moment before it turns back.',
    ],
    inputs: {
      value: 'The number to limit.',
      min: 'The lowest value allowed out.',
      max: 'The highest value allowed out.',
    },
    outputs: {
      result: 'Value, held between Min and Max.',
    },
    example: example({
      featured: 'Clamp',
      title: 'A puck that pauses against the walls',
      nodes: {
        swing: ['Wave', { frequency: 0.4, amplitude: 0.7, offset: 0.5 }],
        walls: ['Clamp', { min: 0.12, max: 0.88 }],
        puck: ['Shape', { shape: 'rect', size: 3, aspect: 0.5, filled: true, fill: '#40ffd0', edge: '#ffffff', thickness: 0.5 }],
        trails: ['Trails', { decay: 0.45 }],
      },
      wires: ['swing.result > walls.value', 'walls.result > puck.cx', 'puck.frame > trails.frame'],
      explanation: 'The Wave swings further than the matrix is wide. Clamp holds it between 0.12 and 0.88, so the puck runs into a wall, waits there while the wave is out of range, then sets off the other way.',
      preview: 'The {output} shows a cyan puck sliding across, stopping briefly at each side before it returns.',
    }),
  },

  MapRange: {
    overview: [
      'Map Range converts a number from one range to another. Whatever arrives at In Min comes out as Out Min, In Max as Out Max, and everything between lands proportionally.',
      'It is the translator between nodes that speak different units: a sensor’s millimetres into a 0–1 brightness, a 0–1 level into degrees, MIDI notes into a speed. Swap Out Min and Out Max to reverse a control.',
      'Values outside the input range keep extrapolating rather than stopping at the ends. Follow it with Clamp when the target must not go past its limits.',
    ],
    inputs: {
      value: 'The number to convert.',
    },
    outputs: {
      result: 'Value moved from the input range to the output range.',
    },
    example: example({
      featured: 'MapRange',
      title: 'Turn a swinging wave into more and fewer rings',
      nodes: {
        swing: ['Wave', { frequency: 0.12 }],
        rings: ['MapRange', { inMin: -1, inMax: 1, outMin: 2, outMax: 14 }],
        burst: ['RadialBurst', { palette: 'opal', speed: 0.45 }],
      },
      wires: ['swing.result > rings.value', 'rings.result > burst.arms'],
      output: RING(24),
      explanation: 'Wave swings between −1 and +1, which means nothing to a ring count. Map Range converts that span into 2 to 14 rings, so Radial Burst gathers and loosens its rings across each eight-second cycle.',
      preview: 'The {output} shows opal rings flowing outward, slowly growing denser and then sparser.',
    }),
  },

  StepValue: {
    overview: [
      'Step Value turns events into a number. Each Increase pulse adds Step, each Decrease pulse subtracts it, and Reset returns to Initial. The value holds between pulses.',
      'It is the bridge from buttons, remote keys and beats to anything numeric: a brightness level, a speed, a count, a palette index. Without Wrap it stops at Minimum and Maximum; with Wrap it jumps to the other end, which makes a cycle.',
      'Initial is also the value at start-up and after a reboot.',
    ],
    inputs: {
      increase: 'Each rising edge adds Step.',
      decrease: 'Each rising edge subtracts Step.',
      reset: 'Each rising edge returns to Initial.',
    },
    outputs: {
      value: 'The current value, between Minimum and Maximum.',
    },
    example: example({
      featured: 'StepValue',
      title: 'Add another juggler every bar',
      nodes: {
        clock: ['Clock', { bpm: 100, beatsPerBar: 4 }],
        jugglers: ['StepValue', { initial: 1, minimum: 1, maximum: 8, step: 1, wrap: true }],
        juggle: ['Juggle', { palette: 'party', fade: 0.2, speed: 0.55 }],
      },
      wires: ['clock.bar > jugglers.increase', 'jugglers.value > juggle.count'],
      explanation: 'Clock pulses Bar every four beats, and each pulse adds one to Step Value. Juggle gets that many dots — one, two, up to eight — and with Wrap on the count starts again at one after the eighth bar.',
      preview: 'The {output} shows a growing number of juggled dots, one more every bar, until the act resets.',
    }),
  },

  Lerp: {
    overview: [
      'Lerp blends between two numbers. T of 0 gives A, T of 1 gives B, and anything between lands proportionally on the way.',
      'Wire a level into T and Lerp becomes a crossfader between two settings — calm and frantic, near and far — with A and B as the two ends. Wire signals into A and B too and you blend between two moving values.',
    ],
    inputs: {
      a: 'The value when T is 0.',
      b: 'The value when T is 1.',
      t: 'How far from A toward B, 0 to 1.',
    },
    outputs: {
      result: 'The point T of the way from A to B.',
    },
    example: example({
      featured: 'Lerp',
      title: 'A heart that drifts between calm and panic',
      nodes: {
        nerves: ['NoiseSignal', { speed: 0.2, min: 0, max: 1 }],
        rate: ['Lerp', { a: 50, b: 160 }],
        heart: ['Heartbeat', { palette: 'cottoncandy', strength: 0.5 }],
      },
      wires: ['nerves.value > rate.t', 'rate.result > heart.bpm'],
      explanation: 'Lerp holds two heart rates: a resting 50 and a racing 160. Noise LFO wanders between 0 and 1 and picks a point between them, so the Heartbeat slowly speeds up and calms down on its own.',
      preview: 'The {output} pulses lub-dub from sky blue to pink, sometimes slow and relaxed, sometimes quick and anxious.',
    }),
  },

  Ease: {
    overview: [
      'Ease reshapes a 0–1 value with one of FastLED’s easing curves. Linear leaves it unchanged; In curves start slowly, Out curves end slowly, and In-Out curves do both.',
      'Movement driven by a straight ramp looks mechanical. Pass the ramp through Ease and it accelerates away and settles gently, which reads as natural motion.',
      'The wave curves — triwave, quadwave, cubicwave — turn a rising ramp into a rise and fall.',
    ],
    inputs: {
      t: 'A position from 0 to 1.',
    },
    outputs: {
      result: 'T reshaped by the curve.',
    },
    example: example({
      featured: 'Ease',
      title: 'A heart traced with natural acceleration',
      nodes: {
        ramp: ['Wave', { frequency: 0.25, amplitude: 1, unipolar: true, waveform: 'sawtooth' }],
        curve: ['Ease', { easeType: 'inOutCubic' }],
        pen: ['Path', { pathShape: 'heart', scale: 0.85, thickness: 1.6, r: 255, g: 60, b: 110 }],
        trails: ['Trails', { decay: 0.25 }],
      },
      wires: ['ramp.result > curve.t', 'curve.result > pen.t', 'pen.frame > trails.frame'],
      explanation: 'A sawtooth Wave rises steadily from 0 to 1 every four seconds. Ease bends it into an in-out cubic, so the Path point sets off slowly from the bottom of the heart, races round the curves, and slows as it arrives home. Trails shows the speed as the length of the streak.',
      preview: 'The {output} shows a red point tracing a heart, with a short tail at the slow ends and a long streak through the fast middle.',
    }),
  },

  Function: {
    overview: [
      'Function applies one maths function to a number: sin, cos, abs, sqrt, square, floor or round. Sin and cos take their input in whole turns, so 1 is a full circle.',
      'It does not move on its own; feed it Time, a Wave or another signal. Abs folds a swing into a bounce, square makes small values smaller, floor and round snap a smooth value into steps.',
    ],
    inputs: {
      x: 'The number the function is applied to.',
    },
    outputs: {
      result: 'The function of X.',
    },
    example: example({
      featured: 'Function',
      title: 'A ball that bounces on the floor',
      nodes: {
        swing: ['Wave', { frequency: 0.5 }],
        bounce: ['Function', { fn: 'abs' }],
        height: ['MapRange', { inMin: 0, inMax: 1, outMin: 0.85, outMax: 0.15 }],
        ball: ['Shape', { shape: 'ellipse', size: 2.2, filled: true, fill: '#ff7a1a', edge: '#ffe0a0', thickness: 0.6 }],
        trails: ['Trails', { decay: 0.5 }],
      },
      wires: ['swing.result > bounce.x', 'bounce.result > height.value', 'height.result > ball.cy', 'ball.frame > trails.frame'],
      explanation: 'A sine Wave swings from −1 to +1. Function’s abs folds the negative half up, which turns a smooth swing into the sharp-bottomed curve of a bounce. Map Range turns that into height, with 0 on the floor, and Shape draws the ball.',
      preview: 'The {output} shows an orange ball bouncing — slowing at the top of each arc and snapping off the floor.',
    }),
  },

  Expression: {
    overview: [
      'Expression computes one number from a formula you write. It knows t (time in seconds), a and b (two inputs you can wire), W and H (the matrix size), the usual maths functions, and FastLED’s integer helpers such as sin8, beatsin8 and triwave8.',
      'Reach for it when a chain of Math nodes would be hard to read — one line of maths says it more clearly. The same formula runs in the preview and in the uploaded sketch.',
      'Formulas run only in a trusted workspace. In an untrusted one, or when the formula has an error, the result reads 0.',
    ],
    inputs: {
      a: 'A number your formula can read as a.',
      b: 'A number your formula can read as b.',
    },
    outputs: {
      result: 'The formula’s value this frame.',
    },
    example: example({
      featured: 'Expression',
      title: 'A fire that breathes in uneven gusts',
      nodes: {
        gusts: ['Expression', { formula: 'abs(sin(t*1.3)) * (0.55 + 0.45*sin(t*0.21))' }],
        fire: ['Fire', { fireStyle: 'smoke', palette: 'emberglow', cooling: 60 }],
      },
      wires: ['gusts.result > fire.intensity'],
      explanation: 'Expression multiplies a quick bouncing sine by a much slower swell, so the gusts come in uneven groups — a few strong, then a lull. The result sets Fire’s intensity, and the smoky flames rise and slump with it.',
      preview: 'The {output} shows smoky flames that flare in irregular gusts and sink between them.',
    }),
  },

  Gate: {
    overview: [
      'Gate passes a number through while its Gate input is true. While it is false it outputs Fallback instead.',
      'It is how to let a signal act only some of the time: colours that wander only while a button is held, a level that only counts during the chorus, a sensor that only matters when someone is there.',
    ],
    inputs: {
      value: 'The number to pass while Gate is true.',
      gate: 'True lets Value through; false outputs Fallback.',
    },
    outputs: {
      result: 'Value while Gate is true, otherwise Fallback.',
    },
    example: example({
      featured: 'Gate',
      title: 'Colours that roam only while you hold the button',
      nodes: {
        roam: ['NoiseSignal', { speed: 0.5, min: 0, max: 1 }],
        hold: ['ButtonInput'],
        gate: ['Gate', { fallback: 0 }],
        lamp: ['Rainbow', { speed: 0.2, deltaHue: 3 }],
        tint: ['HueShift'],
      },
      wires: ['roam.value > gate.value', 'hold.pressed > gate.gate', 'gate.result > tint.shift', 'lamp.frame > tint.frame'],
      explanation: 'Noise LFO wanders round the colour wheel, but Gate lets it reach Hue Shift only while the Button is held; otherwise it sends the Fallback of 0. Let go and the rainbow snaps back to its own colours.',
      preview: 'The {output} shows a gentle rainbow. Hold the press control on the Button node and the colours start drifting; release it and they return.',
    }),
  },

  Smooth: {
    overview: [
      'Smooth follows a number gently instead of jumping. Response is how many seconds it takes to cover most of a change; 0 passes values straight through.',
      'Use it to take the jitter out of a sensor, to soften a switch into a fade, or to turn stepped values into glides.',
      'It is a simple low-pass filter: fast flicker is averaged away and slow changes come through.',
    ],
    inputs: {
      value: 'The number to follow.',
    },
    outputs: {
      result: 'Value, eased in over the Response time.',
    },
    example: example({
      featured: 'Smooth',
      title: 'Soften a hard on-off into a breathing glow',
      nodes: {
        square: ['Wave', { frequency: 0.4, amplitude: 6, offset: 1.5, unipolar: true, waveform: 'square' }],
        soften: ['Smooth', { response: 0.35 }],
        orb: ['Shape', { shape: 'ellipse', filled: true, fill: '#6a3dff', edge: '#b8a6ff', thickness: 1 }],
      },
      wires: ['square.result > soften.value', 'soften.result > orb.size'],
      explanation: 'A square Wave jumps between a small and a large size every 1.25 seconds. Smooth follows it with a 0.35-second response, so the orb swells and shrinks with soft exponential edges instead of snapping.',
      preview: 'The {output} shows a violet orb growing smoothly to fill the matrix, then easing back to a small dot.',
    }),
  },

  SampleHold: {
    overview: [
      'Sample & Hold captures a number at the moment its Trigger fires and holds it until the next trigger. Between triggers the output does not change, however much the input moves.',
      'Paired with Random it gives a new random value per beat, per press or per interval — a fresh colour, position or setting that then stays put.',
    ],
    inputs: {
      value: 'The number to capture.',
      trigger: 'Each rising edge captures Value.',
    },
    outputs: {
      result: 'The value captured at the last trigger.',
    },
    example: example({
      featured: 'SampleHold',
      title: 'A kaleidoscope that clicks to a new setting',
      nodes: {
        dice: ['Random', { min: 3, max: 12 }],
        tick: ['Interval', { interval: 1.5 }],
        hold: ['SampleHold'],
        plasma: ['Plasma', { palette: 'coralreef', speed: 0.35 }],
        scope: ['Kaleidoscope'],
      },
      wires: ['dice.value > hold.value', 'tick.pulse > hold.trigger', 'hold.result > scope.segments', 'plasma.frame > scope.frame'],
      explanation: 'Random rolls a new number every frame, but Sample & Hold keeps only the one rolled when Interval fires. Every 1.5 seconds the Kaleidoscope gets a new number of mirrors, between three and twelve, and holds it.',
      preview: 'The {output} shows a coral-reef kaleidoscope that snaps to a different symmetry every second and a half.',
    }),
  },

  Switch: {
    overview: [
      'Switch outputs A while Select is false and B while it is true. It is a two-position selector for numbers.',
      'Give a true/false signal two meanings in a number: a slow speed and a fast one, a dim level and a bright one, a weekday mode and a weekend mode.',
      'To switch between two whole pictures, use Frame Switch instead.',
    ],
    inputs: {
      a: 'The value while Select is false.',
      b: 'The value while Select is true.',
      sel: 'Chooses between A (false) and B (true).',
    },
    outputs: {
      result: 'A or B.',
    },
    example: example({
      featured: 'Switch',
      title: 'Calm on weekdays, lively at the weekend',
      nodes: {
        clock: ['RTCInput', { timeSource: 'DS3231' }],
        mood: ['Switch', { a: 0.2, b: 0.85 }],
        confetti: ['Confetti', { palette: 'citrus', fade: 0.3 }],
      },
      wires: ['clock.weekend > mood.sel', 'mood.result > confetti.speed'],
      output: STRIP(60),
      explanation: 'RTC Clock’s Weekend output selects between two speeds in Switch: a sparse 0.2 on weekdays and a busy 0.85 on Saturday and Sunday. Confetti uses whichever is current.',
      preview: 'The reference time is a Friday, so the {output} shows sparse citrus speckles. At the weekend they come thick and fast.',
    }),
  },

  Not: {
    overview: [
      'Not flips a true/false signal: true becomes false and false becomes true.',
      'Use it when a signal means the opposite of what an input wants — “silence” into something that wants “music playing”, “someone present” into something that should turn off.',
    ],
    inputs: {
      x: 'The signal to flip.',
    },
    outputs: {
      result: 'The opposite of X.',
    },
    example: example({
      featured: 'Not',
      title: 'Sparkle only while music plays',
      nodes: {
        mic: ['MicInput'],
        features: ['AudioFeatures', { gate: 0.15 }],
        playing: ['Not'],
        sea: ['Pacifica', { palette: 'ocean' }],
        sparkle: ['Glitter', { glitterMode: 'add', r: 255, g: 245, b: 220 }],
      },
      wires: ['mic.audio > features.audio', 'features.silence > playing.x', 'playing.result > sparkle.density', 'sea.frame > sparkle.frame'],
      explanation: 'Audio Features reports Silence, but Glitter should sparkle when there is music. Not turns Silence into “playing”, which sets Glitter’s density to full while music plays and to nothing in the gaps.',
      preview: 'Play music and the {output} shows Pacifica covered in sparkles. When the music stops, the sparkles stop and only the sea remains.',
    }),
  },

  Logic: {
    overview: [
      'Logic combines two true/false signals: And (both), Or (either), Xor (exactly one), Nand (not both) or Nor (neither). An unwired side counts as false.',
      'It is how to build a condition from two simpler ones — someone present and it is evening, the kick and the snare together, a button or a remote key.',
      'Level inputs such as a drum envelope count as true from 0.5 up.',
    ],
    inputs: {
      a: 'The first condition.',
      b: 'The second condition.',
    },
    outputs: {
      result: 'A and B combined by the chosen operation.',
    },
    example: example({
      featured: 'Logic',
      title: 'Flash only when kick and snare land together',
      nodes: {
        mic: ['MicInput'],
        drums: ['PercussionDetect', { sensitivity: 0.6, separation: 0.5 }],
        both: ['Logic', { logicOp: 'and' }],
        plasma: ['Plasma', { palette: 'purple', speed: 0.3 }],
        flash: ['BeatFlash', { intensity: 0.7, decay: 0.75, r: 255, g: 210, b: 255 }],
      },
      wires: [
        'mic.audio > drums.audio',
        'drums.kick > both.a',
        'drums.snare > both.b',
        'both.result > flash.beat',
        'plasma.frame > flash.frame',
      ],
      explanation: 'Percussion Detect’s Kick and Snare envelopes count as true while they are above 0.5. Logic in And mode is true only when both are, so Beat Flash fires on the big accents where the drummer hits both at once, not on every beat.',
      preview: 'Play a track with a full drum kit. The {output} shows a purple plasma that flashes pale pink only on the heaviest accents.',
    }),
  },

  Compare: {
    overview: [
      'Compare is true while A is greater than B. It turns a level into a decision: loud enough, close enough, warm enough.',
      'Leave B unwired to compare against a fixed threshold, or wire both to compare two signals. Put a Trigger set to Debounce after it if a level near the threshold makes it flicker.',
    ],
    inputs: {
      a: 'The value being tested.',
      b: 'The threshold, or a second value to compare against.',
    },
    outputs: {
      result: 'True while A is greater than B.',
    },
    example: example({
      featured: 'Compare',
      title: 'Switch the sea to fire when the bass gets loud',
      nodes: {
        mic: ['MicInput'],
        fft: ['FFTAnalyzer', { smoothing: 0.8 }],
        loud: ['Compare', { b: 0.6 }],
        sea: ['Pacifica', { palette: 'ocean' }],
        fire: ['Fire', { fireStyle: 'classic', palette: 'fire' }],
        choose: ['FrameSwitch'],
      },
      wires: [
        'mic.audio > fft.audio',
        'fft.bass > loud.a',
        'loud.result > choose.sel',
        'sea.frame > choose.a',
        'fire.frame > choose.b',
      ],
      explanation: 'Compare is true while FFT Analyzer’s bass level is above 0.6. Frame Switch shows calm Pacifica waves until the bass crosses that line, then Fire for as long as it stays there.',
      preview: 'Play music near the microphone. Quiet passages show the {output} as ocean waves; heavy bass sections turn it to fire.',
    }),
  },

  Trigger: {
    overview: [
      'Trigger is a toolbox for true/false pulses. Choose what it does: Debounce cleans up a noisy contact, Changed fires when the input changes, Toggle flips a lasting on/off on each press, One Shot stretches a pulse to a set length, Pulse Divider fires once every N pulses, and Delay fires a set time after the input.',
      'Toggle also has separate On and Off inputs, which suit a remote with dedicated keys. Off wins over On, and both win over Trigger. Start On sets its state at start-up.',
      'On the canvas the node takes the name of its mode — Toggle, Debounce, Pulse Divider — so a patch reads plainly.',
    ],
    inputs: {
      trigger: 'The incoming signal or pulses.',
      on: 'Toggle only: forces the output on.',
      off: 'Toggle only: forces the output off. Wins over On and Trigger.',
    },
    outputs: {
      out: 'The processed signal.',
    },
    example: example({
      featured: 'Trigger',
      title: 'One big ripple at the top of every bar',
      nodes: {
        clock: ['Clock', { bpm: 110 }],
        every4: ['Trigger', { triggerOp: 'pulseDivider', divideBy: 4 }],
        ripple: ['RainRipples', { palette: 'ultraviolet', spawnSpread: 0, count: 4, decay: 2, thickness: 1.6 }],
      },
      wires: ['clock.beat > every4.trigger', 'every4.out > ripple.trigger'],
      output: RING(24),
      explanation: 'Clock beats at 110 BPM, and Trigger in Pulse Divider mode passes only every fourth beat. Each one starts a wide ripple from the centre of Rain Ripples, so the ring blooms once a bar instead of on every beat.',
      preview: 'The {output} glows violet as a ring of light spreads out once at the start of every bar.',
    }),
  },

  TextValue: {
    overview: [
      'Text Value holds one fixed line of text and offers it on a wire.',
      'Wire it to a Text pattern to scroll it across the LEDs, or to a screen design’s text widget. One Text Value can feed several places, so a message is typed once.',
      'Line breaks become spaces; for two rows on the LEDs, use the Text pattern’s own field.',
    ],
    outputs: {
      text: 'The line of text.',
    },
    example: example({
      featured: 'TextValue',
      title: 'A scrolling banner for the shop window',
      nodes: {
        message: ['TextValue', { text: 'FRESH COFFEE - OPEN LATE - ' }],
        banner: ['Text', { scroll: 10, wrap: true, r: 255, g: 190, b: 60 }],
        output: ['MatrixOutput', { form: 'matrix', width: 32, height: 8 }],
      },
      wires: ['message.text > banner.text'],
      explanation: 'Text Value holds the message and Text scrolls it from right to left in warm amber, wrapping so it never leaves a gap. Change the words on Text Value and the banner follows.',
      preview: 'The {output} shows the message scrolling continuously across a long, thin matrix.',
    }),
  },

  FormatNumber: {
    overview: [
      'Format Number turns a number into text: how many decimals, padding with leading zeros, a + sign, and a prefix or suffix such as a unit.',
      'Making it a node keeps the decision visible on the canvas, and the preview and the board round the same way. When a number is too large for Max Digits it shows an overflow marker rather than a wrong value.',
      'Wire the text into a Text pattern or a screen design’s readout.',
    ],
    inputs: {
      value: 'The number to format.',
    },
    outputs: {
      text: 'The number as text.',
    },
    example: example({
      featured: 'FormatNumber',
      title: 'Show the tempo on the LEDs',
      nodes: {
        mic: ['MicInput'],
        beat: ['BeatDetect'],
        tempo: ['FormatNumber', { decimals: 0, padWidth: 3, suffix: ' BPM' }],
        readout: ['Text', { r: 255, g: 80, b: 200 }],
        output: ['MatrixOutput', { form: 'matrix', width: 40, height: 8 }],
      },
      wires: ['mic.audio > beat.audio', 'beat.bpm > tempo.value', 'tempo.text > readout.text'],
      explanation: 'Beat Detect estimates the tempo. Format Number rounds it to a whole number, pads it to three digits so it does not jump about, and adds “ BPM”. Text draws it.',
      preview: 'Play music near the microphone. The {output} shows the current tempo, such as 124 BPM, in pink.',
    }),
  },

  FormatDateTime: {
    overview: [
      'Format Date/Time turns an RTC Clock reading into text: HH:MM, HH:MM:SS, a date, a weekday, or a weekday with the time.',
      'It reads the clock’s DateTime wire. With nothing wired, or a clock that is not yet valid, it shows dashes rather than a believable wrong time.',
      'For a ready-made clock face on the LEDs use Clock Display; this node is for putting the time inside your own text.',
    ],
    inputs: {
      dateTime: 'A clock reading from RTC Clock’s DateTime output.',
    },
    outputs: {
      text: 'The time or date as text.',
    },
    example: example({
      featured: 'FormatDateTime',
      title: 'The day and time on a ticker',
      nodes: {
        clock: ['RTCInput', { timeSource: 'DS3231' }],
        when: ['FormatDateTime', { dateTimeFormat: 'Weekday HH:MM' }],
        ticker: ['Text', { scroll: 8, wrap: true, r: 90, g: 220, b: 255 }],
        output: ['MatrixOutput', { form: 'matrix', width: 32, height: 8 }],
      },
      wires: ['clock.dateTime > when.dateTime', 'when.text > ticker.text'],
      explanation: 'RTC Clock reads a battery-backed DS3231. Format Date/Time turns it into the weekday and the hour and minute, and Text scrolls that across the matrix.',
      preview: 'The {output} scrolls the weekday and time, such as FRI 10:04, in ice blue.',
    }),
  },
}
