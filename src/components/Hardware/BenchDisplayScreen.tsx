import { useEffect, useMemo, useState } from 'react'
import { usePreviewStore } from '../../state/previewStore'
import { useGraphStore } from '../../state/graphStore'
import { partById } from '../../state/partCatalogue'
import { asOledRotation, type OledSurface } from '../../state/oledSurface'
import { asTftRotation, type TftSurface } from '../../state/tftSurface'
import { segmentBytes, segmentControllerFor, type SegmentFrame } from '../../state/segmentDisplay'
import { shownDesignId } from '../../state/transportDisplay'
import DisplayDesignSurface from '../DisplayEditor/DisplayDesignSurface'
import { isOledSurface, isTftSurface, paintOledSurface, paintTftSurface } from '../Preview/displaySurfaceRaster'
import {
  COLON_DOTS,
  COLON_RADIUS,
  DECIMAL_POINT,
  DIGIT_SLANT_DEG,
  DIGIT_WIDTH,
  oledScreenTurn,
  screenContentTransform,
  SEGMENT_POLYGONS,
  segmentDigitPlacements,
  tftScreenTurn,
  type BenchScreens,
  type ScreenRect,
} from './benchScreenGeometry'

/** Node types whose output the bench draws on the part's own glass. */
export const BENCH_DISPLAY_NODE_TYPES: ReadonlySet<string> = new Set([
  'InfoDisplay',
  'TransportDisplay',
  'SegmentDisplay',
])

/*
 * A panel's picture is rasterised at most this often. The evaluator publishes a
 * fresh surface every tick, but what a panel shows changes at clock or progress
 * speed; re-encoding it sixty times a second would cost more than it shows.
 */
const RASTER_INTERVAL_MS = 100
const TRANSPARENT = [0, 0, 0, 0] as const
const SEGMENT_LIT = '#ff3a22'
/** An unlit segment behind the smoked window: there, but only just. */
const SEGMENT_GHOST = 'rgba(255, 70, 50, 0.07)'
/** Leans a glyph about its own centre, as the package is moulded. */
const DIGIT_LEAN = `translate(${DIGIT_WIDTH / 2} 0.5) skewX(${DIGIT_SLANT_DEG}) translate(${-DIGIT_WIDTH / 2} -0.5)`

/*
 * One off-DOM canvas for every panel on the bench. A visible, repainted
 * <canvas> becomes its own compositor layer, and Chromium leaks raster memory
 * for each one every compositor frame; an <image> fed from here is ordinary
 * painted content. See `HardwareLedPreview` for the history.
 */
let scratch: HTMLCanvasElement | null = null

function rasterise(surface: OledSurface | TftSurface, kind: 'oled' | 'tft'): string | null {
  if (typeof document === 'undefined') return null
  scratch ??= document.createElement('canvas')
  scratch.width = surface.width
  scratch.height = surface.height
  const context = scratch.getContext('2d')
  if (!context) return null
  const image = context.createImageData(surface.width, surface.height)
  if (kind === 'oled') paintOledSurface(image, surface as OledSurface, TRANSPARENT)
  else paintTftSurface(image, surface as TftSurface)
  context.putImageData(image, 0, 0)
  return scratch.toDataURL('image/png')
}

interface Picture {
  url: string
  width: number
  height: number
}

/**
 * The panel's evaluated surface as an image URL, re-rasterised only when its
 * pixels change and no more often than `RASTER_INTERVAL_MS`. Null while the
 * panel is dark, so the rendered, powered-off glass shows.
 */
