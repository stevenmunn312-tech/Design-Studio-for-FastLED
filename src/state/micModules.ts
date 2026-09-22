// Which I2S MEMS microphone a MicInput is, and what the firmware does about it.
//
// One list, because the two facts that decide whether a module may be offered
// at all are the same two the generator needs: the `fl::audio::Config` factory
// that builds its capture config, and the `fl::audio::MicProfile` response
// correction that factory applies. A module with neither cannot be listed
// honestly — that was the whole reason this node offered exactly one option
// until FastLED shipped the other two factories.
//
// Deliberately not a list of every module that wires the same way. An analog
// electret board (MAX9814, MAX4466) has no I2S at all and `fl::audio::Config`
// is a variant of I2S and PDM only, so listing one would be the
// misrepresentation `partOptions.ts` exists to prevent.

export interface MicModule {
  /** Catalogue part id. Also the value stored in the node's `partId`. */
  partId: string
  label: string
  /** One short line for the Add Hardware menu. */
  summary: string
  /** The caveat worth reading while wiring, when there is one. */
  note?: string
  /** `fl::audio::Config` factory the ESP32 backend calls. */
  factory: string
  /** `fl::audio::MicProfile` member the Teensy backend is handed explicitly. */
  profile: string
}

/**
 * Ordered as the Add Hardware menu shows them: the module the app was built
 * around first, then the better one, then the honest generic.
 */
export const MIC_MODULES: readonly MicModule[] = [
  {
    partId: 'inmp441-i2s-microphone',
    label: 'INMP441',
    summary: 'The common three-wire I2S MEMS module',
    factory: 'CreateInmp441',
    profile: 'INMP441',
  },
  {
    partId: 'ics-43434-i2s-microphone',
    label: 'ICS-43434',
    summary: 'Lower noise floor, same three wires',
    note: 'Wires exactly like an INMP441 and costs about the same; firmware applies the ICS43434 response correction instead.',
    factory: 'CreateIcs43434',
    profile: 'ICS43434',
  },
  {
    partId: 'generic-i2s-mems-microphone',
    label: 'Generic I2S MEMS',
    summary: 'Low-cost MSM261S4030H0-class board',
    // The honest half of offering a generic entry: the profile is a
    // characterisation claim, and this one is an average rather than a
    // measurement of the board in your hand.
    note: 'For the unbranded boards often sold as INMP441. The GenericMEMS profile is an average MEMS correction, not this module\'s measured response.',
    factory: 'CreateGenericMEMS',
    profile: 'GenericMEMS',
  },
]

/** The module a MicInput carrying no choice, or a stale one, resolves to. */
export const DEFAULT_MIC_MODULE = MIC_MODULES[0]

/**
 * The module a saved `partId` names.
 *
 * Falls back to the default rather than returning nothing: an unset or stale
 * property means "the module the app was built around", never "no microphone" —
 * the same rule `resolvePartIdentity` follows for every other part.
 */
export function micModuleFor(partId: unknown): MicModule {
  return MIC_MODULES.find((module) => module.partId === partId) ?? DEFAULT_MIC_MODULE
}
