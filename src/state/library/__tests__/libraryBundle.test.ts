import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildLibraryBundle,
  buildLibraryLink,
  bundledPatternFromLibrary,
  clearLibraryHash,
  exportLibraryBundle,
  importLibraryBundle,
  libraryImportStatus,
  libraryLinkSizeWarning,
  parseLibraryBundle,
  readLibraryHash,
  sharedCollectionFromNode,
  sharedPaletteFromNode,
} from '../libraryBundle'
import { usePatternLibrary, withRegisteredGroups, type SavedPattern } from '../../patterns/patternLibrary'
import { BUILT_IN_PATTERN_CATEGORIES } from '../../patterns/patternLibrary'
import { clearPatternContentTrustForTests, isContentKnown, rememberContent } from '../../patterns/patternTrust'
import { ROOT_GRAPH_ID, useGraphStore } from '../../graphStore'
import type { StudioNode, StudioEdge } from '../../graphStore'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}, label = nodeType): StudioNode {
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label, nodeType, category: 'pattern', properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}
function edge(id: string, source: string, target: string): StudioEdge {
  return { id, source, target, sourceHandle: 'frame', targetHandle: 'frame' } as unknown as StudioEdge
}

function savedPattern(id: string, name: string, nodes: StudioNode[] = [node('sc', 'SolidColor')]): SavedPattern {
  return {
    id,
    name,
    createdAt: 1,
    inputs: [],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    subgraph: { nodes, edges: [] },
  }
}

const codeNode = (id: string, code: string) => node(id, 'Code', { code })

function resetStores() {
  localStorage.clear()
  clearPatternContentTrustForTests()
  usePatternLibrary.setState({ patterns: [], categories: [...BUILT_IN_PATTERN_CATEGORIES] })
  useGraphStore.setState({
    nodes: [], edges: [], selectedNodeId: null, clipboard: null,
    activeGraphId: ROOT_GRAPH_ID,
    graphs: { [ROOT_GRAPH_ID]: { id: ROOT_GRAPH_ID, name: 'Main' } },
    graphData: {},
    trusted: true,
  })
}

beforeEach(resetStores)
afterEach(() => clearLibraryHash())

