/**
 * The clock-sync protocol between the boards of one project.
 *
 * A Board with `clockSync` on brings up the sketch's one network connection
 * (networkCpp.ts) and either leads or follows. The leader broadcasts a UDP
 * datagram on port 6464 twice a second carrying its sketch clock and, when it
 * runs a generative show, the show's state; a follower keeps
 * `offset = leaderMs - millis()` from the last datagram and reads its sketch
 * clock as `_syncNowMs() = millis() + offset`. `_syncNowMs()` is the only
 * animation clock the emitters read when sync is on, so the leader, a locked
 * follower and a board that has lost its leader all run the same code path.
 * See docs/design/multi-board.md "Keeping boards in time".
 *
 * One Board per sketch (a project's boards are partitioned before codegen),
 * so nothing here carries a node-id suffix. The SD/music player is not synced:
 * its clock is the track position, and playerSketchGenerator.ts emits none of
 * this even when the Board's sync is on.
 */

import type { StudioNode } from '../../state/graphStore'

export type ClockSyncRole = 'leader' | 'follower'

/** UDP port both ends use. */
export const SYNC_PORT = 6464
/** Leader broadcast interval. */
export const SYNC_TX_INTERVAL_MS = 500
/** A follower is locked while a datagram arrived within this window. */
export const SYNC_LOCK_WINDOW_MS = 5000
/** Protocol version carried in every datagram. */
export const SYNC_VERSION = 1
/**
 * Datagram layout, little-endian, written byte by byte so both cores agree:
 * "FLSY", version, flags (bit0 = has show), leaderMs, cur, nxt, transType,
 * transitioning, phaseStart.
 */
export const SYNC_DATAGRAM_BYTES = 18

/** The animation clock expression when sync is on. */
export const SYNC_NOW_MS = '_syncNowMs()'

/** The first Board's role, or null when no Board syncs. */
export function clockSyncRoleIn(nodes: readonly Pick<StudioNode, 'data'>[]): ClockSyncRole | null {
  for (const node of nodes) {
    if (node.data.nodeType !== 'Board') continue
    const role = (node.data.properties as Record<string, unknown>).clockSync
    if (role === 'leader' || role === 'follower') return role
  }
  return null
}

/** Whether a node is a Board whose sync is on, which makes it a network user. */
export function boardSyncsClock(node: Pick<StudioNode, 'data'>): boolean {
  return clockSyncRoleIn([node]) !== null
}

const LE32 = (name: string, at: number) => [
  `  pkt[${at}] = (uint8_t)(${name} & 0xFFu);`,
  `  pkt[${at + 1}] = (uint8_t)((${name} >> 8) & 0xFFu);`,
  `  pkt[${at + 2}] = (uint8_t)((${name} >> 16) & 0xFFu);`,
  `  pkt[${at + 3}] = (uint8_t)((${name} >> 24) & 0xFFu);`,
]
const readLE32 = (at: number) =>
  `(uint32_t)pkt[${at}] | ((uint32_t)pkt[${at + 1}] << 8) | ((uint32_t)pkt[${at + 2}] << 16) | ((uint32_t)pkt[${at + 3}] << 24)`

/**
 * File scope, after the network bootstrap: the socket, the clock offset and
 * the two helpers. `_syncNowMs()` exists on every core so the clock reads
 * compile where `FLS_NET_SUPPORTED` is 0; it is plain `millis()` there, on
 * the leader, and on a follower that has never heard its leader.
 *
 * `show` is whether this sketch runs a rotating show: a leader then has the
 * show state to send, and a follower the mirrors to adopt it from;
 * `transStyle` whether that follower draws its transition style from a pool
 * and so adopts the leader's. Nothing is emitted that the sketch cannot reach.
 */
