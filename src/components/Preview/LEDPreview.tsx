import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties } from 'react'
import { useGraphStore, getGroupRegistry, type StudioNode, type StudioEdge } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'
import { useAudioStore } from '../../state/audioStore'
import { evaluateGraphFull, type Frame } from '../../state/graphEvaluator'
import { usePreviewStore } from '../../state/previewStore'
import { useShowPlayback } from '../../state/showPlayback'
import { usePlayerTransport } from '../../state/playerTransport'
import { renderShowFrame } from '../../state/showPreview'
import { WebGLLEDRenderer } from './webglRenderer'
import { isDiffusedStyle, previewStyleLabel, type PreviewStyle } from './previewStyles'
import {
  IconAdd,
  IconClear,
  IconNext,
  IconPause,
  IconPlay,
  IconPrev,
  IconVolume,
  IconVolumeMuted,
} from './PlayerIcons'
import styles from './LEDPreview.module.css'

const MAX_CANVAS_PX = 448
const FULLSCREEN_CANVAS_PX = 1080
const GLOW_RADIUS = 14
const NUM_BARS = 28
const DIFFUSION_BG = 'rgb(4,3,9)'
let diffusionScratch: HTMLCanvasElement | null = null
let diffusionSourceScratch: HTMLCanvasElement | null = null

interface CanvasStyleConfig {
  atmosphereInner: string
  atmosphereMid: string
  edgeBlurMul: number
  closeBlurMul: number
  midBlurMul: number
  farBlurMul: number
  farFilter: string
  farAlpha: number
  midFilter: string
  midAlpha: number
  closeFilter: string
  closeAlpha: number
  edgeFilter: string
  edgeAlpha: number
  veilTop: string
  veilMid: string
  veilBottom: string
  finalFilter: string
  finalScreenAlpha: number
  finalGlowAlpha: number
}