describe('library bundle round trips', () => {
  it('carries a library pattern with its nested groups through file text', () => {
    useGraphStore.setState({
      graphData: {
        'group-inner': { nodes: [node('n', 'Noise')], edges: [] },
      },
    })
    const pattern = savedPattern('pat-1', 'Aurora', [
      node('g', 'Group', { groupId: 'group-inner' }, 'Inner'),
    ])
    const bundled = bundledPatternFromLibrary(pattern)
    expect(Object.keys(bundled.groups ?? {})).toEqual(['group-inner'])

    const text = exportLibraryBundle({ patterns: [bundled] })
    const parsed = parseLibraryBundle(text)
    expect(parsed.error).toBeUndefined()
    expect(parsed.bundle?.patterns?.[0]).toMatchObject({ id: 'pat-1', name: 'Aurora' })
    expect(parsed.bundle?.patterns?.[0].groups?.['group-inner'].nodes[0].id).toBe('n')

    const summary = importLibraryBundle(parsed.bundle!, { origin: 'imported' })
    expect(summary).toEqual({ patterns: 1, palettes: 0, collections: 0, renamed: [] })
    const stored = usePatternLibrary.getState().patterns.find((p) => p.id === 'pat-1')
    expect(stored?.origin).toBe('imported')
    expect(stored?.importedAt).toBeTypeOf('number')
    expect(stored?.groups?.['group-inner'].nodes[0].id).toBe('n')
  })

  it('exports a Custom Palette node and brings it back as a node on the canvas', () => {
    const palette = node('cp', 'CustomPalette', { colors: ['#ff0000', '#00ff00'], positions: [0, 1] }, 'Sunset')
    const shared = sharedPaletteFromNode(palette)
    expect(shared).toEqual({ name: 'Sunset', stops: [{ position: 0, color: '#ff0000' }, { position: 1, color: '#00ff00' }] })
    expect(sharedPaletteFromNode(node('x', 'SolidColor'))).toBeNull()

    const parsed = parseLibraryBundle(exportLibraryBundle({ palettes: [shared!] }))
    const summary = importLibraryBundle(parsed.bundle!, { origin: 'imported', position: { x: 10, y: 20 } })
    expect(summary.palettes).toBe(1)
    const added = useGraphStore.getState().nodes.find((n) => n.data.nodeType === 'CustomPalette')
    expect(added?.data.label).toBe('Sunset')
    expect(added?.data.properties).toMatchObject({ colors: ['#ff0000', '#00ff00'], positions: [0, 1] })
  })

  it('exports a Pattern Collection with its show profiles and recreates it', () => {
    usePatternLibrary.setState({ patterns: [savedPattern('pat-src', 'Comet')] })
    useGraphStore.setState({
      graphs: {
        [ROOT_GRAPH_ID]: { id: ROOT_GRAPH_ID, name: 'Main' },
        'group-a': { id: 'group-a', name: 'Comet', sourcePatternId: 'pat-src' },
        'group-b': { id: 'group-b', name: 'Ember' },
      },
      graphData: {
        'group-a': { nodes: [node('sc', 'SolidColor')], edges: [] },
        'group-b': {
          nodes: [
            node('gin', 'GroupInput', { paramId: 'speed' }),
            node('fire', 'Fire'),
            { ...node('gout', 'GroupOutput'), data: { ...node('gout', 'GroupOutput').data, inputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }] } } as StudioNode,
          ],
          edges: [edge('e1', 'fire', 'gout')],
        },
      },
      nodes: [node('coll', 'PatternCollection', {
        patternIds: ['group-a', 'group-b'],
        patternSections: { 'group-b': ['drop', 'chorus'] },
        patternWeights: { 'group-a': 4 },
        patternEnergy: { 'group-b': ['peak'] },
        patternEntry: { 'group-a': 'resume' },
      }, 'Night set')],
    })
    const collectionNode = useGraphStore.getState().nodes[0]
    const shared = sharedCollectionFromNode(collectionNode)
    expect(shared?.name).toBe('Night set')
    expect(shared?.patterns.map((p) => p.name)).toEqual(['Comet', 'Ember'])
    expect(shared?.patterns[1].outputs).toEqual([{ id: 'frame', label: 'Frame', dataType: 'frame' }])
    expect(shared?.profiles).toEqual({
      '0': { weight: 4, entry: 'resume' },
      '1': { sections: ['drop', 'chorus'], energy: ['peak'] },
    })

    // Import into an empty workspace and library.
    resetStores()
    const parsed = parseLibraryBundle(exportLibraryBundle({ collections: [shared!] }))
    expect(parsed.error).toBeUndefined()
    const summary = importLibraryBundle(parsed.bundle!, { origin: 'link', position: { x: 0, y: 0 } })
    expect(summary.collections).toBe(1)
    expect(summary.patterns).toBe(2)
    const created = useGraphStore.getState().nodes.find((n) => n.data.nodeType === 'PatternCollection')
    expect(created?.data.label).toBe('Night set')
    const props = created?.data.properties as {
      patternIds: string[]
      patternSections: Record<string, string[]>
      patternWeights: Record<string, number>
      patternEnergy: Record<string, string[]>
      patternEntry: Record<string, string>
    }
    expect(props.patternIds).toHaveLength(2)
    const [a, b] = props.patternIds
    expect(props.patternWeights).toEqual({ [a]: 4 })
    expect(props.patternEntry).toEqual({ [a]: 'resume' })
    expect(props.patternSections).toEqual({ [b]: ['drop', 'chorus'] })
    expect(props.patternEnergy).toEqual({ [b]: ['peak'] })
    expect(useGraphStore.getState().graphData[b].nodes.map((n) => n.id)).toEqual(['gin', 'fire', 'gout'])
    expect(usePatternLibrary.getState().patterns.map((p) => p.origin)).toEqual(['link', 'link'])
  })
})

describe('parseLibraryBundle', () => {
  it('reads a bare saved pattern file as a one-pattern bundle', () => {
    const parsed = parseLibraryBundle(JSON.stringify(savedPattern('pat-bare', 'Glow')))
    expect(parsed.bundle?.patterns).toHaveLength(1)
    expect(parsed.bundle?.patterns?.[0]).toMatchObject({ id: 'pat-bare', name: 'Glow' })
  })

  it('reads a community patternJson with nested groups', () => {
    const community = {
      name: 'Shared',
      subgraph: { nodes: [node('g', 'Group', { groupId: 'group-x' })], edges: [] },
      groups: { 'group-x': { nodes: [node('n', 'Noise')], edges: [] } },
    }
    const parsed = parseLibraryBundle(JSON.stringify(community))
    expect(parsed.bundle?.patterns?.[0].groups?.['group-x'].nodes).toHaveLength(1)
    expect(parsed.bundle?.patterns?.[0].id).toBeUndefined()
  })

  it('rejects text that is not a bundle, and empty bundles', () => {
    expect(parseLibraryBundle('not json').error).toBe('Not valid JSON')
    expect(parseLibraryBundle(JSON.stringify({ hello: 1 })).error).toBe('Not a library bundle or pattern file')
    expect(parseLibraryBundle(JSON.stringify({ kind: 'fastled-library', version: 1 })).error).toBe('This bundle holds nothing Studio can import')
    expect(parseLibraryBundle(JSON.stringify({ kind: 'fastled-library', version: 2, patterns: [] })).error).toMatch(/version 2/)
  })

  it('drops nodes and edges without a loadable shape', () => {
    const parsed = parseLibraryBundle(JSON.stringify({
      name: 'Partial',
      subgraph: { nodes: [node('ok', 'Noise'), { id: 'bad' }], edges: [{ source: 'ok' }] },
    }))
    expect(parsed.bundle?.patterns?.[0].subgraph.nodes.map((n) => n.id)).toEqual(['ok'])
    expect(parsed.bundle?.patterns?.[0].subgraph.edges).toEqual([])
  })
})

