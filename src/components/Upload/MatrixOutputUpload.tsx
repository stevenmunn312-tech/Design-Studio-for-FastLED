import { useEffect, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGraphStore, getGroupRegistry } from '../../state/graphStore'
import { useUploadStore, boardByFqbn, engineReady } from '../../state/uploadStore'
import { useCapacityStore } from '../../state/capacityStore'
import { generateCpp } from '../../codegen/cppGenerator'
import { generateShowSketch, isPatternShow } from '../../codegen/showGenerator'
import { sdCardConnected } from '../../utils/showUpload'
import { summarizeCapacity } from '../../utils/capacityFormat'
import { useCodegenGraph } from '../../utils/codegenGraph'
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
  // This body is always mounted on the canvas, so it must not re-render on
  // unrelated store writes — it drives the live capacity check.
  const nodes = useGraphStore((s) => s.nodes)
  const edges = useGraphStore((s) => s.edges)
  const { helper, installedCores, selectedFqbn, selectedPort, ports, openSetupWizard, openDeployPopup } =
    useUploadStore(useShallow((s) => ({
      helper: s.helper,
      installedCores: s.installedCores,
      selectedFqbn: s.selectedFqbn,
      selectedPort: s.selectedPort,
      ports: s.ports,
      openSetupWizard: s.openSetupWizard,
      openDeployPopup: s.openDeployPopup,
    })))
  const capacityStatus = useCapacityStore((s) => s.status)
  const capacityResult = useCapacityStore((s) => s.result)
  const requestCapacityCheck = useCapacityStore((s) => s.request)

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

  // Keyed on the codegen-relevant graph rather than the raw arrays: React Flow
  // hands this component a fresh `nodes` array on every pointer move of a
  // drag, which used to re-run the whole sketch generator ~60×/sec for output
  // that node positions cannot affect.
  const codegenGraph = useCodegenGraph(nodes, edges)
  const capacityCode = useMemo(() => {
    if (!hasFrameInput) return null
    const groups = getGroupRegistry()
    const opts = { psramAllowed: !!psramOptions }
    return isPatternShow(codegenGraph.nodes, codegenGraph.edges)
      ? generateShowSketch(codegenGraph.nodes, codegenGraph.edges, groups, opts)
      : generateCpp(codegenGraph.nodes, codegenGraph.edges, groups, opts)
  }, [codegenGraph, psramOptions, hasFrameInput])

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
        <button className={styles.setupBtn} onClick={() => openSetupWizard(nodeId)} title="Open the guided Matrix Output setup wizard">
          ✦ Setup...
        </button>
        <button className={styles.uploadOpenBtn} onClick={() => openDeployPopup(nodeId)} title="Open upload, export, diagnostics, and streaming tools">
          ↑ Upload...
        </button>
      </div>
    </div>
  )
}
