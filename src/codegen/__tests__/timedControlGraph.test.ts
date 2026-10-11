import { describe, expect, it } from 'vitest'
import type { StudioEdge, StudioNode } from '../../state/graphStore'
import { NODE_LIBRARY, libraryDefaults } from '../../state/nodeLibrary'
import { addDisplayWidget, createDisplayDocument, updateDisplayWidget } from '../../state/displays/displayEditor'
import type { DisplayDocumentRegistry } from '../../state/displays/displayDocument'
import { intervalControlFixture } from '../../test-utils/intervalControlFixture'
import { createControlGraph, controlGraphCpp } from '../controlGraph'
import { generateCpp } from '../cppGenerator'
import { generateShowSketch } from '../showGenerator'
import { buildShowPlayer } from '../../utils/showUpload'
import { findDisplayGeneratorIssues, findOutputRuntimeIssues } from '../../utils/validateGraph'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: definition?.label ?? nodeType, nodeType, category: definition?.category ?? 'signal',
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
    },
  } as StudioNode
}

const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge => ({
  id: `${source}-${sourceHandle}-${target}-${targetHandle}`,
  source, sourceHandle, target, targetHandle,
}) as StudioEdge

function linesOf(source: string, marker: string): string[] {
  return source.split('\n').filter((line) => line.includes(marker))
}

