import { describe, it, expect } from 'vitest'
import { generateShowSketch, isPatternShow, buildPatternRenderers } from '../showGenerator'
import type { StudioNode, StudioEdge } from '../../state/graphStore'
import type { GroupRegistry } from '../../state/graphEvaluator'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}, inputs: unknown[] = [], outputs: unknown[] = []): StudioNode {
  return { id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'pattern', properties, inputs, outputs } } as unknown as StudioNode
}
const edge = (id: string, s: string, sh: string, t: string, th: string) =>
  ({ id, source: s, sourceHandle: sh, target: t, targetHandle: th } as unknown as StudioEdge)

function audioSource(id: string, providerType: 'MicInput' | 'LineInput', properties: Record<string, unknown>): StudioNode[] {
  const providerId = `${id}-provider`
  return [
    node(providerId, providerType, properties),
    node(id, 'Audio', { sourceId: providerId }),
  ]
}

describe('showGenerator', () => {
  const micBoard = node('board', 'Board', { profileId: 'espressif-esp32-s3-devkitc-1' })
  const groups = {
    g0: { nodes: [node('sc', 'SolidColor', { r: 0, g: 0, b: 255 }), node('go', 'GroupOutput')],
          edges: [edge('e', 'sc', 'frame', 'go', 'frame')] },
    g1: { nodes: [node('sc', 'SolidColor', { r: 255, g: 0, b: 0 }), node('go', 'GroupOutput')],
          edges: [edge('e', 'sc', 'frame', 'go', 'frame')] },
  }
  const nodes = [
    node('pc', 'PatternCollection', { patternIds: ['g0', 'g1'] }),
    node('pm', 'PatternSlideshow', { interval: 8, transitionSec: 1 }),
    node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5, chipset: 'WS2812B', colorOrder: 'GRB' }),
  ]
  const edges = [edge('e1', 'pc', 'patternset', 'pm', 'patternset'), edge('e2', 'pm', 'frame', 'out', 'frame')]

  it('detects a pattern show', () => {
    expect(isPatternShow(nodes, edges)).toBe(true)
    expect(isPatternShow([node('x', 'SolidColor')], [])).toBe(false)
    expect(isPatternShow([...nodes, node('stray', 'PatternSlideshow')], [])).toBe(false)
  })

  it('emits a render function per pattern and a controller', () => {
    const cpp = generateShowSketch(nodes, edges, groups)
    expect(cpp).toContain('#define PATTERN_COUNT 2')
    expect(cpp).toContain('#include <FastLED.h>\n\n// Explicit FastLED-typed declarations')
    expect(cpp).toContain('void compositeTransition(uint8_t type, CRGB* out, const CRGB* a, const CRGB* b, float tt);')
    expect(cpp).toContain('void render_p0(uint32_t ms)')
    expect(cpp).toContain('void render_p1(uint32_t ms)')
    expect(cpp).toContain('void renderPattern(uint8_t i, uint32_t ms)')
    expect(cpp).toContain('case 0: render_p0(ms); break;')
    expect(cpp).toContain('void setup()')
    expect(cpp).toContain('void loop()')
    // Transitions are composited via the shared 16-style helper, picking a
    // random style from the pool (crossfade-only pool → { 0 }).
    expect(cpp).toContain('void compositeTransition(uint8_t type, CRGB* out')
    expect(cpp).toContain('const uint8_t TRANS_POOL[] = { 0 };')
    expect(cpp).toContain('compositeTransition(transType, leds, showA, showB, p)')
    // Each pattern's body actually renders (the SolidColor fill reaches leds).
    expect(cpp).toMatch(/render_p0[\s\S]*CRGB\(0, 0, 255\)[\s\S]*?\n\}/)
  })

  it('holds a configured I2S amplifier quiet in a generated pattern show', () => {
    const amplifier = node('amp', 'Amplifier', {
      model: 'max98357a-i2s-amplifier',
      i2sBclk: 14,
      i2sLrc: 15,
      i2sDout: 16,
    })
    const cpp = generateShowSketch([...nodes, amplifier], edges, groups)

    expect(cpp).toContain('#define AMP_I2S_BCLK 14')
    expect(cpp).toContain('#define AMP_I2S_LRC  15')
    expect(cpp).toContain('#define AMP_I2S_DOUT 16')
    expect(cpp).toContain('pinMode(AMP_I2S_BCLK, OUTPUT); digitalWrite(AMP_I2S_BCLK, LOW);')
    expect(cpp.indexOf('pinMode(AMP_I2S_BCLK')).toBeLessThan(cpp.indexOf('FastLED.addLeds<'))
  })

  describe('HUB75 (docs/development/design/hub75-output.md)', () => {
    const hub75Out = node('out', 'MatrixOutput', { width: 8, height: 8, chipset: 'HUB75' })

    it('drives the DMA library instead of FastLED addLeds/show, still rendering patterns into leds', () => {
      const cpp = generateShowSketch([nodes[0], nodes[1], hub75Out], edges, groups)
      expect(cpp).toContain('#include <ESP32-HUB75-MatrixPanel-I2S-DMA.h>')
      expect(cpp).toContain('MatrixPanel_I2S_DMA *dma_display = nullptr;')
      expect(cpp).toContain('HUB75_I2S_CFG _hub75Cfg(8, 8, 1, _hub75Pins);')
      expect(cpp).toContain('dma_display = new MatrixPanel_I2S_DMA(_hub75Cfg);')
      expect(cpp).not.toContain('#define DATA_PIN')
      expect(cpp).not.toContain('FastLED.addLeds<')
      expect(cpp).not.toContain('FastLED.show();')
      // Pattern rendering, dispatch, and transition compositing are untouched —
      // still CRGB math into the shared `leds` buffer regardless of chipset.
      expect(cpp).toContain('void render_p0(uint32_t ms)')
      expect(cpp).toContain('compositeTransition(transType, leds, showA, showB, p)')
      expect(cpp).toContain('  for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {')
      expect(cpp).toContain('dma_display->drawPixelRGB888(_x, _y, _c.r, _c.g, _c.b);')
    })

    it('drives a single-row HUB75 panel chain via chain_length', () => {
      const chainedOut = node('out', 'MatrixOutput', { width: 24, height: 8, chipset: 'HUB75', layout: 'panels', tilesX: 3, tilesY: 1 })
      const cpp = generateShowSketch([nodes[0], nodes[1], chainedOut], edges, groups)
      expect(cpp).toContain('HUB75_I2S_CFG _hub75Cfg(8, 8, 3, _hub75Pins);')
    })

    it('remaps square-tile per-panel rotation through a HUB75 coord table', () => {
      const rotatedOut = node('out', 'MatrixOutput', {
        width: 16, height: 8, chipset: 'HUB75', layout: 'panels', tilesX: 2, tilesY: 1, tileRotations: '0,90',
      })
      const cpp = generateShowSketch([nodes[0], nodes[1], rotatedOut], edges, groups)
      expect(cpp).toContain('const uint16_t _hub75CoordMap[NUM_LEDS] PROGMEM = {')
      expect(cpp).toContain('dma_display->drawPixelRGB888(_hub75XY & 0xFF, _hub75XY >> 8, _c.r, _c.g, _c.b);')
    })

    it('drives a folded 2D HUB75 panel grid via VirtualMatrixPanel_T', () => {
      const gridOut = node('out', 'MatrixOutput', { width: 16, height: 16, chipset: 'HUB75', layout: 'panels', tilesX: 2, tilesY: 2 })
      const cpp = generateShowSketch([nodes[0], nodes[1], gridOut], edges, groups)
      expect(cpp).toContain('#include <ESP32-HUB75-VirtualMatrixPanel_T.hpp>')
      expect(cpp).toContain('HUB75_I2S_CFG _hub75Cfg(8, 8, 4, _hub75Pins);')
      expect(cpp).toContain('hub75Virtual = new VirtualMatrixPanel_T<CHAIN_TOP_LEFT_DOWN>(2, 2, 8, 8);')
      expect(cpp).toContain('hub75Virtual->drawPixelRGB888(_x, _y, _c.r, _c.g, _c.b);')
    })

    it('remaps rotated tiles before drawing into a folded 2D HUB75 virtual grid', () => {
      const gridOut = node('out', 'MatrixOutput', {
        width: 16, height: 16, chipset: 'HUB75', layout: 'panels', tilesX: 2, tilesY: 2, tileRotations: '0,90,180,270',
      })
      const cpp = generateShowSketch([nodes[0], nodes[1], gridOut], edges, groups)
      expect(cpp).toContain('const uint16_t _hub75CoordMap[NUM_LEDS] PROGMEM = {')
      expect(cpp).toContain('hub75Virtual->drawPixelRGB888(_hub75XY & 0xFF, _hub75XY >> 8, _c.r, _c.g, _c.b);')
    })
  })

  it('emits a fixed controller seed when the Show Engine seed is nonzero', () => {
    const seeded = [
      node('pc', 'PatternCollection', { patternIds: ['g0', 'g1'] }),
      node('pm', 'PatternSlideshow', { interval: 8, transitionSec: 1, seed: 77 }),
      node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5, chipset: 'WS2812B', colorOrder: 'GRB' }),
    ]
    const cpp = generateShowSketch(seeded, edges, groups)
    expect(cpp).toContain('random16_set_seed(77u);')
    expect(cpp).not.toContain('randomSeed(analogRead(A0));')
  })

  it('applies the MatrixOutput hardware settings to the controller sketch', () => {
    const out = node('out', 'MatrixOutput', {
      width: 8, height: 8, dataPin: 5, chipset: 'WS2812B', colorOrder: 'GRB',
      brightness: 64, correction: 'TypicalLEDStrip', dither: false, overclock: 1.2,
    })
    const cpp = generateShowSketch([nodes[0], nodes[1], out], edges, groups)
    expect(cpp).toContain('FastLED.setBrightness(64);')
    expect(cpp).toContain('FastLED.setCorrection(TypicalLEDStrip);')
    expect(cpp).toContain('FastLED.setDither(DISABLE_DITHER);')
    expect(cpp.indexOf('#define FASTLED_OVERCLOCK 1.2')).toBeLessThan(cpp.indexOf('#include <FastLED.h>'))
  })

  it('routes a show to multiple synchronized output controllers with Board-wide brightness', () => {
    const outA = node('out-a', 'MatrixOutput', { width: 8, height: 8, dataPin: 5, brightness: 80 })
    const outB = node('out-b', 'MatrixOutput', {
      width: 16, height: 4, dataPin: 12, clockPin: 13, chipset: 'APA102', colorOrder: 'BGR',
      brightness: 160, routeMode: 'crop', routeX: 2,
    })
    const multiNodes = [node('board', 'Board', { brightness: 80 }), nodes[0], nodes[1], outA, outB]
    const multiEdges = [
      edge('e1', 'pc', 'patternset', 'pm', 'patternset'),
      edge('e2', 'pm', 'frame', 'out-a', 'frame'),
      edge('e3', 'pm', 'frame', 'out-b', 'frame'),
    ]
    const cpp = generateShowSketch(multiNodes, multiEdges, groups)
    expect(cpp).toContain('CRGB leds_out_a[64];')
    expect(cpp).toContain('CRGB leds_out_b[64];')
    expect(cpp).toContain('FastLED.addLeds<WS2812B, DATA_PIN_out_a, GRB>(leds_out_a, 64)')
    expect(cpp).toContain('FastLED.addLeds<APA102, DATA_PIN_out_b, CLOCK_PIN_out_b, BGR>(leds_out_b, 64)')
    expect(cpp).toContain('_c.nscale8_video(80)')
    expect(cpp).not.toContain('_c.nscale8_video(160)')
    expect(cpp.match(/FastLED\.show\(\);/g)).toHaveLength(1)
  })

  it('declares FastLED-typed helpers explicitly so Arduino does not auto-prototype them above the include', () => {
    const tempGroups: GroupRegistry = {
      gt: {
        nodes: [
          node('t', 'Temperature', { kelvin: (3000 - 1000) / 11000 }, [], [{ id: 'color', dataType: 'color' }]),
          node('sp', 'Circle', {}, [{ id: 'edge', dataType: 'color' }], [{ id: 'frame', dataType: 'frame' }]),
          node('go', 'GroupOutput'),
        ],
        edges: [edge('e1', 't', 'color', 'sp', 'edge'), edge('e2', 'sp', 'frame', 'go', 'frame')],
      },
    }
    const tempNodes = [
      node('pc', 'PatternCollection', { patternIds: ['gt'] }),
      node('pm', 'PatternSlideshow', { interval: 8, transitionSec: 1 }),
      node('out', 'MatrixOutput', { width: 8, height: 8 }),
    ]
    const tempEdges = [edge('e1', 'pc', 'patternset', 'pm', 'patternset'), edge('e2', 'pm', 'frame', 'out', 'frame')]
    const cpp = generateShowSketch(tempNodes, tempEdges, tempGroups)
    expect(cpp).toContain('CRGB kelvinToRGB(float kelvin);')
    expect(cpp.indexOf('CRGB kelvinToRGB(float kelvin);')).toBeLessThan(cpp.indexOf('CRGB kelvinToRGB(float kelvin) {'))
  })

  it('hoists and prefixes baked image palettes inside collected patterns', () => {
    const image = { w: 2, h: 1, pixels: [255, 0, 0, 0, 0, 255] }
    const paletteGroups: GroupRegistry = {
      gp: {
        nodes: [
          node('img', 'Image', { image }, [], [
            { id: 'frame', dataType: 'frame' },
            { id: 'image', dataType: 'image' },
          ]),
          node('extract', 'PaletteFromImage', { count: 2 }, [
            { id: 'image', dataType: 'image' },
          ], [{ id: 'palette', dataType: 'palette' }]),
          node('noise', 'Noise', { noiseType: 'simplex' }, [
            { id: 'paletteIn', dataType: 'palette' },
          ], [{ id: 'frame', dataType: 'frame' }]),
          node('go', 'GroupOutput'),
        ],
        edges: [
          edge('e1', 'img', 'image', 'extract', 'image'),
          edge('e2', 'extract', 'palette', 'noise', 'paletteIn'),
          edge('e3', 'noise', 'frame', 'go', 'frame'),
        ],
      },
    }
    const renderers = buildPatternRenderers(['gp'], paletteGroups)
    expect(renderers.helpers.join('\n')).toContain('const CRGBPalette16 p0_pal_extract(')
    expect(renderers.functions[0]).toContain('ColorFromPalette(p0_pal_extract,')
  })

  it('moves show + pattern buffers to PSRAM when the MatrixOutput toggle is on', () => {
    const psNodes = [nodes[0], nodes[1], node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5, usePsram: true })]
    const cpp = generateShowSketch(psNodes, edges, groups)
    expect(cpp).toContain('CRGB leds[NUM_LEDS];')            // stays internal
    expect(cpp).toContain('CRGB* showA = nullptr;')
    expect(cpp).toContain('CRGB* p0_buf_sc = nullptr;')
    expect(cpp).toContain('showA = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);')
    expect(cpp).toContain('p0_buf_sc = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);')
    expect(cpp).toContain('void* _psAlloc(size_t n)')
    // The stale-toggle gate (board without PSRAM) falls back to static arrays.
    const noPs = generateShowSketch(psNodes, edges, groups, { psramAllowed: false })
    expect(noPs).toContain('CRGB p0_buf_sc[NUM_LEDS];')
    expect(noPs).not.toContain('_psAlloc')
  })

  it('hoists the Blur2D XYMap declaration out of pattern bodies (deduped)', () => {
    const blurGroups: GroupRegistry = {
      g0: { nodes: [node('bl', 'Blur2D', { amount: 0.5 }), node('go', 'GroupOutput')],
            edges: [edge('e', 'bl', 'frame', 'go', 'frame')] },
      g1: { nodes: [node('bl', 'Blur2D', { amount: 0.25 }), node('go', 'GroupOutput')],
            edges: [edge('e', 'bl', 'frame', 'go', 'frame')] },
    }
    const cpp = generateShowSketch(nodes, edges, blurGroups)
    expect(cpp).toContain('blur2d(p0_buf_bl, WIDTH, HEIGHT, (uint8_t)(constrain(0.5,0.0f,1.0f)*255.0f), _xyMap)')
    expect(cpp).toContain('blur2d(p1_buf_bl, WIDTH, HEIGHT, (uint8_t)(constrain(0.25,0.0f,1.0f)*255.0f), _xyMap)')
    // Declared once at file scope, not per pattern.
    expect(cpp.match(/fl::XYMap _xyMap =/g)).toHaveLength(1)
  })

  it('prefixes FrameFeedback\'s history buffer per pattern so same-id patterns don\'t collide', () => {
    // Two saved patterns whose FrameFeedback node happens to share the id
    // "fb" (plausible if both were authored from the same starter/duplicate).
    // Each pattern must get its own hoisted, uniquely-named ring buffer.
    const fbGroups: GroupRegistry = {
      g0: { nodes: [node('sc', 'SolidColor', { r: 255, g: 0, b: 0 }), node('fb', 'FrameFeedback', { delayFrames: 2 }), node('go', 'GroupOutput')],
            edges: [edge('e1', 'sc', 'frame', 'fb', 'frame'), edge('e2', 'fb', 'frame', 'go', 'frame')] },
      g1: { nodes: [node('sc', 'SolidColor', { r: 0, g: 255, b: 0 }), node('fb', 'FrameFeedback', { delayFrames: 3 }), node('go', 'GroupOutput')],
            edges: [edge('e1', 'sc', 'frame', 'fb', 'frame'), edge('e2', 'fb', 'frame', 'go', 'frame')] },
    }
    const r = buildPatternRenderers(['g0', 'g1'], fbGroups)
    expect(r.buffers).toContain('CRGB p0__fb_fb[3][NUM_LEDS];')
    expect(r.buffers).toContain('CRGB p1__fb_fb[4][NUM_LEDS];')
    expect(r.functions[0]).toContain('p0__fb_fb[')
    expect(r.functions[0]).not.toContain('p1__fb_fb[')
    expect(r.functions[1]).toContain('p1__fb_fb[')
    expect(r.functions[1]).not.toContain('p0__fb_fb[')
  })

  it('handles a Pattern Master with no patterns', () => {
    const lone = [node('pc', 'PatternCollection', { patternIds: [] }), node('pm', 'PatternSlideshow', {}), node('out', 'MatrixOutput', {})]
    const loneEdges = [edge('e1', 'pc', 'patternset', 'pm', 'patternset'), edge('e2', 'pm', 'frame', 'out', 'frame')]
    const cpp = generateShowSketch(lone, loneEdges, {})
    expect(cpp).toContain('no patterns')
    expect(cpp).toContain('void setup()')
    expect(cpp).toContain('void loop()')
  })

  it('preserves field buffers and FastLED formula shims used by collected patterns', () => {
    const fieldGroups = {
      gf: {
        nodes: [
          node('ff', 'FieldFormula', { formula: 'sin8(r * 200 + t) / 255' }),
          node('f2f', 'FieldToFrame'),
          node('go', 'GroupOutput'),
        ],
        edges: [edge('e1', 'ff', 'field', 'f2f', 'field'), edge('e2', 'f2f', 'frame', 'go', 'frame')],
      },
    } as unknown as GroupRegistry
    const r = buildPatternRenderers(['gf'], fieldGroups)
    expect(r.buffers).toContain('float p0_field_ff[NUM_LEDS];')
    expect(r.functions[0]).toContain('p0_field_ff[')
    expect(r.helpers.join('\n')).toContain('float _fsin8(float x)')
  })

  it('preserves Code-node file-scope declarations used by a collected pattern', () => {
    const codeGroups = {
      gc: {
        nodes: [
          node('code', 'Code', { globalCode: 'float patternGain = 0.5f;', code: 'fill_solid(leds, NUM_LEDS, CRGB((uint8_t)(255 * patternGain), 0, 0));' }),
          node('go', 'GroupOutput'),
        ],
        edges: [edge('e1', 'code', 'frame', 'go', 'frame')],
      },
    } as unknown as GroupRegistry
    const r = buildPatternRenderers(['gc'], codeGroups)
    expect(r.helpers.join('\n')).toContain('float patternGain = 0.5f;')
    expect(r.functions[0]).toContain('patternGain')
  })

  it('draws the transition pool from a wired TransitionSet (names → style ids)', () => {
    const withSet = [
      ...nodes,
      node('ts', 'TransitionSet', { transitions: ['iris', 'zoom'] }, [], [{ id: 'transitions', dataType: 'transitionset' }]),
    ]
    const withEdge = [...edges, edge('e3', 'ts', 'transitions', 'pm', 'transitions')]
    const cpp = generateShowSketch(withSet, withEdge, groups)
    expect(cpp).toContain('const uint8_t TRANS_POOL[] = { 3, 15 };')  // iris=3, zoom=15
    expect(cpp).toContain('transType = TRANS_POOL[random8(TRANS_POOL_N)];')
  })

  it('holds each pattern for the one interval it was given', () => {
    // One number, not a range. The randomised min/max dwell exists to keep a
    // beat-driven show from feeling metronomic, and a slideshow has no beat to
    // feel metronomic against — so there is no random16() call to pick one.
    const cpp = generateShowSketch(nodes, edges, groups)
    expect(cpp).toContain('if (now - phaseStart >= 8000) {')
    expect(cpp).not.toContain('random16(')
  })

  it('walks the collection in order when the slideshow says sequential', () => {
    const ordered = [
      node('pc', 'PatternCollection', { patternIds: ['g0', 'g1'] }),
      node('pm', 'PatternSlideshow', { interval: 8, transitionSec: 1, order: 'Sequential' }),
      node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5, chipset: 'WS2812B', colorOrder: 'GRB' }),
    ]
    const cpp = generateShowSketch(ordered, edges, groups)
    // Starts at the top of the list, then walks it: a slideshow whose order was
    // chosen deliberately should begin where the list does.
    expect(cpp).toContain('static uint8_t  cur = 0, nxt = 0, transType = 0;')
    expect(cpp).toContain('nxt = (cur + 1) % PATTERN_COUNT;')
    expect(cpp).not.toContain('random8(PATTERN_COUNT')

    // Random remains the default and picks anything except what is showing.
    const random = generateShowSketch(nodes, edges, groups)
    expect(random).toContain('static uint8_t  cur = random8(PATTERN_COUNT), nxt = 0, transType = 0;')
    expect(random).toContain('nxt = (cur + 1 + random8(PATTERN_COUNT - 1)) % PATTERN_COUNT;')
  })

  it('cuts rather than fades when transitions are switched off', () => {
    const cut = [
      node('pc', 'PatternCollection', { patternIds: ['g0', 'g1'] }),
      node('pm', 'PatternSlideshow', { interval: 8, transitionsEnabled: false, transitionSec: 1.5 }),
      node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5, chipset: 'WS2812B', colorOrder: 'GRB' }),
    ]
    // A zero-length transition is already a cut on both sides, so "off" needs
    // no second code path — it needs the duration the resolver reports.
    expect(generateShowSketch(cut, edges, groups)).toContain('float p = 0 > 0 ?')
  })

  it('has no beat advance and no particle overlay to emit', () => {
    // Both ride an audio beat, and both moved to the Music Player with the
    // music. A slideshow has no beat input to wire, and wiring Player
    // Particles at it changes nothing in the sketch.
    const particleFx = node('pfx', 'PlayerParticles', {
      enabled: true, style: 3, color: '#3366cc', intensity: 0.9,
    })
    const withMic = [...nodes, particleFx, micBoard,
      ...audioSource('mic', 'MicInput', { i2sWs: 39, i2sSck: 40, i2sSd: 41 })]
    const wire = [...edges, edge('efx', 'pfx', 'particleFx', 'pm', 'particleFx')]
    const cpp = generateShowSketch(withMic, wire, groups)

    expect(cpp).not.toContain('void particleOverlay(')
    expect(cpp).not.toContain('_audioBeat &&')
    // The audio engine itself stays: patterns inside the collection still read
    // the microphone when the slideshow is reactive.
    expect(cpp).toContain('void updateAudio()')
  })

  describe('buildPatternRenderers — group-input roles', () => {
    // A group whose brightness is driven by an `energy` GroupInput.
    const energyGroups = {
      ge: {
        nodes: [
          node('white', 'SolidColor', { r: 255, g: 255, b: 255 }, [], [{ id: 'frame', dataType: 'frame' }]),
          node('gi', 'GroupInput', { paramId: 'energy' }, [], [{ id: 'out', dataType: 'float' }]),
          node('bm', 'BrightnessMod', {}, [{ id: 'frame', dataType: 'frame' }, { id: 'brightness', dataType: 'float' }], [{ id: 'frame', dataType: 'frame' }]),
          node('go', 'GroupOutput', {}, [{ id: 'frame', dataType: 'frame' }], []),
        ],
        edges: [
          edge('e1', 'white', 'frame', 'bm', 'frame'),
          edge('e2', 'gi', 'out', 'bm', 'brightness'),
          edge('e3', 'bm', 'frame', 'go', 'frame'),
        ],
      },
    } as unknown as GroupRegistry

    it('threads role params into render_pN and resolves the GroupInput to the param', () => {
      const r = buildPatternRenderers(['ge'], energyGroups, ['energy'])
      expect(r.params).toEqual(['energy'])
      expect(r.functions[0]).toContain('void render_p0(uint32_t ms, float energy)')
      expect(r.functions[0]).toContain('= energy;')   // GroupInput → param
      const withAudio = buildPatternRenderers(['ge'], energyGroups, ['energy'], true)
      expect(withAudio.functions[0]).toContain('= energy;') // explicit show role wins over audio alias
    })

    it('strips group inputs and keeps the bare signature when roles are off', () => {
      const r = buildPatternRenderers(['ge'], energyGroups)
      expect(r.params).toEqual([])
      expect(r.functions[0]).toContain('void render_p0(uint32_t ms)')
      expect(r.functions[0]).not.toContain('float energy')
      expect(r.functions[0]).not.toContain('n_gi_out')
    })

    // A group whose brightness is driven by a `speed` GroupInput.
    const speedGroups = {
      gs: {
        nodes: [
          node('white', 'SolidColor', { r: 255, g: 255, b: 255 }, [], [{ id: 'frame', dataType: 'frame' }]),
          node('gi', 'GroupInput', { paramId: 'speed' }, [], [{ id: 'out', dataType: 'float' }]),
          node('bm', 'BrightnessMod', {}, [{ id: 'frame', dataType: 'frame' }, { id: 'brightness', dataType: 'float' }], [{ id: 'frame', dataType: 'frame' }]),
          node('go', 'GroupOutput', {}, [{ id: 'frame', dataType: 'frame' }], []),
        ],
        edges: [
          edge('e1', 'white', 'frame', 'bm', 'frame'),
          edge('e2', 'gi', 'out', 'bm', 'brightness'),
          edge('e3', 'bm', 'frame', 'go', 'frame'),
        ],
      },
    } as unknown as GroupRegistry

    it('threads energy + speed in order and resolves a speed GroupInput to the param', () => {
      const r = buildPatternRenderers(['gs'], speedGroups, ['energy', 'speed'])
      expect(r.params).toEqual(['energy', 'speed'])
      expect(r.functions[0]).toContain('void render_p0(uint32_t ms, float energy, float speed)')
      expect(r.functions[0]).toContain('= speed;')   // GroupInput → speed param
    })

    // A group whose Noise pattern is coloured by a `palette` GroupInput.
    const paletteGroups = {
      gp: {
        nodes: [
          node('noise', 'Noise', { noiseType: 'field', palette: 'rainbow' }, [{ id: 'paletteIn', dataType: 'palette' }], [{ id: 'frame', dataType: 'frame' }]),
          node('gi', 'GroupInput', { paramId: 'palette' }, [], [{ id: 'out', dataType: 'palette' }]),
          node('go', 'GroupOutput', {}, [{ id: 'frame', dataType: 'frame' }], []),
        ],
        edges: [
          edge('e1', 'gi', 'out', 'noise', 'paletteIn'),
          edge('e2', 'noise', 'frame', 'go', 'frame'),
        ],
      },
    } as unknown as GroupRegistry

    it('threads the palette role as a CRGBPalette16 param and resolves the GroupInput to pal_<id>', () => {
      const r = buildPatternRenderers(['gp'], paletteGroups, ['palette'])
      expect(r.params).toEqual(['palette'])
      expect(r.functions[0]).toContain('void render_p0(uint32_t ms, const CRGBPalette16& palette)')
      expect(r.functions[0]).toContain('CRGBPalette16 pal_gi = palette;')   // GroupInput → palette param
    })
  })

  describe('on-device mic audio in a generative show', () => {
    // A pattern whose BassPulse is driven by an in-group FFTAnalyzer.
    const audioGroups = {
      ga: {
        nodes: [
          node('audio', 'GroupInput', { paramId: 'audio' }, [], [{ id: 'out', dataType: 'audio' }]),
          node('fft', 'FFTAnalyzer', {}, [{ id: 'audio', dataType: 'audio' }], [{ id: 'bass', dataType: 'float' }]),
          node('bp', 'BassPulse', {}, [{ id: 'bass', dataType: 'float' }], [{ id: 'frame', dataType: 'frame' }]),
          node('go', 'GroupOutput'),
        ],
        edges: [
          edge('e0', 'audio', 'out', 'fft', 'audio'),
          edge('e1', 'fft', 'bass', 'bp', 'bass'),
          edge('e2', 'bp', 'frame', 'go', 'frame'),
        ],
      },
    } as unknown as GroupRegistry
    const showNodes = (withMic: boolean) => [
      node('pc', 'PatternCollection', { patternIds: ['ga'] }),
      node('pm', 'PatternSlideshow', { interval: 8, transitionSec: 1 }),
      node('out', 'MatrixOutput', { width: 8, height: 8 }),
      ...(withMic ? [micBoard, ...audioSource('mic', 'MicInput', { i2sWs: 39, i2sSck: 40, i2sSd: 41 })] : []),
    ]
    const showEdges = [edge('e1', 'pc', 'patternset', 'pm', 'patternset'), edge('e2', 'pm', 'frame', 'out', 'frame')]

    it('hosts the audio engine and makes patterns read the selected live microphone', () => {
      const cpp = generateShowSketch(showNodes(true), showEdges, audioGroups)
      expect(cpp).toContain('fl::audio::Config::CreateInmp441')
      expect(cpp).toContain('_audioProcessor = FastLED.add(config);')
      expect(cpp).not.toContain('#include <driver/i2s.h>')
      expect(cpp).toContain('void setupAudio()')
      expect(cpp).toContain('void updateAudio()')
      expect(cpp).toContain('setupAudio();')              // in setup()
      expect(cpp).toMatch(/void loop\(\) \{\n {2}updateAudio\(\);/)   // once per frame
      expect(cpp).toContain('_sum += _audioSpectrum[_i];') // render_p0 resamples the live spectrum
      expect(cpp).not.toContain('constrain(0.5f')         // not the placeholder
    })

    it('hosts PCM1802 capture for the same audio-reactive show path', () => {
      const cpp = generateShowSketch([
        ...showNodes(false),
        micBoard,
        ...audioSource('line', 'LineInput', {
          i2sMclk: 15,
          i2sBclk: 16,
          i2sLrclk: 17,
          i2sDout: 18,
          channel: 'Both',
        }),
      ], showEdges, audioGroups)

      expect(cpp).toContain('class StudioPcm1802Input')
      expect(cpp).toContain('#define LINE_IN_MCLK 15')
      expect(cpp).toContain('_lineInput = fl::make_shared<StudioPcm1802Input>();')
      expect(cpp).toContain('_audioProcessor = FastLED.add(_lineInput);')
      expect(cpp).toContain('_audioLeftLevel = _lineInput ? _lineInput->leftLevel() : 0.0f;')
      expect(cpp).toContain('_audioRightLevel = _lineInput ? _lineInput->rightLevel() : 0.0f;')
      expect(cpp).toContain('_sum += _audioSpectrum[_i];')
    })

    it('keeps audio silent when Audio has no selected source', () => {
      const cpp = generateShowSketch(showNodes(false), showEdges, audioGroups)
      expect(cpp).not.toContain('driver/i2s.h')
      expect(cpp).not.toContain('updateAudio()')
      expect(cpp).toContain('_sum += 0.0f;')              // no invented hardware signal
    })

    it('binds exposed audio GroupInputs to host audio bands', () => {
      const inputGroups = {
        gi: {
          nodes: [
            node('in', 'GroupInput', { paramId: 'bass' }, [], [{ id: 'out', dataType: 'float' }]),
            node('bp', 'BassPulse', {}, [{ id: 'bass', dataType: 'float' }], [{ id: 'frame', dataType: 'frame' }]),
            node('go', 'GroupOutput'),
          ],
          edges: [edge('e1', 'in', 'out', 'bp', 'bass'), edge('e2', 'bp', 'frame', 'go', 'frame')],
        },
      } as unknown as GroupRegistry
      const r = buildPatternRenderers(['gi'], inputGroups, [], true)
      expect(r.functions[0]).toContain('float n_in_out = _audioBass;')
    })

    it('lets the player bind a legacy beat GroupInput to its show beat pulse', () => {
      const inputGroups = {
        gi: {
          nodes: [
            node('in', 'GroupInput', { paramId: 'beat' }, [], [{ id: 'out', dataType: 'bool' }]),
            node('flash', 'BeatFlash', {}, [{ id: 'beat', dataType: 'bool' }], [{ id: 'frame', dataType: 'frame' }]),
            node('go', 'GroupOutput'),
          ],
          edges: [edge('e1', 'in', 'out', 'flash', 'beat'), edge('e2', 'flash', 'frame', 'go', 'frame')],
        },
      } as unknown as GroupRegistry
      const r = buildPatternRenderers(['gi'], inputGroups, [], true, { beat: '(flashLevel > 0.01f)' })
      expect(r.functions[0]).toContain('float n_in_out = (flashLevel > 0.01f);')
    })
  })
})

