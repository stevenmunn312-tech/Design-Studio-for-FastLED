import { useCallback, useEffect, useRef, useState } from 'react'
import { useAudioStore } from '../../state/audio/audioStore'
import { useDecoderAudioStore } from '../../state/audio/decoderAudioStore'
import type { AudioCapabilityKind } from '../../state/audio/audioCapabilities'
import {
  SPECTRUM_VISUALIZER_STYLES,
  resampleSpectrum,
  spectrumVisualizerLabel,
  type SpectrumVisualizerMode,
  type SpectrumVisualizerStyle,
} from './spectrumVisualizerModes'
import { KELVIN_SKY, KELVIN_SOFT_WHITE, kelvinColour } from '../../themes/brandPalette'
import styles from './LEDPreview.module.css'

const NUM_BANDS = 32
const AUTO_CHANGE_MS = 14_000
const STYLE_FADE_MS = 560
const HISTORY_INTERVAL_MS = 70
const HISTORY_DEPTH = 34
const LIVE_PAINT_INTERVAL_MS = 1000 / 30

const clamp01 = (value: unknown) =>
  Math.max(0, Math.min(1, typeof value === 'number' && Number.isFinite(value) ? value : 0))

function smoothed(values: readonly number[]): number[] {
  return values.map((value, i) => {
    const left = values[i - 1] ?? value
    const right = values[i + 1] ?? value
    return clamp01(value * 0.6 + (left + value + right) * 0.1333)
  })
}

/** Bands sweep the brand palette: bass glows candle-warm, treble sky-cool. */
function bandPosition(index: number, count: number): number {
  return index / Math.max(1, count - 1)
}

function clearCanvas(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.clearRect(0, 0, width, height)
}

function barGradient(ctx: CanvasRenderingContext2D, x: number, y: number, height: number, band: number) {
  const gradient = ctx.createLinearGradient(x, y, x, y + Math.max(1, height))
  gradient.addColorStop(0, kelvinColour(band, 0.6))
  gradient.addColorStop(0.34, kelvinColour(band + 0.12, 0.15))
  gradient.addColorStop(1, kelvinColour(band + 0.28, -0.05))
  return gradient
}

