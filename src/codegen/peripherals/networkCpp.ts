/**
 * The sketch's one network connection, shared by every generator.
 *
 * Art-Net receive and NTP time sync call `_netEnsureConnected()` and
 * `_netConnected()` and never ask which link answers them. This module decides
 * the link once for a graph: the selected board's own Ethernet port, the W5500
 * module on the bench, or Wi-Fi with the first network user's credentials. The
 * normal sketch, the generative show and the SD player all emit the same three
 * pieces, so an RTC Clock synced by NTP keeps real time in whichever firmware
 * it is built into. See docs/design/wired-ethernet.md and
 * docs/design/dmx-artnet-input.md for the one-connection rule.
 */

import type { StudioNode } from '../../state/graphStore'
import { libraryDefaults } from '../../state/nodeLibrary'
import { getNetworkCredentials } from '../../state/peripherals/networkCredentials'
import { DEFAULT_ETHERNET_PART_ID, wiredNetworkIn, type WiredNetwork } from '../../state/peripherals/ethernetModule'
import { dmxUsesNetwork } from '../../state/peripherals/dmxTransceiver'
import { streamUsesNetwork } from '../../nodes/output/frameStream'
import { partById } from '../../build/parts/partCatalogue'
import { cppStringLiteral } from '../cppLiterals'
import { sanitizePin } from '../hardwarePins'
import { boardSyncsClock } from './boardSyncCpp'
import {
  ETHERNET_INCLUDES_CPP, ONBOARD_ETHERNET_INCLUDES_CPP, ethernetBootstrapCpp, onboardEthernetBootstrapCpp,
} from './ethernetCpp'

export interface NetworkSketchEmit {
  /**
   * One block: the platform headers and `FLS_NET_SUPPORTED`. Kept as a single
   * string so a caller that dedupes includes by line cannot drop one of its
   * preprocessor lines against another block's.
   */
  include: string
  /** File scope: `_netEnsureConnected()` and `_netConnected()`. */
  bootstrap: string
  /** `setup()` lines: a wired link starts before any socket opens on it. */
  setup: string[]
}

/**
 * Art-Net or sACN receive, DDP, a network Frame Stream, NTP time sync, the
 * Web Remote's page and a Board whose clock sync is on are the users of the
 * network.
 */
export function usesNetwork(node: Pick<StudioNode, 'data'>): boolean {
  const props = node.data.properties as Record<string, unknown>
  return (node.data.nodeType === 'DMXInput' && dmxUsesNetwork(props))
    || node.data.nodeType === 'WebRemoteInput'
    || node.data.nodeType === 'DdpInput'
    || (node.data.nodeType === 'StreamOutput' && streamUsesNetwork(props))
    || (node.data.nodeType === 'RTCInput' && String(props.timeSource ?? 'Compile Time') === 'NTP')
    || boardSyncsClock(node)
}

/**
 * The node whose hostname, addressing and Wi-Fi credentials the connection
 * uses: the first network user in the order given. Validation warns when
 * network users disagree rather than silently picking one. A syncing Board
 * is the source only when nothing else uses the network: it carries a
 * hostname and credentials but no addressing, and turning sync on must not
 * take the connection's settings away from the Art-Net or NTP node that
 * already owns them.
 */
export function networkSourceIn<T extends Pick<StudioNode, 'data'>>(nodes: readonly T[]): T | null {
  return nodes.find((node) => usesNetwork(node) && !boardSyncsClock(node)) ?? nodes.find(usesNetwork) ?? null
}

export function parseIpv4Literal(value: unknown): [number, number, number, number] | null {
  const parts = String(value ?? '').trim().split('.')
  if (parts.length !== 4) return null
  const nums = parts.map((part) => Number(part))
  if (nums.some((num) => !Number.isInteger(num) || num < 0 || num > 255)) return null
  return nums as [number, number, number, number]
}

export function ipAddressExpr(value: [number, number, number, number] | null): string {
  const ip = value ?? [0, 0, 0, 0]
  return `IPAddress(${ip[0]}, ${ip[1]}, ${ip[2]}, ${ip[3]})`
}

