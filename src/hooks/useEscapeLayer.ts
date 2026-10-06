import { useEffect, useRef } from 'react'

/**
 * One Escape closes one layer: the most recently opened popup, menu or dialog
 * that is still open.
 *
 * Each popup used to add its own keydown listener, and listeners on the same
 * target run in the order they were added. The lowest layer was always added
 * first, so it always answered first: Escape on Help or the Start gallery also
 * closed the Build Diagram through `App.tsx`'s window handler, and Escape in a
 * dialog opened from a Hardware menu also closed the menu. The stack answers
 * by open order instead, and stops the event so nothing beneath acts on it.
 *
 * The listener sits on document in the bubble phase, so an element that
 * answers Escape itself (an input abandoning its edit, a menu restoring focus)
 * runs first; when it calls `preventDefault`, the stack leaves the event alone.
 */

type Layer = { current: () => void }

const layers: Layer[] = []

function onKeyDown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.defaultPrevented) return
  const top = layers[layers.length - 1]
  if (!top) return
  event.preventDefault()
  event.stopPropagation()
  top.current()
}

export function useEscapeLayer(onEscape: () => void, open = true) {
  const layer = useRef(onEscape)
  layer.current = onEscape

  useEffect(() => {
    if (!open) return
    const entry = layer
    layers.push(entry)
    if (layers.length === 1) document.addEventListener('keydown', onKeyDown)
    return () => {
      layers.splice(layers.lastIndexOf(entry), 1)
      if (layers.length === 0) document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])
}
