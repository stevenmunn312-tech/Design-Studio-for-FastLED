import { useEffect, useRef } from 'react'
import { usePreviewStore } from '../../state/previewStore'
import { getPixel, type OledSurface } from '../../state/oledSurface'
import styles from './AuxDisplayNodeBodies.module.css'

function isOledSurface(value: unknown): value is OledSurface {
  if (!value || typeof value !== 'object') return false
  const surface = value as Partial<OledSurface>
  return Number.isInteger(surface.width) && Number.isInteger(surface.height)
    && surface.data instanceof Uint8Array
}

export default function InfoDisplayNodeBody({ nodeId }: { nodeId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const live = usePreviewStore((state) => state.outputs.get(nodeId)?.surface)
  const surface = isOledSurface(live) ? live : null
  const width = surface?.width ?? 128
  const height = surface?.height ?? 64

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !surface) return
    const context = canvas.getContext('2d')
    if (!context) return
    const image = context.createImageData(surface.width, surface.height)
    for (let y = 0; y < surface.height; y++) {
      for (let x = 0; x < surface.width; x++) {
        const at = ((y * surface.width) + x) * 4
        const on = getPixel(surface, x, y)
        image.data[at] = on ? 205 : 0
        image.data[at + 1] = on ? 238 : 5
        image.data[at + 2] = on ? 255 : 12
        image.data[at + 3] = 255
      }
    }
    context.putImageData(image, 0, 0)
  }, [surface])

  return (
    <div className={styles.wrap}>
      <canvas
        ref={canvasRef}
        className={`${styles.screen} ${styles.oled}`}
        width={width}
        height={height}
        role="img"
        aria-label={`Info display preview, ${width} by ${height} pixels`}
      />
    </div>
  )
}
