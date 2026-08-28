import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { generateShowSketch, type PatternRenderers } from '../showGenerator'
import { generatePlayerSketch } from '../playerSketchGenerator'
import { stereoVuEmitsFromGraph } from '../stereoVuMeterCpp'
import { buildShowPlayer } from '../../utils/showUpload'
import type { GroupRegistry } from '../../state/graphEvaluator'
import type { StudioEdge, StudioNode } from '../../state/graphStore'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'output', properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge =>
  ({ id, source, sourceHandle, target, targetHandle }) as StudioEdge

const groups = {
  pattern: {
    nodes: [node('solid', 'SolidColor', { r: 20, g: 30, b: 40 }), node('group-out', 'GroupOutput')],
    edges: [edge('group-frame', 'solid', 'frame', 'group-out', 'frame')],
  },
} as unknown as GroupRegistry

const baseNodes = [
  node('collection', 'PatternCollection', { patternIds: ['pattern'] }),
  node('master', 'PatternSlideshow', { interval: 8, transitionSec: 1 }),
  node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 4, chipset: 'WS2812B', colorOrder: 'GRB' }),
]
const baseEdges = [
  edge('patterns', 'collection', 'patternset', 'master', 'patternset'),
  edge('frame', 'master', 'frame', 'out', 'frame'),
]
const meter = node('side-vu', 'StereoVuMeter', {
  targetOutputId: 'out', ledCount: 24, leftDataPin: 5, rightDataPin: 6,
  chipset: 'WS2812B', colorOrder: 'GRB', visualizationMode: 'History Trail',
  visualizationPolicy: 'Manual', brightness: 0.65,
})

describe('generative-show Stereo VU fixture', () => {
  it('uses live microphone stereo globals and refreshes the matrix and rails together', () => {
    const nodes = [
      ...baseNodes,
      node('board', 'Board', { profileId: 'espressif-esp32-s3-devkitc-1' }),
      node('mic', 'MicInput', { i2sWs: 39, i2sSck: 40, i2sSd: 41 }),
      node('audio', 'Audio', { sourceId: 'mic' }),
      meter,
    ]
    const edges = [...baseEdges, edge('audio-vu', 'audio', 'out', 'side-vu', 'audio')]
    const cpp = generateShowSketch(nodes, edges, groups)
    expect(cpp).toContain(STEREO_GLOBAL_MARKER)
    expect(cpp.indexOf('struct StereoVuState {')).toBeLessThan(cpp.indexOf(STEREO_GLOBAL_MARKER))
    expect(cpp.indexOf('struct StereoVuState;')).toBeLessThan(cpp.indexOf('static void _stereoVuRender('))
    expect(cpp).toContain('_audioLeftLevel, _audioRightLevel, _audioBeat, millis()')
    expect(cpp).toContain('FastLED.addLeds<WS2812B, VU_LEFT_PIN_side_vu, GRB>')
    expect(cpp.indexOf('_stereoVuRender(_vuState_side_vu')).toBeGreaterThan(cpp.indexOf('compositeTransition('))
    expect(cpp.indexOf('_stereoVuRender(_vuState_side_vu')).toBeLessThan(cpp.lastIndexOf('FastLED.show();'))
    expect(cpp.match(/FastLED\.show\(\);/g)).toHaveLength(1)
  })

  it('uses PCM1802 left/right capture and emits an explicitly black fixture when its Audio provider is disabled', () => {
    const lineNodes = [
      ...baseNodes, node('board', 'Board', { profileId: 'espressif-esp32-s3-devkitc-1' }),
      node('line', 'LineInput', { i2sMclk: 15, i2sBclk: 16, i2sLrclk: 17, i2sDout: 18, channel: 'Both' }),
      node('audio', 'Audio', { sourceId: 'line' }), meter,
    ]
    const edges = [...baseEdges, edge('audio-vu', 'audio', 'out', 'side-vu', 'audio')]
    const pcm = generateShowSketch(lineNodes, edges, groups)
    expect(pcm).toContain('_audioLeftLevel = _lineInput ? _lineInput->leftLevel() : 0.0f;')
    expect(pcm).toContain('_audioRightLevel = _lineInput ? _lineInput->rightLevel() : 0.0f;')

    const disabled = generateShowSketch([
      ...baseNodes, node('audio', 'Audio', { sourceId: '' }), meter,
    ], edges, groups)
    expect(disabled).toContain('paldef_party, false, 0.0f, 0.0f, false, millis()')
  })
})

const STEREO_GLOBAL_MARKER = 'StereoVuState _vuState_side_vu = {}'
const renderers: PatternRenderers = {
  buffers: [], helpers: [], params: [], count: 1,
  functions: ['void render_p0(uint32_t ms) { leds[0] = CRGB((uint8_t)ms, 0, 0); }'],
}

