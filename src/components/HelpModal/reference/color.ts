import { example, RING, SAMPLE_IMAGE, STRIP } from './example'
import type { NodeReferenceMap } from './types'

const PALETTE_OUT = 'A palette for any node with a Palette input. It replaces that node’s own palette choice.'

export const COLOR_REFERENCE: NodeReferenceMap = {
  GradientSampler: {
    overview: [
      'Gradient Sampler picks one colour from a two-colour gradient. T of 0 gives Color A, 1 gives Color B, and anything between is a mix. Pick the two colours from their swatches on the node.',
      'Mix decides how the in-between colours are made: straight through RGB, which can pass through grey, or round the hue wheel the short or long way, which stays vivid.',
      'Wire a level into T and a colour follows it: cool to hot, calm to alarm, low to high.',
    ],
    inputs: {
      t: 'Where to sample, 0 (Color A) to 1 (Color B). Values outside hold at the nearer end.',
      colorA: 'The colour at T = 0. Replaces the Color A swatch.',
      colorB: 'The colour at T = 1. Replaces the Color B swatch.',
    },
    outputs: {
      color: 'The colour at T.',
    },
    example: example({
      featured: 'GradientSampler',
      title: 'A cube that blushes from cool to hot',
      nodes: {
        temper: ['Wave', { frequency: 0.12, amplitude: 1, unipolar: true }],
        tint: ['GradientSampler', { rA: 40, gA: 160, bA: 255, rB: 255, gB: 40, bB: 20, mixMode: 'hsvShort' }],
        cube: ['Wireframe3D', { model: 'icosahedron', spinX: 15, spinY: 35, depthShade: true }],
      },
      wires: ['temper.result > tint.t', 'tint.color > cube.color'],
      explanation: 'A slow Wave sweeps Gradient Sampler between ice blue and fiery red, mixing round the hue wheel the short way so the colours stay vivid. The result colours the edges of a spinning icosahedron.',
      preview: 'The {output} shows a turning wireframe icosahedron whose colour drifts from blue through violet to red and back.',
    }),
  },

  PaletteSampler: {
    overview: [
      'Palette Sampler picks one colour from a palette at position T. T runs from 0 at the palette’s start to 1 at its end.',
      'It turns any palette into a single colour you can wire wherever one colour is wanted: a shape’s fill, text, sparkles, a flock.',
      'Ends decides what T means at the top. Wrap treats it as a position round the palette, so 1 is the first colour again and a rising ramp keeps cycling. Hold ends treats it as an amount, so 1 is the last colour: choose it when a level or a sensor drives T, or a full-scale reading on the heat palette comes out black.',
    ],
    inputs: {
      paletteIn: 'A palette to sample. Replaces the Palette choice.',
      t: 'Position along the palette, 0 to 1: wrapping past 1, or held at the ends with Hold ends.',
    },
    outputs: {
      color: 'The colour at T.',
    },
    example: example({
      featured: 'PaletteSampler',
      title: 'Sparkles that drift through the aurora',
      nodes: {
        drift: ['Wave', { frequency: 0.08, amplitude: 1, unipolar: true, waveform: 'sawtooth' }],
        pick: ['PaletteSampler', { palette: 'aurora' }],
        night: ['Noise', { noiseType: 'fbm', palette: 'deepsea', speed: 0.2, scale: 0.4 }],
        sparkle: ['Glitter', { density: 0.45, glitterMode: 'replace' }],
      },
      wires: ['drift.result > pick.t', 'pick.color > sparkle.color', 'night.frame > sparkle.frame'],
      explanation: 'A slow sawtooth walks Palette Sampler along the aurora palette, so the colour moves from green through teal to violet and starts again. Glitter paints its sparkles in that colour over a dark noise sky.',
      preview: 'The {output} shows a deep-sea night with sparkles whose colour drifts slowly through the aurora greens and violets.',
    }),
  },

  PaletteSweep: {
    overview: [
      'Palette Sweep travels through a palette by itself, giving out one colour at a time. Ping-pong runs to the end and back; Loop runs to the end and starts again, which suits a palette whose last colour leads back into its first. Rate is how many full cycles it makes each second.',
      'Easing shapes each leg with the same curves as Ease: linear moves evenly, sine, quad and cubic slow at the ends so the end colours linger.',
      'It is Palette Sampler with its own motion built in — the quick way to a colour that is always gently changing.',
    ],
    inputs: {
      paletteIn: 'A palette to sweep. Replaces the Palette choice.',
      rate: 'Cycles per second.',
    },
    outputs: {
      color: 'The current colour.',
    },
    example: example({
      featured: 'PaletteSweep',
      title: 'Lettering that glows through a synthwave palette',
      nodes: {
        sweep: ['PaletteSweep', { palette: 'synthwave', rate: 0.15, motion: 'pingPong', easing: 'inOutSine' }],
        word: ['Text', { text: 'SYNTH' }],
        output: ['MatrixOutput', { form: 'matrix', width: 32, height: 8 }],
      },
      wires: ['sweep.color > word.color'],
      explanation: 'Palette Sweep moves back and forth through the synthwave palette about once every seven seconds, easing at each end. Text uses that colour, so the word glows pink, then purple, then blue and back again.',
      preview: 'The {output} shows SYNTH in a single colour that slowly sweeps from hot pink to electric blue and back.',
    }),
  },

  Color: {
    overview: [
      'Color holds one colour you pick from a swatch and offers it on a wire.',
      'Use it for colours that several nodes should share — a brand colour, a team colour, a theme — so one change updates them all. It also feeds palettes: Custom Palette and Poline Palette build palettes from Color nodes.',
    ],
    outputs: {
      color: 'The picked colour.',
    },
    example: example({
      featured: 'Color',
      title: 'Choose the colour of a gravity well',
      nodes: {
        swatch: ['Color', { color: '#ff7a1a' }],
        well: ['GravityWell', { speed: 0.6 }],
      },
      wires: ['swatch.color > well.color'],
      explanation: 'Color supplies a single orange, and Gravity Well paints its bunching rings with it. Click the swatch on Color and pick another colour: the rings change at once.',
      preview: 'The {output} shows orange rings that crowd together around a drifting well.',
    }),
  },

  HueCycle: {
    overview: [
      'Hue Cycle travels round the colour wheel by itself. Rate is how many full turns it makes each second: 0.1 takes ten seconds for a rainbow.',
      'Saturation and Brightness set how strong and how bright the colours are; turn Saturation down for pastels.',
    ],
    inputs: {
      rate: 'Turns per second.',
      s: 'Saturation: colour strength, 0 (white) to 1 (pure).',
      v: 'Brightness, 0 to 1.',
    },
    outputs: {
      color: 'The current colour.',
    },
    example: example({
      featured: 'HueCycle',
      title: 'A stopwatch that runs through the rainbow',
      nodes: {
        hue: ['HueCycle', { rate: 0.05, s: 0.85, v: 1 }],
        watch: ['ClockDisplay', { displayMode: 'Stopwatch' }],
        output: ['MatrixOutput', { form: 'matrix', width: 32, height: 8 }],
      },
      wires: ['hue.color > watch.color'],
      explanation: 'Clock Display in Stopwatch mode counts up from zero without any clock wired. Hue Cycle colours its digits, turning once round the wheel every twenty seconds.',
      preview: 'The {output} shows a running stopwatch whose digits change colour slowly as the seconds tick by.',
    }),
  },

  HSVToRGB: {
    overview: [
      'HSV → RGB builds a colour from hue, saturation and brightness (the V of HSV). Hue is the colour’s place on the wheel; saturation how pure it is; brightness how bright.',
      'Hue can be read in degrees (0 red, 120 green, 240 blue) or as the same wheel in 0–255 steps (0 red, 85 green, 170 blue, 255 back to red). Values past the end wrap round the wheel, so a rising number keeps cycling.',
      'The wheel is the plain HSV one, with its three primaries evenly spaced. FastLED’s CHSV uses its rainbow wheel, which widens yellow, so a CHSV hue ported here lands close to, but not exactly on, the same colour.',
      'It is the usual way to turn a number — an audio hue, a counter, a sensor — into a colour.',
    ],
    inputs: {
      h: 'Hue, in degrees or 0–255 steps depending on Hue Units.',
      s: 'Saturation, 0 (white) to 1 (pure).',
      v: 'Brightness, 0 (off) to 1 (full).',
    },
    outputs: {
      color: 'The colour.',
    },
    example: example({
      featured: 'HSVToRGB',
      title: 'A spinning laser that walks the colour wheel',
      nodes: {
        walk: ['Wave', { frequency: 0.1, amplitude: 360, unipolar: true, waveform: 'sawtooth' }],
        colour: ['HSVToRGB', { s: 1, v: 1 }],
        beam: ['Line', { x1: 0, y1: 'max_y', x2: 'max_x', y2: 0 }],
        spin: ['Transform', { transform: 'rotate', rate: 70 }],
        trails: ['Trails', { decay: 0.35 }],
      },
      wires: ['walk.result > colour.h', 'colour.color > beam.color', 'beam.frame > spin.frame', 'spin.frame > trails.frame'],
      explanation: 'A sawtooth Wave counts from 0 to 360 every ten seconds and becomes the hue in HSV → RGB. The colour paints a diagonal Line, which Transform spins and Trails smears, so a laser sweeps round leaving a fading fan of colour.',
      preview: 'The {output} shows a spinning beam that leaves a colourful wake, its hue changing slowly as it turns.',
    }),
  },

  RGBToHSV: {
    overview: [
      'RGB → HSV takes a colour apart into hue (0 to 360), saturation (0 to 1) and brightness (0 to 1, the V of HSV).',
      'Once a colour is in parts you can change one without the others: rotate the hue to find a complement, lower saturation for a pastel, scale brightness to dim it, then rebuild it with HSV → RGB.',
    ],
    inputs: {
      rgb: 'The colour to take apart. Replaces the R, G and B fields.',
    },
    outputs: {
      h: 'Hue in degrees, 0 to 360.',
      s: 'Saturation, 0 to 1.',
      v: 'Brightness, 0 to 1.',
    },
    example: example({
      featured: 'RGBToHSV',
      title: 'Fade a colour into its complement',
      nodes: {
        base: ['Color', { color: '#ff3080' }],
        parts: ['RGBToHSV'],
        opposite: ['Math', { mathOp: 'add', b: 180 }],
        rebuild: ['HSVToRGB'],
        fade: ['GradientFrame', { mixMode: 'rgb' }],
      },
      wires: [
        'base.color > parts.rgb',
        'parts.h > opposite.a',
        'opposite.result > rebuild.h',
        'parts.s > rebuild.s',
        'parts.v > rebuild.v',
        'base.color > fade.colorA',
        'rebuild.color > fade.colorB',
      ],
      explanation: 'RGB → HSV splits the pink into hue, saturation and brightness. Math adds 180° to the hue only, and HSV → RGB rebuilds the colour with the original saturation and brightness — its exact complement. Gradient Frame fades from one to the other.',
      preview: 'The {output} shows a gradient from hot pink on the left to its complementary green on the right.',
    }),
  },

  Temperature: {
    overview: [
      'Color Temperature gives a white from a colour temperature in kelvin, the number LED strips and bulbs are sold by. Lower is warmer: 1800 K is candlelight, 2700 K a warm-white bulb, 4000 K (the default) neutral, 6500 K daylight and 9000 K clear blue sky.',
      'It is the natural way to make tunable white — warm for evenings, cool for working — or to tint a scene toward firelight or daylight.',
      'A wired value is in kelvin too. To drive it from a 0–1 level, put a Map Range in front with Out Min and Out Max set to the two whites you want.',
    ],
    inputs: {
      kelvin: 'Colour temperature in kelvin, 1800 (candle) to 9000 (blue sky).',
    },
    outputs: {
      color: 'The white for that temperature.',
    },
    example: example({
      featured: 'Temperature',
      title: 'A knob from candlelight to daylight',
      nodes: {
        knob: ['PotInput'],
        range: ['MapRange', { inMin: 0, inMax: 1, outMin: 1800, outMax: 6500, clampOutput: true }],
        white: ['Temperature'],
        lamp: ['SolidColor'],
        output: ['MatrixOutput', STRIP(60)],
      },
      wires: ['knob.value > range.value', 'range.result > white.kelvin', 'white.color > lamp.color'],
      explanation: 'Map Range turns the Potentiometer’s 0–1 into 1800 to 6500 K, so the knob sets Color Temperature and Solid Color fills the string with that white: candle-orange at one end of the knob, cool daylight at the other.',
      preview: 'The {output} glows a warm white. Drag the Potentiometer slider down for candlelight or up for cool daylight.',
    }),
  },

  HeatColor: {
    overview: [
      'Heat Color is FastLED’s HeatColor as a node: a heat level from 0 to 1 becomes the colour of something glowing — black, then deep red, orange, yellow, and white at the top.',
      'Wire any level into Heat and it reads as temperature: a sensor, an envelope, a drum hit.',
    ],
    inputs: {
      heat: 'From 0 (cold, black) to 1 (white hot).',
    },
    outputs: {
      color: 'The glow colour for that heat.',
    },
    example: example({
      featured: 'HeatColor',
      title: 'A hot plate glowing up and cooling down',
      nodes: {
        burner: ['Wave', { frequency: 0.1, amplitude: 1, unipolar: true }],
        glow: ['HeatColor'],
        plate: ['Shape', { shape: 'ellipse', size: 6.5, filled: true, edge: '#202020', thickness: 1 }],
      },
      wires: ['burner.result > glow.heat', 'glow.color > plate.fill'],
      explanation: 'A slow Wave heats and cools over ten seconds. Heat Color turns that into the colour of hot metal, and Shape fills a round plate with it.',
      preview: 'The {output} shows a round plate glowing from dull red up to yellow-white and back down again.',
    }),
  },

  PaletteSelector: {
    overview: [
      'Palette Selector offers one of the built-in palettes on a wire.',
      'Most patterns have their own palette setting, so a selector earns its place when one palette should colour several nodes, or when a pattern should wear a palette it was not designed for — blue fire, a sunset plasma.',
    ],
    outputs: {
      palette: PALETTE_OUT,
    },
    example: example({
      featured: 'PaletteSelector',
      title: 'Blue fire',
      nodes: {
        ice: ['PaletteSelector', { palette: 'ice' }],
        fire: ['Fire', { fireStyle: 'classic', cooling: 60, sparking: 130 }],
      },
      wires: ['ice.palette > fire.paletteIn'],
      explanation: 'Fire normally burns with its own fire palette. Palette Selector hands it the ice palette instead, and the same flames burn in cold blues and white.',
      preview: 'The {output} shows rising flames in icy blue and white.',
    }),
  },

  CustomPalette: {
    overview: [
      'Custom Palette builds a palette from two to eight colour stops on a strip in its body, blended between. Drag a stop to move it, click its swatch to recolour it, add a stop with add, and pick a ready-made set from the presets below the strip. Export and link share the palette.',
      'Wire Color nodes into Color 1–4 for colours that come from elsewhere — team colours, a brand, a holiday — or any colour signal for a palette that changes. Each input replaces one of the first four stops counted from the left, and the strip numbers the stops they drive; drag a stop past a neighbour and the numbers follow the new order.',
    ],
    inputs: {
      color0: 'Replaces the colour of the leftmost stop, numbered 1 on the strip.',
      color1: 'Replaces the colour of stop 2.',
      color2: 'Replaces the colour of stop 3.',
      color3: 'Replaces the colour of stop 4.',
    },
    outputs: {
      palette: PALETTE_OUT,
    },
    example: example({
      featured: 'CustomPalette',
      title: 'Twinkle in your team’s colours',
      nodes: {
        navy: ['Color', { color: '#0b2e8a' }],
        gold: ['Color', { color: '#ffc400' }],
        white: ['Color', { color: '#ffffff' }],
        team: ['CustomPalette'],
        lights: ['TwinkleFox', { density: 0.6, speed: 0.45 }],
      },
      wires: ['navy.color > team.color0', 'gold.color > team.color1', 'white.color > team.color2', 'team.palette > lights.paletteIn'],
      explanation: 'Three Color nodes — navy, gold and white — become a palette in Custom Palette, and TwinkleFox picks every light’s colour from it.',
      preview: 'The {output} twinkles in navy, gold and white.',
    }),
  },

  PaletteFromImage: {
    overview: [
      'Palette from Image borrows the colours of a picture. It finds the picture’s main colours and spreads them into a 16-step FastLED palette.',
      'Colors sets how many main colours it looks for: fewer gives broad, simple palettes, more keeps smaller accents.',
      'Upload the picture into an Image node and wire its Image Data output here. The palette is worked out once, so the picture itself need not be shown.',
    ],
    inputs: {
      image: 'Picture data from an Image node’s Image Data output.',
    },
    outputs: {
      palette: PALETTE_OUT,
    },
    example: example({
      featured: 'PaletteFromImage',
      title: 'Borrow a palette from a picture',
      nodes: {
        photo: ['Image', { image: SAMPLE_IMAGE, fit: 'contain' }],
        borrow: ['PaletteFromImage', { count: 4 }],
        flow: ['FlowField', { count: 200, speed: 0.6, fade: 0.95 }],
      },
      wires: ['photo.image > borrow.image', 'borrow.palette > flow.paletteIn'],
      show: 'flow',
      explanation: 'Image holds a small picture of a pink and gold star on navy. Palette from Image pulls its four main colours into a palette, and Flow Field draws its drifting particle trails in those colours.',
      preview: 'The {output} shows particle trails flowing across the matrix in the star’s navy, pink and gold.',
    }),
  },

  Poline: {
    overview: [
      'Poline Palette draws a smooth curve through three anchor colours and samples a palette along it, using the poline colour library. The in-between colours stay rich rather than passing through grey.',
      'Points sets how many colours are made between each pair of anchors; Position spaces them along the curve. Wire Color nodes into the anchors, or pick them on the node.',
      'For contrast, put a deep, tinted colour on the middle anchor (the trough preset does): a pattern then always shows a dark band between the two bright hues instead of washing out.',
    ],
    inputs: {
      colorA: 'First anchor. Replaces Anchor A.',
      colorB: 'Second anchor. Replaces Anchor B.',
      colorC: 'Third anchor. Replaces Anchor C.',
    },
    outputs: {
      palette: PALETTE_OUT,
    },
    example: example({
      featured: 'Poline',
      title: 'A spiral through three anchor colours',
      nodes: {
        curve: ['Poline', { anchorA: '#1020ff', anchorB: '#ff20a0', anchorC: '#ffd23a', points: 5, position: 'sinusoidal' }],
        swirl: ['PolarGradient', { spin: 0.15, repeat: 2, radialMix: 0.45 }],
      },
      wires: ['curve.palette > swirl.paletteIn'],
      output: RING(24),
      explanation: 'Poline Palette curves from blue through magenta to gold, and Polar Gradient wraps that palette round the centre in a slowly turning spiral.',
      preview: 'The {output} shows bands of blue, magenta and gold rotating slowly round it.',
    }),
  },

  HarmonyPalette: {
    overview: [
      'Harmony Palette builds a palette from colour-wheel rules around one base hue: complementary, analogous, triadic, split-complementary or tetradic. Each hue the rule picks is held as a band, with a short blend into the next that never passes through the hues in between.',
      'Change the base hue and the whole palette moves with it while staying in harmony, which makes it ideal for colours that drift without ever clashing. Spread pulls the extra hues in toward the base.',
      'Every band has the same brightness, so a pattern that fills the frame can look flat. Shade dips the blends between the bands toward black, giving dark troughs between the hues.',
    ],
    inputs: {
      hue: 'Base hue in degrees.',
      saturation: 'Colour strength of every colour.',
      value: 'Brightness of every colour.',
      spread: 'How far the other hues sit from the base, 0 to 1.',
      shade: 'How far the blends between the hues dip toward black, 0 to 1.',
    },
    outputs: {
      palette: PALETTE_OUT,
    },
    example: example({
      featured: 'HarmonyPalette',
      title: 'Colours that drift but never clash',
      nodes: {
        wander: ['NoiseSignal', { speed: 0.15, min: 0, max: 360 }],
        harmony: ['HarmonyPalette', { harmony: 'splitComplementary', saturation: 0.9, shade: 0.5 }],
        lava: ['Blobs', { count: 4, speed: 0.3 }],
      },
      wires: ['wander.value > harmony.hue', 'harmony.palette > lava.paletteIn'],
      explanation: 'Noise LFO wanders the base hue round the wheel. Harmony Palette builds a split-complementary palette around it, and Blobs uses it, so the lava lamp keeps changing colour scheme while its colours always belong together.',
      preview: 'The {output} shows merging blobs whose whole colour scheme drifts slowly over time.',
    }),
  },

  PaletteBlend: {
    overview: [
      'Blend Palettes mixes two palettes into one. Amount 0 is all Palette A, 1 is all Palette B, and anything between is a blend of each colour.',
      'Wire a slow signal into Amount for gradual change — day into night, summer into autumn — or a sensor for a palette that reports a reading.',
    ],
    inputs: {
      paletteA: 'The first palette. Replaces the Palette A choice.',
      paletteB: 'The second palette. Replaces the Palette B choice.',
      amount: 'Mix between them, 0 (A) to 1 (B).',
    },
    outputs: {
      palette: PALETTE_OUT,
    },
    example: example({
      featured: 'PaletteBlend',
      title: 'Summer fading into autumn',
      nodes: {
        season: ['Wave', { frequency: 0.06, amplitude: 1, unipolar: true }],
        blend: ['PaletteBlend', { paletteA: 'meadow', paletteB: 'emberglow' }],
        leaves: ['Noise', { noiseType: 'fbm', speed: 0.3, scale: 0.45 }],
      },
      wires: ['season.result > blend.amount', 'blend.palette > leaves.paletteIn'],
      explanation: 'A very slow Wave moves Blend Palettes from the green meadow palette to warm embers and back over about seventeen seconds. Noise clouds wear the blended palette, so the canopy turns from summer green to autumn orange.',
      preview: 'The {output} shows drifting clouds of colour turning gradually from greens to oranges and reds and back.',
    }),
  },

  PaletteTransform: {
    overview: [
      'Palette Transform changes a palette on its way to a pattern: Reverse runs it backwards, Offset rotates its colours round, Black point pulls its dark end down to black, and Brightness dims every colour. Pick a preset on the node, or wire any palette into it.',
      'Offset is the useful one to animate. Wire a ramp into it and the colours flow through a pattern that otherwise stands still.',
      'Black point is the contrast control. Built-in palettes bottom out at a dark colour rather than black, so a pattern that fills the frame can look washed out; a black point of 0.2 to 0.4 gives it deep shadows while keeping the order of its colours.',
    ],
    inputs: {
      paletteIn: 'The palette to transform. Replaces the Palette choice.',
      offset: 'Rotation round the palette, 0 to 1 for a full turn.',
      brightness: 'Scale for every colour, 0 to 1.',
      blackPoint: 'The level pulled down to black, 0 (none) to 0.9.',
    },
    outputs: {
      palette: PALETTE_OUT,
    },
    example: example({
      featured: 'PaletteTransform',
      title: 'Colours flowing through still stripes',
      nodes: {
        flow: ['Wave', { frequency: 0.2, amplitude: 1, unipolar: true, waveform: 'sawtooth' }],
        shift: ['PaletteTransform', { paletteIn: 'party', blackPoint: 0.25 }],
        stripes: ['PaletteGradient', { angle: 30, repeat: 2, speed: 0 }],
      },
      wires: ['flow.result > shift.offset', 'shift.palette > stripes.paletteIn'],
      explanation: 'Palette Gradient draws fixed diagonal stripes with its scroll at 0. Palette Transform takes the party preset, deepens its darker colours with a black point of 0.25, and rotates it with a sawtooth ramp, so the stripes stay put while the colours stream through them with dark gaps between.',
      preview: 'The {output} shows diagonal bands whose colours flow steadily along them, separated by deep shadows.',
    }),
  },

  PaletteBank: {
    overview: [
      'Palette Bank holds an ordered list of palettes and steps through it on Next and Previous, blending into each new palette over a short fade. It wraps at both ends.',
      'A new bank starts with four contrasting presets — party, ocean, lava and forest — so the first press shows a change. Tick the palettes you want in its body; only those are built into the sketch. Name and Index say which palette is current, for a display or another node.',
      'Wire buttons, remote keys, beats or a timer into Next and Previous. To pick a palette directly, wire a number into Index — a Step Value, an encoder, a DMX channel or a Touch slider: whenever it changes the bank jumps to that position, counted from 0, and Next and Previous step on from there.',
    ],
    inputs: {
      next: 'Each press moves to the next palette.',
      previous: 'Each press moves to the previous palette.',
      select: 'A position in the bank, from 0; each change jumps there, wrapping past the end.',
    },
    outputs: {
      palette: 'The current palette, blending toward the newly selected one after each step.',
      name: 'The current palette’s name, as text.',
      index: 'Position of the current palette in the list, from 0.',
    },
    example: example({
      featured: 'PaletteBank',
      title: 'A guided tour of the ocean palettes',
      nodes: {
        every: ['Interval', { interval: 4 }],
        bank: ['PaletteBank', { palettes: ['ocean', 'deepsea', 'laguna', 'arctic', 'coralreef'], blend: 16 }],
        sea: ['Pacifica', { speed: 0.35 }],
      },
      wires: ['every.pulse > bank.next', 'bank.palette > sea.paletteIn'],
      explanation: 'Interval presses Next every four seconds. Palette Bank steps through five watery palettes and blends into each one, and Pacifica’s waves wear whichever is current.',
      preview: 'The {output} shows Pacifica waves whose colours change every four seconds, blending from one sea to the next.',
    }),
  },
}
