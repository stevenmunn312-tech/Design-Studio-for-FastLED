import { describe, expect, it } from 'vitest'
import {
  FOURIER_OUTLINES, FOURIER_SAMPLES, fourierHarmonicWeight, fourierOutlineSamples, fourierPen,
  fourierTable, fourierTerms, parseFourierPoints,
} from '../fourierOutline'

const TRIANGLE = '0,0.9 0.8,-0.6 -0.8,-0.6'

function maxError(outline: string, harmonics: number, extent = 1, custom = TRIANGLE): number {
  const samples = fourierOutlineSamples(outline, custom)
  const terms = fourierTable(outline, custom, 64)
  let worst = 0
  for (let n = 0; n < FOURIER_SAMPLES; n++) {
    const pen = fourierPen(terms, harmonics, n / FOURIER_SAMPLES, extent)
    worst = Math.max(worst, Math.hypot(pen.x - samples[n].x * extent, pen.y - samples[n].y * extent))
  }
  return worst
}

describe('Fourier outlines', () => {
  it('reduces a circle to one dominant coefficient', () => {
    const terms = fourierTable('circle', '', 64)
    expect(terms).toHaveLength(1)
    expect(terms[0].frequency).toBe(1)
    expect(terms[0].amplitude).toBeCloseTo(1, 10)
  })

  it('lowers the reconstruction error as harmonics rise', () => {
    for (const outline of ['heart', 'star', 'square', 'infinity', 'custom']) {
      const errors = [2, 4, 8, 16, 64].map((harmonics) => maxError(outline, harmonics))
      for (let i = 1; i < errors.length; i++) expect(errors[i], `${outline} at step ${i}`).toBeLessThanOrEqual(errors[i - 1] + 1e-9)
      expect(errors[errors.length - 1], outline).toBeLessThan(errors[0])
    }
  })

  it('traces a circle with a single harmonic, whatever the outline', () => {
    for (const outline of FOURIER_OUTLINES) {
      const terms = fourierTable(outline, TRIANGLE, 32)
      const radii = Array.from({ length: 16 }, (_, n) => {
        const pen = fourierPen(terms, 1, n / 16, 10)
        return Math.hypot(pen.x, pen.y)
      })
      for (const radius of radii) expect(radius, outline).toBeCloseTo(terms[0].amplitude * 10, 9)
    }
  })

  it('reaches every outline sample within a pixel at the most harmonics', () => {
    for (const outline of FOURIER_OUTLINES) {
      // 64×64 at scale 0.8 draws the outline about 25 pixels from the centre.
      expect(maxError(outline, 64, 25), outline).toBeLessThan(1)
    }
  })

  it('fills -1..1 with every built-in outline', () => {
    for (const outline of FOURIER_OUTLINES.filter((name) => name !== 'custom')) {
      const samples = fourierOutlineSamples(outline)
      const reach = Math.max(...samples.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y))))
      expect(reach, outline).toBeCloseTo(1, 2)
      expect(samples).toHaveLength(FOURIER_SAMPLES)
    }
  })

  it('orders terms largest first and caps them at maxHarmonics', () => {
    const terms = fourierTable('star', '', 12)
    expect(terms).toHaveLength(12)
    for (let i = 1; i < terms.length; i++) expect(terms[i].amplitude).toBeLessThanOrEqual(terms[i - 1].amplitude)
    expect(fourierTable('star', '', 1)).toHaveLength(4)
    expect(fourierTable('star', '', 500)).toHaveLength(64)
    expect(fourierTerms(fourierOutlineSamples('star'), 12)).toEqual(terms)
  })

  it('fades the next harmonic in by its fraction', () => {
    expect(fourierHarmonicWeight(2.25, 0, 8)).toBe(1)
    expect(fourierHarmonicWeight(2.25, 1, 8)).toBe(1)
    expect(fourierHarmonicWeight(2.25, 2, 8)).toBeCloseTo(0.25, 12)
    expect(fourierHarmonicWeight(2.25, 3, 8)).toBe(0)
    expect(fourierHarmonicWeight(0, 0, 8)).toBe(1)
    expect(fourierHarmonicWeight(40, 7, 8)).toBe(1)
  })
})

describe('Fourier custom points', () => {
  it('reads x,y pairs with any separator and clamps them to -1..1', () => {
    expect(parseFourierPoints('0,1; 1 0\n-2,-0.5')).toEqual([{ x: 0, y: 1 }, { x: 1, y: 0 }, { x: -1, y: -0.5 }])
  })

  it('refuses anything that is not 3 to 128 points of numbers', () => {
    const many = Array.from({ length: 129 }, (_, i) => `${Math.cos(i)},${Math.sin(i)}`).join(' ')
    for (const text of ['', '0,1 1,0', '0,1 1,0 1', '0,1 1,0 x,1', many, '0,0 0,0 0,0', 42, null]) {
      expect(parseFourierPoints(text), String(text).slice(0, 20)).toBeNull()
    }
  })

  it('draws the circle for invalid text and only the custom outline reads the text', () => {
    expect(fourierTable('custom', '*/ oops /*', 32)).toEqual(fourierTable('circle', '', 32))
    expect(fourierTable('heart', TRIANGLE, 32)).toEqual(fourierTable('heart', '', 32))
    expect(fourierTable('custom', TRIANGLE, 32)).not.toEqual(fourierTable('circle', '', 32))
  })
})
