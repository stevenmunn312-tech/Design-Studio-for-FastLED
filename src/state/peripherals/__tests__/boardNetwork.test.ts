import { afterEach, describe, expect, it } from 'vitest'
import {
  boardHostnameProblem, boardNetworkIdentity, defaultBoardHostname, networkBoardIn,
} from '../boardNetwork'
import { useNetworkCredentialsStore } from '../networkCredentials'
import { networkSketchCpp, networkUsedIn } from '../../../codegen/peripherals/networkCpp'
import { generateCpp } from '../../../codegen/cppGenerator'
import { buildGraphDiagnostics, validateGraph } from '../../../utils/validateGraph'
import { boardPartition } from '../../../build/boardPartition'
import { NODE_LIBRARY, libraryDefaults } from '../../nodeLibrary'
import { ROOT_GRAPH_ID, rootGraphNodes, useGraphStore, type StudioEdge, type StudioNode } from '../../graphStore'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: definition?.label ?? nodeType, nodeType, category: definition?.category ?? 'input',
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
    },
  } as StudioNode
}

const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge =>
  ({ id: `${source}-${sourceHandle}-${target}-${targetHandle}`, source, sourceHandle, target, targetHandle }) as StudioEdge

/** Art-Net and an NTP clock on one board: two network users, one identity. */
function twoUsers(board: Record<string, unknown> = {}) {
  const nodes = [
    node('board-root', 'Board', { profileId: 'esp32-generic-devkit-38pin', ...board }),
    node('dmx', 'DMXInput', { inputMode: 'Art-Net', universe: 0 }),
    node('ch', 'DMXChannel', { channel: 1 }),
    node('rtc', 'RTCInput', { timeSource: 'NTP' }),
    node('hour', 'MapRange', { inMin: 0, inMax: 23, outMin: 0, outMax: 1 }),
    node('fill', 'SolidColor'),
    node('fade', 'BrightnessMod'),
    node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
  ]
  const edges = [
    edge('dmx', 'dmx', 'ch', 'dmx'),
    edge('rtc', 'hour', 'hour', 'value'),
    edge('fill', 'frame', 'fade', 'frame'),
    edge('ch', 'value', 'fade', 'brightness'),
    edge('fade', 'frame', 'out', 'frame'),
  ]
  return { nodes, edges }
}

afterEach(() => {
  for (const id of ['board-root', 'board-2', 'dmx', 'rtc']) useNetworkCredentialsStore.getState().removeCredentials(id)
})

describe('a board\'s network identity', () => {
  it('names each board after its id, so removing one never renames another', () => {
    expect(defaultBoardHostname('board-root')).toBe('fastled-board')
    expect(defaultBoardHostname(undefined)).toBe('fastled-board')
    expect(defaultBoardHostname('board-2')).toBe('fastled-board-2')
    expect(defaultBoardHostname('board-12')).toBe('fastled-board-12')
  })

  it('reads the Board with every field trimmed and defaulted', () => {
    expect(boardNetworkIdentity(null)).toEqual({
      hostname: 'fastled-board', useDhcp: true, staticIp: '', staticGateway: '', staticSubnet: '255.255.255.0', staticDns: '',
    })
    const board = node('board-2', 'Board', { wifiHostname: '  den  ', useDhcp: false, staticIp: ' 10.0.0.4 ' })
    expect(boardNetworkIdentity(board)).toMatchObject({ hostname: 'den', useDhcp: false, staticIp: '10.0.0.4' })
    expect(boardNetworkIdentity(node('board-2', 'Board', { wifiHostname: '' })).hostname).toBe('fastled-board-2')
  })

  it('asks for a name the network can carry', () => {
    expect(boardHostnameProblem('')).toBeNull()
    expect(boardHostnameProblem('den-lights-2')).toBeNull()
    expect(boardHostnameProblem('Den Lights')).toBe('can hold only letters, digits and hyphens')
    expect(boardHostnameProblem('-den')).toBe('cannot start or end with a hyphen')
    expect(boardHostnameProblem('x'.repeat(33))).toBe('is longer than 32 characters')
  })

  it('keeps network settings off the network nodes', () => {
    for (const type of ['DMXInput', 'DdpInput', 'WebRemoteInput', 'RTCInput', 'StreamOutput', 'PatternMaster']) {
      const defaults = libraryDefaults(type)
      for (const key of ['wifiHostname', 'useDhcp', 'staticIp', 'staticGateway', 'staticSubnet', 'staticDns']) {
        expect(defaults, `${type}.${key}`).not.toHaveProperty(key)
      }
    }
    expect(libraryDefaults('Board')).toMatchObject({ wifiHostname: '', useDhcp: true, staticSubnet: '255.255.255.0' })
  })
})

