import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import styles from './ScreenTooltip.module.css'

const POINTER_GAP_X = 14
const POINTER_GAP_Y = 16
const VIEWPORT_MARGIN = 12

/** Anchor away from the pointer and toward the viewport's interior. */
function screenTooltipPosition(x: number, y: number, width: number, height: number): CSSProperties {
  const horizontal = x > width / 2
    ? { right: Math.max(VIEWPORT_MARGIN, width - x + POINTER_GAP_X) }
    : { left: Math.max(VIEWPORT_MARGIN, x + POINTER_GAP_X) }
  const vertical = y > height / 2
    ? { bottom: Math.max(VIEWPORT_MARGIN, height - y + POINTER_GAP_Y) }
    : { top: Math.max(VIEWPORT_MARGIN, y + POINTER_GAP_Y) }
  return { ...horizontal, ...vertical }
}

/**
 * A tooltip in screen space, portalled to the body, beside the pointer at
 * (`x`, `y`) in client pixels. For things drawn inside a pan/zoom surface —
 * a Build Diagram wire, a link wire on the graph canvas — whose own
 * coordinates would shrink with the zoom, be clipped by the viewport, or sit
 * under the nodes drawn after them.
 */
export function ScreenTooltip({ tip, x, y }: { tip: string; x: number; y: number }) {
  if (typeof document === 'undefined') return null
  const position = screenTooltipPosition(x, y, window.innerWidth, window.innerHeight)
  return createPortal(
    <div role="tooltip" className={styles.tooltip} style={position}>
      {tip}
    </div>,
    document.body,
  )
}
