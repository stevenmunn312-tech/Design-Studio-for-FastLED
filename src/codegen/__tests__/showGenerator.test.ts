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

describe('showGenerator', () => {
  const groups = {
    g0: { nodes: [node('sc', 'SolidColor', { r: 0, g: 0, b: 255 }), node('go', 'GroupOutput')],
          edges: [edge('e', 'sc', 'frame', 'go', 'frame')] },
    g1: { nodes: [node('sc', 'SolidColor', { r: 255, g: 0, b: 0 }), node('go', 'GroupOutput')],
          edges: [edge('e', 'sc', 'frame', 'go', 'frame')] },
  }
  const nodes = [
    node('pc', 'PatternCollection', { patternIds: ['g0', 'g1'] }),
    node('pm', 'PatternMaster', { minTime: 4, maxTime: 12, transitionSec: 1 }),
    node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5, chipset: 'WS2812B', colorOrder: 'GRB' }),
  ]
  const edges = [edge('e1', 'pc', 'patternset', 'pm', 'patternset'), edge('e2', 'pm', 'frame', 'out', 'frame')]

  it('detects a pattern show', () => {
    expect(isPatternShow(nodes, edges)).toBe(true)
    expect(isPatternShow([node('x', 'SolidColor')], [])).toBe(false)
    expect(isPatternShow([...nodes, node('stray', 'PatternMaster')], [])).toBe(false)
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

  it('emits a fixed controller seed when the Show Engine seed is nonzero', () => {
    const seeded = [
      node('pc', 'PatternCollection', { patternIds: ['g0', 'g1'] }),
      node('pm', 'PatternMaster', { minTime: 4, maxTime: 12, transitionSec: 1, seed: 77 }),
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

  it('routes a show to multiple synchronized output controllers', () => {
    const outA = node('out-a', 'MatrixOutput', { width: 8, height: 8, dataPin: 5, brightness: 80 })
    const outB = node('out-b', 'MatrixOutput', {
      width: 16, height: 4, dataPin: 12, clockPin: 13, chipset: 'APA102', colorOrder: 'BGR',
      brightness: 160, routeMode: 'crop', routeX: 2,
    })
    const multiNodes = [nodes[0], nodes[1], outA, outB]
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
    expect(cpp).toContain('_c.nscale8_video(160)')
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
      node('pm', 'PatternMaster', { minTime: 4, maxTime: 12, transitionSec: 1 }),
      node('out', 'MatrixOutput', { width: 8, height: 8 }),
    ]
    const tempEdges = [edge('e1', 'pc', 'patternset', 'pm', 'patternset'), edge('e2', 'pm', 'frame', 'out', 'frame')]
    const cpp = generateShowSketch(tempNodes, tempEdges, tempGroups)
    expect(cpp).toContain('CRGB kelvinToRGB(float kelvin);')
    expect(cpp.indexOf('CRGB kelvinToRGB(float kelvin);')).toBeLessThan(cpp.indexOf('CRGB kelvinToRGB(float kelvin) {'))
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
    const lone = [node('pc', 'PatternCollection', { patternIds: [] }), node('pm', 'PatternMaster', {}), node('out', 'MatrixOutput', {})]
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

  it('emits a beat-triggered particle overlay only with particles on, a beat wired, and a mic', () => {
    const pmParticles = node('pm', 'PatternMaster', {
      minTime: 4, maxTime: 12, transitionSec: 1,
      particles: true, particleStyle: 3, particleColor: '#3366cc', particleIntensity: 0.9,
    })
    const base = [node('pc', 'PatternCollection', { patternIds: ['g0', 'g1'] }), pmParticles,
      node('out', 'MatrixOutput', { width: 8, height: 8 })]
    const wire = [edge('e1', 'pc', 'patternset', 'pm', 'patternset'), edge('e2', 'pm', 'frame', 'out', 'frame'),
      edge('eb', 'pm', 'beat', 'pm', 'beat')]

    // No mic → no on-device beat source → no particle overlay.
    expect(generateShowSketch(base, wire, groups)).not.toContain('void particleOverlay(')

    // Mic present → the controller hosts _audioBeat and overlays sparks on the beat.
    const withMic = [...base, node('mic', 'MicInput', { i2sWs: 39, i2sSck: 40, i2sSd: 41 })]
    const cpp = generateShowSketch(withMic, wire, groups)
    expect(cpp).toContain('void particleOverlay(')
    expect(cpp).toContain('static uint8_t  burstStyle = 3;')
    expect(cpp).toContain('static CRGB     burstColor = CRGB(51, 102, 204);')
    expect(cpp).toContain('burstStart = now;')
    expect(cpp).toContain('particleOverlay(burstStart, burstStyle, burstColor.r, burstColor.g, burstColor.b, 0.9f, now);')
  })

  it('rolls a random style/colour per beat when randomStyle/randomColor are on', () => {
    const pmRandom = node('pm', 'PatternMaster', {
      minTime: 4, maxTime: 12, transitionSec: 1,
      particles: true, randomStyle: true, randomColor: true, particleIntensity: 0.9,
    })
    const base = [node('pc', 'PatternCollection', { patternIds: ['g0', 'g1'] }), pmRandom,
      node('out', 'MatrixOutput', { width: 8, height: 8 }),
      node('mic', 'MicInput', { i2sWs: 39, i2sSck: 40, i2sSd: 41 })]
    const wire = [edge('e1', 'pc', 'patternset', 'pm', 'patternset'), edge('e2', 'pm', 'frame', 'out', 'frame'),
      edge('eb', 'pm', 'beat', 'pm', 'beat')]
    const cpp = generateShowSketch(base, wire, groups)
    expect(cpp).toContain('burstStyle = random8(17);')
    expect(cpp).toContain('burstColor = CHSV(random8(), 255, 255);')
  })

  it('adds a beat-triggered early advance only when a beat is wired and a mic hosts _audioBeat', () => {
    // Beat wired but no MicInput → no on-device beat source, so time-based only.
    const noMic = [...nodes]
    const beatEdge = [...edges, edge('eb', 'pm', 'beat', 'pm', 'beat')]
    expect(generateShowSketch(noMic, beatEdge, groups)).not.toContain('_audioBeat &&')

    // Beat wired + a MicInput on the canvas → the controller hosts the engine
    // and uses _audioBeat to advance early after minTime.
    const withMic = [...nodes, node('mic', 'MicInput', { i2sWs: 39, i2sSck: 40, i2sSd: 41 })]
    expect(generateShowSketch(withMic, beatEdge, groups)).toContain('_audioBeat && now - phaseStart >=')
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
          node('fft', 'FFTAnalyzer', {}, [], [{ id: 'bass', dataType: 'float' }]),
          node('bp', 'BassPulse', {}, [{ id: 'bass', dataType: 'float' }], [{ id: 'frame', dataType: 'frame' }]),
          node('go', 'GroupOutput'),
        ],
        edges: [edge('e1', 'fft', 'bass', 'bp', 'bass'), edge('e2', 'bp', 'frame', 'go', 'frame')],
      },
    } as unknown as GroupRegistry
    const showNodes = (withMic: boolean) => [
      node('pc', 'PatternCollection', { patternIds: ['ga'] }),
      node('pm', 'PatternMaster', { minTime: 4, maxTime: 12, transitionSec: 1 }),
      node('out', 'MatrixOutput', { width: 8, height: 8 }),
      ...(withMic ? [node('mic', 'MicInput', { i2sWs: 39, i2sSck: 40, i2sSd: 41 })] : []),
    ]
    const showEdges = [edge('e1', 'pc', 'patternset', 'pm', 'patternset'), edge('e2', 'pm', 'frame', 'out', 'frame')]

    it('hosts the audio engine and makes patterns read the live mic when a MicInput is present', () => {
      const cpp = generateShowSketch(showNodes(true), showEdges, audioGroups)
      expect(cpp).toContain('fl::audio::Config::CreateInmp441')
      expect(cpp).toContain('_audioProcessor = FastLED.add(config);')
      expect(cpp).not.toContain('#include <driver/i2s.h>')
      expect(cpp).toContain('void setupAudio()')
      expect(cpp).toContain('void updateAudio()')
      expect(cpp).toContain('setupAudio();')              // in setup()
      expect(cpp).toMatch(/void loop\(\) \{\n {2}updateAudio\(\);/)   // once per frame
      expect(cpp).toContain('_audioBass')                 // render_p0 reads the live global
      expect(cpp).not.toContain('constrain(0.5f')         // not the placeholder
    })

    it('keeps audio silent when there is no MicInput', () => {
      const cpp = generateShowSketch(showNodes(false), showEdges, audioGroups)
      expect(cpp).not.toContain('driver/i2s.h')
      expect(cpp).not.toContain('updateAudio()')
      expect(cpp).toContain('constrain(0.0f')             // no invented hardware signal
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
