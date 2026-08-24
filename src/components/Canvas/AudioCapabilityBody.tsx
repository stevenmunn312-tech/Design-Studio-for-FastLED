import { useEffect, useMemo } from 'react'
import { useRootNodes, useGraphStore } from '../../state/graphStore'
import { audioCapabilitySources, resolveAudioCapabilitySource } from '../../state/audioCapabilities'
import styles from './AudioCapabilityBody.module.css'

interface Props {
  nodeId: string
  sourceId: unknown
}

export default function AudioCapabilityBody({ nodeId, sourceId }: Props) {
  const rootNodes = useRootNodes()
  const updateNodeProperty = useGraphStore((state) => state.updateNodeProperty)
  const storedSourceId = useGraphStore((state) => {
    const node = state.nodes.find((entry) => entry.id === nodeId)
    return node ? (node.data.properties as Record<string, unknown>).sourceId : sourceId
  })
  const sources = useMemo(() => audioCapabilitySources(rootNodes), [rootNodes])
  const selected = resolveAudioCapabilitySource(rootNodes, storedSourceId)
  const savedId = typeof storedSourceId === 'string' ? storedSourceId : ''

  // Persist the unambiguous single-source default so adding a second source
  // later cannot silently change what an existing Audio node means.
  useEffect(() => {
    if (sources.length === 1 && savedId !== sources[0].id) {
      updateNodeProperty(nodeId, 'sourceId', sources[0].id)
    }
  }, [nodeId, savedId, sources, updateNodeProperty])

  if (sources.length === 0) {
    return (
      <div className={styles.empty} role="status">
        <strong>No audio source attached</strong>
        <span>Add a microphone, line-in ADC, or SD card player with an amplifier.</span>
      </div>
    )
  }

  return (
    <label className={styles.source}>
      <span>Source</span>
      <select
        className="nodrag"
        value={selected?.id ?? ''}
        aria-label="Audio source"
        onChange={(event) => updateNodeProperty(nodeId, 'sourceId', event.target.value)}
      >
        {!selected && <option value="">Choose a source</option>}
        {sources.map((source) => (
          <option key={source.id} value={source.id}>{source.label}</option>
        ))}
      </select>
    </label>
  )
}
