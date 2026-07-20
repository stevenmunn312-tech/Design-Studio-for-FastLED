import type { Frame } from '../../state/graphEvaluator'

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
