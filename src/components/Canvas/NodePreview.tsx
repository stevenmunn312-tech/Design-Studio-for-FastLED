import { useEffect, useRef } from 'react'
import { usePreviewStore } from '../../state/previewStore'
import { paletteStops, type Frame } from '../../state/graphEvaluator'
import styles from './NodePreview.module.css'

type RGB = { r: number; g: number; b: number }
export type PreviewKind = 'frame' | 'palette' | 'color'

const THUMB_GRID = 16
const THUMB_PIXELS = Array.from({ length: THUMB_GRID * THUMB_GRID }, (_, index) => index)

// A fixed SVG grid avoids creating a new decoded image or canvas compositor
// resource for every frame. The same 256 rects are reused for the lifetime of
// the preview, so renderer memory stays bounded while the colours remain live.
function FrameThumb({ nodeId, port, height }: { nodeId: string; port: string; height?: number }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const pixelRefs = useRef<Array<SVGRectElement | null>>([])
  const previousColorsRef = useRef(new Uint32Array(THUMB_GRID * THUMB_GRID))
  const onScreenRef = useRef(true)

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => { onScreenRef.current = entries[entries.length - 1]?.isIntersecting ?? true },
      { rootMargin: '150px' },
    )
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const publish = (frame: Frame | undefined) => {
      if (!frame || !onScreenRef.current) return
      const srcH = frame.length
      const srcW = frame[0]?.length ?? 0
      if (!srcW || !srcH) return
      const previous = previousColorsRef.current
      for (let y = 0; y < THUMB_GRID; y++) {
        const srcY = Math.min(srcH - 1, Math.floor(y * srcH / THUMB_GRID))
        const srcRow = frame[srcY]
        for (let x = 0; x < THUMB_GRID; x++) {
          const srcX = Math.min(srcW - 1, Math.floor(x * srcW / THUMB_GRID))
          const index = y * THUMB_GRID + x
          const pixel = srcRow[srcX]
          const r = Math.max(0, Math.min(255, Math.round(pixel.r)))
          const g = Math.max(0, Math.min(255, Math.round(pixel.g)))
          const b = Math.max(0, Math.min(255, Math.round(pixel.b)))
          const packed = (r << 16) | (g << 8) | b
          if (previous[index] === packed) continue
          previous[index] = packed
          pixelRefs.current[index]?.setAttribute('fill', `rgb(${r} ${g} ${b})`)
        }
      }
    }

    const readFrame = (state: ReturnType<typeof usePreviewStore.getState>) => {
      publish(state.outputs.get(nodeId)?.[port] as Frame | undefined)
    }
    readFrame(usePreviewStore.getState())
    return usePreviewStore.subscribe(readFrame)
  }, [nodeId, port])

  return (
    <div ref={wrapRef} className={styles.frameWrap} style={height ? { height } : undefined}>
      <svg className={styles.frame} viewBox={`0 0 ${THUMB_GRID} ${THUMB_GRID}`} preserveAspectRatio="none" aria-hidden="true">
        {THUMB_PIXELS.map((index) => (
          <rect
            key={index}
            ref={(element) => { pixelRefs.current[index] = element }}
            x={index % THUMB_GRID}
            y={Math.floor(index / THUMB_GRID)}
            width="1"
            height="1"
            fill="rgb(0 0 0)"
          />
        ))}
      </svg>
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
  if (kind === 'frame') return <FrameThumb nodeId={nodeId} port={port} height={height} />
  return <ScalarPreview nodeId={nodeId} kind={kind} port={port} valueOverride={valueOverride} />
}

function ScalarPreview({ nodeId, kind, port, valueOverride }: {
  nodeId: string
  kind: Exclude<PreviewKind, 'frame'>
  port: string
  valueOverride?: unknown
}) {
  const value = usePreviewStore((s) => s.outputs.get(nodeId)?.[port])
  if (kind === 'palette') return <PaletteStrip palette={(valueOverride as string | RGB[] | undefined) ?? (value as string | RGB[] | undefined) ?? 'rainbow'} />
  return <ColorSwatch color={(value as RGB | undefined) ?? { r: 0, g: 0, b: 0 }} />
}
