import { useEffect, useMemo, useRef } from 'react'
import { usePreviewStore } from '../../state/previewStore'
import type { StereoVuFrame } from '../../state/stereoVuMeter'

export default function HardwareVuRailPreview({
  nodeId,
  side,
  count,
  dataIn,
}: {
  nodeId: string
  side: 'left' | 'right'
  count: number
  dataIn: 'Top' | 'Bottom'
}) {
  const refs = useRef<Array<SVGRectElement | null>>([])
  const cells = useMemo(() => Array.from({ length: count }, (_, index) => index), [count])

  useEffect(() => {
    refs.current.length = count
    const paint = (state: ReturnType<typeof usePreviewStore.getState>) => {
      const vu = state.outputs.get(nodeId)?.vu as StereoVuFrame | undefined
      const pixels = vu?.[side] ?? []
      const scale = Math.max(0, Math.min(255, state.brightness)) / 255
      for (let row = 0; row < count; row++) {
        const wireIndex = dataIn === 'Bottom' ? count - row - 1 : row
        const pixel = pixels[wireIndex]
        const r = Math.round((pixel?.r ?? 0) * scale)
        const g = Math.round((pixel?.g ?? 0) * scale)
        const b = Math.round((pixel?.b ?? 0) * scale)
        refs.current[row]?.setAttribute('fill', `rgb(${r} ${g} ${b})`)
      }
    }
    paint(usePreviewStore.getState())
    return usePreviewStore.subscribe(paint)
  }, [count, dataIn, nodeId, side])

  return (
    <svg viewBox={`0 0 1 ${count}`} preserveAspectRatio="none" aria-hidden="true">
      {cells.map((row) => (
        <rect
          key={row}
          ref={(element) => { refs.current[row] = element }}
          x="0.22"
          y={row + 0.22}
          width="0.56"
          height="0.56"
          rx="0.12"
          fill="rgb(0 0 0)"
        />
      ))}
    </svg>
  )
}