describe('time-dependent control sources', () => {
  it.each([
    ['Clock', 'beat', 'bool', '_clkOrigin_'],
    ['Envelope', 'result', 'float', '_envT_'],
    ['BeatSin', 'value', 'float', '6.2831853f'],
    ['NoiseSignal', 'value', 'float', 'inoise16'],
    ['Counter', 'value', 'float', '/ 60.0f'],
  ] as const)('%s keeps the normal sketch emitter and the wall clock', (nodeType, port, type, marker) => {
    const signal = node('sig', nodeType)
    const graph = createControlGraph([signal], [])
    expect(graph.resolve('sig', port, type)).not.toBeNull()
    const compiled = controlGraphCpp(graph)
    expect(compiled.loop.join('\n')).not.toContain('_controlTime')
    const normal = generateCpp([signal], [])
    for (const line of linesOf(compiled.loop.join('\n'), marker)) expect(normal).toContain(line)
    expect(normal).toContain(marker)
  })

  it('uses the reset wire and ignores a backward animation jump', () => {
    const button = node('button', 'ButtonInput', { pin: 5 })
    const clk = node('clk', 'Clock', { bpm: 128, beatsPerBar: 4, subdivision: 2 })
    const edges = [edge('button', 'pressed', 'clk', 'reset')]
    const graph = createControlGraph([button, clk], edges)
    expect(graph.resolve('clk', 'beat', 'bool')).not.toBeNull()
    const loop = controlGraphCpp(graph).loop.join('\n')
    expect(loop).toContain('n_button_pressed')
    expect(loop).toContain('_clkOrigin_clk')
    expect(loop).not.toContain('_controlTime')
    const normal = generateCpp([button, clk], edges)
    for (const line of linesOf(loop, '_clk')) expect(normal).toContain(line)
  })

  it('shares a schedule fed by a compile-time RTC', () => {
    const rtc = node('rtc', 'RTCInput', { timeSource: 'Compile Time' })
    const sched = node('sched', 'ScheduleTrigger')
    const edges = [
      edge('rtc', 'valid', 'sched', 'valid'),
      edge('rtc', 'synced', 'sched', 'synced'),
      edge('rtc', 'secondsOfDay', 'sched', 'secondsOfDay'),
      edge('rtc', 'weekday', 'sched', 'weekday'),
      edge('rtc', 'day', 'sched', 'day'),
      edge('rtc', 'month', 'sched', 'month'),
      edge('rtc', 'year', 'sched', 'year'),
    ]
    const graph = createControlGraph([rtc, sched], edges)
    expect(graph.resolve('sched', 'active', 'bool')).not.toBeNull()
    const compiled = controlGraphCpp(graph)
    const loop = compiled.loop.join('\n')
    expect(loop).toContain('n_rtc_dateTime')
    expect(loop).toContain('_schedulePrevActive_sched')
    expect(loop).toContain('_scheduleEnabled_sched = true')
    expect(loop).not.toContain('_rtcNtpConfigured_')
    expect(compiled.forwards.join('\n')).toContain('struct _RtcDateTime;')
    const normal = generateCpp([rtc, sched], edges)
    for (const line of linesOf(loop, '_schedule')) expect(normal).toContain(line)
    for (const line of linesOf(loop, '_rtc')) expect(normal).toContain(line)
  })

  it('refuses NTP before any network code is emitted', () => {
    const rtc = node('rtc', 'RTCInput', { timeSource: 'NTP' })
    const math = node('math', 'Math')
    const graph = createControlGraph([rtc, math], [edge('rtc', 'hour', 'math', 'a')])
    expect(graph.resolve('math', 'result', 'float')).toBeNull()
    expect([...graph.errors].join('\n')).toContain('control graph cannot use NTP. Networking stays with a normal sketch.')
    expect(JSON.stringify(graph.instructions)).not.toContain('_rtcNtpConfigured_')
    expect(() => controlGraphCpp(graph)).toThrow(/cannot use NTP/)
  })

  it('leaves an unread RTC out and arms one serial reader for two DS3231 chips', () => {
    const board = node('board', 'Board', { profileId: 'generic-esp32-s3-n16r8-44pin-dual-usbc' })
    const used = node('used', 'RTCInput', { timeSource: 'DS3231', sdaPin: undefined, sclPin: undefined })
    const other = node('other', 'RTCInput', { timeSource: 'DS3231', sdaPin: undefined, sclPin: undefined })
    const idle = node('idle', 'RTCInput', { timeSource: 'Manual' })
    const math = node('math', 'Math')
    const graph = createControlGraph([board, used, other, idle, math], [
      edge('used', 'hour', 'math', 'a'),
      edge('other', 'hour', 'math', 'b'),
    ])
    expect(graph.resolve('math', 'result', 'float')).not.toBeNull()
    const compiled = controlGraphCpp(graph)
    const loop = compiled.loop.join('\n')
    expect(loop).toContain('n_used_dateTime')
    expect(loop).toContain('n_other_dateTime')
    expect(loop).not.toContain('n_idle_')
    expect(linesOf(loop, '_rtcHandleSerialSet()')).toHaveLength(1)
    expect(compiled.setup.join('\n')).not.toContain('Serial.begin')
    expect(compiled.setup.filter((line) => line.includes('Wire.begin'))).toEqual([
      '  Wire.begin(8, 9);  // I2C pins from the parts on the bus',
    ])
  })

  it('prefers the RTC bus pins over another sensor on the same control graph', () => {
    const board = node('board', 'Board', { profileId: 'generic-esp32-s3-n16r8-44pin-dual-usbc' })
    const rtc = node('rtc', 'RTCInput', { timeSource: 'DS3231', sdaPin: undefined, sclPin: undefined })
    const power = node('power', 'PowerMonitorInput')
    const math = node('math', 'Math')
    const graph = createControlGraph([board, rtc, power, math], [
      edge('rtc', 'hour', 'math', 'a'),
      edge('power', 'volts', 'math', 'b'),
    ])
    expect(graph.resolve('math', 'result', 'float')).not.toBeNull()
    expect(controlGraphCpp(graph).setup.filter((line) => line.includes('Wire.begin'))).toEqual([
      '  Wire.begin(8, 9);  // I2C pins from the parts on the bus',
    ])
  })

  it.each(['ComplexWave', 'Random', 'DMXChannel'])('still refuses %s', (nodeType) => {
    const source = node('src', nodeType)
    const graph = createControlGraph([source], [])
    const port = nodeType === 'ComplexWave' ? 'result' : 'value'
    const type = nodeType === 'Random' ? 'float' : 'float'
    expect(graph.resolve('src', port, type)).toBeNull()
    expect([...graph.errors].join('\n')).toMatch(/unsupported/)
  })
})

