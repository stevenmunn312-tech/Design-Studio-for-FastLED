import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties } from 'react'
import { useGraphStore, getGroupRegistry, matrixDims, matrixTileLayout, type GraphMeta, type StudioEdge, type StudioNode } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'
import { useAudioStore } from '../../state/audioStore'
import { evaluateGraphFull, getPatternShowSelection, type Frame, type RGB } from '../../state/graphEvaluator'
import { usePreviewStore } from '../../state/previewStore'
import { useShowPlayback } from '../../state/showPlayback'
import { usePlayerTransport } from '../../state/playerTransport'
import { usePatternLibrary } from '../../state/patternLibrary'
import { useMusicStore } from '../../state/musicStore'
import { showStateAt } from '../../state/showPreview'
import { showAudioSpectrum } from '../../state/showAudio'
import { WebGLLEDRenderer } from './webglRenderer'
import { applyShowPlaybackSignal } from './showPlaybackSignal'
import { isDiffusedStyle, previewStyleLabel, type PreviewStyle } from './previewStyles'
import { graphConsumesAudio } from './previewAudioUsage'
import PreviewSpectrum from './PreviewSpectrum'
import {
  nextSpectrumVisualizerMode,
  spectrumVisualizerLabel,
} from './spectrumVisualizerModes'
import DevPerformanceHud from './DevPerformanceHud'
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
import { publishStreamFrame } from '../../state/streamStore'

// Statically replaced at build time, so the telemetry branches (phase timers +
// the per-frame context object for the dev HUD) are dead-code-stripped in prod.
const PERF_TELEMETRY = import.meta.env.DEV

const MAX_CANVAS_PX = 448
const STAGE_CANVAS_PX = 840
const BYTES_PER_MIB = 1024 * 1024
const MEMORY_SAMPLE_INTERVAL_MS = 30_000
const PREVIEW_PUBLISH_INTERVAL_MS = 125

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

function nodeTypeOf(node: StudioNode | undefined): string {
  return String(node?.data.nodeType ?? '')
}

function groupIdOf(node: StudioNode | undefined): string | null {
  const groupId = (node?.data.properties as { groupId?: string } | undefined)?.groupId
  return typeof groupId === 'string' && groupId ? groupId : null
}

// Single-entry cache of the library-pattern lookups (id set + name counts),
// rebuilt only when the saved-patterns array changes — the stage-name selector
// consuming these runs on every graph-store update.
let libraryLookupSource: { id: string; name: string }[] | null = null
let libraryLookupCache = { ids: new Set<string>(), nameCounts: new Map<string, number>() }

function libraryLookup(patterns: { id: string; name: string }[]) {
  if (patterns !== libraryLookupSource) {
    libraryLookupSource = patterns
    const ids = new Set<string>()
    const nameCounts = new Map<string, number>()
    for (const pattern of patterns) {
      ids.add(pattern.id)
      nameCounts.set(pattern.name, (nameCounts.get(pattern.name) ?? 0) + 1)
    }
    libraryLookupCache = { ids, nameCounts }
  }
  return libraryLookupCache
}

function libraryPatternNameForGroup(
  groupId: string | undefined | null,
  graphs: Record<string, GraphMeta>,
  libraryPatternIds: Set<string>,
  libraryNameCounts: Map<string, number>,
): string | null {
  if (!groupId) return null
  const meta = graphs[groupId]
  if (!meta) return null
  if (meta.sourcePatternId) return libraryPatternIds.has(meta.sourcePatternId) ? meta.name : null
  // Best-effort fallback for workspaces saved before sourcePatternId existed.
  return (libraryNameCounts.get(meta.name) ?? 0) === 1 ? meta.name : null
}

