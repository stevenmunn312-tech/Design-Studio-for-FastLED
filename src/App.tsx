import { useEffect, useRef } from 'react'
import { useUiStore } from './state/uiStore'
import { useGraphStore } from './state/graphStore'
import { useAudioStore } from './state/audioStore'
import type { StudioNode, StudioEdge } from './state/graphStore'
import MenuBar from './components/MenuBar/MenuBar'
import Sidebar from './components/Sidebar/Sidebar'
import NodeGraphCanvas from './components/Canvas/NodeGraphCanvas'
import LEDPreview from './components/Preview/LEDPreview'
import Inspector from './components/Inspector/Inspector'
import StatusBar from './components/StatusBar/StatusBar'
import styles from './App.module.css'

const AUTOSAVE_KEY = 'fastled-studio-graph'
const AUTOSAVE_INTERVAL = 10_000

function saveToLocalStorage(nodes: StudioNode[], edges: StudioEdge[]) {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ nodes, edges }))
  } catch {
    // storage quota exceeded — skip silently
  }
}

export default function App() {
  const { sidebarOpen, inspectorOpen, setStatus } = useUiStore()
  const { startAudio, stopAudio } = useAudioStore()
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Restore autosaved graph on first mount
  useEffect(() => {
    const saved = localStorage.getItem(AUTOSAVE_KEY)
    if (!saved) return
    try {
      const { nodes, edges } = JSON.parse(saved) as { nodes: StudioNode[]; edges: StudioEdge[] }
      useGraphStore.getState().loadGraph(nodes, edges)
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
        saveToLocalStorage(state.nodes, state.edges)
      }, AUTOSAVE_INTERVAL)
    })
    return () => {
      unsub()
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    }
  }, [])

  // Auto-start audio when a MicInput node is on the canvas; stop when removed
  useEffect(() => {
    let hasMic = false
    const unsub = useGraphStore.subscribe((state) => {
      const nowHas = state.nodes.some(n => (n.data as { nodeType?: string }).nodeType === 'MicInput')
      if (nowHas && !hasMic) { hasMic = true; startAudio().catch(() => {}) }
      if (!nowHas && hasMic) { hasMic = false; stopAudio() }
    })
    return unsub
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
        const { nodes, edges } = useGraphStore.getState()
        saveToLocalStorage(nodes, edges)
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
    </div>
  )
}
