import { useEffect, useRef, useState } from 'react'
import { usePreviewStore } from '../../state/previewStore'
import { paletteStops, type Frame } from '../../state/graphEvaluator'
import styles from './NodePreview.module.css'

type RGB = { r: number; g: number; b: number }
export type PreviewKind = 'frame' | 'palette' | 'color'

// Cap the thumbnail's backing-store resolution. Frames are evaluated at the
// composition canvas size *including supersampling* (see outputRouting), so a
// large or supersampled matrix yields a 128×128+ frame. The preview is only a
// ~200px CSS-scaled canvas, so drawing it 1:1 costs far more than it shows.
// Downsample to this bound (nearest-neighbour) so a frame preview's cost is
// constant in the matrix/supersample size; `image-rendering: pixelated` keeps
// the LED look.
const THUMB_MAX = 96

// Live thumbnail of a frame: draws the pixels to a bounded canvas, CSS-scaled to
// the node width at the matrix aspect ratio (`height` from the caller).
//
// There is deliberately NO blurred glow layer. A canvas whose pixels are
// rewritten every frame (putImageData) cannot carry a CSS `filter` (e.g.
// `blur()`): Chromium re-rasterises the filtered layer on every content change
// and leaks the GPU filter buffer, growing GPU/compositor memory unbounded
// until the tab crashes — with a heavy, audio-reactive graph the per-node glow
// canvases were the dominant leak (multi-GB). This is the same footgun as a
// CSS filter on an infinitely-animated element (see GlowEdge.module.css), just
// driven by JS canvas writes instead of a keyframe animation.
function FrameThumb({ frame, height }: { frame?: Frame; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<ImageData | null>(null)
  // Only keep a live preview canvas for on-screen nodes. A big graph mounts a
  // canvas per frame node, but most are scrolled/panned out of view — and dozens
  // of continuously-updating, composited canvas *layers* pile up the renderer's
  // raster memory unbounded in Chromium (system RAM on an integrated GPU),
  // regardless of GPU vs software rendering. When a node leaves the viewport we
  // both skip its draw and drop the canvas from compositing (visibility:hidden),
  // so only the handful of visible previews stay live.
  const [onScreen, setOnScreen] = useState(true)
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => setOnScreen(entries[entries.length - 1]?.isIntersecting ?? true),
      { rootMargin: '150px' }, // resume a little before it scrolls into view
    )
    io.observe(wrap)
    return () => io.disconnect()
  }, [])
  useEffect(() => {
    if (!onScreen) return // off-screen: don't draw or composite this canvas
    const cv = ref.current
    if (!cv) return
    const srcH = frame?.length ?? 0
    const srcW = frame?.[0]?.length ?? 0
    if (!srcW || !srcH) return // nothing to draw yet
    // `willReadFrequently: true` forces a CPU-backed (software) 2D canvas. A
    // heavy graph mounts dozens of these thumbnails, each redrawn via
    // putImageData every frame; as *hardware-accelerated* canvases that leaks
    // GPU/compositor memory unbounded in Chromium (many live GPU textures that
    // are never reclaimed — multi-GB, invisible to the JS heap). Software
    // canvases hold no persistent GPU texture, and putImageData into a tiny
    // (<=96px) thumbnail is cheap on the CPU.
    const ctx = cv.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    // Downsample only when the frame exceeds the thumbnail bound; small matrices
    // draw 1:1 as before (scale === 1).
    const scale = Math.min(1, THUMB_MAX / Math.max(srcW, srcH))
    const w = Math.max(1, Math.round(srcW * scale))
    const h = Math.max(1, Math.round(srcH * scale))
    if (cv.width !== w || cv.height !== h) {
      cv.width = w
      cv.height = h
      imageRef.current = null
    }
    if (!imageRef.current || imageRef.current.width !== w || imageRef.current.height !== h) {
      imageRef.current = ctx.createImageData(w, h)
    }
    const img = imageRef.current
    for (let y = 0; y < h; y++) {
      const srow = frame![w === srcW ? y : Math.min(srcH - 1, (y * srcH / h) | 0)]
      for (let x = 0; x < w; x++) {
        const p = srow[w === srcW ? x : Math.min(srcW - 1, (x * srcW / w) | 0)]
        const i = (y * w + x) * 4
        img.data[i] = p.r; img.data[i + 1] = p.g; img.data[i + 2] = p.b; img.data[i + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
  }, [frame, onScreen])
  return (
    <div ref={wrapRef} className={styles.frameWrap} style={height ? { height } : undefined}>
      <canvas
        ref={ref}
        className={styles.frame}
        aria-hidden="true"
        style={onScreen ? undefined : { visibility: 'hidden' }}
      />
    </div>
  )
}

function PaletteStrip({ palette }: { palette: string | RGB[] }) {
  const stops = paletteStops(palette, 16)
  const gradient = `linear-gradient(to right, ${stops
    .map((c, i) => `rgb(${c.r},${c.g},${c.b}) ${((i / (stops.length - 1)) * 100).toFixed(1)}%`)
    .join(', ')})`
  return <div className={styles.bar} style={{ background: gradient }} data-testid="palette-preview-strip" aria-hidden="true" />
}

function ColorSwatch({ color }: { color: RGB }) {
  return <div className={styles.bar} style={{ background: `rgb(${color.r},${color.g},${color.b})` }} aria-hidden="true" />
}

/** Top-of-node preview driven by the live evaluation in previewStore. */
export default function NodePreview({
  nodeId,
  kind,
  port,
  height,
  valueOverride,
}: {
  nodeId: string
  kind: PreviewKind
  port: string
  height?: number
  valueOverride?: unknown
}) {
  const value = usePreviewStore((s) => s.outputs.get(nodeId)?.[port])
  if (kind === 'frame') return <FrameThumb frame={value as Frame | undefined} height={height} />
  if (kind === 'palette') return <PaletteStrip palette={(valueOverride as string | RGB[] | undefined) ?? (value as string | RGB[] | undefined) ?? 'rainbow'} />
  return <ColorSwatch color={(value as RGB | undefined) ?? { r: 0, g: 0, b: 0 }} />
}
