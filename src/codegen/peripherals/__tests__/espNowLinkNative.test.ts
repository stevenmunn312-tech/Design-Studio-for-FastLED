import { execFileSync, spawnSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { boardPartition } from '../../../build/boardPartition'
import { boardLinkPropertiesOf, type BoardLinkWireKind } from '../../../build/boardLinks'
import { NODE_LIBRARY, libraryDefaults } from '../../../state/nodeLibrary'
import { useBoardLinkKeyStore } from '../../../state/peripherals/boardLinkKey'
import { webRemoteOutputs } from '../../../state/peripherals/webRemote'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'
import {
  LINK_FLAG_HEARTBEAT, LINK_TAG_BYTES, LINK_VERSION, boardLinkCodecCpp, boardLinkFirmware, boardLinkKeyCpp,
  boardLinkPlan, boardLinkSends, boardLinkValueExpr, floatBits, type BoardLinkPlan,
} from '../espNowLinkCpp'

/*
 * The frame codec compiled and run on the host: one board's sender and
 * another's receiver, generated from one project, held to a TypeScript mirror
 * of the frame whose tag node's own HMAC-SHA256 computes. The radio is not
 * here; the codec takes the time as an argument and never calls Arduino, which
 * is what lets it run on a PC. Needs a host g++ (WSL's on Windows) and skips
 * without one.
 */

const nativeGpp = spawnSync('g++', ['--version']).status === 0
const wslGpp = !nativeGpp && process.platform === 'win32'
  && spawnSync('wsl', ['--exec', 'g++', '--version']).status === 0
const compilerPath = (value: string) => wslGpp
  ? value.replace(/\\/g, '/').replace(/^([a-z]):/i, (_, drive: string) => `/mnt/${drive.toLowerCase()}`)
  : value

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
    ?? { label: nodeType, category: 'pattern', inputs: [], outputs: [] }
  const merged = { ...libraryDefaults(nodeType), ...properties }
  return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
    label: definition.label, nodeType, category: definition.category, properties: merged,
    inputs: definition.inputs,
    outputs: nodeType === 'WebRemoteInput' ? webRemoteOutputs(merged.controls) : definition.outputs,
  } } as StudioNode
}
const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge =>
  ({ id: [source, sourceHandle, target, targetHandle].join('-'), source, sourceHandle, target, targetHandle }) as StudioEdge

const LINK_ID = '0a1b2c3d'
const KEY_HEX = '000102030405060708090a0b0c0d0e0f'

/**
 * A Web Remote on Board 2 sending one value of each kind to Board 1's LEDs.
 * The slider starts where the Brightness it drives is, 0.25.
 */
function project() {
  const remote = node('remote', 'WebRemoteInput', {
    boardId: 'board-2',
    controls: [
      { id: 'level', type: 'Slider', label: 'Level', properties: { min: 0, max: 1, step: 0.01 } },
      { id: 'go', type: 'Button', label: 'Go' },
      { id: 'tint', type: 'Colour Picker', label: 'Tint' },
      { id: 'msg', type: 'Text Entry', label: 'Message' },
    ],
  })
  const nodes = [
    node('board-root', 'Board', { linkId: LINK_ID }), node('board-2', 'Board'), remote,
    node('words', 'Text'), node('dim', 'BrightnessMod', { brightness: 0.25 }), node('out', 'MatrixOutput', { width: 8, height: 1 }),
  ]
  const edges = [
    edge('words', 'frame', 'dim', 'frame'), edge('dim', 'frame', 'out', 'frame'),
    edge('remote', 'remote:level', 'dim', 'brightness'),
    edge('remote', 'remote:go', 'out', 'enabled'),
    edge('remote', 'remote:tint', 'words', 'color'),
    edge('remote', 'remote:msg', 'words', 'text'),
  ]
  return {
    sender: boardPartition(nodes, edges, 'board-2').nodes,
    receiver: boardPartition(nodes, edges, 'board-root').nodes,
  }
}

const INPUT_FOR: Record<BoardLinkWireKind, string> = {
  float: 'in_float', bool: 'in_bool', press: 'in_press', color: 'in_color', text: 'in_text', datetime: 'in_time',
}

