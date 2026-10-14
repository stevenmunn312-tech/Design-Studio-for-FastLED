// Colour and palette node definitions: ports, default properties, sidebar
// placement and Help descriptions. src/state/nodeLibrary.ts merges every
// category's definitions into NODE_LIBRARY in sidebar order.
import type { NodeDefinition } from '../../types'
import { PALETTE_BANK_BLEND_DEFAULT } from '../../state/palettes/paletteBank'

export const COLOR_DEFINITIONS: NodeDefinition[] = [
  {
    type: 'GradientSampler',
    label: 'Gradient Sampler',
    category: 'color',
    subcategory: 'Palettes',
    inputs: [
      { id: 't', label: 'T (0–1)', dataType: 'float' },
      { id: 'colorA', label: 'Color A', dataType: 'color' },
      { id: 'colorB', label: 'Color B', dataType: 'color' },
      { id: 'rA', label: 'R (A)', dataType: 'float' },
      { id: 'gA', label: 'G (A)', dataType: 'float' },
      { id: 'bA', label: 'B (A)', dataType: 'float' },
      { id: 'rB', label: 'R (B)', dataType: 'float' },
      { id: 'gB', label: 'G (B)', dataType: 'float' },
      { id: 'bB', label: 'B (B)', dataType: 'float' },
    ],
    propertyInputs: {
      t: 't', rA: 'rA', gA: 'gA', bA: 'bA', rB: 'rB', gB: 'gB', bB: 'bB',
    },
    defaultExposedInputs: ['t'],
    outputs: [{ id: 'color', label: 'Color', dataType: 'color' }],
    defaultProperties: { t: 0, rA: 0, gA: 200, bA: 255, rB: 255, gB: 0, bB: 255, mixMode: 'rgb' },
  },
  {
    type: 'PaletteSampler',
    label: 'Palette Sampler',
    category: 'color',
    subcategory: 'Palettes',
    inputs: [
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
      { id: 't', label: 'T (0–1)', dataType: 'float' },
    ],
    outputs: [{ id: 'color', label: 'Color', dataType: 'color' }],
    propertyInputs: { t: 't' },
    defaultExposedInputs: ['t'],
    defaultProperties: { palette: 'rainbow', t: 0 },
  },
  {
    // Self-contained palette oscillator. `rate` is a complete start→end→start
    // round trip per second; easing shapes each half without changing its period.
    type: 'PaletteSweep',
    label: 'Palette Sweep',
    category: 'color',
    subcategory: 'Palettes',
    inputs: [
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
      { id: 'rate', label: 'Rate (cycles/s)', dataType: 'float' },
    ],
    outputs: [{ id: 'color', label: 'Color', dataType: 'color' }],
    propertyInputs: { rate: 'rate' },
    defaultExposedInputs: ['rate'],
    defaultProperties: { palette: 'rainbow', rate: 0.1, easing: 'sine' },
  },

  // ── Color ──────────────────────────────────────────────────────────────
  {
    // A picked colour with no input: the swatch is the node. The hex property
    // draws as a colour input, as Shape's fill does.
    type: 'Color',
    label: 'Color',
    category: 'color',
    subcategory: 'Colors',
    inputs: [],
    outputs: [{ id: 'color', label: 'Color', dataType: 'color' }],
    defaultProperties: { color: '#ff3080' },
  },
  {
    // Free-running hue-wheel source. `rate` is full hue cycles per second;
    // saturation/value stay available as animatable inputs for live shaping.
    type: 'HueCycle',
    label: 'Hue Cycle',
    category: 'color',
    subcategory: 'Colors',
    inputs: [
      { id: 'rate', label: 'Rate (cycles/s)', dataType: 'float' },
      { id: 's', label: 'Saturation', dataType: 'float' },
      { id: 'v', label: 'Value', dataType: 'float' },
    ],
    outputs: [{ id: 'color', label: 'Color', dataType: 'color' }],
    propertyInputs: { rate: 'rate', s: 's', v: 'v' },
    defaultExposedInputs: ['rate', 's', 'v'],
    defaultProperties: { rate: 0.1, s: 1, v: 1 },
  },
  {
    type: 'HSVToRGB',
    label: 'HSV → RGB',
    category: 'color',
    subcategory: 'Colors',
    // `hueUnits` reads Hue as degrees (0–360) or as a FastLED byte (0–255),
    // which is what CHSV took before it folded in here. Sat and Val are 0–1.
    inputs: [
      { id: 'h', label: 'Hue', dataType: 'float' },
      { id: 's', label: 'Sat (0–1)', dataType: 'float' },
      { id: 'v', label: 'Val (0–1)', dataType: 'float' },
    ],
    outputs: [{ id: 'color', label: 'Color', dataType: 'color' }],
    propertyInputs: { h: 'h', s: 's', v: 'v' },
    defaultExposedInputs: ['h', 's', 'v'],
    defaultProperties: { hueUnits: 'degrees', h: 0, s: 1, v: 1 },
  },
  {
    // The inverse of HSV → RGB — extracts hue/sat/val from a connected color
    // (e.g. to read the hue out of a sampled palette color or a PaletteSampler).
    type: 'RGBToHSV',
    label: 'RGB → HSV',
    category: 'color',
    subcategory: 'Colors',
    inputs: [
      { id: 'rgb', label: 'Color', dataType: 'color' },
      { id: 'r', label: 'R', dataType: 'float' },
      { id: 'g', label: 'G', dataType: 'float' },
      { id: 'b', label: 'B', dataType: 'float' },
    ],
    propertyInputs: {
      r: 'r', g: 'g', b: 'b',
    },
    outputs: [
      { id: 'h', label: 'H (0–360)', dataType: 'float' },
      { id: 's', label: 'S (0–1)', dataType: 'float' },
      { id: 'v', label: 'V (0–1)', dataType: 'float' },
    ],
    defaultProperties: { r: 0, g: 0, b: 0 },
  },
  {
    // Black-body white point from a normalized warm→cool temperature control.
    type: 'Temperature',
    label: 'Color Temperature',
    category: 'color',
    subcategory: 'Colors',
    inputs: [{ id: 'warmth', label: 'Warmth', dataType: 'float' }],
    outputs: [{ id: 'color', label: 'Color', dataType: 'color' }],
    propertyInputs: { warmth: 'warmth' },
    defaultExposedInputs: ['warmth'],
    defaultProperties: { warmth: 0.27 },
  },
  {
    // FastLED HeatColor — a 0–1 heat value → black-body ramp (black→red→yellow→white).
    type: 'HeatColor',
    label: 'Heat Color',
    category: 'color',
    subcategory: 'Colors',
    inputs: [{ id: 'heat', label: 'Heat', dataType: 'float' }],
    outputs: [{ id: 'color', label: 'Color', dataType: 'color' }],
    propertyInputs: { heat: 'heat' },
    defaultExposedInputs: ['heat'],
    defaultProperties: { heat: 0.5 },
  },
  {
    type: 'PaletteSelector',
    label: 'Palette Selector',
    category: 'color',
    subcategory: 'Palettes',
    inputs: [],
    outputs: [{ id: 'palette', label: 'Palette', dataType: 'palette' }],
    defaultProperties: { palette: 'rainbow' },
  },
  {
    // Builds a palette from up to four connected colors (in order).
    type: 'CustomPalette',
    label: 'Custom Palette',
    category: 'color',
    subcategory: 'Palettes',
    inputs: [
      { id: 'color0', label: 'Color 1', dataType: 'color' },
      { id: 'color1', label: 'Color 2', dataType: 'color' },
      { id: 'color2', label: 'Color 3', dataType: 'color' },
      { id: 'color3', label: 'Color 4', dataType: 'color' },
    ],
    outputs: [{ id: 'palette', label: 'Palette', dataType: 'palette' }],
    defaultProperties: {},
  },
  {
    // Extracts representative colours from the raw upload retained by Image.
    // This consumes image data rather than a rendered frame, so firmware can
    // bake the same palette as the preview with no per-frame extraction cost.
    type: 'PaletteFromImage',
    label: 'Palette from Image',
    category: 'color',
    subcategory: 'Palettes',
    inputs: [{ id: 'image', label: 'Image', dataType: 'image' }],
    outputs: [{ id: 'palette', label: 'Palette', dataType: 'palette' }],
    defaultProperties: { count: 6 },
  },
  {
    // Polar-interpolated palette between two or three anchor colours (poline).
    type: 'Poline',
    label: 'Poline Palette',
    category: 'color',
    subcategory: 'Palettes',
    inputs: [
      { id: 'colorA', label: 'Anchor A', dataType: 'color' },
      { id: 'colorB', label: 'Anchor B', dataType: 'color' },
      { id: 'colorC', label: 'Anchor C', dataType: 'color' },
    ],
    outputs: [{ id: 'palette', label: 'Palette', dataType: 'palette' }],
    defaultProperties: { anchorA: '#1020ff', anchorB: '#ff20a0', anchorC: '#20ffd0', points: 4, position: 'sinusoidal' },
  },
  {
    // A palette built from a colour-wheel harmony around a base hue. A builder,
    // like Poline: it names no preset, so it carries no `palette` property.
    type: 'HarmonyPalette',
    label: 'Harmony Palette',
    category: 'color',
    subcategory: 'Palettes',
    inputs: [
      { id: 'hue', label: 'Hue', dataType: 'float' },
      { id: 'saturation', label: 'Saturation', dataType: 'float' },
      { id: 'value', label: 'Value', dataType: 'float' },
      { id: 'spread', label: 'Spread', dataType: 'float' },
    ],
    propertyInputs: { hue: 'hue', saturation: 'saturation', value: 'value', spread: 'spread' },
    outputs: [{ id: 'palette', label: 'Palette', dataType: 'palette' }],
    defaultProperties: { hue: 200, harmony: 'triadic', saturation: 1, value: 1, spread: 1 },
  },
  {
    type: 'PaletteBlend',
    label: 'Blend Palettes',
    category: 'color',
    subcategory: 'Palettes',
    inputs: [
      { id: 'paletteA', label: 'Palette A', dataType: 'palette' },
      { id: 'paletteB', label: 'Palette B', dataType: 'palette' },
      { id: 'amount', label: 'Amount', dataType: 'float' },
    ],
    outputs: [{ id: 'palette', label: 'Palette', dataType: 'palette' }],
    propertyInputs: { amount: 'amount' },
    defaultExposedInputs: ['amount'],
    defaultProperties: { paletteA: 'rainbow', paletteB: 'ocean', amount: 0.5 },
  },
  {
    // Reverse, rotate or dim any palette on its way to a pattern: a wired
    // Offset scrolls the colours round, Brightness scales every entry. A
    // builder (no `palette` property), so it emits its own CRGBPalette16.
    type: 'PaletteTransform',
    label: 'Palette Transform',
    category: 'color',
    subcategory: 'Palettes',
    inputs: [
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
      { id: 'offset', label: 'Offset', dataType: 'float' },
      { id: 'brightness', label: 'Brightness', dataType: 'float' },
    ],
    outputs: [{ id: 'palette', label: 'Palette', dataType: 'palette' }],
    propertyInputs: { offset: 'offset', brightness: 'brightness' },
    defaultExposedInputs: ['offset'],
    defaultProperties: { reverse: false, offset: 0, brightness: 1 },
  },
  {
    // An ordered bank of presets the author ships, stepped by Next/Previous and
    // wrapping at both ends — the palette answer to Pattern Collection.
    //
    // A *builder*, not a selector: it carries no `palette` property, so
    // `PALETTE_BUILDER_NODE_TYPES` derives that on its own and downstream nodes
    // reference its generated `pal_<id>` rather than one preset constant. That
    // is what makes the bank cost what it holds — the generator names only the
    // presets ticked here, and `customPaletteDeclarationsCpp` declares only the
    // palettes a sketch names, at 48 bytes of RAM each.
    type: 'PaletteBank',
    label: 'Palette Bank',
    category: 'color',
    subcategory: 'Palettes',
    inputs: [
      { id: 'next', label: 'Next', dataType: 'bool' },
      { id: 'previous', label: 'Previous', dataType: 'bool' },
    ],
    // A press, not a value — so a touch control minted on one of these is a
    // momentary Button rather than a latch. Declaring them here is what makes
    // the Touch node's add-control socket able to land on them at all;
    // `controllableInputsFor` reaches a port through a backing property or
    // through this list, and Next has no property behind it to find.
    actionInputs: ['next', 'previous'],
    // Declaring an action input takes the socket out of the always-drawn rows,
    // so both are exposed by default and the node looks exactly as it did.
    defaultExposedInputs: ['next', 'previous'],
    outputs: [
      { id: 'palette', label: 'Palette', dataType: 'palette' },
      { id: 'name', label: 'Name', dataType: 'string' },
      { id: 'index', label: 'Index', dataType: 'float' },
    ],
    // `blend` eases a change of palette in with FastLED's
    // nblendPaletteTowardPalette; 0 cuts straight across.
    defaultProperties: { palettes: [], blend: PALETTE_BANK_BLEND_DEFAULT },
  },
]

