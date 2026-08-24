import { useEffect, useMemo } from 'react'
import { useRootNodes, useGraphStore } from '../../state/graphStore'
import { resolveStorageCapabilitySource, storageCapabilitySources } from '../../state/storageCapabilities'
import styles from './AudioCapabilityBody.module.css'

interface Props { nodeId: string; sourceId: unknown }

export default function StorageCapabilityBody({ nodeId, sourceId }: Props) {
  const rootNodes = useRootNodes()
  const updateNodeProperty = useGraphStore((state) => state.updateNodeProperty)
  const storedSourceId = useGraphStore((state) => {
    const node = state.nodes.find((entry) => entry.id === nodeId)
    return node ? (node.data.properties as Record<string, unknown>).sourceId : sourceId
  })
  const sources = useMemo(() => storageCapabilitySources(rootNodes), [rootNodes])
  const selected = resolveStorageCapabilitySource(rootNodes, storedSourceId)
  const savedId = typeof storedSourceId === 'string' ? storedSourceId : ''

  useEffect(() => {
    if (sources.length === 1 && savedId !== sources[0].id) {
      updateNodeProperty(nodeId, 'sourceId', sources[0].id)
    }
  }, [nodeId, savedId, sources, updateNodeProperty])

  if (sources.length === 0) {
    return (
      <div className={styles.empty} role="status">
        <strong>No storage attached</strong>
        <span>Add a board or SD card in Hardware.</span>
      </div>
    )
  }

  return (
    <label className={styles.source}>
      <span>Provider</span>
      <select
        className="nodrag"
        value={selected?.id ?? ''}
        aria-label="Storage provider"
        onChange={(event) => updateNodeProperty(nodeId, 'sourceId', event.target.value)}
      >
        {!selected && <option value="">Choose a provider</option>}
        {sources.map((source) => <option key={source.id} value={source.id}>{source.label}</option>)}
      </select>
    </label>
  )
}