function useSurfacePicture(nodeId: string, kind: 'oled' | 'tft', active = true): Picture | null {
  const [picture, setPicture] = useState<Picture | null>(null)

  useEffect(() => {
    if (!active) return
    let latest: OledSurface | TftSurface | null = null
    let latestValue: unknown = undefined
    let shown: Uint8Array | Uint16Array | null = null
    let shownWidth = 0
    let painted = false
    let lastAt = -Infinity
    let timer: ReturnType<typeof setTimeout> | null = null

    const draw = () => {
      timer = null
      lastAt = Date.now()
      painted = true
      const surface = latest
      if (!surface) {
        shown = null
        setPicture(null)
        return
      }
      shown = surface.data.slice()
      shownWidth = surface.width
      const url = rasterise(surface, kind)
      setPicture(url ? { url, width: surface.width, height: surface.height } : null)
    }

    const unchanged = (surface: OledSurface | TftSurface | null) => {
      if (!painted) return false
      if (!surface || !shown) return !surface && !shown
      if (surface.width !== shownWidth || surface.data.length !== shown.length) return false
      for (let i = 0; i < shown.length; i++) if (shown[i] !== surface.data[i]) return false
      return true
    }

    const read = (state: ReturnType<typeof usePreviewStore.getState>) => {
      const value = state.outputs.get(nodeId)?.surface
      if (painted && value === latestValue) return
      latestValue = value
      latest = kind === 'oled'
        ? (isOledSurface(value) ? value : null)
        : (isTftSurface(value) ? value : null)
      if (timer || unchanged(latest)) return
      const wait = RASTER_INTERVAL_MS - (Date.now() - lastAt)
      if (wait <= 0) draw()
      else timer = setTimeout(draw, wait)
    }

    read(usePreviewStore.getState())
    const unsubscribe = usePreviewStore.subscribe(read)
    return () => {
      unsubscribe()
      if (timer) clearTimeout(timer)
    }
  }, [active, kind, nodeId])

  return active ? picture : null
}

function SurfaceImage({ picture, glass, turn }: { picture: Picture; glass: ScreenRect; turn: number }) {
  return (
    <image
      href={picture.url}
      width={picture.width}
      height={picture.height}
      preserveAspectRatio="none"
      imageRendering="pixelated"
      transform={screenContentTransform(glass, picture.width, picture.height, turn)}
    />
  )
}

function OledScreen({ nodeId, glass, rotation }: { nodeId: string; glass: ScreenRect; rotation: unknown }) {
  const picture = useSurfacePicture(nodeId, 'oled')
  if (!picture) return null
  return <SurfaceImage picture={picture} glass={glass} turn={oledScreenTurn(asOledRotation(rotation))} />
}

function TftScreen({ nodeId, glass, properties }: {
  nodeId: string
  glass: ScreenRect
  properties: Record<string, unknown>
}) {
  const turn = tftScreenTurn(asTftRotation(properties.tftRotation), glass)
  // A mounted screen design replaces the fixed layout on the glass, as it
  // does in the node body; the evaluator's fixed surface is not what shows.
  const designId = shownDesignId(properties)
  const document = useGraphStore((state) => (designId ? state.displayDocuments[designId] : undefined))
  const lit = usePreviewStore((state) => state.outputs.get(nodeId)?.lit)
  const picture = useSurfacePicture(nodeId, 'tft', !designId)
  if (designId) {
    const enabled = typeof lit === 'boolean' ? lit : properties.enabled !== false
    if (!document || !enabled) return null
    const { width, height } = document.designSize
    return (
      <g transform={screenContentTransform(glass, width, height, turn)}>
        <foreignObject x={0} y={0} width={width} height={height}>
          <div style={{ position: 'relative', width, height, overflow: 'hidden', background: '#000' }}>
            <DisplayDesignSurface displayId={designId} document={document} />
          </div>
        </foreignObject>
      </g>
    )
  }
  if (!picture) return null
  return <SurfaceImage picture={picture} glass={glass} turn={turn} />
}

function isSegmentFrame(value: unknown): value is SegmentFrame {
  if (!value || typeof value !== 'object') return false
  const frame = value as Partial<SegmentFrame>
  return typeof frame.digits === 'string' && typeof frame.colon === 'boolean'
    && typeof frame.decimalAt === 'number' && typeof frame.lit === 'boolean'
}

/**
 * The digits as the module lights them: from the same segment bytes the
 * firmware writes (`segmentBytes`), so the bench cannot light a segment the
 * hardware would not. Re-renders only when those bytes change.
 */
