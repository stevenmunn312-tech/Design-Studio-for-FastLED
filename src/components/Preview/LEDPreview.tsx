import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from 'react'
import { useGraphStore, getGroupRegistry, matrixTileLayout, rootGraphEdges, rootGraphNodes, type GraphMeta, type StudioEdge, type StudioNode } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'
import { useAudioStore } from '../../state/audioStore'
import { evaluateGraphFull, getPatternShowSelection, type Frame } from '../../state/graphEvaluator'
import { usePreviewStore } from '../../state/previewStore'
import { useShowPlayback } from '../../state/showPlayback'
import { usePlayerTransport } from '../../state/playerTransport'
import { usePatternLibrary } from '../../state/patternLibrary'
import { useMusicStore } from '../../state/musicStore'
import { showStateAt } from '../../state/showPreview'
import { showAudioSpectrum } from '../../state/showAudio'
import { WebGLLEDRenderer } from './webglRenderer'
import { renderPreviewFrame } from './frameCanvas'
import { applyShowPlaybackSignal } from './showPlaybackSignal'
import RecordPopup from './RecordPopup'
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
import { compositionDims, outputRoutes, routeFrame } from '../../state/outputRouting'
import { exitStagePresentation } from '../../utils/stagePresentation'
import { controllerSettings } from '../../state/controllerSettings'

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
  outputId = '',
): string | null {
  if (playbackShow?.patternSet?.length) {
    const live = showStateAt(playbackShow, playbackPosMs)
    const groupId = live.patternIndex >= 0 ? playbackShow.patternSet[live.patternIndex] : undefined
    return libraryPatternNameForGroup(groupId, graphs, libraryPatternIds, libraryNameCounts)
  }

  const output = nodes.find((node) => node.id === outputId && nodeTypeOf(node) === 'MatrixOutput')
    ?? nodes.find((node) => nodeTypeOf(node) === 'MatrixOutput')
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
// frame by the Board node's `brightness` (0–255, default 200 matching
// the generated sketch) so the preview matches what the hardware shows. Only
// the graph's own frame is dimmed — the idle shimmer isn't a real output, and
// show playback drives brightness through its own SET_BRIGHTNESS events.
function applyMasterBrightness(frame: Frame | null, brightness: number): Frame | null {
  if (!frame) return null
  if (brightness >= 255) return frame
  const s = brightness / 255
  // Scale in place: `frame` here is the caller-owned route buffer (routeFrame
  // reuse), a per-frame throwaway — mutating it avoids allocating a whole new
  // Frame + one RGB object per pixel on every 60fps preview tick.
  for (const row of frame) for (const px of row) { px.r *= s; px.g *= s; px.b *= s }
  return frame
}

/** Reuse the selected route buffer as a real black frame while an existing
 * output has no Frame cable. The colourful idle shimmer is reserved for a
 * graph with no LED output at all; showing it behind "Signal standby" made a
 * disconnected route look as though it was still receiving the old pattern. */
function clearOutputFrame(reuse: Frame | null, width: number, height: number): Frame {
  const frame = reuse && reuse.length === height && (reuse[0]?.length ?? 0) === width
    ? reuse
    : Array.from({ length: height }, () => Array.from({ length: width }, () => ({ r: 0, g: 0, b: 0 })))
  for (const row of frame) for (const pixel of row) { pixel.r = 0; pixel.g = 0; pixel.b = 0 }
  return frame
}

export default function LEDPreview() {
  const canvasWrapRef = useRef<HTMLDivElement>(null)
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  // Reused across frames by routeFrame so the routed/brightness-scaled frame
  // isn't reallocated every 60fps tick (the main preview-pipeline GC churn).
  const routeBufRef = useRef<Frame | null>(null)
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

  const graphHasFrameSignal = useGraphStore((s) => {
    const terminalIds = new Set(s.nodes
      .filter((node) => ['MatrixOutput', 'GroupOutput'].includes(String(node.data.nodeType)))
      .map((node) => node.id))
    return s.edges.some((edge) => terminalIds.has(edge.target) && edge.targetHandle === 'frame')
  })
  // A Performance Generator preview reaches the output bay through the show
  // playback bus rather than a LED output frame cable. Treat that live show
  // as a real frame signal so Stage does not contradict its lit matrix with a
  // "Signal idle" / standby overlay.
  const hasFrameSignal = graphHasFrameSignal || playbackShow !== null
  const graphAudioVisualizerLive = useGraphStore((s) => graphConsumesAudio(s.nodes, s.edges))
  const playbackSpectrum = playbackShow ? showAudioSpectrum(playbackShow.audio, playbackPosMs) : null
  const audioVisualizerLive = graphAudioVisualizerLive || !!playbackSpectrum
  // Every LED output is an explicit Frame route. Keep the preview focused
  // on one route at a time while the evaluator still computes all terminals.
  const outputRouteKey = useGraphStore((s) => JSON.stringify(outputRoutes(s.nodes).map((route) => ({
    id: route.id, label: route.label, width: route.width, height: route.height,
  }))))
  const previewRoutes = useMemo<Array<{ id: string; label: string; width: number; height: number }>>(
    () => JSON.parse(outputRouteKey),
    [outputRouteKey],
  )
  const previewOutputId = useUiStore((s) => s.previewOutputId)
  const setPreviewOutputId = useUiStore((s) => s.setPreviewOutputId)
  const selectedRouteSummary = previewRoutes.find((route) => route.id === previewOutputId) ?? previewRoutes[0]
  const activeOutputId = selectedRouteSummary?.id ?? ''
  useEffect(() => {
    if (activeOutputId !== previewOutputId) setPreviewOutputId(activeOutputId)
  }, [activeOutputId, previewOutputId, setPreviewOutputId])
  const activeOutput = useGraphStore((s) => s.nodes.find((node) => node.id === activeOutputId && node.data.nodeType === 'MatrixOutput'))
  // Real matrix dimensions — used for the canvas/WebGL buffer size, the
  // frame passed to the renderers, and the on-screen W×H readout, so a
  // strip layout (e.g. 10×1) never grows a phantom extra row/column. Only
  // the pixel-scale math below (`pixelScaleW/H`) floors to 2, so a thin
  // strip's LEDs aren't blown up to fill the whole available height/width.
  const gridW = Math.max(1, Math.min(64, selectedRouteSummary?.width ?? 16))
  const gridH = Math.max(1, Math.min(64, selectedRouteSummary?.height ?? 16))
  const pixelScaleW = Math.max(2, gridW)
  const pixelScaleH = Math.max(2, gridH)
  // Panel-tile grid (MatrixOutput layout==='panels') — 0 when there's nothing
  // to draw gridlines for. Select primitives, not the memoised object itself
  // (matching gridW/gridH's use of matrixDims below): a store selector must
  // return a referentially-stable result for an unchanged snapshot, and an
  // object literal breaks that even when its contents are equal, which
  // spins useSyncExternalStore into an infinite re-render loop. Physical
  // wiring order doesn't change the rendered content, so this is purely a
  // cosmetic overlay (see xyLayout.ts).
  const tileLayoutTilesX = activeOutput ? matrixTileLayout([activeOutput])?.tilesX ?? 0 : 0
  const tileLayoutTilesY = activeOutput ? matrixTileLayout([activeOutput])?.tilesY ?? 0 : 0
  const tileLayout = tileLayoutTilesX > 0 && tileLayoutTilesY > 0
    ? { tilesX: tileLayoutTilesX, tilesY: tileLayoutTilesY }
    : null
  const stageMode = useUiStore((s) => s.stageMode)
  const stageFullscreenStatus = useUiStore((s) => s.stageFullscreenStatus)
  const stageWakeLockStatus = useUiStore((s) => s.stageWakeLockStatus)
  // Stage is the audience view: once nobody has touched the pointer for a
  // couple of seconds, everything that is not a lit LED gets out of the way.
  // Pointer movement brings it all back, so the way out is always one nudge
  // away and Esc/F10 keep working regardless.
  const stageQuiet = useUiStore((s) => s.stageMode && s.stageIdle)
  const previewPanelOpen = useUiStore((s) => s.previewPanelOpen)
  const evaluationRunning = useUiStore((s) => s.evaluationRunning)
  // Stage-mode pattern name, derived inside a selector that returns a plain
  // string — graph edits (including every drag pointermove) only re-render this
  // panel when the displayed name actually changes. Off stage, skip the walk.
  const stagePatternName = useGraphStore((s) => {
    if (!stageMode) return null
    const lib = libraryLookup(libraryPatterns)
    return activeStagePatternName(s.nodes, s.edges, s.graphs, lib.ids, lib.nameCounts, playbackShow, playbackPosMs, activeOutputId)
  })
  const performanceMode = useUiStore((s) => s.performanceMode)
  const uiEffectsEnabled = useUiStore((s) => s.uiEffectsEnabled)
  const fps = useUiStore((s) => s.fps)
  const memoryMb = useUiStore((s) => s.memoryMb)
  const availableCanvasW = Math.max(0, canvasWrapSize.width - canvasWrapSize.padX)
  const availableCanvasH = Math.max(0, canvasWrapSize.height - canvasWrapSize.padY)
  const windowedPixelLimit = Math.min(
    stageMode ? STAGE_CANVAS_PX : MAX_CANVAS_PX,
    availableCanvasW > 0 ? availableCanvasW / pixelScaleW : stageMode ? STAGE_CANVAS_PX : MAX_CANVAS_PX,
    availableCanvasH > 0 ? availableCanvasH / pixelScaleH : stageMode ? STAGE_CANVAS_PX : MAX_CANVAS_PX,
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
  const activeOutputIdRef = useRef(activeOutputId)
  const pixelRef = useRef(pixel)
  const canvasBufWRef = useRef(canvasBufW)
  const canvasBufHRef = useRef(canvasBufH)
  useEffect(() => {
    gridWRef.current = gridW; gridHRef.current = gridH; pixelRef.current = pixel
    activeOutputIdRef.current = activeOutputId
    canvasBufWRef.current = canvasBufW; canvasBufHRef.current = canvasBufH
  }, [gridW, gridH, activeOutputId, pixel, canvasBufW, canvasBufH])

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
  const [recordOpen, setRecordOpen] = useState(false)
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
        const state = useGraphStore.getState()
        const { nodes: graphNodes, edges: graphEdges, trusted } = state
        // Brightness and the composition size are facts about the hardware, so
        // they come from the root graph — a pattern group open on the canvas
        // still renders at the project's matrix size and master brightness.
        const hardwareNodes = rootGraphNodes(state)
        const controller = controllerSettings(hardwareNodes)
        const groups = getGroupRegistry()
        // One evaluation pass feeds both the main matrix and every node preview.
        // Nodes disconnected from the output only feed previews published at
        // the 125 ms cadence, so they're evaluated only on publish frames —
        // the every-frame pass covers the terminal chain and beat emitters.
        const previewsOn = uiEffectsEnabledRef.current && !analyzingMusicRef.current
        const fullPass = previewsOn && now - lastPreviewPublish.current >= PREVIEW_PUBLISH_INTERVAL_MS
        const evalStart = PERF_TELEMETRY ? performance.now() : 0
        // Firmware renders once on a shared logical composition canvas, then
        // fits/crops each terminal's source frame into its physical route. Do
        // the same here and pick the route selected in the preview header.
        const composition = compositionDims(hardwareNodes, rootGraphEdges(state))
        const { outputs } = evaluateGraphFull(graphNodes, graphEdges, tick, composition.w, composition.h, groups, fullPass, trusted)
        const evalMs = PERF_TELEMETRY ? performance.now() - evalStart : 0
        const routes = outputRoutes(graphNodes)
        const selectedRoute = routes.find((route) => route.id === activeOutputIdRef.current) ?? routes[0]
        const rendered = selectedRoute
          ? (outputs.get(selectedRoute.id)?.frame as Frame | null | undefined) ?? null
          : null
        let frame = selectedRoute ? routeFrame(rendered, selectedRoute, composition.w, composition.h, routeBufRef.current) : null
        if (frame) routeBufRef.current = frame
        frame = applyMasterBrightness(frame, controller.brightness)
        if (!frame && selectedRoute) {
          frame = clearOutputFrame(routeBufRef.current, selectedRoute.width, selectedRoute.height)
          routeBufRef.current = frame
        }
        if (!frame) frame = idleFrame(tick, gW, gH)
        const showStart = PERF_TELEMETRY ? performance.now() : 0
        frame = applyShowPlaybackSignal(frame, useShowPlayback.getState(), gW, gH, groups, trusted)
        const showMs = PERF_TELEMETRY ? performance.now() - showStart : 0

        // Feed the live-stream send-loop the exact matrix frame the preview
        // just computed — cheap (a reference store, not a copy) since the
        // stream sends at its own throttled rate independent of this 60fps loop.
        // Publish the frame's own real shape, not gW/gH: those are floored to
        // a minimum of 2 for canvas/WebGL sizing, but a strip layout can be a
        // single row (height 1) — publishing the clamped height there made
        // the stream's width/height gate permanently disagree with the
        // receiver's correctly unclamped baked size, silently dropping every
        // frame forever (no error, fps stuck at 0) on any 1-row/1-col strip.
        publishStreamFrame(frame, frame[0]?.length ?? 0, frame.length)

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
          renderPreviewFrame(ctx, frame, px, previewStyleRef.current)
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
          // A percentage inset resolves independently per axis against the
          // frame's own box (top/bottom against height, left/right against
          // width), so a strip layout's short axis gets almost no spill room
          // and the glow reads as a hard rectangle instead of a soft bloom.
          // Base the spread on the frame's larger side in px so both axes
          // get the same absolute falloff room regardless of aspect ratio.
          wrap.style.setProperty('--ambient-spread', `${Math.max(16, Math.max(bw, bh) * 0.14)}px`)
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
          // Output-node and hardware-bay previews consume the physical routed
          // frame, not the evaluator's shared composition frame. Publishing it
          // beside the raw terminal value keeps fit/crop, form changes and ring
          // sampling identical to the main preview. Master brightness is *not*
          // baked in here — HardwareLedPreview applies it on paint, so an
          // output and the node feeding it dim by the same value.
          for (const route of routes) {
            const ports = outputs.get(route.id) ?? {}
            const source = ports.frame as Frame | null | undefined
            outputs.set(route.id, {
              ...ports,
              previewFrame: routeFrame(source ?? null, route, composition.w, composition.h),
            })
          }
          usePreviewStore.getState().setOutputs(outputs, controller.brightness)
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
      <div
        className={`${styles.header} ${stageMode ? styles.headerStage : ''} ${stageQuiet ? styles.stageChromeQuiet : ''}`}
        inert={stageQuiet}
      >
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
        <div className={styles.headerRight} aria-label={stageMode ? 'Stage controls and status' : 'Preview telemetry'}>
          {/* The route picker moved to the hardware view: outputs are
              identified by looking at them there, so they are chosen there
              too rather than by name in a dropdown here. */}
          {stageMode ? (
            <>
              <span
                className={`${styles.stageStatusChip} ${stageFullscreenStatus === 'active' ? styles.stageStatusActive : ''}`}
                title={stageFullscreenStatus === 'unavailable' ? 'Fullscreen was unavailable; Stage is running in this browser window.' : undefined}
              >
                {stageFullscreenStatus === 'active' ? 'Fullscreen' : stageFullscreenStatus === 'requesting' ? 'Going fullscreen' : 'Windowed'}
              </span>
              <span
                className={`${styles.stageStatusChip} ${stageWakeLockStatus === 'active' ? styles.stageStatusActive : ''}`}
                title={stageWakeLockStatus === 'unavailable' ? 'This browser could not keep the display awake.' : undefined}
              >
                {stageWakeLockStatus === 'active'
                  ? 'Screen awake'
                  : stageWakeLockStatus === 'requesting'
                    ? 'Keeping awake'
                    : stageWakeLockStatus === 'unavailable'
                      ? 'Wake lock unavailable'
                      : 'Screen may sleep'}
              </span>
              <button
                type="button"
                className={styles.exitStageBtn}
                onClick={() => void exitStagePresentation()}
                title="Exit Stage (Esc or F10)"
              >
                Exit Stage <kbd>Esc</kbd>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={styles.recordBtn}
                onClick={() => setRecordOpen(true)}
                title="Record or export the preview as PNG, GIF, or WebM"
              >
                <i aria-hidden="true" /> Record
              </button>
              <span className={styles.canvasHudChip}>{previewStyleLabel(effectivePreviewStyle)}</span>
              <span className={styles.canvasHudChip}>{hasFrameSignal ? 'Signal live' : 'Signal idle'}</span>
              <span className={styles.canvasHudChip}>
                {showMode ? 'Show sync' : audioVisualizerLive ? 'Audio reactive' : 'Workbench'}
              </span>
              {performanceMode && <span className={styles.canvasHudChip}>Performance</span>}
            </>
          )}
        </div>
      </div>
      <div
        ref={canvasWrapRef}
        className={`${styles.canvasWrap} ${effectivePreview3d ? styles.canvasWrap3d : ''}`}
      >
        {import.meta.env.DEV && <DevPerformanceHud />}
        <div className={styles.canvasBay}>
          <div className={styles.canvasFrame}>
            {uiEffectsEnabled && (
              <div className={styles.ambilight} aria-hidden="true">
                <i /><i /><i /><i />
              </div>
            )}
            <div className={styles.canvasFrameHeader}>
              <span className={`${styles.visualizerKicker} ${styles.canvasFrameTag}`}>
                {previewRoutes.length > 1 ? `Output route ${previewRoutes.findIndex((route) => route.id === activeOutputId) + 1}` : 'Output matrix'}
              </span>
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
      {/* Spectrum and transport are workbench furniture; on stage they leave
          with everything else once the room goes quiet. The standby HUD stays,
          because it is the only thing that explains a black stage. */}
      <div className={`${styles.visualizer} ${stageQuiet ? styles.stageChromeQuiet : ''}`} inert={stageQuiet}>
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
            <div className={`${styles.stagePatternBrand} ${stageQuiet ? styles.stageChromeQuiet : ''}`}>
              <span className={styles.stagePatternKicker}>My Pattern</span>
              <strong className={styles.stagePatternName} title={stagePatternName}>{stagePatternName}</strong>
            </div>
          )}
          {uiEffectsEnabled && (
            <div className={styles.brandWrap} aria-hidden>
              <div className={styles.brandLockup}>
                <img
                  className={styles.brandLogo}
                  src="/brand-concepts/concept-1-pixel.png"
                  width="1400"
                  height="243"
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
      {recordOpen && <RecordPopup onClose={() => setRecordOpen(false)} />}
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
