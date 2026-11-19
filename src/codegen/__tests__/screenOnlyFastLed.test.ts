import { describe, expect, it } from 'vitest'
import { NODE_LIBRARY, libraryDefaults } from '../../state/nodeLibrary'
import { addDisplayWidget, createDisplayDocument } from '../../state/displays/displayEditor'
import { generateCpp, withoutUnusedFastLed } from '../cppGenerator'
import type { StudioNode } from '../../state/graphStore'

/**
 * A sketch that never draws an LED does not carry FastLED.
 *
 * `#include <FastLED.h>` is the expensive half: arduino-cli compiles every
 * source file in a library folder whether the sketch uses it or not, so a
 * screen-only build paid for the whole of FastLED for nothing but frame
 * pacing. The include is dropped from what the generator
 * actually emitted rather than from a list of features that imply FastLED,
 * so this holds the two ends of that: gone when nothing draws pixels, kept
 * the moment anything does.
 */

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category: definition?.category ?? 'output',
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
    },
  } as StudioNode
}


function sketch(withOutput: boolean): string {
  let document = createDisplayDocument('Display-1', 320, 240)
  document = addDisplayWidget(document, 'Text')
  document.widgets[0].label = 'Left Top'
  const nodes = [
    node('board', 'Board'),
    node('panel', 'TransportDisplay', {
      partId: 'st7789v-xpt2046-touch-240x320', tftRotation: '90', tftLayout: 'Custom design', displayId: 'Display-1',
      sckPin: 1, mosiPin: 2, misoPin: 8, csPin: 4, dcPin: 5, resetPin: 6, backlightPin: 7,
    }),
    ...(withOutput ? [node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 10 })] : []),
  ]
  return generateCpp(nodes, [], {}, {
    displayDocuments: { 'Display-1': document },
  } as never)
}

describe('FastLED in a screen-only sketch', () => {
  it('leaves FastLED out when nothing draws an LED', () => {
    const code = sketch(false)
    expect(code).not.toContain('#include <FastLED.h>')
    expect(code).not.toContain('FastLED')
    // Still paced: the loop needs a frame budget whether or not FastLED
    // supplies it, and LVGL's own service gate rides on top of this. The
    // pacing then only sleeps, since there is no send to refresh.
    expect(code).toContain('  _paceFrame(16667);  // ~60 fps')
    expect(code).toContain('void _paceFrame(uint32_t periodUs) {')
    expect(code).not.toContain('_paceSendUs')
  })

  it('keeps FastLED the moment an LED output exists', () => {
    const code = sketch(true)
    expect(code).toContain('#include <FastLED.h>')
    expect(code).toContain('  _paceFrame(16667);  // ~60 fps')
    expect(code).toContain('_paceSendUs')
    expect(code).toContain('FastLED.addLeds')
  })

  it('still builds a complete screen either way', () => {
    // The trim must not take the display half with it.
    for (const code of [sketch(false), sketch(true)]) {
      expect(code).toContain('lv_init();')
      expect(code).toContain('lv_screen_load(')
      expect(code).toContain('_cdServiceLvgl();')
    }
  })
})

describe('withoutUnusedFastLed', () => {
  const sketchWith = (line: string) => withoutUnusedFastLed(['#include <FastLED.h>', 'void loop() {', line, '}'])

  it.each([
    '  uint8_t r = random8();',
    '  uint16_t r = random16(100);',
    '  uint8_t e = ease8InOutQuad(x);',
    '  uint8_t s = sin8(t);',
    '  int16_t s = sin16(t);',
    '  uint8_t c = cos8(t);',
    '  uint8_t w = triwave8(t);',
    '  uint8_t l = lerp8by8(a, b, f);',
    '  int m = fl::max(a, b);',
    '  fl::i16 v = 0;',
  ])('keeps the include for %s', (line) => {
    expect(sketchWith(line)).toContain('#include <FastLED.h>')
  })

  it('drops it when nothing names FastLED', () => {
    expect(sketchWith('  delay(1);')).not.toContain('#include <FastLED.h>')
  })
})
