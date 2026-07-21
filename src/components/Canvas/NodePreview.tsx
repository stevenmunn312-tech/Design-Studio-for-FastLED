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
// One shared, off-DOM scratch canvas used to rasterise every thumbnail. It is
// never inserted into the document, so it is never a compositor layer.
const scratch = typeof document !== 'undefined' ? document.createElement('canvas') : null

function FrameThumb({ frame, height }: { frame?: Frame; height?: number }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [src, setSrc] = useState<string | null>(null)
  // Only update on-screen previews (a big graph pans most nodes out of view).
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
    if (!onScreen || !scratch) return
    const srcH = frame?.length ?? 0
    const srcW = frame?.[0]?.length ?? 0
    if (!srcW || !srcH) return // nothing to draw yet
    const ctx = scratch.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    // Downsample only when the frame exceeds the thumbnail bound.
    const scale = Math.min(1, THUMB_MAX / Math.max(srcW, srcH))
    const w = Math.max(1, Math.round(srcW * scale))
    const h = Math.max(1, Math.round(srcH * scale))
    if (scratch.width !== w || scratch.height !== h) { scratch.width = w; scratch.height = h }
    const img = ctx.createImageData(w, h)
    for (let y = 0; y < h; y++) {
      const srow = frame![w === srcW ? y : Math.min(srcH - 1, (y * srcH / h) | 0)]
      for (let x = 0; x < w; x++) {
        const p = srow[w === srcW ? x : Math.min(srcW - 1, (x * srcW / w) | 0)]
        const i = (y * w + x) * 4
        img.data[i] = p.r; img.data[i + 1] = p.g; img.data[i + 2] = p.b; img.data[i + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
    // Publish as an <img>, NOT a live <canvas>. A visible canvas in the graph
    // becomes its own compositor layer, and on some GPUs/drivers (notably AMD
    // integrated) Chromium leaks renderer raster memory for each such layer,
    // every compositor frame, unboundedly — even when the canvas is not redrawn,
    // and invisible to the JS heap. An <img> is a normal painted element (like
    // the palette/color previews, which never leaked), so it costs nothing to
    // keep on screen. The rasterisation happens on the off-DOM scratch canvas.
    setSrc(scratch.toDataURL())
  }, [frame, onScreen])
  return (
    <div ref={wrapRef} className={styles.frameWrap} style={height ? { height } : undefined}>
      {src && <img src={src} className={styles.frame} alt="" aria-hidden="true" draggable={false} />}
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