/** The TypeScript mirror of one frame: header, every slot of the table, the truncated tag. */
function mirrorFrame(plan: BoardLinkPlan, session: number, counter: number, values: Record<BoardLinkWireKind, unknown>, flags: number): Buffer {
  const bytes: number[] = [...Buffer.from('FLLK'), LINK_VERSION, plan.self, flags]
  const le32 = (value: number) => { for (let i = 0; i < 4; i++) bytes.push((value >>> (8 * i)) & 0xff) }
  le32(parseInt(LINK_ID, 16)); le32(plan.context.hash); le32(session); le32(counter)
  for (const entry of plan.table) {
    bytes.push(entry.index)
    const value = values[entry.kind]
    if (entry.kind === 'float') le32(floatBits(value as number))
    else if (entry.kind === 'press') { const [count, level] = value as [number, boolean]; bytes.push(count & 0xff, count >> 8, level ? 1 : 0) }
    else if (entry.kind === 'color') { const rgb = value as number; bytes.push(rgb & 0xff, (rgb >> 8) & 0xff, (rgb >> 16) & 0xff) }
    else if (entry.kind === 'text') { const text = Buffer.from(value as string); bytes.push(text.length, ...text) }
    else if (entry.kind === 'bool') bytes.push(value ? 1 : 0)
  }
  const body = Buffer.from(bytes)
  const tag = createHmac('sha256', Buffer.from(KEY_HEX, 'hex')).update(body).digest().subarray(0, LINK_TAG_BYTES)
  return Buffer.concat([body, tag])
}

const SHA256_CPP = String.raw`
static const uint32_t K256[64] = {
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,
  0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,
  0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,
  0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2 };
static uint32_t rotr(uint32_t x, int n) { return (x >> n) | (x << (32 - n)); }
static void sha256(const uint8_t *data, size_t len, uint8_t out[32]) {
  uint32_t h[8] = { 0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19 };
  std::vector<uint8_t> m(data, data + len);
  m.push_back(0x80);
  while (m.size() % 64 != 56) m.push_back(0);
  uint64_t bits = (uint64_t)len * 8;
  for (int i = 7; i >= 0; i--) m.push_back((uint8_t)(bits >> (8 * i)));
  for (size_t at = 0; at < m.size(); at += 64) {
    uint32_t w[64];
    for (int i = 0; i < 16; i++) w[i] = (uint32_t)m[at + 4 * i] << 24 | (uint32_t)m[at + 4 * i + 1] << 16 | (uint32_t)m[at + 4 * i + 2] << 8 | m[at + 4 * i + 3];
    for (int i = 16; i < 64; i++) {
      uint32_t s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >> 3);
      uint32_t s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >> 10);
      w[i] = w[i - 16] + s0 + w[i - 7] + s1;
    }
    uint32_t a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], k = h[7];
    for (int i = 0; i < 64; i++) {
      uint32_t t1 = k + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K256[i] + w[i];
      uint32_t t2 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c));
      k = g; g = f; f = e; e = d + t1; d = c; c = b; b = a; a = t1 + t2;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += k;
  }
  for (int i = 0; i < 8; i++) for (int j = 0; j < 4; j++) out[4 * i + j] = (uint8_t)(h[i] >> (24 - 8 * j));
}
static void hmacSha256(const uint8_t *key, size_t keyLen, const uint8_t *data, size_t len, uint8_t out[32]) {
  uint8_t pad[64] = {0};
  memcpy(pad, key, keyLen);
  std::vector<uint8_t> inner, outer;
  for (int i = 0; i < 64; i++) inner.push_back(pad[i] ^ 0x36);
  inner.insert(inner.end(), data, data + len);
  uint8_t innerHash[32];
  sha256(inner.data(), inner.size(), innerHash);
  for (int i = 0; i < 64; i++) outer.push_back(pad[i] ^ 0x5c);
  outer.insert(outer.end(), innerHash, innerHash + 32);
  sha256(outer.data(), outer.size(), out);
}
`

let directory = ''
let binary = ''
let sender: BoardLinkPlan
let receiver: BoardLinkPlan
const run = (...args: string[]) => execFileSync(wslGpp ? 'wsl' : binary, wslGpp ? ['--exec', compilerPath(binary), ...args] : args)
  .toString().trim()

