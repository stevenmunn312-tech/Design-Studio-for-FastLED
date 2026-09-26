// What the Hardware workspace does when a part is added to or removed from
// the bench: the graph node it creates, the pins it claims, the wires it
// connects and the status line it reports.
import { NODE_LIBRARY } from '../../state/nodeLibrary'
import { resolveDefaultProperties } from '../../state/nodeDefaults'
import { assignPartPins } from '../../state/partPinAssignment'
import { withAssignedPins } from '../../state/pinRetarget'
import { boardI2cDefault } from '../../build/boardI2cDefaults'
import { micModuleFor } from '../../state/micModules'
import { lightSensorTransport } from '../../state/lightSensor'
import { micSupportedForBoard, micUnsupportedMessage } from '../../state/micPinDefaults'
import type { StudioNode } from '../../state/graphStore'
import type { PhysicalBoardProfile } from '../../build/boardProfiles'
import { sdSpiPinsForBoard } from '../../state/sdPinDefaults'
import { displayHasTouch } from '../../state/partCatalogue'
import { partOptionProperty } from '../../state/partOptions'
import { isHardwareManagedSignalNodeType } from '../../state/hardware'
import { outputForm, LED_OUTPUT_FORM_LABELS } from '../../state/ledOutputForm'
import { automaticStereoVuLedCount, VU_LED_COUNT_CUSTOM_KEY } from '../../state/stereoVuSizing'
import { relayInputs } from '../../state/relayModule'
import { defaultSourceVoltageFor } from '../../state/powerConverter'
import {
  type FixturePartEntry, type InputPartEntry, fixturePinRequests, LED_OUTPUT_ENTRIES, LED_OUTPUT_NODE_TYPE, MIC_NODE_TYPE,
} from './hardwarePartCatalog'
import type { Connection } from '@xyflow/react'
import type { NodeDefinition, StatusLevel } from '../../types'
import type { PlacementBox } from './floatingPlacement'
import type { BenchParts } from './useBenchParts'

export interface InputPartActionInputs {
  addNode: (node: StudioNode, centreOnDrop?: boolean) => void
  nodes: StudioNode[]
  viewCenter: { x: number; y: number }
  setStatus: (text: string, level?: StatusLevel) => void
  selectedFqbn: string
  inputParts: BenchParts['inputParts']
  boardProfile: PhysicalBoardProfile
  hasPartOfType: (nodeType: string) => boolean
}

