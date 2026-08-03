import type { Frame } from '../../state/graphEvaluator'
import type { PreviewStyle } from './previewStyles'

// ── Canvas-2D LED sprites (shared by the live fallback renderer and export) ──
// Drawing every lit LED as two `arc` fills with shadowBlur — a per-LED
// Gaussian blur — crawls on large grids. Instead, pre-render each look
// (soft spill / emitter disc) as a small radial-gradient sprite per quantised
// colour and drawImage it, scaled per LED. Extracted from LEDPreview.tsx so
// the preview recorder renders frames with the exact same LED look.
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

export function renderGridFrame(ctx: CanvasRenderingContext2D, frame: Frame, pixel: number) {
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

// ── Diffused preview styles (Canvas-2D fallback for the WebGL shader) ────────
// Moved here from LEDPreview.tsx alongside renderGridFrame so the preview
// recorder rasterises through the identical code path: an export that renders
// its own approximation of the LED look cannot help but drift from what the
// panel actually shows (which is the whole point of the recorder).

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

const DIFFUSION_BG = 'rgb(4,3,9)'

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

/** The two off-screen canvases the diffusion passes composite through. The
 *  live preview and an in-flight export render at different sizes, so each
 *  owns its own pair — sharing one would resize (and so clear) it on every
 *  single frame while a recording is running. */
export interface DiffusionScratch {
  blend: HTMLCanvasElement | null
  source: HTMLCanvasElement | null
}

export function createDiffusionScratch(): DiffusionScratch {
  return { blend: null, source: null }
}

const sharedScratch = createDiffusionScratch()

export function renderDiffusionFrame(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  pixel: number,
  style: Exclude<PreviewStyle, 'standard'>,
  scratchPair: DiffusionScratch = sharedScratch,
) {
  const gridH = frame.length
  const gridW = frame[0]?.length ?? 0
  const width = gridW * pixel
  const height = gridH * pixel
  const cfg = CANVAS_STYLE_CONFIG[style]
  if (!scratchPair.blend) scratchPair.blend = document.createElement('canvas')
  if (!scratchPair.source) scratchPair.source = document.createElement('canvas')
  const blendCanvas = scratchPair.blend
  const sourceCanvas = scratchPair.source
  if (blendCanvas.width !== width || blendCanvas.height !== height) {
    blendCanvas.width = width
    blendCanvas.height = height
  }
  if (sourceCanvas.width !== gridW || sourceCanvas.height !== gridH) {
    sourceCanvas.width = gridW
    sourceCanvas.height = gridH
  }
  const scratch = blendCanvas.getContext('2d')
  const source = sourceCanvas.getContext('2d')
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
  scratch.drawImage(sourceCanvas, 0, 0, width, height)
  scratch.restore()

  scratch.save()
  scratch.globalCompositeOperation = 'screen'
  scratch.filter = `blur(${midBlur}px) ${cfg.midFilter}`
  scratch.globalAlpha = cfg.midAlpha
  scratch.drawImage(sourceCanvas, 0, 0, width, height)
  scratch.restore()

  scratch.save()
  scratch.globalCompositeOperation = 'lighter'
  scratch.filter = `blur(${closeBlur}px) ${cfg.closeFilter}`
  scratch.globalAlpha = cfg.closeAlpha
  scratch.drawImage(sourceCanvas, 0, 0, width, height)
  scratch.restore()

  scratch.save()
  scratch.globalCompositeOperation = 'screen'
  scratch.filter = `blur(${edgeBlur}px) ${cfg.edgeFilter}`
  scratch.globalAlpha = cfg.edgeAlpha
  scratch.drawImage(sourceCanvas, 0, 0, width, height)
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
  ctx.drawImage(blendCanvas, 0, 0)
  ctx.restore()
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  ctx.globalAlpha = cfg.finalScreenAlpha
  ctx.drawImage(blendCanvas, 0, 0)
  ctx.restore()
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = cfg.finalGlowAlpha
  ctx.drawImage(blendCanvas, 0, 0)
  ctx.restore()
}

/** Canvas-2D entry point for both the live preview and the recorder. */
export function renderPreviewFrame(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  pixel: number,
  style: PreviewStyle,
  scratchPair?: DiffusionScratch,
) {
  if (style !== 'standard') renderDiffusionFrame(ctx, frame, pixel, style, scratchPair)
  else renderGridFrame(ctx, frame, pixel)
}
