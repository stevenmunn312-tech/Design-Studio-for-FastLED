import { useCallback, useSyncExternalStore, type ReactNode } from 'react'
import type { DisplayDocument, DisplayWidget } from '../../state/displayDocument'
import { useDisplayRuntimeStore } from '../../state/displayRuntimeStore'
import { displayRunValue } from './displayRunPreview'

/**
 * Share one live-value reader between the editor Run surface and every panel
 * thumbnail. Each consumer subscribes to the monotonic display revision, so
 * one renderer cannot clear another renderer's update.
 */
export default function DisplayRuntimeWidgets({
  displayId,
  document,
  children,
}: {
  displayId: string
  document: DisplayDocument
  children: (widget: DisplayWidget, value: unknown) => ReactNode
}) {
  const subscribe = useCallback(
    (listener: () => void) => useDisplayRuntimeStore.getState().subscribeDisplay(displayId, listener),
    [displayId],
  )
  const snapshot = useCallback(
    () => useDisplayRuntimeStore.getState().displayRevision(displayId),
    [displayId],
  )
  useSyncExternalStore(subscribe, snapshot, snapshot)

  const runtime = useDisplayRuntimeStore.getState()
  return document.widgets.map((widget) => (
    children(widget, displayRunValue(widget, runtime.readDisplayWidget(displayId, widget.id)))
  ))
}
