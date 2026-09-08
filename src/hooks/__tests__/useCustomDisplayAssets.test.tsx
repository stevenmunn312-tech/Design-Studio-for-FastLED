import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCustomDisplayAssets } from '../useCustomDisplayAssets'
import { useGraphStore, type StudioNode, type StudioEdge } from '../../state/graphStore'
import { createDisplayDocument } from '../../state/displayEditor'
import { bakeCustomDisplayAssets, type BakedCustomDisplayAssets } from '../../utils/bakeCustomDisplayAssets'
import { customDisplayAssetRequests, type BakedCustomDisplayAsset } from '../../state/customDisplayResources'

vi.mock('../../utils/bakeCustomDisplayAssets', () => ({ bakeCustomDisplayAssets: vi.fn() }))

const screenNode = {
  id: 'screen', type: 'studioNode', position: { x: 0, y: 0 },
  data: { nodeType: 'Display', label: 'Touch panel', category: 'output',
    properties: { displayId: 'document' }, inputs: [], outputs: [] },
} as StudioNode

/** The panel a design has to be plugged into before any of this is real. */
function panelNode(id: string): StudioNode {
  return { ...screenNode, id, data: { ...screenNode.data, nodeType: 'TransportDisplay', label: id,
    properties: { partId: 'st7789v-xpt2046-touch-240x320' } } } as StudioNode
}
function mount(document: string, panel: string): StudioEdge {
  return { id: `${document}-${panel}`, source: document, sourceHandle: 'customDisplay',
    target: panel, targetHandle: 'customDisplay' } as StudioEdge
}

const nodes = [screenNode, panelNode('panel')]
const edges = [mount('screen', 'panel')]

function documentWithArt(width = 2) {
  const document = createDisplayDocument('document')
  document.widgets = [{ id: 'art', type: 'Image/Icon', label: 'Art',
    bounds: { x: 0, y: 0, width, height: 1 },
    properties: { assetId: 'icon:power', tint: true } }]
  return document
}

function deferred() {
  let resolve!: (value: BakedCustomDisplayAssets) => void
  const promise = new Promise<BakedCustomDisplayAssets>((done) => { resolve = done })
  return { promise, resolve }
}

