import { useMemo } from 'react'
import { useRootNodes, useGraphStore } from '../../state/graphStore'
import {
  audioCapabilityOptions,
  resolveAudioCapabilitySource,
  selectedAudioCapabilityKind,
} from '../../state/audioCapabilities'
import { MIC_MAX_GAIN } from '../../audio/micAnalysis'
import { partRenderForNodeType } from '../../state/partRenders'
import { useNodeDefaults } from '../../state/nodeDefaults'
import { useUploadStore } from '../../state/uploadStore'
import { selectedPhysicalBoardProfile } from '../../build/boardProfiles'
import {
  inmp441SupportedForBoardProfile,
  INMP441_NO_BOARD_MESSAGE,
  INMP441_UNSUPPORTED_MESSAGE,
} from '../../state/micPinDefaults'
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
  const options = useMemo(() => audioCapabilityOptions(rootNodes), [rootNodes])
  const selectedKind = selectedAudioCapabilityKind(rootNodes, storedSourceId)
  const selectedOption = options.find((option) => option.kind === selectedKind) ?? null
  const selected = resolveAudioCapabilitySource(rootNodes, storedSourceId)
  const selectedFqbn = useUploadStore((state) => state.selectedFqbn)
  const micIsCustomDefault = useNodeDefaults((state) => selectedFqbn in state.micOverridesByFqbn)

  const selectedProperties = selected?.node.data.properties as Record<string, unknown> | undefined
  const selectedMic = selected?.kind === 'microphone' ? selected.node : null
  const selectedMicRender = selectedMic
    ? partRenderForNodeType('MicInput', selectedProperties ?? {})
    : null
  const boardProfile = selectedMic ? selectedPhysicalBoardProfile(rootNodes) : undefined
  const micUnavailable = Boolean(selectedMic && !inmp441SupportedForBoardProfile(boardProfile))
  const micUnavailableMessage = boardProfile
    ? INMP441_UNSUPPORTED_MESSAGE
    : INMP441_NO_BOARD_MESSAGE
  const storedGain = Number(selectedProperties?.gain ?? 1)
  const gain = Number.isFinite(storedGain)
    ? Math.max(0, Math.min(MIC_MAX_GAIN, storedGain))
    : 1
  const inAppSource = selectedKind === 'decoder'
    ? 'In-app Music Player'
    : selectedKind === 'line-in'
      ? 'Computer audio input'
      : 'Computer microphone'
  const externalSource = selectedKind === 'decoder'
    ? selected ? 'Music Player on hardware' : 'Hardware Music Player not configured'
    : selectedKind === 'line-in'
      ? selected ? `${selected.label} on hardware` : 'Line input hardware not configured'
      : selected ? `${selected.label} on hardware` : 'Microphone hardware not configured'

  return (
    <div className={styles.body}>
      <label className={styles.source}>
        <span>Source</span>
        <select
          className="nodrag"
          value={selectedOption?.value ?? ''}
          aria-label="Audio source"
          onChange={(event) => updateNodeProperty(nodeId, 'sourceId', event.target.value)}
        >
          {options.map((option) => (
            <option
              key={option.kind}
              value={option.value}
            >
              {option.source ? `${option.label} - ${option.source.label}` : option.label}
            </option>
          ))}
        </select>
      </label>

      <div className={styles.sourceRoute} aria-label="Audio source routing">
        <span><b>In app</b>{inAppSource}</span>
        <span><b>External</b>{externalSource}</span>
      </div>

      {!selected && (
        <div className={styles.disabledState} role="status">
          <strong>Audio reactivity is disabled.</strong>
          <span>Choose an available source, or add one in Hardware.</span>
          <ul>
            {(selectedOption && !selectedOption.source
              ? [selectedOption]
              : options.filter((option) => !option.source)
            ).map((option) => (
              <li key={option.kind}><b>{option.label}</b><span>{option.unavailableHint}</span></li>
            ))}
          </ul>
        </div>
      )}

      {selectedMic && (
        <div className={styles.microphone} aria-label={`${selected?.label ?? 'Microphone'} controls`}>
          {micUnavailable && (
            <div className={styles.unavailable} role="status">{micUnavailableMessage}</div>
          )}
          {selectedMicRender && (
            <img
              className={styles.part}
              src={selectedMicRender.src}
              alt={selectedMicRender.label}
              draggable={false}
            />
          )}
          <div className={styles.sectionLabel}>Microphone levels</div>
          <label className={styles.control}>
            <span>Gain</span>
            <input
              className="nodrag"
              type="range"
              min={0}
              max={MIC_MAX_GAIN}
              step={0.1}
              disabled={micUnavailable}
              value={gain}
              aria-label="Microphone gain"
              onChange={(event) => updateNodeProperty(selectedMic.id, 'gain', Number(event.target.value))}
            />
            <output>{Number(gain.toFixed(1))}</output>
          </label>
          <label className={styles.control}>
            <span>Serial debug</span>
            <input
              className="nodrag"
              type="checkbox"
              disabled={micUnavailable}
              checked={selectedProperties?.serialDebug === true}
              aria-label="Microphone serial debug"
              onChange={(event) => updateNodeProperty(selectedMic.id, 'serialDebug', event.target.checked)}
            />
          </label>
          <label
            className={styles.control}
            title="Remember these settings as the default for new Microphone hardware"
          >
            <span>Set default</span>
            <input
              className="nodrag"
              type="checkbox"
              disabled={micUnavailable}
              checked={micIsCustomDefault}
              aria-label="Set microphone default"
              onChange={(event) => {
                if (event.target.checked) {
                  useNodeDefaults.getState().setDefault('MicInput', selectedProperties ?? {}, selectedFqbn)
                } else {
                  useNodeDefaults.getState().clearDefault('MicInput', selectedFqbn)
                }
              }}
            />
          </label>
        </div>
      )}
    </div>
  )
}
