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
   * One short line for the Add Hardware menu.
   *
   * Separate from `note`, which is the full caveat the part panel shows while
   * you are wiring. A menu row is for choosing between modules, and a
   * paragraph in one stretched the panel across the window.
   */
  summary?: string
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
  /** True when more than one module is offered. The choice is made in the Add
   *  Hardware menu, so nothing renders a picker from this — it is for copy that
   *  needs to know whether alternatives exist. */
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
  RTCInput: {
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
  Amplifier: {
    property: 'model',
    options: [
      { id: 'max98357a-i2s-amplifier', label: 'MAX98357A', input: 'i2s', summary: 'I2S in, drives a speaker directly' },
      {
        id: 'pcm5102a-i2s-dac',
        label: 'PCM5102A',
        input: 'i2s',
        summary: 'I2S DAC — line out, needs an amp',
        note: 'A DAC, not an amplifier — the same three I2S wires, but a line-level output that needs a powered speaker or a separate amp.',
      },
      {
        id: 'uda1334a-i2s-dac',
        label: 'UDA1334A',
        input: 'i2s',
        summary: 'I2S DAC — line out, needs an amp',
        note: 'Line-level I2S DAC, wired the same as the PCM5102A.',
      },
      {
        id: 'pam8403-3w-stereo-amplifier',
        label: 'PAM8403',
        input: 'analog',
        summary: 'Line level in — classic ESP32 only',
        note: 'Takes line level, not I2S. The classic ESP32 drives it from its own DAC on GPIO25/26 — no other supported board has a DAC, so this part cannot make a sound on an ESP32-S3, S2, C3, C6 or H2.',
      },
    ],
  },
  // One option, because one controller is implemented. MAX7219 is the planned
  // second entry (display-todo.md slice B) and arrives with its own adapter —
  // listing it now would be a claim the firmware cannot keep, which is the
  // misrepresentation this whole module exists to prevent.
  // Two modules, two controllers, two buses — the difference is real and the
  // menu has to state it. The SH1106 on the bench is the 7-pin SPI variant;
  // the SSD1306 is the 4-pin I2C one.
  InfoDisplay: {
    property: 'partId',
    options: [
      {
        id: 'sh1106-oled-128x64',
        label: 'SH1106 1.3-inch',
        summary: '128x64 white OLED over 4-wire SPI',
        note: 'The 1.3-inch SH1106 has 132 columns of controller RAM behind a 128-column panel, so its window starts two columns in. Driving it as an SSD1306 shifts the image two pixels and wraps the remainder down the edge.',
      },
      {
        id: 'ssd1306-oled-128x64',
        label: 'SSD1306 0.96-inch',
        summary: '128x64 white OLED over I2C',
        note: 'The 0.96-inch SSD1306 answers on 0x3C or 0x3D and shares SDA/SCL with other I2C devices.',
      },
    ],
  },
  TransportDisplay: {
    property: 'partId',
    options: [
      {
        id: 'st7789-tft-240x240',
        label: 'ST7789 1.3-inch',
        summary: '240x240 colour TFT over SPI',
        note: 'A square 240x240 colour display with no touch controller.',
      },
      {
        id: 'st7789v-xpt2046-touch-240x320',
        label: 'ST7789V 2.4-inch + touch',
        summary: '240x320 colour TFT with XPT2046 touch',
        note: 'The XPT2046 touch controller exposes its own SPI pins, so it can share the display bus or use a separate bus. Wire the display controls output through Player Controls to make the fixed layout interactive in a music-player build.',
      },
    ],
  },
  SegmentDisplay: {
    property: 'partId',
    options: [
      {
        id: 'tm1637-4digit-display',
        label: 'TM1637 4-digit',
        summary: 'Two-wire 7-segment with a colon',
        note: 'Four digits and a centre colon, driven over CLK and DIO. Not I2C despite the two wires: the TM1637 has no addresses, so each module needs its own pair of pins.',
      },
      {
        id: 'max7219-8digit-7segment',
        label: 'MAX7219 8-digit',
        summary: 'Eight digits on a shared SPI bus',
        note: 'Eight digits and no colon, clocked as 16-bit frames over CLK and DIN with its own load line. It can share clock and data with other SPI devices given its own load pin, and its sixteen brightness steps are twice the TM1637 range.',
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
