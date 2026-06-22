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
  const { statusText, statusLevel, fps } = useUiStore()

  const outputNode = useGraphStore((s) =>
    s.nodes.find((n) => n.data.nodeType === 'MatrixOutput')
  )
  const props = outputNode?.data.properties as Record<string, unknown> | undefined
  const chipset = props?.chipset as string | undefined
  const width   = props?.width  as number | undefined
  const height  = props?.height as number | undefined

  return (
    <footer className={styles.statusbar}>
      <span
        className={styles.indicator}
        style={{ background: LEVEL_COLOR[statusLevel] }}
      />
      <span style={{ color: LEVEL_COLOR[statusLevel] }}>{statusText}</span>

      <div className={styles.right}>
        {chipset && (
          <span className={styles.chip}>
            Board: {chipset} {width}×{height}
          </span>
        )}
        <span className={styles.chip}>FPS: {fps}</span>
      </div>
    </footer>
  )
}
