import { useUiStore } from '../../state/uiStore'
import { useGraphStore } from '../../state/graphStore'
import type { StatusLevel } from '../../types'
import styles from './StatusBar.module.css'

const LEVEL_COLOR: Record<StatusLevel, string> = {
  idle: 'var(--text-secondary)',
  info: 'var(--accent-output)',
  success: 'var(--success)',
  error: 'var(--error)',
}

export default function StatusBar() {
  const { statusText, statusLevel, fps, memoryMb, performanceMode, stageMode } = useUiStore()
  const nodeCount = useGraphStore((s) => s.nodes.length)
  const edgeCount = useGraphStore((s) => s.edges.length)
  const hasAudio = useGraphStore((s) => s.nodes.some((n) => n.data.category === 'audio' || n.data.nodeType === 'MicInput'))
  const hasShow = useGraphStore((s) => s.nodes.some((n) => n.data.category === 'show'))

  const outputNode = useGraphStore((s) =>
    s.nodes.find((n) => n.data.nodeType === 'MatrixOutput')
  )
  const props = outputNode?.data.properties as Record<string, unknown> | undefined
  const chipset = props?.chipset as string | undefined
  const width   = props?.width  as number | undefined
  const height  = props?.height as number | undefined

  return (
    <footer className={styles.statusbar}>
      <div className={styles.leftRail}>
        <span
          className={styles.indicator}
          style={{ background: LEVEL_COLOR[statusLevel], color: LEVEL_COLOR[statusLevel] }}
        />
        <span className={styles.modeTag}>Console</span>
        <span className={styles.message} style={{ color: LEVEL_COLOR[statusLevel] }}>{statusText}</span>
      </div>

      <div className={styles.right}>
        <span className={`${styles.chip} ${styles.chipStrong}`}>{nodeCount} modules</span>
        <span className={styles.chip}>{edgeCount} patches</span>
        {performanceMode && <span className={`${styles.chip} ${styles.chipAccent}`}>Performance</span>}
        {stageMode && <span className={`${styles.chip} ${styles.chipAccent}`}>Stage</span>}
        {hasAudio && <span className={styles.chip}>Audio live</span>}
        {hasShow && <span className={styles.chip}>Show graph</span>}
        {chipset && (
          <span className={styles.chip}>
            Board: {chipset} {width}×{height}
          </span>
        )}
        <span className={styles.chip}>FPS: {fps}</span>
        <span className={styles.chip} title="Estimated memory used by this page, its iframes, and workers">
          Memory Used: {memoryMb === null ? 'Unavailable' : `${memoryMb} MiB`}
        </span>
      </div>
    </footer>
  )
}
