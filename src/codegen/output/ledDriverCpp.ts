/**
 * The Board's LED driver choice, applied to a finished sketch.
 *
 * One pass shared by the normal, show and player generators, run on each
 * one's finished text the way `withLoopPacing` is, so the three cannot drift
 * and `fastledSetupCpp` keeps emitting plain `addLeds` lines for everyone.
 * `auto` (a null driver) leaves the sketch byte for byte as it was.
 *
 * What a choice emits, read from the pinned FastLED 3.10.5:
 *
 * - An `exclusive` driver gets the header that defines its `BusTraits` after
 *   the FastLED include (`fl/channels/README.md`, "Single-driver override"),
 *   then `FastLED.setExclusiveDriver<fl::Bus::B>()` before the first output
 *   (`FastLED.h`: "Must be called before `addLeds<>`"). That call only
 *   registers the driver above the platform default. A legacy
 *   `addLeds<WS2812B, PIN>` controller binds the default in its constructor
 *   (`ClocklessIdf5` pre-binds RMT, `ClocklessPARLIO` PARLIO), so each
 *   clockless output this pass recognises is built on the channel API
 *   instead, `TypedChannel<B, ClocklessChipset>` pinned to the bus through
 *   `ChannelOptions::mBus`, and added with `FastLED.add`. Outputs it cannot
 *   rebuild (WS2816's 16-bit frames, every clocked chipset, whose ESP32
 *   `addLeds` already resolves its driver through the channel manager) keep
 *   their `addLeds` line.
 * - A `legacy-define` driver (the classic ESP32's I2S) is a define before the
 *   FastLED include, which swaps the clockless controller `addLeds` builds.
 */
import type { SelectableLedDriver } from '../../build/ledDrivers'

const FASTLED_INCLUDE = '#include <FastLED.h>'

/**
 * FastLED's timing struct for each clockless chipset the channel API can
 * carry, as its own `addLeds` controller uses it (`chipsets.h`, `FastLED.h`).
 * SK6812 carries the RGBW form too; WS2816 is absent because its controller
 * sends 16-bit channels the channel config does not describe.
 */
export const LED_DRIVER_CHANNEL_TIMING: Readonly<Record<string, string>> = {
  WS2812B: 'TIMING_WS2812_800KHZ',
  NEOPIXEL: 'TIMING_WS2812_800KHZ',
  WS2811: 'TIMING_WS2811_800KHZ_LEGACY',
  WS2815: 'TIMING_WS2815',
  SK6812: 'TIMING_SK6812',
  SM16824E: 'TIMING_SM16824E',
}

/**
 * One clockless `addLeds` line as `fastledSetupCpp` writes it: an optional
 * named controller, chipset, data pin, optional colour order (NEOPIXEL has
 * none), the array, a count or an offset and a count (a data lane's offset is
 * an expression such as `2 * (NUM_LEDS / 4)`), the RGBW tail and a trailing
 * comment (`// lane 2`). A clocked chipset's line carries a clock pin and
 * never matches.
 */
const ADD_LEDS = /^(\s*)(?:CLEDController& (\w+) = )?FastLED\.addLeds<(\w+), (\w+)(?:, (\w+))?>\((\w+), ((?:[^,()]|\([^()]*\))+?)(?:, ((?:[^,()]|\([^()]*\))+?))?\)(\.setRgbw\(RgbwDefault\(\)\))?;(\s*\/\/.*)?\s*$/

function channelLines(match: RegExpMatchArray, bus: string, index: number): string[] | null {
  const [, indent, controller, chipset, pin, order, leds, first, second, rgbw, comment] = match
  const timing = LED_DRIVER_CHANNEL_TIMING[chipset]
  if (!timing) return null
  // NEOPIXEL's alias hardcodes GRB and takes no order argument.
  const colorOrder = order ?? (chipset === 'NEOPIXEL' ? 'GRB' : 'RGB')
  const span = second === undefined ? `${leds}, ${first}` : `${leds} + (${first}), ${second}`
  const name = `_ledChannel${index}`
  return [
    `${indent}fl::ChannelPtr ${name} = fl::TypedChannel<fl::Bus::${bus}, fl::ClocklessChipset>::create(fl::ChannelConfig(fl::makeClockless<fl::${timing}>(${pin}), fl::span<CRGB>(${span}), ${colorOrder}, _ledDriverOptions));${comment?.trimEnd() ?? ''}`,
    `${indent}FastLED.add(${name});`,
    ...(rgbw ? [`${indent}${name}->setRgbw(RgbwDefault());`] : []),
    ...(controller ? [`${indent}CLEDController& ${controller} = *${name};`] : []),
  ]
}

/**
 * `source` with the Board's LED driver applied. Unchanged for `auto`, and for
 * a sketch with no clockless output for the driver to take (a HUB75 panel, a
 * screen-only build, clocked strips only), which would otherwise carry a
 * driver nothing uses.
 */
export function withLedDriver(source: string, driver: SelectableLedDriver | null): string {
  if (!driver) return source
  const lines = source.split('\n')
  const includeAt = lines.indexOf(FASTLED_INCLUDE)
  if (includeAt < 0) return source

  if (driver.selection === 'legacy-define') {
    // The define swaps the controller of every clockless chipset, WS2816 too.
    const clockless = lines.some((line) => ADD_LEDS.test(line))
    if (!clockless) return source
    return [
      ...lines.slice(0, includeAt),
      `// LED driver chosen on the Board (experimental): ${driver.label}. Must precede the FastLED include.`,
      '#define FASTLED_ESP32_I2S true',
      ...lines.slice(includeAt),
    ].join('\n')
  }

  const rebuilt = new Map<number, string[]>()
  for (const [index, line] of lines.entries()) {
    const match = line.match(ADD_LEDS)
    const channel = match ? channelLines(match, driver.bus, rebuilt.size) : null
    if (channel) rebuilt.set(index, channel)
  }
  if (rebuilt.size === 0) return source
  const firstAdd = lines.findIndex((line) => line.includes('FastLED.addLeds<') || ADD_LEDS.test(line))

  const out: string[] = []
  for (const [index, line] of lines.entries()) {
    if (index === firstAdd) {
      const indent = /^\s*/.exec(line)?.[0] ?? '  '
      out.push(`${indent}// LED driver chosen on the Board (experimental): ${driver.label}.`)
      out.push(`${indent}FastLED.setExclusiveDriver<fl::Bus::${driver.bus}>();`)
      out.push(`${indent}fl::ChannelOptions _ledDriverOptions;`)
      out.push(`${indent}_ledDriverOptions.mBus = fl::Bus::${driver.bus};`)
    }
    out.push(...(rebuilt.get(index) ?? [line]))
    if (index === includeAt && driver.traitsHeader) {
      out.push(`#include "${driver.traitsHeader}"  // BusTraits<fl::Bus::${driver.bus}>, the Board's LED driver`)
    }
  }
  return out.join('\n')
}
