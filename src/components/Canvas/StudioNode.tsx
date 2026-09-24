import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Handle, Position, useUpdateNodeInternals } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import { hasDerivedDisplayPorts, rootGraphEdges, rootGraphNodes, useGraphStore } from '../../state/graphStore'
import { orderPorts } from '../../utils/portOrder'
import { compositionDims } from '../../state/outputRouting'
import type { StudioEdge, StudioNodeData } from '../../state/graphStore'
import { useUiStore, type ConnectionDragHint } from '../../state/uiStore'
import { NODE_LIBRARY, NODE_DESCRIPTIONS, CATEGORY_ACCENT_VAR, portColor, portsCompatible, propertyMeta, propertyDescription, propertyLabel, hasClampableInputs, bypassPort, nodeDisplayLabel, isInternalProperty, isPropertyEnabled, libraryDefaults, propertyGroupsFor, supportsScalarExpression, isGpioPinProperty, gpioRequirementForProperty } from '../../state/nodeLibrary'
import { isPinnableProperty } from '../../state/performanceDeck'
import { useUploadStore, boardGpioInfo } from '../../state/uploadStore'
import { evaluateScalarExpression, SCALAR_EXPRESSION_HELP } from '../../state/scalarExpression'
import { waveNodeSamples } from '../../state/wave'
import WaveScope from './WaveScope'
import ComplexWaveScope from './ComplexWaveScope'
import NodePreview, { type PreviewKind } from './NodePreview'
import HardwareLedPreview from '../Hardware/HardwareLedPreview'
import BoardPinPicker from '../Hardware/BoardPinPicker'
import { LED_CELL_FILL } from '../Hardware/ledPreviewGeometry'
import {
  corkscrewDiameterMm,
  corkscrewDirection,
  corkscrewHeightMm,
  corkscrewStartAngle,
  corkscrewTurns,
  isLinearForm,
  outputForm,
  outputGridDims,
  ringDirection,
  ringStartAngle,
} from '../../state/ledOutputForm'
import { partRenderForNodeType } from '../../state/partRenders'
import { ASSIGNED_BOARD_KEY, ASSIGNED_PINS_KEY, USER_PINS_KEY } from '../../state/pinRetarget'
import MatrixSizePopup from './MatrixSizePopup'
import BeatDetectBody from './BeatDetectBody'
import FFTAnalyzerBody from './FFTAnalyzerBody'
import AudioCapabilityBody from './AudioCapabilityBody'
import StorageCapabilityBody from './StorageCapabilityBody'
import HardwareInputBody from './HardwareInputBody'
import ButtonBankBody from './ButtonBankBody'
import IRRemoteBody from './IRRemoteBody'
import PlayerControlsBody from './PlayerControlsBody'
import MidiInputBody from './MidiInputBody'
import DmxInputBody from './DmxInputBody'
import RtcInputBody from './RtcInputBody'
import { pinSupports, pinWarningForCapability } from '../../state/boardGpio'
import { buttonBankOutputs } from '../../state/buttonBank'
import { playerControlInputs } from '../../state/playerControlAssignments'
import { relayInputs } from '../../state/relayModule'
import { isHardwareNodeType } from '../../state/hardware'
import { usePreviewStore } from '../../state/previewStore'
import { useNodeDefaults } from '../../state/nodeDefaults'
import {
  micSupportedForBoardProfile,
  MIC_NO_BOARD_MESSAGE,
  micUnsupportedMessage,
} from '../../state/micPinDefaults'
import { selectedPhysicalBoardProfile } from '../../build/boardProfiles'
import { usePerformanceBakeStore } from '../../state/performanceBakeStore'
import { getCodeError } from '../../state/graphEvaluator'
import { useMusicStore } from '../../state/musicStore'
import { signalPathFor } from '../../utils/signalPath'
import { stopWheelWhileFocused } from './wheelBehavior'
import { customPaletteStops16, hexToRgb as customHexToRgb, normalizeCustomPalette, rgbToHex } from '../../state/customPalette'
import { polinePalette, hexToRgb as polineHexToRgb } from '../../state/polinePalette'
import type { Palette } from '../../state/ledColor'
import { isHardwarePartField } from '../../state/partFields'
import { DISPLAY_SOURCE_NODE_TYPES, type DisplaySignalKind } from '../../state/displaySignal'
import { CUSTOM_DESIGN_LAYOUT,
  asTransportDisplayLayout,
  transportLayoutChoicesForKind,
  transportLayoutForKind,
} from '../../state/transportDisplay'
import styles from './StudioNode.module.css'
import { NODE_HANDLE_STYLE } from './nodeHandleStyle'
import {
  controllableInputsFor, exposableInputsFor, exposedNodeInputs, propertyInputsFor,
} from '../../state/propertyInputs'
import { parseDisplayWidgetPortId, TOUCH_CONTROL_ADD_HANDLE } from '../../state/displayRegistry'
import { touchControlDriver, touchControlPlan, writeTouchControlValue } from '../../state/wireFirstControls'
import PropertyInputMenu from './PropertyInputMenu'
import type { FloatingAnchor } from '../Hardware/FloatingMenu'
import { formatSignalRange, isNormalizedOutput, signalRangeMismatch } from '../../state/signalRange'

const MusicLibraryNodeBody = lazy(() => import('./MusicLibraryNodeBody'))
const PerformanceGeneratorBody = lazy(() => import('./PerformanceGeneratorBody'))
const PatternCollectionBody = lazy(() => import('./PatternCollectionBody'))
const TransitionSetBody = lazy(() => import('./TransitionSetBody'))
const PaletteBankBody = lazy(() => import('./PaletteBankBody'))
const TransitionPickerBody = lazy(() => import('./TransitionPickerBody').then((m) => ({ default: m.TransitionBody })))
const CustomPaletteEditorBody = lazy(() => import('./PaletteEditorBody').then((m) => ({ default: m.CustomPaletteEditorBody })))
const PolineEditorBody = lazy(() => import('./PaletteEditorBody').then((m) => ({ default: m.PolineEditorBody })))
const ImageNodeBody = lazy(() => import('./ImageNodeBody'))
const BoardNodeBody = lazy(() => import('./BoardNodeBody'))
const Wireframe3DNodeBody = lazy(() => import('./Wireframe3DNodeBody'))
const TransportDisplayNodeBody = lazy(() => import('./TransportDisplayNodeBody'))
const InfoDisplayNodeBody = lazy(() => import('./InfoDisplayNodeBody'))
const SegmentDisplayNodeBody = lazy(() => import('./SegmentDisplayNodeBody'))
const StereoVuMeterNodeBody = lazy(() => import('./StereoVuMeterNodeBody'))
const TouchCalibrationBody = lazy(() => import('./TouchCalibrationBody'))

type PortDef = { id: string; label: string; dataType: string }
type ConnectionTargetHint = {
  kind: 'compatible' | 'range' | 'conversion' | 'blocked'
  title: string
  aria: string
}

const PROP_GROUPS_STORAGE_PREFIX = 'design-studio-for-fastled.propGroupsOpen.'

// Stable empty reference so the pinned-keys selector doesn't return a fresh
// Map() (and force an extra re-render) for the common case of an unpinned node.
const EMPTY_PIN_MAP = new Map<string, string>()

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
  aura: HTMLSpanElement | null,
  meter: HTMLSpanElement | null,
  signal: { emissive: string; energy: number } | undefined
) {
  const energy = String(signal?.energy ?? 0)
  aura?.style.setProperty('--signal-emissive', signal?.emissive ?? 'rgb(0 0 0)')
  aura?.style.setProperty('--signal-energy', energy)
  meter?.style.setProperty('--signal-energy', energy)
}

function activateHandleFromKeyboard(event: React.KeyboardEvent<HTMLDivElement>) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  event.stopPropagation()
  event.currentTarget.click()
}