function drawPeakDot(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, band: number) {
  ctx.save()
  ctx.fillStyle = kelvinColour(band + 0.07, 0.6)
  ctx.shadowColor = kelvinColour(band + 0.11, 0.05, 0.9)
  ctx.shadowBlur = Math.max(5, radius * 3)
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawBars(
  ctx: CanvasRenderingContext2D,
  values: readonly number[],
  peaks: readonly number[],
  width: number,
  height: number,
) {
  const gap = Math.max(2, width / 230)
  const cell = width / values.length
  const barWidth = Math.max(2, cell - gap)
  const floor = height - 3
  const usable = Math.max(1, height - 12)
  values.forEach((value, i) => {
    const barHeight = Math.max(2, value * usable)
    const x = i * cell + (cell - barWidth) / 2
    const y = floor - barHeight
    const band = bandPosition(i, values.length)
    ctx.save()
    ctx.fillStyle = barGradient(ctx, x, y, barHeight, band)
    ctx.shadowColor = kelvinColour(band, 0, 0.32)
    ctx.shadowBlur = Math.min(12, barWidth * 1.8)
    ctx.beginPath()
    ctx.roundRect(x, y, barWidth, barHeight, [barWidth / 2, barWidth / 2, 1, 1])
    ctx.fill()
    ctx.restore()
    drawPeakDot(ctx, x + barWidth / 2, floor - peaks[i] * usable, Math.max(1.3, Math.min(2.5, barWidth * 0.22)), band)
  })
}

function drawMirror(
  ctx: CanvasRenderingContext2D,
  values: readonly number[],
  peaks: readonly number[],
  width: number,
  height: number,
) {
  const cell = width / values.length
  const gap = Math.max(2, width / 260)
  const barWidth = Math.max(2, cell - gap)
  const centre = height / 2
  const usable = Math.max(1, height * 0.44)
  ctx.save()
  ctx.strokeStyle = kelvinColour(0.5, 0, 0.16)
  ctx.setLineDash([2, 5])
  ctx.beginPath()
  ctx.moveTo(0, centre)
  ctx.lineTo(width, centre)
  ctx.stroke()
  ctx.restore()
  values.forEach((value, i) => {
    const halfHeight = Math.max(1, value * usable)
    const x = i * cell + (cell - barWidth) / 2
    const band = bandPosition(i, values.length)
    const gradient = ctx.createLinearGradient(0, centre - halfHeight, 0, centre + halfHeight)
    gradient.addColorStop(0, kelvinColour(band, 0.2))
    gradient.addColorStop(0.5, kelvinColour(band + 0.2, -0.15, 0.72))
    gradient.addColorStop(1, kelvinColour(band, 0.2))
    ctx.fillStyle = gradient
    ctx.fillRect(x, centre - halfHeight, barWidth, halfHeight * 2)
    const peakY = peaks[i] * usable
    const dotRadius = Math.max(1.2, Math.min(2.3, barWidth * 0.2))
    drawPeakDot(ctx, x + barWidth / 2, centre - peakY, dotRadius, band)
    drawPeakDot(ctx, x + barWidth / 2, centre + peakY, dotRadius, band)
  })
}

function ribbonPath(
  ctx: CanvasRenderingContext2D,
  values: readonly number[],
  width: number,
  height: number,
  scale: number,
  offset: number,
) {
  const floor = height - 2
  const usable = height * scale
  ctx.beginPath()
  ctx.moveTo(0, floor)
  values.forEach((value, i) => {
    const x = (i / Math.max(1, values.length - 1)) * width
    const y = floor - value * usable - offset
    if (i === 0) ctx.lineTo(x, y)
    else {
      const prevX = ((i - 1) / Math.max(1, values.length - 1)) * width
      const prevY = floor - values[i - 1] * usable - offset
      ctx.quadraticCurveTo(prevX, prevY, (prevX + x) / 2, (prevY + y) / 2)
      if (i === values.length - 1) ctx.lineTo(x, y)
    }
  })
  ctx.lineTo(width, floor)
  ctx.closePath()
}

function drawRibbon(ctx: CanvasRenderingContext2D, values: readonly number[], width: number, height: number) {
  const fill = ctx.createLinearGradient(0, 0, width, 0)
  fill.addColorStop(0, kelvinColour(0, 0, 0.22))
  fill.addColorStop(0.48, kelvinColour(0.5, 0, 0.38))
  fill.addColorStop(1, kelvinColour(1, 0, 0.32))
  ribbonPath(ctx, values, width, height, 0.88, 0)
  ctx.fillStyle = fill
  ctx.fill()

  const upper = values.map((value, i) => clamp01(value * 0.78 + Math.sin(i * 0.62) * 0.025))
  ribbonPath(ctx, upper, width, height, 0.88, 0)
  ctx.strokeStyle = kelvinColour(KELVIN_SKY, 0.2, 0.88)
  ctx.shadowColor = kelvinColour(KELVIN_SKY, 0, 0.7)
  ctx.shadowBlur = 9
  ctx.lineWidth = 1.4
  ctx.stroke()

  ribbonPath(ctx, values, width, height, 0.88, 0)
  ctx.strokeStyle = kelvinColour(KELVIN_SOFT_WHITE, 0.2, 0.9)
  ctx.shadowColor = kelvinColour(KELVIN_SOFT_WHITE, 0, 0.75)
  ctx.shadowBlur = 8
  ctx.lineWidth = 1.1
  ctx.stroke()
  ctx.shadowBlur = 0
}

function drawOrbit(
  ctx: CanvasRenderingContext2D,
  values: readonly number[],
  peaks: readonly number[],
  width: number,
  height: number,
) {
  const cx = width / 2
  const cy = height / 2
  const maxRadius = Math.max(12, Math.min(width, height) * 0.46)
  const inner = maxRadius * 0.34
  const extent = maxRadius - inner - 6
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, inner)
  core.addColorStop(0, kelvinColour(KELVIN_SKY, 0, 0.24))
  core.addColorStop(0.58, kelvinColour(KELVIN_SOFT_WHITE, 0, 0.08))
  core.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = core
  ctx.beginPath()
  ctx.arc(cx, cy, inner, 0, Math.PI * 2)
  ctx.fill()
  values.forEach((value, i) => {
    const angle = -Math.PI / 2 + (i / values.length) * Math.PI * 2
    const band = bandPosition(i, values.length)
    const outer = inner + Math.max(2, value * extent)
    ctx.strokeStyle = kelvinColour(band, 0.1, 0.9)
    ctx.shadowColor = kelvinColour(band, 0, 0.48)
    ctx.shadowBlur = 6
    ctx.lineWidth = Math.max(1.4, Math.min(3.2, (Math.PI * inner * 2) / values.length * 0.38))
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner)
    ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer)
    ctx.stroke()
    const peakRadius = inner + peaks[i] * extent
    drawPeakDot(ctx, cx + Math.cos(angle) * peakRadius, cy + Math.sin(angle) * peakRadius, 1.65, band)
  })
  ctx.shadowBlur = 0
}

