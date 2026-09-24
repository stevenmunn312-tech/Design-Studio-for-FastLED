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
import {
  BOARD_GPIO_BY_FQBN,
  pinSupports,
  pinWarningForCapability,
  type GpioCapability,
  type PinNote,
} from './boardGpio'
import { collectPinUses, type HardwarePinUse } from '../build/hardwareManifest'

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
  const uses = collectPinUses(nodes)
  const taken = new Set(uses.map((use) => use.pin))
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

  const pins: Record<string, number> = {}
  // Analog is the stricter capability: every analog-capable pin can also drive
  // a digital line, but not the reverse. Assigning digital first on a mixed
  // part (the XC4630's four touch electrodes plus nine strobes) lets the
  // strobes eat the ADC pins and then reports "no analog pin" on a board that
  // still had four. Analog first is the same order `assignPartPins` already
  // uses within a capability — clean, then warned — one level up.
  const ordered = [...requests].sort((left, right) => (
    Number(left.capability === 'analogInput' ? 0 : 1)
    - Number(right.capability === 'analogInput' ? 0 : 1)
  ))
  for (const request of ordered) {
    // A caveat is role-specific. ADC2 is a poor automatic choice for an
    // analog input while Wi-Fi is active, but it is an ordinary GPIO for I2S,
    // SPI, and LED data. Keep applicable caveats last without penalising a
    // perfectly safe digital use of the same pad.
    const clean = candidates.filter((pin) => {
      const note = notes.get(pin)
      return !note || !pinWarningForCapability(note, request.capability)
    })
    const warned = candidates.filter((pin) => {
      const note = notes.get(pin)
      return Boolean(note && pinWarningForCapability(note, request.capability))
    })
    const ordered = [...clean, ...warned]
    const pin = ordered.find((candidate) =>
      Number.isFinite(candidate)
      && !taken.has(candidate)
      && !reserved.has(candidate)
      && pinCan(notes, candidate, request.capability))
    if (pin === undefined) {
      return {
        ok: false,
        reason: noPinReason({ profile, pool, notes, reserved, uses, request, requestCount: requests.length }),
      }
    }
    pins[request.key] = pin
    // Claim it within this request too, so a part's own pins never collide.
    taken.add(pin)
  }
  return { ok: true, pins }
}

/** A board's spare pins: its allowlist, less anything it reserves. */
export function boardSparePins(
  profile: PhysicalBoardProfile | undefined,
  claimed: ReadonlySet<number>,
): number[] | null {
  const pool = profile?.pinSafety?.safeGeneralPurpose
  if (!pool || pool.length === 0) return null
  const reserved = profile?.pinSafety?.boardReservedOrNotExposed ?? {}
  return pool.filter((pin) => !(String(pin) in reserved) && !claimed.has(pin))
}

/** "GPIO 22 by Button, GPIO 27 by Real Time Clock SDA" */
function holderList(pins: readonly number[], uses: readonly HardwarePinUse[]): string {
  return pins.map((pin) => {
    // Pins handed out earlier in a retarget pass arrive as stand-in nodes;
    // they have no name worth repeating.
    const holder = uses.find((use) => use.pin === pin && !use.nodeId.startsWith('__claimed-'))
    return holder ? `GPIO ${pin} by ${holder.label}` : `GPIO ${pin}`
  }).join(', ')
}

/**
 * Why a part cannot be placed, in the board's own words.
 *
 * A profile that states its pad allowlist knows exactly which pins exist, so
 * it can say the board is full and who is holding the pins. A CYD brings out
 * two, and "No free GPIO on this board" read as a fault rather than a count.
 * Without that allowlist the pool came from the chip table, which is not a
 * claim about the board, so the message stays general.
 */
function noPinReason({ profile, pool, notes, reserved, uses, request, requestCount }: {
  profile: PhysicalBoardProfile | undefined
  pool: readonly number[] | undefined
  notes: Map<number, PinNote>
  reserved: ReadonlySet<number>
  uses: readonly HardwarePinUse[]
  request: PartPinRequest
  requestCount: number
}): string {
  const analog = request.capability === 'analogInput'
  if (!profile || !pool || pool.length === 0) {
    return analog ? 'No free analog-capable pin on this board' : 'No free GPIO on this board'
  }
  const board = `The ${profile.label}`
  const taken = new Set(uses.map((use) => use.pin))
  const usable = pool.filter((pin) => !reserved.has(pin) && pinCan(notes, pin, request.capability))
  if (analog && usable.length === 0) return `${board} has no pin listed as analog-capable`
  const spare = usable.filter((pin) => !taken.has(pin))
  const inUse = usable.filter((pin) => taken.has(pin))
  if (spare.length === 0) {
    return `${board} is full: its ${analog ? 'analog-capable ' : ''}spare pins are all in use `
      + `(${holderList(inUse, uses)}). Remove a part to free one.`
  }
  // Some pins are left, just not enough for every line this part needs.
  const left = spare.length === 1 ? '1 spare pin' : `${spare.length} spare pins`
  return `${board} has ${left} left (${spare.map((pin) => `GPIO ${pin}`).join(', ')}) `
    + `and this part needs ${requestCount}. Remove a part to free more.`
}
