import { describe, it, expect, beforeEach } from 'vitest'
import { useGraphStore, type StudioNode } from '../graphStore'
import {
  CYD_TOUCH_DISPLAY,
  INTEGRATED_BOARD_PROFILE_KEY,
  integratedPinsFor,
} from '../integratedBoardHardware'
import { retargetHardwarePins } from '../pinRetarget'
import { boardProfileById } from '../../build/boardProfiles'
import { collectPinUses } from '../../build/hardwareManifest'
import { findPinConflicts } from '../../utils/validateGraph'
import { NO_PIN } from '../boardGpio'
import { ROOT_BOARD_NODE_ID } from '../hardware'

const CYD = CYD_TOUCH_DISPLAY.boardProfileId
const CYD_FQBN = 'esp32:esp32:esp32'
const CLASSIC = 'esp32-generic-devkit-38pin'

function node(id: string, nodeType: string, props: Record<string, unknown> = {}): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'output', properties: props, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

function rootNodes(): StudioNode[] {
  return useGraphStore.getState().nodes
}

function panels(): StudioNode[] {
  return rootNodes().filter((n) => n.data.nodeType === 'TransportDisplay')
}

describe('selecting an integrated board brings its own hardware', () => {
  beforeEach(() => {
    useGraphStore.getState().loadGraph([], [])
  })

  // The whole point: the bench notes record every one of these pins being
  // typed in by hand before the board would light up.
  it('adds the fitted panel on its real pins, plus the glass in front of it', () => {
    useGraphStore.getState().selectBoardProfile(ROOT_BOARD_NODE_ID, CYD)

    expect(panels()).toHaveLength(1)
    const panel = panels()[0]
    for (const [key, value] of Object.entries(CYD_TOUCH_DISPLAY.panelProperties)) {
      expect(panel.data.properties[key], key).toBe(value)
    }
    expect(panel.data.properties[INTEGRATED_BOARD_PROFILE_KEY]).toBe(CYD)

    const touch = rootNodes().filter((n) => n.data.nodeType === 'TouchInput')
    expect(touch).toHaveLength(1)
    expect(touch[0].data.properties.panelId).toBe(panel.id)
  })

  it('does not stack a second copy when the board is chosen again', () => {
    useGraphStore.getState().selectBoardProfile(ROOT_BOARD_NODE_ID, CYD)
    useGraphStore.getState().selectBoardProfile(ROOT_BOARD_NODE_ID, CYD)
    expect(panels()).toHaveLength(1)
    expect(rootNodes().filter((n) => n.data.nodeType === 'TouchInput')).toHaveLength(1)
  })

  // The workflow the support matrix describes: the panel was added by hand and
  // every pin overridden. Selecting the board has to recognise that rather than
  // add a second panel on top of the one already wired.
  it('adopts a panel the user already wired to the same fixed pinout', () => {
    useGraphStore.getState().loadGraph(
      [node('by-hand', 'TransportDisplay', { ...CYD_TOUCH_DISPLAY.panelProperties, tftLayout: 'Waiting' })],
      [],
    )
    useGraphStore.getState().selectBoardProfile(ROOT_BOARD_NODE_ID, CYD)

    expect(panels()).toHaveLength(1)
    expect(panels()[0].id).toBe('by-hand')
    // Adoption keeps what the panel is showing; only the board's own facts win.
    expect(panels()[0].data.properties.tftLayout).toBe('Waiting')
    expect(panels()[0].data.properties[INTEGRATED_BOARD_PROFILE_KEY]).toBe(CYD)
  })

  it('leaves a board with nothing fitted to it alone', () => {
    useGraphStore.getState().selectBoardProfile(ROOT_BOARD_NODE_ID, CLASSIC)
    expect(panels()).toHaveLength(0)
  })
})