function connectionTargetHint(
  targetNodeType: string,
  targetPort: { id: string; dataType: string },
  drag: ConnectionDragHint | null,
  target?: { properties: Record<string, unknown>; driven: boolean },
): ConnectionTargetHint | null {
  if (!drag) return null
  // A Touch node's trailing socket creates the control it lands on, so it is
  // judged by what the property can take rather than by port compatibility —
  // its own type deliberately matches nothing. Asking here rather than only on
  // drop means the reason shows while the noodle is still in the air.
  if (drag.sourcePortId === TOUCH_CONTROL_ADD_HANDLE) {
    const plan = touchControlPlan(
      targetNodeType, targetPort.id, target?.properties ?? {}, target?.driven ?? false)
    // The shortcut is named only where it would do something. It is offered
    // on the row rather than announced afterwards for the same reason the
    // refusal is: while the noodle is in the air is when it can still change
    // what you do with it.
    const place = drag.canPlaceOnVisibleScreen
      ? ' Hold Ctrl/Cmd to place it on the screen you are watching.'
      : ''
    return plan.ok
      ? {
          kind: 'compatible',
          title: `Creates a ${plan.spec.type} for ${plan.spec.label}.${place}`,
          aria: `Creates a ${plan.spec.type} control for ${plan.spec.label}.${place}`,
        }
      : { kind: 'blocked', title: plan.refusal.message, aria: plan.refusal.message }
  }
  if (!portsCompatible(drag.sourceDataType, targetPort.dataType)) {
    return {
      kind: 'blocked',
      title: `${drag.sourceDataType} cannot connect to ${targetPort.dataType}.`,
      aria: `Incompatible with dragged ${drag.sourceDataType} output.`,
    }
  }
  const sourceRange = drag.sourceRange ?? (isNormalizedOutput(drag.sourceNodeType, drag.sourcePortId)
    ? { min: 0, max: 1 }
    : null)
  const range = sourceRange ? signalRangeMismatch(targetNodeType, targetPort.id, sourceRange) : null
  if (range) {
    const span = formatSignalRange(range)
    const sourceSpan = formatSignalRange(sourceRange!)
    return {
      kind: 'range',
      title: `Compatible type, but this ${sourceSpan} source differs from ${span}. Use Map Range for full control.`,
      aria: `Compatible, with range warning. Use Map Range for the ${span} target range.`,
    }
  }
  if (drag.sourceDataType !== targetPort.dataType) {
    return {
      kind: 'conversion',
      title: `${drag.sourceDataType} can connect to ${targetPort.dataType}; add Trigger or Map Range if you need explicit conversion behaviour.`,
      aria: `Compatible ${drag.sourceDataType} to ${targetPort.dataType} conversion.`,
    }
  }
  return {
    kind: 'compatible',
    title: `Compatible ${targetPort.dataType} target.`,
    aria: `Compatible ${targetPort.dataType} target.`,
  }
}

function connectionHintClass(hint: ConnectionTargetHint | null): string {
  if (!hint) return ''
  if (hint.kind === 'blocked') return styles.connectionBlocked
  if (hint.kind === 'range' || hint.kind === 'conversion') return styles.connectionNeedsAdapter
  return styles.connectionCompatible
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
        aria-label={`${label} value`}
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
  exposedInputIds: readonly string[]
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
  /** propertyKey -> pin id, for properties of this node currently pinned to
   *  the Performance Deck. */
  pinnedKeys: Map<string, string>
  pinProperty: (nodeId: string, propertyKey: string) => void
  unpinProperty: (pinId: string) => void
}

