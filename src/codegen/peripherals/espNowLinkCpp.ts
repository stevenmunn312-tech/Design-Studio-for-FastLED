/**
 * Board links over ESP-NOW: the frame codec and the radio service.
 *
 * A project's boards are partitioned before codegen, and a wire one board
 * computes and another consumes reaches each generator as a synthetic
 * `BoardLinkIn` (a source) or `BoardLinkOut` (a sink) carrying its slot and the
 * link's shared tables (src/build/boardLinks.ts). This module turns the link
 * nodes of one partition into firmware, emitted only when the partition holds
 * one and holding only what it uses: a board that only sends has no receive
 * path, a board with no text slot no text code, a board with no press no
 * counters. See docs/design/board-links.md, "The protocol" and "Firmware".
 *
 * The frame, little-endian and written byte by byte as the clock-sync datagram
 * is: "FLLK", version, sender board index, flags, link id, schema hash, the
 * sender's boot session, a frame counter (32 bits each), then each slot as an
 * index byte and its value, then the first 8 bytes of HMAC-SHA256 over all of
 * it with the project's 128-bit key. At most 250 bytes.
 *
 * The C++ comes in three parts so the codec can be compiled and run on a host:
 * `_lnkHmac` (mbedTLS on ESP32, BearSSL on ESP8266), the portable codec (no
 * Arduino call: time is passed in), and the radio (esp_now, the receive ring
 * and its lock). The receive callback only copies a frame into the ring;
 * `loop()` verifies and applies frames before the graph and sends after it.
 * No send callback: broadcast frames have no delivery report worth reading.
 */

import type { StudioNode } from '../../state/graphStore'
import {
  BOARD_LINK_IN_NODE_TYPE,
  BOARD_LINK_OUT_NODE_TYPE,
  boardLinkPropertiesOf,
  boardLinkWireKind,
  type BoardLinkContext,
  type BoardLinkFrameEntry,
  type BoardLinkNodeProperties,
  type BoardLinkWireKind,
} from '../../build/boardLinks'
import { DISPLAY_TEXT_MAX_BYTES } from '../../state/displays/displayText'
import type { DisplaySignalKind } from '../../state/displays/displaySignal'
import { cppComment, safeId } from '../cppLiterals'
import type { ControlInputEmission } from '../controlInputCpp'

export const LINK_MAGIC = 'FLLK'
export const LINK_VERSION = 1
/** Magic, version, sender, flags, link id, hash, session, counter. */
export const LINK_HEADER_BYTES = 23
export const LINK_TAG_BYTES = 8
/** The ESP-NOW v1 payload every supported core accepts. */
export const LINK_FRAME_MAX_BYTES = 250
/** A changed value waits at most this long; frames are never closer. */
export const LINK_SEND_INTERVAL_MS = 20
/** Every number slot and one text slot are resent this often. */
export const LINK_HEARTBEAT_MS = 200
/** A sender not heard from for this long is lost. */
export const LINK_LOST_MS = 1000
/** Frames the receive callback can hold before `loop()` drains them. */
export const LINK_RING_FRAMES = 4
/** How often a schema mismatch is said on serial at most. */
export const LINK_MISMATCH_REPORT_MS = 5000
/** Flag bit: this frame is a heartbeat. */
export const LINK_FLAG_HEARTBEAT = 1

const TEXT_BYTES = DISPLAY_TEXT_MAX_BYTES + 1

/** One link node of the partition, with its properties. */
interface LinkNode {
  node: StudioNode
  props: BoardLinkNodeProperties
}

/** Where a value this board reads is kept: its storage family and position there. */
export interface LinkStorage {
  kind: BoardLinkWireKind
  /** Position in `_lnkW<s>`, `_lnkP*<s>` or `_lnkT<s>`. */
  at: number
}

/** One sender this board listens to. */
export interface LinkReceiver {
  /** The sender's position in the frame order: its frames' sender byte. */
  sender: number
  table: BoardLinkFrameEntry[]
  /** Frame index → where this board keeps it; absent indexes are skipped. */
  storage: Map<number, LinkStorage>
  /** Start value per stored word (float bits, a level, a packed colour). */
  wordStarts: number[]
  words: number
  presses: number
  texts: number
}

/** One value this board sends. */
export interface LinkSend {
  index: number
  kind: BoardLinkWireKind
  /**
   * The value now, as C++: a float, a bool, a CRGB, a `const char *`, or for a
   * datetime an `_RtcDateTimeValue`. Null for a reading this generator cannot
   * answer, which sends the kind's rest value.
   */
  expr: string | null
  /** For the comment beside it. */
  label: string
  /** Position among this board's word, press or text values. */
  at: number
}

/** What one partition's link nodes ask of the firmware. */
export interface BoardLinkPlan {
  context: BoardLinkContext
  /** This board's position in the frame order. */
  self: number
  receivers: LinkReceiver[]
  linkIns: LinkNode[]
  linkOuts: LinkNode[]
  /** This board's own frame table: what it sends, by index. */
  table: BoardLinkFrameEntry[]
}

/** The partition's link nodes, or none. */
function linkNodesOf(nodes: readonly StudioNode[]): LinkNode[] {
  const found: LinkNode[] = []
  for (const node of nodes) {
    const props = boardLinkPropertiesOf(node)
    if (props?.link) found.push({ node, props })
  }
  return found
}

const isWord = (kind: BoardLinkWireKind) => kind === 'float' || kind === 'bool' || kind === 'color' || kind === 'datetime'

/** IEEE 754 single bits of a number, as the sketch's float holds it. */
export function floatBits(value: number): number {
  const view = new DataView(new ArrayBuffer(4))
  view.setFloat32(0, value, true)
  return view.getUint32(0, true)
}

/** A start value as the word a receiver keeps it in. */
function startWord(kind: BoardLinkWireKind, start: unknown): number {
  if (kind === 'float') return floatBits(typeof start === 'number' && Number.isFinite(start) ? start : 0)
  if (kind === 'bool') return start === true ? 1 : 0
  if (kind === 'color') return typeof start === 'number' && Number.isInteger(start) ? (start >>> 0) & 0xffffff : 0
  return 0
}

/**
 * What a partition's link nodes need, or null when it holds none — a one-board
 * project, or a board no wire crosses into or out of.
 */
