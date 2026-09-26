// The Hardware workspace's parts shelf: every part it offers, grouped by
// shelf, with whether the board can take one more and why not.
import { assignPartPins } from '../../state/partPinAssignment'
import { partRenderSrc } from '../../state/partCatalogue'
import { partRenderForNodeType } from '../../state/partRenders'
import { partOptionsFor } from '../../state/partOptions'
import { LED_OUTPUT_FORM_LABELS } from '../../state/ledOutputForm'
import type { HardwareShelfItem, HardwareShelfCategory } from './HardwarePartsShelf'
import {
  type FixturePartEntry, type InputPartEntry, fixturePinRequests, FIXTURE_PARTS, INPUT_PARTS, LED_OUTPUT_ENTRIES,
  LED_OUTPUT_NODE_TYPE,
} from './hardwarePartCatalog'
import type { StudioNode } from '../../state/graphStore'
import type { PhysicalBoardProfile } from '../../build/boardProfiles'

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
      const pinRequests = fixturePinRequests(nodeType, option.id) ?? fixture.pinRequests
      const assigned = !blocked && pinRequests?.length
        ? assignPartPins(boardProfile, selectedFqbn, nodes, pinRequests)
        : { ok: true as const }
      const pinBlocked = assigned.ok ? null : assigned.reason
      return {
        key: `${nodeType}:${option.id}`,
        nodeType,
        label: option.label,
        hint: option.summary ?? fixture.hint,
        renderSrc: partRenderSrc(option.id),
        visual: option.id,
        disabled: blocked || pinBlocked !== null,
        disabledReason: blocked ? `One ${fixture.label.toLowerCase()} per board` : pinBlocked,
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
  const ethernetFixture = FIXTURE_PARTS.find((entry) => entry.nodeType === 'EthernetModule')
  const powerConverterFixture = FIXTURE_PARTS.find((entry) => entry.nodeType === 'PowerConverter')
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

  const shelfCategories: HardwareShelfCategory[] = [
    {
      id: 'inputs',
      label: 'Inputs',
      hint: 'Controls and sensors that feed the graph',
      items: INPUT_PARTS.map((entry) => {
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
      }),
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
      id: 'amplifiers',
      label: 'Amplifiers & DACs',
      hint: 'How sound gets off the board',
      // Both halves of an output chain: the I2S stage on the board's pins,
      // then the analog power amplifier a DAC can feed.
      items: [
        ...moduleItems('Amplifier', amplifierFixture),
        ...moduleItems('PowerAmplifier', powerAmplifierFixture),
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
      id: 'power-conversion',
      label: 'Power conversion',
      hint: 'Where 5 V comes from when your supply is 12 V or 24 V',
      items: moduleItems('PowerConverter', powerConverterFixture),
    },
    {
      id: 'switching-power',
      label: 'Switching power',
      hint: 'Relays and MOSFET switches for on/off loads',
      items: [
        ...moduleItems('RelayOutput', relayFixture),
        ...moduleItems('PowerSwitchOutput', powerSwitchFixture),
      ],
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

  return shelfCategories
}
