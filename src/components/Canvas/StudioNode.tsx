import { lazy, memo, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import { matrixDims, useGraphStore } from '../../state/graphStore'
import type { StudioEdge, StudioNodeData } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'
import { NODE_LIBRARY, CATEGORY_ACCENT_VAR, portColor, propertyMeta, hasClampableInputs, bypassPort, nodeDisplayLabel, isPropertyEnabled, libraryDefaults, propertyGroupsFor } from '../../state/nodeLibrary'
import { waveNodeSamples } from '../../state/wave'
import WaveScope from './WaveScope'
import ComplexWaveScope from './ComplexWaveScope'
import NodePreview, { type PreviewKind } from './NodePreview'
import MatrixSizePopup from './MatrixSizePopup'
import BeatDetectBody from './BeatDetectBody'
import FFTAnalyzerBody from './FFTAnalyzerBody'
import HardwareInputBody from './HardwareInputBody'
import MidiInputBody from './MidiInputBody'
import { usePreviewStore } from '../../state/previewStore'
import { useNodeDefaults } from '../../state/nodeDefaults'
import { usePerformanceBakeStore } from '../../state/performanceBakeStore'
import { getCodeError } from '../../state/graphEvaluator'
import { useMusicStore } from '../../state/musicStore'
import { signalPathFor } from '../../utils/signalPath'
import { stopWheelWhileFocused } from './wheelBehavior'
import styles from './StudioNode.module.css'

const MusicLibraryNodeBody = lazy(() => import('./MusicLibraryNodeBody'))
const PerformanceGeneratorBody = lazy(() => import('./PerformanceGeneratorBody'))
const PatternCollectionBody = lazy(() => import('./PatternCollectionBody'))
const TransitionSetBody = lazy(() => import('./TransitionSetBody'))
const ImageNodeBody = lazy(() => import('./ImageNodeBody'))
const MatrixOutputUpload = lazy(() => import('../Upload/MatrixOutputUpload'))

type PortDef = { id: string; label: string; dataType: string }

const PROP_GROUPS_STORAGE_PREFIX = 'fastled-studio.propGroupsOpen.'

// Shows the latest compile/runtime error from a Code node's preview evaluation.
function CodeError({ nodeId }: { nodeId: string }) {
  const [err, setErr] = useState(() => getCodeError(nodeId))
  useEffect(() => {
    setErr(getCodeError(nodeId))
    return usePreviewStore.subscribe(() => {
      const next = getCodeError(nodeId)
      setErr((current) => (current === next ? current : next))
    })
  }, [nodeId])
  if (!err) return null
  return <div className={styles.codeErr} title={err}>⚠ {err}</div>
}

// MatrixOutput's size dropdown offers these square presets, plus "Custom"
// which opens MatrixSizePopup for an arbitrary width/height.
const MATRIX_SIZE_PRESETS = [16, 32, 64]

function toHex(r: number, g: number, b: number) {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
}
function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}
function isHexColor(v: unknown): v is string {
  return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)
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

