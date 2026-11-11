import { cppCode } from './cppReachability'

const FASTLED_INCLUDE = /^#include <FastLED\.h>/m
// A call by its bare name: not a member, not already qualified, and not the
// tail of a longer name. `min<int>(` counts.
const BARE_CALL = /(?<![\w:.>])(min|max)(?=\s*(?:<[\w\s:]+>\s*)?\()/g
// A sketch (a Code node, say) that defines its own `min` or `max` keeps it.
const OWN_DEFINITION = /\b[A-Za-z_]\w*[\s*&]+(?:min|max)\s*\([^;{}]*\)\s*(?:const\s*)?\{/

/**
 * Call FastLED's `fl::min` and `fl::max` by their full names.
 *
 * `FastLED.h` brings both into the global namespace with a using-declaration,
 * and that is what a bare `min(a, b)` reaches on ESP32, ESP8266 and AVR. The
 * Arduino cores built on ArduinoCore-API or forked from the SAMD core (Adafruit
 * and Arduino SAMD, megaAVR, Renesas) declare their own global `min` and `max`
 * templates, so there the bare call is ambiguous and the sketch does not
 * compile. Naming `fl::` picks the same function everywhere. Comments and
 * strings are left alone, and so is a sketch that includes no FastLED or
 * defines `min` or `max` itself.
 */
export function withQualifiedMinMax(source: string): string {
  if (!FASTLED_INCLUDE.test(source) || OWN_DEFINITION.test(cppCode(source))) return source
  return qualifyMinMaxCalls(source)
}

/** The rewrite alone, for any C++ text. */
export function qualifyMinMaxCalls(source: string): string {
  const code = cppCode(source)
  let out = ''
  let from = 0
  for (const match of code.matchAll(BARE_CALL)) {
    out += `${source.slice(from, match.index)}fl::`
    from = match.index!
  }
  return out + source.slice(from)
}
