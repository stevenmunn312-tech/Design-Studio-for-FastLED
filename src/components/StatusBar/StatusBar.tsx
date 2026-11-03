import { useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useUiStore } from '../../state/uiStore'
import { boardPartitionOf, ROOT_GRAPH_ID, rootGraphNodes, useGraphStore } from '../../state/graphStore'
import { boardNodesIn } from '../../build/boardPartition'
import { boardOrdinalLabel } from '../Hardware/boardSelection'
import { outputSizeLabel } from '../../state/output/ledOutputForm'
import { useAudioStore } from '../../state/audio/audioStore'
import { useUploadStore, boardByFqbn } from '../../state/upload/uploadStore'
import type { StatusLevel } from '../../types'
import { describePort } from '../../utils/portStatus'
import HardwareReadiness from '../Preview/HardwareReadiness'
import { scrollRailOnWheel, useScrollOverflow } from '../../hooks/useScrollRail'
import styles from './StatusBar.module.css'

const LEVEL_COLOR: Record<StatusLevel, string> = {
  idle: 'var(--text-secondary)',
  info: 'var(--accent-output)',
  success: 'var(--success)',
  error: 'var(--error)',
}

export default function StatusBar() {
  const { statusText, statusLevel, fps, performanceMode, setPerformanceMode } = useUiStore(useShallow((s) => ({
    statusText: s.statusText, statusLevel: s.statusLevel, fps: s.fps, performanceMode: s.performanceMode, setPerformanceMode: s.setPerformanceMode,
  })))
  const railRef = useRef<HTMLDivElement>(null)
  const railOverflow = useScrollOverflow(railRef)
  // Inside a group the counts are the group's; on the root graph of a
  // several-board project they are the active board's partition, the same
  // slice the bench, Build Diagram and Upload show.
  const activeBoardId = useUiStore((s) => s.activeBoardId)
  // Scalars only: a selector returning a fresh array re-renders the bar on
  // every store update (StatusBarRenders.test.tsx).
  const severalBoards = useGraphStore((s) => boardNodesIn(rootGraphNodes(s)).length > 1)
  const nodeCount = useGraphStore((s) => (severalBoards && s.activeGraphId === ROOT_GRAPH_ID
    ? boardPartitionOf(s, activeBoardId).nodes.length
    : s.nodes.length))
  const edgeCount = useGraphStore((s) => (severalBoards && s.activeGraphId === ROOT_GRAPH_ID
    ? boardPartitionOf(s, activeBoardId).edges.length
    : s.edges.length))
  // "Audio" = the graph has analysis nodes; "live" = the browser input is actually
  // running. Reporting the first as the second told users a silent graph was
  // live, so the chip now distinguishes the two.
  const hasAudio = useGraphStore((s) => s.nodes.some((n) => n.data.category === 'audio' || n.data.nodeType === 'Audio'))
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
  const portsScanned = useUploadStore((s) => s.portsScanned)
  const helper = useUploadStore((s) => s.helper)

  // The active board's first LED output, so the chips describe the board
  // being worked on rather than whichever output comes first in the root
  // array, and its size in the form's own terms: a 60-LED string is not
  // "16 x 16".
  const outputNode = useGraphStore((s) =>
    boardPartitionOf(s, activeBoardId).nodes.find((n) => n.data.nodeType === 'MatrixOutput'),
  )
  const props = outputNode?.data.properties as Record<string, unknown> | undefined
  const chipset = props?.chipset as string | undefined
  const sizeLabel = props ? outputSizeLabel(props) : 'No LED output'
  const boardLabel = boardByFqbn(selectedFqbn)?.label
  // "Board 2: ESP32-S3" when there are several, so the chips say whose they are.
  const boardChip = useGraphStore((s) => (severalBoards ? boardOrdinalLabel(boardNodesIn(rootGraphNodes(s)), activeBoardId) : 'Board'))
  const port = describePort({ helper, selectedPort, ports, portsScanned })
  const displayFps = hasFrameSignal ? fps : 0

  return (
    <footer className={styles.statusbar}>
      <div className={styles.leftRail}>
        <span
          className={styles.indicator}
          style={{ background: LEVEL_COLOR[statusLevel], color: LEVEL_COLOR[statusLevel] }}
        />
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

      {/* Below about 1366 px the chips outrun the bar. The rail scrolls with
          its scrollbar hidden, so a faded edge says there is more, the wheel
          scrolls it sideways, and it takes focus so the arrow keys can. */}
      <div
        ref={railRef}
        className={styles.right}
        role="group"
        aria-label="Project status"
        tabIndex={railOverflow.start || railOverflow.end ? 0 : undefined}
        data-overflow-start={railOverflow.start || undefined}
        data-overflow-end={railOverflow.end || undefined}
        onWheel={scrollRailOnWheel}
      >
        <HardwareReadiness compact />
        <span className={`${styles.chip} ${styles.chipStrong}`}>{nodeCount} {nodeCount === 1 ? 'node' : 'nodes'}</span>
        <span className={styles.chip}>{edgeCount} {edgeCount === 1 ? 'wire' : 'wires'}</span>
        {/* Focus hides the tab strip and panels, so the way out is said here,
            where the chrome that remains is. Stage hides this bar as well and
            says its exit on the preview itself. */}
        {performanceMode && (
          <button
            type="button"
            className={`${styles.chip} ${styles.chipAccent} ${styles.chipButton}`}
            onClick={() => setPerformanceMode(false)}
            title="Leave Focus view and show the editing chrome again (Esc)"
          >
            Focus view · Esc to exit
          </button>
        )}
        {hasAudio && (
          <span
            className={styles.chip}
            title={micActive
              ? 'Browser audio input is running — audio nodes are reading live input'
              : 'Audio nodes are on the canvas but the browser input is not running'}
          >
            {micActive ? 'Audio live' : 'Audio idle'}
          </span>
        )}
        {hasShow && <span className={styles.chip}>Show graph</span>}
        <span className={styles.chip}>FPS: {displayFps}</span>
        <span className={styles.chip}>{boardChip}: {boardLabel ?? 'Not selected'}</span>
        <span className={styles.chip} data-port-state={port.state} title={port.detail}>Port: {port.text}</span>
        <span className={styles.chip}>Chip: {chipset ?? 'Not selected'}</span>
        <span className={styles.chip}>Size: {sizeLabel}</span>
      </div>
    </footer>
  )
}
