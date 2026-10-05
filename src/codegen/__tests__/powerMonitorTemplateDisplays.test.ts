import { INA226_PART_ID } from '../../state/powerMonitor'
import { describe, expect, it } from 'vitest'
import { generateShowSketch } from '../showGenerator'
import { generatePlayerSketch } from '../playerSketchGenerator'
import { playerDisplaysFromGraph } from '../playerDisplays'
import { playerControlGraph } from '../playerControlGraph'
import { buildGraphDiagnostics, findDisplayGeneratorIssues } from '../../utils/validateGraph'
import { applyDisplayTemplate } from '../../state/displayTemplates'
import { createDisplayDocument } from '../../state/displayEditor'
import { NODE_LIBRARY, libraryDefaults } from '../../state/nodeLibrary'
import type { StudioNode, StudioEdge } from '../../state/graphStore'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
    label: def?.label ?? nodeType, nodeType, category: def?.category ?? 'output',
    properties: { ...libraryDefaults(nodeType), ...properties }, inputs: def?.inputs ?? [], outputs: def?.outputs ?? [],
  } } as StudioNode
}
const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge =>
  ({ id: `${source}-${sourceHandle}-${target}-${targetHandle}`, source, sourceHandle, target, targetHandle }) as StudioEdge
const document = applyDisplayTemplate(createDisplayDocument('screen', 240, 240), 'power-monitor')
const documents = { screen: document }
const panels = [
  node('seg4', 'SegmentDisplay'),
  node('seg8', 'SegmentDisplay', { partId: 'max7219-8digit-7segment' }),
  node('oled', 'InfoDisplay', { partId: 'ssd1306-oled-128x64' }),
  node('tft', 'TransportDisplay', { partId: 'st7789-tft-240x240' }),
  node('custom', 'TransportDisplay', { partId: 'st7789-tft-240x240', tftLayout: 'Custom design', displayId: 'screen',
    widgetSources: Object.fromEntries(document.widgets.map((widget) => [widget.id, { field: widget.properties.source, roles: ['value'] }])),
  }),
]
const monitor = node('123-mon', 'PowerMonitorInput')
const powerEdges = panels.map((panel) => edge(monitor.id, 'display', panel.id, 'display'))
const groups = { p: { nodes: [node('fill', 'SolidColor'), node('end', 'GroupOutput')], edges: [edge('fill', 'frame', 'end', 'frame')] } }

describe('Power Monitor displays in template builds', () => {
  it.each(['show', 'player'] as const)('reads the sensor and removes the unsupported-source suggestion in a %s build', (mode) => {
    const nodes = [monitor, ...panels, node('out', 'MatrixOutput')]
    const edges = [...powerEdges]
    if (mode === 'show') {
      nodes.push(node('show', 'PatternSlideshow'), node('set', 'PatternCollection', { patternIds: ['p'] }))
      edges.push(edge('set', 'patternset', 'show', 'patternset'), edge('show', 'frame', 'out', 'frame'))
    } else {
      nodes.push(node('player', 'PatternMaster'), node('sd', 'SDCard'), node('amp', 'Amplifier'))
      edges.push(edge('player', 'frame', 'out', 'frame'))
    }
    const issues = findDisplayGeneratorIssues(nodes, edges, documents)
    expect(issues.errors).toEqual([])
    expect(issues.warnings.filter((issue) => /Power Monitor|widget reads/.test(issue))).toEqual([])
    expect(buildGraphDiagnostics(nodes, edges, { displayDocuments: documents }).filter((issue) =>
      issue.id.startsWith('display-generator-warning') && issue.message.includes('Power Monitor'))).toEqual([])
    const cpp = mode === 'show' ? generateShowSketch(nodes, edges, groups, { displayDocuments: documents })
      : generatePlayerSketch({}, undefined, {
        controlGraph: playerControlGraph(nodes, edges, documents, 'player'),
        displays: playerDisplaysFromGraph(nodes, edges, { sourceIds: new Set(['player']) }),
      })
    expect(cpp).toContain('#include <Wire.h>')
    expect(cpp.match(/^\s*Wire\.begin\(/gm)).toHaveLength(1)
    expect(cpp.indexOf('Wire.begin(')).toBeLessThan(cpp.indexOf('_ina219Begin(0x40);'))
    const loop = cpp.slice(cpp.indexOf('void loop()'))
    expect(loop.match(/_ina219Measure\(/g)).toHaveLength(1)
    expect(loop).toContain('_segAmps_seg4.update(n_123_mon_amps, _segNow_seg4)')
    expect(loop).toContain('_segPowerColonAmps(_segBuf_seg4, _segAmpValue_seg4) ? 2 : 0')
    expect(loop).toContain('_segDec_seg4 != 0')
    expect(loop).not.toContain("_segBuf_seg4[3] = 'A';")
    expect(loop).toContain('_segWatts_seg8.update(n_123_mon_watts, _segNow_seg8)')
    expect(loop).toContain('_segPowerField(_segBuf_seg8 + 4, _segWattValue_seg8, 4)')
    for (const field of ['volts', 'amps', 'watts']) {
      expect(loop).toContain(`dtostrf((double)(n_123_mon_${field})`)
      expect(loop).toContain(`(double)(n_123_mon_${field}), 2,`)
    }
    expect(loop.indexOf('_ina219Measure(')).toBeLessThan(loop.indexOf('_segPowerField('))
  })
  it('starts one sensor bus with no OLED and samples separate INA219 and INA226 monitors once', () => {
    const nodes = [monitor, panels[0], panels[1], node('other', 'PowerMonitorInput', { partId: INA226_PART_ID, i2cAddress: '0x41' }),
      node('out', 'MatrixOutput'), node('show', 'PatternSlideshow'), node('set', 'PatternCollection', { patternIds: ['p'] })]
    const edges = [edge(monitor.id, 'display', 'seg4', 'display'), edge('other', 'display', 'seg8', 'display'),
      edge('set', 'patternset', 'show', 'patternset'), edge('show', 'frame', 'out', 'frame')]
    const cpp = generateShowSketch(nodes, edges, groups)
    expect(cpp).toContain('#include <Wire.h>')
    expect(cpp.match(/^\s*Wire\.begin\(/gm)).toHaveLength(1)
    for (const chip of ['ina219', 'ina226']) {
      expect(cpp.match(new RegExp(`static void _${chip}Measure\\(`, 'g'))).toHaveLength(1)
      expect(cpp.indexOf('Wire.begin(')).toBeLessThan(cpp.indexOf(`  _${chip}Begin(`))
    }
    const loop = cpp.slice(cpp.indexOf('void loop()'))
    expect(loop.match(/_ina219Measure\(/g)).toHaveLength(1)
    expect(loop.match(/_ina226Measure\(/g)).toHaveLength(1)
    expect(loop).toContain('_segWatts_seg8.update(n_other_watts, _segNow_seg8)')
    expect(loop).toContain('_segPowerField(_segBuf_seg8 + 4, _segWattValue_seg8, 4)')
  })

})
