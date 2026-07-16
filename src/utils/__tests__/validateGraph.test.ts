import { describe, it, expect } from 'vitest'
import { validateGraph, findPinConflicts, findMatrixLayoutErrors, findPreviewOnlyWarnings, findScalarExpressionErrors, findBoardCompatibilityErrors, estimatePowerLoad, estimateFirmwareRam } from '../validateGraph'
import type { StudioNode, StudioEdge } from '../../state/graphStore'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'pattern', properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

function edge(id: string, source: string, target: string, th: string): StudioEdge {
  return { id, source, target, sourceHandle: 'frame', targetHandle: th } as unknown as StudioEdge
}

describe('validateGraph', () => {
  it('blocks MicInput firmware on non-ESP32 boards', () => {
    const nodes = [node('mic', 'MicInput')]
    expect(findBoardCompatibilityErrors(nodes, 'arduino:avr:uno')).toEqual([
      expect.stringMatching(/requires an ESP32-family board/),
    ])
    expect(findBoardCompatibilityErrors(nodes, 'esp32:esp32:esp32s3')).toEqual([])
    expect(findBoardCompatibilityErrors([], 'arduino:avr:uno')).toEqual([])
  })

  it('errors on empty graph', () => {
    const { errors } = validateGraph([], [])
    expect(errors).toContain('No nodes in graph')
  })

  it('errors when MatrixOutput is missing', () => {
    const { errors } = validateGraph([node('sc', 'SolidColor')], [])
    expect(errors).toContain('Missing MatrixOutput node')
  })

  it('errors when MatrixOutput has neither a frame nor an SD Card input connected', () => {
    const { errors } = validateGraph([node('out', 'MatrixOutput')], [])
    expect(errors).toContain('MatrixOutput has no Frame or SD Card input connected')
  })

  it('accepts an SD-show wiring path without a frame input', () => {
    const nodes = [
      node('lib', 'MusicLibrary'),
      node('pg', 'PerformanceGenerator'),
      node('sd', 'SDCard'),
      node('out', 'MatrixOutput'),
    ]
    const edges = [
      { id: 'e1', source: 'lib', target: 'pg', sourceHandle: 'music', targetHandle: 'music' } as unknown as StudioEdge,
      { id: 'e2', source: 'pg', target: 'sd', sourceHandle: 'shows', targetHandle: 'shows' } as unknown as StudioEdge,
      { id: 'e3', source: 'sd', target: 'out', sourceHandle: 'sdcard', targetHandle: 'sdcard' } as unknown as StudioEdge,
    ]
    const { errors } = validateGraph(nodes, edges)
    expect(errors).toHaveLength(0)
  })

  it('passes a valid minimal graph', () => {
    const nodes = [node('sc', 'SolidColor'), node('out', 'MatrixOutput')]
    const edges = [edge('e1', 'sc', 'out', 'frame')]
    const { errors, warnings } = validateGraph(nodes, edges)
    expect(errors).toHaveLength(0)
    expect(warnings).toHaveLength(0)
  })

  it('accepts valid numeric expressions and reports invalid ones', () => {
    const out = node('out', 'MatrixOutput', { width: 12, height: 8 })
    expect(findScalarExpressionErrors([node('r', 'Random', { min: 0, max: 'w / 2' }), out])).toEqual([])
    expect(findScalarExpressionErrors([node('r', 'Random', { min: 0, max: 'unknown + 1' }), out]))
      .toEqual(['Random max has an invalid numeric expression: unknown + 1'])
  })

  it('warns about isolated nodes', () => {
    const nodes = [node('sc', 'SolidColor'), node('out', 'MatrixOutput'), node('iso', 'Plasma')]
    const edges = [edge('e1', 'sc', 'out', 'frame')]
    const { warnings } = validateGraph(nodes, edges)
    expect(warnings.some(w => w.includes('not connected'))).toBe(true)
  })

  it('warns when PatternMaster has no pattern inputs', () => {
    const nodes = [node('pm', 'PatternMaster'), node('out', 'MatrixOutput')]
    const edges = [edge('e1', 'pm', 'out', 'frame')]
    const { warnings } = validateGraph(nodes, edges)
    expect(warnings.some(w => w.includes('Show Engine'))).toBe(true)
  })

  it('does not warn about PatternMaster when a collection is wired', () => {
    const nodes = [node('pc', 'PatternCollection'), node('pm', 'PatternMaster'), node('out', 'MatrixOutput')]
    const edges = [
      edge('e1', 'pc', 'pm', 'patternset'),
      edge('e2', 'pm', 'out', 'frame'),
    ]
    const { warnings } = validateGraph(nodes, edges)
    expect(warnings.some(w => w.includes('Show Engine'))).toBe(false)
  })

  function collection(id: string, patternIds: string[]): StudioNode {
    const n = node(id, 'PatternCollection')
    ;(n.data as unknown as { properties: Record<string, unknown> }).properties = { patternIds }
    return n
  }

  it('warns when a Performance Generator has patterns but no music source', () => {
    const nodes = [collection('pc', ['g1']), node('pg', 'PerformanceGenerator'), node('out', 'MatrixOutput')]
    const edges = [edge('e1', 'pc', 'pg', 'patternset')]
    const { warnings } = validateGraph(nodes, edges)
    expect(warnings.some(w => w.includes('no music source'))).toBe(true)
  })

  it('warns when the wired Pattern Collection is empty', () => {
    const nodes = [collection('pc', []), node('lib', 'MusicLibrary'), node('pg', 'PerformanceGenerator'), node('out', 'MatrixOutput')]
    const edges = [edge('e1', 'pc', 'pg', 'patternset'), edge('e2', 'lib', 'pg', 'music')]
    const { warnings } = validateGraph(nodes, edges)
    expect(warnings.some(w => w.includes('is empty'))).toBe(true)
  })

  it('does not warn when music and a non-empty collection are both wired', () => {
    const nodes = [collection('pc', ['g1']), node('lib', 'MusicLibrary'), node('pg', 'PerformanceGenerator'), node('out', 'MatrixOutput')]
    const edges = [edge('e1', 'pc', 'pg', 'patternset'), edge('e2', 'lib', 'pg', 'music')]
    const { warnings } = validateGraph(nodes, edges)
    expect(warnings.some(w => w.includes('no music source') || w.includes('is empty'))).toBe(false)
  })

  it('counts multiple isolated nodes correctly', () => {
    const nodes = [node('out', 'MatrixOutput'), node('a', 'Plasma'), node('b', 'Fire')]
    const edges: StudioEdge[] = []
    const { warnings } = validateGraph(nodes, edges)
    expect(warnings.some(w => w.includes('2 nodes'))).toBe(true)
  })

  it('does not warn about an unconnected Comment node', () => {
    const nodes = [node('sc', 'SolidColor'), node('out', 'MatrixOutput'), node('note', 'Comment')]
    const edges = [edge('e1', 'sc', 'out', 'frame')]
    const { warnings } = validateGraph(nodes, edges)
    expect(warnings.some(w => w.includes('not connected'))).toBe(false)
  })

  describe('findPinConflicts', () => {
    it('finds no conflicts with distinct pins', () => {
      const nodes = [
        node('out', 'MatrixOutput', { dataPin: 5, chipset: 'WS2812B' }),
        node('sd', 'SDCard', { sdCsPin: 10, i2sBclk: 26, i2sLrc: 25, i2sDout: 22 }),
      ]
      expect(findPinConflicts(nodes)).toHaveLength(0)
    })

    it('flags MatrixOutput data pin colliding with SDCard CS pin', () => {
      const nodes = [
        node('out', 'MatrixOutput', { dataPin: 5 }),
        node('sd', 'SDCard', { sdCsPin: 5 }),
      ]
      const conflicts = findPinConflicts(nodes)
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0]).toContain('GPIO 5')
      expect(conflicts[0]).toContain('data pin')
      expect(conflicts[0]).toContain('CS pin')
    })

    it('flags a node reusing the same pin for two of its own roles', () => {
      const nodes = [node('enc', 'EncoderInput', { pinA: 32, pinB: 32, pinSW: 25 })]
      const conflicts = findPinConflicts(nodes)
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0]).toContain('GPIO 32')
    })

    it('ignores MatrixOutput clock pin for clockless chipsets', () => {
      const nodes = [
        node('out', 'MatrixOutput', { dataPin: 5, clockPin: 34, chipset: 'WS2812B' }),
        node('pot', 'PotInput', { pin: 34 }),
      ]
      expect(findPinConflicts(nodes)).toHaveLength(0)
    })

    it('flags MatrixOutput clock pin colliding for SPI chipsets', () => {
      const nodes = [
        node('out', 'MatrixOutput', { dataPin: 5, clockPin: 34, chipset: 'APA102' }),
        node('pot', 'PotInput', { pin: 34 }),
      ]
      const conflicts = findPinConflicts(nodes)
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0]).toContain('GPIO 34')
    })

    it('surfaces pin conflicts as errors from validateGraph', () => {
      const nodes = [
        node('sc', 'SolidColor'),
        node('out', 'MatrixOutput', { dataPin: 5 }),
        node('btn', 'ButtonInput', { pin: 5 }),
      ]
      const edges = [edge('e1', 'sc', 'out', 'frame')]
      const { errors } = validateGraph(nodes, edges)
      expect(errors.some(e => e.includes('GPIO 5'))).toBe(true)
    })
  })

  describe('findMatrixLayoutErrors', () => {
    it('finds no errors for a valid panel layout', () => {
      const nodes = [node('out', 'MatrixOutput', { width: 8, height: 8, layout: 'panels', tilesX: 2, tilesY: 2, tileRotations: '0,90,180,270' })]
      expect(findMatrixLayoutErrors(nodes)).toEqual([])
    })

    it('flags invalid panel divisibility with the MatrixOutput label', () => {
      const nodes = [node('out', 'MatrixOutput', { width: 5, height: 5, layout: 'panels', tilesX: 2, tilesY: 2 })]
      expect(findMatrixLayoutErrors(nodes)).toEqual([
        "MatrixOutput: Panel layout 5×5 can't be divided into 2×2 equal tiles",
      ])
    })

    it('surfaces layout problems as validateGraph errors', () => {
      const nodes = [
        node('sc', 'SolidColor'),
        node('out', 'MatrixOutput', { width: 2, height: 2, layout: 'custom', customXYMap: '[0,0,1,2]' }),
      ]
      const edges = [edge('e1', 'sc', 'out', 'frame')]
      const { errors } = validateGraph(nodes, edges)
      expect(errors).toContain('MatrixOutput: Custom XY map repeats LED index 0')
    })
  })

  describe('estimatePowerLoad', () => {
    it('returns null with no MatrixOutput', () => {
      expect(estimatePowerLoad([node('sc', 'SolidColor')])).toBeNull()
    })

    it('computes worst-case draw from grid dimensions', () => {
      const nodes = [node('out', 'MatrixOutput', { width: 16, height: 16 })]
      const power = estimatePowerLoad(nodes)!
      expect(power.ledCount).toBe(256)
      expect(power.worstCaseMa).toBe(256 * 60)
      expect(power.configuredMa).toBeNull()
      expect(power.exceedsConfigured).toBe(false)
    })

    it('flags when worst-case draw exceeds the configured power cap', () => {
      const nodes = [node('out', 'MatrixOutput', { width: 16, height: 16, powerLimit: true, milliamps: 2000 })]
      const power = estimatePowerLoad(nodes)!
      expect(power.configuredMa).toBe(2000)
      expect(power.worstCaseMa).toBe(15360)
      expect(power.exceedsConfigured).toBe(true)
    })

    it('does not flag when the configured cap covers worst-case draw', () => {
      const nodes = [node('out', 'MatrixOutput', { width: 8, height: 8, powerLimit: true, milliamps: 5000 })]
      const power = estimatePowerLoad(nodes)!
      expect(power.exceedsConfigured).toBe(false)
    })

    it('surfaces an exceeded power cap as a validateGraph warning', () => {
      const nodes = [
        node('sc', 'SolidColor'),
        node('out', 'MatrixOutput', { width: 16, height: 16, powerLimit: true, milliamps: 2000 }),
      ]
      const edges = [edge('e1', 'sc', 'out', 'frame')]
      const { warnings } = validateGraph(nodes, edges)
      expect(warnings.some(w => w.includes('exceeds the configured power cap'))).toBe(true)
    })
  })

  describe('estimateFirmwareRam', () => {
    it('returns null with no MatrixOutput', () => {
      expect(estimateFirmwareRam([node('sc', 'SolidColor')], [])).toBeNull()
    })

    it('counts the leds array plus one frame buffer for a simple chain', () => {
      const nodes = [node('sc', 'SolidColor'), node('out', 'MatrixOutput', { width: 4, height: 4 })]
      const edges = [edge('e1', 'sc', 'out', 'frame')]
      const ram = estimateFirmwareRam(nodes, edges)!
      expect(ram.ledCount).toBe(16)
      expect(ram.ledsArrayBytes).toBe(48)      // 16 * 3
      expect(ram.frameBufferBytes).toBe(48)    // one frame-producing node * 16 * 3
      expect(ram.fieldBufferBytes).toBe(0)
      expect(ram.statefulBytes).toBe(0)
      expect(ram.internalBytes).toBe(96)
      expect(ram.psramBytes).toBe(0)
    })

    it('ignores nodes not reachable from MatrixOutput', () => {
      const nodes = [
        node('sc', 'SolidColor'),
        node('out', 'MatrixOutput', { width: 4, height: 4 }),
        node('fire', 'Fire2012'), // isolated — never wired in
      ]
      const edges = [edge('e1', 'sc', 'out', 'frame')]
      const ram = estimateFirmwareRam(nodes, edges)!
      expect(ram.statefulBytes).toBe(0)
      expect(ram.frameBufferBytes).toBe(48) // only SolidColor's buffer, not Fire2012's
    })

    it('adds a stateful node\'s known per-LED overhead when reachable', () => {
      const nodes = [node('fire', 'Fire2012'), node('out', 'MatrixOutput', { width: 4, height: 4 })]
      const edges = [edge('e1', 'fire', 'out', 'frame')]
      const ram = estimateFirmwareRam(nodes, edges)!
      expect(ram.frameBufferBytes).toBe(48)  // Fire2012's own frame buffer
      expect(ram.statefulBytes).toBe(16)     // 16 LEDs * 1 byte/LED heat map
    })

    it('adds a fixed particle-pool size regardless of matrix dimensions', () => {
      const nodes = [node('p', 'Particles', { particleType: 'fountain' }), node('out', 'MatrixOutput', { width: 4, height: 4 })]
      const edges = [edge('e1', 'p', 'out', 'frame')]
      const ram = estimateFirmwareRam(nodes, edges)!
      expect(ram.statefulBytes).toBe(120 * 27)
    })

    it('counts FrameFeedback history as internal state even with a normal frame buffer', () => {
      const nodes = [
        node('sc', 'SolidColor'),
        node('fb', 'FrameFeedback', { delayFrames: 3 }),
        node('out', 'MatrixOutput', { width: 4, height: 4 }),
      ]
      const edges = [
        edge('e1', 'sc', 'fb', 'frame'),
        edge('e2', 'fb', 'out', 'frame'),
      ]
      const ram = estimateFirmwareRam(nodes, edges)!
      expect(ram.frameBufferBytes).toBe(96) // SolidColor + FrameFeedback
      expect(ram.statefulBytes).toBe(16 * 3 * 4) // (delay + current slot) * CRGB pixels
    })

    it('offloads frame/field buffers to PSRAM when usePsram is on', () => {
      const nodes = [node('sc', 'SolidColor'), node('out', 'MatrixOutput', { width: 4, height: 4, usePsram: true })]
      const edges = [edge('e1', 'sc', 'out', 'frame')]
      const ram = estimateFirmwareRam(nodes, edges)!
      expect(ram.usesPsram).toBe(true)
      expect(ram.psramBytes).toBe(48)
      expect(ram.internalBytes).toBe(48) // just the leds array
    })

    it('surfaces a large internal-RAM estimate as a validateGraph warning', () => {
      const nodes = [node('sc', 'SolidColor'), node('out', 'MatrixOutput', { width: 100, height: 100 })]
      const edges = [edge('e1', 'sc', 'out', 'frame')]
      const { warnings } = validateGraph(nodes, edges)
      expect(warnings.some(w => w.includes('internal RAM'))).toBe(true)
    })

    it('does not warn about internal RAM for a small graph', () => {
      const nodes = [node('sc', 'SolidColor'), node('out', 'MatrixOutput', { width: 8, height: 8 })]
      const edges = [edge('e1', 'sc', 'out', 'frame')]
      const { warnings } = validateGraph(nodes, edges)
      expect(warnings.some(w => w.includes('internal RAM'))).toBe(false)
    })
  })

  describe('findPreviewOnlyWarnings', () => {
    it('warns when a MidiInput node is wired to something', () => {
      const nodes = [node('midi', 'MidiInput'), node('math', 'Math')]
      const edges = [edge('e1', 'midi', 'math', 'a')]
      const warnings = findPreviewOnlyWarnings(nodes, edges)
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toContain('preview-only')
    })

    it('does not warn about an unwired MidiInput node (already flagged as isolated)', () => {
      const nodes = [node('midi', 'MidiInput')]
      expect(findPreviewOnlyWarnings(nodes, [])).toHaveLength(0)
    })

    it('does not warn about other input nodes with real firmware equivalents', () => {
      const nodes = [node('btn', 'ButtonInput'), node('math', 'Math')]
      const edges = [edge('e1', 'btn', 'math', 'a')]
      expect(findPreviewOnlyWarnings(nodes, edges)).toHaveLength(0)
    })

    it('surfaces the preview-only warning from validateGraph', () => {
      const nodes = [node('midi', 'MidiInput'), node('math', 'Math'), node('out', 'MatrixOutput')]
      const edges = [edge('e1', 'midi', 'math', 'a'), edge('e2', 'math', 'out', 'frame')]
      const { warnings } = validateGraph(nodes, edges)
      expect(warnings.some(w => w.includes('preview-only'))).toBe(true)
    })
  })
})
