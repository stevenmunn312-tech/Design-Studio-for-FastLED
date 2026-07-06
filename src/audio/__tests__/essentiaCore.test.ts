import { describe, expect, it, vi } from 'vitest'
import { extractEnergy, formatWorkerError } from '../essentiaCore'

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
