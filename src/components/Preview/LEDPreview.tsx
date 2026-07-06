import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties } from 'react'
import { useGraphStore, getGroupRegistry } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'
import { useAudioStore } from '../../state/audioStore'
import { evaluateGraphFull, type Frame } from '../../state/graphEvaluator'
import { usePreviewStore } from '../../state/previewStore'
import { useShowPlayback } from '../../state/showPlayback'
import { usePlayerTransport } from '../../state/playerTransport'
import { WebGLLEDRenderer } from './webglRenderer'
import { applyShowPlaybackSignal } from './showPlaybackSignal'
import { isDiffusedStyle, previewStyleLabel, type PreviewStyle } from './previewStyles'
import { graphConsumesAudio } from './previewAudioUsage'
import DevPerformanceHud, { DevPerformanceHudToggle } from './DevPerformanceHud'
import { recordPerfFrame } from '../../dev/perfMonitor'
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
import { frameAmbient } from '../../utils/signalVisual'
import { idleFrame } from './idleFrame'

const MAX_CANVAS_PX = 448
const STAGE_CANVAS_PX = 840
const NUM_BARS = 28
const BYTES_PER_MIB = 1024 * 1024
const MEMORY_SAMPLE_INTERVAL_MS = 30_000

interface PerformanceWithMemory extends Performance {
  memory?: { usedJSHeapSize: number }
  measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }>
}

async function measurePageMemoryMb(): Promise<number | null> {
  const extendedPerformance = performance as PerformanceWithMemory
  if (window.crossOriginIsolated && extendedPerformance.measureUserAgentSpecificMemory) {
    try {
      const measurement = await extendedPerformance.measureUserAgentSpecificMemory()
      return Math.round(measurement.bytes / BYTES_PER_MIB)
    } catch {
      // Fall through to the legacy heap-only reading when measurement is denied.
    }
  }

  const heap = extendedPerformance.memory
  return heap ? Math.round(heap.usedJSHeapSize / BYTES_PER_MIB) : null
}
// Sparkle spots for the branding twinkle, in % of the lockup box. Hues follow
// the wordmark's cyan→magenta gradient at each x; the logo art masks the layer
// so a glint only lights actual LED pixels. Periods are co-prime-ish and
// delays staggered so pops never fall into a visible rhythm.
const BRAND_TWINKLES = [
  { x: 6,  y: 28, color: '#5ad1ff', period: 8.1,  delay: 0.0 },
  { x: 10, y: 68, color: '#7de4ff', period: 9.7,  delay: 3.1 },
  { x: 22, y: 34, color: '#4fd8ff', period: 7.3,  delay: 5.4 },
  { x: 33, y: 62, color: '#5db2ff', period: 10.9, delay: 1.7 },
  { x: 45, y: 30, color: '#6a8dff', period: 8.9,  delay: 6.8 },
  { x: 56, y: 66, color: '#8f79ff', period: 9.3,  delay: 4.2 },
  { x: 67, y: 36, color: '#b06bff', period: 7.9,  delay: 8.6 },
  { x: 78, y: 60, color: '#e05cff', period: 10.3, delay: 2.5 },
  { x: 88, y: 32, color: '#ff5cf0', period: 8.7,  delay: 7.4 },
  { x: 96, y: 58, color: '#ff4d8d', period: 11.3, delay: 5.9 },
]
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

