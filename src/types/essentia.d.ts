// Minimal ambient types for the essentia.js ES-module dist files we import
// lazily. The package ships `core_api.d.ts` but doesn't map it to these exact
// build entry points, so we declare them as loosely-typed modules. The analyzer
// wraps the `any` surface in a typed `SongAnalysis` result.

// These dist files are dual UMD/ESM builds, so bundlers wrap their exports
// inconsistently (the class can land under `.default` or `.default.default`).
// We type them loosely and unwrap defensively at runtime in essentiaAnalyzer.ts.
declare module 'essentia.js/dist/essentia.js-core.es.js' {
  const mod: unknown
  export default mod
}

declare module 'essentia.js/dist/essentia-wasm.es.js' {
  export const EssentiaWASM: unknown
  const mod: unknown
  export default mod
}

// The subset of the Essentia algorithm surface this app uses.
interface EssentiaApi {
  arrayToVector(arr: Float32Array): EssentiaVector
  vectorToArray(vec: EssentiaVector): Float32Array
  FrameGenerator(data: Float32Array, frameSize: number, hopSize: number): EssentiaVectorVector
  Windowing(frame: EssentiaVector, normalized?: boolean, size?: number, type?: string): { frame: EssentiaVector }
  Spectrum(frame: EssentiaVector, size?: number): { spectrum: EssentiaVector }
  EnergyBand(spectrum: EssentiaVector, sampleRate?: number, startFreq?: number, stopFreq?: number): { energyBand: number }
  RhythmExtractor2013(signal: EssentiaVector, maxTempo?: number, method?: string, minTempo?: number):
    { bpm: number; ticks: EssentiaVector; confidence: number }
  KeyExtractor(audio: EssentiaVector): { key: string; scale: string; strength: number }
  Danceability(signal: EssentiaVector, maxTau?: number, minTau?: number, sampleRate?: number): { danceability: number }
  delete(): void
}

interface EssentiaVector { size(): number; get(i: number): EssentiaVector; delete(): void }
interface EssentiaVectorVector { size(): number; get(i: number): EssentiaVector; delete(): void }