describe('import rules', () => {
  it('gives a pattern a fresh id when the id is taken by different content', () => {
    usePatternLibrary.setState({ patterns: [savedPattern('pat-1', 'Mine', [node('a', 'Noise')])] })
    const incoming = bundledPatternFromLibrary(savedPattern('pat-1', 'Theirs', [node('b', 'Fire')]), {})
    const summary = importLibraryBundle(buildLibraryBundle({ patterns: [incoming] }), { origin: 'imported' })
    expect(summary.patterns).toBe(1)
    expect(summary.renamed).toEqual(['Theirs'])
    const patterns = usePatternLibrary.getState().patterns
    expect(patterns).toHaveLength(2)
    expect(patterns.find((p) => p.id === 'pat-1')?.name).toBe('Mine')
    expect(patterns.find((p) => p.name === 'Theirs')?.id).not.toBe('pat-1')
    expect(libraryImportStatus(summary)).toMatch(/Imported 1 pattern\. “Theirs” kept its own copy/)
  })

  it('is a no-op for identical content, whatever id it arrives under', () => {
    const existing = savedPattern('pat-1', 'Same')
    usePatternLibrary.setState({ patterns: [existing] })
    const incoming = { ...bundledPatternFromLibrary(existing, {}), id: 'pat-other' }
    const summary = importLibraryBundle(buildLibraryBundle({ patterns: [incoming] }), { origin: 'imported' })
    expect(summary).toEqual({ patterns: 0, palettes: 0, collections: 0, renamed: [] })
    expect(usePatternLibrary.getState().patterns).toHaveLength(1)
    expect(usePatternLibrary.getState().patterns[0].origin).toBeUndefined()
    expect(libraryImportStatus(summary)).toMatch(/already holds/)
  })

  it('never remembers imported code as known content', () => {
    const incoming = bundledPatternFromLibrary(savedPattern('pat-code', 'Risky', [codeNode('c', 'leds[0] = CRGB::Red;')]), {})
    importLibraryBundle(buildLibraryBundle({ patterns: [incoming] }), { origin: 'link' })
    const stored = usePatternLibrary.getState().patterns[0]
    expect(isContentKnown(stored.subgraph.nodes)).toBe(false)
    // Dropping it on the canvas untrusts the workspace, as for any pattern.
    useGraphStore.getState().instantiatePattern(withRegisteredGroups(stored), { x: 0, y: 0 })
    expect(useGraphStore.getState().trusted).toBe(false)
  })

  it('keeps nested imported code unknown and untrusts the drop that installs it', () => {
    const incoming = {
      ...bundledPatternFromLibrary(savedPattern('pat-nested', 'Nested', [node('g', 'Group', { groupId: 'group-x' })]), {}),
      groups: { 'group-x': { nodes: [codeNode('c', 'x')], edges: [] } },
    }
    importLibraryBundle(buildLibraryBundle({ patterns: [incoming] }), { origin: 'imported' })
    const stored = usePatternLibrary.getState().patterns[0]
    expect(isContentKnown([], stored.groups)).toBe(false)
    expect(useGraphStore.getState().trusted).toBe(true)

    const prepared = withRegisteredGroups(stored)
    expect(useGraphStore.getState().trusted).toBe(false)
    const installedId = (prepared.subgraph.nodes[0].data.properties as { groupId: string }).groupId
    expect(useGraphStore.getState().graphData[installedId].nodes[0].id).toBe('c')
    useGraphStore.getState().instantiatePattern(prepared, { x: 0, y: 0 })
    expect(useGraphStore.getState().trusted).toBe(false)
  })

  it('mints fresh group ids when the workspace already uses them', () => {
    useGraphStore.setState({
      graphs: { [ROOT_GRAPH_ID]: { id: ROOT_GRAPH_ID, name: 'Main' }, 'group-x': { id: 'group-x', name: 'Mine' } },
      graphData: { 'group-x': { nodes: [node('mine', 'Noise')], edges: [] } },
    })
    const stored: SavedPattern = {
      ...savedPattern('pat-nested', 'Nested', [node('g', 'Group', { groupId: 'group-x' }, 'Theirs')]),
      groups: { 'group-x': { nodes: [node('theirs', 'Fire')], edges: [] } },
    }
    const prepared = withRegisteredGroups(stored)
    const installedId = (prepared.subgraph.nodes[0].data.properties as { groupId: string }).groupId
    expect(installedId).not.toBe('group-x')
    const state = useGraphStore.getState()
    expect(state.graphData['group-x'].nodes[0].id).toBe('mine')
    expect(state.graphData[installedId].nodes[0].id).toBe('theirs')
    expect(state.graphs[installedId].name).toBe('Theirs')
    // Ordinary nodes: nothing to distrust.
    expect(state.trusted).toBe(true)
  })

  it('leaves a pattern without nested groups untouched', () => {
    const stored = savedPattern('pat-plain', 'Plain')
    expect(withRegisteredGroups(stored)).toBe(stored)
  })

  it('keeps a known pattern trusted on drop even when it arrived by import', () => {
    const code = codeNode('c', 'known')
    rememberContent([code])
    const incoming = bundledPatternFromLibrary(savedPattern('pat-known', 'Known', [code]), {})
    importLibraryBundle(buildLibraryBundle({ patterns: [incoming] }), { origin: 'imported' })
    useGraphStore.getState().instantiatePattern(withRegisteredGroups(usePatternLibrary.getState().patterns[0]), { x: 0, y: 0 })
    expect(useGraphStore.getState().trusted).toBe(true)
  })

  it('drops a shelf the importing library does not have', () => {
    const incoming = { ...bundledPatternFromLibrary(savedPattern('pat-shelf', 'Shelved'), {}), categoryId: 'category-elsewhere' }
    importLibraryBundle(buildLibraryBundle({ patterns: [incoming] }), { origin: 'imported' })
    expect(usePatternLibrary.getState().patterns[0].categoryId).toBeUndefined()
  })
})

