import { lazy, Suspense, useEffect, useRef } from 'react'
import { useUiStore } from './state/uiStore'
import { useGraphStore } from './state/graphStore'
import { useAudioStore } from './state/audioStore'
import { useShowPlayback } from './state/showPlayback'
import { AudioEngine } from './audio/audioEngine'
import MenuBar from './components/MenuBar/MenuBar'
import Sidebar from './components/Sidebar/Sidebar'
import NodeGraphCanvas from './components/Canvas/NodeGraphCanvas'
import LEDPreview from './components/Preview/LEDPreview'
import StatusBar from './components/StatusBar/StatusBar'
import { useUploadStore } from './state/uploadStore'
import { usePatternLibrary } from './state/patternLibrary'
import { useProjectStore } from './state/projectStore'
import { readSharedWorkspace, clearShareHash } from './utils/shareGraph'
import { pushSnapshot } from './state/snapshotHistory'
import { blankWorkspace, captureWorkspace } from './state/workspacePersistence'
import { nextDefaultProjectName } from './utils/projectFileIO'
import styles from './App.module.css'

const BoardPopup = lazy(() => import('./components/Upload/BoardPopup'))
const ArduinoCliPopup = lazy(() => import('./components/Upload/ArduinoCliPopup'))
const OutputConsole = lazy(() => import('./components/Upload/OutputConsole'))
const AppDialogHost = lazy(() => import('./components/AppDialog/AppDialogHost'))
const HelpModal = lazy(() => import('./components/HelpModal/HelpModal'))
const NewProjectPrompt = lazy(() => import('./components/NewProjectPrompt/NewProjectPrompt'))
const RecoverPopup = lazy(() => import('./components/Recover/RecoverPopup'))
const TemplatesPopup = lazy(() => import('./components/Templates/TemplatesPopup'))
const ProjectsPopup = lazy(() => import('./components/Projects/ProjectsPopup'))
const AUTOSAVE_INTERVAL = 10_000
const AUTOSAVE_IDLE_TIMEOUT = 2_000
const SNAPSHOT_INTERVAL = 120_000

