import { useEffect, useRef } from 'react'
import { usePreviewStore } from '../../state/previewStore'
import { paletteStops, type Frame } from '../../state/graphEvaluator'
import styles from './NodePreview.module.css'

type RGB = { r: number; g: number; b: number }
export type PreviewKind = 'frame' | 'palette' | 'color'

// Live thumbnail of a frame: draws the pixels 1:1 to a canvas, CSS-scaled.
function FrameThumb({ frame }: { frame?: Frame }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const h = frame?.length ?? 0
    const w = frame?.[0]?.length ?? 0
    if (!w || !h) return // nothing to draw yet
    const ctx = cv.getContext('2d')
    if (!ctx) return
    cv.width = w; cv.height = h
    const img = ctx.createImageData(w, h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        const p = frame![y][x]
        img.data[i] = p.r; img.data[i + 1] = p.g; img.data[i + 2] = p.b; img.data[i + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
  }) // redraw on every render (each preview-store publish)
  return <canvas ref={ref} className={styles.frame} aria-hidden="true" />
}

function PaletteStrip({ palette }: { palette: string | RGB[] }) {
  const stops = paletteStops(palette, 16)
  const gradient = `linear-gradient(to right, ${stops
    .map((c, i) => `rgb(${c.r},${c.g},${c.b}) ${((i / (stops.length - 1)) * 100).toFixed(1)}%`)
    .join(', ')})`
  return <div className={styles.bar} style={{ background: gradient }} aria-hidden="true" />
}

function ColorSwatch({ color }: { color: RGB }) {
  return <div className={styles.bar} style={{ background: `rgb(${color.r},${color.g},${color.b})` }} aria-hidden="true" />
}

/** Top-of-node preview driven by the live evaluation in previewStore. */
export default function NodePreview({ nodeId, kind, port }: { nodeId: string; kind: PreviewKind; port: string }) {
  const value = usePreviewStore((s) => s.outputs.get(nodeId)?.[port])
  if (kind === 'frame') return <FrameThumb frame={value as Frame | undefined} />
  if (kind === 'palette') return <PaletteStrip palette={(value as string | RGB[] | undefined) ?? 'rainbow'} />
  return <ColorSwatch color={(value as RGB | undefined) ?? { r: 0, g: 0, b: 0 }} />
}
