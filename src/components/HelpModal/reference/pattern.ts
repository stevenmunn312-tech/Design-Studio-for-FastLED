import { example, MATRIX, RING, SAMPLE_IMAGE, STRIP } from './example'
import type { NodeReferenceMap } from './types'

const BASE_INPUT = 'An optional frame drawn underneath. Unwired, the background is black.'

export const PATTERN_REFERENCE: NodeReferenceMap = {
  SolidColor: {
    overview: [
      'Solid Color fills every LED with one colour. Set it with the R, G and B fields, or wire a colour in.',
      'It is the simplest frame there is, and a useful one: a colour from a sampler, a sensor or a sweep becomes light across the whole build. It also makes a steady base for effects such as Glitter to work on.',
    ],
    inputs: {
      color: 'The fill colour. Replaces the R, G and B fields.',
    },
    example: example({
      featured: 'SolidColor',
      title: 'Mood lighting that drifts through a sunset',
      nodes: {
        drift: ['NoiseSignal', { speed: 0.15, min: 0, max: 1 }],
        sunset: ['PaletteSampler', { palette: 'sunset' }],
        fill: ['SolidColor'],
      },
      wires: ['drift.value > sunset.t', 'sunset.color > fill.color'],
      output: STRIP(60),
      explanation: 'Noise LFO wanders along the sunset palette, Palette Sampler turns its position into a colour, and Solid Color fills the whole string with it — a single soft colour that changes slowly and never repeats.',
      preview: 'The {output} glows in one sunset colour that slowly wanders between gold, coral and violet.',
    }),
  },

  Gauge: {
    overview: [
      'Gauge draws a 0–1 reading as a bar, a dot, a full ring or an arc. It is the quickest way to show a level: a sensor, a volume, a progress.',
      'Bar and Dot run along the matrix or string in any direction. Ring and Arc follow an LED ring; set Ring LEDs to match the ring’s LED count. Segments splits the fill into blocks that light whole, and Peak Hold leaves a marker at the highest recent reading.',
      'Put a Map Range in front of a reading in real units so its useful span becomes 0–1.',
    ],
    inputs: {
      base: BASE_INPUT,
    },
    example: example({
      featured: 'Gauge',
      title: 'A speedometer arc with a peak marker',
      nodes: {
        speed: ['NoiseSignal', { speed: 0.5, min: 0.35, max: 0.95, octaves: 2 }],
        dial: ['Gauge', { gaugeStyle: 'arc', ringLeds: 24, arcStart: 225, arcSweep: 270, palette: 'citrus', peakHold: 2 }],
      },
      wires: ['speed.value > dial.value'],
      output: RING(24),
      explanation: 'Noise LFO wanders like a car’s speed. Gauge draws it as a 270° arc round the LED ring in citrus colours, with a marker that holds the highest reading for two seconds before it drops.',
      preview: 'The {output} shows a partly filled arc that rises and falls, with a single bright marker lingering at the recent peak.',
    }),
  },

  SDVideo: {
    overview: [
      'SD Video plays a short video clip from the SD card. Import a clip in the node body: Studio decodes it in the browser, shrinks it to the LED canvas, and stores it as raw frames, so the board only has to read bytes off the card.',
      'Clips can be up to 120 seconds at up to 60 frames a second and 64×64 pixels. Write to card copies the clip to the card’s /video folder. Speed changes the playback rate and Loop starts it again at the end.',
      'The clip’s frames live in your browser, not in the project file. On another computer, import it again.',
    ],
    steps: [
      'Add an SD Card part on the Hardware tab and wire its SPI pins.',
      'Import a video clip in the node body.',
      'Press Write to card with the card in a reader, or upload the sketch and copy the file across yourself.',
    ],
    outcome: 'Import a clip to see it. Without one, the frame is black, exactly as the sketch shows when the file is missing.',
    example: example({
      featured: 'SDVideo',
      title: 'Scrub a clip’s speed with a knob',
      nodes: {
        knob: ['PotInput'],
        rate: ['MapRange', { inMin: 0, inMax: 1, outMin: 0.25, outMax: 2 }],
        clip: ['SDVideo', { loop: true }],
      },
      wires: ['knob.value > rate.value', 'rate.result > clip.speed'],
      explanation: 'SD Video plays an imported clip from the card. The Potentiometer, through Map Range, sets its speed from quarter-speed slow motion to double speed.',
      preview: 'Import a clip into the SD Video node and the {output} plays it. Turn the knob to slow it down or speed it up.',
      workflow: true,
    }),
  },

  Text: {
    overview: [
      'Text draws words in a bitmap font, still or scrolling. Type the text on the node, or wire text in from Text Value, Format Number or Format Date/Time.',
      'X and Y place it, with the alignment choosing which part of the text sits there. Scroll moves it in pixels per second along either axis, and Wrap repeats it across the opposite edge so a scrolling line never leaves a gap.',
      'A new line in the typed text starts a second row. Wired text is drawn at run time in the built-in font.',
    ],
    inputs: {
      text: 'Text to draw. Replaces the typed text.',
      color: 'Text colour. Replaces the R, G and B fields.',
    },
    example: example({
      featured: 'Text',
      title: 'A birthday banner',
      nodes: {
        banner: ['Text', { text: 'HAPPY BIRTHDAY SAM!', scroll: 9, wrap: true, r: 255, g: 120, b: 210, letterSpacing: 1 }],
        confetti: ['Confetti', { palette: 'party', speed: 0.3, fade: 0.35 }],
        layer: ['Blend', { blendMode: 'screen', amount: 0.6 }],
        output: ['MatrixOutput', { form: 'matrix', width: 32, height: 8 }],
      },
      wires: ['banner.frame > layer.a', 'confetti.frame > layer.b'],
      explanation: 'Text scrolls the greeting in pink, wrapping so it loops without a gap, and Blend screens a light shower of Confetti over it.',
      preview: 'The {output} scrolls HAPPY BIRTHDAY SAM! across a long, thin matrix, sprinkled with confetti.',
    }),
  },

  ClockDisplay: {
    overview: [
      'Clock Display draws the time on the LEDs: digital in several formats, an analogue face, or either with the date. It also has a Stopwatch and a countdown Timer that need no clock at all.',
      'Wire RTC Clock’s DateTime into it for the clock modes. It shows dashes until the clock is valid, synced and not stale, so a build never shows a believable wrong time.',
      'Run, Reset and Duration control the stopwatch and timer, and Done pulses when the timer reaches zero. Base draws the clock over another frame.',
    ],
    inputs: {
      dateTime: 'The time from RTC Clock’s DateTime output.',
      base: BASE_INPUT,
      color: 'Digit or hand colour. Replaces the R, G and B fields.',
    },
    outputs: {
      frame: 'The clock drawing.',
      seconds: 'Stopwatch or timer seconds.',
      done: 'True when the timer reaches zero.',
    },
    example: example({
      featured: 'ClockDisplay',
      title: 'An analogue wall clock',
      nodes: {
        rtc: ['RTCInput', { timeSource: 'DS3231' }],
        face: ['ClockDisplay', { displayMode: 'Analog', radius: 7, r: 255, g: 230, b: 170 }],
        backdrop: ['Breathe', { palette: 'deepsea', bpm: 6, minLevel: 0.3 }],
      },
      wires: ['rtc.dateTime > face.dateTime', 'backdrop.frame > face.base'],
      explanation: 'RTC Clock reads a battery-backed DS3231. Clock Display draws an analogue face from it, with hour and minute hands, over a slow deep-sea Breathe.',
      preview: 'The {output} shows a round clock face reading about four minutes past ten, glowing over a slowly breathing blue.',
    }),
  },

  Line: {
    overview: [
      'Line draws a straight anti-aliased line between two points. Coordinates are in pixels from the top left, and accept expressions such as W/2 or max_x so a line can follow the matrix size.',
      'Wire signals into the ends to move it: sines for a sweeping arm, sensors for a pointer.',
    ],
    inputs: {
      base: BASE_INPUT,
      color: 'Line colour. Replaces the R, G and B fields.',
    },
    example: example({
      featured: 'Line',
      title: 'A radar sweep',
      nodes: {
        armX: ['Wave', { frequency: 0.3, amplitude: 7.5, offset: 7.5 }],
        armY: ['Wave', { frequency: 0.3, amplitude: 7.5, offset: 7.5, phase: 0.25 }],
        arm: ['Line', { x1: 'W/2', y1: 'H/2', r: 60, g: 255, b: 90 }],
        afterglow: ['Trails', { decay: 0.3 }],
      },
      wires: ['armX.result > arm.x2', 'armY.result > arm.y2', 'arm.frame > afterglow.frame'],
      explanation: 'Line starts at the centre of the matrix. Two Waves a quarter-turn apart move its far end round a circle, so the line becomes a rotating radar arm, and Trails leaves the familiar fading green sweep behind it.',
      preview: 'The {output} shows a green arm sweeping round the centre with a fading afterglow.',
    }),
  },

  Shape: {
    overview: [
      'Shape draws a rectangle, an ellipse or a regular polygon, filled or as an outline, with separate fill and edge colours.',
      'Sides accepts fractions and morphs smoothly between counts, so a triangle can grow into an octagon. Size, aspect, rotation and position can all be wired, and Wrap tiles a shape that crosses an edge.',
      'Position values from 0 to 1 are fractions of the matrix; values above 1 are pixels.',
    ],
    inputs: {
      base: BASE_INPUT,
    },
    example: example({
      featured: 'Shape',
      title: 'A triangle that grows into an octagon',
      nodes: {
        corners: ['Wave', { frequency: 0.15, amplitude: 5, offset: 3, unipolar: true, waveform: 'triangle' }],
        turn: ['Wave', { frequency: 0.05, amplitude: 180 }],
        form: ['Shape', { shape: 'polygon', size: 6.5, filled: true, fill: '#14306e', edge: '#7cf3ff', thickness: 1.5 }],
      },
      wires: ['corners.result > form.sides', 'turn.result > form.rotation'],
      explanation: 'A triangle Wave climbs from 3 to 8 and back, and Shape morphs smoothly through every corner count in between. A second, slower Wave turns it.',
      preview: 'The {output} shows a navy polygon with a cyan edge, slowly turning and gaining corners until it is nearly round, then losing them again.',
    }),
  },

  Path: {
    overview: [
      'Path traces a point along a curve — a circle, heart, Lissajous figure, rose, or your own closed spline. T is where on the curve the point sits, 0 to 1 for once round.',
      'The point is splatted with sub-pixel accuracy, so it glides smoothly even on a small matrix. Follow it with Trails to draw the curve as it moves.',
    ],
    inputs: {
      base: BASE_INPUT,
      color: 'Point colour. Replaces the R, G and B fields.',
    },
    example: example({
      featured: 'Path',
      title: 'Trace a rose in time with the beat',
      nodes: {
        clock: ['Clock', { bpm: 40 }],
        pen: ['Path', { pathShape: 'rose', scale: 0.9, thickness: 1.4, r: 255, g: 90, b: 200 }],
        ink: ['Trails', { decay: 0.22 }],
      },
      wires: ['clock.phase > pen.t', 'pen.frame > ink.frame'],
      explanation: 'Clock’s Phase rises from 0 to 1 once per beat at 40 BPM, so Path sends its point once round the rose every second and a half. Trails keeps the curve drawn behind it.',
      preview: 'The {output} shows a pink rose of petals being drawn and redrawn by a bright moving point.',
    }),
  },

  FourierEpicycles: {
    overview: [
      'Fourier Epicycles redraws an outline with a chain of rotating circles, each turning at a different speed — the way a Fourier series builds any shape from circles.',
      'Harmonics sets how many circles are in use, largest first. With a few the outline is a rough blob; with all of them it is exact. Fractions fade the next circle in, so animating Harmonics grows the shape before your eyes.',
      'Show Circles draws the circles as dim guides and Show Pen marks where the drawing happens. Custom outlines take your own points.',
    ],
    inputs: {
      base: BASE_INPUT,
      color: 'Pen colour. Replaces the R, G and B fields.',
    },
    example: example({
      featured: 'FourierEpicycles',
      title: 'Watch circles learn to draw a star',
      nodes: {
        learn: ['Wave', { frequency: 0.05, amplitude: 31, offset: 1, unipolar: true, waveform: 'triangle' }],
        draw: ['FourierEpicycles', { outline: 'star', speed: 0.25, persistence: 0.99, showCircles: true, r: 255, g: 210, b: 90 }],
      },
      wires: ['learn.result > draw.harmonics'],
      output: MATRIX(24, 24),
      explanation: 'A slow triangle Wave raises Fourier Epicycles’ Harmonics from 1 to 32 and back over twenty seconds. With one circle the pen draws a circle; as more circles join, the outline sharpens into a five-pointed star, then softens again.',
      preview: 'The {output} shows golden circles turning inside one another while the pen traces a shape somewhere between a circle and a star.',
    }),
  },

  Wireframe3D: {
    overview: [
      '3D Wireframe draws a rotating 3D model as lines: a cube, pyramid, octahedron or icosahedron, or your own .obj or .json mesh. It is scaled to fit the matrix.',
      'Spin X, Y and Z turn it in degrees per second. Perspective makes the far side smaller, and Depth Shade dims the far edges so the front reads clearly.',
    ],
    inputs: {
      base: BASE_INPUT,
      color: 'Line colour. Replaces the R, G and B fields.',
    },
    example: example({
      featured: 'Wireframe3D',
      title: 'A pyramid that pumps with the bass',
      nodes: {
        mic: ['MicInput'],
        fft: ['FFTAnalyzer', { smoothing: 0.6 }],
        size: ['MapRange', { inMin: 0, inMax: 1, outMin: 0.7, outMax: 1.6 }],
        pyramid: ['Wireframe3D', { model: 'pyramid', spinY: 50, spinX: 12, projection: 'perspective', r: 255, g: 60, b: 160 }],
      },
      wires: ['mic.audio > fft.audio', 'fft.bass > size.value', 'size.result > pyramid.scale'],
      explanation: '3D Wireframe spins a pink pyramid in perspective. FFT Analyzer’s bass, through Map Range, sets its scale, so the pyramid swells on every kick and shrinks between them.',
      preview: 'Play music near the microphone. The {output} shows a spinning pink pyramid that grows and shrinks with the bass.',
    }),
  },

  GradientFrame: {
    overview: [
      'Gradient Frame fills the matrix with a smooth blend from Color A to Color B, left to right or top to bottom.',
      'Mix chooses the path between the two colours: straight through RGB, or round the hue wheel the short or long way. The long way turns any two colours into a rainbow.',
    ],
    inputs: {
      colorA: 'The starting colour. Replaces the A fields.',
      colorB: 'The ending colour. Replaces the B fields.',
    },
    example: example({
      featured: 'GradientFrame',
      title: 'A dusk sky in two colours',
      nodes: {
        sky: ['GradientFrame', { rA: 30, gA: 10, bA: 90, rB: 255, gB: 120, bB: 30, vertical: true, mixMode: 'hsvShort' }],
        stars: ['Glitter', { density: 0.06, glitterMode: 'add', r: 255, g: 255, b: 255 }],
      },
      wires: ['sky.frame > stars.frame'],
      explanation: 'Gradient Frame runs from deep indigo at the top to orange at the horizon, mixing round the hue wheel through purples and pinks. A sparse Glitter adds the first stars.',
      preview: 'The {output} shows an indigo-to-orange dusk sky with a few twinkling stars.',
    }),
  },

  PaletteGradient: {
    overview: [
      'Palette Gradient spreads a palette across the matrix at any angle. Repeat lays it down several times, and Scroll moves the colours along the gradient.',
      'Wire a signal into Angle and the whole gradient turns.',
    ],
    example: example({
      featured: 'PaletteGradient',
      title: 'Bands of colour turning like a clock hand',
      nodes: {
        turn: ['Wave', { frequency: 0.05, amplitude: 360, unipolar: true, waveform: 'sawtooth' }],
        bands: ['PaletteGradient', { palette: 'sunset', repeat: 2, speed: 0.2 }],
      },
      wires: ['turn.result > bands.angle'],
      explanation: 'A slow sawtooth sweeps Angle round a full circle every twenty seconds, so Palette Gradient’s sunset bands rotate across the matrix while they also scroll along their own length.',
      preview: 'The {output} shows two repeats of the sunset palette as broad bands, slowly turning and flowing.',
    }),
  },

  PolarGradient: {
    overview: [
      'Polar Gradient wraps a palette round the centre of the matrix. At Radial Mix 0 it is a colour wheel; at 1 it is rings from the centre; between, it is a spiral.',
      'Spin turns the wheel, Radial Scroll moves the rings in or out, and Repeat lays the palette down several times. It suits rings and round builds especially well.',
    ],
    example: example({
      featured: 'PolarGradient',
      title: 'A hypnotic spiral',
      nodes: {
        spiral: ['PolarGradient', { palette: 'opal', radialMix: 0.6, spin: -0.2, repeat: 3, radialScroll: 0.3 }],
      },
      explanation: 'Polar Gradient alone: a Radial Mix of 0.6 makes a spiral, three repeats give three arms, and spin and radial scroll run against each other so the spiral seems to pour inward forever.',
      preview: 'The {output} shows a three-armed opal spiral that seems to flow endlessly toward the centre.',
    }),
  },

  Image: {
    overview: [
      'Image shows a picture: a still image or an animated GIF, APNG or WebP. Fit decides how it meets the matrix, and Zoom with Crop X and Y moves into part of it.',
      'Colour controls — brightness, saturation, contrast, hue, gamma, monochrome, posterising and dithering — adjust the picture for LEDs, which often need more contrast and gamma than a screen.',
      'Image Data carries the picture itself to Palette from Image.',
    ],
    outputs: {
      frame: 'The picture as a frame.',
      image: 'The picture’s pixel data, for Palette from Image.',
    },
    example: example({
      featured: 'Image',
      title: 'A slow zoom across a picture',
      nodes: {
        drift: ['Wave', { frequency: 0.08, amplitude: 0.6, offset: 1, unipolar: true, phase: 0.75 }],
        pan: ['Wave', { frequency: 0.05, amplitude: 0.3, offset: 0.5 }],
        photo: ['Image', { image: SAMPLE_IMAGE, fit: 'contain', sampling: 'smooth', saturation: 1.2 }],
      },
      wires: ['drift.result > photo.zoom', 'pan.result > photo.cropX'],
      explanation: 'One Wave zooms Image between the whole picture and 1.6 times closer, and a slower one pans across it — the documentary “Ken Burns” move, on a small star picture.',
      preview: 'The {output} shows a pink star on navy, slowly zooming in and drifting sideways before pulling back out.',
    }),
  },

  Noise: {
    overview: [
      'Noise draws natural-looking texture from many noise algorithms: smooth fields, simplex, 3D and 4D noise, Worley cells, plasma fractals, fractal clouds (fBm) and Gabor bands.',
      'Shape folds the noise for sharp ridges or soft billows. Worley can draw distance, cell gaps or cell edges, and Gabor draws oriented bands. Wrap X joins the edges seamlessly for a ring or a corkscrew.',
      'Noise also outputs a Field, so the same texture can feed field nodes. On the canvas it takes the name of the algorithm chosen.',
    ],
    outputs: {
      frame: 'The texture, coloured by the palette.',
      field: 'The same texture as a field, 0 to 1, for field nodes.',
    },
    example: example({
      featured: 'Noise',
      title: 'Cell walls like a dragonfly’s wing',
      nodes: {
        cells: ['Noise', { noiseType: 'worley', worleyMode: 'edges', palette: 'laguna', speed: 0.3, scale: 0.45 }],
      },
      explanation: 'Noise set to Worley draws a field of cells; Edges mode lights only the borders between them. The laguna palette makes the result look like light through a dragonfly’s wing.',
      preview: 'The {output} shows bright turquoise lines dividing the matrix into slowly shifting cells.',
    }),
  },

  Plasma: {
    overview: [
      'Plasma is the classic demo-scene effect: several sine waves interfere to make flowing, organic bands of colour.',
      'It is calm, endlessly varied and cheap to compute, which makes it a favourite base for other effects. Speed sets how fast the bands move.',
    ],
    example: example({
      featured: 'Plasma',
      title: 'A molten ring',
      nodes: {
        plasma: ['Plasma', { palette: 'volcano', speed: 0.45 }],
      },
      output: RING(24),
      explanation: 'Plasma with the volcano palette, shown on an LED ring: as the interference bands flow, molten reds and oranges chase each other round it.',
      preview: 'The {output} shows red, orange and black bands flowing round it like molten rock.',
    }),
  },

  Rainbow: {
    overview: [
      'Rainbow is FastLED’s fill_rainbow: a full hue sweep across the LEDs that scrolls along them.',
      'Delta Hue is the hue step from one LED to the next. Small values spread a single rainbow over the whole build; larger values repeat it many times.',
    ],
    example: example({
      featured: 'Rainbow',
      title: 'A rainbow that stretches and squeezes',
      nodes: {
        squeeze: ['Wave', { frequency: 0.1, amplitude: 14, offset: 2, unipolar: true }],
        rainbow: ['Rainbow', { speed: 0.4 }],
      },
      wires: ['squeeze.result > rainbow.deltaHue'],
      output: STRIP(60),
      explanation: 'A slow Wave changes Delta Hue between 2 and 16, so Rainbow alternates between one long rainbow along the string and many short ones, while it keeps scrolling.',
      preview: 'The {output} shows a scrolling rainbow that slowly compresses into several repeats and stretches back to one.',
    }),
  },

  Pride2015: {
    overview: [
      'Pride 2015 is Mark Kriegsman’s FastLED classic: a shifting rainbow with a slow, breathing brightness wave rolling through it. It never quite repeats.',
      'Speed sets how fast it moves and Scale how many colour bands fit along the LEDs. Wire a palette to replace the rainbow.',
    ],
    inputs: {
      paletteIn: 'A palette to use instead of the rainbow.',
    },
    example: example({
      featured: 'Pride2015',
      title: 'The FastLED classic on a string',
      nodes: {
        pride: ['Pride2015', { speed: 0.45, scale: 0.35 }],
      },
      output: STRIP(60),
      explanation: 'Pride 2015 on its own, as it was written for: an LED string. Rainbow bands drift along it while waves of brightness roll through them.',
      preview: 'The {output} shows a rainbow with soft bright and dark waves rolling through it.',
    }),
  },

  Pacifica: {
    overview: [
      'Pacifica is Mark Kriegsman’s ocean: several layers of waves scrolling at different speeds, with whitecaps where they peak.',
      'Speed sets how fast the water moves and Scale the size of the swells. The palette sets the water colour from trough to crest; the whitecaps are added on top.',
    ],
    example: example({
      featured: 'Pacifica',
      title: 'A coral lagoon',
      nodes: {
        lagoon: ['Pacifica', { palette: 'coralreef', speed: 0.3, scale: 0.4 }],
      },
      explanation: 'Pacifica with the coral-reef palette instead of its usual deep blue: long slow swells of turquoise and coral, with whitecaps catching the light.',
      preview: 'The {output} shows rolling turquoise and coral waves with flashes of white on the crests.',
    }),
  },

  TwinkleFox: {
    overview: [
      'TwinkleFox is Mark Kriegsman’s twinkling lights: every LED fades in and out on its own schedule, picking its colour from the palette.',
      'Density sets how many are lit at once — sparse sharp sparkles at 0, a constant glow at 1 — and Speed how fast each one twinkles. It is perfect for fairy lights and starry skies.',
    ],
    example: example({
      featured: 'TwinkleFox',
      title: 'Warm fairy lights',
      nodes: {
        fairy: ['TwinkleFox', { palette: 'emberglow', density: 0.55, speed: 0.4 }],
      },
      output: STRIP(60),
      explanation: 'TwinkleFox with the emberglow palette makes a string of warm fairy lights, each twinkling in its own time.',
      preview: 'The {output} shows warm amber and gold lights fading gently in and out at random.',
    }),
  },

  Scanner: {
    overview: [
      'Scanner is the Larson scanner — the Cylon eye, or KITT’s nose: a bright beam sweeping back and forth with a fading tail.',
      'Width sets the bright core and Fade the length of the tail. On a matrix it can sweep along rows or columns.',
    ],
    example: example({
      featured: 'Scanner',
      title: 'KITT’s scanner',
      nodes: {
        eye: ['Scanner', { palette: 'lava', width: 3, fade: 0.7, speed: 0.55 }],
      },
      output: STRIP(30),
      explanation: 'Scanner on a short string, in the lava palette: a red beam sweeps from end to end with a glowing tail, just like the car.',
      preview: 'The {output} shows a red beam sliding back and forth, trailing a fading glow.',
    }),
  },

  TheaterChase: {
    overview: [
      'Theater Chase is the marquee effect: every Nth LED lit, stepping along so the lights seem to run. Spacing sets N.',
      'Colours come from the palette by position and drift with the chase. It reads best on strings and rings.',
    ],
    example: example({
      featured: 'TheaterChase',
      title: 'Marquee lights round a mirror',
      nodes: {
        marquee: ['TheaterChase', { palette: 'rosegold', spacing: 3, speed: 0.5 }],
      },
      output: RING(24),
      explanation: 'Theater Chase on an LED ring, lighting every third LED in rose gold and stepping round, like the bulbs round a dressing-room mirror.',
      preview: 'The {output} shows every third light lit in rose gold, the lit set stepping round the ring.',
    }),
  },

  ColorWipe: {
    overview: [
      'Color Wipe paints the LEDs one by one with a new colour, sweeping from one end to the other; then the next colour wipes over it.',
      'Each wipe takes the next colour a fifth of the way round the palette. Direction can always start at one end, always the other, or bounce.',
    ],
    example: example({
      featured: 'ColorWipe',
      title: 'Paint the string, colour after colour',
      nodes: {
        wipe: ['ColorWipe', { palette: 'rainbow', direction: 'bounce', speed: 0.5 }],
      },
      output: STRIP(60),
      explanation: 'Color Wipe on a string in bounce mode: one colour sweeps along to the end, then the next colour sweeps back.',
      preview: 'The {output} shows a new colour advancing along the string, half of it already painted over the previous colour.',
    }),
  },

  Breathe: {
    overview: [
      'Breathe swells one colour up and down at a rate given in breaths per minute — 12 is a resting adult, 6 is a sleepy calm.',
      'The natural curve copies how breathing actually feels, with a quick rise and a long, relaxed fall; sine and triangle are more mechanical. Min Level stops it going fully dark.',
      'The colour moves along the palette with each breath, from its start when empty to its end at the peak.',
    ],
    example: example({
      featured: 'Breathe',
      title: 'A sleep light to breathe along with',
      nodes: {
        sleep: ['Breathe', { bpm: 6, curve: 'natural', minLevel: 0.04, palette: 'purple' }],
      },
      output: RING(16),
      explanation: 'Breathe at six breaths a minute — a slow, calm rhythm — with the natural curve and a deep purple palette. Breathing in time with it is a common way to wind down for sleep.',
      preview: 'The {output} slowly swells to soft violet and fades almost to dark, once every ten seconds.',
    }),
  },

  Confetti: {
    overview: [
      'Confetti scatters random coloured speckles that fade away, from FastLED’s DemoReel100. Speed and Density set how many appear, Fade how quickly they go.',
      'The colours drift through the palette over time, so a long-running confetti changes mood slowly.',
    ],
    example: example({
      featured: 'Confetti',
      title: 'Confetti in a mirror',
      nodes: {
        speckles: ['Confetti', { palette: 'cottoncandy', speed: 0.5, density: 0.5, fade: 0.25 }],
        mirror: ['Mirror', { mirrorMode: 'quad' }],
      },
      wires: ['speckles.frame > mirror.frame'],
      explanation: 'Confetti throws pastel speckles at random, and Mirror in quad mode reflects one quarter into all four, so the random scatter becomes a symmetric pattern.',
      preview: 'The {output} shows pastel speckles appearing and fading in four-way symmetry.',
    }),
  },

  Candle: {
    overview: [
      'Candle is a warm, flickering flame. In single mode every LED shares one flame; in per-pixel mode each LED flickers on its own, like a cluster of tea lights.',
      'Flicker sets how much it wavers and Warmth its colour, from deep orange to pale yellow.',
    ],
    example: example({
      featured: 'Candle',
      title: 'A window full of tea lights',
      nodes: {
        lights: ['Candle', { mode: 'perPixel', flicker: 0.65, warmth: 0.55 }],
      },
      output: MATRIX(8, 8),
      explanation: 'Candle in per-pixel mode on a small 8×8 panel: sixty-four tiny flames, each flickering on its own like tea lights on a windowsill.',
      preview: 'The {output} shows warm yellow-orange lights flickering independently.',
    }),
  },

  Lightning: {
    overview: [
      'Lightning flashes the whole frame like a storm: each strike is a burst of two to five flickers. Rate sets the average strikes per minute, and Trigger fires a strike on demand.',
      'On its own it is mostly dark between strikes, so it is usually layered — screened over clouds or sea, or used as a mask.',
    ],
    inputs: {
      trigger: 'Each rising edge fires a strike.',
    },
    example: example({
      featured: 'Lightning',
      title: 'Lightning flickering inside the clouds',
      nodes: {
        storm: ['Lightning', { rate: 30, intensity: 1, color: '#d8e4ff' }],
        clouds: ['Noise', { noiseType: 'fbm', palette: 'noir', speed: 0.2, scale: 0.35 }],
        within: ['Mask'],
        sky: ['Blend', { blendMode: 'screen', amount: 1 }],
      },
      wires: ['storm.frame > within.frame', 'clouds.frame > within.mask', 'clouds.frame > sky.a', 'within.frame > sky.b'],
      explanation: 'Mask lets each Lightning flash through only where the Noise clouds are bright, and Blend screens the result over the clouds — so strikes light the clouds from within instead of flooding the whole sky.',
      preview: 'The {output} shows dark grey clouds drifting, lighting up from inside with each strike.',
    }),
  },

  Heartbeat: {
    overview: [
      'Heartbeat pulses with the lub-dub double beat of a heart. BPM sets the heart rate and Strength how far the light dims between beats.',
      'The colour follows the palette: its start at rest, its end at the peak of each beat.',
    ],
    example: example({
      featured: 'Heartbeat',
      title: 'A resting heart on a ring',
      nodes: {
        heart: ['Heartbeat', { bpm: 60, strength: 0.35, palette: 'party' }],
      },
      output: RING(16),
      explanation: 'Heartbeat at a resting 60 beats a minute on a small LED ring, glowing pink at rest and flushing gold on each beat with the party palette.',
      preview: 'The {output} glows pink and pulses gold twice in quick succession every second.',
    }),
  },

  Sunrise: {
    overview: [
      'Sunrise ramps from night blue through dawn colours to warm daylight. In timed mode it starts Start seconds after power-on and takes Duration seconds; in manual mode Progress sets the point on the ramp.',
      'A thirty-minute timed sunrise makes a wake-up light. Master Speed scales its timing like every other animation.',
    ],
    example: example({
      featured: 'Sunrise',
      title: 'A wake-up light, sped up to watch',
      nodes: {
        dawn: ['Sunrise', { mode: 'timed', start: 0, duration: 5 }],
      },
      output: RING(24),
      explanation: 'Sunrise in timed mode with a five-second duration — the real thing would take thirty minutes. It begins in night blue and climbs through dawn colours to daylight.',
      preview: 'The {output} is caught most of the way through its dawn, glowing in warm morning colours.',
    }),
  },

  DigitalRain: {
    overview: [
      'Digital Rain sends streams of light falling down the matrix, each with a bright head and a fading tail — the screen from The Matrix.',
      'Density sets how often streams start, Tail Length how long they are, and Flicker how much they sparkle. Direction makes them fall any way, including along a string.',
    ],
    example: example({
      featured: 'DigitalRain',
      title: 'Code raining down the screen',
      nodes: {
        rain: ['DigitalRain', { palette: 'forest', density: 0.6, tailLength: 10, flicker: 0.35, speed: 0.55 }],
      },
      output: MATRIX(16, 24),
      explanation: 'Digital Rain on a tall matrix with the forest palette: green streams fall at different speeds, white-green at the head and fading to dark.',
      preview: 'The {output} shows green streams of light falling at different speeds.',
    }),
  },

  TVSimulator: {
    overview: [
      'TV Simulator flickers like the light from a television: quick cuts between coloured scenes, with brightness that jumps about.',
      'Shine it at a curtain or a window and the room looks occupied. Cut Rate sets how often the scene changes.',
    ],
    example: example({
      featured: 'TVSimulator',
      title: 'Someone’s watching TV',
      nodes: {
        tv: ['TVSimulator', { cutRate: 0.8, brightness: 0.85 }],
      },
      output: MATRIX(8, 8),
      explanation: 'TV Simulator on a small panel, as you would hide it behind a curtain: scene cuts and flicker that read from outside as someone watching television.',
      preview: 'The {output} flickers in shifting blocks of colour, changing every second or so.',
    }),
  },

  Juggle: {
    overview: [
      'Juggle sends dots swinging back and forth on sine waves, each with a fading trail. With Count at 1 it is FastLED’s Sinelon: one dot gliding along a string.',
      'Each dot moves at a slightly different rate, so with several the pattern keeps changing. Fade sets how long the trails are.',
    ],
    example: example({
      featured: 'Juggle',
      title: 'Sinelon: one dot gliding along a string',
      nodes: {
        sinelon: ['Juggle', { count: 1, fade: 0.12, speed: 0.6, palette: 'ultraviolet' }],
      },
      output: STRIP(60),
      explanation: 'Juggle with a single dot is the classic Sinelon. It glides back and forth along the string, slowing at each end like a pendulum, and its colour drifts through the ultraviolet palette.',
      preview: 'The {output} shows one violet dot with a long tail swinging from end to end.',
    }),
  },

  RadialBurst: {
    overview: [
      'Radial Burst sends rings outward from the centre, coloured by distance through the palette. Rings sets how many fit across the radius and Speed how fast they travel.',
      'It looks especially good on round builds and as a beat-driven backdrop.',
    ],
    example: example({
      featured: 'RadialBurst',
      title: 'Ripples spreading on a still pond',
      nodes: {
        ripples: ['RadialBurst', { palette: 'ocean', arms: 5, speed: 0.35 }],
      },
      explanation: 'Radial Burst alone, with five rings in the ocean palette moving slowly: ripples spreading from a stone dropped in the middle of a pond.',
      preview: 'The {output} shows blue rings expanding steadily from the centre.',
    }),
  },

  Spiral: {
    overview: [
      'Spiral turns arms round the centre of the matrix, coloured by distance through a slowly scrolling palette. Arms sets how many there are.',
    ],
    example: example({
      featured: 'Spiral',
      title: 'A four-armed pinwheel',
      nodes: {
        pinwheel: ['Spiral', { arms: 4, palette: 'citrus', speed: 0.55 }],
      },
      output: RING(24),
      explanation: 'Spiral with four arms in citrus colours. On an LED ring the arms become segments of colour chasing each other round.',
      preview: 'The {output} shows lime, lemon and orange segments chasing round it.',
    }),
  },

  Blobs: {
    overview: [
      'Blobs are metaballs: soft blobs that wander, merge when they meet and pull apart again — a lava lamp.',
      'Count sets how many there are and Size how big. Larger blobs merge sooner. The palette runs from outside (its start) to deep inside a blob (its end).',
    ],
    example: example({
      featured: 'Blobs',
      title: 'A lava lamp',
      nodes: {
        lamp: ['Blobs', { count: 5, scale: 0.4, speed: 0.25, palette: 'lava' }],
      },
      output: MATRIX(12, 20),
      explanation: 'Blobs with five metaballs in the lava palette, on a tall matrix shaped like a lamp: blobs drift, merge and separate slowly.',
      preview: 'The {output} shows glowing orange blobs drifting and merging against a dark red background.',
    }),
  },

  Fire: {
    overview: [
      'Fire burns upward from the bottom edge, or from any side. Classic is a flame with turbulence; Smoke adds a drifting smoke layer, as in FastLED’s Fire2023; Fire2012 is FastLED’s original heat simulation.',
      'Cooling shortens the flames and Sparking makes the base busier. Turbulence widens the heat’s sideways spread. Mirror folds the fire symmetrically, which suits a fire on both ends of a string.',
      'The heat palette reproduces FastLED’s HeatColors; any other palette makes fire in that colour.',
    ],
    example: example({
      featured: 'Fire',
      title: 'Fire2012 on a string, the way it started',
      nodes: {
        flame: ['Fire', { fireStyle: 'fire2012', palette: 'heat', cooling: 55, sparking: 120, direction: 'right' }],
      },
      output: STRIP(60),
      explanation: 'Fire in Fire2012 style is Mark Kriegsman’s original FastLED fire, written for a single string: heat rises from the first LED and cools as it travels along.',
      preview: 'The {output} burns white-yellow at its start, flickering through orange to red and dark at the far end.',
    }),
  },

  Particles: {
    overview: [
      'Particles runs one of twenty particle displays: fountains, fireworks, snow, rain, embers, bubbles, comets, fireflies, a tornado, a waterfall and more.',
      'Rate is how often new particles appear in the spawning displays; fixed-count displays such as orbit and fireflies use Count instead. Gravity, Bounce and Spread shape the displays that fall and fly. Colour comes from the palette by age.',
      'On the canvas the node takes the name of the display chosen.',
    ],
    example: example({
      featured: 'Particles',
      title: 'Luminous ribbons spiralling through the dark',
      nodes: {
        ribbons: ['Particles', { particleType: 'luminova', count: 6, decay: 0.985, palette: 'ultraviolet', size: 1.5 }],
      },
      output: MATRIX(24, 24),
      explanation: 'Particles in Luminova mode sends five emitters spiralling over the matrix, each steered by noise and dropping a glowing dot every frame. The overlapping trails blur into soft ribbons of ultraviolet light.',
      preview: 'The {output} shows soft violet ribbons curling and looping across a dark background.',
    }),
  },

  FormulaPoints: {
    overview: [
      'Formula Points places dots with a mathematical formula: phyllotaxis (the sunflower spiral), Lissajous and rose paths, the logistic map, or a de Jong strange attractor.',
      'Only the knobs the chosen formula uses are enabled. Persistence leaves trails, and colour comes from the palette by dot or by position.',
    ],
    example: example({
      featured: 'FormulaPoints',
      title: 'Seeds in a sunflower head',
      nodes: {
        seeds: ['FormulaPoints', { formulaType: 'phyllotaxis', count: 120, speed: 0.15, persistence: 0.6, palette: 'honeycomb' }],
      },
      output: MATRIX(24, 24),
      explanation: 'Formula Points in phyllotaxis mode places each dot 137.5° round from the last — the golden angle — the same rule sunflowers use to pack their seeds. The honeycomb palette colours them from the centre out.',
      preview: 'The {output} shows golden dots in interlocking spirals, slowly turning.',
    }),
  },

  FlowField: {
    overview: [
      'Flow Field releases particles that drift along invisible currents made by noise, leaving trails behind them.',
      'In angle mode the noise sets each particle’s heading; curl mode follows the noise’s curl, which swirls without particles piling up. Scale sets the size of the currents and Fade the length of the trails.',
    ],
    example: example({
      featured: 'FlowField',
      title: 'Smoke curling through the air',
      nodes: {
        smoke: ['FlowField', { flowMode: 'curl', count: 300, scale: 0.1, fade: 0.93, palette: 'opal', speed: 0.55 }],
      },
      explanation: 'Flow Field in curl mode keeps its 300 particles circulating in smooth eddies, and long trails turn their paths into wisps like smoke, tinted by the opal palette.',
      preview: 'The {output} shows pale teal wisps curling and swirling across the matrix.',
    }),
  },

  StringParticles: {
    overview: [
      'String Particles runs particles along a single line: the middle row, the middle column, or round an LED ring. It is made for strings and rings.',
      'Drift mode lets particles wander and fade. Meteors mode adds ambient sparks and launches a streak with debris on each Trigger, over a dim noise bed.',
      'For a ring, choose the ring track and set Ring LEDs to match the LED count.',
    ],
    inputs: {
      trigger: 'In Meteors mode, each rising edge launches a meteor.',
    },
    example: example({
      featured: 'StringParticles',
      title: 'Fireflies circling a ring',
      nodes: {
        fireflies: ['StringParticles', { track: 'ring', ringLeds: 24, mode: 'drift', count: 6, palette: 'meadow', fade: 0.8, speed: 0.4 }],
      },
      output: RING(24),
      explanation: 'String Particles on the ring track drifts six particles round the LED ring, each born green-gold and whitening as it fades, like fireflies on a summer night.',
      preview: 'The {output} shows a few soft green-gold lights wandering round it, appearing and fading.',
    }),
  },

  Ripple: {
    overview: [
      'Ripple sends points of light along the edges of a segment network, a string laid out as a small graph of hexagons or triangles. At every node a ripple decides where to go next: straight on, always left or right, the sharpest turn, down every edge at once, or at random.',
      'It is made for an LED output whose string layout is Network. Give the node the same network and LEDs per edge as the output, so each ripple lands on the LEDs that form the edge.',
      'Ripples start on their own at the Rate, and one more on each rising Trigger. Width lights a short tail behind each head, Fade keeps a trail on the whole network, and Lifetime fades each ripple out.',
    ],
    inputs: {
      trigger: 'Each rising edge starts one ripple at the start node.',
    },
    example: example({
      featured: 'Ripple',
      title: 'Light racing round the honeycomb',
      nodes: {
        ripples: ['Ripple', { networkPreset: 'hexagons', ledsPerEdge: 4, behaviour: 'straight', rate: 1.5, speed: 0.3, palette: 'synthwave', width: 3, fade: 0.8 }],
      },
      output: { form: 'strip', stripLayout: 'network', networkPreset: 'hexagons', ledsPerEdge: 4, positionsWidth: 24, positionsHeight: 12 },
      explanation: 'Ripple starts a new point of light about every second, and each one runs along the honeycomb keeping as straight a line as the hexagons allow, so the lights weave through the cells and cross one another, each trailing its own colour.',
      preview: 'The {output} shows coloured points of light running along the honeycomb\'s edges, turning at the corners and leaving short trails.',
    }),
  },

  Starfield: {
    overview: [
      'Starfield flies through space: stars stream outward from the centre, faster and brighter as they come close. Speed sets the warp, Count the number of stars.',
      'Colour comes from the palette by depth: distant stars take its start, near stars its end.',
    ],
    example: example({
      featured: 'Starfield',
      title: 'Jump to lightspeed',
      nodes: {
        warp: ['Starfield', { speed: 0.6, count: 140, palette: 'arctic' }],
      },
      output: MATRIX(24, 16),
      explanation: 'Starfield at warp speed with 140 stars in the arctic palette, on a wide panel like a cockpit window.',
      preview: 'The {output} shows white-blue stars streaking outward from the centre.',
    }),
  },

  Boids: {
    overview: [
      'Boids is a flocking simulation: each agent steers away from neighbours that are too close, matches the heading of nearby ones, and drifts toward the group. Together they flock like starlings.',
      'Separation, Alignment and Cohesion weight those three rules, and Range is how far each one sees. Colour Mode colours them by a fixed colour, the palette, their heading, crowding, position, time or distance from the centre.',
      'Cost grows with the square of Count, so keep the flock modest on small boards.',
    ],
    inputs: {
      color: 'The flock’s colour in solid colour mode. Replaces the R, G and B fields.',
    },
    example: example({
      featured: 'Boids',
      title: 'Starlings coloured by where they’re heading',
      nodes: {
        flock: ['Boids', { count: 30, colorMode: 'heading', separation: 0.55, alignment: 0.65, cohesion: 0.45, speed: 0.5 }],
      },
      output: MATRIX(24, 16),
      explanation: 'Boids with heading colour mode: each bird takes a hue from the direction it is flying, so birds moving together share a colour and the flock shows its own currents.',
      preview: 'The {output} shows a flock of coloured points wheeling across it, groups flying together in the same colour.',
    }),
  },

  ReactionDiffusion: {
    overview: [
      'Reaction Diffusion simulates two chemicals reacting and spreading — the Gray-Scott model — growing organic spots, stripes, worms, coral and dividing cells.',
      'The presets set the feed and kill rates that produce each look; Custom uses the Feed and Kill knobs, where tiny changes give very different patterns. Speed runs more steps per frame.',
      'Its Field output carries the chemical concentration for field nodes.',
    ],
    outputs: {
      frame: 'The pattern, coloured by the palette.',
      field: 'The chemical concentration as a field, 0 to 1.',
    },
    example: example({
      featured: 'ReactionDiffusion',
      title: 'Coral growing across the reef',
      nodes: {
        coral: ['ReactionDiffusion', { rdPreset: 'coral', speed: 10, palette: 'coralreef' }],
      },
      output: MATRIX(24, 24),
      explanation: 'Reaction Diffusion with the coral preset grows branching structures that spread and settle, coloured by the coral-reef palette.',
      preview: 'The {output} shows branching coral-like shapes in turquoise and coral.',
    }),
  },

  GameOfLife: {
    overview: [
      'Game of Life is Conway’s cellular automaton: live cells with two or three neighbours survive, dead cells with exactly three are born, and everything else dies. Simple rules, endless behaviour.',
      'Speed is generations per second, and Fade lets dead cells cool through the palette instead of vanishing.',
    ],
    example: example({
      featured: 'GameOfLife',
      title: 'Life, with ghosts',
      nodes: {
        life: ['GameOfLife', { speed: 6, fade: 0.85, palette: 'mojito' }],
      },
      output: MATRIX(24, 24),
      explanation: 'Game of Life at six generations a second. A high Fade leaves dying cells glowing as they cool through the mojito palette, so each colony trails ghosts of its previous shapes.',
      preview: 'The {output} shows bright green colonies changing shape, each surrounded by dimmer fading cells.',
    }),
  },

  LevelMeter: {
    overview: [
      'Level Meter draws a single VU bar for any 0–1 level, with a palette fill and a peak marker that holds the highest recent reading.',
      'It grows from the start, the end or the centre of its axis. Wire an audio level, a sensor or a knob.',
    ],
    example: example({
      featured: 'LevelMeter',
      title: 'A centre-out VU meter on a string',
      nodes: {
        mic: ['MicInput'],
        fft: ['FFTAnalyzer', { smoothing: 0.5, gain: 1.4 }],
        vu: ['LevelMeter', { origin: 'center', peakHold: 1, palette: 'synthwave' }],
      },
      wires: ['mic.audio > fft.audio', 'fft.bass > vu.level'],
      output: STRIP(60),
      explanation: 'FFT Analyzer’s bass level drives Level Meter, which grows outward from the middle of the string in both directions. A peak marker holds the highest level for a second.',
      preview: 'Play music near the microphone. The {output} shows a bar growing out from its centre with the bass, with a marker at the recent peak.',
    }),
  },

  SpectrumVisualizer: {
    overview: [
      'Spectrum Visualizer shows the whole spectrum: classic bars, centre-mirrored bars, a thin ribbon, a ring (Orbit), a scrolling Waterfall history, or Three Band, three stylised bass, mids and treble bars.',
      'Wire Audio straight in. Gain lifts a quiet source, Smoothing steadies the columns, Tilt lifts the treble columns, and Peak Hold and Peak Gravity shape the falling peak dots.',
      'On the canvas it takes the name of the style chosen.',
    ],
    inputs: {
      audio: 'The sound to show, from an Audio node.',
      bass: 'Three Band only: a bass level from an analyser.',
      mids: 'Three Band only: a mids level.',
      treble: 'Three Band only: a treble level.',
    },
    example: example({
      featured: 'SpectrumVisualizer',
      title: 'Classic spectrum bars with falling peaks',
      nodes: {
        mic: ['MicInput'],
        bars: ['SpectrumVisualizer', { style: 'Bars', bands: 16, palette: 'citrus', peakHold: 0.5 }],
      },
      wires: ['mic.audio > bars.audio'],
      explanation: 'Spectrum Visualizer in Bars style splits the sound into sixteen columns, bass on the left to treble on the right, each with a peak dot that hangs and then falls.',
      preview: 'Play music near the microphone. The {output} shows sixteen bars jumping with the music, peak dots dropping slowly above them.',
    }),
  },

  Waveform: {
    overview: [
      'Waveform draws the raw sound wave, like an oscilloscope: a line, a filled shape, a mirrored shape, or a ring.',
      'Gain scales the trace and Smoothing calms it. Wire a Base frame to draw the scope over a backdrop.',
    ],
    inputs: {
      base: BASE_INPUT,
      audio: 'The sound to draw, from an Audio node.',
    },
    example: example({
      featured: 'Waveform',
      title: 'An oscilloscope over a plasma backdrop',
      nodes: {
        mic: ['MicInput'],
        backdrop: ['Plasma', { palette: 'deepsea', speed: 0.25 }],
        scope: ['Waveform', { style: 'mirror', gain: 3, thickness: 1.2, palette: 'citrus' }],
      },
      wires: ['mic.audio > scope.audio', 'backdrop.frame > scope.base'],
      explanation: 'Waveform in mirror style draws the microphone’s wave reflected about the centre line, in bright citrus colours over a dark deep-sea Plasma.',
      preview: 'Play music or speak near the microphone. The {output} shows a bright mirrored wave dancing across a dim plasma.',
    }),
  },

  BassPulse: {
    overview: [
      'Bass Pulse fills the frame with one colour that brightens and moves along the palette with the bass.',
      'It is the simplest bass visual: a whole build that thumps with the kick.',
    ],
    example: example({
      featured: 'BassPulse',
      title: 'A ring that thumps with the kick',
      nodes: {
        mic: ['MicInput'],
        fft: ['FFTAnalyzer', { smoothing: 0.55, gain: 1.3 }],
        thump: ['BassPulse', { palette: 'volcano' }],
      },
      wires: ['mic.audio > fft.audio', 'fft.bass > thump.bass'],
      output: RING(24),
      explanation: 'FFT Analyzer’s bass sets Bass Pulse’s level, which picks a colour from the volcano palette and sets the brightness, so the whole ring flares orange on each kick.',
      preview: 'Play music near the microphone. The {output} flashes from dark red to bright orange with each bass hit.',
    }),
  },

  BassRings: {
    overview: [
      'Bass Rings draws concentric rings that travel outward and swell and brighten with the bass.',
      'Reactivity sets how strongly the bass changes the picture, from calm drifting rings to a full pulse.',
    ],
    example: example({
      featured: 'BassRings',
      title: 'Speaker-cone rings',
      nodes: {
        mic: ['MicInput'],
        fft: ['FFTAnalyzer', { smoothing: 0.6 }],
        rings: ['BassRings', { palette: 'synthwave', energy: 0.8 }],
      },
      wires: ['mic.audio > fft.audio', 'fft.bass > rings.bass'],
      explanation: 'FFT Analyzer feeds the bass level to Bass Rings, whose rings push outward and brighten like a speaker cone on each kick.',
      preview: 'Play music near the microphone. The {output} shows pink and blue rings pulsing outward with the bass.',
    }),
  },

  MidrangeWaves: {
    overview: [
      'Midrange Waves draws flowing horizontal waves whose height and speed follow the midrange — vocals, guitars and keys.',
      'It suits melodic music, where the bass is steady and the interest is in the middle.',
    ],
    example: example({
      featured: 'MidrangeWaves',
      title: 'Waves that rise with the vocals',
      nodes: {
        mic: ['MicInput'],
        fft: ['FFTAnalyzer', { smoothing: 0.7 }],
        waves: ['MidrangeWaves', { palette: 'ocean', energy: 0.75 }],
      },
      wires: ['mic.audio > fft.audio', 'fft.mids > waves.mids'],
      explanation: 'FFT Analyzer’s mids drive Midrange Waves, so the ocean-coloured waves swell when the singer or the guitars come in.',
      preview: 'Play music near the microphone. The {output} shows rolling blue waves that grow and quicken with the midrange.',
    }),
  },

  MidrangeBloom: {
    overview: [
      'Midrange Bloom draws palette contours that bloom outward and turn with midrange energy, like a flower opening.',
      'It answers the melody — vocals, guitars, keys — rather than the drums, so it suits songs where the tune carries the energy. Reactivity sets how far the mids open it.',
    ],
    example: example({
      featured: 'MidrangeBloom',
      title: 'A flower that opens with the melody',
      nodes: {
        mic: ['MicInput'],
        voice: ['FrequencyBand', { lowHz: 250, highHz: 2500, gain: 1.4 }],
        bloom: ['MidrangeBloom', { palette: 'rosegold', energy: 0.8 }],
      },
      wires: ['mic.audio > voice.audio', 'voice.level > bloom.mids'],
      output: RING(24),
      explanation: 'A Frequency Band tuned to 250–2500 Hz feeds Midrange Bloom’s mids directly, so the rose-gold contours open and turn with the melody rather than the drums.',
      preview: 'Play music near the microphone. The {output} shows rose-gold petals of colour swelling and turning with the melody.',
    }),
  },

  TrebleSparks: {
    overview: [
      'Treble Sparks scatters glittering sparks whose number follows the treble — hi-hats, cymbals, the air at the top of a mix.',
      'Density sets the base rate, which the treble multiplies.',
    ],
    example: example({
      featured: 'TrebleSparks',
      title: 'Sparks off the cymbals',
      nodes: {
        mic: ['MicInput'],
        fft: ['FFTAnalyzer', { smoothing: 0.4, tilt: 0.6 }],
        sparks: ['TrebleSparks', { palette: 'ice', density: 0.6 }],
      },
      wires: ['mic.audio > fft.audio', 'fft.treble > sparks.treble'],
      explanation: 'FFT Analyzer with Tilt raised lifts the quiet treble, and its level sets how many icy sparks Treble Sparks scatters each frame.',
      preview: 'Play music near the microphone. The {output} fills with white-blue sparks on every cymbal and hi-hat.',
    }),
  },

  TreblePrism: {
    overview: [
      'Treble Prism draws sharp diagonal shards that shimmer and move with the treble.',
      'Cymbals and hi-hats make the shards flicker and slide; a quiet top end lets them drift slowly. Raise FFT Analyzer’s Tilt so the treble registers strongly enough.',
    ],
    example: example({
      featured: 'TreblePrism',
      title: 'Crystal shards that shimmer on the hi-hats',
      nodes: {
        mic: ['MicInput'],
        fft: ['FFTAnalyzer', { smoothing: 0.5, tilt: 0.5 }],
        prism: ['TreblePrism', { palette: 'amethyst', energy: 0.8 }],
      },
      wires: ['mic.audio > fft.audio', 'fft.treble > prism.treble'],
      explanation: 'FFT Analyzer’s treble drives Treble Prism, so its amethyst shards flicker and slide with the high end of the music.',
      preview: 'Play music near the microphone. The {output} shows purple diagonal shards shimmering with the treble.',
    }),
  },

  AudioCascade: {
    overview: [
      'Audio Cascade layers ribbons of colour driven by all three bands at once: a glow from the bass, flow from the mids, and shimmer from the treble.',
      'It is a complete music visual in one node.',
    ],
    example: example({
      featured: 'AudioCascade',
      title: 'Bass, mids and treble in one cascade',
      nodes: {
        mic: ['MicInput'],
        fft: ['FFTAnalyzer', { smoothing: 0.65 }],
        cascade: ['AudioCascade', { palette: 'rainbow', energy: 0.75 }],
      },
      wires: ['mic.audio > fft.audio', 'fft.bass > cascade.bass', 'fft.mids > cascade.mids', 'fft.treble > cascade.treble'],
      explanation: 'FFT Analyzer feeds each band to its own input on Audio Cascade, which glows with the bass, flows with the mids and shimmers with the treble.',
      preview: 'Play music near the microphone. The {output} shows rainbow ribbons flowing down, pulsing and sparkling with the music.',
    }),
  },

  BeatFlash: {
    overview: [
      'Beat Flash flashes a frame toward a colour on each beat and lets it fade away. Attack sets how fast the flash rises, Decay how long it lingers, and Intensity how bright it gets.',
      'Keep Base shows the pattern through the flash; turn it off and the frame is replaced by the flash colour. Give it a palette and the flash sweeps through the palette as it fades.',
      'Any true/false pulse can fire it: a beat, a button, a clock.',
    ],
    inputs: {
      beat: 'Each rising edge fires a flash.',
      frame: 'The pattern being flashed.',
    },
    example: example({
      featured: 'BeatFlash',
      title: 'A sunset flash on every beat',
      nodes: {
        mic: ['MicInput'],
        beat: ['BeatDetect', { threshold: 0.45 }],
        life: ['GameOfLife', { palette: 'deepsea', speed: 8 }],
        flash: ['BeatFlash', { palette: 'sunset', decay: 0.85, intensity: 0.9, blendMode: 'screen' }],
      },
      wires: ['mic.audio > beat.audio', 'beat.beat > flash.beat', 'life.frame > flash.frame'],
      explanation: 'Beat Detect fires Beat Flash on every beat. The flash lights the Game of Life colonies with a burst that sweeps through the sunset palette as it fades, keeping the cells visible underneath.',
      preview: 'Play music near the microphone. The {output} shows blue Game of Life cells washed with gold and red on each beat.',
    }),
  },

  DanceFlash: {
    overview: [
      'Dance Flash briefly stamps a silhouette over the frame you give it: a DJ at the decks, a man dancing, a woman dancing, or the two of them together. The pictures are drawn at 16×16 and scaled to the largest square the matrix holds, centred, so a wide or tall panel shows the same pose without squashing it.',
      'It stays quiet for two to five minutes, then flashes for a fraction of a second. Each flash picks one of the four poses and may mirror it left to right. Leave Beat unwired and the flashes keep their own time. Wire a beat and a due flash waits for the next one, so it lands in the music.',
    ],
    inputs: {
      frame: 'The picture the silhouette flashes over. Unwired, it flashes on black.',
      beat: 'Optional. When wired, a flash waits for the next beat instead of using its own timer.',
    },
    example: example({
      featured: 'DanceFlash',
      title: 'A dancer flashes over the bass',
      nodes: {
        mic: ['MicInput'],
        fft: ['FFTAnalyzer', { smoothing: 0.6 }],
        pulse: ['BassPulse', { palette: 'party' }],
        dance: ['DanceFlash', { seed: 1 }],
      },
      wires: ['mic.audio > fft.audio', 'fft.bass > pulse.bass', 'pulse.frame > dance.frame'],
      explanation: 'FFT Analyzer’s bass drives Bass Pulse. Dance Flash sits in front of the matrix and, every two to five minutes, flashes a silhouette of a DJ or a dancer over that pulse. Each flash is mirrored left or right at random. Wire Beat Detect into Beat and the flash waits for the next beat.',
      preview: 'Play music near the microphone. The {output} shows a bass pulse, and now and then a white silhouette of a DJ or a dancer flashes across it.',
    }),
  },

  KickShock: {
    overview: [
      'Kick Shock fires expanding shockwave rings on drum hits: slow wide rings for the kick, fast thin ones for the snare, and fine grain from the hi-hat.',
      'Tiles repeats the shockwave in a grid of cells, Spread lets rings start anywhere, and Max blend keeps overlapping rings from blowing out.',
    ],
    example: example({
      featured: 'KickShock',
      title: 'Shockwaves from every drum',
      nodes: {
        mic: ['MicInput'],
        drums: ['PercussionDetect', { sensitivity: 0.6, separation: 0.55 }],
        shock: ['KickShock', { palette: 'volcano', spawnSpread: 0.4 }],
      },
      wires: ['mic.audio > drums.audio', 'drums.kick > shock.kick', 'drums.snare > shock.snare', 'drums.hihat > shock.hihat'],
      explanation: 'Percussion Detect splits the drums and feeds each lane to Kick Shock: kicks send out wide slow rings, snares quick thin ones, and hi-hats add grain.',
      preview: 'Play a track with a drum kit. The {output} shows rings exploding outward on each hit, wide for the kick and thin for the snare.',
    }),
  },

  VocalAurora: {
    overview: [
      'Vocal Aurora hangs curtains of light like the northern lights, which brighten and move faster with the vocals and fade to black in silence.',
      'Wire Audio Features: Vocals shapes the curtains, Energy drives Reactivity, and Silence dims the frame.',
    ],
    inputs: {
      silence: 'True dims the frame to black, usually from Audio Features.',
    },
    example: example({
      featured: 'VocalAurora',
      title: 'Northern lights that sing along',
      nodes: {
        mic: ['MicInput'],
        features: ['AudioFeatures', { sensitivity: 0.65, smoothing: 0.75 }],
        aurora: ['VocalAurora', { palette: 'aurora' }],
      },
      wires: ['mic.audio > features.audio', 'features.vocals > aurora.vocals', 'features.energy > aurora.energy', 'features.silence > aurora.silence'],
      output: MATRIX(24, 16),
      explanation: 'Audio Features gives Vocal Aurora all three of its signals: Vocals shapes the curtains, Energy sets how strongly they respond, and Silence fades them out between songs.',
      preview: 'Play a song with vocals. The {output} shows green and violet curtains rippling, brightening when the singer comes in.',
    }),
  },

  BeatKaleidoscope: {
    overview: [
      'Beat Kaleidoscope mirrors a plasma into wedges, and on every beat it snaps to more wedges and kicks into a spin that winds down.',
      'Hue shifts the palette round the wheel; wire Audio → Hue into it and the colours follow the mix as well as the beat.',
    ],
    inputs: {
      beat: 'Each rising edge adds wedges and a spin kick.',
    },
    example: example({
      featured: 'BeatKaleidoscope',
      title: 'A kaleidoscope that turns on the beat and colours with the mix',
      nodes: {
        mic: ['MicInput'],
        beat: ['BeatDetect'],
        fft: ['FFTAnalyzer', { smoothing: 0.75 }],
        hue: ['AudioHue'],
        scope: ['BeatKaleidoscope', { palette: 'ultraviolet', energy: 0.8 }],
      },
      wires: [
        'mic.audio > beat.audio',
        'mic.audio > fft.audio',
        'fft.bass > hue.bass',
        'fft.mids > hue.mids',
        'fft.treble > hue.treble',
        'beat.beat > scope.beat',
        'hue.hue > scope.hue',
      ],
      explanation: 'Beat Detect kicks Beat Kaleidoscope into a spin on every beat, while Audio → Hue turns the balance of the bands into a hue that shifts its palette.',
      preview: 'Play music near the microphone. The {output} shows a mirrored ultraviolet plasma that snaps and spins on each beat, its colours drifting with the mix.',
    }),
  },

  SpectraMosaic: {
    overview: [
      'Spectra Mosaic tiles the matrix into a grid. Bass lights the top-left cells, treble the bottom-right, and the mids sweep across them all diagonally.',
      'Tiles sets the grid size, from 2×2 to 8×8.',
    ],
    example: example({
      featured: 'SpectraMosaic',
      title: 'A mosaic lit corner to corner by the music',
      nodes: {
        mic: ['MicInput'],
        fft: ['FFTAnalyzer', { smoothing: 0.6 }],
        mosaic: ['SpectraMosaic', { tiles: 5, palette: 'peacock' }],
      },
      wires: ['mic.audio > fft.audio', 'fft.bass > mosaic.bass', 'fft.mids > mosaic.mids', 'fft.treble > mosaic.treble'],
      explanation: 'FFT Analyzer feeds all three bands to Spectra Mosaic’s 5×5 grid: bass lights the top-left corner, treble the bottom-right, and mids sweep across the diagonal.',
      preview: 'Play music near the microphone. The {output} shows a grid of peacock-coloured tiles lighting corner to corner with the music.',
    }),
  },

  PercussionBlobs: {
    overview: [
      'Percussion Blobs spawns metaball blobs on drum hits: big ones for the kick, medium for the snare and tiny ones for the hi-hat. They merge into one field and fade.',
      'Spread chooses where blobs appear, Size scales them, and Max blend keeps them separate instead of merging.',
    ],
    example: example({
      featured: 'PercussionBlobs',
      title: 'Drums as layered blobs',
      nodes: {
        mic: ['MicInput'],
        drums: ['PercussionDetect', { sensitivity: 0.65, separation: 0.7 }],
        blobs: ['PercussionBlobs', { palette: 'party' }],
      },
      wires: ['mic.audio > drums.audio', 'drums.kick > blobs.kick', 'drums.snare > blobs.snare', 'drums.hihat > blobs.hihat'],
      explanation: 'Percussion Detect splits the drums into three lanes, and Percussion Blobs gives each lane its own size of blob, so the kit draws itself as layered shapes.',
      preview: 'Play a track with a drum kit. The {output} shows large blobs for kicks, medium ones for snares and tiny dots for hi-hats.',
    }),
  },

  EmberPulse: {
    overview: [
      'Ember Pulse is a fire that burns from the bottom in columns: bass heats the centre columns, treble the edges, and every beat sends a burst up.',
    ],
    inputs: {
      beat: 'Each rising edge sends a burst of heat up the columns.',
    },
    example: example({
      featured: 'EmberPulse',
      title: 'A fire in time with the band',
      nodes: {
        mic: ['MicInput'],
        fft: ['FFTAnalyzer', { smoothing: 0.6 }],
        beat: ['BeatDetect'],
        embers: ['EmberPulse', { energy: 0.8 }],
      },
      wires: ['mic.audio > fft.audio', 'mic.audio > beat.audio', 'fft.bass > embers.bass', 'fft.mids > embers.mids', 'fft.treble > embers.treble', 'beat.beat > embers.beat'],
      explanation: 'FFT Analyzer’s bands heat Ember Pulse’s columns — bass in the middle, treble at the sides — and Beat Detect sends a burst of flame up on every beat.',
      preview: 'Play music near the microphone. The {output} shows columns of fire rising from the bottom, tallest in the middle on the bass, with bursts on each beat.',
    }),
  },

  TurbulentBloom: {
    overview: [
      'Turbulent Bloom draws a radial bloom warped by turbulence: bass pulses its brightness, mids drift it slowly, and treble adds fast fine jitter.',
    ],
    example: example({
      featured: 'TurbulentBloom',
      title: 'A bloom stirred by the music',
      nodes: {
        mic: ['MicInput'],
        fft: ['FFTAnalyzer', { smoothing: 0.65 }],
        bloom: ['TurbulentBloom', { palette: 'deepsea' }],
      },
      wires: ['mic.audio > fft.audio', 'fft.bass > bloom.bass', 'fft.mids > bloom.mids', 'fft.treble > bloom.treble'],
      output: RING(24),
      explanation: 'FFT Analyzer gives Turbulent Bloom all three bands: the bass makes it pulse, the mids stir it slowly and the treble makes its edges shiver.',
      preview: 'Play music near the microphone. The {output} shows deep blue light swirling turbulently and pulsing with the bass.',
    }),
  },

  GravityWell: {
    overview: [
      'Gravity Well draws rings that bunch up as they approach a drifting well, like light bent by gravity. Bass packs more rings toward the well.',
      'It uses one colour, from its fields or a wired colour.',
    ],
    inputs: {
      color: 'Ring colour. Replaces the R, G and B fields.',
    },
    example: example({
      featured: 'GravityWell',
      title: 'Light bending round a black hole',
      nodes: {
        mic: ['MicInput'],
        fft: ['FFTAnalyzer', { smoothing: 0.6 }],
        well: ['GravityWell', { r: 160, g: 120, b: 255, energy: 0.8 }],
      },
      wires: ['mic.audio > fft.audio', 'fft.bass > well.bass'],
      explanation: 'FFT Analyzer’s bass drives Gravity Well, so the violet rings crowd tighter round the drifting well on every kick, like spacetime bending.',
      preview: 'Play music near the microphone. The {output} shows violet rings curving round a moving point, tightening with the bass.',
    }),
  },

  RainRipples: {
    overview: [
      'Rain Ripples keeps a pool of rings: each pulse on Trigger starts a new one that spreads and fades. Count limits how many are alive at once.',
      'Spread chooses where ripples start, from the centre to anywhere. Max blend keeps overlapping ripples from blowing out.',
      'Any pulse works: a beat, a drop, a button, an interval.',
    ],
    inputs: {
      trigger: 'Each rising edge starts a ripple.',
    },
    example: example({
      featured: 'RainRipples',
      title: 'Rain on a pond',
      nodes: {
        drops: ['Interval', { interval: 0.35 }],
        pond: ['RainRipples', { palette: 'laguna', spawnSpread: 1, count: 10, decay: 1.2 }],
      },
      wires: ['drops.pulse > pond.trigger'],
      explanation: 'Interval drops a raindrop every 0.35 seconds, and Rain Ripples starts each one at a random spot, so the pond fills with overlapping rings.',
      preview: 'The {output} shows turquoise rings spreading and overlapping all over the matrix.',
    }),
  },

  PrismStorm: {
    overview: [
      'Prism Storm draws noise shards with a direction, which snap to a new angle on every hi-hat hit. Mids speed the drift and treble sharpens the grain.',
    ],
    example: example({
      featured: 'PrismStorm',
      title: 'Shards that snap on the hi-hat',
      nodes: {
        mic: ['MicInput'],
        fft: ['FFTAnalyzer', { smoothing: 0.6, tilt: 0.4 }],
        drums: ['PercussionDetect', { sensitivity: 0.6 }],
        storm: ['PrismStorm', { palette: 'amethyst' }],
      },
      wires: ['mic.audio > fft.audio', 'mic.audio > drums.audio', 'fft.mids > storm.mids', 'fft.treble > storm.treble', 'drums.hihat > storm.hihat'],
      explanation: 'FFT Analyzer’s mids and treble set how fast and how fine Prism Storm’s shards are, and Percussion Detect’s hi-hat lane snaps them to a new angle on each tick.',
      preview: 'Play music near the microphone. The {output} shows purple shards streaming one way, then snapping to a new angle on each hi-hat.',
    }),
  },

  AudioFlow: {
    overview: [
      'Audio Flow scrolls a noise field sideways and lets the music move it: mids speed it up, bass and treble change its texture.',
      'Scale sets how broad the shapes are.',
    ],
    example: example({
      featured: 'AudioFlow',
      title: 'A river of colour carried by the music',
      nodes: {
        mic: ['MicInput'],
        fft: ['FFTAnalyzer', { smoothing: 0.7 }],
        flow: ['AudioFlow', { palette: 'mojito', scale: 0.4 }],
      },
      wires: ['mic.audio > fft.audio', 'fft.bass > flow.bass', 'fft.mids > flow.mids', 'fft.treble > flow.treble'],
      output: STRIP(60),
      explanation: 'FFT Analyzer’s three bands push Audio Flow’s noise along the string; louder mids make it flow faster.',
      preview: 'Play music near the microphone. The {output} shows green shapes flowing along it, speeding up with the music.',
    }),
  },

  ColorTrails: {
    overview: [
      'Color Trails, adapted from a Stefan Petrick prototype, paints colour into the frame and lets it drift and smear along noise profiles, leaving long fluid trails.',
      'Injection chooses what paints the colour: a moving line, a rainbow border, or both. Flow chooses between sliding fixed profiles and morphing them over time. Bass raises the displacement, mids speed the endpoints and treble speeds the colour sweep.',
      'Persistence near 1 makes trails last for seconds or minutes.',
    ],
    inputs: {
      beat: 'Each beat briefly brightens the injected colour and throws the line wider.',
    },
    example: example({
      featured: 'ColorTrails',
      title: 'Ink swirling in water',
      nodes: {
        mic: ['MicInput'],
        fft: ['FFTAnalyzer', { smoothing: 0.7 }],
        ink: ['ColorTrails', { injectionMode: 'Moving Line', flowMode: 'Morphing 2D', palette: 'cottoncandy' }],
      },
      wires: ['mic.audio > fft.audio', 'fft.bass > ink.bass', 'fft.mids > ink.mids', 'fft.treble > ink.treble'],
      output: MATRIX(24, 24),
      explanation: 'Color Trails draws a moving line of pastel colour and lets morphing noise currents carry it away. The bass makes the currents stronger, so loud passages stir the colours harder.',
      preview: 'The {output} shows pastel colour flowing and curling across it like ink dropped into water.',
    }),
  },

  Animartrix: {
    overview: [
      'AnimARTrix brings Stefan Petrick’s polar-coordinate animations to the graph — Water, Polar Waves, RGB Blobs, Spiralus and Complex Kaleido — rebuilt so music can bend their geometry.',
      'Six audio inputs (bass, mids, treble, kick, snare, hi-hat) and a beat feed it. Audio Amount sets how much they distort the shapes; 0 runs the animation as Stefan wrote it.',
      'It is one of the heavier patterns to compute; on a large panel, check the frame rate on the board.',
    ],
    inputs: {
      beat: 'A beat pulse that kicks the animation.',
    },
    example: example({
      featured: 'Animartrix',
      title: 'Polar waves bent by the drums',
      nodes: {
        mic: ['MicInput'],
        fft: ['FFTAnalyzer', { smoothing: 0.65 }],
        drums: ['PercussionDetect', { sensitivity: 0.6 }],
        art: ['Animartrix', { effect: 'Polar Waves', speed: 0.7, audioAmount: 1.2 }],
      },
      wires: ['mic.audio > fft.audio', 'mic.audio > drums.audio', 'fft.bass > art.bass', 'fft.mids > art.mids', 'fft.treble > art.treble', 'drums.kick > art.kick', 'drums.snare > art.snare'],
      output: MATRIX(24, 24),
      explanation: 'AnimARTrix runs Polar Waves. FFT Analyzer feeds the three bands and Percussion Detect the kick and snare, and with Audio Amount above 1 the music visibly warps the waves.',
      preview: 'Play music near the microphone. The {output} shows rippling polar waves of colour that warp and pulse with the drums.',
    }),
  },

  CustomFormula: {
    overview: [
      'Custom Formula colours every pixel from a formula you write. It knows x and y (0 to 1), cx and cy (centred), r and angle (polar), t (time), W and H, two inputs a and b, the usual maths, and FastLED’s helpers such as sin8 and beatsin8.',
      'The formula’s result, 0 to 1 and wrapping, is looked up in the palette. One line can make ripples, spirals, interference patterns and checkerboards.',
      'Formulas run only in a trusted workspace; an untrusted project shows black until you trust it.',
    ],
    example: example({
      featured: 'CustomFormula',
      title: 'Write a ripple in one line',
      nodes: {
        ripple: ['CustomFormula', { formula: 'sin(r*18 - t*4)*0.5 + 0.5', palette: 'ocean' }],
      },
      explanation: 'Custom Formula draws sin(r·18 − t·4): r is distance from the centre, so the formula makes rings, and subtracting time moves them outward. The ocean palette colours the result.',
      preview: 'The {output} shows blue rings rippling outward from the centre.',
    }),
  },

  Code: {
    overview: [
      'Code runs raw FastLED C++ that writes into leds[], exactly as in a hand-written sketch. Paste a loop body and it is compiled into the firmware verbatim.',
      'The preview translates the code to approximate it in the browser, so most FastLED idioms — beatsin16, CHSV, fadeToBlackBy, |=, EVERY_N_MILLISECONDS, ColorFromPalette with your own DEFINE_GRADIENT_PALETTE or fill_gradient palettes, a custom XY() map, static locals and typed arrays — show live, and a pasted sketch header with its #includes and #defines compiles. Global Code holds variables and helpers that persist between frames. Wire a frame into Frame to start from it instead of the previous output.',
      'Code runs only in a trusted workspace; an untrusted project shows black until you trust it.',
    ],
    inputs: {
      frame: 'An optional frame to start leds[] from each frame.',
    },
    outcome: 'The live preview runs your code in a browser worker, which this page cannot show. Try it live to watch it run.',
    example: example({
      featured: 'Code',
      title: 'The DemoReel juggle, pasted in',
      nodes: {
        code: ['Code'],
      },
      explanation: 'Code’s starting example is the juggle loop from FastLED’s DemoReel100: it fades the LEDs, then adds eight coloured dots on beatsin16 paths. The same lines go into the sketch untouched.',
      preview: 'Press Try it live: the {output} shows eight coloured dots weaving past each other, leaving short trails.',
      workflow: true,
    }),
  },
}
