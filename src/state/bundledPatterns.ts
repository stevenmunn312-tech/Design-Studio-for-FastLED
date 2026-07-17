import type { SavedPattern } from './patternLibrary'

import auroraCometFoundry from '../assets/bundled-patterns/Aurora Comet Foundry.json'
import auroraEchoChoir from '../assets/bundled-patterns/Aurora Echo Choir.json'
import bassCathedralCollapse from '../assets/bundled-patterns/Bass Cathedral Collapse.json'
import chromasonicVortex from '../assets/bundled-patterns/Chromasonic Vortex.json'
import chromaticOrbitReactor from '../assets/bundled-patterns/Chromatic Orbit Reactor.json'
import colorTrails from '../assets/bundled-patterns/Color Trails.json'
import glassRainResonator from '../assets/bundled-patterns/Glass Rain Resonator.json'
import kaleidoBassSingularity from '../assets/bundled-patterns/Kaleido Bass Singularity.json'
import laserMonsoonParade from '../assets/bundled-patterns/Laser Monsoon Parade.json'
import mainstageConfettiSingularity from '../assets/bundled-patterns/Mainstage Confetti Singularity.json'
import morphingNeonRiver from '../assets/bundled-patterns/Morphing Neon River.json'
import percussionSymphony from '../assets/bundled-patterns/Percussion Symphony.json'
import polarWaveHaloEngine from '../assets/bundled-patterns/Polar Wave Halo Engine.json'
import prismStorm from '../assets/bundled-patterns/Prism Storm.json'
import prismaticWaterfallCathedral from '../assets/bundled-patterns/Prismatic Waterfall Cathedral.json'
import quadrantPulseObservatory from '../assets/bundled-patterns/Quadrant Pulse Observatory.json'
import rgbBlobThunderGarden from '../assets/bundled-patterns/RGB Blob Thunder Garden.json'
import spectralFieldVortex from '../assets/bundled-patterns/Spectral Field Vortex.json'
import spiralusPercussionShrine from '../assets/bundled-patterns/Spiralus Percussion Shrine.json'
import tidalGlassMeditation from '../assets/bundled-patterns/Tidal Glass Meditation.json'

export const AUDIO_REACTIVE_CATEGORY_ID = 'audio-reactive'
export const STANDARD_CATEGORY_ID = 'standard'

const rawPatterns = [
  auroraCometFoundry,
  auroraEchoChoir,
  bassCathedralCollapse,
  chromasonicVortex,
  chromaticOrbitReactor,
  colorTrails,
  glassRainResonator,
  kaleidoBassSingularity,
  laserMonsoonParade,
  mainstageConfettiSingularity,
  morphingNeonRiver,
  percussionSymphony,
  polarWaveHaloEngine,
  prismStorm,
  prismaticWaterfallCathedral,
  quadrantPulseObservatory,
  rgbBlobThunderGarden,
  spectralFieldVortex,
  spiralusPercussionShrine,
  tidalGlassMeditation,
] as unknown as SavedPattern[]

/** Curated beta patterns are immutable examples, not user-owned disk entries. */
export const BUNDLED_PATTERNS: SavedPattern[] = rawPatterns.map((pattern, index) => ({
  ...pattern,
  id: `bundled-audio-${String(index + 1).padStart(2, '0')}`,
  categoryId: AUDIO_REACTIVE_CATEGORY_ID,
  bundled: true,
}))
