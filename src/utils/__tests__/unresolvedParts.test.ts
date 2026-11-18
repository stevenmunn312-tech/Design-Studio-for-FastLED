import { beforeEach, describe, expect, it } from 'vitest'
import { generateCpp } from '../../codegen/cppGenerator'
import { generateShowSketch } from '../../codegen/showGenerator'
import { collectPinUses } from '../../build/hardwareManifest'
import { ROOT_GRAPH_ID, useGraphStore, type StudioEdge, type StudioNode } from '../../state/graphStore'
import { clearStashedGraphHistory } from '../../state/graphStore'
import { libraryDefaults, NODE_LIBRARY } from '../../state/nodeLibrary'
import { buildGraphDiagnostics, findDeployBlockingErrors, validateGraph } from '../validateGraph'
import { sanitizeWorkspacePayload } from '../workspacePayload'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: definition.label, nodeType, category: definition.category,
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition.inputs, outputs: definition.outputs,
    },
  } as StudioNode
}
const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge =>
  ({ id: `${source}-${sourceHandle}-${target}-${targetHandle}`, source, sourceHandle, target, targetHandle }) as StudioEdge

const UNKNOWN_ID = 'adafruit-vl53l4cx-future-laser'
const UNKNOWN_MESSAGE = "This project uses a part this version doesn't have"

function resetStore() {
  useGraphStore.setState({
    nodes: [], edges: [], selectedNodeId: null, clipboard: null,
    activeGraphId: ROOT_GRAPH_ID,
    graphs: { [ROOT_GRAPH_ID]: { id: ROOT_GRAPH_ID, name: 'Main' } },
    graphData: {}, buildProfile: undefined, trusted: true,
    displayDocuments: {},
  })
  clearStashedGraphHistory()
}

describe('a saved part this version does not have', () => {
  const laser = () => node('laser', 'DistanceInput', { partId: UNKNOWN_ID })
  const wired = () => [laser(), node('trig', 'Trigger')]
  const wires = () => [edge('laser', 'distance', 'trig', 'trigger')]

  it('blocks the deploy gate with an error naming the node and the id', () => {
    const errors = findDeployBlockingErrors(wired(), wires())
    expect(errors.some((message) => message.includes(UNKNOWN_MESSAGE) && message.includes(UNKNOWN_ID) && message.includes('Distance'))).toBe(true)
  })

  it('is one of validateGraph’s errors, and Graph Health explains it', () => {
    const nodes = [...wired(), node('out', 'MatrixOutput')]
    expect(validateGraph(nodes, wires()).errors.some((message) => message.includes(UNKNOWN_ID))).toBe(true)
    const card = buildGraphDiagnostics(nodes, wires()).find((entry) => entry.id === 'laser-unknown-part')
    expect(card).toMatchObject({ severity: 'error', title: UNKNOWN_MESSAGE, nodeIds: ['laser'], propertyKey: 'partId' })
    expect(card?.message).toContain(UNKNOWN_ID)
    expect(card?.fix).toMatch(/newer Design Studio/)
  })

  it('says nothing for a node with no part chosen, which is the default part', () => {
    const fresh = [node('d', 'DistanceInput', { partId: undefined }), node('trig', 'Trigger')]
    expect(findDeployBlockingErrors(fresh, [edge('d', 'distance', 'trig', 'trigger')])
      .filter((message) => message.includes(UNKNOWN_MESSAGE))).toEqual([])
  })

  it('does not blame the stand-in spec for anything else', () => {
    // An address only the stand-in HC-SR04/INA219 specs would refuse is not
    // reported on a node whose part is unknown: the part is the one error.
    const monitor = node('mon', 'PowerMonitorInput', { partId: 'future-power-monitor', i2cAddress: '0x48' })
    const errors = findDeployBlockingErrors([monitor], [])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('future-power-monitor')
  })

  it('generates no code for the node, and never a substituted spec', () => {
    const known = generateCpp([node('laser', 'DistanceInput'), node('trig', 'Trigger')], wires())
    expect(known).toContain('_sr04Measure')

    const unknown = generateCpp(wired(), wires())
    expect(unknown).not.toContain('_sr04Measure')
    expect(unknown).not.toContain('n_laser')
    expect(unknown.startsWith('// Not generated: ')).toBe(true)
    expect(unknown).toContain(UNKNOWN_ID)
  })

  it('leaves the show generator’s fallback to the same rule', () => {
    const code = generateShowSketch(wired(), wires())
    expect(code).not.toContain('_sr04Measure')
    expect(code.startsWith('// Not generated: ')).toBe(true)
  })

  it('keeps an unknown relay board’s ports and wires through a load', () => {
    resetStore()
    const channels = ['channel1', 'channel2', 'channel3', 'channel4'].map((id, index) => ({
      id, label: `Channel ${index + 1}`, dataType: 'bool',
    }))
    const relay = node('relay', 'RelayOutput', { partId: 'relay-module-16ch-future', in1Pin: 4, in2Pin: 5, in3Pin: 18, in4Pin: 19 })
    relay.data.inputs = channels as never
    const trigger = (id: string) => node(id, 'Trigger')
    useGraphStore.getState().loadGraph(
      [relay, trigger('a'), trigger('b')],
      [edge('a', 'out', 'relay', 'channel1'), edge('b', 'out', 'relay', 'channel4')],
    )
    const loaded = useGraphStore.getState()
    const loadedRelay = loaded.nodes.find((entry) => entry.id === 'relay')!
    expect((loadedRelay.data.inputs as Array<{ id: string }>).map((port) => port.id)).toEqual(['channel1', 'channel2', 'channel3', 'channel4'])
    expect(loadedRelay.data.properties).toMatchObject({ partId: 'relay-module-16ch-future', in3Pin: 18, in4Pin: 19 })
    expect(loaded.edges.map((entry) => entry.targetHandle)).toEqual(['channel1', 'channel4'])
  })

  it('still derives a known relay board’s ports on load', () => {
    resetStore()
    const relay = node('relay', 'RelayOutput', { partId: 'relay-module-4ch-5v' })
    useGraphStore.getState().loadGraph([relay], [])
    expect(useGraphStore.getState().nodes.find((entry) => entry.id === 'relay')!.data.inputs).toHaveLength(4)
  })
})