function applyNodeSignal(
  node: HTMLDivElement | null,
  signal: { glow: string; softGlow: string; emissive: string; energy: number } | undefined
) {
  if (!node) return
  node.style.setProperty('--signal-glow', signal?.glow ?? 'transparent')
  node.style.setProperty('--signal-soft-glow', signal?.softGlow ?? 'transparent')
  node.style.setProperty('--signal-emissive', signal?.emissive ?? 'rgb(0 0 0)')
  node.style.setProperty('--signal-energy', String(signal?.energy ?? 0))
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
          className={`nodrag ${styles.sliderInput}${invalid ? ` ${styles.invalid}` : ''}`}
          type="text"
          inputMode="decimal"
          aria-label={`${label} value`}
          aria-invalid={invalid}
          title={invalid ? `Enter a value from ${min} to ${max} in steps of ${step}` : undefined}
          value={draft}
          onWheelCapture={stopWheelWhileFocused}
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

interface LivePropertyControlsProps {
  nodeId: string
  nodeType: string
  nodeLabel: string
  rawProps: Record<string, unknown>
  props: Record<string, unknown>
  sourceMap: Map<string, { srcId: string; srcPort: string }>
  uiEffectsEnabled: boolean
  locked: boolean
  editable: [string, unknown][]
  hasRGB: boolean
  isGroupInput: boolean
  showClamp: boolean
  showBypass: boolean
  showSetDefault: boolean
  isCustomDefault: boolean
  updateNodeProperty: (id: string, key: string, value: unknown) => void
  updateNodeProperties: (id: string, updates: Record<string, unknown>) => void
  setGroupInputRole: (nodeId: string, role: string) => void
}

const LivePropertyControls = memo(function LivePropertyControls({
  nodeId,
  nodeType,
  nodeLabel,
  rawProps,
  props,
  sourceMap,
  uiEffectsEnabled,
  locked,
  editable,
  hasRGB,
  isGroupInput,
  showClamp,
  showBypass,
  showSetDefault,
  isCustomDefault,
  updateNodeProperty,
  updateNodeProperties,
  setGroupInputRole,
}: LivePropertyControlsProps) {
  // Port id matching a property key drives that property (evaluator convention);
  // the `paletteIn` port drives the `palette` property, and the `color` port
  // drives the `r/g/b` swatch.
  const portFor = (propKey: string) => (propKey === 'palette' ? 'paletteIn' : propKey)
  const drivenBy = (propKey: string) => sourceMap.has(portFor(propKey))

  // Live upstream values for this node's wired inputs, pulled from the shared
  // evaluation pass (previewStore). Serialised so the props section only
  // re-renders when one of its own driven values changes. Frames (2D arrays)
  // aren't shown in inline editors, so they're skipped to keep the payload small.
  const liveJson = usePreviewStore((s) => {
    if (!uiEffectsEnabled || sourceMap.size === 0) return ''
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

  const isMatrixOutput = nodeType === 'MatrixOutput'
  const [sizePopupOpen, setSizePopupOpen] = useState(false)
  const propGroups = propertyGroupsFor(nodeType)
  // Which of this node type's property groups are expanded. Shared across all
  // instances of the same node type and persisted so the choice survives a
  // reload; starts fully collapsed to keep the node short.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    if (!propGroups) return {}
    try {
      const saved = localStorage.getItem(PROP_GROUPS_STORAGE_PREFIX + nodeType)
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })
  const toggleGroup = (key: string) => {
    setOpenGroups((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      try {
        localStorage.setItem(PROP_GROUPS_STORAGE_PREFIX + nodeType, JSON.stringify(next))
      } catch {
        // localStorage unavailable — the toggle still works for this session
      }
      return next
    })
  }

  if (!(hasRGB || editable.length > 0 || showClamp || showBypass || isGroupInput || showSetDefault || isMatrixOutput)) return null

  return (
    <div className={styles.props}>
      {isMatrixOutput && (() => {
        const w = Number(props.width ?? 16)
        const h = Number(props.height ?? 16)
        const preset = w === h && MATRIX_SIZE_PRESETS.includes(w) ? String(w) : 'custom'
        return (
          <div className={styles.propRow} title="LED matrix dimensions">
            <span className={styles.propKey}>size</span>
            <select
              className={`nodrag ${styles.propSelect}`}
              disabled={locked}
              value={preset}
              onWheelCapture={stopWheelWhileFocused}
              onChange={(e) => {
                const v = e.target.value
                if (v === 'custom') setSizePopupOpen(true)
                else updateNodeProperties(nodeId, { width: Number(v), height: Number(v) })
              }}
            >
              <option value="16">16 × 16</option>
              <option value="32">32 × 32</option>
              <option value="64">64 × 64</option>
              <option value="custom">Custom…</option>
            </select>
            {sizePopupOpen && (
              <MatrixSizePopup
                width={w}
                height={h}
                onApply={(nw, nh) => updateNodeProperties(nodeId, { width: nw, height: nh })}
                onClose={() => setSizePopupOpen(false)}
              />
            )}
          </div>
        )
      })()}
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
              disabled={locked}
              value={role}
              onWheelCapture={stopWheelWhileFocused}
              onChange={(e) => setGroupInputRole(nodeId, e.target.value)}
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
              disabled={wired || locked}
              value={swatch}
              onChange={(e) => updateNodeProperties(nodeId, hexToRgb(e.target.value))}
            />
          </div>
        )
      })()}
      {(() => {
        const renderPropRow = ([key, val]: [string, unknown]) => {
        const meta = propertyMeta(nodeType, key)
        const wired = drivenBy(key)
        // A property may be inapplicable to the current variant (e.g. a
        // Transition's `direction` outside wipe): shown but disabled.
        const gated = !isPropertyEnabled(nodeType, key, props)
        const disabled = wired || gated || locked
        const live = wired ? liveFor(key) : undefined
        const forceTextNumber = nodeType === 'Math' && (key === 'a' || key === 'b')
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
                onWheelCapture={stopWheelWhileFocused}
                onChange={(e) => updateNodeProperty(nodeId, key, e.target.value)}
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
                onChange={(value) => updateNodeProperty(nodeId, key, value)}
              />
            ) : typeof val === 'boolean' ? (
              <input
                className="nodrag"
                type="checkbox"
                disabled={disabled}
                checked={typeof live === 'boolean' ? live : val}
                onChange={(e) => updateNodeProperty(nodeId, key, e.target.checked)}
              />
            ) : isHexColor(val) ? (
              <input
                className={`nodrag ${styles.colorInput}`}
                type="color"
                disabled={disabled}
                value={isHexColor(live) ? live : val}
                onChange={(e) => updateNodeProperty(nodeId, key, e.target.value)}
              />
            ) : typeof val === 'number' && !forceTextNumber ? (
              <input
                className={`nodrag ${styles.propInput}`}
                type="number"
                step="any"
                disabled={disabled}
                value={typeof live === 'number' ? showNum(live) : val}
                onWheelCapture={stopWheelWhileFocused}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  updateNodeProperty(nodeId, key, e.target.value === '' || !Number.isFinite(n) ? 0 : n)
                }}
              />
            ) : typeof val === 'number' && forceTextNumber ? (
              <input
                className={`nodrag ${styles.propInput}`}
                type="text"
                inputMode="decimal"
                disabled={disabled}
                value={typeof live === 'number' ? showNum(live) : val}
                onWheelCapture={stopWheelWhileFocused}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  updateNodeProperty(nodeId, key, e.target.value === '' || !Number.isFinite(n) ? 0 : n)
                }}
              />
            ) : typeof val === 'string' && /^#[0-9a-f]{6}$/i.test(val) ? (
              <input
                className={`nodrag ${styles.colorInput}`}
                type="color"
                disabled={disabled}
                value={isRGB(live) ? toHex(live.r, live.g, live.b) : typeof live === 'string' && /^#[0-9a-f]{6}$/i.test(live) ? live : val}
                onChange={(e) => updateNodeProperty(nodeId, key, e.target.value)}
              />
            ) : (
              <input
                className={`nodrag ${styles.propInput}`}
                type="text"
                disabled={disabled}
                value={wired && live !== undefined ? String(live) : String(val)}
                onWheelCapture={stopWheelWhileFocused}
                onChange={(e) => updateNodeProperty(nodeId, key, e.target.value)}
              />
            )}
          </div>
        )
        }

        if (!propGroups) return editable.map(([key, val]) => renderPropRow([key, val]))

        const grouped = new Set<string>()
        for (const g of propGroups) for (const k of g.keys) grouped.add(k)
        const ungrouped = editable.filter(([key]) => !grouped.has(key))
        return (
          <>
            {propGroups.map((group) => {
              const rows = editable.filter(([key]) => group.keys.includes(key))
              if (rows.length === 0) return null
              const open = Boolean(openGroups[group.key])
              return (
                <div key={group.key} className={styles.propGroup}>
                  <button
                    type="button"
                    className={`nodrag ${styles.propGroupHeader}`}
                    onClick={() => toggleGroup(group.key)}
                    aria-expanded={open}
                  >
                    <span className={`${styles.propGroupCaret}${open ? ` ${styles.propGroupCaretOpen}` : ''}`}>▸</span>
                    {group.label}
                  </button>
                  {open && <div className={styles.propGroupRows}>{rows.map((row) => renderPropRow(row))}</div>}
                </div>
              )
            })}
            {ungrouped.map((row) => renderPropRow(row))}
          </>
        )
      })()}
      {showClamp && (
        <div
          className={styles.propRow}
          title="Clamp wired inputs to each control’s range — like inserting a Clamp node on every connection"
        >
          <span className={styles.propKey}>clamp inputs</span>
          <input
            className="nodrag"
            type="checkbox"
            disabled={locked}
            checked={Boolean(props.clampInputs)}
            onChange={(e) => updateNodeProperty(nodeId, 'clampInputs', e.target.checked)}
          />
        </div>
      )}
      {showBypass && (
        <div
          className={styles.propRow}
          title="Bypass this node — pass its input straight through unchanged, skipping its own effect"
        >
          <span className={styles.propKey}>bypass</span>
          <input
            className="nodrag"
            type="checkbox"
            disabled={locked}
            checked={Boolean(props.bypassed)}
            onChange={(e) => updateNodeProperty(nodeId, 'bypassed', e.target.checked)}
          />
        </div>
      )}
      {showSetDefault && (
        <div
          className={styles.propRow}
          title={`Remember these settings as the default for new ${nodeLabel} nodes`}
        >
          <span className={styles.propKey}>set default</span>
          <input
            className="nodrag"
            type="checkbox"
            disabled={locked}
            checked={isCustomDefault}
            onChange={(e) => {
              if (e.target.checked) useNodeDefaults.getState().setDefault(nodeType, rawProps)
              else useNodeDefaults.getState().clearDefault(nodeType)
            }}
          />
        </div>
      )}
    </div>
  )
})

