import { useEffect, useRef, useState } from 'react'
import { canAddNodeType, useGraphStore } from '../../state/graphStore'
import { NODE_LIBRARY, CATEGORIES, NODE_DESCRIPTIONS, portsCompatible } from '../../state/nodeLibrary'
import { resolveDefaultProperties } from '../../state/nodeDefaults'
import { runTidy } from '../../utils/tidyGraph'
import type { NodeDefinition, NodePort } from '../../types'
import styles from './CanvasContextMenu.module.css'

const FFT_BAND_IDS = ['bass', 'mids', 'treble'] as const
const NODE_BY_TYPE = new Map(NODE_LIBRARY.map((def) => [def.type, def]))

interface DirectSuggestion {
  def: NodeDefinition
  input: NodePort
  reason: string
  score: number
}

interface BridgeStep {
  key: string
  type: string
}

interface BridgeEdge {
  from: 'source' | string
  sourceHandle: string
  to: string
  targetHandle: string
}

interface BridgeSuggestion {
  id: string
  fromType: string
  finalType: string
  title: string
  description: string
  steps: BridgeStep[]
  edges: BridgeEdge[]
}

const BRIDGE_SUGGESTIONS: BridgeSuggestion[] = [
  {
    id: 'frame-to-field',
    fromType: 'frame',
    finalType: 'field',
    title: 'Bridge to field',
    description: 'Insert Frame → Field so this frame can feed field-only processors and warps.',
    steps: [{ key: 'field', type: 'FrameToField' }],
    edges: [{ from: 'source', sourceHandle: '*', to: 'field', targetHandle: 'frame' }],
  },
  {
    id: 'field-to-frame',
    fromType: 'field',
    finalType: 'frame',
    title: 'Bridge to frame',
    description: 'Insert Field → Frame so this field can drive normal effects, output, and show nodes.',
    steps: [{ key: 'frame', type: 'FieldToFrame' }],
    edges: [{ from: 'source', sourceHandle: '*', to: 'frame', targetHandle: 'field' }],
  },
  {
    id: 'color-to-frame',
    fromType: 'color',
    finalType: 'frame',
    title: 'Bridge to frame',
    description: 'Wrap this color in Solid Color so it becomes a full matrix frame.',
    steps: [{ key: 'solid', type: 'SolidColor' }],
    edges: [{ from: 'source', sourceHandle: '*', to: 'solid', targetHandle: 'color' }],
  },
  {
    id: 'palette-to-color',
    fromType: 'palette',
    finalType: 'color',
    title: 'Bridge to color',
    description: 'Sample the palette to a color output you can wire into shapes, text, and fills.',
    steps: [{ key: 'sample', type: 'PaletteSampler' }],
    edges: [{ from: 'source', sourceHandle: '*', to: 'sample', targetHandle: 'paletteIn' }],
  },
  {
    id: 'float-to-color',
    fromType: 'float',
    finalType: 'color',
    title: 'Bridge to color',
    description: 'Map this value into hue on HSV → RGB to create a live color signal.',
    steps: [{ key: 'hsv', type: 'HSVToRGB' }],
    edges: [{ from: 'source', sourceHandle: '*', to: 'hsv', targetHandle: 'h' }],
  },
  {
    id: 'audio-to-frame',
    fromType: 'audio',
    finalType: 'frame',
    title: 'Audio → frame',
    description: 'Analyze the audio, then feed Spectrum Bars so it becomes a visible frame immediately.',
    steps: [
      { key: 'fft', type: 'FFTAnalyzer' },
      { key: 'bars', type: 'SpectrumBars' },
    ],
    edges: [
      { from: 'source', sourceHandle: '*', to: 'fft', targetHandle: 'audio' },
      { from: 'fft', sourceHandle: 'bass', to: 'bars', targetHandle: 'bass' },
      { from: 'fft', sourceHandle: 'mids', to: 'bars', targetHandle: 'mids' },
      { from: 'fft', sourceHandle: 'treble', to: 'bars', targetHandle: 'treble' },
    ],
  },
  {
    id: 'audio-to-color',
    fromType: 'audio',
    finalType: 'color',
    title: 'Audio → color',
    description: 'Analyze the spectrum, map it to hue, then convert that hue into RGB.',
    steps: [
      { key: 'fft', type: 'FFTAnalyzer' },
      { key: 'hue', type: 'AudioHue' },
      { key: 'hsv', type: 'HSVToRGB' },
    ],
    edges: [
      { from: 'source', sourceHandle: '*', to: 'fft', targetHandle: 'audio' },
      { from: 'fft', sourceHandle: 'bass', to: 'hue', targetHandle: 'bass' },
      { from: 'fft', sourceHandle: 'mids', to: 'hue', targetHandle: 'mids' },
      { from: 'fft', sourceHandle: 'treble', to: 'hue', targetHandle: 'treble' },
      { from: 'hue', sourceHandle: 'hue', to: 'hsv', targetHandle: 'h' },
    ],
  },
  {
    id: 'music-to-sdcard',
    fromType: 'music',
    finalType: 'sdcard',
    title: 'Music → SD card',
    description: 'Insert Performance Generator and SD Card so a track can flow straight into the export path.',
    steps: [
      { key: 'perf', type: 'PerformanceGenerator' },
      { key: 'sd', type: 'SDCard' },
    ],
    edges: [
      { from: 'source', sourceHandle: '*', to: 'perf', targetHandle: 'music' },
      { from: 'perf', sourceHandle: 'shows', to: 'sd', targetHandle: 'shows' },
    ],
  },
  {
    id: 'shows-to-sdcard',
    fromType: 'shows',
    finalType: 'sdcard',
    title: 'Bridge to SD card',
    description: 'Insert SD Card so this show output lands on the upload-to-SD path.',
    steps: [{ key: 'sd', type: 'SDCard' }],
    edges: [{ from: 'source', sourceHandle: '*', to: 'sd', targetHandle: 'shows' }],
  },
]

