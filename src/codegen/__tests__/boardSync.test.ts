/**
 * The clock-sync protocol in generated firmware: the leader broadcasts, the
 * follower keeps an offset, every synced board reads `_syncNowMs()`, a show
 * follower adopts the leader's state and makes no picks of its own, and a
 * Board with sync off leaves the sketch byte for byte as it was.
 * See docs/design/multi-board.md "Keeping boards in time".
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { generateCpp } from '../cppGenerator'
import { generateShowSketch } from '../showGenerator'
import { buildShowPlayer } from '../../utils/showUpload'
import { compileCppSnippet } from '../../test-utils/cppSnippet'
import { intervalControlFixture } from '../../test-utils/intervalControlFixture'
import { useNetworkCredentialsStore } from '../../state/peripherals/networkCredentials'
import { NODE_LIBRARY, libraryDefaults } from '../../state/nodeLibrary'
import type { StudioNode, StudioEdge } from '../../state/graphStore'
import type { GroupRegistry } from '../../state/graphEvaluator'
import { SYNC_DATAGRAM_BYTES, SYNC_VERSION, clockSyncRoleIn } from '../peripherals/boardSyncCpp'
import { networkSourceIn, usesNetwork } from '../peripherals/networkCpp'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
    nodeType, label: definition?.label ?? nodeType, category: definition?.category ?? 'graph',
    properties: { ...libraryDefaults(nodeType), ...properties },
    inputs: definition?.inputs ?? (nodeType === 'GroupOutput' ? [{ id: 'frame', label: 'Frame', dataType: 'frame' }] : []),
    outputs: definition?.outputs ?? [],
  } } as StudioNode
}
const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge =>
  ({ id: `${source}-${sourceHandle}-${target}-${targetHandle}`, source, sourceHandle, target, targetHandle }) as StudioEdge

const BOARD = 'espressif-esp32-s3-devkitc-1'
type Role = 'off' | 'leader' | 'follower'
const board = (clockSync?: Role) =>
  node('board', 'Board', { profileId: BOARD, ...(clockSync ? { clockSync } : {}) })

/** A normal sketch whose pattern reads `t`. */
function normalSketch(role?: Role, extra: StudioNode[] = []) {
  const nodes = [board(role), ...extra, node('fx', 'Rainbow'), node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 4 })]
  return generateCpp(nodes, [edge('fx', 'frame', 'out', 'frame')])
}

const groups: GroupRegistry = {
  g0: { nodes: [node('a', 'SolidColor', { r: 0, g: 0, b: 255 }), node('go', 'GroupOutput')], edges: [edge('a', 'frame', 'go', 'frame')] },
  g1: { nodes: [node('b', 'Rainbow'), node('go', 'GroupOutput')], edges: [edge('b', 'frame', 'go', 'frame')] },
} as unknown as GroupRegistry

/** A rotating show; `transitionSec` 0 is a cut, a pool of styles draws per transition. */
function showSketch(role?: Role, show: Record<string, unknown> = {}, patternIds = ['g0', 'g1']) {
  const nodes = [
    board(role),
    node('pc', 'PatternCollection', { patternIds }),
    node('pm', 'PatternSlideshow', { interval: 8, transitionSec: 1, ...show }),
    node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
  ]
  return generateShowSketch(nodes, [edge('pc', 'patternset', 'pm', 'patternset'), edge('pm', 'frame', 'out', 'frame')], groups)
}

const lines = (source: string, text: string) => source.split('\n').filter((line) => line.includes(text))

/** The same show drawing each transition's style from a pool of two. */
function pooledShow(role: Role) {
  const nodes = [
    board(role),
    node('pc', 'PatternCollection', { patternIds: ['g0', 'g1'] }),
    node('pm', 'PatternSlideshow', { interval: 8, transitionSec: 1 }),
    node('tr', 'TransitionSet', { transitions: ['crossfade', 'wipe'] }),
    node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
  ]
  const edges = [
    edge('pc', 'patternset', 'pm', 'patternset'), edge('tr', 'transitions', 'pm', 'transitions'),
    edge('pm', 'frame', 'out', 'frame'),
  ]
  return generateShowSketch(nodes, edges, groups)
}