export function boardLinkPlan(nodes: readonly StudioNode[]): BoardLinkPlan | null {
  const links = linkNodesOf(nodes)
  if (links.length === 0) return null
  const context = links[0].props.link!
  const linkIns = links.filter(({ node }) => node.data.nodeType === BOARD_LINK_IN_NODE_TYPE)
  const linkOuts = links.filter(({ node }) => node.data.nodeType === BOARD_LINK_OUT_NODE_TYPE)
  const boardId = nodes.find((node) => node.data.nodeType === 'Board')?.id
    ?? linkOuts[0]?.props.senderBoardId ?? ''
  const self = Math.max(0, context.boardOrder.indexOf(boardId))

  // Every index this board reads from each sender, with the start value of a
  // plain slot (a display field starts absent).
  const reads = new Map<number, Map<number, unknown>>()
  for (const { props } of linkIns) {
    const sender = context.boardOrder.indexOf(props.senderBoardId)
    if (sender < 0) continue
    const read = reads.get(sender) ?? new Map<number, unknown>()
    reads.set(sender, read)
    if (props.fields) for (const field of props.fields) read.set(field.index, undefined)
    else read.set(props.slot, props.start)
  }
  const receivers: LinkReceiver[] = [...reads.keys()].sort((a, b) => a - b).map((sender) => {
    const table = context.frames[context.boardOrder[sender]] ?? []
    const read = reads.get(sender)!
    const storage = new Map<number, LinkStorage>()
    const wordStarts: number[] = []
    let presses = 0, texts = 0
    for (const entry of table) {
      if (!read.has(entry.index)) continue
      if (isWord(entry.kind)) {
        storage.set(entry.index, { kind: entry.kind, at: wordStarts.length })
        wordStarts.push(startWord(entry.kind, read.get(entry.index)))
      } else if (entry.kind === 'press') {
        storage.set(entry.index, { kind: 'press', at: presses++ })
      } else {
        storage.set(entry.index, { kind: 'text', at: texts++ })
      }
    }
    return { sender, table, storage, wordStarts, words: wordStarts.length, presses, texts }
  })
  return { context, self, receivers, linkIns, linkOuts, table: context.frames[context.boardOrder[self]] ?? [] }
}

/** The receiver for one sender board id, if this board reads it. */
function receiverFor(plan: BoardLinkPlan, senderBoardId: string): LinkReceiver | undefined {
  const sender = plan.context.boardOrder.indexOf(senderBoardId)
  return plan.receivers.find((receiver) => receiver.sender === sender)
}

/** Whether the sender is heard from now: false before the first frame and once it is lost. */
export function boardLinkUpExpr(plan: BoardLinkPlan, senderBoardId: string): string {
  const receiver = receiverFor(plan, senderBoardId)
  return receiver ? `_lnkUp${receiver.sender}` : 'false'
}

/** C++ for one stored value, as its graph type. */
function readExpr(sender: number, store: LinkStorage): string {
  switch (store.kind) {
    case 'float': return `_lnkFloat(_lnkW${sender}[${store.at}])`
    case 'bool': return `(_lnkW${sender}[${store.at}] != 0u)`
    case 'color': return `CRGB(_lnkW${sender}[${store.at}])`
    case 'press': return `_lnkPO${sender}[${store.at}]`
    case 'text': return `_lnkT${sender}[${store.at}]`
    default: return `_lnkW${sender}[${store.at}]`
  }
}

/**
 * What a link-in node reads, as C++ of the wire's own type: a float, bool,
 * CRGB or `const char *`. A datetime is read with `boardLinkDateTimeCpp`; a
 * display through `boardLinkFieldExpressions`.
 */
export function boardLinkValueExpr(plan: BoardLinkPlan, props: BoardLinkNodeProperties): string | null {
  const receiver = receiverFor(plan, props.senderBoardId)
  const store = receiver?.storage.get(props.slot)
  return receiver && store ? readExpr(receiver.sender, store) : null
}

/** The declaration of a received datetime as the struct an RTC writes. */
export function boardLinkDateTimeCpp(plan: BoardLinkPlan, props: BoardLinkNodeProperties, name: string, index = props.slot): string[] {
  const receiver = receiverFor(plan, props.senderBoardId)
  const store = receiver?.storage.get(index)
  const up = boardLinkUpExpr(plan, props.senderBoardId)
  const lines = [`  _RtcDateTimeValue ${name} = { false, false, true, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f, false };`]
  if (!receiver || !store) return lines
  // Seconds since 1970 in the sender's local time, 0 for a clock not yet set.
  lines.push(
    `  if (_lnkW${receiver.sender}[${store.at}] != 0u) {`,
    `    uint32_t _lnkS = _lnkW${receiver.sender}[${store.at}];`,
    `    int32_t _lnkDays = (int32_t)(_lnkS / 86400u);`,
    `    uint32_t _lnkSod = _lnkS % 86400u;`,
    `    int16_t _lnkY; uint8_t _lnkMo, _lnkD;`,
    `    _rtcCivilFromDays(_lnkDays, _lnkY, _lnkMo, _lnkD);`,
    `    uint8_t _lnkWd = _rtcWeekdayFromDays(_lnkDays);`,
    `    ${name} = { true, ${up}, !${up}, (float)(_lnkSod / 3600u), (float)((_lnkSod / 60u) % 60u), (float)(_lnkSod % 60u),`,
    `      (float)_lnkWd, (float)_lnkD, (float)_lnkMo, (float)_lnkY, (float)_lnkSod, _lnkWd == 0 || _lnkWd == 6 };`,
    `  }`,
  )
  return lines
}

/**
 * The fields of a received display, by source-field id, as the expression
 * tables in displaySourceExpressions.ts hold them: text a `const char *`,
 * the rest floats and bools. Each reads its rest value while the sender is
 * lost, the absent signal a panel's own blanks already stand for. A clock's
 * fields are the struct's, through `normalSketchSourceExpressions`.
 */
export function boardLinkFieldExpressions(plan: BoardLinkPlan, props: BoardLinkNodeProperties): Record<string, string> {
  const receiver = receiverFor(plan, props.senderBoardId)
  if (!receiver) return {}
  const up = `_lnkUp${receiver.sender}`
  const table: Record<string, string> = {}
  for (const field of props.fields ?? []) {
    const store = receiver.storage.get(field.index)
    if (!store) continue
    const value = readExpr(receiver.sender, store)
    table[field.id] = store.kind === 'text' ? `(${up} ? (const char *)${value} : "")`
      : store.kind === 'bool' ? `(${up} && ${value})`
        : store.kind === 'float' ? `(${up} ? ${value} : 0.0f)`
          : value
  }
  return table
}

