import { describe, expect, it } from 'vitest'
import { buildHardwareManifest, collectPinUses } from '../../../build/hardwareManifest'
import { generateCpp } from '../../../codegen/cppGenerator'
import {
  itemLayouts, peripheralApproach, peripheralGroundPadIndex, peripheralPadLabel, peripheralPadPoint, peripheralPowerNet, peripheralPowerPadIndex,
  peripheralSignalPadIndex,
} from '../../../components/BuildDiagram/physicalDiagramLayout'
import { buildGraphDiagnostics, findDeployBlockingErrors, validateGraph } from '../../../utils/validateGraph'
import type { StudioEdge, StudioNode } from '../../graphStore'
import { gpioRequirementForProperty, libraryDefaults, NODE_LIBRARY } from '../../nodeLibrary'
import { partById } from '../../../build/parts/partCatalogue'
import { PART_OPTIONS } from '../../../build/parts/partOptions'
import { isHardwareOnlyNodeType } from '../../../build/hardware'
import {
  DEFAULT_ETHERNET_PART_ID, ETHERNET_MODULES, ETHERNET_PIN_KEYS, ethernetSpec, ethernetSpiHost, wiredNetworkIn, wiredNetworkPhrase,
} from '../ethernetModule'
import { useNetworkCredentialsStore } from '../networkCredentials'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: definition?.label ?? nodeType,
      nodeType,
      category: definition?.category ?? 'input',
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition?.inputs ?? [],
      outputs: definition?.outputs ?? [],
    },
  } as StudioNode
}

