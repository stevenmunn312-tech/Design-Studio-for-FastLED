import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCustomDisplayAssets } from '../useCustomDisplayAssets'
import { useGraphStore, type StudioNode } from '../../state/graphStore'
import { createDisplayDocument } from '../../state/displayEditor'
import { bakeCustomDisplayAssets, type BakedCustomDisplayAssets } from '../../utils/bakeCustomDisplayAssets'
import { customDisplayAssetRequests, type BakedCustomDisplayAsset } from '../../state/customDisplayResources'

vi.mock('../../utils/bakeCustomDisplayAssets', () => ({ bakeCustomDisplayAssets: vi.fn() }))

const nodes = [{
  id: 'screen', type: 'studioNode', position: { x: 0, y: 0 },
  data: { nodeType: 'Display', label: 'Touch panel', category: 'output',
    properties: { displayId: 'document' }, inputs: [], outputs: [] },
}] as StudioNode[]

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
    const first = renderHook(() => useCustomDisplayAssets(nodes, true))
    const second = renderHook(() => useCustomDisplayAssets(nodes, true))
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
    const { result } = renderHook(() => useCustomDisplayAssets(nodes, true))
    act(() => useGraphStore.setState({ displayDocuments: { document: documentWithArt(3) } }))
    await act(async () => current.resolve({ assets: [], issues: [] }))
    expect(result.current.pending).toBe(false)
    await act(async () => old.resolve({ assets: [], issues: [{ code: 'asset-data', message: 'Old failure' }] }))
    expect(result.current.errors).toEqual([])
    expect(result.current.documents.document.widgets[0].bounds.width).toBe(3)
  })

  it('gates I/O on trust and removes cached bytes immediately when trust is revoked', async () => {
    useGraphStore.setState({ trusted: false })
    vi.mocked(bakeCustomDisplayAssets).mockResolvedValue({ assets: [], issues: [] })
    const { result } = renderHook(() => useCustomDisplayAssets(nodes, true))
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
    const first = renderHook(() => useCustomDisplayAssets(nodes, true))
    const second = renderHook(() => useCustomDisplayAssets(nodes, true))
    await waitFor(() => expect(first.result.current.errors).toEqual(['Touch panel: HTTP 404']))
    await waitFor(() => expect(second.result.current.errors).toEqual(first.result.current.errors))
    act(() => first.result.current.retry())
    await waitFor(() => expect(first.result.current.pending).toBe(false))
    await waitFor(() => expect(second.result.current.pending).toBe(false))
    expect(first.result.current.errors).toEqual([])
    expect(second.result.current.errors).toEqual([])
    expect(bakeCustomDisplayAssets).toHaveBeenCalledTimes(2)
  })

  it('does not fetch for an unsupported generator or orphan documents', () => {
    renderHook(() => useCustomDisplayAssets(nodes, false))
    renderHook(() => useCustomDisplayAssets([], true))
    expect(bakeCustomDisplayAssets).not.toHaveBeenCalled()
  })

  it('returns missing-document and invalid-asset errors before fetching', () => {
    useGraphStore.setState({ displayDocuments: {} })
    const missing = renderHook(() => useCustomDisplayAssets(nodes, true))
    expect(missing.result.current.errors.join(' ')).toContain('screen document is missing')
    const document = documentWithArt()
    document.widgets[0].properties.assetId = 'unknown-asset'
    act(() => useGraphStore.setState({ displayDocuments: { document } }))
    expect(missing.result.current.errors.join(' ')).toContain('unknown-asset')
    expect(bakeCustomDisplayAssets).not.toHaveBeenCalled()
  })
})
