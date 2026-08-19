import { useGraphStore } from '../../state/graphStore'
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

const PIN_FIELDS: Record<string, ReadonlyArray<{ key: string; label: string }>> = {
  Amplifier: [
    { key: 'i2sBclk', label: 'BCLK' },
    { key: 'i2sLrc', label: 'LRC / WS' },
    { key: 'i2sDout', label: 'DIN' },
  ],
  SDCard: [
    { key: 'sdCsPin', label: 'CS' },
  ],
}

interface Props { nodeId: string; nodeType?: string }

export default function AmplifierBody({ nodeId, nodeType = 'Amplifier' }: Props) {
  const updateNodeProperty = useGraphStore((s) => s.updateNodeProperty)
  const props = useGraphStore((s) => {
    const node = s.nodes.find((n) => n.id === nodeId)
    return (node?.data.properties ?? {}) as Record<string, unknown>
  })

  return (
    <div className={styles.body}>
      <PartIdentity nodeId={nodeId} nodeType={nodeType} />

      <div className={styles.detail}>
        {(PIN_FIELDS[nodeType] ?? []).map((field) => (
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
