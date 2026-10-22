import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useModalFocus } from '../../hooks/useModalFocus'
import { NETWORK_MAX_EDGES, NETWORK_MAX_NODES, fitNetworkToCanvas, presetNetwork, type SegmentNetwork } from '../../state/output/segmentNetwork'
import { CANVAS_H, CANVAS_W, networkFromProperties, networkToJson } from './segmentNetworkEditorModel'
import styles from './SegmentNetworkEditor.module.css'

// The one place a segment network is edited (docs/design/segment-networks.md):
// nodes as draggable dots, edges as lines in wiring order, with the edge list
// beside the canvas. The JSON property stays the saved form, so a project
// file carries it and a share link works; this dialog only spares the typing.

export interface SegmentNetworkEditorProps {
  /** The node's current properties: `networkPreset`, `network`. */
  properties: Record<string, unknown>
  title: string
  onClose: () => void
  /** Writes the edited network as the custom JSON and selects the custom preset. */
  onCommit: (updates: { networkPreset: 'custom'; network: string }) => void
}

const SCALE = 36
const NODE_R = 7

type Pick = { kind: 'node'; index: number } | { kind: 'edge'; index: number } | null

export default function SegmentNetworkEditor({ properties, title, onClose, onCommit }: SegmentNetworkEditorProps) {
  const dialogRef = useModalFocus<HTMLDivElement>(onClose)
  const [network, setNetwork] = useState<SegmentNetwork>(() => networkFromProperties(properties))
  const [selected, setSelected] = useState<Pick>(null)
  /** The node a connect gesture started from. */
  const [connectFrom, setConnectFrom] = useState<number | null>(null)
  const dragRef = useRef<{ index: number; moved: boolean } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const edgeKeys = useMemo(() => new Set(network.edges.map(([a, b]) => (a < b ? `${a}-${b}` : `${b}-${a}`))), [network.edges])
  const canAddNode = network.nodes.length < NETWORK_MAX_NODES
  const canAddEdge = network.edges.length < NETWORK_MAX_EDGES
  const valid = network.nodes.length >= 2 && network.edges.length >= 1

  const toUnits = (event: { clientX: number; clientY: number }): [number, number] => {
    const box = svgRef.current?.getBoundingClientRect()
    if (!box || box.width === 0) return [0, 0]
    const x = ((event.clientX - box.left) / box.width) * CANVAS_W
    const y = ((event.clientY - box.top) / box.height) * CANVAS_H
    return [Math.max(0, Math.min(CANVAS_W, x)), Math.max(0, Math.min(CANVAS_H, y))]
  }

  const addNode = (x: number, y: number) => {
    if (!canAddNode) return
    setNetwork((n) => ({ ...n, nodes: [...n.nodes, [x, y]] }))
    setSelected({ kind: 'node', index: network.nodes.length })
    setConnectFrom(null)
  }

  const connect = (from: number, to: number) => {
    if (from === to || !canAddEdge) return
    const key = from < to ? `${from}-${to}` : `${to}-${from}`
    if (edgeKeys.has(key)) return
    setNetwork((n) => ({ ...n, edges: [...n.edges, [from, to]] }))
    setSelected({ kind: 'edge', index: network.edges.length })
  }

  const flipEdge = (index: number) => {
    setNetwork((n) => ({ ...n, edges: n.edges.map((e, i) => (i === index ? [e[1], e[0]] : e)) }))
  }

  const moveEdge = (index: number, delta: -1 | 1) => {
    const target = index + delta
    if (target < 0 || target >= network.edges.length) return
    setNetwork((n) => {
      const edges = [...n.edges]
      ;[edges[index], edges[target]] = [edges[target], edges[index]]
      return { ...n, edges }
    })
    setSelected({ kind: 'edge', index: target })
  }

  const deleteSelected = () => {
    if (!selected) return
    if (selected.kind === 'edge') {
      setNetwork((n) => ({ ...n, edges: n.edges.filter((_, i) => i !== selected.index) }))
    } else {
      const gone = selected.index
      setNetwork((n) => ({
        nodes: n.nodes.filter((_, i) => i !== gone),
        edges: n.edges
          .filter(([a, b]) => a !== gone && b !== gone)
          .map(([a, b]) => [a > gone ? a - 1 : a, b > gone ? b - 1 : b]),
      }))
    }
    setSelected(null)
    setConnectFrom(null)
  }

  const loadPreset = (preset: 'hexagons' | 'triangles') => {
    setNetwork(fitNetworkToCanvas(presetNetwork(preset), CANVAS_W, CANVAS_H))
    setSelected(null)
    setConnectFrom(null)
  }

  const onNodePointerDown = (index: number, event: React.PointerEvent) => {
    event.stopPropagation()
    dragRef.current = { index, moved: false }
    ;(event.currentTarget as Element).setPointerCapture?.(event.pointerId)
  }

  const onNodePointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const [x, y] = toUnits(event)
    drag.moved = true
    setNetwork((n) => ({ ...n, nodes: n.nodes.map((p, i) => (i === drag.index ? [x, y] : p)) }))
  }

  const onNodePointerUp = (index: number) => {
    const drag = dragRef.current
    dragRef.current = null
    if (drag?.moved) return
    // A click: connect from the armed node, or arm this one.
    if (connectFrom !== null && connectFrom !== index) {
      connect(connectFrom, index)
      setConnectFrom(null)
    } else {
      setSelected({ kind: 'node', index })
      setConnectFrom(connectFrom === index ? null : index)
    }
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if ((event.target as HTMLElement).tagName === 'INPUT') return
      event.preventDefault()
      deleteSelected()
    }
  }

  return createPortal(
    <div className={styles.backdrop}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="segment-network-title"
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <header className={styles.bar}>
          <h2 id="segment-network-title">{title} network</h2>
          <button type="button" onClick={() => loadPreset('hexagons')}>Hexagons</button>
          <button type="button" onClick={() => loadPreset('triangles')}>Triangles</button>
          <button type="button" onClick={deleteSelected} disabled={!selected}>Delete</button>
          <button type="button" onClick={onClose}>Cancel</button>
          <button
            type="button"
            disabled={!valid}
            onClick={() => onCommit({ networkPreset: 'custom', network: networkToJson(network) })}
          >
            Apply
          </button>
        </header>
        <p className={styles.hint}>
          Click empty space to add a node. Click a node, then another, to join them. Drag a node to move it.
          Click an edge to flip its direction. Edges run in wiring order, from the first to the last.
        </p>
        <div className={styles.body}>
          <svg
            ref={svgRef}
            className={styles.canvas}
            viewBox={`0 0 ${CANVAS_W * SCALE} ${CANVAS_H * SCALE}`}
            role="img"
            aria-label="Network canvas"
            data-node-count={network.nodes.length}
            data-edge-count={network.edges.length}
            onPointerDown={(event) => {
              const [x, y] = toUnits(event)
              addNode(x, y)
            }}
            onPointerMove={onNodePointerMove}
          >
            {network.edges.map(([a, b], index) => {
              const [ax, ay] = network.nodes[a]
              const [bx, by] = network.nodes[b]
              const isSelected = selected?.kind === 'edge' && selected.index === index
              return (
                <g key={`e${index}`} data-edge={index} data-edge-from={a} data-edge-to={b}>
                  <line
                    x1={ax * SCALE} y1={ay * SCALE} x2={bx * SCALE} y2={by * SCALE}
                    className={isSelected ? styles.edgeSelected : styles.edge}
                    onPointerDown={(event) => { event.stopPropagation(); setSelected({ kind: 'edge', index }); flipEdge(index) }}
                  />
                  <text
                    x={(ax + bx) / 2 * SCALE} y={(ay + by) / 2 * SCALE}
                    className={styles.edgeLabel} textAnchor="middle" dominantBaseline="middle"
                  >
                    {index + 1}
                  </text>
                </g>
              )
            })}
            {network.nodes.map(([x, y], index) => {
              const isSelected = selected?.kind === 'node' && selected.index === index
              return (
                <circle
                  key={`n${index}`}
                  data-node={index}
                  cx={x * SCALE} cy={y * SCALE} r={NODE_R}
                  className={connectFrom === index ? styles.nodeArmed : isSelected ? styles.nodeSelected : styles.node}
                  onPointerDown={(event) => onNodePointerDown(index, event)}
                  onPointerUp={() => onNodePointerUp(index)}
                />
              )
            })}
          </svg>
          <ol className={styles.edgeList} aria-label="Wiring order">
            {network.edges.map(([a, b], index) => (
              <li key={index} className={selected?.kind === 'edge' && selected.index === index ? styles.edgeRowSelected : styles.edgeRow}>
                <button type="button" className={styles.edgeName} onClick={() => setSelected({ kind: 'edge', index })}>
                  {a} → {b}
                </button>
                <button type="button" aria-label={`Move edge ${index + 1} up`} onClick={() => moveEdge(index, -1)} disabled={index === 0}>↑</button>
                <button type="button" aria-label={`Move edge ${index + 1} down`} onClick={() => moveEdge(index, 1)} disabled={index === network.edges.length - 1}>↓</button>
                <button type="button" aria-label={`Flip edge ${index + 1}`} onClick={() => flipEdge(index)}>⇄</button>
              </li>
            ))}
          </ol>
        </div>
        <p className={styles.status}>
          {network.nodes.length} nodes, {network.edges.length} edges
          {!valid ? ' · needs two nodes and one edge' : ''}
          {!canAddNode ? ` · at the ${NETWORK_MAX_NODES}-node limit` : ''}
          {!canAddEdge ? ` · at the ${NETWORK_MAX_EDGES}-edge limit` : ''}
        </p>
      </div>
    </div>,
    document.body,
  )
}
