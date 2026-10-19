import { describe, expect, it } from 'vitest'
import type { StudioEdge, StudioNode } from '../../graphStore'
import {
  claimedLanePins,
  dataLanePlan,
  dataLaneUnit,
  findDataLaneIssues,
  offeredDataLaneCounts,
  splitAcrossPinsFix,
} from '../dataLanes'
import { findDataLaneErrors } from '../../../utils/dataLaneValidation'
import { findDeployBlockingErrors, findPinConflicts } from '../../../utils/validateGraph'
import { buildHardwareManifest, collectPinUses } from '../../../build/hardwareManifest'
import { itemLayouts } from '../../../components/BuildDiagram/physicalDiagramLayout'
import { splitAcrossPinsForGraph } from '../../../build/pins/splitAcrossPins'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: id, nodeType, category: 'output', properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

const matrix = (props: Record<string, unknown> = {}) => ({
  form: 'matrix', width: 16, height: 32, chipset: 'WS2812B', dataPin: 4, ...props,
})

describe('offered lane counts', () => {
  it('cuts a matrix on whole rows', () => {
    expect(dataLaneUnit(matrix())).toBe(16)
    expect(offeredDataLaneCounts(matrix())).toEqual([1, 2, 4, 8])
    expect(offeredDataLaneCounts(matrix({ height: 12 }))).toEqual([1, 2, 3, 4, 6])
  })

  it('cuts a panels layout on whole panels', () => {
    const panels = matrix({ width: 32, height: 16, layout: 'panels', tilesX: 2, tilesY: 1 })
    expect(dataLaneUnit(panels)).toBe(256)
    expect(offeredDataLaneCounts(panels)).toEqual([1, 2])
  })

  it('cuts a single chain anywhere equal', () => {
    expect(offeredDataLaneCounts({ form: 'strip', ledCount: 120 })).toEqual([1, 2, 3, 4, 5, 6, 8])
    expect(offeredDataLaneCounts({ form: 'ring', ledCount: 11 })).toEqual([1])
  })

  it('never splits a clocked chipset or a HUB75 panel', () => {
    expect(offeredDataLaneCounts(matrix({ chipset: 'APA102' }))).toEqual([1])
    expect(offeredDataLaneCounts(matrix({ form: 'hub75' }))).toEqual([1])
  })

  it('honours a lane cap', () => {
    expect(offeredDataLaneCounts(matrix(), 4)).toEqual([1, 2, 4])
  })
})

describe('the lane plan', () => {
  it('drives the requested lanes when they are offered and have pins', () => {
    expect(dataLanePlan(matrix({ dataLanes: 4, lanePins: [5, 6, 7] }))).toEqual({ lanes: 4, perLane: 128, lanePins: [5, 6, 7] })
  })

  it('falls back to one pin, and reports why, when it cannot be built', () => {
    const uneven = matrix({ dataLanes: 3, lanePins: [5, 6] })
    expect(dataLanePlan(uneven).lanes).toBe(1)
    expect(findDataLaneIssues(uneven)[0]).toContain('Choose 2, 4, 8 lanes')
    const short = matrix({ dataLanes: 4, lanePins: [5] })
    expect(dataLanePlan(short).lanes).toBe(1)
    expect(findDataLaneIssues(short)[0]).toContain('2 lanes have no pin yet')
    expect(findDataLaneIssues(matrix({ chipset: 'APA102', dataLanes: 2, lanePins: [5] }))[0]).toContain('clocked chipset')
    expect(findDataLaneIssues(matrix({ dataLanes: 1 }))).toEqual([])
  })

  it('claims only the lanes the request names', () => {
    expect(claimedLanePins(matrix({ dataLanes: 2, lanePins: [5, 6, 7] })).map((lane) => lane.pin)).toEqual([5])
  })
})

describe('splitAcrossPinsFix', () => {
  const board = [4, 5, 6, 7, 15, 16, 17, 18]

  it('takes the most lanes the free pins allow', () => {
    expect(splitAcrossPinsFix(matrix(), board, [4, 5])).toEqual({ lanes: 4, lanePins: [6, 7, 15] })
    expect(splitAcrossPinsFix(matrix(), board, [4], { maxLanes: 2 })).toEqual({ lanes: 2, lanePins: [5] })
  })

  it('takes the smallest count that reaches a wanted lane count', () => {
    expect(splitAcrossPinsFix(matrix({ height: 12 }), board, [], { wantLanes: 3 })).toEqual({ lanes: 3, lanePins: [5, 6] })
  })

  it('reuses the output\'s own lane pins', () => {
    const split = matrix({ dataLanes: 2, lanePins: [5] })
    expect(splitAcrossPinsFix(split, [4, 5], [4, 5])).toEqual({ lanes: 2, lanePins: [5] })
  })

  it('returns null when nothing can split', () => {
    expect(splitAcrossPinsFix(matrix({ chipset: 'APA102' }), board, [])).toBeNull()
    expect(splitAcrossPinsFix(matrix(), [4], [])).toBeNull()
  })
})

