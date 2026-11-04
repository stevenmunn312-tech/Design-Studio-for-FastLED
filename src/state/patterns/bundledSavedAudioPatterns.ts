import type { SavedPattern } from './patternLibrary'
import auroraVoice from '../../assets/bundled-patterns/Aurora Voice.json'
import cascadeSurge from '../../assets/bundled-patterns/Cascade Surge.json'
import cinderStorm from '../../assets/bundled-patterns/Cinder Storm.json'
import eventHorizon from '../../assets/bundled-patterns/Event Horizon.json'
import fractalVoyage from '../../assets/bundled-patterns/Fractal Voyage.json'
import monsoonEcho from '../../assets/bundled-patterns/Monsoon Echo.json'
import myPattern from '../../assets/bundled-patterns/My Pattern.json'
import neonPrismEq from '../../assets/bundled-patterns/Neon Prism EQ.json'
import newGroupTemp from '../../assets/bundled-patterns/New Group temp.json'
import peacockMosaicDrift from '../../assets/bundled-patterns/Peacock Mosaic Drift.json'
import polarBloom from '../../assets/bundled-patterns/Polar Bloom.json'
import prismFracture from '../../assets/bundled-patterns/Prism Fracture.json'
import psydance from '../../assets/bundled-patterns/Psydance.json'
import ultravioletKaleidoPulse from '../../assets/bundled-patterns/Ultraviolet Kaleido Pulse.json'

type BundledSeed = Omit<SavedPattern, 'id' | 'createdAt' | 'categoryId' | 'bundled'>

// Promoted library entries retain their original graph and port signatures.
// Append this set after the existing audio shelves to preserve bundled ids.
export const SAVED_AUDIO_SEEDS = [
  auroraVoice,
  cascadeSurge,
  cinderStorm,
  eventHorizon,
  fractalVoyage,
  monsoonEcho,
  myPattern,
  neonPrismEq,
  newGroupTemp,
  peacockMosaicDrift,
  polarBloom,
  prismFracture,
  psydance,
  ultravioletKaleidoPulse,
] as unknown as BundledSeed[]
