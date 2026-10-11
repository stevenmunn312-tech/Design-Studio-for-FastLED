import type { StudioNode, StudioEdge } from '../state/graphStore'
import { NODE_LIBRARY, libraryDefaults } from '../state/nodeLibrary'

const node = (id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode => {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
    nodeType, label: definition?.label ?? nodeType, category: definition?.category ?? 'graph',
    properties: { ...libraryDefaults(nodeType), ...properties }, inputs: definition?.inputs ?? (nodeType === 'GroupOutput' ? [{ id: 'frame', label: 'Frame', dataType: 'frame' }] : []), outputs: definition?.outputs ?? [],
  } } as StudioNode
}
const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge =>
  ({ id: `${source}-${sourceHandle}-${target}-${targetHandle}`, source, sourceHandle, target, targetHandle }) as StudioEdge

/** Shared regression and compile fixture for elapsed-time template controls. */
export function intervalControlFixture(mode: 'normal' | 'show' | 'player') {
  const nodes = [
    node('board', 'Board', { profileId: 'generic-esp32-s3-n16r8-44pin-dual-usbc' }),
    node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 4 }),
    node('period', 'Math', { a: 0.25, b: 0.25 }), node('timer', 'Interval'),
    node('button', 'ButtonInput', { pin: 5 }),
    node('controls', 'ControlMap', { controls: ['ledToggle', 'brightnessDown'], debounceMs: 30 }),
    node('toggle', 'Trigger', { triggerOp: 'toggle' }),
    node('status', 'InfoDisplay', { partId: 'ssd1306-oled-128x64', sdaPin: 8, sclPin: 9 }),
  ]
  const edges = [
    edge('period', 'result', 'timer', 'interval'),
    edge('timer', 'pulse', 'controls', 'ledToggle'),
    edge('button', 'pressed', 'controls', 'brightnessDown'),
    edge('timer', 'pulse', 'toggle', 'trigger'),
    edge('toggle', 'out', 'status', 'enabled'),
    edge('controls', 'controls', mode === 'player' ? 'player' : 'out', 'controls'),
  ]
  const groups = { pattern: {
    nodes: [node('fill', 'SolidColor'), node('end', 'GroupOutput')],
    edges: [edge('fill', 'frame', 'end', 'frame')],
  } }
  if (mode === 'normal') {
    nodes.push(node('fill', 'SolidColor'))
    edges.push(edge('fill', 'frame', 'out', 'frame'))
  } else if (mode === 'show') {
    nodes.push(node('collection', 'PatternCollection', { patternIds: ['pattern'] }), node('show', 'PatternSlideshow'))
    edges.push(edge('collection', 'patternset', 'show', 'patternset'), edge('show', 'frame', 'out', 'frame'))
  } else {
    nodes.push(node('player', 'PatternMaster'), node('sd', 'SDCard'),
      node('amp', 'Amplifier', { i2sBclk: 14, i2sLrc: 15, i2sDout: 16 }))
    edges.push(edge('player', 'frame', 'out', 'frame'))
  }
  return { nodes, edges, groups }
}

/** Adds both Time outputs, a Wave with wired inputs, and clock feedback. */
export function timeControlFixture(mode: 'normal' | 'show' | 'player') {
  const fixture = intervalControlFixture(mode)
  fixture.nodes.find((entry) => entry.id === 'controls')!.data.properties.controls = ['ledToggle', 'brightnessDown', 'brightness']
  fixture.nodes.push(node('time', 'TimeNode'), node('wave', 'Wave', { amplitude: 0.5 }),
    node('phase', 'Math', { b: -0.25 }), node('level', 'Math', { b: 0.5 }))
  fixture.edges.push(edge('time', 'time', 'phase', 'a'), edge('phase', 'result', 'wave', 'phase'),
    edge('time', 'dt', 'wave', 'frequency'), edge('wave', 'result', 'level', 'a'),
    edge('level', 'result', 'controls', 'brightness'))
  if (mode !== 'player') {
    fixture.nodes.push(node('speed', 'MasterSpeed', { speed: 0.75 }))
    fixture.edges.push(edge('level', 'result', 'speed', 'speed'))
  }
  return fixture
}

/** Two boundaries around timed controls, with physical contact forwarding. */
export function nestedControlFixture(mode: 'normal' | 'show' | 'player') {
  const fixture = timeControlFixture(mode)
  const ports = [
    { id: 'pulse', label: 'Pulse', dataType: 'bool' },
    { id: 'level', label: 'Level', dataType: 'float' },
    { id: 'enabled', label: 'Enabled', dataType: 'bool' },
    { id: 'contact', label: 'Contact', dataType: 'bool' },
  ]
  const inputPorts = [{ id: 'period', label: 'Period', dataType: 'float' }, ports[3]]
  const group = (id: string, groupId: string) => ({ ...node(id, 'Group', { groupId }),
    data: { ...node(id, 'Group', { groupId }).data, inputs: inputPorts, outputs: ports } }) as StudioNode
  const input = (id: string, paramId: string, dataType: string) => ({ ...node(id, 'GroupInput', { paramId }),
    data: { ...node(id, 'GroupInput', { paramId }).data, outputs: [{ id: 'out', label: paramId, dataType }] } }) as StudioNode
  const terminal = () => ({ ...node('end', 'GroupOutput'),
    data: { ...node('end', 'GroupOutput').data, inputs: ports } }) as StudioNode
  const selected = new Set(['timer', 'toggle', 'time', 'wave', 'phase', 'level'])
  const innerNodes = fixture.nodes.filter((entry) => selected.has(entry.id))
  const internal = fixture.edges.filter((wire) => selected.has(wire.source) && selected.has(wire.target))
  const outward = fixture.edges.filter((wire) => selected.has(wire.source) && !selected.has(wire.target))
  const outputFor = (id: string) => id === 'timer' ? 'pulse' : id === 'toggle' ? 'enabled' : 'level'
  return {
    nodes: [...fixture.nodes.filter((entry) => !selected.has(entry.id)), group('nested', 'wrapper')],
    edges: [
      ...fixture.edges.filter((wire) => !selected.has(wire.source) && !selected.has(wire.target) && wire.source !== 'button'),
      ...outward.map((wire) => ({ ...wire, source: 'nested', sourceHandle: outputFor(wire.source) })),
      edge('period', 'result', 'nested', 'period'), edge('button', 'pressed', 'nested', 'contact'),
      edge('nested', 'contact', 'controls', 'brightnessDown'),
      edge('out', 'display', 'status', 'display'),
    ],
    groups: { ...fixture.groups,
      timed: { nodes: [...innerNodes, input('periodIn', 'period', 'float'), terminal()],
        edges: [...internal, edge('periodIn', 'out', 'timer', 'interval'),
          edge('timer', 'pulse', 'end', 'pulse'), edge('level', 'result', 'end', 'level'), edge('toggle', 'out', 'end', 'enabled')] },
      wrapper: { nodes: [group('timed', 'timed'), input('periodIn', 'period', 'float'), input('contactIn', 'contact', 'bool'), terminal()],
        edges: [edge('periodIn', 'out', 'timed', 'period'), edge('timed', 'pulse', 'end', 'pulse'),
          edge('timed', 'level', 'end', 'level'), edge('timed', 'enabled', 'end', 'enabled'), edge('contactIn', 'out', 'end', 'contact')] },
    },
  }
}