function activeStagePatternName(
  nodes: StudioNode[],
  edges: StudioEdge[],
  graphs: Record<string, GraphMeta>,
  libraryPatternIds: Set<string>,
  libraryNameCounts: Map<string, number>,
  playbackShow: ReturnType<typeof useShowPlayback.getState>['show'],
  playbackPosMs: number,
): string | null {
  if (playbackShow?.patternSet?.length) {
    const live = showStateAt(playbackShow, playbackPosMs)
    const groupId = live.patternIndex >= 0 ? playbackShow.patternSet[live.patternIndex] : undefined
    return libraryPatternNameForGroup(groupId, graphs, libraryPatternIds, libraryNameCounts)
  }

  const output = nodes.find((node) => nodeTypeOf(node) === 'MatrixOutput')
  if (!output) return null
  const sourceEdge = edges.find((edge) => edge.target === output.id && edge.targetHandle === 'frame')
  const sourceNode = nodes.find((node) => node.id === sourceEdge?.source)
  if (!sourceNode) return null

  if (nodeTypeOf(sourceNode) === 'Group') {
    return libraryPatternNameForGroup(groupIdOf(sourceNode), graphs, libraryPatternIds, libraryNameCounts)
  }

  if (nodeTypeOf(sourceNode) === 'PatternMaster') {
    const setEdge = edges.find((edge) => edge.target === sourceNode.id && edge.targetHandle === 'patternset')
    const collection = nodes.find((node) => node.id === setEdge?.source && nodeTypeOf(node) === 'PatternCollection')
    const patternIds = ((collection?.data.properties as { patternIds?: string[] } | undefined)?.patternIds) ?? []
    if (patternIds.length === 0) return null
    const live = getPatternShowSelection(sourceNode.id)
    const groupId = patternIds[live?.currentIndex ?? 0]
    return libraryPatternNameForGroup(groupId, graphs, libraryPatternIds, libraryNameCounts)
  }

  return null
}

// Mirror the firmware's FastLED.setBrightness master dim: scale the terminal
// frame by the MatrixOutput node's `brightness` (0–255, default 200 matching
// the generated sketch) so the preview matches what the hardware shows. Only
// the graph's own frame is dimmed — the idle shimmer isn't a real output, and
// show playback drives brightness through its own SET_BRIGHTNESS events.
function applyMasterBrightness(frame: Frame | null, nodes: StudioNode[]): Frame | null {
  if (!frame) return null
  const output = nodes.find((node) => nodeTypeOf(node) === 'MatrixOutput')
  if (!output) return frame
  const raw = Number((output.data.properties as { brightness?: unknown }).brightness)
  const brightness = Number.isFinite(raw) ? Math.max(0, Math.min(255, raw)) : 200
  if (brightness >= 255) return frame
  const s = brightness / 255
  return frame.map((row) => row.map(({ r, g, b }) => ({ r: r * s, g: g * s, b: b * s })))
}

// MatrixOutput `supersample`: when on, the graph is evaluated at SUPERSAMPLE×
// the matrix resolution and averaged back down (see downscaleFrame), matching
// the FastLED-style downscale the generated sketch emits. 2× only for now.
const SUPERSAMPLE = 2
function matrixSupersampleFactor(nodes: StudioNode[]): number {
  const output = nodes.find((node) => nodeTypeOf(node) === 'MatrixOutput')
  return (output?.data.properties as { supersample?: unknown } | undefined)?.supersample === true
    ? SUPERSAMPLE
    : 1
}

// Average each factor×factor block of a super-sampled frame down to one pixel —
// the antialiasing pass that makes float-coordinate motion read smoothly on a
// small panel. Mirrors the C++ downscale loop in the MatrixOutput codegen.
function downscaleFrame(frame: Frame, factor: number): Frame {
  const srcH = frame.length
  const srcW = frame[0]?.length ?? 0
  const h = Math.floor(srcH / factor)
  const w = Math.floor(srcW / factor)
  const n = factor * factor
  const out: Frame = new Array(h)
  for (let y = 0; y < h; y++) {
    const row: RGB[] = new Array(w)
    const by = y * factor
    for (let x = 0; x < w; x++) {
      const bx = x * factor
      let r = 0, g = 0, b = 0
      for (let dy = 0; dy < factor; dy++) {
        const frow = frame[by + dy]
        for (let dx = 0; dx < factor; dx++) {
          const px = frow[bx + dx]
          r += px.r; g += px.g; b += px.b
        }
      }
      row[x] = { r: r / n, g: g / n, b: b / n }
    }
    out[y] = row
  }
  return out
}