const LivePropertyControls = memo(function LivePropertyControls({
  nodeId,
  nodeType,
  nodeLabel,
  rawProps,
  props,
  sourceMap,
  exposedInputIds,
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
  pinnedKeys,
  pinProperty,
  unpinProperty,
}: LivePropertyControlsProps) {
  const propertyInputs = propertyInputsFor(nodeType)
  const exposableInputs = exposableInputsFor(nodeType)
  const connectionDrag = useUiStore((s) => s.connectionDrag)
  const setNodeInputExposed = useGraphStore((s) => s.setNodeInputExposed)
  const disconnectInput = useGraphStore((s) => s.disconnectInput)
  const focusNode = useGraphStore((s) => s.selectNode)
  const revealGraphNodes = useUiStore((s) => s.revealGraphNodes)
  const flashNode = useUiStore((s) => s.flashNode)
  const [inputMenu, setInputMenu] = useState<{ anchor: FloatingAnchor; propertyKey?: string } | null>(null)
  const closeInputMenu = useCallback(() => setInputMenu(null), [])
  const updateNodeInternals = useUpdateNodeInternals()
  const propertyAreaRef = useRef<HTMLDivElement>(null)
  // Property groups and previews can move row sockets without changing IDs.
  useEffect(() => {
    if (exposableInputs.length === 0 || typeof ResizeObserver === 'undefined') return
    const area = propertyAreaRef.current
    if (!area) return
    const observer = new ResizeObserver(() => updateNodeInternals(nodeId))
    observer.observe(area)
    return () => observer.disconnect()
  }, [nodeId, exposableInputs, updateNodeInternals])
  // Non-hardware nodes with generated pins (currently DMX) retain the shared
  // picker here until they gain a physical part in the hardware workbench.
  const selectedFqbn = useUploadStore((s) => s.selectedFqbn)
  const boardGpio = boardGpioInfo(selectedFqbn)

  // "Set Default" is meant to keep tracking this node's settings, not just
  // snapshot them once — otherwise a pin edited after the checkbox was
  // ticked (e.g. MicInput's i2sWs) silently falls out of sync with the
  // saved default until the user unchecks/rechecks it.
  useEffect(() => {
    if (!showSetDefault || !isCustomDefault) return
    useNodeDefaults.getState().setDefault(nodeType, rawProps, selectedFqbn)
  }, [showSetDefault, isCustomDefault, nodeType, rawProps, selectedFqbn])

  // Port id matching a property key drives that property (evaluator convention);
  // the `paletteIn` port drives the `palette` property, and the `color` port
  // drives the `r/g/b` swatch.
  const portFor = (propKey: string) => propertyInputs.find((port) => port.propertyKey === propKey)?.id
    ?? (propKey === 'palette' ? 'paletteIn' : propKey)
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
      // Audio cables carry full spectrum arrays. They drive dedicated node
      // bodies, never scalar property editors, so serialising them into this
      // small live-value payload every publish is pure work.
      if (typeof v === 'object' && !Array.isArray(v)
        && Array.isArray((v as { spectrum?: unknown }).spectrum)) continue
      o[handle] = v
    }
    return JSON.stringify(o)
  })
  const liveValues = useMemo<Record<string, unknown>>(
    () => (liveJson ? JSON.parse(liveJson) : {}),
    [liveJson]
  )
  const liveFor = (propKey: string): unknown => liveValues[portFor(propKey)]
  // A wired row says what is driving it. The upstream node's *label*, never
  // its id: an id is a uuid, which tells the reader nothing about the graph.
  const sourceLabelJson = useGraphStore((s) => {
    if (sourceMap.size === 0) return ''
    const labels: Record<string, string> = {}
    for (const { srcId } of sourceMap.values()) {
      const source = s.nodes.find((entry) => entry.id === srcId)
      if (source) labels[srcId] = String(source.data.label ?? source.data.nodeType)
    }
    return JSON.stringify(labels)
  })
  const sourceLabels = useMemo<Record<string, string>>(
    () => (sourceLabelJson ? JSON.parse(sourceLabelJson) : {}),
    [sourceLabelJson],
  )
  const describeSource = (portId: string): string | undefined => {
    const source = sourceMap.get(portId)
    return source ? `${sourceLabels[source.srcId] ?? 'a node'} · ${source.srcPort}` : undefined
  }
  /** Follow a wire back to whatever is driving it, the way Graph Health does. */
  const traceSource = (portId: string) => {
    const srcId = sourceMap.get(portId)?.srcId
    if (!srcId) return
    focusNode(srcId)
    revealGraphNodes([srcId])
    flashNode(srcId)
  }
  const expressionDimsKey = useGraphStore((s) => {
    const { w, h } = compositionDims(rootGraphNodes(s), rootGraphEdges(s))
    return `${w}:${h}`
  })
  const [expressionW, expressionH] = expressionDimsKey.split(':').map(Number)
  const transportDisplaySourceKind = useGraphStore((s) => {
    if (nodeType !== 'TransportDisplay') return null
    const sourceId = sourceMap.get('display')?.srcId
    if (!sourceId) return null
    const sourceType = rootGraphNodes(s).find((node) => node.id === sourceId)?.data.nodeType
    return (sourceType && DISPLAY_SOURCE_NODE_TYPES[sourceType]) ?? null
  }) as DisplaySignalKind | null
  /*
   * Every presentation this source offers, and the panel's own screen design,
   * always selectable. Choosing a fixed layout sets the design aside rather
   * than deleting it, so the choice is reversible from this one control.
   */
  const transportLayoutOptions = [...transportLayoutChoicesForKind(transportDisplaySourceKind), CUSTOM_DESIGN_LAYOUT]
  const createScreenDesignForPanel = useGraphStore((s) => s.createScreenDesignForPanel)

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
    <div ref={propertyAreaRef} className={styles.props}>
      {exposableInputs.length > 0 && (
        <button type="button" className={`nodrag ${styles.exposeInputs}`} disabled={locked}
          aria-haspopup="menu" aria-expanded={inputMenu !== null}
          onClick={(event) => setInputMenu({ anchor: event.currentTarget })}>
          Expose input…
        </button>
      )}
      {inputMenu && !locked && (
        <PropertyInputMenu anchor={inputMenu.anchor} nodeType={nodeType}
          ports={inputMenu.propertyKey ? exposableInputs.filter((port) => port.propertyKey === inputMenu.propertyKey) : exposableInputs}
          visibleIds={exposedInputIds} connected={sourceMap} describeSource={describeSource}
          onChange={(portId, exposed) => setNodeInputExposed(nodeId, portId, exposed)}
          onTrace={traceSource} onDisconnect={(portId) => disconnectInput(nodeId, portId)}
          onClose={closeInputMenu} />
      )}
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
              aria-label={`${nodeLabel} role value`}
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
              aria-label={`${nodeLabel} color`}
              onChange={(e) => updateNodeProperties(nodeId, hexToRgb(e.target.value))}
            />
          </div>
        )
      })()}
      {(() => {
        const renderPropRow = ([key, val]: [string, unknown]) => {
        const propertyInput = propertyInputs.find((port) => port.propertyKey === key)
        const exposedInput = propertyInput && exposedInputIds.includes(propertyInput.id) ? propertyInput : undefined
        const meta = propertyMeta(nodeType, key)
        const displayLabel = propertyLabel(nodeType, key)
        const controlLabel = displayLabel
        const wired = drivenBy(key)
        const touchSource = wired ? sourceMap.get(portFor(key)) : undefined
        const drivenByTouchWidget = Boolean(
          touchSource && parseDisplayWidgetPortId(touchSource.srcPort)?.role === 'out',
        )
        // A property may be inapplicable to the current variant (e.g. a
        // Transition's `direction` outside wipe): shown but disabled.
        const gated = !isPropertyEnabled(nodeType, key, props)
        const disabled = (wired && !drivenByTouchWidget) || gated || locked
        const live = wired ? liveFor(key) : undefined
        const writeValue = (value: unknown) => {
          if (drivenByTouchWidget && touchSource
            && (typeof value === 'number' || typeof value === 'boolean')) {
            const driver = touchControlDriver(touchSource, useGraphStore.getState().nodes)
            if (driver) writeTouchControlValue(driver.displayId, driver.widgetId, value)
          }
          updateNodeProperty(nodeId, key, value)
          // A panel first set to Custom design gets its design there and then,
          // so the choice never leaves the glass with nothing to draw.
          if (nodeType === 'TransportDisplay' && key === 'tftLayout' && value === CUSTOM_DESIGN_LAYOUT
            && !props.displayId) createScreenDesignForPanel(nodeId)
        }
        const forceTextNumber = nodeType === 'Math' && (key === 'a' || key === 'b')
        const expressionCapable = supportsScalarExpression(nodeType, key)
        const expressionResult = expressionCapable
          ? evaluateScalarExpression(val, expressionW, expressionH)
          : null
        const expressionInvalid = expressionCapable && typeof val === 'string' && expressionResult == null
        const isGpioPin = isGpioPinProperty(nodeType, key)
        const gpioRequirement = isGpioPin ? gpioRequirementForProperty(nodeType, key, props) : null
        const gpioPin = typeof val === 'number' ? boardGpio?.recommended.find((pin) => pin.pin === val) : undefined
        const gpioUnavailable = typeof val === 'number' ? boardGpio?.caution.find((pin) => pin.pin === val) : undefined
        const gpioNote = !gpioRequirement || typeof val !== 'number' || !boardGpio
          ? undefined
          : gpioUnavailable
            ? `Unavailable on this board — ${gpioUnavailable.note}`
            : !gpioPin
              ? `Pin ${val} isn't listed for this board`
              : !pinSupports(gpioPin, gpioRequirement.capability)
                ? `Pin ${val} doesn't support ${gpioRequirement.capability === 'analogInput' ? 'analog input' : gpioRequirement.capability === 'digitalInput' ? 'digital input' : 'digital output'}`
                : gpioRequirement.pullup && !pinSupports(gpioPin, 'pullup')
                  ? `Pin ${val} has no internal pull-up`
                  : pinWarningForCapability(gpioPin, gpioRequirement.capability) ?? gpioPin.note
        const rowTitle = wired
          ? drivenByTouchWidget
            ? `Driven by ${describeSource(portFor(key))}. Drag here to set it from the graph; disconnect to restore the saved value.`
            : `Driven by ${describeSource(portFor(key))}. Disconnect to restore the saved value.`
          : gated
              ? 'Not used by this mode'
              : expressionCapable
                ? expressionInvalid
                  ? `Invalid expression. ${SCALAR_EXPRESSION_HELP}`
                  : typeof val === 'string'
                    ? `${val} = ${showNum(expressionResult!)}`
                    : `Number or expression. ${SCALAR_EXPRESSION_HELP}`
                : gpioNote ?? propertyDescription(nodeType, key)
        const isTransportLayout = nodeType === 'TransportDisplay' && key === 'tftLayout'
        const selectOptions = meta?.control === 'select'
          ? (isTransportLayout ? transportLayoutOptions : meta.options)
          : []
        const selectValue = isTransportLayout
          ? val === CUSTOM_DESIGN_LAYOUT
            ? CUSTOM_DESIGN_LAYOUT
            : asTransportDisplayLayout(val) === 'Diagnostics'
            ? 'Diagnostics'
            : transportDisplaySourceKind
              ? transportLayoutForKind(transportDisplaySourceKind, val) ?? 'Waiting'
              : 'Waiting'
            : typeof live === 'string' && selectOptions.includes(live as never)
            ? live
            : String(val)
        const connectionHint = propertyInput
          ? connectionTargetHint(nodeType, propertyInput, connectionDrag, { properties: props, driven: wired })
          : null
        const hintedTitle = connectionHint
          ? [rowTitle, connectionHint.title].filter(Boolean).join(' ')
          : rowTitle
        return (
          <div
            key={key}
            className={`${styles.propRow}${disabled ? ` ${styles.wired}` : ''}${connectionHint ? ` ${connectionHintClass(connectionHint)}` : ''}`}
            title={hintedTitle}
            /* A noodle dropped on the row exposes this socket and lands on it,
               so a hidden property is still a drop target. The canvas reads
               these three off the DOM under the pointer — see NodeGraphCanvas. */
            data-property-input={propertyInput ? `${nodeId}|${propertyInput.id}` : undefined}
            data-property-type={propertyInput?.dataType}
            onContextMenu={propertyInput ? (event) => {
              event.preventDefault()
              event.stopPropagation()
              if (!locked) setInputMenu({ anchor: { left: event.clientX, right: event.clientX,
                top: event.clientY, bottom: event.clientY }, propertyKey: key })
            } : undefined}
          >
            {exposedInput && (
              <Handle type="target" position={Position.Left} id={exposedInput.id}
                title={`${exposedInput.label} · ${exposedInput.dataType}${connectionHint ? ` — ${connectionHint.title}` : ''}`} role="button"
                tabIndex={locked ? -1 : 0} isConnectable={!locked} aria-disabled={locked}
                aria-label={`Connect to ${nodeLabel} ${exposedInput.label} input, ${exposedInput.dataType}${connectionHint ? `. ${connectionHint.aria}` : ''}. Press Enter or Space to choose a source port.`}
                onKeyDown={activateHandleFromKeyboard} className={`${styles.propertyHandle}${connectionHint ? ` ${connectionHintClass(connectionHint)}` : ''}`}
                style={{ ...NODE_HANDLE_STYLE, top: '50%', background: portColor(exposedInput.dataType),
                  boxShadow: `0 0 6px ${portColor(exposedInput.dataType)}` }} />
            )}
            <span className={styles.propKey} title={key}>{displayLabel}</span>
            {meta?.control === 'select' ? (
              <select
                className={`nodrag ${styles.propSelect}`}
                disabled={disabled}
                value={selectValue}
                aria-label={`${controlLabel} value`}
                onWheelCapture={stopWheelWhileFocused}
                onChange={(e) => writeValue(e.target.value)}
              >
                {selectOptions.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : isGpioPin && meta?.control === 'slider' && typeof val === 'number' ? (
              <BoardPinPicker
                nodeId={nodeId}
                nodeType={nodeType}
                propertyKey={key}
                properties={props}
                value={typeof live === 'number' ? live : val}
                min={meta.min}
                max={meta.max}
                disabled={disabled}
                ariaLabel={`${controlLabel} value`}
                onChange={(value) => writeValue(value)}
              />
            ) : meta?.control === 'slider' && typeof val === 'number' ? (
              <SliderProperty
                label={controlLabel}
                value={typeof live === 'number' ? live : val}
                min={meta.min}
                max={meta.max}
                step={meta.step}
                disabled={disabled}
                onChange={(value) => writeValue(value)}
              />
            ) : typeof val === 'boolean' ? (
              <input
                className="nodrag"
                type="checkbox"
                disabled={disabled}
                checked={typeof live === 'boolean' ? live : val}
                aria-label={controlLabel}
                onChange={(e) => writeValue(e.target.checked)}
              />
            ) : isHexColor(val) ? (
              <input
                className={`nodrag ${styles.colorInput}`}
                type="color"
                disabled={disabled}
                value={isHexColor(live) ? live : val}
                aria-label={`${controlLabel} color`}
                onChange={(e) => writeValue(e.target.value)}
              />
            ) : expressionCapable ? (
              <input
                className={`nodrag ${styles.propInput}`}
                type="text"
                inputMode="decimal"
                aria-label={`${controlLabel} value or expression`}
                aria-invalid={expressionInvalid ? 'true' : undefined}
                disabled={disabled}
                value={wired && live !== undefined ? String(live) : String(val)}
                onWheelCapture={stopWheelWhileFocused}
                onChange={(e) => {
                  const raw = e.target.value
                  const n = Number(raw)
                  writeValue(raw.trim() !== '' && Number.isFinite(n) ? n : raw)
                }}
              />
            ) : typeof val === 'number' && !forceTextNumber ? (
              <input
                className={`nodrag ${styles.propInput}`}
                type="number"
                step="any"
                disabled={disabled}
                value={typeof live === 'number' ? showNum(live) : val}
                aria-label={`${controlLabel} value`}
                onWheelCapture={stopWheelWhileFocused}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  writeValue(e.target.value === '' || !Number.isFinite(n) ? 0 : n)
                }}
              />
            ) : typeof val === 'number' && forceTextNumber ? (
              <input
                className={`nodrag ${styles.propInput}`}
                type="text"
                inputMode="decimal"
                disabled={disabled}
                value={typeof live === 'number' ? showNum(live) : val}
                aria-label={`${controlLabel} value`}
                onWheelCapture={stopWheelWhileFocused}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  writeValue(e.target.value === '' || !Number.isFinite(n) ? 0 : n)
                }}
              />
            ) : typeof val === 'string' && /^#[0-9a-f]{6}$/i.test(val) ? (
              <input
                className={`nodrag ${styles.colorInput}`}
                type="color"
                disabled={disabled}
                value={isRGB(live) ? toHex(live.r, live.g, live.b) : typeof live === 'string' && /^#[0-9a-f]{6}$/i.test(live) ? live : val}
                aria-label={`${controlLabel} color`}
                onChange={(e) => writeValue(e.target.value)}
              />
            ) : (
              <input
                className={`nodrag ${styles.propInput}`}
                type="text"
                disabled={disabled}
                value={wired && live !== undefined ? String(live) : String(val)}
                aria-label={`${controlLabel} value`}
                onWheelCapture={stopWheelWhileFocused}
                onChange={(e) => writeValue(e.target.value)}
              />
            )}
            {!wired && isPinnableProperty(nodeType, key, val) && (() => {
              const pinId = pinnedKeys.get(key)
              return (
                <button
                  type="button"
                  className={`nodrag ${styles.pinBtn}${pinId ? ` ${styles.pinBtnActive}` : ''}`}
                  title={pinId ? 'Unpin from Performance Deck' : 'Pin to Performance Deck'}
                  aria-label={pinId ? `Unpin ${key} from Performance Deck` : `Pin ${key} to Performance Deck`}
                  aria-pressed={Boolean(pinId)}
                  onClick={() => (pinId ? unpinProperty(pinId) : pinProperty(nodeId, key))}
                >
                  📌
                </button>
              )
            })()}
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
              // A grid's size, so only for the forms that have one — a string
              // and a ring are a length, edited as `ledCount` in the Output
              // group above.
              const matrixSizeRow = isMatrixOutput && group.key === 'layout' && !isLinearForm(outputForm(props)) ? (() => {
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
                      aria-label={`${nodeLabel} matrix size`}
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
              })() : null
              const renderedRows = rows.map((row) => renderPropRow(row))
              const exposedRows = rows.filter(([key]) => exposedInputIds.includes(portFor(key)))
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
                  {open && (
                    <div className={styles.propGroupRows}>
                      {group.key === 'layout'
                        ? (
                            <>
                              {renderedRows[0]}
                              {matrixSizeRow}
                              {renderedRows.slice(1)}
                            </>
                          )
                        : renderedRows}
                    </div>
                  )}
                  {!open && exposedRows.map((row) => renderPropRow(row))}
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
            aria-label={`${nodeLabel} clamp wired inputs`}
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
            aria-label={`${nodeLabel} bypass`}
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
            aria-label={`Use these settings as the default for new ${nodeLabel} nodes`}
            onChange={(e) => {
              if (e.target.checked) useNodeDefaults.getState().setDefault(nodeType, rawProps, selectedFqbn)
              else useNodeDefaults.getState().clearDefault(nodeType, selectedFqbn)
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
/** Keep wide one-row previews legible and bounded. This is also the cap used
 *  by every generic frame thumbnail below. */
const FRAME_PREVIEW_MAX_AXIS = 128
/** Two one-pixel borders must still leave enough interior for an LED emitter. */
const FRAME_PREVIEW_MIN_HEIGHT = 8
/** How long a node announces itself after the hardware view jumps to it.
 *  Long enough to catch the eye having just moved, short enough not to linger
 *  as if it were a selection state. Must match `.nodeFlash`'s duration. */
const FLASH_MS = 1100
/** A ring's preview is square, and a square as wide as the node body would
 *  dominate a node that already carries the upload UI and a capacity meter. */
const RING_PREVIEW_PX = 116
const CORKSCREW_PREVIEW_H = 150

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
  DMXInput: {
    text: 'preview listens for helper-backed Art-Net; firmware uses the selected DMX source',
    title: 'The browser preview reads Art-Net packets through the local helper. Generated firmware uses this node’s selected DMX source instead: Art-Net over Wi-Fi or DMX512 over an ESP32 transceiver.',
  },
  PowerMonitorInput: {
    text: 'preview readings come from the sliders; firmware reads the INA219',
    title: 'The browser has no sensor to read, so the two sliders stand in for the measured volts and amps and watts is their product, as it is on the device. Generated firmware reads bus and shunt voltage from the monitor over I2C and derives amps from the fitted shunt.',
  },
  RTCInput: {
    text: 'preview follows the configured source; only sync state is simulated',
    title: 'The preview clock matches the configured source: a Manual seed runs forward from when the preview started, NTP shows UTC plus the configured offset, and Compile Time stands in for the build stamp using the browser clock. Preview cannot know real network state, so it always reports synced.',
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
  const updateNodeInternals = useUpdateNodeInternals()
  const signalAuraRef = useRef<HTMLSpanElement>(null)
  const signalMeterRef = useRef<HTMLSpanElement>(null)
  const def = useMemo(() => NODE_LIBRARY.find((entry) => entry.type === d.nodeType), [d.nodeType])
  const sparkPortId = useUiStore((s) =>
    s.sparkPort?.nodeId === id ? (s.sparkPort?.portId ?? null) : null
  )
  /*
   * "I am the one you just clicked on the bench." The hardware view moves the
   * canvas here, and a moved viewport alone does not say which node it moved
   * for — especially in a dense patch where several nodes land on screen.
   *
   * Keyed on the nonce rather than the id so clicking the same part twice
   * flashes twice. One-shot, and box-shadow rather than a filter: an animated
   * CSS filter is the Chromium GPU-memory leak this project already spent a
   * long hunt on (see src/dev/animationFilterGuard.ts).
   */
  const flashNonce = useUiStore((s) => (s.nodeFlash.nodeId === id ? s.nodeFlash.nonce : 0))
  const [flashing, setFlashing] = useState(false)
  const flashTimer = useRef<number | null>(null)
  const lastFlash = useRef(0)
  useEffect(() => {
    // Only ever acts on a *rising* nonce. The store clears the flash on a timer
    // to drop the node's raised z-index, which drives this selector back to 0;
    // cancelling the pulse on that edge — as an effect cleanup would — used to
    // leave the node lit permanently.
    if (!flashNonce || flashNonce === lastFlash.current) return
    lastFlash.current = flashNonce
    setFlashing(true)
    if (flashTimer.current) window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setFlashing(false), FLASH_MS)
  }, [flashNonce])
  useEffect(() => () => {
    if (flashTimer.current) window.clearTimeout(flashTimer.current)
  }, [])
  const performanceMode = useUiStore((s) => s.performanceMode)
  const uiEffectsEnabled = useUiStore((s) => s.uiEffectsEnabled)
  const connectionDrag = useUiStore((s) => s.connectionDrag)
  const selectedFqbn = useUploadStore((s) => s.selectedFqbn)
  const selectedBoardProfile = useGraphStore((s) => selectedPhysicalBoardProfile(rootGraphNodes(s)))
  const signalPathDimEnabled = useUiStore((s) => s.signalPathDimEnabled)
  const focusState = useGraphStore((s) => {
    if (!signalPathDimEnabled || !s.selectedNodeId) return 'neutral'
    return signalPathFor(s.edges, s.selectedNodeId).has(id) ? 'active' : 'dim'
  })
  // Matrix dimensions (from MatrixOutput) set the frame-preview aspect ratio.
  // The matrix a preview thumbnail is drawn for is the project's, not the
  // active graph's — inside a pattern group there is no LED output to read.
  const gridW = useGraphStore((s) => Math.max(1, Math.min(FRAME_PREVIEW_MAX_AXIS, compositionDims(rootGraphNodes(s), rootGraphEdges(s)).w)))
  const gridH = useGraphStore((s) => Math.max(1, Math.min(FRAME_PREVIEW_MAX_AXIS, compositionDims(rootGraphNodes(s), rootGraphEdges(s)).h)))
  const updateNodeProperty = useGraphStore((s) => s.updateNodeProperty)
  const updateNodeProperties = useGraphStore((s) => s.updateNodeProperties)
  const setNodeMinimized = useGraphStore((s) => s.setNodeMinimized)
  const removeNodeCompletely = useGraphStore((s) => s.removeNodeCompletely)
  const setGroupInputRole = useGraphStore((s) => s.setGroupInputRole)
  const pinProperty = useGraphStore((s) => s.pinProperty)
  const unpinProperty = useGraphStore((s) => s.unpinProperty)
  // Select the stable `pins` array reference (only changes on an actual
  // mutation) and derive the per-node lookup with useMemo — building the Map
  // inside the selector itself would return a fresh object every call and
  // spin useSyncExternalStore into an infinite re-render loop.
  const allPins = useGraphStore((s) => s.performanceDeck.pins)
  const pinnedKeys = useMemo(() => {
    const forNode = allPins.filter((p) => p.nodeId === id)
    return forNode.length === 0 ? EMPTY_PIN_MAP : new Map(forNode.map((p) => [p.propertyKey, p.id]))
  }, [allPins, id])
  const bakeStatus = usePerformanceBakeStore((s) => s.byNode[id]?.status)
  const bakeLocked = (bakeStatus ?? usePerformanceBakeStore.getState().byNode[id]?.status ?? 'idle') !== 'idle'
  const categoryAccent = CATEGORY_ACCENT_VAR[d.category] ?? 'var(--accent-output)'
  const rawProps = d.properties as Record<string, unknown>
  const minimized = d.minimized === true
  // A screen design's ports are derived onto the node by the store — widget
  // inputs onto the panel, widget outputs onto the Touch node paired with it —
  // so both halves are read from the node rather than the library. Asking the
  // library for a Touch node's outputs returns the declared `controls` bundle
  // alone, which draws a node with none of the named controls its screen
  // publishes even though the wiring and the saved file both have them.
  // `data.inputs` / `data.outputs` remember a Tidy swap. The library (or the
  // derived list) is still which ports exist; the saved list is only their order.
  const savedInputs = Array.isArray(d.inputs) ? d.inputs : undefined
  const savedOutputs = Array.isArray(d.outputs) ? d.outputs : undefined
  const declaredInputs = orderPorts(
    (hasDerivedDisplayPorts(d.nodeType)
      ? d.inputs ?? def?.inputs ?? []
      : d.nodeType === 'ControlMap'
        ? playerControlInputs(rawProps.controls)
        : d.nodeType === 'RelayOutput'
          ? relayInputs(rawProps.partId)
        : def?.inputs ?? d.inputs ?? []) as PortDef[],
    savedInputs,
  )
  const outputs = orderPorts(
    (d.nodeType === 'ButtonBank'
      ? buttonBankOutputs(rawProps.buttons)
      : hasDerivedDisplayPorts(d.nodeType)
        ? d.outputs ?? def?.outputs ?? []
        : def?.outputs ?? d.outputs ?? []) as PortDef[],
    savedOutputs,
  )

  // Which of this node's input ports are wired, and to which upstream port. When
  // a port is wired the evaluator ignores the matching property, so a pot or
  // audio band makes the inline editor read-only. A touch widget is the
  // exception: the slider is a remote for that widget, so it stays editable.
  // Selected as a stable string so the node only re-renders when its own wiring
  // changes; the parsed source map feeds the live-value lookup below.
  const incomingKey = useGraphStore((s) => incomingKeyFor(s.edges, id))
  const sourceMap = useMemo(() => {
    const m = new Map<string, { srcId: string; srcPort: string }>()
    for (const part of incomingKey.split(';').filter(Boolean)) {
      const [handle, rest] = part.split('>')
      // Widget ports are `widget:<id>:out`. Split only on the first colon so
      // the source node id stays one token and the handle keeps its colons.
      const split = rest.indexOf(':')
      const srcId = split < 0 ? rest : rest.slice(0, split)
      const srcPort = split < 0 ? '' : rest.slice(split + 1)
      m.set(handle, { srcId, srcPort })
    }
    return m
  }, [incomingKey])
  const exposableInputs = exposableInputsFor(d.nodeType)
  const exposedInputs = exposedNodeInputs(d.nodeType, d.exposedInputs, new Set(sourceMap.keys()))
  const exposedInputIds = exposedInputs.map((port) => port.id)
  const inputs = declaredInputs.filter((port) => !exposableInputs.some((exposable) => exposable.id === port.id))
  const compactInputs = [...inputs, ...exposedInputs]
  const portLayoutKey = `${compactInputs.map((port) => port.id).join('|')}::${outputs.map((port) => port.id).join('|')}`
  const rowCount = d.nodeType === 'ButtonBank' || d.nodeType === 'IRRemoteInput'
    ? 0
    : Math.max(inputs.length, outputs.length)
  const paletteEditorLiveJson = usePreviewStore((s) => {
    if (d.nodeType !== 'CustomPalette' && d.nodeType !== 'Poline') return ''
    const ports = d.nodeType === 'CustomPalette'
      ? ['color0', 'color1', 'color2', 'color3']
      : ['colorA', 'colorB', 'colorC']
    const values: Record<string, RGB> = {}
    for (const port of ports) {
      const src = sourceMap.get(port)
      if (!src) continue
      const value = s.outputs.get(src.srcId)?.[src.srcPort]
      if (isRGB(value)) values[port] = value
    }
    return JSON.stringify(values)
  })
  const paletteEditorLive = useMemo<Record<string, RGB>>(
    () => (paletteEditorLiveJson ? JSON.parse(paletteEditorLiveJson) : {}),
    [paletteEditorLiveJson],
  )

  // Inline property editors (Blender-style). A node with `r/g/b` shows one
  // colour swatch; `font` (an object) is left to the Inspector.
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
  const palettePreviewPropsJson = useGraphStore((s) => {
    if (d.nodeType !== 'CustomPalette' && d.nodeType !== 'Poline') return ''
    const node = s.nodes.find((n) => n.id === id)
    const p = (node?.data.properties ?? rawProps) as Record<string, unknown>
    return d.nodeType === 'CustomPalette'
      ? JSON.stringify({ colors: p.colors, positions: p.positions })
      : JSON.stringify({ anchorA: p.anchorA, anchorB: p.anchorB, anchorC: p.anchorC, points: p.points, position: p.position })
  })
  const palettePreviewProps = useMemo<Record<string, unknown>>(
    () => (palettePreviewPropsJson ? { ...props, ...JSON.parse(palettePreviewPropsJson) } : props),
    [palettePreviewPropsJson, props],
  )
  const palettePreviewOverride = useMemo<Palette | undefined>(() => {
    if (d.nodeType === 'CustomPalette') {
      const local = normalizeCustomPalette(palettePreviewProps.colors, palettePreviewProps.positions)
      const colors = local.colors.map((color, i) => paletteEditorLive[`color${i}`] ?? customHexToRgb(color))
      return customPaletteStops16(colors, local.positions)
    }
    if (d.nodeType === 'Poline') {
      const a = paletteEditorLive.colorA ? rgbToHex(paletteEditorLive.colorA) : String(palettePreviewProps.anchorA ?? '#1020ff')
      const b = paletteEditorLive.colorB ? rgbToHex(paletteEditorLive.colorB) : String(palettePreviewProps.anchorB ?? '#ff20a0')
      const c = paletteEditorLive.colorC ? rgbToHex(paletteEditorLive.colorC) : String(palettePreviewProps.anchorC ?? '#20ffd0')
      return polinePalette(
        [polineHexToRgb(a), polineHexToRgb(b), polineHexToRgb(c)],
        Number(palettePreviewProps.points ?? 4),
        String(palettePreviewProps.position ?? 'sinusoidal'),
      )
    }
    return undefined
  }, [d.nodeType, paletteEditorLive, palettePreviewProps])
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
    // Bookkeeping the app keeps for itself, declared in one place rather than
    // added to the chain below each time somebody notices one on their canvas.
    ([k]) => !isInternalProperty(k)
      && k !== 'font' && k !== 'image' && k !== 'animation' && k !== 'mesh' && k !== 'code' && k !== 'globalCode' && k !== 'clampInputs' && k !== 'patternIds' && k !== 'patternSections' && k !== 'transitions' && k !== 'previewHidden' && k !== 'bypassed' && k !== 'showInMainPreview' && k !== 'profileId' && k !== 'sourceId' && k !== 'buttons' && k !== 'controls' && k !== '_ledCountCustom'
    // Pin provenance is bookkeeping, not a setting: which pins the app
    // assigned, which board for, and the user's own choices per board.
    // It was rendering as `[object Object]` rows on every hardware node.
    && k !== ASSIGNED_PINS_KEY && k !== ASSIGNED_BOARD_KEY && k !== USER_PINS_KEY
      && !(d.nodeType === 'CustomPalette' && (k === 'colors' || k === 'positions'))
      && !(d.nodeType === 'Poline' && (k === 'anchorA' || k === 'anchorB' || k === 'anchorC'))
      // Comment's `text` gets its own multi-line editor in the body, not the
      // generic single-line field list.
      && !(isComment && k === 'text')
      // PSRAM controls render in the upload tab — their visibility depends
      // on whether the *selected board* supports PSRAM, which only it knows.
      && k !== 'usePsram' && k !== 'psramPolicy' && k !== 'psramMode' && k !== 'serialRoute'
      // MatrixOutput's width/height are edited via the dedicated size dropdown
      // (16/32/64/Custom) below, not the generic number-field editor.
      && k !== 'width' && k !== 'height'
      // What the output physically *is* belongs to the hardware view: you get
      // a ring by putting a ring on the bench, not by retyping a matrix. A
      // dropdown here let the graph claim a part the bench did not have, which
      // is the one thing the two-view model exists to prevent.
      && k !== 'form'
      && !(d.nodeType === 'StereoVuMeter' && k === 'targetOutputId')
      // Physical wiring and hardware-specific selectors have one owner: the
      // part's popup on the workbench, not a second editor on the graph node.
      && !(isHardwareNodeType(d.nodeType)
        && (isGpioPinProperty(d.nodeType, k) || isHardwarePartField(d.nodeType, k)))
      && !(isGroupInput && k === 'paramId')
      && !(hasRGB && (k === 'r' || k === 'g' || k === 'b'))
      // An inapplicable property is normally shown disabled, which reads as
      // "this exists for the other variants" — useful on a five-property node
      // like Transition. The LED output has forty-six, so a string was showing
      // thirty-three dead rows against thirteen live ones, all sixteen HUB75
      // pins among them. At that ratio the greyed rows stop being context and
      // start being the thing you have to read past, so this one node hides
      // them. Empty groups already drop out below.
      && !(d.nodeType === 'MatrixOutput' && !isPropertyEnabled(d.nodeType, k, props))
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
  const micUnavailable = d.nodeType === 'MicInput'
    && (!selectedBoardProfile || !micSupportedForBoardProfile(selectedBoardProfile, d.properties.partId))
  const micUnavailableMessage = !selectedBoardProfile
    ? MIC_NO_BOARD_MESSAGE
    : micUnsupportedMessage(d.properties.partId)
  const isCustomDefault = useNodeDefaults((s) => d.nodeType === 'MicInput'
    ? selectedFqbn in s.micOverridesByFqbn
    : d.nodeType in s.overrides)

  // Waveform nodes show a scope at the top of the body; this shifts the port
  // handles below it down by the scope height + the body's flex gap. Wave's
  // scope is its own configured shape; ComplexWave's reflects live upstream.
  const isWave = d.nodeType === 'Wave'
  const isComplexWave = d.nodeType === 'ComplexWave'
  const isBeatDetect = d.nodeType === 'BeatDetect'
  const isFFTAnalyzer = d.nodeType === 'FFTAnalyzer'
  const isHardwareInput = d.nodeType === 'ButtonInput' || d.nodeType === 'PotInput' || d.nodeType === 'EncoderInput'
    || d.nodeType === 'MotionInput' || d.nodeType === 'LightInput' || d.nodeType === 'PowerMonitorInput'
    || d.nodeType === 'PresenceInput'
  /*
   * A thumbnail of the part this node is, in the preview slot.
   *
   * Small deliberately. A photoreal module either shrinks past recognition or
   * grows enough to wreck the density that makes a node graph readable, and
   * these nodes already carry a live widget and their pin fields — so the
   * picture confirms which part you are looking at and then gets out of the
   * way. The hardware view is where it is drawn at a size worth studying.
   */
  const partRender = partRenderForNodeType(d.nodeType, props)
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
  const framePreviewH = Math.max(
    FRAME_PREVIEW_MIN_HEIGHT,
    Math.round((BODY_CONTENT_W * gridH) / gridW),
  )
  /*
   * The LED output's own preview, drawn in the shape of the thing it drives.
   *
   * This node has no output port, so it never qualified for the generic
   * preview above — the one node whose whole job is "here is what goes to the
   * LEDs" showed nothing of them. It reads the same publish the hardware view
   * does, through the same component, so a ring draws a ring rather than a row
   * of cells standing in for one.
   */
  const outputShape = useMemo(() => {
    if (d.nodeType !== 'MatrixOutput') return null
    const form = outputForm(rawProps)
    const grid = outputGridDims(rawProps)
    if (form === 'ring') {
      return {
        cols: grid.width,
        rows: 1,
        // A square, but not a 224px one — the node already carries ~20
        // properties, the upload UI and a capacity meter.
        height: RING_PREVIEW_PX,
        width: RING_PREVIEW_PX,
        cellFill: LED_CELL_FILL,
        ring: {
          ledCount: grid.width,
          startAngle: ringStartAngle(rawProps),
          direction: ringDirection(rawProps),
        },
        corkscrew: null,
        frameThumbnail: false,
      }
    }
    if (form === 'corkscrew') {
      const diameter = corkscrewDiameterMm(rawProps)
      const physicalHeight = corkscrewHeightMm(rawProps)
      return {
        cols: grid.width,
        rows: 1,
        height: CORKSCREW_PREVIEW_H,
        width: Math.max(48, Math.min(160, Math.round(CORKSCREW_PREVIEW_H * diameter / physicalHeight))),
        cellFill: LED_CELL_FILL,
        ring: null,
        corkscrew: {
          ledCount: grid.width,
          turns: corkscrewTurns(rawProps),
          startAngle: corkscrewStartAngle(rawProps),
          direction: corkscrewDirection(rawProps),
        },
        frameThumbnail: false,
      }
    }
    if (form === 'strip') {
      // A string is already the same one-row frame shown by its upstream node.
      // Use the generic thumbnail's axis cap, aspect ratio and wrapper as well
      // as its emitter renderer; otherwise a long run becomes tall capsules
      // here while the exact same pixels are small dots at the source.
      const cols = Math.min(FRAME_PREVIEW_MAX_AXIS, grid.width)
      return {
        cols,
        rows: 1,
        height: Math.max(FRAME_PREVIEW_MIN_HEIGHT, Math.round(BODY_CONTENT_W / cols)),
        width: null,
        cellFill: LED_CELL_FILL,
        ring: null,
        corkscrew: null,
        frameThumbnail: true,
      }
    }
    return {
      cols: grid.width,
      rows: grid.height,
      height: Math.round((BODY_CONTENT_W * grid.height) / grid.width),
      width: null,
      cellFill: LED_CELL_FILL,
      ring: null,
      corkscrew: null,
      frameThumbnail: false,
    }
  }, [d.nodeType, rawProps])
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
  const displayName = nodeDisplayLabel(d.nodeType, props, d.label)
  const minimizedType = (outputs[0]?.dataType ?? inputs[0]?.dataType ?? 'control').toUpperCase()
  const minimizedTypeLine = def?.subcategory
    ? `${minimizedType} · ${def.subcategory.toUpperCase()}`
    : minimizedType
  const minimizedDescription = NODE_DESCRIPTIONS[d.nodeType] ?? d.label
  /*
   * The title bar says what this node is, on hover.
   *
   * Two nodes from the same family sit side by side with their names cut
   * short — "Player _" and "Player _" — and the first instinct is to hover the
   * title, which until now said nothing. The name is given in full because the
   * header is exactly where it gets truncated.
   */
  const headerTooltip = NODE_DESCRIPTIONS[d.nodeType]
    ? `${displayName} — ${NODE_DESCRIPTIONS[d.nodeType]}`
    : displayName
  const showLiveNodeVisuals = uiEffectsEnabled

  useEffect(() => {
    if (!showLiveNodeVisuals || !signalKey) {
      applyNodeSignal(signalAuraRef.current, signalMeterRef.current, undefined)
      return
    }
    applyNodeSignal(signalAuraRef.current, signalMeterRef.current, usePreviewStore.getState().signals.get(signalKey))
    return usePreviewStore.subscribe((state) => {
      applyNodeSignal(signalAuraRef.current, signalMeterRef.current, state.signals.get(signalKey))
    })
  }, [showLiveNodeVisuals, signalKey])

  // Collapsing swaps the normal row handles for compact header handles. Tell
  // React Flow to remeasure them after the DOM has committed so every noodle
  // stays attached to its original port while the node changes height.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => updateNodeInternals(id))
    return () => window.cancelAnimationFrame(frame)
  }, [id, minimized, portLayoutKey, updateNodeInternals])

  return (
    <div
      ref={nodeRef}
      className={`${styles.node} ${minimized ? styles.nodeMinimized : ''} ${categoryClass} ${performanceMode ? styles.nodePerformance : ''} ${selected ? styles.nodeSelected : ''} ${focusState === 'dim' ? styles.nodeDim : focusState === 'active' ? styles.nodePath : ''} ${previewKind === 'frame' ? styles.nodeFrameSource : ''} ${flashing ? styles.nodeFlash : ''} ${isMusicLibrary && musicLibraryAnalyzing ? styles.nodeMusicAnalyzing : ''} ${micUnavailable ? styles.nodeDisabled : ''}`}
      style={{
        width: isMusicLibrary ? 300 : isCode ? 320 : isPerfGen ? 300 : isComment ? 260 : undefined,
        '--node-accent': accent,
      } as React.CSSProperties}
    >
      <span ref={signalAuraRef} className={styles.signalAura} aria-hidden="true" />
      <div className={styles.header} style={{ background: accent }} title={headerTooltip}>
        {minimized && compactInputs.map((input, index) => {
          const inputColor = portColor(input.dataType)
          const connectionHint = connectionTargetHint(d.nodeType, input, connectionDrag)
          return (
            <Handle
              key={`compact-input-${input.id}`}
              type="target"
              position={Position.Left}
              id={input.id}
              title={`${input.label} · ${input.dataType}${connectionHint ? ` — ${connectionHint.title}` : ''}`}
              role="button"
              tabIndex={micUnavailable ? -1 : 0}
              isConnectable={!micUnavailable}
              aria-disabled={micUnavailable}
              aria-label={`Connect to ${displayName} ${input.label} input, ${input.dataType}${connectionHint ? `. ${connectionHint.aria}` : ''}. Press Enter or Space to ${sourceMap.has(input.id) ? 'replace the existing connection' : 'choose a source port'}.`}
              onKeyDown={activateHandleFromKeyboard}
              className={connectionHintClass(connectionHint)}
              style={{
                ...NODE_HANDLE_STYLE,
                top: `${((index + 1) / (compactInputs.length + 1)) * 100}%`,
                left: -8,
                background: inputColor,
                boxShadow: `0 0 6px ${inputColor}`,
              }}
            />
          )
        })}
        {minimized && outputs.map((output, index) => {
          const outputColor = portColor(output.dataType)
          return (
            <Handle
              key={`compact-output-${output.id}`}
              type="source"
              position={Position.Right}
              id={output.id}
              title={`${output.label} · ${output.dataType}`}
              role="button"
              tabIndex={micUnavailable ? -1 : 0}
              isConnectable={!micUnavailable}
              aria-disabled={micUnavailable}
              aria-label={`Connect from ${displayName} ${output.label} output, ${output.dataType}. Press Enter or Space to choose a destination port.`}
              onKeyDown={activateHandleFromKeyboard}
              style={{
                ...NODE_HANDLE_STYLE,
                top: `${((index + 1) / (outputs.length + 1)) * 100}%`,
                right: -8,
                background: outputColor,
                boxShadow: `0 0 6px ${outputColor}`,
              }}
            />
          )
        })}
        <span className={styles.headerTitle}>{displayName}</span>
        <span className={styles.headerMeta}>
          <span className={styles.headerTag}>{categoryTag}</span>
          <span className={styles.headerCode}>{headerCode}-{nodeTag}</span>
          {showLiveNodeVisuals && (
            <span ref={signalMeterRef} className={styles.headerMeter} aria-hidden="true">
              <span style={{ opacity: 'clamp(0.2, calc(var(--signal-energy) * 1.5), 1)' }} />
              <span style={{ opacity: 'clamp(0.12, calc((var(--signal-energy) - 0.18) * 1.8), 1)' }} />
              <span style={{ opacity: 'clamp(0.08, calc((var(--signal-energy) - 0.42) * 2.1), 1)' }} />
            </span>
          )}
        </span>
        <span className={styles.headerActions}>
          <button
            type="button"
            className={`nodrag nopan ${styles.headerAction}`}
            onPointerDown={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              setNodeMinimized(id, !minimized)
            }}
            title={minimized ? 'Restore node' : 'Minimize node'}
            aria-label={`${minimized ? 'Restore' : 'Minimize'} ${displayName} node`}
          >
            {minimized ? '□' : '−'}
          </button>
          <button
            type="button"
            className={`nodrag nopan ${styles.headerAction} ${styles.headerDelete}`}
            disabled={d.nodeType === 'Board'}
            onPointerDown={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              removeNodeCompletely(id)
            }}
            title={d.nodeType === 'Board' ? 'The controller board cannot be deleted' : 'Delete node'}
            aria-label={`Delete ${displayName} node`}
          >
            ×
          </button>
        </span>
      </div>
      {minimized && (
        <div className={styles.minimizedInfo}>
          <span className={styles.minimizedType} aria-label={`Node type: ${minimizedTypeLine}`}>
            {minimizedTypeLine}
          </span>
          <span className={styles.minimizedDescription}>{minimizedDescription}</span>
        </div>
      )}
      {!minimized && <div className={styles.body}>
        {micUnavailable && (
          <div className={styles.hardwareUnsupported} role="status">
            {micUnavailableMessage}
          </div>
        )}
        {isComment && (
          <textarea
            className={`nodrag ${styles.commentEditor}`}
            spellCheck={false}
            value={String(props.text ?? '')}
            placeholder="Note…"
            aria-label={`${displayName} comment text`}
            onWheelCapture={stopWheelWhileFocused}
            onChange={(e) => updateNodeProperty(id, 'text', e.target.value)}
          />
        )}
        {showLiveNodeVisuals && isWave && waveSamples && <WaveScope samples={waveSamples} />}
        {showLiveNodeVisuals && isComplexWave && <ComplexWaveScope nodeId={id} />}
        {showLiveNodeVisuals && isBeatDetect && <BeatDetectBody nodeId={id} />}
        {showLiveNodeVisuals && isFFTAnalyzer && <FFTAnalyzerBody nodeId={id} bands={Number(props.bands ?? 24)} />}
        {d.nodeType === 'Audio' && <AudioCapabilityBody nodeId={id} sourceId={props.sourceId} />}
        {d.nodeType === 'Storage' && <StorageCapabilityBody nodeId={id} sourceId={props.sourceId} />}
        {/* Hardware-input widgets are functional preview controls, not purely
            decorative FX, so keep them available even when UI FX are off. */}
        {isHardwareInput && <HardwareInputBody nodeId={id} nodeType={d.nodeType} resetOnPress={props.resetOnPress === true} partId={props.partId} maxLux={props.maxLux} />}
        {d.nodeType === 'ButtonBank' && <ButtonBankBody nodeId={id} />}
        {d.nodeType === 'IRRemoteInput' && <IRRemoteBody nodeId={id} />}
        {d.nodeType === 'ControlMap' && <PlayerControlsBody nodeId={id} />}
        {d.nodeType === 'DMXInput' && <DmxInputBody nodeId={id} />}
        {d.nodeType === 'RTCInput' && <RtcInputBody nodeId={id} />}
        {showLiveNodeVisuals && d.nodeType === 'MidiInput' && <MidiInputBody note={Math.round(Number(props.note ?? 60))} cc={Math.round(Number(props.cc ?? 1))} />}
        {(d.nodeType === 'CustomPalette' || d.nodeType === 'Poline') && (
          <Suspense fallback={null}>
            {d.nodeType === 'CustomPalette' && <CustomPaletteEditorBody nodeId={id} topPlacement />}
            {d.nodeType === 'Poline' && <PolineEditorBody nodeId={id} topPlacement />}
          </Suspense>
        )}
        {showLiveNodeVisuals && previewKind && outPort && d.nodeType !== 'CustomPalette' && d.nodeType !== 'Poline' && (
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
              <NodePreview
                nodeId={id}
                kind={previewKind}
                port={outPort.id}
                height={previewKind === 'frame' ? framePreviewH : undefined}
                cols={gridW}
                rows={gridH}
                valueOverride={palettePreviewOverride}
              />
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
        {partRender && (
          previewHidden ? (
            <button
              type="button"
              className={`nodrag ${styles.previewToggleCollapsed}`}
              onClick={() => updateNodeProperty(id, 'previewHidden', false)}
              title="Show part"
              aria-label="Show part"
            >
              ▸ part
            </button>
          ) : (
            <div className={styles.previewWrap}>
              <img
                className={styles.partThumb}
                src={partRender.src}
                alt={partRender.label}
                title={partRender.label}
                draggable={false}
              />
              <button
                type="button"
                className={`nodrag ${styles.previewToggle}`}
                onClick={() => updateNodeProperty(id, 'previewHidden', true)}
                title="Hide part"
                aria-label="Hide part"
              >
                ▾
              </button>
            </div>
          )
        )}
        {showLiveNodeVisuals && outputShape && (
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
              {outputShape.frameThumbnail ? (
                <NodePreview
                  nodeId={id}
                  kind="frame"
                  port="previewFrame"
                  height={outputShape.height}
                  cols={outputShape.cols}
                  rows={outputShape.rows}
                />
              ) : (
                <div
                  className={`${styles.outputShape} ${outputShape.ring ? styles.outputShapeRing : ''} ${outputShape.corkscrew ? styles.outputShapeCorkscrew : ''}`}
                  style={{
                    height: outputShape.height,
                    width: outputShape.width ?? undefined,
                  }}
                >
                  <HardwareLedPreview
                    nodeId={id}
                    cols={outputShape.cols}
                    rows={outputShape.rows}
                    cellFill={outputShape.cellFill}
                    ring={outputShape.ring}
                    corkscrew={outputShape.corkscrew}
                    className={styles.outputShapeLeds}
                  />
                </div>
              )}
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
          /*
           * An always-drawn input is still backed by a property, so it is a
           * drop target for the Touch node's add-control socket exactly as a
           * hidden property row is — tagged the same way, read off the DOM by
           * the canvas. Judged with this node's own properties and whether
           * the port is already driven, or the hint in the air would claim a
           * control is possible on a port that will refuse it on release.
           */
          const controllable = input
            && controllableInputsFor(d.nodeType).some((port) => port.id === input.id)
          const inputHint = input
            ? connectionTargetHint(d.nodeType, input, connectionDrag, controllable
              ? { properties: d.properties ?? {}, driven: sourceMap.has(input.id) }
              : undefined)
            : null
          return (
            <div
              key={i}
              className={`${styles.portRow}${inputHint ? ` ${connectionHintClass(inputHint)}` : ''}`}
              data-property-input={controllable && input ? `${id}|${input.id}` : undefined}
              data-property-type={controllable && input ? input.dataType : undefined}
            >
              {input && inputColor && (
                <>
                  <Handle
                    type="target"
                    position={Position.Left}
                    id={input.id}
                    title={`${input.label} · ${input.dataType}${inputHint ? ` — ${inputHint.title}` : ''}`}
                    role="button"
                    tabIndex={micUnavailable ? -1 : 0}
                    isConnectable={!micUnavailable}
                    aria-disabled={micUnavailable}
                    aria-label={`Connect to ${displayName} ${input.label} input, ${input.dataType}${inputHint ? `. ${inputHint.aria}` : ''}. Press Enter or Space to ${sourceMap.has(input.id) ? 'replace the existing connection' : 'choose a source port'}.`}
                    onKeyDown={activateHandleFromKeyboard}
                    className={connectionHintClass(inputHint)}
                    style={{ ...NODE_HANDLE_STYLE, top: '50%', left: -8, background: inputColor, boxShadow: `0 0 6px ${inputColor}` }}
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
                  role="button"
                  tabIndex={micUnavailable ? -1 : 0}
                  isConnectable={!micUnavailable}
                  aria-disabled={micUnavailable}
                  aria-label={`Connect from ${displayName} ${output.label} output, ${output.dataType}. Press Enter or Space to choose a destination port.`}
                  onKeyDown={activateHandleFromKeyboard}
                  style={{ ...NODE_HANDLE_STYLE, top: '50%', right: -8, background: outputColor, boxShadow: `0 0 6px ${outputColor}` }}
                />
              )}
            </div>
          )
        })}

        <Suspense fallback={null}>
          {d.nodeType === 'MusicLibrary' && <MusicLibraryNodeBody nodeId={id} />}
          {d.nodeType === 'PerformanceGenerator' && <PerformanceGeneratorBody nodeId={id} />}
          {d.nodeType === 'Image' && <ImageNodeBody nodeId={id} />}
          {d.nodeType === 'Board' && <BoardNodeBody nodeId={id} />}
          {d.nodeType === 'Wireframe3D' && props.model === 'custom' && <Wireframe3DNodeBody nodeId={id} />}
          {d.nodeType === 'TransportDisplay' && <TransportDisplayNodeBody nodeId={id} />}
          {d.nodeType === 'InfoDisplay' && <InfoDisplayNodeBody nodeId={id} />}
          {d.nodeType === 'SegmentDisplay' && <SegmentDisplayNodeBody nodeId={id} />}
          {d.nodeType === 'StereoVuMeter' && <StereoVuMeterNodeBody nodeId={id} />}
          {d.nodeType === 'TouchInput' && <TouchCalibrationBody nodeId={id} />}

          {d.nodeType === 'PatternCollection' && <PatternCollectionBody nodeId={id} />}
          {d.nodeType === 'Transition' && <TransitionPickerBody nodeId={id} />}
          {d.nodeType === 'TransitionSet' && <TransitionSetBody nodeId={id} />}
          {d.nodeType === 'PaletteBank' && <PaletteBankBody nodeId={id} />}


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
              aria-label={`${displayName} global code`}
              onWheelCapture={stopWheelWhileFocused}
              onChange={(e) => updateNodeProperty(id, 'globalCode', e.target.value)}
            />
            <div className={styles.codeLabel}>Loop</div>
            <textarea
              className={`nodrag ${styles.codeEditor}`}
              spellCheck={false}
              value={String(props.code ?? '')}
              placeholder="// loop body — runs each frame, writes into leds[]"
              aria-label={`${displayName} loop code`}
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
          exposedInputIds={exposedInputIds}
          uiEffectsEnabled={uiEffectsEnabled}
          locked={bakeLocked || micUnavailable}
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
          pinnedKeys={pinnedKeys}
          pinProperty={pinProperty}
          unpinProperty={unpinProperty}
        />

        {PREVIEW_NOTES[d.nodeType] && (
          <div className={styles.previewNote} title={PREVIEW_NOTES[d.nodeType].title}>
            ⓘ {PREVIEW_NOTES[d.nodeType].text}
          </div>
        )}
      </div>}
    </div>
  )
}

export default memo(StudioNode)
