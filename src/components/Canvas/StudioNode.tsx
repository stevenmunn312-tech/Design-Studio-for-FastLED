import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { StudioNodeData } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'
import { CATEGORY_ACCENT_VAR } from '../../state/nodeLibrary'
import styles from './StudioNode.module.css'

// Must match CSS: header=32px, body padding-top=8px, row=24px, gap=4px
const HEADER_H = 32
const BODY_PAD = 8
const ROW_H = 24
const ROW_GAP = 4

const handleTop = (i: number) => HEADER_H + BODY_PAD + i * (ROW_H + ROW_GAP) + ROW_H / 2

const HANDLE_STYLE = {
  width: 12,
  height: 12,
  borderRadius: '50%',
  border: 'none',
}

type StudioNodeProps = NodeProps<Node<StudioNodeData>>

function StudioNode({ id, data, selected }: StudioNodeProps) {
  const d = data as StudioNodeData
  const sparkPortId = useUiStore((s) =>
    s.sparkPort?.nodeId === id ? (s.sparkPort?.portId ?? null) : null
  )
  const accent = CATEGORY_ACCENT_VAR[d.category] ?? 'var(--accent-output)'
  const inputs = d.inputs as { id: string; label: string }[]
  const outputs = d.outputs as { id: string; label: string }[]
  const rowCount = Math.max(inputs.length, outputs.length)

  return (
    <div
      className={styles.node}
      style={{
        boxShadow: selected ? `0 0 0 2px ${accent}, 0 0 12px ${accent}` : undefined,
      }}
    >
      {/* Handles rendered absolutely so React Flow can hit-test them correctly */}
      {inputs.map((port, i) => (
        <span key={port.id}>
          <Handle
            type="target"
            position={Position.Left}
            id={port.id}
            style={{ ...HANDLE_STYLE, top: handleTop(i), background: accent, boxShadow: `0 0 6px ${accent}` }}
          />
          {sparkPortId === port.id && (
            <span
              key={sparkPortId}
              className={styles.spark}
              style={{ top: handleTop(i), left: 0 }}
            />
          )}
        </span>
      ))}
      {outputs.map((port, i) => (
        <Handle
          key={port.id}
          type="source"
          position={Position.Right}
          id={port.id}
          style={{ ...HANDLE_STYLE, top: handleTop(i), background: accent, boxShadow: `0 0 6px ${accent}` }}
        />
      ))}

      <div className={styles.header} style={{ background: accent }}>
        {d.label}
      </div>
      <div className={styles.body}>
        {Array.from({ length: rowCount }).map((_, i) => (
          <div key={i} className={styles.portRow}>
            <span className={styles.portLabel}>{inputs[i]?.label ?? ''}</span>
            <span className={styles.portLabelRight}>{outputs[i]?.label ?? ''}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default memo(StudioNode)
