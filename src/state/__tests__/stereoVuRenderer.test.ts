import { beforeEach, describe, expect, it } from 'vitest'
import {
  blankStereoVuState,
  renderStereoVu,
  STEREO_VU_MODES,
  stereoVuSettings,
  type StereoVuFrame,
  type StereoVuSettings,
} from '../stereoVuMeter'
import { evaluateGraphFull, resetEvaluatorState, type AudioOverride } from '../graphEvaluator'
import { NODE_LIBRARY } from '../nodeLibrary'
import type { StudioEdge, StudioNode } from '../graphStore'

function settings(overrides: Record<string, unknown> = {}, instanceKey = 'fixture-a'): StereoVuSettings {
  return stereoVuSettings({
    ledCount: 8,
    enabled: true,
    visualizationMode: 'Classic Ladder',
    visualizationPolicy: 'Manual',
    cycleInterval: 1,
    palette: 'party',
    leftColor: '#20ff70',
    rightColor: '#20a0ff',
    gain: 1,
    noiseGate: 0,
    responseCurve: 1,
    attackMs: 0,
    releaseMs: 0,
    peakHoldMs: 0,
    peakFall: 1,
    trailAmount: 0.72,
    beatAccent: 0.7,
    brightness: 1,
    ...overrides,
  }, instanceKey)
}

function renderAt(config: StereoVuSettings, left = 0.625, right = 0.25, beat = false, timeSec = 0.1) {
  const initial = blankStereoVuState(config, 0)
  return renderStereoVu({ active: true, left, right, beat, timeSec }, config, initial)
}

function frameHash(frame: StereoVuFrame): string {
  let value = 2166136261
  for (const pixel of [...frame.left, ...frame.right]) {
    for (const channel of [pixel.r, pixel.g, pixel.b]) {
      value ^= channel
      value = Math.imul(value, 16777619)
    }
  }
  return (value >>> 0).toString(16).padStart(8, '0')
}

describe('stereo VU renderer', () => {
  it('keeps a golden vector for every visualization', () => {
    const hashes = Object.fromEntries(STEREO_VU_MODES.map((mode) => {
      const rendered = renderAt(settings({ visualizationMode: mode }), 0.625, 0.25, mode === 'Beat Spark')
      return [mode, frameHash(rendered.frame)]
    }))
    expect(hashes).toEqual({
      'Classic Ladder': 'a06d7203',
      'Palette Fill': '5a5dd8e7',
      'Solid Channel': 'f1ca6d8d',
      'Segmented Blocks': 'd53362fb',
      'Peak Cap': 'd3e62f59',
      'Falling Comet': '06faa65c',
      'Center Burst': '97fea0ad',
      'Frame-Inward': 'fc076976',
      'Dot Runner': '35bf1c3d',
      'History Trail': 'd8a53d5b',
      'Stereo Balance': '76dfca0b',
      'Beat Spark': '08f0ed93',
    })
    expect(new Set(Object.values(hashes)).size).toBe(STEREO_VU_MODES.length)
  })

  it.each([1, 2, 7, 8])('renders edge-case rail length %i', (ledCount) => {
    const rendered = renderAt(settings({ ledCount, visualizationMode: 'Center Burst' }))
    expect(rendered.frame.left).toHaveLength(ledCount)
    expect(rendered.frame.right).toHaveLength(ledCount)
    expect(rendered.frame.left.every((pixel) => Object.values(pixel).every(Number.isFinite))).toBe(true)
  })

  it('maps logical bottom-to-top pixels into each physical data direction', () => {
    const normal = renderAt(settings({ leftDirection: 'Bottom', rightDirection: 'Top' })).frame
    expect(normal.leftPhysical).toEqual(normal.left)
    expect(normal.rightPhysical).toEqual([...normal.right].reverse())
  })

  it('conditions stereo independently and swaps channels without swapping rails', () => {
    const normal = renderAt(settings(), 0.8, 0.2).frame
    const swapped = renderAt(settings({ swapChannels: true }), 0.8, 0.2).frame
    expect(normal.leftLevel).toBeCloseTo(0.8)
    expect(normal.rightLevel).toBeCloseTo(0.2)
    expect(swapped.leftLevel).toBeCloseTo(0.2)
    expect(swapped.rightLevel).toBeCloseTo(0.8)
  })

  it('uses elapsed-time ballistics rather than the number of renders', () => {
    const config = settings({ attackMs: 120, releaseMs: 300 })
    const run = (steps: number) => {
      let state = blankStereoVuState(config, 0)
      let frame: StereoVuFrame | undefined
      for (let i = 1; i <= steps; i++) {
        const rendered = renderStereoVu({ active: true, left: 0.8, right: 0.4, beat: false, timeSec: i / steps }, config, state)
        state = rendered.state
        frame = rendered.frame
      }
      return frame!
    }
    expect(run(60).leftLevel).toBeCloseTo(run(10).leftLevel, 8)
    expect(run(60).rightLevel).toBeCloseTo(run(10).rightLevel, 8)
  })

  it('turns fully black and resets retained state while disabled or inactive', () => {
    const config = settings({ visualizationMode: 'Peak Cap', peakHoldMs: 1000 })
    const lit = renderAt(config, 1, 1).state
    const inactive = renderStereoVu({ active: false, left: 1, right: 1, beat: true, timeSec: 0.2 }, config, lit)
    expect(inactive.frame.active).toBe(false)
    expect(inactive.frame.left.every((pixel) => pixel.r + pixel.g + pixel.b === 0)).toBe(true)
    expect(inactive.state.leftPeak).toBe(0)
  })

  it('resets ballistics when the source identity or rail geometry changes', () => {
    const original = settings({ peakHoldMs: 1000, releaseMs: 1000 }, 'source-a')
    const lit = renderAt(original, 1, 1).state
    const newSource = settings({ peakHoldMs: 1000, releaseMs: 1000 }, 'source-b')
    const sourceReset = renderStereoVu(
      { active: true, left: 0, right: 0, beat: false, timeSec: 0.2 }, newSource, lit,
    )
    expect(sourceReset.state.leftPeak).toBe(0)

    const resized = settings({ ledCount: 3, peakHoldMs: 1000, releaseMs: 1000 }, 'source-a')
    const geometryReset = renderStereoVu(
      { active: true, left: 0, right: 0, beat: false, timeSec: 0.2 }, resized, lit,
    )
    expect(geometryReset.frame.left).toHaveLength(3)
    expect(geometryReset.state.leftPeak).toBe(0)
  })

  it('cycles by time, advances beat policy on rate-limited edges, and shuffles deterministically', () => {
    const timed = settings({ visualizationMode: 'Palette Fill', visualizationPolicy: 'Timed cycle', cycleInterval: 1 })
    expect(renderAt(timed, 0.5, 0.5, false, 2.1).frame.mode).toBe('Segmented Blocks')

    const beat = settings({ visualizationMode: 'Classic Ladder', visualizationPolicy: 'Beat cycle' })
    let state = blankStereoVuState(beat, 0)
    let result = renderStereoVu({ active: true, left: 0.5, right: 0.5, beat: true, timeSec: 0.4 }, beat, state)
    expect(result.frame.mode).toBe('Palette Fill')
    state = result.state
    result = renderStereoVu({ active: true, left: 0.5, right: 0.5, beat: false, timeSec: 0.5 }, beat, state)
    state = result.state
    result = renderStereoVu({ active: true, left: 0.5, right: 0.5, beat: true, timeSec: 0.6 }, beat, state)
    expect(result.frame.mode).toBe('Palette Fill')

    const shuffleA = settings({ visualizationPolicy: 'Shuffle', cycleInterval: 1 }, 'stable-seed')
    const shuffleB = settings({ visualizationPolicy: 'Shuffle', cycleInterval: 1 }, 'stable-seed')
    expect([0.1, 1.1, 2.1].map((time) => renderAt(shuffleA, 0.5, 0.5, false, time).frame.mode))
      .toEqual([0.1, 1.1, 2.1].map((time) => renderAt(shuffleB, 0.5, 0.5, false, time).frame.mode))
  })
})

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((candidate) => candidate.type === nodeType)!
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: definition.label,
      nodeType,
      category: definition.category,
      properties: { ...definition.defaultProperties, ...properties },
      inputs: definition.inputs,
      outputs: definition.outputs,
    },
  } as StudioNode
}

