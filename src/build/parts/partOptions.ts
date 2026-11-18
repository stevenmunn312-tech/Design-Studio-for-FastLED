// Which exact module a part is.
//
// "Every part names its exact module" is the design note's requirement, and the
// reason given is worth repeating: naming the part is what makes its picture
// honest rather than decorative, and it forces assumptions into the open. The
// player generator has always assumed a MAX98357A and nothing in the UI ever
// said so.
//
// A dropdown only where a choice genuinely exists. Offering a list of plausible
// part numbers the app treats identically would be the same quiet
// misrepresentation this model exists to remove — so a part with one supported
// module states its name instead of pretending to offer alternatives.

import { CONVERTER_FEED_LABELS, converterRoles, deratedCurrentMa, ENCLOSURE_AMBIENT_C, powerConverterModules } from '../../state/peripherals/powerConverter'
import {
  PART_CATALOGUE, bundledPartsForType, memoByCatalogue, partById, registeredPartsForType, type PartCatalogueEntry,
} from './partCatalogue'
import type { PartManifest } from './manifest/partManifest'
import { analogSensorEntries, analogSensorSummary } from '../../state/peripherals/analogSensor'
import { digitalSensorEntries, digitalSensorSummary } from '../../state/peripherals/digitalSensor'
import { batteryCellPartIds, batteryModulePartIds, batteryModuleSummary } from '../../state/peripherals/battery'

export interface PartOption {
  /** Catalogue part id when the part is modelled, else a plain slug. */
  id: string
  label: string
  /**
   * Older saved values that mean this part. A node written before the id was a
   * catalogue id still resolves to it, instead of being reported as a part this
   * version does not have. Per the plan's rule that a rename needs an alias.
   */
  aliases?: readonly string[]
  /**
   * What picking this changes, when the app cannot show it any other way.
   * Alternatives that wire identically still differ in what comes out of them,
   * and that difference has to be stated somewhere.
   */
  note?: string
  /**
   * One short line for the Add Hardware menu.
   *
   * Separate from `note`, which is the full caveat the part panel shows while
   * you are wiring. A menu row is for choosing between modules, and a
   * paragraph in one stretched the panel across the window.
   */
  summary?: string
  /**
   * What comes out of an I2S audio stage, for the parts where that decides
   * what may follow it.
   *
   * A DAC's line out is exactly what a power amplifier's line in expects; a
   * MAX98357A's bridge-tied speaker output is not, and wiring one into the
   * other drives a line input with a speaker-level signal whose negative leg
   * is not ground. The chain is resolved from this — see state/audio/audioOutput.ts.
   */
  output?: 'speaker' | 'line'
}

export interface PartIdentity {
  option: PartOption
  /** Present once the module has been modelled — carries the verified size,
   *  the render, the header order and the datasheet caveats. */
  entry?: PartCatalogueEntry
  /** Every caveat worth reading before wiring: the asset's own notes first,
   *  then anything specific to choosing this option. */
  notes: string[]
  /** True when more than one module is offered. The choice is made in the Add
   *  Hardware menu, so nothing renders a picker from this — it is for copy that
   *  needs to know whether alternatives exist. */
  hasChoice: boolean
  /**
   * True when the node names a part this version does not have. `option` then
   * only carries the saved id as its label and `entry` is absent: nothing is
   * substituted, so a caller that reads a spec from the entry finds none. See
   * `build/parts/partResolution.ts` for the shared rule and the gates.
   */
  unresolved?: true
}

/**
 * The modules each hardware node can be, and the property holding the choice.
 *
 * The microphone's rows are its catalogue entries, as every audio type's are:
 * a module earns a row when its `microphone` block names a FastLED
 * `fl::audio::Config` factory and a `MicProfile` for it (or the app's own
 * capture adapter). What still varies by board is the *capture backend*, not
 * the microphone.
 */
interface PartOptionConfig {
  property: string
  options: PartOption[]
  /**
   * The node's default part predates the catalogue, so it cannot be an option.
   * A node naming none of the options is then that part, not the first option.
   */
  uncataloguedDefault?: true
}

/**
 * The rows. Not read directly: `PART_OPTIONS` below is these plus a row for
 * every registered part. A type listed in `catalogueTypeOptions` takes its rows
 * from its bundled manifests; the rest are written here because their type
 * still carries per-part code (a code list, a hard-wired module).
 */
