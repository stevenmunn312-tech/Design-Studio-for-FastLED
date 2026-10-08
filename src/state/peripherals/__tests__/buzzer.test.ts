import { describe, expect, it } from 'vitest'
import { buildHardwareManifest, collectPinUses } from '../../../build/hardwareManifest'
import { generateCpp } from '../../../codegen/cppGenerator'
import {
  peripheralGroundPadIndex, peripheralPowerPadIndex, peripheralSignalPadIndex,
} from '../../../components/BuildDiagram/physicalDiagramLayout'
import { FIXTURE_PARTS } from '../../../components/Hardware/hardwarePartCatalog'
import { findDeployBlockingErrors, findPinConflicts, validateGraph } from '../../../utils/validateGraph'
import {
  BUZZER_PART_ID, BUZZER_PITCH_MAX_HZ, BUZZER_PITCH_MIN_HZ, PASSIVE_BUZZER_PART_ID,
  buzzerActiveHigh, buzzerIsPassive, buzzerPitchHz, buzzerSpec,
} from '../buzzer'
import { partDerivedInputs } from '../../../build/parts/partPorts'
import type { StudioEdge, StudioNode } from '../../graphStore'
import { isPropertyEnabled, libraryDefaults, NODE_LIBRARY, propertyLabel } from '../../nodeLibrary'
import { partById } from '../../../build/parts/partCatalogue'
import { PART_OPTIONS } from '../../../build/parts/partOptions'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: definition.label, nodeType, category: definition.category,
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition.inputs, outputs: definition.outputs,
    },
  } as StudioNode
}