export const COLOR_DESCRIPTIONS: Record<string, string> = {
  GradientSampler: 'Samples a two-color gradient at t.',
  PaletteSampler: 'Samples a palette at t to a color.',
  PaletteSweep: 'Sweeps back and forth through a palette at a set rate and easing.',
  // color
  Color: 'A picked colour as a wireable Color output.',
  HueCycle: 'Cycles around the hue wheel at a rate measured in cycles per second.',
  HSVToRGB: 'Converts hue/sat/val to an RGB color; hue in degrees or as a FastLED 0–255 byte.',
  RGBToHSV: 'Converts an RGB color to hue/sat/val.',
  Temperature: 'White point from a 0–1 warmth control: candle at 0, blue sky at 1.',
  HeatColor: 'FastLED HeatColor — a 0–1 heat value to a fire-ramp colour.',
  PaletteSelector: 'Outputs a named preset palette.',
  CustomPalette: 'Builds a palette from up to four colors.',
  PaletteFromImage: 'Extracts dominant colours from an uploaded Image into a 16-stop palette.',
  Poline: 'Smooth poline palette between up to three anchor colours.',
  HarmonyPalette: 'Palette of colour-wheel harmony hues around a base hue.',
  PaletteBlend: 'Interpolates between two palettes.',
  PaletteTransform: 'Reverses, rotates or dims a palette on its way to a pattern.',
  PaletteBank: 'An ordered bank of palettes Next/Previous steps through, blending between them.',
}
