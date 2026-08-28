import { useEffect, useMemo, useRef } from 'react'
import type { CSSProperties } from 'react'
import { usePreviewStore } from '../../state/previewStore'
import type { Frame } from '../../state/graphEvaluator'
import { corkscrewAngleAt, type CorkscrewDirection, type RingDirection } from '../../state/ledOutputForm'

/** Half the width of one LED on a ring, in bounding-box fractions — a 5050
 *  package against the ~76 mm circle a 24-LED ring describes. */
const RING_LED_RADIUS = 0.035
const CORKSCREW_LED_RADIUS_X = 0.028
const CORKSCREW_LED_RADIUS_Y = 0.016

export interface RingGeometry {
  ledCount: number
  startAngle: number
  direction: RingDirection
}

export interface CorkscrewGeometry {
  ledCount: number
  turns: number
  startAngle: number
  direction: CorkscrewDirection
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
  port = 'previewFrame',
  cols,
  rows,
  cellFill = 1,
  ring,
  corkscrew,
  run,
  style,
  className,
}: {
  nodeId: string
  /** Which published port to paint. Defaults to `previewFrame`, the routed
   *  physical frame an LED output receives. A source node's own thumbnail
   *  passes its output port instead, so the node that makes a frame and the
   *  node that lights it are drawn by one renderer rather than two that agree
   *  only by coincidence. */
  port?: string
  /** The emitter grid. May be coarser than the frame — a source thumbnail
   *  caps its cell count — in which case the frame is sampled down into it. */
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
  /** Draw one physical chain as a front-on helix. Its colours still arrive in
   *  wire order; only the fixed emitter positions change. */
  corkscrew?: CorkscrewGeometry | null
  /** A run the bench drew broken: which real emitter each drawn cell shows and
   *  the slot it occupies, over `span` slots. The removed middle is a slot
   *  range nothing is drawn in, so both ends keep the pitch an unbroken run
   *  would have had and the colours stay the colours of the LEDs they name. */
  run?: { cells: Array<{ index: number; slot: number }>; span: number } | null
  style?: CSSProperties
  className?: string
}) {
  const wrapRef = useRef<SVGSVGElement | null>(null)
  const cellRefs = useRef<Array<SVGRectElement | null>>([])
  const previousRef = useRef<Uint32Array>(new Uint32Array(0))
  const onScreenRef = useRef(true)

  const count = run ? run.cells.length : ring?.ledCount ?? corkscrew?.ledCount ?? cols * rows

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

  /*
   * Front-on projection of the same corkscrew angles used by the authoring
   * sample map. Depth makes the back half quieter and renders it first; the
   * wire-order refs remain indexed by LED so live colour painting is unchanged.
   */
  const corkscrewCells = useMemo(() => {
    if (!corkscrew) return null
    const count = Math.max(1, corkscrew.ledCount)
    const points = Array.from({ length: count }, (_, index) => {
      const theta = corkscrewAngleAt(
        index,
        count,
        corkscrew.turns,
        corkscrew.startAngle,
        corkscrew.direction,
      )
      const progress = count <= 1 ? 0.5 : index / (count - 1)
      const depth = Math.cos(theta)
      return {
        index,
        cx: 0.5 + (0.42 * Math.sin(theta)),
        cy: 0.04 + (0.92 * progress),
        depth,
        opacity: 0.42 + (0.58 * ((depth + 1) / 2)),
        scale: 0.72 + (0.28 * ((depth + 1) / 2)),
      }
    })
    return {
      points,
      // Back emitters first, front emitters last, like a real winding.
      painted: [...points].sort((a, b) => a.depth - b.depth),
    }
  }, [corkscrew])

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
    const paint = (frame: Frame | undefined, scale: number) => {
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
      // Proportional, so a grid coarser than the frame samples down instead of
      // showing a corner of it. An LED output's grid always equals its routed
      // frame exactly, which makes this the identity map for that caller.
      for (let index = 0; index < count; index++) {
        // A routed frame is already in the output's physical grid. Rings are a
        // one-row frame in wire order; their SVG positions below turn that row
        // into the configured circle without sampling it again.
        // A broken run names its emitters outright rather than deriving them
        // from a position: the cell after the break is LED 47, not the LED that
        // would sit there if the run had been drawn whole.
        const cell = run?.cells[index]
        const srcY = cell
          ? 0
          : Math.min(srcH - 1, Math.floor(Math.floor(index / cols) * srcH / rows))
        const srcX = cell
          ? Math.min(srcW - 1, cell.index)
          : Math.min(srcW - 1, Math.floor((index % cols) * srcW / cols))
        const pixel = frame[Math.min(srcH - 1, srcY)]?.[Math.min(srcW - 1, srcX)]
        if (!pixel) continue
        const r = Math.max(0, Math.min(255, Math.round(pixel.r * scale)))
        const g = Math.max(0, Math.min(255, Math.round(pixel.g * scale)))
        const b = Math.max(0, Math.min(255, Math.round(pixel.b * scale)))
        const packed = (r << 16) | (g << 8) | b
        if (previous[index] === packed) continue
        previous[index] = packed
        cellRefs.current[index]?.setAttribute('fill', `rgb(${r} ${g} ${b})`)
      }
    }

    // The Board's master brightness is applied here rather than baked into the
    // published frame: one place, so an LED output and the node feeding it are
    // dimmed identically and neither can be dimmed twice.
    const read = (state: ReturnType<typeof usePreviewStore.getState>) => {
      paint(
        state.outputs.get(nodeId)?.[port] as Frame | undefined,
        Math.max(0, Math.min(255, state.brightness)) / 255,
      )
    }
    read(usePreviewStore.getState())
    return usePreviewStore.subscribe(read)
  }, [cols, corkscrew, count, nodeId, port, ring, rows, run])

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

  if (corkscrewCells) {
    return (
      <svg
        ref={wrapRef}
        className={className}
        style={style}
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <polyline
          points={corkscrewCells.points.map((cell) => `${cell.cx},${cell.cy}`).join(' ')}
          fill="none"
          stroke="#5b4824"
          strokeWidth="0.036"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.8"
        />
        {corkscrewCells.painted.map((cell) => (
          <rect
            key={cell.index}
            ref={(element) => { cellRefs.current[cell.index] = element }}
            x={cell.cx - (CORKSCREW_LED_RADIUS_X * cell.scale)}
            y={cell.cy - (CORKSCREW_LED_RADIUS_Y * cell.scale)}
            width={CORKSCREW_LED_RADIUS_X * 2 * cell.scale}
            height={CORKSCREW_LED_RADIUS_Y * 2 * cell.scale}
            rx={CORKSCREW_LED_RADIUS_Y * 0.5}
            fill="rgb(0 0 0)"
            opacity={cell.opacity}
          />
        ))}
      </svg>
    )
  }

  if (run) {
    return (
      <svg
        ref={wrapRef}
        className={className}
        style={style}
        viewBox={`0 0 ${run.span} 1`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {run.cells.map((cell, index) => (
          <rect
            key={cell.index}
            ref={(element) => { cellRefs.current[index] = element }}
            x={cell.slot + ((1 - cellFill) / 2)}
            y={(1 - cellFill) / 2}
            width={cellFill}
            height={cellFill}
            rx={cellFill * 0.18}
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
