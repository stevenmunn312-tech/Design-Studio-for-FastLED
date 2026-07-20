import { useCallback, useRef } from 'react'
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

export function PanelResizeHandle({ side, width, min, max, defaultWidth, otherPanelWidth, label, onCommit }: PanelResizeHandleProps) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null)

  const clampForViewport = useCallback((next: number) => {
    const bounded = clampPanelWidth(next, min, max)
    const viewportCeiling = window.innerWidth - otherPanelWidth - MIN_CANVAS_WIDTH
    return Number.isFinite(viewportCeiling) ? Math.min(bounded, Math.max(min, viewportCeiling)) : bounded
  }, [min, max, otherPanelWidth])

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!drag.current) return
    const delta = (e.clientX - drag.current.startX) * (side === 'sidebar' ? 1 : -1)
    const next = clampForViewport(drag.current.startWidth + delta)
    document.documentElement.style.setProperty(CSS_VAR[side], `${next}px`)
  }, [side, clampForViewport])

  const handlePointerUp = useCallback((e: PointerEvent) => {
    if (!drag.current) return
    const delta = (e.clientX - drag.current.startX) * (side === 'sidebar' ? 1 : -1)
    const final = clampForViewport(drag.current.startWidth + delta)
    drag.current = null
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', handlePointerUp)
    document.body.style.removeProperty('cursor')
    onCommit(final)
  }, [side, clampForViewport, handlePointerMove, onCommit])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    drag.current = { startX: e.clientX, startWidth: width }
    document.body.style.cursor = 'col-resize'
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }, [width, handlePointerMove, handlePointerUp])

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
