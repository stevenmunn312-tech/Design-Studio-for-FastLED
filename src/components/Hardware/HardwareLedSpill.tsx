import { useEffect, useMemo, useRef } from 'react'
import type { CSSProperties } from 'react'
import { usePreviewStore } from '../../state/previewStore'
import type { Frame } from '../../state/graphEvaluator'

/**
 * The light a part throws onto the bench around it.
 *
 * Spill is low-frequency by nature — what leaves the surface and lands nearby is
 * an average, not a picture — so a coarse sample is the correct model rather
 * than a compromise. A handful of wide, soft pools carry it: 4x4 across a panel,
 * 8x1 along a run.
 *
 * Built from geometry, not from a blur. A CSS filter over content that changes
 * every frame makes Chromium re-rasterise and leak the filter buffer, which is
 * the second of the two renderer-memory leaks this project has been bitten by
 * (see `src/dev/animationFilterGuard.ts`). Instead one shared radial gradient is
 * defined with `currentColor` stops, and each pool carries its own `color` — so
 * a frame costs one attribute per pool and nothing else.
 */
export default function HardwareLedSpill({
  nodeId,
  gradientId,
  sampleCols,
  sampleRows,
  style,
  className,
}: {
  nodeId: string
  gradientId: string
  sampleCols: number
  sampleRows: number
  style?: CSSProperties
  className?: string
}) {
  const wrapRef = useRef<SVGSVGElement | null>(null)
  const poolRefs = useRef<Array<SVGCircleElement | null>>([])
  const onScreenRef = useRef(true)

  const pools = useMemo(
    () => Array.from({ length: sampleCols * sampleRows }, (_, index) => index),
    [sampleCols, sampleRows],
  )

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
      for (let index = 0; index < sampleCols * sampleRows; index++) {
        const cx = index % sampleCols
        const cy = Math.floor(index / sampleCols)
        // Average the block this pool stands for. Averaging rather than sampling
        // is the point: one bright LED should not colour the whole pool.
        const x0 = Math.floor(cx * srcW / sampleCols)
        const x1 = Math.max(x0 + 1, Math.floor((cx + 1) * srcW / sampleCols))
        const y0 = Math.floor(cy * srcH / sampleRows)
        const y1 = Math.max(y0 + 1, Math.floor((cy + 1) * srcH / sampleRows))
        let r = 0, g = 0, b = 0, n = 0
        for (let y = y0; y < y1 && y < srcH; y++) {
          const row = frame[y]
          for (let x = x0; x < x1 && x < srcW; x++) {
            const pixel = row?.[x]
            if (!pixel) continue
            r += pixel.r; g += pixel.g; b += pixel.b; n++
          }
        }
        if (!n) continue
        poolRefs.current[index]?.setAttribute(
          'color',
          `rgb(${Math.round(r / n)} ${Math.round(g / n)} ${Math.round(b / n)})`,
        )
      }
    }

    const read = (state: ReturnType<typeof usePreviewStore.getState>) => {
      paint(state.outputs.get(nodeId)?.frame as Frame | undefined)
    }
    read(usePreviewStore.getState())
    return usePreviewStore.subscribe(read)
  }, [nodeId, sampleCols, sampleRows])

  // Pools are drawn on a unit grid and stretched by the SVG's own box, so the
  // same geometry serves a square panel and a long thin run.
  const radius = 0.62

  return (
    <svg
      ref={wrapRef}
      className={className}
      style={style}
      viewBox={`0 0 ${sampleCols} ${sampleRows}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={gradientId}>
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.55" />
          <stop offset="45%" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>
      {pools.map((index) => (
        <circle
          key={index}
          ref={(element) => { poolRefs.current[index] = element }}
          cx={(index % sampleCols) + 0.5}
          cy={Math.floor(index / sampleCols) + 0.5}
          r={radius}
          fill={`url(#${gradientId})`}
          color="rgb(0 0 0)"
        />
      ))}
    </svg>
  )
}