function drawWaterfall(
  ctx: CanvasRenderingContext2D,
  history: readonly number[][],
  width: number,
  height: number,
) {
  const layers = history.length
  if (!layers) return
  for (let layer = 0; layer < layers; layer++) {
    const values = history[layer]
    const age = layer / Math.max(1, layers - 1)
    const baseline = height - age * height * 0.92
    const amplitude = height * (0.32 - age * 0.14)
    const alpha = 0.88 - age * 0.72
    // Newest layer warm, receding layers cool toward sky.
    const band = age
    ctx.beginPath()
    values.forEach((value, i) => {
      const x = (i / Math.max(1, values.length - 1)) * width
      const y = baseline - value * amplitude
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.strokeStyle = kelvinColour(band, 0.1, alpha)
    ctx.lineWidth = layer === 0 ? 2 : 1
    ctx.shadowColor = kelvinColour(band, 0, alpha * 0.55)
    ctx.shadowBlur = layer < 4 ? 6 : 0
    ctx.stroke()
  }
  ctx.shadowBlur = 0
}

function drawStacks(
  ctx: CanvasRenderingContext2D,
  values: readonly number[],
  peaks: readonly number[],
  width: number,
  height: number,
) {
  const columns = Math.min(24, values.length)
  const sampled = resampleSpectrum(values, columns)
  const sampledPeaks = resampleSpectrum(peaks, columns)
  const segments = 12
  const cellW = width / columns
  const gapX = Math.max(1.5, cellW * 0.18)
  const segmentGap = Math.max(1.5, height * 0.012)
  const segmentH = Math.max(2, (height - segmentGap * (segments + 1)) / segments)
  for (let column = 0; column < columns; column++) {
    const band = bandPosition(column, columns)
    const active = Math.round(sampled[column] * segments)
    const peak = Math.min(segments - 1, Math.round(sampledPeaks[column] * (segments - 1)))
    for (let segment = 0; segment < segments; segment++) {
      const x = column * cellW + gapX / 2
      const y = height - segmentGap - (segment + 1) * (segmentH + segmentGap)
      const lit = segment < active
      const isPeak = segment === peak && sampledPeaks[column] > 0.02
      ctx.fillStyle = lit || isPeak
        ? kelvinColour(band + segment * 0.016, isPeak ? 0.55 : 0, isPeak ? 1 : 0.88)
        : kelvinColour(band, -0.5, 0.075)
      ctx.shadowColor = kelvinColour(band, 0, lit || isPeak ? 0.55 : 0)
      ctx.shadowBlur = lit || isPeak ? 5 : 0
      ctx.beginPath()
      ctx.roundRect(x, y, Math.max(2, cellW - gapX), segmentH, 1.5)
      ctx.fill()
    }
  }
  ctx.shadowBlur = 0
}

function drawConstellation(
  ctx: CanvasRenderingContext2D,
  values: readonly number[],
  peaks: readonly number[],
  history: readonly number[][],
  width: number,
  height: number,
) {
  const floor = height - 5
  const usable = Math.max(1, height - 14)
  const xAt = (index: number) => (index / Math.max(1, values.length - 1)) * width
  history.slice(1, 10).forEach((layer, ageIndex) => {
    const alpha = 0.18 * (1 - ageIndex / 10)
    layer.forEach((value, i) => {
      ctx.fillStyle = kelvinColour(bandPosition(i, layer.length), 0.15, alpha)
      ctx.beginPath()
      ctx.arc(xAt(i), floor - value * usable + ageIndex * 1.4, 1, 0, Math.PI * 2)
      ctx.fill()
    })
  })

  ctx.beginPath()
  values.forEach((value, i) => {
    const x = xAt(i)
    const y = floor - value * usable
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  const line = ctx.createLinearGradient(0, 0, width, 0)
  line.addColorStop(0, kelvinColour(0, 0, 0.42))
  line.addColorStop(0.52, kelvinColour(0.5, 0, 0.5))
  line.addColorStop(1, kelvinColour(1, 0, 0.46))
  ctx.strokeStyle = line
  ctx.lineWidth = 1
  ctx.stroke()

  values.forEach((value, i) => {
    const band = bandPosition(i, values.length)
    const x = xAt(i)
    const y = floor - value * usable
    drawPeakDot(ctx, x, y, 1.5 + value * 1.6, band)
    if (peaks[i] - value > 0.035) {
      ctx.strokeStyle = kelvinColour(band, 0.25, 0.24)
      ctx.setLineDash([1, 3])
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x, floor - peaks[i] * usable)
      ctx.stroke()
      ctx.setLineDash([])
      drawPeakDot(ctx, x, floor - peaks[i] * usable, 1.25, band)
    }
  })
}

function drawStyle(
  style: SpectrumVisualizerStyle,
  ctx: CanvasRenderingContext2D,
  values: readonly number[],
  peaks: readonly number[],
  history: readonly number[][],
  width: number,
  height: number,
) {
  switch (style) {
    case 'mirror': drawMirror(ctx, values, peaks, width, height); break
    case 'ribbon': drawRibbon(ctx, values, width, height); break
    case 'orbit': drawOrbit(ctx, values, peaks, width, height); break
    case 'waterfall': drawWaterfall(ctx, history, width, height); break
    case 'stacks': drawStacks(ctx, values, peaks, width, height); break
    case 'constellation': drawConstellation(ctx, values, peaks, history, width, height); break
    default: drawBars(ctx, values, peaks, width, height)
  }
}

/**
 * Browser/Stage spectrum display. It consumes the already-conditioned preview
 * spectrum and paints directly to canvas so microphone-rate updates do not
 * force the LED preview through React renders.
 */
export default function PreviewSpectrum({
  audioVisualizerLive,
  spectrumOverride,
  audioSourceKind,
  mode,
}: {
  audioVisualizerLive: boolean
  spectrumOverride?: number[] | null
  audioSourceKind?: AudioCapabilityKind | null
  mode: SpectrumVisualizerMode
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const propsRef = useRef({ audioVisualizerLive, spectrumOverride, audioSourceKind })
  propsRef.current = { audioVisualizerLive, spectrumOverride, audioSourceKind }
  const [autoIndex, setAutoIndex] = useState(0)
  const effectiveStyle: SpectrumVisualizerStyle = mode === 'auto'
    ? SPECTRUM_VISUALIZER_STYLES[autoIndex]
    : mode
  const styleRef = useRef(effectiveStyle)
  styleRef.current = effectiveStyle
  const peaksRef = useRef<number[]>(Array(NUM_BANDS).fill(0))
  const peakHoldsRef = useRef<number[]>(Array(NUM_BANDS).fill(0))
  const historyRef = useRef<number[][]>([])
  const lastHistoryRef = useRef(0)
  const lastPaintRef = useRef(performance.now())
  const paintRef = useRef<() => void>(() => {})
  const previousStyleRef = useRef(effectiveStyle)
  const transitionRef = useRef<{
    from: SpectrumVisualizerStyle
    to: SpectrumVisualizerStyle
    startedAt: number
  } | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const livePaintFrameRef = useRef<number | null>(null)
  const sizeRef = useRef<{ width: number; height: number } | null>(null)
  const lastLivePaintRef = useRef(0)

  useEffect(() => {
    if (mode !== 'auto') return
    const timer = window.setInterval(() => {
      setAutoIndex((index) => (index + 1) % SPECTRUM_VISUALIZER_STYLES.length)
    }, AUTO_CHANGE_MS)
    return () => window.clearInterval(timer)
  }, [mode])

  const paint = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    // Software canvas (see NodePreview): the FFT spectrum repaints every frame
    // while audio plays; as a hardware-accelerated 2D canvas that leaks GPU
    // compositor memory unbounded in Chromium.
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    // The size comes from the resize observer below. Measuring here asked the
    // browser for layout on every paint, in the middle of a frame.
    const size = sizeRef.current ?? canvas.getBoundingClientRect()
    sizeRef.current = size
    const width = Math.max(1, size.width)
    const height = Math.max(1, size.height)
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const bufferWidth = Math.max(1, Math.round(width * dpr))
    const bufferHeight = Math.max(1, Math.round(height * dpr))
    if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
      canvas.width = bufferWidth
      canvas.height = bufferHeight
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    clearCanvas(ctx, width, height)

    const { audioVisualizerLive: live, spectrumOverride: override, audioSourceKind: sourceKind } = propsRef.current
    const liveSource = sourceKind === 'decoder' ? useDecoderAudioStore.getState() : useAudioStore.getState()
    const source = override?.length ? override : liveSource.previewSpectrum
    // This is the music player's own meter, so an active selected bus is
    // sufficient to animate it. `audioVisualizerLive` additionally covers
    // baked show playback and graph-routed sources, but graph reachability must
    // not suppress a Decoder stream that the player is visibly playing.
    const sourceLive = live || liveSource.active || liveSource.micActive
    const values = smoothed(resampleSpectrum(sourceLive ? source : [], NUM_BANDS))
    const now = performance.now()
    const dt = Math.min(0.1, Math.max(0, (now - lastPaintRef.current) / 1000))
    lastPaintRef.current = now
    const peaks = peaksRef.current
    const holds = peakHoldsRef.current
    for (let i = 0; i < NUM_BANDS; i++) {
      if (!sourceLive) {
        peaks[i] = 0
        holds[i] = 0
      } else if (values[i] >= peaks[i]) {
        peaks[i] = values[i]
        holds[i] = 0.42
      } else if (holds[i] > 0) {
        holds[i] = Math.max(0, holds[i] - dt)
      } else {
        // Accelerating fall gives the peak dots their delayed drop-out-of-the-sky motion.
        const fall = 0.24 + (1 - peaks[i]) * 0.72
        peaks[i] = Math.max(values[i], peaks[i] - fall * dt)
      }
    }
    if (now - lastHistoryRef.current >= HISTORY_INTERVAL_MS) {
      historyRef.current.unshift([...values])
      historyRef.current.length = Math.min(HISTORY_DEPTH, historyRef.current.length)
      lastHistoryRef.current = now
    }

    const transition = transitionRef.current
    if (transition) {
      const progress = clamp01((now - transition.startedAt) / STYLE_FADE_MS)
      const eased = progress * progress * (3 - 2 * progress)
      ctx.save()
      ctx.globalAlpha = 1 - eased
      drawStyle(transition.from, ctx, values, peaks, historyRef.current, width, height)
      ctx.restore()
      ctx.save()
      ctx.globalAlpha = eased
      drawStyle(transition.to, ctx, values, peaks, historyRef.current, width, height)
      ctx.restore()
      if (progress < 1 && animationFrameRef.current === null) {
        animationFrameRef.current = window.requestAnimationFrame(() => {
          animationFrameRef.current = null
          paintRef.current()
        })
      } else if (progress >= 1) {
        transitionRef.current = null
      }
    } else {
      drawStyle(styleRef.current, ctx, values, peaks, historyRef.current, width, height)
    }
  }, [])
  paintRef.current = paint

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    // Layout is already settled when the observer reports, so measuring here
    // costs nothing; the paint then reuses the size.
    const observer = new ResizeObserver(() => {
      sizeRef.current = canvas.getBoundingClientRect()
      paintRef.current()
    })
    observer.observe(canvas)
    paintRef.current()
    let disposed = false
    const pollLiveSpectrum = (now: number) => {
      if (disposed) return
      // Read-only polling deliberately stays outside both audio stores'
      // subscriber chains. The LED evaluator can consume Decoder frames at
      // 60 fps without waiting for this decorated canvas to finish painting.
      if (now - lastLivePaintRef.current >= LIVE_PAINT_INTERVAL_MS) {
        lastLivePaintRef.current = now
        paintRef.current()
      }
      livePaintFrameRef.current = window.requestAnimationFrame(pollLiveSpectrum)
    }
    livePaintFrameRef.current = window.requestAnimationFrame(pollLiveSpectrum)
    return () => {
      disposed = true
      observer.disconnect()
      if (animationFrameRef.current !== null) window.cancelAnimationFrame(animationFrameRef.current)
      if (livePaintFrameRef.current !== null) window.cancelAnimationFrame(livePaintFrameRef.current)
    }
  }, [])

  useEffect(() => {
    if (previousStyleRef.current !== effectiveStyle) {
      transitionRef.current = {
        from: previousStyleRef.current,
        to: effectiveStyle,
        startedAt: performance.now(),
      }
      previousStyleRef.current = effectiveStyle
    }
    paintRef.current()
  }, [audioVisualizerLive, spectrumOverride, audioSourceKind, effectiveStyle])

  return (
    <canvas
      ref={canvasRef}
      className={styles.spectrumCanvas}
      data-visualizer={effectiveStyle}
      aria-label={`${spectrumVisualizerLabel(effectiveStyle)} spectrum visualizer`}
      role="img"
    />
  )
}
