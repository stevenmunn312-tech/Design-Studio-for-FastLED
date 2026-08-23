import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { placeFloating, type PlacementBox } from './floatingPlacement'

/**
 * A menu that stays on screen.
 *
 * The hardware pane is `overflow: hidden` and is only the lower part of the
 * window, so a menu positioned inside it was clipped by the pane rather than by
 * the viewport — a submenu with four entries lost its last one, and the only
 * way to read it was to resize the panes. Portalling to the body escapes that
 * clip; measuring against the viewport is what then keeps the menu in view.
 *
 * Placement follows the workbench's stated degradation rule: prefer the natural
 * side, flip to the opposite side when that does not fit, and when neither
 * fits, cap the height and scroll inside rather than overflow.
 */

/** Where the menu hangs from: a live element, or a point from a right-click. */
export type FloatingAnchor =
  | HTMLElement
  | { left: number; top: number; right: number; bottom: number }

interface FloatingMenuProps {
  anchor: FloatingAnchor | null
  /** `below` hangs under the anchor; `beside` flies out to its right. */
  placement: 'below' | 'beside'
  /** Horizontal alignment for `below`. Ignored for `beside`. */
  align?: 'center' | 'start'
  className?: string
  role?: string
  ariaLabel?: string
  /**
   * A cap the panel would like, on top of whatever the viewport allows.
   *
   * Without one, a panel with a lot to say fills the tallest side it can find
   * and reads as a full-height column rather than a popup beside the thing you
   * clicked. The viewport limit still wins when it is the smaller of the two.
   */
  maxHeight?: number
  /** The panel element, for outside-click tests against portalled content. */
  panelRef?: (element: HTMLDivElement | null) => void
  children: ReactNode
}

function anchorRect(anchor: FloatingAnchor): PlacementBox {
  if (anchor instanceof HTMLElement) {
    const box = anchor.getBoundingClientRect()
    return { left: box.left, top: box.top, right: box.right, bottom: box.bottom }
  }
  return anchor
}

export default function FloatingMenu({
  anchor,
  placement,
  align = 'center',
  className,
  role,
  ariaLabel,
  maxHeight,
  panelRef,
  children,
}: FloatingMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  // Hidden until measured, so the first paint is not at the wrong place.
  const [style, setStyle] = useState<CSSProperties>({
    position: 'fixed', left: 0, top: 0, visibility: 'hidden',
  })

  useLayoutEffect(() => {
    if (!anchor) return
    const place = () => {
      const element = ref.current
      if (!element) return
      const box = anchorRect(anchor)
      // scrollHeight is the content's height even once max-height clips it, so
      // measuring cannot feed back on the cap we are about to apply.
      const placed = placeFloating(
        box,
        { width: element.offsetWidth, height: element.scrollHeight },
        { width: window.innerWidth, height: window.innerHeight },
        placement,
        align,
        maxHeight,
      )

      setStyle((current) => {
        const needsScroll = placed.maxHeight + 1 < element.scrollHeight
        const next: CSSProperties = {
          position: 'fixed',
          left: Math.round(placed.left),
          top: Math.round(placed.top),
          maxHeight: needsScroll ? Math.round(placed.maxHeight) : undefined,
          overflowY: needsScroll ? 'auto' : undefined,
          visibility: 'visible',
        }
        const same = current.left === next.left
          && current.top === next.top
          && current.maxHeight === next.maxHeight
          && current.overflowY === next.overflowY
          && current.visibility === next.visibility
        return same ? current : next
      })
    }

    place()
    // A menu left open across a resize or a scrolled ancestor would otherwise
    // sit where the anchor used to be. `true` catches scrolls in any container.
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchor, placement, align, maxHeight, children])

  if (!anchor) return null

  return createPortal(
    <div
      ref={(element) => {
        ref.current = element
        panelRef?.(element)
      }}
      className={className}
      style={style}
      role={role}
      aria-label={ariaLabel}
    >
      {children}
    </div>,
    document.body,
  )
}
