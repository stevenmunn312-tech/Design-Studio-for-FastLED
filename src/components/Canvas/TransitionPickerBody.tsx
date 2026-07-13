import { useEffect, useMemo, useRef, useState } from 'react'
import { useGraphStore } from '../../state/graphStore'
import { PROPERTY_META } from '../../state/nodeLibrary'
import { compositeTransition, type Frame } from '../../state/graphEvaluator'
import styles from './TransitionPickerBody.module.css'

const ALL_TRANSITIONS = (PROPERTY_META.transitionType as { options: readonly string[] }).options
const EMPTY: string[] = []
const W = 16
const H = 8

function color(r: number, g: number, b: number) {
  return { r, g, b }
}

function sampleFrames(): { a: Frame; b: Frame } {
  const a: Frame = []
  const b: Frame = []
  for (let y = 0; y < H; y++) {
    const rowA = []
    const rowB = []
    for (let x = 0; x < W; x++) {
      rowA.push((x + y) % 5 === 0 ? color(255, 230, 80) : color(16 + x * 5, 32, 115 + y * 10))
      rowB.push((x - y + W) % 4 === 0 ? color(50, 255, 220) : color(120 + y * 10, 20 + x * 4, 170))
    }
    a.push(rowA)
    b.push(rowB)
  }
  return { a, b }
}

const SAMPLE = sampleFrames()

function Thumb({ type, t, selected }: { type: string; t: number; selected: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const frame = useMemo(() => compositeTransition(type, SAMPLE.a, SAMPLE.b, t, W, H, {
    dir: 'right',
    axis: 'horizontal',
    tileSize: 3,
    count: 4,
    turns: 2,
  }), [type, t])

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    canvas.width = W
    canvas.height = H
    const image = ctx.createImageData(W, H)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4
        const p = frame[y][x]
        image.data[i] = p.r
        image.data[i + 1] = p.g
        image.data[i + 2] = p.b
        image.data[i + 3] = 255
      }
    }
    ctx.putImageData(image, 0, 0)
  }, [frame])

  return <canvas ref={ref} className={`${styles.thumb}${selected ? ` ${styles.thumbOn}` : ''}`} aria-hidden="true" />
}

export function TransitionBody({ nodeId }: { nodeId: string }) {
  const props = useGraphStore(
    (s) => (s.nodes.find((n) => n.id === nodeId)?.data.properties as Record<string, unknown> | undefined) ?? {},
  )
  const updateNodeProperties = useGraphStore((s) => s.updateNodeProperties)
  const selected = String(props.transitionType ?? 'crossfade')
  const t = Math.max(0, Math.min(1, Number(props.t ?? 0.5)))

  return (
    <div className={`nodrag ${styles.wrap}`}>
      <div className={styles.header}>
        <span>Transition preview</span>
        <span className={styles.readout}>{Math.round(t * 100)}%</span>
      </div>
      <input
        className={`nowheel ${styles.scrub}`}
        aria-label="Scrub transition progress"
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={t}
        onChange={(e) => updateNodeProperties(nodeId, { t: Number(e.target.value) })}
      />
      <div className={styles.grid}>
        {ALL_TRANSITIONS.map((type) => (
          <button
            key={type}
            type="button"
            className={`${styles.card}${selected === type ? ` ${styles.on}` : ''}`}
            onClick={() => updateNodeProperties(nodeId, { transitionType: type })}
            title={`Use ${type}`}
            aria-pressed={selected === type}
          >
            <Thumb type={type} t={t} selected={selected === type} />
            <span>{type}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function TransitionSetBody({ nodeId }: { nodeId: string }) {
  const [t, setT] = useState(0.5)
  const pool = useGraphStore(
    (s) => ((s.nodes.find((n) => n.id === nodeId)?.data.properties as { transitions?: string[] } | undefined)?.transitions) ?? EMPTY,
  )
  const updateNodeProperty = useGraphStore((s) => s.updateNodeProperty)

  const toggle = (tt: string) => {
    const next = pool.includes(tt) ? pool.filter((x) => x !== tt) : [...pool, tt]
    updateNodeProperty(nodeId, 'transitions', next)
  }

  const allOn = pool.length === ALL_TRANSITIONS.length
  const toggleAll = () => updateNodeProperty(nodeId, 'transitions', allOn ? [] : [...ALL_TRANSITIONS])

  return (
    <div className={`nodrag ${styles.wrap}`}>
      <div className={styles.header}>
        <span>Extra transitions ({pool.length})</span>
        <button type="button" className={styles.allBtn} onClick={toggleAll}>
          {allOn ? 'clear' : 'all'}
        </button>
      </div>
      <input
        className={`nowheel ${styles.scrub}`}
        aria-label="Scrub transition thumbnail progress"
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={t}
        onChange={(e) => setT(Number(e.target.value))}
      />
      <div className={styles.grid}>
        {ALL_TRANSITIONS.map((type) => {
          const included = pool.includes(type)
          return (
            <button
              key={type}
              type="button"
              className={`${styles.card}${included ? ` ${styles.on}` : ''}`}
              onClick={() => toggle(type)}
              title={included ? `Remove ${type}` : `Add ${type}`}
              aria-pressed={included}
            >
              <Thumb type={type} t={t} selected={included} />
              <span>{type}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
