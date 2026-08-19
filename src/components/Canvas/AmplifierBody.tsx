import { useGraphStore } from '../../state/graphStore'
import styles from './BoardNodeBody.module.css'
import PartIdentity from '../Hardware/PartIdentity'

// The amplifier's settings, shown in the hardware view rather than on a graph
// node — it carries no signal, so it has no business on the signal canvas.
// Bespoke and small, the same shape as BoardNodeBody, because a hardware-only
// part has a handful of fields rather than the generic property list a node
// body renders.
//
// `model` exists so the graph can name the exact part. The player generator has
// always assumed a MAX98357A and nothing in the UI ever said so, which is the
// class of silent assumption naming the part is meant to end.

const PIN_FIELDS = [
  { key: 'i2sBclk', label: 'BCLK' },
  { key: 'i2sLrc', label: 'LRC / WS' },
  { key: 'i2sDout', label: 'DIN' },
] as const

interface Props { nodeId: string }

export default function AmplifierBody({ nodeId }: Props) {
  const updateNodeProperty = useGraphStore((s) => s.updateNodeProperty)
  const props = useGraphStore((s) => {
    const node = s.nodes.find((n) => n.id === nodeId)
    return (node?.data.properties ?? {}) as Record<string, unknown>
  })

  return (
    <div className={styles.body}>
      <PartIdentity nodeId={nodeId} nodeType="Amplifier" />

      <div className={styles.detail}>
        {PIN_FIELDS.map((field) => (
          <label key={field.key} className={styles.row}>
            <span className={styles.key}>{field.label}</span>
            <input
              className={`nodrag nowheel ${styles.picker}`}
              type="number"
              min={0}
              value={Number(props[field.key] ?? 0)}
              onChange={(event) => updateNodeProperty(nodeId, field.key, Number(event.target.value))}
            />
          </label>
        ))}
      </div>
    </div>
  )
}
