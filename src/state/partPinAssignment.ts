// Starting pins for a part added in the hardware view.
//
// The generalisation of `nextFreeLedDataPin`: a part needs one or more pins,
// each possibly with a capability its role demands, and none of them may
// collide with a pin the graph already claims. This is what makes a part
// attached-by-construction to a known board — the property the whole two-view
// design rests on, since every pin bug found during hardware validation existed
// because a hardware node could be created with no board anywhere.

import type { StudioNode } from './graphStore'
import type { PhysicalBoardProfile } from '../build/boardProfiles'
import { BOARD_GPIO_BY_FQBN, pinSupports, type GpioCapability, type PinNote } from './boardGpio'
import { claimedPins } from './ledPinAssignment'

/** One pin a part needs, and what it has to be able to do. */
export interface PartPinRequest {
  /** The node property this pin lands in — `pin`, `pinA`, `i2sSck`, … */
  key: string
  /**
   * The capability the role demands. Omit for a plain digital line.
   *
   * `analogInput` is the one that bites: a potentiometer on a pin with no ADC
   * reads garbage silently, and the pin numbers differ per chip — GPIO34 is
   * ADC1 on a classic ESP32 and has no ADC at all on an S3, which is exactly
   * how the old hardcoded default came to be wrong.
   */
  capability?: GpioCapability
}

/** What a part's pins resolved to, or why they could not. */
export type PartPinAssignment =
  | { ok: true; pins: Record<string, number> }
  | { ok: false; reason: string }

function pinNotesByNumber(fqbn: string): Map<number, PinNote> {
  const table = BOARD_GPIO_BY_FQBN[fqbn]
  return new Map((table?.recommended ?? []).map((note) => [note.pin, note]))
}

/**
 * Whether `pin` can do `capability` on this board.
 *
 * An unknown pin is allowed for digital roles and refused for `analogInput`.
 * That asymmetry is deliberate: almost every exposed pin can do digital, so
 * refusing unknowns there would leave boards with no pins at all, while
 * *guessing* that an unknown pin has an ADC is how a potentiometer ends up
 * reading nothing. Silence is cheaper than a wrong answer only in the second
 * case.
 */
function pinCan(notes: Map<number, PinNote>, pin: number, capability?: GpioCapability): boolean {
  if (!capability) return true
  const note = notes.get(pin)
  if (!note) return capability !== 'analogInput'
  return pinSupports(note, capability)
}

/**
 * Pins for a new part on this board, in preference order, skipping everything
 * the graph already uses.
 *
 * Preference mirrors `nextFreeLedDataPin`: the board profile's own safe
 * general-purpose pool first, then whatever its FQBN GPIO table recommends —
 * a profile knows which pads are actually broken out, and an FQBN only names a
 * chip, so a XIAO and a DevKitC-1 look identical to the table while only the
 * profile knows the difference.
 *
 * All-or-nothing: an encoder that can only place two of its three pins is not
 * half-added, because a part with a silently missing pin is worse than an
 * action that explains why it is unavailable.
 */
export function assignPartPins(
  profile: PhysicalBoardProfile | undefined,
  fqbn: string,
  nodes: StudioNode[],
  requests: readonly PartPinRequest[],
): PartPinAssignment {
  const taken = new Set(claimedPins(nodes))
  const reserved = new Set(
    Object.keys(profile?.pinSafety?.boardReservedOrNotExposed ?? {}).map((key) => Number(key)),
  )
  const notes = pinNotesByNumber(fqbn)

  /*
   * The profile's pool is an *allowlist*, not a preference: `BoardPinSafety`
   * is explicit that a pin absent from it reports as unknown, never safe,
   * because a map derived from the chip alone "will happily recommend a pin
   * nobody can reach with a jumper wire" — the XIAO's underside pads being the
   * case that motivated it. So the FQBN table is a fallback for profiles that
   * carry no safety data at all, never a second chance for pins one excluded.
   */
  const pool = profile?.pinSafety?.safeGeneralPurpose
  const candidates: number[] = pool && pool.length > 0
    ? [...pool]
    : (BOARD_GPIO_BY_FQBN[fqbn]?.recommended ?? []).map((note) => note.pin)

  /*
   * Pins the board flags a caveat on go last, never out.
   *
   * ADC2 is the case that matters: on an ESP32-S3 analog covers GPIO1-20, but
   * 11-20 are ADC2 and stop converting the moment Wi-Fi is up. A potentiometer
   * put there works on the bench and dies silently in the install, so a clean
   * pin is preferred whenever one exists — while still offering a warned pin
   * rather than refusing, since a board with only ADC2 left can still be wired
   * by someone who knows.
   */
  const clean = candidates.filter((pin) => !notes.get(pin)?.warning)
  const warned = candidates.filter((pin) => notes.get(pin)?.warning)
  const ordered = [...clean, ...warned]

  const pins: Record<string, number> = {}
  for (const request of requests) {
    const pin = ordered.find((candidate) =>
      Number.isFinite(candidate)
      && !taken.has(candidate)
      && !reserved.has(candidate)
      && pinCan(notes, candidate, request.capability))
    if (pin === undefined) {
      return {
        ok: false,
        reason: request.capability === 'analogInput'
          ? 'No free analog-capable pin on this board'
          : 'No free GPIO on this board',
      }
    }
    pins[request.key] = pin
    // Claim it within this request too, so a part's own pins never collide.
    taken.add(pin)
  }
  return { ok: true, pins }
}
