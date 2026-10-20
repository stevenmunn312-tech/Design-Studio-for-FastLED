// C++ twin of patternPick.ts for the slideshow sketch and the generic SD player.
//
// Emitted only when patternPickNeedsTable is true. Equal positive weights and
// no energy tags leave the historical expression in the sketch untouched, so
// those binaries stay byte-identical. The helper draws with the generator the
// sketch already uses: random8 on a slideshow (unless the total exceeds 255)
// and random() on the SD player.

import { PACING_LEVEL_TAU_MS, PACING_RANGE_MIN, PACING_RANGE_TAU_MS } from '../../state/player/patternPacing'
import {
  ENERGY_BANDS, energyMask, patternPickNeedsTable,
  type EnergyBand,
} from '../../state/patterns/patternPick'

const f = (value: number) => `${value.toFixed(4)}f`

export interface PatternPickCpp {
  /** File-scope table and helper. Empty when the historical expression stands. */
  prelude: string
  needsTable: boolean
}

const BAND_OF = (intensity: string) =>
  `${intensity} < ${(1 / 3).toFixed(4)}f ? 1 : ${intensity} < ${(2 / 3).toFixed(4)}f ? 2 : 4`

/**
 * Declarations for the energy tracker a tagged Music Player needs when Energy
 * Pacing is off. When Energy Pacing is on, its own `intensity` is reused and
 * this returns nothing, so a dwells-only sketch does not grow a second tracker.
 */
export function energyBandTrackerCpp(): string {
  return [
    '    // Energy band for collection tags. The same tracker as Energy Pacing',
    '    // (patternPacing.ts), without leaning the hold.',
    '    static float paceLevel = 0.0f, paceLo = 0.0f, paceHi = 0.0f;',
    '    static uint32_t paceAtMs = posMs;',
    '    {',
    '      const float dt = posMs >= paceAtMs ? (float)(posMs - paceAtMs) : 0.0f;',
    '      paceAtMs = posMs;',
    '      const float energy = constrain((_audioBass + _audioMids + _audioTreble) / 3.0f, 0.0f, 1.0f);',
    `      paceLevel += (energy - paceLevel) * (1.0f - expf(-dt / ${f(PACING_LEVEL_TAU_MS)}));`,
    `      const float k = 1.0f - expf(-dt / ${f(PACING_RANGE_TAU_MS)});`,
    '      paceHi = paceLevel > paceHi ? paceLevel : paceHi + (paceLevel - paceHi) * k;',
    '      paceLo = paceLevel < paceLo ? paceLevel : paceLo + (paceLevel - paceLo) * k;',
    '    }',
    '    const float paceRange = paceHi - paceLo;',
    `    const float intensity = paceRange < ${f(PACING_RANGE_MIN)} ? 0.5f`,
    '      : constrain((paceLevel - paceLo) / paceRange, 0.0f, 1.0f);',
  ].join('\n')
}

export function energyBandBitExpr(intensity = 'intensity'): string {
  return BAND_OF(intensity)
}

const SECTION_BITS: Record<string, number> = {
  intro: 1, verse: 2, buildup: 4, drop: 8, chorus: 16, bridge: 32, outro: 64,
}

function sectionMask(tags: readonly string[]): number {
  let mask = 0
  for (const tag of tags) mask |= SECTION_BITS[tag] ?? 0
  return mask
}