// ── A TypeScript mirror of the datagram ───────────────────────────────────
interface SyncDatagram {
  hasShow: boolean
  leaderMs: number
  cur: number
  nxt: number
  transType: number
  transitioning: boolean
  phaseStart: number
}
function encode(d: SyncDatagram): Uint8Array {
  const pkt = new Uint8Array(SYNC_DATAGRAM_BYTES)
  const le32 = (at: number, value: number) => { for (let i = 0; i < 4; i++) pkt[at + i] = (value >>> (8 * i)) & 0xff }
  pkt.set([0x46, 0x4c, 0x53, 0x59], 0)  // "FLSY"
  pkt[4] = SYNC_VERSION
  pkt[5] = d.hasShow ? 1 : 0
  le32(6, d.leaderMs)
  pkt[10] = d.cur; pkt[11] = d.nxt; pkt[12] = d.transType; pkt[13] = d.transitioning ? 1 : 0
  le32(14, d.phaseStart)
  return pkt
}
function decode(pkt: Uint8Array): SyncDatagram | null {
  if (pkt.length !== SYNC_DATAGRAM_BYTES || String.fromCharCode(...pkt.subarray(0, 4)) !== 'FLSY' || pkt[4] !== SYNC_VERSION) return null
  const le32 = (at: number) => (pkt[at] | (pkt[at + 1] << 8) | (pkt[at + 2] << 16) | (pkt[at + 3] << 24)) >>> 0
  return {
    hasShow: (pkt[5] & 1) !== 0, leaderMs: le32(6),
    cur: pkt[10], nxt: pkt[11], transType: pkt[12], transitioning: pkt[13] !== 0, phaseStart: le32(14),
  }
}

