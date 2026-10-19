import { useState } from 'react'
import { rootGraphNodes, useGraphStore } from '../../../state/graphStore'
import { useUploadStore } from '../../../state/upload/uploadStore'
import { selectedPhysicalBoardProfile } from '../../../build/boards/boardProfiles'
import { splitAcrossPinsForGraph } from '../../../build/pins/splitAcrossPins'
import {
  LANE_PIN_KEY_PREFIX,
  offeredDataLaneCounts,
  outputCanSplitLanes,
  requestedDataLanes,
  storedLanePins,
} from '../../../state/output/dataLanes'
import BoardPinPicker from '../../Hardware/BoardPinPicker'
import styles from './BoardNodeBody.module.css'

interface Props {
  nodeId: string
  nodeLabel: string
  properties: Record<string, unknown>
}

/**
 * An LED output's data lanes: how many equal lanes its chain is split into,
 * and the pin of each lane after the first (src/state/output/dataLanes.ts).
 *
 * Choosing a count picks free output pins for the new lanes the way adding a
 * part does, so a split is never left half-wired; each pin can then be moved.
 */
export default function DataLanesSection({ nodeId, nodeLabel, properties }: Props) {
  const updateNodeProperties = useGraphStore((s) => s.updateNodeProperties)
  const selectedFqbn = useUploadStore((state) => state.selectedFqbn)
  const [reason, setReason] = useState('')
  const lanes = requestedDataLanes(properties)
  const offered = offeredDataLaneCounts(properties)
  if (!outputCanSplitLanes(properties) && lanes <= 1) return null
  if (offered.length <= 1 && lanes <= 1) return null
  const counts = offered.includes(lanes) ? offered : [...offered, lanes].sort((a, b) => a - b)
  const pins = storedLanePins(properties)

  const choose = (next: number) => {
    setReason('')
    if (next <= 1) {
      updateNodeProperties(nodeId, { dataLanes: 1, lanePins: [] })
      return
    }
    const nodes = rootGraphNodes(useGraphStore.getState())
    const split = splitAcrossPinsForGraph(selectedPhysicalBoardProfile(nodes), selectedFqbn, nodes, nodeId, { lanes: next })
    if (!split.ok) {
      setReason(split.reason)
      return
    }
    updateNodeProperties(nodeId, { dataLanes: split.lanes, lanePins: split.lanePins })
  }

  return (
    <div className={styles.settingsSection} aria-label={`${nodeLabel} data lanes`}>
      <div className={styles.settingsHeader}>
        <strong>Data lanes</strong>
        <span>Split the chain across pins so its lanes are sent at once. Experimental.</span>
      </div>
      <label className={styles.settingField}>
        <span>Lanes</span>
        <select
          className={`nodrag ${styles.picker}`}
          value={String(lanes)}
          aria-label={`${nodeLabel} data lanes`}
          onChange={(event) => choose(Number(event.target.value))}
        >
          {counts.map((count) => (
            <option key={count} value={count}>
              {count === 1 ? '1 (one data pin)' : offered.includes(count) ? `${count} lanes` : `${count} lanes (not an equal split)`}
            </option>
          ))}
        </select>
      </label>
      {reason && <p className={styles.bankEmpty} role="status">{reason}</p>}
      {Array.from({ length: Math.max(0, lanes - 1) }, (_, index) => {
        const label = `Lane ${index + 2} data pin`
        const pin = pins[index]
        return (
          <label key={index} className={styles.settingField}>
            <span>{label}</span>
            <BoardPinPicker
              nodeId={nodeId}
              nodeType="MatrixOutput"
              propertyKey={`${LANE_PIN_KEY_PREFIX}${index}`}
              properties={properties}
              value={pin ?? -1}
              ariaLabel={`${nodeLabel} ${label}`}
              onChange={(next) => {
                const updated = Array.from({ length: lanes - 1 }, (_, i) => (i === index ? next : pins[i] ?? -1))
                updateNodeProperties(nodeId, { lanePins: updated })
              }}
            />
          </label>
        )
      })}
    </div>
  )
}
