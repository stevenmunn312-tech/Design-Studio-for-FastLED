import { describe, expect, it } from 'vitest'
import {
  corkscrewAngleAt,
  corkscrewCanvasDims,
  corkscrewSampleMap,
  corkscrewSampleMapForProps,
  isLinearForm,
  outputCanvasDims,
  outputForm,
  outputGridDims,
  outputLedTotal,
  ringCanvasDiameter,
  ringSampleMap,
  ringSampleMapForProps,
  ringStartAngle,
} from '../ledOutputForm'

describe('outputForm', () => {
  it('takes the explicit form when there is one', () => {
    expect(outputForm({ form: 'ring' })).toBe('ring')
    expect(outputForm({ form: 'corkscrew' })).toBe('corkscrew')
    expect(outputForm({ form: 'strip' })).toBe('strip')
    expect(outputForm({ form: 'hub75' })).toBe('hub75')
    expect(outputForm({ form: 'matrix' })).toBe('matrix')
  })

  it('reads a pre-form scan panel out of its chipset', () => {
    expect(outputForm({ chipset: 'HUB75' })).toBe('hub75')
  })

  it('lets an explicit form override the legacy chipset spelling', () => {
    // A panel switched to an addressable form must not keep answering "hub75"
    // because its old chipset string is still sitting there.
    expect(outputForm({ form: 'matrix', chipset: 'HUB75' })).toBe('matrix')
  })

  it("does not read layout: 'strip' as the strip form", () => {
    // That value only ever meant "this grid is wired as one continuous chain" —
    // xyLayout treats it identically to 'matrix'. Reading it as the strip form
    // would turn a saved 16x4 panel into a 60-LED run.
    expect(outputForm({ layout: 'strip', width: 16, height: 4 })).toBe('matrix')
    expect(outputLedTotal({ layout: 'strip', width: 16, height: 4 })).toBe(64)
  })

  it('defaults to a matrix, including for junk', () => {
    expect(outputForm({})).toBe('matrix')
    expect(outputForm({ form: 'sphere' })).toBe('matrix')
    expect(outputForm(undefined)).toBe('matrix')
  })
})

describe('output dimensions per form', () => {
  it('counts a chain by its length and a grid by its area', () => {
    expect(outputLedTotal({ form: 'strip', ledCount: 144 })).toBe(144)
    expect(outputLedTotal({ form: 'ring', ledCount: 24 })).toBe(24)
    expect(outputLedTotal({ form: 'corkscrew', ledCount: 120 })).toBe(120)
    expect(outputLedTotal({ form: 'matrix', width: 16, height: 8 })).toBe(128)
    expect(outputLedTotal({ form: 'hub75', width: 64, height: 32 })).toBe(2048)
  })

  it('clamps a saved size to what the app can actually build', () => {
    // Every other layer clamps a matrix side to 64, so an estimate that counted
    // 100x100 was pricing a design no generator would emit.
    expect(outputLedTotal({ form: 'matrix', width: 100, height: 100 })).toBe(64 * 64)
    expect(outputLedTotal({ form: 'strip', ledCount: 5000 })).toBe(300)
  })

  it('gives every physical chain a 1 x N output grid', () => {
    expect(isLinearForm('strip')).toBe(true)
    expect(isLinearForm('ring')).toBe(true)
    expect(isLinearForm('corkscrew')).toBe(true)
    expect(outputGridDims({ form: 'strip', ledCount: 60 })).toEqual({ width: 60, height: 1 })
    expect(outputGridDims({ form: 'ring', ledCount: 24 })).toEqual({ width: 24, height: 1 })
    expect(outputGridDims({ form: 'corkscrew', ledCount: 120 })).toEqual({ width: 120, height: 1 })
  })

  it('gives a corkscrew a form-aware unwrapped cylindrical canvas', () => {
    const wide = corkscrewCanvasDims(120, 300, 300)
    const tall = corkscrewCanvasDims(120, 100, 600)
    expect(wide.width).toBeGreaterThan(wide.height)
    expect(tall.height).toBeGreaterThan(tall.width)
    expect(outputCanvasDims({
      form: 'corkscrew', ledCount: 120, corkscrewDiameterMm: 100, corkscrewHeightMm: 300,
    })).toEqual(corkscrewCanvasDims(120, 100, 300))
  })

  it('gives a ring a square canvas even though its grid is one row', () => {
    // A ring reads a circle, and a circle needs two axes to be sampled out of.
    expect(outputCanvasDims({ form: 'ring', ledCount: 24 })).toEqual({ width: 8, height: 8 })
    expect(outputCanvasDims({ form: 'strip', ledCount: 24 })).toEqual({ width: 24, height: 1 })
  })

  it('sizes a ring canvas from its own circumference', () => {
    expect(ringCanvasDiameter(24)).toBe(8)   // 24 / pi
    expect(ringCanvasDiameter(60)).toBe(19)
    expect(ringCanvasDiameter(1)).toBe(3)    // floor, so there is a circle at all
  })
})