function renderGridFrame(ctx: CanvasRenderingContext2D, frame: Frame, pixel: number) {
  const gridH = frame.length
  const gridW = frame[0]?.length ?? 0
  const width = gridW * pixel
  const height = gridH * pixel
  ctx.clearRect(0, 0, width, height)
  const substrate = ctx.createRadialGradient(
    width * 0.5, height * 0.46, 0,
    width * 0.5, height * 0.46, Math.max(width, height) * 0.72,
  )
  substrate.addColorStop(0, '#080c10')
  substrate.addColorStop(1, '#020405')
  ctx.fillStyle = substrate
  ctx.fillRect(0, 0, width, height)

  // Soft spill first, then the physical emitter. Keeping the lit disc small
  // preserves the black matrix gaps while neighbouring bloom can still merge.
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      const { r, g, b } = frame[y][x]
      const color = `rgb(${r},${g},${b})`
      const brightness = Math.max(r, g, b) / 255
      if (brightness < 0.012) continue
      const cx = (x + 0.5) * pixel
      const cy = (y + 0.5) * pixel
      ctx.fillStyle = color
      ctx.shadowColor = color
      ctx.shadowBlur = pixel * (0.52 + brightness * 0.9)
      ctx.globalAlpha = 0.18 + brightness * 0.3
      ctx.beginPath()
      ctx.arc(cx, cy, Math.max(0.55, pixel * 0.17), 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()

  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      const { r, g, b } = frame[y][x]
      const brightness = Math.max(r, g, b) / 255
      if (brightness < 0.012) continue
      const cx = (x + 0.5) * pixel
      const cy = (y + 0.5) * pixel
      const radius = Math.max(0.65, pixel * (0.15 + brightness * 0.055))
      ctx.fillStyle = `rgb(${r},${g},${b})`
      ctx.shadowColor = ctx.fillStyle
      ctx.shadowBlur = pixel * (0.1 + brightness * 0.16)
      ctx.globalAlpha = 0.72 + brightness * 0.28
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.fill()

      if (brightness > 0.66) {
        ctx.shadowBlur = 0
        ctx.globalAlpha = (brightness - 0.66) * 1.5
        ctx.fillStyle = '#fff'
        ctx.beginPath()
        ctx.arc(cx, cy, Math.max(0.35, pixel * 0.045), 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
  ctx.globalAlpha = 1
  ctx.shadowBlur = 0
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
  const [canvasWrapSize, setCanvasWrapSize] = useState({ width: 0, height: 0 })
  const lastFpsTime   = useRef(performance.now())
  const frameCount    = useRef(0)
  const lastMemorySample = useRef(-MEMORY_SAMPLE_INTERVAL_MS)
  const memorySamplePending = useRef(false)
  // Wall-clock time base so the preview animates at real-time speed regardless
  // of the display refresh rate (matching the firmware's millis()-based timing).
  const startTime     = useRef(0)
  const lastStep      = useRef(0)
  // React-driven node previews and signal lighting do not need the matrix's
  // full 60 fps cadence. Bounding their publish rate prevents a busy graph
  // from queuing UI work faster than React and the canvas thumbnails can draw.
  const lastPreviewPublish = useRef(0)
  const reportedPreviewErrors = useRef(new Set<string>())
  const lastFrameNow = useRef(0)

  const nodes = useGraphStore((s) => s.nodes)
  const edges = useGraphStore((s) => s.edges)
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  useEffect(() => { nodesRef.current = nodes }, [nodes])
  useEffect(() => { edgesRef.current = edges }, [edges])

  // The mic toggle only makes sense when a MicInput node is on the active
  // canvas — the same condition App.tsx uses to auto-start/stop the mic. We
  // deliberately DON'T scan graphData: a MicInput stranded in a group subgraph
  // (which "select all → delete" on the canvas can't reach) would otherwise
  // keep the button lit even on an empty canvas.
  const hasMicNode = useGraphStore((s) =>
    s.nodes.some((n) => (n.data as { nodeType?: string }).nodeType === 'MicInput')
  )

  // Read grid dimensions from MatrixOutput node
  const outputNode = useGraphStore((s) =>
    s.nodes.find((n) => (n.data as { nodeType?: string }).nodeType === 'MatrixOutput')
  )
  const hasFrameSignal = useGraphStore((s) => {
    const terminalIds = new Set(s.nodes
      .filter((node) => ['MatrixOutput', 'GroupOutput'].includes(String(node.data.nodeType)))
      .map((node) => node.id))
    return s.edges.some((edge) => terminalIds.has(edge.target) && edge.targetHandle === 'frame')
  })
  const audioVisualizerLive = useGraphStore((s) => graphConsumesAudio(s.nodes, s.edges))
  const gridW = Math.max(2, Math.min(64, Number(outputNode?.data.properties.width  ?? 16)))
  const gridH = Math.max(2, Math.min(64, Number(outputNode?.data.properties.height ?? 16)))
  const stageMode = useUiStore((s) => s.stageMode)
  const setStageMode = useUiStore((s) => s.setStageMode)
  const fps = useUiStore((s) => s.fps)
  const memoryMb = useUiStore((s) => s.memoryMb)
  const wrapEl = canvasWrapRef.current
  const wrapStyle = wrapEl ? window.getComputedStyle(wrapEl) : null
  const wrapPadX = wrapStyle ? Number.parseFloat(wrapStyle.paddingLeft) + Number.parseFloat(wrapStyle.paddingRight) : 0
  const wrapPadY = wrapStyle ? Number.parseFloat(wrapStyle.paddingTop) + Number.parseFloat(wrapStyle.paddingBottom) : 0
  const availableCanvasW = Math.max(0, canvasWrapSize.width - wrapPadX)
  const availableCanvasH = Math.max(0, canvasWrapSize.height - wrapPadY)
  const windowedPixelLimit = Math.min(
    stageMode ? STAGE_CANVAS_PX : MAX_CANVAS_PX,
    availableCanvasW > 0 ? availableCanvasW / gridW : stageMode ? STAGE_CANVAS_PX : MAX_CANVAS_PX,
    availableCanvasH > 0 ? availableCanvasH / gridH : stageMode ? STAGE_CANVAS_PX : MAX_CANVAS_PX,
  )
  const pixel = Math.max(1, windowedPixelLimit)
  // Integer drawing-buffer size — floor the *canvas* dimensions, not the per-LED
  // pixel size. Flooring `pixel` and then multiplying by the grid scales the
  // rounding loss with resolution (~1px lost per LED × 64 ≈ a 14% shrink at
  // 64×64), so a denser matrix visibly shrinks. Flooring the product keeps the
  // preview the same physical size at any resolution, with the per-LED size left
  // fractional (the canvas 2D fills and the WebGL shader both handle that).
  const canvasBufW = Math.max(1, Math.floor(gridW * pixel))
  const canvasBufH = Math.max(1, Math.floor(gridH * pixel))
  const gridWRef = useRef(gridW)
  const gridHRef = useRef(gridH)
  const pixelRef = useRef(pixel)
  const canvasBufWRef = useRef(canvasBufW)
  const canvasBufHRef = useRef(canvasBufH)
  useEffect(() => {
    gridWRef.current = gridW; gridHRef.current = gridH; pixelRef.current = pixel
    canvasBufWRef.current = canvasBufW; canvasBufHRef.current = canvasBufH
  }, [gridW, gridH, pixel, canvasBufW, canvasBufH])

  const preview3d = useUiStore((s) => s.preview3d)
  const previewStyle = useUiStore((s) => s.previewStyle)
  const togglePreview3d = useUiStore((s) => s.togglePreview3d)
  const cyclePreviewStyle = useUiStore((s) => s.cyclePreviewStyle)
  const { micActive, previewSpectrum, startAudio, attachAudioElement, stopAudio } = useAudioStore()
  const previewStyleRef = useRef(previewStyle)
  useEffect(() => { previewStyleRef.current = previewStyle }, [previewStyle])
  const stageModeRef = useRef(stageMode)
  const preview3dRef = useRef(preview3d)
  const micActiveRef = useRef(micActive)
  const audioVisualizerLiveRef = useRef(audioVisualizerLive)
  const hasFrameSignalRef = useRef(hasFrameSignal)
  useEffect(() => { stageModeRef.current = stageMode }, [stageMode])
  useEffect(() => { preview3dRef.current = preview3d }, [preview3d])
  useEffect(() => { micActiveRef.current = micActive }, [micActive])
  useEffect(() => { audioVisualizerLiveRef.current = audioVisualizerLive }, [audioVisualizerLive])
  useEffect(() => { hasFrameSignalRef.current = hasFrameSignal }, [hasFrameSignal])
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
  const peakRef = useRef(Array(NUM_BARS).fill(0))

  const displaySpectrum = resample(audioVisualizerLive ? previewSpectrum : [], NUM_BARS).map((value, i, arr) => {
    const prev = arr[i - 1] ?? value
    const next = arr[i + 1] ?? value
    return clamp01(value * 0.55 + ((prev + value + next) / 3) * 0.45)
  })

  peakRef.current = audioVisualizerLive
    ? displaySpectrum.map((value, i) => {
        const nextPeak = Math.max(value, peakRef.current[i] - 0.02)
        return clamp01(nextPeak)
      })
    : Array(NUM_BARS).fill(0)

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
        const frameStart = now
        if (startTime.current === 0) { startTime.current = now; lastStep.current = now }
        // Gate to ~60fps off the wall clock: on high-refresh displays this skips
        // the extra rAF callbacks instead of advancing time faster than real.
        if (now - lastStep.current < STEP) {
          animRef.current = requestAnimationFrame(loop)
          return
        }
        lastStep.current = now
        const gapMs = lastFrameNow.current === 0 ? STEP : now - lastFrameNow.current
        lastFrameNow.current = now
        // t = tick / 60 = seconds elapsed, matching the firmware's millis()/1000.
        const tick = (now - startTime.current) / STEP
        tickRef.current = tick
        const gW = gridWRef.current, gH = gridHRef.current, px = pixelRef.current
        const groups = getGroupRegistry()
        // One evaluation pass feeds both the main matrix and every node preview.
        const evalStart = performance.now()
        const { frame: rendered, outputs } = evaluateGraphFull(nodesRef.current, edgesRef.current, tick, gW, gH, groups)
        const evalMs = performance.now() - evalStart
        let frame = rendered ?? idleFrame(tick, gW, gH)
        const showStart = performance.now()
        frame = applyShowPlaybackSignal(
          frame,
          outputs,
          nodesRef.current,
          edgesRef.current,
          useShowPlayback.getState(),
          gW,
          gH,
          groups,
        )
        const showMs = performance.now() - showStart

        const bw = canvasBufWRef.current, bh = canvasBufHRef.current
        const drawStart = performance.now()
        if (useWebGL && glRef.current) {
          glRef.current.render(frame, gW, gH, px, previewStyleRef.current)
        } else if (ctx) {
          if (canvas.width !== bw || canvas.height !== bh) {
            canvas.width = bw; canvas.height = bh
          }
          renderFrame(ctx, frame, px, previewStyleRef.current)
        }
        const drawMs = performance.now() - drawStart

        // Sample the matrix itself for an Ambilight-style spill. Updating CSS
        // variables directly at 10 fps avoids making the full preview React
        // tree re-render just to animate decorative light.
        if (frameCount.current % 6 === 0 && canvasWrapRef.current) {
          const ambient = frameAmbient(frame)
          const wrap = canvasWrapRef.current
          wrap.style.setProperty('--ambient-nw', ambient.colors[0])
          wrap.style.setProperty('--ambient-ne', ambient.colors[1])
          wrap.style.setProperty('--ambient-sw', ambient.colors[2])
          wrap.style.setProperty('--ambient-se', ambient.colors[3])
          wrap.style.setProperty('--ambient-opacity', String(Math.min(0.78, 0.08 + ambient.energy * 0.7)))
        }

        // Beat pulses last one evaluation frame, so publish them immediately;
        // otherwise keep React/store work to ~15 fps while the matrix stays at 60.
        const hasBeat = Array.from(outputs.values()).some((output) => output.beat === true)
        const publishStart = performance.now()
        if (hasBeat || now - lastPreviewPublish.current >= 66) {
          usePreviewStore.getState().setOutputs(outputs)
          lastPreviewPublish.current = now
        }
        const publishMs = performance.now() - publishStart
        const frameMs = performance.now() - frameStart
        recordPerfFrame({
          now,
          gapMs,
          frameMs,
          evalMs,
          showMs,
          drawMs,
          publishMs,
          context: {
            nodes: nodesRef.current.length,
            edges: edgesRef.current.length,
            groups: Object.keys(groups).length,
            outputs: outputs.size,
            gridW: gW,
            gridH: gH,
            canvasW: bw,
            canvasH: bh,
            renderer: useWebGL ? 'webgl' : '2d',
            previewStyle: previewStyleRef.current,
            stageMode: stageModeRef.current,
            preview3d: preview3dRef.current,
            micActive: micActiveRef.current,
            audioReactive: audioVisualizerLiveRef.current,
            hidden: document.visibilityState === 'hidden',
            hasSignal: hasFrameSignalRef.current,
          },
        })

        frameCount.current++
        if (now - lastFpsTime.current >= 1000) {
          const count = frameCount.current
          useUiStore.getState().setFps(count)
          if (!memorySamplePending.current && now - lastMemorySample.current >= MEMORY_SAMPLE_INTERVAL_MS) {
            memorySamplePending.current = true
            lastMemorySample.current = now
            void measurePageMemoryMb()
              .then((memoryMb) => useUiStore.getState().setMemoryMb(memoryMb))
              .finally(() => { memorySamplePending.current = false })
          }
          frameCount.current = 0
          lastFpsTime.current = now
        }
      } catch (err) {
        // A persistent bad graph can fail every animation frame. Log each
        // distinct message once (as text, so devtools does not retain Error
        // objects and stacks indefinitely) while allowing the loop to recover.
        const message = err instanceof Error ? err.message : String(err)
        if (!reportedPreviewErrors.current.has(message)) {
          if (reportedPreviewErrors.current.size >= 20) reportedPreviewErrors.current.clear()
          reportedPreviewErrors.current.add(message)
          console.error(`LED preview frame failed: ${message}`)
        }
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
    if (micActive) stopAudio()
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
    // Opening files is an explicit playback gesture: select the first newly
    // added track and let onLoadedMetadata start it as soon as it is ready.
    pendingPlayRef.current = true
    setTracks([...tracks, ...added])
    setTrackIndex(tracks.length)
    setMusicReady(false)
    setMusicPlaying(false)
    setMusicCurrentTime(0)
    setMusicDuration(0)
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
    <div className={`${styles.panel} ${stageMode ? styles.panelStage : ''}`}>
      <div className={`${styles.header} ${stageMode ? styles.headerStage : ''}`}>
        {stageMode ? (
          <div className={styles.stageIdentity}>
            <span className={styles.liveDot} aria-hidden="true" />
            <span className={styles.stageTitle}>Live output</span>
            <span className={styles.stageMeta}>
              {gridW}×{gridH} · {fps} FPS · Memory Used: {memoryMb === null ? 'Unavailable' : `${memoryMb} MiB`}
            </span>
          </div>
        ) : <span>LED Preview</span>}
        <div className={styles.headerRight}>
          {import.meta.env.DEV && <DevPerformanceHudToggle />}
          <button
            className={`${styles.toggleBtn} ${styles.stageToggle} ${stageMode ? styles.toggleActive : ''}`}
            onClick={() => setStageMode(!stageMode)}
            title={stageMode ? 'Exit Stage Mode (Esc or F10)' : 'Enter Stage Mode (F10)'}
            aria-pressed={stageMode}
          >
            Stage
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
            className={`${styles.toggleBtn} ${styles.micToggle} ${micActive ? styles.toggleActive : ''}`}
            onClick={toggleMic}
            disabled={!hasMicNode}
            title={
              !hasMicNode
                ? 'Add a MicInput node to enable the microphone'
                : micActive ? 'Stop microphone' : 'Start microphone'
            }
            aria-pressed={micActive}
          >
            {micActive ? 'Mic On' : 'Mic Off'}
          </button>
        </div>
      </div>
      <div
        ref={canvasWrapRef}
        className={`${styles.canvasWrap} ${preview3d ? styles.canvasWrap3d : ''}`}
      >
        {import.meta.env.DEV && <DevPerformanceHud />}
        <div className={styles.ambilight} aria-hidden="true" />
        {!hasFrameSignal && (
          <div className={styles.standbyHud} aria-live="polite">
            <span><i aria-hidden="true" /> Signal standby</span>
            <small>Patch a frame into output</small>
          </div>
        )}
        <canvas
          ref={canvasRef}
          width={canvasBufW}
          height={canvasBufH}
          className={`${styles.canvas} ${previewStyle === 'standard' ? styles.canvasStandard : ''} ${isDiffusedStyle(previewStyle) ? styles.canvasDiffusion : ''} ${isDiffusedStyle(previewStyle) && preview3d ? styles.canvasDiffusion3d : ''} ${previewStyle === 'crt' ? styles.canvasCrt : ''}`}
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
          <div className={styles.brandWrap} aria-hidden>
            <div className={styles.brandLockup}>
              <img
                className={styles.brandLogo}
                src="/fastled-studio-pixel-brand.png"
                alt=""
              />
              <div className={styles.brandTwinkles}>
                {BRAND_TWINKLES.map((tw, i) => (
                  <i
                    key={i}
                    style={{
                      '--tx': `${tw.x}%`,
                      '--ty': `${tw.y}%`,
                      '--tc': tw.color,
                      '--tt': `${tw.period}s`,
                      '--td': `${tw.delay}s`,
                    } as CSSProperties}
                  />
                ))}
              </div>
              <span className={styles.brandShine} />
            </div>
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