describe('board clock sync', () => {
  beforeAll(() => useNetworkCredentialsStore.getState().setCredentials('board', { ssid: 'studio', password: 'secret' }))
  afterAll(() => useNetworkCredentialsStore.getState().removeCredentials('board'))

  it('makes a syncing Board a network user, last in line for the connection settings', () => {
    expect(usesNetwork(board())).toBe(false)
    expect(usesNetwork(board('off'))).toBe(false)
    expect(usesNetwork(board('leader'))).toBe(true)
    expect(usesNetwork(board('follower'))).toBe(true)
    expect(clockSyncRoleIn([board('follower')])).toBe('follower')
    expect(clockSyncRoleIn([board('off')])).toBeNull()
    const rtc = node('rtc', 'RTCInput', { timeSource: 'NTP', wifiHostname: 'led-clock' })
    expect(networkSourceIn([board('leader'), rtc])?.id).toBe('rtc')
    expect(networkSourceIn([board('leader')])?.id).toBe('board')
  })

  it('leaves a sketch byte for byte unchanged when sync is off', () => {
    expect(normalSketch('off')).toBe(normalSketch())
    expect(normalSketch()).not.toContain('_sync')
    expect(normalSketch()).toContain('float t = millis() / 1000.0f;')
    expect(showSketch('off')).toBe(showSketch())
    expect(showSketch()).not.toContain('_sync')
    expect(showSketch()).toContain('uint32_t now = millis();')
  })

  it('brings the network up from the Board alone, with its hostname and credentials', () => {
    const cpp = normalSketch('leader')
    expect(cpp).toContain('#include <WiFi.h>')
    expect(cpp).toContain('WiFi.setHostname("fastled-board");')
    expect(cpp).toContain('WiFi.begin("studio", "secret");')
    expect(lines(cpp, 'void _netEnsureConnected()')).toHaveLength(1)
    expect(cpp.indexOf('void _netEnsureConnected()')).toBeLessThan(cpp.indexOf('void _syncService('))
    expect(cpp.indexOf('void _syncService(')).toBeLessThan(cpp.indexOf('void setup()'))
  })

  it('reads the animation clock through _syncNowMs() on both roles', () => {
    for (const role of ['leader', 'follower'] as const) {
      const cpp = normalSketch(role)
      expect(cpp).toContain('float t = _syncNowMs() / 1000.0f;')
      expect(cpp).not.toContain('float t = millis()')
      expect(cpp.indexOf('float t = _syncNowMs()')).toBeLessThan(cpp.indexOf('  _syncService();'))
      expect(lines(cpp, '  _syncService();')).toHaveLength(1)
    }
    expect(normalSketch('leader')).toContain('uint32_t _syncNowMs() {\n  return millis();\n}')
    expect(normalSketch('follower')).toContain('return millis() + (uint32_t)_syncOffsetMs;')
  })

  it('keeps _syncNowMs() as the Master Speed accumulator clock', () => {
    const cpp = normalSketch('follower', [node('speed', 'MasterSpeed', { speed: 1 })])
    expect(cpp).toContain('uint32_t _tNowMs = _syncNowMs();')
    expect(cpp).toContain('float t = _tAnimMs / 1000.0f;')
  })

  it('broadcasts from the leader twice a second and receives on the follower', () => {
    const leader = normalSketch('leader')
    expect(leader).toContain('WiFiUDP _syncUdp;')
    expect(leader).toContain('_syncUdp.begin(6464);')
    expect(leader).toContain('if (txNow - _syncLastTxMs < 500u) return;')
    expect(leader).toContain('_syncUdp.beginPacket(IPAddress(255, 255, 255, 255), 6464);')
    expect(leader).toContain("pkt[0] = 'F'; pkt[1] = 'L'; pkt[2] = 'S'; pkt[3] = 'Y';")
    expect(leader).toContain('pkt[5] = 0;')
    expect(leader).not.toContain('_syncOffsetMs')
    expect(leader).not.toContain('_syncLocked')
    expect(leader).not.toContain('parsePacket')

    const follower = normalSketch('follower')
    expect(follower).toContain('for (int size = _syncUdp.parsePacket(); size > 0; size = _syncUdp.parsePacket())')
    expect(follower).toContain('_syncOffsetMs = (int32_t)(leaderMs - millis());')
    expect(follower).not.toContain('beginPacket')
    // No show in a normal sketch: nothing to lock onto or adopt.
    expect(follower).not.toContain('_syncLocked')
    expect(follower).not.toContain('_syncCur')
    // The ESP32-S3 sketch is specialised, so the network guards are folded away.
    expect(follower).not.toContain('FLS_NET_SUPPORTED')
  })

  it('writes and reads the datagram in the order the TypeScript mirror does', () => {
    const leader = pooledShow('leader')
    const follower = pooledShow('follower')
    // Field offsets, taken from the emitted C++ rather than assumed.
    const at = (source: string, re: RegExp) => Number(source.match(re)![1])
    expect(at(leader, /pkt\[(\d+)\] = \(uint8_t\)\(leaderMs & 0xFFu\);/)).toBe(6)
    expect(at(leader, /pkt\[(\d+)\] = \(uint8_t\)\(\(leaderMs >> 24\) & 0xFFu\);/)).toBe(9)
    expect(at(leader, /pkt\[(\d+)\] = cur;/)).toBe(10)
    expect(at(leader, /pkt\[(\d+)\] = nxt;/)).toBe(11)
    expect(at(leader, /pkt\[(\d+)\] = transType;/)).toBe(12)
    expect(at(leader, /pkt\[(\d+)\] = transitioning \? 1 : 0;/)).toBe(13)
    expect(at(leader, /pkt\[(\d+)\] = \(uint8_t\)\(phaseStart & 0xFFu\);/)).toBe(14)
    expect(leader).toContain('uint8_t pkt[18];')
    expect(follower).toContain('uint32_t leaderMs = (uint32_t)pkt[6] | ((uint32_t)pkt[7] << 8) | ((uint32_t)pkt[8] << 16) | ((uint32_t)pkt[9] << 24);')
    expect(follower).toContain('_syncPhaseStart = (uint32_t)pkt[14] | ((uint32_t)pkt[15] << 8) | ((uint32_t)pkt[16] << 16) | ((uint32_t)pkt[17] << 24);')
    expect(follower).toContain('_syncCur = pkt[10]; _syncNxt = pkt[11]; _syncTrans = pkt[12]; _syncTransitioning = pkt[13] != 0;')
    expect(follower).toContain("if (got != 18 || pkt[0] != 'F' || pkt[1] != 'L' || pkt[2] != 'S' || pkt[3] != 'Y' || pkt[4] != 1) continue;")

    const sent: SyncDatagram = { hasShow: true, leaderMs: 0xfedcba98, cur: 3, nxt: 7, transType: 5, transitioning: true, phaseStart: 0x01020304 }
    const pkt = encode(sent)
    expect(Array.from(pkt.subarray(6, 10))).toEqual([0x98, 0xba, 0xdc, 0xfe])
    expect(Array.from(pkt.subarray(14, 18))).toEqual([0x04, 0x03, 0x02, 0x01])
    expect(decode(pkt)).toEqual(sent)
    expect(decode(new Uint8Array(17))).toBeNull()
    const wrongVersion = encode(sent); wrongVersion[4] = 2
    expect(decode(wrongVersion)).toBeNull()
  })

  it('runs the follower offset arithmetic frame by frame', () => {
    const follower = normalSketch('follower')
    const offsetLine = lines(follower, '_syncOffsetMs = (int32_t)(leaderMs - millis());')[0].trim()
    const nowExpr = follower.match(/return (millis\(\) \+ \(uint32_t\)_syncOffsetMs);/)![1]
    const step = compileCppSnippet([
      'static int32_t _syncOffsetMs = 0;',
      `if (rx) { ${offsetLine} }`,
      `uint32_t nowMs = ${nowExpr};`,
    ], ['rx', 'leaderMs'], ['_syncOffsetMs', 'nowMs'])
    // Never heard the leader: the sketch clock is the board's own.
    expect(step(250, { rx: false, leaderMs: 0 })).toEqual({ _syncOffsetMs: 0, nowMs: 250 })
    // A leader that booted 4 s earlier.
    expect(step(1000, { rx: true, leaderMs: 5000 })).toEqual({ _syncOffsetMs: 4000, nowMs: 5000 })
    expect(step(1300, { rx: false, leaderMs: 0 })).toEqual({ _syncOffsetMs: 4000, nowMs: 5300 })
    // A leader behind this board: a negative offset.
    expect(step(2000, { rx: true, leaderMs: 500 })).toEqual({ _syncOffsetMs: -1500, nowMs: 500 })
    expect(step(2600, { rx: false, leaderMs: 0 })).toEqual({ _syncOffsetMs: -1500, nowMs: 1100 })
    // The leader's clock ran a touch faster: the next datagram re-aims.
    expect(step(2600, { rx: true, leaderMs: 1110 })).toEqual({ _syncOffsetMs: -1490, nowMs: 1110 })
  })

  it('hands the leader show state to the service and adopts it on the follower', () => {
    const leader = showSketch('leader')
    expect(leader).toContain('uint32_t now = _syncNowMs();')
    expect(leader).toContain('void _syncService(uint8_t cur, uint8_t nxt, uint8_t transType, bool transitioning, uint32_t phaseStart) {')
    expect(leader).toContain('pkt[5] = 1;')
    // A single style: the pool is a constant and the datagram carries its id.
    expect(leader).not.toContain('TRANS_POOL')
    expect(leader).toMatch(/^ {2}_syncService\(cur, nxt, \d+, transitioning, phaseStart\);$/m)
    expect(leader).not.toContain('_syncLocked')
    expect(leader.indexOf('static uint32_t phaseStart = 0;')).toBeLessThan(leader.indexOf('  _syncService(cur, nxt'))
    expect(leader.indexOf('  _syncService(cur, nxt')).toBeLessThan(leader.indexOf('if (!transitioning) {'))

    const follower = showSketch('follower')
    expect(follower).toContain('uint32_t now = _syncNowMs();')
    expect(follower).toContain('bool _syncLocked() {')
    expect(follower).toContain('return _syncHeard && millis() - _syncLastRxMs < 5000u;')
    // One style: the follower has no use for the leader's, so it is not read.
    expect(follower).toContain('static uint8_t _syncCur = 0, _syncNxt = 0;')
    expect(follower).toContain('_syncCur = pkt[10]; _syncNxt = pkt[11]; _syncTransitioning = pkt[13] != 0;')
    expect(follower).not.toContain('_syncTrans ')
    expect(follower).toContain('  if (_syncLocked() && _syncHasShow) {')
    expect(follower).toContain('    if (!transitioning && _syncTransitioning && _syncNxt != cur) {')
    expect(follower).toContain('      cur = _syncCur; nxt = _syncNxt; transitioning = true; phaseStart = _syncPhaseStart;')
    expect(follower).toContain('    } else if (!transitioning && !_syncTransitioning && _syncCur != cur) {')
    expect(follower).toContain('      cur = _syncCur; phaseStart = _syncPhaseStart;')
    // A locked follower never picks for itself.
    expect(follower).toContain('    if (!_syncLocked() && now - phaseStart >= 8000) {')
    expect(follower.indexOf('  _syncService();')).toBeLessThan(follower.indexOf('  if (_syncLocked() && _syncHasShow) {'))
    expect(follower.indexOf('  if (_syncLocked() && _syncHasShow) {')).toBeLessThan(follower.indexOf('if (!_syncLocked() && now - phaseStart'))
  })

  it('adopts the transition style from a pooled show', () => {
    const follower = pooledShow('follower')
    expect(follower).toContain('TRANS_POOL')
    expect(follower).toContain('static uint8_t _syncCur = 0, _syncNxt = 0, _syncTrans = 0;')
    expect(follower).toContain('      cur = _syncCur; nxt = _syncNxt; transType = _syncTrans; transitioning = true; phaseStart = _syncPhaseStart;')
    const leader = pooledShow('leader')
    expect(leader).toContain('  _syncService(cur, nxt, transType, transitioning, phaseStart);')
  })

  it('guards the cut show the same way and carries no transition', () => {
    const leader = showSketch('leader', { transitionSec: 0 })
    expect(leader).toContain('  _syncService(cur, 0, 0, false, phaseStart);')
    const follower = showSketch('follower', { transitionSec: 0 })
    expect(follower).toContain('  if (_syncLocked() && _syncHasShow && _syncCur != cur) { cur = _syncCur; phaseStart = _syncPhaseStart; }')
    expect(follower).toContain('  if (!_syncLocked() && now - phaseStart >= 8000) { cur = ')
    expect(follower).not.toContain('_syncNxt != cur')
  })

  it('follows cur only in a sequence, which owns its cursor', () => {
    const sequence = [
      { patternId: 'g0', hold: 4, transitionSec: 1, transition: 'crossfade' },
      { patternId: 'g1', hold: 4, transitionSec: 1, transition: 'crossfade' },
    ]
    const leader = showSketch('leader', { order: 'Sequence', sequence })
    expect(leader).toContain('  _syncService(cur, nxt, transType, transitioning, phaseStart);')
    const follower = showSketch('follower', { order: 'Sequence', sequence })
    expect(follower).toContain('  if (_syncLocked() && _syncHasShow && !transitioning && _syncCur != cur) cur = _syncCur;')
    expect(follower).toContain('bool seqDue = !_syncLocked() && !transitioning && (seqDelta != 0 || now - seqAt >= pgm_read_dword(&seqHoldMs[seqStep]));')
    expect(follower).not.toContain('_syncNxt != cur')
  })

  it('sends no show state from a single-pattern show', () => {
    const leader = showSketch('leader', {}, ['g0'])
    expect(leader).toContain('void _syncService() {')
    expect(leader).toContain('pkt[5] = 0;')
    expect(leader).toContain('  _syncService();')
    const follower = showSketch('follower', {}, ['g0'])
    expect(follower).not.toContain('_syncLocked')
    expect(follower).not.toContain('_syncCur')
    expect(follower).toContain('uint32_t now = _syncNowMs();')
  })

  it('emits one connection when the show already has a network user', () => {
    useNetworkCredentialsStore.getState().setCredentials('rtc', { ssid: 'studio', password: 'secret' })
    const nodes = [
      board('leader'),
      node('pc', 'PatternCollection', { patternIds: ['g0', 'g1'] }),
      node('pm', 'PatternSlideshow', { interval: 8, transitionSec: 1 }),
      node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
      node('rtc', 'RTCInput', { timeSource: 'NTP', wifiHostname: 'led-clock' }),
      node('status', 'InfoDisplay', { partId: 'ssd1306-oled-128x64', sdaPin: 8, sclPin: 9 }),
    ]
    const edges = [
      edge('pc', 'patternset', 'pm', 'patternset'), edge('pm', 'frame', 'out', 'frame'),
      edge('rtc', 'display', 'status', 'display'),
    ]
    const cpp = generateShowSketch(nodes, edges, groups)
    useNetworkCredentialsStore.getState().removeCredentials('rtc')
    expect(lines(cpp, 'void _netEnsureConnected()')).toHaveLength(1)
    expect(lines(cpp, '#include <WiFi.h>')).toHaveLength(1)
    // The clock owns the connection's settings; the Board only rides it.
    expect(cpp).toContain('WiFi.setHostname("led-clock");')
    expect(cpp).toContain('void _syncService(')
  })

  it('emits nothing into the SD player, whose clock is the track position', () => {
    const fixture = intervalControlFixture('player')
    fixture.nodes.find((entry) => entry.id === 'board')!.data.properties.clockSync = 'leader'
    const source = buildShowPlayer(fixture.nodes, fixture.edges, fixture.groups, {
      patternSet: ['pattern'], bakedAudio: false, genericPlayer: true, preferredTrack: '',
    })
    expect(source).not.toContain('_sync')
  })
})