/** A display signal that arrives over the link, as a panel or Song Info reads it. */
export interface LinkedDisplay {
  kind: DisplaySignalKind
  /** C++ that is true while the sending board is heard; false draws the waiting screen. */
  upExpr: string
  /** Source-field id → C++, as `boardLinkFieldExpressions` gives them. */
  fields: Record<string, string>
  /** A clock's `_RtcDateTimeValue`, declared by the link-in. */
  clockExpr: string | null
}

/** The `_RtcDateTimeValue` a link-in carrying a clock declares. */
export const linkedClockSymbol = (linkInId: string) => `n_${safeId(linkInId)}_dateTime`

/** The display a source node stands for when it is a link-in, or null for any other source. */
export function linkedDisplayOf(plan: BoardLinkPlan | null, source: StudioNode | undefined | null): LinkedDisplay | null {
  if (!plan || !source || source.data.nodeType !== BOARD_LINK_IN_NODE_TYPE) return null
  const props = boardLinkPropertiesOf(source)
  if (!props || props.dataType !== 'display' || !props.displayKind) return null
  return {
    kind: props.displayKind,
    upExpr: boardLinkUpExpr(plan, props.senderBoardId),
    fields: boardLinkFieldExpressions(plan, props),
    clockExpr: props.displayKind === 'clock' ? linkedClockSymbol(source.id) : null,
  }
}

/**
 * A link-in as a control source: a float, a level or a press, a colour or a
 * text, read off the link before the control graph runs. A datetime or a
 * display has no control type, and the caller reports the wire.
 */
export function boardLinkControlEmission(plan: BoardLinkPlan | null, node: StudioNode, id: string): ControlInputEmission | null {
  if (!plan || node.data.nodeType !== BOARD_LINK_IN_NODE_TYPE) return null
  const props = boardLinkPropertiesOf(node)
  if (!props) return null
  const type = props.dataType
  if (type !== 'float' && type !== 'bool' && type !== 'color' && type !== 'string') return null
  const cpp = type === 'bool' ? 'bool' : type === 'color' ? 'CRGB' : type === 'string' ? 'const char *' : 'float'
  const rest = type === 'bool' ? 'false' : type === 'color' ? 'CRGB::Black' : type === 'string' ? '""' : '0.0f'
  return {
    setup: [],
    loop: [`  ${cpp} n_${id}_value = ${boardLinkValueExpr(plan, props) ?? rest};  // over the board link`],
    outputs: { value: type },
  }
}

/** C++ a word to send is staged from. */
function stageWord(kind: BoardLinkWireKind, expr: string | null): string {
  if (expr === null) return '0u'
  switch (kind) {
    case 'float': return `_lnkBits(${expr})`
    case 'bool': return `((${expr}) ? 1u : 0u)`
    case 'color': return `(((uint32_t)(${expr}).r << 16) | ((uint32_t)(${expr}).g << 8) | (uint32_t)(${expr}).b)`
    // Local seconds since 1970, from the struct an RTC writes; 0 while unset.
    default: return `_lnkUnix((${expr}).valid, (${expr}).year, (${expr}).month, (${expr}).day, (${expr}).secondsOfDay)`
  }
}

export interface BoardLinkFirmwareOptions {
  /**
   * The board joins Wi-Fi, so ESP-NOW rides the access point's channel and
   * modem sleep must be off; otherwise the radio is a station on no network,
   * on the link's own channel. Wired Ethernet alone is not Wi-Fi.
   */
  joinsWifi: boolean
  /** The validated 16-byte link key, or null when this machine has none. */
  key: Uint8Array | null
  /** Bench telemetry is on: keep the counters the report prints. */
  telemetry?: boolean
}

export interface BoardLinkFirmware {
  /** One block: the platform's radio and HMAC headers. */
  include: string
  /** File scope: key, tables, codec and radio. */
  globals: string
  /** `setup()` lines: start the radio once the network bootstrap exists. */
  setup: string[]
  /** `loop()` lines before the graph: drain, verify and apply received frames. */
  receive: string[]
  /** `loop()` lines after the graph: stage what this board sends, then send. */
  stage: string[]
  transmit: string[]
  /** Whether frames are received here, so serial is needed for the mismatch line. */
  receives: boolean
}

const LE32 = (target: string, name: string) => `_lnkPut32(${target}, ${name});`

/** The platform's headers. */
export function boardLinkIncludeCpp(): string {
  return [
    `#if defined(ESP32)`,
    `#include <WiFi.h>`,
    `#include <esp_now.h>`,
    `#include <esp_wifi.h>`,
    `#include <mbedtls/md.h>`,
    `#elif defined(ESP8266)`,
    `#include <ESP8266WiFi.h>`,
    `#include <espnow.h>`,
    `#include <bearssl/bearssl_hmac.h>`,
    `extern "C" {`,
    `#include <user_interface.h>`,
    `}`,
    `#endif`,
  ].join('\n')
}

/** HMAC-SHA256 with the link key, from the core's own crypto library. */
export function boardLinkHmacCpp(): string {
  return [
    `// HMAC-SHA256 of a frame with the project's link key: mbedTLS on ESP32,`,
    `// the core's BearSSL on ESP8266. ESP-NOW's own encryption works only on`,
    `// unicast peers, and every frame here is a broadcast.`,
    `static void _lnkHmac(const uint8_t *data, size_t len, uint8_t *out) {`,
    `#if defined(ESP32)`,
    `  mbedtls_md_hmac(mbedtls_md_info_from_type(MBEDTLS_MD_SHA256), _lnkKey, sizeof(_lnkKey), data, len, out);`,
    `#elif defined(ESP8266)`,
    `  br_hmac_key_context keyContext;`,
    `  br_hmac_key_init(&keyContext, &br_sha256_vtable, _lnkKey, sizeof(_lnkKey));`,
    `  br_hmac_context context;`,
    `  br_hmac_init(&context, &keyContext, 0);`,
    `  br_hmac_update(&context, data, len);`,
    `  br_hmac_out(&context, out);`,
    `#else`,
    `  (void)data; (void)len;`,
    `  memset(out, 0, 32);`,
    `#endif`,
    `}`,
  ].join('\n')
}

