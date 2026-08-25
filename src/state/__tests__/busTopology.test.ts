import { describe, it, expect } from 'vitest'
import {
  busAssignmentFor,
  isShareableRole,
  i2cAddressFor,
  findPinCollisions,
  findI2cAddressCollisions,
  pinCollisionMessage,
  pinCollisionFix,
  pinCollisionTitle,
  addressCollisionMessage,
  formatI2cAddress,
  type BusPinUse,
} from '../busTopology'

function pinUse(nodeId: string, nodeType: string, propertyKey: string, pin: number, label = `${nodeId} ${propertyKey}`): BusPinUse {
  return { label, nodeId, nodeType, propertyKey, pin }
}

// Stand-ins for the display parts the next slice adds. They are declared here
// rather than in busTopology so this file proves the *rules*, not a particular
// part list — an OLED and a TFT are just an I2C client and an SPI client.
const OLED = 'RTCInput'       // I2C: sdaPin / sclPin
const CARD = 'SDCard'         // SPI: sdSckPin / sdMosiPin / sdMisoPin / sdCsPin

describe('bus assignment', () => {
  it('knows the shared lines from the exclusive ones', () => {
    expect(busAssignmentFor('RTCInput', 'sdaPin')).toEqual({ kind: 'i2c', role: 'sda' })
    expect(busAssignmentFor('SDCard', 'sdSckPin')).toEqual({ kind: 'spi', role: 'sck' })
    expect(busAssignmentFor('SDCard', 'sdCsPin')).toEqual({ kind: 'spi', role: 'cs' })
    expect(isShareableRole('sck')).toBe(true)
    expect(isShareableRole('cs')).toBe(false)
    expect(isShareableRole('exclusive')).toBe(false)
  })

  // FastLED drives LED lines directly rather than through a shared peripheral,
  // so an SPI chipset's clock is still not a bus anyone else may join.
  it('treats LED data and clock as exclusive even for SPI chipsets', () => {
    expect(busAssignmentFor('MatrixOutput', 'dataPin')).toEqual({ kind: 'led', role: 'exclusive' })
    expect(busAssignmentFor('MatrixOutput', 'clockPin')).toEqual({ kind: 'led', role: 'exclusive' })
  })

  it('treats an unknown pin property as an exclusive claim', () => {
    expect(busAssignmentFor('ButtonInput', 'pin')).toEqual({ kind: 'none', role: 'exclusive' })
    expect(busAssignmentFor('SomeFuturePart', 'resetPin')).toEqual({ kind: 'none', role: 'exclusive' })
  })

  it('keeps I2S exclusive until a bench result says otherwise', () => {
    expect(busAssignmentFor('MicInput', 'i2sSck').role).toBe('exclusive')
    expect(busAssignmentFor('Amplifier', 'i2sBclk').role).toBe('exclusive')
  })
})

describe('findPinCollisions', () => {
  it('accepts two I2C clients sharing SDA and SCL', () => {
    const uses = [
      pinUse('rtc', OLED, 'sdaPin', 21), pinUse('rtc', OLED, 'sclPin', 22),
      pinUse('oled', OLED, 'sdaPin', 21), pinUse('oled', OLED, 'sclPin', 22),
    ]
    expect(findPinCollisions(uses)).toEqual([])
  })

  it('accepts two SPI clients sharing SCK, MOSI, and MISO with distinct selects', () => {
    const uses = [
      pinUse('sd', CARD, 'sdSckPin', 18), pinUse('sd', CARD, 'sdMosiPin', 23),
      pinUse('sd', CARD, 'sdMisoPin', 19), pinUse('sd', CARD, 'sdCsPin', 5),
      pinUse('tft', CARD, 'sdSckPin', 18), pinUse('tft', CARD, 'sdMosiPin', 23),
      pinUse('tft', CARD, 'sdMisoPin', 19), pinUse('tft', CARD, 'sdCsPin', 15),
    ]
    expect(findPinCollisions(uses)).toEqual([])
  })

  // The TFT-plus-SD case: sharing the data lines is right, sharing the select
  // is not — the select is how the board says which device it is talking to.
  it('rejects two SPI clients sharing a chip select', () => {
    const uses = [
      pinUse('sd', CARD, 'sdSckPin', 18), pinUse('sd', CARD, 'sdCsPin', 5),
      pinUse('tft', CARD, 'sdSckPin', 18), pinUse('tft', CARD, 'sdCsPin', 5),
    ]
    const collisions = findPinCollisions(uses)
    expect(collisions).toHaveLength(1)
    expect(collisions[0]).toMatchObject({ pin: 5, reason: 'duplicate-cs' })
  })

  it('rejects a shared bus line colliding with an exclusive role', () => {
    const uses = [
      pinUse('sd', CARD, 'sdSckPin', 18),
      pinUse('led', 'MatrixOutput', 'dataPin', 18),
    ]
    const collisions = findPinCollisions(uses)
    expect(collisions).toHaveLength(1)
    expect(collisions[0]).toMatchObject({ pin: 18, reason: 'mixed-role' })
  })

  // One pin cannot be an SPI clock and an I2C clock at once, however
  // shareable each of those is on its own bus.
  it('rejects two different bus kinds meeting on one pin', () => {
    const uses = [
      pinUse('sd', CARD, 'sdSckPin', 22),
      pinUse('rtc', OLED, 'sclPin', 22),
    ]
    const collisions = findPinCollisions(uses)
    expect(collisions).toHaveLength(1)
    expect(collisions[0]).toMatchObject({ pin: 22, reason: 'mixed-role' })
  })

  it('rejects two shareable lines of different roles on one pin', () => {
    const uses = [
      pinUse('sd', CARD, 'sdSckPin', 18),
      pinUse('tft', CARD, 'sdMosiPin', 18),
    ]
    expect(findPinCollisions(uses)[0]).toMatchObject({ pin: 18, reason: 'mixed-role' })
  })

  it('still rejects two plain exclusive claims', () => {
    const uses = [
      pinUse('mic', 'MicInput', 'i2sWs', 5),
      pinUse('led', 'MatrixOutput', 'dataPin', 5),
    ]
    expect(findPinCollisions(uses)[0]).toMatchObject({ pin: 5, reason: 'exclusive' })
  })

  it('honours the deliberate-sharing exemption', () => {
    const uses = [
      pinUse('a', 'MatrixOutput', 'dataPin', 5),
      pinUse('b', 'MatrixOutput', 'dataPin', 5),
    ]
    expect(findPinCollisions(uses)).toHaveLength(1)
    expect(findPinCollisions(uses, new Set(['b:dataPin']))).toEqual([])
  })

  it('reports collisions in ascending pin order', () => {
    const uses = [
      pinUse('x', 'ButtonInput', 'pin', 9), pinUse('y', 'ButtonInput', 'pin', 9),
      pinUse('p', 'ButtonInput', 'pin', 4), pinUse('q', 'ButtonInput', 'pin', 4),
    ]
    expect(findPinCollisions(uses).map((c) => c.pin)).toEqual([4, 9])
  })

  it('leaves a single use on a pin alone', () => {
    expect(findPinCollisions([pinUse('a', 'ButtonInput', 'pin', 4)])).toEqual([])
  })
})

