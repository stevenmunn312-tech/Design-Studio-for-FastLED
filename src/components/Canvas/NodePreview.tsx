import { usePreviewStore } from '../../state/previewStore'
import { paletteStops } from '../../state/graphEvaluator'
import HardwareLedPreview from '../Hardware/HardwareLedPreview'
import { LED_CELL_FILL, thumbGrid } from '../Hardware/ledPreviewGeometry'
import styles from './NodePreview.module.css'

type RGB = { r: number; g: number; b: number }
export type PreviewKind = 'frame' | 'palette' | 'color'

/*
 * A frame node's live thumbnail, drawn by the same renderer as the LED output.
 *
 * It used to be its own fixed 16x16 grid of gapless, full-cell blocks, which
 * made one frame look like two different things depending on which end of a
 * cable you read it from: adjacent lit pixels merged into continuous blobs on
 * the source node and separated into isolated dots on the output. The pixels
 * were identical the whole time. Sharing HardwareLedPreview means the source,
 * the output node and the hardware bay cannot drift apart again, and the
 * emitter look is the one the user is actually designing for.
 */
function FrameThumb({ nodeId, port, height, cols, rows }: {
  nodeId: string
  port: string
  height?: number
  cols: number
  rows: number
}) {
  const grid = thumbGrid(cols, rows)
  return (
    <div className={styles.frameWrap} style={height ? { height } : undefined}>
      <HardwareLedPreview
        nodeId={nodeId}
        port={port}
        cols={grid.cols}
        rows={grid.rows}
        cellFill={LED_CELL_FILL}
        className={styles.frame}
      />
    </div>
  )
}

function PaletteStrip({ palette }: { palette: string | RGB[] }) {
  const stops = paletteStops(palette, 16)
  const gradient = `linear-gradient(to right, ${stops
    .map((c, i) => `rgb(${c.r},${c.g},${c.b}) ${((i / (stops.length - 1)) * 100).toFixed(1)}%`)
    .join(', ')})`
  return <div className={styles.bar} style={{ background: gradient }} data-testid="palette-preview-strip" aria-hidden="true" />
}

function ColorSwatch({ color }: { color: RGB }) {
  return <div className={styles.bar} style={{ background: `rgb(${color.r},${color.g},${color.b})` }} aria-hidden="true" />
}

/** Top-of-node preview driven by the live evaluation in previewStore. */
export default function NodePreview({
  nodeId,
  kind,
  port,
  height,
  cols = 16,
  rows = 16,
  valueOverride,
}: {
  nodeId: string
  kind: PreviewKind
  port: string
  height?: number
  /** The frame's own dimensions — the shared composition canvas. */
  cols?: number
  rows?: number
  valueOverride?: unknown
}) {
  if (kind === 'frame') return <FrameThumb nodeId={nodeId} port={port} height={height} cols={cols} rows={rows} />
  return <ScalarPreview nodeId={nodeId} kind={kind} port={port} valueOverride={valueOverride} />
}

function ScalarPreview({ nodeId, kind, port, valueOverride }: {
  nodeId: string
  kind: Exclude<PreviewKind, 'frame'>
  port: string
  valueOverride?: unknown
}) {
  const value = usePreviewStore((s) => s.outputs.get(nodeId)?.[port])
  if (kind === 'palette') return <PaletteStrip palette={(valueOverride as string | RGB[] | undefined) ?? (value as string | RGB[] | undefined) ?? 'rainbow'} />
  return <ColorSwatch color={(value as RGB | undefined) ?? { r: 0, g: 0, b: 0 }} />
}
