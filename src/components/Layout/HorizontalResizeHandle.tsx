import { useCallback, useRef } from 'react'
import styles from './PanelResizeHandle.module.css'

const KEYBOARD_STEP = 24

interface HorizontalResizeHandleProps {
  height: number
  min: number
  max: number
  containerHeight: number
  defaultRatio: number
  label: string
  onCommit: (ratio: number) => void
}

export function HorizontalResizeHandle({
  height,
  min,
  max,
  containerHeight,
  defaultRatio,
  label,
  onCommit,
}: HorizontalResizeHandleProps) {
  const drag = useRef<{ startY: number; startHeight: number } | null>(null)

  const clampHeight = useCallback((next: number) => {
    if (!Number.isFinite(containerHeight) || containerHeight <= 0) return min
    return Math.max(min, Math.min(max, next))
  }, [containerHeight, max, min])

  const commitHeight = useCallback((nextHeight: number) => {
    if (!Number.isFinite(containerHeight) || containerHeight <= 0) return
    onCommit(clampHeight(nextHeight) / containerHeight)
  }, [clampHeight, containerHeight, onCommit])

  const handlePointerMove = useCallback((event: PointerEvent) => {
    if (!drag.current) return
    const delta = drag.current.startY - event.clientY
    const next = clampHeight(drag.current.startHeight + delta)
    document.documentElement.style.setProperty('--hardware-pane-height', `${next}px`)
  }, [clampHeight])

  const handlePointerUp = useCallback((event: PointerEvent) => {
    if (!drag.current) return
    const delta = drag.current.startY - event.clientY
    const next = clampHeight(drag.current.startHeight + delta)
    drag.current = null
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', handlePointerUp)
    document.body.style.removeProperty('cursor')
    commitHeight(next)
  }, [clampHeight, commitHeight, handlePointerMove])

  const handlePointerDown = useCallback((event: React.PointerEvent) => {
    if (event.button !== 0) return
    drag.current = { startY: event.clientY, startHeight: height }
    document.body.style.cursor = 'row-resize'
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }, [handlePointerMove, handlePointerUp, height])

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      commitHeight(height + KEYBOARD_STEP)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      commitHeight(height - KEYBOARD_STEP)
    }
  }, [commitHeight, height])

  return (
    <div
      className={styles.horizontalResizeHandle}
      role="separator"
      aria-orientation="horizontal"
      aria-valuenow={Math.round(height)}
      aria-valuemin={Math.round(min)}
      aria-valuemax={Math.round(max)}
      aria-label={label}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      onDoubleClick={() => onCommit(defaultRatio)}
      title="Drag to resize hardware view · double-click to reset"
    />
  )
}
