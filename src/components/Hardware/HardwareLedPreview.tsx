import { useEffect, useMemo, useRef } from 'react'
import type { CSSProperties } from 'react'
import { usePreviewStore } from '../../state/previewStore'
import type { Frame } from '../../state/graphEvaluator'

/**
 * The live frame an output is showing, drawn over that part's render.
 *
 * A fixed SVG grid, not a canvas. A visible, per-frame-updated <canvas> becomes
 * its own compositor layer and Chromium leaks renderer raster memory for it
 * every compositor frame — unbounded, invisible to the JS heap, and badly
 * amplified on integrated GPUs. That cost this project a very long hunt and an
 * 8GB tab; `NodePreview` uses this same fixed-grid approach for the same reason.
 * See the dev guard in `src/dev/animationFilterGuard.ts`.
 *
 * One rect per LED, reused for the lifetime of the part, with only the `fill`
 * attribute mutated as frames arrive. Renderer memory stays bounded while the
 * colours stay live. For the same reason there is no CSS `filter` here: a filter
 * over content that changes every frame is the second leak shape.
 *
 * Painted imperatively from a `previewStore` subscription — this runs at the
 * evaluator's ~60fps and must never re-render React.
 */
export default function HardwareLedPreview({
  nodeId,
  cols,
  rows,
  style,
  className,
}: {
  nodeId: string
  cols: number
  rows: number
  style?: CSSProperties
  className?: string
}) {
  const wrapRef = useRef<SVGSVGElement | null>(null)
  const cellRefs = useRef<Array<SVGRectElement | null>>([])
  const previousRef = useRef<Uint32Array>(new Uint32Array(0))
  const onScreenRef = useRef(true)

  const cells = useMemo(
    () => Array.from({ length: cols * rows }, (_, index) => index),
    [cols, rows],
  )

  useEffect(() => {
    previousRef.current = new Uint32Array(cols * rows)
    cellRefs.current.length = cols * rows
  }, [cols, rows])

  useEffect(() => {
    const svg = wrapRef.current
    if (!svg || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => { onScreenRef.current = entries[entries.length - 1]?.isIntersecting ?? true },
      { rootMargin: '150px' },
    )
    observer.observe(svg)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const paint = (frame: Frame | undefined) => {
      if (!onScreenRef.current || !frame) return
      const srcH = frame.length
      const srcW = frame[0]?.length ?? 0
      if (!srcW || !srcH) return
      const previous = previousRef.current
      for (let index = 0; index < cols * rows; index++) {
        // Row-major across the source: a strip walks the frame in the order the
        // physical run does, a panel maps cell for cell.
        const srcY = rows === 1
          ? Math.min(srcH - 1, Math.floor(index / srcW))
          : Math.min(srcH - 1, Math.floor(Math.floor(index / cols) * srcH / rows))
        const srcX = rows === 1
          ? index % srcW
          : Math.min(srcW - 1, Math.floor((index % cols) * srcW / cols))
        const pixel = frame[srcY]?.[Math.min(srcW - 1, srcX)]
        if (!pixel) continue
        const r = Math.max(0, Math.min(255, Math.round(pixel.r)))
        const g = Math.max(0, Math.min(255, Math.round(pixel.g)))
        const b = Math.max(0, Math.min(255, Math.round(pixel.b)))
        const packed = (r << 16) | (g << 8) | b
        if (previous[index] === packed) continue
        previous[index] = packed
        cellRefs.current[index]?.setAttribute('fill', `rgb(${r} ${g} ${b})`)
      }
    }

    const read = (state: ReturnType<typeof usePreviewStore.getState>) => {
      paint(state.outputs.get(nodeId)?.frame as Frame | undefined)
    }
    read(usePreviewStore.getState())
    return usePreviewStore.subscribe(read)
  }, [cols, nodeId, rows])

  return (
    <svg
      ref={wrapRef}
      className={className}
      style={style}
      viewBox={`0 0 ${cols} ${rows}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {cells.map((index) => (
        <rect
          key={index}
          ref={(element) => { cellRefs.current[index] = element }}
          x={index % cols}
          y={Math.floor(index / cols)}
          width="1"
          height="1"
          fill="rgb(0 0 0)"
        />
      ))}
    </svg>
  )
}
