// The Hardware workspace's parts shelf: every part it offers, grouped by
// shelf, with whether the board can take one more and why not.
import { assignHardwarePartPins } from '../../build/pins/i2cPinAssignment'
import { assignPartPins } from '../../build/parts/partPinAssignment'
import { partRenderSrc } from '../../build/parts/partCatalogue'
import { partRenderForNodeType } from '../../build/parts/partRenders'
import { partOptionProperty, partOptionsFor } from '../../build/parts/partOptions'
import { LED_OUTPUT_FORM_LABELS } from '../../state/output/ledOutputForm'
import type { HardwareShelfItem, HardwareShelfCategory } from './HardwarePartsShelf'
import {
  type FixturePartEntry, type InputPartEntry, fixturePinRequests, FIXTURE_PARTS, inputPartEntries, LED_OUTPUT_ENTRIES,
  LED_OUTPUT_NODE_TYPE,
} from './hardwarePartCatalog'
import {
  BATTERY_MODULE_CHARGE_ONLY, batteryFunctions, batteryModuleCanChargeOnly, batteryModuleSpec, batteryModuleSpecFor,
} from '../../state/peripherals/battery'
import { isShelfCategory, shelfPlacement } from './shelfGrouping'
import type { StudioNode } from '../../state/graphStore'
import type { PhysicalBoardProfile } from '../../build/boards/boardProfiles'

const AUDIO_INPUT_TYPES = new Set(['MicInput', 'LineInput'])

/** The catalogue part an input entry adds; undefined for the controls that are not catalogue parts. */
function inputPartCatalogueId(entry: InputPartEntry): string | undefined {
  const key = partOptionProperty(entry.nodeType)
  const id = key ? entry.properties?.[key] : undefined
  return typeof id === 'string' ? id : undefined
}

export interface HardwareShelfInputs {
  nodes: StudioNode[]
  selectedFqbn: string
  boardProfile: PhysicalBoardProfile
  nextLedPin: number | null
  hasPartOfType: (nodeType: string) => boolean
  inputPartBlocker: (entry: InputPartEntry) => string | null
  addInputPart: (entry: InputPartEntry) => void
  addFixturePart: (entry: FixturePartEntry, moduleId?: string, extraProperties?: Record<string, unknown>) => void
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
      const usedFunctions = nodeType === 'BatteryModule'
        ? new Set<string>(nodes.filter((node) => node.data.nodeType === 'BatteryModule').flatMap((node) =>
            batteryFunctions(batteryModuleSpecFor(node.data.properties.partId, node.data.properties.use))))
        : new Set<string>()
      // A charge-and-protect board joins a pack that is already protected as
      // its charger alone, so it is offered while the charger role is free.
      const candidateSpec = nodeType === 'BatteryModule' ? batteryModuleSpec(option.id) : undefined
      const joinsAsCharger = batteryModuleCanChargeOnly(candidateSpec) && usedFunctions.has('protection')
      const candidateFunctions = batteryFunctions(joinsAsCharger
        ? batteryModuleSpecFor(option.id, BATTERY_MODULE_CHARGE_ONLY)
        : candidateSpec)
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
        partId: option.id,
        disabled: blocked || pinBlocked !== null || boardBlocked !== null || Boolean(functionBlocked),
        disabledReason: blocked
          ? `One ${fixture.label.toLowerCase()} per board`
          : functionBlocked ? `Bench already has ${functionBlocked}` : boardBlocked ?? pinBlocked,
        onSelect: () => addFixturePart(fixture, option.id, joinsAsCharger ? { use: BATTERY_MODULE_CHARGE_ONLY } : undefined),
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
  const powerSupplyFixture = FIXTURE_PARTS.find((entry) => entry.nodeType === 'PowerSupply')
  const powerConverterFixture = FIXTURE_PARTS.find((entry) => entry.nodeType === 'PowerConverter')
  const pdTriggerFixture = FIXTURE_PARTS.find((entry) => entry.nodeType === 'PdTriggerSource')
  const batteryPackFixture = FIXTURE_PARTS.find((entry) => entry.nodeType === 'BatteryPack')
  const batteryModuleFixture = FIXTURE_PARTS.find((entry) => entry.nodeType === 'BatteryModule')
  // Several fixtures per board: the only thing that can block another pair is
  // running out of free pins for its two data lines.
  const stereoVuBlocker = stereoVuFixture
    ? (() => {
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

  const inputItems: HardwareShelfItem[] = inputPartEntries().map((entry) => {
    const blocker = inputPartBlocker(entry)
    return {
      key: entry.partId,
      nodeType: entry.nodeType,
      label: entry.label,
      hint: entry.hint,
      renderSrc: partRenderForNodeType(entry.nodeType, entry.properties ?? {})?.src,
      visual: entry.partId,
      partId: inputPartCatalogueId(entry),
      disabled: blocker !== null,
      disabledReason: blocker,
      onSelect: () => addInputPart(entry),
    }
  })

  const shelfCategories: HardwareShelfCategory[] = [
    // First, and open on a blank bench: what the patterns light up is the
    // first part a bench needs after its board, so it is not eighth of eight.
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
      hint: 'A wired link for the board\'s network',
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
      hint: 'Supplies, batteries, power conversion and load switching',
      items: [
        // Rated by the user, not chosen from a catalogue: one entry, and as
        // many supplies as the build has.
        ...(powerSupplyFixture ? [{
          key: powerSupplyFixture.partId,
          nodeType: powerSupplyFixture.nodeType,
          label: powerSupplyFixture.label,
          hint: powerSupplyFixture.hint,
          renderSrc: powerSupplyFixture.render,
          visual: powerSupplyFixture.partId,
          disabled: false,
          disabledReason: null,
          onSelect: () => addFixturePart(powerSupplyFixture),
        }] : []),
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
  ].filter((category) => category.items.length > 0)

  // Browsing groups come from each part's own categories and the category
  // tree (shelfGrouping.ts), not from a table of node types. The LED outputs
  // are forms rather than catalogued parts and stay flat.
  return shelfCategories.map((category) => {
    if (category.id === 'led-outputs' || !isShelfCategory(category.id)) return category
    const placed = category.items.map((item, position) => ({
      item, position, placement: shelfPlacement(category.id, item.partId, item.nodeType),
    }))
    placed.sort((a, b) => a.placement.order - b.placement.order || a.position - b.position)
    return {
      ...category,
      items: placed.map(({ item, placement }) => (placement.group ? { ...item, subcategory: placement.group } : item)),
    }
  })
}
