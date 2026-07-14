import { describe, it, expect } from 'vitest'
import { summarizeCapacity, capacityDelta, formatCapacityDelta } from '../capacityFormat'
import type { Board } from '../../state/uploadStore'
import type { CompileCheckResult } from '../backendClient'

const board: Board = { label: 'Arduino Uno', fqbn: 'arduino:avr:uno', core: 'arduino:avr' }

function ok(flashPct: number, ramPct: number): CompileCheckResult {
  return {
    ok: true, overflow: false, target: board.fqbn,
    flash: { usedBytes: 1000, limitBytes: 10000, percent: flashPct },
    ram: { usedBytes: 100, limitBytes: 1000, percent: ramPct },
    error: null,
  }
}

describe('summarizeCapacity', () => {
  it('reports toolchain-missing without a board number', () => {
    const s = summarizeCapacity(board, 'toolchain-missing', null)
    expect(s.level).toBe('pending')
    expect(s.text).toContain('install toolchain')
  })

  it('reports checking with no prior result', () => {
    const s = summarizeCapacity(board, 'checking', null)
    expect(s.level).toBe('pending')
    expect(s.text).toContain('checking capacity')
  })

  it('reports measured percentages when ok', () => {
    const s = summarizeCapacity(board, 'measured', ok(74, 41))
    expect(s.level).toBe('ok')
    expect(s.text).toBe('Arduino Uno · flash 74% · SRAM 41%')
  })

  it('flags tight headroom at the warn threshold', () => {
    const s = summarizeCapacity(board, 'measured', ok(92, 41))
    expect(s.level).toBe('warn')
  })

  it("reports won't fit on overflow", () => {
    const result: CompileCheckResult = { ok: false, overflow: true, target: board.fqbn, flash: null, ram: null, error: 'Design is too large for this board' }
    const s = summarizeCapacity(board, 'measured', result)
    expect(s.level).toBe('error')
    expect(s.text).toContain("won't fit")
  })

  it('reports a generic compile error distinctly from overflow', () => {
    const result: CompileCheckResult = { ok: false, overflow: false, target: board.fqbn, flash: null, ram: null, error: 'Compile failed — see helper log' }
    const s = summarizeCapacity(board, 'measured', result)
    expect(s.level).toBe('error')
    expect(s.text).toContain('Compile failed')
  })

  it('marks a stale result as rechecking without dropping the last numbers', () => {
    const s = summarizeCapacity(board, 'stale', ok(50, 20))
    expect(s.text).toContain('flash 50%')
    expect(s.text).toContain('rechecking')
  })

  it('falls back to a "No board" label when nothing is selected', () => {
    const s = summarizeCapacity(undefined, 'toolchain-missing', null)
    expect(s.text).toContain('No board')
  })
})

describe('capacityDelta', () => {
  it('computes the flash/RAM percent change between two same-board checks', () => {
    const delta = capacityDelta(ok(40, 20), ok(46, 21))
    expect(delta).toEqual({ flashPct: 6, ramPct: 1 })
  })

  it('returns null when either check failed', () => {
    const failed: CompileCheckResult = { ok: false, overflow: true, target: board.fqbn, flash: null, ram: null, error: 'x' }
    expect(capacityDelta(ok(40, 20), failed)).toBeNull()
    expect(capacityDelta(failed, ok(40, 20))).toBeNull()
  })

  it('returns null across a board-target change', () => {
    const other = { ...ok(40, 20), target: 'esp32:esp32:esp32s3' }
    expect(capacityDelta(ok(40, 20), other)).toBeNull()
  })

  it('returns null when there is no prior result', () => {
    expect(capacityDelta(null, ok(40, 20))).toBeNull()
  })
})

describe('formatCapacityDelta', () => {
  it('formats a positive and negative delta with signs', () => {
    expect(formatCapacityDelta({ flashPct: 6, ramPct: -2 })).toBe('flash +6% · SRAM -2%')
  })

  it('omits a zero-change metric', () => {
    expect(formatCapacityDelta({ flashPct: 0, ramPct: 3 })).toBe('SRAM +3%')
  })

  it('returns null when nothing changed', () => {
    expect(formatCapacityDelta({ flashPct: 0, ramPct: 0 })).toBeNull()
  })
})
