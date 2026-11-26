import { useMemo } from 'react'
import { useRootEdges, useRootNodes, useGraphStore } from '../../../state/graphStore'
import { usePreviewStore } from '../../../state/previewStore'
import { resolveBuildMode } from '../../../state/upload/buildMode'
import {
  AUDIO_SOURCE_INPUT,
  AUDIO_SOURCE_LABELS,
  audioSourceSwitchFor,
  audioSwitchProblems,
  audioSwitchSummary,
} from '../../../state/audio/audioSourceSwitch'
import type { AudioCapabilityKind } from '../../../state/audio/audioCapabilities'
import {
  audioCapabilityOptions,
  resolveAudioCapabilitySource,
  selectedAudioCapabilityKind,
} from '../../../state/audio/audioCapabilities'
import { MIC_DEFAULTS, MIC_MAX_GAIN, MIC_MAX_NOISE_GATE } from '../../../audio/micAnalysis'
import { partRenderForNodeType } from '../../../build/parts/partRenders'
import { usePartCatalogueVersion } from '../../../build/parts/usePartCatalogueVersion'
import { useNodeDefaults } from '../../../state/nodeDefaults'
import { useUploadStore } from '../../../state/upload/uploadStore'
import { selectedPhysicalBoardProfile } from '../../../build/boards/boardProfiles'
import {
  micFqbnForBoardProfile,
  micSupportedForBoardProfile,
  MIC_NO_BOARD_MESSAGE,
  micUnsupportedMessage,
} from '../../../build/pins/micPinDefaults'
import styles from './AudioCapabilityBody.module.css'
import EditableRange from '../../EditableRange/EditableRange'

interface Props {
  nodeId: string
  sourceId: unknown
}