export function inputPartActions({
  addNode, nodes, viewCenter, setStatus, selectedFqbn, inputParts, boardProfile, hasPartOfType,
}: InputPartActionInputs) {
  /*
   * Why an entry cannot be used right now, or null when it can. Drives both the
   * disabled state and the line under it, so the menu explains itself rather
   * than just going grey.
   */
  const inputPartBlocker = (entry: InputPartEntry): string | null => {
    if (entry.singleton && hasPartOfType(entry.nodeType)) return `One ${entry.label.toLowerCase()} per board`
    if (entry.fqbnPrefix && !selectedFqbn.startsWith(entry.fqbnPrefix)) {
      return 'PCM1802 line-in capture currently requires an ESP32-S3 board'
    }
    // A microphone the app captures itself is written for one chip; say so on
    // the shelf rather than add it and refuse it in Graph Health a moment later.
    if (entry.nodeType === MIC_NODE_TYPE && selectedFqbn
      && micModuleFor(entry.properties?.partId).capture
      && !micSupportedForBoard(selectedFqbn, entry.properties?.partId)) {
      return micUnsupportedMessage(entry.properties?.partId)
    }
    if (entry.pinRequests.length === 0) return null
    const assigned = assignPartPins(boardProfile, selectedFqbn, nodes, entry.pinRequests)
    return assigned.ok ? null : assigned.reason
  }

  /*
   * One creator for every signal input part. The node is the same object the graph
   * would have shown either way; what the hardware view adds is that it arrives
   * already carrying pins this board actually exposes.
   */
  const addInputPart = (entry: InputPartEntry) => {
    const definition = NODE_LIBRARY.find((candidate) => candidate.type === entry.nodeType)
    if (!definition || inputPartBlocker(entry)) return
    const assigned = entry.pinRequests.length
      ? assignPartPins(boardProfile, selectedFqbn, nodes, entry.pinRequests)
      : { ok: true as const, pins: {} }
    if (!assigned.ok) return
    const usesBoardI2c = entry.nodeType === 'RTCInput'
      || (entry.nodeType === 'LightInput' && lightSensorTransport(entry.properties?.partId) === 'i2c')
    const rtcDefaults = usesBoardI2c ? boardI2cDefault(boardProfile?.id) : undefined
    const assignedPins = rtcDefaults
      ? { ...assigned.pins, sdaPin: rtcDefaults.sda.arduinoPin, sclPin: rtcDefaults.scl.arduinoPin }
      : assigned.pins

    const nodeId = `${entry.nodeType}-${Date.now()}-${Math.round(Math.random() * 1e6)}`
    addNode({
      id: nodeId,
      type: 'studioNode',
      position: {
        x: viewCenter.x - 180,
        y: viewCenter.y - 120 + (inputParts.length * 60),
      },
      hidden: [MIC_NODE_TYPE, 'LineInput'].includes(entry.nodeType),
      selectable: ![MIC_NODE_TYPE, 'LineInput'].includes(entry.nodeType),
      draggable: ![MIC_NODE_TYPE, 'LineInput'].includes(entry.nodeType),
      data: {
        label: definition.label,
        nodeType: definition.type,
        category: definition.category,
        // Stamped with what the app chose, so a later board change can tell
        // an untouched pin from one the user has since wired by hand.
        properties: withAssignedPins(
          {
            ...resolveDefaultProperties(definition.type, definition.defaultProperties, boardProfile),
            ...(entry.properties ?? {}),
          },
          assignedPins,
          boardProfile?.id ?? selectedFqbn,
        ),
        inputs: definition.inputs,
        outputs: definition.outputs,
      },
    } as never)
    const pins = Object.values(assignedPins)
    setStatus(
      pins.length
        ? `Added ${entry.label} on pin${pins.length > 1 ? 's' : ''} ${pins.join(', ')}`
        : `Added ${entry.label} and its graph node`,
      'success',
    )
  }

  return { inputPartBlocker, addInputPart }
}

export interface BenchPartActionInputs {
  addNode: (node: StudioNode, centreOnDrop?: boolean) => void
  connectRoot: (connection: Connection) => void
  removeNodeCompletely: (id: string) => void
  nodes: StudioNode[]
  viewCenter: { x: number; y: number }
  setStatus: (text: string, level?: StatusLevel) => void
  inspectorNodeId: string | null
  setInspectorNodeId: (nodeId: string | null) => void
  setItemMenu: (menu: { anchor: PlacementBox; kind: string; mode: 'actions' | 'settings' } | null) => void
  selectedFqbn: string
  inputParts: BenchParts['inputParts']
  ledOutputs: BenchParts['ledOutputs']
  boardProfile: PhysicalBoardProfile
  nextLedPin: number | null
  fixtureParts: BenchParts['fixtureParts']
  hasPartOfType: (nodeType: string) => boolean
  ledOutputDefinition: NodeDefinition | undefined
}

