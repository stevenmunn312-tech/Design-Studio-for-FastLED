import {
  BURST_CHANCE, BURST_CHANGES_MAX, BURST_CHANGES_MIN, BURST_HOLD_FRACTION, BURST_HOLD_MIN_SEC,
  DWELL_CHANCE, DWELL_HOLD_FACTOR, ENERGY_LEAN, PACING_LEVEL_TAU_MS, PACING_RANGE_MIN, PACING_RANGE_TAU_MS,
} from '../../state/player/patternPacing'

const f = (value: number) => `${value.toFixed(4)}f`

/**
 * The generic SD player's twin of patternPacing.ts, emitted inside the
 * pattern-rotation block where `minHold`, `maxHold`, `transitionMs` and
 * `posMs` are in scope. The block replaces its fixed `rotateMs` with a lead
 * (the transition, when one runs) plus `paceHoldMs()`, read every loop so a
 * normal hold shortens as the music builds. Only what the options use is
 * emitted.
 */
export function patternPacingCpp(o: { energyPacing: boolean; dwellsAndBursts: boolean }) {
  const lines: string[] = [
    '    // Hold pacing, the same moves as the preview\'s patternPacing.ts.',
    '    static float holdU = random(10000) / 10000.0f;',
  ]
  if (o.dwellsAndBursts) {
    lines.push(
      '    // 0 a normal hold, 1 a dwell, 2 one change of a burst.',
      '    static uint8_t holdKind = 0;',
      '    static uint8_t burstLeft = 0;',
    )
  }
  if (o.energyPacing) {
    lines.push(
      '    // Energy Pacing: the track\'s smoothed energy, placed in the range it',
      '    // has recently moved in.',
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
    )
  }
  const normalFraction = o.energyPacing
    ? `holdU * ${f(1 - ENERGY_LEAN)} + (1.0f - intensity) * ${f(ENERGY_LEAN)}`
    : 'holdU'
  lines.push('    auto paceHoldMs = [&]() -> uint32_t {')
  if (o.dwellsAndBursts) {
    lines.push(
      `      if (holdKind == 1) return (uint32_t)(${f(DWELL_HOLD_FACTOR)} * maxHold * 1000.0f);`,
      `      if (holdKind == 2) return (uint32_t)(min(minHold, max(${f(BURST_HOLD_MIN_SEC)}, transitionMs / 1000.0f * ${f(BURST_HOLD_FRACTION)}))* 1000.0f);`,
    )
  }
  lines.push(
    `      return (uint32_t)((minHold + (maxHold - minHold) * (${normalFraction})) * 1000.0f);`,
    '    };',
    '    // A normal hold: after a seek, a new track or a confirm.',
    `    auto paceReset = [&]() { ${o.dwellsAndBursts ? 'holdKind = 0; burstLeft = 0; ' : ''}holdU = random(10000) / 10000.0f; };`,
  )
  if (o.dwellsAndBursts) {
    lines.push(
      '    // The hold after a change. A burst runs out first, and a dwell or a',
      '    // burst is always followed by a normal hold.',
      '    auto paceNext = [&]() {',
      '      if (burstLeft > 0) { burstLeft--; holdKind = 2; }',
      '      else if (holdKind != 0) holdKind = 0;',
      '      else {',
      '        const float r = random(10000) / 10000.0f;',
      `        holdKind = r < ${f(DWELL_CHANCE)} ? 1 : r < ${f(DWELL_CHANCE + BURST_CHANCE)} ? 2 : 0;`,
      `        if (holdKind == 2) burstLeft = (uint8_t)(${BURST_CHANGES_MIN - 1} + random(${BURST_CHANGES_MAX - BURST_CHANGES_MIN + 1}));`,
      '      }',
      '      holdU = random(10000) / 10000.0f;',
      '    };',
    )
  }
  return {
    declarations: lines.join('\n'),
    /** Statement starting the hold after a change. */
    next: o.dwellsAndBursts ? 'paceNext();' : 'paceReset();',
  }
}
