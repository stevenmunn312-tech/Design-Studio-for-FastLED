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
import { IR_RECEIVER_MODULES } from '../../state/peripherals/irModules'
import { MIC_MODULES } from '../../state/peripherals/micModules'
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
 * The microphone's rows are derived from `micModules.ts` rather than restated
 * here, because the rule deciding which modules may be offered is the same rule
 * the generator needs: a module earns a row when FastLED ships a
 * `fl::audio::Config` factory and a `MicProfile` for it. It had exactly one row
 * for as long as `CreateInmp441` was the only factory; the vendored FastLED now
 * also carries `CreateIcs43434` and `CreateGenericMEMS`. What still varies by
 * board is the *capture backend*, not the microphone.
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
  DFPlayerOutput: {
    property: 'partId',
    options: [{
      id: 'dfplayer-mini',
      label: 'DFPlayer Mini',
      summary: 'UART-controlled microSD audio player with speaker and line outputs',
      note: 'Power from 5 V. Put numbered files in the card’s /mp3 folder. Speaker mode uses SPK1/SPK2 directly; Line Out uses DAC_L/DAC_R into a power amplifier or powered speakers. Add a 1 kΩ series resistor from controller TX to module RX if UART noise causes buzzing.',
    }],
  },
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
  MicInput: {
    property: 'partId',
    options: MIC_MODULES.map((module) => ({
      id: module.partId,
      label: module.label,
      summary: module.summary,
      note: module.note,
    })),
  },
  IRRemoteInput: {
    property: 'partId',
    options: IR_RECEIVER_MODULES.map((module) => ({
      id: module.partId,
      label: module.label,
      summary: module.summary,
      note: module.note,
    })),
  },
  LineInput: {
    property: 'partId',
    options: [
      {
        id: 'pcm1802-line-in-adc',
        label: 'PCM1802 line-in ADC',
        summary: 'Stereo RCA line in to I2S',
        note: 'Connect a player module\'s line-level DAC output, not its bridge-tied speaker output, to the RCA inputs.',
      },
    ],
  },
  RtcModule: {
    property: 'partId',
    options: [
      {
        id: 'ds3231-rtc-module',
        label: 'DS3231 RTC module',
        summary: 'ZS-042 breakout, six-pin header',
      },
      {
        id: 'jaycar-xc9044-rtc-module',
        label: 'DS3231 RTC Clock Module for Raspberry Pi',
        summary: 'Pi-header DS3231, CR927 backup',
      },
    ],
  },
  // One module each: named, not chosen. The DMX node and the MIDI node keep
  // the source choice; these say which board the wire runs through.
  DmxTransceiver: {
    property: 'partId',
    options: [
      {
        id: 'max485-rs485-module',
        label: 'MAX485 RS-485 module',
        summary: 'DMX512 in from an XLR line, on 5 V',
        note: 'Power from 5 V. RO reaches the board through a 1 kΩ / 2 kΩ divider, and RE is bridged to DE so one GPIO drives both. Keep the fitted 120 Ω terminator only on the last device in the DMX chain.',
      },
    ],
  },
  MidiInterface: {
    property: 'partId',
    options: [
      {
        id: 'adafruit-midi-featherwing',
        label: 'Adafruit MIDI FeatherWing',
        summary: 'Opto-isolated DIN-5 MIDI in, on 3.3 V',
        note: 'Power from 3.3 V. Only 3.3V, GND and MIDI_RX are wired; the optocoupler output needs no divider. Plug the keyboard into the left socket, MIDI IN.',
      },
    ],
  },
  SDCard: {
    property: 'partId',
    options: [
      {
        id: 'microsd-module-5v',
        label: 'microSD module (5 V)',
        summary: 'Regulator and level shifter on board',
        note: 'Has an onboard regulator and level shifter, so it takes 5 V power and 5 V SPI.',
      },
      {
        id: 'microsd-breakout-3v3',
        label: 'microSD breakout (3.3 V)',
        summary: 'Bare board — 3.3 V only',
        note: 'Bare board: no regulator, no level shifter. 5 V power or 5 V SPI can destroy the card.',
      },
    ],
  },
  KeypadInput: {
    property: 'partId',
    options: [
      {
        id: 'matrix-keypad-4x4',
        label: '4x4 matrix keypad',
        summary: 'Sixteen keys on eight GPIOs',
        note: 'Rows R1 to R4 go to pins with a pull-up and columns C1 to C4 to output pins. The keypad is passive and needs no power.',
      },
    ],
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
  MotionInput: {
    property: 'partId',
    options: [
      {
        id: 'hc-sr501-pir-sensor',
        label: 'HC-SR501 PIR',
        summary: 'Infrared: sees a warm body move',
        note: 'Power VCC from 5 V. OUT is 3.3 V logic.',
      },
      {
        id: 'rcwl-0516-microwave-motion-module',
        label: 'RCWL-0516 microwave',
        summary: 'Radar: senses movement through plastic',
        note: 'Power VIN from 5 V (4 to 28 V). OUT is 3.3 V logic and stays high about two seconds after the last movement. Leave 3V3 and CDS unwired.',
      },
    ],
  },
  RelayOutput: {
    property: 'partId',
    options: [
      { id: 'relay-module-1ch-5v', label: '1-channel relay', summary: 'One active-low 5 V SPDT relay' },
      { id: 'relay-module-2ch-5v', label: '2-channel relay', summary: 'Two active-low 5 V SPDT relays' },
      { id: 'relay-module-4ch-5v', label: '4-channel relay', summary: 'Four active-low 5 V SPDT relays' },
      { id: 'relay-module-8ch-5v', label: '8-channel relay', summary: 'Eight active-low 5 V SPDT relays' },
      {
        id: 'seeed-grove-2ch-ssr',
        label: 'Seeed Grove 2-channel SSR',
        summary: 'Two AC phototriacs, 0.1-2 A, leak 1.5 mA off',
        note: 'Wire CTR1 and CTR2 to GPIOs and VCC to 5 V. The screw terminals switch the AC load and are not logic pins.',
      },
    ],
  },
  // The stage on the board's own pins: every option takes I2S. An analog
  // amplifier is a different part in a different place in the chain — it
  // takes line level, from one of these DACs or from the classic ESP32's own
  // — so it is a PowerAmplifier, not an option here.
  Amplifier: {
    property: 'model',
    options: [
      // `MAX98357A` is the node's default `model` and what every earlier save
      // holds; it names this module, so it is an alias and not an unknown part.
      { id: 'max98357a-i2s-amplifier', aliases: ['MAX98357A'], label: 'MAX98357A', output: 'speaker', summary: 'I2S in, drives a speaker directly' },
      {
        // One bench part rather than two Amplifier nodes: both boards sit on
        // the same three I2S lines and the firmware already sends stereo, so
        // which board plays which channel is set on the boards themselves.
        id: 'max98357a-stereo-pair',
        label: 'MAX98357A stereo pair',
        output: 'speaker',
        summary: 'Two I2S amps, one per channel',
        note: 'Both boards share BCLK, LRC and DIN. Each plays the channel its SD pin selects (see the SD_MODE table in the MAX98357A datasheet); an unmodified breakout plays the left-plus-right mix, so set one board to left and the other to right.',
      },
      {
        id: 'pcm5102a-i2s-dac',
        label: 'PCM5102A',
        output: 'line',
        summary: 'I2S DAC — line out, needs an amp',
        note: 'A DAC, not an amplifier — the same three I2S wires, but a line-level output that needs a powered speaker or a power amplifier.',
      },
      {
        id: 'uda1334a-i2s-dac',
        label: 'UDA1334A',
        output: 'line',
        summary: 'I2S DAC — line out, needs an amp',
        note: 'Line-level I2S DAC, wired the same as the PCM5102A.',
      },
    ],
  },
  // Analog power amplifiers: line level in, speakers out, no GPIO of their
  // own. What feeds one is resolved from the bench, not chosen here — a DAC
  // when there is one, otherwise the classic ESP32's internal DAC on GPIO25/26.
  PowerAmplifier: {
    property: 'partId',
    options: [
      {
        id: 'pam8403-3w-stereo-amplifier',
        label: 'PAM8403',
        summary: '2 x 3 W, 5 V — line level in',
        note: 'Takes line level, not I2S. Fed from a PCM5102A or UDA1334A, or on a classic ESP32 from its own DAC on GPIO25/26.',
      },
      {
        id: 'pam8610-stereo-amplifier',
        label: 'PAM8610',
        summary: '2 x 15 W, 12 V — line level in',
        note: 'Needs its own 7-15 V supply; the controller cannot power it. Share its ground with the board and the DAC.',
      },
      {
        id: 'dx-0809-stereo-amplifier',
        label: 'DX-0809',
        summary: '2 x 15 W, 12 V — AUX line in',
        note: 'Needs its own 12 V supply; the controller cannot power it. Feed its AUX input from the line out of a DAC, and share ground with the board.',
      },
    ],
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
    PdTriggerSource: {},
    PowerSwitchOutput: {},
    BuzzerOutput: {},
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
 * The row a part earns: its menu name, and the copy its manifest carries. The
 * menu name is `copy.optionLabel` where the manifest gives a shorter one than
 * the full product `label`.
 */
function catalogueOption(manifest: PartManifest): PartOption {
  const copy = manifest.copy
  return {
    id: manifest.partId,
    label: copy?.optionLabel ?? manifest.label,
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
  types: Record<string, Pick<PartOptionConfig, 'uncataloguedDefault'>>,
): Record<string, PartOptionConfig> {
  return Object.fromEntries(Object.entries(types).map(([nodeType, flags]) => {
    const rows = bundledPartsForType(nodeType).map(catalogueOption)
    const config: PartOptionConfig = { property: 'partId', ...flags, options: rows }
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
        .filter((manifest) => !known.has(manifest.partId))
        .map(catalogueOption)
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
