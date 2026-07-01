import { useState } from 'react'
import { useGraphStore, ROOT_GRAPH_ID } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'
import { saveGroupToLibrary } from '../../state/patternLibrary'
import CreateGroupDialog, { type CreateGroupResult } from './CreateGroupDialog'
import styles from './GroupControls.module.css'

/**
 * Overlay for the multi-graph workspace: a breadcrumb to leave a group and a
 * "Group" button that encapsulates the current selection (ADR 0001, Phase 1).
 */
export default function GroupControls() {
  const activeGraphId = useGraphStore((s) => s.activeGraphId)
  const graphs = useGraphStore((s) => s.graphs)
  const nodes = useGraphStore((s) => s.nodes)
  const enterGraph = useGraphStore((s) => s.enterGraph)
  const createGroup = useGraphStore((s) => s.createGroup)
  const addGroupInput = useGraphStore((s) => s.addGroupInput)
  const setStatus = useUiStore((s) => s.setStatus)
  const [showDialog, setShowDialog] = useState(false)

  const inGroup = activeGraphId !== ROOT_GRAPH_ID
  const activeName = graphs[activeGraphId]?.name ?? 'Main'
  const selectedIds = nodes.filter((n) => n.selected).map((n) => n.id)

  const handleCreate = (name: string, { saveToLibrary, exposePaletteNodeIds }: CreateGroupResult) => {
    const groupId = createGroup(name, selectedIds, { saveToLibrary, exposePaletteNodeIds })
    if (saveToLibrary) saveGroupToLibrary(`groupnode-${groupId}`)
    setShowDialog(false)
    setStatus(
      `Grouped ${selectedIds.length} node(s) into “${name}”${saveToLibrary ? ' and saved to library' : ''}`,
      'success',
    )
  }

  return (
    <div className={styles.bar}>
      {inGroup ? (
        <>
          <button className={styles.back} onClick={() => enterGraph(ROOT_GRAPH_ID)}>← Main</button>
          <span className={styles.crumb}>{activeName}</span>
          <button
            className={styles.group}
            title="Add an input this pattern exposes for show modulation (energy/speed/palette role)"
            onClick={() => { addGroupInput(); setStatus('Added a group input — set its role and wire it to a knob', 'info') }}
          >
            ＋ Input
          </button>
        </>
      ) : (
        <span className={styles.crumb}>Main</span>
      )}
      {selectedIds.length > 0 && (
        <button className={styles.group} onClick={() => setShowDialog(true)}>
          ⊞ Group {selectedIds.length}
        </button>
      )}
      {showDialog && (
        <CreateGroupDialog
          selectedIds={selectedIds}
          onClose={() => setShowDialog(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  )
}
