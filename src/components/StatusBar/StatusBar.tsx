import { useUiStore } from '../../state/uiStore'
import { useGraphStore } from '../../state/graphStore'
import { useAudioStore } from '../../state/audioStore'
import { useUploadStore, boardByFqbn } from '../../state/uploadStore'
import type { StatusLevel } from '../../types'
import HardwareReadiness from '../Preview/HardwareReadiness'
import styles from './StatusBar.module.css'

const LEVEL_COLOR: Record<StatusLevel, string> = {
  idle: 'var(--text-secondary)',
  info: 'var(--accent-output)',
  success: 'var(--success)',
  error: 'var(--error)',
}

export default function StatusBar() {
  const { statusText, statusLevel, fps, performanceMode, stageMode } = useUiStore()
  const nodeCount = useGraphStore((s) => s.nodes.length)
  const edgeCount = useGraphStore((s) => s.edges.length)
  // "Audio" = the graph has analysis nodes; "live" = the microphone is actually
  // running. Reporting the first as the second told users a silent graph was
  // live, so the chip now distinguishes the two.
  const hasAudio = useGraphStore((s) => s.nodes.some((n) => n.data.category === 'audio' || n.data.nodeType === 'MicInput'))
  const micActive = useAudioStore((s) => s.micActive)
  const hasShow = useGraphStore((s) => s.nodes.some((n) => n.data.category === 'show'))
  const hasFrameSignal = useGraphStore((s) => {
    const terminalIds = new Set(
      s.nodes
        .filter((node) => ['MatrixOutput', 'GroupOutput'].includes(String(node.data.nodeType)))
        .map((node) => node.id),
    )
    return s.edges.some((edge) => terminalIds.has(edge.target) && edge.targetHandle === 'frame')
  })
  const selectedFqbn = useUploadStore((s) => s.selectedFqbn)
  const selectedPort = useUploadStore((s) => s.selectedPort)
  const ports = useUploadStore((s) => s.ports)

  const outputNode = useGraphStore((s) =>
    s.nodes.find((n) => n.data.nodeType === 'MatrixOutput')
  )
  const props = outputNode?.data.properties as Record<string, unknown> | undefined
  const chipset = props?.chipset as string | undefined
  const matrixWidth = Number(props?.width ?? 16)
  const matrixHeight = Number(props?.height ?? 16)
  const boardLabel = boardByFqbn(selectedFqbn)?.label
  const detectedPort = ports.find((port) => port.address === selectedPort)
  const portLabel = detectedPort?.address ?? 'Not detected'
  const displayFps = hasFrameSignal ? fps : 0

  return (
    <footer className={styles.statusbar}>
      <div className={styles.leftRail}>
        <span
          className={styles.indicator}
          style={{ background: LEVEL_COLOR[statusLevel], color: LEVEL_COLOR[statusLevel] }}
        />
        <span className={styles.modeTag}>Console</span>
        <span
          className={styles.message}
          style={{ color: LEVEL_COLOR[statusLevel] }}
          role={statusLevel === 'error' ? 'alert' : 'status'}
          aria-live={statusLevel === 'error' ? 'assertive' : 'polite'}
          aria-atomic="true"
        >
          {statusText}
        </span>
      </div>

      <div className={styles.right}>
        <HardwareReadiness compact />
        <span className={`${styles.chip} ${styles.chipStrong}`}>{nodeCount} modules</span>
        <span className={styles.chip}>{edgeCount} patches</span>
        {performanceMode && <span className={`${styles.chip} ${styles.chipAccent}`}>Performance</span>}
        {stageMode && <span className={`${styles.chip} ${styles.chipAccent}`}>Stage</span>}
        {hasAudio && (
          <span
            className={styles.chip}
            title={micActive
              ? 'Microphone is running — audio nodes are reading live input'
              : 'Audio nodes are on the canvas but the microphone is not running'}
          >
            {micActive ? 'Audio live' : 'Audio idle'}
          </span>
        )}
        {hasShow && <span className={styles.chip}>Show graph</span>}
        <span className={styles.chip}>FPS: {displayFps}</span>
        <span className={styles.chip}>Board: {boardLabel ?? 'Not selected'}</span>
        <span className={styles.chip}>Port: {portLabel}</span>
        <span className={styles.chip}>Chip: {chipset ?? 'Not selected'}</span>
        <span className={styles.chip}>Size: {matrixWidth} x {matrixHeight}</span>
      </div>
    </footer>
  )
}