export default function AudioCapabilityBody({ nodeId, sourceId }: Props) {
  const rootNodes = useRootNodes()
  usePartCatalogueVersion()
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
  const rootEdges = useRootEdges()
  // The runtime switch, once something is wired into Source. Its list is the
  // bench's sources, which is what the board will cycle through too.
  const sourceSwitch = useMemo(() => {
    const found = audioSourceSwitchFor(rootNodes, rootEdges)
    return found?.audioNode.id === nodeId ? found : null
  }, [rootNodes, rootEdges, nodeId])
  const switchProblems = useMemo(() => {
    if (!sourceSwitch) return []
    const build = resolveBuildMode(rootNodes, rootEdges)
    const board = selectedPhysicalBoardProfile(rootNodes)
    return audioSwitchProblems(sourceSwitch, {
      buildMode: build.mode === 'player' && build.engineKind === 'performance-show' ? 'performance' : build.mode,
      fqbn: micFqbnForBoardProfile(board) ?? board?.compatibleFqbns[0],
      boardLabel: board?.label,
    })
  }, [sourceSwitch, rootNodes, rootEdges])
  // Which source the preview is listening to now, as the evaluator last said.
  const liveKind = usePreviewStore((state) => state.outputs.get(nodeId)?.activeSource) as AudioCapabilityKind | undefined
  const switching = sourceSwitch !== null && sourceSwitch.sources.length > 0

  // The capture part whose levels the body edits: the chosen one, or with a
  // switch wired, the first microphone or line input it can switch to.
  const levelSource = selected && selected.kind !== 'decoder'
    ? selected
    : switching ? sourceSwitch?.sources.find((source) => source.kind !== 'decoder') ?? null : null
  const selectedProperties = levelSource?.node.data.properties as Record<string, unknown> | undefined
  const selectedMic = levelSource?.kind === 'microphone' ? levelSource.node : null
  // Both physical inputs feed the same FastLED Processor, so they share the
  // level controls; the mic adds its part picture and saved defaults.
  const selectedInput = levelSource?.node ?? null
  const inputName = selectedMic ? 'Microphone' : 'Line input'
  const selectedMicRender = selectedMic
    ? partRenderForNodeType('MicInput', selectedProperties ?? {})
    : null
  const boardProfile = selectedMic ? selectedPhysicalBoardProfile(rootNodes) : undefined
  const micUnavailable = Boolean(selectedMic && !micSupportedForBoardProfile(boardProfile, selectedProperties?.partId))
  const micUnavailableMessage = boardProfile
    ? micUnsupportedMessage(selectedProperties?.partId)
    : MIC_NO_BOARD_MESSAGE
  const storedGain = Number(selectedProperties?.gain ?? 1)
  const gain = Number.isFinite(storedGain)
    ? Math.max(0, Math.min(MIC_MAX_GAIN, storedGain))
    : 1
  const storedNoiseGate = Number(selectedProperties?.noiseGate ?? MIC_DEFAULTS.noiseGate)
  const noiseGate = Number.isFinite(storedNoiseGate)
    ? Math.max(0, Math.min(MIC_MAX_NOISE_GATE, Math.round(storedNoiseGate)))
    : MIC_DEFAULTS.noiseGate
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
      {/* A noodle dropped on this row lands on the Source input and exposes
          it, as on any property row; NodeGraphCanvas reads these attributes. */}
      <label
        className={styles.source}
        data-property-input={`${nodeId}|${AUDIO_SOURCE_INPUT}`}
        data-property-type="float"
        title={sourceSwitch?.drive === 'position'
          ? 'Source is wired: the wire picks the source.'
          : sourceSwitch
            ? 'The source the board starts on. Each press on Source steps to the next.'
            : 'Drop a Button, IR key, Web Remote control or Encoder here to switch the source while the board runs.'}
      >
        <span>Source</span>
        <select
          className="nodrag"
          value={selectedOption?.value ?? ''}
          aria-label="Audio source"
          disabled={sourceSwitch?.drive === 'position' && switching}
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

      {switching && sourceSwitch && (
        <div className={styles.sourceRoute} role="status" aria-label="Audio source switch">
          <span><b>Switch</b>{audioSwitchSummary(sourceSwitch.sources)}</span>
          <span><b>Now</b>{liveKind ? AUDIO_SOURCE_LABELS[liveKind] : AUDIO_SOURCE_LABELS[sourceSwitch.sources[sourceSwitch.startIndex].kind]}</span>
          <span>
            <b>Control</b>
            {sourceSwitch.drive === 'press'
              ? 'Each press steps to the next source.'
              : `The number picks the source: ${sourceSwitch.sources.map((source, index) => `${index} ${AUDIO_SOURCE_LABELS[source.kind]}`).join(', ')}, wrapping.`}
          </span>
        </div>
      )}

      {switchProblems.map((problem) => (
        <div
          key={problem.message}
          className={problem.severity === 'error' ? styles.unavailable : styles.disabledState}
          role="status"
        >
          {problem.message.replace(/^Audio: /, '')}
        </div>
      ))}

      {!switching && <div className={styles.sourceRoute} aria-label="Audio source routing">
        <span><b>In app</b>{inAppSource}</span>
        <span><b>External</b>{externalSource}</span>
      </div>}

      {!switching && !selected && selectedOption && selectedKind !== 'decoder' && (
        <div className={styles.disabledState} role="status">
          <strong>Previewing with the computer’s {selectedKind === 'line-in' ? 'audio input' : 'microphone'}.</strong>
          <span>{selectedOption.unavailableHint}</span>
        </div>
      )}

      {!switching && !selected && (!selectedOption || selectedKind === 'decoder') && (
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

      {selectedInput && (
        <div className={styles.microphone} aria-label={`${levelSource?.label ?? inputName} controls`}>
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
          <div className={styles.sectionLabel}>{inputName} levels</div>
          <label className={styles.control}>
            <span>Gain</span>
            <EditableRange
              className="nodrag"
              min={0}
              max={MIC_MAX_GAIN}
              step={0.1}
              disabled={micUnavailable}
              value={gain}
              ariaLabel={`${inputName} gain`}
              onChange={(value) => updateNodeProperty(selectedInput.id, 'gain', value)}
            />
            <output>{Number(gain.toFixed(1))}</output>
          </label>
          <label
            className={styles.control}
            title="Sample level (of 32767) a sound must reach before analysis hears it. Raise it if room hiss moves the LEDs; 0 turns the gate off."
          >
            <span>Noise gate</span>
            <EditableRange
              className="nodrag"
              min={0}
              max={MIC_MAX_NOISE_GATE}
              step={50}
              disabled={micUnavailable}
              value={noiseGate}
              ariaLabel={`${inputName} noise gate`}
              onChange={(value) => updateNodeProperty(selectedInput.id, 'noiseGate', value)}
            />
            <output>{noiseGate}</output>
          </label>
          <label className={styles.control}>
            <span>Serial debug</span>
            <input
              className="nodrag"
              type="checkbox"
              disabled={micUnavailable}
              checked={selectedProperties?.serialDebug === true}
              aria-label={`${inputName} serial debug`}
              onChange={(event) => updateNodeProperty(selectedInput.id, 'serialDebug', event.target.checked)}
            />
          </label>
          {selectedMic && <label
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
          </label>}
        </div>
      )}
    </div>
  )
}
