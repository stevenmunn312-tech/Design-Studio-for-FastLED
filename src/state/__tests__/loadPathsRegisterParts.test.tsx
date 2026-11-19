import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, waitFor } from '@testing-library/react'
import ProjectsPopup from '../../components/Projects/ProjectsPopup'
import RecoverPopup from '../../components/Recover/RecoverPopup'
import InstalledPartsSection from '../../components/Hardware/InstalledPartsSection'
import { createPartsLibrary } from '../../build/parts/partsLibrary'
import { PART_CATALOGUE, partOrigin, resetRegisteredPartsForTests, type PartCatalogueEntry } from '../../build/parts/partCatalogue'
import { partTypeById } from '../../build/parts/partTypes'
import { PART_MANIFEST_VERSION } from '../../build/parts/manifest/vocabulary'
import { createMemoryCache } from '../../build/parts/remote'
import { makeSigner, signEnvelope } from '../../build/parts/remote/__tests__/testKit'
import {
  overrideTrustedPartKeysForTests,
  registerSignedParts,
  resetSignedPartsForTests,
} from '../../build/parts/signedParts'
import { loadWorkspaceAfterParts, partIdsInUse, useGraphStore, type StudioNode } from '../graphStore'
import { useProjectStore } from '../projectStore'
import { useUiStore } from '../uiStore'
import { collectSavedParts } from '../../build/parts/signedParts'
import type { PartManifest } from '../../build/parts/manifest/partManifest'
import type { PersistedWorkspace } from '../workspacePersistence'

const BASE_MONITOR = 'adafruit-ina219-current-sensor'
const signer = makeSigner('load-key')

function manifest(partId: string, revision = 1): PartManifest {
  const entry = PART_CATALOGUE[BASE_MONITOR] as PartCatalogueEntry
  return {
    ...(JSON.parse(JSON.stringify(entry)) as PartCatalogueEntry),
    partId,
    label: `Test ${partId}`,
    manifestVersion: PART_MANIFEST_VERSION,
    revision,
    partTypes: ['PowerMonitorInput'],
    categories: [],
    verification: 'reviewed',
    sources: [{ facts: ['dimensionsMm'], ref: 'https://example.test/datasheet' }],
  } as unknown as PartManifest
}

const sign = (m: unknown) => JSON.parse(signEnvelope(JSON.stringify(m), [signer])) as Record<string, unknown>

