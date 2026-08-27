import { useEffect, useMemo, useRef } from 'react'
import { useGraphStore } from '../../state/graphStore'
import { usePreviewStore } from '../../state/previewStore'
import { tftControllerForProps } from '../../state/nodeLibrary'
import { asTftRotation, rgb565Components, TFT_CONTROLLERS, tftRotatedSize, type TftSurface } from '../../state/tftSurface'
import styles from './TransportDisplayNodeBody.module.css'

function isTftSurface(value: unknown): value is TftSurface {
  if (!value || typeof value !== 'object') return false
  const surface = value as Partial<TftSurface>
  return Number.isInteger(surface.width) && Number.isInteger(surface.height)
    && surface.data instanceof Uint16Array
}

/** Compact physical-screen preview; canvas pixels keep the panel's true ratio. */
export default function TransportDisplayNodeBody({ nodeId }: { nodeId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const props = useGraphStore((state) => state.nodes.find((node) => node.id === nodeId)?.data.properties)
  const live = usePreviewStore((state) => state.outputs.get(nodeId)?.surface)
  const surface = isTftSurface(live) ? live : null
  const fallbackSize = useMemo(() => tftRotatedSize(
    tftControllerForProps((props ?? {}) as Record<string, unknown>) ?? TFT_CONTROLLERS.ST7789,
    asTftRotation((props as Record<string, unknown> | undefined)?.tftRotation),
  ), [props])
  const width = surface?.width ?? fallbackSize.width
  const height = surface?.height ?? fallbackSize.height

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !surface) return
    const context = canvas.getContext('2d')
    if (!context) return
    const image = context.createImageData(surface.width, surface.height)
    for (let i = 0; i < surface.data.length; i++) {
      const { r, g, b } = rgb565Components(surface.data[i])
      const at = i * 4
      image.data[at] = r
      image.data[at + 1] = g
      image.data[at + 2] = b
      image.data[at + 3] = 255
    }
    context.putImageData(image, 0, 0)
  }, [surface])

  return (
    <div className={styles.wrap}>
      <canvas
        ref={canvasRef}
        className={styles.screen}
        width={width}
        height={height}
        role="img"
        aria-label={`Transport display preview, ${width} by ${height} pixels`}
      />
    </div>
  )
}
