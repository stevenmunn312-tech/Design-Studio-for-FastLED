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
import { blankTransportData, TRANSPORT_DISPLAY_LAYOUTS } from '../transportDisplay'

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
  it('is a workbench-owned signal terminal with a player-controls output', () => {
    const def = NODE_LIBRARY.find((entry) => entry.type === 'TransportDisplay')!
    expect(def.label).toBe('Transport Display')
    expect(def.category).toBe('output')
    expect(def.outputs).toEqual([{ id: 'controls', label: 'Controls', dataType: 'playercontrols' }])
    expect(isHardwareManagedSignalNodeType(def.type)).toBe(true)
    expect(isHardwareLibraryHiddenNodeType(def.type)).toBe(true)
  })

  // The mismatch this pins was real: the node shipped an `artwork` port of
  // dataType `image`, which carries live ImageData capped at IMAGE_MAX_DIM,
  // while the layout renders artwork from baked RGB565 bytes. Nothing bridges
  // those without a scaler, and a scaler in the browser needs a twin in C++.
  // Deriving the check from what the layouts actually render is what stops a
  // port being declared for a field nothing draws.
  it('declares no port the layouts cannot render', () => {
    const def = NODE_LIBRARY.find((entry) => entry.type === 'TransportDisplay')!
    const rendered = new Set(TRANSPORT_DISPLAY_LAYOUTS.flatMap(
      (layout) => Object.keys(blankTransportData(layout).data),
    ))
    // `enabled` switches the panel rather than feeding a layout field.
    const fed = def.inputs.map((port) => port.id).filter((id) => id !== 'enabled')
    expect(fed.length).toBeGreaterThan(0)
    for (const port of fed) {
      expect(rendered.has(port), `${port} is a port no layout renders`).toBe(true)
    }
  })

  // The reverse direction is deliberately allowed to differ, and only here:
  // the layouts render artwork, and no port feeds it until the baker lands.
  it('renders exactly one field that has no port yet', () => {
    const def = NODE_LIBRARY.find((entry) => entry.type === 'TransportDisplay')!
    const ports = new Set(def.inputs.map((port) => port.id))
    const rendered = new Set(TRANSPORT_DISPLAY_LAYOUTS.flatMap(
      (layout) => Object.keys(blankTransportData(layout).data),
    ))
    expect([...rendered].filter((field) => !ports.has(field))).toEqual(['artwork'])
  })

  it('declares the fixed layout payload ports', () => {
    const def = NODE_LIBRARY.find((entry) => entry.type === 'TransportDisplay')!
    expect(def.inputs.map((port) => port.id)).toEqual([
      'title', 'artist', 'elapsedSec', 'durationSec', 'progress', 'playing', 'volume',
      'patternName', 'patternIndex', 'patternCount', 'section', 'bpm', 'beat',
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
    for (const key of ['touchXMin', 'touchXMax', 'touchYMin', 'touchYMax']) {
      expect(isPropertyEnabled('TransportDisplay', key, { partId: PLAIN }), key).toBe(false)
      expect(isPropertyEnabled('TransportDisplay', key, { partId: TOUCH }), key).toBe(true)
    }
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

  it('shares one SPI host with touch and an SD card given unique selects', () => {
    const sd = {
      id: 'sd', type: 'studioNode', position: { x: 0, y: 0 },
      data: {
        label: 'SD Card', nodeType: 'SDCard', category: 'output',
        properties: { sdSckPin: 18, sdMosiPin: 23, sdMisoPin: 19, sdCsPin: 13 },
        inputs: [], outputs: [],
      },
    } as unknown as StudioNode
    expect(findPinConflicts([display('touch', { partId: TOUCH }), sd], [])).toEqual([])
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
