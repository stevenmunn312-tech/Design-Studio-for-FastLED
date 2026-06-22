import { useEffect } from 'react'
import { useUiStore } from './state/uiStore'
import { useGraphStore } from './state/graphStore'
import MenuBar from './components/MenuBar/MenuBar'
import Sidebar from './components/Sidebar/Sidebar'
import NodeGraphCanvas from './components/Canvas/NodeGraphCanvas'
import LEDPreview from './components/Preview/LEDPreview'
import Inspector from './components/Inspector/Inspector'
import StatusBar from './components/StatusBar/StatusBar'
import styles from './App.module.css'

export default function App() {
  const { sidebarOpen, inspectorOpen } = useUiStore()

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
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className={styles.app}>
      <MenuBar />
      <div className={styles.workspace}>
        {sidebarOpen && <Sidebar />}
        <NodeGraphCanvas />
        <LEDPreview />
        {inspectorOpen && <Inspector />}
      </div>
      <StatusBar />
    </div>
  )
}
