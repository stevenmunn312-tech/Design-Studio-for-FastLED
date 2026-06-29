import { useEffect, useRef } from 'react'
import { useUiStore } from './state/uiStore'
import { useGraphStore } from './state/graphStore'
import { useAudioStore } from './state/audioStore'
import { AudioEngine } from './audio/audioEngine'
import type { StudioNode, StudioEdge, WorkspaceExtras } from './state/graphStore'
import MenuBar from './components/MenuBar/MenuBar'
import Sidebar from './components/Sidebar/Sidebar'
import NodeGraphCanvas from './components/Canvas/NodeGraphCanvas'
import LEDPreview from './components/Preview/LEDPreview'
import Inspector from './components/Inspector/Inspector'
import StatusBar from './components/StatusBar/StatusBar'
import BoardPopup from './components/Upload/BoardPopup'
import ArduinoCliPopup from './components/Upload/ArduinoCliPopup'
import OutputConsole from './components/Upload/OutputConsole'
import HelpModal from './components/HelpModal/HelpModal'
import { useUploadStore } from './state/uploadStore'
import styles from './App.module.css'

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
  const { sidebarOpen, inspectorOpen, setStatus, theme, reducedMotion, highContrast, helpOpen } = useUiStore()
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
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return

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
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setStatus])

  return (
    <div className={styles.app}>
      <MenuBar />
      <div className={styles.workspace}>
        {sidebarOpen && <Sidebar />}
        <NodeGraphCanvas />
        <div className={styles.rightPanel}>
          <LEDPreview />
          {inspectorOpen && <Inspector />}
        </div>
      </div>
      <StatusBar />
      {boardPopupOpen && <BoardPopup />}
      {cliPopupOpen && <ArduinoCliPopup />}
      {consoleOpen && <OutputConsole />}
      {helpOpen && <HelpModal />}
    </div>
  )
}
