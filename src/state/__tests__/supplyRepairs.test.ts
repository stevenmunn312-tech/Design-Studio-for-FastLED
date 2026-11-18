import { beforeEach, describe, expect, it } from 'vitest'
import { dismissSupplyPrompt, setBoardPowerCap, useGraphStore, type StudioNode } from '../graphStore'
import { normalizeBuildProfile } from '../../build/buildProfile'
import { controllerSettings } from '../../build/controllerSettings'
import { addPowerSupplyToBoard } from '../../components/Hardware/hardwarePartActions'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'output', properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

describe("Checks' supply repairs", () => {
  beforeEach(() => {
    useGraphStore.setState({
      nodes: [node('board', 'Board', { powerLimit: false }), node('out', 'MatrixOutput', { width: 16, height: 16 })],
      edges: [],
      graphData: {},
      graphs: { root: { id: 'root', name: 'Main' } },
      activeGraphId: 'root',
      buildProfile: undefined,
    } as never)
  })

  it('turns the cap on at the supply figure, then refuses a cap already inside it', () => {
    expect(setBoardPowerCap(4000)).toEqual({ ok: true, milliamps: 4000 })
    expect(controllerSettings(useGraphStore.getState().nodes)).toEqual(expect.objectContaining({ powerLimit: true, milliamps: 4000 }))
    expect(setBoardPowerCap(4000).ok).toBe(false)
    expect(setBoardPowerCap(3000)).toEqual({ ok: true, milliamps: 3000 })
  })

  it('puts a Power Supply on the bench, off the canvas', () => {
    const result = addPowerSupplyToBoard()
    expect(result.ok).toBe(true)
    const supply = useGraphStore.getState().nodes.find((entry) => entry.data.nodeType === 'PowerSupply')
    expect(supply).toEqual(expect.objectContaining({ hidden: true }))
    expect(supply?.data.properties).toEqual(expect.objectContaining({ voltage: 5, ratedCurrentA: 10 }))
  })

  it('remembers Not now in the build profile saved with the project', () => {
    dismissSupplyPrompt()
    expect(useGraphStore.getState().buildProfile?.supplyPromptDismissed).toBe(true)
    expect(normalizeBuildProfile({ version: 1, supplyPromptDismissed: true })?.supplyPromptDismissed).toBe(true)
    expect(normalizeBuildProfile({ version: 1, supplyPromptDismissed: 'yes' })?.supplyPromptDismissed).toBeUndefined()
  })
})
