import { useEffect, useRef, useState } from 'react'
import { useGraphStore } from '../../state/graphStore'
import styles from './LEDPreview.module.css'

const GRID = 16
const PIXEL = 28
const GLOW = 4

function generateFrame(tick: number, hasFireNode: boolean, hasNoiseNode: boolean): number[][] {
  const frame: number[][] = []
  for (let y = 0; y < GRID; y++) {
    const row: number[] = []
    for (let x = 0; x < GRID; x++) {
      if (hasFireNode) {
        const heat = Math.max(0, 1 - y / GRID + Math.sin(tick * 0.05 + x * 0.5) * 0.2)
        row.push(heat)
      } else if (hasNoiseNode) {
        const v = Math.sin(x * 0.5 + tick * 0.04) * Math.cos(y * 0.5 + tick * 0.03)
        row.push((v + 1) / 2)
      } else {
        const v = Math.sin(x * 0.3 + tick * 0.06) * Math.cos(y * 0.3 + tick * 0.05)
        row.push((v + 1) / 2)
      }
    }
    frame.push(row)
  }
  return frame
}

function valueToColor(v: number, tick: number, hasFireNode: boolean, hasNoiseNode: boolean): string {
  if (hasFireNode) {
    const r = Math.round(Math.min(255, v * 400))
    const g = Math.round(Math.max(0, (v - 0.4) * 255))
    return `rgb(${r},${g},0)`
  }
  if (hasNoiseNode) {
    const hue = (v * 360 + tick * 2) % 360
    return `hsl(${hue},100%,${Math.round(v * 50 + 20)}%)`
  }
  const hue = (v * 240 + tick) % 360
  return `hsl(${hue},100%,${Math.round(v * 50 + 20)}%)`
}

export default function LEDPreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const tickRef = useRef(0)
  const animRef = useRef<number>(0)
  const [fps, setFps] = useState(0)
  const lastFpsTime = useRef(performance.now())
  const frameCount = useRef(0)

  const nodes = useGraphStore((s) => s.nodes)
  const hasFireNode = nodes.some((n) => n.type === 'studioNode' && (n.data as { label?: string }).label === 'Fire')
  const hasNoiseNode = nodes.some((n) => n.type === 'studioNode' && (n.data as { label?: string }).label === 'Noise Field')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const render = () => {
      tickRef.current++
      const tick = tickRef.current
      const frame = generateFrame(tick, hasFireNode, hasNoiseNode)

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      for (let y = 0; y < GRID; y++) {
        for (let x = 0; x < GRID; x++) {
          const v = frame[y][x]
          const color = valueToColor(v, tick, hasFireNode, hasNoiseNode)
          ctx.fillStyle = color
          ctx.shadowColor = color
          ctx.shadowBlur = GLOW * (0.5 + v)
          ctx.fillRect(x * PIXEL + 2, y * PIXEL + 2, PIXEL - 4, PIXEL - 4)
        }
      }

      frameCount.current++
      const now = performance.now()
      if (now - lastFpsTime.current >= 1000) {
        setFps(frameCount.current)
        frameCount.current = 0
        lastFpsTime.current = now
      }

      animRef.current = requestAnimationFrame(render)
    }

    animRef.current = requestAnimationFrame(render)
    return () => cancelAnimationFrame(animRef.current)
  }, [hasFireNode, hasNoiseNode])

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span>LED Preview</span>
        <span className={styles.fps}>{fps} fps</span>
      </div>
      <div className={styles.canvasWrap}>
        <canvas
          ref={canvasRef}
          width={GRID * PIXEL}
          height={GRID * PIXEL}
          className={styles.canvas}
        />
      </div>
    </div>
  )
}