const CANVAS_STYLE_CONFIG: Record<Exclude<PreviewStyle, 'standard'>, CanvasStyleConfig> = {
  soft: {
    atmosphereInner: 'rgba(34, 28, 54, 0.32)',
    atmosphereMid: 'rgba(12, 11, 22, 0.18)',
    edgeBlurMul: 0.08,
    closeBlurMul: 0.18,
    midBlurMul: 0.62,
    farBlurMul: 1.52,
    farFilter: 'saturate(1.08) brightness(1.04)',
    farAlpha: 0.96,
    midFilter: 'saturate(1.14) brightness(1.06)',
    midAlpha: 0.92,
    closeFilter: 'saturate(1.08) brightness(1.02)',
    closeAlpha: 0.12,
    edgeFilter: 'saturate(1.02) brightness(1.01)',
    edgeAlpha: 0.03,
    veilTop: 'rgba(255, 245, 255, 0.045)',
    veilMid: 'rgba(234, 238, 255, 0.03)',
    veilBottom: 'rgba(255, 248, 240, 0.022)',
    finalFilter: 'saturate(1.08) brightness(1.06) contrast(0.96)',
    finalScreenAlpha: 0.22,
    finalGlowAlpha: 0.12,
  },
  dreamy: {
    atmosphereInner: 'rgba(44, 38, 70, 0.42)',
    atmosphereMid: 'rgba(15, 13, 28, 0.24)',
    edgeBlurMul: 0.1,
    closeBlurMul: 0.22,
    midBlurMul: 0.74,
    farBlurMul: 1.7,
    farFilter: 'saturate(1.18) brightness(1.08)',
    farAlpha: 1,
    midFilter: 'saturate(1.24) brightness(1.12)',
    midAlpha: 0.98,
    closeFilter: 'saturate(1.12) brightness(1.04)',
    closeAlpha: 0.14,
    edgeFilter: 'saturate(1.04) brightness(1.01)',
    edgeAlpha: 0.04,
    veilTop: 'rgba(255, 244, 255, 0.06)',
    veilMid: 'rgba(232, 238, 255, 0.045)',
    veilBottom: 'rgba(255, 248, 240, 0.032)',
    finalFilter: 'saturate(1.12) brightness(1.08) contrast(0.92)',
    finalScreenAlpha: 0.3,
    finalGlowAlpha: 0.18,
  },
  cyberpunk: {
    atmosphereInner: 'rgba(38, 26, 78, 0.44)',
    atmosphereMid: 'rgba(13, 10, 32, 0.24)',
    edgeBlurMul: 0.14,
    closeBlurMul: 0.26,
    midBlurMul: 0.58,
    farBlurMul: 1.18,
    farFilter: 'saturate(1.54) brightness(1.2) hue-rotate(-5deg)',
    farAlpha: 0.78,
    midFilter: 'saturate(1.72) brightness(1.28) hue-rotate(-4deg)',
    midAlpha: 0.98,
    closeFilter: 'saturate(1.86) brightness(1.34)',
    closeAlpha: 0.44,
    edgeFilter: 'saturate(2.02) brightness(1.46) contrast(1.18)',
    edgeAlpha: 0.34,
    veilTop: 'rgba(255, 236, 255, 0.04)',
    veilMid: 'rgba(226, 236, 255, 0.026)',
    veilBottom: 'rgba(255, 244, 255, 0.018)',
    finalFilter: 'saturate(1.18) brightness(1.1) contrast(1.04)',
    finalScreenAlpha: 0.38,
    finalGlowAlpha: 0.24,
  },
  neon: {
    atmosphereInner: 'rgba(42, 36, 68, 0.4)',
    atmosphereMid: 'rgba(15, 13, 28, 0.22)',
    edgeBlurMul: 0.16,
    closeBlurMul: 0.34,
    midBlurMul: 0.72,
    farBlurMul: 1.42,
    farFilter: 'saturate(1.46) brightness(1.14) hue-rotate(-4deg)',
    farAlpha: 0.84,
    midFilter: 'saturate(1.72) brightness(1.28) hue-rotate(-3deg)',
    midAlpha: 0.94,
    closeFilter: 'saturate(1.84) brightness(1.36)',
    closeAlpha: 0.58,
    edgeFilter: 'saturate(1.95) brightness(1.44) contrast(1.18)',
    edgeAlpha: 0.48,
    veilTop: 'rgba(255, 244, 255, 0.055)',
    veilMid: 'rgba(232, 238, 255, 0.04)',
    veilBottom: 'rgba(255, 248, 240, 0.03)',
    finalFilter: 'saturate(1.32) brightness(1.14) contrast(1.12)',
    finalScreenAlpha: 0.44,
    finalGlowAlpha: 0.28,
  },
  crt: {
    atmosphereInner: 'rgba(36, 28, 62, 0.36)',
    atmosphereMid: 'rgba(14, 12, 24, 0.2)',
    edgeBlurMul: 0.14,
    closeBlurMul: 0.28,
    midBlurMul: 0.6,
    farBlurMul: 1.22,
    farFilter: 'saturate(1.32) brightness(1.12)',
    farAlpha: 0.86,
    midFilter: 'saturate(1.5) brightness(1.2)',
    midAlpha: 0.92,
    closeFilter: 'saturate(1.62) brightness(1.26)',
    closeAlpha: 0.36,
    edgeFilter: 'saturate(1.72) brightness(1.32) contrast(1.18)',
    edgeAlpha: 0.22,
    veilTop: 'rgba(255, 244, 255, 0.032)',
    veilMid: 'rgba(232, 236, 250, 0.02)',
    veilBottom: 'rgba(255, 248, 240, 0.014)',
    finalFilter: 'saturate(1.14) brightness(1.08) contrast(1.02)',
    finalScreenAlpha: 0.28,
    finalGlowAlpha: 0.18,
  },
}

const clamp01 = (value: unknown) =>
  Math.max(0, Math.min(1, typeof value === 'number' && Number.isFinite(value) ? value : 0))

function resample(values: number[], count: number): number[] {
  if (!values.length) return Array(count).fill(0)
  return Array.from({ length: count }, (_, i) => {
    const start = Math.floor((i * values.length) / count)
    const end = Math.max(start + 1, Math.ceil(((i + 1) * values.length) / count))
    const slice = values.slice(start, end)
    return clamp01(slice.reduce((sum, value) => sum + clamp01(value), 0) / slice.length)
  })
}

function fmtTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`
}

// A locally-opened audio file in the simple player's playlist.
interface LocalTrack {
  id: string
  name: string
  url: string
}

let nextTrackId = 0

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

// True when a PerformanceGenerator's `frame` output feeds a MatrixOutput — the
// signal the main preview should show that generator's live show playback.
function genWiredToOutput(nodes: StudioNode[], edges: StudioEdge[], genId: string): boolean {
  const matrixIds = new Set(
    nodes
      .filter((n) => (n.data as { nodeType?: string }).nodeType === 'MatrixOutput')
      .map((n) => n.id),
  )
  return edges.some(
    (e) =>
      e.source === genId &&
      e.sourceHandle === 'frame' &&
      e.targetHandle === 'frame' &&
      matrixIds.has(e.target),
  )
}

function renderGridFrame(ctx: CanvasRenderingContext2D, frame: Frame, pixel: number) {
  const gridH = frame.length
  const gridW = frame[0]?.length ?? 0
  ctx.clearRect(0, 0, gridW * pixel, gridH * pixel)
  ctx.fillStyle = '#14181d'
  ctx.fillRect(0, 0, gridW * pixel, gridH * pixel)
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      const { r, g, b } = frame[y][x]
      const color = `rgb(${r},${g},${b})`
      const brightness = (r + g + b) / (3 * 255)
      const inset = Math.max(1, Math.floor(pixel * 0.08))
      const size = Math.max(1, pixel - inset * 2)
      ctx.fillStyle = color
      ctx.shadowColor = color
      ctx.shadowBlur = GLOW_RADIUS * (0.45 + brightness * 1.9)
      ctx.fillRect(x * pixel + inset, y * pixel + inset, size, size)
    }
  }
}

function renderDiffusionFrame(ctx: CanvasRenderingContext2D, frame: Frame, pixel: number, style: Exclude<PreviewStyle, 'standard'>) {
  const gridH = frame.length
  const gridW = frame[0]?.length ?? 0
  const width = gridW * pixel
  const height = gridH * pixel
  const cfg = CANVAS_STYLE_CONFIG[style]
  if (!diffusionScratch) diffusionScratch = document.createElement('canvas')
  if (!diffusionSourceScratch) diffusionSourceScratch = document.createElement('canvas')
  if (diffusionScratch.width !== width || diffusionScratch.height !== height) {
    diffusionScratch.width = width
    diffusionScratch.height = height
  }
  if (diffusionSourceScratch.width !== gridW || diffusionSourceScratch.height !== gridH) {
    diffusionSourceScratch.width = gridW
    diffusionSourceScratch.height = gridH
  }
  const scratch = diffusionScratch.getContext('2d')
  const source = diffusionSourceScratch.getContext('2d')
  if (!scratch || !source) {
    renderGridFrame(ctx, frame, pixel)
    return
  }

  const image = source.createImageData(gridW, gridH)
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      const i = (y * gridW + x) * 4
      const p = frame[y]?.[x] ?? { r: 0, g: 0, b: 0 }
      image.data[i] = p.r
      image.data[i + 1] = p.g
      image.data[i + 2] = p.b
      image.data[i + 3] = 255
    }
  }
  source.putImageData(image, 0, 0)

  scratch.clearRect(0, 0, width, height)
  const atmosphere = scratch.createRadialGradient(
    width * 0.54, height * 0.48, 0,
    width * 0.54, height * 0.48, Math.max(width, height) * 0.72,
  )
  atmosphere.addColorStop(0, cfg.atmosphereInner)
  atmosphere.addColorStop(0.42, cfg.atmosphereMid)
  atmosphere.addColorStop(1, 'rgba(4, 3, 9, 0)')
  scratch.fillStyle = DIFFUSION_BG
  scratch.fillRect(0, 0, width, height)
  scratch.fillStyle = atmosphere
  scratch.fillRect(0, 0, width, height)
  scratch.imageSmoothingEnabled = true

  const edgeBlur = Math.max(2.2, pixel * cfg.edgeBlurMul)
  const closeBlur = Math.max(4, pixel * cfg.closeBlurMul)
  const midBlur = Math.max(8, pixel * cfg.midBlurMul)
  const farBlur = Math.max(16, pixel * cfg.farBlurMul)

  scratch.save()
  scratch.filter = `blur(${farBlur}px) ${cfg.farFilter}`
  scratch.globalAlpha = cfg.farAlpha
  scratch.drawImage(diffusionSourceScratch, 0, 0, width, height)
  scratch.restore()

  scratch.save()
  scratch.globalCompositeOperation = 'screen'
  scratch.filter = `blur(${midBlur}px) ${cfg.midFilter}`
  scratch.globalAlpha = cfg.midAlpha
  scratch.drawImage(diffusionSourceScratch, 0, 0, width, height)
  scratch.restore()

  scratch.save()
  scratch.globalCompositeOperation = 'lighter'
  scratch.filter = `blur(${closeBlur}px) ${cfg.closeFilter}`
  scratch.globalAlpha = cfg.closeAlpha
  scratch.drawImage(diffusionSourceScratch, 0, 0, width, height)
  scratch.restore()

  scratch.save()
  scratch.globalCompositeOperation = 'screen'
  scratch.filter = `blur(${edgeBlur}px) ${cfg.edgeFilter}`
  scratch.globalAlpha = cfg.edgeAlpha
  scratch.drawImage(diffusionSourceScratch, 0, 0, width, height)
  scratch.restore()

  if (style === 'crt') {
    scratch.save()
    scratch.globalCompositeOperation = 'screen'
    scratch.fillStyle = 'rgba(255, 255, 255, 0.035)'
    for (let y = 0; y < height; y += 3) scratch.fillRect(0, y, width, 1)
    scratch.restore()
  }

  const veil = scratch.createLinearGradient(0, 0, 0, height)
  veil.addColorStop(0, cfg.veilTop)
  veil.addColorStop(0.45, cfg.veilMid)
  veil.addColorStop(1, cfg.veilBottom)
  scratch.fillStyle = veil
  scratch.fillRect(0, 0, width, height)

  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = DIFFUSION_BG
  ctx.fillRect(0, 0, width, height)
  ctx.imageSmoothingEnabled = true
  ctx.save()
  ctx.filter = `blur(${Math.max(1.1, pixel * 0.16)}px) ${cfg.finalFilter}`
  ctx.globalAlpha = 1
  ctx.drawImage(diffusionScratch, 0, 0)
  ctx.restore()
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  ctx.globalAlpha = cfg.finalScreenAlpha
  ctx.drawImage(diffusionScratch, 0, 0)
  ctx.restore()
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = cfg.finalGlowAlpha
  ctx.drawImage(diffusionScratch, 0, 0)
  ctx.restore()
}

function renderFrame(ctx: CanvasRenderingContext2D, frame: Frame, pixel: number, style: PreviewStyle) {
  if (style !== 'standard') renderDiffusionFrame(ctx, frame, pixel, style)
  else renderGridFrame(ctx, frame, pixel)
}

export default function LEDPreview() {
  const canvasWrapRef = useRef<HTMLDivElement>(null)
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const glRef       = useRef<WebGLLEDRenderer | null>(null)
  const tickRef     = useRef(0)
  const animRef     = useRef<number>(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }))
  const [canvasWrapSize, setCanvasWrapSize] = useState({ width: 0, height: 0 })
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
  const fullscreenCanvasPx = Math.min(FULLSCREEN_CANVAS_PX, viewport.width, viewport.height)
  const wrapEl = canvasWrapRef.current
  const wrapStyle = wrapEl ? window.getComputedStyle(wrapEl) : null
  const wrapPadX = wrapStyle ? Number.parseFloat(wrapStyle.paddingLeft) + Number.parseFloat(wrapStyle.paddingRight) : 0
  const wrapPadY = wrapStyle ? Number.parseFloat(wrapStyle.paddingTop) + Number.parseFloat(wrapStyle.paddingBottom) : 0
  const availableCanvasW = Math.max(0, canvasWrapSize.width - wrapPadX)
  const availableCanvasH = Math.max(0, canvasWrapSize.height - wrapPadY)
  const windowedPixelLimit = Math.min(
    MAX_CANVAS_PX,
    availableCanvasW > 0 ? availableCanvasW / gridW : MAX_CANVAS_PX,
    availableCanvasH > 0 ? availableCanvasH / gridH : MAX_CANVAS_PX,
  )
  const pixel = isFullscreen
    ? fullscreenCanvasPx / Math.max(gridW, gridH)
    : Math.max(1, Math.floor(windowedPixelLimit))
  const gridWRef = useRef(gridW)
  const gridHRef = useRef(gridH)
  const pixelRef = useRef(pixel)
  useEffect(() => { gridWRef.current = gridW; gridHRef.current = gridH; pixelRef.current = pixel }, [gridW, gridH, pixel])

  const preview3d = useUiStore((s) => s.preview3d)
  const previewStyle = useUiStore((s) => s.previewStyle)
  const togglePreview3d = useUiStore((s) => s.togglePreview3d)
  const cyclePreviewStyle = useUiStore((s) => s.cyclePreviewStyle)
  const previewStyleRef = useRef(previewStyle)
  useEffect(() => { previewStyleRef.current = previewStyle }, [previewStyle])
  // Orbit angles for 3D mode (degrees): pitch about X, yaw about Y.
  const [rot, setRot] = useState({ x: 50, y: 0 })
  const drag = useRef<{ x: number; y: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const playerRef = useRef<HTMLAudioElement>(null)
  const [tracks, setTracks] = useState<LocalTrack[]>([])
  const [trackIndex, setTrackIndex] = useState(0)
  const [musicReady, setMusicReady] = useState(false)
  const [musicPlaying, setMusicPlaying] = useState(false)
  const [musicCurrentTime, setMusicCurrentTime] = useState(0)
  const [musicDuration, setMusicDuration] = useState(0)
  const [musicError, setMusicError] = useState<string | null>(null)
  // Resume playback after a prev/next track switch once the new file loads.
  const pendingPlayRef = useRef(false)
  const tracksRef = useRef<LocalTrack[]>([])
  useEffect(() => { tracksRef.current = tracks }, [tracks])

  // When a PerformanceGenerator has a show selected, its transport takes over
  // this player; otherwise the local playlist plays.
  const transport = usePlayerTransport((s) => s.transport)
  const showPosMs = usePlayerTransport((s) => s.posMs)
  const showPlaying = usePlayerTransport((s) => s.playing)
  const volume = usePlayerTransport((s) => s.volume)
  const setVolume = usePlayerTransport((s) => s.setVolume)
  const lastAudibleVolume = useRef(volume > 0 ? volume : 0.9)

  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(document.fullscreenElement === canvasWrapRef.current)
    const syncViewport = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    syncFullscreen()
    syncViewport()
    document.addEventListener('fullscreenchange', syncFullscreen)
    window.addEventListener('resize', syncViewport)
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen)
      window.removeEventListener('resize', syncViewport)
    }
  }, [])

  useEffect(() => {
    const canvasWrap = canvasWrapRef.current
    if (!canvasWrap) return

    const syncSize = () => {
      setCanvasWrapSize({
        width: canvasWrap.clientWidth,
        height: canvasWrap.clientHeight,
      })
    }

    syncSize()
    const observer = new ResizeObserver(syncSize)
    observer.observe(canvasWrap)
    return () => observer.disconnect()
  }, [])

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

  const toggleFullscreen = async () => {
    const canvasWrap = canvasWrapRef.current
    if (!canvasWrap) return
    try {
      if (document.fullscreenElement === canvasWrap) await document.exitFullscreen()
      else await canvasWrap.requestFullscreen()
    } catch {
      // Ignore rejected fullscreen requests; the button will simply do nothing.
    }
  }

  const { mode: audioMode, previewSpectrum, startAudio, attachAudioElement, stopAudio } = useAudioStore()
  const spectrumRef = useRef(previewSpectrum)
  useEffect(() => { spectrumRef.current = previewSpectrum }, [previewSpectrum])
  const peakRef = useRef(Array(NUM_BARS).fill(0))

  const displaySpectrum = resample(previewSpectrum, NUM_BARS).map((value, i, arr) => {
    const prev = arr[i - 1] ?? value
    const next = arr[i + 1] ?? value
    return clamp01(value * 0.55 + ((prev + value + next) / 3) * 0.45)
  })

  peakRef.current = displaySpectrum.map((value, i) => {
    const nextPeak = Math.max(value, peakRef.current[i] - 0.02)
    return clamp01(nextPeak)
  })

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
        let frame = rendered ?? idleFrame(tick, gW, gH)

        // If a wired PerformanceGenerator is playing a show, its timed playback
        // takes over the main canvas (its graph output is only a blank frame).
        const pb = useShowPlayback.getState()
        if (pb.show && pb.nodeId && genWiredToOutput(nodesRef.current, edgesRef.current, pb.nodeId)) {
          frame = renderShowFrame(pb.show, pb.posMs, gW, gH, getGroupRegistry(), pb.useGroupInputs)
        }

        if (useWebGL && glRef.current) {
          glRef.current.render(frame, gW, gH, px, previewStyleRef.current)
        } else if (ctx) {
          if (canvas.width !== gW * px || canvas.height !== gH * px) {
            canvas.width = gW * px; canvas.height = gH * px
          }
          renderFrame(ctx, frame, px, previewStyleRef.current)
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

  // Revoke every playlist object URL on unmount.
  useEffect(() => {
    return () => {
      for (const track of tracksRef.current) URL.revokeObjectURL(track.url)
    }
  }, [])

  const currentTrack = tracks[trackIndex] ?? null

  // The show transport owns the audio focus — silence the local playlist the
  // moment a show preview becomes active.
  useEffect(() => {
    if (transport) playerRef.current?.pause()
  }, [transport])

  // One volume for both modes: apply the shared value to the local element.
  useEffect(() => {
    if (playerRef.current) playerRef.current.volume = volume
  }, [volume, currentTrack])

  const toggleMic = () => {
    if (audioMode === 'mic') stopAudio()
    else startAudio().catch(() => {})
  }

  const openFilePicker = () => fileInputRef.current?.click()

  const clearMusic = () => {
    const player = playerRef.current
    if (player) {
      player.pause()
      player.removeAttribute('src')
      player.load()
    }
    for (const track of tracks) URL.revokeObjectURL(track.url)
    pendingPlayRef.current = false
    setTracks([])
    setTrackIndex(0)
    setMusicReady(false)
    setMusicPlaying(false)
    setMusicCurrentTime(0)
    setMusicDuration(0)
    setMusicError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const onPickMusic = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    if (!files.length) return
    const added = files.map((file) => ({
      id: `track-${nextTrackId++}`,
      name: file.name,
      url: URL.createObjectURL(file),
    }))
    const hadTracks = tracks.length > 0
    setTracks([...tracks, ...added])
    if (!hadTracks) {
      setTrackIndex(0)
      setMusicReady(false)
      setMusicCurrentTime(0)
      setMusicDuration(0)
    }
    setMusicError(null)
    // Reset so re-adding the same file fires another change event.
    event.target.value = ''
  }

  const selectTrack = (index: number, autoplay: boolean) => {
    if (index < 0 || index >= tracks.length) return
    pendingPlayRef.current = autoplay
    setTrackIndex(index)
    setMusicReady(false)
    setMusicPlaying(false)
    setMusicCurrentTime(0)
    setMusicDuration(0)
    setMusicError(null)
  }

  const onLoadedMetadata = async () => {
    const player = playerRef.current
    if (!player) return
    player.volume = usePlayerTransport.getState().volume
    setMusicDuration(Number.isFinite(player.duration) ? player.duration : 0)
    setMusicReady(true)
    try {
      await attachAudioElement(player)
    } catch {
      setMusicError('This audio file could not be prepared for playback.')
    }
    if (pendingPlayRef.current) {
      pendingPlayRef.current = false
      player.play().catch(() => setMusicError('This audio file could not be played in the browser.'))
    }
  }

  const toggleMusicPlayback = () => {
    const player = playerRef.current
    if (!player || !currentTrack) return
    if (musicPlaying) {
      player.pause()
      return
    }
    setMusicError(null)
    attachAudioElement(player)
      .then(() => player.play())
      .catch(() => setMusicError('This audio file could not be played in the browser.'))
  }

  // Prev restarts the current track when it's more than a moment in (or is the
  // first track); otherwise it steps back through the playlist.
  const prevTrack = () => {
    const player = playerRef.current
    if ((player && player.currentTime > 3) || trackIndex === 0) {
      if (player) player.currentTime = 0
      setMusicCurrentTime(0)
      return
    }
    selectTrack(trackIndex - 1, musicPlaying)
  }

  const nextTrack = () => selectTrack(trackIndex + 1, musicPlaying)

  const onTrackEnded = () => {
    if (trackIndex < tracks.length - 1) {
      selectTrack(trackIndex + 1, true)
      return
    }
    setMusicPlaying(false)
    setMusicCurrentTime(0)
    const player = playerRef.current
    if (player) player.currentTime = 0
  }

  const toggleMute = () => {
    if (volume > 0) {
      lastAudibleVolume.current = volume
      setVolume(0)
    } else {
      setVolume(lastAudibleVolume.current || 0.9)
    }
  }

  // ── Transport view state: show mode when a generator registered itself. ──
  const showMode = transport !== null
  const durationMs = showMode ? transport.durationMs : musicDuration * 1000
  const positionMs = showMode ? Math.min(showPosMs, durationMs) : Math.min(musicCurrentTime, musicDuration) * 1000
  const isPlaying = showMode ? showPlaying : musicPlaying
  const canTransport = showMode || musicReady
  const canPrev = showMode ? true : tracks.length > 0
  const canNext = showMode ? transport.hasNext : trackIndex < tracks.length - 1
  const trackLabel = showMode
    ? `♪ ${transport.title}`
    : currentTrack
      ? `${currentTrack.name}${tracks.length > 1 ? ` · ${trackIndex + 1}/${tracks.length}` : ''}`
      : 'Add local tracks, or preview a generated show'
  const progressPct = durationMs > 0 ? Math.max(0, Math.min(100, (positionMs / durationMs) * 100)) : 0

  const onTogglePlay = () => (showMode ? transport.toggle() : toggleMusicPlayback())
  const onPrev = () => (showMode ? transport.prev() : prevTrack())
  const onNext = () => (showMode ? transport.next() : nextTrack())
  const onSeek = (event: ChangeEvent<HTMLInputElement>) => {
    const ms = Number(event.target.value)
    if (showMode) {
      transport.seek(ms)
      return
    }
    const player = playerRef.current
    setMusicCurrentTime(ms / 1000)
    if (player) player.currentTime = ms / 1000
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span>LED Preview</span>
        <div className={styles.headerRight}>
          <button
            className={styles.toggleBtn}
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen preview' : 'Open fullscreen preview'}
            aria-pressed={isFullscreen}
          >
            {isFullscreen ? 'Windowed' : 'Fullscreen'}
          </button>
          <button
            className={`${styles.toggleBtn} ${styles.previewToggle} ${preview3d ? styles.toggleActive : ''}`}
            onClick={togglePreview3d}
            title={preview3d ? 'Switch to 2D view' : 'Switch to 3D view (drag to orbit)'}
            aria-pressed={preview3d}
          >
            {preview3d ? '3D On' : '3D Off'}
          </button>
          <button
            className={`${styles.toggleBtn} ${styles.styleBtn} ${isDiffusedStyle(previewStyle) ? styles.toggleActive : ''}`}
            onClick={cyclePreviewStyle}
            title="Cycle preview style"
          >
            {previewStyleLabel(previewStyle)}
          </button>
          <button
            className={`${styles.toggleBtn} ${styles.micToggle} ${audioMode === 'mic' ? styles.toggleActive : ''}`}
            onClick={toggleMic}
            title={audioMode === 'mic' ? 'Stop microphone' : 'Start microphone'}
            aria-pressed={audioMode === 'mic'}
          >
            {audioMode === 'mic' ? 'Mic On' : 'Mic Off'}
          </button>
        </div>
      </div>
      <div
        ref={canvasWrapRef}
        className={`${styles.canvasWrap} ${preview3d ? styles.canvasWrap3d : ''} ${isFullscreen ? styles.canvasWrapFullscreen : ''}`}
      >
        <canvas
          ref={canvasRef}
          width={gridW * pixel}
          height={gridH * pixel}
          className={`${styles.canvas} ${isDiffusedStyle(previewStyle) ? styles.canvasDiffusion : ''} ${isDiffusedStyle(previewStyle) && preview3d ? styles.canvasDiffusion3d : ''} ${previewStyle === 'crt' ? styles.canvasCrt : ''} ${isFullscreen ? styles.canvasFullscreen : ''}`}
          style={preview3d ? { transform: `rotateX(${rot.x}deg) rotateY(${rot.y}deg)`, cursor: drag.current ? 'grabbing' : 'grab' } : undefined}
          onPointerDown={onRotateDown}
          onPointerMove={onRotateMove}
          onPointerUp={onRotateUp}
          onPointerCancel={onRotateUp}
        />
      </div>
      <div className={styles.visualizer}>
          <div className={styles.visualizerGlow} />
          <div className={styles.visualizerGrid} />
          <div className={styles.spectrum} aria-hidden>
            {displaySpectrum.map((value, i) => {
              const hue = 188 + (i / Math.max(1, NUM_BARS - 1)) * 148
              const colorVars = { '--bar-hue': `${hue}` } as CSSProperties
              return (
                <div key={i} className={styles.barWrap}>
                  <div
                    className={styles.bar}
                    style={{
                      height: `${Math.max(6, value * 100)}%`,
                      ...colorVars,
                    }}
                  />
                  <div
                    className={styles.peak}
                    style={{
                      bottom: `${Math.max(0, peakRef.current[i] * 100 - 3)}%`,
                      ...colorVars,
                    }}
                  />
                </div>
              )
            })}
          </div>
          <div className={styles.musicControls}>
            <div className={styles.musicTop}>
              <span className={styles.musicMeta} title={trackLabel}>{trackLabel}</span>
              <span className={styles.musicTime}>
                {fmtTime(positionMs / 1000)} / {fmtTime(durationMs / 1000)}
              </span>
            </div>
            <input
              className={styles.progress}
              type="range"
              min={0}
              max={Math.max(1000, durationMs)}
              step={100}
              value={positionMs}
              onChange={onSeek}
              disabled={!canTransport || durationMs <= 0}
              style={{ '--pp': `${progressPct}%` } as CSSProperties}
              aria-label={showMode ? 'Show preview position' : 'Music playback position'}
            />
            <div className={styles.controlsRow}>
              <div className={styles.controlsSide}>
                {!showMode && (
                  <>
                    <button
                      type="button"
                      className={styles.iconBtn}
                      onClick={openFilePicker}
                      title="Add tracks"
                      aria-label="Add tracks"
                    >
                      <IconAdd />
                    </button>
                    <button
                      type="button"
                      className={styles.iconBtn}
                      onClick={clearMusic}
                      disabled={!tracks.length}
                      title="Clear playlist"
                      aria-label="Clear playlist"
                    >
                      <IconClear />
                    </button>
                  </>
                )}
              </div>
              <div className={styles.controlsCenter}>
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={onPrev}
                  disabled={!canTransport || !canPrev}
                  title="Previous"
                  aria-label="Previous track"
                >
                  <IconPrev />
                </button>
                <button
                  type="button"
                  className={styles.playIconBtn}
                  onClick={onTogglePlay}
                  disabled={!canTransport}
                  title={isPlaying ? 'Pause' : 'Play'}
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <IconPause size={18} /> : <IconPlay size={18} />}
                </button>
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={onNext}
                  disabled={!canTransport || !canNext}
                  title="Next"
                  aria-label="Next track"
                >
                  <IconNext />
                </button>
              </div>
              <div className={`${styles.controlsSide} ${styles.volWrap}`}>
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={toggleMute}
                  title={volume === 0 ? 'Unmute' : 'Mute'}
                  aria-label={volume === 0 ? 'Unmute' : 'Mute'}
                >
                  {volume === 0 ? <IconVolumeMuted /> : <IconVolume />}
                </button>
                <input
                  className={styles.vol}
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  style={{ '--pp': `${volume * 100}%` } as CSSProperties}
                  aria-label="Volume"
                />
              </div>
            </div>
            {musicError && !showMode && <p className={styles.musicError} role="alert">{musicError}</p>}
          </div>
        </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        multiple
        className={styles.fileInput}
        onChange={onPickMusic}
      />
      <audio
        ref={playerRef}
        src={currentTrack?.url ?? undefined}
        preload="metadata"
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={() => setMusicCurrentTime(playerRef.current?.currentTime ?? 0)}
        onPlay={() => setMusicPlaying(true)}
        onPause={() => setMusicPlaying(false)}
        onEnded={onTrackEnded}
        onError={() => setMusicError('This audio file could not be decoded in the browser.')}
      />
    </div>
  )
}
