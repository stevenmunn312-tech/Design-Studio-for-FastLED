import { describe, it, expect } from 'vitest'
import { retargetHardwarePins } from '../pinRetarget'
import { boardProfileById } from '../../build/boardProfiles'
import { collectPinUses } from '../../build/hardwareManifest'
import { findPinConflicts } from '../../utils/validateGraph'
import type { StudioNode } from '../graphStore'
import { ASSIGNED_BOARD_KEY, ASSIGNED_PINS_KEY } from '../pinRetarget'

const CLASSIC = 'esp32-generic-devkit-38pin'
const S3 = 'espressif-esp32-s3-devkitc-1'
const S3_FQBN = 'esp32:esp32:esp32s3'

function node(id: string, nodeType: string, props: Record<string, unknown> = {}): StudioNode {
  return { id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'output', properties: props, inputs: [], outputs: [] } } as unknown as StudioNode
}

describe('displays follow a board change', () => {
  // These fixtures stamp pins the way the app does. If the key names drift the
  // retarget sees an unstamped node and the assertions below stop meaning
  // anything, so they are checked rather than assumed.
  it('uses the real stamp keys', () => {
    expect(ASSIGNED_BOARD_KEY).toBe('assignedPinsBoard')
    expect(ASSIGNED_PINS_KEY).toBe('assignedPins')
  })

  // The bench report: an OLED and an amplifier wired on a classic ESP32, then
  // the board switched to an S3. Without a retarget plan the display kept the
  // old board's pins — including GPIO 32, which an S3 wires to flash/PSRAM —
  // and never entered `claimed`, so the amplifier was retargeted on top of it.
  it('moves a display off the board being left and out of the way', () => {
    const before = [
      node('oled', 'InfoDisplay', {
        partId: 'sh1106-oled-128x64',
        csPin: 16, dcPin: 17, resetPin: 18, sckPin: 32, mosiPin: 33,
        assignedPinsBoard: CLASSIC,
        assignedPins: { csPin: 16, dcPin: 17, resetPin: 18, sckPin: 32, mosiPin: 33 },
      }),
      node('amp', 'Amplifier', {
        i2sBclk: 26, i2sLrc: 25, i2sDout: 22,
        assignedPinsBoard: CLASSIC,
        assignedPins: { i2sBclk: 26, i2sLrc: 25, i2sDout: 22 },
      }),
    ]

    const { nodes } = retargetHardwarePins(before, boardProfileById(S3), S3_FQBN, CLASSIC)

    const safe = new Set(boardProfileById(S3)?.pinSafety?.safeGeneralPurpose ?? [])
    expect(safe.size).toBeGreaterThan(0)
    // GPIO 32 is wired to flash/PSRAM on an S3 and appears in no pool it
    // offers. Left behind, it is the pin the bench report caught.
    expect(safe.has(32)).toBe(false)

    for (const use of collectPinUses(nodes)) {
      expect(safe.has(use.pin), `${use.label} left on GPIO ${use.pin}`).toBe(true)
    }
    expect(findPinConflicts(nodes, [])).toEqual([])
  })

  it('leaves a display alone when the board has not changed', () => {
    const pins = { csPin: 1, dcPin: 2, resetPin: 4, sckPin: 5, mosiPin: 6 }
    const before = [node('oled', 'InfoDisplay', {
      partId: 'sh1106-oled-128x64', ...pins,
      assignedPinsBoard: S3, assignedPins: pins,
    })]
    const { nodes } = retargetHardwarePins(before, boardProfileById(S3), S3_FQBN, S3)
    const props = nodes[0].data.properties as Record<string, unknown>
    for (const [key, pin] of Object.entries(pins)) expect(props[key], key).toBe(pin)
  })

  // A TM1637 wires two pins and a MAX7219 three; retargeting the union would
  // hand out pins the sketch never drives.
  it('retargets only the pins the chosen segment module wires', () => {
    const tm = node('tm', 'SegmentDisplay', {
      partId: 'tm1637-4digit-display', clkPin: 16, dioPin: 17,
      assignedPinsBoard: CLASSIC, assignedPins: { clkPin: 16, dioPin: 17 },
    })
    const { nodes } = retargetHardwarePins([tm], boardProfileById(S3), S3_FQBN, CLASSIC)
    expect(collectPinUses(nodes).map((use) => use.propertyKey)).toEqual(['clkPin', 'dioPin'])
    expect(findPinConflicts(nodes, [])).toEqual([])
  })

  it('retargets a MAX7219 onto its own three lines', () => {
    const max = node('max', 'SegmentDisplay', {
      partId: 'max7219-8digit-7segment', clkPin: 16, dinPin: 17, csPin: 18,
      assignedPinsBoard: CLASSIC, assignedPins: { clkPin: 16, dinPin: 17, csPin: 18 },
    })
    const { nodes } = retargetHardwarePins([max], boardProfileById(S3), S3_FQBN, CLASSIC)
    expect(collectPinUses(nodes).map((use) => use.propertyKey)).toEqual(['clkPin', 'dinPin', 'csPin'])
  })
})
