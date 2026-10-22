import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { generateCpp } from '../../cppGenerator'
import { STEREO_VU_MODES } from '../../../state/audio/stereoVuMeter'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'

function node(id: string, nodeType: string, category: string, properties: Record<string, unknown> = {}): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category, properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

function edge(id: string, source: string, target: string, sourceHandle: string, targetHandle: string): StudioEdge {
  return { id, source, target, sourceHandle, targetHandle } as StudioEdge
}

const board = node('board', 'Board', 'hardware', { profileId: 'espressif-esp32-s3-devkitc-1' })
const lineIn = node('line', 'LineInput', 'hardware', {
  i2sMclk: 15, i2sBclk: 16, i2sLrclk: 17, i2sDout: 18, channel: 'Both', gain: 1,
})
const audio = node('audio', 'Audio', 'input', { sourceId: 'line' })
const output = node('out', 'MatrixOutput', 'output', {
  width: 8, height: 8, dataPin: 4, chipset: 'WS2812B', colorOrder: 'GRB',
})

function meter(properties: Record<string, unknown> = {}): StudioNode {
  return node('side-vu', 'StereoVuMeter', 'output', {
    leftLedCount: 24,
    rightLedCount: 24,
    leftDataPin: 5,
    rightDataPin: 6,
    chipset: 'WS2812B',
    colorOrder: 'GRB',
    visualizationMode: 'Classic Ladder',
    visualizationPolicy: 'Manual',
    cycleInterval: 8,
    palette: 'party',
    leftColor: '#20ff70',
    rightColor: '#20a0ff',
    gain: 1,
    noiseGate: 0.02,
    responseCurve: 0.6,
    attackMs: 35,
    releaseMs: 280,
    peakHoldMs: 350,
    peakFall: 0.7,
    trailAmount: 0.72,
    beatAccent: 0.7,
    brightness: 0.65,
    enabled: true,
    ...properties,
  })
}

const audioWire = edge('audio-vu', 'audio', 'side-vu', 'audio', 'audio')

function sketch(properties: Record<string, unknown> = {}): string {
  return generateCpp([board, lineIn, audio, output, meter(properties)], [audioWire])
}

