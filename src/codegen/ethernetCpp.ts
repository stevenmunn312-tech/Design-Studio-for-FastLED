/**
 * Firmware for wired Ethernet: a W5500 carrying the sketch's network in place
 * of Wi-Fi.
 *
 * Art-Net receive and NTP time sync call `_netEnsureConnected()` and
 * `_netConnected()` and never ask which link answers them. Arduino-ESP32 3.x
 * routes `WiFiUDP` sockets and SNTP over whichever interface is up, so those
 * two emitters need no Ethernet-specific code at all; only this bootstrap
 * changes. See state/ethernetModule.ts for which chips it builds for.
 */

export interface EthernetEmit {
  label: string
  sckPin: number
  mosiPin: number
  misoPin: number
  csPin: number
  intPin: number
  resetPin: number
  hostname: string
  /** `IPAddress(...)` expressions, or null for DHCP. */
  staticConfig: { ip: string; gateway: string; subnet: string; dns: string } | null
}

export const ETHERNET_INCLUDES_CPP = [
  `#include <SPI.h>`,
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
    `// One general-purpose SPI host on this chip: the module shares SPI.`,
    `#define _ethSpi SPI`,
    `#endif`,
    `#endif`,
    `static bool _netInit = false;`,
    `void _netEnsureConnected() {`,
    `#if FLS_NET_SUPPORTED`,
    `  if (_netInit) return;`,
    `  _netInit = true;`,
    `  _ethSpi.begin(${eth.sckPin}, ${eth.misoPin}, ${eth.mosiPin});`,
    `  if (!ETH.begin(ETH_PHY_W5500, 1, ${eth.csPin}, ${eth.intPin}, ${eth.resetPin}, _ethSpi)) return;`,
    `  ETH.setHostname(${eth.hostname});`,
  ]
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
