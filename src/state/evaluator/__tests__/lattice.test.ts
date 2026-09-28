import { describe, expect, it } from 'vitest'
import { fanFold, hexCell, squareCell, triCell } from '../lattice'

describe('lattice cell finders', () => {
  it('maps square and hex centres to zero local coordinates', () => {
    expect(squareCell(2, -3)).toMatchObject({ x: 0, y: 0, a: 2, b: -3 })
    expect(hexCell(2, 0)).toMatchObject({ x: 0, y: 0, a: 2, b: -1 })
  })

  it('maps the centres of both triangle orientations exactly once', () => {
    const up = triCell(0.5, Math.sqrt(3) / 6)
    const down = triCell(1, Math.sqrt(3) / 3)
    expect(up.x).toBeCloseTo(0)
    expect(up.y).toBeCloseTo(0)
    expect(up.flipped).toBe(false)
    expect(down.x).toBeCloseTo(0)
    expect(down.y).toBeCloseTo(0)
    expect(down.flipped).toBe(true)
  })

  it('assigns every sampled point to finite local coordinates', () => {
    for (const finder of [squareCell, hexCell, triCell]) {
      for (let y = -2; y <= 2; y += 0.07) for (let x = -2; x <= 2; x += 0.07) {
        const cell = finder(x, y)
        expect(Number.isFinite(cell.x) && Number.isFinite(cell.y)).toBe(true)
      }
    }
  })
})

describe('fanFold', () => {
  it('is idempotent for every supported polygon', () => {
    for (const sides of [3, 4, 6]) for (const dihedral of [false, true]) {
      for (let angle = -Math.PI; angle <= Math.PI; angle += 0.071) {
        const first = fanFold(Math.cos(angle), Math.sin(angle), sides, dihedral)
        const second = fanFold(first.x, first.y, sides, dihedral)
        expect(second.x).toBeCloseTo(first.x, 10)
        expect(second.y).toBeCloseTo(first.y, 10)
      }
    }
  })
})

