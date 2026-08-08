import { describe, it, expect } from 'vitest'
import { validateGraph, buildGraphDiagnostics, findPinConflicts, findPinRangeWarnings, findMatrixLayoutErrors, findPreviewOnlyWarnings, findScalarExpressionErrors, findBoardCompatibilityErrors, findBoardPinCompatibility, findOutputResourceErrors, findHub75ConfigErrors, estimatePowerLoad, estimateFirmwareRam } from '../validateGraph'
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
  it('returns node-attributed diagnostics with a concrete fix', () => {
    const nodes = [
      node('random', 'Random', { min: 0, max: 'not_valid(' }),
      node('out', 'MatrixOutput', { width: 8, height: 8 }),
    ]
    const diagnostics = buildGraphDiagnostics(nodes, [edge('e1', 'random', 'out', 'frame')], {
      selectedFqbn: 'esp32:esp32:esp32s3',
    })

    expect(diagnostics).toContainEqual(expect.objectContaining({
      id: 'random-expression-max',
      severity: 'error',
      category: 'expression',
      nodeIds: ['random'],
      propertyKey: 'max',
      fix: expect.stringMatching(/valid expression/),
    }))
  })

  it('targets Group Output while editing a group subgraph', () => {
    const nodes = [node('pattern', 'SolidColor'), node('group-out', 'GroupOutput')]
    const diagnostics = buildGraphDiagnostics(nodes, [edge('e1', 'pattern', 'group-out', 'frame')], { target: 'group' })

    expect(diagnostics.some((issue) => issue.id === 'missing-MatrixOutput')).toBe(false)
    expect(diagnostics.some((issue) => issue.id === 'group-out-input')).toBe(false)
  })

  it('attributes pin and board conflicts to every affected node', () => {
    const nodes = [
      node('mic', 'MicInput', { i2sWs: 5, i2sSck: 40, i2sSd: 41 }),
      node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
    ]
    const diagnostics = buildGraphDiagnostics(nodes, [edge('e1', 'mic', 'out', 'frame')], {
      selectedFqbn: 'arduino:avr:uno',
    })

    expect(diagnostics).toContainEqual(expect.objectContaining({ id: 'pin-5', nodeIds: ['mic', 'out'] }))
    expect(diagnostics).toContainEqual(expect.objectContaining({
      id: 'mic-board', nodeIds: ['mic'], action: 'choose-board',
    }))
  })

  it('reports each disconnected node separately', () => {
    const nodes = [node('a', 'Plasma'), node('b', 'Blur2D'), node('out', 'MatrixOutput')]
    const diagnostics = buildGraphDiagnostics(nodes, [], { selectedFqbn: 'esp32:esp32:esp32s3' })

    expect(diagnostics.filter((issue) => issue.id.endsWith('-disconnected')).map((issue) => issue.nodeIds[0]))
      .toEqual(['a', 'b'])
  })

  it('blocks MicInput firmware on non-ESP32 boards', () => {
    const nodes = [node('mic', 'MicInput')]
    expect(findBoardCompatibilityErrors(nodes, 'arduino:avr:uno')).toEqual([
      expect.stringMatching(/requires an ESP32-family board/),
    ])
    expect(findBoardCompatibilityErrors(nodes, 'esp32:esp32:esp32s3')).toEqual([])
    expect(findBoardCompatibilityErrors([], 'arduino:avr:uno')).toEqual([])
  })

  it('blocks SD Card internal-DAC audio on anything but the classic ESP32', () => {
    const nodes = [node('sd', 'SDCard', { audioOutput: 'internalDac' })]
    expect(findBoardCompatibilityErrors(nodes, 'esp32:esp32:esp32s3')).toEqual([
      expect.stringMatching(/internal-DAC audio output requires the classic ESP32/),
    ])
    expect(findBoardCompatibilityErrors(nodes, 'esp32:esp32:esp32')).toEqual([])
    // Default (I2S) output is unaffected by board choice.
    expect(findBoardCompatibilityErrors([node('sd', 'SDCard')], 'esp32:esp32:esp32s3')).toEqual([])
  })

  it('blocks HUB75 on boards without the LCD-mode DMA peripheral', () => {
    const nodes = [node('out', 'MatrixOutput', { chipset: 'HUB75' })]
    for (const fqbn of ['esp32:esp32:esp32', 'esp32:esp32:esp32s2', 'esp32:esp32:esp32s3']) {
      expect(findBoardCompatibilityErrors(nodes, fqbn)).toEqual([])
    }
    for (const fqbn of ['esp32:esp32:esp32c3', 'esp32:esp32:esp32c6', 'esp32:esp32:esp32h2', 'esp8266:esp8266:nodemcuv2', 'arduino:avr:uno']) {
      expect(findBoardCompatibilityErrors(nodes, fqbn)).toEqual([
        expect.stringMatching(/HUB75 output requires a classic ESP32, ESP32-S2, or ESP32-S3/),
      ])
    }
    // No board selected yet, or an addressable chipset: no HUB75-specific error.
    expect(findBoardCompatibilityErrors(nodes, '')).toEqual([])
    expect(findBoardCompatibilityErrors([node('out', 'MatrixOutput', { chipset: 'WS2812B' })], 'esp32:esp32:esp32c3')).toEqual([])
  })

  it('allows a single HUB75 Matrix Output route with default layout', () => {
    expect(findHub75ConfigErrors([node('out', 'MatrixOutput', { chipset: 'WS2812B' })])).toEqual([])
    expect(findHub75ConfigErrors([node('out', 'MatrixOutput', { chipset: 'HUB75' })])).toEqual([])
    expect(findHub75ConfigErrors([node('out', 'MatrixOutput', { chipset: 'HUB75', layout: 'matrix', supersample: false })])).toEqual([])

    const nodes = [
      node('sc', 'SolidColor'),
      node('out', 'MatrixOutput', { chipset: 'HUB75' }),
    ]
    const edges = [edge('e1', 'sc', 'out', 'frame')]
    const { errors } = validateGraph(nodes, edges)
    expect(errors.some((e) => e.toLowerCase().includes('hub75'))).toBe(false)

    const diagnostics = buildGraphDiagnostics(nodes, edges)
    expect(diagnostics.some((d) => d.id === 'out-hub75-config')).toBe(false)
  })

  it('blocks HUB75 panel chaining/tiling', () => {
    const errors = findHub75ConfigErrors([node('out', 'MatrixOutput', { chipset: 'HUB75', layout: 'panels', tilesX: 2 })])
    expect(errors).toEqual([expect.stringMatching(/only supports the Matrix layout/)])

    const diagnostics = buildGraphDiagnostics(
      [node('sc', 'SolidColor'), node('out', 'MatrixOutput', { chipset: 'HUB75', layout: 'panels', tilesX: 2 })],
      [edge('e1', 'sc', 'out', 'frame')],
    )
    expect(diagnostics).toContainEqual(expect.objectContaining({ id: 'out-hub75-config', severity: 'error', nodeIds: ['out'] }))
  })

  it('blocks HUB75 supersampling', () => {
    expect(findHub75ConfigErrors([node('out', 'MatrixOutput', { chipset: 'HUB75', supersample: true })])).toEqual([
      expect.stringMatching(/doesn't support supersampling/),
    ])
  })

  it('blocks HUB75 combined with a second Matrix Output route', () => {
    const nodes = [
      node('out-a', 'MatrixOutput', { chipset: 'HUB75' }),
      node('out-b', 'MatrixOutput', { chipset: 'WS2812B' }),
    ]
    const errors = findHub75ConfigErrors(nodes)
    expect(errors).toEqual([expect.stringMatching(/only supports a single Matrix Output route/)])
  })

  it('blocks HUB75 wired into the generative Pattern Show pipeline', () => {
    const out = node('out', 'MatrixOutput', { chipset: 'HUB75' })
    const nodes = [node('coll', 'PatternCollection'), node('master', 'PatternMaster'), out]
    const edges = [
      edge('e1', 'coll', 'master', 'patternset'),
      edge('e2', 'master', 'out', 'frame'),
    ]
    expect(findHub75ConfigErrors(nodes, edges)).toEqual([
      expect.stringMatching(/doesn't support the generative Pattern Show pipeline yet/),
    ])
    // Same shape but addressable — no HUB75-specific error.
    expect(findHub75ConfigErrors(
      [node('coll', 'PatternCollection'), node('master', 'PatternMaster'), node('out', 'MatrixOutput', { chipset: 'WS2812B' })],
      edges,
    )).toEqual([])
  })

  it('blocks HUB75 with an SD Card wired for the music-sync show pipeline', () => {
    const out = node('out', 'MatrixOutput', { chipset: 'HUB75' })
    const nodes = [node('sd', 'SDCard'), out]
    const edges = [edge('e1', 'sd', 'out', 'sdcard')]
    expect(findHub75ConfigErrors(nodes, edges)).toEqual([
      expect.stringMatching(/doesn't support the music-sync SD show pipeline yet/),
    ])
    // Unwired SD Card node present but not connected: no HUB75-specific error.
    expect(findHub75ConfigErrors([node('sd', 'SDCard'), out], [])).toEqual([])
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

  it('accepts multiple routed outputs and validates every route', () => {
    const nodes = [
      node('a', 'SolidColor'), node('b', 'Plasma'),
      node('out-a', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
      node('out-b', 'MatrixOutput', { width: 16, height: 4, dataPin: 12 }),
    ]
    const edges = [edge('e1', 'a', 'out-a', 'frame'), edge('e2', 'b', 'out-b', 'frame')]
    expect(validateGraph(nodes, edges).errors).toEqual([])
    expect(estimatePowerLoad(nodes)?.ledCount).toBe(128)
  })

  it('reports an unconnected secondary output and cross-output GPIO conflicts', () => {
    const nodes = [
      node('a', 'SolidColor'),
      node('out-a', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
      node('out-b', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
    ]
    const { errors } = validateGraph(nodes, [edge('e1', 'a', 'out-a', 'frame')])
    expect(errors).toContain('MatrixOutput 2 has no Frame or SD Card input connected')
    expect(errors.some((message) => message.includes('GPIO 5'))).toBe(true)
  })

  it('rejects conflicting supply voltages across globally power-limited outputs', () => {
    const nodes = [
      node('out-a', 'MatrixOutput', { powerLimit: true, volts: 5 }),
      node('out-b', 'MatrixOutput', { powerLimit: true, volts: 12 }),
    ]
    expect(findOutputResourceErrors(nodes)).toEqual([
      expect.stringMatching(/one shared supply voltage/),
    ])
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
    })

    it('checks the fixed GPIO25/26 internal-DAC pins instead of the I2S pins', () => {
      const clean = [
        node('out', 'MatrixOutput', { dataPin: 5, chipset: 'WS2812B' }),
        node('sd', 'SDCard', { sdCsPin: 10, audioOutput: 'internalDac' }),
      ]
      expect(findPinConflicts(clean)).toHaveLength(0)

      const conflicting = [
        node('out', 'MatrixOutput', { dataPin: 25, chipset: 'WS2812B' }),
        node('sd', 'SDCard', { sdCsPin: 10, audioOutput: 'internalDac' }),
      ]
      const conflicts = findPinConflicts(conflicting)
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0]).toContain('GPIO 25')
      expect(conflicts[0]).toContain('data pin')
      expect(conflicts[0]).toContain('internal DAC (GPIO25)')
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

    it('checks HUB75 ribbon pins instead of dataPin/clockPin, ignoring dataPin\'s leftover default', () => {
      const nodes = [
        node('out', 'MatrixOutput', {
          chipset: 'HUB75', dataPin: 5, clockPin: 6,
          hub75R1Pin: 25, hub75G1Pin: 26, hub75B1Pin: 27,
          hub75R2Pin: 14, hub75G2Pin: 12, hub75B2Pin: 13,
          hub75APin: 23, hub75BPin: 19, hub75CPin: 5, hub75DPin: 17,
          hub75ClkPin: 16, hub75LatPin: 4, hub75OePin: 15,
        }),
        node('pot', 'PotInput', { pin: 5 }),
      ]
      // dataPin (also 5) is unused for HUB75, so only hub75CPin (also 5) conflicts.
      const conflicts = findPinConflicts(nodes)
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0]).toContain('GPIO 5')
      expect(conflicts[0]).toContain('row-select C')
    })

    it('only checks HUB75 row-select E when hub75WideScan is on', () => {
      const withoutE = [
        node('out', 'MatrixOutput', { chipset: 'HUB75', hub75EPin: 8, hub75WideScan: false }),
        node('pot', 'PotInput', { pin: 8 }),
      ]
      expect(findPinConflicts(withoutE)).toHaveLength(0)

      const withE = [
        node('out', 'MatrixOutput', { chipset: 'HUB75', hub75EPin: 8, hub75WideScan: true }),
        node('pot', 'PotInput', { pin: 8 }),
      ]
      const conflicts = findPinConflicts(withE)
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0]).toContain('row-select E')
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

  describe('findPinRangeWarnings', () => {
    it('finds no warnings for pins in range', () => {
      const nodes = [
        node('mic', 'MicInput', { i2sWs: 39, i2sSck: 40, i2sSd: 41 }),
        node('btn', 'ButtonInput', { pin: 0 }),
      ]
      expect(findPinRangeWarnings(nodes)).toHaveLength(0)
    })

    it('flags a negative pin', () => {
      const nodes = [node('btn', 'ButtonInput', { pin: -5 })]
      const warnings = findPinRangeWarnings(nodes)
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toContain('-5')
    })

    it('flags a pin above the highest supported GPIO', () => {
      const nodes = [node('pot', 'PotInput', { pin: 9999 })]
      const warnings = findPinRangeWarnings(nodes)
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toContain('9999')
    })

    it('flags a fractional pin', () => {
      const nodes = [node('enc', 'EncoderInput', { pinA: 32.7, pinB: 33, pinSW: 25 })]
      const warnings = findPinRangeWarnings(nodes)
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toContain('pin A')
    })

    it('checks SD Card CS and external-I2S pins', () => {
      const nodes = [
        node('sd', 'SDCard', {
          sdCsPin: -1,
          audioOutput: 'i2s',
          i2sBclk: 26,
          i2sLrc: 25.5,
          i2sDout: 9999,
        }),
      ]
      const warnings = findPinRangeWarnings(nodes)
      expect(warnings).toHaveLength(3)
      expect(warnings.some((warning) => warning.includes('CS pin'))).toBe(true)
      expect(warnings.some((warning) => warning.includes('I2S LRC'))).toBe(true)
      expect(warnings.some((warning) => warning.includes('I2S DOUT'))).toBe(true)
    })

    it('surfaces out-of-range pins as warnings (not errors) from validateGraph', () => {
      const nodes = [
        node('sc', 'SolidColor'),
        node('out', 'MatrixOutput', { dataPin: 5 }),
        node('btn', 'ButtonInput', { pin: 300 }),
      ]
      const edges = [edge('e1', 'sc', 'out', 'frame')]
      const { errors, warnings } = validateGraph(nodes, edges)
      expect(errors.some(e => e.includes('300'))).toBe(false)
      expect(warnings.some(w => w.includes('300'))).toBe(true)
    })
  })

  describe('findBoardPinCompatibility', () => {
    it('rejects a digital-only pin for a potentiometer', () => {
      const result = findBoardPinCompatibility(
        [node('pot', 'PotInput', { pin: 5 })],
        'arduino:avr:uno',
      )
      expect(result.errors).toEqual([expect.stringMatching(/doesn't support analog input/)])
    })

    it('models input-only pins and their missing pull resistors', () => {
      expect(findBoardPinCompatibility(
        [node('btn', 'ButtonInput', { pin: 34, pullup: true })],
        'esp32:esp32:esp32',
      ).errors).toEqual([expect.stringMatching(/no internal pull-up/)])
      expect(findBoardPinCompatibility(
        [node('btn', 'ButtonInput', { pin: 34, pullup: false })],
        'esp32:esp32:esp32',
      ).errors).toEqual([])
      expect(findBoardPinCompatibility(
        [node('out', 'MatrixOutput', { dataPin: 34 })],
        'esp32:esp32:esp32',
      ).errors).toEqual([expect.stringMatching(/doesn't support digital output/)])
    })

    it('warns when an ESP32 ADC2 pin is used for analog input with Wi-Fi', () => {
      const result = findBoardPinCompatibility(
        [node('pot', 'PotInput', { pin: 25 })],
        'esp32:esp32:esp32',
      )
      expect(result.errors).toEqual([])
      expect(result.warnings).toEqual([expect.stringMatching(/ADC2 shares hardware with Wi-Fi/)])
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

    it('does not flag a cap that covers at least 2/3 of worst-case draw as a safety margin', () => {
      // 16x16 = 256 LEDs -> worst case 15360 mA; 2/3 of that is 10240 mA.
      const nodes = [node('out', 'MatrixOutput', { width: 16, height: 16, powerLimit: true, milliamps: 10240 })]
      const power = estimatePowerLoad(nodes)!
      expect(power.worstCaseMa).toBe(15360)
      expect(power.configuredMa).toBe(10240)
      expect(power.exceedsConfigured).toBe(false)
    })

    it('still flags a cap just below the 2/3 safety margin', () => {
      const nodes = [node('out', 'MatrixOutput', { width: 16, height: 16, powerLimit: true, milliamps: 10000 })]
      const power = estimatePowerLoad(nodes)!
      expect(power.exceedsConfigured).toBe(true)
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

    it('counts ColorTrails output plus its intermediate advection buffer', () => {
      const nodes = [node('ct', 'ColorTrails'), node('out', 'MatrixOutput', { width: 4, height: 4 })]
      const edges = [edge('e1', 'ct', 'out', 'frame')]
      const ram = estimateFirmwareRam(nodes, edges)!
      expect(ram.frameBufferBytes).toBe(96) // persistent output + one CRGB intermediate
      expect(ram.statefulBytes).toBe(0)
      expect(ram.paletteBytes).toBe(48)   // ColorTrails samples a palette
      expect(ram.internalBytes).toBe(192) // two buffers + physical leds + palette
    })

    it('counts one palette table per distinct named palette', () => {
      // Two nodes on the same palette share a single `paldef_` table; a third on
      // a different one adds a second.
      const nodes = [
        node('a', 'Plasma', { palette: 'ocean' }),
        node('b', 'Plasma', { palette: 'ocean' }),
        node('c', 'Plasma', { palette: 'lava' }),
        node('blend', 'Blend'),
        node('blend2', 'Blend'),
        node('out', 'MatrixOutput', { width: 4, height: 4 }),
      ]
      const edges = [
        edge('e1', 'a', 'blend', 'a'), edge('e2', 'b', 'blend', 'b'),
        edge('e3', 'blend', 'blend2', 'a'), edge('e4', 'c', 'blend2', 'b'),
        edge('e5', 'blend2', 'out', 'frame'),
      ]
      expect(estimateFirmwareRam(nodes, edges)!.paletteBytes).toBe(96) // ocean + lava
    })

    it('counts a per-node table for a palette builder instead of a named one', () => {
      const nodes = [
        node('cp', 'CustomPalette'),
        node('p', 'Plasma'),
        node('out', 'MatrixOutput', { width: 4, height: 4 }),
      ]
      const edges = [edge('e1', 'cp', 'p', 'paletteIn'), edge('e2', 'p', 'out', 'frame')]
      // One `pal_<id>` for the builder — the consumer resolves to it rather
      // than pulling in a shared `paldef_` table as well.
      expect(estimateFirmwareRam(nodes, edges)!.paletteBytes).toBe(48)
    })

    it('ignores palettes on nodes unreachable from MatrixOutput', () => {
      const nodes = [
        node('sc', 'SolidColor'),
        node('out', 'MatrixOutput', { width: 4, height: 4 }),
        node('orphan', 'Plasma', { palette: 'lava' }),
      ]
      expect(estimateFirmwareRam(nodes, [edge('e1', 'sc', 'out', 'frame')])!.paletteBytes).toBe(0)
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

    it('does not warn about an RTCInput node now that firmware clock support exists', () => {
      const nodes = [node('rtc', 'RTCInput'), node('math', 'Math')]
      const edges = [edge('e1', 'rtc', 'math', 'a')]
      expect(findPreviewOnlyWarnings(nodes, edges)).toHaveLength(0)
    })

    it('surfaces the preview-only warning from validateGraph', () => {
      const nodes = [node('midi', 'MidiInput'), node('math', 'Math'), node('out', 'MatrixOutput')]
      const edges = [edge('e1', 'midi', 'math', 'a'), edge('e2', 'math', 'out', 'frame')]
      const { warnings } = validateGraph(nodes, edges)
      expect(warnings.some(w => w.includes('preview-only'))).toBe(true)
    })

    it('warns when an RTCInput manual start time is not a real date', () => {
      const nodes = [
        node('rtc', 'RTCInput', { timeSource: 'Manual', startYear: 2026, startMonth: 2, startDay: 31, startHour: 12, startMinute: 0, startSecond: 0 }),
        node('math', 'Math'),
      ]
      const { warnings } = validateGraph(nodes, [edge('e1', 'rtc', 'math', 'a')])
      expect(warnings.some(w => w.includes('invalid manual RTC start date/time'))).toBe(true)
    })

    // Schedule problems used to come back with an empty nodeIds, so clicking
    // one in Graph Health could not select or fit the offending node.
    it('attributes schedule warnings to the node that owns them', () => {
      const nodes = [
        node('sched', 'ScheduleTrigger', { scheduleMode: 'Window', startHour: 18, endHour: 20 }),
        node('out', 'MatrixOutput', { width: 8, height: 8 }),
      ]
      const diagnostics = buildGraphDiagnostics(nodes, [edge('e1', 'sched', 'out', 'frame')], {})
      const schedule = diagnostics.filter((issue) => issue.id.startsWith('schedule-'))
      expect(schedule.length).toBeGreaterThan(0)
      expect(schedule.every((issue) => issue.nodeIds.includes('sched'))).toBe(true)
    })

    it('warns when a schedule window starts and ends at the same time', () => {
      const nodes = [
        node('sched', 'ScheduleTrigger', {
          scheduleMode: 'Window',
          startHour: 18, startMinute: 30, startSecond: 0,
          endHour: 18, endMinute: 30, endSecond: 0,
        }),
        node('rtc', 'RTCInput'),
      ]
      const { warnings } = validateGraph(nodes, [
        edge('e1', 'rtc', 'sched', 'valid'),
        edge('e2', 'rtc', 'sched', 'secondsOfDay'),
      ])
      expect(warnings.some((w) => w.includes('starts and ends at the same time'))).toBe(true)
    })

    // Preview falls back to the browser clock, so a missing RTC wire is
    // invisible until the sketch is flashed and shows dashes forever.
    it('flags a clock-mode ClockDisplay with no time source wired', () => {
      const nodes = [
        node('clk', 'ClockDisplay', { displayMode: 'Digital HH:MM' }),
        node('out', 'MatrixOutput', { width: 8, height: 8 }),
      ]
      const diagnostics = buildGraphDiagnostics(nodes, [edge('e1', 'clk', 'out', 'frame')], {})
      expect(diagnostics).toContainEqual(expect.objectContaining({
        id: 'clk-clock-no-time',
        severity: 'warning',
        nodeIds: ['clk'],
      }))
    })

    it('does not flag a wired clock, or a stopwatch that needs no clock', () => {
      const out = node('out', 'MatrixOutput', { width: 8, height: 8 })
      const wired = buildGraphDiagnostics(
        [node('rtc', 'RTCInput'), node('clk', 'ClockDisplay', { displayMode: 'Analog' }), out],
        [edge('e1', 'rtc', 'clk', 'secondsOfDay'), edge('e2', 'clk', 'out', 'frame')],
        {},
      )
      expect(wired.some((issue) => issue.id === 'clk-clock-no-time')).toBe(false)

      const stopwatch = buildGraphDiagnostics(
        [node('clk', 'ClockDisplay', { displayMode: 'Stopwatch' }), out],
        [edge('e1', 'clk', 'out', 'frame')],
        {},
      )
      expect(stopwatch.some((issue) => issue.id === 'clk-clock-no-time')).toBe(false)
    })
  })
})
