import { useCallback, useEffect, useRef } from 'react'
import { clampPanelWidth, MIN_CANVAS_WIDTH } from '../../state/layoutPresets'
import styles from './PanelResizeHandle.module.css'

const KEYBOARD_STEP = 16

interface PanelResizeHandleProps {
  side: 'sidebar' | 'preview'
  width: number
  min: number
  max: number
  defaultWidth: number
  otherPanelWidth: number
  label: string
  onCommit: (px: number) => void
}

const CSS_VAR: Record<PanelResizeHandleProps['side'], string> = {
  sidebar: '--sidebar-width',
  preview: '--right-panel-width',
}

/** A drag in progress: the width it last showed and how to let go of the
 *  window listeners it added. */
interface Drag {
  last: number
  release: () => void
}

export function PanelResizeHandle({ side, width, min, max, defaultWidth, otherPanelWidth, label, onCommit }: PanelResizeHandleProps) {
  const drag = useRef<Drag | null>(null)

  const clampForViewport = useCallback((next: number) => {
    const bounded = clampPanelWidth(next, min, max)
    const viewportCeiling = window.innerWidth - otherPanelWidth - MIN_CANVAS_WIDTH
    return Number.isFinite(viewportCeiling) ? Math.min(bounded, Math.max(min, viewportCeiling)) : bounded
  }, [min, max, otherPanelWidth])

  // Ends the drag however it ends — release, cancel or the handle going away —
  // and hands back the width it reached, or null when nothing was dragging.
  const endDrag = useCallback((): number | null => {
    const current = drag.current
    if (!current) return null
    drag.current = null
    current.release()
    document.body.style.removeProperty('cursor')
    return current.last
  }, [])

  // The panel can close, or the workspace change, under a drag in progress;
  // the window listeners and the resize cursor must not outlive the handle.
  useEffect(() => () => { endDrag() }, [endDrag])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0 || drag.current) return
    const startX = e.clientX
    const startWidth = width
    const move = (event: PointerEvent) => {
      if (!drag.current) return
      const delta = (event.clientX - startX) * (side === 'sidebar' ? 1 : -1)
      const next = clampForViewport(startWidth + delta)
      drag.current.last = next
      document.documentElement.style.setProperty(CSS_VAR[side], `${next}px`)
    }
    const up = (event: PointerEvent) => {
      move(event)
      const final = endDrag()
      if (final !== null) onCommit(final)
    }
    // A pointer the browser takes back (a touch the system claims, a window
    // losing capture) sends no pointerup; keep the width the drag reached so
    // the live panel and the store agree.
    const cancel = () => {
      const final = endDrag()
      if (final !== null) onCommit(final)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    drag.current = {
      last: startWidth,
      release: () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', cancel)
      },
    }
    document.body.style.cursor = 'col-resize'
  }, [width, side, clampForViewport, onCommit, endDrag])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      onCommit(clampForViewport(width + (side === 'sidebar' ? -KEYBOARD_STEP : KEYBOARD_STEP)))
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      onCommit(clampForViewport(width + (side === 'sidebar' ? KEYBOARD_STEP : -KEYBOARD_STEP)))
    }
  }, [side, width, clampForViewport, onCommit])

  return (
    <div
      className={side === 'sidebar' ? styles.sidebarResizeHandle : styles.previewResizeHandle}
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={Math.round(width)}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-label={label}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      onDoubleClick={() => onCommit(defaultWidth)}
      title={`Drag to resize · double-click to reset`}
    />
  )
}
