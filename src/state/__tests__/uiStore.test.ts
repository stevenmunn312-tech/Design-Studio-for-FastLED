import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { useUiStore, visibleLiveTouchScreen } from '../uiStore'

describe('uiStore.setStatus auto-clear', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useUiStore.getState().clearStatus()
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('clears an error message after 5 seconds', () => {
    useUiStore.getState().setStatus('Something broke', 'error')
    expect(useUiStore.getState().statusText).toBe('Something broke')
    expect(useUiStore.getState().statusLevel).toBe('error')

    vi.advanceTimersByTime(4999)
    expect(useUiStore.getState().statusLevel).toBe('error') // still showing

    vi.advanceTimersByTime(1)
    expect(useUiStore.getState().statusText).toBe('Ready')
    expect(useUiStore.getState().statusLevel).toBe('idle')
  })

  it('clears info and success messages after 5 seconds', () => {
    for (const level of ['info', 'success'] as const) {
      useUiStore.getState().setStatus(`msg ${level}`, level)
      vi.advanceTimersByTime(5000)
      expect(useUiStore.getState().statusLevel).toBe('idle')
    }
  })

  it('a newer message resets the timer instead of being wiped by a stale one', () => {
    useUiStore.getState().setStatus('first', 'info')
    vi.advanceTimersByTime(4000)
    useUiStore.getState().setStatus('second', 'error')

    // The first message's original 5 s deadline passes...
    vi.advanceTimersByTime(1000)
    expect(useUiStore.getState().statusText).toBe('second') // not wiped

    // ...the second message clears 5 s after it was set.
    vi.advanceTimersByTime(4000)
    expect(useUiStore.getState().statusLevel).toBe('idle')
  })

  it('sets preview style and persists the preference', () => {
    useUiStore.getState().setPreviewStyle('neon')
    expect(useUiStore.getState().previewStyle).toBe('neon')
    expect(localStorage.getItem('design-studio-for-fastled-preview-style')).toBe('"neon"')

    useUiStore.getState().setPreviewStyle('crt')
    expect(useUiStore.getState().previewStyle).toBe('crt')
    expect(localStorage.getItem('design-studio-for-fastled-preview-style')).toBe('"crt"')
  })

  it('cycles preview style and persists the next value', () => {
    useUiStore.getState().setPreviewStyle('soft')
    useUiStore.getState().cyclePreviewStyle()
    expect(useUiStore.getState().previewStyle).toBe('dreamy')
    expect(localStorage.getItem('design-studio-for-fastled-preview-style')).toBe('"dreamy"')
  })

  it('sets the spectrum visualizer and persists the preference', () => {
    useUiStore.getState().setSpectrumVisualizerMode('orbit')
    expect(useUiStore.getState().spectrumVisualizerMode).toBe('orbit')
    expect(localStorage.getItem('design-studio-for-fastled-spectrum-visualizer')).toBe('"orbit"')

    useUiStore.getState().setSpectrumVisualizerMode('auto')
    expect(useUiStore.getState().spectrumVisualizerMode).toBe('auto')
    expect(localStorage.getItem('design-studio-for-fastled-spectrum-visualizer')).toBe('"auto"')
  })

  it('persists the last start choice', () => {
    useUiStore.getState().setLastStartChoice('blank')
    expect(useUiStore.getState().lastStartChoice).toBe('blank')
    expect(localStorage.getItem('design-studio-for-fastled-last-start-choice')).toBe('"blank"')

    useUiStore.getState().setLastStartChoice('audio-spectrum')
    expect(useUiStore.getState().lastStartChoice).toBe('audio-spectrum')
    expect(localStorage.getItem('design-studio-for-fastled-last-start-choice')).toBe('"audio-spectrum"')
  })

  it('sets sidebar width, clamping and persisting, and marks the preset custom', () => {
    useUiStore.getState().setSidebarWidth(300)
    expect(useUiStore.getState().sidebarWidth).toBe(300)
    expect(useUiStore.getState().layoutPreset).toBe('custom')
    expect(localStorage.getItem('design-studio-for-fastled-sidebar-width')).toBe('300')
    expect(localStorage.getItem('design-studio-for-fastled-layout-preset')).toBe('"custom"')

    useUiStore.getState().setSidebarWidth(50)
    expect(useUiStore.getState().sidebarWidth).toBe(220)

    useUiStore.getState().setSidebarWidth(9999)
    expect(useUiStore.getState().sidebarWidth).toBe(420)
  })

  it('sets preview width, clamping and persisting, and marks the preset custom', () => {
    useUiStore.getState().setPreviewWidth(550)
    expect(useUiStore.getState().previewWidth).toBe(550)
    expect(useUiStore.getState().layoutPreset).toBe('custom')
    expect(localStorage.getItem('design-studio-for-fastled-preview-width')).toBe('550')

    useUiStore.getState().setPreviewWidth(50)
    expect(useUiStore.getState().previewWidth).toBe(320)

    useUiStore.getState().setPreviewWidth(9999)
    expect(useUiStore.getState().previewWidth).toBe(720)
  })

  it('applies a named layout preset, updating widths and open state together', () => {
    useUiStore.getState().applyLayoutPreset('preview')
    const state = useUiStore.getState()
    expect(state.layoutPreset).toBe('preview')
    expect(state.sidebarWidth).toBe(220)
    expect(state.previewWidth).toBe(640)
    expect(state.sidebarOpen).toBe(false)
    expect(state.previewPanelOpen).toBe(true)
    expect(localStorage.getItem('design-studio-for-fastled-layout-preset')).toBe('"preview"')
    expect(localStorage.getItem('design-studio-for-fastled-sidebar-width')).toBe('220')
    expect(localStorage.getItem('design-studio-for-fastled-preview-width')).toBe('640')

    useUiStore.getState().applyLayoutPreset('build')
    expect(useUiStore.getState().sidebarWidth).toBe(280)
    expect(useUiStore.getState().previewWidth).toBe(380)
    expect(useUiStore.getState().sidebarOpen).toBe(true)
  })

  it('restores panel visibility and widths independently for each workspace', () => {
    useUiStore.setState({
      workspaceMode: 'graph',
      sidebarOpen: true,
      previewPanelOpen: true,
      sidebarWidth: 280,
      previewWidth: 496,
      layoutPreset: 'custom',
      workspacePanelLayouts: {
        graph: { sidebarOpen: true, previewPanelOpen: true, sidebarWidth: 280, previewWidth: 496, layoutPreset: 'custom' },
        hardware: { sidebarOpen: true, previewPanelOpen: false, sidebarWidth: 280, previewWidth: 380, layoutPreset: 'custom' },
        upload: { sidebarOpen: true, previewPanelOpen: false, sidebarWidth: 280, previewWidth: 380, layoutPreset: 'custom' },
        build: { sidebarOpen: false, previewPanelOpen: false, sidebarWidth: 280, previewWidth: 380, layoutPreset: 'custom' },
      },
    })

    useUiStore.getState().setPreviewWidth(620)
    useUiStore.getState().toggleSidebar()

    useUiStore.getState().setWorkspaceMode('hardware')
    expect(useUiStore.getState()).toMatchObject({
      sidebarOpen: true,
      previewPanelOpen: false,
      previewWidth: 380,
    })
    useUiStore.getState().togglePreviewPanel()
    useUiStore.getState().setPreviewWidth(420)
    useUiStore.getState().toggleSidebar()

    useUiStore.getState().setWorkspaceMode('upload')
    expect(useUiStore.getState()).toMatchObject({ sidebarOpen: true, previewPanelOpen: false })
    useUiStore.getState().setWorkspaceMode('build')
    expect(useUiStore.getState()).toMatchObject({ sidebarOpen: false, previewPanelOpen: false })

    useUiStore.getState().setWorkspaceMode('graph')
    expect(useUiStore.getState()).toMatchObject({
      sidebarOpen: false,
      previewPanelOpen: true,
      previewWidth: 620,
    })

    useUiStore.getState().setWorkspaceMode('hardware')
    expect(useUiStore.getState()).toMatchObject({
      sidebarOpen: false,
      previewPanelOpen: true,
      previewWidth: 420,
    })
    expect(localStorage.getItem('design-studio-for-fastled-workspace-panel-layouts-v1')).not.toBeNull()
  })

  it('enters and exits stage mode without persisting it across sessions', () => {
    useUiStore.getState().setStageMode(false)
    useUiStore.getState().toggleStageMode()
    expect(useUiStore.getState().stageMode).toBe(true)
    useUiStore.getState().setStageMode(false)
    expect(useUiStore.getState().stageMode).toBe(false)
  })

  it('treats Perform as session-only state and does not persist the toggle', () => {
    localStorage.removeItem('design-studio-for-fastled-performance-mode')
    useUiStore.getState().setPerformanceMode(false)
    useUiStore.getState().togglePerformanceMode()

    expect(useUiStore.getState().performanceMode).toBe(true)
    expect(localStorage.getItem('design-studio-for-fastled-performance-mode')).toBeNull()

    useUiStore.getState().setPerformanceMode(false)
  })

  it('persists an explicit Signal dimming preference', () => {
    localStorage.removeItem('design-studio-for-fastled-signal-path-dim-enabled')
    useUiStore.setState({ signalPathDimEnabled: false })

    useUiStore.getState().toggleSignalPathDim()
    expect(useUiStore.getState().signalPathDimEnabled).toBe(true)
    expect(localStorage.getItem('design-studio-for-fastled-signal-path-dim-enabled')).toBe('true')

    useUiStore.getState().toggleSignalPathDim()
    expect(useUiStore.getState().signalPathDimEnabled).toBe(false)
    expect(localStorage.getItem('design-studio-for-fastled-signal-path-dim-enabled')).toBe('false')
  })

  it('persists the graph health drawer state', () => {
    localStorage.removeItem('design-studio-for-fastled-graph-health-open')
    useUiStore.setState({ graphHealthOpen: true })

    useUiStore.getState().toggleGraphHealth()
    expect(useUiStore.getState().graphHealthOpen).toBe(false)
    expect(localStorage.getItem('design-studio-for-fastled-graph-health-open')).toBe('false')

    useUiStore.getState().toggleGraphHealth()
    expect(useUiStore.getState().graphHealthOpen).toBe(true)
  })

  it('starts graph health compact while honouring an explicit saved choice', async () => {
    const key = 'design-studio-for-fastled-graph-health-open'
    localStorage.removeItem(key)
    vi.resetModules()

    let freshModule = await import('../uiStore')
    expect(freshModule.useUiStore.getState().graphHealthOpen).toBe(false)

    localStorage.setItem(key, 'true')
    vi.resetModules()
    freshModule = await import('../uiStore')
    expect(freshModule.useUiStore.getState().graphHealthOpen).toBe(true)

    localStorage.removeItem(key)
  })

  it('starts secondary previews collapsed while keeping Graph preview-first', async () => {
    const key = 'design-studio-for-fastled-workspace-panel-layouts-v1'
    localStorage.removeItem(key)
    vi.resetModules()
    const freshModule = await import('../uiStore')
    const freshStore = freshModule.useUiStore

    expect(freshStore.getState()).toMatchObject({ workspaceMode: 'graph', previewPanelOpen: true })
    for (const mode of ['hardware', 'upload', 'build'] as const) {
      freshStore.getState().setWorkspaceMode(mode)
      expect(freshStore.getState().previewPanelOpen).toBe(false)
    }

    localStorage.removeItem(key)
  })

  it('queues fit-view requests with an incrementing nonce', () => {
    useUiStore.setState({ fitViewRequest: { nonce: 0 } })

    useUiStore.getState().requestFitView(['a', 'b'])
    expect(useUiStore.getState().fitViewRequest).toEqual({ nonce: 1, nodeIds: ['a', 'b'] })

    useUiStore.getState().requestFitView()
    expect(useUiStore.getState().fitViewRequest).toEqual({ nonce: 2, nodeIds: undefined })
  })

  /* A fit request alone only moves the canvas, which is unmounted in the
     Hardware and Upload workspaces and under the display editor — so every
     reveal from outside the canvas has to bring it back first. */
  it('brings the canvas forward before framing a revealed node', () => {
    useUiStore.setState({
      workspaceMode: 'upload',
      hardwarePaneTab: 'upload',
      designWorkspaceView: { kind: 'display', displayId: 'panel-1' },
      fitViewRequest: { nonce: 3 },
    })

    useUiStore.getState().revealGraphNodes(['mic'])

    expect(useUiStore.getState()).toMatchObject({
      workspaceMode: 'graph',
      designWorkspaceView: { kind: 'graph' },
      fitViewRequest: { nonce: 4, nodeIds: ['mic'] },
    })
  })

  it('re-frames a revealed node once the canvas has measured itself', () => {
    useUiStore.setState({ workspaceMode: 'hardware', fitViewRequest: { nonce: 0 } })

    useUiStore.getState().revealGraphNodes(['mic'])
    expect(useUiStore.getState().fitViewRequest.nonce).toBe(1)

    // React Flow measures its nodes a frame after mounting; a fit computed
    // before that frames points rather than nodes and zooms to the limit.
    vi.advanceTimersToNextFrame()
    vi.advanceTimersToNextFrame()
    expect(useUiStore.getState().fitViewRequest).toEqual({ nonce: 2, nodeIds: ['mic'] })
  })

  it('navigates between graph and display authoring without persisting document data in UI state', () => {
    useUiStore.setState({
      workspaceMode: 'build',
      designWorkspaceView: { kind: 'graph' },
      fitViewRequest: { nonce: 4 },
    })

    useUiStore.getState().openDisplayWorkspace('touch-panel')
    expect(useUiStore.getState()).toMatchObject({
      workspaceMode: 'graph',
      designWorkspaceView: { kind: 'display', displayId: 'touch-panel' },
      fitViewRequest: { nonce: 5 },
    })

    useUiStore.getState().closeDisplayWorkspace()
    expect(useUiStore.getState().designWorkspaceView).toEqual({ kind: 'graph' })
    expect(useUiStore.getState().fitViewRequest.nonce).toBe(6)
  })

  it('opens the Hardware shelf on a requested module', () => {
    useUiStore.setState({
      workspaceMode: 'graph',
      hardwarePaneTab: 'upload',
      sidebarOpen: false,
      hardwareShelfTarget: null,
    })

    useUiStore.getState().openHardwareShelf('ButtonInput')
    expect(useUiStore.getState()).toMatchObject({
      workspaceMode: 'hardware',
      hardwarePaneTab: 'hardware',
      sidebarOpen: true,
      hardwareShelfTarget: 'ButtonInput',
    })

    useUiStore.getState().clearHardwareShelfTarget()
    expect(useUiStore.getState().hardwareShelfTarget).toBeNull()
  })
})

