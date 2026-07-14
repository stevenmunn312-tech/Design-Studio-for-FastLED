import { useEffect, useMemo } from 'react'
import { useGraphStore, getGroupRegistry } from '../../state/graphStore'
import { useUploadStore, boardByFqbn, engineReady } from '../../state/uploadStore'
import { useCapacityStore } from '../../state/capacityStore'
import { generateCpp } from '../../codegen/cppGenerator'
import { generateShowSketch, isPatternShow } from '../../codegen/showGenerator'
import { sdCardConnected } from '../../utils/showUpload'
import { summarizeCapacity } from '../../utils/capacityFormat'
import styles from './Upload.module.css'

const CAPACITY_LEVEL_CLASS = {
  ok: 'capacityOk', warn: 'capacityWarn', error: 'capacityError', pending: 'capacityPending',
} as const

export default function MatrixOutputUpload({
  nodeId,
  hasFrameInput,
}: {
  nodeId: string
  hasFrameInput: boolean
  hasSdCardInput: boolean
}) {
  const { nodes, edges } = useGraphStore()
  const { helper, installedCores, selectedFqbn, selectedPort, ports, openBoardPopup, openSetupWizard, openDeployPopup } = useUploadStore()
  const { status: capacityStatus, result: capacityResult, request: requestCapacityCheck } = useCapacityStore()

  const board = boardByFqbn(selectedFqbn)
  const portLabel = ports.find((p) => p.address === selectedPort)?.label ?? selectedPort
  const target = `${board?.label ?? 'No board'} · ${portLabel || 'no port'}`
  const matrixNode = nodes.find((n) => n.id === nodeId)
  const ownProps = (matrixNode?.data.properties ?? {}) as Record<string, unknown>
  const width = Number(ownProps.width ?? 16)
  const height = Number(ownProps.height ?? 16)
  const sdConnected = useMemo(() => sdCardConnected(nodes, edges), [nodes, edges])

  // ── Live controller-capacity meter ──────────────────────────────────────────
  // Recompiles (via the helper, compile-only) after any graph/board/engine
  // change, debounced, so users can see whether "just a few more patterns"
  // will actually fit before hitting Upload.
  const usingFbuild = helper?.engine === 'fbuild'
  const activeEngineReady = engineReady(helper)
  const coreReady = !!board && (usingFbuild || installedCores.includes(board.core))
  const toolchainReady = !!helper && activeEngineReady && coreReady
  const psramOptions = board?.psram
  const usePsram = !!psramOptions && ownProps.usePsram === true
  const psramChoice = psramOptions?.find((o) => o.id === ownProps.psramMode) ?? psramOptions?.[0]
  const fqbnWithOpt = usePsram && psramChoice ? `${selectedFqbn}:${psramChoice.opt}` : selectedFqbn

  const capacityCode = useMemo(() => {
    if (!hasFrameInput) return null
    const groups = getGroupRegistry()
    const opts = { psramAllowed: !!psramOptions }
    return isPatternShow(nodes, edges)
      ? generateShowSketch(nodes, edges, groups, opts)
      : generateCpp(nodes, edges, groups, opts)
  }, [nodes, edges, psramOptions, hasFrameInput])

  useEffect(() => {
    if (!capacityCode) return
    requestCapacityCheck(capacityCode, fqbnWithOpt, toolchainReady, helper?.engine)
  }, [capacityCode, fqbnWithOpt, toolchainReady, helper?.engine, requestCapacityCheck])

  const capacity = capacityCode ? summarizeCapacity(board, capacityStatus, capacityResult) : null

  return (
    <div className={`nodrag ${styles.nodeBox}`}>
      <div className={styles.nodeHeader}>
        <span className={styles.nodeKicker}>Hardware bay</span>
        <span className={styles.nodeMeta}>{sdConnected ? `${width} × ${height} · matrix + SD pipeline` : `${width} × ${height} · matrix pipeline`}</span>
      </div>
      <div className={styles.targetLabel} title={target}>{target}</div>
      {capacity && (
        <div
          className={`${styles.capacityLine} ${styles[CAPACITY_LEVEL_CLASS[capacity.level]]}`}
          title={
            capacityResult && !capacityResult.ok && capacityResult.log
              ? `Live controller-capacity check failed:\n${capacityResult.log.slice(-1500)}`
              : 'Live controller-capacity check — compiled against the selected board, no port needed'
          }
        >
          {capacity.text}
        </div>
      )}
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
