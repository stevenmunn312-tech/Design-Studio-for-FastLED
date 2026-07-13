import { useMemo } from 'react'
import { useGraphStore } from '../../state/graphStore'
import { useUploadStore, boardByFqbn } from '../../state/uploadStore'
import { sdCardConnected } from '../../utils/showUpload'
import styles from './Upload.module.css'

export default function MatrixOutputUpload({
  nodeId,
}: {
  nodeId: string
  hasFrameInput: boolean
  hasSdCardInput: boolean
}) {
  const { nodes, edges } = useGraphStore()
  const { selectedFqbn, selectedPort, ports, openBoardPopup, openSetupWizard, openDeployPopup } = useUploadStore()

  const board = boardByFqbn(selectedFqbn)
  const portLabel = ports.find((p) => p.address === selectedPort)?.label ?? selectedPort
  const target = `${board?.label ?? 'No board'} · ${portLabel || 'no port'}`
  const matrixNode = nodes.find((n) => n.id === nodeId)
  const width = Number(matrixNode?.data.properties?.width ?? 16)
  const height = Number(matrixNode?.data.properties?.height ?? 16)
  const sdConnected = useMemo(() => sdCardConnected(nodes, edges), [nodes, edges])

  return (
    <div className={`nodrag ${styles.nodeBox}`}>
      <div className={styles.nodeHeader}>
        <span className={styles.nodeKicker}>Hardware bay</span>
        <span className={styles.nodeMeta}>{sdConnected ? `${width} × ${height} · matrix + SD pipeline` : `${width} × ${height} · matrix pipeline`}</span>
      </div>
      <div className={styles.targetLabel} title={target}>{target}</div>
      <div className={styles.nodeActionRow}>
        <button className={styles.setupBtn} onClick={openSetupWizard} title="Open the guided Matrix Output setup wizard">
          ✦ Setup...
        </button>
        <button className={styles.boardBtn} onClick={openBoardPopup} title="Choose board & port, manage boards">
          ⚙ Board...
        </button>
      </div>
      <button className={styles.uploadOpenBtn} onClick={openDeployPopup} title="Open upload, export, diagnostics, and streaming tools">
        ↑ Upload...
      </button>
    </div>
  )
}
