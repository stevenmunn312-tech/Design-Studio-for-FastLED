// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type FakeNode = { kind: string; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }
type FakeGain = FakeNode & { gain: { value: number } }

/** Just enough of an AudioContext to record how the engine wires it. */
function fakeAudioContext() {
  const node = (kind: string): FakeNode => ({ kind, connect: vi.fn(), disconnect: vi.fn() })
  const destination = node('destination')
  const source = node('source')
  const gains: FakeGain[] = []
  const analysers: FakeNode[] = []
  const splitter = node('splitter')
  const context = {
    destination,
    createMediaElementSource: vi.fn(() => source),
    createGain: vi.fn(() => {
      const gain = { ...node('gain'), gain: { value: 1 } }
      gains.push(gain)
      return gain
    }),
    createAnalyser: vi.fn(() => {
      const analyser = { ...node('analyser'), fftSize: 0, smoothingTimeConstant: 0 }
      analysers.push(analyser)
      return analyser
    }),
    createChannelSplitter: vi.fn(() => splitter),
    resume: vi.fn(() => Promise.resolve()),
  }
  return { context, source, gains, analysers, splitter, destination }
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
    const [volume, gate] = fake.gains

    // The speakers hear source -> volume -> destination. The source itself
    // never reaches the destination, and analysis is fed from the source, so
    // nothing analysis hears has passed through the volume.
    expect(fake.source.connect).toHaveBeenCalledWith(volume)
    expect(volume.connect).toHaveBeenCalledWith(fake.context.destination)
    expect(fake.source.connect).not.toHaveBeenCalledWith(fake.context.destination)
    expect(volume.gain.value).toBeCloseTo(0.9)
    // An element's own volume scales what its source node hands to the graph,
    // which is how the lights came to follow the volume slider.
    expect(player.volume).toBe(1)

    // Analysis: source -> gate -> analyser and splitter, open at an audible volume.
    expect(fake.source.connect).toHaveBeenCalledWith(gate)
    expect(gate.connect).toHaveBeenCalledWith(fake.analysers[0])
    expect(gate.connect).toHaveBeenCalledWith(fake.splitter)
    expect(gate.gain.value).toBe(1)

    engine.setVolume(player, 0.45)
    expect(volume.gain.value).toBeCloseTo(0.45)
    expect(player.volume).toBe(1)
    // Quieter music is the same music to the lights.
    expect(gate.gain.value).toBe(1)

    engine.detach(player)
  })

  it('rests the lights at volume zero, as a board at decoder volume 0 does', async () => {
    const { DecoderAudioEngine } = await import('../decoderAudioEngine')
    const engine = DecoderAudioEngine.instance
    const player = document.createElement('audio')
    player.volume = 0.9
    engine.attach(player)
    const [volume, gate] = fake.gains

    engine.setVolume(player, 0)
    expect(volume.gain.value).toBe(0)
    expect(gate.gain.value).toBe(0)

    engine.setVolume(player, 0.2)
    expect(gate.gain.value).toBe(1)

    // A player attached while already muted starts with the gate closed.
    engine.setVolume(player, 0)
    engine.detach(player)
    engine.attach(player)
    expect(fake.gains.at(-1)!.gain.value).toBe(0)

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
