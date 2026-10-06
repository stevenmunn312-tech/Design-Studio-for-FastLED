import { afterEach, describe, expect, it } from 'vitest'
import { buildShareUrl, clearShareHash, readSharedWorkspace } from '../shareGraph'
import { buildProjectSnapshot, parseProjectFile, serializeProject } from '../projectFileIO'
import { selectedPhysicalBoardProfile } from '../../build/boards/boardProfiles'
import { CUSTOM_BOARD_PROFILE_ID, type CustomBoardDefinition } from '../../build/boards/customBoard'
import { rootGraphNodes, useGraphStore, type StudioEdge, type StudioNode } from '../../state/graphStore'
import type { PersistedWorkspace } from '../../state/workspacePersistence'

const definition: CustomBoardDefinition = {
  version: 1,
  id: 'bench-board',
  name: 'Bench <board>',
  referenceProfileId: 'generic-esp32-s3-n16r8-44pin-dual-usbc',
  controllerPower: 'external',
  defaultI2c: { mode: 'custom', sda: 8, scl: 9 },
  leftPins: [
    { id: 'l1', role: 'supply', voltage: 3.3, direction: 'output', label: '3V3' },
    { id: 'l2', role: 'gpio', gpio: 8, enabled: true, label: 'SDA' },
    { id: 'l3', role: 'gpio', gpio: 9, enabled: true },
  ],
  rightPins: [
    { id: 'r1', role: 'ground' },
    { id: 'r2', role: 'gpio', gpio: 4, enabled: false, label: 'D4' },
    { id: 'r3', role: 'unconnected' },
  ],
}

function workspace(): PersistedWorkspace {
  return {
    nodes: [{
      id: 'board-root', type: 'studioNode', position: { x: 0, y: 0 }, hidden: true,
      data: { nodeType: 'Board', category: 'output', label: 'Board', properties: { profileId: CUSTOM_BOARD_PROFILE_ID, customBoard: definition }, inputs: [], outputs: [] },
    }] as unknown as StudioNode[],
    edges: [] as StudioEdge[],
    graphData: {},
    graphs: {},
    activeGraphId: 'root',
  }
}

function boardDefinition(nodes: readonly StudioNode[]): unknown {
  return nodes.find((node) => node.data.nodeType === 'Board')?.data.properties.customBoard
}

afterEach(() => clearShareHash())

describe('custom board persistence', () => {
  it('survives a project file round trip on another machine', () => {
    const text = serializeProject(buildProjectSnapshot(workspace(), { name: 'Custom bench' }))
    const { project, dropped } = parseProjectFile(text, 'Custom bench')
    expect(dropped).toBe(0)
    expect(boardDefinition(project.workspace.nodes)).toEqual(definition)
    // Imported projects keep their untrusted status.
    expect(project.workspace.trusted).toBe(false)
  })

  it('survives a share link', () => {
    window.location.hash = new URL(buildShareUrl(workspace())).hash
    expect(boardDefinition(readSharedWorkspace()!.workspace.nodes)).toEqual(definition)
  })

  it('loads into the store and resolves without a local board catalogue entry', () => {
    const { nodes, edges } = workspace()
    useGraphStore.getState().loadGraph(JSON.parse(JSON.stringify(nodes)), edges)
    const root = rootGraphNodes(useGraphStore.getState())
    expect(boardDefinition(root)).toEqual(definition)
    const profile = selectedPhysicalBoardProfile(root)
    expect(profile?.label).toBe('Bench <board>')
    expect(profile?.custom?.defaultI2c).toEqual({ sda: { arduinoPin: 8 }, scl: { arduinoPin: 9 } })
  })
})
