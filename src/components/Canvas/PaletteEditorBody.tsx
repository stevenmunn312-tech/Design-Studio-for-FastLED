import { useRef, type CSSProperties } from 'react'
import { useGraphStore } from '../../state/graphStore'
import { usePreviewStore } from '../../state/previewStore'
import {
  customPaletteStops16,
  hexToRgb,
  isHexColor,
  normalizeCustomPalette,
  rgbToHex,
  sampleCustomPalette,
  type RGB,
} from '../../state/customPalette'
import { polinePalette } from '../../state/polinePalette'
import styles from './PaletteEditorBody.module.css'

const CUSTOM_PRESETS = [
  { name: 'volt', colors: ['#1c39ff', '#30ffd0', '#fff36a', '#ff3b8a'], positions: [0, 0.36, 0.68, 1] },
  { name: 'ember', colors: ['#12040a', '#ff304f', '#ff9f1c', '#fff2a8'], positions: [0, 0.42, 0.72, 1] },
  { name: 'pool', colors: ['#031b3a', '#0077ff', '#31ffd5', '#f7ffb8'], positions: [0, 0.35, 0.7, 1] },
]

const POLINE_PRESETS = [
  { name: 'arc', colors: ['#1020ff', '#ff20a0', '#20ffd0'] },
  { name: 'solar', colors: ['#3d0752', '#ff6b35', '#ffe66d'] },
  { name: 'mineral', colors: ['#1b998b', '#2d3047', '#fffd82'] },
]

const INPUT_PORTS = ['color0', 'color1', 'color2', 'color3']
const ANCHORS = [
  ['anchorA', 'colorA', 'A'],
  ['anchorB', 'colorB', 'B'],
  ['anchorC', 'colorC', 'C'],
] as const
const ANCHOR_PORTS = ANCHORS.map(([, port]) => port)

function gradient(stops: RGB[]) {
  return `linear-gradient(to right, ${stops
    .map((c, i) => `rgb(${c.r},${c.g},${c.b}) ${((i / (stops.length - 1)) * 100).toFixed(1)}%`)
    .join(', ')})`
}

function rgbValue(value: unknown): RGB | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Partial<RGB>
  return typeof v.r === 'number' && typeof v.g === 'number' && typeof v.b === 'number'
    ? { r: v.r, g: v.g, b: v.b }
    : null
}

function useIncomingColors(nodeId: string, portIds: readonly string[]): (RGB | null)[] {
  const sourceKey = useGraphStore((s) => {
    const edges = s.edges
    return portIds.map((portId) => {
      const edge = edges.find((e) => e.target === nodeId && e.targetHandle === portId)
      return edge?.source && edge.sourceHandle ? `${edge.source}:${edge.sourceHandle}` : ''
    }).join('|')
  })
  const liveKey = usePreviewStore((s) => {
    return sourceKey.split('|').map((source) => {
      if (!source) return ''
      const [id, port] = source.split(':')
      const color = rgbValue(s.outputs.get(id)?.[port])
      return color ? `${color.r},${color.g},${color.b}` : ''
    }).join('|')
  })
  return liveKey.split('|').map((part) => {
    if (!part) return null
    const [r, g, b] = part.split(',').map(Number)
    return Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b) ? { r, g, b } : null
  })
}

function StopHandle({
  index,
  color,
  position,
  wired,
  onMove,
  onColor,
  onRemove,
  onNudge,
}: {
  index: number
  color: string
  position: number
  wired: boolean
  onMove: (position: number) => void
  onColor: (color: string) => void
  onRemove: () => void
  onNudge: (direction: -1 | 1) => void
}) {
  const railRef = useRef<HTMLDivElement | null>(null)
  const moveFromClient = (clientX: number) => {
    const rect = railRef.current?.parentElement?.getBoundingClientRect()
    if (!rect) return
    onMove((clientX - rect.left) / rect.width)
  }
  return (
    <div
      ref={railRef}
      className={styles.stop}
      style={{ left: `${position * 100}%`, '--stop-color': color } as CSSProperties}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        moveFromClient(e.clientX)
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) moveFromClient(e.clientX)
      }}
    >
      <input
        className={styles.stopColor}
        type="color"
        aria-label={`Stop ${index + 1} color`}
        disabled={wired}
        value={color}
        onPointerDown={(e) => e.stopPropagation()}
        onChange={(e) => onColor(e.target.value)}
      />
      <div className={styles.stopTools}>
        <button type="button" onClick={(e) => { e.stopPropagation(); onNudge(-1) }} title="Move left">‹</button>
        <button type="button" onClick={(e) => { e.stopPropagation(); onNudge(1) }} title="Move right">›</button>
        <button type="button" disabled={wired} onClick={(e) => { e.stopPropagation(); onRemove() }} title="Remove">×</button>
      </div>
    </div>
  )
}

