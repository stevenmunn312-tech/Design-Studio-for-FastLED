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

import { partById, type PartCatalogueEntry } from './partCatalogue'

export interface PartOption {
  /** Catalogue part id when the part is modelled, else a plain slug. */
  id: string
  label: string
  /**
   * What picking this changes, when the app cannot show it any other way.
   * Alternatives that wire identically still differ in what comes out of them,
   * and that difference has to be stated somewhere.
   */
  note?: string
  /**
   * How sound reaches this part, for the ones where that is not a given.
   *
   * Every amplifier the app knew before the PAM8403 took I2S, so "there is an
   * amplifier on the bench" was allowed to mean "this build uses I2S". An
   * analog amplifier takes line level and has to be fed by the board's own DAC,
   * so the assumption had to become a stated fact — see state/audioOutput.ts.
   */
  input?: 'i2s' | 'analog'
}

export interface PartIdentity {
  option: PartOption
  /** Present once the module has been modelled — carries the verified size,
   *  the render, the header order and the datasheet caveats. */
  entry?: PartCatalogueEntry
  /** Every caveat worth reading before wiring: the asset's own notes first,
   *  then anything specific to choosing this option. */
  notes: string[]
  /** True when more than one module is offered, so the UI knows whether to
   *  render a dropdown or simply state the name. */
  hasChoice: boolean
}

/**
 * The modules each hardware node can be, and the property holding the choice.
 *
 * The microphone has exactly one entry because the generator has exactly one:
 * `fl::audio::Config::CreateInmp441` and `MicProfile::INMP441` are hard-bound,
 * so a second option would be a claim the firmware cannot keep. What varies by
 * board is the *capture backend*, not the microphone.
 */
export const PART_OPTIONS: Record<string, { property: string; options: PartOption[] }> = {
  MicInput: {
    property: 'partId',
    options: [
      { id: 'inmp441-i2s-microphone', label: 'INMP441' },
    ],
  },
  SDCard: {
    property: 'partId',
    options: [
      {
        id: 'microsd-module-5v',
        label: 'microSD module (5 V)',
        note: 'Has an onboard regulator and level shifter, so it takes 5 V power and 5 V SPI.',
      },
      {
        id: 'microsd-breakout-3v3',
        label: 'microSD breakout (3.3 V)',
        note: 'Bare board: no regulator, no level shifter. 5 V power or 5 V SPI can destroy the card.',
      },
    ],
  },
  Amplifier: {
    property: 'model',
    options: [
      { id: 'max98357a-i2s-amplifier', label: 'MAX98357A', input: 'i2s' },
      {
        id: 'pcm5102a-i2s-dac',
        label: 'PCM5102A',
        input: 'i2s',
        note: 'A DAC, not an amplifier — the same three I2S wires, but a line-level output that needs a powered speaker or a separate amp.',
      },
      {
        id: 'uda1334a-i2s-dac',
        label: 'UDA1334A',
        input: 'i2s',
        note: 'Line-level I2S DAC, wired the same as the PCM5102A.',
      },
      {
        id: 'pam8403-3w-stereo-amplifier',
        label: 'PAM8403',
        input: 'analog',
        note: 'Takes line level, not I2S. The classic ESP32 drives it from its own DAC on GPIO25/26 — no other supported board has a DAC, so this part cannot make a sound on an ESP32-S3, S2, C3, C6 or H2.',
      },
    ],
  },
}

export function partOptionsFor(nodeType: string): PartOption[] {
  return PART_OPTIONS[nodeType]?.options ?? []
}

/** The node property that stores this part's chosen module, if it has one. */
export function partOptionProperty(nodeType: string): string | null {
  return PART_OPTIONS[nodeType]?.property ?? null
}

/**
 * What this node currently is, resolved against the catalogue.
 *
 * Falls back to the first option, which is the module the app was built
 * around — an unset or unrecognised value means "the default part", not "no
 * part", because every one of these nodes describes something physically on
 * the bench.
 */
export function resolvePartIdentity(
  nodeType: string,
  properties: Record<string, unknown>,
): PartIdentity | null {
  const config = PART_OPTIONS[nodeType]
  if (!config || config.options.length === 0) return null

  const saved = String(properties[config.property] ?? '')
  const option = config.options.find((candidate) => candidate.id === saved)
    // Legacy values stored the display name rather than an id.
    ?? config.options.find((candidate) => candidate.label === saved)
    ?? config.options[0]

  const entry = partById(option.id)
  return {
    option,
    entry,
    notes: [...(entry?.notes ?? []), ...(option.note ? [option.note] : [])],
    hasChoice: config.options.length > 1,
  }
}
