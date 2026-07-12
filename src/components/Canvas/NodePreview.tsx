import { useEffect, useRef } from 'react'
import { usePreviewStore } from '../../state/previewStore'
import { paletteStops, type Frame } from '../../state/graphEvaluator'
import styles from './NodePreview.module.css'

type RGB = { r: number; g: number; b: number }
export type PreviewKind = 'frame' | 'palette' | 'color'

// Live thumbnail of a frame: draws the pixels 1:1 to a canvas, CSS-scaled to
// the node width at the matrix aspect ratio (`height` from the caller). A second,
// blurred copy sits behind it (CSS `filter: blur()`, GPU-composited) to approximate
// the main preview's LED glow without a per-pixel shader pass.
function FrameThumb({ frame, height }: { frame?: Frame; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const glowRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<ImageData | null>(null)
  useEffect(() => {
    const cv = ref.current
    const glowCv = glowRef.current
    if (!cv || !glowCv) return
    const h = frame?.length ?? 0
    const w = frame?.[0]?.length ?? 0
    if (!w || !h) return // nothing to draw yet
    const ctx = cv.getContext('2d')
    const glowCtx = glowCv.getContext('2d')
    if (!ctx || !glowCtx) return
    if (cv.width !== w || cv.height !== h) {
      cv.width = w
      cv.height = h
      glowCv.width = w
      glowCv.height = h
      imageRef.current = null
    }
    if (!imageRef.current || imageRef.current.width !== w || imageRef.current.height !== h) {
      imageRef.current = ctx.createImageData(w, h)
    }
    const img = imageRef.current
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        const p = frame![y][x]
        img.data[i] = p.r; img.data[i + 1] = p.g; img.data[i + 2] = p.b; img.data[i + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
    glowCtx.putImageData(img, 0, 0)
  }, [frame])
  return (
    <div className={styles.frameWrap} style={height ? { height } : undefined}>
      <canvas ref={glowRef} className={styles.glow} aria-hidden="true" />
      <canvas ref={ref} className={styles.frame} aria-hidden="true" />
    </div>
  )
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
export default function NodePreview({ nodeId, kind, port, height }: { nodeId: string; kind: PreviewKind; port: string; height?: number }) {
  const value = usePreviewStore((s) => s.outputs.get(nodeId)?.[port])
  if (kind === 'frame') return <FrameThumb frame={value as Frame | undefined} height={height} />
  if (kind === 'palette') return <PaletteStrip palette={(value as string | RGB[] | undefined) ?? 'rainbow'} />
  return <ColorSwatch color={(value as RGB | undefined) ?? { r: 0, g: 0, b: 0 }} />
}
