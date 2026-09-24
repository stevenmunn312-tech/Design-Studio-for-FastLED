import type { PointerEvent as ReactPointerEvent } from 'react'
import type { WireTooltipHandle } from './wireHover'

/** Pointer handlers for the sheet: they read the tip off whichever wire group is under the pointer. */
export function wireTooltipHandlers(tooltip: { current: WireTooltipHandle | null }) {
  const track = (event: ReactPointerEvent<SVGSVGElement>) => {
    const wire = (event.target as Element).closest?.('[data-wire-tip]')
    const tip = wire?.getAttribute('data-wire-tip')
    if (tip) tooltip.current?.show(tip, event.clientX, event.clientY)
    else tooltip.current?.hide()
  }
  return {
    onPointerOver: track,
    onPointerMove: track,
    onPointerLeave: () => tooltip.current?.hide(),
  }
}