const BUNDLED_PART_OPTIONS: Record<string, PartOptionConfig> = {
  PowerConverter: {
    property: 'partId',
    get options(): PartOption[] {
      return powerConverterModules().map((module) => ({
        id: module.partId,
        label: module.label,
        // A module with a Feeds choice says so in few words: the menu line is short.
        summary: `${converterRoles(module.spec).length > 1 ? 'LEDs or board' : CONVERTER_FEED_LABELS[module.spec.role]} ·${module.spec.inputMinV}-${module.spec.inputMaxV} V in, ${module.spec.outputSetV} V ${Number((deratedCurrentMa(module.spec) / 1000).toFixed(1))} A at ${ENCLOSURE_AMBIENT_C} °C`,
      }))
    },
  },
  BatteryPack: {
    property: 'partId',
    get options(): PartOption[] {
      return batteryCellPartIds().flatMap((partId) => {
        const entry = partById(partId)
        const cell = entry?.batteryCell
        return entry && cell ? [{
          id: partId,
          label: entry.label,
          summary: `${cell.formFactor} ${cell.chemistry} · ${cell.nominalV} V, ${cell.capacityMah} mAh, ${cell.maxContinuousDischargeMa / 1000} A continuous`,
        }] : []
      })
    },
  },
  BatteryModule: {
    property: 'partId',
    get options(): PartOption[] {
      return batteryModulePartIds().flatMap((partId) => {
        const entry = partById(partId)
        const summary = batteryModuleSummary(partId)
        return entry && summary ? [{ id: partId, label: entry.label, summary }] : []
      })
    },
  },
  // The generic sensor types have no row of code per part: every option is a
  // catalogue entry carrying the type's block, read when asked so a part added
  // to the catalogue appears without an edit here. A node naming no catalogued
  // part is unavailable (`uncataloguedDefault`), never the first option.
  DigitalSensorInput: {
    property: 'partId',
    uncataloguedDefault: true,
    get options(): PartOption[] {
      return digitalSensorEntries(PART_CATALOGUE).map((entry) => ({
        id: entry.partId,
        label: entry.label,
        summary: digitalSensorSummary(entry.digitalSensor!),
      }))
    },
  },
  AnalogSensorInput: {
    property: 'partId',
    uncataloguedDefault: true,
    get options(): PartOption[] {
      return analogSensorEntries(PART_CATALOGUE).map((entry) => ({
        id: entry.partId,
        label: entry.label,
        summary: analogSensorSummary(entry.analogSensor!),
      }))
    },
  },
  ...catalogueTypeOptions({
    CoolingFanOutput: {},
    TemperatureInput: {},
    TouchButtonInput: {},
    JoystickInput: {},
    PresenceInput: {},
    PowerMonitorInput: {},
    PwmDriverOutput: {},
    EnvironmentInput: {},
    MotionVectorInput: {},
    TouchPadInput: {},
    DarlingtonDriverOutput: {},
    DFPlayerOutput: {},
    RtcModule: {},
    // One module each for DMX and MIDI today: named, not chosen. The DMX node and
    // the MIDI node keep the source choice; these say which board the wire runs through.
    DmxTransceiver: {},
    MidiInterface: {},
    SDCard: {},
    PdTriggerSource: {},
    PowerSwitchOutput: {},
    BuzzerOutput: {},
    RelayOutput: {},
    MotionInput: {},
    KeypadInput: {},
    IRRemoteInput: {},
    // The audio types. Every row is a catalogue entry: a microphone's FastLED
    // factory, an I2S stage's output kind and a power amplifier's supply are
    // in the part's block, not here.
    MicInput: {},
    LineInput: {},
    // The stage on the board's own pins: every option takes I2S. An analog
    // amplifier is a different part in a different place in the chain — it
    // takes line level, from one of these DACs or from the classic ESP32's own
    // — so it is a PowerAmplifier, not an option here. `MAX98357A` is the
    // node's default `model` and what every earlier save holds; it names the
    // first module, so it is an alias and not an unknown part.
    Amplifier: { property: 'model', aliases: { 'max98357a-i2s-amplifier': ['MAX98357A'] } },
    PowerAmplifier: {},
    EthernetModule: {},
    DistanceInput: {},
    LightInput: {},
    // The encoder module the app has always drawn has no `part.json` yet, so
    // it keeps its bundled render and VCC/A/B/SW/GND header, and an encoder
    // that names no part is still that module.
    EncoderInput: { uncataloguedDefault: true },
    // Screen size and bus are each independent facts about a module, not one
    // choice: `oledTransportFor` reads each part's catalogued interface, so a
    // module's pins, bus validation and retargeting follow from its manifest
    // alone. Display (the document node) has no partId: the touch module it is
    // authored against is whatever TransportDisplay panel its output is wired to.
    InfoDisplay: {},
    TransportDisplay: {},
    SegmentDisplay: {},
  }),
}

/**
 * Types whose menu rows are only the parts carrying the type's own block. The
 * passive 4 ohm speaker is filed under `PowerAmplifier` for the shelf and has no
 * amplifier facts, so it is not an amplifier to choose.
 */
function isOffered(nodeType: string, manifest: PartManifest): boolean {
  const block = nodeType === 'PowerAmplifier' ? 'powerAmp' : undefined
  return block === undefined || manifest[block] !== undefined
}

/**
 * The row a part earns: its menu name, and the copy its manifest carries. The
 * menu name is `copy.optionLabel` where the manifest gives a shorter one than
 * the full product `label`.
 */
