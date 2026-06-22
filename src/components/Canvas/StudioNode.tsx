import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { StudioNodeData } from '../../state/graphStore'
import styles from './StudioNode.module.css'

const ACCENT_VARS: Record<string, string> = {
  audio: 'var(--accent-audio)',
  pattern: 'var(--accent-pattern)',
  math: 'var(--accent-math)',
  output: 'var(--accent-output)',
  hardware: 'var(--accent-hardware)',
}

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

function StudioNode({ data, selected }: StudioNodeProps) {
  const d = data as StudioNodeData
  const accent = ACCENT_VARS[d.category] ?? 'var(--accent-output)'
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
        <Handle
          key={port.id}
          type="target"
          position={Position.Left}
          id={port.id}
          style={{ ...HANDLE_STYLE, top: handleTop(i), background: accent, boxShadow: `0 0 6px ${accent}` }}
        />
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
