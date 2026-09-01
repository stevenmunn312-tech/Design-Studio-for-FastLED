import { describe, expect, it } from 'vitest'
import { vuNormalizedLevelCpp } from '../stereoLevelCpp'
import { VU_RMS_NOISE_GATE, VU_RMS_REFERENCE, conditionRmsLevel } from '../../audio/stereoLevels'
import { generateShowSketch, type PatternRenderers } from '../showGenerator'
import { generatePlayerSketch } from '../playerSketchGenerator'
import { stereoVuEmitsFromGraph } from '../stereoVuMeterCpp'
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

const renderers: PatternRenderers = {
  buffers: [], helpers: [], params: [], count: 1,
  functions: ['void render_p0(uint32_t ms) { leds[0] = CRGB((uint8_t)ms, 0, 0); }'],
}

const meter = node('side-vu', 'StereoVuMeter', {
  targetOutputId: 'out', ledCount: 24, leftDataPin: 5, rightDataPin: 6,
  chipset: 'WS2812B', colorOrder: 'GRB', visualizationMode: 'Peak Cap',
  visualizationPolicy: 'Manual', brightness: 0.65,
})

/** A level assignment that computes its own RMS instead of calling the shared
 *  conversion. This is what let the player rails read four times low. */
const RAW_LEVEL_ASSIGNMENT = /_audio(Left|Right)Level\s*=\s*[^;]*sqrtf/

describe('vuNormalizedLevelCpp', () => {
  it('derives the gate and reference from the shared TypeScript contract', () => {
    const cpp = vuNormalizedLevelCpp().join('\n')
    expect(cpp).toContain(`(rms - ${VU_RMS_NOISE_GATE}f) / (${VU_RMS_REFERENCE}f - ${VU_RMS_NOISE_GATE}f)`)
    expect(cpp).toContain('float _vuNormalizedLevel(uint64_t squares, size_t frames) noexcept {')
  })

  it('scales the RMS before the gate, not the level after it', () => {
    // A path whose samples are already attenuated has to be corrected against
    // the same reference the gate is defined on. Folding it into gainExpr
    // would scale a level from which the gate had already been subtracted.
    const cpp = vuNormalizedLevelCpp({ rmsScaleExpr: '_comp' }).join('\n')
    expect(cpp.indexOf('rms *= _comp;')).toBeGreaterThan(cpp.indexOf('float rms ='))
    expect(cpp.indexOf('rms *= _comp;')).toBeLessThan(cpp.indexOf('float level ='))
    expect(vuNormalizedLevelCpp().join('\n')).not.toContain('rms *=')
  })

  it('reproduces the PCM1802 member function, gain macro included', () => {
    const cpp = vuNormalizedLevelCpp({
      name: 'normalizedLevel', indent: '  ', qualifier: 'static ', gainExpr: 'MIC_GAIN',
    }).join('\n')
    expect(cpp).toContain('  static float normalizedLevel(uint64_t squares, size_t frames) noexcept {')
    expect(cpp).toContain(`    float level = (rms - ${VU_RMS_NOISE_GATE}f) * MIC_GAIN / (${VU_RMS_REFERENCE}f - ${VU_RMS_NOISE_GATE}f);`)
  })

  it('agrees with conditionRmsLevel on the emitted arithmetic', () => {
    // squares/frames for a steady 0.125 amplitude at 16-bit full scale.
    const amplitude = 0.125 * 32768
    const rms = Math.sqrt((amplitude * amplitude * 4) / 4) / 32768
    expect(rms).toBeCloseTo(0.125, 6)
    expect(conditionRmsLevel(rms)).toBeCloseTo((0.125 - VU_RMS_NOISE_GATE) / (VU_RMS_REFERENCE - VU_RMS_NOISE_GATE), 6)
  })
})

