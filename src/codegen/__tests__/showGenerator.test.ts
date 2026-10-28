import { describe, it, expect } from 'vitest'
import { generateShowSketch, isPatternShow, buildPatternRenderers } from '../showGenerator'
import { generateCpp, PHI_DEFINE_CPP } from '../cppGenerator'
import { flattenSketchBundle, splitSketchBundle } from '../sketchBundle'
import { LATTICE_HELPER_CPP } from '../helpers/latticeHelperCpp'
import { FRAME_SAMPLE_HELPER_CPP } from '../helpers/frameSampleHelperCpp'
import { SYMMETRY_HELPER_CPP } from '../helpers/symmetryHelperCpp'
import { ATAN16_HELPER_CPP } from '../../nodes/shared/integerPatterns'
import { POLINE_HELPER_CPP } from '../helpers/polineHelperCpp'
import { NODE_LIBRARY, libraryDefaults, propertyMeta } from '../../state/nodeLibrary'
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

  it.each([
    ['FrameWarp', [...FRAME_SAMPLE_HELPER_CPP.matchAll(/^static inline \S+ (\w+)\(/gm)].map((match) => match[1])],
    ['Symmetry', ['_wallpaperSourceQ8', '_atan2_16']],
  ])('emits one sampler for %s patterns with and without transitions', (type, samplers) => {
    const pattern = {
      nodes: [node('src', 'Noise'), node('fx', type), node('go', 'GroupOutput')],
      edges: [edge('in', 'src', 'frame', 'fx', 'frame'), edge('out', 'fx', 'frame', 'go', 'frame')],
    }
    for (const patternIds of [['g0'], ['g0', 'g1']]) {
      const showNodes = nodes.map((n) => n.id === 'pc' ? node('pc', 'PatternCollection', { patternIds }) : n)
      const cpp = generateShowSketch(showNodes, edges, { g0: pattern, g1: pattern } as unknown as GroupRegistry)
      expect(cpp).toContain('void render_p0(')
      expect(cpp.includes('void render_p1(')).toBe(patternIds.length > 1)
      expect(/^void compositeTransition\([^\n]+\) \{/m.test(cpp)).toBe(patternIds.length > 1)
      // Each sampler is defined at most once, and only when a pattern uses it;
      // the frame sampler's names are derived so additions to its block are
      // covered. By name: a parameter a constant decides is folded out of the
      // signature.
      const definitions = (name: string) => cpp.match(new RegExp(`^static (?:inline )?\\S+ ${name}\\(`, 'gm'))?.length ?? 0
      expect(samplers.some((name) => definitions(name) === 1)).toBe(true)
      for (const name of samplers) expect(definitions(name)).toBeLessThanOrEqual(1)
    }
  })

  it('detects a pattern show', () => {
    expect(isPatternShow(nodes, edges)).toBe(true)
    expect(isPatternShow([node('x', 'SolidColor')], [])).toBe(false)
    expect(isPatternShow([...nodes, node('stray', 'PatternSlideshow')], [])).toBe(false)
  })

  it('generates the slideshow selected by the shared build plan in a mixed graph', () => {
    const mixedNodes = [
      node('stray', 'PatternSlideshow'),
      node('stray-out', 'MatrixOutput', { width: 4, height: 4, dataPin: 3 }),
      ...nodes,
      node('btn', 'ButtonInput', { pin: 12 }),
      node('ctl', 'ControlMap', { controls: ['patternNext'] }),
    ]
    const mixedEdges = [
      edge('stray-frame', 'stray', 'frame', 'stray-out', 'frame'),
      ...edges,
      edge('press', 'btn', 'pressed', 'ctl', 'patternNext'),
      edge('command', 'ctl', 'controls', 'pm', 'controls'),
    ]

    const cpp = generateShowSketch(mixedNodes, mixedEdges, groups)
    expect(cpp).toContain('#define PATTERN_COUNT 2')
    expect(cpp).toContain('n_ctl_controls.patternSteps += 1;')
    expect(cpp).toContain('#define DATA_PIN 5')
    expect(cpp).not.toContain('#define DATA_PIN 3')
  })

  // An unwired port means the field beside it here exactly as it does in a
  // normal sketch, so how bright a fixture runs cannot depend on which engine
  // the graph happens to build.
  it('honours an LED output dialled down on its own field', () => {
    const dimmed = [nodes[0], nodes[1], node('out', 'MatrixOutput',
      { width: 8, height: 8, dataPin: 5, chipset: 'WS2812B', colorOrder: 'GRB', outputBrightness: 0.5 })]
    expect(generateShowSketch(dimmed, edges, groups)).toContain('constrain(0.500f, 0.0f, 1.0f)')
    expect(generateShowSketch(nodes, edges, groups)).not.toContain('LED output run-time controls')
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
    // Transitions are composited via the shared 21-style helper. A
    // crossfade-only pool has nothing to draw from, so the style is fixed.
    expect(cpp).toContain('void compositeTransition(uint8_t type, CRGB* out')
    expect(cpp).not.toContain('TRANS_POOL')
    expect(cpp).toContain('compositeTransition(0, leds, showA, showB, p)')
    expect(cpp).toContain('compositeTransition(0, leds, showA, showB, p)')
    // Each pattern's body actually renders (the SolidColor fill reaches leds).
    expect(cpp).toMatch(/render_p0[\s\S]*CRGB\(0, 0, 255\)[\s\S]*?\n\}/)
  })

  it('fades an audio-reactive slideshow to true black during silence', () => {
    const reactiveNodes = [
      node('pc', 'PatternCollection', { patternIds: ['g0', 'g1'] }),
      node('pm', 'PatternSlideshow', { minTime: 8, maxTime: 8, transitionSec: 1, audioReactive: true }),
      node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5, chipset: 'WS2812B', colorOrder: 'GRB' }),
      micBoard,
      ...audioSource('mic', 'MicInput', { i2sWs: 39, i2sSck: 40, i2sSd: 41 }),
    ]
    const reactiveEdges = [
      edge('e1', 'pc', 'patternset', 'pm', 'patternset'),
      edge('e2', 'pm', 'frame', 'out', 'frame'),
      edge('ea', 'mic', 'audio', 'pm', 'audio'),
    ]
    const cpp = generateShowSketch(reactiveNodes, reactiveEdges, groups)

    expect(cpp).toContain('float _slideshowEnergy = constrain((_audioBass + _audioMids + _audioTreble) / 3.0f')
    expect(cpp).toContain('float _slideshowFadeTarget = _slideshowEnergy <= 0.025f ? 0.0f : 1.0f;')
    expect(cpp).toContain('if (_slideshowFade8 == 0) fill_solid(leds, NUM_LEDS, CRGB::Black);')
    expect(cpp).toContain('leds[_i].nscale8_video(_slideshowFade8);')

    const nonReactive = generateShowSketch(nodes, edges, groups)
    expect(nonReactive).not.toContain('_slideshowFadeTarget')
  })

  it('scales only the pattern animation clock with Master Speed', () => {
    const cpp = generateShowSketch(
      [...nodes, node('speed', 'MasterSpeed', { speed: 0.5 })], edges, groups,
    )

    expect(cpp).toContain('const float _showAnimSpeed = 0.5000f;')
    expect(cpp).toContain('_showAnimSec += ((now - _showAnimLastMs) / 1000.0f) * _showAnimSpeed;')
    expect(cpp).toContain('uint32_t animNow = (uint32_t)(_showAnimSec * 1000.0f);')
    expect(cpp).toContain('renderPattern(cur, animNow);')
    expect(cpp).toContain('renderPattern(nxt, animNow);')
    // Dwell and transition progress remain real elapsed durations.
    expect(cpp).toContain('if (now - phaseStart >= 8000) {')
    expect(cpp).toContain('float p = (float)(now - phaseStart) / 1000;')
    expect(cpp).toContain('phaseStart = now;')
  })

  it('evaluates a wired Master Speed through the bounded control graph', () => {
    const speed = node('speed', 'MasterSpeed', { speed: 0.5 })
    const pot = node('pot', 'PotInput', { pin: 4 })
    const cpp = generateShowSketch(
      [...nodes, speed, pot],
      [...edges, edge('speed-wire', 'pot', 'value', 'speed', 'speed')],
      groups,
    )

    expect(cpp).toContain('float n_pot_value = analogRead(4) / 4095.0f;')
    expect(cpp).toContain('static float _showAnimSpeed = 0.5000f;')
    expect(cpp).toContain('_showAnimSpeed = constrain(n_pot_value, 0.0f, 4.0f);  // for the next pass')
    expect(cpp.indexOf('_showAnimSec +=')).toBeLessThan(cpp.indexOf('_showAnimSpeed = constrain'))
  })

  it('keeps the original direct millis clock when there is no Master Speed node', () => {
    const cpp = generateShowSketch(nodes, edges, groups)
    expect(cpp).toContain('renderPattern(cur, now);')
    expect(cpp).not.toContain('_showAnimSec')
    expect(cpp).not.toContain('animNow')
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

  describe('HUB75 (docs/design/hub75-output.md)', () => {
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
      expect(cpp).toContain('compositeTransition(0, leds, showA, showB, p)')
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

  it('applies Board policy and LED output hardware settings to the controller sketch', () => {
    const board = node('board', 'Board', { brightness: 64, overclock: 1.2 })
    const out = node('out', 'MatrixOutput', {
      width: 8, height: 8, dataPin: 5, chipset: 'WS2812B', colorOrder: 'GRB',
      correction: 'TypicalLEDStrip', dither: false,
    })
    const cpp = generateShowSketch([board, nodes[0], nodes[1], out], edges, groups)
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
    expect(cpp.match(/^ {2}FastLED\.show\(\);/gm)).toHaveLength(1)
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

  it('hoists every baked image palette in a pattern, not just the last', () => {
    const image = { w: 2, h: 1, pixels: [255, 0, 0, 0, 0, 255] }
    const paletteInput = [{ id: 'image', dataType: 'image' }]
    const paletteOutput = [{ id: 'palette', dataType: 'palette' }]
    const groupsTwo: GroupRegistry = {
      gp: {
        nodes: [
          node('img', 'Image', { image }, [], [
            { id: 'frame', dataType: 'frame' },
            { id: 'image', dataType: 'image' },
          ]),
          node('palA', 'PaletteFromImage', { count: 2 }, paletteInput, paletteOutput),
          node('palB', 'PaletteFromImage', { count: 4 }, paletteInput, paletteOutput),
          node('noiseA', 'Noise', { noiseType: 'simplex' }, [{ id: 'paletteIn', dataType: 'palette' }], [{ id: 'frame', dataType: 'frame' }]),
          node('noiseB', 'Noise', { noiseType: 'simplex' }, [{ id: 'paletteIn', dataType: 'palette' }], [{ id: 'frame', dataType: 'frame' }]),
          node('mix', 'Blend', {}, [{ id: 'a', dataType: 'frame' }, { id: 'b', dataType: 'frame' }], [{ id: 'frame', dataType: 'frame' }]),
          node('go', 'GroupOutput'),
        ],
        edges: [
          edge('e1', 'img', 'image', 'palA', 'image'),
          edge('e2', 'img', 'image', 'palB', 'image'),
          edge('e3', 'palA', 'palette', 'noiseA', 'paletteIn'),
          edge('e4', 'palB', 'palette', 'noiseB', 'paletteIn'),
          edge('e5', 'noiseA', 'frame', 'mix', 'a'),
          edge('e6', 'noiseB', 'frame', 'mix', 'b'),
          edge('e7', 'mix', 'frame', 'go', 'frame'),
        ],
      },
    }
    const renderers = buildPatternRenderers(['gp'], groupsTwo)
    const helpers = renderers.helpers.join('\n')
    expect(helpers).toContain('const CRGBPalette16 p0_pal_palA(')
    expect(helpers).toContain('const CRGBPalette16 p0_pal_palB(')
    expect(renderers.functions[0]).toContain('p0_pal_palA')
    expect(renderers.functions[0]).toContain('p0_pal_palB')
  })

  it('moves show + pattern buffers to PSRAM when Board policy is on', () => {
    const psNodes = [node('board', 'Board', { psramPolicy: 'on' }), nodes[0], nodes[1],
      node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 })]
    const cpp = generateShowSketch(psNodes, edges, groups)
    expect(cpp).toContain('CRGB leds[NUM_LEDS];')            // stays internal
    expect(cpp).toContain('CRGB* showA = nullptr;')
    expect(cpp).toContain('CRGB* _pool_buf_0 = nullptr;')
    expect(cpp).toContain('showA = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);')
    // The pool, sized once for the largest pattern, is what moves.
    expect(cpp).toContain('_pool_buf_0 = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);')
    expect(cpp).not.toContain('_pool_buf_1')
    expect(cpp).toContain('void* _psAlloc(size_t n)')
    // The stale-toggle gate (board without PSRAM) falls back to static arrays.
    const noPs = generateShowSketch(psNodes, edges, groups, { psramAllowed: false })
    expect(noPs).toContain('CRGB _pool_buf_0[NUM_LEDS];')
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
    expect(cpp).toContain('blur2d(_pool_buf_0, WIDTH, HEIGHT, (uint8_t)(constrain(0.5,0.0f,1.0f)*255.0f), _xyMap)')
    expect(cpp).toContain('blur2d(_pool_buf_0, WIDTH, HEIGHT, (uint8_t)(constrain(0.25,0.0f,1.0f)*255.0f), _xyMap)')
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
    expect(r.buffers).toContain('float _pool_field_0[NUM_LEDS];')
    expect(r.functions[0]).toContain('_pool_field_0[')
    expect(r.helpers.join('\n')).toContain('float _fsin8(float x)')
  })

  it('hoists the Worley hash helper once, whole, for every pattern that calls it', () => {
    const worley = (id: string) => ({
      nodes: [node(`${id}-nz`, 'Noise', { noiseType: 'worley', speed: 0.5, scale: 0.3, palette: 'forest' }), node(`${id}-go`, 'GroupOutput')],
      edges: [edge(`${id}-e`, `${id}-nz`, 'frame', `${id}-go`, 'frame')],
    })
    const r = buildPatternRenderers(['wa', 'wb'], { wa: worley('wa'), wb: worley('wb') } as unknown as GroupRegistry)
    expect(r.functions.every((fn) => fn.includes('_worleyHash(_cx,_cy,0u)'))).toBe(true)
    const hash = r.helpers.filter((helper) => helper.startsWith('float _worleyHash('))
    expect(hash).toHaveLength(1)
    expect(hash[0]).toContain('uint32_t h = (uint32_t)x * 374761393u + (uint32_t)y * 668265263u + seed * 2246822519u;')
    expect(hash[0].endsWith('return (float)((h ^ (h >> 16)) >> 8) / 16777216.0f;\n}')).toBe(true)
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

  it('holds a fixed hold as one constant', () => {
    // An Interval with nothing wired: nothing can vary the hold, so no
    // pacing helper is emitted to draw one.
    const cpp = generateShowSketch(nodes, edges, groups)
    expect(cpp).toContain('if (now - phaseStart >= 8000) {')
    expect(cpp).not.toContain('paceHoldMs')
    expect(cpp).not.toContain('random16(')
  })

  const withSlideshow = (properties: Record<string, unknown>, extraNodes: StudioNode[] = [], extraEdges: StudioEdge[] = []) => ({
    nodes: [
      node('pc', 'PatternCollection', { patternIds: ['g0', 'g1'] }),
      node('pm', 'PatternSlideshow', { interval: 8, transitionSec: 1, ...properties }),
      node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5, chipset: 'WS2812B', colorOrder: 'GRB' }),
      ...extraNodes,
    ],
    edges: [...edges, ...extraEdges],
  })

  it('draws a hold between Min Time and Max Time with the Music Player\'s pacing', () => {
    const show = withSlideshow({ audioReactive: true, minTime: 5, maxTime: 30, dwellsAndBursts: true })
    const cpp = generateShowSketch(show.nodes, show.edges, groups)
    expect(cpp).toContain('const float minHold = max(1.0f, constrain(5.0000f, 0.0f, 86400.0f));')
    expect(cpp).toContain('const float maxHold = max(minHold, constrain(30.0000f, 0.0f, 86400.0f));')
    expect(cpp).toContain('const uint32_t transitionMs = (uint32_t)(constrain(1.0000f, 0.0f, 86400.0f) * 1000.0f);')
    expect(cpp).toContain('if (now - phaseStart >= paceHoldMs()) {')
    // The next hold is drawn when the transition lands, as the preview does.
    expect(cpp).toContain('cur = nxt; transitioning = false; phaseStart = now; paceNext(); }')
    // Energy Pacing has no audio to read, so it is left out.
    expect(cpp).not.toContain('paceLevel')
  })

  it('paces holds from the slideshow\'s own audio and waits for its beats', () => {
    const show = withSlideshow(
      { audioReactive: true, minTime: 5, maxTime: 30, energyPacing: true, beatTransitions: true },
      [micBoard, ...audioSource('mic', 'MicInput', { i2sWs: 39, i2sSck: 40, i2sSd: 41 })],
      [edge('ea', 'mic', 'audio', 'pm', 'audio')],
    )
    const cpp = generateShowSketch(show.nodes, show.edges, groups)
    expect(cpp).toContain('static uint32_t paceAtMs = now;')
    expect(cpp).toContain('const float dt = now >= paceAtMs ? (float)(now - paceAtMs) : 0.0f;')
    expect(cpp).toContain('const bool beatNow = _audioBeat;')
    expect(cpp).toContain('if (now - phaseStart >= paceHoldMs() && beatEdge) {')
  })

  it('leaves the audio timing out without Audio Reactive', () => {
    const show = withSlideshow(
      { minTime: 5, maxTime: 30, energyPacing: true, beatTransitions: true, dwellsAndBursts: true },
      [micBoard, ...audioSource('mic', 'MicInput', { i2sWs: 39, i2sSck: 40, i2sSd: 41 })],
      [edge('ea', 'mic', 'audio', 'pm', 'audio')],
    )
    const cpp = generateShowSketch(show.nodes, show.edges, groups)
    expect(cpp).toContain('if (now - phaseStart >= 8000) {')
    expect(cpp).not.toContain('paceHoldMs')
    expect(cpp).not.toContain('beatEdge')
  })

  it('reads a wired Interval live, and Min and Max Time only with Audio Reactive', () => {
    const pot = node('pot', 'PotInput', { pin: 4 })
    const timed = withSlideshow({}, [pot], [
      edge('w-int', 'pot', 'value', 'pm', 'interval'),
      edge('w-min', 'pot', 'value', 'pm', 'minTime'),
    ])
    const cpp = generateShowSketch(timed.nodes, timed.edges, groups)
    expect(cpp).toMatch(/const float minHold = max\(1\.0f, constrain\(\S*n_pot_value\S*, 0\.0f, 86400\.0f\)\);/)
    expect(cpp).toMatch(/const float maxHold = max\(minHold, constrain\(\S*n_pot_value\S*, 0\.0f, 86400\.0f\)\);/)
    expect(cpp).toContain('if (now - phaseStart >= paceHoldMs()) {')
  })

  it('reads wired Min Time, Max Time and Transition live', () => {
    const pot = node('pot', 'PotInput', { pin: 4 })
    const show = withSlideshow({ audioReactive: true, transitionSec: 0 }, [pot], [
      edge('w-min', 'pot', 'value', 'pm', 'minTime'),
      edge('w-max', 'pot', 'value', 'pm', 'maxTime'),
      edge('w-fade', 'pot', 'value', 'pm', 'transitionSec'),
    ])
    const cpp = generateShowSketch(show.nodes, show.edges, groups)
    expect(cpp).toContain('float n_pot_value = analogRead(4) / 4095.0f;')
    expect(cpp).toMatch(/const float minHold = max\(1\.0f, constrain\(\S*n_pot_value\S*, 0\.0f, 86400\.0f\)\);/)
    expect(cpp).toContain('if (now - phaseStart >= paceHoldMs()) {')
    // A wired Transition opens the fade a property of zero would have cut.
    expect(cpp).toContain('float p = transitionMs > 0 ? (float)(now - phaseStart) / transitionMs : 1.0f;')
  })

  it('counts beats for Sequence holds when Beat Transitions is on', () => {
    const sequence = [
      { index: 0, hold: 4, transition: 'crossfade', transitionSec: 1 },
      { index: 1, hold: 2, transition: 'crossfade', transitionSec: 1 },
    ]
    const show = withSlideshow(
      { audioReactive: true, order: 'Sequence', sequence, beatTransitions: true },
      [micBoard, ...audioSource('mic', 'MicInput', { i2sWs: 39, i2sSck: 40, i2sSd: 41 })],
      [edge('ea', 'mic', 'audio', 'pm', 'audio')],
    )
    const cpp = generateShowSketch(show.nodes, show.edges, groups)
    // Holds are beats, not milliseconds.
    expect(cpp).toContain('static const uint32_t seqHoldMs[] PROGMEM = { 4, 2 };')
    expect(cpp).toContain('beatEdge && (uint32_t)seqBeats + 1 >= pgm_read_dword(&seqHoldMs[seqStep])')
    expect(cpp).toContain('if (!seqDue && !transitioning && beatEdge) seqBeats++;')
    expect(cpp).not.toContain('paceHoldMs')
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
    expect(cpp).toContain('static uint8_t  cur = 0, nxt = 0;')
    expect(cpp).toContain('nxt = (cur + 1) % PATTERN_COUNT;')
    expect(cpp).not.toContain('random8(PATTERN_COUNT')

    // Random remains the default and picks anything except what is showing.
    const random = generateShowSketch(nodes, edges, groups)
    expect(random).toContain('static uint8_t  cur = random8(PATTERN_COUNT), nxt = 0;')
    expect(random).toContain('nxt = (cur + 1 + random8(PATTERN_COUNT - 1)) % PATTERN_COUNT;')
  })

  it('cuts rather than fades when transitions are switched off', () => {
    const cut = [
      node('pc', 'PatternCollection', { patternIds: ['g0', 'g1'] }),
      node('pm', 'PatternSlideshow', { interval: 8, transitionsEnabled: false, transitionSec: 1.5 }),
      node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5, chipset: 'WS2812B', colorOrder: 'GRB' }),
    ]
    // A cut has no transition to run, so none of the apparatus ships.
    const cpp = generateShowSketch(cut, edges, groups)
    expect(cpp).toContain('renderPattern(cur, now);')
    expect(cpp).not.toContain('compositeTransition')
    expect(cpp).not.toContain('showA')
    expect(cpp).not.toContain('transitioning')
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
      // No pattern reads energy, so only speed is threaded.
      expect(r.params).toEqual(['speed'])
      expect(r.functions[0]).toContain('void render_p0(uint32_t ms, float speed)')
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
      const loop = cpp.slice(cpp.indexOf('void loop() {'))
      expect(loop.match(/updateAudio\(\);/g)).toHaveLength(1)
      const renderAt = loop.search(/renderCollected\(|renderPattern\(|render_p0\(/)
      expect(renderAt).toBeGreaterThan(-1)
      expect(loop.indexOf('updateAudio();')).toBeLessThan(renderAt)
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
      // Nothing in this show reads the side levels.
      expect(cpp).not.toContain('_audioLeftLevel')
      expect(cpp).toContain('_sum += _audioSpectrum[_i];')
    })

    it('keeps audio silent when Audio has no selected source', () => {
      const cpp = generateShowSketch(showNodes(false), showEdges, audioGroups)
      expect(cpp).not.toContain('driver/i2s.h')
      expect(cpp).not.toContain('updateAudio()')
      expect(cpp).toContain('_sum += 0.0f;')              // no invented hardware signal
    })

    it('follows host audio with an undriven energy role and binds no retired band names', () => {
      const inputGroups = {
        gi: {
          nodes: [
            node('in', 'GroupInput', { paramId: 'energy' }, [], [{ id: 'out', dataType: 'float' }]),
            node('old', 'GroupInput', { paramId: 'bass' }, [], [{ id: 'out', dataType: 'float' }]),
            node('bp', 'BassPulse', {}, [{ id: 'bass', dataType: 'float' }], [{ id: 'frame', dataType: 'frame' }]),
            node('go', 'GroupOutput'),
          ],
          edges: [edge('e1', 'in', 'out', 'bp', 'bass'), edge('e2', 'bp', 'frame', 'go', 'frame')],
        },
      } as unknown as GroupRegistry
      const r = buildPatternRenderers(['gi'], inputGroups, [], true)
      expect(r.functions[0]).toContain('float n_in_out = ((_audioBass + _audioMids + _audioTreble) / 3.0f);')
      expect(r.functions[0]).not.toContain('n_old_out')
    })
  })
})

describe('show sketch pattern headers', () => {
  const groups = {
    g0: { nodes: [node('sc', 'SolidColor', { r: 0, g: 0, b: 255 }), node('go', 'GroupOutput')],
          edges: [edge('e', 'sc', 'frame', 'go', 'frame')] },
    g1: { nodes: [node('nz', 'Noise', { palette: 'ocean' }), node('go', 'GroupOutput')],
          edges: [edge('e', 'nz', 'frame', 'go', 'frame')] },
  }
  const cpp = generateShowSketch(
    [node('pc', 'PatternCollection', { patternIds: ['g0', 'g1'] }), node('pm', 'PatternSlideshow', {}), node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 })],
    [edge('e1', 'pc', 'patternset', 'pm', 'patternset'), edge('e2', 'pm', 'frame', 'out', 'frame')],
    groups,
  )

  // Each pattern is its own header beside the controller: the helper writes
  // the marked blocks as files, and as one file they are comments.
  it('marks one header per pattern that the helper splits out of the controller', () => {
    const { ino, files } = splitSketchBundle(cpp)
    expect(Object.keys(files)).toEqual(['pattern_0.h', 'pattern_1.h'])
    expect(files['pattern_0.h']).toMatch(/^void render_p0\(uint32_t ms\)/)
    // Noise keeps phase statics, so Restart adds the entry flag. SolidColor has
    // nothing to clear and keeps the old signature.
    expect(files['pattern_1.h']).toMatch(/^void render_p1\(uint32_t ms, bool entry\)/)
    expect(files['pattern_1.h']).toContain('if (entry) _phase_nz = 0.0f;')
    expect(files['pattern_1.h']).toContain('if (entry) _phase_nzT = -1.0f;')
    expect(ino).toContain('#include "pattern_0.h"\n\n#include "pattern_1.h"')
    expect(ino).toContain('void renderPattern(uint8_t i, uint32_t ms, bool entry)')
    expect(ino).toContain('case 1: render_p1(ms, entry); break;')
    expect(ino).toContain('commitEntrySlot();')
    expect(ino).not.toContain('void render_p0(')
    // The controller still dispatches to them after the includes.
    expect(ino.indexOf('#include "pattern_1.h"')).toBeLessThan(ino.indexOf('void renderPattern('))
    expect(flattenSketchBundle({ ino, files })).toBe(cpp)
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

  // The show composes into `leds`; a shape-mapped chain is a second, physical
  // array read through the same PROGMEM map a normal sketch bakes — so the
  // Music Player no longer refuses a ring, corkscrew or positioned string.
  it('drives a ring through its sample map into a physical array', () => {
    const cpp = show({ form: 'ring', ledCount: 24, dataPin: 5, chipset: 'WS2812B', colorOrder: 'GRB' })
    expect(cpp).toContain('#define WIDTH    8')
    expect(cpp).toContain('#define HEIGHT   8')
    expect(cpp).toContain('#define RING_LEDS 24')
    expect(cpp).toContain('CRGB leds[NUM_LEDS];')
    expect(cpp).toContain('CRGB ledsOut[RING_LEDS];')
    expect(cpp).toContain('const uint16_t _ringmap[RING_LEDS] PROGMEM = {')
    expect(cpp).toContain('FastLED.addLeds<WS2812B, DATA_PIN, GRB>(ledsOut, RING_LEDS);')
    const copy = cpp.indexOf('for (int _i = 0; _i < RING_LEDS; _i++) ledsOut[_i] = leds[pgm_read_word(&_ringmap[_i])];')
    expect(copy).toBeGreaterThan(cpp.indexOf('void loop()'))
    expect(copy).toBeLessThan(cpp.indexOf('FastLED.show();', copy))
    // The same map the normal sketch bakes for the same ring.
    const normal = generateCpp(
      [node('sc', 'SolidColor'), node('out', 'MatrixOutput', { form: 'ring', ledCount: 24, dataPin: 5 })],
      [edge('e', 'sc', 'frame', 'out', 'frame')],
    )
    const table = (src: string) => src.match(/_ringmap\[RING_LEDS\] PROGMEM = \{ ([^}]+) \}/)![1]
    expect(table(cpp)).toBe(table(normal))
  })

  it('drives a corkscrew through its helix map', () => {
    const cpp = show({ form: 'corkscrew', ledCount: 120, corkscrewTurns: 6, dataPin: 5 })
    expect(cpp).toContain('#define CORKSCREW_LEDS 120')
    expect(cpp).toContain('CRGB ledsOut[CORKSCREW_LEDS];')
    expect(cpp).toContain('const uint16_t _corkscrewmap[CORKSCREW_LEDS] PROGMEM = {')
    expect(cpp).toContain('ledsOut[_i] = leds[pgm_read_word(&_corkscrewmap[_i])];')
    expect(cpp).toContain('(ledsOut, CORKSCREW_LEDS);')
  })

  it('drives a positioned string by bilinear reads at its baked positions', () => {
    const cpp = show({
      form: 'strip', stripLayout: 'positions', ledCount: 3, positionsWidth: 8, positionsHeight: 4,
      positionsPreset: 'custom', positions: '0.5,0.5 2.5,1.5 3.5,3.5', dataPin: 5,
    })
    expect(cpp).toContain('#define WIDTH    8')
    expect(cpp).toContain('#define HEIGHT   4')
    expect(cpp).toContain('#define POS_LEDS 3')
    expect(cpp).toContain('CRGB ledsOut[POS_LEDS];')
    expect(cpp).toContain('const uint16_t _posmap[POS_LEDS * 2] PROGMEM = { 128,128,640,384,896,896 };')
    expect(cpp).toContain('pgm_read_word(&_posmap[_i * 2])')
    expect(cpp).toContain('ledsOut[_i] = _c;')
    expect(cpp).toContain('(ledsOut, POS_LEDS);')
  })

  // A wired matrix went straight from the composition to the pins in row-major
  // order, so a serpentine panel showed every other row mirrored. It takes the
  // same XY() remap a normal sketch bakes.
  it('remaps a serpentine matrix through XY() into the physical array', () => {
    const cpp = show({ form: 'matrix', width: 4, height: 2, serpentine: true, dataPin: 5 })
    expect(cpp).toContain('CRGB ledsOut[NUM_LEDS];')
    expect(cpp).toContain('const uint16_t _xytable[NUM_LEDS] PROGMEM = { 0,1,2,3,7,6,5,4 };')
    expect(cpp).toContain('ledsOut[XY(_x, _y)] = leds[_y * WIDTH + _x];')
    expect(cpp).toContain('(ledsOut, NUM_LEDS);')
    const plain = show({ form: 'matrix', width: 4, height: 2, dataPin: 5 })
    expect(plain).not.toContain('ledsOut')
    expect(plain).toContain('(leds, NUM_LEDS);')
  })

  it('maps a ring beside a matrix against the shared composition', () => {
    const cpp = generateShowSketch(
      [
        node('pc', 'PatternCollection', { patternIds: ['g0'] }), node('pm', 'PatternSlideshow', {}),
        node('board', 'Board', { brightness: 90 }),
        node('panel', 'MatrixOutput', { form: 'matrix', width: 16, height: 16, dataPin: 5, routeMode: 'fit' }),
        node('ring', 'MatrixOutput', { form: 'ring', ledCount: 12, dataPin: 6, routeMode: 'fit' }),
      ],
      [...wiring, edge('e3', 'pm', 'frame', 'panel', 'frame'), edge('e4', 'pm', 'frame', 'ring', 'frame')],
      groups,
    )
    expect(cpp).toContain('#define WIDTH    16')
    expect(cpp).toContain('CRGB leds_ring[12];')
    expect(cpp).toContain('const uint16_t _ringmap_ring[12] PROGMEM = {')
    expect(cpp).toContain('CRGB _c = leds[pgm_read_word(&_ringmap_ring[_i])]; _c.nscale8_video(90);')
    expect(cpp).toContain('leds_ring[_i] = _c;')
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
    // A one-style pool is a constant: no pool, no draw, no dispatch.
    expect(cpp).not.toContain('TRANS_POOL')
    expect(cpp).not.toContain('switch (type)')
    expect(cpp).toContain('  // crossfade (0)\n  ::memmove(out, a,')
    expect(cpp).toContain('compositeTransition(0, leds, showA, showB, p);')
    expect(cpp).not.toContain('case 1: {  // wipe')
    expect(cpp).not.toContain('case 15: {  // zoom')
  })

  it('keeps exactly the styles a wired TransitionSet selects', () => {
    const set = node('ts', 'TransitionSet', { transitions: ['wipe', 'zoom'] })
    const cpp = show(['g0', 'g1'], [set], [edge('e3', 'ts', 'transitions', 'pm', 'transitions')])
    expect(cpp).toContain('case 1: {  // wipe')
    expect(cpp).toContain('case 15: {  // zoom')
    // Crossfade is not in the pool, so its default arm is unreachable too.
    expect(cpp).not.toContain('default: {  // crossfade (0)')
    expect(cpp).not.toContain('case 2: {  // dissolve')
    expect(cpp).not.toContain('case 11: {  // ripple')
  })

  // A 3D Transition node inside a pattern calls the depth helpers. A
  // one-pattern show has no pool to bring them, so they must be lifted.
  it('lifts the 3D helpers a pattern\'s own Transition node calls', () => {
    const cube = {
      nodes: [node('a', 'SolidColor', { r: 255, g: 0, b: 0 }), node('b', 'Noise'),
        node('tr', 'Transition', { transitionType: 'cube' }), node('go', 'GroupOutput')],
      edges: [edge('ea', 'a', 'frame', 'tr', 'a'), edge('eb', 'b', 'frame', 'tr', 'b'),
        edge('eo', 'tr', 'frame', 'go', 'frame')],
    }
    const cpp = generateShowSketch(
      [node('pc', 'PatternCollection', { patternIds: ['cube'] }), master, out],
      wiring, { ...groups, cube } as unknown as GroupRegistry,
    )
    expect(cpp).toContain('_sampleUnitShaded(')
    expect(cpp.match(/static inline CRGB _sampleUnitShaded\(/g)).toHaveLength(1)
    expect(cpp.match(/static inline CRGB _sampleShaded\(/g)).toHaveLength(1)
    expect(cpp.indexOf('static inline CRGB _sampleShaded(')).toBeLessThan(cpp.indexOf('static inline float _depthShade('))
  })

  // A 3D style in the pool and a Frame Warp pattern share one sampler.
  it('emits the frame sampler once for a 3D pool and a sampling pattern', () => {
    const warp = {
      nodes: [node('src', 'Noise'), node('warp', 'FrameWarp', { edgeMode: 'wrap', sampling: 'bilinear' }), node('go', 'GroupOutput')],
      edges: [edge('wi', 'src', 'frame', 'warp', 'frame'), edge('wo', 'warp', 'frame', 'go', 'frame')],
    }
    const set = node('ts', 'TransitionSet', { transitions: ['dolly'] })
    const cpp = generateShowSketch(
      [node('pc', 'PatternCollection', { patternIds: ['g0', 'warp'] }), master, out, set],
      [...wiring, edge('e3', 'ts', 'transitions', 'pm', 'transitions')],
      { ...groups, warp } as unknown as GroupRegistry,
    )
    expect(cpp.match(/static inline CRGB _sampleShaded\(/g)).toHaveLength(1)
    expect(cpp.match(/static inline float _depthShade\(/g)).toHaveLength(1)
    // Dolly alone needs no dispatch around it.
    expect(cpp).toContain('{  // dolly')
    expect(cpp).not.toContain('switch (type)')
  })

  // A collection of one never transitions: the guard was `PATTERN_COUNT > 1`,
  // so showA/showB, the pool and the compositing switch were all unreachable.
  it('omits the whole transition apparatus for a one-pattern collection', () => {
    const cpp = show(['g0'])
    expect(cpp).not.toContain('PATTERN_COUNT')
    expect(cpp).not.toContain('renderPattern')
    expect(cpp).toContain('render_p0(now);')
    expect(cpp).not.toContain('showA')
    expect(cpp).not.toContain('showB')
    expect(cpp).not.toContain('TRANS_POOL')
    expect(cpp).not.toContain('compositeTransition')
  })

  it('still emits it for two patterns', () => {
    const cpp = show(['g0', 'g1'])
    expect(cpp).toContain('CRGB showA[NUM_LEDS];   // outgoing pattern during a transition')
    expect(cpp).toContain('compositeTransition(0, leds, showA, showB, p);')
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

  // Unwired: a panel on the bench that nothing is plugged into, which is a
  // legitimate state and draws the waiting screen.
  const oled = node('oled', 'InfoDisplay', {
    partId: 'sh1106-oled-128x64',
    csPin: 1, dcPin: 22, resetPin: 5, sckPin: 6, mosiPin: 7,
  })
  const segment = node('seg', 'SegmentDisplay', {
    partId: 'tm1637-4digit-display', clkPin: 32, dioPin: 33, brightness: 4,
  })
  const status = node('tft', 'TransportDisplay', {
    partId: 'st7789-tft-240x240', tftLayout: 'Show Status',
    csPin: 15, dcPin: 2, resetPin: 4, sckPin: 14, mosiPin: 13, backlightPin: 27,
  })
  // The same node wired to the Slideshow, which is what makes it a browser.
  const browser = node('brw', 'InfoDisplay', {
    partId: 'sh1106-oled-128x64',
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
    expect(cpp).toContain('"Design Studio for FastLED"')
    expect(cpp).toContain('"STARTING 3/6"')
    expect(cpp).toContain('"FASTLED"')
    expect(cpp).toContain('"READY 6/6"')
    expect(cpp.match(/delay\(500\);/g)).toHaveLength(6)
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
    // Wired to the Slideshow, which is what makes it a show panel at all: one
    // content socket, and the source picks the screen.
    const cpp = build([status], [edge('show-tft', 'pm', 'display', 'tft', 'display')])
    expect(cpp).toContain('static uint8_t showPatternIndex = 0;')
    // Published where the show decides it, and read by the panel. A
    // transition names the pattern it is heading to.
    expect(cpp).toContain('  showPatternIndex = transitioning ? nxt : cur;')
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
    expect(cpp).not.toContain('showPatternIndex = cur;')
    expect(cpp).not.toMatch(/showPatternIndex = (?!0;)/)
  })

  /*
   * Pixels first. A 240x320 panel repaint is worth several LED frames of SPI
   * time and the acceptance gate for displays is no regression to wall-clock
   * LED timing, so the frame ships and the panels catch up in the slack.
   */
  it('flushes the panels after the frame has shipped', () => {
    const cpp = build([oled, status])
    const show = cpp.indexOf('\n  FastLED.show();')
    // The first lifecycle paint is intentionally in setup(); the last Info
    // Display block is the per-frame service whose ordering this test guards.
    const panel = cpp.lastIndexOf('{ // Info Display')
    const delay = cpp.indexOf('_paceFrame(16667);')
    expect(show).toBeGreaterThan(-1)
    expect(panel).toBeGreaterThan(show)
    expect(delay).toBeGreaterThan(panel)
  })

  describe('the pattern browser', () => {
    const wire = edge('e3', 'pm', 'display', 'brw', 'display')

    it('carries the selection and the picture table on one stem', () => {
      const cpp = build([browser], [wire])
      expect(cpp).toContain('static PatternSel _sel_show;')
      expect(cpp).toContain('  _selBegin(_sel_show);')
    })

    // Through the selection rather than around it, so the panel and the
    // pixels cannot disagree about which pattern is running.
    it('routes the show rotation through the same cursor', () => {
      const cpp = build([browser], [wire])
      expect(cpp).toContain('_selSetActive(_sel_show, PATTERN_COUNT, showPatternIndex);')
    })

    // The honest outcome for a browser whose collection was never baked:
    // NO PATTERNS, not a blank square. An empty table has nothing to read, so
    // none is emitted.
    it('says NO PATTERNS when nothing was baked', () => {
      const cpp = build([browser], [wire])
      expect(cpp).toContain('"NO PATTERNS"')
      expect(cpp).not.toContain('THUMB_COUNT_show')
    })

    it('leaves the selection out of a show that has no use for one', () => {
      const cpp = build([oled])
      expect(cpp).not.toContain('struct PatternSel')
      expect(cpp).not.toContain('_sel_show')
    })
  })

  /*
   * The cursor belongs to everything that reads or commands it, not to the
   * OLED browser that happened to need it first. A TFT-only Show Status read
   * `_sel_show` that no line declared, and a headless Pattern Next reached the
   * browser and vanished from the sketch.
   */
  describe('the pattern cursor', () => {
    it('declares it for a TFT-only Show Status', () => {
      const cpp = build([status], [edge('show-tft', 'pm', 'display', 'tft', 'display')])
      expect(cpp).toContain('static PatternSel _sel_show;')
      expect(cpp).toContain('  _selBegin(_sel_show);')
      expect(cpp).toContain('(uint16_t)(_sel_show.active)')
      expect(cpp).toContain('_selSetActive(_sel_show, PATTERN_COUNT, showPatternIndex);')
    })

    // Three buttons and no screen at all: the cursor, the bundle type and the
    // show's own advance all have to exist without a display asking for them.
    const controlNodes = [
      node('btn', 'ButtonInput', { pin: 12 }),
      node('ctl', 'ControlMap', { controls: ['patternNext'] }),
    ]
    const controlEdges = [
      edge('press', 'btn', 'pressed', 'ctl', 'patternNext'),
      edge('cmd', 'ctl', 'controls', 'pm', 'controls'),
    ]

    // An encoder is the other physical shape of the same intent: a running
    // count turned into whole detents rather than one step per press.
    it('carries a headless encoder into the show it selects', () => {
      const nodes = [...base,
        node('enc', 'EncoderInput', { pinA: 6, pinB: 7, pinSW: 8 }),
        node('ctl', 'ControlMap', { controls: ['patternSelect'] })]
      const edges = [...baseEdges,
        edge('turn', 'enc', 'position', 'ctl', 'patternSelect'),
        edge('cmd', 'ctl', 'controls', 'pm', 'controls')]
      const cpp = generateShowSketch(nodes, edges, groups)
      expect(cpp).toContain('n_ctl_controls.patternSteps += _pcD_ctl.update((long)(n_enc_position));')
      expect(cpp).toContain('_selUpdate(_sel_show, PATTERN_COUNT, n_ctl_controls.patternSteps);')
    })

    it('carries a headless Pattern Next into the show it selects', () => {
      const cpp = generateShowSketch([...base, ...controlNodes], [...baseEdges, ...controlEdges], groups)
      expect(cpp).toContain('struct PlayerControlsValue {')
      expect(cpp).toContain('PlayerControlsValue n_ctl_controls;')
      expect(cpp).toContain('n_ctl_controls.patternSteps += 1;')
      expect(cpp).toContain('static PatternSel _sel_show;')
      // No confirm: a step moves the running pattern.
      expect(cpp).toContain('_selUpdate(_sel_show, PATTERN_COUNT, n_ctl_controls.patternSteps);')
    })

    /*
     * Names are metadata, pictures are a bake. A Show Status panel names
     * patterns and pictures none, so it needs its own table rather than one
     * borrowed from an OLED browser it may not be sitting beside.
     */
    it('names patterns on a TFT with no thumbnails anywhere in the sketch', () => {
      const cpp = generateShowSketch(
        [...base, status], [...baseEdges, edge('show-tft', 'pm', 'display', 'tft', 'display')], groups,
        { patternNames: { pm: ['SUNRISE', 'RAIN'] } },
      )
      expect(cpp).toContain('#define PATTERN_NAME_COUNT_show  2')
      expect(cpp).toContain('"SUNRISE"')
      expect(cpp).not.toContain('THUMB_COUNT_')
      expect(cpp).toContain('_patName_show_read(_tftNameActive_tft, sizeof(_tftNameActive_tft), (uint16_t)(_sel_show.active));')
    })

    // The reader is emitted either way, so an unnamed collection draws a blank
    // field rather than calling a function nothing wrote.
    it('emits an empty name table when the caller supplied none', () => {
      const cpp = build([status], [edge('show-tft', 'pm', 'display', 'tft', 'display')])
      // The reader answers emptily; with nothing named, no count is read.
      expect(cpp).toContain('static void _patName_show_read(char *dst, size_t dstSize, uint16_t index)')
      expect(cpp).not.toContain('PATTERN_NAME_COUNT_show')
    })

    // Commanding, not just reporting: a step reaches the pixels before this
    // pass renders, the rule the evaluator applies to the same cursor.
    it('renders the selected pattern rather than only naming it', () => {
      const cpp = generateShowSketch([...base, ...controlNodes], [...baseEdges, ...controlEdges], groups)
      const seed = cpp.indexOf('if (!selSeeded) { selSeeded = true; _selSetActive(_sel_show, PATTERN_COUNT, cur); }')
      const update = cpp.indexOf('_selUpdate(_sel_show')
      const follow = cpp.indexOf('uint8_t selTarget = (uint8_t)_sel_show.active;')
      const render = cpp.indexOf('renderPattern(cur,')
      expect(seed).toBeGreaterThan(-1)
      expect(update).toBeGreaterThan(seed)
      expect(follow).toBeGreaterThan(update)
      expect(render).toBeGreaterThan(follow)
    })

    // A single step while holding gets the show's own transition; a step
    // mid-transition cuts, so stepping fast lands on each pattern in turn.
    it('transitions on a step while holding and cuts on one mid-transition', () => {
      const cpp = generateShowSketch([...base, ...controlNodes], [...baseEdges, ...controlEdges], groups)
      expect(cpp).toMatch(/if \(!transitioning && selTarget != cur\) \{\s+nxt = selTarget;[\s\S]*?transitioning = true; phaseStart = now;/)
      expect(cpp).toMatch(/\} else if \(transitioning && selTarget != nxt\) \{\s+cur = selTarget; transitioning = false; phaseStart = now;/)
    })
  })
})

/*
 * A collected pattern is compiled on its own, then cut apart: buffers, known
 * helpers and the loop body are lifted into the show and the rest of its file
 * is dropped. A helper block no rule lifts disappears, and the render function
 * calling into it no longer compiles. Shows with a Shape or Slice Tiling
 * pattern did exactly that.
 *
 * So this checks the property directly, derived from the generator's own
 * output rather than a list of helpers: every name the pattern's own sketch
 * declares at file scope that its render function then uses must be declared
 * at file scope by the show, as it is or with the pattern's `p0_` prefix.
 */
describe('pattern code lifted into a show', () => {
  const libNode = (id: string, nodeType: string, properties: Record<string, unknown> = {}) => {
    const def = NODE_LIBRARY.find((entry) => entry.type === nodeType)
    return node(id, nodeType, { ...libraryDefaults(nodeType), ...properties }, def?.inputs ?? [], def?.outputs ?? [])
  }
  // Column-0 declarations: generated code indents everything inside a body.
  const FILE_SCOPE = [
    /^(?:static\s+)?(?:inline\s+)?(?:const\s+)?[A-Za-z_][\w:<>]*[\s*&]+([A-Za-z_]\w*)\s*[([=;]/gm,
    /^struct\s+([A-Za-z_]\w*)/gm,
    /^#define\s+([A-Za-z_]\w*)/gm,
  ]
  const fileScopeNames = (cpp: string) => new Set(FILE_SCOPE.flatMap((re) => [...cpp.matchAll(re)].map((m) => m[1])))

  /** A one-pattern show and the pattern's own sketch, from one field or frame node. */
  function build(nodeType: string, properties: Record<string, unknown> = {}, wireCell = false) {
    const def = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
    const port = def.outputs.find((output) => output.dataType === 'frame' || output.dataType === 'field')!
    const nodes = [libNode('n', nodeType, properties)]
    const edges: StudioEdge[] = []
    let frame: [string, string] = ['n', port.id]
    if (port.dataType === 'field') {
      let field: [string, string] = ['n', port.id]
      if (wireCell) {
        nodes.push(libNode('mix', 'FieldMath', { fieldOp: 'multiply' }))
        edges.push(edge('mix-a', 'n', 'field', 'mix', 'a'), edge('mix-b', 'n', 'cell', 'mix', 'b'))
        field = ['mix', 'field']
      }
      nodes.push(libNode('paint', 'FieldToFrame'))
      edges.push(edge('paint', field[0], field[1], 'paint', 'field'))
      frame = ['paint', 'frame']
    }
    const own = generateCpp(
      [...nodes, libNode('o', 'MatrixOutput', { width: 8, height: 8 })],
      [...edges, edge('o', frame[0], frame[1], 'o', 'frame')],
    )
    const groups = { p: { nodes: [...nodes, node('go', 'GroupOutput')], edges: [...edges, edge('go', frame[0], frame[1], 'go', 'frame')] } }
    const show = generateShowSketch([
      node('pc', 'PatternCollection', { patternIds: ['p'] }),
      node('pm', 'PatternSlideshow', { interval: 8, transitionSec: 0 }),
      node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5, chipset: 'WS2812B', colorOrder: 'GRB' }),
    ], [edge('e1', 'pc', 'patternset', 'pm', 'patternset'), edge('e2', 'pm', 'frame', 'out', 'frame')], groups as unknown as GroupRegistry)
    const render = show.slice(show.indexOf('void render_p0('), show.indexOf('\n}', show.indexOf('void render_p0(')) + 2)
    return { own, show, render }
  }

  function undeclared({ own, show, render }: ReturnType<typeof build>): string[] {
    const lifted = fileScopeNames(own.slice(0, own.indexOf('void setup() {')))
    const declared = fileScopeNames(show)
    const used = new Set(render.match(/\b[A-Za-z_]\w*\b/g))
    return [...lifted].filter((name) =>
      (used.has(name) || used.has(`p0_${name}`)) && !declared.has(name) && !declared.has(`p0_${name}`))
  }

  it('declares every file-scope name each pattern node and variant uses', () => {
    // Every field, frame and composite node at its defaults and at every
    // option of each select that picks what it emits, as the literal sweep
    // does; palettes are left out because they only name a table.
    const offenders: string[] = []
    let cases = 0
    for (const def of NODE_LIBRARY) {
      if (!['pattern', 'composite', 'field'].includes(def.category)) continue
      if (!def.outputs.some((output) => output.dataType === 'frame' || output.dataType === 'field')) continue
      const variants: Record<string, unknown>[] = [{}]
      for (const key of Object.keys(libraryDefaults(def.type))) {
        const meta = propertyMeta(def.type, key)
        if (meta?.control === 'select' && !/palette/i.test(key)) variants.push(...meta.options.map((option) => ({ [key]: option })))
      }
      for (const variant of variants) {
        cases++
        const missing = undeclared(build(def.type, variant))
        if (missing.length) offenders.push(`${def.type} ${JSON.stringify(variant)}: ${missing.join(', ')}`)
      }
    }
    // A sweep that generated nothing would pass for the wrong reason.
    expect(cases).toBeGreaterThan(200)
    expect(offenders).toEqual([])
    // Over 400 sketches: about a second alone, several under a full run.
  }, 30_000)

  it('lifts the shared helpers a pattern reaches and a Slice Tiling pattern\'s bit tables under its prefix', () => {
    const shape = build('Shape', { shape: 'polygon' })
    expect(shape.render).toContain('_sdfMorphPolygon(')
    // Only the primitives the pattern reaches are lifted.
    expect(shape.show).toContain('static inline float _sdfMorphPolygon(')
    expect(shape.show).not.toContain('_sdfRect(')
    expect(shape.show).not.toContain('_sdfEllipse(')
    expect(undeclared(shape)).toEqual([])

    const slice = build('SliceTiling', { lattice: 'triangle', preset: 'checker', seed: 9 }, true)
    expect(slice.render).toContain('_latticeCellValue(_cell.a,_cell.b,_cell.flipped,9u)')
    expect(slice.render).toContain('_sliceBit(p0__bits_n,_leaf)')
    expect(slice.show).toContain('static inline _LatticeCell _triCell(')
    expect(slice.show).not.toContain('_hexCell(')
    expect(slice.show).toMatch(/^static const uint8_t p0__bits_n\[8\]=/m)
    expect(slice.show).toMatch(/^static const uint8_t p0__bitsB_n\[8\]=/m)
    expect(undeclared(slice)).toEqual([])

    const phi = build('FieldFormula', { formula: 'PHI * 0.1' })
    expect(phi.render).toContain('PHI')
    expect(phi.show).toContain(PHI_DEFINE_CPP)
    expect(undeclared(phi)).toEqual([])

    const warpGroup = {
      nodes: [node('src', 'Noise'), node('warp', 'FrameWarp', { edgeMode: 'wrap', sampling: 'bilinear' }), node('go', 'GroupOutput')],
      edges: [edge('warp-in', 'src', 'frame', 'warp', 'frame'), edge('warp-out', 'warp', 'frame', 'go', 'frame')],
    }
    const warp = buildPatternRenderers(['warp-pattern'], { 'warp-pattern': warpGroup } as unknown as GroupRegistry)
    expect(warp.functions[0]).toContain('_sampleFrame(')
    expect(warp.helpers).toContain(FRAME_SAMPLE_HELPER_CPP)

    const symmetryGroup = {
      nodes: [node('src', 'Noise'), node('sym', 'Symmetry', { group: 'p6m' }), node('go', 'GroupOutput')],
      edges: [edge('sym-in', 'src', 'frame', 'sym', 'frame'), edge('sym-out', 'sym', 'frame', 'go', 'frame')],
    }
    const symmetry = buildPatternRenderers(['symmetry-pattern'], { 'symmetry-pattern': symmetryGroup } as unknown as GroupRegistry)
    expect(symmetry.functions[0]).toContain('_wallpaperSourceQ8(')
    expect(symmetry.helpers).toContain(SYMMETRY_HELPER_CPP)
    expect(symmetry.helpers).toContain(ATAN16_HELPER_CPP)
    expect(symmetry.helpers).not.toContain(FRAME_SAMPLE_HELPER_CPP)

    // The palette sweep cannot reach this: Poline bakes its stops unless an
    // anchor is wired, and only then calls the helper.
    const polineGroup = {
      nodes: [libNode('c', 'Color'), libNode('pl', 'Poline'), libNode('src', 'Noise'), node('go', 'GroupOutput')],
      edges: [
        edge('anchor', 'c', 'color', 'pl', 'colorB'), edge('pal', 'pl', 'palette', 'src', 'paletteIn'),
        edge('out', 'src', 'frame', 'go', 'frame'),
      ],
    }
    const poline = buildPatternRenderers(['poline-pattern'], { 'poline-pattern': polineGroup } as unknown as GroupRegistry)
    expect(poline.functions[0]).toContain('_polineStops16(')
    expect(poline.helpers).toContain(POLINE_HELPER_CPP)
  })

  it('emits a block two patterns share once, and each pattern\'s tables apart', () => {
    const slice = (preset: string) => ({
      nodes: [node('st', 'SliceTiling', { preset }), node('f2f', 'FieldToFrame'), node('go', 'GroupOutput')],
      edges: [edge('e1', 'st', 'field', 'f2f', 'field'), edge('e2', 'f2f', 'frame', 'go', 'frame')],
    })
    const r = buildPatternRenderers(['a', 'b'], { a: slice('pinwheel'), b: slice('braid') } as unknown as GroupRegistry)
    expect(r.helpers.filter((helper) => helper === LATTICE_HELPER_CPP)).toHaveLength(1)
    expect(r.helpers.some((helper) => helper.startsWith('static const uint8_t p0__bits_st[8]='))).toBe(true)
    expect(r.helpers.some((helper) => helper.startsWith('static const uint8_t p1__bits_st[8]='))).toBe(true)
    expect(r.functions[1]).toContain('_sliceBit(p1__bits_st,_leaf)')
  })
})
