import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { useUiStore } from '../uiStore'

describe('uiStore.setStatus auto-clear', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useUiStore.getState().clearStatus()
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('clears an error message after 5 seconds', () => {
    useUiStore.getState().setStatus('Something broke', 'error')
    expect(useUiStore.getState().statusText).toBe('Something broke')
    expect(useUiStore.getState().statusLevel).toBe('error')

    vi.advanceTimersByTime(4999)
    expect(useUiStore.getState().statusLevel).toBe('error') // still showing

    vi.advanceTimersByTime(1)
    expect(useUiStore.getState().statusText).toBe('Ready')
    expect(useUiStore.getState().statusLevel).toBe('idle')
  })

  it('clears info and success messages after 5 seconds', () => {
    for (const level of ['info', 'success'] as const) {
      useUiStore.getState().setStatus(`msg ${level}`, level)
      vi.advanceTimersByTime(5000)
      expect(useUiStore.getState().statusLevel).toBe('idle')
    }
  })

  it('a newer message resets the timer instead of being wiped by a stale one', () => {
    useUiStore.getState().setStatus('first', 'info')
    vi.advanceTimersByTime(4000)
    useUiStore.getState().setStatus('second', 'error')

    // The first message's original 5 s deadline passes...
    vi.advanceTimersByTime(1000)
    expect(useUiStore.getState().statusText).toBe('second') // not wiped

    // ...the second message clears 5 s after it was set.
    vi.advanceTimersByTime(4000)
    expect(useUiStore.getState().statusLevel).toBe('idle')
  })

  it('sets preview style and persists the preference', () => {
    useUiStore.getState().setPreviewStyle('neon')
    expect(useUiStore.getState().previewStyle).toBe('neon')
    expect(localStorage.getItem('fastled-studio-preview-style')).toBe('"neon"')

    useUiStore.getState().setPreviewStyle('crt')
    expect(useUiStore.getState().previewStyle).toBe('crt')
    expect(localStorage.getItem('fastled-studio-preview-style')).toBe('"crt"')
  })

  it('cycles preview style and persists the next value', () => {
    useUiStore.getState().setPreviewStyle('soft')
    useUiStore.getState().cyclePreviewStyle()
    expect(useUiStore.getState().previewStyle).toBe('dreamy')
    expect(localStorage.getItem('fastled-studio-preview-style')).toBe('"dreamy"')
  })

  it('enters and exits stage mode without persisting it across sessions', () => {
    useUiStore.getState().setStageMode(false)
    useUiStore.getState().toggleStageMode()
    expect(useUiStore.getState().stageMode).toBe(true)
    useUiStore.getState().setStageMode(false)
    expect(useUiStore.getState().stageMode).toBe(false)
  })
})