export default function App() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen)
  const previewPanelOpen = useUiStore((s) => s.previewPanelOpen)
  const stageMode = useUiStore((s) => s.stageMode)
  const performanceMode = useUiStore((s) => s.performanceMode)
  const uiEffectsEnabled = useUiStore((s) => s.uiEffectsEnabled)
  const setStatus = useUiStore((s) => s.setStatus)
  const theme = useUiStore((s) => s.theme)
  const reducedMotion = useUiStore((s) => s.reducedMotion)
  const highContrast = useUiStore((s) => s.highContrast)
  const helpOpen = useUiStore((s) => s.helpOpen)
  const recoverOpen = useUiStore((s) => s.recoverOpen)
  const templatesOpen = useUiStore((s) => s.templatesOpen)
  const projectsOpen = useUiStore((s) => s.projectsOpen)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const togglePreviewPanel = useUiStore((s) => s.togglePreviewPanel)
  const startAudio = useAudioStore((s) => s.startAudio)
  const stopAudio = useAudioStore((s) => s.stopAudio)
  const micNodeProps = useGraphStore((s) => {
    const mic = s.nodes.find((n) => (n.data as { nodeType?: string }).nodeType === 'MicInput')
    return (mic?.data.properties as Record<string, unknown> | undefined) ?? null
  })
  const hasMicNode = micNodeProps !== null
  const showPreviewPlaying = useShowPlayback((s) => s.playing)
  const boardPopupOpen = useUploadStore((s) => s.boardPopupOpen)
  const cliPopupOpen = useUploadStore((s) => s.cliPopupOpen)
  const consoleOpen = useUploadStore((s) => s.consoleOpen)
  const refreshHelper = useUploadStore((s) => s.refreshHelper)
  const hadMicNode = useRef(false)

  // Probe the upload helper once on mount (the Vite plugin should have spawned it).
  useEffect(() => { refreshHelper() }, [refreshHelper])

  // Apply theme + accessibility attributes to the root element
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') delete root.dataset.theme
    else root.dataset.theme = theme
    if (reducedMotion || !uiEffectsEnabled) root.dataset.reducedMotion = ''
    else delete root.dataset.reducedMotion
    if (highContrast) root.dataset.highContrast = ''
    else delete root.dataset.highContrast
    if (!uiEffectsEnabled) root.dataset.uiEffects = 'off'
    else delete root.dataset.uiEffects
  }, [theme, reducedMotion, highContrast, uiEffectsEnabled])
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autosaveIdle = useRef<number | null>(null)
  const latestAutosaveState = useRef<ReturnType<typeof useGraphStore.getState> | null>(null)

  // A share link takes priority over the autosaved workspace — loading one
  // is an explicit act (someone sent you a link), so it wins over whatever
  // was left in this browser from before.
  useEffect(() => {
    let cancelled = false
    const init = async () => {
      const shared = readSharedWorkspace()
      if (shared) {
        useGraphStore.getState().loadGraph(shared.nodes, shared.edges, {
          graphData: shared.graphData,
          graphs: shared.graphs,
          activeGraphId: shared.activeGraphId,
        })
        useProjectStore.getState().saveCurrentWorkspace(shared)
        useGraphStore.temporal.getState().clear()
        clearShareHash()
        useUiStore.getState().setStatus('Graph loaded from share link', 'success')
        return
      }
      await useProjectStore.getState().refreshFromDisk()
      if (cancelled) return
      const state = useProjectStore.getState()
      const current = state.projects.find((project) => project.id === state.currentProjectId)
        ?? state.projects[0]
        ?? useProjectStore.getState().createProject(
          nextDefaultProjectName(state.projects.map((project) => project.name)),
          blankWorkspace(),
        )
      if (!current) return
      const { nodes, edges, graphData, graphs, activeGraphId } = current.workspace
      useGraphStore.getState().loadGraph(nodes, edges, { graphData, graphs, activeGraphId })
      useGraphStore.temporal.getState().clear()
    }
    void init()
    return () => { cancelled = true }
  }, [])

  // Repopulate "My Patterns" from the on-disk folder (via the upload helper),
  // migrating any localStorage-only patterns up to disk. No-op when offline.
  useEffect(() => {
    void usePatternLibrary.getState().refreshFromDisk()
  }, [])

  // Autosave every 10 seconds when graph changes
  useEffect(() => {
    const cancelQueuedAutosave = () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
      autosaveTimer.current = null
      if (autosaveIdle.current !== null) {
        if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(autosaveIdle.current)
        else window.clearTimeout(autosaveIdle.current)
        autosaveIdle.current = null
      }
    }

    const queueAutosave = () => {
      const run = () => {
        autosaveIdle.current = null
        const state = latestAutosaveState.current
        if (state) useProjectStore.getState().saveCurrentWorkspace(captureWorkspace(state))
      }
      if (typeof window.requestIdleCallback === 'function') {
        autosaveIdle.current = window.requestIdleCallback(run, { timeout: AUTOSAVE_IDLE_TIMEOUT })
      } else {
        autosaveIdle.current = window.setTimeout(run, 0)
      }
    }

    const unsub = useGraphStore.subscribe((state) => {
      latestAutosaveState.current = state
      cancelQueuedAutosave()
      autosaveTimer.current = setTimeout(() => {
        autosaveTimer.current = null
        queueAutosave()
      }, AUTOSAVE_INTERVAL)
    })
    return () => {
      unsub()
      cancelQueuedAutosave()
    }
  }, [])

  // Rolling snapshots: a safety net alongside undo, which is cleared on every
  // load/reload. Skips the tick when nothing changed since the last snapshot
  // so a quiet canvas doesn't pile up identical entries.
  const lastSnapshotRef = useRef<string>('')
  useEffect(() => {
    const timer = setInterval(() => {
      const { nodes, edges, graphData, graphs, activeGraphId } = useGraphStore.getState()
      if (nodes.length === 0) return
      const serialized = JSON.stringify({ nodes, edges, graphData, graphs, activeGraphId })
      if (serialized === lastSnapshotRef.current) return
      lastSnapshotRef.current = serialized
      pushSnapshot({ nodes, edges, graphData, graphs, activeGraphId })
    }, SNAPSHOT_INTERVAL)
    return () => clearInterval(timer)
  }, [])

  // Flush the autosave immediately when the page is hidden/closed, so a reload
  // right after an edit doesn't lose work waiting on the debounce.
  useEffect(() => {
    const flush = () => useProjectStore.getState().saveCurrentWorkspace(captureWorkspace(useGraphStore.getState()))
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  // Keep the engine's noise gate and AGC settings in sync with the MicInput node.
  useEffect(() => {
    const engine = AudioEngine.instance
    if (!micNodeProps) return
    engine.configureMic({
      gain: Number(micNodeProps.gain ?? 1),
      agc: Boolean(micNodeProps.agc ?? false),
      threshold: Number(micNodeProps.threshold ?? 0.08),
      attack: Number(micNodeProps.attack ?? 0.2),
      decay: Number(micNodeProps.decay ?? 0.05),
    })
  }, [micNodeProps])

  // A show preview owns audio while it is playing: suspend the live mic so
  // FFT/beat-driven previews reflect the baked song envelope instead.
  useEffect(() => {
    if (showPreviewPlaying) {
      if (hadMicNode.current) stopAudio()
      return
    }
    if (hasMicNode) {
      hadMicNode.current = true
      startAudio().catch(() => {})
      return
    }
    if (hadMicNode.current) {
      hadMicNode.current = false
      stopAudio()
    }
  }, [hasMicNode, showPreviewPlaying, startAudio, stopAudio])

  useEffect(() => () => {
    if (hadMicNode.current) stopAudio()
  }, [stopAudio])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Never hijack normal text editing — node property fields, the node
      // search picker, and the graph/song rename inputs all live in plain
      // <input>/<textarea> elements with no shortcut opt-out of their own.
      const el = e.target as HTMLElement | null
      const isTyping = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)

      if (e.key === 'Escape' && !isTyping) {
        if (useUiStore.getState().stageMode) {
          useUiStore.getState().setStageMode(false)
          return
        }
        if (useUiStore.getState().performanceMode) {
          useUiStore.getState().setPerformanceMode(false)
          return
        }
        useGraphStore.getState().clearSelection()
        return
      }

      if (e.key === 'F10' && !isTyping) {
        e.preventDefault()
        useUiStore.getState().toggleStageMode()
        return
      }

      if (e.key === 'F9' && !isTyping) {
        e.preventDefault()
        useUiStore.getState().togglePerformanceMode()
        return
      }

      if ((e.key === '?' || e.key === 'F1') && !isTyping) {
        e.preventDefault()
        useUiStore.getState().openHelp()
        return
      }

      const mod = e.ctrlKey || e.metaKey
      if (!mod || isTyping) return

      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        useGraphStore.temporal.getState().undo()
      }
      if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
        e.preventDefault()
        useGraphStore.temporal.getState().redo()
      }
      if (e.key === 's') {
        e.preventDefault()
        const { projects, currentProjectId } = useProjectStore.getState()
        if (projects.some((project) => project.id === currentProjectId)) {
          useProjectStore.getState().saveCurrentWorkspace(captureWorkspace(useGraphStore.getState()))
          setStatus('Project saved', 'success')
        } else {
          useUiStore.getState().openProjects()
          setStatus('No project open — create one to save into', 'info')
        }
      }
      if (e.key === 'a') {
        e.preventDefault()
        useGraphStore.getState().selectAllNodes()
      }
      if (e.key === 'c') {
        const store = useGraphStore.getState()
        const selectedCount = store.nodes.filter((n) => n.selected).length
        if (selectedCount > 1) {
          store.copySelection()
          setStatus(`${selectedCount} nodes copied`, 'info')
        } else if (store.selectedNodeId) {
          store.copyNode(store.selectedNodeId)
          setStatus('Node copied', 'info')
        }
      }
      if (e.key === 'd') {
        e.preventDefault()
        const id = useGraphStore.getState().selectedNodeId
        if (id) useGraphStore.getState().duplicateNode(id)
      }
      if (e.key === 'v') {
        const { clipboard, pasteNode } = useGraphStore.getState()
        const { viewCenter } = useUiStore.getState()
        if (clipboard) {
          pasteNode({
            x: viewCenter.x + (Math.random() - 0.5) * 80,
            y: viewCenter.y + (Math.random() - 0.5) * 80,
          })
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setStatus])

  return (
    <div className={`${styles.app} ${stageMode ? styles.appStage : ''} ${performanceMode ? styles.appPerformance : ''}`}>
      <div className={styles.menuShell}><MenuBar /></div>
      <div className={`${styles.workspace} ${stageMode ? styles.workspaceStage : ''}`}>
        <div className={styles.mainRegion}>
          <div className={`${styles.sidebarDock} ${sidebarOpen ? '' : styles.sidebarDockClosed}`}>
            <div
              className={`${styles.sidebarPanel} ${sidebarOpen ? '' : styles.sidebarPanelClosed}`}
              aria-hidden={!sidebarOpen}
              inert={!sidebarOpen}
            >
              <Sidebar />
            </div>
          </div>
          <button
            className={`${styles.sidebarHandle} ${sidebarOpen ? styles.sidebarHandleOpen : styles.sidebarHandleClosed}`}
            type="button"
            onClick={toggleSidebar}
            aria-label={sidebarOpen ? 'Hide node library' : 'Show node library'}
            aria-expanded={sidebarOpen}
            aria-controls="node-library"
            title={sidebarOpen ? 'Hide node library' : 'Show node library'}
          >
            <span className={styles.sidebarHandleArrow} aria-hidden="true">{sidebarOpen ? '‹' : '›'}</span>
          </button>
          <NodeGraphCanvas />
        </div>
        <div className={`${styles.previewDock} ${previewPanelOpen ? '' : styles.previewDockClosed}`}>
          <div
            className={`${styles.previewPanel} ${previewPanelOpen ? '' : styles.previewPanelClosed}`}
            aria-hidden={!previewPanelOpen && !stageMode}
            inert={!previewPanelOpen && !stageMode}
            id="preview-panel"
          >
            <LEDPreview />
          </div>
        </div>
        <button
          className={`${styles.previewHandle} ${previewPanelOpen ? styles.previewHandleOpen : styles.previewHandleClosed}`}
          type="button"
          onClick={togglePreviewPanel}
          aria-label={previewPanelOpen ? 'Hide LED preview' : 'Show LED preview'}
          aria-expanded={previewPanelOpen}
          aria-controls="preview-panel"
          title={previewPanelOpen ? 'Hide LED preview' : 'Show LED preview'}
        >
          <span className={styles.previewHandleArrow} aria-hidden="true">{previewPanelOpen ? '›' : '‹'}</span>
        </button>
      </div>
      <div className={styles.statusShell}><StatusBar /></div>
      <Suspense fallback={null}>
        <AppDialogHost />
        {boardPopupOpen && <BoardPopup />}
        {cliPopupOpen && <ArduinoCliPopup />}
        {consoleOpen && <OutputConsole />}
        {helpOpen && <HelpModal />}
        <NewProjectPrompt />
        {recoverOpen && <RecoverPopup />}
        {templatesOpen && <TemplatesPopup />}
        {projectsOpen && <ProjectsPopup />}
      </Suspense>
    </div>
  )
}
