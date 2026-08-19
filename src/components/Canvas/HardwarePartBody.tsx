import { useGraphStore } from '../../state/graphStore'
import { PART_FIELDS } from '../../state/partFields'
import styles from './BoardNodeBody.module.css'
import PartIdentity from '../Hardware/PartIdentity'

// A hardware-only part's settings, shown in the hardware view rather than on a
// graph node — these parts carry no signal, so they have no business on the
// signal canvas.
// Bespoke and small, the same shape as BoardNodeBody, because a hardware-only
// part has a handful of fields rather than the generic property list a node
// body renders.
//
// `model` exists so the graph can name the exact part. The player generator has
// always assumed a MAX98357A and nothing in the UI ever said so, which is the
// class of silent assumption naming the part is meant to end.



interface Props { nodeId: string; nodeType?: string }

export default function HardwarePartBody({ nodeId, nodeType = 'Amplifier' }: Props) {
  const updateNodeProperty = useGraphStore((s) => s.updateNodeProperty)
  const props = useGraphStore((s) => {
    const node = s.nodes.find((n) => n.id === nodeId)
    return (node?.data.properties ?? {}) as Record<string, unknown>
  })

  return (
    <div className={styles.body}>
      <PartIdentity nodeId={nodeId} nodeType={nodeType} />

      <div className={styles.detail}>
        {(PART_FIELDS[nodeType] ?? []).map((field) => (
          <label key={field.key} className={styles.row}>
            <span className={styles.key}>{field.label}</span>
            {field.kind === 'select' ? (
              <select
                className={`nodrag ${styles.picker}`}
                value={String(props[field.key] ?? field.options[0])}
                onChange={(event) => updateNodeProperty(nodeId, field.key, event.target.value)}
              >
                {field.options.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            ) : (
              <input
                className={`nodrag nowheel ${styles.picker}`}
                type="number"
                min={field.kind === 'number' ? field.min : 0}
                max={field.kind === 'number' ? field.max : undefined}
                value={Number(props[field.key] ?? 0)}
                onChange={(event) => updateNodeProperty(nodeId, field.key, Number(event.target.value))}
              />
            )}
          </label>
        ))}
      </div>
    </div>
  )
}