export function benchPartActions({
  addNode, connectRoot, removeNodeCompletely, nodes, viewCenter, setStatus, inspectorNodeId,
  setInspectorNodeId, setItemMenu, selectedFqbn, inputParts, ledOutputs, boardProfile, nextLedPin,
  fixtureParts, hasPartOfType, ledOutputDefinition,
}: BenchPartActionInputs) {
  /*
   * A fixture is created hidden: it is a real part with real settings, but it
   * carries no signal, so nothing should draw it on the signal canvas. Its
   * I2S pins come from the board profile when that board names them, the same
   * precedence the microphone already follows.
   */
  /*
   * `moduleId` is the exact module the menu entry named, e.g. the PAM8403
   * rather than "an amplifier". It is stamped onto the node at creation, which
   * is now the only moment a module is chosen — the identity panel reports what
   * the part is and no longer offers to change it.
   */
  const addFixturePart = (entry: FixturePartEntry, moduleId?: string) => {
    const definition = NODE_LIBRARY.find((candidate) => candidate.type === entry.nodeType)
    if (!definition || (entry.singleton && hasPartOfType(entry.nodeType))) return
    const moduleProperty = partOptionProperty(entry.nodeType)
    const amp = boardProfile?.peripheralPins?.max98357
    const sdSpiPins = entry.nodeType === 'SDCard' ? sdSpiPinsForBoard(boardProfile, selectedFqbn) : null
    // A part the board profile does not place picks free GPIO the same way an
    // input part does, so a second display lands on its own pins rather than
    // silently colliding with the first.
    const pinRequests = fixturePinRequests(entry.nodeType, moduleId) ?? entry.pinRequests
    const requested = pinRequests?.length
      ? assignPartPins(boardProfile, selectedFqbn, nodes, pinRequests)
      : null
    if (requested && !requested.ok) {
      setStatus(requested.reason, 'error')
      return
    }
    const profilePins = sdSpiPins
      ? {
          sdCsPin: sdSpiPins.cs,
          sdSckPin: sdSpiPins.sck,
          sdMisoPin: sdSpiPins.miso,
          sdMosiPin: sdSpiPins.mosi,
        }
      : requested
        ? requested.pins
        : entry.profilePins && amp
          ? Object.fromEntries(
            Object.entries(entry.profilePins).map(([key, field]) => [key, amp[field]]),
          )
          : {}
    // A fixture that carries signal has a graph half to show; one that does not
    // stays hidden, which is the whole distinction the two sets encode.
    const onCanvas = isHardwareManagedSignalNodeType(entry.nodeType)
    const nodeId = `${entry.nodeType}-${Date.now()}-${Math.round(Math.random() * 1e6)}`
    const targetOutputId = entry.nodeType === 'StereoVuMeter'
      ? nodes.find((node) => node.data.nodeType === LED_OUTPUT_NODE_TYPE
          && ['matrix', 'hub75'].includes(outputForm(node.data.properties)))?.id ?? ''
      : undefined
    const vuSizing = targetOutputId !== undefined
      ? {
          ledCount: automaticStereoVuLedCount(nodes, targetOutputId),
          [VU_LED_COUNT_CUSTOM_KEY]: false,
        }
      : {}
    addNode({
      id: nodeId,
      type: 'studioNode',
      position: { x: viewCenter.x, y: viewCenter.y },
      hidden: !onCanvas,
      selectable: onCanvas,
      draggable: onCanvas,
      data: {
        label: definition.label,
        nodeType: definition.type,
        category: definition.category,
        properties: {
          ...withAssignedPins(
            resolveDefaultProperties(definition.type, definition.defaultProperties, boardProfile),
            profilePins,
            boardProfile?.id ?? selectedFqbn,
          ),
          ...(moduleProperty && moduleId ? { [moduleProperty]: moduleId } : {}),
          ...(entry.nodeType === 'PowerConverter' && moduleId
            ? { sourceVoltage: defaultSourceVoltageFor(moduleId) }
            : {}),
          ...(targetOutputId !== undefined ? { targetOutputId } : {}),
          ...vuSizing,
        },
        inputs: entry.nodeType === 'RelayOutput' ? relayInputs(moduleId) : definition.inputs,
        outputs: definition.outputs,
      },
    } as never)
    /*
     * A touch panel is two chips, so it arrives as two nodes.
     *
     * Both from one deliberate action — taking the module off the shelf —
     * rather than one appearing later because a button was pressed. The link
     * between them is set here and never typed, since they are one part.
     */
    if (isHardwareManagedSignalNodeType(entry.nodeType)
      && displayHasTouch(moduleId ?? '')) {
      const touchDefinition = NODE_LIBRARY.find((candidate) => candidate.type === 'TouchInput')
      if (touchDefinition) {
        addNode({
          id: `TouchInput-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
          type: 'studioNode',
          position: { x: viewCenter.x + 260, y: viewCenter.y },
          data: {
            label: touchDefinition.label,
            nodeType: touchDefinition.type,
            category: touchDefinition.category,
            properties: { ...touchDefinition.defaultProperties, panelId: nodeId },
            inputs: touchDefinition.inputs,
            outputs: touchDefinition.outputs,
          },
        } as never)
      }
    }
    const audioNodes = nodes.filter((node) => node.data.nodeType === 'Audio')
    if (entry.nodeType === 'StereoVuMeter' && audioNodes.length === 1) {
      connectRoot({
        source: audioNodes[0].id,
        sourceHandle: 'audio',
        target: nodeId,
        targetHandle: 'audio',
      })
    }
    setStatus(
      entry.nodeType === 'StereoVuMeter' && audioNodes.length === 1
        ? `Added ${entry.label} and connected Audio`
        : `Added ${entry.label}`,
      'success',
    )
  }

  // `kind` is the graph node id for every part now, input or output.
  const removeHardwareItem = (kind: string) => {
    if (inspectorNodeId === kind) setInspectorNodeId(null)
    const fixture = fixtureParts.find((part) => part.node.id === kind)
    if (fixture) {
      removeNodeCompletely(fixture.node.id)
      setStatus(`Removed ${fixture.entry.label}`, 'info')
      setItemMenu(null)
      return
    }
    const input = inputParts.find((part) => part.node.id === kind)
    if (input) {
      removeNodeCompletely(input.node.id)
      setStatus(`Removed ${input.entry.label}`, 'info')
    } else {
      const output = ledOutputs.find((entry) => entry.node.id === kind)
      if (!output) return
      removeNodeCompletely(output.node.id)
      setStatus(`Removed ${output.label}`, 'info')
    }
    setItemMenu(null)
  }

  /*
   * One creator for every form. The node is the same either way; the form
   * and the size that suits it are what the menu entry chose.
   *
   * A HUB75 panel is not on the LED data pin — it has its own ribbon, and its
   * pins come from the node's defaults — so it does not consume one.
   */
  const addLedOutput = (entry: (typeof LED_OUTPUT_ENTRIES)[number]) => {
    if (!ledOutputDefinition) return
    const needsDataPin = entry.form !== 'hub75'
    if (needsDataPin && nextLedPin === null) return
    const nodeId = `${LED_OUTPUT_NODE_TYPE}-${Date.now()}-${Math.round(Math.random() * 1e6)}`
    addNode({
      id: nodeId,
      type: 'studioNode',
      position: {
        x: viewCenter.x + 120,
        y: viewCenter.y - 40 + (ledOutputs.length * 60),
      },
      data: {
        label: LED_OUTPUT_FORM_LABELS[entry.form],
        nodeType: ledOutputDefinition.type,
        category: ledOutputDefinition.category,
        properties: {
          ...resolveDefaultProperties(ledOutputDefinition.type, ledOutputDefinition.defaultProperties),
          form: entry.form,
          ...entry.properties,
          ...(needsDataPin ? { dataPin: nextLedPin } : {}),
        },
        inputs: ledOutputDefinition.inputs,
        outputs: ledOutputDefinition.outputs,
      },
    } as never)
    setStatus(
      needsDataPin
        ? `Added ${LED_OUTPUT_FORM_LABELS[entry.form]} on pin ${nextLedPin}`
        : `Added ${LED_OUTPUT_FORM_LABELS[entry.form]} on its own signal ribbon`,
      'success',
    )
  }

  return { addFixturePart, removeHardwareItem, addLedOutput }
}