/**
 * `FLS_NET_SUPPORTED`: the core has a Wi-Fi station and `WiFiUDP`.
 * `FLS_NET_SNTP`: the core also keeps civil time itself (`configTime`,
 * `time()`), which the ESP cores do and WiFiS3 on the UNO R4 WiFi does not;
 * the RTC runs its own SNTP exchange over `WiFiUDP` there. Wired Ethernet is
 * ESP32-only, so its headers stay in that branch.
 */
function networkIncludesCpp(wired: WiredNetwork | null): string {
  return [
    `#if defined(ESP32)`,
    `#include <WiFi.h>`,
    `#include <WiFiUdp.h>`,
    `#include <time.h>`,
    ...(wired ? (wired.kind === 'onboard' ? ONBOARD_ETHERNET_INCLUDES_CPP : ETHERNET_INCLUDES_CPP) : []),
    `#define FLS_NET_SUPPORTED 1`,
    `#define FLS_NET_SNTP 1`,
    `#elif defined(ESP8266)`,
    `#include <ESP8266WiFi.h>`,
    `#include <WiFiUdp.h>`,
    `#include <time.h>`,
    `#define FLS_NET_SUPPORTED 1`,
    `#define FLS_NET_SNTP 1`,
    `#elif defined(ARDUINO_UNOWIFIR4)`,
    `#include <WiFiS3.h>`,
    `#define FLS_NET_SUPPORTED 1`,
    `#define FLS_NET_SNTP 0`,
    `#else`,
    `#define FLS_NET_SUPPORTED 0`,
    `#define FLS_NET_SNTP 0`,
    `#endif`,
  ].join('\n')
}

interface WifiEmit {
  ssid: string
  password: string
  hostname: string
  staticConfig: { ip: string; gateway: string; subnet: string; dns: string } | null
}

/**
 * The Wi-Fi bootstrap. Never blocks: the first call sets the mode and
 * hostname and begins, and later calls begin again at most once every five
 * seconds until the station is connected, so a network that is out of range
 * leaves `_netConnected()` false and the sketch running.
 *
 * The first call begins at once, so a network saved on the chip from an
 * earlier sketch never wins over this one. The ESP8266 reconnects by itself
 * once begun, and reports `WL_DISCONNECTED` while it does, so there it begins
 * again only after the core has given up. A begin while it is still connecting
 * leaves `status()` short of connected though the station has its address:
 * the D-13 bench remote answered pings but never served its page, and each
 * retry sent the radio scanning off its channel.
 *
 * WiFiS3 (UNO R4 WiFi) differs in three places and is the same elsewhere: it
 * has no `mode()` (station is its only role), it names the board with
 * `setHostname` like the ESP32, and its `config` takes the DNS server second
 * (`ip, dns, gateway, subnet`) where the ESP cores take it last.
 */