describe('show sketch output geometry', () => {
  const groups = {
    g0: { nodes: [node('sc', 'SolidColor', { r: 0, g: 0, b: 255 }), node('go', 'GroupOutput')],
          edges: [edge('e', 'sc', 'frame', 'go', 'frame')] },
  }
  const wiring = [edge('e1', 'pc', 'patternset', 'pm', 'patternset'), edge('e2', 'pm', 'frame', 'out', 'frame')]
  const show = (props: Record<string, unknown>) => generateShowSketch(
    [node('pc', 'PatternCollection', { patternIds: ['g0'] }), node('pm', 'PatternSlideshow', {}), node('out', 'MatrixOutput', props)],
    wiring, groups,
  )

  // `width`/`height` are the grid forms' properties. Reading them raw handed a
  // string the stale 16x16 defaults, so a show on a 60-LED run emitted
  // NUM_LEDS 256 and drove the wrong geometry off the end of the strip.
  it('takes a string its length, not the unused grid defaults', () => {
    const cpp = show({ form: 'strip', ledCount: 60, width: 16, height: 16, dataPin: 5 })
    expect(cpp).toContain('#define WIDTH    60')
    expect(cpp).toContain('#define HEIGHT   1')
  })

  it('still takes a matrix its grid', () => {
    const cpp = show({ form: 'matrix', width: 32, height: 8, dataPin: 5 })
    expect(cpp).toContain('#define WIDTH    32')
    expect(cpp).toContain('#define HEIGHT   8')
  })
})