describe('firmware capture paths share one meter scale', () => {
  const baseNodes = [
    node('collection', 'PatternCollection', { patternIds: ['pattern'] }),
    node('master', 'PatternSlideshow', { interval: 8, transitionSec: 1 }),
    node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 4, chipset: 'WS2812B', colorOrder: 'GRB' }),
    node('board', 'Board', { profileId: 'espressif-esp32-s3-devkitc-1' }),
  ]
  const baseEdges = [
    edge('patterns', 'collection', 'patternset', 'master', 'patternset'),
    edge('frame', 'master', 'frame', 'out', 'frame'),
  ]

  it('conditions PCM1802 line-in levels through the shared conversion', () => {
    const cpp = generateShowSketch(
      [...baseNodes,
        node('line', 'LineInput', { i2sMclk: 15, i2sBclk: 16, i2sLrclk: 17, i2sDout: 18, channel: 'Both' }),
        node('audio', 'Audio', { sourceId: 'line' }), meter],
      [...baseEdges, edge('audio-vu', 'audio', 'out', 'side-vu', 'audio')],
      groups,
    )
    expect(cpp).toContain(`float level = (rms - ${VU_RMS_NOISE_GATE}f) * MIC_GAIN`)
    expect(cpp).not.toMatch(RAW_LEVEL_ASSIGNMENT)
  })

  it('undoes the decoder library volume attenuation so the rails meter program level', () => {
    // ESP32-audioI2S scales decoded PCM by volumetable[vol]/64 before the tap
    // runs, so without this the rails followed the volume knob while a mic or
    // line input on the same fixture did not. Bench-measured at volume 18:
    // 48/64 = 0.75, which is what the rails read low by.
    const meters = stereoVuEmitsFromGraph(
      [node('audio', 'Audio', { sourceId: 'music' }), meter],
      [edge('audio-vu', 'audio', 'out', 'side-vu', 'audio')],
      { active: '_decoderTapLive', left: '_audioLeftLevel', right: '_audioRightLevel', beat: '_audioBeat' },
    )
    const cpp = generatePlayerSketch({}, renderers, { stereoVuMeters: meters })
    expect(cpp).toContain('{0,1,2,3,4,6,8,10,12,14,17,20,23,27,30,34,38,43,48,52,58,64}')
    expect(cpp).toContain('rms *= _decoderVolumeComp;')
    // Setup states the starting factor outright: the default volume of 18 maps
    // to volumetable[18] = 48, so the tap sees 48/64 and owes the meter 64/48.
    expect(cpp).toContain('_decoderVolumeComp = 1.3333f;')
    expect(cpp.indexOf('float _decoderVolumeComp')).toBeLessThan(cpp.indexOf('rms *= _decoderVolumeComp;'))
  })

  it('keeps the compensation in step when controls change volume at runtime', () => {
    const meters = stereoVuEmitsFromGraph(
      [node('audio', 'Audio', { sourceId: 'music' }), meter],
      [edge('audio-vu', 'audio', 'out', 'side-vu', 'audio')],
      { active: '_decoderTapLive', left: '_audioLeftLevel', right: '_audioRightLevel', beat: '_audioBeat' },
    )
    const cpp = generatePlayerSketch(
      {},
      renderers,
      {
        stereoVuMeters: meters,
        controls: {
          bindings: { volume: { kind: 'pot', pin: 4 } },
          debounceMs: 25, volumeStep: 0.05, brightnessStep: 0.05,
          repeatDelayMs: 400, repeatIntervalMs: 120,
        },
      },
    )
    expect(cpp).toContain('_decoderVolumeComp = attenuated ? 64.0f / (float)attenuated : 1.0f;')
    // A volume knob that moved the rails but not the compensation would put the
    // inconsistency straight back.
    expect(cpp.indexOf('audio.setVolume(step);')).toBeLessThan(cpp.indexOf('_decoderVolumeComp = attenuated'))
    expect(cpp.indexOf('float _decoderVolumeComp')).toBeLessThan(cpp.indexOf('_decoderVolumeComp = attenuated'))
  })

  it('conditions the decoder tap through the same conversion', () => {
    const meters = stereoVuEmitsFromGraph(
      [node('audio', 'Audio', { sourceId: 'music' }), meter],
      [edge('audio-vu', 'audio', 'out', 'side-vu', 'audio')],
      { active: '_decoderTapLive', left: '_audioLeftLevel', right: '_audioRightLevel', beat: '_audioBeat' },
    )
    const cpp = generatePlayerSketch({}, renderers, { stereoVuMeters: meters })
    expect(cpp).toContain(`float level = (rms - ${VU_RMS_NOISE_GATE}f) / (${VU_RMS_REFERENCE}f - ${VU_RMS_NOISE_GATE}f);`)
    expect(cpp).toContain('_audioLeftLevel = _vuNormalizedLevel(leftSquares, levelFrames);')
    expect(cpp).not.toMatch(RAW_LEVEL_ASSIGNMENT)
    // The helper has to precede its caller in a single translation unit.
    expect(cpp.indexOf('float _vuNormalizedLevel(')).toBeLessThan(cpp.indexOf('_vuNormalizedLevel(leftSquares'))
  })
})
