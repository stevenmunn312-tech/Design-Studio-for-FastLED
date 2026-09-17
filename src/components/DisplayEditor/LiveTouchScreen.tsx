import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { rootGraphNodes, useGraphStore } from '../../state/graphStore'
import { useUiStore, visibleLiveTouchScreen } from '../../state/uiStore'
import { nodeDisplayLabel } from '../../state/nodeLibrary'
import { panelsShowingDocument } from '../../state/mountedDisplays'
import DisplayRunSurface from './DisplayRunSurface'
import styles from './LiveTouchScreen.module.css'

const MAX_WINDOW_WIDTH = 360
const MAX_WINDOW_HEIGHT = 480

export default function LiveTouchScreen() {
  // The overlay only draws where it is reachable; Escape asks the same
  // question through the same selector, so neither can drift.
  const displayId = useUiStore(visibleLiveTouchScreen)
  const openDisplayId = useUiStore((state) => state.liveTouchScreenDisplayId)
  const closeLiveTouchScreen = useUiStore((state) => state.closeLiveTouchScreen)
  const openDisplayWorkspace = useUiStore((state) => state.openDisplayWorkspace)
  const openDocument = useGraphStore((state) => (openDisplayId ? state.displayDocuments[openDisplayId] : undefined))
  const document = displayId ? openDocument : undefined
  const panel = useGraphStore((state) => (displayId
    ? panelsShowingDocument(displayId, rootGraphNodes(state))[0]
    : undefined))
  const [position, setPosition] = useState({ x: 24, y: 72 })
  const drag = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null)

  // A design deleted while its overlay is open closes it, whether or not the
  // overlay happens to be on screen at the time.
  useEffect(() => {
    if (openDisplayId && !openDocument) closeLiveTouchScreen()
  }, [closeLiveTouchScreen, openDisplayId, openDocument])

  if (!displayId || !document) return null

  const width = document.designSize.width
  const height = document.designSize.height
  const scale = Math.min(1, MAX_WINDOW_WIDTH / width, MAX_WINDOW_HEIGHT / height)
  const title = panel
    ? nodeDisplayLabel(panel.data.nodeType, panel.data.properties as Record<string, unknown>, panel.data.label)
    : 'Touch screen'

  const onHeaderDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    if (event.target instanceof HTMLElement && event.target.closest('button')) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    }
  }
  const onHeaderMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return
    setPosition({
      x: Math.max(8, drag.current.originX + event.clientX - drag.current.startX),
      y: Math.max(8, drag.current.originY + event.clientY - drag.current.startY),
    })
  }
  const onHeaderUp = (event: ReactPointerEvent<HTMLElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return
    drag.current = null
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return createPortal(
    <div
      className={styles.window}
      role="dialog"
      aria-label={`${title} touch screen`}
      style={{ left: position.x, top: position.y }}
    >
      <header
        className={styles.header}
        onPointerDown={onHeaderDown}
        onPointerMove={onHeaderMove}
        onPointerUp={onHeaderUp}
        onPointerCancel={onHeaderUp}
      >
        <strong>{title}</strong>
        <div className={styles.actions}>
          <button type="button" onClick={() => openDisplayWorkspace(displayId)}>Edit design</button>
          <button type="button" onClick={closeLiveTouchScreen} aria-label="Close touch screen">Close</button>
        </div>
      </header>
      <div
        className={styles.bezel}
        style={{ width: width * scale, height: height * scale }}
      >
        <div
          className={styles.surface}
          style={{
            width,
            height,
            transform: `scale(${scale})`,
          }}
        >
          <DisplayRunSurface displayId={displayId} document={document} />
        </div>
      </div>
    </div>,
    globalThis.document.body,
  )
}
