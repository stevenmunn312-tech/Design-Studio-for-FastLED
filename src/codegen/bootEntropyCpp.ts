/*
 * Seed the random generators a sketch actually calls, once at boot, so seed-0
 * ("runs free") nodes and random transitions play a different sequence after
 * each power-up rather than the same one every time.
 *
 * FastLED's random8/random16 ignore Arduino's randomSeed(), and Arduino's
 * random() ignores FastLED's seed, so each generator is seeded only when
 * something calls it. ESP32 seeds from its hardware RNG: A0 is a real GPIO
 * there (GPIO 1 on the S3, the default LED data pin), so reading it would
 * sample the pin's own output. Elsewhere a floating A0 is the usual source.
 *
 * A node with its own seed still calls `random16_set_seed` on its first frame,
 * after this, so a fixed seed stays repeatable.
 */

const FASTLED_RANDOM = /\brandom(?:8|16)\(/
const ARDUINO_RANDOM = /\brandom\(/

/** Neither Arduino.h nor FastLED.h declares esp_random() on core 3.x. */
export const ESP_RANDOM_INCLUDE_CPP: readonly string[] = ['#if defined(ESP32)', '#include <esp_random.h>', '#endif']

function seedLines(call: string): string[] {
  return [
    '#if defined(ESP32)',
    `  ${call}(esp_random());`,
    '#else',
    `  ${call}(analogRead(A0));`,
    '#endif',
  ]
}

/** setup() lines seeding each random generator `body` calls; empty when it calls none. */
export function bootEntropySetupCpp(body: string): string[] {
  return [
    ...(FASTLED_RANDOM.test(body) ? seedLines('random16_add_entropy') : []),
    ...(ARDUINO_RANDOM.test(body) ? seedLines('randomSeed') : []),
  ]
}

/**
 * A finished sketch with its boot entropy at the top of setup() and the
 * esp_random include above its first include. Unchanged when it calls no
 * random generator. The show generator seeds through `bootEntropySetupCpp`
 * itself, because its show seed replaces the entropy.
 */
export function withBootEntropy(source: string): string {
  const setup = bootEntropySetupCpp(source)
  if (!setup.length) return source
  const lines = source.split('\n')
  const setupAt = lines.findIndex((line) => line === 'void setup() {')
  const includeAt = lines.findIndex((line) => line.startsWith('#include'))
  if (setupAt < 0) return source
  lines.splice(setupAt + 1, 0, ...setup)
  lines.splice(includeAt < 0 ? 0 : includeAt, 0, ...ESP_RANDOM_INCLUDE_CPP)
  return lines.join('\n')
}
