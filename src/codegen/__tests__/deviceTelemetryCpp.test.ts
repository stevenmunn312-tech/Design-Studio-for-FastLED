// Telemetry reaches every generator, or it reaches none of them.
//
// A bench instrument that works in the normal sketch and silently does nothing
// in the player is worse than no instrument: the soak would run, report nothing,
// and look like a device that never spoke. So each generator is asserted
// separately here rather than trusting that wiring one wired them all.
//
// The emitted text is checked against the shared contract's own constants, so a
// rename on either side fails here rather than at 115200 baud on a bench.

import { describe, it, expect } from 'vitest'
import { generateCpp } from '../cppGenerator'
import { generateShowSketch } from '../showGenerator'
import { buildShowPlayer } from '../../utils/showUpload'
import { TELEMETRY_INTERVAL_MS, TELEMETRY_MARKER, parseTelemetryLine } from '../../state/deviceTelemetry'
import { boardSupportsTelemetry } from '../deviceTelemetryCpp'
import { NODE_LIBRARY, libraryDefaults } from '../../state/nodeLibrary'
import type { StudioNode, StudioEdge } from '../../state/graphStore'
import type { GroupRegistry } from '../../state/graphEvaluator'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
    label: nodeType, nodeType, category: definition?.category ?? 'output',
    properties: { ...libraryDefaults(nodeType), ...properties },
    inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
  } } as StudioNode
}

const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge =>
  ({ id: `${source}-${sourceHandle}-${target}-${targetHandle}`, source, sourceHandle, target, targetHandle }) as StudioEdge

const board = (reportTelemetry: boolean, profileId = 'generic-esp32-s3-n16r8-44pin-dual-usbc') =>
  node('board', 'Board', { profileId, usePsram: true, reportTelemetry })

const panel = (properties: Record<string, unknown> = {}) => node('panel', 'TransportDisplay', {
  partId: 'st7789v-xpt2046-touch-240x320', tftRotation: '0',
  sckPin: 12, mosiPin: 11, misoPin: 13, csPin: 14, dcPin: 9, resetPin: 8, backlightPin: 7,
  touchSckPin: 12, touchMosiPin: 11, touchMisoPin: 13, touchCsPin: 6, touchIrqPin: 5,
  ...properties,
})

const groups: GroupRegistry = {
  pattern: {
    nodes: [node('fill', 'SolidColor'), node('end', 'GroupOutput')],
    edges: [edge('fill', 'frame', 'end', 'frame')],
  },
} as unknown as GroupRegistry

function normalSketch(reportTelemetry: boolean, profileId?: string): string {
  return generateCpp(
    [board(reportTelemetry, profileId), node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 4 }),
      node('fill', 'SolidColor'), panel({ tftLayout: 'Diagnostics' }),
      node('rtc', 'RTCInput', { timeSource: 'Manual' })],
    [edge('fill', 'frame', 'out', 'frame'), edge('rtc', 'display', 'panel', 'display')],
  )
}

function showSketch(reportTelemetry: boolean): string {
  return generateShowSketch(
    [board(reportTelemetry), node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 4 }),
      node('collection', 'PatternCollection', { patternIds: ['pattern'] }),
      node('show', 'PatternSlideshow')],
    [edge('collection', 'patternset', 'show', 'patternset'), edge('show', 'frame', 'out', 'frame')],
    groups,
  )
}

function playerSketch(reportTelemetry: boolean): string {
  return buildShowPlayer(
    [board(reportTelemetry), node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 4 }),
      node('player', 'PatternMaster'), node('sd', 'SDCard'), node('amp', 'Amplifier')],
    [edge('player', 'frame', 'out', 'frame')],
    groups,
    { patternSet: ['pattern'], bakedAudio: false, genericPlayer: true, preferredTrack: '' },
  )
}

const GENERATORS = [
  { name: 'normal sketch', build: normalSketch },
  { name: 'generative show', build: showSketch },
  { name: 'SD player', build: playerSketch },
] as const