describe('preview style persistence', () => {
  afterEach(() => localStorage.clear())

  it('loads the v1 preview-style preference', async () => {
    localStorage.setItem('design-studio-for-fastled-preview-style', '"crt"')
    vi.resetModules()

    const { useUiStore: freshStore } = await import('../uiStore')

    expect(freshStore.getState().previewStyle).toBe('crt')
  })

  it('ignores the retired preview-diffusion preference', async () => {
    localStorage.setItem('design-studio-for-fastled-preview-diffusion', 'true')
    vi.resetModules()

    const { useUiStore: freshStore } = await import('../uiStore')

    expect(freshStore.getState().previewStyle).toBe('standard')
  })
})

describe('nodeFlash', () => {
  it('carries the node being asked to announce itself', () => {
    useUiStore.getState().flashNode('mic-1')
    expect(useUiStore.getState().nodeFlash.nodeId).toBe('mic-1')
  })

  it('bumps the nonce every time, so the same part can flash twice', () => {
    // Without a nonce the second click would set an unchanged value and the
    // node would sit there having already flashed once.
    useUiStore.getState().flashNode('mic-1')
    const first = useUiStore.getState().nodeFlash.nonce
    useUiStore.getState().flashNode('mic-1')
    expect(useUiStore.getState().nodeFlash.nonce).toBe(first + 1)
  })
})

