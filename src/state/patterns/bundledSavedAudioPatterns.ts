import type { SavedPattern } from './patternLibrary'
import auroraVoice from '../../assets/bundled-patterns/Aurora Voice.json'
import cascadeSurge from '../../assets/bundled-patterns/Cascade Surge.json'
import cinderStorm from '../../assets/bundled-patterns/Cinder Storm.json'
import eventHorizon from '../../assets/bundled-patterns/Event Horizon.json'
import fractalVoyage from '../../assets/bundled-patterns/Fractal Voyage.json'
import monsoonEcho from '../../assets/bundled-patterns/Monsoon Echo.json'
import sunsetBloomSpectrum from '../../assets/bundled-patterns/Sunset Bloom Spectrum.json'
import neonPrismEq from '../../assets/bundled-patterns/Neon Prism EQ.json'
import citrusSpectrumBars from '../../assets/bundled-patterns/Citrus Spectrum Bars.json'
import peacockMosaicDrift from '../../assets/bundled-patterns/Peacock Mosaic Drift.json'
import polarBloom from '../../assets/bundled-patterns/Polar Bloom.json'
import prismFracture from '../../assets/bundled-patterns/Prism Fracture.json'
import psydance from '../../assets/bundled-patterns/Psydance.json'
import ultravioletKaleidoPulse from '../../assets/bundled-patterns/Ultraviolet Kaleido Pulse.json'

type BundledSeed = Omit<SavedPattern, 'id' | 'createdAt' | 'categoryId' | 'bundled'>

// Promoted library entries retain their original port signatures, and their
// original graphs except Aurora Voice and Cascade Surge, retuned 2026-11-10.
// Sunset Bloom Spectrum and Citrus Spectrum Bars were promoted as "My
// Pattern" and "New Group temp". Order is identity: a pattern's
// `bundled-audio-NN` id is its position, so the two renamed entries keep
// their slots rather than their alphabetical place.
export const SAVED_AUDIO_SEEDS = [
  auroraVoice,
  cascadeSurge,
  cinderStorm,
  eventHorizon,
  fractalVoyage,
  monsoonEcho,
  sunsetBloomSpectrum,
  neonPrismEq,
  citrusSpectrumBars,
  peacockMosaicDrift,
  polarBloom,
  prismFracture,
  psydance,
  ultravioletKaleidoPulse,
] as unknown as BundledSeed[]
