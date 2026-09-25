import { describe, it, expect, beforeEach, vi } from 'vitest'
import { promptTrustIfNeeded } from '../trustPrompt'
import { useGraphStore, ROOT_GRAPH_ID } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'
import { useProjectStore } from '../../state/projectStore'
import type { StudioNode } from '../../state/graphStore'
import { clearPatternContentTrustForTests } from '../../state/patternTrust'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'pattern', properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

interface ConfirmOptions { title?: string; message?: string; confirmLabel?: string; cancelLabel?: string; tone?: string }
// Typed through the generic rather than a named parameter, so the recorded
// calls stay inspectable without an unused argument.
const requestConfirm = vi.fn<(options: ConfirmOptions) => Promise<boolean>>(async () => true)

function setWorkspace(nodes: StudioNode[], trusted = false) {
  useGraphStore.setState({
    nodes, edges: [], graphData: {}, selectedNodeId: null,
    activeGraphId: ROOT_GRAPH_ID, trusted,
  } as never)
}

beforeEach(() => {
  clearPatternContentTrustForTests()
  requestConfirm.mockClear()
  requestConfirm.mockResolvedValue(true)
  useUiStore.setState({ requestConfirm } as never)
  useProjectStore.setState({ projects: [], currentProjectId: '' } as never)
  setWorkspace([])
})

describe('promptTrustIfNeeded', () => {
  it('does not interrupt when the untrusted graph holds nothing gated', async () => {
    // The ordinary shared-pattern case: nothing in it needs trusting, so it
    // simply is trusted, and nobody is asked anything.
    setWorkspace([node('p', 'Plasma'), node('o', 'MatrixOutput')])
    await promptTrustIfNeeded()
    expect(requestConfirm).not.toHaveBeenCalled()
    expect(useGraphStore.getState().trusted).toBe(true)
  })

  it('asks when the graph carries a formula node', async () => {
    setWorkspace([node('cf', 'CustomFormula'), node('o', 'MatrixOutput')])
    await promptTrustIfNeeded()
    expect(requestConfirm).toHaveBeenCalledOnce()
    expect(requestConfirm.mock.calls[0][0].message).toMatch(/Formula and Code nodes will run once you trust it/)
    expect(useGraphStore.getState().trusted).toBe(true)
  })

  it('names the Art-Net listener when that is what is held', async () => {
    setWorkspace([node('d', 'DMXInput', { inputMode: 'Art-Net' })])
    await promptTrustIfNeeded()
    const message = requestConfirm.mock.calls[0][0].message as string
    expect(message).toMatch(/Art-Net listener will open once you trust it/)
    expect(message).not.toMatch(/Formula and Code/)
  })

  it('leaves the graph untrusted when the user declines', async () => {
    requestConfirm.mockResolvedValue(false)
    setWorkspace([node('cf', 'CustomFormula')])
    await promptTrustIfNeeded()
    expect(useGraphStore.getState().trusted).toBe(false)
  })

  it('is a no-op on an already-trusted graph', async () => {
    setWorkspace([node('cf', 'CustomFormula')], true)
    await promptTrustIfNeeded()
    expect(requestConfirm).not.toHaveBeenCalled()
  })
})