describe('corkscrewSampleMap', () => {
  it('traces the configured number of turns from top to bottom', () => {
    const map = corkscrewSampleMap(9, 1, 0, 'cw', 5, 5)
    const at = (index: number) => ({ x: index % 5, y: Math.floor(index / 5) })
    expect(at(map[0])).toEqual({ x: 2, y: 0 })
    expect(at(map[4])).toEqual({ x: 0, y: 2 })
    expect(at(map[8])).toEqual({ x: 2, y: 4 })
  })

  it('reverses travel around the cylinder without reversing height', () => {
    const cw = corkscrewSampleMap(5, 1, 0, 'cw', 5, 5)
    const ccw = corkscrewSampleMap(5, 1, 0, 'ccw', 5, 5)
    const x = (index: number) => index % 5
    const y = (index: number) => Math.floor(index / 5)
    expect(x(cw[1])).toBeGreaterThan(2)
    expect(x(ccw[1])).toBeLessThan(2)
    expect(y(cw[1])).toBe(y(ccw[1]))
  })

  it('rotates the chain start around the cylinder', () => {
    const front = corkscrewSampleMap(2, 1, 0, 'cw', 9, 3)
    const side = corkscrewSampleMap(2, 1, 90, 'cw', 9, 3)
    expect(front[0] % 9).toBe(4)
    expect(side[0] % 9).toBe(6)
  })

  it('uses the same angle helper as the dedicated physical preview', () => {
    expect(corkscrewAngleAt(0, 9, 2, 45, 'cw')).toBeCloseTo(Math.PI / 4)
    expect(corkscrewAngleAt(8, 9, 2, 45, 'cw')).toBeCloseTo((Math.PI / 4) + (Math.PI * 4))
    expect(corkscrewAngleAt(8, 9, 2, 45, 'ccw')).toBeCloseTo((Math.PI / 4) - (Math.PI * 4))
  })

  it('emits one in-range composition index per physical LED', () => {
    const props = {
      form: 'corkscrew', ledCount: 120, corkscrewTurns: 6,
      corkscrewStartAngle: 30, corkscrewDirection: 'ccw',
      corkscrewDiameterMm: 100, corkscrewHeightMm: 300,
    }
    const dims = outputCanvasDims(props)
    const map = corkscrewSampleMapForProps(props)
    expect(map).toHaveLength(120)
    for (const index of map) {
      expect(Number.isInteger(index)).toBe(true)
      expect(index).toBeGreaterThanOrEqual(0)
      expect(index).toBeLessThan(dims.width * dims.height)
    }
  })
})

describe('ringSampleMap', () => {
  const canvas = 9
  const centre = (canvas - 1) / 2
  const at = (index: number) => ({ x: index % canvas, y: Math.floor(index / canvas) })

  it('starts LED 0 at the top of the ring', () => {
    const map = ringSampleMap(8, 0, 'cw', canvas, canvas)
    expect(at(map[0])).toEqual({ x: centre, y: 0 })
  })

  it('runs clockwise from the top, and anticlockwise when asked', () => {
    const cw = ringSampleMap(4, 0, 'cw', canvas, canvas)
    const ccw = ringSampleMap(4, 0, 'ccw', canvas, canvas)
    // Quarter turn clockwise from 12 o'clock is 3 o'clock: the right edge.
    expect(at(cw[1])).toEqual({ x: canvas - 1, y: centre })
    expect(at(ccw[1])).toEqual({ x: 0, y: centre })
  })

  it('rotates the whole ring by the start angle', () => {
    const turned = ringSampleMap(4, 90, 'cw', canvas, canvas)
    expect(at(turned[0])).toEqual({ x: canvas - 1, y: centre })
  })

  it('folds a start angle past a full turn rather than clamping it', () => {
    expect(ringStartAngle({ ringStartAngle: 450 })).toBe(90)
    expect(ringStartAngle({ ringStartAngle: -90 })).toBe(270)
    expect(ringStartAngle({ ringStartAngle: 'nonsense' })).toBe(0)
  })

  it('emits one in-range index per LED', () => {
    const map = ringSampleMap(60, 37, 'ccw', 19, 19)
    expect(map).toHaveLength(60)
    for (const index of map) {
      expect(Number.isInteger(index)).toBe(true)
      expect(index).toBeGreaterThanOrEqual(0)
      expect(index).toBeLessThan(19 * 19)
    }
  })

  it('lands every LED on the canvas edge, where a pattern can reach it', () => {
    const map = ringSampleMap(32, 0, 'cw', canvas, canvas)
    const radius = centre
    for (const index of map) {
      const { x, y } = at(index)
      const distance = Math.hypot(x - centre, y - centre)
      // Rounding to whole pixels moves a sample by at most half a pixel each way.
      expect(Math.abs(distance - radius)).toBeLessThanOrEqual(Math.SQRT1_2 + 0.001)
    }
  })

  it('reads a node properties bag against that node own canvas', () => {
    const props = { form: 'ring', ledCount: 24, ringStartAngle: 0, ringDirection: 'cw' }
    expect(ringSampleMapForProps(props)).toEqual(ringSampleMap(24, 0, 'cw', 8, 8))
  })
})
