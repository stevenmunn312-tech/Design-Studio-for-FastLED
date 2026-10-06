// Which of a part's indicator LEDs are lit, and how brightly.
//
// The LEDs themselves are measured from the model and imported with the
// render (`render.indicators`). What lights each is answered here, from the
// same evaluated values the firmware would act on, so a relay's channel LED is
// on exactly while its coil would be energised.

import type { RenderIndicator } from '../../build/boards/boardCapabilities'
import { partById } from '../../build/parts/partCatalogue'
import { powerSwitchChannels } from '../../state/peripherals/powerSwitch'
import { relayEnergisedKey } from '../../state/peripherals/relayModule'
import { IR_RECEIVING_KEY } from '../../state/peripherals/irRemote'

export interface IndicatorRender {
  widthPx: number
  heightPx: number
  indicators?: RenderIndicator[]
}

export interface IndicatorGlow {
  /** 0 is dark, 1 full brightness; a dimmed MOSFET channel sits between. */
  level: number
  color: [number, number, number]
}

/**
 * The catalogued render a bench part is drawn with, when it is the picture on
 * screen. Indicators are positions on one particular render; drawn over any
 * other picture they would land on the wrong spot.
 */
export function indicatorRenderFor(partId: string | null | undefined, shownSrc: string | undefined): IndicatorRender | null {
  if (!partId || !shownSrc) return null
  const render = partById(partId)?.render
  if (!render?.indicators?.length || `/${render.file}` !== shownSrc) return null
  return render
}

/** Whether any of these LEDs follows evaluated state rather than power alone. */
export function indicatorsFollowState(indicators: readonly RenderIndicator[]): boolean {
  return indicators.some((indicator) => indicator.drive !== 'power')
}

function clamp01(value: unknown): number {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : 0
  return Math.max(0, Math.min(1, number))
}

/** How one LED is lit, given its node and that node's published values. */
export function indicatorGlow(
  indicator: RenderIndicator,
  nodeType: string,
  properties: Record<string, unknown>,
  outputs: Record<string, unknown> | undefined,
): IndicatorGlow {
  const dark = { level: 0, color: indicator.color }
  switch (indicator.drive) {
    case 'power':
      // A bench part is a powered part; the render already shows this one on.
      return { level: 1, color: indicator.color }
    case 'voltage': {
      const requested = String(properties.requestedVoltage ?? '')
      return { level: 1, color: indicator.colorsByVoltage?.[requested] ?? indicator.color }
    }
    case 'channel': {
      const channel = indicator.channel ?? 0
      if (nodeType === 'RelayOutput') {
        return { level: outputs?.[relayEnergisedKey(channel)] === true ? 1 : 0, color: indicator.color }
      }
      if (nodeType === 'PowerSwitchOutput') {
        // The LED sits across the load, so it shows the PWM share the load gets.
        const port = powerSwitchChannels(properties.partId)[channel - 1]
        return { level: port ? clamp01(outputs?.[port.load]) : 0, color: indicator.color }
      }
      return dark
    }
    case 'signal':
      if (nodeType === 'IRRemoteInput') {
        return { level: outputs?.[IR_RECEIVING_KEY] === true ? 1 : 0, color: indicator.color }
      }
      return dark
    default:
      return dark
  }
}
