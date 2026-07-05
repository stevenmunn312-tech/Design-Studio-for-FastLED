import { memo, useEffect, useMemo, useRef, useState } from 'react'
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
import BeatDetectBody from './BeatDetectBody'
import MusicLibraryNodeBody from './MusicLibraryNodeBody'
import FFTAnalyzerBody from './FFTAnalyzerBody'
import PerformanceGeneratorBody from './PerformanceGeneratorBody'
import PatternCollectionBody from './PatternCollectionBody'
import TransitionSetBody from './TransitionSetBody'
import ImageNodeBody from './ImageNodeBody'
import MatrixOutputUpload from '../Upload/MatrixOutputUpload'
import { usePreviewStore } from '../../state/previewStore'
import { useNodeDefaults } from '../../state/nodeDefaults'
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

function validSliderValue(value: string, min: number, max: number, step: number) {
  if (value.trim() === '') return false
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return false

  // Allow for floating-point noise while still enforcing the same increments
  // as the range input (for example 0.1, 0.2, ...).
  const stepsFromMin = (parsed - min) / step
  return Math.abs(stepsFromMin - Math.round(stepsFromMin)) < 1e-8
}

function SliderProperty({
  label,
  value,
  min,
  max,
  step,
  disabled,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  disabled: boolean
  onChange: (value: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [invalid, setInvalid] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const beginEditing = () => {
    if (disabled) return
    setDraft(String(value))
    setInvalid(false)
    setEditing(true)
  }

  const commit = () => {
    if (!validSliderValue(draft, min, max, step)) {
      setInvalid(true)
      return false
    }
    onChange(Number(draft))
    setEditing(false)
    setInvalid(false)
    return true
  }

  if (editing) {
    return (
      <span className={styles.sliderWrap}>
        <input
          ref={inputRef}
          className={`nodrag nowheel ${styles.sliderInput}${invalid ? ` ${styles.invalid}` : ''}`}
          type="text"
          inputMode="decimal"
          aria-label={`${label} value`}
          aria-invalid={invalid}
          title={invalid ? `Enter a value from ${min} to ${max} in steps of ${step}` : undefined}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            setInvalid(false)
          }}
          onBlur={() => {
            if (!commit()) setEditing(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') {
              setEditing(false)
              setInvalid(false)
            }
          }}
          onDoubleClick={(e) => e.stopPropagation()}
        />
      </span>
    )
  }

  return (
    <span className={styles.sliderWrap}>
      <input
        className={`nodrag nowheel ${styles.propRange}`}
        type="range"
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={(e) => {
          e.stopPropagation()
          beginEditing()
        }}
      />
      <span className={styles.propVal} onDoubleClick={beginEditing}>{showNum(value)}</span>
    </span>
  )
}

// Body content width = --node-width (180) − 2×--space-1 (8) horizontal padding.
// Frame previews fill this width and keep the matrix aspect ratio.
const BODY_CONTENT_W = 164

const HANDLE_STYLE = {
  width: 12,
  height: 12,
  borderRadius: '50%',
  border: 'none',
}

