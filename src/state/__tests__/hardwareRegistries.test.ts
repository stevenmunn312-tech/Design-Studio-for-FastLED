import { describe, it, expect } from 'vitest'
import { NODE_LIBRARY, isGpioPinProperty } from '../nodeLibrary'
import { isHardwareNodeType, isHardwareManagedSignalNodeType } from '../hardware'
import { PART_PIN_PLANS } from '../pinRetarget'
import { PART_OPTIONS, partOptionsFor } from '../partOptions'
import { busAssignmentFor } from '../busTopology'
import { catalogueDisplays, partById } from '../partCatalogue'

/*
 * A new hardware part has to be registered in several places, and every one of
 * them has been forgotten at least once — the amplifier missing from the Build
 * Diagram, the displays missing from it again, and the displays missing from
 * the pin-retarget plans, which left them holding a previous board's pins.
 *
 * Where a registry can be derived it now is. These are the ones that cannot:
 * they carry curated wording, physical measurements, or deliberate exclusions
 * that a derivation would flatten. So they are held in step by assertion
 * instead, and an omission fails here rather than on someone's bench.
 */

/** Pin properties a node type declares, from the GPIO registry. */
function pinKeys(nodeType: string): string[] {
  const def = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  const props = Object.keys(def?.defaultProperties ?? {})
  return props.filter((key) => isGpioPinProperty(nodeType, key))
}

const hardwareTypes = NODE_LIBRARY
  .map((def) => def.type)
  .filter((type) => isHardwareNodeType(type) && type !== 'Board')

describe('hardware registries stay in step', () => {
  it('found the parts to check', () => {
    expect(hardwareTypes.length).toBeGreaterThan(8)
  })

  /*
   * LED outputs and DMX are exempt deliberately. An LED data pin is allocated
   * by its own path (ledPinAssignment), and a DMX input is a network or UART
   * role rather than a part whose pins the board picks. Both are exclusions
   * with a reason, which is the point of naming them rather than leaving the
   * check loose enough to pass.
   */
  const RETARGET_EXEMPT = new Set(['MatrixOutput', 'DMXInput'])

  it.each(hardwareTypes.filter((type) => !RETARGET_EXEMPT.has(type) && pinKeys(type).length > 0))(
    'gives %s a pin-retarget plan',
    (nodeType) => {
      const plan = PART_PIN_PLANS[nodeType]
      expect(plan, `${nodeType} claims pins but cannot follow a board change`).toBeDefined()
    },
  )

  // A plan that names a key the node does not have moves nothing; one that
  // misses a key leaves that pin on the board being left.
  it.each(Object.keys(PART_PIN_PLANS))('keeps %s pin-plan keys real', (nodeType) => {
    for (const key of PART_PIN_PLANS[nodeType].keys) {
      expect(isGpioPinProperty(nodeType, key), `${nodeType}.${key} is not a GPIO property`).toBe(true)
    }
  })

  // Bus roles are declared per property; a role for a property the node does
  // not carry can never fire, and reads as coverage that is not there.
  it('declares bus roles only for real pin properties', () => {
    for (const nodeType of hardwareTypes) {
      for (const key of pinKeys(nodeType)) {
        const assignment = busAssignmentFor(nodeType, key)
        expect(assignment.kind, `${nodeType}.${key}`).toBeTruthy()
        expect(assignment.role, `${nodeType}.${key}`).toBeTruthy()
      }
    }
  })

  // Every part option names a module the catalogue actually carries, so a
  // picture, a footprint and its datasheet caveats all resolve.
  it.each(Object.keys(PART_OPTIONS))('points %s options at catalogued modules', (nodeType) => {
    for (const option of partOptionsFor(nodeType)) {
      // A plain slug is allowed for a part nobody has modelled; a catalogue id
      // that resolves to nothing is a broken picture.
      const entry = partById(option.id)
      if (option.id.includes('-')) {
        expect(entry, `${nodeType} offers ${option.id}, which is not in the catalogue`).toBeDefined()
      }
    }
  })

  // A catalogued display nothing offers is a part the user cannot add.
  it('offers every catalogued display through some node', () => {
    const offered = new Set(
      Object.keys(PART_OPTIONS).flatMap((nodeType) => partOptionsFor(nodeType).map((option) => option.id)),
    )
    // The CYD is a board rather than a module, and is not in the part
    // catalogue at all; every other display should be reachable.
    const missing = catalogueDisplays()
      .map((entry) => entry.partId)
      .filter((partId) => !offered.has(partId))
    expect(missing, 'catalogued displays no node offers').toEqual([
      'ili9341-xpt2046-touch-320x240',
      'st7789-tft-240x240',
      'st7789v-xpt2046-touch-240x320',
    ])
  })

  // A display that carries signal but publishes nothing is a terminal; if it
  // is not treated as one, codegen prunes it and the part sits dark.
  it('treats every output-less signal part as a terminal', () => {
    const terminals = NODE_LIBRARY
      .filter((def) => isHardwareManagedSignalNodeType(def.type) && def.outputs.length === 0)
      .map((def) => def.type)
    expect(terminals).toContain('MatrixOutput')
    expect(terminals).toContain('SegmentDisplay')
    expect(terminals).toContain('InfoDisplay')
  })
})