describe('credentials', () => {
  it('strips Wi-Fi settings from exported patterns and their nested groups', () => {
    useGraphStore.setState({
      graphData: {
        'group-net': { nodes: [node('rtc', 'RTCInput', { wifiSsid: 'home', wifiPassword: 'hunter2', source: 'ntp' })], edges: [] },
      },
    })
    const pattern = savedPattern('pat-net', 'Clock', [
      node('dmx', 'DMXInput', { wifiSsid: 'home', wifiPassword: 'hunter2', mode: 'artnet' }),
      node('g', 'Group', { groupId: 'group-net' }),
    ])
    const text = exportLibraryBundle({ patterns: [bundledPatternFromLibrary(pattern)] })
    expect(text).not.toContain('hunter2')
    expect(text).not.toContain('wifiSsid')
    expect(text).toContain('"mode": "artnet"')
    expect(text).toContain('"source": "ntp"')
  })

  it('strips them again on import, whatever the file says', () => {
    const parsed = parseLibraryBundle(JSON.stringify({
      name: 'Leaky',
      subgraph: { nodes: [node('dmx', 'DMXInput', { wifiPassword: 'hunter2' })], edges: [] },
    }))
    expect(parsed.bundle?.patterns?.[0].subgraph.nodes[0].data.properties).toEqual({})
  })
})

describe('share links', () => {
  it('encodes a bundle into a #library= hash that reads back', () => {
    const bundle = buildLibraryBundle({ patterns: [bundledPatternFromLibrary(savedPattern('pat-link', 'Linked'), {})] })
    const url = buildLibraryLink(bundle, 'https://studio.test/app?x=1')
    expect(url).toMatch(/^https:\/\/studio\.test\/app\?x=1#library=/)
    expect(libraryLinkSizeWarning(url)).toBeNull()

    const parsed = parseLibraryBundle(url)
    expect(parsed.bundle).toEqual(bundle)

    window.location.hash = url.slice(url.indexOf('#'))
    const fromHash = readLibraryHash()
    expect(fromHash?.bundle).toEqual(bundle)
    clearLibraryHash()
    expect(window.location.hash).toBe('')
    expect(readLibraryHash()).toBeNull()
  })

  it('reports a link whose payload is not a library', () => {
    expect(parseLibraryBundle('https://studio.test/#library=garbage').error).toBe('This link does not hold a library')
    expect(parseLibraryBundle('https://studio.test/#share=abc').error).toBe('This link does not hold a library')
  })

  it('warns past the size most apps carry', () => {
    expect(libraryLinkSizeWarning('x'.repeat(31 * 1024))).toMatch(/31 KB/)
  })
})