// Body content width = --node-width (240) − 2×--space-1 (8) horizontal padding.
// Frame previews fill this width and keep the matrix aspect ratio.
const BODY_CONTENT_W = 224

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

// Nodes whose canvas preview intentionally diverges from firmware behaviour
// (export-only outputs). Rendered as a muted note at the bottom of the body
// so the fallback reads as deliberate, not broken. The audio nodes surface
// their own state (FFTAnalyzerBody's MIC LIVE / TEST SIGNAL / SILENT pill,
// BeatDetectBody's LIVE / PREVIEW badge); ButtonInput/PotInput/EncoderInput
// get a live widget (HardwareInputBody) instead of a note.
const PREVIEW_NOTES: Record<string, { text: string; title: string }> = {
  PerformanceGenerator: {
    text: 'frame output is black — shows play via SD export',
    title: 'The frame port is a black placeholder that lets this node terminate MatrixOutput (in preview and firmware). Generated shows play through the SD-card player export; watch one in the player above.',
  },
  MidiInput: {
    text: 'preview-only — no embedded MIDI equivalent',
    title: 'Reads a connected MIDI controller via the Web MIDI API for live preview control. There is no hardware analogue, so the generated firmware always sees the idle default (velocity 0, gate off, cc 0).',
  },
}

type StudioNodeProps = NodeProps<Node<StudioNodeData>>