function nodeDescription(def: NodeDefinition) {
  return NODE_DESCRIPTIONS[def.type] ?? def.label
}

function compatibleInputFor(def: NodeDefinition, connectFrom?: { handleId: string; dataType: string }) {
  return connectFrom && def.inputs.find((p) => portsCompatible(connectFrom.dataType, p.dataType))
}

function scoreDirectSuggestion(
  def: NodeDefinition,
  input: NodePort,
  connectFrom: { handleId: string; dataType: string },
  sourceType: string,
) {
  let score = 0
  if (input.id === connectFrom.handleId) score += 40
  if (input.dataType === connectFrom.dataType) score += 24
  if (def.spliceInput === input.id) score += 18
  if (def.inputs.length === 1) score += 10
  if (def.outputs.some((port) => port.dataType === input.dataType)) score += 8
  if (connectFrom.dataType === 'frame' && input.id === 'frame') score += 12
  if (connectFrom.dataType === 'field' && input.id === 'field') score += 12
  if (connectFrom.dataType === 'color' && input.id === 'color') score += 12
  if (connectFrom.dataType === 'audio' && input.id === 'audio') score += 12
  if (sourceType === 'FFTAnalyzer' && FFT_BAND_IDS.includes(connectFrom.handleId as typeof FFT_BAND_IDS[number])) {
    if (FFT_BAND_IDS.every((band) => def.inputs.some((port) => port.id === band))) score += 50
  }
  return score
}

function suggestionReason(
  def: NodeDefinition,
  input: NodePort,
  connectFrom: { handleId: string; dataType: string },
  sourceType: string,
) {
  if (
    sourceType === 'FFTAnalyzer' &&
    FFT_BAND_IDS.includes(connectFrom.handleId as typeof FFT_BAND_IDS[number]) &&
    FFT_BAND_IDS.every((band) => def.inputs.some((port) => port.id === band))
  ) {
    return 'Wires bass, mids, and treble together in one drop.'
  }
  if (def.spliceInput === input.id) return `Built to sit inline on an existing ${connectFrom.dataType} path.`
  if (input.id === connectFrom.handleId) return `Connects straight into its ${input.label} input.`
  if (def.outputs.some((port) => port.dataType === 'frame') && connectFrom.dataType !== 'frame') {
    return `Turns ${connectFrom.dataType} data into a frame you can preview right away.`
  }
  if (def.outputs.some((port) => port.dataType === input.dataType)) {
    return `Keeps the same ${connectFrom.dataType} signal flowing while shaping it.`
  }
  return `Accepts ${connectFrom.dataType} on ${input.label}.`
}

interface Props {
  x: number
  y: number
  flowPosition: { x: number; y: number }
  /**
   * When present, a noodle was dragged from this output onto empty canvas:
   * the menu opens straight into a picker limited to nodes with a compatible
   * input, and auto-wires the chosen node back to this output.
   */
  connectFrom?: { nodeId: string; handleId: string; dataType: string }
  /**
   * Called after a drag-to-create node is added and auto-wired, with the new
   * node id and the input handle it was wired to, so the canvas can reposition
   * the node to sit its connected handle at the drop point.
   */
  onPlaced?: (nodeId: string, handleId: string, flow: { x: number; y: number }) => void
  /** Open straight into the search picker (e.g. Tab / double-click empty canvas), without a drag-to-create origin. */
  startInPicker?: boolean
  onClose: () => void
}

