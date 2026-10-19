import { describe, expect, it } from 'vitest'
import type { StudioEdge, StudioNode } from '../../state/graphStore'
import { buildGraphDiagnostics, findDeployBlockingErrors } from '../validateGraph'
import { estimateWireTime, ledOutputConcurrency, wireTimeAdvice, wireTimeFixes } from '../wireTime'
import { chipsetSendMicros, ledDriverFacts } from '../../build/ledDrivers'

const node = (id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode => ({
  id, type: 'studioNode', position: { x: 0, y: 0 },
  data: { label: id, nodeType, category: 'output', properties, inputs: [], outputs: [] },
}) as StudioNode
const edge = (id: string, source: string, target: string, targetHandle: string): StudioEdge =>
  ({ id, source, sourceHandle: targetHandle, target, targetHandle }) as StudioEdge

const S3 = 'espressif-esp32-s3-devkitc-1'
const ESP32 = 'esp32-generic-devkit-38pin'
const board = (profileId: string, properties: Record<string, unknown> = {}) =>
  node('board', 'Board', { profileId, ...properties })
const strip = (id: string, ledCount: number, properties: Record<string, unknown> = {}) =>
  node(id, 'MatrixOutput', { form: 'strip', ledCount, chipset: 'WS2812B', ...properties })
const panel = (id: string, width: number, height: number, properties: Record<string, unknown> = {}) =>
  node(id, 'MatrixOutput', { form: 'matrix', width, height, chipset: 'WS2812B', ...properties })
const ntp = node('clock', 'RTCInput', { timeSource: 'NTP' })

describe('estimateWireTime', () => {
  it('charges one WS2812B output its chipset send time and compares it with the frame period', () => {
    const estimate = estimateWireTime([board(S3), panel('out', 32, 32)], [])!
    expect(estimate.estimatedMicros).toBe(chipsetSendMicros('WS2812B', 1024))
    expect(estimate.estimatedMicros).toBe(31_000)
    expect(estimate).toMatchObject({ frameRate: 60, maxWireFps: 32, reachableFps: 32, wireBound: true, controllerCount: 1 })
    expect(estimate.facts.chip).toBe('ESP32-S3')
  })

  it('sends outputs at once up to the board, and one after another where it has no parallel driver', () => {
    const outputs = [panel('a', 20, 25), panel('b', 20, 25), panel('c', 20, 25), panel('d', 20, 25)]
    const one = chipsetSendMicros('WS2812B', 500)
    expect(estimateWireTime([board(S3), ...outputs], [])!).toMatchObject({ concurrency: 4, estimatedMicros: one, wireBound: false })
    expect(estimateWireTime([board('esp8266-lolin-d1-mini'), ...outputs], [])!)
      .toMatchObject({ concurrency: 1, estimatedMicros: one * 4 })
  })

  it('list-schedules outputs beyond the slots, longest first', () => {
    // C3: two RMT channels. 300, 200 and 100 LEDs finish on 300 | 200+100.
    const estimate = estimateWireTime([board('esp32-c3-super-mini'), strip('a', 100), strip('b', 300), strip('c', 200)], [])!
    expect(estimate.concurrency).toBe(2)
    expect(estimate.estimatedMicros).toBe(chipsetSendMicros('WS2812B', 200) + chipsetSendMicros('WS2812B', 100))
  })

  it('keeps only the RMT channels that fit at the network rate once Wi-Fi or Ethernet is up', () => {
    const outputs = [panel('a', 20, 25), panel('b', 20, 25), panel('c', 20, 25), panel('d', 20, 25)]
    const s3 = estimateWireTime([board(S3), ntp, ...outputs], [])!
    expect(s3).toMatchObject({ networkActive: true, concurrency: 1 })
    expect(s3.estimatedMicros).toBe(chipsetSendMicros('WS2812B', 500) * 4)
    const esp32 = estimateWireTime([board(ESP32), ntp, ...outputs], [])!
    expect(esp32.concurrency).toBe(2)
  })

  it('counts both Stereo VU rails and excludes an unwired meter', () => {
    const nodes = [board(S3), node('out', 'MatrixOutput', { width: 8, height: 8, chipset: 'WS2812B' }), node('vu', 'StereoVuMeter', { ledCount: 20 })]
    const wired = estimateWireTime(nodes, [edge('audio-vu', 'audio', 'vu', 'audio')])!
    expect(wired).toMatchObject({ ledCount: 104, controllerCount: 3, estimatedMicros: chipsetSendMicros('WS2812B', 64) })
    expect(estimateWireTime(nodes, [])!.controllerCount).toBe(1)
    expect(estimateWireTime([node('vu', 'StereoVuMeter', { ledCount: 30 })], [])).toBeNull()
  })

  it('excludes HUB75 DMA refresh', () => {
    expect(estimateWireTime([board(S3), node('out', 'MatrixOutput', { form: 'hub75', width: 64, height: 32, chipset: 'HUB75' })], [])).toBeNull()
  })

  it('reads an output split into data lanes as one output a lane', () => {
    const estimate = estimateWireTime([board(S3), panel('out', 32, 32, { dataLanes: 4 })], [])!
    expect(estimate).toMatchObject({ controllerCount: 4, ledCount: 1024, estimatedMicros: chipsetSendMicros('WS2812B', 256), wireBound: false })
  })

  it('sends clocked chipsets at their data rate, FastLED default when absent', () => {
    expect(estimateWireTime([board(S3), strip('out', 300, { chipset: 'APA102' })], [])!.estimatedMicros)
      .toBe(chipsetSendMicros('APA102', 300))
    expect(estimateWireTime([board(S3), strip('out', 300, { chipset: 'APA102', dataRateMhz: 12 })], [])!.estimatedMicros)
      .toBe(chipsetSendMicros('APA102', 300, 12_000_000))
  })

  it('treats a named LED driver as auto until its concurrency is recorded', () => {
    const facts = ledDriverFacts('esp32-s3')
    const opts = { networkActive: false, reservedWords: 0 }
    expect(ledOutputConcurrency(facts, 'LCD_CLOCKLESS', opts)).toBe(ledOutputConcurrency(facts, 'auto', opts))
  })
})

describe('wire-time advice', () => {
  it('names the reachable frame rate and offers to lower the Board to it, as advice', () => {
    const nodes = [board(S3), node('pattern', 'SolidColor'), panel('out', 32, 32)]
    const edges = [edge('feed', 'pattern', 'out', 'frame')]
    const card = buildGraphDiagnostics(nodes, edges).find((issue) => issue.id === 'wire-time-frame-rate')!
    expect(card).toMatchObject({
      severity: 'warning', action: 'lower-frame-rate', repair: { kind: 'set-frame-rate', frameRate: 32 }, nodeIds: ['out'],
    })
    expect(card.title).toContain('32 fps')
    expect(card.fix).toContain('32 fps')
    expect(findDeployBlockingErrors(nodes, edges, 'esp32:esp32:esp32s3').join(' ')).not.toMatch(/fps/)
  })

  it('stays quiet when the wire fits the frame period', () => {
    const estimate = estimateWireTime([board(S3), strip('out', 300)], [])
    expect(wireTimeAdvice(estimate)).toEqual([])
    const lowered = estimateWireTime([board(S3, { frameRate: 32 }), panel('out', 32, 32)], [])!
    expect(lowered.wireBound).toBe(false)
    expect(wireTimeFixes(lowered)).toEqual([])
  })

  it('flags RMT outputs that need more memory than the chip has with the network up', () => {
    const outputs = [strip('a', 50), strip('b', 50), strip('c', 50)]
    const advice = wireTimeAdvice(estimateWireTime([board(S3), ntp, ...outputs], []))
    const card = advice.find((issue) => issue.id === 'wire-time-rmt-network')!
    expect(card.severity).toBe('warning')
    expect(card.message).toContain('144')
    expect(card.message).toContain('one at a time')
    expect(wireTimeAdvice(estimateWireTime([board(S3), ...outputs], [])).some((issue) => issue.id === 'wire-time-rmt-network')).toBe(false)
    // Not an RMT driver: PARLIO on the C6.
    expect(wireTimeAdvice(estimateWireTime([board('esp32-c6-devkitc-1'), ntp, ...outputs], []))
      .some((issue) => issue.id === 'wire-time-rmt-network')).toBe(false)
  })
})
