import { useEffect, useRef, useState } from 'react'
import { useGraphStore } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'
import { useAudioStore } from '../../state/audioStore'
import { evaluateGraph, type Frame } from '../../state/graphEvaluator'
import styles from './LEDPreview.module.css'

const GRID = 16
const PIXEL = 28
const GLOW_RADIUS = 5
const NUM_BARS = 16

// Idle animation shown when no nodes are on the canvas
function idleFrame(tick: number): Frame {
  const t = tick / 60
  return Array.from({ length: GRID }, (_, y) =>
    Array.from({ length: GRID }, (_, x) => {
      const v = (Math.sin(x * 0.4 + t * 0.8) + Math.cos(y * 0.4 + t * 0.6)) / 2
      const hue = (v + 1) * 90 + t * 15
      const h = ((hue % 360) + 360) % 360
      const s = 1, lv = 0.5
      const c = lv * s
      const xc = c * (1 - Math.abs(((h / 60) % 2) - 1))
      const m = lv - c
      let r = 0, g = 0, b = 0
      if      (h < 60)  { r = c; g = xc }
      else if (h < 120) { r = xc; g = c }
      else if (h < 180) { g = c; b = xc }
      else if (h < 240) { g = xc; b = c }
      else if (h < 300) { r = xc; b = c }
      else              { r = c; b = xc }
      return {
        r: Math.round((r + m) * 255),
        g: Math.round((g + m) * 255),
        b: Math.round((b + m) * 255),
      }
    })
  )
}

function renderFrame(ctx: CanvasRenderingContext2D, frame: Frame) {
  ctx.clearRect(0, 0, GRID * PIXEL, GRID * PIXEL)
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const { r, g, b } = frame[y][x]
      const color = `rgb(${r},${g},${b})`
      const brightness = (r + g + b) / (3 * 255)
      ctx.fillStyle = color
      ctx.shadowColor = color
      ctx.shadowBlur = GLOW_RADIUS * (0.3 + brightness * 1.2)
      ctx.fillRect(x * PIXEL + 2, y * PIXEL + 2, PIXEL - 4, PIXEL - 4)
    }
  }
}

export default function LEDPreview() {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const tickRef    = useRef(0)
  const animRef    = useRef<number>(0)
  const [fps, setFps] = useState(0)
  const lastFpsTime   = useRef(performance.now())
  const frameCount    = useRef(0)

  const nodes = useGraphStore((s) => s.nodes)
  const edges = useGraphStore((s) => s.edges)
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  useEffect(() => { nodesRef.current = nodes }, [nodes])
  useEffect(() => { edgesRef.current = edges }, [edges])

  const { active: audioActive, spectrum, startAudio, stopAudio } = useAudioStore()
  const spectrumRef = useRef(spectrum)
  useEffect(() => { spectrumRef.current = spectrum }, [spectrum])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const loop = () => {
      tickRef.current++
      const tick = tickRef.current
      const frame = evaluateGraph(nodesRef.current, edgesRef.current, tick) ?? idleFrame(tick)
      renderFrame(ctx, frame)

      frameCount.current++
      const now = performance.now()
      if (now - lastFpsTime.current >= 1000) {
        const count = frameCount.current
        setFps(count)
        useUiStore.getState().setFps(count)
        frameCount.current = 0
        lastFpsTime.current = now
      }

      animRef.current = requestAnimationFrame(loop)
    }

    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [])

  const toggleMic = () => {
    if (audioActive) stopAudio()
    else startAudio().catch(() => {})
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span>LED Preview</span>
        <div className={styles.headerRight}>
          <button
            className={`${styles.micBtn} ${audioActive ? styles.micActive : ''}`}
            onClick={toggleMic}
            title={audioActive ? 'Stop microphone' : 'Start microphone'}
          >
            {audioActive ? '🎙' : '🎤'}
          </button>
          <span className={styles.fps}>{fps} fps</span>
        </div>
      </div>
      <div className={styles.canvasWrap}>
        <canvas
          ref={canvasRef}
          width={GRID * PIXEL}
          height={GRID * PIXEL}
          className={styles.canvas}
        />
      </div>
      {audioActive && (
        <div className={styles.visualizer} aria-hidden>
          {Array.from({ length: NUM_BARS }, (_, i) => (
            <div
              key={i}
              className={styles.bar}
              style={{
                height: `${Math.max(2, spectrum[i] * 100)}%`,
                background: `hsl(${180 + i * 8}, 100%, 55%)`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
