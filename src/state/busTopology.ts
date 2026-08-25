// What a claimed GPIO actually *is*, so validation can tell a shared bus from a
// collision.
//
// The rule this replaces was "a GPIO claimed twice is an error", with one
// narrow exemption for mirrored LED outputs. That held while every part owned
// its pins outright. It stops holding the moment a build has two I2C devices —
// an RTC and an OLED share SDA and SCL by design, and a validator that calls
// that a fault teaches the user to ignore it, which is worse than not checking.
//
// Bus *instance* is derived from the pins rather than declared. Two SPI devices
// are on the same bus when they share a clock line; two I2C devices are on the
// same bus when they share both SDA and SCL. Deriving it means a board model
// that gains a second SPI host needs no change here, and it cannot disagree
// with the wiring the user actually entered.

/** The electrical contract a pin use belongs to. */
export type BusKind = 'i2c' | 'spi' | 'i2s' | 'led' | 'none'

/**
 * What the pin does within that contract.
 *
 * `exclusive` is everything a peer may not co-drive: chip selects, reset,
 * data/command, backlight, interrupt lines, a button, a potentiometer.
 */
export type BusRole = 'sda' | 'scl' | 'sck' | 'mosi' | 'miso' | 'cs' | 'exclusive'

/** Roles a second device on the same bus may legitimately also drive. */
const SHAREABLE_ROLES: ReadonlySet<BusRole> = new Set<BusRole>(['sda', 'scl', 'sck', 'mosi', 'miso'])

export function isShareableRole(role: BusRole): boolean {
  return SHAREABLE_ROLES.has(role)
}

export interface BusAssignment {
  kind: BusKind
  role: BusRole
}

/**
 * Bus role per node type and pin property.
 *
 * Keyed by property rather than declared on the port, because these are
 * hardware fields with no port — an SD card carries no signal edge, and a
 * display's reset line never will. Adding a display part means adding rows
 * here; nothing else in this module needs to change.
 */
const BUS_ASSIGNMENTS: Record<string, Record<string, BusAssignment>> = {
  RTCInput: {
    sdaPin: { kind: 'i2c', role: 'sda' },
    sclPin: { kind: 'i2c', role: 'scl' },
  },
  // A TM1637 has two wires and no addresses, so it is not I2C however much the
  // pin count suggests it. Two modules cannot share a pair — each needs its
  // own — which is exactly what an exclusive role means.
  SegmentDisplay: {
    clkPin: { kind: 'none', role: 'exclusive' },
    dioPin: { kind: 'none', role: 'exclusive' },
  },
  SDCard: {
    sdCsPin: { kind: 'spi', role: 'cs' },
    sdSckPin: { kind: 'spi', role: 'sck' },
    sdMosiPin: { kind: 'spi', role: 'mosi' },
    sdMisoPin: { kind: 'spi', role: 'miso' },
  },
  // I2S lines stay exclusive. A capture and a playback peripheral can share a
  // clock on some parts, but the generated firmware configures each peripheral
  // independently and has never been tested driving one shared clock — so the
  // model says exclusive until a bench result says otherwise. Claiming a
  // sharing capability the firmware does not implement is the failure mode
  // this whole module exists to avoid.
  MicInput: {
    i2sWs: { kind: 'i2s', role: 'exclusive' },
    i2sSck: { kind: 'i2s', role: 'exclusive' },
    i2sSd: { kind: 'i2s', role: 'exclusive' },
  },
  LineInput: {
    i2sMclk: { kind: 'i2s', role: 'exclusive' },
    i2sBclk: { kind: 'i2s', role: 'exclusive' },
    i2sLrclk: { kind: 'i2s', role: 'exclusive' },
    i2sDout: { kind: 'i2s', role: 'exclusive' },
  },
  Amplifier: {
    i2sBclk: { kind: 'i2s', role: 'exclusive' },
    i2sLrc: { kind: 'i2s', role: 'exclusive' },
    i2sDout: { kind: 'i2s', role: 'exclusive' },
  },
}