describe('Music Player Stereo VU fixture', () => {
  const playerMeters = stereoVuEmitsFromGraph(
    [node('audio', 'Audio', { sourceId: 'music' }), meter],
    [edge('audio-vu', 'audio', 'out', 'side-vu', 'audio')],
    { active: '_decoderTapLive', left: '_audioLeftLevel', right: '_audioRightLevel', beat: '_audioBeat' },
  )

  it('measures decoded stereo before the existing mono analysis mix and mirrors mono files', () => {
    const cpp = generatePlayerSketch({}, renderers, { stereoVuMeters: playerMeters })
    expect(cpp.indexOf('struct StereoVuState {')).toBeLessThan(cpp.indexOf(STEREO_GLOBAL_MARKER))
    expect(cpp).toContain('stereo[1] = stereo[0]')
    expect(cpp).toContain('leftSquares += (uint64_t)((int64_t)stereo[0] * stereo[0])')
    expect(cpp).toContain('rightSquares += (uint64_t)((int64_t)stereo[1] * stereo[1])')
    expect(cpp).toContain('mixedChannels == 1 ? stereo[0] : (stereo[0] + stereo[1]) / 2')
    expect(cpp.indexOf('audio.loop();')).toBeLessThan(cpp.indexOf('updateDecoderAudio();'))
    expect(cpp).toContain('sqrtf((double)leftSquares / levelFrames)')
  })

  it('keeps fixture state across tracks while clearing only decoder capture state', () => {
    const cpp = generatePlayerSketch({}, renderers, { stereoVuMeters: playerMeters })
    expect(cpp).toContain('resetDecoderTapLevels();  // clear capture for the new source; VU state remains intact')
    const resetBody = cpp.slice(cpp.indexOf('void resetDecoderTapLevels()'), cpp.indexOf('void resetDecoderTapLevels()') + 400)
    expect(resetBody).not.toContain('_vuState_side_vu')
    expect(cpp.match(new RegExp(STEREO_GLOBAL_MARKER.replace(/[{}]/g, '\\$&'), 'g'))).toHaveLength(1)
  })

  it('parses stereo and legacy baked fallbacks without resetting fixture state', () => {
    const fallbackMeters = stereoVuEmitsFromGraph(
      [node('audio', 'Audio', { sourceId: 'music' }), meter],
      [edge('audio-vu', 'audio', 'out', 'side-vu', 'audio')],
      { active: '(_decoderTapLive || audioEnvFrames > 0)', left: '_audioLeftLevel', right: '_audioRightLevel', beat: '_audioBeat' },
    )
    const cpp = generatePlayerSketch({}, renderers, {
      stereoVuMeters: fallbackMeters, audioEnvelope: true,
    })
    expect(cpp).toContain("tag[0]=='A' && tag[1]=='E' && tag[2]=='N' && tag[3]=='V'")
    expect(cpp).toContain('audioEnvStride = audioEnvVersion == 2 ? 5 : 0;')
    expect(cpp).toContain('_audioLeftLevel = (audioEnv[ib+3]')
    expect(cpp).toContain('_audioLeftLevel = _audioRightLevel = (_audioBass + _audioMids + _audioTreble) / 3.0f;')
    expect(cpp).toContain('paldef_party, (_decoderTapLive || audioEnvFrames > 0), _audioLeftLevel, _audioRightLevel, _audioBeat, millis()')
    expect(cpp.indexOf('_stereoVuRender(_vuState_side_vu')).toBeLessThan(cpp.lastIndexOf('FastLED.show();'))
    expect(cpp).toContain('if (!_decoderTapLive) updateShowAudio(posMs);')
    expect(cpp.match(/FastLED\.show\(\);/g)).toHaveLength(1)
  })

  it('activates the baked fallback through the real upload assembly path', () => {
    const nodes = [...baseNodes, node('audio', 'Audio', { sourceId: 'music' }), meter]
    const edges = [...baseEdges, edge('audio-vu', 'audio', 'out', 'side-vu', 'audio')]
    const cpp = buildShowPlayer(nodes, edges, groups, {
      patternSet: ['pattern'], bakedAudio: true, preferredTrack: 'Track', genericPlayer: false,
    })
    expect(cpp).toContain('(_decoderTapLive || audioEnvFrames > 0)')
    expect(cpp).toContain('if (!_decoderTapLive) updateShowAudio(posMs);')
  })

  it('omits the fixture and decoder tap without an explicit Audio wire', () => {
    const meters = stereoVuEmitsFromGraph(
      [node('audio', 'Audio'), meter], [],
      { active: '_decoderTapLive', left: '_audioLeftLevel', right: '_audioRightLevel', beat: '_audioBeat' },
    )
    const cpp = generatePlayerSketch({}, renderers, { stereoVuMeters: meters })
    expect(meters).toEqual([])
    expect(cpp).not.toContain('_stereoVuRender(')
    expect(cpp).not.toContain('audio_process_i2s(')
  })

  it('threads the root fixture through the real show-upload assembly path', () => {
    const nodes = [
      ...baseNodes, node('audio', 'Audio', { sourceId: 'music' }), meter,
    ]
    const edges = [...baseEdges, edge('audio-vu', 'audio', 'out', 'side-vu', 'audio')]
    const cpp = buildShowPlayer(nodes, edges, groups, {
      patternSet: ['pattern'], bakedAudio: false, preferredTrack: '', genericPlayer: true,
    })
    expect(cpp).toContain(STEREO_GLOBAL_MARKER)
    expect(cpp).toContain('audio_process_i2s(')
    expect(cpp).toContain('_stereoVuRender(_vuState_side_vu')
  })

  it('bakes a wired custom palette into fixed-template sketches', () => {
    const custom = node('custom', 'CustomPalette', {
      colors: ['#ff0000', '#0000ff'], positions: [0, 1],
    })
    const meters = stereoVuEmitsFromGraph(
      [node('audio', 'Audio', { sourceId: 'music' }), custom, meter],
      [
        edge('audio-vu', 'audio', 'out', 'side-vu', 'audio'),
        edge('palette-vu', 'custom', 'palette', 'side-vu', 'paletteIn'),
      ],
      { active: '_decoderTapLive', left: '_audioLeftLevel', right: '_audioRightLevel', beat: '_audioBeat' },
    )
    const cpp = generatePlayerSketch({}, renderers, { stereoVuMeters: meters })
    expect(cpp).toContain('const CRGBPalette16 _vuPalette_side_vu(')
    expect(cpp).toContain('_vuPalette_side_vu, _decoderTapLive, _audioLeftLevel')
  })
})