describe.skipIf(!nativeGpp && !wslGpp)('board link frame codec on the host', () => {
  beforeAll(() => {
    useBoardLinkKeyStore.setState({ byLinkId: { [LINK_ID]: KEY_HEX } })
    const { sender: tx, receiver: rx } = project()
    sender = boardLinkPlan(tx)!
    receiver = boardLinkPlan(rx)!
    const sends = boardLinkSends(sender, (_node, props) => INPUT_FOR[props.momentary ? 'press' : props.dataType === 'string' ? 'text' : props.dataType as BoardLinkWireKind])
    const key = Buffer.from(KEY_HEX, 'hex')
    const stage = boardLinkFirmware(sender, sends, { joinsWifi: false, key }).stage
    const reads = receiver.linkIns.map(({ node: linkIn }) => {
      const props = boardLinkPropertiesOf(linkIn)!
      return { kind: props.momentary ? 'press' : props.dataType, expr: boardLinkValueExpr(receiver, props)! }
    })
    const read = (kind: string) => reads.find((entry) => entry.kind === kind)!.expr
    const hmac = (ns: string) => `static void _lnkHmac(const uint8_t *data, size_t len, uint8_t *out) { hmacSha256(${ns}::_lnkKey, 16, data, len, out); }`
    directory = path.resolve(mkdtempSync(path.join(tmpdir(), 'board-link-')))
    if (!directory.startsWith(path.resolve(tmpdir()) + path.sep)) throw new Error('Unexpected native-test directory')
    const source = path.join(directory, 'link.cpp')
    binary = path.join(directory, nativeGpp && process.platform === 'win32' ? 'link.exe' : 'link')
    writeFileSync(source, `#include <cstdint>
#include <cstddef>
#include <cstring>
#include <cstdio>
#include <cassert>
#include <cmath>
#include <vector>
#include <string>
struct CRGB { uint8_t r, g, b; CRGB(uint8_t r_ = 0, uint8_t g_ = 0, uint8_t b_ = 0) : r(r_), g(g_), b(b_) {}
  explicit CRGB(uint32_t packed) : r((uint8_t)(packed >> 16)), g((uint8_t)(packed >> 8)), b((uint8_t)packed) {} };
${SHA256_CPP}
namespace tx {
${boardLinkKeyCpp(sender, key)}
${hmac('tx')}
${boardLinkCodecCpp(sender, sends)}
float in_float = 0; bool in_press = false; CRGB in_color; const char *in_text = "";
void stage() {
${stage.join('\n')}
}
}
namespace rx {
${boardLinkKeyCpp(receiver, key)}
${hmac('rx')}
${boardLinkCodecCpp(receiver, [])}
float level() { return ${read('float')}; }
bool press() { return ${read('press')}; }
CRGB tint() { return ${read('color')}; }
const char *text() { return ${read('string')}; }
}
static std::string hex(const uint8_t *p, size_t n) { std::string s; char b[3]; for (size_t i = 0; i < n; i++) { snprintf(b, 3, "%02x", p[i]); s += b; } return s; }
static std::vector<uint8_t> unhex(const char *s) { std::vector<uint8_t> v; for (size_t i = 0; s[i] && s[i + 1]; i += 2) { unsigned x; sscanf(s + i, "%2x", &x); v.push_back((uint8_t)x); } return v; }
int main(int argc, char **argv) {
  if (argc > 1) {
    // Decode a frame the TypeScript mirror built.
    std::vector<uint8_t> f = unhex(argv[1]);
    rx::_lnkAccept(f.data(), f.size(), 1000);
    rx::_lnkTick(1000);
    CRGB c = rx::tint();
    printf("%d %.6f %d %02x%02x%02x %s\\n", rx::_lnkUp1 ? 1 : 0, rx::level(), rx::press() ? 1 : 0, c.r, c.g, c.b, rx::text());
    return 0;
  }
  tx::_lnkSession = 0x12345678u;
  tx::in_float = 0.6f; tx::in_press = true; tx::in_color = CRGB(10, 20, 30); tx::in_text = "h\\xc3\\xa9llo";
  tx::stage();
  uint8_t f[250];
  size_t n = tx::_lnkBuild(f, 1000);
  assert(n > 0);
  printf("%s\\n", hex(f, n).c_str());
  assert(tx::_lnkBuild(f, 1005) == 0);  // nothing changed, and too soon
  // The receiver applies it: values in, the press adopted without firing, its level held.
  rx::_lnkAccept(f, n, 1000); rx::_lnkTick(1000);
  assert(rx::_lnkUp1 && fabsf(rx::level() - 0.6f) < 1e-7f && rx::press());
  assert(rx::tint().r == 10 && rx::tint().g == 20 && rx::tint().b == 30 && strcmp(rx::text(), "h\\xc3\\xa9llo") == 0);
  // A replay is dropped; so is a frame with one byte changed, and one from older firmware.
  uint32_t ctr = rx::_lnkCtr1;
  rx::_lnkAccept(f, n, 1001);
  assert(rx::_lnkCtr1 == ctr);
  // Release, then two quick taps between two of the receiver's passes.
  tx::in_press = false; tx::stage();
  n = tx::_lnkBuild(f, 1030); assert(n > 0);
  uint8_t bad[250]; memcpy(bad, f, n); bad[24] ^= 1;
  rx::_lnkAccept(bad, n, 1030); assert(rx::_lnkCtr1 == ctr);
  memcpy(bad, f, n); bad[11] ^= 1;
  // A wrong schema hash on an unsigned frame is noise, not a board to report.
  rx::_lnkAccept(bad, n, 1030); assert(rx::_lnkCtr1 == ctr && !rx::_lnkMismatch);
  // Signed, it is a board running other firmware: dropped and reported.
  uint8_t resigned[32]; rx::_lnkHmac(bad, n - 8, resigned); memcpy(bad + n - 8, resigned, 8);
  rx::_lnkAccept(bad, n, 1030); assert(rx::_lnkCtr1 == ctr && rx::_lnkMismatch); rx::_lnkMismatch = false;
  rx::_lnkAccept(f, n, 1030); rx::_lnkTick(1030); assert(!rx::press());
  tx::in_press = true; tx::stage(); tx::in_press = false; tx::stage();
  tx::in_press = true; tx::stage(); tx::in_press = false; tx::stage();
  n = tx::_lnkBuild(f, 1060); assert(n > 0);
  rx::_lnkAccept(f, n, 1060);
  bool passes[5];
  for (int i = 0; i < 5; i++) { rx::_lnkTick(1060 + i); passes[i] = rx::press(); }
  // Each press is exactly one true pass, with a false pass between them.
  assert(passes[0] && !passes[1] && passes[2] && !passes[3] && !passes[4]);
  // Lost after a second: the level falls, the held number keeps its value.
  rx::_lnkTick(1060 + 1001);
  assert(!rx::_lnkUp1 && !rx::press() && fabsf(rx::level() - 0.6f) < 1e-7f);
  // A press made while the link was down is not replayed on reconnect.
  tx::in_press = true; tx::stage(); tx::in_press = false; tx::stage();
  n = tx::_lnkBuild(f, 2100); assert(n > 0);
  rx::_lnkAccept(f, n, 2100); rx::_lnkTick(2100);
  assert(rx::_lnkUp1 && !rx::press());
  // A sender that reset starts a new session at a low counter, and is accepted.
  // Its slider restarts at its start: the level here holds until it moves.
  tx::_lnkSession = 0x9abcdef0u; tx::_lnkTxCounter = 0; tx::in_float = 0.1f; tx::stage();
  n = tx::_lnkBuild(f, 2400); assert(n > 0);
  rx::_lnkAccept(f, n, 2400); rx::_lnkTick(2400);
  assert(rx::_lnkSess1 == 0x9abcdef0u && fabsf(rx::level() - 0.6f) < 1e-7f);
  tx::in_float = 0.3f; tx::stage(); n = tx::_lnkBuild(f, 2500); assert(n > 0);
  rx::_lnkAccept(f, n, 2500); rx::_lnkTick(2500);
  assert(fabsf(rx::level() - 0.3f) < 1e-7f);
  return 0;
}
`)
    const args = ['-std=c++17', '-Wall', '-Wextra', '-Werror', '-Wno-unused-function', source, '-o', binary]
    execFileSync(wslGpp ? 'wsl' : 'g++', wslGpp ? ['--exec', 'g++', ...args.map(compilerPath)] : args)
  }, 120_000)

  afterAll(() => {
    useBoardLinkKeyStore.setState({ byLinkId: {} })
    if (directory) rmSync(directory, { recursive: true, force: true })
  })

  it('builds the frame the TypeScript mirror builds, tag included', () => {
    const frame = run()
    const expected = mirrorFrame(sender, 0x12345678, 1, {
      float: 0.6, press: [1, true], color: 0x0a141e, text: 'héllo', bool: false, datetime: 0,
    }, LINK_FLAG_HEARTBEAT)
    expect(frame).toBe(expected.toString('hex'))
  })

  it('reads a frame the mirror built, and drops one with a wrong tag', () => {
    const values = { float: 0.75, press: [7, false], color: 0x123456, text: 'hi', bool: false, datetime: 0 } as const
    const frame = mirrorFrame(sender, 0x0badf00d, 5, values as never, 0)
    expect(run(frame.toString('hex'))).toBe('1 0.750000 0 123456 hi')
    const forged = Buffer.from(frame)
    forged[forged.length - 1] ^= 0xff
    // Nothing applied: the start values compiled in from the remote (its
    // slider at 0.25, a picker at red, an empty text) are still what it reads.
    expect(run(forged.toString('hex'))).toBe('0 0.250000 0 ff0000')
  })
})

