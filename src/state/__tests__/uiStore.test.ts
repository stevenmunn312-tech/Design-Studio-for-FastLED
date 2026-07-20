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
    expect(localStorage.getItem('design-studio-for-fastled-preview-style')).toBe('"neon"')

    useUiStore.getState().setPreviewStyle('crt')
    expect(useUiStore.getState().previewStyle).toBe('crt')
    expect(localStorage.getItem('design-studio-for-fastled-preview-style')).toBe('"crt"')
  })

  it('cycles preview style and persists the next value', () => {
    useUiStore.getState().setPreviewStyle('soft')
    useUiStore.getState().cyclePreviewStyle()
    expect(useUiStore.getState().previewStyle).toBe('dreamy')
    expect(localStorage.getItem('design-studio-for-fastled-preview-style')).toBe('"dreamy"')
  })

  it('sets the spectrum visualizer and persists the preference', () => {
    useUiStore.getState().setSpectrumVisualizerMode('orbit')
    expect(useUiStore.getState().spectrumVisualizerMode).toBe('orbit')
    expect(localStorage.getItem('design-studio-for-fastled-spectrum-visualizer')).toBe('"orbit"')

    useUiStore.getState().setSpectrumVisualizerMode('auto')
    expect(useUiStore.getState().spectrumVisualizerMode).toBe('auto')
    expect(localStorage.getItem('design-studio-for-fastled-spectrum-visualizer')).toBe('"auto"')
  })

  it('persists the last start choice', () => {
    useUiStore.getState().setLastStartChoice('blank')
    expect(useUiStore.getState().lastStartChoice).toBe('blank')
    expect(localStorage.getItem('design-studio-for-fastled-last-start-choice')).toBe('"blank"')

    useUiStore.getState().setLastStartChoice('audio-spectrum')
    expect(useUiStore.getState().lastStartChoice).toBe('audio-spectrum')
    expect(localStorage.getItem('design-studio-for-fastled-last-start-choice')).toBe('"audio-spectrum"')
  })

  it('enters and exits stage mode without persisting it across sessions', () => {
    useUiStore.getState().setStageMode(false)
    useUiStore.getState().toggleStageMode()
    expect(useUiStore.getState().stageMode).toBe(true)
    useUiStore.getState().setStageMode(false)
    expect(useUiStore.getState().stageMode).toBe(false)
  })

  it('treats Perform as session-only state and does not persist the toggle', () => {
    localStorage.removeItem('design-studio-for-fastled-performance-mode')
    useUiStore.getState().setPerformanceMode(false)
    useUiStore.getState().togglePerformanceMode()

    expect(useUiStore.getState().performanceMode).toBe(true)
    expect(localStorage.getItem('design-studio-for-fastled-performance-mode')).toBeNull()

    useUiStore.getState().setPerformanceMode(false)
  })

  it('persists an explicit Signal dimming preference', () => {
    localStorage.removeItem('design-studio-for-fastled-signal-path-dim-enabled')
    useUiStore.setState({ signalPathDimEnabled: false })

    useUiStore.getState().toggleSignalPathDim()
    expect(useUiStore.getState().signalPathDimEnabled).toBe(true)
    expect(localStorage.getItem('design-studio-for-fastled-signal-path-dim-enabled')).toBe('true')

    useUiStore.getState().toggleSignalPathDim()
    expect(useUiStore.getState().signalPathDimEnabled).toBe(false)
    expect(localStorage.getItem('design-studio-for-fastled-signal-path-dim-enabled')).toBe('false')
  })

  it('queues fit-view requests with an incrementing nonce', () => {
    useUiStore.setState({ fitViewRequest: { nonce: 0 } })

    useUiStore.getState().requestFitView(['a', 'b'])
    expect(useUiStore.getState().fitViewRequest).toEqual({ nonce: 1, nodeIds: ['a', 'b'] })

    useUiStore.getState().requestFitView()
    expect(useUiStore.getState().fitViewRequest).toEqual({ nonce: 2, nodeIds: undefined })
  })
})
