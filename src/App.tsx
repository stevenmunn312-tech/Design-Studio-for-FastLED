import { lazy, Suspense, useEffect, useRef } from 'react'
import { useUiStore } from './state/uiStore'
import { useGraphStore } from './state/graphStore'
import { useAudioStore } from './state/audioStore'
import { AudioEngine } from './audio/audioEngine'
import type { StudioNode, StudioEdge, WorkspaceExtras } from './state/graphStore'
import MenuBar from './components/MenuBar/MenuBar'
import Sidebar from './components/Sidebar/Sidebar'
import NodeGraphCanvas from './components/Canvas/NodeGraphCanvas'
import LEDPreview from './components/Preview/LEDPreview'
import StatusBar from './components/StatusBar/StatusBar'
import { useUploadStore } from './state/uploadStore'
import { usePatternLibrary } from './state/patternLibrary'
import styles from './App.module.css'

const BoardPopup = lazy(() => import('./components/Upload/BoardPopup'))
const ArduinoCliPopup = lazy(() => import('./components/Upload/ArduinoCliPopup'))
const OutputConsole = lazy(() => import('./components/Upload/OutputConsole'))
const HelpModal = lazy(() => import('./components/HelpModal/HelpModal'))

const AUTOSAVE_KEY = 'fastled-studio-graph'
const AUTOSAVE_INTERVAL = 10_000

// Persist the whole multi-graph workspace, not just the active graph — the
// `graphData`/`graphs` hold every pattern-group subgraph, without which groups
// lose their preview (and codegen) on reload.
let warnedQuota = false
function saveToLocalStorage(s: ReturnType<typeof useGraphStore.getState>) {
  const { nodes, edges, graphData, graphs, activeGraphId } = s
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ nodes, edges, graphData, graphs, activeGraphId }))
    return
  } catch {
    // The full workspace didn't fit (localStorage is a shared ~5 MB budget).
    // Fall back to persisting at least the active graph so newly added nodes
    // still survive a reload — group subgraphs may drop until there's room.
  }
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ nodes, edges, activeGraphId }))
    if (!warnedQuota) {
      warnedQuota = true
      useUiStore.getState().setStatus('Storage is full — saved the main graph, but some saved patterns may not persist', 'error')
    }
  } catch {
    // Nothing fits at all — give up rather than throw out of the autosave.
  }
}

export default function App() {
  const {
    sidebarOpen,
    previewPanelOpen,
    stageMode,
    setStatus,
    theme,
    reducedMotion,
    highContrast,
    helpOpen,
    toggleSidebar,
    togglePreviewPanel,
  } = useUiStore()
  const { startAudio, stopAudio } = useAudioStore()
  const { boardPopupOpen, cliPopupOpen, consoleOpen, refreshHelper } = useUploadStore()

  // Probe the upload helper once on mount (the Vite plugin should have spawned it).
  useEffect(() => { refreshHelper() }, [refreshHelper])

  // Apply theme + accessibility attributes to the root element
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') delete root.dataset.theme
    else root.dataset.theme = theme
    if (reducedMotion) root.dataset.reducedMotion = ''
    else delete root.dataset.reducedMotion
    if (highContrast) root.dataset.highContrast = ''
    else delete root.dataset.highContrast
  }, [theme, reducedMotion, highContrast])
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Restore autosaved graph on first mount
  useEffect(() => {
    const saved = localStorage.getItem(AUTOSAVE_KEY)
    if (!saved) return
    try {
      const { nodes, edges, graphData, graphs, activeGraphId } = JSON.parse(saved) as
        { nodes: StudioNode[]; edges: StudioEdge[] } & WorkspaceExtras
      useGraphStore.getState().loadGraph(nodes, edges, { graphData, graphs, activeGraphId })
      useGraphStore.temporal.getState().clear()
    } catch {
      // corrupt data — ignore
    }
  }, [])

  // Repopulate "My Patterns" from the on-disk folder (via the upload helper),
  // migrating any localStorage-only patterns up to disk. No-op when offline.
  useEffect(() => {
    void usePatternLibrary.getState().refreshFromDisk()
  }, [])

  // Autosave every 10 seconds when graph changes
  useEffect(() => {
    const unsub = useGraphStore.subscribe((state) => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
      autosaveTimer.current = setTimeout(() => {
        saveToLocalStorage(state)
      }, AUTOSAVE_INTERVAL)
    })
    return () => {
      unsub()
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    }
  }, [])

  // Flush the autosave immediately when the page is hidden/closed, so a reload
  // right after an edit doesn't lose work waiting on the debounce.
  useEffect(() => {
    const flush = () => saveToLocalStorage(useGraphStore.getState())
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  // Auto-start audio when a MicInput node is on the canvas; stop when removed
  useEffect(() => {
    const engine = AudioEngine.instance
    let hasMic = false
    const sync = (state = useGraphStore.getState()) => {
      const mic = state.nodes.find((n) => (n.data as { nodeType?: string }).nodeType === 'MicInput')
      if (mic) {
        const props = mic.data.properties as Record<string, unknown>
        engine.configureMic({
          gain: Number(props.gain ?? 1),
          agc: Boolean(props.agc ?? false),
          threshold: Number(props.threshold ?? 0.08),
          attack: Number(props.attack ?? 0.2),
          decay: Number(props.decay ?? 0.05),
        })
      }
      const nowHas = !!mic
      if (nowHas && !hasMic) { hasMic = true; startAudio().catch(() => {}) }
      if (!nowHas && hasMic) { hasMic = false; stopAudio() }
    }
    sync()
    const unsub = useGraphStore.subscribe(sync)
    return () => {
      unsub()
      if (hasMic) stopAudio()
    }
  }, [startAudio, stopAudio])

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
        useGraphStore.getState().clearSelection()
        return
      }

      if (e.key === 'F10' && !isTyping) {
        e.preventDefault()
        useUiStore.getState().toggleStageMode()
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
        saveToLocalStorage(useGraphStore.getState())
        setStatus('Graph saved', 'success')
      }
      if (e.key === 'a') {
        e.preventDefault()
        useGraphStore.getState().selectAllNodes()
      }
      if (e.key === 'c') {
        const id = useGraphStore.getState().selectedNodeId
        if (id) {
          useGraphStore.getState().copyNode(id)
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
    <div className={`${styles.app} ${stageMode ? styles.appStage : ''}`}>
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
        {boardPopupOpen && <BoardPopup />}
        {cliPopupOpen && <ArduinoCliPopup />}
        {consoleOpen && <OutputConsole />}
        {helpOpen && <HelpModal />}
      </Suspense>
    </div>
  )
}
