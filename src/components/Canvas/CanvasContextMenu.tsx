import { useEffect, useRef, useState } from 'react'
import { useGraphStore } from '../../state/graphStore'
import { NODE_LIBRARY, CATEGORIES, portsCompatible } from '../../state/nodeLibrary'
import type { NodeDefinition } from '../../types'
import styles from './CanvasContextMenu.module.css'

const FFT_BAND_IDS = ['bass', 'mids', 'treble'] as const

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
  onClose: () => void
}

export default function CanvasContextMenu({ x, y, flowPosition, connectFrom, onPlaced, onClose }: Props) {
  const { addNode, onConnect, clipboard, pasteNode, selectAllNodes, nodes } = useGraphStore()
  const menuRef = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<'main' | 'picker'>(connectFrom ? 'picker' : 'main')
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // First input on `def` that accepts the dragged output's type.
  const compatibleInput = (def: NodeDefinition) =>
    connectFrom && def.inputs.find((p) => portsCompatible(connectFrom.dataType, p.dataType))

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (mode === 'picker' && !connectFrom) setMode('main')
        else onClose()
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose, mode, connectFrom])

  useEffect(() => {
    if (mode === 'picker') inputRef.current?.focus()
  }, [mode])

  const placeNode = (def: NodeDefinition) => {
    const id = `${def.type}-${Date.now()}`
    addNode({
      id,
      type: 'studioNode',
      position: flowPosition,
      data: {
        label: def.label,
        nodeType: def.type,
        category: def.category,
        properties: def.defaultProperties ?? {},
        inputs: def.inputs,
        outputs: def.outputs,
      },
    })
    // Auto-wire the dragged output to the new node's first compatible input.
    if (connectFrom) {
      const sourceNode = nodes.find((n) => n.id === connectFrom.nodeId)
      const sourceType = (sourceNode?.data as { nodeType?: string } | undefined)?.nodeType
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

      const input = compatibleInput(def)
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

  const filtered = NODE_LIBRARY.filter(
    (n) =>
      (query === '' || n.label.toLowerCase().includes(query.toLowerCase())) &&
      (!connectFrom || !!compatibleInput(n))
  )

  const act = (fn: () => void) => { fn(); onClose() }

  if (mode === 'picker') {
    return (
      <div ref={menuRef} className={styles.menu} style={{ left: x, top: y }}>
        {connectFrom && (
          <div className={styles.catLabel}>Nodes accepting {connectFrom.dataType}</div>
        )}
        <input
          ref={inputRef}
          className={styles.search}
          placeholder={connectFrom ? `Search ${connectFrom.dataType} nodes…` : 'Search nodes…'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className={styles.nodeList}>
          {CATEGORIES.map((cat) => {
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
          })}
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
        className={`${styles.item} ${!clipboard ? styles.disabled : ''}`}
        onClick={() => { if (clipboard) act(() => pasteNode(flowPosition)) }}
      >
        Paste
      </button>
    </div>
  )
}
