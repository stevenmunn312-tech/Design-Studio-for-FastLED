import { useEffect, useMemo, useRef } from 'react'
import type { CSSProperties } from 'react'
import { usePreviewStore } from '../../state/previewStore'
import type { Frame } from '../../state/graphEvaluator'
import type { RingDirection } from '../../state/ledOutputForm'

/** Half the width of one LED on a ring, in bounding-box fractions — a 5050
 *  package against the ~76 mm circle a 24-LED ring describes. */
const RING_LED_RADIUS = 0.035

export interface RingGeometry {
  ledCount: number
  startAngle: number
  direction: RingDirection
}

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
  cellFill = 1,
  ring,
  style,
  className,
}: {
  nodeId: string
  cols: number
  rows: number
  /** Fraction of each cell the emitter covers. A strip is drawn over a photo of
   *  real tape so its cells fill completely; a panel draws its own LEDs, and a
   *  5050 package on a 10 mm grid covers about half its cell. */
  cellFill?: number
  /** Draw the LEDs around a circle instead of on a grid, and read the frame
   *  through the ring's own XY mapping. A ring should look like a ring — a row
   *  of cells is a picture of a part the user did not buy. */
  ring?: RingGeometry | null
  style?: CSSProperties
  className?: string
}) {
  const wrapRef = useRef<SVGSVGElement | null>(null)
  const cellRefs = useRef<Array<SVGRectElement | null>>([])
  const previousRef = useRef<Uint32Array>(new Uint32Array(0))
  const onScreenRef = useRef(true)

  const count = ring ? ring.ledCount : cols * rows

  /*
   * A ring's LEDs, laid out on a unit-square viewBox. Angles match
   * `ringSampleMap` exactly — 0 degrees at 12 o'clock, clockwise positive — so
   * the LED lit here is the LED the frame was sampled for.
   */
  const ringCells = useMemo(() => {
    if (!ring) return null
    const radius = 0.5 - (RING_LED_RADIUS * 1.6)
    const sign = ring.direction === 'ccw' ? -1 : 1
    const start = ring.startAngle * Math.PI / 180
    return Array.from({ length: ring.ledCount }, (_, index) => {
      const theta = start + (sign * index * 2 * Math.PI / ring.ledCount)
      return { cx: 0.5 + (radius * Math.sin(theta)), cy: 0.5 - (radius * Math.cos(theta)) }
    })
  }, [ring])

  const cells = useMemo(
    () => Array.from({ length: count }, (_, index) => index),
    [count],
  )

  useEffect(() => {
    previousRef.current = new Uint32Array(count)
    cellRefs.current.length = count
  }, [count])

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
      if (!onScreenRef.current) return
      // A missing route is a real blackout, not "keep the last good frame".
      // Reset the colour cache as well as the SVG so reconnecting an identical
      // frame is still painted rather than mistaken for an unchanged one.
      if (!frame) {
        previousRef.current.fill(0)
        for (const cell of cellRefs.current) cell?.setAttribute('fill', 'rgb(0 0 0)')
        return
      }
      const srcH = frame.length
      const srcW = frame[0]?.length ?? 0
      if (!srcW || !srcH) return
      const previous = previousRef.current
      for (let index = 0; index < count; index++) {
        // `previewFrame` is already routed into the output's physical grid.
        // Rings are a one-row frame in wire order; their SVG positions below
        // turn that row into the configured circle without sampling it again.
        const srcY = Math.min(srcH - 1, Math.floor(index / cols))
        const srcX = Math.min(srcW - 1, index % cols)
        const pixel = frame[Math.min(srcH - 1, srcY)]?.[Math.min(srcW - 1, srcX)]
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
      paint(state.outputs.get(nodeId)?.previewFrame as Frame | undefined)
    }
    read(usePreviewStore.getState())
    return usePreviewStore.subscribe(read)
  }, [cols, count, nodeId, ring, rows])

  if (ringCells) {
    return (
      <svg
        ref={wrapRef}
        className={className}
        style={style}
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {ringCells.map((cell, index) => (
          <rect
            key={index}
            ref={(element) => { cellRefs.current[index] = element }}
            x={cell.cx - RING_LED_RADIUS}
            y={cell.cy - RING_LED_RADIUS}
            width={RING_LED_RADIUS * 2}
            height={RING_LED_RADIUS * 2}
            rx={RING_LED_RADIUS * 0.36}
            fill="rgb(0 0 0)"
          />
        ))}
      </svg>
    )
  }

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
          x={(index % cols) + ((1 - cellFill) / 2)}
          y={Math.floor(index / cols) + ((1 - cellFill) / 2)}
          width={cellFill}
          height={cellFill}
          rx={cellFill * 0.18}
          fill="rgb(0 0 0)"
        />
      ))}
    </svg>
  )
}