function wifiBootstrapCpp(wifi: WifiEmit): string {
  return [
    `// Shared Wi-Fi bootstrap for Art-Net receive / NTP clock sync.`,
    `static bool _wifiInit = false;`,
    `static uint32_t _wifiLastAttemptMs = 0;`,
    `void _netEnsureConnected() {`,
    `#if FLS_NET_SUPPORTED`,
    `  if (!_wifiInit) {`,
    `#if !defined(ARDUINO_UNOWIFIR4)`,
    `    WiFi.mode(WIFI_STA);`,
    `#endif`,
    `#if defined(ESP32) || defined(ARDUINO_UNOWIFIR4)`,
    `    WiFi.setHostname(${wifi.hostname});`,
    `#elif defined(ESP8266)`,
    `    WiFi.hostname(${wifi.hostname});`,
    `#endif`,
    ...(wifi.staticConfig
      ? [
          `#if defined(ARDUINO_UNOWIFIR4)`,
          `    WiFi.config(${wifi.staticConfig.ip}, ${wifi.staticConfig.dns}, ${wifi.staticConfig.gateway}, ${wifi.staticConfig.subnet});`,
          `#else`,
          `    WiFi.config(${wifi.staticConfig.ip}, ${wifi.staticConfig.gateway}, ${wifi.staticConfig.subnet}, ${wifi.staticConfig.dns});`,
          `#endif`,
        ]
      : []),
    `    _wifiInit = true;`,
    `  } else {`,
    `    if (WiFi.status() == WL_CONNECTED) return;`,
    `    if (millis() - _wifiLastAttemptMs < 5000u) return;`,
    `#if defined(ESP8266)`,
    `    // Still connecting: the core retries by itself, and a begin now would`,
    `    // leave status() short of connected once it has its address.`,
    `    if (WiFi.status() == WL_DISCONNECTED) return;`,
    `#endif`,
    `  }`,
    `  _wifiLastAttemptMs = millis();`,
    `  // WiFiS3's begin() waits inside its own connect timeout before returning,`,
    `  // so on the UNO R4 WiFi this is a slow call at most once every five seconds.`,
    `  WiFi.begin(${wifi.ssid}, ${wifi.password});`,
    `#endif`,
    `}`,
    `bool _netConnected() {`,
    `#if FLS_NET_SUPPORTED`,
    `  return WiFi.status() == WL_CONNECTED;`,
    `#else`,
    `  return false;`,
    `#endif`,
    `}`,
    ``,
  ].join('\n')
}

/**
 * The network for one sketch. `nodes` is the whole graph, because a wired
 * link is a hardware-only part with no ports; `source` is the network user
 * whose settings win (see `networkSourceIn`).
 */
export function networkSketchCpp(nodes: readonly StudioNode[], source: Pick<StudioNode, 'id' | 'data'>): NetworkSketchEmit {
  const props = source.data.properties as Record<string, unknown>
  const hostname = cppStringLiteral(props.wifiHostname ?? (source.data.nodeType === 'Board' ? 'fastled-board' : 'fastled-node'))
  const staticIp = parseIpv4Literal(props.staticIp)
  const staticGateway = parseIpv4Literal(props.staticGateway)
  const staticSubnet = parseIpv4Literal(props.staticSubnet)
  const staticConfig = props.useDhcp === false && staticIp && staticGateway && staticSubnet
    ? {
        ip: ipAddressExpr(staticIp),
        gateway: ipAddressExpr(staticGateway),
        subnet: ipAddressExpr(staticSubnet),
        dns: ipAddressExpr(parseIpv4Literal(props.staticDns)),
      }
    : null
  const wired = wiredNetworkIn(nodes)
  const include = networkIncludesCpp(wired)
  if (wired?.kind === 'onboard') {
    return {
      include,
      bootstrap: onboardEthernetBootstrapCpp({
        boardLabel: wired.boardLabel, ethernet: wired.ethernet, hostname, staticConfig,
      }).join('\n'),
      setup: ['  _netEnsureConnected();'],
    }
  }
  if (wired) {
    const p = wired.node.data.properties as Record<string, unknown>
    const d = libraryDefaults('EthernetModule')
    const pin = (key: string) => sanitizePin(p[key] ?? d[key], Number(d[key]))
    return {
      include,
      bootstrap: ethernetBootstrapCpp({
        label: partById(String(p.partId ?? DEFAULT_ETHERNET_PART_ID))?.label ?? 'W5500 Ethernet',
        sckPin: pin('sckPin'),
        mosiPin: pin('mosiPin'),
        misoPin: pin('misoPin'),
        csPin: pin('csPin'),
        intPin: pin('intPin'),
        resetPin: pin('resetPin'),
        hostname,
        staticConfig,
      }).join('\n'),
      setup: ['  _netEnsureConnected();'],
    }
  }
  // SSID/password are deliberately not node properties (see
  // networkCredentials.ts), so they are looked up by node id instead of props.
  const credentials = getNetworkCredentials(source.id)
  return {
    include,
    bootstrap: wifiBootstrapCpp({
      ssid: cppStringLiteral(credentials.ssid),
      password: cppStringLiteral(credentials.password),
      hostname,
      staticConfig,
    }),
    setup: [],
  }
}
