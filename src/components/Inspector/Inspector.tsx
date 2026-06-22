import { useGraphStore } from '../../state/graphStore'
import styles from './Inspector.module.css'

function toHex(r: number, g: number, b: number) {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
}

function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export default function Inspector() {
  const { nodes, selectedNodeId, updateNodeProperty, updateNodeProperties } = useGraphStore()
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
  const hasRGB =
    'r' in props && 'g' in props && 'b' in props &&
    typeof props.r === 'number' && typeof props.g === 'number' && typeof props.b === 'number'

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
        {hasRGB && (
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel} htmlFor="prop-color">Color</label>
            <input
              id="prop-color"
              type="color"
              className={styles.colorPicker}
              value={toHex(props.r as number, props.g as number, props.b as number)}
              onChange={(e) => {
                const { r, g, b } = hexToRgb(e.target.value)
                updateNodeProperties(node.id, { r, g, b })
              }}
            />
          </div>
        )}
        {Object.entries(props).map(([key, val]) =>
          key === 'formula' ? (
            <div key={key} className={styles.formulaRow}>
              <label className={styles.fieldLabel} htmlFor={`prop-${key}`}>{key}</label>
              <textarea
                id={`prop-${key}`}
                className={styles.formulaTextarea}
                value={String(val)}
                rows={3}
                spellCheck={false}
                onChange={(e) => updateNodeProperty(node.id, key, e.target.value)}
              />
            </div>
          ) : (
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
          )
        )}
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
