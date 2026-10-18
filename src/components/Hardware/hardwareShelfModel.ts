// The Hardware workspace's parts shelf: every part it offers, grouped by
// shelf, with whether the board can take one more and why not.
import { assignHardwarePartPins } from '../../build/pins/i2cPinAssignment'
import { assignPartPins } from '../../build/parts/partPinAssignment'
import { partById, partRenderSrc } from '../../build/parts/partCatalogue'
import { partRenderForNodeType } from '../../build/parts/partRenders'
import { partOptionProperty, partOptionsFor } from '../../build/parts/partOptions'
import { LED_OUTPUT_FORM_LABELS } from '../../state/output/ledOutputForm'
import type { HardwareShelfItem, HardwareShelfCategory } from './HardwarePartsShelf'
import {
  type FixturePartEntry, type InputPartEntry, fixturePinRequests, FIXTURE_PARTS, INPUT_PARTS, LED_OUTPUT_ENTRIES,
  LED_OUTPUT_NODE_TYPE,
} from './hardwarePartCatalog'
import type { StudioNode } from '../../state/graphStore'
import type { PhysicalBoardProfile } from '../../build/boards/boardProfiles'

const AUDIO_INPUT_TYPES = new Set(['MicInput', 'LineInput'])

// Ordered browsing groups. Keep the small, single-purpose shelves flat.
const SHELF_SUBCATEGORIES: Record<string, readonly { label: string; nodeTypes: readonly string[] }[]> = {
  inputs: [
    { label: 'Buttons & touch', nodeTypes: ['ButtonInput', 'ButtonBank', 'TouchButtonInput', 'TouchPadInput', 'KeypadInput'] },
    { label: 'Knobs & joysticks', nodeTypes: ['PotInput', 'EncoderInput', 'JoystickInput'] },
    { label: 'Remote receivers', nodeTypes: ['IRRemoteInput'] },
    { label: 'Motion & distance', nodeTypes: ['MotionInput', 'PresenceInput', 'DistanceInput', 'MotionVectorInput'] },
    { label: 'Light & environment', nodeTypes: ['LightInput', 'EnvironmentInput', 'TemperatureInput'] },
    { label: 'Power monitoring', nodeTypes: ['PowerMonitorInput'] },
    { label: 'Clocks', nodeTypes: ['RTCInput'] },
  ],
  audio: [
    { label: 'Audio Inputs', nodeTypes: [...AUDIO_INPUT_TYPES] },
    { label: 'Audio Outputs', nodeTypes: ['Amplifier', 'PowerAmplifier', 'DFPlayerOutput', 'BuzzerOutput'] },
  ],
  displays: [
    { label: 'Segment displays', nodeTypes: ['SegmentDisplay'] },
    { label: 'OLED displays', nodeTypes: ['InfoDisplay'] },
    { label: 'TFT & touch displays', nodeTypes: ['TransportDisplay'] },
  ],
  power: [
    { label: 'Batteries', nodeTypes: ['BatteryPack', 'BatteryModule'] },
    { label: 'Power Conversion', nodeTypes: ['PowerConverter', 'PdTriggerSource'] },
    { label: 'Switching Power', nodeTypes: ['RelayOutput', 'PowerSwitchOutput', 'PwmDriverOutput', 'DarlingtonDriverOutput'] },
  ],
}

export interface HardwareShelfInputs {
  nodes: StudioNode[]
  selectedFqbn: string
  boardProfile: PhysicalBoardProfile
  nextLedPin: number | null
  hasPartOfType: (nodeType: string) => boolean
  inputPartBlocker: (entry: InputPartEntry) => string | null
  addInputPart: (entry: InputPartEntry) => void
  addFixturePart: (entry: FixturePartEntry, moduleId?: string) => void
  addLedOutput: (entry: (typeof LED_OUTPUT_ENTRIES)[number]) => void
}

