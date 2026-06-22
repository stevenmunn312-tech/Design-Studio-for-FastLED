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

type StudioNodeProps = NodeProps<Node<StudioNodeData>>

function StudioNode({ data, selected }: StudioNodeProps) {
  const d = data as StudioNodeData
  const accent = ACCENT_VARS[d.category] ?? 'var(--accent-output)'

  return (
    <div
      className={styles.node}
      style={{
        boxShadow: selected ? `0 0 0 2px ${accent}, 0 0 12px ${accent}` : undefined,
      }}
    >
      <div className={styles.header} style={{ background: accent }}>
        {d.label}
      </div>
      <div className={styles.body}>
        {(d.inputs as { id: string; label: string }[]).map((port) => (
          <div key={port.id} className={styles.portRow} style={{ justifyContent: 'flex-start' }}>
            <Handle
              type="target"
              position={Position.Left}
              id={port.id}
              style={{
                top: 'auto',
                left: -6,
                position: 'relative',
                background: accent,
                boxShadow: `0 0 6px ${accent}`,
              }}
            />
            <span className={styles.portLabel}>{port.label}</span>
          </div>
        ))}
        {(d.outputs as { id: string; label: string }[]).map((port) => (
          <div key={port.id} className={styles.portRow} style={{ justifyContent: 'flex-end' }}>
            <span className={styles.portLabel}>{port.label}</span>
            <Handle
              type="source"
              position={Position.Right}
              id={port.id}
              style={{
                top: 'auto',
                right: -6,
                position: 'relative',
                background: accent,
                boxShadow: `0 0 6px ${accent}`,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export default memo(StudioNode)