/*
 * The display editor is a sub-view of Graph, not a fifth workspace. It
 * rendered on `designWorkspaceView`, and nothing cleared that — so clicking
 * **Graph** while editing a screen changed nothing at all. Same view, no
 * feedback, and everything scoped to the canvas silently went elsewhere: undo
 * most visibly, because history follows the editor while it is open, so two
 * presses appeared to do nothing and the new nodes stayed wired.
 */
describe('leaving the display editor', () => {
  const openEditor = () => {
    useUiStore.getState().openDisplayWorkspace('panel')
    expect(useUiStore.getState().designWorkspaceView).toEqual({ kind: 'display', displayId: 'panel' })
  }

  it.each(['graph', 'hardware', 'build', 'upload'] as const)('is dismissed by the %s tab', (mode) => {
    openEditor()
    const before = useUiStore.getState().fitViewRequest.nonce
    useUiStore.getState().setWorkspaceMode(mode)
    expect(useUiStore.getState().designWorkspaceView).toEqual({ kind: 'graph' })
    expect(useUiStore.getState().workspaceMode).toBe(mode)
    // The canvas it hands back to has to refit; it was never laid out.
    expect(useUiStore.getState().fitViewRequest.nonce).toBe(before + 1)
  })

  it.each([
    ['openBuildDiagram', () => useUiStore.getState().openBuildDiagram()],
    ['closeBuildDiagram', () => useUiStore.getState().closeBuildDiagram()],
    ['toggleBuildDiagram', () => useUiStore.getState().toggleBuildDiagram()],
  ])('is dismissed by %s, which sets the mode directly', (_label, act) => {
    openEditor()
    act()
    expect(useUiStore.getState().designWorkspaceView).toEqual({ kind: 'graph' })
  })

  it('leaves an already-graph view and its fit request alone', () => {
    useUiStore.getState().closeDisplayWorkspace()
    const before = useUiStore.getState().fitViewRequest.nonce
    useUiStore.getState().setWorkspaceMode('hardware')
    expect(useUiStore.getState().fitViewRequest.nonce).toBe(before)
  })

  it('opens a live touch overlay on Graph without wiping finger values', () => {
    openEditor()
    const before = useUiStore.getState().fitViewRequest.nonce
    useUiStore.getState().openLiveTouchScreen('panel')
    expect(useUiStore.getState()).toMatchObject({
      workspaceMode: 'graph',
      designWorkspaceView: { kind: 'graph' },
      liveTouchScreenDisplayId: 'panel',
    })
    expect(useUiStore.getState().fitViewRequest.nonce).toBe(before + 1)

    useUiStore.getState().openDisplayWorkspace('panel')
    expect(useUiStore.getState().designWorkspaceView).toEqual({ kind: 'display', displayId: 'panel' })
    expect(useUiStore.getState().liveTouchScreenDisplayId).toBe('panel')

    useUiStore.getState().closeLiveTouchScreen()
    expect(useUiStore.getState().liveTouchScreenDisplayId).toBeNull()
  })

  /*
   * The overlay returns with the Graph tab rather than having to be reopened,
   * so the id outlives its own visibility. Escape reads the same selector the
   * overlay renders from: asking only whether one is *open* let Escape on the
   * Hardware tab close something nobody could see, swallowing the keystroke
   * before it reached Performance mode.
   */
  it('separates a live touch screen being open from it being on screen', () => {
    openEditor()
    useUiStore.getState().openLiveTouchScreen('panel')
    expect(visibleLiveTouchScreen(useUiStore.getState())).toBe('panel')

    useUiStore.getState().setWorkspaceMode('hardware')
    expect(useUiStore.getState().liveTouchScreenDisplayId).toBe('panel')
    expect(visibleLiveTouchScreen(useUiStore.getState())).toBeNull()

    useUiStore.getState().setWorkspaceMode('graph')
    expect(visibleLiveTouchScreen(useUiStore.getState())).toBe('panel')

    // Reopening the designer hides it the same way, without forgetting it.
    useUiStore.getState().openDisplayWorkspace('panel')
    expect(visibleLiveTouchScreen(useUiStore.getState())).toBeNull()
  })
})