/** The key, identity and channel every frame is checked against. */
export function boardLinkKeyCpp(plan: BoardLinkPlan, key: Uint8Array | null): string {
  const bytes = key && key.length === 16 ? [...key] : new Array<number>(16).fill(0)
  const hex = (byte: number) => `0x${(byte & 0xff).toString(16).padStart(2, '0')}`
  const linkId = plan.context.linkId ?? '00000000'
  return [
    key && key.length === 16
      ? `// The project's link key, from this machine's credentials store.`
      : `// No link key on this machine: validation refuses the upload until one is made.`,
    `static const uint8_t _lnkKey[16] = { ${bytes.map(hex).join(', ')} };`,
    `static const uint32_t LNK_LINK_ID = 0x${linkId}u;`,
    `static const uint32_t LNK_SCHEMA_HASH = 0x${(plan.context.hash >>> 0).toString(16).padStart(8, '0')}u;`,
    `static const uint8_t LNK_SELF = ${plan.self};`,
  ].join('\n')
}

/**
 * The portable codec: framing, the tag, staging and building what this board
 * sends, verifying and applying what it receives. No Arduino calls, so a host
 * test compiles it with a reference HMAC in place of `_lnkHmac`.
 */
export function boardLinkCodecCpp(plan: BoardLinkPlan, sends: readonly LinkSend[], telemetry = false): string {
  const lines: string[] = []
  const push = (...more: string[]) => lines.push(...more)
  const receives = plan.receivers.length > 0
  const sendsAny = sends.length > 0
  const kindsSent = new Set(sends.map((send) => send.kind))
  const kindsRead = new Set(plan.receivers.flatMap((receiver) => [...receiver.storage.values()].map((store) => store.kind)))
  const floats = kindsSent.has('float') || kindsRead.has('float')

  push(
    `// ── Board link (ESP-NOW) ── see docs/design/board-links.md`,
    `static void _lnkPut32(uint8_t *p, uint32_t v) {`,
    `  p[0] = (uint8_t)(v & 0xFFu);`,
    `  p[1] = (uint8_t)((v >> 8) & 0xFFu);`,
    `  p[2] = (uint8_t)((v >> 16) & 0xFFu);`,
    `  p[3] = (uint8_t)((v >> 24) & 0xFFu);`,
    `}`,
  )
  if (receives) {
    push(
      `static uint32_t _lnkGet32(const uint8_t *p) {`,
      `  return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);`,
      `}`,
    )
  }
  if (floats) {
    push(`// A float's IEEE 754 bits and back, so it crosses the wire exactly.`)
    if (kindsSent.has('float')) push(`static uint32_t _lnkBits(float v) { uint32_t b; memcpy(&b, &v, 4); return b; }`)
    if (kindsRead.has('float')) push(`static float _lnkFloat(uint32_t b) { float v; memcpy(&v, &b, 4); return v; }`)
  }

  if (sendsAny) push(...sendCodecCpp(plan, sends, kindsSent))
  if (receives) push(...receiveCodecCpp(plan, telemetry))
  return lines.join('\n')
}

