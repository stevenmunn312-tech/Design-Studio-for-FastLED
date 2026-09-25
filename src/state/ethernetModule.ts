import type { BuildTargetFamily } from '../build/buildProfile'
import type { StudioNode } from './graphStore'
import { partById, type PartEthernetSpec } from './partCatalogue'

/**
 * Wired Ethernet: a W5500 module that carries the sketch's network instead of
 * Wi-Fi.
 *
 * It carries no signal of its own, so it is a hardware-only part like the SD
 * card: what it changes is how Art-Net receive and NTP time sync reach the
 * network, not what any node outputs. Those two keep their own settings
 * (hostname, DHCP or a static address); the module only replaces the radio.
 */
export const ETHERNET_NODE_TYPE = 'EthernetModule'
export const DEFAULT_ETHERNET_PART_ID = 'wiz850io-ethernet-module'

/** The SPI bus and the module's three control lines, in pad-wiring order. */
export const ETHERNET_PIN_KEYS = ['sckPin', 'mosiPin', 'misoPin', 'csPin', 'intPin', 'resetPin'] as const

export interface EthernetModuleOption {
  partId: string
  label: string
  summary: string
  note: string
}

export const ETHERNET_MODULES: readonly EthernetModuleOption[] = [
  {
    partId: DEFAULT_ETHERNET_PART_ID,
    label: 'WIZnet WIZ850io',
    summary: 'W5500 wired Ethernet over SPI, 3.3 V',
    note: 'Power it from 3.3 V only; it draws up to about 141 mA with a link up. Art-Net and NTP use this link instead of Wi-Fi.',
  },
]

const FALLBACK_SPEC: PartEthernetSpec = {
  controller: 'W5500',
  interface: 'SPI',
  maxSpiClockMHz: 80,
  link: '10/100BASE-TX',
}

export function ethernetSpec(partId: unknown): PartEthernetSpec {
  return partById(String(partId ?? DEFAULT_ETHERNET_PART_ID))?.ethernet ?? FALLBACK_SPEC
}

/** The bench's Ethernet module, if it has one. */
export function ethernetModuleIn(nodes: readonly StudioNode[]): StudioNode | null {
  return nodes.find((node) => node.data.nodeType === ETHERNET_NODE_TYPE) ?? null
}

/**
 * How the generated sketch reaches the W5500's SPI bus on a chip family, or
 * null where it cannot drive one at all.
 *
 * Arduino-ESP32 3.x brings a W5500 up through `ETH.begin(..., SPIClass&)`.
 * Where the chip has a second general-purpose SPI host (`HSPI`), the module
 * gets that host to itself, so it cannot disturb the colour panel on the
 * default `SPI` object and its pins are its own. The C3 and C6 have only one,
 * so there the module shares `SPI` with any panel — and since `SPI.begin`
 * takes pins only the first time, both must name the same three bus lines.
 *
 * ESP8266 and every non-Espressif target are refused: the sketch's `ETH`
 * driver is Arduino-ESP32's, and nothing else here has been built against a
 * W5500.
 */
export type EthernetSpiHost = 'dedicated' | 'shared'

const ETHERNET_SPI_HOST: Partial<Record<BuildTargetFamily, EthernetSpiHost>> = {
  esp32: 'dedicated',
  'esp32-s2': 'dedicated',
  'esp32-s3': 'dedicated',
  'esp32-c3': 'shared',
  'esp32-c6': 'shared',
}

export function ethernetSpiHost(family: BuildTargetFamily): EthernetSpiHost | null {
  return ETHERNET_SPI_HOST[family] ?? null
}
