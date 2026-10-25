import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildBoardDiagnostics,
  findDeployBlockingErrorsForBoard,
  validateBoards,
} from '../multiBoardValidation'
import { BOARD_LINK_MAX_SLOTS, BOARD_LINK_MAX_TEXT_SLOTS } from '../boardLinkValidation'
import {
  BOARD_LINK_WIFI_DRIVER_RAM_BYTES,
  estimateFirmwareRam,
  firmwareRamContributors,
} from '../validateGraph'
import { boardPartition } from '../../build/boardPartition'
import { useBoardLinkKeyStore } from '../../state/peripherals/boardLinkKey'
import { useNetworkCredentialsStore } from '../../state/peripherals/networkCredentials'
import { UNO_R4_WIFI_FQBN } from '../../state/peripherals/networkCapability'
import { setPanelLayout, useGraphStore } from '../../state/graphStore'
import type { GraphDiagnostic } from '../validateGraph'
import type { StudioEdge, StudioNode } from '../../state/graphStore'

/*
 * What a board link needs of its boards: ESP-NOW on both ends, one Wi-Fi
 * channel, a frame that fits, a key, and no LED picture expected on a remote
 * panel. See docs/design/board-links.md, "Validation".
 */

type Port = { id: string; dataType: string }

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}, outputs: Port[] = []): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'pattern', properties, inputs: [], outputs },
  } as unknown as StudioNode
}