describe('normal sketch Stereo VU Meter generation', () => {
  it('emits two independent clockless controllers and consumes the stereo audio globals', () => {
    const cpp = sketch()
    expect(cpp).toContain('#define VU_LEFT_LEDS_side_vu 24')
    expect(cpp).toContain('#define VU_RIGHT_LEDS_side_vu 24')
    expect(cpp).toContain('#define VU_LEFT_PIN_side_vu 5')
    expect(cpp).toContain('#define VU_RIGHT_PIN_side_vu 6')
    // A clockless rail never names a clock pin, so nothing can wire one by accident.
    expect(cpp).not.toContain('VU_LEFT_CLOCK_PIN_side_vu')
    expect(cpp).toContain('FastLED.addLeds<WS2812B, VU_LEFT_PIN_side_vu, GRB>(_vuLeft_side_vu, VU_LEFT_LEDS_side_vu)')
    expect(cpp).toContain('FastLED.addLeds<WS2812B, VU_RIGHT_PIN_side_vu, GRB>(_vuRight_side_vu, VU_RIGHT_LEDS_side_vu)')
    expect(cpp).toContain('_audioLeftLevel, _audioRightLevel, _audioBeat, millis()')
    expect(cpp).toContain('_audioLeftLevel = _lineInput ? _lineInput->leftLevel() : 0.0f;')
    expect(cpp).toContain('_audioRightLevel = _lineInput ? _lineInput->rightLevel() : 0.0f;')
  })

  it('renders the matrix and both rails before exactly one synchronized refresh', () => {
    const cpp = sketch()
    const render = cpp.indexOf('_stereoVuRender(_vuState_side_vu')
    const show = cpp.indexOf('FastLED.show();', render)
    expect(render).toBeGreaterThan(cpp.indexOf('void loop()'))
    expect(show).toBeGreaterThan(render)
    expect(cpp.match(/^ {2}FastLED\.show\(\);/gm)).toHaveLength(1)
  })

  it('generates the two VU rails without requiring a MatrixOutput controller', () => {
    const cpp = generateCpp([board, lineIn, audio, meter({ targetOutputId: '' })], [audioWire])

    expect(cpp).toContain('FastLED.addLeds<WS2812B, VU_LEFT_PIN_side_vu, GRB>')
    expect(cpp).toContain('FastLED.addLeds<WS2812B, VU_RIGHT_PIN_side_vu, GRB>')
    expect(cpp).toContain('_stereoVuRender(_vuState_side_vu')
    expect(cpp.match(/^ {2}FastLED\.show\(\);/gm)).toHaveLength(1)
  })

  it('omits an unwired fixture and its controllers instead of sampling ambient audio', () => {
    const cpp = generateCpp([board, lineIn, audio, output, meter()], [])
    expect(cpp).not.toContain('VU_LEFT_LEDS_side_vu')
    expect(cpp).not.toContain('_stereoVuRender(')
    expect(cpp).toContain('FastLED.show();')
  })

  it('bakes disabled fixtures as an always-black renderer input', () => {
    // Enabled is a constant false, folded into the renderer rather than passed.
    expect(sketch({ enabled: false })).toContain('paldef_party, _audioLeftLevel')
    expect(sketch({ enabled: false })).not.toMatch(/bool enabled[,)]/)
  })

  it.each(STEREO_VU_MODES)('emits the %s visualization through the shared renderer', (mode) => {
    const cpp = sketch({ visualizationMode: mode })
    const expectedMode = STEREO_VU_MODES.indexOf(mode)
    expect(cpp).toContain(`VU_LEFT_LEDS_side_vu, VU_RIGHT_LEDS_side_vu, ${expectedMode}, 0, 8.0f`)
    expect(cpp).toContain('static CRGB _vuPixel(')
  })

  it.each([
    ['Bottom', 'Bottom', 'false, false'],
    ['Top', 'Bottom', 'true, false'],
    ['Bottom', 'Top', 'false, true'],
    ['Top', 'Top', 'true, true'],
  ])('bakes %s/%s physical data direction independently', (leftDirection, rightDirection, flags) => {
    const cpp = sketch({ leftDirection, rightDirection })
    expect(cpp).toContain(`${flags}, false,`)
    expect(cpp).toContain('leftPixels[c.reverseLeft ? c.leftCount - 1 - i : i] = lp;')
    expect(cpp).toContain('rightPixels[c.reverseRight ? c.rightCount - 1 - i : i] = rp;')
  })

  it('emits elapsed-time ballistics, deterministic shuffle, and per-instance history', () => {
    const cpp = sketch({ visualizationPolicy: 'Shuffle' })
    expect(cpp).toContain('float dt = min(0.25f, (now - s.lastMs) / 1000.0f)')
    expect(cpp).toContain('mode = c.policy == 1 ? (c.mode + steps) % 12 : c.shuffle[steps % 12]')
    expect(cpp).toContain('float _vuLeftHistory_side_vu[VU_LEFT_LEDS_side_vu]')
    expect(cpp).toContain('float _vuRightHistory_side_vu[VU_RIGHT_LEDS_side_vu]')
    expect(cpp).toContain('StereoVuState _vuState_side_vu = {}')
  })

  it('uses a wired custom palette in generated firmware', () => {
    const custom = node('custom-palette', 'CustomPalette', 'color', {
      colors: ['#ff0000', '#0000ff'], positions: [0, 1],
    })
    const cpp = generateCpp(
      [board, lineIn, audio, output, custom, meter({ visualizationMode: 'Palette Fill' })],
      [audioWire, edge('palette-vu', 'custom-palette', 'side-vu', 'palette', 'paletteIn')],
    )
    expect(cpp).toContain('CRGBPalette16 pal_custom_palette(')
    expect(cpp).toContain('pal_custom_palette, (bool)_audioProcessor, _audioLeftLevel')
  })
})