export default function CanvasContextMenu({ x, y, flowPosition, connectFrom, onPlaced, startInPicker, onClose }: Props) {
  const { addNode, onConnect, clipboard, pasteNode, selectAllNodes, deleteSelection, nodes } = useGraphStore()
  const menuRef = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<'main' | 'picker'>(connectFrom || startInPicker ? 'picker' : 'main')
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (mode === 'picker' && !connectFrom && !startInPicker) setMode('main')
        else onClose()
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose, mode, connectFrom, startInPicker])

  useEffect(() => {
    if (mode === 'picker') inputRef.current?.focus()
  }, [mode])

  const sourceNode = connectFrom ? nodes.find((node) => node.id === connectFrom.nodeId) : undefined
  const sourceType = String(sourceNode?.data.nodeType ?? '')
  const normalizedQuery = query.trim().toLowerCase()

  const createNode = (def: NodeDefinition, id: string, position: { x: number; y: number }) => ({
    id,
    type: 'studioNode',
    position,
    data: {
      label: def.label,
      nodeType: def.type,
      category: def.category,
      properties: resolveDefaultProperties(def.type, def.defaultProperties),
      inputs: def.inputs,
      outputs: def.outputs,
    },
  })

  const directSuggestions: DirectSuggestion[] = connectFrom
    ? NODE_LIBRARY
      .filter((def) => canAddNodeType(nodes, def.type))
      .map((def) => {
        const input = compatibleInputFor(def, connectFrom)
        if (!input) return null
        const reason = suggestionReason(def, input, connectFrom, sourceType)
        const score = scoreDirectSuggestion(def, input, connectFrom, sourceType)
        const haystack = `${def.label} ${nodeDescription(def)} ${reason} ${input.label}`.toLowerCase()
        return normalizedQuery === '' || haystack.includes(normalizedQuery)
          ? { def, input, reason, score }
          : null
      })
      .filter((entry): entry is DirectSuggestion => !!entry)
      .sort((a, b) => b.score - a.score || a.def.label.localeCompare(b.def.label))
    : []

  const bridgeSuggestions = connectFrom
    ? BRIDGE_SUGGESTIONS
      .filter((bridge) => bridge.fromType === connectFrom.dataType)
      .filter((bridge) => {
        const stagedNodes = [...nodes]
        return bridge.steps.every((step) => {
          if (!canAddNodeType(stagedNodes, step.type)) return false
          const def = NODE_BY_TYPE.get(step.type)
          if (!def) return false
          stagedNodes.push(createNode(def, `${step.type}-staged`, flowPosition))
          return true
        })
      })
      .filter((bridge) => {
        if (normalizedQuery === '') return true
        const path = bridge.steps.map((step) => NODE_BY_TYPE.get(step.type)?.label ?? step.type).join(' ')
        return `${bridge.title} ${bridge.description} ${bridge.finalType} ${path}`.toLowerCase().includes(normalizedQuery)
      })
    : []

  const placeNode = (def: NodeDefinition) => {
    if (!canAddNodeType(nodes, def.type)) return
    const id = `${def.type}-${Date.now()}`
    addNode(createNode(def, id, flowPosition))
    // Auto-wire the dragged output to the new node's first compatible input.
    if (connectFrom) {
      const shouldFanOutAudio =
        sourceType === 'FFTAnalyzer' &&
        FFT_BAND_IDS.includes(connectFrom.handleId as typeof FFT_BAND_IDS[number]) &&
        FFT_BAND_IDS.every((band) => def.inputs.some((p) => p.id === band))

      if (shouldFanOutAudio) {
        for (const band of FFT_BAND_IDS) {
          onConnect({
            source: connectFrom.nodeId,
            sourceHandle: band,
            target: id,
            targetHandle: band,
          })
        }
        // Anchor to the first wired band so the fanned-out node lands on the drop.
        onPlaced?.(id, FFT_BAND_IDS[0], flowPosition)
        onClose()
        return
      }

      const input = compatibleInputFor(def, connectFrom)
      if (input) {
        onConnect({
          source: connectFrom.nodeId,
          sourceHandle: connectFrom.handleId,
          target: id,
          targetHandle: input.id,
        })
        onPlaced?.(id, input.id, flowPosition)
      }
    }
    onClose()
  }

  const placeBridge = (bridge: BridgeSuggestion) => {
    if (!connectFrom) return
    const ids = new Map<string, string>()
    const stamp = Date.now()
    const spacing = 220
    bridge.steps.forEach((step, index) => {
      const def = NODE_BY_TYPE.get(step.type)
      if (!def) return
      const id = `${step.type}-${stamp}-${index}`
      ids.set(step.key, id)
      addNode(createNode(def, id, {
        x: flowPosition.x + index * spacing,
        y: flowPosition.y,
      }), index === 0)
    })
    let anchored = false
    bridge.edges.forEach((edge) => {
      const source = edge.from === 'source' ? connectFrom.nodeId : ids.get(edge.from)
      const target = ids.get(edge.to)
      if (!source || !target) return
      const sourceHandle = edge.from === 'source'
        ? edge.sourceHandle === '*' ? connectFrom.handleId : edge.sourceHandle
        : edge.sourceHandle
      onConnect({
        source,
        sourceHandle,
        target,
        targetHandle: edge.targetHandle,
      })
      if (!anchored && edge.from === 'source') {
        onPlaced?.(target, edge.targetHandle, flowPosition)
        anchored = true
      }
    })
    onClose()
  }

  const filtered = NODE_LIBRARY.filter(
    (n) =>
      (query === '' || n.label.toLowerCase().includes(query.toLowerCase())) &&
      (!connectFrom || !!compatibleInputFor(n, connectFrom)) &&
      canAddNodeType(nodes, n.type)
  )

  const canPaste = !!clipboard && clipboard.nodes.some((n) => canAddNodeType(nodes, n.data.nodeType))
  const hasSelection = nodes.some((n) => n.selected)

  const act = (fn: () => void) => { fn(); onClose() }

  if (mode === 'picker') {
    return (
      <div ref={menuRef} className={styles.menu} style={{ left: x, top: y }}>
        {connectFrom && (
          <div className={styles.catLabel}>Drag-to-create from {connectFrom.dataType}</div>
        )}
        <input
          ref={inputRef}
          className={styles.search}
          placeholder={connectFrom ? `Search ${connectFrom.dataType} nodes…` : 'Search nodes…'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className={styles.nodeList}>
          {connectFrom ? (
            <>
              {directSuggestions.length > 0 && (
                <div className={styles.section}>
                  <div className={styles.catLabel}>Best matches</div>
                  <div className={styles.suggestionList}>
                    {directSuggestions.map(({ def, input, reason }) => (
                      <button
                        key={def.type}
                        type="button"
                        data-suggestion-type="direct"
                        data-node-type={def.type}
                        className={styles.suggestionCard}
                        onClick={() => placeNode(def)}
                      >
                        <span className={styles.suggestionTitle}>{def.label}</span>
                        <span className={styles.suggestionDesc}>{nodeDescription(def)}</span>
                        <span className={styles.suggestionWhy}>{reason}</span>
                        <span className={styles.suggestionMeta}>{input.label} input · {def.category}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {bridgeSuggestions.length > 0 && (
                <div className={styles.section}>
                  <div className={styles.catLabel}>Bridge chains</div>
                  <div className={styles.suggestionList}>
                    {bridgeSuggestions.map((bridge) => (
                      <button
                        key={bridge.id}
                        type="button"
                        data-suggestion-type="bridge"
                        data-bridge-id={bridge.id}
                        className={styles.suggestionCard}
                        onClick={() => placeBridge(bridge)}
                      >
                        <span className={styles.suggestionTitle}>{bridge.title}</span>
                        <span className={styles.suggestionDesc}>
                          {bridge.steps.map((step) => NODE_BY_TYPE.get(step.type)?.label ?? step.type).join(' → ')}
                        </span>
                        <span className={styles.suggestionWhy}>{bridge.description}</span>
                        <span className={styles.suggestionMeta}>{bridge.finalType} output</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {directSuggestions.length === 0 && bridgeSuggestions.length === 0 && (
                <div className={styles.emptyState}>No compatible nodes or bridge chains match this search.</div>
              )}
            </>
          ) : (
            CATEGORIES.map((cat) => {
              const nodes = filtered.filter((n) => n.category === cat.id)
              if (nodes.length === 0) return null
              return (
                <div key={cat.id}>
                  <div className={styles.catLabel}>{cat.label}</div>
                  {nodes.map((n) => (
                    <button key={n.type} className={styles.nodeItem} onClick={() => placeNode(n)}>
                      {n.label}
                    </button>
                  ))}
                </div>
              )
            })
          )}
        </div>
      </div>
    )
  }

  return (
    <div ref={menuRef} className={styles.menu} style={{ left: x, top: y }}>
      <button className={styles.item} onClick={() => setMode('picker')}>
        Add Node ▶
      </button>
      <div className={styles.divider} />
      <button className={styles.item} onClick={() => act(selectAllNodes)}>
        Select All
      </button>
      <button
        className={`${styles.item} ${!hasSelection ? styles.disabled : ''}`}
        disabled={!hasSelection}
        onClick={() => { if (hasSelection) act(deleteSelection) }}
      >
        Delete Selected
      </button>
      <button className={styles.item} onClick={() => act(() => { runTidy() })}>
        Tidy Graph
      </button>
      <button
        className={`${styles.item} ${!canPaste ? styles.disabled : ''}`}
        disabled={!canPaste}
        onClick={() => { if (canPaste) act(() => pasteNode(flowPosition)) }}
      >
        {clipboard && clipboard.nodes.length > 1 ? `Paste ${clipboard.nodes.length} Nodes` : 'Paste'}
      </button>
    </div>
  )
}