function sendCodecCpp(plan: BoardLinkPlan, sends: readonly LinkSend[], kinds: ReadonlySet<BoardLinkWireKind>): string[] {
  const words = sends.filter((send) => isWord(send.kind)).length
  const presses = sends.filter((send) => send.kind === 'press').length
  const texts = sends.filter((send) => send.kind === 'text')
  const count = plan.table.length
  const slotEnd = LINK_FRAME_MAX_BYTES - LINK_TAG_BYTES
  const lines = [
    `// What this board sends: the value each slot last staged, and whether it`,
    `// still has to go out. A changed slot leaves within ${LINK_SEND_INTERVAL_MS} ms; every`,
    `// ${LINK_HEARTBEAT_MS} ms each number slot and one text slot go again, so a board that`,
    `// starts late or resets has the whole state within about a second.`,
    `static bool _lnkTxDirty[${count}];`,
    ...(words ? [`static uint32_t _lnkTxWord[${words}];`] : []),
    ...(presses ? [
      `static uint16_t _lnkTxPresses[${presses}];`,
      `static bool _lnkTxLevel[${presses}];`,
    ] : []),
    ...(texts.length ? [
      `static char _lnkTxText[${texts.length}][${TEXT_BYTES}];`,
      ...(texts.length > 1 ? [`static uint8_t _lnkTxTextTurn = 0;`] : []),
    ] : []),
    `static uint32_t _lnkSession = 0, _lnkTxCounter = 0, _lnkTxLastMs = 0, _lnkTxBeatMs = 0;`,
  ]
  if (words) {
    lines.push(
      `static void _lnkStageWord(uint8_t index, uint8_t at, uint32_t v) {`,
      `  if (_lnkTxWord[at] != v) { _lnkTxWord[at] = v; _lnkTxDirty[index] = true; }`,
      `}`,
    )
  }
  if (kinds.has('datetime')) {
    lines.push(
      `// An RTC's reading as local seconds since 1970, 0 while it is not set.`,
      `static uint32_t _lnkUnix(bool valid, float year, float month, float day, float secondsOfDay) {`,
      `  if (!valid) return 0u;`,
      `  int32_t days = _rtcDaysFromCivil((int16_t)year, (uint8_t)month, (uint8_t)day);`,
      `  return (uint32_t)days * 86400u + (uint32_t)secondsOfDay;`,
      `}`,
    )
  }
  if (presses) {
    lines.push(
      `// A press is a counter: each rising edge is one press, so a tap between two`,
      `// of the receiver's passes, or in a frame that is lost, is still one press.`,
      `static void _lnkStagePress(uint8_t index, uint8_t at, bool level) {`,
      `  if (level == _lnkTxLevel[at]) return;`,
      `  if (level) _lnkTxPresses[at]++;`,
      `  _lnkTxLevel[at] = level;`,
      `  _lnkTxDirty[index] = true;`,
      `}`,
    )
  }
  if (texts.length) {
    lines.push(
      `// Text held to ${DISPLAY_TEXT_MAX_BYTES} bytes, cut on a whole UTF-8 character as Text Entry holds it.`,
      `static void _lnkStageText(uint8_t index, uint8_t at, const char *text) {`,
      `  char held[${TEXT_BYTES}];`,
      `  size_t n = 0;`,
      `  if (text) {`,
      `    while (text[n]) {`,
      `      unsigned char ch = (unsigned char)text[n];`,
      `      size_t width = ch < 0x80 ? 1 : ch >= 0xF0 ? 4 : ch >= 0xE0 ? 3 : ch >= 0xC0 ? 2 : 1;`,
      `      if (n + width > ${DISPLAY_TEXT_MAX_BYTES}) break;`,
      `      size_t k = 1;`,
      `      while (k < width && text[n + k]) k++;`,
      `      if (k < width) break;`,
      `      n += width;`,
      `    }`,
      `    memcpy(held, text, n);`,
      `  }`,
      `  held[n] = 0;`,
      `  if (strcmp(held, _lnkTxText[at]) != 0) { memcpy(_lnkTxText[at], held, n + 1); _lnkTxDirty[index] = true; }`,
      `}`,
    )
  }

  // The heartbeat: every number slot, and the text slots one at a time.
  const numbers = sends.filter((send) => send.kind !== 'text')
  const heartbeat = [
    ...(numbers.length ? numbers.map((send) => `    _lnkTxDirty[${send.index}] = true;`) : []),
    ...(texts.length === 1 ? [`    _lnkTxDirty[${texts[0].index}] = true;`] : []),
    ...(texts.length > 1 ? [
      `    switch (_lnkTxTextTurn) {`,
      ...texts.map((send, turn) => `      case ${turn}: _lnkTxDirty[${send.index}] = true; break;`),
      `    }`,
      `    _lnkTxTextTurn = (uint8_t)((_lnkTxTextTurn + 1) % ${texts.length});`,
    ] : []),
  ]
  const appendSlot = (send: LinkSend): string[] => {
    const bytes = send.kind === 'float' || send.kind === 'datetime' ? 4 : send.kind === 'bool' ? 1 : 3
    const dirty = `_lnkTxDirty[${send.index}]`
    const note = `  // ${cppComment(send.label)}`
    if (send.kind === 'text') {
      return [
        `  {${note}`,
        `    size_t len = strlen(_lnkTxText[${send.at}]);`,
        `    if (${dirty} && at + 2 + len <= ${slotEnd}) {`,
        `      f[at++] = ${send.index}; f[at++] = (uint8_t)len;`,
        `      memcpy(f + at, _lnkTxText[${send.at}], len); at += len;`,
        `      ${dirty} = false;`,
        `    }`,
        `  }`,
      ]
    }
    const write = send.kind === 'press'
      ? [
          `    f[at] = (uint8_t)(_lnkTxPresses[${send.at}] & 0xFFu); f[at + 1] = (uint8_t)(_lnkTxPresses[${send.at}] >> 8);`,
          `    f[at + 2] = _lnkTxLevel[${send.at}] ? 1 : 0;`,
        ]
      : send.kind === 'bool'
        ? [`    f[at] = (uint8_t)_lnkTxWord[${send.at}];`]
        : send.kind === 'color'
          // Packed 0xRRGGBB, low byte first like every other field.
          ? [`    f[at] = (uint8_t)(_lnkTxWord[${send.at}] & 0xFFu); f[at + 1] = (uint8_t)((_lnkTxWord[${send.at}] >> 8) & 0xFFu); f[at + 2] = (uint8_t)((_lnkTxWord[${send.at}] >> 16) & 0xFFu);`]
          : [`    ${LE32('f + at', `_lnkTxWord[${send.at}]`)}`]
    return [
      `  if (${dirty} && at + ${1 + bytes} <= ${slotEnd}) {${note}`,
      `    f[at++] = ${send.index};`,
      ...write,
      `    at += ${bytes};`,
      `    ${dirty} = false;`,
      `  }`,
    ]
  }
  lines.push(
    `// Build the next frame into f, or return 0 when nothing is due. A slot that`,
    `// does not fit stays marked and goes in the next frame.`,
    `static size_t _lnkBuild(uint8_t *f, uint32_t now) {`,
    `  bool beat = (uint32_t)(now - _lnkTxBeatMs) >= ${LINK_HEARTBEAT_MS}u;`,
    `  if (beat) {`,
    `    _lnkTxBeatMs = now;`,
    ...heartbeat,
    `  }`,
    `  if ((uint32_t)(now - _lnkTxLastMs) < ${LINK_SEND_INTERVAL_MS}u) return 0;`,
    `  bool due = false;`,
    `  for (uint8_t i = 0; i < ${count}; i++) if (_lnkTxDirty[i]) due = true;`,
    `  if (!due) return 0;`,
    `  f[0] = 'F'; f[1] = 'L'; f[2] = 'L'; f[3] = 'K';`,
    `  f[4] = ${LINK_VERSION};`,
    `  f[5] = LNK_SELF;`,
    `  f[6] = beat ? ${LINK_FLAG_HEARTBEAT} : 0;`,
    `  ${LE32('f + 7', 'LNK_LINK_ID')}`,
    `  ${LE32('f + 11', 'LNK_SCHEMA_HASH')}`,
    `  ${LE32('f + 15', '_lnkSession')}`,
    `  _lnkTxCounter++;`,
    `  ${LE32('f + 19', '_lnkTxCounter')}`,
    `  size_t at = ${LINK_HEADER_BYTES};`,
    ...sends.flatMap(appendSlot),
    `  uint8_t tag[32];`,
    `  _lnkHmac(f, at, tag);`,
    `  memcpy(f + at, tag, ${LINK_TAG_BYTES});`,
    `  _lnkTxLastMs = now;`,
    `  return at + ${LINK_TAG_BYTES};`,
    `}`,
  )
  return lines
}

