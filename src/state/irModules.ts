// Which demodulating IR receiver an IRRemoteInput is.
//
// One list, for the same reason `micModules.ts` is one list: the fact that
// decides whether a module may be offered is the fact the rest of the app
// needs. Here it is the *pin order*, because these parts are not
// pin-compatible with each other — a TSOP382x puts ground on its centre pin
// and a VS1838B-class module puts the supply there. A render carries its pad
// names into the Build Diagram, so a module earns a row only once its order
// comes from something better than a marketplace photograph.
//
// Deliberately not a list of every board that wires the same way. The clones
// of the KY-022 are documented as swapping their two outer pins, which makes
// "a KY-022" a design rather than a guarantee; that caveat is carried on the
// entry rather than being silently averaged away.

export interface IrReceiverModule {
  /** Catalogue part id. Also the value stored in the node's `partId`. */
  partId: string
  label: string
  /** One short line for the Add Hardware menu. */
  summary: string
  /** The caveat worth reading while wiring, when there is one. */
  note?: string
}

/**
 * Ordered as the Add Hardware menu shows them: the module a kit ships first,
 * then the bare receiver someone solders into a finished build.
 */
export const IR_RECEIVER_MODULES: readonly IrReceiverModule[] = [
  {
    partId: 'ky-022-ir-receiver-module',
    label: 'KY-022 module',
    summary: 'Three-pin breakout with an indicator LED',
    // The honest half of offering it: the centre pin is the supply on every
    // documented variant, and the outer two are not standardised.
    note: 'Some clones swap the outer two pins. Check the silkscreen on your board before wiring it — a swap puts the supply rail on a GPIO.',
  },
  {
    partId: 'tsop38238-ir-receiver',
    label: 'TSOP38238',
    summary: 'Bare Vishay receiver, datasheet pin order',
    note: 'Its centre pin is ground, not the supply. Do not wire it to a KY-022 footprint without rechecking.',
  },
]

/** The module an IRRemoteInput carrying no choice, or a stale one, resolves to. */
export const DEFAULT_IR_RECEIVER_MODULE = IR_RECEIVER_MODULES[0]

/**
 * The module a saved `partId` names.
 *
 * Falls back to the default rather than returning nothing, the same rule
 * `micModuleFor` follows: an unset or stale property means "the module the
 * shelf offers first", never "no receiver".
 */
export function irReceiverModuleFor(partId: unknown): IrReceiverModule {
  return IR_RECEIVER_MODULES.find((module) => module.partId === partId)
    ?? DEFAULT_IR_RECEIVER_MODULE
}