// Group-input "roles" a Performance Generator show can drive (see the collection
// -driven-performance design note). Setting a GroupInput's paramId to one of
// these tags it for that show signal; keep in sync with the generator/codegen.
const GROUP_INPUT_ROLES = ['energy', 'speed', 'palette']

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
  const setGroupInputRole = useGraphStore((s) => s.setGroupInputRole)
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
  const rawProps = d.properties as Record<string, unknown>
  const props = useMemo(() => {
    if (d.nodeType !== 'Math') return rawProps
    const op = String(rawProps.mathOp ?? 'add')
    const idn = op === 'multiply' || op === 'divide' ? 1 : 0
    return {
      a: typeof rawProps.a === 'number' ? rawProps.a : idn,
      b: typeof rawProps.b === 'number' ? rawProps.b : idn,
      ...rawProps,
    }
  }, [d.nodeType, rawProps])
  const hasRGB = ['r', 'g', 'b'].every((k) => typeof props[k] === 'number')
  // A GroupInput's `paramId` is edited via a dedicated role dropdown (below), not
  // the generic text field. `patternSections` is an object rendered by the
  // PatternCollection body's section chips.
  const isGroupInput = d.nodeType === 'GroupInput'
  const editable = Object.entries(props).filter(
    ([k]) => k !== 'font' && k !== 'image' && k !== 'code' && k !== 'globalCode' && k !== 'clampInputs' && k !== 'patternIds' && k !== 'patternSections' && k !== 'transitions' && k !== 'previewHidden'
      && !(isGroupInput && k === 'paramId')
      && !(hasRGB && (k === 'r' || k === 'g' || k === 'b'))
  )
  // The "clamp inputs" toggle is rendered specially (it has no entry in the
  // node's default properties); show it only where it would do something.
  const showClamp = hasClampableInputs(d.nodeType, inputs)

  // "Set Default" — pins this node's current properties as the starting point
  // for future nodes of the same type (persisted; see nodeDefaults.ts). Only
  // offered on nodes whose settings are hardware/rig-specific and rarely
  // change once dialled in (mic pins, matrix wiring).
  const showSetDefault = d.nodeType === 'MicInput' || d.nodeType === 'MatrixOutput'
  const isCustomDefault = useNodeDefaults((s) => d.nodeType in s.overrides)

  // Waveform nodes show a scope at the top of the body; this shifts the port
  // handles below it down by the scope height + the body's flex gap. Wave's
  // scope is its own configured shape; ComplexWave's reflects live upstream.
  const isWave = d.nodeType === 'Wave'
  const isComplexWave = d.nodeType === 'ComplexWave'
  const isBeatDetect = d.nodeType === 'BeatDetect'
  const isFFTAnalyzer = d.nodeType === 'FFTAnalyzer'
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
  // Per-node opt-out of the live preview thumbnail (a small toggle button on
  // the preview itself), so a busy graph can be quieted node by node.
  const previewHidden = Boolean(rawProps.previewHidden)
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
      <div className={styles.header} style={{ background: accent }}>
        {nodeDisplayLabel(d.nodeType, props, d.label)}
      </div>
      <div className={styles.body}>
        {isWave && waveSamples && <WaveScope samples={waveSamples} />}
        {isComplexWave && <ComplexWaveScope nodeId={id} />}
        {isBeatDetect && <BeatDetectBody nodeId={id} />}
        {isFFTAnalyzer && <FFTAnalyzerBody nodeId={id} bands={Number(props.bands ?? 24)} />}
        {previewKind && outPort && (
          previewHidden ? (
            <button
              type="button"
              className={`nodrag ${styles.previewToggleCollapsed}`}
              onClick={() => updateNodeProperty(id, 'previewHidden', false)}
              title="Show preview"
              aria-label="Show preview"
            >
              ▸ preview
            </button>
          ) : (
            <div className={styles.previewWrap}>
              <NodePreview nodeId={id} kind={previewKind} port={outPort.id} height={previewKind === 'frame' ? framePreviewH : undefined} />
              <button
                type="button"
                className={`nodrag ${styles.previewToggle}`}
                onClick={() => updateNodeProperty(id, 'previewHidden', true)}
                title="Hide preview"
                aria-label="Hide preview"
              >
                ▾
              </button>
            </div>
          )
        )}
        {Array.from({ length: rowCount }).map((_, i) => {
          const input = inputs[i]
          const output = outputs[i]
          const inputColor = input ? portColor(input.dataType) : null
          const outputColor = output ? portColor(output.dataType) : null
          return (
            <div key={i} className={styles.portRow}>
              {input && inputColor && (
                <>
                  <Handle
                    type="target"
                    position={Position.Left}
                    id={input.id}
                    title={`${input.label} · ${input.dataType}`}
                    style={{ ...HANDLE_STYLE, top: '50%', left: -8, background: inputColor, boxShadow: `0 0 6px ${inputColor}` }}
                  />
                  {sparkPortId === input.id && <span className={styles.spark} />}
                </>
              )}
              <span className={styles.portLabel}>{input?.label ?? ''}</span>
              <span className={styles.portLabelRight}>{output?.label ?? ''}</span>
              {output && outputColor && (
                <Handle
                  type="source"
                  position={Position.Right}
                  id={output.id}
                  title={`${output.label} · ${output.dataType}`}
                  style={{ ...HANDLE_STYLE, top: '50%', right: -8, background: outputColor, boxShadow: `0 0 6px ${outputColor}` }}
                />
              )}
            </div>
          )
        })}

        {d.nodeType === 'MusicLibrary' && <MusicLibraryNodeBody nodeId={id} />}
        {d.nodeType === 'PerformanceGenerator' && <PerformanceGeneratorBody nodeId={id} />}
        {d.nodeType === 'Image' && <ImageNodeBody nodeId={id} />}

        {d.nodeType === 'PatternCollection' && <PatternCollectionBody nodeId={id} />}
        {d.nodeType === 'TransitionSet' && <TransitionSetBody nodeId={id} />}

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

        {(hasRGB || editable.length > 0 || showClamp || isGroupInput || showSetDefault) && (
          <div className={styles.props}>
            {isGroupInput && (() => {
              // Group-input role: tag this input so a Performance Generator show
              // drives it (energy/speed/palette). Sets `paramId` to the role name
              // — the same value the evaluator/codegen key off — so no manual
              // rename is needed. "— input —" is an ordinary (untagged) input.
              const cur = String(props.paramId ?? '')
              const role = GROUP_INPUT_ROLES.includes(cur) ? cur : ''
              return (
                <div className={styles.propRow} title="Show role this input is driven by">
                  <span className={styles.propKey}>role</span>
                  <select
                    className={`nodrag ${styles.propSelect}`}
                    value={role}
                    onChange={(e) => setGroupInputRole(id, e.target.value)}
                  >
                    <option value="">— input —</option>
                    {GROUP_INPUT_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              )
            })()}
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
              const forceTextNumber = d.nodeType === 'Math' && (key === 'a' || key === 'b')
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
                  <SliderProperty
                    label={key}
                    value={typeof live === 'number' ? live : val}
                    min={meta.min}
                    max={meta.max}
                    step={meta.step}
                    disabled={disabled}
                    onChange={(value) => updateNodeProperty(id, key, value)}
                  />
                ) : typeof val === 'boolean' ? (
                  <input
                    className="nodrag"
                    type="checkbox"
                    disabled={disabled}
                    checked={typeof live === 'boolean' ? live : val}
                    onChange={(e) => updateNodeProperty(id, key, e.target.checked)}
                  />
                ) : typeof val === 'number' && !forceTextNumber ? (
                  <input
                    className={`nodrag nowheel ${styles.propInput}`}
                    type="number"
                    step="any"
                    disabled={disabled}
                    value={typeof live === 'number' ? showNum(live) : val}
                    onChange={(e) => { const n = Number(e.target.value); updateNodeProperty(id, key, e.target.value === '' || !Number.isFinite(n) ? 0 : n) }}
                  />
                ) : typeof val === 'number' && forceTextNumber ? (
                  <input
                    className={`nodrag ${styles.propInput}`}
                    type="text"
                    inputMode="decimal"
                    disabled={disabled}
                    value={typeof live === 'number' ? showNum(live) : val}
                    onChange={(e) => {
                      const n = Number(e.target.value)
                      updateNodeProperty(id, key, e.target.value === '' || !Number.isFinite(n) ? 0 : n)
                    }}
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
            {showSetDefault && (
              <div
                className={styles.propRow}
                title={`Remember these settings as the default for new ${d.label} nodes`}
              >
                <span className={styles.propKey}>set default</span>
                <input
                  className="nodrag"
                  type="checkbox"
                  checked={isCustomDefault}
                  onChange={(e) => {
                    if (e.target.checked) useNodeDefaults.getState().setDefault(d.nodeType, rawProps)
                    else useNodeDefaults.getState().clearDefault(d.nodeType)
                  }}
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