function edge(id: string, source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge {
  return { id, source, sourceHandle, target, targetHandle } as StudioEdge
}

const ethernet = (props: Record<string, unknown> = {}) => node('eth', 'EthernetModule', props)

/** Art-Net channel 1 driving the brightness of a fill, into one LED output. */
function artNetGraph(extra: StudioNode[] = [], dmxProps: Record<string, unknown> = {}) {
  const nodes = [
    ...extra,
    node('dmx', 'DMXInput', { inputMode: 'Art-Net', universe: 0, ...dmxProps }),
    node('ch', 'DMXChannel', { channel: 1 }),
    node('fill', 'SolidColor', { r: 255, g: 120, b: 40 }),
    node('fade', 'BrightnessMod'),
    node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
  ]
  const edges = [
    edge('e1', 'dmx', 'dmx', 'ch', 'dmx'),
    edge('e2', 'fill', 'frame', 'fade', 'frame'),
    edge('e3', 'ch', 'value', 'fade', 'brightness'),
    edge('e4', 'fade', 'frame', 'out', 'frame'),
  ]
  return { nodes, edges }
}

describe('the Ethernet part', () => {
  it('is a hardware-only part offering exactly the catalogued modules', () => {
    expect(isHardwareOnlyNodeType('EthernetModule')).toBe(true)
    expect(PART_OPTIONS.EthernetModule.options.map((option) => option.id))
      .toEqual(ETHERNET_MODULES.map((module) => module.partId))
  })

  it('reads the WIZ850io pinout and W5500 facts from its catalogue entry', () => {
    const entry = partById(DEFAULT_ETHERNET_PART_ID)
    expect(entry?.pinLabelsLeftToRight).toEqual([
      'GND', 'GND', 'MOSI', 'SCLK', 'SCNn', 'INTn',
      'GND', '3V3D', '3V3D', 'NC', 'RSTn', 'MISO',
    ])
    expect(ethernetSpec(DEFAULT_ETHERNET_PART_ID)).toMatchObject({ controller: 'W5500', interface: 'SPI' })
  })

  it('reads MISO and INTn as inputs and drives the rest', () => {
    const props = libraryDefaults('EthernetModule')
    expect(gpioRequirementForProperty('EthernetModule', 'misoPin', props)?.capability).toBe('digitalInput')
    expect(gpioRequirementForProperty('EthernetModule', 'intPin', props)?.capability).toBe('digitalInput')
    expect(gpioRequirementForProperty('EthernetModule', 'csPin', props)?.capability).toBe('digitalOutput')
  })

  it('knows which chips give it an SPI host of its own', () => {
    expect(ethernetSpiHost('esp32')).toBe('dedicated')
    expect(ethernetSpiHost('esp32-s3')).toBe('dedicated')
    expect(ethernetSpiHost('esp32-c3')).toBe('shared')
    expect(ethernetSpiHost('esp8266')).toBeNull()
    expect(ethernetSpiHost('rp2040')).toBeNull()
  })
})

describe('Ethernet firmware', () => {
  it('brings the network up over the W5500 instead of Wi-Fi', () => {
    const { nodes, edges } = artNetGraph([ethernet()])
    const cpp = generateCpp(nodes, edges)
    expect(cpp).toContain('#include <ETH.h>')
    expect(cpp).toContain('static SPIClass _ethSpi(HSPI);')
    expect(cpp).toContain('_ethSpi.begin(25, 35, 26);')
    expect(cpp).toContain('ETH.begin(ETH_PHY_W5500, 1, 32, 33, 27, _ethSpi)')
    expect(cpp).toContain('return ETH.connected() && ETH.hasIP();')
    expect(cpp).not.toContain('WiFi.begin(')
  })

  it('starts the interface in setup before the Art-Net socket opens on it', () => {
    const { nodes, edges } = artNetGraph([ethernet()])
    const cpp = generateCpp(nodes, edges)
    const setup = cpp.slice(cpp.indexOf('void setup() {'))
    const start = setup.indexOf('_netEnsureConnected();')
    const socket = setup.indexOf('_artnetUdp_dmx.begin(')
    expect(start).toBeGreaterThan(-1)
    expect(socket).toBeGreaterThan(start)
  })

  it('applies a static address to the wired interface', () => {
    const { nodes, edges } = artNetGraph([ethernet()], {
      useDhcp: false, staticIp: '10.0.0.40', staticGateway: '10.0.0.1', staticSubnet: '255.255.255.0', staticDns: '10.0.0.1',
    })
    const cpp = generateCpp(nodes, edges)
    expect(cpp).toContain('ETH.config(IPAddress(10, 0, 0, 40), IPAddress(10, 0, 0, 1), IPAddress(255, 255, 255, 0), IPAddress(10, 0, 0, 1));')
  })

  it('keeps the Wi-Fi bootstrap without a module', () => {
    const { nodes, edges } = artNetGraph()
    const cpp = generateCpp(nodes, edges)
    expect(cpp).toContain('WiFi.begin(')
    expect(cpp).not.toContain('ETH.h')
  })

  it('emits nothing for a module that nothing uses', () => {
    const nodes = [
      ethernet(),
      node('fill', 'SolidColor'),
      node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
    ]
    const cpp = generateCpp(nodes, [edge('e', 'fill', 'frame', 'out', 'frame')])
    expect(cpp).not.toContain('ETH')
    expect(cpp).not.toContain('_netEnsureConnected')
  })
})

describe('Ethernet validation', () => {
  const messages = (nodes: StudioNode[], edges: StudioEdge[], fqbn: string) =>
    buildGraphDiagnostics(nodes, edges, { selectedFqbn: fqbn })
      .filter((issue) => issue.nodeIds.includes('eth'))

  it('refuses a board the ESP32 W5500 driver cannot build for, in the gate and Graph Health', () => {
    const { nodes, edges } = artNetGraph([ethernet()])
    const fqbn = 'esp8266:esp8266:d1_mini'
    expect(findDeployBlockingErrors(nodes, edges, fqbn).some((message) => message.includes('Wired Ethernet'))).toBe(true)
    expect(messages(nodes, edges, fqbn).map((issue) => issue.severity)).toContain('error')
  })

  it('accepts a classic ESP32', () => {
    const { nodes, edges } = artNetGraph([ethernet()])
    expect(findDeployBlockingErrors(nodes, edges, 'esp32:esp32:esp32').filter((message) => message.includes('Ethernet'))).toEqual([])
  })

  it('warns about a module nothing uses', () => {
    const nodes = [ethernet(), node('fill', 'SolidColor'), node('out', 'MatrixOutput', { dataPin: 5 })]
    const edges = [edge('e', 'fill', 'frame', 'out', 'frame')]
    expect(validateGraph(nodes, edges, 'esp32:esp32:esp32').warnings.some((w) => w.includes('Nothing uses the Ethernet module'))).toBe(true)
  })

  it('needs no Wi-Fi SSID when a cable carries the network', () => {
    useNetworkCredentialsStore.getState().setCredentials('dmx', { ssid: '', password: '' })
    const wifi = artNetGraph()
    const wired = artNetGraph([ethernet()])
    const ssidWarning = (warnings: string[]) => warnings.some((w) => w.includes('Wi-Fi SSID'))
    expect(ssidWarning(validateGraph(wifi.nodes, wifi.edges, 'esp32:esp32:esp32').warnings)).toBe(true)
    expect(ssidWarning(validateGraph(wired.nodes, wired.edges, 'esp32:esp32:esp32').warnings)).toBe(false)
  })

  it('on a one-host chip, requires the panel and the module to share SCLK and MOSI', () => {
    const panel = (sck: number, mosi: number) => node('tft', 'TransportDisplay', { sckPin: sck, mosiPin: mosi })
    const fqbn = 'esp32:esp32:esp32c3'
    const apart = artNetGraph([ethernet({ sckPin: 4, mosiPin: 6 }), panel(8, 10)])
    const shared = artNetGraph([ethernet({ sckPin: 4, mosiPin: 6 }), panel(4, 6)])
    const spiIssue = (list: string[]) => list.some((message) => message.includes('same SPI bus'))
    expect(spiIssue(findDeployBlockingErrors(apart.nodes, apart.edges, fqbn))).toBe(true)
    expect(spiIssue(findDeployBlockingErrors(shared.nodes, shared.edges, fqbn))).toBe(false)
    // A chip with a second host gives the module its own bus.
    expect(spiIssue(findDeployBlockingErrors(apart.nodes, apart.edges, 'esp32:esp32:esp32'))).toBe(false)
  })

  it('on a one-host chip, accepts the shared bus lines the panel check asks for', () => {
    // The panel check and the pin-collision walk once disagreed: sharing SCLK
    // and MOSI satisfied one and was a collision to the other, so no C3 with
    // a panel and a module could ever deploy.
    const panel = node('tft', 'TransportDisplay', { sckPin: 4, mosiPin: 6, csPin: 1, dcPin: 0, resetPin: 9, backlightPin: 8 })
    const shared = artNetGraph([ethernet({ sckPin: 4, mosiPin: 6, misoPin: 5, csPin: 7, intPin: 10, resetPin: 3 }), panel])
    shared.nodes.find((entry) => entry.id === 'out')!.data.properties.dataPin = 2
    const fqbn = 'esp32:esp32:esp32c3'
    expect(findDeployBlockingErrors(shared.nodes, shared.edges, fqbn)).toEqual([])
    const pinErrors = buildGraphDiagnostics(shared.nodes, shared.edges, { selectedFqbn: fqbn })
      .filter((issue) => issue.category === 'pins' && issue.severity === 'error')
    expect(pinErrors).toEqual([])
    // Each device still needs its own chip select on the shared bus.
    const sameSelect = artNetGraph([ethernet({ sckPin: 4, mosiPin: 6, misoPin: 5, csPin: 1, intPin: 10, resetPin: 3 }), panel])
    expect(findDeployBlockingErrors(sameSelect.nodes, sameSelect.edges, fqbn)
      .some((message) => message.includes('chip select for more than one device'))).toBe(true)
  })

  it('with a host of its own, refuses the module sharing a panel bus line', () => {
    // The module is on HSPI and the panel on SPI, so one GPIO would carry two
    // peripherals' clocks.
    const panel = node('tft', 'TransportDisplay', { sckPin: 18, mosiPin: 23 })
    const { nodes, edges } = artNetGraph([ethernet({ sckPin: 18, mosiPin: 23 }), panel])
    const errors = findDeployBlockingErrors(nodes, edges, 'esp32:esp32:esp32')
    expect(errors.some((message) => message.startsWith('GPIO 18 ') && message.includes(' SCLK'))).toBe(true)
    expect(errors.some((message) => message.startsWith('GPIO 23 ') && message.includes(' MOSI'))).toBe(true)
  })
})

describe('Ethernet built into the board', () => {
  const wt32 = () => node('board', 'Board', { profileId: 'wt32-eth01' })
  const WT32_FQBN = 'esp32:esp32:wt32-eth01'

  it('carries the network on the WT32-ETH01 with no module on the bench', () => {
    const wired = wiredNetworkIn(artNetGraph([wt32()]).nodes)
    expect(wired).toMatchObject({ kind: 'onboard', boardLabel: 'WT32-ETH01' })
    expect(wiredNetworkPhrase(wired!)).toBe("the WT32-ETH01's own Ethernet port")
    expect(wiredNetworkIn(artNetGraph().nodes)).toBeNull()
  })

  it("starts the LAN8720 on the board's fixed pins instead of Wi-Fi or an SPI module", () => {
    const { nodes, edges } = artNetGraph([wt32()], {
      useDhcp: false, staticIp: '10.0.0.40', staticGateway: '10.0.0.1', staticSubnet: '255.255.255.0', staticDns: '10.0.0.1',
    })
    const cpp = generateCpp(nodes, edges)
    expect(cpp).toContain('#include <ETH.h>')
    expect(cpp).not.toContain('#include <SPI.h>')
    expect(cpp).toContain('ETH.begin(ETH_PHY_LAN8720, 1, 23, 18, 16, ETH_CLOCK_GPIO0_IN)')
    expect(cpp).toContain('ETH.config(IPAddress(10, 0, 0, 40), IPAddress(10, 0, 0, 1), IPAddress(255, 255, 255, 0), IPAddress(10, 0, 0, 1));')
    expect(cpp).toContain('return ETH.connected() && ETH.hasIP();')
    expect(cpp).not.toContain('W5500')
    expect(cpp).not.toContain('WiFi.begin(')
    const setup = cpp.slice(cpp.indexOf('void setup() {'))
    expect(setup.indexOf('_netEnsureConnected();')).toBeGreaterThan(-1)
    expect(setup.indexOf('_artnetUdp_dmx.begin(')).toBeGreaterThan(setup.indexOf('_netEnsureConnected();'))
  })

  it('uses its own port over a module on the bench, and warns that the module never starts', () => {
    const { nodes, edges } = artNetGraph([wt32(), ethernet()])
    const cpp = generateCpp(nodes, edges)
    expect(cpp).toContain('ETH_PHY_LAN8720')
    expect(cpp).not.toContain('ETH_PHY_W5500')
    const issues = buildGraphDiagnostics(nodes, edges, { selectedFqbn: WT32_FQBN })
      // Its default pins land on the WT32's RMII lines too; the pin checks say so separately.
      .filter((issue) => issue.id.startsWith('eth-'))
    expect(issues.map((issue) => [issue.id, issue.severity])).toEqual([['eth-ethernet-onboard', 'warning']])
  })

  it('needs no Wi-Fi SSID for Art-Net or NTP', () => {
    useNetworkCredentialsStore.getState().setCredentials('dmx', { ssid: '', password: '' })
    useNetworkCredentialsStore.getState().setCredentials('rtc', { ssid: '', password: '' })
    const { nodes, edges } = artNetGraph([wt32(), node('rtc', 'RTCInput', { timeSource: 'NTP', ntpServer: 'pool.ntp.org' })])
    const result = validateGraph(nodes, edges, WT32_FQBN)
    expect([...result.errors, ...result.warnings].filter((message) => message.includes('SSID'))).toEqual([])
  })
})

describe('Ethernet on the Build Diagram', () => {
  it('claims its six lines and lands each on the pad WIZnet names', () => {
    const uses = collectPinUses([ethernet()], 'esp32:esp32:esp32')
    expect(uses.map((use) => use.propertyKey)).toEqual([...ETHERNET_PIN_KEYS])
    const [item] = buildHardwareManifest([ethernet()], [], 'esp32:esp32:esp32').primaryItems
    expect(item.kind).toBe('ethernet')
    expect(item.supported).toBe(true)
    const pads = item.pins.map((_, index) => peripheralPadLabel(item, peripheralSignalPadIndex(item, index)))
    expect(pads).toEqual(['SCLK', 'MOSI', 'MISO', 'SCNn', 'INTn', 'RSTn'])
  })

  it('takes the 3.3 V rail on 3V3D and grounds the bottom-row GND pad', () => {
    const [item] = buildHardwareManifest([ethernet()], [], 'esp32:esp32:esp32').primaryItems
    expect(peripheralPadLabel(item, peripheralPowerPadIndex(item)!)).toBe('3V3D')
    expect(peripheralPowerNet(item)).toBe('v3v3')
    // J2 pin 1, not J1 pin 1: the stub hangs down, and the top row's would
    // sit under the module's own picture.
    expect(peripheralGroundPadIndex(item)).toBe(6)
  })

  it('climbs to a top-row pad between the bottom-row pads, never through one', () => {
    const [item] = buildHardwareManifest([ethernet()], [], 'esp32:esp32:esp32').primaryItems
    const [layout] = itemLayouts([item])
    const pads = Array.from({ length: 12 }, (_, index) => peripheralPadPoint(layout, index))
    item.pins.forEach((_, index) => {
      const approach = peripheralApproach(layout, index)
      const pad = peripheralPadPoint(layout, peripheralSignalPadIndex(item, index))
      const topRow = pad.y < pads[6].y - 1
      expect(approach !== null, `${item.pins[index].propertyKey}`).toBe(topRow)
      const climbX = approach?.x ?? pad.x
      const crossed = pads.filter((other) => other !== pad && other.y > pad.y && Math.abs(other.x - climbX) < 5)
      expect(crossed, `${item.pins[index].propertyKey} climbs through another pad`).toEqual([])
    })
  })
})
