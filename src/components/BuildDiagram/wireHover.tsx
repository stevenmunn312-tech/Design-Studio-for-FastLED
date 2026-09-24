import { useImperativeHandle, useState, type Ref, type SVGProps } from 'react'
import { createPortal } from 'react-dom'
import styles from './BuildDiagramWorkspace.module.css'

/**
 * Hover identification for drawn wires.
 *
 * A wire is 3-10 units wide and the sheet is usually zoomed out, so the
 * visible stroke is too thin to aim at. Each hoverable wire therefore carries a
 * transparent, wider twin that takes the pointer, and the pair sit in one group
 * so CSS `:hover` can bloom the visible stroke with no React state at all —
 * re-rendering the whole sheet on every pointer move would be the expensive way
 * to light one path.
 *
 * The hit path is marked as pan background: grabbing a wire should still pan the
 * sheet, exactly as grabbing the empty space beside it does.
 */
const WIRE_BLOOM_FILTER_ID = 'wire-bloom'

export function HoverWire({ tip, ...path }: SVGProps<SVGPathElement> & { tip: string }) {
  return (
    <g className={styles.wireHover} data-wire-tip={tip}>
      <path {...path} />
      <path d={path.d} className={styles.wireHitArea} data-pan-background="true" aria-hidden="true" />
    </g>
  )
}

/**
 * The glow a hovered wire takes, in the wire's own colour. User-space units on
 * purpose: most wires are straight horizontal or vertical runs whose bounding
 * box has zero height or width, and a bounding-box filter region would then be
 * empty and make the hovered wire vanish instead of glow.
 */
export function WireBloomFilter({ height }: { height: number }) {
  return (
    <filter id={WIRE_BLOOM_FILTER_ID} filterUnits="userSpaceOnUse" x={-2000} y={-2000} width={6000} height={height + 4000}>
      <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="bloom" />
      <feMerge>
        <feMergeNode in="bloom" />
        <feMergeNode in="bloom" />
        <feMergeNode in="bloom" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  )
}

export interface WireTooltipHandle {
  show: (tip: string, clientX: number, clientY: number) => void
  hide: () => void
}

/**
 * Screen-space tooltip, portalled to the body: the diagram sits inside a
 * transformed pan/zoom surface, so anything drawn in its own coordinates would
 * shrink with the zoom and be clipped by the viewport.
 */
export function WireTooltip({ ref }: { ref: Ref<WireTooltipHandle> }) {
  const [state, setState] = useState<{ tip: string; x: number; y: number } | null>(null)
  useImperativeHandle(ref, () => ({
    show: (tip, x, y) => setState((current) => (
      current && current.tip === tip && current.x === x && current.y === y ? current : { tip, x, y }
    )),
    hide: () => setState(null),
  }), [])
  if (!state || typeof document === 'undefined') return null
  return createPortal(
    <div role="tooltip" className={styles.wireTooltip} style={{ left: state.x + 14, top: state.y + 16 }}>
      {state.tip}
    </div>,
    document.body,
  )
}
