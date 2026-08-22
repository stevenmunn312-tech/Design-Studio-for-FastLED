import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'

export interface HardwareViewTransform {
  x: number
  y: number
  k: number
}

export interface HardwareViewBounds {
  x: number
  y: number
  width: number
  height: number
}

const IDENTITY: HardwareViewTransform = { x: 0, y: 0, k: 1 }
const MIN_ZOOM = 0.35
/**
 * A controller can start only a few pixels tall when a physically large LED
 * installation shares the bench. Its source render is high resolution, so let
 * the user get close enough to read the printed pin labels instead of stopping
 * at the former overview-only 6x limit.
 */
export const HARDWARE_VIEW_MAX_ZOOM = 40
const ZOOM_STEP = 1.5
/** Pointer travel that turns a click into a pan, so a part is still clickable. */
const DRAG_THRESHOLD_PX = 4
const FIT_PADDING_PX = 32

export function clampHardwareZoom(k: number): number {
  return Math.min(HARDWARE_VIEW_MAX_ZOOM, Math.max(MIN_ZOOM, k))
}

export function hardwareFitTransform(
  host: Pick<DOMRect, 'width' | 'height'>,
  content: HardwareViewBounds,
  viewport: HardwareViewBounds = { x: 0, y: 0, width: host.width, height: host.height },
): HardwareViewTransform {
  const availableWidth = Math.max(1, viewport.width - FIT_PADDING_PX * 2)
  const availableHeight = Math.max(1, viewport.height - FIT_PADDING_PX * 2)
  const k = clampHardwareZoom(Math.min(
    1,
    availableWidth / Math.max(1, content.width),
    availableHeight / Math.max(1, content.height),
  ))
  const hostCx = host.width / 2
  const hostCy = host.height / 2
  const contentCx = content.x + content.width / 2
  const contentCy = content.y + content.height / 2
  const viewportCx = viewport.x + viewport.width / 2
  const viewportCy = viewport.y + viewport.height / 2
  return {
    k,
    x: viewportCx - (hostCx + (contentCx - hostCx) * k),
    y: viewportCy - (hostCy + (contentCy - hostCy) * k),
  }
}

/**
 * Pan and zoom for the hardware view.
 *
 * The parts are laid out by normal flow and centred, so this transforms the
 * laid-out result rather than positioning anything: at k = 1 with no pan the
 * view is exactly the arrangement the layout produced, and `reset` returns to
 * it. Zoom is anchored on the pointer, so the part under the cursor stays under
 * the cursor — the same feel as the graph canvas.
 *
 * `moved` reports whether the gesture just ended was a drag, so a card's click
 * handler can ignore the click that ends a pan.
 */
export function useHardwareView(hostRef: RefObject<HTMLElement | null>) {
  const [transform, setTransform] = useState<HardwareViewTransform>(IDENTITY)
  const [panning, setPanning] = useState(false)
  const gesture = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null)
  const moved = useRef(false)

  const centreOf = useCallback(() => {
    const bounds = hostRef.current?.getBoundingClientRect()
    if (!bounds) return null
    return { cx: bounds.left + bounds.width / 2, cy: bounds.top + bounds.height / 2 }
  }, [hostRef])

  /*
   * With `transform-origin: center`, a point maps to
   *   screen = centre + (local - centre) * k + t
   * so holding the point under `clientX/clientY` fixed while k changes gives
   *   t1 = d - (d - t0) * k1 / k0,  where d = pointer - centre.
   */
  const zoomAt = useCallback((nextK: number, clientX?: number, clientY?: number) => {
    const centre = centreOf()
    setTransform((current) => {
      const k = clampHardwareZoom(nextK)
      if (k === current.k) return current
      if (!centre || clientX == null || clientY == null) {
        return { ...current, k }
      }
      const dx = clientX - centre.cx
      const dy = clientY - centre.cy
      return {
        k,
        x: dx - (dx - current.x) * (k / current.k),
        y: dy - (dy - current.y) * (k / current.k),
      }
    })
  }, [centreOf])

  const zoomIn = useCallback(() => zoomAt(transform.k * ZOOM_STEP), [transform.k, zoomAt])
  const zoomOut = useCallback(() => zoomAt(transform.k / ZOOM_STEP), [transform.k, zoomAt])
  const fit = useCallback((content: HardwareViewBounds, viewport?: HardwareViewBounds) => {
    const bounds = hostRef.current?.getBoundingClientRect()
    if (!bounds) return
    setTransform(hardwareFitTransform(bounds, content, viewport))
  }, [hostRef])

  // Non-passive so the browser page-zoom/scroll does not also act on the wheel.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const factor = Math.exp(-event.deltaY * 0.0015)
      setTransform((current) => {
        const k = clampHardwareZoom(current.k * factor)
        if (k === current.k) return current
        const bounds = host.getBoundingClientRect()
        const dx = event.clientX - (bounds.left + bounds.width / 2)
        const dy = event.clientY - (bounds.top + bounds.height / 2)
        return {
          k,
          x: dx - (dx - current.x) * (k / current.k),
          y: dy - (dy - current.y) * (k / current.k),
        }
      })
    }
    host.addEventListener('wheel', onWheel, { passive: false })
    return () => host.removeEventListener('wheel', onWheel)
  }, [hostRef])

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    // Secondary buttons keep opening the part menus.
    if (event.button !== 0) return
    moved.current = false
    gesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: transform.x,
      originY: transform.y,
    }
  }, [transform.x, transform.y])

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const active = gesture.current
    if (!active || active.pointerId !== event.pointerId) return
    const dx = event.clientX - active.startX
    const dy = event.clientY - active.startY
    if (!moved.current) {
      if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) return
      moved.current = true
      setPanning(true)
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    setTransform((current) => ({ ...current, x: active.originX + dx, y: active.originY + dy }))
  }, [])

  const endGesture = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const active = gesture.current
    if (!active || active.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    gesture.current = null
    setPanning(false)
  }, [])

  return {
    transform,
    panning,
    /** True when the click now firing is the tail of a pan. */
    consumedByPan: () => moved.current,
    zoomIn,
    zoomOut,
    fit,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endGesture,
      onPointerCancel: endGesture,
    },
  }
}