function receiveCodecCpp(plan: BoardLinkPlan, telemetry: boolean): string[] {
  const lines: string[] = [
    `// What this board receives, kept per sender: its session, the last frame`,
    `// counter, when it was last heard, and the values this board reads.`,
  ]
  for (const receiver of plan.receivers) {
    const s = receiver.sender
    lines.push(
      `static uint32_t _lnkSess${s} = 0, _lnkCtr${s} = 0, _lnkSeen${s} = 0;`,
      `static bool _lnkHeard${s} = false, _lnkUp${s} = false;`,
    )
    if (receiver.words) {
      lines.push(`static uint32_t _lnkW${s}[${receiver.words}] = { ${receiver.wordStarts.map((word) => `0x${word.toString(16)}u`).join(', ')} };`)
    }
    if (receiver.presses) {
      const n = receiver.presses
      lines.push(
        `// A press: the counter last seen, presses not yet read, the level, a`,
        `// false pass owed between two presses, adopt-without-firing, this pass's reading.`,
        `static uint16_t _lnkPC${s}[${n}], _lnkPQ${s}[${n}];`,
        `static bool _lnkPL${s}[${n}], _lnkPG${s}[${n}], _lnkPA${s}[${n}], _lnkPO${s}[${n}];`,
      )
    }
    if (receiver.texts) lines.push(`static char _lnkT${s}[${receiver.texts}][${TEXT_BYTES}];`)
  }
  lines.push(
    `static bool _lnkMismatch = false;`,
    ...(telemetry ? [
      `// Frames applied, and frames dropped by reason, since boot (telemetry).`,
      `static uint32_t _lnkRxFrames = 0, _lnkDropId = 0, _lnkDropHash = 0, _lnkDropTag = 0, _lnkDropOld = 0;`,
      `static volatile uint32_t _lnkDropRing = 0;`,
      `static uint32_t _lnkSeenAny = 0;`,
      `static bool _lnkHeardAny = false;`,
    ] : []),
  )
  const count = (name: string) => (telemetry ? ` ${name}++;` : '')

  // One decoder per sender, by its table: a value this board reads is kept, any
  // other is stepped over. A slot that runs off the frame ends the decode.
  for (const receiver of plan.receivers) {
    const s = receiver.sender
    const arms = receiver.table.map((entry) => {
      const store = receiver.storage.get(entry.index)
      const head = `      case ${entry.index}:`
      switch (entry.kind) {
        case 'text':
          return [
            `${head} {`,
            `        if (at >= n) return;`,
            `        uint8_t len = p[at++];`,
            `        if (len > ${DISPLAY_TEXT_MAX_BYTES} || at + len > n) return;`,
            ...(store ? [`        memcpy(_lnkT${s}[${store.at}], p + at, len); _lnkT${s}[${store.at}][len] = 0;`] : []),
            `        at += len;`,
            `        break;`,
            `      }`,
          ]
        case 'press':
          return [
            `${head} {`,
            `        if (at + 3 > n) return;`,
            ...(store ? [
              `        uint16_t c = (uint16_t)(p[at] | ((uint16_t)p[at + 1] << 8));`,
              `        if (_lnkPA${s}[${store.at}]) _lnkPA${s}[${store.at}] = false;`,
              `        else _lnkPQ${s}[${store.at}] = (uint16_t)(_lnkPQ${s}[${store.at}] + (uint16_t)(c - _lnkPC${s}[${store.at}]));`,
              `        _lnkPC${s}[${store.at}] = c;`,
              `        _lnkPL${s}[${store.at}] = p[at + 2] != 0;`,
            ] : []),
            `        at += 3;`,
            `        break;`,
            `      }`,
          ]
        case 'bool':
          return [
            `${head}`,
            `        if (at + 1 > n) return;`,
            ...(store ? [`        _lnkW${s}[${store.at}] = p[at] != 0 ? 1u : 0u;`] : []),
            `        at += 1;`,
            `        break;`,
          ]
        case 'color':
          return [
            `${head}`,
            `        if (at + 3 > n) return;`,
            ...(store ? [`        _lnkW${s}[${store.at}] = (uint32_t)p[at] | ((uint32_t)p[at + 1] << 8) | ((uint32_t)p[at + 2] << 16);`] : []),
            `        at += 3;`,
            `        break;`,
          ]
        default:
          return [
            `${head}`,
            `        if (at + 4 > n) return;`,
            ...(store ? [`        _lnkW${s}[${store.at}] = _lnkGet32(p + at);`] : []),
            `        at += 4;`,
            `        break;`,
          ]
      }
    })
    lines.push(
      `static void _lnkDecode${s}(const uint8_t *p, size_t n) {`,
      `  size_t at = 0;`,
      `  while (at < n) {`,
      `    switch (p[at++]) {`,
      ...arms.flat(),
      `      default: return;`,
      `    }`,
      `  }`,
      `}`,
    )
  }

  lines.push(
    `// Checked in the order that costs least first; the tag last, over every byte`,
    `// before it. A new session is a sender that reset, accepted on a valid tag.`,
    `static void _lnkAccept(const uint8_t *f, size_t n, uint32_t now) {`,
    `  if (n < ${LINK_HEADER_BYTES + LINK_TAG_BYTES} || n > ${LINK_FRAME_MAX_BYTES} || f[0] != 'F' || f[1] != 'L' || f[2] != 'L' || f[3] != 'K' || f[4] != ${LINK_VERSION}) {${count('_lnkDropTag')} return; }`,
    `  if (_lnkGet32(f + 7) != LNK_LINK_ID) {${count('_lnkDropId')} return; }`,
    `  if (_lnkGet32(f + 11) != LNK_SCHEMA_HASH) {${count('_lnkDropHash')} _lnkMismatch = true; return; }`,
    `  uint8_t s = f[5];`,
    `  if (${plan.receivers.map((receiver) => `s != ${receiver.sender}`).join(' && ')}) return;  // a board whose values this one does not read`,
    `  uint8_t tag[32];`,
    `  _lnkHmac(f, n - ${LINK_TAG_BYTES}, tag);`,
    `  uint8_t diff = 0;`,
    `  for (uint8_t i = 0; i < ${LINK_TAG_BYTES}; i++) diff |= (uint8_t)(tag[i] ^ f[n - ${LINK_TAG_BYTES} + i]);`,
    `  if (diff != 0) {${count('_lnkDropTag')} return; }`,
    `  uint32_t session = _lnkGet32(f + 15), counter = _lnkGet32(f + 19);`,
    `  const uint8_t *slots = f + ${LINK_HEADER_BYTES};`,
    `  size_t len = n - ${LINK_HEADER_BYTES + LINK_TAG_BYTES};`,
    `  switch (s) {`,
  )
  for (const receiver of plan.receivers) {
    const s = receiver.sender
    lines.push(
      `    case ${s}: {`,
      `      bool fresh = !_lnkHeard${s} || session != _lnkSess${s};`,
      `      if (!fresh && counter <= _lnkCtr${s}) {${count('_lnkDropOld')} return; }`,
      ...(receiver.presses ? [
        `      // Presses made while the link was down are dropped, not replayed late.`,
        `      if (fresh || !_lnkUp${s}) for (uint8_t i = 0; i < ${receiver.presses}; i++) _lnkPA${s}[i] = true;`,
      ] : []),
      `      _lnkSess${s} = session; _lnkCtr${s} = counter; _lnkSeen${s} = now;`,
      `      _lnkHeard${s} = true; _lnkUp${s} = true;`,
      `      _lnkDecode${s}(slots, len);`,
      `      break;`,
      `    }`,
    )
  }
  lines.push(
    `  }`,
    ...(telemetry ? [`  _lnkRxFrames++; _lnkSeenAny = now; _lnkHeardAny = true;`] : []),
    `}`,
  )

  // Once a pass, after the frames: who is still heard, and what each press reads.
  lines.push(
    `// A sender lost for ${LINK_LOST_MS} ms keeps its held values; its presses fall to`,
    `// false. Each counted press is one pass reading true, with a false pass`,
    `// between two, so an edge-detecting consumer sees every one.`,
    `static void _lnkTick(uint32_t now) {`,
  )
  for (const receiver of plan.receivers) {
    const s = receiver.sender
    lines.push(`  _lnkUp${s} = _lnkHeard${s} && (uint32_t)(now - _lnkSeen${s}) < ${LINK_LOST_MS}u;`)
    if (!receiver.presses) continue
    lines.push(
      `  for (uint8_t i = 0; i < ${receiver.presses}; i++) {`,
      `    if (!_lnkUp${s}) { _lnkPL${s}[i] = false; _lnkPQ${s}[i] = 0; _lnkPG${s}[i] = false; }`,
      `    if (_lnkPG${s}[i]) { _lnkPO${s}[i] = false; _lnkPG${s}[i] = false; }`,
      `    else if (_lnkPQ${s}[i] > 0) { _lnkPQ${s}[i]--; _lnkPO${s}[i] = true; _lnkPG${s}[i] = _lnkPQ${s}[i] > 0; }`,
      `    else _lnkPO${s}[i] = _lnkPL${s}[i];`,
      `  }`,
    )
  }
  lines.push(`}`)
  return lines
}