describe('the sketch joins as the Board', () => {
  it('brings two network users up on one connection with the Board\'s name and Wi-Fi', () => {
    useNetworkCredentialsStore.getState().setCredentials('board-root', { ssid: 'studio', password: 'secret' })
    const { nodes, edges } = twoUsers({ wifiHostname: 'den-lights' })
    expect(networkUsedIn(nodes)).toBe(true)
    expect(networkBoardIn(nodes)?.id).toBe('board-root')
    const cpp = generateCpp(nodes, edges)
    expect(cpp.match(/^void _netEnsureConnected\(\) \{/gm)).toHaveLength(1)
    expect(cpp).toContain('WiFi.setHostname("den-lights");')
    expect(cpp).toContain('WiFi.begin("studio", "secret");')
  })

  it('applies the Board\'s static address', () => {
    const { nodes } = twoUsers({
      useDhcp: false, staticIp: '10.0.0.40', staticGateway: '10.0.0.1', staticSubnet: '255.255.255.0', staticDns: '',
    })
    expect(networkSketchCpp(nodes).bootstrap).toContain(
      'WiFi.config(IPAddress(10, 0, 0, 40), IPAddress(10, 0, 0, 1), IPAddress(255, 255, 255, 0), IPAddress(0, 0, 0, 0));')
  })

  it('escapes a hostname that reaches C++ whatever is typed', () => {
    const { nodes } = twoUsers({ wifiHostname: 'den"); evil(); //' })
    expect(networkSketchCpp(nodes).bootstrap).toContain('WiFi.setHostname("den\\"); evil(); //");')
  })

  it('gives each board of a project its own name and Wi-Fi', () => {
    useNetworkCredentialsStore.getState().setCredentials('board-root', { ssid: 'hall', password: 'one' })
    useNetworkCredentialsStore.getState().setCredentials('board-2', { ssid: 'stage', password: 'two' })
    const nodes = [
      node('board-root', 'Board', { profileId: 'esp32-generic-devkit-38pin' }),
      node('board-2', 'Board', { profileId: 'esp32-generic-devkit-38pin' }),
      node('dmx1', 'DMXInput', { inputMode: 'Art-Net', universe: 0 }),
      node('dmx2', 'DMXInput', { inputMode: 'Art-Net', universe: 1, boardId: 'board-2' }),
      node('out1', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
      node('out2', 'MatrixOutput', { width: 8, height: 8, dataPin: 5, boardId: 'board-2' }),
      node('fill', 'SolidColor'),
    ]
    const edges = [edge('fill', 'frame', 'out1', 'frame'), edge('fill', 'frame', 'out2', 'frame')]
    const one = boardPartition(nodes, edges, 'board-root')
    const two = boardPartition(nodes, edges, 'board-2')
    const first = networkSketchCpp(one.nodes).bootstrap
    const second = networkSketchCpp(two.nodes).bootstrap
    expect(first).toContain('WiFi.setHostname("fastled-board");')
    expect(first).toContain('WiFi.begin("hall", "one");')
    expect(second).toContain('WiFi.setHostname("fastled-board-2");')
    expect(second).toContain('WiFi.begin("stage", "two");')
  })
})

describe('validating the Board\'s network', () => {
  it('asks the Board once for a Wi-Fi name, however many nodes use it, and offers its settings', () => {
    const { nodes, edges } = twoUsers()
    const warnings = validateGraph(nodes, edges, 'esp32:esp32:esp32').warnings
    expect(warnings.filter((warning) => warning.includes('Wi-Fi SSID'))).toEqual(['Board is missing its Wi-Fi SSID'])
    expect(warnings.some((warning) => warning.includes('disagree'))).toBe(false)
    const card = buildGraphDiagnostics(nodes, edges, { selectedFqbn: 'esp32:esp32:esp32' })
      .find((issue) => issue.message === 'Board is missing its Wi-Fi SSID')
    expect(card).toMatchObject({ severity: 'warning', nodeIds: ['board-root'], action: 'open-board-settings' })

    useNetworkCredentialsStore.getState().setCredentials('board-root', { ssid: 'studio', password: 'x' })
    expect(validateGraph(nodes, edges, 'esp32:esp32:esp32').warnings.some((warning) => warning.includes('Wi-Fi SSID'))).toBe(false)
  })

  it('checks the Board\'s hostname and static address, not any node\'s', () => {
    useNetworkCredentialsStore.getState().setCredentials('board-root', { ssid: 'studio', password: 'x' })
    const { nodes, edges } = twoUsers({ wifiHostname: 'Den Lights', useDhcp: false, staticIp: '10.0.0', staticGateway: '10.0.0.1' })
    const warnings = validateGraph(nodes, edges, 'esp32:esp32:esp32').warnings
    expect(warnings).toContain("Board's hostname can hold only letters, digits and hyphens")
    expect(warnings).toContain('Board has an invalid static IP address')
    expect(warnings).not.toContain('Board has an invalid gateway address')
    // Nothing on the board uses the network: nothing to ask.
    const quiet = twoUsers({ wifiHostname: 'Den Lights' })
    const offline = quiet.nodes.filter((entry) => entry.id !== 'dmx' && entry.id !== 'rtc')
    expect(validateGraph(offline, [], 'esp32:esp32:esp32').warnings.some((warning) => warning.includes('hostname'))).toBe(false)
  })
})

describe('loading a save from before the Board held the network', () => {
  it('drops each network node\'s own copy of the settings', () => {
    useGraphStore.getState().loadGraph([
      node('board-root', 'Board'),
      { ...node('dmx', 'DMXInput'), data: { ...node('dmx', 'DMXInput').data, properties: {
        ...libraryDefaults('DMXInput'), wifiHostname: 'fastled-dmx', useDhcp: false, staticIp: '10.0.0.2', wifiSsid: 'old',
      } } },
      { ...node('player', 'PatternMaster'), data: { ...node('player', 'PatternMaster').data, properties: {
        ...libraryDefaults('PatternMaster'), wifiHostname: 'fastled-radio',
      } } },
    ], [], { activeGraphId: ROOT_GRAPH_ID, graphs: { [ROOT_GRAPH_ID]: { id: ROOT_GRAPH_ID, name: 'Main' } } })
    const byId = new Map(rootGraphNodes(useGraphStore.getState()).map((entry) => [entry.id, entry.data.properties]))
    for (const key of ['wifiHostname', 'useDhcp', 'staticIp', 'wifiSsid']) expect(byId.get('dmx')).not.toHaveProperty(key)
    expect(byId.get('dmx')).toMatchObject({ inputMode: 'Art-Net', udpPort: 6454 })
    expect(byId.get('player')).not.toHaveProperty('wifiHostname')
  })
})
