// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The renderer needs WebGL and the opener a whole pattern library; neither is
// what these tests are about.
vi.mock('../../Preview/webglRenderer', () => ({
  WebGLLEDRenderer: class { render() {} destroy() {} },
}))
vi.mock('../../../state/patterns/bundledPatterns', () => ({
  BUNDLED_PATTERNS: [{ name: 'Opaline Sunset', subgraph: { nodes: [], edges: [] } }],
}))
vi.mock('../../../state/graphEvaluator', () => ({ evaluateGraph: () => null }))

import FirstLaunchShowcase from '../FirstLaunchShowcase'
import { usePlayerTransport } from '../../../state/player/playerTransport'

const TRACK_MS = 262_000

function show(onPlay = vi.fn().mockResolvedValue(true)) {
  const onSkip = vi.fn()
  const onOpenStudio = vi.fn()
  render(<FirstLaunchShowcase onPlay={onPlay} onSkip={onSkip} onOpenStudio={onOpenStudio} />)
  return { onPlay, onSkip, onOpenStudio }
}

/** Press Play and let the fade and the show's start-up finish. */
async function play() {
  fireEvent.click(screen.getByRole('button', { name: 'Play the show' }))
  await act(async () => { await vi.advanceTimersByTimeAsync(700) })
}

describe('FirstLaunchShowcase', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    usePlayerTransport.setState({
      localTrack: { title: 'Ethereal Pulse', durationMs: TRACK_MS }, playing: false, posMs: 0, localClock: null,
      controlSerial: 0, controlCommand: null,
    } as never)
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    usePlayerTransport.setState({ localTrack: null, playing: false, posMs: 0, localClock: null, controlSerial: 0, controlCommand: null } as never)
  })

  it('opens on one thing to do, with a way past it', () => {
    const { onSkip } = show()
    expect(screen.getByRole('dialog', { name: 'Welcome to Design Studio for FastLED' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Play the show' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Skip to the studio' }))
    expect(onSkip).toHaveBeenCalledTimes(1)
  })

  it('starts the show only after the fade, then shows the lights alone', async () => {
    const { onPlay } = show()
    fireEvent.click(screen.getByRole('button', { name: 'Play the show' }))
    // Fading to black: the show starts behind it, not in view.
    expect(onPlay).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(700) })
    expect(onPlay).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Play the show' })).toBeNull()
    expect(screen.getByRole('button', { name: 'See how it is made' })).toBeTruthy()
  })

  it('returns to the opener when the show did not start', async () => {
    show(vi.fn().mockResolvedValue(false))
    await play()
    expect(screen.getByRole('button', { name: 'Play the show' })).toBeTruthy()
  })

  it('brings the way in over the song\'s last seconds, not after a silence', async () => {
    const { onOpenStudio } = show()
    await play()
    usePlayerTransport.setState({ playing: true, posMs: 100_000 } as never)
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    expect(screen.queryByRole('button', { name: 'Enter the Studio' })).toBeNull()

    usePlayerTransport.setState({ playing: true, posMs: TRACK_MS - 2_000 } as never)
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    fireEvent.click(screen.getByRole('button', { name: 'Enter the Studio' }))
    expect(onOpenStudio).toHaveBeenCalledTimes(1)
  })

  it('ends when the player stops early, once it has played', async () => {
    show()
    await play()
    // Not playing yet: the show has only just been asked for.
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000) })
    expect(screen.queryByRole('button', { name: 'Enter the Studio' })).toBeNull()

    usePlayerTransport.setState({ playing: true, posMs: 50_000 } as never)
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    usePlayerTransport.setState({ playing: false } as never)
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    expect(screen.getByRole('button', { name: 'Enter the Studio' })).toBeTruthy()
  })

  it('plays it again from the start while the last seconds still sound, or presses play after', async () => {
    show()
    await play()
    usePlayerTransport.setState({ playing: true, posMs: TRACK_MS - 1_000 } as never)
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    fireEvent.click(screen.getByRole('button', { name: 'Play it again' }))
    expect(usePlayerTransport.getState().controlCommand).toMatchObject({ playPause: false, previous: true })
    expect(screen.getByRole('button', { name: 'See how it is made' })).toBeTruthy()

    // Round again, this time after the player has stopped.
    usePlayerTransport.setState({ playing: true, posMs: 50_000 } as never)
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    usePlayerTransport.setState({ playing: false } as never)
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    fireEvent.click(screen.getByRole('button', { name: 'Play it again' }))
    expect(usePlayerTransport.getState().controlCommand).toMatchObject({ playPause: true, previous: false })
  })
})
