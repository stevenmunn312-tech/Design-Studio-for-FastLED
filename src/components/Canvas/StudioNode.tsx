import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import { useGraphStore } from '../../state/graphStore'
import type { StudioNodeData } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'
import { CATEGORY_ACCENT_VAR, portColor, PROPERTY_META } from '../../state/nodeLibrary'
import { waveNodeSamples } from '../../state/wave'
import WaveScope from './WaveScope'
import ComplexWaveScope from './ComplexWaveScope'
import styles from './StudioNode.module.css'

function toHex(r: number, g: number, b: number) {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
}
function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

// Must match CSS: header=32px, body padding-top=8px, row=24px, gap=4px,
// preview scope=40px (WaveScope.module.css .scope height).
const HEADER_H = 32
const BODY_PAD = 8
const ROW_H = 24
const ROW_GAP = 4
const PREVIEW_H = 40

// Handles are absolutely positioned; a preview scope at the top of the body
// pushes the port rows down by its height + the body's flex gap.
const handleTop = (i: number, previewOffset: number) =>
  HEADER_H + BODY_PAD + previewOffset + i * (ROW_H + ROW_GAP) + ROW_H / 2

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
  const updateNodeProperty = useGraphStore((s) => s.updateNodeProperty)
  const updateNodeProperties = useGraphStore((s) => s.updateNodeProperties)
  const accent = CATEGORY_ACCENT_VAR[d.category] ?? 'var(--accent-output)'
  const inputs = d.inputs as { id: string; label: string; dataType: string }[]
  const outputs = d.outputs as { id: string; label: string; dataType: string }[]
  const rowCount = Math.max(inputs.length, outputs.length)

  // Inline property editors (Blender-style). A node with `r/g/b` shows one
  // colour swatch; `font` (an object) is left to the Inspector.
  const props = d.properties as Record<string, unknown>
  const hasRGB = ['r', 'g', 'b'].every((k) => typeof props[k] === 'number')
  const editable = Object.entries(props).filter(
    ([k]) => k !== 'font' && k !== 'image' && !(hasRGB && (k === 'r' || k === 'g' || k === 'b'))
  )

  // Waveform nodes show a scope at the top of the body; this shifts the port
  // handles below it down by the scope height + the body's flex gap. Wave's
  // scope is its own configured shape; ComplexWave's reflects live upstream.
  const isWave = d.nodeType === 'Wave'
  const isComplexWave = d.nodeType === 'ComplexWave'
  const waveSamples = isWave
    ? waveNodeSamples(String(props.waveform ?? 'sine'), Number(props.amplitude ?? 1), Number(props.frequency ?? 1), Number(props.phase ?? 0))
    : null
  const previewOffset = isWave || isComplexWave ? PREVIEW_H + ROW_GAP : 0

  return (
    <div
      className={styles.node}
      style={{
        boxShadow: selected ? `0 0 0 2px ${accent}, 0 0 12px ${accent}` : undefined,
      }}
    >
      {/* Handles rendered absolutely so React Flow can hit-test them correctly */}
      {inputs.map((port, i) => {
        const pc = portColor(port.dataType)
        return (
        <span key={port.id}>
          <Handle
            type="target"
            position={Position.Left}
            id={port.id}
            title={`${port.label} · ${port.dataType}`}
            style={{ ...HANDLE_STYLE, top: handleTop(i, previewOffset), background: pc, boxShadow: `0 0 6px ${pc}` }}
          />
          {sparkPortId === port.id && (
            <span
              key={sparkPortId}
              className={styles.spark}
              style={{ top: handleTop(i, previewOffset), left: 0 }}
            />
          )}
        </span>
        )
      })}
      {outputs.map((port, i) => {
        const pc = portColor(port.dataType)
        return (
        <Handle
          key={port.id}
          type="source"
          position={Position.Right}
          id={port.id}
          title={`${port.label} · ${port.dataType}`}
          style={{ ...HANDLE_STYLE, top: handleTop(i, previewOffset), background: pc, boxShadow: `0 0 6px ${pc}` }}
        />
        )
      })}

      <div className={styles.header} style={{ background: accent }}>
        {d.label}
      </div>
      <div className={styles.body}>
        {isWave && waveSamples && <WaveScope samples={waveSamples} />}
        {isComplexWave && <ComplexWaveScope nodeId={id} />}
        {Array.from({ length: rowCount }).map((_, i) => (
          <div key={i} className={styles.portRow}>
            <span className={styles.portLabel}>{inputs[i]?.label ?? ''}</span>
            <span className={styles.portLabelRight}>{outputs[i]?.label ?? ''}</span>
          </div>
        ))}

        {(hasRGB || editable.length > 0) && (
          <div className={styles.props}>
            {hasRGB && (
              <div className={styles.propRow}>
                <span className={styles.propKey}>color</span>
                <input
                  className={`nodrag ${styles.colorInput}`}
                  type="color"
                  value={toHex(props.r as number, props.g as number, props.b as number)}
                  onChange={(e) => updateNodeProperties(id, hexToRgb(e.target.value))}
                />
              </div>
            )}
            {editable.map(([key, val]) => {
              const meta = PROPERTY_META[key]
              return (
              <div key={key} className={styles.propRow}>
                <span className={styles.propKey} title={key}>{key}</span>
                {meta?.control === 'select' ? (
                  <select
                    className={`nodrag ${styles.propSelect}`}
                    value={String(val)}
                    onChange={(e) => updateNodeProperty(id, key, e.target.value)}
                  >
                    {meta.options.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : meta?.control === 'slider' && typeof val === 'number' ? (
                  <span className={styles.sliderWrap}>
                    <input
                      className={`nodrag nowheel ${styles.propRange}`}
                      type="range"
                      min={meta.min}
                      max={meta.max}
                      step={meta.step}
                      value={val}
                      onChange={(e) => updateNodeProperty(id, key, Number(e.target.value))}
                    />
                    <span className={styles.propVal}>{val}</span>
                  </span>
                ) : typeof val === 'boolean' ? (
                  <input
                    className="nodrag"
                    type="checkbox"
                    checked={val}
                    onChange={(e) => updateNodeProperty(id, key, e.target.checked)}
                  />
                ) : typeof val === 'number' ? (
                  <input
                    className={`nodrag nowheel ${styles.propInput}`}
                    type="number"
                    step="any"
                    value={val}
                    onChange={(e) => updateNodeProperty(id, key, e.target.value === '' ? 0 : Number(e.target.value))}
                  />
                ) : typeof val === 'string' && /^#[0-9a-f]{6}$/i.test(val) ? (
                  <input
                    className={`nodrag ${styles.colorInput}`}
                    type="color"
                    value={val}
                    onChange={(e) => updateNodeProperty(id, key, e.target.value)}
                  />
                ) : (
                  <input
                    className={`nodrag ${styles.propInput}`}
                    type="text"
                    value={String(val)}
                    onChange={(e) => updateNodeProperty(id, key, e.target.value)}
                  />
                )}
              </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default memo(StudioNode)