const CATEGORY_CLASS: Record<string, string> = {
  input: styles.categoryInput,
  audio: styles.categoryAudio,
  signal: styles.categorySignal,
  math: styles.categoryMath,
  color: styles.categoryColor,
  pattern: styles.categoryPattern,
  field: styles.categoryField,
  composite: styles.categoryComposite,
  show: styles.categoryShow,
  output: styles.categoryOutput,
  note: styles.categoryNote,
}

const CATEGORY_TAG: Record<string, string> = {
  input: 'IN',
  audio: 'AUD',
  signal: 'SIG',
  math: 'MTH',
  color: 'CLR',
  pattern: 'PAT',
  field: 'FLD',
  composite: 'CMP',
  show: 'SHW',
  output: 'OUT',
  note: 'NOTE',
}

function moduleCode(nodeType: string) {
  return nodeType.replace(/[^A-Z0-9]/gi, '').slice(0, 3).toUpperCase().padEnd(3, '·')
}

// Single-entry cache mapping node id → serialised incoming-wiring key, rebuilt
// once per edges array. Every mounted node's wiring selector runs on every
// store update (including each drag pointermove), so one O(E) pass here
// replaces an O(E) scan per node per update.
let incomingKeysEdges: StudioEdge[] | null = null
let incomingKeysCache = new Map<string, string>()

function incomingKeyFor(edges: StudioEdge[], nodeId: string): string {
  if (edges !== incomingKeysEdges) {
    incomingKeysEdges = edges
    incomingKeysCache = new Map()
    for (const e of edges) {
      if (e.target && e.targetHandle && e.source && e.sourceHandle) {
        const prev = incomingKeysCache.get(e.target) ?? ''
        incomingKeysCache.set(e.target, `${prev}${e.targetHandle}>${e.source}:${e.sourceHandle};`)
      }
    }
  }
  return incomingKeysCache.get(nodeId) ?? ''
}