export function CustomPaletteEditorBody({ nodeId }: { nodeId: string }) {
  const props = useGraphStore(
    (s) => (s.nodes.find((n) => n.id === nodeId)?.data.properties as Record<string, unknown> | undefined) ?? {},
  )
  const updateNodeProperties = useGraphStore((s) => s.updateNodeProperties)
  const local = normalizeCustomPalette(props.colors, props.positions)
  const wired = useIncomingColors(nodeId, INPUT_PORTS)
  const displayColors = local.colors.map((color, i) => wired[i] ? rgbToHex(wired[i]!) : color)
  const stops = customPaletteStops16(displayColors.map(hexToRgb), local.positions)
  const gradientCss = gradient(stops)

  const save = (colors: string[], positions: number[]) => {
    const next = normalizeCustomPalette(colors, positions)
    updateNodeProperties(nodeId, { colors: next.colors, positions: next.positions })
  }
  const setColor = (index: number, color: string) => save(local.colors.map((c, i) => i === index ? color : c), local.positions)
  const setPosition = (index: number, position: number) => save(local.colors, local.positions.map((p, i) => i === index ? position : p))
  const remove = (index: number) => {
    if (local.colors.length <= 2) return
    save(local.colors.filter((_, i) => i !== index), local.positions.filter((_, i) => i !== index))
  }
  const nudge = (index: number, direction: -1 | 1) => {
    const other = index + direction
    if (other < 0 || other >= local.colors.length) return
    const colors = [...local.colors]
    const positions = [...local.positions]
    ;[colors[index], colors[other]] = [colors[other], colors[index]]
    ;[positions[index], positions[other]] = [positions[other], positions[index]]
    save(colors, positions)
  }
  const add = () => {
    if (local.colors.length >= 8) return
    const position = 0.5
    const color = rgbToHex(sampleCustomPalette(displayColors.map(hexToRgb), local.positions, position))
    save([...local.colors, color], [...local.positions, position])
  }

  return (
    <div className={`nodrag ${styles.wrap}`}>
      <div className={styles.header}>
        <span>Palette stops</span>
        <button type="button" className={styles.miniBtn} onClick={add} disabled={local.colors.length >= 8}>add</button>
      </div>
      <div className={styles.rail} style={{ background: gradientCss }}>
        {local.colors.map((color, i) => (
          <StopHandle
            key={`${i}-${color}`}
            index={i}
            color={displayColors[i]}
            position={local.positions[i]}
            wired={Boolean(wired[i])}
            onMove={(position) => setPosition(i, position)}
            onColor={(next) => setColor(i, next)}
            onRemove={() => remove(i)}
            onNudge={(direction) => nudge(i, direction)}
          />
        ))}
      </div>
      <div className={styles.presetRow}>
        {CUSTOM_PRESETS.map((preset) => (
          <button
            key={preset.name}
            type="button"
            className={styles.preset}
            title={preset.name}
            style={{ background: gradient(customPaletteStops16(preset.colors.map(hexToRgb), preset.positions)) }}
            onClick={() => updateNodeProperties(nodeId, { colors: preset.colors, positions: preset.positions })}
          />
        ))}
      </div>
    </div>
  )
}

export function PolineEditorBody({ nodeId }: { nodeId: string }) {
  const props = useGraphStore(
    (s) => (s.nodes.find((n) => n.id === nodeId)?.data.properties as Record<string, unknown> | undefined) ?? {},
  )
  const updateNodeProperties = useGraphStore((s) => s.updateNodeProperties)
  const wired = useIncomingColors(nodeId, ANCHOR_PORTS)
  const anchors = ANCHORS.map(([key], i) => {
    const live = wired[i]
    const prop = props[key]
    return live ? rgbToHex(live) : isHexColor(prop) ? prop : POLINE_PRESETS[0].colors[i]
  })
  const stops = polinePalette(anchors.map(hexToRgb), Number(props.points ?? 4), String(props.position ?? 'sinusoidal'))
  const gradientCss = gradient(stops.length ? stops : anchors.map(hexToRgb))

  return (
    <div className={`nodrag ${styles.wrap}`}>
      <div className={styles.header}>
        <span>Poline anchors</span>
      </div>
      <div className={styles.anchorRail} style={{ background: gradientCss }}>
        {ANCHORS.map(([key,, label], i) => (
          <label key={key} className={styles.anchor} style={{ left: `${(i / 2) * 100}%`, '--stop-color': anchors[i] } as CSSProperties}>
            <span>{label}</span>
            <input
              type="color"
              disabled={Boolean(wired[i])}
              value={anchors[i]}
              onChange={(e) => updateNodeProperties(nodeId, { [key]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <div className={styles.presetRow}>
        {POLINE_PRESETS.map((preset) => (
          <button
            key={preset.name}
            type="button"
            className={styles.preset}
            title={preset.name}
            style={{ background: gradient(polinePalette(preset.colors.map(hexToRgb), Number(props.points ?? 4), String(props.position ?? 'sinusoidal'))) }}
            onClick={() => updateNodeProperties(nodeId, {
              anchorA: preset.colors[0],
              anchorB: preset.colors[1],
              anchorC: preset.colors[2],
            })}
          />
        ))}
      </div>
    </div>
  )
}
