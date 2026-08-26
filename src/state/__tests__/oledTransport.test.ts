import { describe, it, expect } from 'vitest'
import {
  OLED_TRANSPORT_PINS, OLED_I2C_ADDRESSES, OLED_I2C_ADDRESS_OPTIONS,
  DEFAULT_OLED_I2C_ADDRESS, asOledAddress, oledAddressLabel, oledTransportFor,
} from '../oledSurface'
import { isPropertyEnabled, isGpioPinProperty, libraryDefaults, oledTransportForProps } from '../nodeLibrary'
import { busAssignmentFor, findI2cAddressCollisions, findPinCollisions } from '../busTopology'
import { retargetHardwarePins } from '../pinRetarget'
import { partById } from '../partCatalogue'
import { collectPinUses, buildHardwareManifest } from '../../build/hardwareManifest'
import { boardProfileById } from '../../build/boardProfiles'
import { boardI2cDefault } from '../../build/boardI2cDefaults'
import { findDisplayGeneratorIssues, findPinConflicts } from '../../utils/validateGraph'
import type { StudioNode } from '../graphStore'

const SH1106 = 'sh1106-oled-128x64'
const SSD1306 = 'ssd1306-oled-128x64'
const CLASSIC = 'esp32-generic-devkit-38pin'
const S3 = 'espressif-esp32-s3-devkitc-1'
const S3_FQBN = 'esp32:esp32:esp32s3'

function node(id: string, nodeType: string, props: Record<string, unknown> = {}): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: nodeType,
      nodeType,
      category: 'output',
      properties: { ...libraryDefaults(nodeType), ...props },
      inputs: [],
      outputs: [],
    },
  } as unknown as StudioNode
}

const oled = (id: string, props: Record<string, unknown> = {}) => node(id, 'InfoDisplay', props)
const ds3231 = (props: Record<string, unknown> = {}) =>
  node('rtc', 'RTCInput', { timeSource: 'DS3231', sdaPin: 21, sclPin: 22, ...props })

describe('reading the transport off the catalogue', () => {
  /*
   * The two modules that ship, pinned to the answer they need.
   *
   * `oledTransportFor` reads free text an asset import writes, so a re-imported
   * catalogue that reworded an interface could silently flip a module onto the
   * wrong wires. That would fail on a bench, at the point where a dark panel
   * looks like a bad solder joint. It fails here instead.
   */
  it('puts each shipped module on the wires it actually has', () => {
    expect(oledTransportForProps({ partId: SH1106 })).toBe('spi')
    expect(oledTransportForProps({ partId: SSD1306 })).toBe('i2c')
  })

  // The SSD1306 breakout says what it could do after saying what it is.
  it('believes the leading token, not a parenthetical', () => {
    expect(partById(SSD1306)?.display?.interface).toMatch(/^I2C/)
    expect(oledTransportFor('I2C (SPI-capable breakout)')).toBe('i2c')
    expect(oledTransportFor('4-wire SPI')).toBe('spi')
  })

  // An unrecognised module driven as SPI stays dark; driven as I2C it could
  // talk over a bus another device is on.
  it('falls back to SPI for an interface it cannot read', () => {
    expect(oledTransportFor(undefined)).toBe('spi')
    expect(oledTransportFor('')).toBe('spi')
    expect(oledTransportFor('parallel 8080')).toBe('spi')
  })

  it('gives each transport the pins its header brings out', () => {
    expect(OLED_TRANSPORT_PINS.spi).toEqual(['csPin', 'dcPin', 'resetPin', 'sckPin', 'mosiPin'])
    expect(OLED_TRANSPORT_PINS.i2c).toEqual(['sdaPin', 'sclPin'])
  })
})

describe('the strappable address', () => {
  it('reads back the label it stores', () => {
    expect(OLED_I2C_ADDRESS_OPTIONS).toEqual(['0x3C', '0x3D'])
    expect(asOledAddress('0x3C')).toBe(0x3c)
    expect(asOledAddress('0x3D')).toBe(0x3d)
  })

  it('takes a raw number too, for a workspace that stored one', () => {
    expect(asOledAddress(0x3d)).toBe(0x3d)
  })

  // A module answers on one of two addresses and no others, so anything else
  // becomes the default rather than being written onto the bus.
  it('refuses an address no module answers to', () => {
    expect(asOledAddress(0x68)).toBe(DEFAULT_OLED_I2C_ADDRESS)
    expect(asOledAddress('nonsense')).toBe(DEFAULT_OLED_I2C_ADDRESS)
    expect(asOledAddress(undefined)).toBe(DEFAULT_OLED_I2C_ADDRESS)
  })

  it('prints it the way the silkscreen does', () => {
    expect(OLED_I2C_ADDRESSES.map(oledAddressLabel)).toEqual(OLED_I2C_ADDRESS_OPTIONS)
  })
})

