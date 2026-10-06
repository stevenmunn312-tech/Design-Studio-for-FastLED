// Code pattern node definitions: ports, default properties, sidebar
// placement and Help descriptions. src/state/nodeLibrary.ts merges every
// category's definitions into NODE_LIBRARY in sidebar order.
import type { NodeDefinition } from '../../types'

export const CODE_DEFINITIONS: NodeDefinition[] = [

  // ── Custom Formula ────────────────────────────────────────────────────
  {
    type: 'CustomFormula',
    label: 'Custom Formula',
    category: 'pattern',
    subcategory: 'Code',
    inputs: [
      { id: 'a', label: 'A', dataType: 'float' },
      { id: 'b', label: 'B', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    propertyInputs: { a: 'a', b: 'b', palette: 'paletteIn' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { formula: 'sin(x*6+t)*0.5+0.5', a: 0, b: 0, palette: 'rainbow' },
  },
  {
    // Paste raw FastLED C++ (a loop body that writes into leds[]). The text is
    // emitted verbatim into the sketch; the live preview approximates it via a
    // lightweight C++→JS shim. See docs/design/code-node.md.
    type: 'Code',
    label: 'Code',
    category: 'pattern',
    subcategory: 'Code',
    inputs: [
      // Optional: seed leds[] from an upstream frame (e.g. to fadeToBlackBy it).
      { id: 'frame', label: 'Frame', dataType: 'frame' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {
      // File-scope: persistent vars, palettes, helper functions. Emitted above
      // setup()/loop() in the sketch; runs each frame in the preview.
      globalCode: '',
      // The loop() body — runs every frame, writes into leds[].
      code: [
        'fadeToBlackBy(leds, NUM_LEDS, 20);',
        'uint8_t dothue = 0;',
        'for (int i = 0; i < 8; i++) {',
        '  leds[beatsin16(i + 7, 0, NUM_LEDS - 1)] |= CHSV(dothue, 200, 255);',
        '  dothue += 32;',
        '}',
      ].join('\n'),
    },
  },
]

export const CODE_DESCRIPTIONS: Record<string, string> = {
  CustomFormula: 'Per-pixel JS expression f(x, y, t) — with cx/cy/r/angle and FastLED shims.',
  Code: 'Paste raw FastLED C++ that writes into leds[].',
}
