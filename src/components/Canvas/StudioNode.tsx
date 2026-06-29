import { memo, useMemo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import { useGraphStore } from '../../state/graphStore'
import type { StudioNodeData } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'
import { CATEGORY_ACCENT_VAR, portColor, propertyMeta, hasClampableInputs, nodeDisplayLabel, isPropertyEnabled } from '../../state/nodeLibrary'
import { waveNodeSamples } from '../../state/wave'
import WaveScope from './WaveScope'
import ComplexWaveScope from './ComplexWaveScope'
import NodePreview, { type PreviewKind } from './NodePreview'
import MusicLibraryNodeBody from './MusicLibraryNodeBody'
import FFTAnalyzerBody from './FFTAnalyzerBody'
import PerformanceGeneratorBody from './PerformanceGeneratorBody'
import PatternCollectionBody from './PatternCollectionBody'
import PatternMasterBody from './PatternMasterBody'
import MatrixOutputUpload from '../Upload/MatrixOutputUpload'
import { usePreviewStore } from '../../state/previewStore'
import { getCodeError } from '../../state/graphEvaluator'
import styles from './StudioNode.module.css'

// Shows the latest compile/runtime error from a Code node's preview evaluation.
// Subscribes to previewStore so it refreshes each eval tick (errors surface in
// near-real-time and clear once the code runs cleanly again).
function CodeError({ nodeId }: { nodeId: string }) {
  usePreviewStore((s) => s.outputs)   // re-render on each published eval pass
  const err = getCodeError(nodeId)
  if (!err) return null
  return <div className={styles.codeErr} title={err}>⚠ {err}</div>
}

function toHex(r: number, g: number, b: number) {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
}
function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

type RGB = { r: number; g: number; b: number }
function isRGB(v: unknown): v is RGB {
  return typeof v === 'object' && v !== null && 'r' in v && 'g' in v && 'b' in v
}
// Trim a live float to a readable precision for display in a disabled editor.
function showNum(n: number) {
  return Math.round(n * 1000) / 1000
}

// Must match CSS: header=32px, body padding-top=8px, row=24px, gap=4px,
// preview scope=40px (WaveScope.module.css .scope height).
const HEADER_H = 32
const BODY_PAD = 8
const ROW_H = 24
const ROW_GAP = 4
const PREVIEW_H = 40
// Body content width = --node-width (180) − 2×--space-1 (8) horizontal padding.
// Frame previews fill this width and keep the matrix aspect ratio.
const BODY_CONTENT_W = 164

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
  // Matrix dimensions (from MatrixOutput) set the frame-preview aspect ratio.
  const gridW = useGraphStore((s) => {
    const o = s.nodes.find((n) => (n.data as { nodeType?: string }).nodeType === 'MatrixOutput')
    return Math.max(1, Math.min(64, Number(o?.data.properties.width ?? 16)))
  })
  const gridH = useGraphStore((s) => {
    const o = s.nodes.find((n) => (n.data as { nodeType?: string }).nodeType === 'MatrixOutput')
    return Math.max(1, Math.min(64, Number(o?.data.properties.height ?? 16)))
  })
  const updateNodeProperty = useGraphStore((s) => s.updateNodeProperty)
  const updateNodeProperties = useGraphStore((s) => s.updateNodeProperties)
  const accent = CATEGORY_ACCENT_VAR[d.category] ?? 'var(--accent-output)'
  const inputs = d.inputs as { id: string; label: string; dataType: string }[]
  const outputs = d.outputs as { id: string; label: string; dataType: string }[]
  const rowCount = Math.max(inputs.length, outputs.length)

  // Which of this node's input ports are wired, and to which upstream port. When
  // a port is wired the evaluator ignores the matching property, so its inline
  // editor is disabled and shows the live value coming from the connection.
  // Selected as a stable string so the node only re-renders when its own wiring
  // changes; the parsed source map feeds the live-value lookup below.
  const incomingKey = useGraphStore((s) => {
    let k = ''
    for (const e of s.edges)
      if (e.target === id && e.targetHandle && e.source && e.sourceHandle)
        k += `${e.targetHandle}>${e.source}:${e.sourceHandle};`
    return k
  })
  const sourceMap = useMemo(() => {
    const m = new Map<string, { srcId: string; srcPort: string }>()
    for (const part of incomingKey.split(';').filter(Boolean)) {
      const [handle, rest] = part.split('>')
      const [srcId, srcPort] = rest.split(':')
      m.set(handle, { srcId, srcPort })
    }
    return m
  }, [incomingKey])
  // Port id matching a property key drives that property (evaluator convention);
  // the `paletteIn` port drives the `palette` property, and the `color` port
  // drives the `r/g/b` swatch.
  const portFor = (propKey: string) => (propKey === 'palette' ? 'paletteIn' : propKey)
  const drivenBy = (propKey: string) => sourceMap.has(portFor(propKey))

  // Live upstream values for this node's wired inputs, pulled from the shared
  // evaluation pass (previewStore). Serialised so the node re-renders only when
  // one of its own driven values changes. Frames (2D arrays) aren't shown in
  // inline editors, so they're skipped to keep the payload small.
  const liveJson = usePreviewStore((s) => {
    if (sourceMap.size === 0) return ''
    const o: Record<string, unknown> = {}
    for (const [handle, src] of sourceMap) {
      const v = s.outputs.get(src.srcId)?.[src.srcPort]
      if (v === undefined || v === null) continue
      if (Array.isArray(v) && Array.isArray((v as unknown[])[0])) continue
      o[handle] = v
    }
    return JSON.stringify(o)
  })
  const liveValues = useMemo<Record<string, unknown>>(
    () => (liveJson ? JSON.parse(liveJson) : {}),
    [liveJson]
  )
  const liveFor = (propKey: string): unknown => liveValues[portFor(propKey)]

  // Inline property editors (Blender-style). A node with `r/g/b` shows one
  // colour swatch; `font` (an object) is left to the Inspector.
  const props = d.properties as Record<string, unknown>
  const hasRGB = ['r', 'g', 'b'].every((k) => typeof props[k] === 'number')
  const editable = Object.entries(props).filter(
    ([k]) => k !== 'font' && k !== 'image' && k !== 'code' && k !== 'globalCode' && k !== 'clampInputs' && k !== 'patternIds' && k !== 'transitions'
      && !(hasRGB && (k === 'r' || k === 'g' || k === 'b'))
  )
  // The "clamp inputs" toggle is rendered specially (it has no entry in the
  // node's default properties); show it only where it would do something.
  const showClamp = hasClampableInputs(d.nodeType, inputs)

  // Waveform nodes show a scope at the top of the body; this shifts the port
  // handles below it down by the scope height + the body's flex gap. Wave's
  // scope is its own configured shape; ComplexWave's reflects live upstream.
  const isWave = d.nodeType === 'Wave'
  const isComplexWave = d.nodeType === 'ComplexWave'
  const waveSamples = isWave
    ? waveNodeSamples(String(props.waveform ?? 'sine'), Number(props.amplitude ?? 1), Number(props.frequency ?? 1), Number(props.phase ?? 0))
    : null
  // Frame / palette / colour nodes show a live preview of their primary output,
  // driven from the shared evaluation pass (previewStore).
  const outPort = outputs[0]
  const previewKind: PreviewKind | null =
    !isWave && !isComplexWave && outPort
      ? outPort.dataType === 'frame' ? 'frame'
      : outPort.dataType === 'palette' ? 'palette'
      : outPort.dataType === 'color' ? 'color'
      : null
      : null
  // Frame previews fill the node width at the matrix aspect ratio; palette /
  // colour / wave previews use the fixed scope height.
  const framePreviewH = Math.round((BODY_CONTENT_W * gridH) / gridW)
  const previewH = previewKind === 'frame' ? framePreviewH : PREVIEW_H
  const previewOffset = isWave || isComplexWave || previewKind ? previewH + ROW_GAP : 0

  // The MusicLibrary node embeds the full library UI in its body, so it needs a
  // wider frame than the default node width.
  const isMusicLibrary = d.nodeType === 'MusicLibrary'
  // The Code node embeds a multi-line C++ editor, so it needs a wider frame.
  const isCode = d.nodeType === 'Code'
  // The Performance Generator embeds a show-preview player (canvas + transport).
  const isPerfGen = d.nodeType === 'PerformanceGenerator'

  return (
    <div
      className={styles.node}
      style={{
        width: isMusicLibrary ? 300 : isCode ? 320 : isPerfGen ? 300 : undefined,
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
        {nodeDisplayLabel(d.nodeType, props, d.label)}
      </div>
      <div className={styles.body}>
        {isWave && waveSamples && <WaveScope samples={waveSamples} />}
        {isComplexWave && <ComplexWaveScope nodeId={id} />}
        {previewKind && outPort && (
          <NodePreview nodeId={id} kind={previewKind} port={outPort.id} height={previewKind === 'frame' ? framePreviewH : undefined} />
        )}
        {Array.from({ length: rowCount }).map((_, i) => (
          <div key={i} className={styles.portRow}>
            <span className={styles.portLabel}>{inputs[i]?.label ?? ''}</span>
            <span className={styles.portLabelRight}>{outputs[i]?.label ?? ''}</span>
          </div>
        ))}

        {d.nodeType === 'MusicLibrary' && <MusicLibraryNodeBody nodeId={id} />}

        {d.nodeType === 'FFTAnalyzer' && <FFTAnalyzerBody nodeId={id} bands={Number(props.bands ?? 24)} />}

        {d.nodeType === 'PerformanceGenerator' && <PerformanceGeneratorBody nodeId={id} />}

        {d.nodeType === 'PatternCollection' && <PatternCollectionBody nodeId={id} />}

        {d.nodeType === 'PatternMaster' && <PatternMasterBody nodeId={id} />}

        {d.nodeType === 'MatrixOutput' && <MatrixOutputUpload enabled={drivenBy('frame')} />}

        {isCode && (
          <>
            <div className={styles.codeLabel}>Global</div>
            <textarea
              className={`nodrag nowheel ${styles.codeEditor}`}
              style={{ minHeight: 56 }}
              spellCheck={false}
              value={String(props.globalCode ?? '')}
              placeholder="// file scope: helpers, palettes, persistent vars"
              onChange={(e) => updateNodeProperty(id, 'globalCode', e.target.value)}
            />
            <div className={styles.codeLabel}>Loop</div>
            <textarea
              className={`nodrag nowheel ${styles.codeEditor}`}
              spellCheck={false}
              value={String(props.code ?? '')}
              placeholder="// loop body — runs each frame, writes into leds[]"
              onChange={(e) => updateNodeProperty(id, 'code', e.target.value)}
            />
            <CodeError nodeId={id} />
          </>
        )}

        {(hasRGB || editable.length > 0 || showClamp) && (
          <div className={styles.props}>
            {hasRGB && (() => {
              const wired = drivenBy('color')
              const live = wired ? liveFor('color') : undefined
              const swatch = isRGB(live)
                ? toHex(live.r, live.g, live.b)
                : toHex(props.r as number, props.g as number, props.b as number)
              return (
              <div className={`${styles.propRow}${wired ? ` ${styles.wired}` : ''}`} title={wired ? 'Driven by connection' : undefined}>
                <span className={styles.propKey}>color</span>
                <input
                  className={`nodrag ${styles.colorInput}`}
                  type="color"
                  disabled={wired}
                  value={swatch}
                  onChange={(e) => updateNodeProperties(id, hexToRgb(e.target.value))}
                />
              </div>
              )
            })()}
            {editable.map(([key, val]) => {
              const meta = propertyMeta(d.nodeType, key)
              const wired = drivenBy(key)
              // A property may be inapplicable to the current variant (e.g. a
              // Transition's `direction` outside wipe): shown but disabled.
              const gated = !isPropertyEnabled(d.nodeType, key, props)
              const disabled = wired || gated
              const live = wired ? liveFor(key) : undefined
              return (
              <div
                key={key}
                className={`${styles.propRow}${disabled ? ` ${styles.wired}` : ''}`}
                title={wired ? 'Driven by connection' : gated ? 'Not used by this mode' : undefined}
              >
                <span className={styles.propKey} title={key}>{key}</span>
                {meta?.control === 'select' ? (
                  <select
                    className={`nodrag ${styles.propSelect}`}
                    disabled={disabled}
                    value={typeof live === 'string' && meta.options.includes(live) ? live : String(val)}
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
                      disabled={disabled}
                      value={typeof live === 'number' ? live : val}
                      onChange={(e) => updateNodeProperty(id, key, Number(e.target.value))}
                    />
                    <span className={styles.propVal}>{showNum(typeof live === 'number' ? live : val)}</span>
                  </span>
                ) : typeof val === 'boolean' ? (
                  <input
                    className="nodrag"
                    type="checkbox"
                    disabled={disabled}
                    checked={typeof live === 'boolean' ? live : val}
                    onChange={(e) => updateNodeProperty(id, key, e.target.checked)}
                  />
                ) : typeof val === 'number' ? (
                  <input
                    className={`nodrag nowheel ${styles.propInput}`}
                    type="number"
                    step="any"
                    disabled={disabled}
                    value={typeof live === 'number' ? showNum(live) : val}
                    onChange={(e) => { const n = Number(e.target.value); updateNodeProperty(id, key, e.target.value === '' || !Number.isFinite(n) ? 0 : n) }}
                  />
                ) : typeof val === 'string' && /^#[0-9a-f]{6}$/i.test(val) ? (
                  <input
                    className={`nodrag ${styles.colorInput}`}
                    type="color"
                    disabled={disabled}
                    value={isRGB(live) ? toHex(live.r, live.g, live.b) : typeof live === 'string' && /^#[0-9a-f]{6}$/i.test(live) ? live : val}
                    onChange={(e) => updateNodeProperty(id, key, e.target.value)}
                  />
                ) : (
                  <input
                    className={`nodrag ${styles.propInput}`}
                    type="text"
                    disabled={disabled}
                    value={wired && live !== undefined ? String(live) : String(val)}
                    onChange={(e) => updateNodeProperty(id, key, e.target.value)}
                  />
                )}
              </div>
              )
            })}
            {showClamp && (
              <div
                className={styles.propRow}
                title="Clamp wired inputs to each control’s range — like inserting a Clamp node on every connection"
              >
                <span className={styles.propKey}>clamp inputs</span>
                <input
                  className="nodrag"
                  type="checkbox"
                  checked={Boolean(props.clampInputs)}
                  onChange={(e) => updateNodeProperty(id, 'clampInputs', e.target.checked)}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default memo(StudioNode)
