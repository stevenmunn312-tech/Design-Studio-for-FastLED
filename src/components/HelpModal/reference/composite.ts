import { example, MATRIX, SAMPLE_IMAGE, STRIP } from './example'
import type { NodeReferenceMap } from './types'

const FRAME_IN = 'The frame to process.'
const FRAME_OUT = 'The processed frame.'

export const COMPOSITE_REFERENCE: NodeReferenceMap = {
  Blur2D: {
    overview: [
      'Blur 2D softens a frame by bleeding each pixel’s colour into its neighbours. A little smooths jagged edges and noisy patterns; a lot turns detail into a soft glow.',
      'Wire a signal into Amount to pull focus in and out.',
    ],
    inputs: { frame: FRAME_IN },
    outputs: { frame: FRAME_OUT },
    example: example({
      featured: 'Blur2D',
      title: 'A lens pulling focus',
      nodes: {
        life: ['GameOfLife', { palette: 'mojito', speed: 6 }],
        focus: ['Wave', { frequency: 0.15, amplitude: 0.7, unipolar: true }],
        lens: ['Blur2D'],
      },
      wires: ['life.frame > lens.frame', 'focus.result > lens.amount'],
      explanation: 'A slow Wave moves Blur 2D’s amount between sharp and heavily smeared, so the Game of Life colonies drift in and out of focus like a camera lens hunting.',
      preview: 'The {output} shows green Game of Life cells slowly blurring into a soft glow and sharpening again.',
    }),
  },

  Blend: {
    overview: [
      'Blend lays frame B over frame A. Normal replaces, Multiply darkens, Screen and Add lighten, Overlay adds contrast, and Difference shows where the two differ. Opacity sets how much of B shows.',
      'An optional Mask frame decides where B appears: bright areas show B, dark areas keep A. On the canvas the node takes the name of its mode.',
      'Screen is the go-to for layering light effects — flashes, sparkles, lightning — over a background.',
    ],
    inputs: {
      a: 'The bottom layer.',
      b: 'The layer laid over it.',
      mask: 'Optional: where B shows. Bright shows B, dark keeps A.',
    },
    outputs: { frame: 'The two layers combined.' },
    example: example({
      featured: 'Blend',
      title: 'Moiré from two spirals turning against each other',
      nodes: {
        spiral: ['Spiral', { arms: 3, palette: 'rainbow', speed: 0.35 }],
        mirrored: ['FrameTransform', { flipX: true }],
        moire: ['Blend', { blendMode: 'difference', amount: 1 }],
      },
      wires: ['spiral.frame > moire.a', 'spiral.frame > mirrored.frame', 'mirrored.frame > moire.b'],
      explanation: 'One Spiral feeds Blend directly and through a mirror, so the two copies appear to turn in opposite directions. Blend in Difference mode lights only where they disagree, producing shifting moiré petals.',
      preview: 'The {output} shows a symmetrical, constantly changing flower of colour where the two spirals cross.',
    }),
  },

  Mask: {
    overview: [
      'Mask shows a frame only where another frame is bright. Black in the mask hides the frame, white shows it fully, and greys let some through.',
      'Any frame can be a mask: text, a shape, noise, a gauge. Pour fire into letters, show a picture through a moving spotlight, or cut a pattern into stripes.',
    ],
    inputs: {
      frame: 'The frame to show.',
      mask: 'Where to show it: bright shows, dark hides.',
    },
    outputs: { frame: 'The frame, cut out by the mask.' },
    example: example({
      featured: 'Mask',
      title: 'Fire burning inside the letters',
      nodes: {
        flames: ['Fire', { fireStyle: 'classic', palette: 'fire', cooling: 50, sparking: 140 }],
        word: ['Text', { text: 'HOT', r: 255, g: 255, b: 255 }],
        cutout: ['Mask'],
        output: ['MatrixOutput', MATRIX(24, 8)],
      },
      wires: ['flames.frame > cutout.frame', 'word.frame > cutout.mask'],
      explanation: 'Text writes HOT in white, and Mask uses it to cut the Fire: the flames show only inside the letters, so the word burns.',
      preview: 'The {output} shows the word HOT filled with flickering flames on a black background.',
    }),
  },

  Glitter: {
    overview: [
      'Glitter scatters single-pixel sparkles of one colour over a frame, a fresh set every frame — FastLED’s addGlitter as a node.',
      'Density is how many: 1 is about one per 64 LEDs. Add lightens the pixel under each sparkle, Replace paints over it. Wire a beat or a level into Density to sparkle with the music.',
    ],
    inputs: {
      frame: FRAME_IN,
      color: 'Sparkle colour. Replaces the R, G and B fields.',
    },
    outputs: { frame: 'The frame with sparkles.' },
    example: example({
      featured: 'Glitter',
      title: 'Add sparkle to a classic',
      nodes: {
        pride: ['Pride2015', { speed: 0.35 }],
        sparkle: ['Glitter', { density: 0.5, glitterMode: 'add', r: 255, g: 255, b: 255 }],
      },
      wires: ['pride.frame > sparkle.frame'],
      output: STRIP(60),
      explanation: 'Glitter adds white sparkles to Pride 2015 — the same trick FastLED’s DemoReel100 uses for its rainbow-with-glitter.',
      preview: 'The {output} shows Pride 2015’s rolling rainbow with bright white sparkles flicking on and off.',
    }),
  },

  FrameTransform: {
    overview: [
      'Frame Transform turns a frame by quarter turns, flips it, and slides it by whole pixels, wrapping round the edges.',
      'Use it to fix a panel mounted the wrong way, to point a fire sideways, or — with a ramp on Offset — to scroll a pattern endlessly.',
    ],
    inputs: { frame: FRAME_IN },
    outputs: { frame: FRAME_OUT },
    example: example({
      featured: 'FrameTransform',
      title: 'Flames blown sideways by the wind',
      nodes: {
        flames: ['Fire', { fireStyle: 'smoke', palette: 'fire' }],
        wind: ['FrameTransform', { rotate: 90 }],
      },
      wires: ['flames.frame > wind.frame'],
      output: MATRIX(24, 12),
      explanation: 'Fire always burns toward its chosen side. Frame Transform turns the whole frame a quarter turn, so on a wide panel the smoky flames stream sideways as if a strong wind were blowing.',
      preview: 'The {output} shows flames streaming horizontally across a wide panel.',
    }),
  },

  BrightnessMod: {
    overview: [
      'Brightness scales a frame’s brightness: 1 leaves it alone, 0 is black, and up to 3 boosts it, clipping at white.',
      'Wire a level into it to make a pattern fade, flash or breathe. To dim the whole output instead, use the LED output’s own Brightness input.',
    ],
    inputs: { frame: FRAME_IN },
    outputs: { frame: FRAME_OUT },
    example: example({
      featured: 'BrightnessMod',
      title: 'Stars that throb with the bass',
      nodes: {
        mic: ['MicInput'],
        fft: ['FFTAnalyzer', { smoothing: 0.55 }],
        throb: ['MapRange', { inMin: 0, inMax: 1, outMin: 0.4, outMax: 2.5 }],
        stars: ['Starfield', { speed: 0.35, palette: 'ice' }],
        level: ['BrightnessMod'],
      },
      wires: ['mic.audio > fft.audio', 'fft.bass > throb.value', 'throb.result > level.brightness', 'stars.frame > level.frame'],
      explanation: 'Map Range turns FFT Analyzer’s bass into a brightness from 0.4 to 2.5, and Brightness applies it to Starfield, so the stars glow dimly between beats and blaze on the kick.',
      preview: 'Play music near the microphone. The {output} shows a starfield that pulses much brighter on each bass hit.',
    }),
  },

  HueShift: {
    overview: [
      'Hue Shift turns every colour in a frame round the colour wheel by the same amount. 0.5 turns red into cyan; 1 is a full turn back to where it started.',
      'It recolours any pattern without touching its shape or brightness — green fire, purple water — and with a moving signal the colours cycle.',
    ],
    inputs: { frame: FRAME_IN },
    outputs: { frame: FRAME_OUT },
    example: example({
      featured: 'HueShift',
      title: 'Witch’s fire',
      nodes: {
        flames: ['Fire', { fireStyle: 'classic', palette: 'fire' }],
        brew: ['HueShift', { shift: 0.33 }],
      },
      wires: ['flames.frame > brew.frame'],
      explanation: 'Hue Shift turns Fire’s colours a third of the way round the wheel, so reds and oranges become greens and the fire burns like a cauldron.',
      preview: 'The {output} shows flames in shades of green and yellow-green.',
    }),
  },

  Gamma: {
    overview: [
      'Gamma applies a curve that darkens the mid-tones, so gradients and fades look even on LEDs. LEDs respond linearly while our eyes do not, which makes uncorrected patterns look washed out and pale.',
      '2.2 to 2.8 suits most strips. Put it last, just before the LED output.',
    ],
    inputs: { frame: FRAME_IN },
    outputs: { frame: FRAME_OUT },
    example: example({
      featured: 'Gamma',
      title: 'Before and after gamma, side by side',
      nodes: {
        ramp: ['GradientFrame', { rA: 0, gA: 0, bA: 0, rB: 255, gB: 140, bB: 0, vertical: true }],
        corrected: ['Gamma', { gamma: 2.4 }],
        compare: ['Zones', { aEnabled: true, aX: 0, aY: 0, aW: 0.5, aH: 1, bEnabled: true, bX: 0.5, bY: 0, bW: 0.5, bH: 1, cEnabled: false, dEnabled: false }],
      },
      wires: ['ramp.frame > compare.a', 'ramp.frame > corrected.frame', 'corrected.frame > compare.b'],
      explanation: 'One Gradient Frame fades from black to orange down the matrix. Zones shows it untouched on the left and through Gamma on the right, so you can see the correction pull the pale middle tones down.',
      preview: 'The {output} shows two orange fades side by side; the right-hand one stays darker for longer, which looks more even on real LEDs.',
    }),
  },

  Saturation: {
    overview: [
      'Saturation scales how colourful a frame is: 0 is greyscale, 1 unchanged, 2 doubles the colour, clipping where it runs out.',
    ],
    inputs: { frame: FRAME_IN },
    outputs: { frame: FRAME_OUT },
    example: example({
      featured: 'Saturation',
      title: 'Colour draining away and flooding back',
      nodes: {
        plasma: ['Plasma', { palette: 'rainbow', speed: 0.35 }],
        drain: ['Wave', { frequency: 0.12, amplitude: 1.4, unipolar: true }],
        colour: ['Saturation'],
      },
      wires: ['plasma.frame > colour.frame', 'drain.result > colour.amount'],
      explanation: 'A slow Wave moves Saturation’s amount from 0 to 1.4, so the rainbow Plasma fades to black-and-white and then floods back more vivid than before.',
      preview: 'The {output} shows a plasma slowly losing its colour to grey and regaining it.',
    }),
  },

  ColorBoost: {
    overview: [
      'Color Boost pushes colours away from grey while keeping their brightness about the same. Unlike Saturation it does not make things brighter, so it suits lifting pastel or washed-out patterns.',
    ],
    inputs: { frame: FRAME_IN },
    outputs: { frame: FRAME_OUT },
    example: example({
      featured: 'ColorBoost',
      title: 'Make pastel colours pop',
      nodes: {
        pastel: ['Blobs', { palette: 'cottoncandy', count: 4 }],
        pop: ['ColorBoost', { boost: 0.85 }],
      },
      wires: ['pastel.frame > pop.frame'],
      explanation: 'Blobs in the soft cotton-candy palette can look milky on LEDs. Color Boost at 0.85 pushes the pinks and blues to vivid without brightening them.',
      preview: 'The {output} shows merging blobs in strong pinks and blues instead of pale pastels.',
    }),
  },

  Transform: {
    overview: [
      'Transform keeps a frame moving: Rotate spins it, Scale zooms it, and Translate slides it along an angle. Rate sets the speed in degrees, percent or pixels per second, and negative values reverse it.',
      'Scale stops at one-twentieth and twenty times. For a fixed quarter turn or flip use Frame Transform.',
    ],
    inputs: { frame: FRAME_IN },
    outputs: { frame: FRAME_OUT },
    example: example({
      featured: 'Transform',
      title: 'Clouds sailing past',
      nodes: {
        clouds: ['Noise', { noiseType: 'fbm', palette: 'ice', speed: 0.1, scale: 0.35 }],
        sail: ['Transform', { transform: 'translate', rate: 6, angle: 200 }],
      },
      wires: ['clouds.frame > sail.frame'],
      output: MATRIX(24, 12),
      explanation: 'Noise draws slowly changing clouds, and Transform in translate mode slides the whole sky six pixels a second along its angle, so the clouds sail steadily past the window.',
      preview: 'The {output} shows soft icy blue and white clouds drifting across it.',
    }),
  },

  Array: {
    overview: [
      'Array draws several copies of a frame, each offset, turned and scaled a little more than the last, and stacks them up. Falloff dims each copy further.',
      'With no offset and an angle, copies make a ring; with a scale below 1 they spiral inward; with an offset they make a trail.',
    ],
    inputs: { frame: FRAME_IN },
    outputs: { frame: 'All the copies combined.' },
    example: example({
      featured: 'Array',
      title: 'A spiral staircase of stars',
      nodes: {
        star: ['Shape', { shape: 'polygon', sides: 5, size: 6, filled: false, edge: '#ffd040', thickness: 1 }],
        steps: ['Array', { count: 7, offsetX: 0, offsetY: 0, angle: 24, scale: 0.82, falloff: 0.78, blendMode: 'lighten' }],
        spin: ['Transform', { transform: 'rotate', rate: 30 }],
      },
      wires: ['star.frame > steps.frame', 'steps.frame > spin.frame'],
      explanation: 'Shape draws one golden star outline. Array repeats it seven times, each turned 24° more, 18% smaller and a little dimmer, so the copies wind inward like a spiral staircase. Transform slowly turns the whole stack.',
      preview: 'The {output} shows golden star outlines spiralling into the centre, each smaller and dimmer than the last.',
    }),
  },

  Invert: {
    overview: [
      'Invert flips every colour to its opposite: black becomes white, red becomes cyan. Dark patterns become bright and bright ones dark.',
    ],
    inputs: { frame: FRAME_IN },
    outputs: { frame: FRAME_OUT },
    example: example({
      featured: 'Invert',
      title: 'A photographic negative of fire',
      nodes: {
        flames: ['Fire', { fireStyle: 'classic', palette: 'fire' }],
        negative: ['Invert'],
      },
      wires: ['flames.frame > negative.frame'],
      explanation: 'Invert turns Fire into its negative: the dark sky becomes white, and the orange flames become deep blue shapes rising through it.',
      preview: 'The {output} shows blue flame shapes rising through a bright white background.',
    }),
  },

  Mirror: {
    overview: [
      'Mirror copies one half of a frame onto the other: left to right, top to bottom, both at once, or across the diagonal.',
      'Glow blends the hidden half back in as a soft bloom, tinted by the Tint colour, instead of discarding it.',
    ],
    inputs: {
      frame: FRAME_IN,
      color: 'Glow tint. Replaces the R, G and B fields.',
    },
    outputs: { frame: FRAME_OUT },
    example: example({
      featured: 'Mirror',
      title: 'A living Rorschach inkblot',
      nodes: {
        ink: ['Blobs', { palette: 'noir', count: 4, scale: 0.38, speed: 0.25 }],
        fold: ['Mirror', { mirrorMode: 'horizontal' }],
      },
      wires: ['ink.frame > fold.frame'],
      explanation: 'Blobs in the black-and-white noir palette drift and merge, and Mirror copies the left half onto the right, so the shapes become a slowly changing inkblot test.',
      preview: 'The {output} shows symmetrical black and white blobs merging and parting, like an inkblot.',
    }),
  },

  Kaleidoscope: {
    overview: [
      'Kaleidoscope folds a frame into mirrored wedges round the centre, like the toy. Segments sets how many wedges: 6 is the classic look.',
      'Anything becomes symmetrical and jewel-like. Pictures and slow textures work particularly well.',
    ],
    inputs: { frame: FRAME_IN },
    outputs: { frame: FRAME_OUT },
    example: example({
      featured: 'Kaleidoscope',
      title: 'A kaleidoscope made from a picture',
      nodes: {
        drift: ['Wave', { frequency: 0.07, amplitude: 1.5, offset: 1.5, unipolar: true }],
        photo: ['Image', { image: SAMPLE_IMAGE, fit: 'cover', sampling: 'smooth' }],
        jewel: ['Kaleidoscope', { segments: 8 }],
      },
      wires: ['drift.result > photo.zoom', 'photo.frame > jewel.frame'],
      output: MATRIX(24, 24),
      explanation: 'Image shows a small picture, slowly zooming in and out under a Wave. Kaleidoscope folds it into eight mirrored wedges, so the zoom becomes a blooming, jewel-like pattern.',
      preview: 'The {output} shows an eight-fold pink and navy pattern that slowly grows and shrinks.',
    }),
  },

  Trails: {
    overview: [
      'Trails keeps a fading copy of the previous frames and lights it up again wherever the new frame is brighter, so anything that moves leaves a tail.',
      'Decay sets how fast the tail fades. The slider is cubed, so small values give very long tails: 0.3 is already short and 1 is none.',
    ],
    inputs: { frame: FRAME_IN },
    outputs: { frame: 'The frame with fading tails.' },
    example: example({
      featured: 'Trails',
      title: 'Flight paths of a flock',
      nodes: {
        flock: ['Boids', { count: 16, colorMode: 'position', speed: 0.55 }],
        paths: ['Trails', { decay: 0.3 }],
      },
      wires: ['flock.frame > paths.frame'],
      output: MATRIX(24, 16),
      explanation: 'Boids draws each bird as a single point. Trails keeps where they have been, fading slowly, so the flock draws its own curving flight paths.',
      preview: 'The {output} shows coloured streaks curving across the matrix as the flock wheels.',
    }),
  },

  FrameWarp: {
    overview: [
      'Frame Warp moves every pixel of a frame by two fields: Offset X pushes sideways, Offset Y up and down, with a field value of 0.5 meaning no push. Strength sets how far, and Zoom and Rotate work about the centre.',
      'Smooth, slowly changing fields make a frame look liquid or heat-hazed. Edges decides what happens at the border: hold the edge, wrap round, or fade to black.',
    ],
    inputs: {
      frame: FRAME_IN,
      dx: 'A field that pushes each pixel sideways. 0.5 is no push.',
      dy: 'A field that pushes each pixel up or down. 0.5 is no push.',
    },
    outputs: { frame: 'The warped frame.' },
    example: example({
      featured: 'FrameWarp',
      title: 'Turn noise into a liquid feedback surface',
      nodes: {
        source: ['Noise', { noiseType: 'simplex', speed: 0.2, scale: 0.42, palette: 'synthwave' }],
        dx: ['FieldFormula', { formula: '0.5 + 0.22*sin(angle*3+t)' }],
        dy: ['FieldFormula', { formula: '0.5 + 0.22*cos(angle*2-t*0.7)' }],
        warp: ['FrameWarp', { strength: 2.5, zoom: 1.02, rotate: 2, edgeMode: 'wrap', sampling: 'bilinear' }],
        feedback: ['FrameFeedback', { delayFrames: 2, fade: 0.08, amount: 0.58, blendMode: 'screen' }],
      },
      wires: ['source.frame > warp.frame', 'dx.field > warp.dx', 'dy.field > warp.dy', 'warp.frame > feedback.frame'],
      explanation: 'Two Field Formula nodes describe a slowly changing swirl. Frame Warp reads the Noise frame at those displaced positions, then Frame Feedback keeps a faded copy of earlier warped frames, so the surface looks like liquid with glowing trails.',
      preview: 'The {output} shows noise bending into a smooth, liquid swirl with luminous trails.',
    }),
  },

  Symmetry: {
    overview: [
      'Symmetry repeats a frame through one of nine wallpaper groups: square groups with plain repeats, half turns, mirrors and quarter turns, and hexagonal groups with three- and six-fold turns.',
      'Cells sets how many repeats fit across, Rotation and Spin turn the lattice, and Offset scrolls it. Any pattern becomes a tiled design.',
    ],
    inputs: { frame: FRAME_IN },
    outputs: { frame: 'The frame repeated through the symmetry group.' },
    example: example({
      featured: 'Symmetry',
      title: 'Fire turned into a tiled mosaic',
      nodes: {
        flames: ['Fire', { fireStyle: 'classic', palette: 'fire' }],
        tiles: ['Symmetry', { group: 'p6', cells: 2, spin: 10 }],
      },
      wires: ['flames.frame > tiles.frame'],
      output: MATRIX(24, 24),
      explanation: 'Symmetry repeats the Fire through the p6 group — six-fold rotation on a hexagonal lattice — and spins the lattice slowly, so the flames become a turning mosaic.',
      preview: 'The {output} shows flickering fire colours arranged in a six-fold, slowly turning pattern.',
    }),
  },

  FrameFeedback: {
    overview: [
      'Frame Feedback lays a delayed, faded copy of its own output back over the live frame — a video-feedback loop. Each pass can slide, turn or zoom the echo.',
      'Small turns make spirals; a zoom below 1 makes an endless tunnel; a slide makes motion streak. Fade sets how quickly echoes die and Opacity how strong they are. Delay uses more memory on the board for every frame of history.',
    ],
    inputs: { frame: FRAME_IN },
    outputs: { frame: 'The live frame with its echoes.' },
    example: example({
      featured: 'FrameFeedback',
      title: 'An endless tunnel',
      nodes: {
        ring: ['Shape', { shape: 'polygon', sides: 4, size: 7.5, filled: false, edge: '#40e0ff', thickness: 1 }],
        turn: ['Transform', { transform: 'rotate', rate: 40 }],
        tunnel: ['FrameFeedback', { delayFrames: 2, fade: 0.06, amount: 0.85, blendMode: 'screen', feedbackTransform: 'scale', scale: 0.9 }],
      },
      wires: ['ring.frame > turn.frame', 'turn.frame > tunnel.frame'],
      explanation: 'Shape draws a square outline and Transform turns it. Frame Feedback shrinks its echo by 10% each pass and lays it back on top, so every past position falls away toward the centre in a twisting tunnel.',
      preview: 'The {output} shows nested, twisting squares receding into the centre like a tunnel.',
    }),
  },

  FrameSwitch: {
    overview: [
      'Frame Switch shows Frame A while Select is false and Frame B while it is true. It is a hard cut between two pictures.',
      'For a smooth change between two frames use Transition; for a number rather than a frame use Switch.',
    ],
    inputs: {
      a: 'Shown while Select is false.',
      b: 'Shown while Select is true.',
      sel: 'Chooses A (false) or B (true).',
    },
    outputs: { frame: 'Frame A or Frame B.' },
    example: example({
      featured: 'FrameSwitch',
      title: 'Daylight until six, starlight after',
      nodes: {
        clock: ['RTCInput', { timeSource: 'DS3231' }],
        evening: ['Compare', { b: 64800 }],
        day: ['Sunrise', { mode: 'manual', progress: 1 }],
        night: ['Starfield', { speed: 0.12, palette: 'ice' }],
        scene: ['FrameSwitch'],
      },
      wires: ['clock.secondsOfDay > evening.a', 'evening.result > scene.sel', 'day.frame > scene.a', 'night.frame > scene.b'],
      explanation: 'Compare is true once RTC Clock’s seconds-since-midnight pass 64800 — six in the evening. Frame Switch shows a warm daylight Sunrise until then and a slow Starfield after.',
      preview: 'The reference time is mid-morning, so the {output} shows warm daylight. After six in the evening it switches to stars.',
    }),
  },

  Zones: {
    overview: [
      'Zones places up to four frames in their own rectangles of the matrix, over a Base frame. Each zone has a position, a size and an on/off switch, all as fractions of the matrix.',
      'Use it for a dashboard of different patterns, a status strip along one edge, or before-and-after comparisons.',
    ],
    inputs: {
      base: 'What shows outside the zones, and inside any zone that is off.',
      a: 'The frame for zone A.',
      b: 'The frame for zone B.',
      c: 'The frame for zone C.',
      d: 'The frame for zone D.',
    },
    outputs: { frame: 'All the zones placed together.' },
    example: example({
      featured: 'Zones',
      title: 'Four seasons in four corners',
      nodes: {
        spring: ['Blobs', { palette: 'meadow', count: 3 }],
        summer: ['Fire', { fireStyle: 'classic', palette: 'fire' }],
        autumn: ['Confetti', { palette: 'emberglow', speed: 0.4 }],
        winter: ['Particles', { particleType: 'snow', rate: 0.4, palette: 'arctic' }],
        quarters: ['Zones'],
      },
      wires: ['spring.frame > quarters.a', 'summer.frame > quarters.b', 'autumn.frame > quarters.c', 'winter.frame > quarters.d'],
      explanation: 'Zones’ four default rectangles split the matrix into quarters: green blobs for spring, fire for summer, falling ember speckles for autumn, and snow for winter.',
      preview: 'The {output} shows four different patterns, one in each quarter of the matrix.',
    }),
  },
}