/**
 * A device's fixed I2C address, where the part has one.
 *
 * Fixed rather than a user field, following the part-options rule that a
 * dropdown is offered only where a choice genuinely exists: a DS3231 answers on
 * 0x68 and nothing the user does changes that. A part whose address *is*
 * strappable gets a `PART_FIELDS` entry and reads it from `props` here.
 */
export function i2cAddressFor(nodeType: string, props: Record<string, unknown>): number | null {
  // A strappable part carries its own setting; the fixed-address parts below
  // ignore it because nothing the user does changes what they answer to.
  const configured = Number(props.i2cAddress)
  if (Number.isInteger(configured) && configured >= 0x08 && configured <= 0x77) return configured
  if (nodeType === 'RTCInput') return 0x68
  return null
}

/** The bus contract for one pin use, or a plain exclusive claim. */
export function busAssignmentFor(nodeType: string, propertyKey: string): BusAssignment {
  const assignment = BUS_ASSIGNMENTS[nodeType]?.[propertyKey]
  if (assignment) return assignment
  // LED data and clock lines are their own thing: FastLED drives them directly
  // rather than through a shared SPI peripheral, so a second device on the same
  // pins is a collision even for an SPI chipset.
  if (nodeType === 'MatrixOutput') return { kind: 'led', role: 'exclusive' }
  return { kind: 'none', role: 'exclusive' }
}

/** The minimum a pin use has to carry for this module to judge it. */
export interface BusPinUse {
  label: string
  nodeId: string
  nodeType: string
  propertyKey: string
  pin: number
}

export type PinCollisionReason =
  /** Neither use may share the pin with anything. */
  | 'exclusive'
  /** One use is a shareable bus line, the other is not — or they disagree on
   *  which kind of bus it is. */
  | 'mixed-role'
  /** Both are chip selects on the same SPI bus. */
  | 'duplicate-cs'

export interface PinCollision {
  pin: number
  reason: PinCollisionReason
  uses: BusPinUse[]
}

export interface AddressCollision {
  address: number
  /** The SDA/SCL pair the colliding devices share. */
  sda: number
  scl: number
  uses: BusPinUse[]
}

/**
 * Every genuine pin collision in `uses`.
 *
 * `exempt` holds `nodeId:propertyKey` keys the caller has already decided are
 * deliberately shared — today, a mirrored LED output's data pin.
 *
 * The one walk both `findPinConflicts` and `buildGraphDiagnostics` call. They
 * were separate loops over the same data once and drifted, leaving the Graph
 * Health drawer calling a deliberately shared pin an error after deploy
 * validation had stopped doing so.
 */
export function findPinCollisions(
  uses: readonly BusPinUse[],
  exempt: ReadonlySet<string> = new Set(),
): PinCollision[] {
  const byPin = new Map<number, BusPinUse[]>()
  for (const use of uses) {
    if (exempt.has(`${use.nodeId}:${use.propertyKey}`)) continue
    const list = byPin.get(use.pin)
    if (list) list.push(use)
    else byPin.set(use.pin, [use])
  }

  const collisions: PinCollision[] = []
  for (const [pin, pinUses] of [...byPin].sort(([a], [b]) => a - b)) {
    if (pinUses.length < 2) continue
    const assignments = pinUses.map((use) => busAssignmentFor(use.nodeType, use.propertyKey))

    const allShareable = assignments.every((a) => isShareableRole(a.role))
    if (!allShareable) {
      // A shareable line meeting an exclusive one is not the same fault as two
      // exclusive claims, and the repair differs: move the exclusive pin, or
      // rethink the wiring entirely.
      const anyShareable = assignments.some((a) => isShareableRole(a.role))
      const allCs = assignments.every((a) => a.role === 'cs')
      collisions.push({
        pin,
        reason: allCs ? 'duplicate-cs' : anyShareable ? 'mixed-role' : 'exclusive',
        uses: pinUses,
      })
      continue
    }

    // Every use is a shareable line. They still have to agree on which bus and
    // which line: SPI clock and I2C clock on one pin is two peripherals fighting
    // over it, not one shared bus.
    const sameKind = assignments.every((a) => a.kind === assignments[0].kind)
    const sameRole = assignments.every((a) => a.role === assignments[0].role)
    if (!sameKind || !sameRole) {
      collisions.push({ pin, reason: 'mixed-role', uses: pinUses })
    }
  }
  return collisions
}

