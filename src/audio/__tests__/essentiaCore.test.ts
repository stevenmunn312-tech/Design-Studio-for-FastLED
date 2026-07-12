import { describe, expect, it, vi } from 'vitest'
import { analyzeDecodedSong, extractEnergy, formatWorkerError } from '../essentiaCore'

// Fake Essentia instances so the idle-release lifecycle can run without WASM.
const essentiaMock = vi.hoisted(() => ({
  instances: [] as Array<{ delete: () => void }>,
}))

vi.mock('essentia.js/dist/essentia.js-core.es.js', () => {
  const vec = () => ({ size: () => 0, get: () => vec(), delete: () => {} })
  class FakeEssentia {
    delete = vi.fn()
    arrayToVector = () => vec()
    vectorToArray = () => new Float32Array([0.5, 1.0])
    FrameGenerator = () => vec()
    Windowing = () => ({ frame: vec() })
    Spectrum = () => ({ spectrum: vec() })
    EnergyBand = () => ({ energyBand: 1 })
    RhythmExtractor2013 = () => ({ bpm: 120.4, ticks: vec(), confidence: 2.7 })
    KeyExtractor = () => ({ key: 'A', scale: 'minor', strength: 1 })
    Danceability = () => ({ danceability: 1.2 })
    constructor() { essentiaMock.instances.push(this as unknown as { delete: () => void }) }
  }
  return { default: FakeEssentia }
})
vi.mock('essentia.js/dist/essentia-wasm.es.js', () => {
  const backend = { HEAPU8: new Uint8Array(1) }
  return { EssentiaWASM: backend, default: backend }
})

function vector() {
  return { size: vi.fn(() => 0), get: vi.fn(), delete: vi.fn() } as unknown as EssentiaVector
}

function energyApi(frameCount: number) {
  const inputs = Array.from({ length: frameCount }, vector)
  const windowed = Array.from({ length: frameCount }, vector)
  const spectra = Array.from({ length: frameCount }, vector)
  const frames = {
    size: vi.fn(() => frameCount),
    get: vi.fn((i: number) => inputs[i]),
    delete: vi.fn(),
  } as unknown as EssentiaVectorVector
  let windowIndex = 0
  let spectrumIndex = 0
  const api = {
    FrameGenerator: vi.fn(() => frames),
    Windowing: vi.fn(() => ({ frame: windowed[windowIndex++] })),
    Spectrum: vi.fn(() => ({ spectrum: spectra[spectrumIndex++] })),
    EnergyBand: vi.fn(() => ({ energyBand: 1 })),
  } as unknown as EssentiaApi
  return { api, frames, inputs, windowed, spectra }
}

describe('formatWorkerError', () => {
  it('prefers an Error stack when available', () => {
    const err = new Error('boom')
    const text = formatWorkerError(err)
    expect(text).toContain('boom')
  })

  it('stringifies plain objects for diagnostics', () => {
    expect(formatWorkerError({ code: 7, reason: 'x' })).toBe('{"code":7,"reason":"x"}')
  })
})

describe('extractEnergy WASM lifecycle', () => {
  it('deletes every input, windowed, spectrum, and outer frame vector', () => {
    const { api, frames, inputs, windowed, spectra } = energyApi(3)

    extractEnergy(api, new Float32Array(4096), 44_100)

    expect(frames.delete).toHaveBeenCalledOnce()
    for (const allocation of [...inputs, ...windowed, ...spectra]) {
      expect(allocation.delete).toHaveBeenCalledOnce()
    }
  })

  it('deletes acquired vectors when an Essentia algorithm throws', () => {
    const { api, frames, inputs, windowed, spectra } = energyApi(1)
    vi.mocked(api.EnergyBand).mockImplementationOnce(() => { throw new Error('analysis failed') })

    expect(() => extractEnergy(api, new Float32Array(2048), 44_100)).toThrow('analysis failed')

    expect(frames.delete).toHaveBeenCalledOnce()
    expect(inputs[0].delete).toHaveBeenCalledOnce()
    expect(windowed[0].delete).toHaveBeenCalledOnce()
    expect(spectra[0].delete).toHaveBeenCalledOnce()
  })
})

describe('main-thread instance lifecycle', () => {
  it('releases the Essentia instance after the idle grace period', async () => {
    vi.useFakeTimers()
    try {
      const analysis = await analyzeDecodedSong(new Float32Array(1024), 44_100, 1_000, 'idle-test')
      expect(analysis.title).toBe('idle-test')
      expect(essentiaMock.instances).toHaveLength(1)
      // The instance survives the grace period so consecutive analyses
      // ("Analyse All") reuse it…
      expect(essentiaMock.instances[0].delete).not.toHaveBeenCalled()
      // …but once idle, the cached instance is torn down so the WASM heap
      // (grown to the analysis high-water mark) can be garbage-collected.
      await vi.advanceTimersByTimeAsync(5_000)
      expect(essentiaMock.instances[0].delete).toHaveBeenCalledOnce()

      // A later analysis builds a fresh instance instead of reusing the dead one.
      await analyzeDecodedSong(new Float32Array(1024), 44_100, 1_000, 'again')
      expect(essentiaMock.instances).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })
})