describe('findI2cAddressCollisions', () => {
  const device = (nodeId: string, sda: number, scl: number) => ({
    nodeId,
    nodeType: OLED,
    props: {},
    uses: [pinUse(nodeId, OLED, 'sdaPin', sda, `${nodeId} SDA`), pinUse(nodeId, OLED, 'sclPin', scl, `${nodeId} SCL`)],
  })

  it('knows the fixed address of a part that has one', () => {
    expect(i2cAddressFor('RTCInput', {})).toBe(0x68)
    expect(i2cAddressFor('ButtonInput', {})).toBeNull()
  })

  it('prefers a strappable address over the fixed one', () => {
    expect(i2cAddressFor('SomeOled', { i2cAddress: 0x3c })).toBe(0x3c)
    // Outside the 7-bit range a device can answer on, so not an address.
    expect(i2cAddressFor('SomeOled', { i2cAddress: 0x80 })).toBeNull()
    expect(i2cAddressFor('SomeOled', { i2cAddress: 'nonsense' })).toBeNull()
  })

  it('rejects two devices answering the same address on one bus', () => {
    const collisions = findI2cAddressCollisions([device('rtc-a', 21, 22), device('rtc-b', 21, 22)])
    expect(collisions).toHaveLength(1)
    expect(collisions[0]).toMatchObject({ address: 0x68, sda: 21, scl: 22 })
    expect(collisions[0].uses).toHaveLength(2)
  })

  // Different SDA/SCL pairs are different buses, and an address only has to be
  // unique on the bus it answers on.
  it('accepts the same address on two separate buses', () => {
    expect(findI2cAddressCollisions([device('rtc-a', 21, 22), device('rtc-b', 32, 33)])).toEqual([])
  })

  it('ignores a device with no address of its own', () => {
    const anonymous = { nodeId: 'x', nodeType: 'ButtonInput', props: {}, uses: [] }
    expect(findI2cAddressCollisions([device('rtc-a', 21, 22), anonymous])).toEqual([])
  })

  it('formats an address as the hex the datasheet prints', () => {
    expect(formatI2cAddress(0x68)).toBe('0x68')
    expect(formatI2cAddress(0x3c)).toBe('0x3C')
    expect(formatI2cAddress(0x8)).toBe('0x08')
  })
})

describe('repair-oriented messages', () => {
  // "GPIO 21 is assigned to more than one pin" states the collision without
  // helping anyone repair it, which is how a validation message becomes noise.
  it('names a different repair for each fault', () => {
    const csFix = pinCollisionFix('duplicate-cs')
    const mixedFix = pinCollisionFix('mixed-role')
    const exclusiveFix = pinCollisionFix('exclusive')
    expect(new Set([csFix, mixedFix, exclusiveFix]).size).toBe(3)
    expect(csFix).toContain('chip-select')
    expect(mixedFix).toContain('shared bus line')
  })

  it('names the pin and both parts in every message', () => {
    const uses = [
      pinUse('sd', CARD, 'sdCsPin', 5, 'SD Card CS pin'),
      pinUse('tft', CARD, 'sdCsPin', 5, 'Display CS pin'),
    ]
    const message = pinCollisionMessage(findPinCollisions(uses)[0])
    expect(message).toContain('GPIO 5')
    expect(message).toContain('SD Card CS pin')
    expect(message).toContain('Display CS pin')
    expect(pinCollisionTitle(findPinCollisions(uses)[0])).toContain('chip select')
  })

  it('names the bus and address in an address message', () => {
    const devices = [21, 21].map((sda, i) => ({
      nodeId: `rtc-${i}`,
      nodeType: OLED,
      props: {},
      uses: [pinUse(`rtc-${i}`, OLED, 'sdaPin', sda, `Clock ${i} SDA`), pinUse(`rtc-${i}`, OLED, 'sclPin', 22)],
    }))
    const message = addressCollisionMessage(findI2cAddressCollisions(devices)[0])
    expect(message).toContain('0x68')
    expect(message).toContain('SDA 21')
    expect(message).toContain('SCL 22')
    // The " SDA" suffix is stripped so the message names devices, not pins.
    expect(message).toContain('Clock 0')
    expect(message).not.toContain('Clock 0 SDA')
  })
})