function edge(id: string, source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge {
  return { id, source, sourceHandle, target, targetHandle } as StudioEdge
}

function buzzerGraph(properties: Record<string, unknown> = {}, wired = true) {
  const nodes = [
    node('buzz', 'BuzzerOutput', properties), node('btn', 'ButtonInput', { pin: 4 }),
    node('fill', 'SolidColor'), node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
  ]
  const edges = [edge('frame', 'fill', 'frame', 'out', 'frame')]
  if (wired) edges.push(edge('sound', 'btn', 'pressed', 'buzz', 'on'))
  return { nodes, edges }
}

describe('the catalogued KY-012', () => {
  it('carries an active, active-high drive contract and orders the pads GND, NC, SIG', () => {
    expect(buzzerSpec(BUZZER_PART_ID)).toMatchObject({ type: 'active', activeLevel: 'high', resonanceKHz: 2.5, maxCurrentMa: 30 })
    expect(buzzerActiveHigh(BUZZER_PART_ID)).toBe(true)
    expect(partById(BUZZER_PART_ID)?.pinLabelsLeftToRight).toEqual(['GND', 'NC', 'SIG'])
    expect(PART_OPTIONS.BuzzerOutput.options.map((option) => option.id)).toEqual([BUZZER_PART_ID, PASSIVE_BUZZER_PART_ID])
    expect(FIXTURE_PARTS.find((entry) => entry.nodeType === 'BuzzerOutput')?.pinRequests)
      .toEqual([{ key: 'sigPin', capability: 'digitalOutput' }])
  })

  it('is a sink with one boolean Sound input and a default pin', () => {
    const definition = NODE_LIBRARY.find((entry) => entry.type === 'BuzzerOutput')!
    expect(definition.inputs.map((port) => [port.id, port.dataType])).toEqual([['on', 'bool']])
    expect(definition.outputs).toEqual([])
    expect(libraryDefaults('BuzzerOutput')).toMatchObject({ partId: BUZZER_PART_ID, sigPin: 26 })
  })
})

describe('buzzer firmware', () => {
  it('latches the silent level before enabling the pin, then follows the input', () => {
    const { nodes, edges } = buzzerGraph({ sigPin: 27 })
    const sketch = generateCpp(nodes, edges)
    expect(sketch).toContain('digitalWrite(27, LOW);')
    expect(sketch).toContain('pinMode(27, OUTPUT);')
    expect(sketch.indexOf('digitalWrite(27, LOW);')).toBeLessThan(sketch.indexOf('pinMode(27, OUTPUT);'))
    expect(sketch).toMatch(/digitalWrite\(27, [^;]+ \? HIGH : LOW\);/)
  })

  it('stays silent when nothing is wired to Sound', () => {
    const { nodes, edges } = buzzerGraph({ sigPin: 27 }, false)
    expect(generateCpp(nodes, edges)).toMatch(/digitalWrite\(27, false \? HIGH : LOW\);/)
  })
})

describe('buzzer wiring', () => {
  it('claims its signal pin, collides with another user of it, and draws only SIG and GND', () => {
    const buzz = node('buzz', 'BuzzerOutput', { sigPin: 26 })
    expect(collectPinUses([buzz]).map((use) => [use.propertyKey, use.pin])).toEqual([['sigPin', 26]])
    expect(findPinConflicts([buzz, node('b2', 'BuzzerOutput', { sigPin: 26 })]).length).toBeGreaterThan(0)

    const [item] = buildHardwareManifest([buzz], [], 'esp32:esp32:esp32').primaryItems
    const pads = partById(BUZZER_PART_ID)!.pinLabelsLeftToRight!
    expect(item).toMatchObject({
      kind: 'buzzer-output', supported: true,
      facts: { partId: BUZZER_PART_ID, activeLevel: 'high', pitch: '2.5 kHz', maxCurrent: '30 mA' },
    })
    // No supply pad: the buzzer runs from its signal pin.
    expect(peripheralPowerPadIndex(item)).toBeNull()
    expect(pads[peripheralGroundPadIndex(item)]).toBe('GND')
    expect(pads[peripheralSignalPadIndex(item, 0)]).toBe('SIG')
  })
})

function passiveGraph(properties: Record<string, unknown> = {}, pitchWired = false) {
  const { nodes, edges } = buzzerGraph({ partId: PASSIVE_BUZZER_PART_ID, sigPin: 27, ...properties })
  if (pitchWired) {
    nodes.push(node('lfo', 'PotInput', { pin: 34 }))
    edges.push(edge('pitch', 'lfo', 'value', 'buzz', 'pitch'))
  }
  return { nodes, edges }
}

const sketchOf = ({ nodes, edges }: { nodes: StudioNode[]; edges: StudioEdge[] }) => generateCpp(nodes, edges)

describe('the catalogued KY-006', () => {
  it('carries a passive drive contract, loudest at 2 kHz, and orders the pads S, NC, -', () => {
    expect(buzzerSpec(PASSIVE_BUZZER_PART_ID)).toMatchObject({ type: 'passive', resonanceKHz: 2, maxCurrentMa: 25 })
    expect(buzzerIsPassive(PASSIVE_BUZZER_PART_ID)).toBe(true)
    expect(buzzerIsPassive(BUZZER_PART_ID)).toBe(false)
    expect(partById(PASSIVE_BUZZER_PART_ID)?.pinLabelsLeftToRight).toEqual(['S', 'NC', '-'])
    expect(partById(PASSIVE_BUZZER_PART_ID)?.dimensionsMm).toEqual({ width: 15, height: 18.5 })
  })

  it('adds a Pitch input, backed by a pitch property only the passive part shows', () => {
    expect(partDerivedInputs('BuzzerOutput', BUZZER_PART_ID)?.map((port) => port.id)).toEqual(['on'])
    expect(partDerivedInputs('BuzzerOutput', PASSIVE_BUZZER_PART_ID)?.map((port) => [port.id, port.dataType]))
      .toEqual([['on', 'bool'], ['pitch', 'float']])
    const definition = NODE_LIBRARY.find((entry) => entry.type === 'BuzzerOutput')!
    expect(definition.propertyInputs).toEqual({ pitchHz: 'pitch' })
    expect(libraryDefaults('BuzzerOutput')).toMatchObject({ pitchHz: 2000 })
    expect(isPropertyEnabled('BuzzerOutput', 'pitchHz', { partId: BUZZER_PART_ID })).toBe(false)
    expect(isPropertyEnabled('BuzzerOutput', 'pitchHz', { partId: PASSIVE_BUZZER_PART_ID })).toBe(true)
  })

  it('names the signal pin as each board prints it', () => {
    expect(propertyLabel('BuzzerOutput', 'sigPin', { partId: BUZZER_PART_ID })).toBe('SIG')
    expect(propertyLabel('BuzzerOutput', 'sigPin', { partId: PASSIVE_BUZZER_PART_ID })).toBe('S')
  })

  it('rounds and clamps a requested pitch, and sends NaN to the minimum', () => {
    expect(buzzerPitchHz(1999.6)).toBe(2000)
    expect(buzzerPitchHz(5)).toBe(BUZZER_PITCH_MIN_HZ)
    expect(buzzerPitchHz(50000)).toBe(BUZZER_PITCH_MAX_HZ)
    expect(buzzerPitchHz(Number.NaN)).toBe(BUZZER_PITCH_MIN_HZ)
    expect(buzzerPitchHz(undefined)).toBe(BUZZER_PITCH_MIN_HZ)
  })
})

describe('passive buzzer firmware', () => {
  it('rests the pin low before enabling it, and plays tones instead of levels', () => {
    const sketch = sketchOf(passiveGraph())
    expect(sketch.indexOf('digitalWrite(27, LOW);')).toBeGreaterThan(-1)
    expect(sketch.indexOf('digitalWrite(27, LOW);')).toBeLessThan(sketch.indexOf('pinMode(27, OUTPUT);'))
    expect(sketch).toContain('tone(27, _bzWant);')
    expect(sketch).toContain('noTone(27);')
    expect(sketch).not.toMatch(/digitalWrite\(27, [^;]+ \? HIGH : LOW\);/)
  })

  it('plays the pitch property when Pitch is unwired, and the wired value when it is', () => {
    const fixed = sketchOf(passiveGraph({ pitchHz: 880 }))
    expect(fixed).toMatch(/float _bzP = 880(\.0+)?f?;/)
    const wired = sketchOf(passiveGraph({ pitchHz: 880 }, true))
    expect(wired).not.toMatch(/float _bzP = 880/)
  })

  it('clamps the played pitch to the same range as buzzerPitchHz', () => {
    const sketch = sketchOf(passiveGraph())
    expect(sketch).toContain(`_bzP > ${BUZZER_PITCH_MAX_HZ}.0f ? ${BUZZER_PITCH_MAX_HZ}`)
    expect(sketch).toContain(`_bzP >= ${BUZZER_PITCH_MIN_HZ}.0f ? (uint16_t)(_bzP + 0.5f) : ${BUZZER_PITCH_MIN_HZ}`)
  })
})

describe('passive buzzer wiring and rules', () => {
  it('draws S and - only, labels the wire S, and reports the pitch it plays', () => {
    const buzz = node('buzz', 'BuzzerOutput', { partId: PASSIVE_BUZZER_PART_ID, sigPin: 26, pitchHz: 1500 })
    expect(collectPinUses([buzz]).map((use) => use.label)).toEqual([expect.stringMatching(/ S$/)])
    const [item] = buildHardwareManifest([buzz], [], 'esp32:esp32:esp32').primaryItems
    const pads = partById(PASSIVE_BUZZER_PART_ID)!.pinLabelsLeftToRight!
    expect(item.facts).toMatchObject({ type: 'passive', pitch: '1500 Hz', maxCurrent: '25 mA' })
    expect(item.facts).not.toHaveProperty('activeLevel')
    expect(peripheralPowerPadIndex(item)).toBeNull()
    expect(pads[peripheralGroundPadIndex(item)]).toBe('-')
    expect(pads[peripheralSignalPadIndex(item, 0)]).toBe('S')
  })

  it('warns on AVR that an IR remote is deaf while a tone plays, and hands its timer back in firmware', () => {
    const buzz = node('buzz', 'BuzzerOutput', { partId: PASSIVE_BUZZER_PART_ID, sigPin: 8 })
    const ir = node('ir', 'IRRemoteInput', { pin: 2 })
    const deaf = (fqbn: string) => validateGraph([buzz, ir], [], fqbn).warnings
      .filter((message) => message.startsWith('The IR remote cannot hear while the passive buzzer plays'))
    expect(deaf('arduino:avr:uno')).toHaveLength(1)
    expect(deaf('esp32:esp32:esp32')).toEqual([])
    expect(validateGraph([buzz], [], 'arduino:avr:uno').warnings.join()).not.toContain('IR remote cannot hear')
    const sketch = sketchOf(passiveGraph())
    const stop = sketch.slice(sketch.indexOf('noTone(27);'))
    expect(stop).toMatch(/^noTone\(27\);[^\n]*\n#if defined\(ARDUINO_ARCH_AVR\) && defined\(FLS_IR_RECEIVER\)\n\s+FLS_IR_RECEIVER\.restartTimer\(\);\n#endif/)
  })

  it('refuses a second passive buzzer, but not an active one beside a passive one', () => {
    const one = node('p1', 'BuzzerOutput', { partId: PASSIVE_BUZZER_PART_ID, sigPin: 26 })
    const two = node('p2', 'BuzzerOutput', { partId: PASSIVE_BUZZER_PART_ID, sigPin: 27 })
    const active = node('a1', 'BuzzerOutput', { partId: BUZZER_PART_ID, sigPin: 25 })
    const rule = (errors: string[]) => errors.filter((message) => message.startsWith('Only one passive buzzer can play'))
    expect(rule(findDeployBlockingErrors([one, active], [], 'esp32:esp32:esp32'))).toEqual([])
    expect(rule(findDeployBlockingErrors([one, two], [], 'esp32:esp32:esp32'))).toHaveLength(1)
  })
})
