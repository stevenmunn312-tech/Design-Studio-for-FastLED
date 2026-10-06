import { useEffect, useRef } from 'react'
import { usePreviewStore } from '../../state/previewStore'
import { isOledSurface, paintOledSurface } from '../Preview/displaySurfaceRaster'
import styles from './AuxDisplayNodeBodies.module.css'

/** What an unlit pixel looks like on the node's own drawing of the glass. */
const OLED_OFF_RGBA = [0, 5, 12, 255] as const

export default function InfoDisplayNodeBody({ nodeId }: { nodeId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const live = usePreviewStore((state) => state.outputs.get(nodeId)?.surface)
  const surface = isOledSurface(live) ? live : null
  const width = surface?.width ?? 128
  const height = surface?.height ?? 64

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return
    // A panel with no surface is off, and off has to be *painted*. Returning
    // early left the last lit frame on the canvas, so a display switched off by
    // its Enabled property or a wire went dark on the glass while the node
    // preview kept showing the clock it had drawn before — the preview
    // contradicting the firmware, on the one signal whose whole meaning is
    // whether the panel is dark. Unlit is the same colour an unlit pixel is.
    if (!surface) {
      context.fillStyle = 'rgb(0, 5, 12)'
      context.fillRect(0, 0, canvas.width, canvas.height)
      return
    }
    const image = context.createImageData(surface.width, surface.height)
    paintOledSurface(image, surface, OLED_OFF_RGBA)
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
