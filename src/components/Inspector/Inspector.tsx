import { useGraphStore } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'
import { asFont, DEFAULT_FONT } from '../../state/font'
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
  const setStatus = useUiStore((s) => s.setStatus)
  const node = nodes.find((n) => n.id === selectedNodeId)

  const onFontUpload = (e: React.ChangeEvent<HTMLInputElement>, nodeId: string) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    file.text().then((txt) => {
      let parsed: unknown
      try { parsed = JSON.parse(txt) } catch { setStatus('Font file is not valid JSON', 'error'); return }
      const font = asFont(parsed)
      if (font === DEFAULT_FONT) { setStatus('Font JSON needs { w, h, glyphs }', 'error'); return }
      updateNodeProperty(nodeId, 'font', font)
      setStatus(`Loaded custom font (${Object.keys(font.glyphs).length} glyphs)`, 'success')
    })
  }

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
        {Object.entries(props).filter(([key]) => key !== 'font').map(([key, val]) =>
          typeof val === 'boolean' ? (
            <div key={key} className={styles.fieldRow}>
              <label className={styles.fieldLabel} htmlFor={`prop-${key}`}>{key}</label>
              <input
                id={`prop-${key}`}
                type="checkbox"
                checked={val}
                onChange={(e) => updateNodeProperty(node.id, key, e.target.checked)}
              />
            </div>
          ) : key === 'formula' ? (
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
        {Object.keys(props).filter((k) => k !== 'font').length === 0 && (
          <div className={styles.empty}>No properties</div>
        )}
        {node.data.nodeType === 'Text' && (
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel} htmlFor="prop-font">font</label>
            <span className={styles.fieldValue}>
              {props.font ? `custom ${asFont(props.font).w}×${asFont(props.font).h}` : 'built-in 3×5'}
              {' · '}
              <label className={styles.fontLink}>
                upload
                <input
                  id="prop-font"
                  type="file"
                  accept="application/json,.json"
                  style={{ display: 'none' }}
                  onChange={(e) => onFontUpload(e, node.id)}
                />
              </label>
              {props.font ? (
                <>
                  {' · '}
                  <button className={styles.fontLink} onClick={() => updateNodeProperty(node.id, 'font', undefined)}>
                    reset
                  </button>
                </>
              ) : null}
            </span>
          </div>
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