export function boardSyncGlobalsCpp(role: ClockSyncRole, show: boolean, transStyle = false): string {
  const lines = [
    `// Clock sync: this board ${role === 'leader' ? 'leads' : 'follows'}. See docs/design/multi-board.md.`,
    `#if FLS_NET_SUPPORTED`,
    `WiFiUDP _syncUdp;`,
    `static bool _syncUdpBegun = false;`,
  ]
  if (role === 'leader') {
    lines.push(`static uint32_t _syncLastTxMs = 0;`)
  } else {
    lines.push(`static int32_t _syncOffsetMs = 0;`)
    // Lock and the show mirrors are read only by a show's adoption rule.
    if (show) {
      lines.push(
        `static uint32_t _syncLastRxMs = 0;`,
        `static bool _syncHeard = false;`,
        `static uint8_t _syncCur = 0, _syncNxt = 0${transStyle ? ', _syncTrans = 0' : ''};`,
        `static bool _syncTransitioning = false;`,
        `static uint32_t _syncPhaseStart = 0;`,
        `static bool _syncHasShow = false;`,
      )
    }
  }
  lines.push(`#endif`)
  lines.push(`uint32_t _syncNowMs() {`)
  if (role === 'follower') {
    lines.push(
      `#if FLS_NET_SUPPORTED`,
      `  return millis() + (uint32_t)_syncOffsetMs;`,
      `#else`,
      `  return millis();`,
      `#endif`,
    )
  } else {
    lines.push(`  return millis();`)
  }
  lines.push(`}`)
  if (role === 'follower' && show) {
    lines.push(
      `bool _syncLocked() {`,
      `#if FLS_NET_SUPPORTED`,
      `  return _syncHeard && millis() - _syncLastRxMs < ${SYNC_LOCK_WINDOW_MS}u;`,
      `#else`,
      `  return false;`,
      `#endif`,
      `}`,
    )
  }
  lines.push(...(role === 'leader' ? leaderServiceCpp(show) : followerServiceCpp(show, transStyle)))
  return lines.join('\n')
}

/** The show state a leader hands to its service each pass. */
export interface SyncShowArgs {
  cur: string
  nxt: string
  transType: string
  transitioning: string
  phaseStart: string
}

/** The `loop()` call, after the clock snapshot (or, in a show, after its state exists). */
export function boardSyncServiceCallCpp(role: ClockSyncRole, show: SyncShowArgs | null): string {
  if (role === 'leader' && show) {
    return `  _syncService(${show.cur}, ${show.nxt}, ${show.transType}, ${show.transitioning}, ${show.phaseStart});`
  }
  return `  _syncService();`
}

/**
 * A follower running a show adopts the leader's pattern, transition and
 * phase start whenever they differ from its own and it is not mid-transition.
 * `transType` is the variable to adopt the transition style into, or null
 * where the show has a fixed style.
 */
export function boardSyncFollowerAdoptCpp(opts: { transitions: boolean; transType: string | null; cursor?: string | null }): string[] {
  const cursor = (target: string) => opts.cursor ? ` _selSetActive(${opts.cursor}, PATTERN_COUNT, ${target});` : ''
  if (!opts.transitions) {
    return [
      `  if (_syncLocked() && _syncHasShow && _syncCur != cur) { cur = _syncCur; phaseStart = _syncPhaseStart;${cursor('cur')} }`,
    ]
  }
  return [
    `  if (_syncLocked() && _syncHasShow) {`,
    `    if (!transitioning && _syncTransitioning && _syncNxt != cur) {`,
    `      cur = _syncCur; nxt = _syncNxt;${opts.transType ? ` ${opts.transType} = _syncTrans;` : ''} transitioning = true; phaseStart = _syncPhaseStart;${cursor('nxt')}`,
    `    } else if (!transitioning && !_syncTransitioning && _syncCur != cur) {`,
    `      cur = _syncCur; phaseStart = _syncPhaseStart;${cursor('cur')}`,
    `    }`,
    `  }`,
  ]
}

/** A sequence owns its cursor, so a sequence-driven follower adopts `cur` only. */
export function boardSyncFollowerAdoptSequenceCpp(): string[] {
  return [
    `  if (_syncLocked() && _syncHasShow && !transitioning && _syncCur != cur) cur = _syncCur;`,
  ]
}