function StudioNode({ id, data, selected }: StudioNodeProps) {
  const d = data as StudioNodeData
  const nodeRef = useRef<HTMLDivElement>(null)
  const def = useMemo(() => NODE_LIBRARY.find((entry) => entry.type === d.nodeType), [d.nodeType])
  const sparkPortId = useUiStore((s) =>
    s.sparkPort?.nodeId === id ? (s.sparkPort?.portId ?? null) : null
  )
  const performanceMode = useUiStore((s) => s.performanceMode)
  const uiEffectsEnabled = useUiStore((s) => s.uiEffectsEnabled)
  const signalPathDimEnabled = useUiStore((s) => s.signalPathDimEnabled)
  const focusState = useGraphStore((s) => {
    if (!signalPathDimEnabled || !s.selectedNodeId) return 'neutral'
    return signalPathFor(s.edges, s.selectedNodeId).has(id) ? 'active' : 'dim'
  })
  // Matrix dimensions (from MatrixOutput) set the frame-preview aspect ratio.
  const gridW = useGraphStore((s) => Math.max(1, Math.min(64, matrixDims(s.nodes).w)))
  const gridH = useGraphStore((s) => Math.max(1, Math.min(64, matrixDims(s.nodes).h)))
  const updateNodeProperty = useGraphStore((s) => s.updateNodeProperty)
  const updateNodeProperties = useGraphStore((s) => s.updateNodeProperties)
  const setGroupInputRole = useGraphStore((s) => s.setGroupInputRole)
  const bakeStatus = usePerformanceBakeStore((s) => s.byNode[id]?.status)
  const bakeLocked = (bakeStatus ?? usePerformanceBakeStore.getState().byNode[id]?.status ?? 'idle') !== 'idle'
  const categoryAccent = CATEGORY_ACCENT_VAR[d.category] ?? 'var(--accent-output)'
  const inputs = (def?.inputs ?? d.inputs) as PortDef[]
  const outputs = (def?.outputs ?? d.outputs) as PortDef[]
  const rowCount = Math.max(inputs.length, outputs.length)

  // Which of this node's input ports are wired, and to which upstream port. When
  // a port is wired the evaluator ignores the matching property, so its inline
  // editor is disabled and shows the live value coming from the connection.
  // Selected as a stable string so the node only re-renders when its own wiring
  // changes; the parsed source map feeds the live-value lookup below.
  const incomingKey = useGraphStore((s) => incomingKeyFor(s.edges, id))
  const sourceMap = useMemo(() => {
    const m = new Map<string, { srcId: string; srcPort: string }>()
    for (const part of incomingKey.split(';').filter(Boolean)) {
      const [handle, rest] = part.split('>')
      const [srcId, srcPort] = rest.split(':')
      m.set(handle, { srcId, srcPort })
    }
    return m
  }, [incomingKey])

  // Inline property editors (Blender-style). A node with `r/g/b` shows one
  // colour swatch; `font` (an object) is left to the Inspector.
  const rawProps = d.properties as Record<string, unknown>
  const props = useMemo(() => {
    // Layer the saved properties over the library defaults, so a property
    // added to the library after this node was saved still gets an editor
    // (showing its default value until first edited).
    const merged = { ...libraryDefaults(d.nodeType), ...rawProps }
    if (d.nodeType !== 'Math') return merged
    const op = String(rawProps.mathOp ?? 'add')
    const idn = op === 'multiply' || op === 'divide' ? 1 : 0
    return {
      a: typeof rawProps.a === 'number' ? rawProps.a : idn,
      b: typeof rawProps.b === 'number' ? rawProps.b : idn,
      ...merged,
    }
  }, [d.nodeType, rawProps])
  const hasRGB = ['r', 'g', 'b'].every((k) => typeof props[k] === 'number')
  // Mirror's r/g/b is only the glow tint, so hide its swatch until glow is on;
  // Boids only uses its r/g/b in the 'solid' colour mode; BeatFlash's solid
  // color is unused once a palette is selected — hide it otherwise.
  // (The editable filter below still uses hasRGB, so r/g/b never leak into the
  // generic field list while the swatch is hidden.)
  const showRGB = hasRGB
    && (d.nodeType !== 'Mirror' || props.glow === true)
    && (d.nodeType !== 'Boids' || props.colorMode === 'solid')
    && (d.nodeType !== 'BeatFlash' || String(props.palette ?? 'none') === 'none')
  // A GroupInput's `paramId` is edited via a dedicated role dropdown (below), not
  // the generic text field. `patternSections` is an object rendered by the
  // PatternCollection body's section chips.
  const isGroupInput = d.nodeType === 'GroupInput'
  const isComment = d.nodeType === 'Comment'
  // A Comment's own color picker tints the node directly (sticky-note
  // convention) instead of the fixed category accent every other node uses.
  const accent = isComment && isHexColor(props.color) ? props.color : categoryAccent
  const editable = Object.entries(props).filter(
    ([k]) => k !== 'font' && k !== 'image' && k !== 'animation' && k !== 'code' && k !== 'globalCode' && k !== 'clampInputs' && k !== 'patternIds' && k !== 'patternSections' && k !== 'transitions' && k !== 'previewHidden' && k !== 'bypassed'
      // Comment's `text` gets its own multi-line editor in the body, not the
      // generic single-line field list.
      && !(isComment && k === 'text')
      // PSRAM controls render in MatrixOutputUpload — their visibility depends
      // on whether the *selected board* supports PSRAM, which only it knows.
      && k !== 'usePsram' && k !== 'psramMode'
      // MatrixOutput's width/height are edited via the dedicated size dropdown
      // (16/32/64/Custom) below, not the generic number-field editor.
      && k !== 'width' && k !== 'height'
      && !(isGroupInput && k === 'paramId')
      && !(hasRGB && (k === 'r' || k === 'g' || k === 'b'))
  )
  // The "clamp inputs" toggle is rendered specially (it has no entry in the
  // node's default properties); show it only where it would do something.
  const showClamp = hasClampableInputs(d.nodeType, inputs)
  // "Bypass" — mute this node's own effect and pass its matching frame/field
  // input straight through; only offered where that's possible.
  const showBypass = bypassPort(outputs, inputs) != null

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
  const isHardwareInput = d.nodeType === 'ButtonInput' || d.nodeType === 'PotInput' || d.nodeType === 'EncoderInput'
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
  const musicLibraryAnalyzing = useMusicStore((s) => s.entries.some((entry) => entry.status === 'analyzing'))
  // The Code node embeds a multi-line C++ editor, so it needs a wider frame.
  const isCode = d.nodeType === 'Code'
  // The Performance Generator embeds a show-preview player (canvas + transport).
  const isPerfGen = d.nodeType === 'PerformanceGenerator'
  const signalKey = outPort ? `${id}:${outPort.id}` : null
  const categoryClass = CATEGORY_CLASS[d.category] ?? ''
  const categoryTag = CATEGORY_TAG[d.category] ?? 'MOD'
  const headerCode = moduleCode(d.nodeType)
  const nodeTag = id.slice(-3).toUpperCase()
  const showLiveNodeVisuals = uiEffectsEnabled

  useEffect(() => {
    if (!showLiveNodeVisuals || !signalKey) {
      applyNodeSignal(nodeRef.current, undefined)
      return
    }
    applyNodeSignal(nodeRef.current, usePreviewStore.getState().signals.get(signalKey))
    return usePreviewStore.subscribe((state) => {
      applyNodeSignal(nodeRef.current, state.signals.get(signalKey))
    })
  }, [showLiveNodeVisuals, signalKey])

  return (
    <div
      ref={nodeRef}
      className={`${styles.node} ${categoryClass} ${performanceMode ? styles.nodePerformance : ''} ${selected ? styles.nodeSelected : ''} ${focusState === 'dim' ? styles.nodeDim : focusState === 'active' ? styles.nodePath : ''} ${previewKind === 'frame' ? styles.nodeFrameSource : ''} ${isMusicLibrary && musicLibraryAnalyzing ? styles.nodeMusicAnalyzing : ''}`}
      style={{
        width: isMusicLibrary ? 300 : isCode ? 320 : isPerfGen ? 300 : undefined,
        '--node-accent': accent,
      } as React.CSSProperties}
    >
      <div className={styles.header} style={{ background: accent }}>
        <span className={styles.headerTitle}>{nodeDisplayLabel(d.nodeType, props, d.label)}</span>
        <span className={styles.headerMeta}>
          <span className={styles.headerTag}>{categoryTag}</span>
          <span className={styles.headerCode}>{headerCode}-{nodeTag}</span>
          {showLiveNodeVisuals && (
            <span className={styles.headerMeter} aria-hidden="true">
              <span style={{ opacity: 'clamp(0.2, calc(var(--signal-energy) * 1.5), 1)' }} />
              <span style={{ opacity: 'clamp(0.12, calc((var(--signal-energy) - 0.18) * 1.8), 1)' }} />
              <span style={{ opacity: 'clamp(0.08, calc((var(--signal-energy) - 0.42) * 2.1), 1)' }} />
            </span>
          )}
        </span>
      </div>
      <div className={styles.body}>
        {isComment && (
          <textarea
            className={`nodrag ${styles.commentEditor}`}
            spellCheck={false}
            value={String(props.text ?? '')}
            placeholder="Note…"
            onWheelCapture={stopWheelWhileFocused}
            onChange={(e) => updateNodeProperty(id, 'text', e.target.value)}
          />
        )}
        {showLiveNodeVisuals && isWave && waveSamples && <WaveScope samples={waveSamples} />}
        {showLiveNodeVisuals && isComplexWave && <ComplexWaveScope nodeId={id} />}
        {showLiveNodeVisuals && isBeatDetect && <BeatDetectBody nodeId={id} />}
        {showLiveNodeVisuals && isFFTAnalyzer && <FFTAnalyzerBody nodeId={id} bands={Number(props.bands ?? 24)} />}
        {showLiveNodeVisuals && isHardwareInput && <HardwareInputBody nodeId={id} nodeType={d.nodeType} />}
        {showLiveNodeVisuals && d.nodeType === 'MidiInput' && <MidiInputBody note={Math.round(Number(props.note ?? 60))} cc={Math.round(Number(props.cc ?? 1))} />}
        {showLiveNodeVisuals && previewKind && outPort && (
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

        <Suspense fallback={null}>
          {d.nodeType === 'MusicLibrary' && <MusicLibraryNodeBody nodeId={id} />}
          {d.nodeType === 'PerformanceGenerator' && <PerformanceGeneratorBody nodeId={id} />}
          {d.nodeType === 'Image' && <ImageNodeBody nodeId={id} />}

          {d.nodeType === 'PatternCollection' && <PatternCollectionBody nodeId={id} />}
          {d.nodeType === 'TransitionSet' && <TransitionSetBody nodeId={id} />}

          {d.nodeType === 'MatrixOutput' && (
            <MatrixOutputUpload
              nodeId={id}
              hasFrameInput={sourceMap.has('frame')}
              hasSdCardInput={sourceMap.has('sdcard')}
            />
          )}
        </Suspense>

        {isCode && (
          <>
            <div className={styles.codeLabel}>Global</div>
            <textarea
              className={`nodrag ${styles.codeEditor}`}
              style={{ minHeight: 56 }}
              spellCheck={false}
              value={String(props.globalCode ?? '')}
              placeholder="// file scope: helpers, palettes, persistent vars"
              onWheelCapture={stopWheelWhileFocused}
              onChange={(e) => updateNodeProperty(id, 'globalCode', e.target.value)}
            />
            <div className={styles.codeLabel}>Loop</div>
            <textarea
              className={`nodrag ${styles.codeEditor}`}
              spellCheck={false}
              value={String(props.code ?? '')}
              placeholder="// loop body — runs each frame, writes into leds[]"
              onWheelCapture={stopWheelWhileFocused}
              onChange={(e) => updateNodeProperty(id, 'code', e.target.value)}
            />
            <CodeError nodeId={id} />
          </>
        )}

        <LivePropertyControls
          nodeId={id}
          nodeType={d.nodeType}
          nodeLabel={d.label}
          rawProps={rawProps}
          props={props}
          sourceMap={sourceMap}
          uiEffectsEnabled={uiEffectsEnabled}
          locked={bakeLocked}
          editable={editable}
          hasRGB={showRGB}
          isGroupInput={isGroupInput}
          showClamp={showClamp}
          showBypass={showBypass}
          showSetDefault={showSetDefault}
          isCustomDefault={isCustomDefault}
          updateNodeProperty={updateNodeProperty}
          updateNodeProperties={updateNodeProperties}
          setGroupInputRole={setGroupInputRole}
        />

        {PREVIEW_NOTES[d.nodeType] && (
          <div className={styles.previewNote} title={PREVIEW_NOTES[d.nodeType].title}>
            ⓘ {PREVIEW_NOTES[d.nodeType].text}
          </div>
        )}
      </div>
    </div>
  )
}

export default memo(StudioNode)
