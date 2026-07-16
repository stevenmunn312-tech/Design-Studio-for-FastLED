import { useCallback, useEffect, useRef, useState } from 'react'
import { useAudioStore } from '../../state/audioStore'
import {
  SPECTRUM_VISUALIZER_STYLES,
  resampleSpectrum,
  spectrumVisualizerLabel,
  type SpectrumVisualizerMode,
  type SpectrumVisualizerStyle,
} from './spectrumVisualizerModes'
import styles from './LEDPreview.module.css'

const NUM_BANDS = 32
const AUTO_CHANGE_MS = 14_000
const STYLE_FADE_MS = 560
const HISTORY_INTERVAL_MS = 70
const HISTORY_DEPTH = 34

const clamp01 = (value: unknown) =>
  Math.max(0, Math.min(1, typeof value === 'number' && Number.isFinite(value) ? value : 0))

function smoothed(values: readonly number[]): number[] {
  return values.map((value, i) => {
    const left = values[i - 1] ?? value
    const right = values[i + 1] ?? value
    return clamp01(value * 0.6 + (left + value + right) * 0.1333)
  })
}

function bandHue(index: number, count: number): number {
  return 188 + (index / Math.max(1, count - 1)) * 148
}

function clearCanvas(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.clearRect(0, 0, width, height)
}

function barGradient(ctx: CanvasRenderingContext2D, x: number, y: number, height: number, hue: number) {
  const gradient = ctx.createLinearGradient(x, y, x, y + Math.max(1, height))
  gradient.addColorStop(0, `hsl(${hue} 100% 88%)`)
  gradient.addColorStop(0.34, `hsl(${hue + 18} 100% 68%)`)
  gradient.addColorStop(1, `hsl(${hue + 42} 100% 54%)`)
  return gradient
}

