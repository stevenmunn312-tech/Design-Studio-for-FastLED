// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** Just enough of an AudioContext to record how the engine wires it. */
function fakeAudioContext() {
  const node = (kind: string) => ({ kind, connect: vi.fn(), disconnect: vi.fn() })
  const destination = node('destination')
  const source = node('source')
  const gain = { ...node('gain'), gain: { value: 1 } }
  const context = {
    destination,
    createMediaElementSource: vi.fn(() => source),
    createGain: vi.fn(() => gain),
    createAnalyser: vi.fn(() => ({ ...node('analyser'), fftSize: 0, smoothingTimeConstant: 0 })),
    createChannelSplitter: vi.fn(() => node('splitter')),
    resume: vi.fn(() => Promise.resolve()),
  }
  return { context, source, gain, destination }
}

describe('the music player volume and the analysis tap', () => {
  let fake: ReturnType<typeof fakeAudioContext>

  beforeEach(() => {
    vi.resetModules()
    fake = fakeAudioContext()
    // A real function, so `new AudioContext()` works.
    vi.stubGlobal('AudioContext', function AudioContext() { return fake.context })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('carries the volume on a gain after the tap, and plays the element at full level', async () => {
    const { DecoderAudioEngine } = await import('../decoderAudioEngine')
    const engine = DecoderAudioEngine.instance
    const player = document.createElement('audio')
    player.volume = 0.9

    engine.attach(player)

    // The speakers hear source -> gain -> destination. The source itself never
    // reaches the destination, and analysis is fed from the source, so nothing
    // analysis hears has passed through the volume.
    expect(fake.source.connect).toHaveBeenCalledWith(fake.gain)
    expect(fake.gain.connect).toHaveBeenCalledWith(fake.context.destination)
    expect(fake.source.connect).not.toHaveBeenCalledWith(fake.context.destination)
    expect(fake.gain.gain.value).toBeCloseTo(0.9)
    // An element's own volume scales what its source node hands to the graph,
    // which is how the lights came to follow the volume slider.
    expect(player.volume).toBe(1)

    engine.setVolume(player, 0.45)
    expect(fake.gain.gain.value).toBeCloseTo(0.45)
    expect(player.volume).toBe(1)

    engine.setVolume(player, 0)
    expect(fake.gain.gain.value).toBe(0)
    expect(player.volume).toBe(1)

    engine.detach(player)
  })

  it('uses the element volume until the engine has taken the element over', async () => {
    const { DecoderAudioEngine } = await import('../decoderAudioEngine')
    const player = document.createElement('audio')

    DecoderAudioEngine.instance.setVolume(player, 0.3)

    expect(player.volume).toBeCloseTo(0.3)
    expect(fake.context.createGain).not.toHaveBeenCalled()
  })
})