describe.skipIf(!nativeGpp && !wslGpp)('board link frame fairness on the host', () => {
  it('sends every slot when more change each pass than one frame holds', () => {
    // Sixty floats that all change on every pass: 23 + 60 × 5 bytes is more
    // than a frame, so a frame built from the head every time would never
    // reach the tail.
    const count = 60
    const table = Array.from({ length: count }, (_, index) => ({ index, kind: 'float' as const }))
    const plan: BoardLinkPlan = {
      context: { hash: 0x01020304, linkId: LINK_ID, channel: 1, boardOrder: ['board-root', 'board-2'], frames: { 'board-2': table }, wifiByBoard: {} },
      self: 1, receivers: [], linkIns: [], linkOuts: [], table,
    }
    const sends = table.map(({ index }) => ({ index, kind: 'float' as const, expr: `v[${index}]`, label: `v${index}`, at: index }))
    const stage = boardLinkFirmware(plan, sends, { joinsWifi: false, key: Buffer.from(KEY_HEX, 'hex') }).stage
    const dir = path.resolve(mkdtempSync(path.join(tmpdir(), 'board-link-fair-')))
    try {
      const source = path.join(dir, 'fair.cpp')
      const exe = path.join(dir, nativeGpp && process.platform === 'win32' ? 'fair.exe' : 'fair')
      writeFileSync(source, `#include <cstdint>
#include <cstddef>
#include <cstring>
#include <cstdio>
#include <vector>
static float v[${count}];
${boardLinkKeyCpp(plan, Buffer.from(KEY_HEX, 'hex'))}
static void _lnkHmac(const uint8_t *, size_t, uint8_t *out) { memset(out, 0, 32); }
${boardLinkCodecCpp(plan, sends)}
int main() {
  bool seen[${count}] = {false};
  uint8_t f[250];
  for (int pass = 0; pass < 8; pass++) {
    for (int i = 0; i < ${count}; i++) v[i] = (float)(pass * 100 + i);
${stage.join('\n')}
    // Within one heartbeat, a frame every 20 ms.
    size_t n = _lnkBuild(f, 10u + 20u * (uint32_t)pass);
    for (size_t at = 23; n && at + 8 < n; at += 5) seen[f[at]] = true;
  }
  int missing = 0;
  for (int i = 0; i < ${count}; i++) if (!seen[i]) missing++;
  printf("%d", missing);
  return 0;
}
`)
      const args = ['-std=c++17', '-Wall', '-Wextra', '-Werror', '-Wno-unused-function', source, '-o', exe]
      execFileSync(wslGpp ? 'wsl' : 'g++', wslGpp ? ['--exec', 'g++', ...args.map(compilerPath)] : args)
      const out = execFileSync(wslGpp ? 'wsl' : exe, wslGpp ? ['--exec', compilerPath(exe)] : []).toString().trim()
      expect(out).toBe('0')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 120_000)
})
