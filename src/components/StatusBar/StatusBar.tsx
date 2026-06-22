import { useUiStore } from '../../state/uiStore'
import type { StatusLevel } from '../../types'
import styles from './StatusBar.module.css'

const LEVEL_COLOR: Record<StatusLevel, string> = {
  idle: 'var(--text-secondary)',
  info: 'var(--accent-output)',
  success: 'var(--success)',
  error: 'var(--error)',
}

export default function StatusBar() {
  const { statusText, statusLevel } = useUiStore()

  return (
    <footer className={styles.statusbar}>
      <span
        className={styles.indicator}
        style={{ background: LEVEL_COLOR[statusLevel] }}
      />
      <span style={{ color: LEVEL_COLOR[statusLevel] }}>{statusText}</span>
    </footer>
  )
}