export function patternPickCpp(
  weights: readonly number[],
  energy: readonly (readonly EnergyBand[])[],
  rng: 'random8' | 'random',
  sections: readonly (readonly string[])[] = [],
): PatternPickCpp {
  const force = sections.some((tags) => tags.length > 0)
  if (weights.length < 2 || (!force && !patternPickNeedsTable(weights, energy))) {
    return { prelude: '', needsTable: false }
  }
  const count = weights.length
  const weightBytes = weights.map((weight) => String(Math.max(0, Math.min(16, Math.round(weight))))).join(', ')
  const energyBytes = Array.from({ length: count }, (_, index) => String(energyMask(energy[index] ?? []))).join(', ')
  const sectionBytes = Array.from({ length: count }, (_, index) => String(sectionMask(sections[index] ?? []))).join(', ')
  const draw = rng === 'random8'
    ? [
        'static uint16_t pickDraw(uint16_t n) {',
        '  if (n <= 1) return 0;',
        // random8 takes a uint8_t limit, so 256 would wrap to 0.
        '  if (n <= 255) return random8((uint8_t)n);',
        '  return (uint16_t)random(n);',
        '}',
      ]
    : [
        'static uint16_t pickDraw(uint16_t n) {',
        '  if (n <= 1) return 0;',
        '  return (uint16_t)random(n);',
        '}',
      ]
  const prelude = [
    '// Weighted pattern pick, the same rule as patternPick.ts.',
    `static const uint8_t kPickWeight[${count}] PROGMEM = { ${weightBytes} };`,
    `static const uint8_t kPickEnergy[${count}] PROGMEM = { ${energyBytes} };`,
    `static const uint8_t kPickSection[${count}] PROGMEM = { ${sectionBytes} };`,
    'static uint8_t pickWeight(uint8_t i) { return pgm_read_byte(&kPickWeight[i]); }',
    'static uint8_t pickEnergy(uint8_t i) { return pgm_read_byte(&kPickEnergy[i]); }',
    'static uint8_t pickSection(uint8_t i) { return pgm_read_byte(&kPickSection[i]); }',
    'static bool pickTagged(uint8_t i, uint8_t bandBit, uint8_t sectionBit) {',
    '  uint8_t mask = pickEnergy(i);',
    '  if (!(bandBit == 0 || mask == 0 || (mask & bandBit) != 0)) return false;',
    '  uint8_t sec = pickSection(i);',
    '  return sectionBit == 0 || sec == 0 || (sec & sectionBit) != 0;',
    '}',
    ...draw,
    '// mode 0 first, 1 next (skip current when another choice exists),',
    '// 2 sequential, 3 opening (first positive eligible, no draw).',
    'static uint8_t patternPick(uint8_t cur, uint8_t mode, uint8_t bandBit, uint8_t sectionBit) {',
    '  const uint8_t n = PATTERN_COUNT;',
    '  if (n == 0) return 0;',
    '  if (cur >= n) cur = 0;',
    '  uint8_t tagged[PATTERN_COUNT];',
    '  uint8_t tagN = 0;',
    '  for (uint8_t i = 0; i < n; i++) if (pickTagged(i, bandBit, sectionBit)) tagged[tagN++] = i;',
    '  if (tagN == 0) { for (uint8_t i = 0; i < n; i++) tagged[i] = i; tagN = n; }',
    '  uint8_t pool[PATTERN_COUNT];',
    '  uint8_t poolN = 0;',
    '  for (uint8_t k = 0; k < tagN; k++) if (pickWeight(tagged[k]) > 0) pool[poolN++] = tagged[k];',
    '  if (poolN == 0) return (mode == 0 || mode == 3) ? 0 : cur;',
    '  bool classic = poolN == n;',
    '  if (classic) {',
    '    uint8_t w0 = pickWeight(0);',
    '    if (w0 == 0) classic = false;',
    '    for (uint8_t i = 0; classic && i < n; i++) if (pool[i] != i || pickWeight(i) != w0) classic = false;',
    '  }',
    '  if (classic) {',
    '    if (mode == 2) return (uint8_t)((cur + 1) % n);',
    '    if (mode == 3) return 0;',
    '    if (mode == 0) return (uint8_t)pickDraw(n);',
    '    if (n == 1) return 0;',
    '    return (uint8_t)((cur + 1 + pickDraw((uint16_t)(n - 1))) % n);',
    '  }',
    '  if (mode == 3) return pool[0];',
    '  if (mode == 2) {',
    '    for (uint8_t step = 1; step <= n; step++) {',
    '      uint8_t i = (uint8_t)((cur + step) % n);',
    '      for (uint8_t k = 0; k < poolN; k++) if (pool[k] == i) return i;',
    '    }',
    '    return cur;',
    '  }',
    '  uint8_t choice[PATTERN_COUNT];',
    '  uint8_t choiceN = 0;',
    '  for (uint8_t k = 0; k < poolN; k++) {',
    '    if (mode == 1 && poolN > 1 && pool[k] == cur) continue;',
    '    choice[choiceN++] = pool[k];',
    '  }',
    '  if (choiceN == 0) return cur;',
    '  if (choiceN == 1) return choice[0];',
    '  uint16_t total = 0;',
    '  for (uint8_t k = 0; k < choiceN; k++) total = (uint16_t)(total + pickWeight(choice[k]));',
    '  uint16_t ticket = pickDraw(total);',
    '  for (uint8_t k = 0; k < choiceN; k++) {',
    '    uint8_t w = pickWeight(choice[k]);',
    '    if (ticket < w) return choice[k];',
    '    ticket = (uint16_t)(ticket - w);',
    '  }',
    '  return choice[choiceN - 1];',
    '}',
    '',
  ].join('\n')
  return { prelude, needsTable: true }
}

export const ENERGY_BAND_ORDER = ENERGY_BANDS