describe('firmware display asset preparation', () => {
  beforeEach(() => {
    vi.mocked(bakeCustomDisplayAssets).mockReset()
    useGraphStore.setState({ trusted: true, displayDocuments: { document: documentWithArt() } })
  })

  it('shares a bake between build consumers and keys finished bytes by node, not document', async () => {
    const pending = deferred()
    vi.mocked(bakeCustomDisplayAssets).mockReturnValue(pending.promise)
    const first = renderHook(() => useCustomDisplayAssets(nodes, true, edges))
    const second = renderHook(() => useCustomDisplayAssets(nodes, true, edges))
    expect(first.result.current.pending).toBe(true)
    expect(second.result.current.assets).toBeUndefined()
    expect(bakeCustomDisplayAssets).toHaveBeenCalledTimes(1)
    const asset: BakedCustomDisplayAsset = {
      ...customDisplayAssetRequests(useGraphStore.getState().displayDocuments.document)[0],
      data: new Uint8Array([4, 8]),
    }
    await act(async () => pending.resolve({ assets: [asset], issues: [] }))
    expect(first.result.current.assets).toEqual({ screen: [asset] })
    expect(second.result.current.assets).toEqual(first.result.current.assets)
  })

  it('discards late completions after a document-only edit', async () => {
    const old = deferred()
    const current = deferred()
    vi.mocked(bakeCustomDisplayAssets).mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
    const { result } = renderHook(() => useCustomDisplayAssets(nodes, true, edges))
    act(() => useGraphStore.setState({ displayDocuments: { document: documentWithArt(3) } }))
    await act(async () => current.resolve({ assets: [], issues: [] }))
    expect(result.current.pending).toBe(false)
    await act(async () => old.resolve({ assets: [], issues: [{ code: 'asset-data', message: 'Old failure' }] }))
    expect(result.current.errors).toEqual([])
    expect(result.current.documents.document.widgets[0].bounds.width).toBe(3)
  })

  it('shares a failed bake across nodes using the same document without publishing partial assets', async () => {
    const otherDocument = documentWithArt(3)
    useGraphStore.setState({ displayDocuments: { ...useGraphStore.getState().displayDocuments, other: otherDocument } })
    const pending = deferred()
    const otherAsset = { ...customDisplayAssetRequests(otherDocument)[0], data: new Uint8Array([1, 2, 3]) }
    vi.mocked(bakeCustomDisplayAssets).mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce({ assets: [otherAsset], issues: [] })
    // Two copies of one design and a third design, each on a panel of its own —
    // the shape a user reaches for when they want the same screen twice.
    const sharedNodes = [...nodes,
      { ...screenNode, id: 'duplicate', data: { ...screenNode.data, label: 'Second panel' } },
      { ...screenNode, id: 'other', data: { ...screenNode.data, properties: { displayId: 'other' } } },
      panelNode('panel2'), panelNode('panel3'),
    ]
    const sharedEdges = [...edges, mount('duplicate', 'panel2'), mount('other', 'panel3')]
    const { result } = renderHook(() => useCustomDisplayAssets(sharedNodes, true, sharedEdges))
    // Independent documents can prepare while the first decoder is pending.
    expect(bakeCustomDisplayAssets).toHaveBeenCalledTimes(2)
    await act(async () => pending.resolve({ assets: [], issues: [{ code: 'asset-data', message: 'Power: decoder failed' }] }))
    expect(result.current.errors).toEqual(['Touch panel: Power: decoder failed', 'Second panel: Power: decoder failed'])
    expect(result.current.assets).toEqual({})
    expect(bakeCustomDisplayAssets).toHaveBeenCalledTimes(2)
  })

  it('names unexpected bake rejections and permits retrying them', async () => {
    vi.mocked(bakeCustomDisplayAssets).mockRejectedValueOnce(new Error('Canvas unavailable'))
      .mockResolvedValueOnce({ assets: [], issues: [] })
    const { result } = renderHook(() => useCustomDisplayAssets(nodes, true, edges))
    await waitFor(() => expect(result.current.errors).toEqual(['Touch panel: could not prepare display images: Canvas unavailable']))
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.pending).toBe(false))
    expect(result.current.errors).toEqual([])
    expect(bakeCustomDisplayAssets).toHaveBeenCalledTimes(2)
  })

  it('gates I/O on trust and removes cached bytes immediately when trust is revoked', async () => {
    useGraphStore.setState({ trusted: false })
    vi.mocked(bakeCustomDisplayAssets).mockResolvedValue({ assets: [], issues: [] })
    const { result } = renderHook(() => useCustomDisplayAssets(nodes, true, edges))
    expect(bakeCustomDisplayAssets).not.toHaveBeenCalled()
    expect(result.current.errors.join(' ')).toContain('Trust this project')
    act(() => useGraphStore.setState({ trusted: true }))
    await waitFor(() => expect(result.current.pending).toBe(false))
    expect(bakeCustomDisplayAssets).toHaveBeenCalledTimes(1)
    act(() => useGraphStore.setState({ trusted: false }))
    expect(result.current.assets).toEqual({})
    expect(result.current.errors.join(' ')).toContain('Trust this project')
  })

  it('retries failed preparation for both the capacity and upload consumers', async () => {
    vi.mocked(bakeCustomDisplayAssets).mockResolvedValueOnce({
      assets: [], issues: [{ code: 'asset-data', message: 'HTTP 404' }],
    }).mockResolvedValue({ assets: [], issues: [] })
    const first = renderHook(() => useCustomDisplayAssets(nodes, true, edges))
    const second = renderHook(() => useCustomDisplayAssets(nodes, true, edges))
    await waitFor(() => expect(first.result.current.errors).toEqual(['Touch panel: HTTP 404']))
    await waitFor(() => expect(second.result.current.errors).toEqual(first.result.current.errors))
    act(() => first.result.current.retry())
    await waitFor(() => expect(first.result.current.pending).toBe(false))
    await waitFor(() => expect(second.result.current.pending).toBe(false))
    expect(first.result.current.errors).toEqual([])
    expect(second.result.current.errors).toEqual([])
    expect(bakeCustomDisplayAssets).toHaveBeenCalledTimes(2)
  })

  it('does not fetch for an unsupported generator or an unmounted design', () => {
    renderHook(() => useCustomDisplayAssets(nodes, false, edges))
    renderHook(() => useCustomDisplayAssets([], true, []))
    // A design left in the workspace with nothing plugged into it emits no
    // firmware, so its artwork is never fetched and can never block a build.
    const orphan = renderHook(() => useCustomDisplayAssets(nodes, true, []))
    expect(orphan.result.current.pending).toBe(false)
    expect(orphan.result.current.errors).toEqual([])
    expect(bakeCustomDisplayAssets).not.toHaveBeenCalled()
  })

  it('returns missing-document and invalid-asset errors before fetching', () => {
    useGraphStore.setState({ displayDocuments: {} })
    const missing = renderHook(() => useCustomDisplayAssets(nodes, true, edges))
    expect(missing.result.current.errors.join(' ')).toContain('screen document is missing')
    const document = documentWithArt()
    document.widgets[0].properties.assetId = 'unknown-asset'
    act(() => useGraphStore.setState({ displayDocuments: { document } }))
    expect(missing.result.current.errors.join(' ')).toContain('unknown-asset')
    expect(bakeCustomDisplayAssets).not.toHaveBeenCalled()
  })

  it.each(['show', 'player'])('reports unsupported %s wiring before baking and responds to wire-only edits', async (generator) => {
    const masterType = generator === 'player' ? 'PatternMaster' : 'PatternSlideshow'
    const showNodes = [screenNode, ...['PatternCollection', masterType, 'MatrixOutput', 'TextValue',
      ...(generator === 'player' ? ['SDCard', 'Amplifier'] : [])].map((nodeType) => ({
      ...screenNode, id: nodeType, data: { ...screenNode.data, nodeType, properties: { patternIds: ['p'] } },
    })),
    // Panel/document split: the document ('screen') needs a wired
    // TransportDisplay panel to be considered at all, the same way codegen
    // requires one now. Rotation is the panel's property now, not the
    // document's — a 240x320 panel rotated 90 degrees mounts as 320x240,
    // matching the document's default design size.
    { ...screenNode, id: 'panel', data: { ...screenNode.data, nodeType: 'TransportDisplay', properties: { partId: 'st7789v-xpt2046-touch-240x320', tftRotation: '90' } } }]
    const showEdges = [
      { id: '1', source: 'PatternCollection', sourceHandle: 'patternset', target: masterType, targetHandle: 'patternset' },
      { id: '2', source: masterType, sourceHandle: 'frame', target: 'MatrixOutput', targetHandle: 'frame' },
      // The customDisplay link stays present across the rerender below; only
      // the bad widget wire (last) gets dropped.
      { id: '3', source: 'screen', sourceHandle: 'customDisplay', target: 'panel', targetHandle: 'customDisplay' },
      { id: '4', source: 'TextValue', sourceHandle: 'text', target: 'screen', targetHandle: 'widget:deleted:value' },
    ] as StudioEdge[]
    vi.mocked(bakeCustomDisplayAssets).mockResolvedValue({ assets: [], issues: [] })
    const { result, rerender } = renderHook(({ wires }) => useCustomDisplayAssets(showNodes, true, wires), { initialProps: { wires: showEdges } })
    expect(result.current.errors.join(' ')).toContain('widget:deleted:value')
    expect(bakeCustomDisplayAssets).not.toHaveBeenCalled()
    rerender({ wires: showEdges.slice(0, 3) })
    await waitFor(() => expect(result.current.pending).toBe(false))
    expect(result.current.errors).toEqual([])
    expect(bakeCustomDisplayAssets).toHaveBeenCalledTimes(1)
  })
})
