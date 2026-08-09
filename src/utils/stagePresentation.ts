import { useUiStore } from '../state/uiStore'

/** Enter Stage immediately, then progressively enhance it with browser fullscreen.
 *
 * Keep the request in the click/key event's call stack: the Fullscreen API needs
 * transient user activation and moving it into a React effect makes that timing
 * browser-dependent. Stage still works in-window when the API is unavailable or
 * the browser declines the request.
 */
export async function enterStagePresentation(): Promise<void> {
  const ui = useUiStore.getState()
  ui.setStageMode(true)

  if (typeof document === 'undefined') {
    ui.setStageFullscreenStatus('unavailable')
    return
  }

  if (document.fullscreenElement) {
    ui.setStageFullscreenStatus('active')
    return
  }

  const requestFullscreen = document.documentElement.requestFullscreen
  if (!requestFullscreen) {
    ui.setStageFullscreenStatus('unavailable')
    return
  }

  ui.setStageFullscreenStatus('requesting')
  try {
    await requestFullscreen.call(document.documentElement, { navigationUI: 'hide' })

    // A quick second press can exit Stage while the browser prompt is still
    // resolving. Do not strand the page fullscreen after that race.
    if (!useUiStore.getState().stageMode) {
      if (document.fullscreenElement) await document.exitFullscreen()
      return
    }
    useUiStore.getState().setStageFullscreenStatus(
      document.fullscreenElement ? 'active' : 'unavailable',
    )
  } catch {
    if (useUiStore.getState().stageMode) {
      useUiStore.getState().setStageFullscreenStatus('unavailable')
    }
  }
}

export async function exitStagePresentation(): Promise<void> {
  const ui = useUiStore.getState()
  ui.setStageMode(false)
  ui.setStageFullscreenStatus('idle')
  ui.setStageWakeLockStatus('idle')

  if (typeof document === 'undefined' || !document.fullscreenElement || !document.exitFullscreen) return
  try {
    await document.exitFullscreen()
  } catch {
    // The browser may already be unwinding fullscreen (for example after Esc).
  }
}
