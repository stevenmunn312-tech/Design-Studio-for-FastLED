// PROGMEM step table for a Pattern Slideshow or Music Player sequence.
// The dwell / next-pattern block is replaced by this walker. Transition arms
// are narrowed by the caller to the styles these steps name.

import { transitionStyleIds } from '../performanceGenerator'
import { energyMask, type EnergyBand } from '../../state/patterns/patternPick'
import type { PatternStep } from '../../state/patterns/patternSequence'

const SECTION_BITS: Record<string, number> = {
  intro: 1, verse: 2, buildup: 4, drop: 8, chorus: 16, bridge: 32, outro: 64,
}

function sectionMask(tags: readonly string[]): number {
  let mask = 0
  for (const tag of tags) mask |= SECTION_BITS[tag] ?? 0
  return mask
}

function styleId(name: string): number {
  return transitionStyleIds([name])[0] ?? 0
}

export function sequenceTableCpp(steps: readonly PatternStep[], countBeats = false): string {
  const cell = (values: readonly string[]) => values.join(', ')
  const hold = (step: PatternStep) => countBeats
    ? String(Math.max(1, Math.round(Math.max(0.05, step.hold))))
    : String(Math.max(1, Math.round(Math.max(0.05, step.hold) * 1000)))
  return [
    `static const int16_t seqIndex[] PROGMEM = { ${cell(steps.map((step) => String(step.index === undefined ? -1 : Math.max(0, Math.round(step.index)))))} };`,
    `static const uint32_t seqHoldMs[] PROGMEM = { ${cell(steps.map(hold))} };`,
    `static const uint8_t seqTrans[] PROGMEM = { ${cell(steps.map((step) => String(styleId(step.transition))))} };`,
    `static const uint32_t seqTransMs[] PROGMEM = { ${cell(steps.map((step) => String(Math.max(0, Math.round(step.transitionSec * 1000)))))} };`,
    `static const uint8_t seqBand[] PROGMEM = { ${cell(steps.map((step) => String(energyMask((step.energy ?? []) as EnergyBand[]))))} };`,
    `static const uint8_t seqSection[] PROGMEM = { ${cell(steps.map((step) => String(sectionMask(step.sections ?? []))))} };`,
    `static const uint16_t SEQ_COUNT = ${steps.length};`,
  ].join('\n')
}

/** Resolve one step to a pattern index. Tag steps use the pick helper when it was emitted. */
export function sequenceChooseCpp(target: string, hasPick: boolean, classicNext: string): string[] {
  return [
    `int16_t chosen = (int16_t)pgm_read_word(&seqIndex[seqStep]);`,
    `uint8_t bandBit = pgm_read_byte(&seqBand[seqStep]);`,
    `uint8_t sectionBit = pgm_read_byte(&seqSection[seqStep]);`,
    hasPick
      ? `${target} = chosen < 0 ? patternPick(cur, seqStep == 0 && !seqInit ? 3 : 1, bandBit, sectionBit) : (uint8_t)chosen;`
      : `${target} = chosen < 0 ? (uint8_t)(${classicNext}) : (uint8_t)chosen;`,
  ]
}