function drawPeakDot(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, hue: number) {
  ctx.save()
  ctx.fillStyle = `hsl(${hue + 10} 100% 88%)`
  ctx.shadowColor = `hsl(${hue + 16} 100% 62% / .9)`
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
    const hue = bandHue(i, values.length)
    ctx.save()
    ctx.fillStyle = barGradient(ctx, x, y, barHeight, hue)
    ctx.shadowColor = `hsl(${hue} 100% 58% / .32)`
    ctx.shadowBlur = Math.min(12, barWidth * 1.8)
    ctx.beginPath()
    ctx.roundRect(x, y, barWidth, barHeight, [barWidth / 2, barWidth / 2, 1, 1])
    ctx.fill()
    ctx.restore()
    drawPeakDot(ctx, x + barWidth / 2, floor - peaks[i] * usable, Math.max(1.3, Math.min(2.5, barWidth * 0.22)), hue)
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
  ctx.strokeStyle = 'rgba(126, 224, 255, .16)'
  ctx.setLineDash([2, 5])
  ctx.beginPath()
  ctx.moveTo(0, centre)
  ctx.lineTo(width, centre)
  ctx.stroke()
  ctx.restore()
  values.forEach((value, i) => {
    const halfHeight = Math.max(1, value * usable)
    const x = i * cell + (cell - barWidth) / 2
    const hue = bandHue(i, values.length)
    const gradient = ctx.createLinearGradient(0, centre - halfHeight, 0, centre + halfHeight)
    gradient.addColorStop(0, `hsl(${hue} 100% 70%)`)
    gradient.addColorStop(0.5, `hsl(${hue + 30} 100% 50% / .72)`)
    gradient.addColorStop(1, `hsl(${hue} 100% 70%)`)
    ctx.fillStyle = gradient
    ctx.fillRect(x, centre - halfHeight, barWidth, halfHeight * 2)
    const peakY = peaks[i] * usable
    const dotRadius = Math.max(1.2, Math.min(2.3, barWidth * 0.2))
    drawPeakDot(ctx, x + barWidth / 2, centre - peakY, dotRadius, hue)
    drawPeakDot(ctx, x + barWidth / 2, centre + peakY, dotRadius, hue)
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
  fill.addColorStop(0, 'hsl(188 100% 54% / .22)')
  fill.addColorStop(0.48, 'hsl(258 100% 62% / .38)')
  fill.addColorStop(1, 'hsl(336 100% 58% / .32)')
  ribbonPath(ctx, values, width, height, 0.88, 0)
  ctx.fillStyle = fill
  ctx.fill()

  const upper = values.map((value, i) => clamp01(value * 0.78 + Math.sin(i * 0.62) * 0.025))
  ribbonPath(ctx, upper, width, height, 0.88, 0)
  ctx.strokeStyle = 'rgba(255, 112, 205, .88)'
  ctx.shadowColor = 'rgba(255, 57, 183, .7)'
  ctx.shadowBlur = 9
  ctx.lineWidth = 1.4
  ctx.stroke()

  ribbonPath(ctx, values, width, height, 0.88, 0)
  ctx.strokeStyle = 'rgba(112, 225, 255, .9)'
  ctx.shadowColor = 'rgba(48, 201, 255, .75)'
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
  core.addColorStop(0, 'rgba(138, 93, 255, .24)')
  core.addColorStop(0.58, 'rgba(0, 226, 255, .08)')
  core.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = core
  ctx.beginPath()
  ctx.arc(cx, cy, inner, 0, Math.PI * 2)
  ctx.fill()
  values.forEach((value, i) => {
    const angle = -Math.PI / 2 + (i / values.length) * Math.PI * 2
    const hue = bandHue(i, values.length)
    const outer = inner + Math.max(2, value * extent)
    ctx.strokeStyle = `hsl(${hue} 100% 66% / .9)`
    ctx.shadowColor = `hsl(${hue} 100% 56% / .48)`
    ctx.shadowBlur = 6
    ctx.lineWidth = Math.max(1.4, Math.min(3.2, (Math.PI * inner * 2) / values.length * 0.38))
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner)
    ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer)
    ctx.stroke()
    const peakRadius = inner + peaks[i] * extent
    drawPeakDot(ctx, cx + Math.cos(angle) * peakRadius, cy + Math.sin(angle) * peakRadius, 1.65, hue)
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
    const hue = 194 + age * 136
    ctx.beginPath()
    values.forEach((value, i) => {
      const x = (i / Math.max(1, values.length - 1)) * width
      const y = baseline - value * amplitude
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.strokeStyle = `hsl(${hue} 100% 66% / ${alpha})`
    ctx.lineWidth = layer === 0 ? 2 : 1
    ctx.shadowColor = `hsl(${hue} 100% 56% / ${alpha * 0.55})`
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
    const hue = bandHue(column, columns)
    const active = Math.round(sampled[column] * segments)
    const peak = Math.min(segments - 1, Math.round(sampledPeaks[column] * (segments - 1)))
    for (let segment = 0; segment < segments; segment++) {
      const x = column * cellW + gapX / 2
      const y = height - segmentGap - (segment + 1) * (segmentH + segmentGap)
      const lit = segment < active
      const isPeak = segment === peak && sampledPeaks[column] > 0.02
      ctx.fillStyle = lit || isPeak
        ? `hsl(${hue + segment * 2.4} 100% ${isPeak ? 86 : 58}% / ${isPeak ? 1 : 0.88})`
        : `hsl(${hue} 80% 36% / .075)`
      ctx.shadowColor = `hsl(${hue} 100% 58% / ${lit || isPeak ? 0.55 : 0})`
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
      ctx.fillStyle = `hsl(${bandHue(i, layer.length)} 100% 68% / ${alpha})`
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
  line.addColorStop(0, 'rgba(78, 222, 255, .42)')
  line.addColorStop(0.52, 'rgba(151, 105, 255, .5)')
  line.addColorStop(1, 'rgba(255, 88, 190, .46)')
  ctx.strokeStyle = line
  ctx.lineWidth = 1
  ctx.stroke()

  values.forEach((value, i) => {
    const hue = bandHue(i, values.length)
    const x = xAt(i)
    const y = floor - value * usable
    drawPeakDot(ctx, x, y, 1.5 + value * 1.6, hue)
    if (peaks[i] - value > 0.035) {
      ctx.strokeStyle = `hsl(${hue} 100% 72% / .24)`
      ctx.setLineDash([1, 3])
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x, floor - peaks[i] * usable)
      ctx.stroke()
      ctx.setLineDash([])
      drawPeakDot(ctx, x, floor - peaks[i] * usable, 1.25, hue)
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
  mode,
}: {
  audioVisualizerLive: boolean
  spectrumOverride?: number[] | null
  mode: SpectrumVisualizerMode
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const propsRef = useRef({ audioVisualizerLive, spectrumOverride })
  propsRef.current = { audioVisualizerLive, spectrumOverride }
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
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    const width = Math.max(1, rect.width)
    const height = Math.max(1, rect.height)
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const bufferWidth = Math.max(1, Math.round(width * dpr))
    const bufferHeight = Math.max(1, Math.round(height * dpr))
    if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
      canvas.width = bufferWidth
      canvas.height = bufferHeight
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    clearCanvas(ctx, width, height)

    const { audioVisualizerLive: live, spectrumOverride: override } = propsRef.current
    const source = override?.length ? override : useAudioStore.getState().previewSpectrum
    const values = smoothed(resampleSpectrum(live ? source : [], NUM_BANDS))
    const now = performance.now()
    const dt = Math.min(0.1, Math.max(0, (now - lastPaintRef.current) / 1000))
    lastPaintRef.current = now
    const peaks = peaksRef.current
    const holds = peakHoldsRef.current
    for (let i = 0; i < NUM_BANDS; i++) {
      if (!live) {
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
    const observer = new ResizeObserver(() => paintRef.current())
    observer.observe(canvas)
    paintRef.current()
    let lastSpectrum: number[] | null = null
    const unsubscribe = useAudioStore.subscribe((state) => {
      if (propsRef.current.spectrumOverride?.length) return
      if (state.previewSpectrum === lastSpectrum) return
      lastSpectrum = state.previewSpectrum
      paintRef.current()
    })
    return () => {
      observer.disconnect()
      unsubscribe()
      if (animationFrameRef.current !== null) window.cancelAnimationFrame(animationFrameRef.current)
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
  }, [audioVisualizerLive, spectrumOverride, effectiveStyle])

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