describe('soldered pins survive the pin walk', () => {
  const fitted = () => node('panel', 'TransportDisplay', {
    ...CYD_TOUCH_DISPLAY.panelProperties,
    [INTEGRATED_BOARD_PROFILE_KEY]: CYD,
  })

  it('answers for a fitted panel only on the board it is fitted to', () => {
    const properties = fitted().data.properties as Record<string, unknown>
    expect(integratedPinsFor('TransportDisplay', properties, CYD)).toMatchObject({ csPin: 15, sckPin: 14 })
    expect(integratedPinsFor('TransportDisplay', properties, CLASSIC)).toBeNull()
    expect(integratedPinsFor('InfoDisplay', properties, CYD)).toBeNull()
  })

  // Arriving on the CYD from another board is the case that used to hand the
  // panel twelve freshly allocated pins, none of which it is connected to.
  it('does not move the panel onto allocated pins when the board is selected', () => {
    const before = [node('board', 'Board', { profileId: CYD }), fitted()]
    const { nodes } = retargetHardwarePins(before, boardProfileById(CYD), CYD_FQBN, CLASSIC)
    const panel = nodes.find((n) => n.id === 'panel')!
    for (const [key, value] of Object.entries(CYD_TOUCH_DISPLAY.panelProperties)) {
      expect(panel.data.properties[key], key).toBe(value)
    }
  })

  // The second half of the same rule: a pin the board already uses has to be
  // out of the pool, or the next part added lands on the backlight.
  it('keeps the panel out of the way of every other part', () => {
    const before = [
      node('board', 'Board', { profileId: CYD }),
      fitted(),
      node('leds', 'MatrixOutput', { dataPin: 14, chipset: 'WS2812B' }),
      node('rtc', 'RTCInput', {}),
    ]
    const { nodes } = retargetHardwarePins(before, boardProfileById(CYD), CYD_FQBN, CLASSIC)
    expect(findPinConflicts(nodes, [])).toEqual([])
    const panelPins = new Set(Object.values(CYD_TOUCH_DISPLAY.panelProperties)
      .filter((value): value is number => typeof value === 'number' && value !== NO_PIN))
    for (const use of collectPinUses(nodes)) {
      if (use.nodeId === 'panel') continue
      expect(panelPins.has(use.pin), `${use.label} landed on GPIO ${use.pin}`).toBe(false)
    }
  })
})

describe('a line the board ties claims no GPIO', () => {
  // The panel reset is wired to the board's own EN line. Reported as a pin use
  // it reads as a part sitting on GPIO 255, which no board lists, and the build
  // is refused over wiring that does not exist.
  it('reports no pin use for a tied reset', () => {
    const uses = collectPinUses([node('panel', 'TransportDisplay', CYD_TOUCH_DISPLAY.panelProperties)])
    expect(uses.some((use) => use.propertyKey === 'resetPin')).toBe(false)
    expect(uses.some((use) => use.pin === NO_PIN)).toBe(false)
    // Everything actually wired still reports.
    expect(uses.map((use) => use.propertyKey).sort()).toEqual([
      'backlightPin', 'csPin', 'dcPin', 'misoPin', 'mosiPin', 'sckPin',
      'touchCsPin', 'touchIrqPin', 'touchMisoPin', 'touchMosiPin', 'touchSckPin',
    ])
  })

  it('still reports a reset that is wired', () => {
    const uses = collectPinUses([node('panel', 'TransportDisplay', {
      ...CYD_TOUCH_DISPLAY.panelProperties, resetPin: 4,
    })])
    expect(uses.find((use) => use.propertyKey === 'resetPin')?.pin).toBe(4)
  })

  // An OLED drives reset unconditionally, so 255 there is a real (and wrong)
  // pin and has to keep reporting as one.
  it('only exempts the properties the firmware guards', () => {
    const uses = collectPinUses([node('oled', 'InfoDisplay', {
      partId: 'sh1106-oled-128x64',
      csPin: 16, dcPin: 17, resetPin: NO_PIN, sckPin: 18, mosiPin: 23,
    })])
    expect(uses.find((use) => use.propertyKey === 'resetPin')?.pin).toBe(NO_PIN)
  })
})