describe.skipIf(process.env.STEREO_VU_FIXED_COMPILE !== '1')('fixed-generator ESP32-S3 compile proofs', () => {
  it('compiles one generative show and one live-decoder player through the shipping backend', () => {
    const showNodes = [
      ...baseNodes,
      node('board', 'Board', { profileId: 'espressif-esp32-s3-devkitc-1' }),
      node('mic', 'MicInput', { i2sWs: 39, i2sSck: 40, i2sSd: 41 }),
      node('audio', 'Audio', { sourceId: 'mic' }), meter,
    ]
    const showEdges = [...baseEdges, edge('audio-vu', 'audio', 'out', 'side-vu', 'audio')]
    const playerMeters = stereoVuEmitsFromGraph(
      [node('audio', 'Audio', { sourceId: 'music' }), meter],
      [edge('audio-vu', 'audio', 'out', 'side-vu', 'audio')],
      { active: '_decoderTapLive', left: '_audioLeftLevel', right: '_audioRightLevel', beat: '_audioBeat' },
    )
    const fallbackMeters = stereoVuEmitsFromGraph(
      [node('audio', 'Audio', { sourceId: 'music' }), meter],
      [edge('audio-vu', 'audio', 'out', 'side-vu', 'audio')],
      { active: '(_decoderTapLive || audioEnvFrames > 0)', left: '_audioLeftLevel', right: '_audioRightLevel', beat: '_audioBeat' },
    )
    const sketches = [
      ['Stereo VU generative show', generateShowSketch(showNodes, showEdges, groups)],
      ['Stereo VU music player', generatePlayerSketch({}, renderers, { stereoVuMeters: playerMeters })],
      ['Stereo VU baked fallback player', generatePlayerSketch({}, renderers, {
        stereoVuMeters: fallbackMeters, audioEnvelope: true,
      })],
    ] as const
    const directory = mkdtempSync(path.join(os.tmpdir(), 'stereo-vu-fixed-proof-'))
    const proof = [
      'import sys',
      'from pathlib import Path',
      'import app',
      'ino = Path(sys.argv[1]).read_text(encoding="utf-8")',
      'lines, result = app._drain_compile(app._compile_upload_fbuild(sys.argv[2], ino, "esp32:esp32:esp32s3", ""))',
      'print("".join(lines))',
      'print(f"PROOF_RC={result[0]} PHASE={result[1]}")',
      'raise SystemExit(0 if result[0] == 0 else 1)',
    ].join('; ')
    try {
      for (const [index, [label, source]] of sketches.entries()) {
        const inoPath = path.join(directory, `StereoVuFixed${index}.ino`)
        writeFileSync(inoPath, source, 'utf8')
        const output = execFileSync('python', ['-c', proof, inoPath, label], {
          cwd: path.resolve('backend'), encoding: 'utf8', timeout: 15 * 60 * 1000,
        })
        expect(output).toContain('PROOF_RC=0')
      }
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }, 30 * 60 * 1000)
})
