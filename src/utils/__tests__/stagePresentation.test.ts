import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enterStagePresentation, exitStagePresentation, toggleStageFullscreen } from '../stagePresentation'
import { useUiStore } from '../../state/uiStore'

describe('stage presentation', () => {
  const originalRequestFullscreen = document.documentElement.requestFullscreen
  const originalExitFullscreen = document.exitFullscreen
  const originalFullscreenDescriptor = Object.getOwnPropertyDescriptor(document, 'fullscreenElement')

  beforeEach(() => {
    useUiStore.setState({
      stageMode: false,
      stageFullscreenStatus: 'idle',
      stageWakeLockStatus: 'idle',
    })
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null })
  })

  afterEach(() => {
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: originalRequestFullscreen,
    })
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: originalExitFullscreen,
    })
    if (originalFullscreenDescriptor) {
      Object.defineProperty(document, 'fullscreenElement', originalFullscreenDescriptor)
    } else {
      Reflect.deleteProperty(document, 'fullscreenElement')
    }
  })

  it('enters Stage without requesting fullscreen', async () => {
    const requestFullscreen = vi.fn()
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    })

    await enterStagePresentation()

    expect(requestFullscreen).not.toHaveBeenCalled()
    expect(useUiStore.getState().stageMode).toBe(true)
    expect(useUiStore.getState().stageFullscreenStatus).toBe('idle')
  })

  it('enters fullscreen from its separate Stage action', async () => {
    const requestFullscreen = vi.fn(async () => {
      Object.defineProperty(document, 'fullscreenElement', {
        configurable: true,
        value: document.documentElement,
      })
    })
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    })
    useUiStore.setState({ stageMode: true })

    await toggleStageFullscreen()

    expect(requestFullscreen).toHaveBeenCalledWith({ navigationUI: 'hide' })
    expect(useUiStore.getState().stageMode).toBe(true)
    expect(useUiStore.getState().stageFullscreenStatus).toBe('active')
  })

  it('keeps Stage usable in-window when fullscreen is rejected', async () => {
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError')),
    })
    useUiStore.setState({ stageMode: true })

    await toggleStageFullscreen()

    expect(useUiStore.getState().stageMode).toBe(true)
    expect(useUiStore.getState().stageFullscreenStatus).toBe('unavailable')
  })

  it('exits fullscreen without exiting Stage', async () => {
    const exitFullscreen = vi.fn(async () => {
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null })
    })
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: document.documentElement,
    })
    Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exitFullscreen })
    useUiStore.setState({ stageMode: true, stageFullscreenStatus: 'active' })

    await toggleStageFullscreen()

    expect(exitFullscreen).toHaveBeenCalledOnce()
    expect(useUiStore.getState().stageMode).toBe(true)
    expect(useUiStore.getState().stageFullscreenStatus).toBe('idle')
  })

  it('exits both Stage and browser fullscreen', async () => {
    const exitFullscreen = vi.fn(async () => {
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null })
    })
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: document.documentElement,
    })
    Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exitFullscreen })
    useUiStore.setState({
      stageMode: true,
      stageFullscreenStatus: 'active',
      stageWakeLockStatus: 'active',
    })

    await exitStagePresentation()

    expect(exitFullscreen).toHaveBeenCalledOnce()
    expect(useUiStore.getState().stageMode).toBe(false)
    expect(useUiStore.getState().stageFullscreenStatus).toBe('idle')
    expect(useUiStore.getState().stageWakeLockStatus).toBe('idle')
  })
})