/**
 * I2C devices sharing a bus and an address.
 *
 * Sharing SDA and SCL is correct; answering to the same address on them is not,
 * and it is the one I2C fault that looks exactly like a wiring problem from the
 * outside. Devices on different SDA/SCL pairs are different buses and may reuse
 * an address freely.
 */
export function findI2cAddressCollisions(
  devices: readonly { nodeId: string; nodeType: string; props: Record<string, unknown>; uses: readonly BusPinUse[] }[],
): AddressCollision[] {
  const byBusAddress = new Map<string, { address: number; sda: number; scl: number; uses: BusPinUse[] }>()

  for (const device of devices) {
    const address = i2cAddressFor(device.nodeType, device.props)
    if (address === null) continue
    const sda = device.uses.find((use) => busAssignmentFor(use.nodeType, use.propertyKey).role === 'sda')
    const scl = device.uses.find((use) => busAssignmentFor(use.nodeType, use.propertyKey).role === 'scl')
    if (!sda || !scl) continue

    const key = `${sda.pin}:${scl.pin}:${address}`
    const entry = byBusAddress.get(key)
    if (entry) entry.uses.push(sda)
    else byBusAddress.set(key, { address, sda: sda.pin, scl: scl.pin, uses: [sda] })
  }

  return [...byBusAddress.values()]
    .filter((entry) => entry.uses.length > 1)
    
    .sort((a, b) => a.address - b.address)
}

/** Hex form used in every user-facing address message. */
export function formatI2cAddress(address: number): string {
  return `0x${address.toString(16).toUpperCase().padStart(2, '0')}`
}

/**
 * What the user should change, named per fault.
 *
 * "GPIO 21 is assigned to more than one pin" describes the collision without
 * helping anyone repair it, which is how a validation message becomes noise.
 */
export function pinCollisionFix(reason: PinCollisionReason): string {
  switch (reason) {
    case 'duplicate-cs':
      return 'Give each device on the bus its own chip-select pin — the select line is how the board picks which one it is talking to.'
    case 'mixed-role':
      return 'One of these is a shared bus line and the other is not, so they cannot share the pin. Move the non-bus role to a free GPIO.'
    case 'exclusive':
      return 'Assign a unique GPIO number to every listed hardware role.'
  }
}

export function pinCollisionTitle(collision: PinCollision): string {
  switch (collision.reason) {
    case 'duplicate-cs':
      return `GPIO ${collision.pin} is the chip select for two devices`
    case 'mixed-role':
      return `GPIO ${collision.pin} mixes a shared bus line with another role`
    case 'exclusive':
      return `GPIO ${collision.pin} is assigned twice`
  }
}

/** One-line form for the deploy-validation list. */
export function pinCollisionMessage(collision: PinCollision): string {
  const labels = collision.uses.map((use) => use.label).join(', ')
  switch (collision.reason) {
    case 'duplicate-cs':
      return `GPIO ${collision.pin} is the chip select for more than one device: ${labels}`
    case 'mixed-role':
      return `GPIO ${collision.pin} mixes a shared bus line with another role: ${labels}`
    case 'exclusive':
      return `GPIO ${collision.pin} is assigned to more than one pin: ${labels}`
  }
}

export function addressCollisionMessage(collision: AddressCollision): string {
  const labels = collision.uses.map((use) => use.label.replace(/ SDA$/, '')).join(', ')
  return `I2C address ${formatI2cAddress(collision.address)} answers for more than one device on SDA ${collision.sda} / SCL ${collision.scl}: ${labels}`
}