describe('device telemetry in every generator', () => {
  for (const generator of GENERATORS) {
    describe(generator.name, () => {
      it('emits nothing at all when the Board has not asked', () => {
        const source = generator.build(false)
        expect(source).not.toContain('_telReport')
        expect(source).not.toContain('_telLoopBegin')
        expect(source).not.toContain(TELEMETRY_MARKER)
      })

      it('emits the reporter, both loop calls and the marked line when asked', () => {
        const source = generator.build(true)
        expect(source).toContain('void _telReport() {')
        expect(source).toContain('void _telLoopBegin() {')
        expect(source).toContain('  _telLoopBegin();')
        expect(source).toContain('  _telReport();')
        expect(source).toContain(`${TELEMETRY_MARKER} uptime=`)
      })

      it('reports at the interval the app expects', () => {
        expect(generator.build(true)).toContain(`if (elapsedMs < ${TELEMETRY_INTERVAL_MS}ul) return;`)
      })

      it('begins the loop before any work and reports after it', () => {
        const source = generator.build(true)
        const lines = source.split('\n')
        const loopAt = lines.findIndex((line) => line.trim() === 'void loop() {')
        const beginAt = lines.findIndex((line) => line.trim() === '_telLoopBegin();')
        const reportAt = lines.findIndex((line) => line.trim() === '_telReport();')
        expect(loopAt).toBeGreaterThanOrEqual(0)
        expect(beginAt).toBe(loopAt + 1)
        expect(reportAt).toBeGreaterThan(beginAt)
        // Before whatever paces the loop, so the figure is work rather than sleep.
        const paceAt = lines.findIndex((line, index) => index > reportAt && /delay\(16\)/.test(line))
        expect(paceAt).toBeGreaterThan(reportAt)
      })

      it('opens Serial exactly once', () => {
        const source = generator.build(true)
        const opens = source.split('\n').filter((line) => line.includes('Serial.begin(115200)')
          && !line.includes('#')).length
        expect(opens).toBe(1)
      })

      it('never declares the reporter twice', () => {
        expect(generator.build(true).split('void _telReport() {').length - 1).toBe(1)
      })
    })
  }

  it('emits a line the app can actually parse', () => {
    // The emitted printf is a format string, so stand in plausible values for
    // its conversions and require the result to survive the real parser. This is
    // what a format drift would break, and nothing else in the suite would
    // notice it.
    const source = normalSketch(true)
    const format = source.split('\n').find((line) => line.includes(`"${TELEMETRY_MARKER} uptime=`))
    expect(format).toBeDefined()
    const keys = [...source.matchAll(/Serial\.printf\("([^"]*)"/g)]
      .map((match) => match[1])
      .filter((text) => text.includes('=') || text.startsWith(' '))
      .join('')
    const line = keys
      .replace(`${TELEMETRY_MARKER} `, `${TELEMETRY_MARKER} `)
      .replace(/%lu/g, '1234')
      .replace(/%\.1f/g, '12.5')
    const parsed = parseTelemetryLine(line)
    expect(parsed).not.toBeNull()
    expect(parsed?.heapFree).toBe(1234)
    expect(parsed?.fps).toBe(12.5)
    expect(parsed?.psramFree).toBe(1234)
  })
})

describe('what telemetry refuses to do', () => {
  it('leaves a board with no Serial.printf alone rather than breaking its build', () => {
    expect(boardSupportsTelemetry(['avr'])).toBe(false)
    expect(boardSupportsTelemetry(['esp32'])).toBe(true)
    expect(boardSupportsTelemetry(['esp32s3'])).toBe(true)
    expect(boardSupportsTelemetry(['esp8266'])).toBe(true)
    expect(boardSupportsTelemetry(undefined)).toBe(false)
  })

  it('emits no touch fields when nothing can be pressed', () => {
    const source = generateCpp(
      [board(true), node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 4 }), node('fill', 'SolidColor')],
      [edge('fill', 'frame', 'out', 'frame')],
    )
    expect(source).toContain('void _telReport() {')
    expect(source).not.toContain('_telTouchPress')
    expect(source).not.toContain('touchms=')
  })

  it('stamps the press edge when a panel can be touched', () => {
    const source = normalSketch(true)
    expect(source).toContain('void _telTouchPress() {')
    expect(source).toContain('_telTouchPress();')
    expect(source).toContain('touchms=')
  })

  it('omits the draw buffer key when the build allocates none', () => {
    // A fixed layout paints straight to the panel, so there is no buffer to
    // measure and the key must be absent rather than nought.
    expect(normalSketch(true)).not.toContain('drawbuf=')
  })
})