/** The radio: start, the receive ring and its lock, the drain and the send. */
export function boardLinkRadioCpp(plan: BoardLinkPlan, sends: readonly LinkSend[], opts: BoardLinkFirmwareOptions): string {
  const receives = plan.receivers.length > 0
  const sendsAny = sends.length > 0
  const channel = plan.context.channel
  const lines: string[] = [
    `static bool _lnkReady = false;`,
    `static const uint8_t _lnkBroadcast[6] = { 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF };`,
  ]
  if (receives) {
    lines.push(
      `// The receive callback runs in the Wi-Fi task, so it only copies a frame`,
      `// into this ring under the lock; loop() does the rest.`,
      `static uint8_t _lnkRing[${LINK_RING_FRAMES}][${LINK_FRAME_MAX_BYTES}];`,
      `static uint8_t _lnkRingLen[${LINK_RING_FRAMES}];`,
      `static volatile uint8_t _lnkRingHead = 0, _lnkRingTail = 0;`,
      `#if defined(ESP32)`,
      `static portMUX_TYPE _lnkMux = portMUX_INITIALIZER_UNLOCKED;`,
      `#endif`,
      `static void _lnkLock() {`,
      `#if defined(ESP32)`,
      `  portENTER_CRITICAL(&_lnkMux);`,
      `#elif defined(ESP8266)`,
      `  noInterrupts();`,
      `#endif`,
      `}`,
      `static void _lnkUnlock() {`,
      `#if defined(ESP32)`,
      `  portEXIT_CRITICAL(&_lnkMux);`,
      `#elif defined(ESP8266)`,
      `  interrupts();`,
      `#endif`,
      `}`,
      `static void _lnkPush(const uint8_t *data, int len) {`,
      `  if (len <= 0 || len > ${LINK_FRAME_MAX_BYTES}) return;`,
      `  _lnkLock();`,
      `  uint8_t next = (uint8_t)((_lnkRingHead + 1) % ${LINK_RING_FRAMES});`,
      `  if (next != _lnkRingTail) {`,
      `    memcpy(_lnkRing[_lnkRingHead], data, (size_t)len);`,
      `    _lnkRingLen[_lnkRingHead] = (uint8_t)len;`,
      `    _lnkRingHead = next;`,
      ...(opts.telemetry ? [`  } else {`, `    _lnkDropRing++;`] : []),
      `  }`,
      `  _lnkUnlock();`,
      `}`,
      `#if defined(ESP32)`,
      `#if ESP_ARDUINO_VERSION_MAJOR >= 3`,
      `static void _lnkOnRecv(const esp_now_recv_info_t *info, const uint8_t *data, int len) { (void)info; _lnkPush(data, len); }`,
      `#else`,
      `static void _lnkOnRecv(const uint8_t *mac, const uint8_t *data, int len) { (void)mac; _lnkPush(data, len); }`,
      `#endif`,
      `#elif defined(ESP8266)`,
      `static void _lnkOnRecv(uint8_t *mac, uint8_t *data, uint8_t len) { (void)mac; _lnkPush(data, (int)len); }`,
      `#endif`,
    )
  }
  if (opts.joinsWifi && sendsAny) {
    lines.push(`static uint8_t _lnkPeerChannel = 0;`)
  }

  const radioMode = opts.joinsWifi
    ? {
        esp32: [
          `  // On Wi-Fi the radio follows the access point's channel. Modem sleep would`,
          `  // miss frames between beacons.`,
          `  _netEnsureConnected();`,
          `  WiFi.setSleep(false);`,
        ],
        esp8266: [`  _netEnsureConnected();`, `  WiFi.setSleepMode(WIFI_NONE_SLEEP);`],
      }
    : {
        esp32: [
          `  // No network: a station on none, on the link's own channel.`,
          `  WiFi.mode(WIFI_STA);`,
          `  WiFi.disconnect();`,
          `  esp_wifi_set_channel(${channel}, WIFI_SECOND_CHAN_NONE);`,
        ],
        esp8266: [`  WiFi.mode(WIFI_STA);`, `  WiFi.disconnect();`, `  wifi_set_channel(${channel});`],
      }
  lines.push(
    `static void _lnkBegin() {`,
    `#if defined(ESP32)`,
    ...radioMode.esp32,
    `  if (esp_now_init() != ESP_OK) return;`,
    ...(receives ? [`  esp_now_register_recv_cb(_lnkOnRecv);`] : []),
    ...(sendsAny ? [
      `  esp_now_peer_info_t peer;`,
      `  memset(&peer, 0, sizeof(peer));`,
      `  memcpy(peer.peer_addr, _lnkBroadcast, 6);`,
      `  peer.channel = 0;  // the radio's current channel`,
      `  peer.encrypt = false;`,
      `  if (esp_now_add_peer(&peer) != ESP_OK) return;`,
      `  _lnkSession = esp_random();`,
    ] : []),
    `#elif defined(ESP8266)`,
    ...radioMode.esp8266,
    `  if (esp_now_init() != 0) return;`,
    `  esp_now_set_self_role(ESP_NOW_ROLE_COMBO);`,
    ...(receives ? [`  esp_now_register_recv_cb(_lnkOnRecv);`] : []),
    ...(sendsAny ? [
      ...(opts.joinsWifi ? [`  _lnkPeerChannel = (uint8_t)wifi_get_channel();`] : []),
      `  if (esp_now_add_peer((uint8_t *)_lnkBroadcast, ESP_NOW_ROLE_COMBO, ${opts.joinsWifi ? '_lnkPeerChannel' : channel}, NULL, 0) != 0) return;`,
      `  _lnkSession = RANDOM_REG32;`,
    ] : []),
    `#else`,
    `  return;`,
    `#endif`,
    ...(sendsAny ? [`  if (_lnkSession == 0u) _lnkSession = 1u;`] : []),
    `  _lnkReady = true;`,
    `}`,
  )
  if (receives) {
    lines.push(
      `static void _lnkReceive() {`,
      `  uint32_t now = millis();`,
      `  for (uint8_t drained = 0; drained < ${LINK_RING_FRAMES}; drained++) {`,
      `    uint8_t f[${LINK_FRAME_MAX_BYTES}];`,
      `    uint8_t n = 0;`,
      `    _lnkLock();`,
      `    bool have = _lnkRingTail != _lnkRingHead;`,
      `    if (have) {`,
      `      n = _lnkRingLen[_lnkRingTail];`,
      `      memcpy(f, _lnkRing[_lnkRingTail], n);`,
      `      _lnkRingTail = (uint8_t)((_lnkRingTail + 1) % ${LINK_RING_FRAMES});`,
      `    }`,
      `    _lnkUnlock();`,
      `    if (!have) break;`,
      `    _lnkAccept(f, n, now);`,
      `  }`,
      `  _lnkTick(now);`,
      `  // A board running firmware from before the link last changed: say so, now and then.`,
      `  static uint32_t _lnkMismatchSaidMs = 0;`,
      `  if (_lnkMismatch && (_lnkMismatchSaidMs == 0u || (uint32_t)(now - _lnkMismatchSaidMs) >= ${LINK_MISMATCH_REPORT_MS}u)) {`,
      `    Serial.println("link schema mismatch");`,
      `    _lnkMismatchSaidMs = now == 0u ? 1u : now;`,
      `  }`,
      `  _lnkMismatch = false;`,
      `}`,
    )
  }
  if (sendsAny) {
    lines.push(
      `static void _lnkTransmit() {`,
      `  if (!_lnkReady) return;`,
      ...(opts.joinsWifi ? [
        `#if defined(ESP8266)`,
        `  // The access point can move the station; the broadcast peer moves with it.`,
        `  uint8_t channel = (uint8_t)wifi_get_channel();`,
        `  if (channel != _lnkPeerChannel) { _lnkPeerChannel = channel; esp_now_set_peer_channel((uint8_t *)_lnkBroadcast, channel); }`,
        `#endif`,
      ] : []),
      `  static uint8_t f[${LINK_FRAME_MAX_BYTES}];`,
      `  size_t n = _lnkBuild(f, millis());`,
      `  if (n == 0) return;`,
      `#if defined(ESP32)`,
      `  esp_now_send(_lnkBroadcast, f, n);`,
      `#elif defined(ESP8266)`,
      `  esp_now_send((uint8_t *)_lnkBroadcast, f, (uint8_t)n);`,
      `#endif`,
      `}`,
    )
  }
  return lines.join('\n')
}