describe('lane pins as claims', () => {
  const split = node('out', 'MatrixOutput', matrix({ dataLanes: 4, lanePins: [5, 6, 7] }))

  it('enters every lane pin into the pin walk', () => {
    expect(collectPinUses([split]).map((use) => `${use.propertyKey}:${use.pin}`)).toEqual([
      'dataPin:4', 'lanePins.0:5', 'lanePins.1:6', 'lanePins.2:7',
    ])
  })

  it('reports a lane pin another part holds', () => {
    const conflicts = findPinConflicts([split, node('btn', 'ButtonInput', { pin: 6 })])
    expect(conflicts.join('\n')).toMatch(/lane 3 data pin/)
  })

  it('blocks deploy on a split that cannot be built', () => {
    const bad = node('out', 'MatrixOutput', matrix({ dataLanes: 3, lanePins: [5, 6] }))
    expect(findDataLaneErrors([bad])).toHaveLength(1)
    expect(findDeployBlockingErrors([bad], []).some((message) => message.includes('cannot split'))).toBe(true)
  })

  it('refuses a split output in a parallel mirror', () => {
    const fill = node('fill', 'SolidColor', {})
    const mirror = node('mirror', 'MatrixOutput', matrix())
    const edges = [
      { id: 'a', source: 'fill', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
      { id: 'b', source: 'fill', sourceHandle: 'frame', target: 'mirror', targetHandle: 'frame' },
    ] as StudioEdge[]
    expect(findDataLaneErrors([fill, split, mirror], edges)[0]).toContain('mirror cannot share')
  })
})

describe('Build Diagram lanes', () => {
  it('draws each lane as its own run, with its own data wire', () => {
    const split = node('out', 'MatrixOutput', matrix({ dataLanes: 4, lanePins: [5, 6, 7] }))
    const outputs = buildHardwareManifest([split], [], 'esp32:esp32:esp32s3').primaryItems
      .filter((item) => item.kind === 'matrix-output')
    expect(outputs.map((item) => item.id)).toEqual(['output:out', 'output:out:lane2', 'output:out:lane3', 'output:out:lane4'])
    expect(outputs.map((item) => item.pins.map((pin) => pin.pin))).toEqual([[4], [5], [6], [7]])
    expect(outputs.map((item) => item.facts.pixelCount)).toEqual([128, 128, 128, 128])
    expect(outputs[1].facts).toMatchObject({ width: 16, height: 8, lane: 2, laneCount: 4, laneFirstLed: 128 })
    expect(itemLayouts(outputs)).toHaveLength(4)
  })

  it('gives every lane its own extender pair', () => {
    const split = node('out', 'MatrixOutput', matrix({ dataLanes: 2, lanePins: [5], dataLink: 'NLED Pixel Data Extender' }))
    const outputs = buildHardwareManifest([split], [], 'esp32:esp32:esp32s3').primaryItems
      .filter((item) => item.kind === 'matrix-output')
    expect(outputs.map((item) => typeof item.facts.dataLinkPartId)).toEqual(['string', 'string'])
  })

  it('keeps an unsplit output one item', () => {
    const outputs = buildHardwareManifest([node('out', 'MatrixOutput', matrix())], [], '').primaryItems
      .filter((item) => item.kind === 'matrix-output')
    expect(outputs.map((item) => item.id)).toEqual(['output:out'])
  })
})

describe('splitAcrossPinsForGraph', () => {
  it('picks free output pins on the board, skipping claimed ones', () => {
    const out = node('out', 'MatrixOutput', matrix({ dataPin: 4 }))
    const result = splitAcrossPinsForGraph(undefined, 'esp32:esp32:esp32s3', [out], 'out', { lanes: 4 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.lanes).toBe(4)
    expect(result.lanePins).toHaveLength(3)
    expect(result.lanePins).not.toContain(4)
    expect(new Set(result.lanePins).size).toBe(3)
  })

  it('refuses a count the output does not offer', () => {
    const out = node('out', 'MatrixOutput', matrix())
    expect(splitAcrossPinsForGraph(undefined, 'esp32:esp32:esp32s3', [out], 'out', { lanes: 3 }).ok).toBe(false)
  })
})