describe('which settings a module offers', () => {
  // Offering a CS field beside a 4-pin module invites running a jumper to a pad
  // that is not there.
  it('offers only the chosen module\'s wires', () => {
    const spi = { partId: SH1106 }
    const i2c = { partId: SSD1306 }
    for (const key of OLED_TRANSPORT_PINS.spi) {
      expect(isPropertyEnabled('InfoDisplay', key, spi), key).toBe(true)
      expect(isPropertyEnabled('InfoDisplay', key, i2c), key).toBe(false)
    }
    for (const key of OLED_TRANSPORT_PINS.i2c) {
      expect(isPropertyEnabled('InfoDisplay', key, spi), key).toBe(false)
      expect(isPropertyEnabled('InfoDisplay', key, i2c), key).toBe(true)
    }
  })

  it('offers an address only where one is answered to', () => {
    expect(isPropertyEnabled('InfoDisplay', 'i2cAddress', { partId: SSD1306 })).toBe(true)
    expect(isPropertyEnabled('InfoDisplay', 'i2cAddress', { partId: SH1106 })).toBe(false)
  })

  // Both sets persist so switching module and back does not lose the wiring
  // already entered.
  it('keeps both headers on the node', () => {
    const defaults = libraryDefaults('InfoDisplay')
    for (const key of [...OLED_TRANSPORT_PINS.spi, ...OLED_TRANSPORT_PINS.i2c]) {
      expect(defaults[key], key).toBeTypeOf('number')
      expect(isGpioPinProperty('InfoDisplay', key), key).toBe(true)
    }
  })

  it('declares a bus role for both headers', () => {
    expect(busAssignmentFor('InfoDisplay', 'sdaPin')).toEqual({ kind: 'i2c', role: 'sda' })
    expect(busAssignmentFor('InfoDisplay', 'sclPin')).toEqual({ kind: 'i2c', role: 'scl' })
    expect(busAssignmentFor('InfoDisplay', 'csPin')).toEqual({ kind: 'spi', role: 'cs' })
  })
})

describe('the pins a module reserves', () => {
  it('claims two wires for an I2C module and five for an SPI one', () => {
    const i2c = collectPinUses([oled('a', { partId: SSD1306 })])
    expect(i2c.map((use) => use.propertyKey).sort()).toEqual(['sclPin', 'sdaPin'])

    const spi = collectPinUses([oled('b', { partId: SH1106 })])
    expect(spi.map((use) => use.propertyKey).sort())
      .toEqual([...OLED_TRANSPORT_PINS.spi].sort())
  })

  // The failure this prevents: five pins held for a module with two, so the
  // next part is refused pins nothing is actually using.
  it('does not hold the header the module does not have', () => {
    const uses = collectPinUses([oled('a', { partId: SSD1306, csPin: 5, dcPin: 16 })])
    expect(uses.some((use) => use.propertyKey === 'csPin')).toBe(false)
  })

  it('reports the transport and address it resolved', () => {
    const manifest = buildHardwareManifest(
      [oled('a', { partId: SSD1306, i2cAddress: '0x3D' })], [], S3_FQBN,
    )
    const item = manifest.items.find((entry) => entry.kind === 'info-display')
    expect(item?.facts).toMatchObject({ transport: 'i2c', i2cAddress: '0x3D' })
    expect(item?.supported).toBe(true)
  })
})

describe('sharing the bus with the clock', () => {
  // The wiring this whole bus model exists for: an RTC and an OLED on one pair.
  it('accepts an OLED and a DS3231 on the same SDA and SCL', () => {
    const nodes = [oled('a', { partId: SSD1306, sdaPin: 21, sclPin: 22 }), ds3231()]
    expect(findPinCollisions(collectPinUses(nodes))).toEqual([])
    expect(findPinConflicts(nodes, [])).toEqual([])
  })

  // 0x3C and 0x68 are different devices; sharing the wires is how I2C works.
  it('does not confuse a shared bus with a shared address', () => {
    const nodes = [oled('a', { partId: SSD1306, sdaPin: 21, sclPin: 22 }), ds3231()]
    const uses = collectPinUses(nodes)
    const devices = nodes.map((entry) => ({
      nodeId: entry.id,
      nodeType: entry.data.nodeType,
      props: entry.data.properties as Record<string, unknown>,
      uses: uses.filter((use) => use.nodeId === entry.id),
    }))
    expect(findI2cAddressCollisions(devices)).toEqual([])
  })

  // Two panels straight out of the bag are both strapped to 0x3C, and the
  // second one silently mirrors the first. Moving one strap is the repair.
  it('rejects two panels answering the same address', () => {
    const nodes = [
      oled('a', { partId: SSD1306, sdaPin: 21, sclPin: 22 }),
      oled('b', { partId: SSD1306, sdaPin: 21, sclPin: 22 }),
    ]
    const conflicts = findPinConflicts(nodes, [])
    expect(conflicts.join('\n')).toContain('0x3C')
  })

  it('accepts them once one strap is moved', () => {
    const nodes = [
      oled('a', { partId: SSD1306, sdaPin: 21, sclPin: 22, i2cAddress: '0x3C' }),
      oled('b', { partId: SSD1306, sdaPin: 21, sclPin: 22, i2cAddress: '0x3D' }),
    ]
    expect(findPinConflicts(nodes, [])).toEqual([])
  })

  // An SPI panel carries the address property but answers to nothing, so it
  // must not collide with the module that does.
  it('ignores the address of a panel that is not on the bus', () => {
    const nodes = [
      oled('spi', { partId: SH1106 }),
      oled('i2c', { partId: SSD1306, sdaPin: 21, sclPin: 22 }),
      ds3231(),
    ]
    expect(findPinConflicts(nodes, [])).toEqual([])
  })
})