/**
 * The sends of a plan with their staging positions, given what each link-out
 * reads. `resolve` answers one link-out (and, for a display, one field) with
 * the C++ of its value, or null for a reading this generator cannot make.
 */
export function boardLinkSends(
  plan: BoardLinkPlan,
  resolve: (linkOut: StudioNode, props: BoardLinkNodeProperties, field: string | null) => string | null,
): LinkSend[] {
  const sends: LinkSend[] = []
  let words = 0, presses = 0, texts = 0
  const at = (kind: BoardLinkWireKind) => (isWord(kind) ? words++ : kind === 'press' ? presses++ : texts++)
  const byIndex = new Map<number, LinkSend>()
  for (const { node, props } of plan.linkOuts) {
    const label = `${props.sourceNodeId}:${props.sourceHandle}`
    if (props.fields) {
      for (const field of props.fields) {
        byIndex.set(field.index, { index: field.index, kind: field.kind, expr: resolve(node, props, field.id), label: `${label} ${field.id}`, at: 0 })
      }
    } else {
      byIndex.set(props.slot, { index: props.slot, kind: boardLinkWireKind(props), expr: resolve(node, props, null), label, at: 0 })
    }
  }
  for (const entry of plan.table) {
    const send = byIndex.get(entry.index)
    if (!send) continue
    send.at = at(send.kind)
    sends.push(send)
  }
  return sends
}

/** The `loop()` lines that stage each send from this pass's values. */
function stageCpp(sends: readonly LinkSend[]): string[] {
  if (sends.length === 0) return []
  return [
    `  // Board link: stage what this board sends from this pass's values.`,
    ...sends.map((send) => {
      const note = `  // ${cppComment(send.label)}`
      if (send.kind === 'press') return `  _lnkStagePress(${send.index}, ${send.at}, ${send.expr ?? 'false'});${note}`
      if (send.kind === 'text') return `  _lnkStageText(${send.index}, ${send.at}, ${send.expr ?? '""'});${note}`
      return `  _lnkStageWord(${send.index}, ${send.at}, ${stageWord(send.kind, send.expr)});${note}`
    }),
  ]
}

/** The whole link for one partition, from its plan and what each link-out reads. */
export function boardLinkFirmware(plan: BoardLinkPlan, sends: readonly LinkSend[], opts: BoardLinkFirmwareOptions): BoardLinkFirmware {
  const receives = plan.receivers.length > 0
  return {
    include: boardLinkIncludeCpp(),
    globals: [
      boardLinkKeyCpp(plan, opts.key),
      boardLinkHmacCpp(),
      boardLinkCodecCpp(plan, sends, opts.telemetry === true),
      boardLinkRadioCpp(plan, sends, opts),
      '',
    ].join('\n'),
    setup: [`  _lnkBegin();`],
    receive: receives ? [`  _lnkReceive();  // board link: apply what arrived before the graph reads it`] : [],
    stage: stageCpp(sends),
    transmit: sends.length > 0 ? [`  _lnkTransmit();`] : [],
    receives,
  }
}

/** The telemetry keys the report adds for a board that receives, and their C++ values. */
export const BOARD_LINK_TELEMETRY_SYMBOL = '_lnkRxFrames'