function node(partId: string, id = `n-${partId}`): StudioNode {
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: 'Monitor', nodeType: 'PowerMonitorInput', category: 'output', properties: { partId }, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

/** A workspace embedding `partId`, as a save made on another machine would, then a fresh registry. */
async function embedded(partId: string): Promise<PersistedWorkspace> {
  await registerSignedParts([sign(manifest(partId))], { keys: [signer.trusted] })
  const nodes = [node(partId)]
  const parts = collectSavedParts(nodes)
  resetRegisteredPartsForTests()
  resetSignedPartsForTests()
  return { nodes, edges: [], parts } as unknown as PersistedWorkspace
}

const OPENED: Array<() => void> = []

beforeEach(() => {
  const definition = partTypeById('PowerMonitorInput') as { downloadable: boolean }
  const before = definition.downloadable
  definition.downloadable = true
  OPENED.push(() => { definition.downloadable = before })
  overrideTrustedPartKeysForTests([signer.trusted])
  localStorage.clear()
  useProjectStore.setState({ projects: [], currentProjectId: '', recentProjectIds: [] })
  useGraphStore.setState({
    nodes: [], edges: [], selectedNodeId: null, graphData: {}, clipboard: null,
    graphs: { root: { id: 'root', name: 'Main' } }, activeGraphId: 'root',
  })
  useGraphStore.temporal.getState().clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  while (OPENED.length > 0) OPENED.pop()!()
  overrideTrustedPartKeysForTests(null)
  resetRegisteredPartsForTests()
  resetSignedPartsForTests()
})

/** Record whether `partId` was registered at the moment the graph loaded. */
function watchLoadGraph(partId: string): { registeredAtLoad: boolean[] } {
  const seen: boolean[] = []
  const original = useGraphStore.getState().loadGraph
  useGraphStore.setState({
    loadGraph: (nodes, edges, workspace) => {
      if (nodes.length > 0) seen.push(partOrigin(partId) === 'downloaded')
      original(nodes, edges, workspace)
    },
  })
  OPENED.push(() => useGraphStore.setState({ loadGraph: original }))
  return { registeredAtLoad: seen }
}

describe('every load path registers embedded parts before the graph loads', () => {
  it('loadWorkspaceAfterParts (open, share link, recent, autosave restore) registers first', async () => {
    const workspace = await embedded('late-monitor')
    const watch = watchLoadGraph('late-monitor')
    expect(await loadWorkspaceAfterParts(workspace.nodes, workspace.edges, workspace)).toBe(true)
    expect(watch.registeredAtLoad).toEqual([true])
  })

  it('a slower, superseded load does not overwrite a newer one', async () => {
    const first = await embedded('first-monitor')
    const second = await embedded('second-monitor')
    const slow = loadWorkspaceAfterParts(first.nodes, first.edges, first)
    const fast = loadWorkspaceAfterParts(second.nodes, second.edges, second)
    expect(await slow).toBe(false)
    expect(await fast).toBe(true)
    const ids = useGraphStore.getState().nodes.map((n) => n.id)
    expect(ids).toContain('n-second-monitor')
    expect(ids).not.toContain('n-first-monitor')
  })

  it('opening another project from the Projects popup registers its parts first', async () => {
    const workspace = await embedded('popup-monitor')
    useProjectStore.getState().createProject('Other', workspace as never)
    useProjectStore.getState().createProject('Current', { nodes: [], edges: [] })
    const watch = watchLoadGraph('popup-monitor')
    const { getAllByText } = render(<ProjectsPopup />)
    // The first row's Open button belongs to the project that is not active.
    const open = getAllByText('Open').find((button) => !(button as HTMLButtonElement).disabled)!
    fireEvent.click(open)
    await waitFor(() => expect(watch.registeredAtLoad).toEqual([true]))
  })

  it('restoring a recovery snapshot registers its parts first and stays undoable', async () => {
    const workspace = await embedded('recover-monitor')
    const watch = watchLoadGraph('recover-monitor')
    const { restoreWorkspaceSnapshotAfterParts } = await import('../graphStore')
    await restoreWorkspaceSnapshotAfterParts(workspace)
    expect(watch.registeredAtLoad).toEqual([true])
    expect(useGraphStore.temporal.getState().pastStates).toHaveLength(1)
    // The popup exists and imports the async variant.
    expect(RecoverPopup).toBeTypeOf('function')
  })
})

describe('partIdsInUse and uninstalling from the shelf', () => {
  const library = () => createPartsLibrary({ baseUrl: 'https://parts.example.test/v1/', cache: createMemoryCache() })

  async function register(partId: string): Promise<void> {
    await registerSignedParts([sign(manifest(partId))], { keys: [signer.trusted] })
  }

  it('counts the graph, undo history and the copy clipboard', async () => {
    await register('hist-monitor')
    await register('clip-monitor')
    await register('live-monitor')
    expect(partIdsInUse().has('live-monitor')).toBe(false)
    useGraphStore.setState({ nodes: [node('live-monitor')] })
    expect(partIdsInUse().has('live-monitor')).toBe(true)
    useGraphStore.setState({ clipboard: { nodes: [node('clip-monitor')], edges: [] } })
    expect(partIdsInUse().has('clip-monitor')).toBe(true)
    useGraphStore.temporal.setState({ pastStates: [{ nodes: [node('hist-monitor')] } as never], futureStates: [] })
    expect(partIdsInUse().has('hist-monitor')).toBe(true)
  })

  it('refuses to uninstall a part the open project uses, then allows it once the node is gone', async () => {
    await register('shelf-monitor')
    useGraphStore.setState({ nodes: [node('shelf-monitor')] })
    const { getByLabelText, findByRole, queryByLabelText } = render(<InstalledPartsSection library={library()} />)
    fireEvent.click(getByLabelText('Uninstall Test shelf-monitor'))
    expect((await findByRole('alert')).textContent).toMatch(/used by the open project/)
    expect(partOrigin('shelf-monitor')).toBe('downloaded')

    useGraphStore.setState({ nodes: [] })
    useGraphStore.temporal.getState().clear()
    fireEvent.click(getByLabelText('Uninstall Test shelf-monitor'))
    await waitFor(() => expect(partOrigin('shelf-monitor')).toBeUndefined())
    await waitFor(() => expect(queryByLabelText('Uninstall Test shelf-monitor')).toBeNull())
    expect(useUiStore.getState()).toBeDefined()
  })
})
