import { useGraphStore } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'
import { asFont, DEFAULT_FONT } from '../../state/font'
import { asImage, IMAGE_MAX_DIM } from '../../state/image'
import styles from './Inspector.module.css'

function toHex(r: number, g: number, b: number) {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
}

function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function moduleCode(type: string) {
  return type
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((part) => part.slice(0, 3).toUpperCase())
    .join('-')
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

  const onImageUpload = (e: React.ChangeEvent<HTMLInputElement>, nodeId: string) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      // Downscale so the longest edge is at most IMAGE_MAX_DIM, then read pixels.
      const ratio = Math.min(1, IMAGE_MAX_DIM / Math.max(img.width, img.height))
      const w = Math.max(1, Math.round(img.width * ratio))
      const h = Math.max(1, Math.round(img.height * ratio))
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d')
      URL.revokeObjectURL(url)
      if (!ctx) { setStatus('Could not read image', 'error'); return }
      ctx.drawImage(img, 0, 0, w, h)
      const data = ctx.getImageData(0, 0, w, h).data
      const pixels: number[] = []
      const alpha: number[] = []
      let hasTransparency = false
      for (let i = 0; i < w * h; i++) {
        pixels.push(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])
        alpha.push(data[i * 4 + 3])
        if (data[i * 4 + 3] < 255) hasTransparency = true
      }
      updateNodeProperty(nodeId, 'image', hasTransparency ? { w, h, pixels, alpha } : { w, h, pixels })
      setStatus(`Loaded image (${w}×${h})`, 'success')
    }
    img.onerror = () => { URL.revokeObjectURL(url); setStatus('Could not load image', 'error') }
    img.src = url
  }

  if (!node) {
    return (
      <aside className={styles.inspector}>
        <div className={styles.header}>
          <div className={styles.headerTop}>
            <div className={styles.headerTitle}>Inspector</div>
            <div className={styles.headerMeta}>Signal inspector</div>
          </div>
          <div className={styles.headerStats}>
            <span className={styles.headerChip}>No selection</span>
          </div>
        </div>
        <div className={styles.empty}>Select a node to inspect</div>
      </aside>
    )
  }

  const props = node.data.properties as Record<string, unknown>
  const propertyEntries = Object.entries(props).filter(([key]) => key !== 'font' && key !== 'image')
  const propertyCount = propertyEntries.length + (node.data.nodeType === 'Text' ? 1 : 0) + (node.data.nodeType === 'Image' ? 1 : 0)
  const hasRGB =
    'r' in props && 'g' in props && 'b' in props &&
    typeof props.r === 'number' && typeof props.g === 'number' && typeof props.b === 'number'

  return (
    <aside className={styles.inspector}>
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <div className={styles.headerTitle}>Inspector</div>
          <div className={styles.headerMeta}>Signal inspector</div>
        </div>
        <div className={styles.headerStats}>
          <span className={styles.headerChip}>{node.data.category}</span>
          <span className={styles.headerChip}>{moduleCode(node.data.nodeType)}</span>
          <span className={styles.headerChip}>{propertyCount} fields</span>
        </div>
      </div>
      <div className={`${styles.section} ${styles.sectionCard}`}>
        <div className={styles.sectionKicker}>Selected node</div>
        <div className={styles.sectionTitle}>{node.data.label}</div>
        <div className={styles.meta}>{node.data.category}</div>
      </div>
      <div className={styles.divider} />
      <div className={`${styles.section} ${styles.sectionCard}`}>
        <div className={styles.sectionKicker}>Controls</div>
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
        {propertyEntries.map(([key, val]) =>
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
        {Object.keys(props).filter((k) => k !== 'font' && k !== 'image').length === 0 &&
          node.data.nodeType !== 'Image' && (
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
        {node.data.nodeType === 'Image' && (() => {
          const img = asImage(props.image)
          return (
            <div className={styles.fieldRow}>
              <label className={styles.fieldLabel} htmlFor="prop-image">image</label>
              <span className={styles.fieldValue}>
                {img ? `${img.w}×${img.h}` : 'none'}
                {' · '}
                <label className={styles.fontLink}>
                  upload
                  <input
                    id="prop-image"
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => onImageUpload(e, node.id)}
                  />
                </label>
                {img ? (
                  <>
                    {' · '}
                    <button className={styles.fontLink} onClick={() => updateNodeProperty(node.id, 'image', undefined)}>
                      clear
                    </button>
                  </>
                ) : null}
              </span>
            </div>
          )
        })()}
      </div>
      <div className={styles.divider} />
      <div className={`${styles.section} ${styles.sectionCard}`}>
        <div className={styles.sectionKicker}>Placement</div>
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
