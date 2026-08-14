/**
 * Board capability types, kept separate from `boardProfiles.ts` so the
 * generated import data can reference them without a circular import:
 *
 *   boardCapabilities.ts  ←  generated/boardCapabilityData.ts  ←  boardProfiles.ts
 *
 * `boardProfiles.ts` re-exports everything here, so consumers can keep
 * importing from that one module.
 */

/**
 * How usable each GPIO is *on this board*, which is not the same question as
 * whether the MCU has the pin. A Seeed XIAO ESP32S3 has GPIO39-42 on the die
 * but exposes them only as underside pads, so a pin map derived from the chip
 * alone will happily recommend a pin nobody can reach with a jumper wire.
 *
 * Keyed by GPIO number rather than label, because this is consulted from pin
 * properties (which are numbers) rather than from silkscreen text.
 *
 * `safeGeneralPurpose` is an allowlist and does all the protective work: a pin
 * that is not on it reports as `unknown`, never `safe`. The other two fields
 * exist to explain *why* a pin is not recommended, so an empty
 * `boardReservedOrNotExposed` means "no reasons recorded", not "nothing is
 * reserved".
 */
export interface BoardPinSafety {
  /** Broken out to a header, output-capable, clear of straps and buses. */
  safeGeneralPurpose: number[]
  /** Usable, with a reason to think first — ADC2/Wi-Fi, JTAG, an onboard LED. */
  useWithCaution: Record<number, string>
  /** On the chip, not usable from this board. Flash/PSRAM, native USB, pads. */
  boardReservedOrNotExposed: Record<number, string>
}

/**
 * Per-board starting pins for the peripherals Studio knows how to wire. These
 * replace the per-node hardcoded tables (see `micPinDefaults.ts`) with a fact
 * the board itself carries, so a board change retargets every peripheral at
 * once instead of one node type at a time.
 *
 * A profile's entries are required not to collide with each other, so mic, amp
 * and LED data can all be taken at face value on the same board.
 */
export interface BoardPeripheralPins {
  /** INMP441 I2S microphone. */
  inmp441?: { wsLrclk: number; sckBclk: number; sdDout: number }
  /** MAX98357A I2S amplifier. */
  max98357?: { bclk: number; lrc: number; din: number }
  /** Addressable LED data line. */
  fastLedData?: {
    recommendedDefault: number
    commonAlternatives: number[]
    selectionNote?: string
  }
}

/** Rendered board photo used by the pinout view, imported from the Blender assets. */
export interface BoardRenderAsset {
  /** Path relative to the site root, e.g. `boards/lolin-s2-mini.webp`. */
  file: string
  widthPx: number
  heightPx: number
}

/**
 * One board's imported capability data, merged onto its hand-authored profile.
 *
 * Deliberately does not carry pin maps or anchors: those are hand-checked, test
 * covered, and for several boards confirmed against hardware in hand, so the
 * import adds to them rather than replacing them.
 */
/**
 * A pin map derived from a board asset manifest, used only where no profile is
 * hand-authored.
 *
 * Carries no `targetFamilies` or `previewSvg`: the first is derived from the
 * FQBN at merge time by the same helper every other consumer uses, and the
 * second is a placeholder the merge supplies. Anchors carry no coordinates
 * because the pinout view positions pins by their index within a side and
 * reads only `labelAlign` — emitting pixel geometry here would invent
 * precision nothing consumes.
 */
export interface GeneratedBoardProfile {
  id: string
  label: string
  manufacturer: string
  model: string
  revision: string
  fqbn: string
  compatibleFqbns: string[]
  dimensionsMm: { width: number; height: number }
  sourceSummary: string
  caveats: string[]
  notes: string[]
  pinAnchors: Array<{ id: string; x: number; y: number; labelAlign: 'left' | 'right' | 'top' | 'bottom' }>
  pins: Array<{ id: string; label: string; role: string; anchorId: string; gpio?: number }>
}

export interface BoardCapabilityData {
  pinSafety?: BoardPinSafety
  /**
   * Free-text safety commentary from the source manifest — flash pins, UART,
   * ADC2/Wi-Fi caveats. Deliberately *not* parsed for pin numbers: prose
   * routinely names a pin in order to say it is fine ("GPIO16 and GPIO17 are
   * reserved on WROVER modules; they are available on WROOM"), and mining that
   * would mark a good pin unusable. Shown to the user, never acted on.
   */
  safetyNotes?: string[]
  peripheralPins?: BoardPeripheralPins
  processor?: string
  memory?: { flashMb: number; psramMb: number }
  render?: BoardRenderAsset
}
