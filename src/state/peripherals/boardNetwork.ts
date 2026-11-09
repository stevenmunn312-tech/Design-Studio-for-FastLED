import type { StudioNode } from '../graphStore'
import { ROOT_BOARD_NODE_ID } from '../../build/hardware'
import { getNetworkCredentials, type NetworkCredentials } from './networkCredentials'

/**
 * A board's one network identity: the name it announces and how it gets an
 * address, kept on the Board node, with its Wi-Fi name and password in
 * `networkCredentials.ts` under the Board's node id.
 *
 * Every network user on a board (Art-Net, sACN and DDP receive, the Web
 * Remote, NTP time, a Frame Stream, internet radio and clock sync) shares the
 * one connection the sketch brings up, so the settings live on the thing the
 * connection belongs to rather than on each node. Each board of a multi-board
 * project compiles its own partition, which holds its own Board, so each board
 * joins the network as itself. An Ethernet cable replaces the radio, not the
 * identity: the addressing applies to the wired interface too. See
 * docs/design/wired-ethernet.md and docs/design/multi-board.md.
 */

/** The Board properties that make up its network identity, in panel order. */
export const BOARD_NETWORK_KEYS = ['wifiHostname', 'useDhcp', 'staticIp', 'staticGateway', 'staticSubnet', 'staticDns'] as const

/** The keys only a static address reads. */
export const BOARD_STATIC_ADDRESS_KEYS = ['staticIp', 'staticGateway', 'staticSubnet', 'staticDns'] as const

/**
 * The Board's network defaults. An empty hostname means the board's own
 * default (`defaultBoardHostname`), so two boards never announce one name.
 */
export const BOARD_NETWORK_DEFAULTS = {
  wifiHostname: '',
  useDhcp: true,
  staticIp: '',
  staticGateway: '',
  staticSubnet: '255.255.255.0',
  staticDns: '',
} as const

/** Longest hostname a board announces (the mDNS label limit the cores apply). */
export const BOARD_HOSTNAME_MAX = 32

export interface BoardNetworkIdentity {
  hostname: string
  useDhcp: boolean
  staticIp: string
  staticGateway: string
  staticSubnet: string
  staticDns: string
}

/**
 * The name a board announces when none is typed: `fastled-board` for the
 * primary and `fastled-board-2` and so on for the others, from the board's id
 * rather than its place in the list, so removing one board never renames
 * another.
 */
export function defaultBoardHostname(boardId: string | null | undefined): string {
  if (!boardId || boardId === ROOT_BOARD_NODE_ID) return 'fastled-board'
  const cleaned = boardId.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '')
  return `fastled-${cleaned || 'board'}`.slice(0, BOARD_HOSTNAME_MAX).replace(/-+$/g, '')
}

/**
 * Why a typed hostname cannot be announced as it stands, or null. It reaches
 * C++ escaped either way (`cppStringLiteral`); this is about the network,
 * which takes letters, digits and hyphens only.
 */
export function boardHostnameProblem(hostname: string): string | null {
  if (!hostname) return null
  if (hostname.length > BOARD_HOSTNAME_MAX) return `is longer than ${BOARD_HOSTNAME_MAX} characters`
  if (!/^[A-Za-z0-9-]+$/.test(hostname)) return 'can hold only letters, digits and hyphens'
  if (hostname.startsWith('-') || hostname.endsWith('-')) return 'cannot start or end with a hyphen'
  return null
}

/** The Board in `nodes` whose identity the sketch's network uses: a partition holds one. */
export function networkBoardIn<T extends Pick<StudioNode, 'data'>>(nodes: readonly T[]): T | null {
  return nodes.find((node) => node.data.nodeType === 'Board') ?? null
}

/** A board's identity, every field trimmed and defaulted; a graph with no Board reads as the primary's defaults. */
export function boardNetworkIdentity(board: Pick<StudioNode, 'id' | 'data'> | null | undefined): BoardNetworkIdentity {
  const props = (board?.data.properties ?? {}) as Record<string, unknown>
  const text = (key: (typeof BOARD_NETWORK_KEYS)[number]) => {
    const value = props[key]
    return typeof value === 'string' ? value.trim() : String(BOARD_NETWORK_DEFAULTS[key])
  }
  return {
    hostname: text('wifiHostname') || defaultBoardHostname(board?.id),
    useDhcp: props.useDhcp !== false,
    staticIp: text('staticIp'),
    staticGateway: text('staticGateway'),
    staticSubnet: text('staticSubnet'),
    staticDns: text('staticDns'),
  }
}

/**
 * The key the Board's Wi-Fi name and password are kept under on this machine:
 * the Board's node id, or the primary's conventional id in a graph without one.
 */
export function boardNetworkCredentialsKey(board: Pick<StudioNode, 'id'> | null | undefined): string {
  return board?.id ?? ROOT_BOARD_NODE_ID
}

/** The Wi-Fi name and password the sketch built from `nodes` joins with. */
export function boardNetworkCredentialsIn(nodes: readonly Pick<StudioNode, 'id' | 'data'>[]): NetworkCredentials {
  return getNetworkCredentials(boardNetworkCredentialsKey(networkBoardIn(nodes)))
}

/** Whether `key` is one of the static-address fields, which only count with DHCP off. */
export function isBoardStaticAddressKey(key: string): boolean {
  return (BOARD_STATIC_ADDRESS_KEYS as readonly string[]).includes(key)
}