describe('local RTC displays in show and player builds', () => {
  function withClock(mode: 'show' | 'player', timeSource = 'Compile Time') {
    const fixture = intervalControlFixture(mode)
    fixture.nodes.push(node('rtc', 'RTCInput', { timeSource }))
    fixture.edges.push(edge('rtc', 'display', 'status', 'display'))
    return fixture
  }

  it('draws a compile-time clock on a show panel', () => {
    const { nodes, edges, groups } = withClock('show')
    const issues = findDisplayGeneratorIssues(nodes, edges, undefined, groups)
    expect(issues.errors).toEqual([])
    expect(issues.warnings.join('\n')).not.toContain('RTC Clock')
    const source = generateShowSketch(nodes, edges, groups)
    expect(source).toContain('n_rtc_dateTime')
    expect(source).toContain('(int)n_rtc_dateTime.hour')
    expect(source.indexOf('#include <FastLED.h>')).toBeLessThan(source.indexOf('struct _RtcDateTime;'))
    expect(source.indexOf('struct _RtcDateTime;')).toBeLessThan(source.indexOf('struct _RtcDateTime {'))
    expect(source.indexOf('struct _RtcDateTime {')).toBeLessThan(source.indexOf('_rtcLeap'))
    expect(source).not.toContain('_rtcNtpConfigured_')
  })

  it('warns for an NTP display and does not emit the network clock', () => {
    const { nodes, edges, groups } = withClock('show', 'NTP')
    const issues = findDisplayGeneratorIssues(nodes, edges, undefined, groups)
    expect(issues.errors.join('\n')).not.toContain('cannot use NTP')
    expect(issues.warnings.join('\n')).toContain('wired to an NTP clock')
    expect(issues.warnings.join('\n')).toContain('Networking stays with a normal sketch')
    const source = generateShowSketch(nodes, edges, groups)
    expect(source).not.toContain('_rtcNtpConfigured_')
    expect(source).not.toContain('n_rtc_dateTime')
  })

  it('reports a scalar NTP wire as a control-graph error', () => {
    const { nodes, edges, groups } = withClock('show', 'NTP')
    edges.push(edge('rtc', 'hour', 'out', 'brightness'))
    const runtime = findOutputRuntimeIssues(nodes, edges, undefined, groups)
    expect(runtime.errors.join('\n')).toContain('cannot use NTP')
  })

  it('reads the player clock without folding in player brightness', () => {
    const { nodes, edges, groups } = withClock('player')
    const issues = findDisplayGeneratorIssues(nodes, edges, undefined, groups)
    expect(issues.errors).toEqual([])
    expect(issues.warnings.join('\n')).not.toContain('RTC Clock')
    const source = buildShowPlayer(nodes, edges, groups, {
      patternSet: ['pattern'], bakedAudio: false, genericPlayer: true, preferredTrack: '',
    })
    const hour = source.split('\n').find((line) => line.includes('n_rtc_dateTime.hour'))
    expect(hour).toBeTruthy()
    expect(hour).not.toContain('playerBrightness')
    expect(source.indexOf('#include <FastLED.h>')).toBeLessThan(source.indexOf('struct _RtcDateTime;'))
  })

  it('binds a show widget to the wired local RTC', () => {
    const fixture = intervalControlFixture('show')
    let doc = addDisplayWidget(createDisplayDocument('screen', 240, 240), 'Text')
    doc = updateDisplayWidget(doc, 'text', (widget) => ({
      ...widget,
      bounds: { x: 8, y: 8, width: 180, height: 28 },
      properties: { ...widget.properties, source: 'time' },
    }))
    const documents: DisplayDocumentRegistry = { screen: doc }
    fixture.nodes.push(
      node('rtc', 'RTCInput', { timeSource: 'Manual' }),
      node('panel', 'TransportDisplay', {
        partId: 'st7789-tft-240x240', tftRotation: '0', tftLayout: 'Custom design', displayId: 'screen',
        sckPin: 17, mosiPin: 18, csPin: 6, dcPin: 7, resetPin: 21, backlightPin: 1,
        widgetSources: { text: { field: 'time', roles: ['value'] } },
      }),
    )
    fixture.edges.push(edge('rtc', 'display', 'panel', 'display'))
    const issues = findDisplayGeneratorIssues(fixture.nodes, fixture.edges, documents, fixture.groups)
    expect(issues.errors).toEqual([])
    expect(issues.warnings.filter((warning) => warning.includes('widget reads'))).toEqual([])
    const source = generateShowSketch(fixture.nodes, fixture.edges, fixture.groups, { displayDocuments: documents })
    expect(source).toContain('_rtcClockText(n_rtc_dateTime)')
  })
})