describe('one bus, because the sketch starts one', () => {
  // Legal wiring on an ESP32, and undrivable by a sketch with a single
  // Wire.begin: the device on the other pair simply never answers, which reads
  // as a bad solder joint rather than a software fault.
  it('refuses two I2C pairs in one build', () => {
    const nodes = [
      oled('a', { partId: SSD1306, sdaPin: 21, sclPin: 22 }),
      ds3231({ sdaPin: 4, sclPin: 5 }),
    ]
    const { errors } = findDisplayGeneratorIssues(nodes, [])
    expect(errors.join('\n')).toContain('one I2C bus')
    expect(errors.join('\n')).toContain('SDA 21')
    expect(errors.join('\n')).toContain('SDA 4')
  })

  it('says nothing when they share the pair', () => {
    const nodes = [oled('a', { partId: SSD1306, sdaPin: 21, sclPin: 22 }), ds3231()]
    expect(findDisplayGeneratorIssues(nodes, []).errors).toEqual([])
  })

  it('says nothing about a build with no I2C display at all', () => {
    expect(findDisplayGeneratorIssues([oled('a', { partId: SH1106 }), ds3231()], []).errors).toEqual([])
  })
})

describe('following a board change', () => {
  // An I2C part belongs on the board's I2C bus. Allocated from the general pool
  // it would land on two free pins, and the OLED and the DS3231 would end up on
  // different pairs — the split bus refused above, created by the app itself.
  it('lands an I2C panel on the board\'s own SDA and SCL', () => {
    const before = [
      oled('a', {
        partId: SSD1306,
        sdaPin: 21,
        sclPin: 22,
        assignedPinsBoard: CLASSIC,
        assignedPins: { sdaPin: 21, sclPin: 22 },
      }),
    ]
    const { nodes } = retargetHardwarePins(before, boardProfileById(S3), S3_FQBN, CLASSIC)
    const props = nodes[0].data.properties as Record<string, number>
    const expected = boardI2cDefault(S3)
    expect(expected).toBeTruthy()
    expect(props.sdaPin).toBe(expected!.sda.arduinoPin)
    expect(props.sclPin).toBe(expected!.scl.arduinoPin)
  })

  it('puts the panel and the clock on one pair, not two', () => {
    const before = [
      oled('a', {
        partId: SSD1306,
        sdaPin: 21,
        sclPin: 22,
        assignedPinsBoard: CLASSIC,
        assignedPins: { sdaPin: 21, sclPin: 22 },
      }),
      ds3231({
        assignedPinsBoard: CLASSIC,
        assignedPins: { sdaPin: 21, sclPin: 22 },
      }),
    ]
    const { nodes } = retargetHardwarePins(before, boardProfileById(S3), S3_FQBN, CLASSIC)
    const pins = nodes.map((entry) => {
      const props = entry.data.properties as Record<string, number>
      return `${props.sdaPin}/${props.sclPin}`
    })
    expect(new Set(pins).size).toBe(1)
    expect(findDisplayGeneratorIssues(nodes, []).errors).toEqual([])
  })

  // The SPI module has no bus to be placed on, so it still takes free GPIO.
  it('still allocates an SPI panel from the pool', () => {
    const before = [
      oled('a', {
        partId: SH1106,
        csPin: 16, dcPin: 17, resetPin: 18, sckPin: 32, mosiPin: 33,
        assignedPinsBoard: CLASSIC,
        assignedPins: { csPin: 16, dcPin: 17, resetPin: 18, sckPin: 32, mosiPin: 33 },
      }),
    ]
    const { nodes } = retargetHardwarePins(before, boardProfileById(S3), S3_FQBN, CLASSIC)
    const safe = new Set(boardProfileById(S3)?.pinSafety?.safeGeneralPurpose ?? [])
    for (const use of collectPinUses(nodes)) {
      expect(safe.has(use.pin), `${use.label} left on GPIO ${use.pin}`).toBe(true)
    }
  })
})
