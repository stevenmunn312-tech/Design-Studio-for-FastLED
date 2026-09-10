import { useEffect, useMemo } from 'react'
import { useUpdateNodeInternals } from '@xyflow/react'
import { rootGraphEdges, rootGraphNodes, useGraphStore } from '../../state/graphStore'
import { controlChainSinks } from '../../codegen/playerDisplays'
import {
  normalizePlayerControlIds,
  playerControlFunction,
  playerControlHint,
  sensiblePlayerControls,
  type PlayerControlFunction,
} from '../../state/playerControlAssignments'
import styles from './PlayerControlsBody.module.css'

/**
 * The picker that names a control, and the rows it has already named.
 *
 * A Button Bank's row can take its name from the port it was dropped on. This
 * is the mirror of that, and the mirror does not work: a Button's output is
 * only ever `pressed`, so there is nothing on the source side to adopt. The
 * name is chosen here instead, from the functions still unassigned, and the
 * choice is what mints the port.
 */
export default function PlayerControlsBody({ nodeId }: { nodeId: string }) {
  const saved = useGraphStore((state) => {
    const node = rootGraphNodes(state).find((candidate) => candidate.id === nodeId)
    return (node?.data.properties as Record<string, unknown> | undefined)?.controls
  })
  const pending = useGraphStore((state) => (
    state.pendingControlAssignment?.nodeId === nodeId ? state.pendingControlAssignment : null
  ))
  const assign = useGraphStore((state) => state.assignPlayerControl)
  const cancel = useGraphStore((state) => state.cancelPlayerControlAssignment)
  const remove = useGraphStore((state) => state.removePlayerControlAssignment)
  const updateNodeInternals = useUpdateNodeInternals()

  const assigned = useMemo(() => normalizePlayerControlIds(saved), [saved])
  /*
   * Where this node's bundle actually goes.
   *
   * The picker filtered on type alone, so a chain that only reaches an LED
   * output still offered Play / Pause — a port that mints, wires, validates
   * and does nothing. Only recomputed while the picker is open, since it walks
   * the graph, and joined into a string so the selector stays referentially
   * stable across renders. Empty means the Controls output goes nowhere yet.
   */
  const reachable = useGraphStore((state) => {
    if (!pending) return null
    const nodes = rootGraphNodes(state)
    const byId = new Map(nodes.map((node) => [node.id, node]))
    return [...controlChainSinks(nodeId, rootGraphEdges(state) as never, byId as never)].sort().join(',')
  })
  const offered = useMemo(
    () => (pending
      ? sensiblePlayerControls(
          pending.sourceDataType,
          saved,
          new Set((reachable ? reachable.split(',') : []).filter(Boolean) as never),
        )
      : []),
    [pending, reachable, saved],
  )

  // The derived ports change with the assignment list, so React Flow has to
  // re-measure this node's handles or a fresh noodle lands on stale geometry.
  useEffect(() => updateNodeInternals(nodeId), [assigned.length, nodeId, updateNodeInternals])

  const groups = useMemo(() => {
    const byGroup = new Map<PlayerControlFunction['group'], PlayerControlFunction[]>()
    for (const entry of offered) {
      const list = byGroup.get(entry.group)
      if (list) list.push(entry)
      else byGroup.set(entry.group, [entry])
    }
    return [...byGroup.entries()]
  }, [offered])

  if (pending) {
    return (
      <div className={`nodrag ${styles.picker}`} aria-label="Choose what this control does">
        <div className={styles.pickerHead}>
          {offered.length > 0
            ? `What should this ${pending.sourceDataType === 'float' ? 'knob' : 'button'} do?`
            : 'Nothing left to assign'}
        </div>
        {offered.length === 0 && (
          <p className={styles.note}>
            {pending.sourceDataType === undefined
              ? 'That output has no type this node can take.'
              : reachable
                ? `Nothing this chain reaches takes a ${pending.sourceDataType === 'float' ? 'continuous' : 'momentary'} `
                  + 'control that is still free. Wire Controls into a Music Player, an LED output or a Pattern '
                  + 'Slideshow that wants one.'
                : `Every ${pending.sourceDataType === 'float' ? 'continuous' : 'momentary'} function is already assigned.`}
          </p>
        )}
        {groups.map(([group, entries]) => (
          <div className={styles.group} key={group}>
            <div className={styles.groupLabel}>{group}</div>
            <div className={styles.options}>
              {entries.map((entry) => (
                <button
                  type="button"
                  key={entry.id}
                  className={styles.option}
                  title={`Assign ${entry.label}`}
                  onClick={() => assign(entry.id)}
                >
                  <span>{entry.label}</span>
                  <small className={styles.optionHint}>{playerControlHint(entry)}</small>
                </button>
              ))}
            </div>
          </div>
        ))}
        <button type="button" className={styles.cancel} onClick={cancel}>
          Cancel
        </button>
      </div>
    )
  }

  if (assigned.length === 0) return null

  return (
    <div className={`nodrag ${styles.rows}`} aria-label="Assigned controls">
      {assigned.map((id) => {
        const entry = playerControlFunction(id)
        if (!entry) return null
        return (
          <div className={styles.row} key={id}>
            <span className={styles.rowLabel}>{entry.label}</span>
            <button
              type="button"
              className={styles.remove}
              aria-label={`Remove ${entry.label}`}
              title={`Remove ${entry.label} and its wire`}
              onClick={() => remove(nodeId, id)}
            >
              ✕
            </button>
          </div>
        )
      })}
    </div>
  )
}