// ── Canvas-2D fallback LED sprites ────────────────────────────────────────────
// The WebGL-less fallback used to draw every lit LED as two `arc` fills with
// shadowBlur — a per-LED Gaussian blur that crawls on large grids. Instead,
// pre-render each look (soft spill / emitter disc) as a small radial-gradient
// sprite per quantised colour and drawImage it, scaled per LED.
const SPRITE_SIZE = 64
const SPRITE_CACHE_CAP = 512
const spriteCache = new Map<string, HTMLCanvasElement>()

function ledSprite(kind: 'spill' | 'core', r: number, g: number, b: number): HTMLCanvasElement {
  // 5 bits per channel — LED art rarely has more distinct colours per frame.
  const qr = r & 0xf8, qg = g & 0xf8, qb = b & 0xf8
  const key = `${kind}:${qr},${qg},${qb}`
  let sprite = spriteCache.get(key)
  if (!sprite) {
    if (spriteCache.size >= SPRITE_CACHE_CAP) spriteCache.clear()
    sprite = document.createElement('canvas')
    sprite.width = sprite.height = SPRITE_SIZE
    const c = sprite.getContext('2d')!
    const half = SPRITE_SIZE / 2
    const grad = c.createRadialGradient(half, half, 0, half, half, half)
    if (kind === 'spill') {
      grad.addColorStop(0, `rgba(${qr},${qg},${qb},1)`)
      grad.addColorStop(0.35, `rgba(${qr},${qg},${qb},0.5)`)
      grad.addColorStop(1, `rgba(${qr},${qg},${qb},0)`)
    } else {
      grad.addColorStop(0, `rgb(${qr},${qg},${qb})`)
      grad.addColorStop(0.6, `rgba(${qr},${qg},${qb},0.95)`)
      grad.addColorStop(1, `rgba(${qr},${qg},${qb},0)`)
    }
    c.fillStyle = grad
    c.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE)
    spriteCache.set(key, sprite)
  }
  return sprite
}

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
      const brightness = Math.max(r, g, b) / 255
      if (brightness < 0.012) continue
      const cx = (x + 0.5) * pixel
      const cy = (y + 0.5) * pixel
      const size = pixel * (1.4 + brightness * 1.8)
      ctx.globalAlpha = 0.18 + brightness * 0.3
      ctx.drawImage(ledSprite('spill', r, g, b), cx - size / 2, cy - size / 2, size, size)
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
      const size = Math.max(1.6, pixel * (0.52 + brightness * 0.42))
      ctx.globalAlpha = 0.72 + brightness * 0.28
      ctx.drawImage(ledSprite('core', r, g, b), cx - size / 2, cy - size / 2, size, size)

      if (brightness > 0.66) {
        ctx.globalAlpha = (brightness - 0.66) * 1.5
        ctx.fillStyle = '#fff'
        ctx.beginPath()
        ctx.arc(cx, cy, Math.max(0.35, pixel * 0.045), 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
  ctx.globalAlpha = 1
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
  const [canvasWrapSize, setCanvasWrapSize] = useState({ width: 0, height: 0, padX: 0, padY: 0 })
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
  const pauseStartedAt = useRef(0)
  const clearedPreviewStore = useRef(false)

  const libraryPatterns = usePatternLibrary((s) => s.patterns)
  const playbackShow = useShowPlayback((s) => s.show)
  const playbackPosMs = useShowPlayback((s) => s.posMs)

  const hasFrameSignal = useGraphStore((s) => {
    const terminalIds = new Set(s.nodes
      .filter((node) => ['MatrixOutput', 'GroupOutput'].includes(String(node.data.nodeType)))
      .map((node) => node.id))
    return s.edges.some((edge) => terminalIds.has(edge.target) && edge.targetHandle === 'frame')
  })
  const graphAudioVisualizerLive = useGraphStore((s) => graphConsumesAudio(s.nodes, s.edges))
  const playbackSpectrum = playbackShow ? showAudioSpectrum(playbackShow.audio, playbackPosMs) : null
  const audioVisualizerLive = graphAudioVisualizerLive || !!playbackSpectrum
  // Grid dimensions from the MatrixOutput node, via the shared single-scan memo.
  const gridW = useGraphStore((s) => Math.max(2, Math.min(64, matrixDims(s.nodes).w)))
  const gridH = useGraphStore((s) => Math.max(2, Math.min(64, matrixDims(s.nodes).h)))
  // Panel-tile grid (MatrixOutput layout==='panels') — 0 when there's nothing
  // to draw gridlines for. Select primitives, not the memoised object itself
  // (matching gridW/gridH's use of matrixDims below): a store selector must
  // return a referentially-stable result for an unchanged snapshot, and an
  // object literal breaks that even when its contents are equal, which
  // spins useSyncExternalStore into an infinite re-render loop. Physical
  // wiring order doesn't change the rendered content, so this is purely a
  // cosmetic overlay (see xyLayout.ts).
  const tileLayoutTilesX = useGraphStore((s) => matrixTileLayout(s.nodes)?.tilesX ?? 0)
  const tileLayoutTilesY = useGraphStore((s) => matrixTileLayout(s.nodes)?.tilesY ?? 0)
  const tileLayout = tileLayoutTilesX > 0 && tileLayoutTilesY > 0
    ? { tilesX: tileLayoutTilesX, tilesY: tileLayoutTilesY }
    : null
  const stageMode = useUiStore((s) => s.stageMode)
  const previewPanelOpen = useUiStore((s) => s.previewPanelOpen)
  const evaluationRunning = useUiStore((s) => s.evaluationRunning)
  // Stage-mode pattern name, derived inside a selector that returns a plain
  // string — graph edits (including every drag pointermove) only re-render this
  // panel when the displayed name actually changes. Off stage, skip the walk.
  const stagePatternName = useGraphStore((s) => {
    if (!stageMode) return null
    const lib = libraryLookup(libraryPatterns)
    return activeStagePatternName(s.nodes, s.edges, s.graphs, lib.ids, lib.nameCounts, playbackShow, playbackPosMs)
  })
  const performanceMode = useUiStore((s) => s.performanceMode)
  const uiEffectsEnabled = useUiStore((s) => s.uiEffectsEnabled)
  const fps = useUiStore((s) => s.fps)
  const memoryMb = useUiStore((s) => s.memoryMb)
  const availableCanvasW = Math.max(0, canvasWrapSize.width - canvasWrapSize.padX)
  const availableCanvasH = Math.max(0, canvasWrapSize.height - canvasWrapSize.padY)
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

  // Panel-boundary gridlines: a thin static overlay redrawn only when the
  // tile grid or canvas size changes (not on every animation frame like the
  // main matrix canvas), so it costs nothing during normal playback.
  const tileGridCanvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = tileGridCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (tileLayoutTilesX <= 0 || tileLayoutTilesY <= 0) return
    const tilesX = tileLayoutTilesX, tilesY = tileLayoutTilesY
    const tileW = canvasBufW / tilesX
    const tileH = canvasBufH / tilesY
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let tx = 1; tx < tilesX; tx++) {
      const x = Math.round(tx * tileW) + 0.5
      ctx.moveTo(x, 0)
      ctx.lineTo(x, canvasBufH)
    }
    for (let ty = 1; ty < tilesY; ty++) {
      const y = Math.round(ty * tileH) + 0.5
      ctx.moveTo(0, y)
      ctx.lineTo(canvasBufW, y)
    }
    ctx.stroke()
  }, [tileLayoutTilesX, tileLayoutTilesY, canvasBufW, canvasBufH])

  const preview3d = useUiStore((s) => s.preview3d)
  const previewStyle = useUiStore((s) => s.previewStyle)
  const spectrumVisualizerMode = useUiStore((s) => s.spectrumVisualizerMode)
  const setSpectrumVisualizerMode = useUiStore((s) => s.setSpectrumVisualizerMode)
  const micActive = useAudioStore((s) => s.micActive)
  const analyzingMusic = useMusicStore((s) => s.entries.some((entry) => entry.status === 'analyzing'))
  const effectivePreview3d = uiEffectsEnabled && preview3d
  const effectivePreviewStyle: PreviewStyle = uiEffectsEnabled ? previewStyle : 'standard'
  const uiEffectsEnabledRef = useRef(uiEffectsEnabled)
  const previewStyleRef = useRef<PreviewStyle>(effectivePreviewStyle)
  useEffect(() => { uiEffectsEnabledRef.current = uiEffectsEnabled }, [uiEffectsEnabled])
  useEffect(() => { previewStyleRef.current = effectivePreviewStyle }, [effectivePreviewStyle])
  const stageModeRef = useRef(stageMode)
  // Whether the matrix canvas is actually on screen: the panel stays mounted
  // while its dock is closed (the render loop keeps feeding node previews),
  // and stage mode shows it regardless of the dock.
  const previewVisibleRef = useRef(previewPanelOpen || stageMode)
  const evaluationRunningRef = useRef(evaluationRunning)
  useEffect(() => { previewVisibleRef.current = previewPanelOpen || stageMode }, [previewPanelOpen, stageMode])
  useEffect(() => { evaluationRunningRef.current = evaluationRunning }, [evaluationRunning])
  const preview3dRef = useRef(effectivePreview3d)
  const micActiveRef = useRef(micActive)
  const analyzingMusicRef = useRef(analyzingMusic)
  const audioVisualizerLiveRef = useRef(audioVisualizerLive)
  const hasFrameSignalRef = useRef(hasFrameSignal)
  useEffect(() => { stageModeRef.current = stageMode }, [stageMode])
  useEffect(() => { preview3dRef.current = effectivePreview3d }, [effectivePreview3d])
  useEffect(() => { micActiveRef.current = micActive }, [micActive])
  useEffect(() => { analyzingMusicRef.current = analyzingMusic }, [analyzingMusic])
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
      // Measure padding here (once per resize) rather than in the render body,
      // where getComputedStyle would force a style recalc on every re-render.
      const style = window.getComputedStyle(canvasWrap)
      setCanvasWrapSize({
        width: canvasWrap.clientWidth,
        height: canvasWrap.clientHeight,
        padX: Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight),
        padY: Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom),
      })
    }

    syncSize()
    const observer = new ResizeObserver(syncSize)
    observer.observe(canvasWrap)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (uiEffectsEnabled) {
      clearedPreviewStore.current = false
      return
    }
    if (clearedPreviewStore.current) return
    usePreviewStore.getState().clear()
    clearedPreviewStore.current = true
  }, [uiEffectsEnabled])

  const onRotateDown = (e: React.PointerEvent) => {
    if (!effectivePreview3d) return
    drag.current = { x: e.clientX, y: e.clientY }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onRotateMove = (e: React.PointerEvent) => {
    if (!effectivePreview3d || !drag.current) return
    const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y
    drag.current = { x: e.clientX, y: e.clientY }
    setRot((r) => ({ x: Math.max(0, Math.min(90, r.x - dy * 0.5)), y: r.y + dx * 0.5 }))
  }
  const onRotateUp = () => { drag.current = null }
  useEffect(() => {
    if (!effectivePreview3d) drag.current = null
  }, [effectivePreview3d])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Compile the relatively large preview shader in an idle slice. Doing this
    // synchronously in the passive-effect flush can put ~100 ms of GPU-driver
    // work directly in front of the first meaningful paint in development.
    let useWebGL = false
    let ctx: CanvasRenderingContext2D | null = null
    let idleId: number | null = null
    let fallbackId: number | null = null
    let disposed = false

    const STEP = 1000 / 60   // simulate at 60 steps/sec regardless of display Hz

    const loop = () => {
      // A single bad frame (e.g. a malformed graph) must not tear down the
      // animation loop, so swallow errors and keep scheduling the next frame.
      try {
        const now = performance.now()
        const frameStart = now
        // Keep the last rendered matrix and node previews frozen while paused.
        // The rAF remains alive only to notice a resume; no graph evaluation,
        // rendering, store publication, or stream-frame publication occurs.
        if (!evaluationRunningRef.current) {
          if (pauseStartedAt.current === 0) pauseStartedAt.current = now
          animRef.current = requestAnimationFrame(loop)
          return
        }
        if (pauseStartedAt.current !== 0) {
          // Remove the paused wall-clock interval from animation time so
          // stateful effects continue from the exact frame where they stopped.
          if (startTime.current !== 0) startTime.current += now - pauseStartedAt.current
          pauseStartedAt.current = 0
          lastStep.current = now
          lastFrameNow.current = now
        }
        if (startTime.current === 0) { startTime.current = now; lastStep.current = now }
        // Gate to ~60fps off the wall clock: on high-refresh displays this skips
        // the extra rAF callbacks instead of advancing time faster than real.
        // With the preview panel closed, node previews (published at the
        // 125 ms cadence) are the only consumer of this loop, so evaluation
        // drops to that rate — stateful nodes are wall-clock based and resume
        // seamlessly when the panel reopens.
        const visible = previewVisibleRef.current
        if (now - lastStep.current < (visible ? STEP : PREVIEW_PUBLISH_INTERVAL_MS)) {
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
        // Read the graph straight from the store each frame — the loop runs at
        // 60 fps anyway, and this keeps the React component free of a full
        // nodes/edges subscription (which would re-render it on every drag).
        const { nodes: graphNodes, edges: graphEdges, trusted } = useGraphStore.getState()
        const groups = getGroupRegistry()
        // One evaluation pass feeds both the main matrix and every node preview.
        // Nodes disconnected from the output only feed previews published at
        // the 125 ms cadence, so they're evaluated only on publish frames —
        // the every-frame pass covers the terminal chain and beat emitters.
        const previewsOn = uiEffectsEnabledRef.current && !analyzingMusicRef.current
        const fullPass = previewsOn && now - lastPreviewPublish.current >= PREVIEW_PUBLISH_INTERVAL_MS
        const evalStart = PERF_TELEMETRY ? performance.now() : 0
        // Supersampling evaluates the whole graph at ss× the matrix resolution;
        // the terminal frame is averaged back to gW×gH below (node previews ride
        // along at the higher res, which only sharpens their thumbnails).
        const ss = matrixSupersampleFactor(graphNodes)
        const { frame: rendered, outputs } = evaluateGraphFull(graphNodes, graphEdges, tick, gW * ss, gH * ss, groups, fullPass, trusted)
        const evalMs = PERF_TELEMETRY ? performance.now() - evalStart : 0
        let frame = applyMasterBrightness(rendered, graphNodes)
        if (frame) { if (ss > 1) frame = downscaleFrame(frame, ss) }
        else frame = idleFrame(tick, gW, gH)
        const showStart = PERF_TELEMETRY ? performance.now() : 0
        frame = applyShowPlaybackSignal(frame, useShowPlayback.getState(), gW, gH, groups, trusted)
        const showMs = PERF_TELEMETRY ? performance.now() - showStart : 0

        // Feed the live-stream send-loop the exact matrix frame the preview
        // just computed — cheap (a reference store, not a copy) since the
        // stream sends at its own throttled rate independent of this 60fps loop.
        publishStreamFrame(frame, gW, gH)

        const bw = canvasBufWRef.current, bh = canvasBufHRef.current
        const drawStart = PERF_TELEMETRY ? performance.now() : 0
        // Nothing shows the matrix canvas while the panel is hidden — skip the
        // draw (evaluation still ran above so node previews stay live).
        if (visible && useWebGL && glRef.current) {
          glRef.current.render(frame, gW, gH, px, previewStyleRef.current)
        } else if (visible && ctx) {
          if (canvas.width !== bw || canvas.height !== bh) {
            canvas.width = bw; canvas.height = bh
          }
          renderFrame(ctx, frame, px, previewStyleRef.current)
        }
        const drawMs = PERF_TELEMETRY ? performance.now() - drawStart : 0

        // Sample the matrix itself for an Ambilight-style spill. Updating CSS
        // variables directly at 10 fps avoids making the full preview React
        // tree re-render just to animate decorative light.
        if (visible && uiEffectsEnabledRef.current && frameCount.current % 6 === 0 && canvasWrapRef.current) {
          const ambient = frameAmbient(frame)
          const wrap = canvasWrapRef.current
          wrap.style.setProperty('--ambient-nw', ambient.colors[0])
          wrap.style.setProperty('--ambient-ne', ambient.colors[1])
          wrap.style.setProperty('--ambient-sw', ambient.colors[2])
          wrap.style.setProperty('--ambient-se', ambient.colors[3])
          wrap.style.setProperty('--ambient-opacity', String(Math.min(0.78, 0.08 + ambient.energy * 0.7)))
        }

        // Beat pulses last one evaluation frame, so publish them immediately;
        // otherwise keep React/store work to ~8 fps while the matrix stays at 60.
        const hasBeat = Array.from(outputs.values()).some((output) => output.beat === true)
        const publishStart = PERF_TELEMETRY ? performance.now() : 0
        if (fullPass || (previewsOn && hasBeat)) {
          if (!fullPass) {
            // A beat fired on a hot-only frame: carry the previous auxiliary
            // outputs forward so their previews don't blank until the next
            // full pass repopulates them.
            for (const [id, ports] of usePreviewStore.getState().outputs) {
              if (!outputs.has(id)) outputs.set(id, ports)
            }
          }
          usePreviewStore.getState().setOutputs(outputs)
          lastPreviewPublish.current = now
        }
        // Phase timings and the context object are dev-HUD-only; in production
        // recordPerfFrame is a no-op, so skip building its payload entirely.
        if (PERF_TELEMETRY) {
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
              nodes: graphNodes.length,
              edges: graphEdges.length,
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
        }

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

    const startRenderer = () => {
      if (disposed) return
      try {
        glRef.current = new WebGLLEDRenderer(canvas)
        useWebGL = true
      } catch {
        glRef.current = null
        ctx = canvas.getContext('2d')
      }
      animRef.current = requestAnimationFrame(loop)
    }

    if (typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(startRenderer, { timeout: 500 })
    } else {
      fallbackId = window.setTimeout(startRenderer, 0)
    }

    return () => {
      disposed = true
      if (idleId !== null) window.cancelIdleCallback(idleId)
      if (fallbackId !== null) window.clearTimeout(fallbackId)
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

  const onLoadedMetadata = () => {
    const player = playerRef.current
    if (!player) return
    player.volume = usePlayerTransport.getState().volume
    setMusicDuration(Number.isFinite(player.duration) ? player.duration : 0)
    setMusicReady(true)
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
    player.play().catch(() => setMusicError('This audio file could not be played in the browser.'))
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

  // The shared transport's `playing` flag also gates interaction sound effects.
  // Publish local-player activity without turning the track into an analysis
  // source: live graph audio continues to come exclusively from the microphone.
  useEffect(() => {
    if (!transport) usePlayerTransport.getState().setPos(musicCurrentTime * 1000, musicPlaying)
  }, [transport, musicCurrentTime, musicPlaying])

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
    <div className={`${styles.panel} ${stageMode ? styles.panelStage : ''} ${performanceMode ? styles.panelPerformance : ''}`}>
      <div className={`${styles.header} ${stageMode ? styles.headerStage : ''}`}>
        {stageMode ? (
          <div className={styles.stageIdentity}>
            <span className={styles.liveDot} aria-hidden="true" />
            <span className={styles.stageTitle}>Live output</span>
            <span className={styles.stageMeta}>
              {gridW}×{gridH} · {fps} FPS · Memory Used: {memoryMb === null ? 'Unavailable' : `${memoryMb} MiB`}
            </span>
          </div>
        ) : (
          <div className={styles.previewIdentity}>
            <span className={styles.previewTitle}>LED Preview</span>
            <span className={styles.previewMeta}>Output bay</span>
          </div>
        )}
      </div>
      <div
        ref={canvasWrapRef}
        className={`${styles.canvasWrap} ${effectivePreview3d ? styles.canvasWrap3d : ''}`}
      >
        {import.meta.env.DEV && <DevPerformanceHud />}
        {uiEffectsEnabled && <div className={styles.ambilight} aria-hidden="true" />}
        <div className={styles.canvasBay}>
          <div className={styles.canvasFrame}>
            <div className={styles.canvasFrameHeader} aria-label="Preview telemetry">
              <span className={`${styles.visualizerKicker} ${styles.canvasFrameTag}`}>Output matrix</span>
              <div className={styles.canvasHud}>
                <span className={styles.canvasHudChip}>{previewStyleLabel(effectivePreviewStyle)}</span>
                <span className={styles.canvasHudChip}>{hasFrameSignal ? 'Signal live' : 'Signal idle'}</span>
                <span className={styles.canvasHudChip}>
                  {showMode ? 'Show sync' : audioVisualizerLive ? 'Audio reactive' : 'Workbench'}
                </span>
                {performanceMode && <span className={styles.canvasHudChip}>Performance</span>}
              </div>
            </div>
            <div
              className={styles.canvasStack}
              style={effectivePreview3d ? { transform: `rotateX(${rot.x}deg) rotateY(${rot.y}deg)`, cursor: drag.current ? 'grabbing' : 'grab' } : undefined}
            >
              <canvas
                ref={canvasRef}
                width={canvasBufW}
                height={canvasBufH}
                className={`${styles.canvas} ${effectivePreviewStyle === 'standard' ? styles.canvasStandard : ''} ${isDiffusedStyle(effectivePreviewStyle) ? styles.canvasDiffusion : ''} ${isDiffusedStyle(effectivePreviewStyle) && effectivePreview3d ? styles.canvasDiffusion3d : ''} ${effectivePreviewStyle === 'crt' ? styles.canvasCrt : ''}`}
                onPointerDown={onRotateDown}
                onPointerMove={onRotateMove}
                onPointerUp={onRotateUp}
                onPointerCancel={onRotateUp}
              />
              {tileLayout && (
                <canvas
                  ref={tileGridCanvasRef}
                  width={canvasBufW}
                  height={canvasBufH}
                  className={styles.tileGridOverlay}
                  aria-hidden="true"
                />
              )}
            </div>
          </div>
        </div>
        {!hasFrameSignal && (
          <div className={styles.standbyHud} aria-live="polite">
            <span><i aria-hidden="true" /> Signal standby</span>
            <small>Patch a frame into output</small>
          </div>
        )}
      </div>
      <div className={styles.visualizer}>
          {uiEffectsEnabled && <div className={styles.visualizerGlow} />}
          {uiEffectsEnabled && <div className={styles.visualizerGrid} />}
          <div className={styles.visualizerSection}>
            <span className={styles.visualizerKicker}>Spectrum</span>
            <div className={styles.visualizerSettings}>
              <span className={styles.visualizerMeta}>
                {audioVisualizerLive ? 'Live analysis bus' : showMode ? 'Show playback feed' : 'Idle transport'}
              </span>
              {stageMode && (
                <button
                  type="button"
                  className={styles.visualizerToggle}
                  onClick={() => setSpectrumVisualizerMode(nextSpectrumVisualizerMode(spectrumVisualizerMode))}
                  aria-label={`Change spectrum visualizer. Current: ${spectrumVisualizerLabel(spectrumVisualizerMode)}`}
                  title="Show the next Stage spectrum visualizer"
                >
                  <span>{spectrumVisualizerLabel(spectrumVisualizerMode)}</span>
                  <i aria-hidden="true">↻</i>
                </button>
              )}
            </div>
          </div>
          <PreviewSpectrum
            audioVisualizerLive={audioVisualizerLive}
            spectrumOverride={playbackSpectrum}
            mode={stageMode ? spectrumVisualizerMode : 'bars'}
          />
          <div className={styles.musicControls}>
            <div className={styles.transportHeader}>
              <span className={styles.visualizerKicker}>Transport</span>
              <div className={styles.transportChips}>
                <span className={styles.transportChip}>{showMode ? 'Show' : 'Local'}</span>
                <span className={styles.transportChip}>{isPlaying ? 'Running' : 'Standing by'}</span>
                <span className={styles.transportChip}>{volume === 0 ? 'Muted' : `${Math.round(volume * 100)}%`}</span>
              </div>
            </div>
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
                <span className={styles.volumeLabel}>Gain</span>
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
          {stageMode && stagePatternName && (
            <div className={styles.stagePatternBrand}>
              <span className={styles.stagePatternKicker}>My Pattern</span>
              <strong className={styles.stagePatternName} title={stagePatternName}>{stagePatternName}</strong>
            </div>
          )}
          {uiEffectsEnabled && (
            <div className={styles.brandWrap} aria-hidden>
              <div className={styles.brandLockup}>
                <img
                  className={styles.brandLogo}
                  src="/fastled-studio-pixel-brand.png"
                  width="1535"
                  height="221"
                  fetchPriority="high"
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
          )}
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
