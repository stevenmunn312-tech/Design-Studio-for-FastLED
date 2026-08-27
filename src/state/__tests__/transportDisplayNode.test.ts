import { describe, expect, it } from 'vitest'
import { collectPinUses } from '../../build/hardwareManifest'
import { boardProfileById } from '../../build/boardProfiles'
import { findPinConflicts } from '../../utils/validateGraph'
import type { StudioNode } from '../graphStore'
import { isHardwareLibraryHiddenNodeType, isHardwareManagedSignalNodeType } from '../hardware'
import { NODE_LIBRARY, isPropertyEnabled, libraryDefaults } from '../nodeLibrary'
import { PART_FIELDS } from '../partFields'
import { partOptionsFor } from '../partOptions'
import { retargetHardwarePins } from '../pinRetarget'

const PLAIN = 'st7789-tft-240x240'
const TOUCH = 'st7789v-xpt2046-touch-240x320'

function display(id: string, over: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((entry) => entry.type === 'TransportDisplay')!
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: def.label, nodeType: def.type, category: def.category,
      properties: { ...libraryDefaults(def.type), ...over },
      inputs: def.inputs, outputs: def.outputs,
    },
  } as unknown as StudioNode
}

describe('TransportDisplay registration', () => {
  it('is a workbench-owned output-less signal terminal', () => {
    const def = NODE_LIBRARY.find((entry) => entry.type === 'TransportDisplay')!
    expect(def.label).toBe('Transport Display')
    expect(def.category).toBe('output')
    expect(def.outputs).toEqual([])
    expect(isHardwareManagedSignalNodeType(def.type)).toBe(true)
    expect(isHardwareLibraryHiddenNodeType(def.type)).toBe(true)
  })

  it('declares the fixed layout payload ports', () => {
    const def = NODE_LIBRARY.find((entry) => entry.type === 'TransportDisplay')!
    expect(def.inputs.map((port) => port.id)).toEqual([
      'title', 'artist', 'elapsedSec', 'durationSec', 'progress', 'playing', 'volume',
      'patternName', 'artwork', 'patternIndex', 'patternCount', 'section', 'bpm', 'beat',
      'outputEnabled', 'brightness', 'enabled',
    ])
    expect(def.defaultProperties).toMatchObject({
      partId: PLAIN, tftLayout: 'Now Playing', tftRotation: '0', enabled: true,
    })
  })

  it('offers only the two module profiles in scope', () => {
    expect(partOptionsFor('TransportDisplay').map((option) => option.id)).toEqual([PLAIN, TOUCH])
  })

  it('makes every physical pin reachable from the hardware editor', () => {
    expect(PART_FIELDS.TransportDisplay.map((field) => field.key)).toEqual([
      'sckPin', 'mosiPin', 'misoPin', 'csPin', 'dcPin', 'resetPin', 'backlightPin',
      'touchCsPin', 'touchIrqPin', 'touchSckPin', 'touchMosiPin', 'touchMisoPin',
    ])
  })
})

describe('TransportDisplay wiring', () => {
  it('gates MISO and touch pins to the touch module', () => {
    for (const key of ['misoPin', 'touchCsPin', 'touchIrqPin', 'touchSckPin', 'touchMosiPin', 'touchMisoPin']) {
      expect(isPropertyEnabled('TransportDisplay', key, { partId: PLAIN }), key).toBe(false)
      expect(isPropertyEnabled('TransportDisplay', key, { partId: TOUCH }), key).toBe(true)
    }
    expect(isPropertyEnabled('TransportDisplay', 'backlightPin', { partId: PLAIN })).toBe(true)
  })

  it('claims only the plain module SPI and control lines', () => {
    expect(collectPinUses([display('plain')]).map((use) => use.propertyKey)).toEqual([
      'sckPin', 'mosiPin', 'csPin', 'dcPin', 'resetPin', 'backlightPin',
    ])
  })

  it('allows touch to share the display SPI bus', () => {
    expect(findPinConflicts([display('touch', { partId: TOUCH })], [])).toEqual([])
  })

  it('allows touch to use a separate SPI bus', () => {
    expect(findPinConflicts([display('touch', {
      partId: TOUCH, touchSckPin: 25, touchMosiPin: 26, touchMisoPin: 27,
    })], [])).toEqual([])
  })

  it('keeps display and touch chip selects exclusive', () => {
    const conflicts = findPinConflicts([display('touch', { partId: TOUCH, touchCsPin: 5 })], [])
    expect(conflicts).toContainEqual(expect.stringContaining('GPIO 5'))
  })

  it('retargets every active plain-module pin onto the new board', () => {
    const classic = 'esp32-generic-devkit-38pin'
    const s3 = 'espressif-esp32-s3-devkitc-1'
    const pins = { sckPin: 32, mosiPin: 33, csPin: 16, dcPin: 17, resetPin: 18, backlightPin: 19 }
    const before = display('plain', {
      ...pins, assignedPinsBoard: classic, assignedPins: pins,
    })
    const result = retargetHardwarePins(
      [before], boardProfileById(s3), 'esp32:esp32:esp32s3', classic,
    )
    const safe = new Set(boardProfileById(s3)?.pinSafety?.safeGeneralPurpose ?? [])
    const uses = collectPinUses(result.nodes)
    expect(uses.map((use) => use.propertyKey)).toEqual([
      'sckPin', 'mosiPin', 'csPin', 'dcPin', 'resetPin', 'backlightPin',
    ])
    for (const use of uses) expect(safe.has(use.pin), use.label).toBe(true)
    expect(findPinConflicts(result.nodes, [])).toEqual([])
  })
})
