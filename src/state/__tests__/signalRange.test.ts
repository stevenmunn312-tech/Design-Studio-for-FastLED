import { describe, expect, it } from 'vitest'
import { formatSignalRange, isNormalizedOutput, NORMALIZED_OUTPUTS, signalRangeMismatch } from '../signalRange'
import { inputClampRange, NODE_LIBRARY } from '../nodeLibrary'
import {
  FORMULA_FIELD_SPEED_MAX,
  FORMULA_POINTS_SPEED_MAX,
  NOISE_SCALE_MAX,
  NOISE_SPEED_MAX,
  SCALE_MAX,
  SPEED_MAX,
} from '../speedRange'

describe('signalRange', () => {
  it('names the domain a 0-1 signal has to be mapped into', () => {
    // The three CLAUDE.md calls out by name.
    expect(signalRangeMismatch('Fire2012', 'sparking')).toEqual({ min: 0, max: 255 })
    expect(signalRangeMismatch('ReactionDiffusion', 'feed')).toEqual({ min: 0, max: 0.1 })
    expect(signalRangeMismatch('Starfield', 'count')).toEqual({ min: 1, max: 200 })
    expect(formatSignalRange({ min: 0, max: 255 })).toBe('0–255')
  })

  /*
   * The load-bearing derivation: "the slider is not 0-1" has to mean exactly
   * "the evaluator hands the wired number through untouched". Every input
   * speedRange.ts stretches is a 0-1 slider *because* that is what
   * denormalising means, so no second list of denormalised inputs is needed —
   * and a node retuned later cannot drift out of step with one.
   */
  it('says nothing about an input the evaluator already denormalises', () => {
    for (const nodeType of Object.keys(SPEED_MAX)) {
      expect(signalRangeMismatch(nodeType, 'speed'), `${nodeType}.speed`).toBeNull()
    }
    for (const nodeType of Object.keys(SCALE_MAX)) {
      expect(signalRangeMismatch(nodeType, 'scale'), `${nodeType}.scale`).toBeNull()
    }
    // The bundled nodes key their maps by variant, so the node itself is
    // always denormalised whichever variant is selected.
    expect(Object.keys(NOISE_SPEED_MAX).length).toBeGreaterThan(0)
    expect(Object.keys(NOISE_SCALE_MAX).length).toBeGreaterThan(0)
    expect(signalRangeMismatch('Noise', 'speed')).toBeNull()
    expect(signalRangeMismatch('Noise', 'scale')).toBeNull()
    expect(Object.keys(FORMULA_POINTS_SPEED_MAX).length).toBeGreaterThan(0)
    expect(signalRangeMismatch('FormulaPoints', 'speed')).toBeNull()
    expect(Object.keys(FORMULA_FIELD_SPEED_MAX).length).toBeGreaterThan(0)
    expect(signalRangeMismatch('FormulaField', 'speed')).toBeNull()
    // AudioFlow mirrors the same normalisation through audioFlowRange.ts.
    expect(signalRangeMismatch('AudioFlow', 'speed')).toBeNull()
  })

  it('says nothing about an input with no bounded domain of its own', () => {
    expect(signalRangeMismatch('MapRange', 'value')).toBeNull()
    expect(signalRangeMismatch('Fire2012', 'paletteIn')).toBeNull()
    expect(signalRangeMismatch('Fire2012', null)).toBeNull()
  })

  it('lists only outputs that really exist and really are 0-1', () => {
    // A retired port would silently stop warning, and a misspelled one never
    // starts. Both fail here instead.
    for (const [nodeType, ports] of Object.entries(NORMALIZED_OUTPUTS)) {
      const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
      expect(definition, nodeType).toBeTruthy()
      for (const portId of ports) {
        const port = definition!.outputs.find((entry) => entry.id === portId)
        expect(port, `${nodeType}.${portId}`).toBeTruthy()
        expect(port!.dataType, `${nodeType}.${portId}`).toBe('float')
        expect(isNormalizedOutput(nodeType, portId)).toBe(true)
      }
    }
    expect(isNormalizedOutput('MapRange', 'result')).toBe(false)
    expect(isNormalizedOutput('FFTAnalyzer', undefined)).toBe(false)
  })

  it('leaves a normalised source pointed at a 0-1 input alone', () => {
    // paletteMix is 0-1, so an audio band drives it exactly as intended.
    expect(inputClampRange('Fire2012', 'paletteMix')).toEqual({ min: 0, max: 1 })
    expect(signalRangeMismatch('Fire2012', 'paletteMix')).toBeNull()
  })
})