function SegmentDigits({ nodeId, partId, screens }: { nodeId: string; partId: string; screens: ScreenRect[] }) {
  const controller = segmentControllerFor(partById(partId)?.display?.controller)
  const digits = controller.digits
  const [bytes, setBytes] = useState<number[]>(() => new Array(digits).fill(0))

  useEffect(() => {
    let key = ''
    const read = (state: ReturnType<typeof usePreviewStore.getState>) => {
      const value = state.outputs.get(nodeId)?.segment
      const next = isSegmentFrame(value) ? segmentBytes(value) : new Array(digits).fill(0)
      const nextKey = next.join(',')
      if (nextKey === key) return
      key = nextKey
      setBytes(next)
    }
    read(usePreviewStore.getState())
    return usePreviewStore.subscribe(read)
  }, [digits, nodeId])

  const placements = useMemo(() => segmentDigitPlacements(screens, digits), [digits, screens])

  return (
    <>
      {placements.map((place, index) => {
        const byte = bytes[index] ?? 0
        // On the colon form the second digit's high bit is the colon and no
        // digit has a point; on the eight-digit form every high bit is that
        // digit's point. `segmentBytes` documents the same wiring.
        const pointLit = !controller.hasColon && (byte & 0x80) !== 0
        return (
          <g key={index} transform={`translate(${place.x} ${place.y}) scale(${place.scale})`}>
            <g transform={DIGIT_LEAN}>
              {SEGMENT_POLYGONS.map((points, bit) => {
                const on = (byte & (1 << bit)) !== 0
                return (
                  <polygon
                    key={bit}
                    points={points}
                    data-segment-lit={on || undefined}
                    fill={on ? SEGMENT_LIT : SEGMENT_GHOST}
                    stroke={on ? SEGMENT_LIT : 'none'}
                    strokeWidth={0.08}
                    strokeOpacity={0.3}
                    strokeLinejoin="round"
                  />
                )
              })}
              {!controller.hasColon && (
                <circle
                  cx={DECIMAL_POINT.cx}
                  cy={DECIMAL_POINT.cy}
                  r={DECIMAL_POINT.r}
                  data-segment-lit={pointLit || undefined}
                  fill={pointLit ? SEGMENT_LIT : SEGMENT_GHOST}
                />
              )}
              {controller.hasColon && index === 1 && COLON_DOTS.map((cy) => {
                const on = (byte & 0x80) !== 0
                return (
                  <circle
                    key={cy}
                    cx={DIGIT_WIDTH + place.halfGap}
                    cy={cy}
                    r={COLON_RADIUS}
                    data-segment-lit={on || undefined}
                    fill={on ? SEGMENT_LIT : SEGMENT_GHOST}
                  />
                )
              })}
            </g>
          </g>
        )
      })}
    </>
  )
}

/**
 * What a display node is showing, drawn on the glass of the render it sits on.
 *
 * Laid over that render's `<img>` and sized the same way: the viewBox is the
 * render's own pixels and `meet` matches the image's `object-fit: contain`,
 * so a screen rectangle measured on the render lands on the render. The
 * render is usually the module's own (`benchScreensFor`), and for a panel
 * soldered to its controller it is the board's (`boardScreensFor`).
 */
export default function BenchDisplayScreen({
  nodeId,
  nodeType,
  partId,
  screens: bench,
  properties,
  className,
}: {
  nodeId: string
  nodeType: string
  /** The catalogued module, which decides a segment display's digit count. */
  partId: string | null | undefined
  screens: BenchScreens | null
  properties: Record<string, unknown>
  className?: string
}) {
  if (!bench || !partId || !BENCH_DISPLAY_NODE_TYPES.has(nodeType)) return null
  const glass = bench.screens[0]
  return (
    <svg
      className={className}
      viewBox={`0 0 ${bench.renderWidth} ${bench.renderHeight}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      data-bench-display={nodeId}
    >
      {nodeType === 'SegmentDisplay' && <SegmentDigits nodeId={nodeId} partId={partId} screens={bench.screens} />}
      {nodeType === 'InfoDisplay' && <OledScreen nodeId={nodeId} glass={glass} rotation={properties.oledRotation} />}
      {nodeType === 'TransportDisplay' && <TftScreen nodeId={nodeId} glass={glass} properties={properties} />}
    </svg>
  )
}