function edge(source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge {
  return { id: `e-${source}-${sourceHandle}-${target}-${targetHandle}`, source, target, sourceHandle, targetHandle } as StudioEdge
}

const S3 = 'esp32:esp32:esp32s3'
const ESP32 = 'esp32:esp32:esp32'
const UNO = 'arduino:avr:uno'
const LINK_ID = '0a1b2c3d'
const on2 = { boardId: 'board-2' }
const targets = { 'board-root': S3, 'board-2': ESP32 }

/**
 * Board 1 shows a pattern whose brightness is a pot on Board 2: one float
 * slot, sent by Board 2. `extra` adds to either list.
 */
function linked(extra: { nodes?: StudioNode[]; edges?: StudioEdge[]; root?: Record<string, unknown> } = {}) {
  const nodes = [
    node('board-root', 'Board', { linkId: LINK_ID, ...extra.root }),
    node('board-2', 'Board'),
    node('p1', 'SolidColor'),
    node('fade', 'BrightnessMod'),
    node('out1', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
    node('pot', 'PotInput', { pin: 34, ...on2 }),
    ...(extra.nodes ?? []),
  ]
  const edges = [
    edge('p1', 'frame', 'fade', 'frame'),
    edge('fade', 'frame', 'out1', 'frame'),
    edge('pot', 'value', 'fade', 'brightness'),
    ...(extra.edges ?? []),
  ]
  return { nodes, edges }
}

const byPrefix = (issues: GraphDiagnostic[], prefix: string) => issues.filter((issue) => issue.id.startsWith(prefix))
const ids = (issues: GraphDiagnostic[]) => issues.map((issue) => issue.id).filter((id) => id.startsWith('board-link-'))

describe('board link validation', () => {
  beforeEach(() => {
    useBoardLinkKeyStore.setState({ byLinkId: {} })
    useBoardLinkKeyStore.getState().createKey(LINK_ID)
  })
  afterEach(() => {
    useBoardLinkKeyStore.setState({ byLinkId: {} })
    for (const id of ['dmx1', 'dmx2', 'board-root', 'board-2']) useNetworkCredentialsStore.getState().removeCredentials(id)
  })

  it('says nothing of a link that has what it needs, nor of boards with no link', () => {
    const { nodes, edges } = linked()
    expect(ids(buildBoardDiagnostics(nodes, edges, { targets }))).toEqual([])
    const unlinked = nodes.filter((entry) => entry.id !== 'pot')
    useBoardLinkKeyStore.setState({ byLinkId: {} })
    expect(ids(buildBoardDiagnostics(unlinked, edges.filter((entry) => entry.source !== 'pot'), { targets }))).toEqual([])
  })

  it('needs ESP-NOW on both ends, and blocks only the board without it', () => {
    const { nodes, edges } = linked()
    const diagnostics = buildBoardDiagnostics(nodes, edges, { targets: { 'board-root': UNO, 'board-2': ESP32 } })
    expect(byPrefix(diagnostics, 'board-link-radio-')).toEqual([expect.objectContaining({
      id: 'board-link-radio-board-root', severity: 'error', category: 'board',
      title: 'Board 1 has no radio for the board link',
      message: 'Board 1 trades values with Board 2 over ESP-NOW, and its selected board has no ESP-NOW radio.',
      fix: 'Choose an ESP32 with a radio (classic, S2, S3, C3 or C6) or an ESP8266 for Board 1.',
      nodeIds: ['board-root'],
    })])
    // The UNO R4 WiFi has Wi-Fi but not ESP-NOW; an H2 has no radio at all.
    expect(ids(buildBoardDiagnostics(nodes, edges, { targets: { 'board-root': S3, 'board-2': UNO_R4_WIFI_FQBN } })))
      .toContain('board-link-radio-board-2')
    expect(ids(buildBoardDiagnostics(nodes, edges, { targets: { 'board-root': S3, 'board-2': 'esp32:esp32:esp32h2' } })))
      .toContain('board-link-radio-board-2')
    expect(ids(buildBoardDiagnostics(nodes, edges, { targets: { 'board-root': S3, 'board-2': 'esp8266:esp8266:nodemcuv2' } })))
      .not.toContain('board-link-radio-board-2')

    expect(findDeployBlockingErrorsForBoard(nodes, edges, 'board-root', UNO))
      .toContainEqual(expect.stringContaining('Board 1 has no radio for the board link'))
    expect(findDeployBlockingErrorsForBoard(nodes, edges, 'board-2', ESP32))
      .not.toContainEqual(expect.stringContaining('no radio for the board link'))
  })

  it('needs linked boards on Wi-Fi to join one network', () => {
    const dmx = (id: string, boardId?: string) =>
      node(id, 'DMXInput', { inputMode: 'Art-Net', universe: 0, ...(boardId ? { boardId } : {}) })
    const { nodes, edges } = linked({ nodes: [dmx('dmx1'), dmx('dmx2', 'board-2')] })
    useNetworkCredentialsStore.getState().setCredentials('dmx1', { ssid: 'home', password: 'secret-one' })
    useNetworkCredentialsStore.getState().setCredentials('dmx2', { ssid: 'studio', password: 'secret-two' })

    const diagnostics = buildBoardDiagnostics(nodes, edges, { targets })
    const card = diagnostics.find((issue) => issue.id === 'board-link-network-board-2')
    expect(card).toMatchObject({
      severity: 'error', category: 'board',
      title: 'Board 1 and Board 2 are on different Wi-Fi networks',
      fix: 'Enter the same Wi-Fi network for Board 2 as for Board 1.',
      nodeIds: ['dmx2', 'dmx1'],
    })
    expect(card?.message).toContain('Board 1 joins "home" and Board 2 joins "studio"')
    // Never a password.
    expect(JSON.stringify(diagnostics)).not.toContain('secret')
    expect(validateBoards(nodes, edges, targets).errors)
      .toContainEqual(expect.stringContaining('Board 1 and Board 2 are on different Wi-Fi networks'))
    // Both boards' gates: either one flashed alone still cannot hear the other.
    for (const boardId of ['board-root', 'board-2']) {
      expect(findDeployBlockingErrorsForBoard(nodes, edges, boardId, targets[boardId as keyof typeof targets]))
        .toContainEqual(expect.stringContaining('different Wi-Fi networks'))
    }

    useNetworkCredentialsStore.getState().setCredentials('dmx2', { ssid: 'home', password: 'secret-two' })
    expect(ids(buildBoardDiagnostics(nodes, edges, { targets }))).toEqual([])
  })

  it('counts a board on a cable alone as off Wi-Fi, on the link channel', () => {
    const dmx2 = node('dmx2', 'DMXInput', { inputMode: 'Art-Net', universe: 0, ...on2 })
    const dmx1 = node('dmx1', 'DMXInput', { inputMode: 'Art-Net', universe: 0 })
    const eth = node('eth', 'EthernetModule', on2)
    const { nodes, edges } = linked({ nodes: [dmx1, dmx2, eth], root: { linkChannel: 6 } })
    useNetworkCredentialsStore.getState().setCredentials('dmx1', { ssid: 'home', password: 'x' })
    useNetworkCredentialsStore.getState().setCredentials('dmx2', { ssid: 'studio', password: 'x' })

    const diagnostics = buildBoardDiagnostics(nodes, edges, { targets })
    expect(ids(diagnostics)).not.toContain('board-link-network-board-2')
    // Not a blocker: it works while the router happens to sit on that channel.
    expect(diagnostics.find((issue) => issue.id === 'board-link-channel-board-2')).toMatchObject({
      severity: 'warning',
      title: 'Board 2 may not hear Board 1',
      fix: "Set the router to channel 6, or set the link channel in Board 1's options to the router's channel.",
    })
    expect(findDeployBlockingErrorsForBoard(nodes, edges, 'board-2', ESP32)
      .some((error) => error.includes('may not hear'))).toBe(false)
  })

  it('refuses a clock reading into a board whose sketch is a slideshow', () => {
    const { nodes, edges } = linked({
      nodes: [
        node('rtc', 'RTCInput', {}, [{ id: 'display', dataType: 'display' }]),
        node('show', 'PatternSlideshow'),
        node('out2', 'MatrixOutput', { width: 8, height: 8, dataPin: 6, ...on2 }),
        node('oled', 'InfoDisplay', on2),
      ],
      edges: [edge('show', 'frame', 'out2', 'frame'), edge('rtc', 'display', 'oled', 'display')],
    })
    const card = buildBoardDiagnostics(nodes, edges, { targets })
      .find((issue) => issue.id === 'board-link-show-receive-board-2-oled')
    expect(card).toMatchObject({ severity: 'error', title: 'Board 2 cannot show a screen reading from another board' })
    expect(findDeployBlockingErrorsForBoard(nodes, edges, 'board-2', ESP32)
      .some((error) => error.includes('cannot show a screen reading'))).toBe(true)
    // A normal sketch on Board 2 draws it.
    const normal = linked({
      nodes: [node('rtc', 'RTCInput', {}, [{ id: 'display', dataType: 'display' }]), node('oled', 'InfoDisplay', on2)],
      edges: [edge('rtc', 'display', 'oled', 'display')],
    })
    expect(ids(buildBoardDiagnostics(normal.nodes, normal.edges, { targets }))
      .filter((id) => id.startsWith('board-link-show-receive'))).toEqual([])
  })

  it('bounds the slots and the text slots one board sends', () => {
    const many = (count: number, dataType: string) => Array.from({ length: count }, (_, index) => ({ id: `v${index}`, dataType }))
    const build = (count: number, dataType: string) => {
      const source = node('bank', 'PotInput', { pin: 35, ...on2 }, many(count, dataType))
      return linked({
        nodes: [source],
        edges: Array.from({ length: count }, (_, index) => edge('bank', `v${index}`, 'fade', `in${index}`)),
      })
    }

    // The pot is one slot already, so this reaches exactly the bound.
    const full = build(BOARD_LINK_MAX_SLOTS - 1, 'float')
    expect(ids(buildBoardDiagnostics(full.nodes, full.edges, { targets }))).toEqual([])
    const over = build(BOARD_LINK_MAX_SLOTS, 'float')
    const card = buildBoardDiagnostics(over.nodes, over.edges, { targets }).find((issue) => issue.id === 'board-link-slots-board-2')
    expect(card).toMatchObject({
      severity: 'error', title: 'Board 2 sends more than the link can carry',
      message: `Board 2 sends ${BOARD_LINK_MAX_SLOTS + 1} values over the link, and one board can send at most ${BOARD_LINK_MAX_SLOTS}.`,
    })
    expect(card?.nodeIds).toEqual(['pot', 'bank'])
    // The sender's gate, not the receiver's.
    expect(findDeployBlockingErrorsForBoard(over.nodes, over.edges, 'board-2', ESP32))
      .toContainEqual(expect.stringContaining('Board 2 sends more than the link can carry'))
    expect(findDeployBlockingErrorsForBoard(over.nodes, over.edges, 'board-root', S3)
      .some((error) => error.includes('sends more than the link can carry'))).toBe(false)

    const text = build(BOARD_LINK_MAX_TEXT_SLOTS, 'string')
    expect(ids(buildBoardDiagnostics(text.nodes, text.edges, { targets }))).toEqual([])
    const tooMuchText = build(BOARD_LINK_MAX_TEXT_SLOTS + 1, 'string')
    expect(buildBoardDiagnostics(tooMuchText.nodes, tooMuchText.edges, { targets })
      .find((issue) => issue.id === 'board-link-text-board-2')).toMatchObject({
      severity: 'error', title: 'Board 2 sends too much text over the link',
      message: `Board 2 sends ${BOARD_LINK_MAX_TEXT_SLOTS + 1} text values over the link, and one board can send at most ${BOARD_LINK_MAX_TEXT_SLOTS}.`,
    })
  })

  it('needs a link key on this machine, and offers to make one', () => {
    const { nodes, edges } = linked()
    useBoardLinkKeyStore.setState({ byLinkId: {} })
    const card = buildBoardDiagnostics(nodes, edges, { targets }).find((issue) => issue.id === 'board-link-key')
    expect(card).toMatchObject({
      severity: 'error', category: 'board',
      title: 'This computer has no key for the board link',
      fix: 'Make a new key here, then upload every linked board again: a board flashed with the old key ignores frames signed with the new one.',
      action: 'renew-board-link-key', repair: { kind: 'renew-board-link-key' },
    })
    // Every linked board's gate, and no unlinked board's.
    expect(findDeployBlockingErrorsForBoard(nodes, edges, 'board-root', S3))
      .toContainEqual(expect.stringContaining('This computer has no key for the board link'))
    expect(findDeployBlockingErrorsForBoard(nodes, edges, 'board-2', ESP32))
      .toContainEqual(expect.stringContaining('This computer has no key for the board link'))
    const three = [...nodes, node('board-3', 'Board'), node('out3', 'MatrixOutput', { width: 4, height: 4, dataPin: 7, boardId: 'board-3' })]
    expect(findDeployBlockingErrorsForBoard(three, [...edges, edge('p1', 'frame', 'out3', 'frame')], 'board-3', ESP32)
      .some((error) => error.includes('key for the board link'))).toBe(false)

    // A project that never had a link id has never had a key either.
    const fresh = linked({ root: { linkId: undefined } })
    expect(buildBoardDiagnostics(fresh.nodes, fresh.edges, { targets })
      .find((issue) => issue.id === 'board-link-key')?.title).toBe('The board link has no key yet')
  })

  it('makes the key through the store, after which the card is gone', () => {
    const fresh = linked({ root: { linkId: undefined } })
    useBoardLinkKeyStore.setState({ byLinkId: {} })
    useGraphStore.setState({ nodes: fresh.nodes, edges: fresh.edges, activeGraphId: 'root', graphData: {} })

    const linkId = useGraphStore.getState().renewBoardLinkKey()
    expect(linkId).toMatch(/^[0-9a-f]{8}$/)
    const nodes = useGraphStore.getState().nodes
    expect(nodes.find((entry) => entry.id === 'board-root')?.data.properties.linkId).toBe(linkId)
    expect(useBoardLinkKeyStore.getState().byLinkId[linkId!]).toMatch(/^[0-9a-f]{32}$/)
    expect(ids(buildBoardDiagnostics(nodes, fresh.edges, { targets }))).not.toContain('board-link-key')

    // An existing id is kept; only the key is new.
    const before = useBoardLinkKeyStore.getState().byLinkId[linkId!]
    expect(useGraphStore.getState().renewBoardLinkKey()).toBe(linkId)
    expect(useBoardLinkKeyStore.getState().byLinkId[linkId!]).not.toBe(before)
  })

  it('warns where a remote panel would draw the LED picture', () => {
    const player = node('player', 'PatternMaster')
    const leds = node('leds', 'MatrixOutput', { width: 8, height: 8, dataPin: 6 })
    const panel = (tftLayout?: string) => node('panel', 'TransportDisplay', { ...on2, ...(tftLayout ? { tftLayout } : {}) })
    const graph = (tftLayout?: string) => linked({
      nodes: [player, leds, panel(tftLayout)],
      edges: [edge('player', 'frame', 'leds', 'frame'), edge('player', 'display', 'panel', 'display')],
    })

    const { nodes, edges } = graph()
    const card = buildBoardDiagnostics(nodes, edges, { targets }).find((issue) => issue.id === 'board-link-picture-panel')
    expect(card).toMatchObject({
      severity: 'warning', category: 'board',
      title: 'TransportDisplay on Board 2 cannot show the LEDs',
      fix: 'Choose the Fixed Transport layout for it, or put the panel on Board 1.',
      edgeIds: ['e-player-display-panel-display'],
      action: 'set-panel-layout',
      repair: { kind: 'set-panel-layout', panelId: 'panel', layout: 'Fixed Transport' },
    })
    expect(card?.message).toContain('Now Playing layout draws the LED picture, which stays on Board 1')
    // The button performs the switch it names, and the card goes with it.
    useGraphStore.getState().loadGraph(nodes, edges)
    expect(setPanelLayout('panel', 'Fixed Transport')).toBe(true)
    expect(setPanelLayout('panel', 'Fixed Transport')).toBe(false)
    const switched = useGraphStore.getState().nodes
    expect(switched.find((entry) => entry.id === 'panel')?.data.properties.tftLayout).toBe('Fixed Transport')
    expect(ids(buildBoardDiagnostics(switched, edges, { targets }))).not.toContain('board-link-picture-panel')
    // A warning, so no gate carries it.
    expect(findDeployBlockingErrorsForBoard(nodes, edges, 'board-2', ESP32).some((error) => error.includes('cannot show the LEDs'))).toBe(false)

    const fixed = graph('Fixed Transport')
    expect(ids(buildBoardDiagnostics(fixed.nodes, fixed.edges, { targets }))).not.toContain('board-link-picture-panel')
    // The same panel on the player's own board draws the picture it has.
    const local = linked({
      nodes: [player, leds, node('panel', 'TransportDisplay')],
      edges: [edge('player', 'frame', 'leds', 'frame'), edge('player', 'display', 'panel', 'display')],
    })
    expect(ids(buildBoardDiagnostics(local.nodes, local.edges, { targets }))).not.toContain('board-link-picture-panel')
  })

  it('prices the Wi-Fi driver on a linked board that was not on the network', () => {
    const { nodes, edges } = linked()
    const one = boardPartition(nodes, edges, 'board-root')
    const estimate = estimateFirmwareRam(one.nodes, one.edges)!
    expect(estimate.radioBytes).toBe(BOARD_LINK_WIFI_DRIVER_RAM_BYTES)
    expect(firmwareRamContributors(estimate)).toContainEqual({ label: 'board link radio', bytes: BOARD_LINK_WIFI_DRIVER_RAM_BYTES })
    const unlinked = boardPartition(nodes.filter((entry) => entry.id !== 'pot'), edges.filter((entry) => entry.source !== 'pot'), 'board-root')
    const base = estimateFirmwareRam(unlinked.nodes, unlinked.edges)!
    expect(base.radioBytes).toBe(0)
    expect(estimate.internalBytes - base.internalBytes).toBe(BOARD_LINK_WIFI_DRIVER_RAM_BYTES)

    // Already on Wi-Fi, the driver is paid for; on a cable alone, it is not.
    const onWifi = linked({ nodes: [node('dmx1', 'DMXInput', { inputMode: 'Art-Net', universe: 0 })] })
    const wifiPartition = boardPartition(onWifi.nodes, onWifi.edges, 'board-root')
    expect(estimateFirmwareRam(wifiPartition.nodes, wifiPartition.edges)!.radioBytes).toBe(0)
    const wired = linked({ nodes: [node('dmx1', 'DMXInput', { inputMode: 'Art-Net', universe: 0 }), node('eth', 'EthernetModule')] })
    const wiredPartition = boardPartition(wired.nodes, wired.edges, 'board-root')
    expect(estimateFirmwareRam(wiredPartition.nodes, wiredPartition.edges)!.radioBytes).toBe(BOARD_LINK_WIFI_DRIVER_RAM_BYTES)
  })
})

describe('board link validation — a screen design on the receiving board', () => {
  it('reads the linked player for every field a Now Playing screen binds, and carries its Controls', async () => {
    const { NODE_LIBRARY, libraryDefaults } = await import('../../state/nodeLibrary')
    const { createDisplayDocument } = await import('../../state/displays/displayEditor')
    const { applyDisplayTemplate } = await import('../../state/displays/displayTemplates')
    const { rootGraphEdges, rootGraphNodes } = await import('../../state/graphStore')
    const full = (id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode => {
      const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
      return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
        label: definition.label, nodeType, category: definition.category,
        properties: { ...libraryDefaults(nodeType), ...properties }, inputs: definition.inputs, outputs: definition.outputs,
      } } as StudioNode
    }
    const wire = (a: string, ah: string, b: string, bh: string) =>
      ({ id: [a, ah, b, bh].join('-'), source: a, sourceHandle: ah, target: b, targetHandle: bh }) as StudioEdge
    useGraphStore.getState().loadGraph([
      full('board-root', 'Board', { linkId: LINK_ID }), full('board-2', 'Board'),
      full('master', 'PatternMaster'), full('card', 'SDCard'), full('amp', 'Amplifier'),
      full('collection', 'PatternCollection'), full('out', 'MatrixOutput', { width: 16, height: 16 }),
      full('tft', 'TransportDisplay', {
        partId: 'st7789v-xpt2046-touch-240x320', tftLayout: 'Custom design', displayId: 'screen-1', ...on2,
      }),
      full('touch', 'TouchInput', { panelId: 'tft', ...on2 }),
    ], [
      wire('collection', 'patternset', 'master', 'patternset'), wire('master', 'frame', 'out', 'frame'),
      wire('card', 'storage', 'master', 'storage'), wire('master', 'audio', 'amp', 'audio'),
      wire('master', 'display', 'tft', 'display'), wire('touch', 'controls', 'master', 'controls'),
    ])
    useGraphStore.getState().setDisplayDocument(applyDisplayTemplate(createDisplayDocument('screen-1', 240, 320), 'now-playing'))
    const state = useGraphStore.getState()
    const nodes = rootGraphNodes(state)
    const edges = rootGraphEdges(state)
    const diagnostics = buildBoardDiagnostics(nodes, edges, { targets, displayDocuments: state.displayDocuments })
    const titles = diagnostics.map((issue) => issue.title)
    expect(titles.filter((title) => /leave a value blank/.test(title))).toEqual([])
    expect(titles.filter((title) => /cannot cross|no controls to send|disconnected|cannot honour/i.test(title))).toEqual([])
  })
})