describe('show sketch weight', () => {
  const groups = {
    g0: { nodes: [node('sc', 'SolidColor', { r: 0, g: 0, b: 255 }), node('go', 'GroupOutput')],
          edges: [edge('e', 'sc', 'frame', 'go', 'frame')] },
    g1: { nodes: [node('nz', 'Noise', { palette: 'ocean' }), node('go', 'GroupOutput')],
          edges: [edge('e', 'nz', 'frame', 'go', 'frame')] },
  }
  const master = node('pm', 'PatternSlideshow', {})
  const out = node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 })
  const wiring = [edge('e1', 'pc', 'patternset', 'pm', 'patternset'), edge('e2', 'pm', 'frame', 'out', 'frame')]
  const show = (patternIds: string[], extraNodes: StudioNode[] = [], extraEdges: StudioEdge[] = []) => generateShowSketch(
    [node('pc', 'PatternCollection', { patternIds }), master, out, ...extraNodes],
    [...wiring, ...extraEdges], groups,
  )

  // Palette declarations are non-const 48-byte globals, so the 29 unused ones
  // this used to emit were ~1.4KB of dead RAM.
  it('declares only the palettes the collected patterns name', () => {
    const cpp = show(['g0', 'g1'])
    expect(cpp).toContain('CRGBPalette16 paldef_ocean(')     // Noise samples it
    expect(cpp).not.toContain('CRGBPalette16 paldef_lava(')
    expect(cpp).not.toContain('CRGBPalette16 paldef_sunset(')
  })

  it('declares no palettes at all when no pattern samples one', () => {
    expect(show(['g0'])).not.toContain('CRGBPalette16 paldef_')
  })

  // `type` is a runtime value, so the compiler cannot drop the arms the pool
  // never selects — but the pool is baked as a const array at generation time.
  it('narrows the transition switch to the pool', () => {
    const cpp = show(['g0', 'g1'])
    expect(cpp).toContain('const uint8_t TRANS_POOL[] = { 0 };')
    expect(cpp).toContain('default: {  // crossfade (0)')
    expect(cpp).not.toContain('case 1: {  // wipe')
    expect(cpp).not.toContain('case 15: {  // zoom')
  })

  it('keeps exactly the styles a wired TransitionSet selects', () => {
    const set = node('ts', 'TransitionSet', { transitions: ['wipe', 'zoom'] })
    const cpp = show(['g0', 'g1'], [set], [edge('e3', 'ts', 'transitions', 'pm', 'transitions')])
    expect(cpp).toContain('case 1: {  // wipe')
    expect(cpp).toContain('case 15: {  // zoom')
    expect(cpp).toContain('default: {  // crossfade (0)')   // always the fallback arm
    expect(cpp).not.toContain('case 2: {  // dissolve')
    expect(cpp).not.toContain('case 11: {  // ripple')
  })

  // A collection of one never transitions: the guard was `PATTERN_COUNT > 1`,
  // so showA/showB, the pool and the compositing switch were all unreachable.
  it('omits the whole transition apparatus for a one-pattern collection', () => {
    const cpp = show(['g0'])
    expect(cpp).toContain('#define PATTERN_COUNT 1')
    expect(cpp).toContain('renderPattern(0, now);')
    expect(cpp).not.toContain('showA')
    expect(cpp).not.toContain('showB')
    expect(cpp).not.toContain('TRANS_POOL')
    expect(cpp).not.toContain('compositeTransition')
  })

  it('still emits it for two patterns', () => {
    const cpp = show(['g0', 'g1'])
    expect(cpp).toContain('CRGB showA[NUM_LEDS];   // outgoing pattern during a transition')
    expect(cpp).toContain('compositeTransition(transType, leds, showA, showB, p);')
  })
})

