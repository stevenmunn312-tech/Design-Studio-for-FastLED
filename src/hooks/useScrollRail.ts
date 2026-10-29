import { useEffect, useState, type RefObject, type WheelEvent } from 'react'

/**
 * Which edges of a sideways-scrolling rail have content beyond them. The
 * chrome's rails (the top nav, the status bar's chips) hide their scrollbars
 * to stay quiet, so without this a narrow window cut items off with nothing
 * to say they were there. The rail sets `data-overflow-start`/`-end` from it
 * and fades that edge.
 */
export function useScrollOverflow(ref: RefObject<HTMLElement | null>) {
  const [overflow, setOverflow] = useState({ start: false, end: false })
  useEffect(() => {
    const rail = ref.current
    if (!rail) return
    const measure = () => {
      const start = rail.scrollLeft > 1
      const end = rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 1
      setOverflow((prev) => (prev.start === start && prev.end === end ? prev : { start, end }))
    }
    measure()
    rail.addEventListener('scroll', measure, { passive: true })
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(rail)
    for (const child of Array.from(rail.children)) observer?.observe(child)
    // Chips come and go with the project (Audio live, Show graph, Stage View),
    // so a rail's width changes without any observed element resizing. Watch
    // the child list and measure each chip from the moment it appears.
    const children = typeof MutationObserver === 'undefined' ? null : new MutationObserver((records) => {
      for (const record of records) {
        for (const node of Array.from(record.removedNodes)) if (node instanceof Element) observer?.unobserve(node)
        for (const node of Array.from(record.addedNodes)) if (node instanceof Element) observer?.observe(node)
      }
      measure()
    })
    children?.observe(rail, { childList: true })
    return () => {
      rail.removeEventListener('scroll', measure)
      children?.disconnect()
      observer?.disconnect()
    }
  }, [ref])
  return overflow
}

/**
 * A plain wheel only scrolls vertically, and these rails only scroll sideways,
 * so without this a mouse cannot reach what the fade hints at.
 */
export function scrollRailOnWheel(e: WheelEvent<HTMLElement>) {
  const rail = e.currentTarget
  if (rail.scrollWidth > rail.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
    rail.scrollLeft += e.deltaY
  }
}
