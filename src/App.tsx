import { useUiStore } from './state/uiStore'
import MenuBar from './components/MenuBar/MenuBar'
import Sidebar from './components/Sidebar/Sidebar'
import NodeGraphCanvas from './components/Canvas/NodeGraphCanvas'
import LEDPreview from './components/Preview/LEDPreview'
import Inspector from './components/Inspector/Inspector'
import StatusBar from './components/StatusBar/StatusBar'
import styles from './App.module.css'

export default function App() {
  const { sidebarOpen, inspectorOpen } = useUiStore()

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