// The third generator to draw a display. Before this, a show controller with a
// panel on the bench was refused at validation — the graph could not be
// exported at all rather than exported with the part dark. What it draws is
// deliberately narrower than the SD player: a show is rotating patterns, not
// holding a file, so it answers for the pattern and for nothing musical.
describe('displays in a show controller', () => {
  const groups = {
    g0: { nodes: [node('sc', 'SolidColor', { r: 0, g: 0, b: 255 }), node('go', 'GroupOutput')],
      edges: [edge('e', 'sc', 'frame', 'go', 'frame')] },
    g1: { nodes: [node('sc', 'SolidColor', { r: 255, g: 0, b: 0 }), node('go', 'GroupOutput')],
      edges: [edge('e', 'sc', 'frame', 'go', 'frame')] },
  } as unknown as GroupRegistry
  const base = [
    node('pc', 'PatternCollection', { patternIds: ['g0', 'g1'] }),
    node('pm', 'PatternSlideshow', { interval: 8, transitionSec: 1 }),
    node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5, chipset: 'WS2812B', colorOrder: 'GRB' }),
  ]
  const baseEdges = [edge('e1', 'pc', 'patternset', 'pm', 'patternset'), edge('e2', 'pm', 'frame', 'out', 'frame')]

  const oled = node('oled', 'InfoDisplay', {
    partId: 'sh1106-oled-128x64', infoLayout: 'Status',
    csPin: 1, dcPin: 22, resetPin: 5, sckPin: 6, mosiPin: 7,
  })
  const segment = node('seg', 'SegmentDisplay', {
    partId: 'tm1637-4digit-display', clkPin: 32, dioPin: 33, brightness: 4,
  })
  const status = node('tft', 'TransportDisplay', {
    partId: 'st7789-tft-240x240', tftLayout: 'Show Status',
    csPin: 15, dcPin: 2, resetPin: 4, sckPin: 14, mosiPin: 13, backlightPin: 27,
  })
  const browser = node('brw', 'InfoDisplay', {
    partId: 'sh1106-oled-128x64', infoLayout: 'Pattern Browser',
    csPin: 1, dcPin: 22, resetPin: 5, sckPin: 6, mosiPin: 7,
  })

  const build = (extra: ReturnType<typeof node>[], extraEdges: ReturnType<typeof edge>[] = []) =>
    generateShowSketch([...base, ...extra], [...baseEdges, ...extraEdges], groups)

  it('emits nothing display-shaped for a show with no display', () => {
    const cpp = build([])
    expect(cpp).not.toContain('struct OledPanel')
    expect(cpp).not.toContain('struct TftPanel')
    expect(cpp).not.toContain('struct SegDisplay')
    expect(cpp).not.toContain('showPatternIndex')
  })

  it('builds each display family into the controller', () => {
    const cpp = build([oled, segment, status])
    expect(cpp).toContain('struct OledPanel {')
    expect(cpp).toContain('struct SegDisplay {')
    expect(cpp).toContain('struct TftPanel {')
    // Configured in setup, serviced in loop.
    expect(cpp).toContain('_oledBeginSpi(_oled_oled,')
    expect(cpp).toContain('_segBegin(_seg_seg,')
    expect(cpp).toContain('_tftBegin(_tft_tft,')
  })

  /*
   * A show controller has no music anywhere in it. The player accessors the SD
   * player falls back to (songTitle, songElapsedSec(), audio.getVolume()) do
   * not exist here, and reaching for one would fail on a line no generator
   * wrote — the failure mode this whole family of tests exists for.
   */
  it('never reaches for a player accessor it does not define', () => {
    const cpp = build([oled, status])
    for (const symbol of ['songTitle', 'songElapsedSec(', 'songProgress(', 'audio.getVolume(',
      'playerVolume', 'playerBrightness', 'changePlayerTrack']) {
      expect(cpp, `${symbol} has no definition in a show controller`).not.toContain(symbol)
    }
  })

  // The one thing a show genuinely knows, and it needs no wiring to say it.
  it('reports the running pattern from the show itself', () => {
    const cpp = build([status])
    expect(cpp).toContain('static uint8_t showPatternIndex = 0;')
    // Published where the show decides it, and read by the panel.
    expect(cpp).toContain('  showPatternIndex = cur;')
    expect(cpp).toContain('_tftWhole(showPatternIndex)')
    expect(cpp).toContain('_tftWhole(PATTERN_COUNT)')
  })

  // A collection of one never transitions, so the loop has no `cur` to read.
  it('holds the index at zero for a single-pattern show', () => {
    const single = [
      node('pc', 'PatternCollection', { patternIds: ['g0'] }),
      ...base.slice(1),
    ]
    const cpp = generateShowSketch([...single, status], baseEdges, groups)
    expect(cpp).toContain('static uint8_t showPatternIndex = 0;')
    expect(cpp).not.toContain('showPatternIndex = cur;')
  })

  /*
   * Pixels first. A 240x320 panel repaint is worth several LED frames of SPI
   * time and the acceptance gate for displays is no regression to wall-clock
   * LED timing, so the frame ships and the panels catch up in the slack.
   */
  it('flushes the panels after the frame has shipped', () => {
    const cpp = build([oled, status])
    const show = cpp.indexOf('FastLED.show();')
    const panel = cpp.indexOf('// Info Display')
    const delay = cpp.indexOf('FastLED.delay(16);')
    expect(show).toBeGreaterThan(-1)
    expect(panel).toBeGreaterThan(show)
    expect(delay).toBeGreaterThan(panel)
  })

  describe('the pattern browser', () => {
    const wire = edge('e3', 'pm', 'patternSelect', 'brw', 'patternSelect')

    it('carries the selection and the picture table on one stem', () => {
      const cpp = build([browser], [wire])
      expect(cpp).toContain('static PatternSel _sel_show;')
      expect(cpp).toContain('#define THUMB_COUNT_show')
      expect(cpp).toContain('  _selBegin(_sel_show);')
    })

    // Through the selection rather than around it, so the panel and the
    // pixels cannot disagree about which pattern is running.
    it('routes the show rotation through the same cursor', () => {
      const cpp = build([browser], [wire])
      expect(cpp).toContain('_selSetActive(_sel_show, PATTERN_COUNT, showPatternIndex);')
    })

    // The honest outcome for a browser whose collection was never baked: an
    // empty table and NO PATTERNS, not a blank square.
    it('emits an empty table when nothing was baked', () => {
      expect(build([browser], [wire])).toContain('#define THUMB_COUNT_show  0')
    })

    it('leaves the selection out of a show that has no use for one', () => {
      const cpp = build([oled])
      expect(cpp).not.toContain('struct PatternSel')
      expect(cpp).not.toContain('_sel_show')
    })
  })
})
