/**
 * Firmware for wired Ethernet: a W5500 module, or a PHY built into the board,
 * carrying the sketch's network in place of Wi-Fi.
 *
 * Art-Net receive and NTP time sync call `_netEnsureConnected()` and
 * `_netConnected()` and never ask which link answers them. Arduino-ESP32 3.x
 * routes `WiFiUDP` sockets and SNTP over whichever interface is up, so those
 * two emitters need no Ethernet-specific code at all; only this bootstrap
 * changes. See state/peripherals/ethernetModule.ts for which chips it builds for.
 */

import type { BoardOnboardEthernet } from '../../build/boards/boardProfiles'
import { SPI_BUS_CPP } from '../helpers/spiBusCpp'

interface EthernetAddressing {
  hostname: string
  /** `IPAddress(...)` expressions, or null for DHCP. */
  staticConfig: { ip: string; gateway: string; subnet: string; dns: string } | null
}

export interface EthernetEmit extends EthernetAddressing {
  label: string
  sckPin: number
  mosiPin: number
  misoPin: number
  csPin: number
  intPin: number
  resetPin: number
}

export interface OnboardEthernetEmit extends EthernetAddressing {
  boardLabel: string
  ethernet: BoardOnboardEthernet
}

export const ETHERNET_INCLUDES_CPP = [
  `#include <SPI.h>`,
  `#include <ETH.h>`,
]

/** A board's own PHY is on the ESP32's EMAC, so it needs no SPI. */
export const ONBOARD_ETHERNET_INCLUDES_CPP = [
  `#include <ETH.h>`,
]

/**
 * The shared network bootstrap over a W5500.
 *
 * Starting is one-shot and never blocks: `ETH.begin` brings the interface up
 * and DHCP runs in the background, so `_netConnected()` turns true once the
 * cable is in and an address has been assigned, and false again if the link
 * drops. A module that does not answer leaves `_netConnected()` false, which
 * is exactly what Art-Net and NTP already do with Wi-Fi out of range.
 */
export function ethernetBootstrapCpp(eth: EthernetEmit): string[] {
  const lines = [
    `// Shared wired-Ethernet bootstrap (${eth.label}) for Art-Net receive / NTP clock sync.`,
    `#if FLS_NET_SUPPORTED`,
    `#if defined(HSPI)`,
    `// The module has this SPI host to itself, so a colour panel on SPI is undisturbed.`,
    `static SPIClass _ethSpi(HSPI);`,
    `#else`,
    `// One general-purpose SPI host on this chip: the module shares SPI, and starts`,
    `// it through the shared helper so the MISO it reads on is routed.`,
    `#define _ethSpi SPI`,
    SPI_BUS_CPP,
    `#endif`,
    `#endif`,
    `static bool _netInit = false;`,
    `void _netEnsureConnected() {`,
    `#if FLS_NET_SUPPORTED`,
    `  if (_netInit) return;`,
    `  _netInit = true;`,
    `#if defined(HSPI)`,
    `  _ethSpi.begin(${eth.sckPin}, ${eth.misoPin}, ${eth.mosiPin});`,
    `#else`,
    `  _spiBusBegin(${eth.sckPin}, ${eth.misoPin}, ${eth.mosiPin});`,
    `#endif`,
    `  if (!ETH.begin(ETH_PHY_W5500, 1, ${eth.csPin}, ${eth.intPin}, ${eth.resetPin}, _ethSpi)) return;`,
  ]
  return [...lines, ...ethernetAddressingCpp(eth)]
}

/**
 * The same bootstrap over the board's own PHY, an RMII chip on the ESP32's
 * internal EMAC. The board fixes its wiring, so nothing here is a user pin.
 */
export function onboardEthernetBootstrapCpp(eth: OnboardEthernetEmit): string[] {
  const { phy, phyAddress, mdcPin, mdioPin, powerPin, clockMode } = eth.ethernet
  return [
    `// Shared wired-Ethernet bootstrap (the ${eth.boardLabel}'s own port) for Art-Net receive / NTP clock sync.`,
    `static bool _netInit = false;`,
    `void _netEnsureConnected() {`,
    `#if FLS_NET_SUPPORTED`,
    `  if (_netInit) return;`,
    `  _netInit = true;`,
    `  if (!ETH.begin(${phy}, ${phyAddress}, ${mdcPin}, ${mdioPin}, ${powerPin}, ${clockMode})) return;`,
    ...ethernetAddressingCpp(eth),
  ]
}

/** Hostname and static address after `ETH.begin`, then the link test. */
function ethernetAddressingCpp(eth: EthernetAddressing): string[] {
  const lines = [`  ETH.setHostname(${eth.hostname});`]
  if (eth.staticConfig) {
    const { ip, gateway, subnet, dns } = eth.staticConfig
    lines.push(`  ETH.config(${ip}, ${gateway}, ${subnet}, ${dns});`)
  }
  lines.push(
    `#endif`,
    `}`,
    `bool _netConnected() {`,
    `#if FLS_NET_SUPPORTED`,
    `  return ETH.connected() && ETH.hasIP();`,
    `#else`,
    `  return false;`,
    `#endif`,
    `}`,
    ``,
  )
  return lines
}
