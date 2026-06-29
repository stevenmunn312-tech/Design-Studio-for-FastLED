import { useEffect, useRef, useState } from 'react'
import { useGraphStore, getGroupRegistry } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'
import { useAudioStore } from '../../state/audioStore'
import { evaluateGraphFull, type Frame } from '../../state/graphEvaluator'
import { usePreviewStore } from '../../state/previewStore'
import { WebGLLEDRenderer } from './webglRenderer'
import styles from './LEDPreview.module.css'

const MAX_CANVAS_PX = 448
const GLOW_RADIUS = 5
const NUM_BARS = 16

// Idle animation shown when no nodes are on the canvas
function idleFrame(tick: number, gridW: number, gridH: number): Frame {
  const t = tick / 60
  return Array.from({ length: gridH }, (_, y) =>
    Array.from({ length: gridW }, (_, x) => {
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

function renderFrame(ctx: CanvasRenderingContext2D, frame: Frame, pixel: number) {
  const gridH = frame.length
  const gridW = frame[0]?.length ?? 0
  ctx.clearRect(0, 0, gridW * pixel, gridH * pixel)
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      const { r, g, b } = frame[y][x]
      const color = `rgb(${r},${g},${b})`
      const brightness = (r + g + b) / (3 * 255)
      ctx.fillStyle = color
      ctx.shadowColor = color
      ctx.shadowBlur = GLOW_RADIUS * (0.3 + brightness * 1.2)
      ctx.fillRect(x * pixel + 2, y * pixel + 2, pixel - 4, pixel - 4)
    }
  }
}

export default function LEDPreview() {
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const glRef       = useRef<WebGLLEDRenderer | null>(null)
  const tickRef     = useRef(0)
  const animRef     = useRef<number>(0)
  const [fps, setFps] = useState(0)
  const lastFpsTime   = useRef(performance.now())
  const frameCount    = useRef(0)
  // Wall-clock time base so the preview animates at real-time speed regardless
  // of the display refresh rate (matching the firmware's millis()-based timing).
  const startTime     = useRef(0)
  const lastStep      = useRef(0)
  // Per-node previews refresh slower than the main canvas to bound React work.
  const lastPreviewPublish = useRef(0)

  const nodes = useGraphStore((s) => s.nodes)
  const edges = useGraphStore((s) => s.edges)
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  useEffect(() => { nodesRef.current = nodes }, [nodes])
  useEffect(() => { edgesRef.current = edges }, [edges])

  // Read grid dimensions from MatrixOutput node
  const outputNode = useGraphStore((s) =>
    s.nodes.find((n) => (n.data as { nodeType?: string }).nodeType === 'MatrixOutput')
  )
  const gridW = Math.max(2, Math.min(64, Number(outputNode?.data.properties.width  ?? 16)))
  const gridH = Math.max(2, Math.min(64, Number(outputNode?.data.properties.height ?? 16)))
  const pixel = Math.max(4, Math.floor(MAX_CANVAS_PX / Math.max(gridW, gridH)))
  const gridWRef = useRef(gridW)
  const gridHRef = useRef(gridH)
  const pixelRef = useRef(pixel)
  useEffect(() => { gridWRef.current = gridW; gridHRef.current = gridH; pixelRef.current = pixel }, [gridW, gridH, pixel])

  const preview3d = useUiStore((s) => s.preview3d)
  const togglePreview3d = useUiStore((s) => s.togglePreview3d)
  // Orbit angles for 3D mode (degrees): pitch about X, yaw about Y.
  const [rot, setRot] = useState({ x: 50, y: 0 })
  const drag = useRef<{ x: number; y: number } | null>(null)

  const onRotateDown = (e: React.PointerEvent) => {
    if (!preview3d) return
    drag.current = { x: e.clientX, y: e.clientY }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onRotateMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y
    drag.current = { x: e.clientX, y: e.clientY }
    setRot((r) => ({ x: Math.max(0, Math.min(90, r.x - dy * 0.5)), y: r.y + dx * 0.5 }))
  }
  const onRotateUp = () => { drag.current = null }

  const { active: audioActive, spectrum, startAudio, stopAudio } = useAudioStore()
  const spectrumRef = useRef(spectrum)
  useEffect(() => { spectrumRef.current = spectrum }, [spectrum])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Try WebGL first, fall back to Canvas 2D
    let useWebGL = false
    try {
      glRef.current = new WebGLLEDRenderer(canvas)
      useWebGL = true
    } catch {
      glRef.current = null
    }
    const ctx = useWebGL ? null : canvas.getContext('2d')

    const STEP = 1000 / 60   // simulate at 60 steps/sec regardless of display Hz

    const loop = () => {
      // A single bad frame (e.g. a malformed graph) must not tear down the
      // animation loop, so swallow errors and keep scheduling the next frame.
      try {
        const now = performance.now()
        if (startTime.current === 0) { startTime.current = now; lastStep.current = now }
        // Gate to ~60fps off the wall clock: on high-refresh displays this skips
        // the extra rAF callbacks instead of advancing time faster than real.
        if (now - lastStep.current < STEP) {
          animRef.current = requestAnimationFrame(loop)
          return
        }
        lastStep.current = now
        // t = tick / 60 = seconds elapsed, matching the firmware's millis()/1000.
        const tick = (now - startTime.current) / STEP
        tickRef.current = tick
        const gW = gridWRef.current, gH = gridHRef.current, px = pixelRef.current
        // One evaluation pass feeds both the main matrix and every node preview.
        const { frame: rendered, outputs } = evaluateGraphFull(nodesRef.current, edgesRef.current, tick, gW, gH, getGroupRegistry())
        const frame = rendered ?? idleFrame(tick, gW, gH)

        if (useWebGL && glRef.current) {
          glRef.current.render(frame, gW, gH, px)
        } else if (ctx) {
          if (canvas.width !== gW * px || canvas.height !== gH * px) {
            canvas.width = gW * px; canvas.height = gH * px
          }
          renderFrame(ctx, frame, px)
        }

        // Beat pulses last one evaluation frame, so publish them immediately;
        // the regular 15fps preview throttle would otherwise miss most beats.
        const hasBeat = Array.from(outputs.values()).some((output) => output.beat === true)
        if (hasBeat || now - lastPreviewPublish.current >= 66) {
          usePreviewStore.getState().setOutputs(outputs)
          lastPreviewPublish.current = now
        }

        frameCount.current++
        if (now - lastFpsTime.current >= 1000) {
          const count = frameCount.current
          setFps(count)
          useUiStore.getState().setFps(count)
          frameCount.current = 0
          lastFpsTime.current = now
        }
      } catch (err) {
        console.error('LED preview frame failed:', err)
      }

      animRef.current = requestAnimationFrame(loop)
    }

    animRef.current = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(animRef.current)
      glRef.current?.destroy()
      glRef.current = null
    }
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
            className={`${styles.micBtn} ${preview3d ? styles.micActive : ''}`}
            onClick={togglePreview3d}
            title={preview3d ? 'Switch to 2D view' : 'Switch to 3D view (drag to orbit)'}
          >
            {preview3d ? '3D' : '2D'}
          </button>
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
      <div className={`${styles.canvasWrap} ${preview3d ? styles.canvasWrap3d : ''}`}>
        <canvas
          ref={canvasRef}
          width={gridW * pixel}
          height={gridH * pixel}
          className={styles.canvas}
          style={preview3d ? { transform: `rotateX(${rot.x}deg) rotateY(${rot.y}deg)`, cursor: drag.current ? 'grabbing' : 'grab' } : undefined}
          onPointerDown={onRotateDown}
          onPointerMove={onRotateMove}
          onPointerUp={onRotateUp}
          onPointerCancel={onRotateUp}
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
