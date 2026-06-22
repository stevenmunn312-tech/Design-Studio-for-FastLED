import { useGraphStore } from '../../state/graphStore'
import styles from './Inspector.module.css'

export default function Inspector() {
  const { nodes, selectedNodeId, updateNodeProperty } = useGraphStore()
  const node = nodes.find((n) => n.id === selectedNodeId)

  if (!node) {
    return (
      <aside className={styles.inspector}>
        <div className={styles.header}>Inspector</div>
        <div className={styles.empty}>Select a node to inspect</div>
      </aside>
    )
  }

  const props = node.data.properties as Record<string, unknown>

  return (
    <aside className={styles.inspector}>
      <div className={styles.header}>Inspector</div>
      <div className={styles.section}>
        <div className={styles.sectionTitle}>{node.data.label}</div>
        <div className={styles.meta}>{node.data.category}</div>
      </div>
      <div className={styles.divider} />
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Properties</div>
        {Object.entries(props).map(([key, val]) => (
          <div key={key} className={styles.fieldRow}>
            <label className={styles.fieldLabel} htmlFor={`prop-${key}`}>
              {key}
            </label>
            <input
              id={`prop-${key}`}
              className={styles.fieldInput}
              value={String(val)}
              onChange={(e) => {
                const raw = e.target.value
                const num = Number(raw)
                updateNodeProperty(node.id, key, isNaN(num) ? raw : num)
              }}
            />
          </div>
        ))}
        {Object.keys(props).length === 0 && (
          <div className={styles.empty}>No properties</div>
        )}
      </div>
      <div className={styles.divider} />
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Position</div>
        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>X</label>
          <span className={styles.fieldValue}>{Math.round(node.position.x)}</span>
        </div>
        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Y</label>
          <span className={styles.fieldValue}>{Math.round(node.position.y)}</span>
        </div>
      </div>
    </aside>
  )
}
