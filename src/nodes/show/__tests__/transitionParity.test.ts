import { describe, it, expect } from 'vitest'
import { compositeTransition } from '../evaluate'
import { SHOW_EMITTERS } from '../codegen'
import { dissolveRank, dissolveRankCpp, dissolveThreshold } from '../dissolveHash'
import { transitionHelperCpp } from '../../../codegen/helpers/transitionHelperCpp'
import type { Frame } from '../../../state/palettes/ledColor'
import type { EmitContext } from '../../../codegen/emitContext'

const solid = (W: number, H: number, v: number): Frame =>
  Array.from({ length: H }, () => Array.from({ length: W }, () => ({ r: v, g: v, b: v })))

/** Run `dissolveRankCpp`'s statements with C's uint32 arithmetic. */
function cppRank(i: number): number {
  const vars: Record<string, bigint> = { i: BigInt(i) }
  const mask = 0xffffffffn
  const value = (expr: string): bigint => {
    const e = expr.trim()
    let m = /^\(uint32_t\)\(\((\w+)\)\+1\)\*0x([0-9A-F]+)u$/.exec(e)
    if (m) return ((vars[m[1]] + 1n) * BigInt(`0x${m[2]}`)) & mask
    m = /^(\w+)>>(\d+)$/.exec(e)
    if (m) return vars[m[1]] >> BigInt(m[2])
    m = /^0x([0-9A-F]+)u$/.exec(e)
    if (m) return BigInt(`0x${m[1]}`)
    if (/^\d+$/.test(e)) return BigInt(e)
    throw new Error(`unexpected ${e}`)
  }
  for (const stmt of dissolveRankCpp('h', 'i').split(';').map((s) => s.trim()).filter(Boolean)) {
    let m = /^uint32_t (\w+)=(.+)$/.exec(stmt)
    if (m) { vars[m[1]] = value(m[2]); continue }
    m = /^(\w+)(\^|\*|>>)=(.+)$/.exec(stmt)
    if (!m) throw new Error(`unexpected ${stmt}`)
    const rhs = value(m[3])
    vars[m[1]] = m[2] === '^' ? vars[m[1]] ^ rhs : m[2] === '*' ? (vars[m[1]] * rhs) & mask : vars[m[1]] >> rhs
  }
  return Number(vars.h)
}

function emitTransition(props: Record<string, unknown>, wired: { a?: boolean; b?: boolean } = { a: true, b: true }): string {
  const lines: string[] = []
  const flag = { v: false }
  SHOW_EMITTERS.Transition!({
    p: { t: 0.5, ...props },
    ln: (line: string) => lines.push(line),
    f: () => 'n_t',
    ownBuf: () => 'buf_tr',
    srcBuf: (port: string) => ((port === 'a' && wired.a) || (port === 'b' && wired.b) ? `buf_${port}` : null),
    need3d: flag,
    needsFrameSample: flag,
  } as unknown as EmitContext)
  return lines.join('\n')
}

describe('Transition preview/firmware parity', () => {
  it('dissolve ranks every pixel the same on both sides', () => {
    for (let i = 0; i < 2048; i++) expect(cppRank(i)).toBe(dissolveRank(i))
  })

  it('dissolve reveals nothing at 0, everything at 1, and about half at 0.5', () => {
    const W = 16, H = 16
    const a = solid(W, H, 0), b = solid(W, H, 255)
    const lit = (tt: number) => compositeTransition('dissolve', a, b, tt, W, H).flat().filter((p) => p.r > 0).length
    expect(lit(0)).toBe(0)
    expect(lit(1)).toBe(W * H)
    expect(Math.abs(lit(0.5) - 128)).toBeLessThan(20)
    expect(dissolveThreshold(-1)).toBe(0)
    expect(dissolveThreshold(2)).toBe(65536)
  })

  it('both dissolve emitters use the shared rank', () => {
    expect(emitTransition({ transitionType: 'dissolve' })).toContain(dissolveRankCpp('_h', '_i'))
    expect(transitionHelperCpp([2])).toContain(dissolveRankCpp('h', 'i'))
  })

  it('an unwired B is black in the firmware, as in the preview', () => {
    for (const transitionType of ['wipe', 'dissolve', 'iris', 'clockwipe', 'checkerboard', 'diagonal', 'blinds', 'ripple', 'spiral', 'curtain', 'scanlines']) {
      const cpp = emitTransition({ transitionType }, { a: true })
      expect(cpp, transitionType).toContain('CRGB::Black')
      expect(cpp, transitionType).not.toMatch(/= buf_tr\[/)
    }
    expect(emitTransition({ transitionType: 'crossfade' }, { a: true })).toContain('nscale8(buf_tr, NUM_LEDS, 255 - ')
  })

  it('wipe edges compare floats on both sides and reveal everything at t=1', () => {
    const W = 16, H = 4
    const a = solid(W, H, 0), b = solid(W, H, 255)
    const cols = (dir: string, tt: number) =>
      compositeTransition('wipe', a, b, tt, W, H, { dir })[0].filter((p) => p.r > 0).length
    // x < 16*0.3 = 4.8 reveals columns 0..4, as the float compare does on the board.
    expect(cols('right', 0.3)).toBe(5)
    expect(cols('left', 1)).toBe(W)
    expect(cols('left', 0)).toBe(0)
    expect(emitTransition({ transitionType: 'wipe', direction: 'right' })).toContain('(float)_x < _tt*WIDTH')
    expect(emitTransition({ transitionType: 'wipe', direction: 'up' })).toContain('(float)_y >= (1.0f-_tt)*HEIGHT')
    expect(transitionHelperCpp([1])).toContain('(float)x < thr')
  })

  it('zoom rounds its B sample like Math.round, and spiral keeps fractional turns', () => {
    expect(emitTransition({ transitionType: 'zoom' })).toContain('(int)floorf((_x-_cx)/_sc+_cx+0.5f)')
    expect(transitionHelperCpp([15])).toContain('(int)floorf((x-cx)/sc + cx + 0.5f)')
    expect(emitTransition({ transitionType: 'spiral', turns: 2.5 })).toContain('/(float)2.5f')
  })
})