describe('Stereo VU Meter expansion (docs/design/stereo-vu-expansion.md)', () => {
  it('registers a clocked chipset with a clock pin per rail', () => {
    const cpp = sketch({ chipset: 'APA102', colorOrder: 'BGR', leftClockPin: 18, rightClockPin: 19 })
    expect(cpp).toContain('#define VU_LEFT_CLOCK_PIN_side_vu 18')
    expect(cpp).toContain('#define VU_RIGHT_CLOCK_PIN_side_vu 19')
    expect(cpp).toContain('FastLED.addLeds<APA102, VU_LEFT_PIN_side_vu, VU_LEFT_CLOCK_PIN_side_vu, BGR>(_vuLeft_side_vu, VU_LEFT_LEDS_side_vu)')
    expect(cpp).toContain('FastLED.addLeds<APA102, VU_RIGHT_PIN_side_vu, VU_RIGHT_CLOCK_PIN_side_vu, BGR>(_vuRight_side_vu, VU_RIGHT_LEDS_side_vu)')
  })

  it('sizes each rail, its history and its loops from its own length', () => {
    const cpp = sketch({ leftLedCount: 40, rightLedCount: 32 })
    expect(cpp).toContain('#define VU_LEFT_LEDS_side_vu 40')
    expect(cpp).toContain('#define VU_RIGHT_LEDS_side_vu 32')
    expect(cpp).toContain('CRGB _vuLeft_side_vu[VU_LEFT_LEDS_side_vu];')
    expect(cpp).toContain('CRGB _vuRight_side_vu[VU_RIGHT_LEDS_side_vu];')
    expect(cpp).toContain('VU_LEFT_LEDS_side_vu, VU_RIGHT_LEDS_side_vu, 0, 0, 8.0f')
    expect(cpp).toContain('uint16_t leftCount, rightCount;')
    expect(cpp).toContain('for (uint16_t i = 0; i < c.leftCount; ++i)')
    expect(cpp).toContain('for (uint16_t i = 0; i < c.rightCount; ++i)')
    expect(cpp).toContain('_vuShiftHistory(leftHistory, c.leftCount, steps, s.leftLevel);')
    expect(cpp).toContain('_vuShiftHistory(rightHistory, c.rightCount, steps, s.rightLevel);')
    expect(cpp).toContain('fill_solid(leftPixels, c.leftCount, CRGB::Black); fill_solid(rightPixels, c.rightCount, CRGB::Black);')
  })

  it('emits a complete, non-colliding set for each of two fixtures on one board', () => {
    const second = node('door-vu', 'StereoVuMeter', 'output', {
      ...(meter().data.properties as Record<string, unknown>),
      leftLedCount: 12, rightLedCount: 10, leftDataPin: 7, rightDataPin: 8, chipset: 'APA102', leftClockPin: 18, rightClockPin: 19,
    })
    const cpp = generateCpp(
      [board, lineIn, audio, output, meter(), second],
      [audioWire, edge('audio-vu-2', 'audio', 'door-vu', 'audio', 'audio')],
    )
    for (const id of ['side_vu', 'door_vu']) {
      expect(cpp).toContain(`StereoVuState _vuState_${id} = {};`)
      expect(cpp).toContain(`const StereoVuConfig _vuConfig_${id} = {`)
      expect(cpp).toContain(`CLEDController& _vuLeftController_${id} = `)
      expect(cpp).toContain(`CLEDController& _vuRightController_${id} = `)
      expect(cpp).toContain(`_stereoVuRender(_vuState_${id}, _vuConfig_${id},`)
    }
    expect(cpp).toContain('#define VU_LEFT_LEDS_door_vu 12')
    expect(cpp).toContain('#define VU_RIGHT_LEDS_door_vu 10')
    expect(cpp).toContain('#define VU_LEFT_PIN_door_vu 7')
    expect(cpp).toContain('#define VU_LEFT_CLOCK_PIN_door_vu 18')
    expect(cpp).not.toContain('VU_LEFT_CLOCK_PIN_side_vu')
    // The shared renderer is defined once; every macro and global is per fixture.
    expect(cpp.match(/static void _stereoVuRender\(/g)).toHaveLength(1)
    const defines = cpp.match(/^#define VU_[A-Z_]+_(?:side|door)_vu /gm) ?? []
    expect(new Set(defines).size).toBe(defines.length)
    expect(cpp.match(/^ {2}FastLED\.show\(\);/gm)).toHaveLength(1)
  })
})

describe.skipIf(process.env.STEREO_VU_COMPILE !== '1')('Stereo VU Meter ESP32-S3 compile proof', () => {
  it('compiles the representative generated normal sketch through the shipping backend path', () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'stereo-vu-proof-'))
    const inoPath = path.join(directory, 'StereoVuProof.ino')
    writeFileSync(inoPath, sketch({ visualizationMode: 'History Trail', leftDirection: 'Top' }), 'utf8')
    const proof = [
      'import sys',
      'from pathlib import Path',
      'import app',
      'ino = Path(sys.argv[1]).read_text(encoding="utf-8")',
      'lines, result = app._drain_compile(app._compile_upload_fbuild("Stereo VU proof", ino, "esp32:esp32:esp32s3", ""))',
      'print("".join(lines))',
      'print(f"PROOF_RC={result[0]} PHASE={result[1]}")',
      'raise SystemExit(0 if result[0] == 0 else 1)',
    ].join('; ')
    try {
      const output = execFileSync('python', ['-c', proof, inoPath], {
        cwd: path.resolve('backend'), encoding: 'utf8', timeout: 15 * 60 * 1000,
      })
      expect(output).toContain('PROOF_RC=0')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }, 15 * 60 * 1000)
})
