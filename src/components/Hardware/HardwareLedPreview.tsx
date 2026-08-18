import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { usePreviewStore } from '../../state/previewStore'
import type { Frame } from '../../state/graphEvaluator'

/**
 * The live frame an output is showing, drawn over that part's render.
 *
 * One canvas pixel per LED. The parts tile their LED render at exactly one tile
 * per LED, so a canvas stretched across the part registers pixel-for-LED with
 * the picture underneath — LED n lights the n-th drawn LED rather than a glow
 * smeared across the run.
 *
 * Blended rather than opaque so the physical render stays visible underneath:
 * an unlit strip should still look like a strip, not a black bar.
 *
 * Frames are read straight from `previewStore` and painted imperatively, the
 * same way node thumbnails do it — this runs at the evaluator's ~60fps and must
 * not re-render React on every frame.
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const onScreenRef = useRef(true)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => { onScreenRef.current = entries[entries.length - 1]?.isIntersecting ?? true },
      { rootMargin: '150px' },
    )
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return
    const image = context.createImageData(cols, rows)
    const data = image.data

    const paint = (frame: Frame | undefined) => {
      if (!onScreenRef.current) return
      const srcH = frame?.length ?? 0
      const srcW = frame?.[0]?.length ?? 0
      for (let index = 0; index < cols * rows; index++) {
        let r = 0, g = 0, b = 0
        if (frame && srcW && srcH) {
          // Row-major across the source, so a strip walks the frame in the same
          // order the physical run does and a panel maps cell for cell.
          const x = index % cols
          const y = Math.floor(index / cols)
          const srcY = rows === 1
            ? Math.min(srcH - 1, Math.floor(index / srcW))
            : Math.min(srcH - 1, Math.floor(y * srcH / rows))
          const srcX = rows === 1
            ? index % srcW
            : Math.min(srcW - 1, Math.floor(x * srcW / cols))
          const pixel = frame[srcY]?.[Math.min(srcW - 1, srcX)]
          if (pixel) {
            r = Math.max(0, Math.min(255, Math.round(pixel.r)))
            g = Math.max(0, Math.min(255, Math.round(pixel.g)))
            b = Math.max(0, Math.min(255, Math.round(pixel.b)))
          }
        }
        const offset = index * 4
        data[offset] = r
        data[offset + 1] = g
        data[offset + 2] = b
        data[offset + 3] = 255
      }
      context.putImageData(image, 0, 0)
    }

    const read = (state: ReturnType<typeof usePreviewStore.getState>) => {
      paint(state.outputs.get(nodeId)?.frame as Frame | undefined)
    }
    read(usePreviewStore.getState())
    return usePreviewStore.subscribe(read)
  }, [cols, nodeId, rows])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={style}
      width={cols}
      height={rows}
      aria-hidden="true"
    />
  )
}