function catalogueOption(manifest: PartManifest, aliases?: readonly string[]): PartOption {
  const copy = manifest.copy
  return {
    id: manifest.partId,
    label: copy?.optionLabel ?? manifest.label,
    ...(aliases ? { aliases } : {}),
    ...(manifest.i2sAudio ? { output: manifest.i2sAudio.output } : {}),
    ...(copy?.summary ? { summary: copy.summary } : {}),
    ...(copy?.wiringNote ? { note: copy.wiringNote } : {}),
  }
}

/**
 * The node types whose rows are their bundled catalogue entries, in menu order
 * (`bundledPartsForType`). Nothing here names a part: a bundled part joins its
 * type by saying so in its manifest, and a downloaded one follows below.
 */
function catalogueTypeOptions(
  types: Record<string, {
    uncataloguedDefault?: true
    /** The node property when it is not `partId` (the Amplifier's `model`). */
    property?: string
    /**
     * Older saved values that mean a bundled part, by part id. A value a saved
     * project already holds is not a part to rename away from.
     */
    aliases?: Record<string, readonly string[]>
  }>,
): Record<string, PartOptionConfig> {
  return Object.fromEntries(Object.entries(types).map(([nodeType, flags]) => {
    const rows = bundledPartsForType(nodeType)
      .filter((manifest) => isOffered(nodeType, manifest))
      .map((manifest) => catalogueOption(manifest, flags.aliases?.[manifest.partId]))
    const config: PartOptionConfig = {
      property: flags.property ?? 'partId',
      ...(flags.uncataloguedDefault ? { uncataloguedDefault: true as const } : {}),
      options: rows,
    }
    return [nodeType, config]
  }))
}

/**
 * Every node type's options: the bundled rows, then a row for each registered
 * part whose usable types include the node type. A part the bundled rows (or a
 * catalogue-derived getter) already list is not listed twice. A node type with
 * no row of its own gets none, because the row also names the property that
 * holds the part id and a registered part cannot invent that.
 *
 * `options` is memoised by catalogue version, so it is the same array until a
 * part is registered.
 */
export const PART_OPTIONS: Record<string, PartOptionConfig> = Object.fromEntries(
  Object.keys(BUNDLED_PART_OPTIONS).map((nodeType) => {
    const base = BUNDLED_PART_OPTIONS[nodeType]
    // Read through BUNDLED_PART_OPTIONS each time: some rows are getters over the catalogue.
    const options = memoByCatalogue((): PartOption[] => {
      const rows = BUNDLED_PART_OPTIONS[nodeType].options
      const known = new Set(rows.flatMap((row) => [row.id, ...(row.aliases ?? [])]))
      const added = registeredPartsForType(nodeType)
        .filter((manifest) => !known.has(manifest.partId) && isOffered(nodeType, manifest))
        .map((manifest) => catalogueOption(manifest))
      return added.length === 0 ? rows : [...rows, ...added]
    })
    const config: PartOptionConfig = {
      property: base.property,
      ...(base.uncataloguedDefault ? { uncataloguedDefault: true as const } : {}),
      get options() { return options() },
    }
    return [nodeType, config]
  }),
)

export function partOptionsFor(nodeType: string): PartOption[] {
  return PART_OPTIONS[nodeType]?.options ?? []
}

/** The option a saved value names, by id or by an older alias. */
export function partOptionFor(nodeType: string, saved: string): PartOption | undefined {
  return PART_OPTIONS[nodeType]?.options.find((candidate) =>
    candidate.id === saved || candidate.aliases?.includes(saved))
}

/** The node property that stores this part's chosen module, if it has one. */
export function partOptionProperty(nodeType: string): string | null {
  return PART_OPTIONS[nodeType]?.property ?? null
}

/**
 * What this node currently is, resolved against the catalogue.
 *
 * A missing value (a node nobody has chosen a module for) is the default part,
 * the first option: the module the app was built around, because every one of
 * these nodes describes something physically on the bench. Where that default
 * is not catalogued yet, there is no identity to fall back to, and the answer
 * is null.
 *
 * A value naming a part this version does not have is not the default part. It
 * resolves to a placeholder carrying the saved id and no catalogue entry
 * (`unresolved`), so a label shows what the project says and a footprint or
 * render lookup finds nothing and draws its generic stand-in. That stand-in is
 * cosmetic only; the build is blocked by `partResolution.ts`.
 */
export function resolvePartIdentity(
  nodeType: string,
  properties: Record<string, unknown>,
): PartIdentity | null {
  const config = PART_OPTIONS[nodeType]
  if (!config || config.options.length === 0) return null

  const saved = String(properties[config.property] ?? '')
  if (saved !== '' && !partOptionFor(nodeType, saved)) {
    return {
      option: { id: saved, label: saved },
      notes: [],
      hasChoice: config.options.length > 1,
      unresolved: true,
    }
  }
  const chosen = partOptionFor(nodeType, saved)
  if (!chosen && config.uncataloguedDefault) return null
  const option = chosen ?? config.options[0]

  const entry = partById(option.id)
  return {
    option,
    entry,
    notes: [...(entry?.notes ?? []), ...(option.note ? [option.note] : [])],
    hasChoice: config.options.length > 1,
  }
}
