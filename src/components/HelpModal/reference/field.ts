import { example, MATRIX, RING } from './example'
import type { NodeReferenceMap } from './types'

const FIELD_OUT = 'A field: one value per pixel, 0 to 1. Paint it with Field → Frame, or keep shaping it with other field nodes.'
const FIELD_IN = 'The field to work on.'

export const FIELD_REFERENCE: NodeReferenceMap = {
  FieldFormula: {
    overview: [
      'Field Formula computes a field from a formula, one value per pixel. It knows x and y (0 to 1), cx and cy (centred), r and angle (polar), t (time), W and H, two inputs a and b, and FastLED helpers such as sin8 and beatsin8.',
      'It can also read another field as fieldIn, so a formula can bend, threshold or combine an existing field. Fields are the ANIMartRIX way of working: shape numbers first, colour them last.',
      'prev is the value this node wrote at the same pixel last frame, 0 to begin with. Reading it keeps the field between frames, so max(prev*0.95, fieldIn) leaves a fading trail and prev + 0.01 fills slowly. The firmware keeps the same buffer, and a Restart entry in a show clears it.',
      'Formulas run only in a trusted workspace.',
    ],
    inputs: {
      a: 'A number your formula can read as a.',
      b: 'A number your formula can read as b.',
      fieldIn: 'A field your formula can read as fieldIn.',
    },
    outputs: { field: FIELD_OUT },
    example: example({
      featured: 'FieldFormula',
      title: 'A five-armed swirl in one line',
      nodes: {
        swirl: ['FieldFormula', { formula: 'sin(angle*5 + r*10 - t*2)*0.5 + 0.5' }],
        paint: ['FieldToFrame', { palette: 'synthwave' }],
      },
      wires: ['swirl.field > paint.field'],
      explanation: 'Field Formula adds five times the angle to ten times the distance from the centre, which bends five arms into a spiral; subtracting time turns it. Field → Frame paints the result with the synthwave palette.',
      preview: 'The {output} shows a pink and blue five-armed spiral turning slowly.',
    }),
  },

  FieldNoise: {
    overview: [
      'Field Noise is fractal noise as a field: soft, organic, cloud-like values that drift over time. It is the field cousin of the Noise pattern’s fBm mode.',
      'Scale sets the size of the features, Octaves the amount of fine detail, and Speed the drift. Shape folds the noise into sharp ridges or rounded billows. Wrap X joins the left and right edges for a ring or corkscrew.',
    ],
    outputs: { field: FIELD_OUT },
    example: example({
      featured: 'FieldNoise',
      title: 'Clouds that circle a ring without a seam',
      nodes: {
        clouds: ['FieldNoise', { speed: 0.3, scale: 0.35, octaves: 3, wrapX: true }],
        paint: ['FieldToFrame', { palette: 'aurora' }],
      },
      wires: ['clouds.field > paint.field'],
      output: RING(24),
      explanation: 'Field Noise with Wrap X joins the canvas’s left and right edges, so on an LED ring the drifting clouds pass the join without a jump. Field → Frame colours them with the aurora palette.',
      preview: 'The {output} shows soft green and violet clouds drifting round it seamlessly.',
    }),
  },

  SliceTiling: {
    overview: [
      'Slice Tiling fills the canvas with hexagons, squares or triangles, cuts each polygon into fan slices, and quarters those slices again up to three times. A pattern switches the smallest pieces on or off: pinwheels, blossoms, stars, braids, snowflakes and more.',
      'Symmetry mirrors each slice so neighbours join seamlessly. Warp moves the cut points, Morph blends between two patterns, and Spin keeps the tiling turning.',
      'Its Cell output gives every polygon its own value, which is how each tile gets its own colour.',
    ],
    outputs: {
      field: 'The tiling: 1 on solid slices, 0 on empty ones, with soft edges.',
      cell: 'One value per polygon, shuffled by Seed. Multiply it with Field to colour each tile separately.',
    },
    example: example({
      featured: 'SliceTiling',
      title: 'Give every hexagon its own colour',
      nodes: {
        tiles: ['SliceTiling', { lattice: 'hex', depth: 1, preset: 'pinwheel', cells: 2.2, spin: 12, edge: 0.05, seed: 1 }],
        shade: ['FieldMath', { fieldOp: 'multiply' }],
        paint: ['FieldToFrame', { palette: 'synthwave', brightness: 1 }],
      },
      wires: ['tiles.field > shade.a', 'tiles.cell > shade.b', 'shade.field > paint.field'],
      explanation: 'Slice Tiling’s Field holds the solid and empty slices; its Cell holds one value per hexagon. Field Math multiplies them, so each hexagon’s slices take their own synthwave colour while the empty slices stay dark. Spin turns the lattice and each colour turns with its hexagon.',
      preview: 'The {output} shows slowly turning hexagonal pinwheels, each in its own colour. Change Seed to deal the colours out again.',
    }),
  },

  Truchet: {
    overview: [
      'Truchet Tiles lays a grid of simple tiles — quarter-circle arcs, diagonals, Smith curves, the 10 PRINT maze, or hexagonal arcs — each turned at random. The pieces join across their edges into winding paths.',
      'Seed decides each tile’s orientation, and Reroll deals them out again. Scroll slides the grid and Line Width sets the glow of the lines.',
    ],
    inputs: {
      reroll: 'Each rising edge re-deals every tile’s orientation.',
    },
    outputs: { field: FIELD_OUT },
    example: example({
      featured: 'Truchet',
      title: 'A maze of arcs that reshuffles itself',
      nodes: {
        shuffle: ['Interval', { interval: 3 }],
        maze: ['Truchet', { lattice: 'square', motif: 'arcs', cells: 4, lineWidth: 0.12, scroll: 0.4 }],
        paint: ['FieldToFrame', { palette: 'synthwave' }],
      },
      wires: ['shuffle.pulse > maze.reroll', 'maze.field > paint.field'],
      explanation: 'Truchet Tiles draws a 4×4 grid of arc tiles that join into winding loops while the grid scrolls sideways. Every three seconds Interval presses Reroll, and the loops rearrange into new paths.',
      preview: 'The {output} shows glowing curved paths weaving across the matrix, rearranging every few seconds.',
    }),
  },

  FormulaField: {
    overview: [
      'Formula Shapes draws one of a set of famous closed-form shapes as a field: a rose curve, Gielis’s superformula, a Fibonacci spiral, golden-ratio rings, or a Lissajous curve.',
      'Only the knobs for the chosen shape do anything. The superformula alone makes stars, flowers, rounded squares and organic blobs from its three exponents.',
      'On the canvas the node takes the name of the shape chosen.',
    ],
    outputs: { field: FIELD_OUT },
    example: example({
      featured: 'FormulaField',
      title: 'A starfish from the superformula',
      nodes: {
        star: ['FormulaField', { formulaType: 'superformula', symmetry: 5, n1: 0.35, n2: 0.9, n3: 0.9, speed: 0.2 }],
        paint: ['FieldToFrame', { palette: 'coralreef' }],
      },
      wires: ['star.field > paint.field'],
      explanation: 'Formula Shapes set to the superformula with five lobes and these exponents makes a plump five-armed starfish, turning slowly. Field → Frame colours it with the coral-reef palette.',
      preview: 'The {output} shows a coral and turquoise five-armed starfish shape, slowly rotating.',
    }),
  },

  WaveSim: {
    overview: [
      'Wave Sim simulates the surface of water: each Trigger drops a splash, and ripples spread, reflect and interfere before they die away.',
      'Damping sets how long the water keeps ringing and Speed how fast the ripples travel. Crests Only shows only the raised half of each wave. Wrap X lets waves leave one side and come back on the other.',
    ],
    inputs: {
      trigger: 'Each rising edge drops a splash. Successive splashes land in different places.',
    },
    outputs: { field: FIELD_OUT },
    example: example({
      featured: 'WaveSim',
      title: 'The music makes waves',
      nodes: {
        mic: ['MicInput'],
        beat: ['BeatDetect', { threshold: 0.45 }],
        water: ['WaveSim', { speed: 4, damping: 0.985, impulse: 0.9 }],
        paint: ['FieldToFrame', { palette: 'ocean' }],
      },
      wires: ['mic.audio > beat.audio', 'beat.beat > water.trigger', 'water.field > paint.field'],
      explanation: 'Each beat from Beat Detect drops a splash into Wave Sim. Its ripples spread, bounce and cross each other, and Field → Frame shows the water surface in ocean blues.',
      preview: 'Play music near the microphone. The {output} shows ripples spreading and interfering, with a new splash on each beat.',
    }),
  },

  FluidSim: {
    overview: [
      'Fluid simulates smoke or dye in moving air. Dye is added at the injection point, rises with buoyancy, and is carried by a flow that curls and eddies.',
      'Viscosity thickens the flow, Diffusion spreads the dye, and Dissipation fades it. Force X and Y fields can push the flow, and Velocity X and Y report it, for effects that follow the current.',
    ],
    inputs: {
      forceX: 'A field that pushes the flow sideways.',
      forceY: 'A field that pushes the flow up or down.',
      trigger: 'Each rising edge adds a puff of dye at the injection point.',
    },
    outputs: {
      field: 'The dye density, 0 to 1.',
      velocityX: 'The flow’s sideways speed, as a field.',
      velocityY: 'The flow’s vertical speed, as a field.',
    },
    example: example({
      featured: 'FluidSim',
      title: 'A plume of smoke from a moving source',
      nodes: {
        sway: ['Wave', { frequency: 0.12, amplitude: 0.3, offset: 0.5 }],
        smoke: ['FluidSim', { inject: 0.6, injectY: 0.9, buoyancy: 0.6, dissipation: 0.03 }],
        paint: ['FieldToFrame', { palette: 'emberglow' }],
      },
      wires: ['sway.result > smoke.injectX', 'smoke.field > paint.field'],
      explanation: 'A slow Wave sways Fluid’s injection point from side to side near the bottom. The dye rises and curls into a plume that bends as its source moves, and Field → Frame colours it like glowing smoke.',
      preview: 'The {output} shows an orange plume rising and curling, its base swaying back and forth.',
    }),
  },

  FractalField: {
    overview: [
      'Fractal Field draws a Julia set, the Mandelbrot set, a Newton fractal or the Burning Ship as a field.',
      'For a Julia set, C sets the shape: small changes to C morph it dramatically, so a slow LFO on C Real or C Imag makes a living fractal. Zoom, centre and spin move the view; Iterations trades detail for speed.',
    ],
    outputs: { field: FIELD_OUT },
    example: example({
      featured: 'FractalField',
      title: 'A Julia set that breathes',
      nodes: {
        morph: ['NoiseSignal', { speed: 0.12, min: -0.85, max: -0.7 }],
        julia: ['FractalField', { fractalType: 'julia', cIm: 0.156, zoom: 1.1, iterations: 32, smooth: true }],
        paint: ['FieldToFrame', { palette: 'ultraviolet' }],
      },
      wires: ['morph.value > julia.cRe', 'julia.field > paint.field'],
      output: MATRIX(32, 32),
      explanation: 'Noise LFO wanders Fractal Field’s C Real across a small range, and the Julia set changes shape continuously as it does — opening, pinching and curling. Field → Frame colours the escape values in ultraviolet.',
      preview: 'The {output} shows an intricate violet fractal slowly changing its shape.',
    }),
  },

  Automaton: {
    overview: [
      'Automaton runs a cellular automaton as a field. Elementary rules scroll a one-dimensional pattern down the canvas; Cyclic makes spirals where colours chase each other; Brian’s Brain makes sparks that never rest; Sand drops grains that pile up.',
      'Rule picks the elementary rule (rule 90 draws Sierpinski’s triangle, 30 is chaos). Reset starts again from the seed.',
    ],
    inputs: {
      reset: 'Each rising edge restarts the automaton.',
    },
    outputs: { field: FIELD_OUT },
    example: example({
      featured: 'Automaton',
      title: 'Rock, paper, scissors spirals',
      nodes: {
        chase: ['Automaton', { automatonType: 'cyclic', states: 8, threshold: 3, speed: 12 }],
        paint: ['FieldToFrame', { palette: 'party' }],
      },
      wires: ['chase.field > paint.field'],
      output: MATRIX(32, 32),
      explanation: 'In Cyclic mode each Automaton cell moves to the next of eight states when enough neighbours are already there, like rock beating scissors. From random noise, spirals emerge and lock into place, and Field → Frame colours each state from the party palette.',
      preview: 'The {output} shows bands of colour forming rotating spirals.',
    }),
  },

  TuringField: {
    overview: [
      'Turing Field grows the patterns Alan Turing predicted in animal coats: labyrinths and spots formed by several scales of activation and inhibition competing.',
      'Unlike Reaction Diffusion it never settles; the maze keeps reorganising. Scales sets how many pattern sizes compete, Base Radius the finest one, and Step Size how fast it changes.',
    ],
    inputs: {
      reset: 'Each rising edge restarts from fresh noise.',
    },
    outputs: { field: FIELD_OUT },
    example: example({
      featured: 'TuringField',
      title: 'A labyrinth that keeps rearranging',
      nodes: {
        maze: ['TuringField', { speed: 2, stepSize: 0.06, scales: 3 }],
        paint: ['FieldToFrame', { palette: 'amethyst' }],
      },
      wires: ['maze.field > paint.field'],
      output: MATRIX(32, 32),
      explanation: 'Turing Field grows a maze-like pattern at three competing scales and keeps reworking it, and Field → Frame paints it in amethyst.',
      preview: 'The {output} shows a violet labyrinth whose walls slowly shift and reconnect.',
    }),
  },

  FieldToFrame: {
    overview: [
      'Field → Frame is where a field becomes light. Every pixel’s value, 0 to 1, is looked up in the palette: 0 takes the first colour, 1 the last.',
      'Brightness scales the result; wire a level into it to pulse the whole field. Almost every field chain ends here.',
    ],
    inputs: {
      field: 'The field to paint.',
      paletteIn: 'A palette to paint with. Replaces the Palette choice.',
    },
    outputs: {
      frame: 'The painted frame.',
    },
    example: example({
      featured: 'FieldToFrame',
      title: 'A hexagon outline that glows and breathes',
      nodes: {
        hex: ['ShapeField', { shape: 'polygon', sides: 6, fieldMode: 'distance', size: 0.35, range: 0.18 }],
        breathe: ['Wave', { frequency: 0.25, amplitude: 0.6, offset: 0.4, unipolar: true }],
        paint: ['FieldToFrame', { palette: 'honeycomb' }],
      },
      wires: ['hex.field > paint.field', 'breathe.result > paint.brightness'],
      explanation: 'Shape Field in distance mode makes a field that peaks on a hexagon’s outline. Field → Frame paints it with the honeycomb palette, and a Wave on Brightness makes the whole glow breathe.',
      preview: 'The {output} shows a golden hexagon outline with a soft glow, slowly brightening and dimming.',
    }),
  },

  FrameToField: {
    overview: [
      'Frame → Field takes any frame and turns its brightness into a field, so a pattern can be reshaped with field tools — levels, blur, warp, symmetry — and recoloured.',
    ],
    inputs: {
      frame: 'The frame to read.',
    },
    outputs: {
      field: 'The frame’s brightness, 0 to 1, per pixel.',
    },
    example: example({
      featured: 'FrameToField',
      title: 'Posterise a plasma into three tones',
      nodes: {
        plasma: ['Plasma', { palette: 'lava', speed: 0.4 }],
        grey: ['FrameToField'],
        steps: ['FieldLevels', { steps: 3 }],
        paint: ['FieldToFrame', { palette: 'noir' }],
      },
      wires: ['plasma.frame > grey.frame', 'grey.field > steps.field', 'steps.field > paint.field'],
      explanation: 'Frame → Field reads Plasma as brightness only. Field Levels cuts that into three flat steps, and Field → Frame recolours the steps with the noir palette — a moving poster-print version of the plasma.',
      preview: 'The {output} shows flowing shapes in three flat shades, like a screen print.',
    }),
  },

  FieldMath: {
    overview: [
      'Field Math combines two fields pixel by pixel: add, subtract, multiply, min, max, difference, or mix by T.',
      'Multiply masks one field with another; max merges shapes; difference lights where they disagree; mix crossfades. An unwired side counts as 0. On the canvas it takes the name of its operation.',
    ],
    inputs: {
      a: 'The first field.',
      b: 'The second field.',
      t: 'Mix only: 0 is all A, 1 is all B.',
    },
    outputs: { field: FIELD_OUT },
    example: example({
      featured: 'FieldMath',
      title: 'Where two rings cross',
      nodes: {
        drift: ['Wave', { frequency: 0.15, amplitude: 0.25, offset: 0.5 }],
        still: ['ShapeField', { shape: 'circle', fieldMode: 'distance', size: 0.3, range: 0.25 }],
        moving: ['ShapeField', { shape: 'circle', fieldMode: 'distance', size: 0.3, range: 0.25 }],
        cross: ['FieldMath', { fieldOp: 'difference' }],
        paint: ['FieldToFrame', { palette: 'opal' }],
      },
      wires: ['drift.result > moving.cx', 'still.field > cross.a', 'moving.field > cross.b', 'cross.field > paint.field'],
      explanation: 'Two Shape Fields draw glowing rings; a Wave slides one across the other. Field Math in Difference mode lights where the two disagree, so where the rings overlap they cancel and new shapes appear.',
      preview: 'The {output} shows two pale rings sliding through each other, cancelling where they cross.',
    }),
  },

  FieldLevels: {
    overview: [
      'Field Levels reshapes a field’s values. Low and High stretch a range to fill 0 to 1; set them equal for a hard threshold. Steps quantises into bands, and Invert flips the result.',
      'It turns soft noise into sharp islands, smooth gradients into contour bands, and any field into a mask.',
    ],
    inputs: {
      field: FIELD_IN,
    },
    outputs: { field: FIELD_OUT },
    example: example({
      featured: 'FieldLevels',
      title: 'Islands rising from the sea',
      nodes: {
        terrain: ['FieldNoise', { speed: 0.15, scale: 0.4, octaves: 4 }],
        coast: ['FieldLevels', { low: 0.45, high: 0.6, steps: 4 }],
        paint: ['FieldToFrame', { palette: 'meadow' }],
      },
      wires: ['terrain.field > coast.field', 'coast.field > paint.field'],
      explanation: 'Field Noise makes rolling terrain. Field Levels treats everything below 0.45 as sea and above 0.6 as peaks, and quantises the slopes between into four bands, so the soft noise becomes islands with contour lines.',
      preview: 'The {output} shows dark sea with banded green islands drifting slowly across it.',
    }),
  },

  GradientField: {
    overview: [
      'Gradient Field is a ramp as a field: linear along an angle, radial from a centre, or angular like a pinwheel.',
      'Repeat makes it wrap several times across the canvas, turning it into stripes, rings or spokes. Offset slides the ramp; wire a ramp into it to scroll them.',
    ],
    outputs: { field: FIELD_OUT },
    example: example({
      featured: 'GradientField',
      title: 'A barber’s pole',
      nodes: {
        roll: ['Wave', { frequency: 0.5, amplitude: 1, unipolar: true, waveform: 'sawtooth' }],
        stripes: ['GradientField', { gradientType: 'linear', angle: 45, repeat: 4 }],
        paint: ['FieldToFrame', { palette: 'cottoncandy' }],
      },
      wires: ['roll.result > stripes.offset', 'stripes.field > paint.field'],
      output: MATRIX(8, 24),
      explanation: 'Gradient Field makes a diagonal ramp repeated four times, so it becomes stripes. A sawtooth on Offset slides them steadily, and on a tall, narrow panel they read as a turning barber’s pole.',
      preview: 'The {output} shows diagonal pastel stripes climbing steadily.',
    }),
  },

  FloatToField: {
    overview: [
      'Float → Field fills a whole field with one number, so a level — the bass, a knob, a sensor — can join the field chain.',
      'Combine it with Field Math to raise, scale or mask a field by that level.',
    ],
    inputs: {
      value: 'The number every pixel takes, 0 to 1.',
    },
    outputs: { field: FIELD_OUT },
    example: example({
      featured: 'FloatToField',
      title: 'A glow whose size follows the bass',
      nodes: {
        mic: ['MicInput'],
        fft: ['FFTAnalyzer', { smoothing: 0.6 }],
        level: ['FloatToField'],
        glow: ['GradientField', { gradientType: 'radial' }],
        cutoff: ['FieldMath', { fieldOp: 'subtract' }],
        paint: ['FieldToFrame', { palette: 'lava' }],
      },
      wires: ['mic.audio > fft.audio', 'fft.bass > level.value', 'level.field > cutoff.a', 'glow.field > cutoff.b', 'cutoff.field > paint.field'],
      explanation: 'Float → Field turns the bass level into a flat field. Field Math subtracts a radial ramp from it, so only the pixels closer to the centre than the bass is loud stay lit — the glow grows and shrinks with the kick.',
      preview: 'Play music near the microphone. The {output} shows a red-orange disc that swells outward on each bass hit.',
    }),
  },

  FieldBlur: {
    overview: [
      'Field Blur softens a field by averaging each pixel with its neighbours, up to four pixels away.',
      'Use it to turn hard-edged shapes into glows, smooth noisy simulations, or feather a mask.',
    ],
    inputs: {
      field: FIELD_IN,
    },
    outputs: { field: FIELD_OUT },
    example: example({
      featured: 'FieldBlur',
      title: 'Soften a hard star into a glow',
      nodes: {
        star: ['ShapeField', { shape: 'polygon', sides: 5, size: 0.4, softness: 0, rotation: 18 }],
        soften: ['FieldBlur', { radius: 2 }],
        paint: ['FieldToFrame', { palette: 'emberglow' }],
      },
      wires: ['star.field > soften.field', 'soften.field > paint.field'],
      explanation: 'Shape Field draws a hard-edged pentagon. Field Blur averages two pixels each way, so its edges melt into a soft glow before Field → Frame colours it.',
      preview: 'The {output} shows a pentagon with a warm, blurred halo instead of a sharp edge.',
    }),
  },

  ShapeField: {
    overview: [
      'Shape Field draws a circle, rectangle or polygon as a field. Fill gives 1 inside and 0 outside with a soft edge; Distance peaks on the outline and falls away either side; Falloff is 0 on the shape and rises to 1 at Range.',
      'A tiny circle in Falloff mode is the distance from a point — the building block of spotlights, glows and ripples.',
    ],
    outputs: { field: FIELD_OUT },
    example: example({
      featured: 'ShapeField',
      title: 'A spotlight roaming the stage',
      nodes: {
        across: ['Wave', { frequency: 0.13, amplitude: 0.35, offset: 0.5 }],
        down: ['Wave', { frequency: 0.21, amplitude: 0.3, offset: 0.5 }],
        spot: ['ShapeField', { shape: 'circle', fieldMode: 'fill', size: 0.2, softness: 0.25 }],
        paint: ['FieldToFrame', { palette: 'heat' }],
      },
      wires: ['across.result > spot.cx', 'down.result > spot.cy', 'spot.field > paint.field'],
      explanation: 'Shape Field draws a soft-edged circle, and two Waves at unrelated speeds move it across and down, so it wanders the matrix like a follow spot. Field → Frame paints it with heat colours, white-hot in the middle.',
      preview: 'The {output} shows a glowing spot with a hot centre drifting around the dark matrix.',
    }),
  },

  FieldWarp: {
    overview: [
      'Field Warp moves each pixel of a field by two other fields: dX pushes sideways, dY up and down, with 0.5 meaning no push. Strength sets how far, in pixels.',
      'Warping by smooth noise makes anything look liquid — stripes ripple like a flag, rings wobble like jelly.',
    ],
    inputs: {
      field: FIELD_IN,
      dx: 'A field that pushes each pixel sideways. 0.5 is no push.',
      dy: 'A field that pushes each pixel up or down. 0.5 is no push.',
    },
    outputs: { field: FIELD_OUT },
    example: example({
      featured: 'FieldWarp',
      title: 'Stripes rippling like a flag',
      nodes: {
        stripes: ['GradientField', { gradientType: 'linear', angle: 0, repeat: 3 }],
        windX: ['FieldNoise', { speed: 0.4, scale: 0.25, octaves: 2, seed: 3 }],
        windY: ['FieldNoise', { speed: 0.4, scale: 0.25, octaves: 2, seed: 7 }],
        flutter: ['FieldWarp', { strength: 3 }],
        paint: ['FieldToFrame', { palette: 'party' }],
      },
      wires: ['stripes.field > flutter.field', 'windX.field > flutter.dx', 'windY.field > flutter.dy', 'flutter.field > paint.field'],
      explanation: 'Gradient Field makes three upright stripes. Field Warp lets two Field Noise fields push them sideways and up and down by up to three pixels, so the stripes ripple like a flag in the wind.',
      preview: 'The {output} shows colourful vertical stripes rippling and waving.',
    }),
  },

  FieldRotate: {
    overview: [
      'Field Rotate turns a field about the centre: Angle sets a fixed turn and Spin keeps it turning. Pixels that leave one edge come back on the other.',
    ],
    inputs: {
      field: FIELD_IN,
    },
    outputs: { field: FIELD_OUT },
    example: example({
      featured: 'FieldRotate',
      title: 'A spinning pinwheel',
      nodes: {
        spokes: ['GradientField', { gradientType: 'angular', repeat: 6 }],
        spin: ['FieldRotate', { spin: 45 }],
        paint: ['FieldToFrame', { palette: 'party' }],
      },
      wires: ['spokes.field > spin.field', 'spin.field > paint.field'],
      output: RING(24),
      explanation: 'Gradient Field in angular mode, repeated six times, makes six spokes. Field Rotate spins them at 45° a second, and on an LED ring the spokes become colours racing round.',
      preview: 'The {output} shows six repeats of the party palette chasing round it.',
    }),
  },

  FieldTile: {
    overview: [
      'Field Tile shrinks a field and repeats it across the canvas, Tiles X by Tiles Y times — a wallpaper from any field.',
      'The field is shrunk by skipping pixels, so fine detail can drop out; a broad, simple field tiles best. For mirrored or rotated repeats, use Field Symmetry.',
    ],
    inputs: {
      field: FIELD_IN,
    },
    outputs: { field: FIELD_OUT },
    example: example({
      featured: 'FieldTile',
      title: 'A wallpaper of stars',
      nodes: {
        star: ['ShapeField', { shape: 'polygon', sides: 5, size: 0.35, softness: 0.05, rotation: 18 }],
        repeat: ['FieldTile', { tilesX: 3, tilesY: 3 }],
        paint: ['FieldToFrame', { palette: 'citrus' }],
      },
      wires: ['star.field > repeat.field', 'repeat.field > paint.field'],
      output: MATRIX(24, 24),
      explanation: 'Shape Field draws one pentagon, and Field Tile repeats it three across and three down, like a printed wallpaper.',
      preview: 'The {output} shows a 3×3 grid of citrus pentagons.',
    }),
  },

  FieldSymmetry: {
    overview: [
      'Field Symmetry repeats a field through one of nine wallpaper groups — ways to tile a plane with square or hexagonal symmetry using plain repeats, rotations, mirrors and glides.',
      'Anything becomes a pattern: noise becomes snowflakes, a dot becomes a lattice. Cells sets how many repeats fit across, and Spin turns the whole lattice.',
    ],
    inputs: {
      field: FIELD_IN,
    },
    outputs: { field: FIELD_OUT },
    example: example({
      featured: 'FieldSymmetry',
      title: 'Snowflakes from noise',
      nodes: {
        frost: ['FieldNoise', { speed: 0.2, scale: 0.5, octaves: 3 }],
        flake: ['FieldSymmetry', { group: 'p6m', cells: 1.5, spin: 6 }],
        paint: ['FieldToFrame', { palette: 'arctic' }],
      },
      wires: ['frost.field > flake.field', 'flake.field > paint.field'],
      output: MATRIX(32, 32),
      explanation: 'Field Noise is plain drifting cloud. Field Symmetry folds it through the p6m group — six-fold rotation with mirrors — so the cloud becomes a slowly changing snowflake lattice, which Field → Frame paints in arctic blues.',
      preview: 'The {output} shows icy six-fold patterns that slowly shift and turn.',
    }),
  },
}