describe('a pin or bus on another part', () => {
  const gpioNode = () => node('relay', 'RelayOutput', { partId: 'relay-module-2ch-5v', in1Pin: { part: 'exp1', pin: 4 }, in2Pin: 5 })
  const busNode = () => node('temp', 'LightInput', { partId: 'adafruit-bh1750-light-sensor', i2cBus: { part: 'mux1', channel: 2 } })

  it('blocks the gate with the same kind of error, naming the node', () => {
    const pin = findDeployBlockingErrors([gpioNode()], [])
    expect(pin).toHaveLength(1)
    expect(pin[0]).toContain("uses a pin on another part, which this version can't wire yet")
    expect(pin[0]).toContain('in1Pin')
    const bus = findDeployBlockingErrors([busNode()], [])
    expect(bus.some((message) => message.includes("uses an I2C bus on another part, which this version can't wire yet"))).toBe(true)
  })

  it('explains it in Graph Health', () => {
    const cards = buildGraphDiagnostics([gpioNode(), busNode(), node('out', 'MatrixOutput')], [])
    expect(cards.find((card) => card.id === 'relay-part-pin-in1Pin')).toMatchObject({ severity: 'error', category: 'pins', propertyKey: 'in1Pin' })
    expect(cards.find((card) => card.id === 'temp-part-bus')).toMatchObject({ severity: 'error', nodeIds: ['temp'] })
  })

  it('never claims the reference as a pin, nor the default I2C pair for a bus on a mux', () => {
    const uses = collectPinUses([gpioNode(), busNode()])
    expect(uses.filter((use) => use.nodeId === 'relay').map((use) => [use.propertyKey, use.pin])).toEqual([['in2Pin', 5]])
    expect(uses.filter((use) => use.nodeId === 'temp')).toEqual([])
  })

  it('writes no code from it', () => {
    const code = generateCpp([gpioNode(), node('t', 'Trigger')], [edge('t', 'out', 'relay', 'channel1')])
    expect(code).not.toMatch(/\bNaN\b/)
    expect(code).not.toContain('digitalWrite')
    expect(code.startsWith('// Not generated: ')).toBe(true)
  })

  it('survives opening and saving untouched', () => {
    resetStore()
    const relay = gpioNode()
    const bus = busNode()
    const payload = JSON.parse(JSON.stringify({ nodes: [relay, bus], edges: [] }))
    const sanitized = sanitizeWorkspacePayload(payload)!
    expect(sanitized.dropped).toBe(0)
    expect(sanitized.workspace.nodes.map((entry) => entry.data.properties)).toEqual([relay.data.properties, bus.data.properties])

    useGraphStore.getState().loadGraph(sanitized.workspace.nodes, sanitized.workspace.edges)
    const loaded = useGraphStore.getState().nodes
    expect(loaded.find((entry) => entry.id === 'relay')!.data.properties.in1Pin).toEqual({ part: 'exp1', pin: 4 })
    expect(loaded.find((entry) => entry.id === 'temp')!.data.properties.i2cBus).toEqual({ part: 'mux1', channel: 2 })
  })
})

beforeEach(resetStore)
