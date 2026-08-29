import { useUiStore } from '../state/uiStore'

/** Enter the windowed Stage layout. Fullscreen is a separate, explicit action. */
export async function enterStagePresentation(): Promise<void> {
  const ui = useUiStore.getState()
  ui.setStageMode(true)
  ui.setStageFullscreenStatus(
    typeof document !== 'undefined' && document.fullscreenElement ? 'active' : 'idle',
  )
}

/** Toggle browser fullscreen without entering or leaving Stage itself.
 *
 * Keep the request in the button event's call stack: the Fullscreen API needs
 * transient user activation and moving it into a React effect makes that timing
 * browser-dependent.
 */
export async function toggleStageFullscreen(): Promise<void> {
  const ui = useUiStore.getState()
  if (!ui.stageMode) return

  if (typeof document === 'undefined') {
    ui.setStageFullscreenStatus('unavailable')
    return
  }

  if (document.fullscreenElement) {
    if (!document.exitFullscreen) {
      ui.setStageFullscreenStatus('unavailable')
      return
    }
    try {
      await document.exitFullscreen()
      if (useUiStore.getState().stageMode && !document.fullscreenElement) {
        useUiStore.getState().setStageFullscreenStatus('idle')
      }
    } catch {
      // The browser may already be unwinding fullscreen (for example after Esc).
    }
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

    // Exiting Stage while the browser prompt is resolving must not strand the
    // page fullscreen after that race.
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
