import { blankSurfaceUrl, useSurfacePicture } from '../Preview/useSurfacePicture'
import styles from './AuxDisplayNodeBodies.module.css'

/**
 * The OLED as the evaluator draws it.
 *
 * An `<img>`, not a live `<canvas>`: a visible canvas in the graph is its own
 * compositor layer and leaks renderer memory every frame (see
 * `useSurfacePicture`). Unlit pixels are transparent and the panel's own black
 * shows behind them.
 *
 * A panel with no surface is off, and off has to show as off: the panel used
 * to keep its last lit frame when a display was switched off by its Enabled
 * property or a wire, contradicting the firmware on the one signal whose whole
 * meaning is whether the panel is dark.
 */
export default function InfoDisplayNodeBody({ nodeId }: { nodeId: string }) {
  const picture = useSurfacePicture(nodeId, 'oled')
  const width = picture?.width ?? 128
  const height = picture?.height ?? 64

  return (
    <div className={styles.wrap}>
      <img
        className={`${styles.screen} ${styles.oled}`}
        src={picture?.url ?? blankSurfaceUrl(width, height)}
        width={width}
        height={height}
        alt={`Info display preview, ${width} by ${height} pixels`}
        draggable={false}
      />
    </div>
  )
}