function serviceHead(): string[] {
  return [
    `  _netEnsureConnected();`,
    `  if (!_netConnected()) return;`,
    `  if (!_syncUdpBegun) { _syncUdp.begin(${SYNC_PORT}); _syncUdpBegun = true; }`,
  ]
}

/**
 * Broadcast to 255.255.255.255:6464 every 500 ms. Limited broadcast through
 * `WiFiUDP::beginPacket` on the ESP32 and ESP8266 cores and WiFiS3; lwIP
 * accepts it without SO_BROADCAST on both ESP cores.
 */
function leaderServiceCpp(show: boolean): string[] {
  const signature = show
    ? `void _syncService(uint8_t cur, uint8_t nxt, uint8_t transType, bool transitioning, uint32_t phaseStart) {`
    : `void _syncService() {`
  return [
    signature,
    `#if FLS_NET_SUPPORTED`,
    ...serviceHead(),
    `  uint32_t txNow = millis();`,
    `  if (txNow - _syncLastTxMs < ${SYNC_TX_INTERVAL_MS}u) return;`,
    `  _syncLastTxMs = txNow;`,
    `  uint32_t leaderMs = _syncNowMs();`,
    `  uint8_t pkt[${SYNC_DATAGRAM_BYTES}];`,
    `  pkt[0] = 'F'; pkt[1] = 'L'; pkt[2] = 'S'; pkt[3] = 'Y';`,
    `  pkt[4] = ${SYNC_VERSION};`,
    `  pkt[5] = ${show ? '1' : '0'};`,
    ...LE32('leaderMs', 6),
    ...(show
      ? [
          `  pkt[10] = cur; pkt[11] = nxt; pkt[12] = transType; pkt[13] = transitioning ? 1 : 0;`,
          ...LE32('phaseStart', 14),
        ]
      : [`  pkt[10] = 0; pkt[11] = 0; pkt[12] = 0; pkt[13] = 0; pkt[14] = 0; pkt[15] = 0; pkt[16] = 0; pkt[17] = 0;`]),
    `  _syncUdp.beginPacket(IPAddress(255, 255, 255, 255), ${SYNC_PORT});`,
    `  _syncUdp.write(pkt, sizeof(pkt));`,
    `  _syncUdp.endPacket();`,
    `#else`,
    ...(show ? [`  (void)cur; (void)nxt; (void)transType; (void)transitioning; (void)phaseStart;`] : []),
    `#endif`,
    `}`,
  ]
}

/**
 * Drain every waiting datagram and keep the last valid one's clock and show
 * state. The offset is taken against `millis()` at receipt, so a datagram
 * that waited in the socket a frame counts that frame as network delay.
 */
function followerServiceCpp(show: boolean, transStyle: boolean): string[] {
  return [
    `void _syncService() {`,
    `#if FLS_NET_SUPPORTED`,
    ...serviceHead(),
    `  for (int size = _syncUdp.parsePacket(); size > 0; size = _syncUdp.parsePacket()) {`,
    `    uint8_t pkt[${SYNC_DATAGRAM_BYTES}];`,
    `    int got = _syncUdp.read(pkt, sizeof(pkt));`,
    `    if (got != ${SYNC_DATAGRAM_BYTES} || pkt[0] != 'F' || pkt[1] != 'L' || pkt[2] != 'S' || pkt[3] != 'Y' || pkt[4] != ${SYNC_VERSION}) continue;`,
    `    uint32_t leaderMs = ${readLE32(6)};`,
    `    _syncOffsetMs = (int32_t)(leaderMs - millis());`,
    ...(show
      ? [
          `    _syncLastRxMs = millis();`,
          `    _syncHeard = true;`,
          `    _syncHasShow = (pkt[5] & 1u) != 0;`,
          `    _syncCur = pkt[10]; _syncNxt = pkt[11];${transStyle ? ' _syncTrans = pkt[12];' : ''} _syncTransitioning = pkt[13] != 0;`,
          `    _syncPhaseStart = ${readLE32(14)};`,
        ]
      : []),
    `  }`,
    `#endif`,
    `}`,
  ]
}
