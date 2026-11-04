import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../utils/backendClient', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../utils/backendClient')>(),
  listPatterns: vi.fn(),
  savePatternToDisk: vi.fn(),
  deletePatternFromDisk: vi.fn(),
}))

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

describe('pattern library refresh from disk', () => {
  beforeAll(async () => { await import('../patternLibrary') }, 60_000)
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    localStorage.clear()
    // The module reads this flag once at load to decide whether disk sync
    // runs at all, so it is cleared before the fresh import below.
    vi.stubEnv('VITEST', '')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('keeps a pattern saved while the disk snapshot was in flight', async () => {
    const backend = await import('../../../utils/backendClient')
    let deliverSnapshot: (patterns: never[]) => void = () => {}
    vi.mocked(backend.listPatterns).mockImplementation(() => new Promise((resolve) => {
      deliverSnapshot = resolve
    }))
    vi.mocked(backend.savePatternToDisk).mockResolvedValue(true)
    vi.mocked(backend.deletePatternFromDisk).mockResolvedValue(true)
    // Entering through the graph store first evaluates the node library's
    // timing constants before the pattern library's import cycle reads them.
    await import('../../graphStore')
    const { usePatternLibrary } = await import('../patternLibrary')
    usePatternLibrary.setState({ patterns: [] })

    const refresh = usePatternLibrary.getState().refreshFromDisk()
    usePatternLibrary.getState().savePattern({
      name: 'Saved mid-refresh',
      inputs: [],
      outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
      subgraph: { nodes: [], edges: [] },
    })
    // The save's own disk write lands before the snapshot does, so it has
    // already left the sync journal by the time the merge runs.
    await flush()
    expect(backend.savePatternToDisk).toHaveBeenCalledTimes(1)
    deliverSnapshot([])
    await refresh

    const names = usePatternLibrary.getState().patterns
      .filter((pattern) => !pattern.bundled)
      .map((pattern) => pattern.name)
    expect(names).toEqual(['Saved mid-refresh'])
  })

  it('shows promoted saved patterns once and keeps their disk originals', async () => {
    const backend = await import('../../../utils/backendClient')
    await import('../../graphStore')
    const { SAVED_AUDIO_SEEDS } = await import('../bundledSavedAudioPatterns')
    const { usePatternLibrary } = await import('../patternLibrary')
    vi.mocked(backend.listPatterns).mockResolvedValue(SAVED_AUDIO_SEEDS.map((seed, index) => ({
      ...seed, id: `original-${index}`, createdAt: 1, categoryId: 'audio-reactive',
    })))
    await usePatternLibrary.getState().refreshFromDisk()

    for (const seed of SAVED_AUDIO_SEEDS) {
      const matches = usePatternLibrary.getState().patterns.filter((pattern) => pattern.name === seed.name)
      expect(matches).toHaveLength(1)
      expect(matches[0].bundled).toBe(true)
    }
    expect(backend.deletePatternFromDisk).not.toHaveBeenCalled()
    expect(backend.savePatternToDisk).not.toHaveBeenCalled()
  })
})
