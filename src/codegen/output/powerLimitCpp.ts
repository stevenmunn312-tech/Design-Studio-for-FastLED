/**
 * The Board's power limit as setup lines, shared by every generator.
 *
 * `FastLED.setMaxPowerInVoltsAndMilliamps` budgets volts x milliamps but
 * estimates each LED with its own model, which defaults to a WS2812 at 5 V:
 * 80 + 55 + 75 mW, 210 mW at full white. The app sizes a supply from
 * `ledFullWhiteDraw` instead (300 mW for a 5 V RGB LED, 720 mW for a 12 V
 * WS2811 pixel), so on the default model the limiter let through 1.4 to 3.4
 * times the current the user set. The model emitted here is that same
 * full-white figure, so the limit and the wiring plan agree.
 *
 * The model is global. Outputs that differ take the heaviest LED, which dims
 * earliest and so errs toward protecting the supply.
 */
import type { StudioNode } from '../../state/graphStore'
import { ledLoads } from '../../build/power/powerCap'
import { outputForm } from '../../state/output/ledOutputForm'
import { HUB75_CHIPSET } from '../../state/nodeLibrary'

/** A model channel is a byte of milliwatts. */
const MAX_CHANNEL_MW = 255

/** Full-white milliwatts of the heaviest addressable LED the limiter throttles; null with none. */
export function heaviestLedMilliwatts(nodes: readonly StudioNode[]): number | null {
  const perLed = ledLoads(nodes)
    .filter(({ node, leds }) => {
      const props = node.data.properties as Record<string, unknown>
      // A HUB75 panel registers no FastLED controller, so the limiter never sees it.
      return leds > 0 && outputForm(props) !== 'hub75' && props.chipset !== HUB75_CHIPSET
    })
    .map(({ leds, fullWhiteMw }) => fullWhiteMw / leds)
  return perLed.length ? Math.max(...perLed) : null
}

export function powerLimitSetupCpp(nodes: readonly StudioNode[], volts: number, milliamps: number): string[] {
  return powerLimitLinesCpp(heaviestLedMilliwatts(nodes), volts, milliamps)
}

/** The same lines for a generator that carries the LED figure in its own config (the SD player). */
export function powerLimitLinesCpp(ledMw: number | null, volts: number, milliamps: number): string[] {
  if (ledMw === null) return [`  FastLED.setMaxPowerInVoltsAndMilliamps(${volts}, ${milliamps});`]
  const channelMw = Math.ceil(ledMw / 3)
  // An LED past what three bytes can state keeps the largest model and gives
  // up the rest from the budget, which limits to the same current.
  const budget = channelMw > MAX_CHANNEL_MW
    ? Math.max(1, Math.floor(milliamps * (3 * MAX_CHANNEL_MW) / ledMw))
    : milliamps
  const channel = Math.min(MAX_CHANNEL_MW, channelMw)
  return [
    `  FastLED.setPowerModel(PowerModelRGB(${channel}, ${channel}, ${channel}, 5));  // full-white draw of this build's LEDs`,
    `  FastLED.setMaxPowerInVoltsAndMilliamps(${volts}, ${budget});`,
  ]
}
