import { useCallback, useSyncExternalStore, type ReactNode } from 'react'
import { placedWidgets, type DisplayDocument, type PlacedDisplayWidget } from '../../state/displayDocument'
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
  children: (widget: PlacedDisplayWidget, value: unknown) => ReactNode
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
  // Only what is on the screen draws. A widget that has been wired but not yet
  // placed lives in the designer's Connected group, not on the glass — and this
  // one narrowing covers both consumers, the Run surface and the thumbnail.
  return placedWidgets(document).map((widget) => (
    children(widget, displayRunValue(widget, runtime.readDisplayWidget(displayId, widget.id)))
  ))
}
