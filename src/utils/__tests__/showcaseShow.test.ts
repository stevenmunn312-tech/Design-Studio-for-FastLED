import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SHOWCASE_BOARD_PROFILE, SHOWCASE_MATRIX_SIZE, openShowcaseShow } from '../startFlow'
import { rootGraphNodes, useGraphStore } from '../../state/graphStore'
import { useMusicStore } from '../../state/player/musicStore'
import { usePlayerTransport } from '../../state/player/playerTransport'
import { useProjectStore } from '../../state/projectStore'
import { useUiStore } from '../../state/uiStore'
import { useUploadStore } from '../../state/upload/uploadStore'
import { selectedPhysicalBoardProfile } from '../../build/boards/boardProfiles'
import { blankWorkspace } from '../../state/workspacePersistence'
import { validateGraph } from '../validateGraph'

// The show the first-launch showcase plays: the Music Player starter, set up
// for the screen it is about to be shown on, with its music started.

const track = { title: 'Ethereal Pulse', durationMs: 262_000 }
const props = (nodeType: string) =>
  useGraphStore.getState().nodes.find((node) => node.data.nodeType === nodeType)?.data.properties as Record<string, unknown>

describe('the first-launch showcase show', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // The demo track is fetched in the background; the test never serves it.
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
    useMusicStore.setState({ entries: [] })
    useProjectStore.setState({ projects: [], currentProjectId: '', recentProjectIds: [] })
    // A first visit: one blank project, on whatever board is the default.
    useProjectStore.getState().createProject('New Project', blankWorkspace())
    useGraphStore.getState().loadGraph([], [])
    useUiStore.setState({ workspaceMode: 'hardware', evaluationRunning: false })
    usePlayerTransport.setState({ localTrack: null, playing: false, controlSerial: 0, controlCommand: null })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    usePlayerTransport.setState({ localTrack: null, playing: false, controlSerial: 0, controlCommand: null })
    useUiStore.setState({ evaluationRunning: true })
  })

  it('opens the Music Player on the S3 at the opener\'s size, with pins that board has', async () => {
    const started = openShowcaseShow()
    // The transport under the preview reports the track once it has loaded it.
    await vi.advanceTimersByTimeAsync(300)
    usePlayerTransport.getState().setLocalTrack(track)
    await vi.advanceTimersByTimeAsync(300)
    await expect(started).resolves.toBe(true)

    const nodes = rootGraphNodes(useGraphStore.getState())
    expect(nodes.some((node) => node.data.nodeType === 'PatternMaster')).toBe(true)
    expect(props('Board').profileId).toBe(SHOWCASE_BOARD_PROFILE)
    expect(props('MatrixOutput')).toMatchObject({ width: SHOWCASE_MATRIX_SIZE, height: SHOWCASE_MATRIX_SIZE })

    // The starter took its pins from the board that was open. Left alone, the
    // SD card sat on GPIO 23, which the S3 does not bring out, and the project
    // a first visit landed in could not be uploaded.
    const profile = selectedPhysicalBoardProfile(nodes)!
    const fqbn = profile.compatibleFqbns[0] ?? useUploadStore.getState().selectedFqbn
    const { errors } = validateGraph(nodes, useGraphStore.getState().edges, fqbn)
    expect(errors.filter((error) => /pin|gpio/i.test(error))).toEqual([])
    const sdPins = Object.entries(props('SDCard')).filter(([key]) => /pin/i.test(key)).map(([, value]) => value)
    expect(sdPins.length).toBeGreaterThan(0)
    expect(sdPins).not.toContain(23)

    // The preview evaluates at full rate, and owns the player, only like this.
    expect(useUiStore.getState().workspaceMode).toBe('graph')
    expect(useUiStore.getState().previewPanelOpen).toBe(true)
    expect(useUiStore.getState().evaluationRunning).toBe(true)

    // One press of play, for the preview's transport to act on.
    expect(usePlayerTransport.getState().controlSerial).toBe(1)
    expect(usePlayerTransport.getState().controlCommand).toMatchObject({ playPause: true, previous: false, next: false })
  })

  it('does not press play on a player that is already playing', async () => {
    usePlayerTransport.setState({ localTrack: { ...track }, playing: true } as never)
    await expect(openShowcaseShow()).resolves.toBe(true)
    expect(usePlayerTransport.getState().controlSerial).toBe(0)
  })

  it('gives up, and says why, when the demo track never loads', async () => {
    const started = openShowcaseShow()
    await vi.advanceTimersByTimeAsync(16_000)
    await expect(started).resolves.toBe(false)
    expect(usePlayerTransport.getState().controlSerial).toBe(0)
    expect(useUiStore.getState().statusText).toMatch(/demo track did not load/)
  })

  it('starts nothing when the save prompt is cancelled', async () => {
    const noise = {
      id: 'noise', type: 'studioNode', position: { x: 0, y: 0 },
      data: { label: 'Noise', nodeType: 'Noise', category: 'pattern', properties: {}, inputs: [], outputs: [] },
    }
    useGraphStore.getState().loadGraph([noise as never], [])
    const decide = useUiStore.getState().requestNewProjectDecision
    useUiStore.setState({ requestNewProjectDecision: vi.fn().mockResolvedValue('cancel') })
    try {
      await expect(openShowcaseShow()).resolves.toBe(false)
      expect(useGraphStore.getState().nodes.some((node) => node.id === 'noise')).toBe(true)
      expect(usePlayerTransport.getState().controlSerial).toBe(0)
    } finally {
      useUiStore.setState({ requestNewProjectDecision: decide })
    }
  })
})
