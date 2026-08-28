import { useMemo } from 'react'
import { rootGraphNodes, useGraphStore, useRootNodes } from '../../state/graphStore'
import { LED_OUTPUT_FORM_LABELS, outputForm } from '../../state/ledOutputForm'
import { usePreviewStore } from '../../state/previewStore'
import type { RGB } from '../../state/ledColor'
import type { StereoVuFrame } from '../../state/stereoVuMeter'
import styles from './StereoVuMeterNodeBody.module.css'

const rgbCss = (color: RGB): string => `rgb(${color.r} ${color.g} ${color.b})`

function Rail({ pixels, side }: { pixels: RGB[]; side: 'Left' | 'Right' }) {
  return (
    <span className={styles.rail} aria-label={`${side} VU rail`}>
      {[...pixels].reverse().map((color, index) => (
        <i key={index} style={{ backgroundColor: rgbCss(color) }} />
      ))}
    </span>
  )
}

export default function StereoVuMeterNodeBody({ nodeId }: { nodeId: string }) {
  const updateNodeProperty = useGraphStore((state) => state.updateNodeProperty)
  const node = useGraphStore((state) => rootGraphNodes(state).find((candidate) => candidate.id === nodeId))
  const rootNodes = useRootNodes()
  const outputs = useMemo(
    () => rootNodes.filter((candidate) => candidate.data.nodeType === 'MatrixOutput'),
    [rootNodes],
  )
  const targetOutputId = String(node?.data.properties.targetOutputId ?? '')
  const mode = String(node?.data.properties.visualizationMode ?? 'Classic Ladder')
  const live = usePreviewStore((state) => state.outputs.get(nodeId)?.vu) as StereoVuFrame | undefined
  const ledCount = Math.max(1, Math.round(Number(node?.data.properties.ledCount ?? 60)))
  const blank = useMemo(() => Array.from({ length: ledCount }, () => ({ r: 0, g: 0, b: 0 })), [ledCount])
  const left = live?.left ?? blank
  const right = live?.right ?? blank

  return (
    <div className={styles.body}>
      <div className={styles.rails} aria-label={live?.active ? 'Stereo VU Meter live preview' : 'Stereo VU Meter inactive preview'}>
        <Rail pixels={left} side="Left" />
        <strong>
          {live?.mode ?? mode}
          <small>{live?.active ? 'L / R' : 'NO AUDIO'}</small>
        </strong>
        <Rail pixels={right} side="Right" />
      </div>
      <label className={styles.targetRow}>
        <span>target</span>
        <select
          className="nodrag"
          aria-label="Stereo VU Meter target LED output"
          value={outputs.some((output) => output.id === targetOutputId) ? targetOutputId : ''}
          onChange={(event) => updateNodeProperty(nodeId, 'targetOutputId', event.target.value)}
        >
          <option value="">Standalone</option>
          {outputs.map((output, index) => {
            const form = outputForm(output.data.properties as Record<string, unknown>)
            return (
              <option key={output.id} value={output.id}>
                {String(output.data.label || LED_OUTPUT_FORM_LABELS[form])} {outputs.length > 1 ? index + 1 : ''}
              </option>
            )
          })}
        </select>
      </label>
    </div>
  )
}
