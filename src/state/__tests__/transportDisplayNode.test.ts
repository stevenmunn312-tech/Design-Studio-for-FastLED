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
import { TRANSPORT_DISPLAY_LAYOUTS, transportLayoutForKind } from '../transportDisplay'
import { DISPLAY_SIGNAL_KINDS } from '../displaySignal'

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
    expect(def.label).toBe('Display Panel')
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
  // The whole content contract in one assertion. Seventeen per-field ports
  // became one envelope, so the check that used to compare ports against
  // rendered fields now checks the opposite thing: that no content port has
  // crept back. A field a layout draws is fed by the envelope's arm, never by
  // a socket, which is why there is nothing left to keep in step.
  it('takes two content inputs and declares no per-field ports', () => {
    const def = NODE_LIBRARY.find((entry) => entry.type === 'TransportDisplay')!
    expect(def.inputs.map((port) => port.id)).toEqual(['display', 'customDisplay', 'enabled'])
    expect(def.inputs.find((port) => port.id === 'display')?.dataType).toBe('display')
    // The panel/document split's second input: a wired `Display` document
    // takes over from the fixed layouts above. See
    // docs/development/design/large-displays-and-control-routing.md.
    expect(def.inputs.find((port) => port.id === 'customDisplay')?.dataType).toBe('customdisplay')
    expect(def.defaultProperties).toMatchObject({
      partId: PLAIN, tftLayout: 'Now Playing', tftRotation: '0', enabled: true,
    })
  })

  // A layout that no source can produce would be unreachable, and a source
  // with no layout is reported rather than guessed at. Derived from the two
  // tables so neither can grow an entry the other does not answer for.
  it('produces every non-service layout from some source', () => {
    const reachable = new Set(DISPLAY_SIGNAL_KINDS
      .map((kind) => transportLayoutForKind(kind))
      .filter((layout): layout is NonNullable<typeof layout> => layout !== null))
    for (const layout of TRANSPORT_DISPLAY_LAYOUTS) {
      // Waiting is the unwired state and Diagnostics is device lifecycle;
      // neither is content a cable selects.
      if (layout === 'Waiting' || layout === 'Diagnostics') continue
      const offered = DISPLAY_SIGNAL_KINDS.some(
        (kind) => transportLayoutForKind(kind, layout) === layout,
      )
      expect(offered, `${layout} is a layout no source produces`).toBe(true)
    }
    expect(reachable.size).toBeGreaterThan(0)
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