/** The shelf for this bench, rebuilt on every render from what is already on it. */
export function hardwareShelfCategories({
  nodes, selectedFqbn, boardProfile, nextLedPin, hasPartOfType, inputPartBlocker, addInputPart,
  addFixturePart, addLedOutput,
}: HardwareShelfInputs): HardwareShelfCategory[] {
  /*
   * The Add Hardware menu, as categories of exact modules.
   *
   * Every leaf names one module, because that is the thing you put on the
   * bench: "Amplifier" then a dropdown asked the same question twice and let
   * the generic answer stand, which mattered once the PAM8403 arrived — it is
   * an amplifier that cannot take I2S, so "an amplifier" is no longer enough
   * to know how the sound gets out.
   *
   * The module leaves are read out of PART_OPTIONS rather than restated here,
   * so a part gaining an option gains a menu entry and the two cannot drift.
   */
  const moduleItems = (
    nodeType: string,
    fixture: FixturePartEntry | undefined,
  ): HardwareShelfItem[] => {
    if (!fixture) return []
    const blocked = Boolean(fixture.singleton && hasPartOfType(fixture.nodeType))
    return partOptionsFor(nodeType).map((option) => {
      const candidateFunctions = nodeType === 'BatteryModule'
        ? Object.keys(partById(option.id)?.batteryModule ?? {}).filter((key) => ['protection', 'balance', 'charger', 'output'].includes(key))
        : []
      const usedFunctions = nodeType === 'BatteryModule'
        ? new Set(nodes.filter((node) => node.data.nodeType === 'BatteryModule').flatMap((node) =>
            Object.keys(partById(String(node.data.properties.partId ?? ''))?.batteryModule ?? {})
              .filter((key) => ['protection', 'balance', 'charger', 'output'].includes(key))))
        : new Set<string>()
      const functionBlocked = candidateFunctions.find((name) => usedFunctions.has(name))
      const pinRequests = fixturePinRequests(nodeType, option.id) ?? fixture.pinRequests
      const assigned = !blocked
        ? assignHardwarePartPins(boardProfile, selectedFqbn, nodes, pinRequests ?? [], nodeType, { [partOptionProperty(nodeType) ?? 'partId']: option.id })
        : { ok: true as const }
      const pinBlocked = assigned.ok ? null : assigned.reason
      const boardBlocked = nodeType === 'DFPlayerOutput' && selectedFqbn && !selectedFqbn.startsWith('esp32:')
        ? 'DFPlayer Mini firmware currently requires an ESP32-family board'
        : null
      return {
        key: `${nodeType}:${option.id}`,
        nodeType,
        label: option.label,
        hint: option.summary ?? fixture.hint,
        renderSrc: partRenderSrc(option.id),
        visual: option.id,
        disabled: blocked || pinBlocked !== null || boardBlocked !== null || Boolean(functionBlocked),
        disabledReason: blocked
          ? `One ${fixture.label.toLowerCase()} per board`
          : functionBlocked ? `Bench already has ${functionBlocked}` : boardBlocked ?? pinBlocked,
        onSelect: () => addFixturePart(fixture, option.id),
      }
    })
  }

  const sdCardFixture = FIXTURE_PARTS.find((entry) => entry.nodeType === 'SDCard')
  const amplifierFixture = FIXTURE_PARTS.find((entry) => entry.nodeType === 'Amplifier')
  const powerAmplifierFixture = FIXTURE_PARTS.find((entry) => entry.nodeType === 'PowerAmplifier')
  const segmentDisplayFixture = FIXTURE_PARTS.find((entry) => entry.nodeType === 'SegmentDisplay')
  const infoDisplayFixture = FIXTURE_PARTS.find((entry) => entry.nodeType === 'InfoDisplay')
  const transportDisplayFixture = FIXTURE_PARTS.find((entry) => entry.nodeType === 'TransportDisplay')
  const stereoVuFixture = FIXTURE_PARTS.find((entry) => entry.nodeType === 'StereoVuMeter')
  const relayFixture = FIXTURE_PARTS.find((entry) => entry.nodeType === 'RelayOutput')
  const powerSwitchFixture = FIXTURE_PARTS.find((entry) => entry.nodeType === 'PowerSwitchOutput')
  const buzzerFixture = FIXTURE_PARTS.find((entry) => entry.nodeType === 'BuzzerOutput')
  const coolingFanFixture = FIXTURE_PARTS.find((entry) => entry.nodeType === 'CoolingFanOutput')
  const dfPlayerFixture = FIXTURE_PARTS.find((entry) => entry.nodeType === 'DFPlayerOutput')
  const pwmDriverFixture = FIXTURE_PARTS.find((entry) => entry.nodeType === 'PwmDriverOutput')
  const darlingtonFixture = FIXTURE_PARTS.find((entry) => entry.nodeType === 'DarlingtonDriverOutput')
  const ethernetFixture = FIXTURE_PARTS.find((entry) => entry.nodeType === 'EthernetModule')
  const powerConverterFixture = FIXTURE_PARTS.find((entry) => entry.nodeType === 'PowerConverter')
  const pdTriggerFixture = FIXTURE_PARTS.find((entry) => entry.nodeType === 'PdTriggerSource')
  const batteryPackFixture = FIXTURE_PARTS.find((entry) => entry.nodeType === 'BatteryPack')
  const batteryModuleFixture = FIXTURE_PARTS.find((entry) => entry.nodeType === 'BatteryModule')
  const stereoVuBlocker = stereoVuFixture
    ? stereoVuFixture.singleton && hasPartOfType(stereoVuFixture.nodeType)
      ? 'One stereo VU meter per board'
      : (() => {
          const assigned = assignPartPins(
            boardProfile,
            selectedFqbn,
            nodes,
            stereoVuFixture.pinRequests ?? [],
          )
          return assigned.ok ? null : assigned.reason
        })()
    : 'Stereo VU Meter is unavailable'

  // Same wording as every other part, so a full board reads as full on the
  // LED rows too rather than as a fault.
  const ledPinBlocker = (() => {
    if (nextLedPin !== null) return null
    const assigned = assignPartPins(boardProfile, selectedFqbn, nodes, [{ key: 'dataPin' }])
    return assigned.ok ? 'No free GPIO on this board' : assigned.reason
  })()

  const inputItems: HardwareShelfItem[] = INPUT_PARTS.map((entry) => {
    const blocker = inputPartBlocker(entry)
    return {
      key: entry.partId,
      nodeType: entry.nodeType,
      label: entry.label,
      hint: entry.hint,
      renderSrc: partRenderForNodeType(entry.nodeType, entry.properties ?? {})?.src,
      visual: entry.partId,
      disabled: blocker !== null,
      disabledReason: blocker,
      onSelect: () => addInputPart(entry),
    }
  })

  const shelfCategories: HardwareShelfCategory[] = [
    {
      id: 'inputs',
      label: 'Inputs',
      hint: 'Controls and sensors that feed the graph',
      items: inputItems.filter((item) => !AUDIO_INPUT_TYPES.has(item.nodeType)),
    },
    {
      id: 'storage',
      label: 'Storage',
      hint: 'Where a music-synced show lives',
      items: moduleItems('SDCard', sdCardFixture),
    },
    {
      id: 'network',
      label: 'Network',
      hint: 'A wired link for Art-Net and NTP',
      items: moduleItems('EthernetModule', ethernetFixture),
    },
    {
      id: 'audio',
      label: 'Audio',
      hint: 'Microphones, line inputs, amplifiers and players',
      items: [
        ...inputItems.filter((item) => AUDIO_INPUT_TYPES.has(item.nodeType)),
        ...moduleItems('Amplifier', amplifierFixture),
        ...moduleItems('PowerAmplifier', powerAmplifierFixture),
        ...moduleItems('DFPlayerOutput', dfPlayerFixture),
        ...moduleItems('BuzzerOutput', buzzerFixture),
      ],
    },
    {
      id: 'displays',
      label: 'Displays',
      hint: 'Screens that show what the graph is doing',
      items: [
        ...moduleItems('SegmentDisplay', segmentDisplayFixture),
        ...moduleItems('InfoDisplay', infoDisplayFixture),
        ...moduleItems('TransportDisplay', transportDisplayFixture),
        // No "Screen design" entry: a screen is drawn on a panel, so it is
        // added from the panel rather than taken off a shelf of physical
        // parts it was never one of.
      ],
    },
    {
      id: 'power',
      label: 'Power',
      hint: 'Batteries, power conversion and load switching',
      items: [
        ...moduleItems('BatteryPack', batteryPackFixture),
        ...moduleItems('BatteryModule', batteryModuleFixture),
        ...moduleItems('PowerConverter', powerConverterFixture),
        ...moduleItems('PdTriggerSource', pdTriggerFixture),
        ...moduleItems('RelayOutput', relayFixture),
        ...moduleItems('PowerSwitchOutput', powerSwitchFixture),
        ...moduleItems('PwmDriverOutput', pwmDriverFixture),
        ...moduleItems('DarlingtonDriverOutput', darlingtonFixture),
      ],
    },
    {
      id: 'cooling',
      label: 'Cooling',
      hint: 'Fans that cool an enclosure and report speed',
      items: moduleItems('CoolingFanOutput', coolingFanFixture),
    },
    {
      id: 'led-outputs',
      label: 'LED outputs',
      hint: 'What the patterns light up',
      items: [
        ...(stereoVuFixture ? [{
          key: stereoVuFixture.partId,
          nodeType: stereoVuFixture.nodeType,
          label: stereoVuFixture.label,
          hint: stereoVuFixture.hint,
          visual: 'stereo-vu',
          disabled: stereoVuBlocker !== null,
          disabledReason: stereoVuBlocker,
          onSelect: () => addFixturePart(stereoVuFixture),
        }] : []),
        ...LED_OUTPUT_ENTRIES.map((entry) => {
        const needsDataPin = entry.form !== 'hub75'
        const blocked = needsDataPin && nextLedPin === null
        return {
          key: entry.form,
          nodeType: LED_OUTPUT_NODE_TYPE,
          label: LED_OUTPUT_FORM_LABELS[entry.form],
          hint: needsDataPin ? `${entry.hint} on pin ${nextLedPin}` : entry.hint,
          visual: entry.form,
          disabled: blocked,
          disabledReason: blocked ? ledPinBlocker : null,
          onSelect: () => addLedOutput(entry),
        }
        }),
      ],
    },
  ].filter((category) => category.items.length > 0)

  return shelfCategories.map((category) => {
    const groups = SHELF_SUBCATEGORIES[category.id]
    if (!groups) return category
    const groupedTypes = new Set(groups.flatMap((group) => group.nodeTypes))
    return {
      ...category,
      items: [
        ...groups.flatMap((group) => group.nodeTypes.flatMap((nodeType) => category.items
          .filter((item) => item.nodeType === nodeType)
          .map((item) => ({ ...item, subcategory: group.label })))),
        // New catalogue types stay reachable before a browsing group is assigned.
        ...category.items.filter((item) => !groupedTypes.has(item.nodeType))
          .map((item) => ({ ...item, subcategory: 'Other parts' })),
      ],
    }
  })
}
