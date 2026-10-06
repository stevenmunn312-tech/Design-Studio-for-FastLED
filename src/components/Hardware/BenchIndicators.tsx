import { useEffect, useId, useState } from 'react'
import { usePreviewStore } from '../../state/previewStore'
import type { RenderIndicator } from '../../build/boardCapabilities'
import {
  indicatorGlow,
  indicatorsFollowState,
  type IndicatorGlow,
  type IndicatorRender,
} from './benchIndicatorGlow'

/** Brightness steps a dimmed LED is drawn in, so PWM noise does not re-render. */
const LEVEL_STEPS = 32
/** How far an LED's light spreads, as a multiple of its lens's longer side. */
const HALO_SPAN = 1.8

function rgb([r, g, b]: readonly number[]) {
  return `rgb(${r} ${g} ${b})`
}

/** The hot centre of a lit die: the LED's colour, most of the way to white. */
function core(color: readonly number[]) {
  return rgb(color.map((c) => Math.round(c + ((255 - c) * 0.7))))
}

function glowsKey(glows: IndicatorGlow[]) {
  return glows.map((glow) => `${Math.round(glow.level * LEVEL_STEPS)}:${glow.color.join(',')}`).join('|')
}

function readGlows(
  indicators: readonly RenderIndicator[],
  nodeType: string,
  properties: Record<string, unknown>,
  outputs: Record<string, unknown> | undefined,
): IndicatorGlow[] {
  return indicators.map((indicator) => indicatorGlow(indicator, nodeType, properties, outputs))
}

/**
 * A part's or board's indicator LEDs, lit over its render as the hardware
 * would light them.
 *
 * A power LED is already lit in the render, so it gains only the light a lit
 * LED throws onto the board around it. A state-driven LED is rendered dark and
 * is lit here — lens, die and glow — exactly while its node says so. Gradients
 * rather than a blur filter: a filter over changing content leaks renderer
 * memory in Chromium (see `HardwareLedPreview`).
 */
export default function BenchIndicators({
  nodeId,
  nodeType,
  properties,
  render,
  className,
}: {
  nodeId: string | null
  nodeType: string
  properties: Record<string, unknown>
  render: IndicatorRender | null | undefined
  className?: string
}) {
  const indicators = render?.indicators
  const gradientBase = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const [glows, setGlows] = useState<IndicatorGlow[]>(() => (
    indicators ? readGlows(indicators, nodeType, properties, nodeId ? usePreviewStore.getState().outputs.get(nodeId) : undefined) : []
  ))

  useEffect(() => {
    if (!indicators?.length) return
    let key = ''
    const read = (state: ReturnType<typeof usePreviewStore.getState>) => {
      const next = readGlows(indicators, nodeType, properties, nodeId ? state.outputs.get(nodeId) : undefined)
      const nextKey = glowsKey(next)
      if (nextKey === key) return
      key = nextKey
      setGlows(next)
    }
    read(usePreviewStore.getState())
    // Power-only LEDs never change while the part is on the bench.
    if (!nodeId || !indicatorsFollowState(indicators)) return
    return usePreviewStore.subscribe(read)
  }, [indicators, nodeId, nodeType, properties])

  if (!render || !indicators?.length) return null
  return (
    <svg
      className={className}
      viewBox={`0 0 ${render.widthPx} ${render.heightPx}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <defs>
        {indicators.map((_, index) => {
          const glow = glows[index]
          if (!glow) return null
          return (
            <radialGradient key={index} id={`${gradientBase}-${index}`}>
              <stop offset="0" stopColor={rgb(glow.color)} stopOpacity={0.75} />
              <stop offset="0.3" stopColor={rgb(glow.color)} stopOpacity={0.32} />
              <stop offset="1" stopColor={rgb(glow.color)} stopOpacity={0} />
            </radialGradient>
          )
        })}
      </defs>
      {indicators.map((indicator, index) => {
        const glow = glows[index]
        if (!glow || glow.level <= 0) return null
        const [x, y, width, height] = indicator.rectPx
        const cx = x + (width / 2)
        const cy = y + (height / 2)
        const short = Math.min(width, height)
        return (
          <g key={index} opacity={glow.level} data-indicator-lit={indicator.drive}>
            <circle cx={cx} cy={cy} r={Math.max(width, height) * HALO_SPAN} fill={`url(#${gradientBase}-${index})`} />
            {indicator.drive !== 'power' && (
              <>
                <rect x={x} y={y} width={width} height={height} rx={short * 0.2} fill={rgb(glow.color)} fillOpacity={0.55} />
                <ellipse cx={cx} cy={cy} rx={short * 0.3} ry={short * 0.3} fill={core(glow.color)} />
              </>
            )}
          </g>
        )
      })}
    </svg>
  )
}
