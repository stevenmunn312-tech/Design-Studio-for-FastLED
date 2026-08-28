import { useEffect, useMemo, useRef } from 'react'
import { usePreviewStore } from '../../state/previewStore'
import { WS2812B_EMITTER } from '../../state/hardware'
import { TAPE_GLOW } from './ledPreviewGeometry'
import type { StereoVuFrame } from '../../state/stereoVuMeter'

/*
 * The rail is the same tape stood on end: `.vuRailTape` rotates the render a
 * quarter turn, so the emitter's along-tile axis runs down the rail and its
 * across-tile axis runs across it. The quarter turn takes the render's own +y
 * to screen -x, which is why the across-centre is mirrored rather than used as
 * measured — a tenth of the rail's width, but derived rather than eyeballed.
 */
const RAIL = { along: WS2812B_EMITTER.along, across: WS2812B_EMITTER.across }
const ALONG = WS2812B_EMITTER.centreAlong
const ACROSS = 1 - WS2812B_EMITTER.centreAcross

export default function HardwareVuRailPreview({
  nodeId,
  side,
  count,
  dataIn,
  run,
}: {
  nodeId: string
  side: 'left' | 'right'
  /** LEDs the real rail has, whatever the bench has room to draw. */
  count: number
  dataIn: 'Top' | 'Bottom'
  /** Set when the bench drew this rail broken: the rows actually drawn, each
   *  naming the real LED position it stands for, over `span` slots. The wire
   *  order still runs over the whole rail, so the LED above the break is the
   *  LED that is really there rather than the next one along. */
  run?: { cells: Array<{ index: number; slot: number }>; span: number } | null
}) {
  const refs = useRef<Array<SVGElement | null>>([])
  // Rows in draw order. Unbroken, a row is its own position on the rail.
  const rows = useMemo(
    () => run?.cells ?? Array.from({ length: count }, (_, index) => ({ index, slot: index })),
    [count, run],
  )
  const span = run?.span ?? count

  useEffect(() => {
    refs.current.length = rows.length
    const paint = (state: ReturnType<typeof usePreviewStore.getState>) => {
      const vu = state.outputs.get(nodeId)?.vu as StereoVuFrame | undefined
      const pixels = vu?.[side] ?? []
      const scale = Math.max(0, Math.min(255, state.brightness)) / 255
      for (let row = 0; row < rows.length; row++) {
        const position = rows[row].index
        const wireIndex = dataIn === 'Bottom' ? count - position - 1 : position
        const pixel = pixels[wireIndex]
        const r = Math.round((pixel?.r ?? 0) * scale)
        const g = Math.round((pixel?.g ?? 0) * scale)
        const b = Math.round((pixel?.b ?? 0) * scale)
        refs.current[row]?.setAttribute('fill', `rgb(${r} ${g} ${b})`)
      }
    }
    paint(usePreviewStore.getState())
    return usePreviewStore.subscribe(paint)
  }, [count, dataIn, nodeId, rows, side])

  return (
    <svg viewBox={`0 0 1 ${span}`} preserveAspectRatio="none" aria-hidden="true">
      {rows.map((cell, row) => (
        <g
          key={cell.index}
          ref={(element) => { refs.current[row] = element }}
          fill="rgb(0 0 0)"
        >
          {TAPE_GLOW.map((layer, index) => (
            <rect
              key={index}
              x={ACROSS - (RAIL.across * layer.across / 2)}
              y={cell.slot + ALONG - (RAIL.along * layer.along / 2)}
              width={RAIL.across * layer.across}
              height={RAIL.along * layer.along}
              rx={RAIL.across * layer.across * 0.5}
              fillOpacity={layer.opacity}
            />
          ))}
          <rect
            x={ACROSS - (RAIL.across / 2)}
            y={cell.slot + ALONG - (RAIL.along / 2)}
            width={RAIL.across}
            height={RAIL.along}
            rx={Math.min(RAIL.across, RAIL.along) * 0.22}
          />
        </g>
      ))}
    </svg>
  )
}