const audio: AudioOverride = {
  active: true,
  micActive: true,
  micBass: 0,
  micMids: 0,
  micTreble: 0,
  spectrum: [],
  detectorSpectrum: [],
  leftLevel: 0.75,
  rightLevel: 0.25,
  channelCount: 2,
}

describe('StereoVuMeter evaluator integration', () => {
  beforeEach(() => resetEvaluatorState())

  it('publishes rendered rails from the explicitly wired Audio source on hot-only passes', () => {
    const nodes = [
      node('mic', 'MicInput'),
      node('audio', 'Audio', { sourceId: 'mic' }),
      node('vu', 'StereoVuMeter', { attackMs: 0, releaseMs: 0, noiseGate: 0, responseCurve: 1, brightness: 1, ledCount: 8 }),
    ]
    const edges = [{
      id: 'audio-vu', source: 'audio', sourceHandle: 'audio', target: 'vu', targetHandle: 'audio',
    }] as StudioEdge[]
    evaluateGraphFull(nodes, edges, 0, 8, 8, {}, false, true, '', audio)
    const result = evaluateGraphFull(nodes, edges, 6, 8, 8, {}, false, true, '', audio)
    const frame = result.outputs.get('vu')?.vu as StereoVuFrame
    expect(result.outputs.has('vu')).toBe(true)
    expect(frame.leftLevel).toBeCloseTo(0.75)
    expect(frame.rightLevel).toBeCloseTo(0.25)
  })

  it('keeps an unwired fixture inactive instead of sampling ambient audio', () => {
    const vu = node('vu', 'StereoVuMeter', { ledCount: 4 })
    const frame = evaluateGraphFull([vu], [], 6, 8, 8, {}, false, true, '', audio)
      .outputs.get('vu')?.vu as StereoVuFrame
    expect(frame.active).toBe(false)
    expect(frame.left.every((pixel) => pixel.r + pixel.g + pixel.b === 0)).toBe(true)
  })
})
