import { useMemo } from 'react'
import { describeBuildMode, resolveBuildMode } from '../../state/buildMode'
import { rootGraphEdges, rootGraphNodes, useGraphStore } from '../../state/graphStore'
import { mountedCustomDisplays } from '../../state/mountedDisplays'
import { useUiStore } from '../../state/uiStore'
import styles from './CustomDisplayNodeBody.module.css'

export default function CustomDisplayNodeBody({ nodeId }: { nodeId: string }) {
  const nodes = useGraphStore(rootGraphNodes)
  const edges = useGraphStore(rootGraphEdges)
  const node = nodes.find((entry) => entry.id === nodeId)
  const displayId = String(node?.data.properties.displayId ?? nodeId)
  const document = useGraphStore((state) => state.displayDocuments[displayId])
  const openDisplayWorkspace = useUiStore((state) => state.openDisplayWorkspace)
  const mount = useMemo(() => mountedCustomDisplays(nodes, edges)
    .find((candidate) => candidate.document.id === nodeId), [edges, nodeId, nodes])
  const build = useMemo(() => describeBuildMode(resolveBuildMode(nodes, edges)), [edges, nodes])
  const canEdit = !!document && !!mount
  const editHintId = `display-edit-hint-${nodeId}`

  return (
    <div className={styles.body}>
      <div className={styles.summary}>
        <div>
          <span className={styles.label}>Panel</span>
          <span>{mount
            ? `${mount.geometry.width} × ${mount.geometry.height} · ${mount.geometry.rotation}°`
            : 'Not connected'}</span>
        </div>
        <div>
          <span className={styles.label}>Build</span>
          <span>{build.label}</span>
        </div>
      </div>
      <p className={styles.buildReason}>{build.reason}</p>
      <p className={styles.widgetCount}>
        {document?.widgets.length ?? 0} widget{document?.widgets.length === 1 ? '' : 's'}
      </p>
      <button
        type="button"
        className={`nodrag ${styles.edit}`}
        disabled={!canEdit}
        aria-describedby={!canEdit ? editHintId : undefined}
        onClick={() => { if (canEdit) openDisplayWorkspace(displayId) }}
      >
        Edit Display
      </button>
      {!canEdit && (
        <p id={editHintId} className={styles.connectHint}>
          {!mount ? 'Connect a Transport Display to edit.' : 'This screen design has no document to edit.'}
        </p>
      )}
    </div>
  )
}
