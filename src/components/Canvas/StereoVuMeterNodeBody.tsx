import { useMemo } from 'react'
import { rootGraphNodes, useGraphStore, useRootNodes } from '../../state/graphStore'
import { LED_OUTPUT_FORM_LABELS, outputForm } from '../../state/ledOutputForm'
import styles from './StereoVuMeterNodeBody.module.css'

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

  return (
    <div className={styles.body}>
      <div className={styles.rails} aria-label="Stereo VU Meter preview placeholder">
        <span><i /></span>
        <strong>{mode}</strong>
        <span><i /></span>
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
