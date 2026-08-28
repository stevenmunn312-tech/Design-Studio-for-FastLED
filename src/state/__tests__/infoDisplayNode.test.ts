import { describe, it, expect, beforeEach } from 'vitest'
import { evaluateGraphFull, resetEvaluatorState, type GroupRegistry } from '../graphEvaluator'
import { NODE_LIBRARY } from '../nodeLibrary'
import { isHardwareManagedSignalNodeType, isHardwareLibraryHiddenNodeType } from '../hardware'
import { busAssignmentFor, isShareableRole } from '../busTopology'
import { collectPinUses } from '../../build/hardwareManifest'
import { findPinConflicts } from '../../utils/validateGraph'
import { partOptionsFor } from '../partOptions'
import { getPixel, type OledSurface } from '../oledSurface'
import type { StudioNode, StudioEdge } from '../graphStore'
import { BROWSER_LAYOUT } from '../infoDisplay'
import { THUMBNAIL_H, THUMBNAIL_W } from '../patternThumbnail'

function node(id: string, nodeType: string, category: string, props: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((n) => n.type === nodeType)
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category, properties: props,
      inputs: def?.inputs ?? [], outputs: def?.outputs ?? [],
    },
  } as unknown as StudioNode
}

function edge(id: string, source: string, sh: string, target: string, th: string): StudioEdge {
  return { id, source, target, sourceHandle: sh, targetHandle: th } as unknown as StudioEdge
}

const oled = (props: Record<string, unknown> = {}) => node('oled', 'InfoDisplay', 'output', {
  partId: 'sh1106-oled-128x64', csPin: 5, dcPin: 16, resetPin: 17, sckPin: 18, mosiPin: 23, ...props,
})

function panelOf(nodes: StudioNode[], edges: StudioEdge[] = [], groups: GroupRegistry = {}) {
  const out = evaluateGraphFull(nodes, edges, 0, 8, 8, groups).outputs.get('oled') ?? {}
  return { lit: out.lit as boolean, surface: out.surface as OledSurface | null }
}

function litCount(surface: OledSurface): number {
  let n = 0
  for (let y = 0; y < surface.height; y++) {
    for (let x = 0; x < surface.width; x++) if (getPixel(surface, x, y)) n++
  }
  return n
}

describe('InfoDisplay ownership', () => {
  it('is workbench-owned and signal-carrying', () => {
    expect(isHardwareManagedSignalNodeType('InfoDisplay')).toBe(true)
    expect(isHardwareLibraryHiddenNodeType('InfoDisplay')).toBe(true)
  })

  it('consumes values and produces none', () => {
    const def = NODE_LIBRARY.find((n) => n.type === 'InfoDisplay')!
    expect(def.outputs).toEqual([])
    expect(def.inputs.some((port) => port.dataType === 'display')).toBe(true)
  })

  // One content input and no layout property. The port set is stable by
  // construction rather than by discipline: there is nothing to switch.
  it('declares one content input and nothing layout-specific', () => {
    const def = NODE_LIBRARY.find((n) => n.type === 'InfoDisplay')!
    expect(def.inputs.map((port) => port.id)).toEqual(['display', 'enabled'])
    expect(def.defaultProperties).not.toHaveProperty('infoLayout')
  })

  it('offers both OLED modules as exact choices', () => {
    const options = partOptionsFor('InfoDisplay').map((option) => option.id)
    expect(options).toEqual(['sh1106-oled-128x64', 'ssd1306-oled-128x64'])
  })
})

describe('InfoDisplay pins', () => {
  it('claims all five of its lines', () => {
    expect(collectPinUses([oled()]).map((use) => use.propertyKey))
      .toEqual(['csPin', 'dcPin', 'resetPin', 'sckPin', 'mosiPin'])
  })

  // Three exclusive pins rather than one is what separates a four-wire panel
  // from a two-wire module.
  it('shares its clock and data but holds select, DC and reset', () => {
    expect(isShareableRole(busAssignmentFor('InfoDisplay', 'sckPin').role)).toBe(true)
    expect(isShareableRole(busAssignmentFor('InfoDisplay', 'mosiPin').role)).toBe(true)
    for (const pin of ['csPin', 'dcPin', 'resetPin']) {
      expect(isShareableRole(busAssignmentFor('InfoDisplay', pin).role), pin).toBe(false)
    }
  })

  // The case this slice exists to exercise: an SPI OLED beside the SD card on
  // one host, which the old duplicate-GPIO rule would have called broken.
  it('shares an SPI bus with the SD card given its own chip select', () => {
    const sd = node('sd', 'SDCard', 'output', {
      sdCsPin: 15, sdSckPin: 18, sdMosiPin: 23, sdMisoPin: 19,
    })
    expect(findPinConflicts([oled(), sd], [])).toEqual([])
  })

  it('rejects an OLED and an SD card sharing a chip select', () => {
    const sd = node('sd', 'SDCard', 'output', {
      sdCsPin: 5, sdSckPin: 18, sdMosiPin: 23, sdMisoPin: 19,
    })
    expect(findPinConflicts([oled(), sd], [])).toContainEqual(expect.stringContaining('GPIO 5'))
  })

  it('rejects a second panel reusing the data/command line', () => {
    const second = node('oled2', 'InfoDisplay', 'output', {
      csPin: 15, dcPin: 16, resetPin: 2, sckPin: 18, mosiPin: 23,
    })
    expect(findPinConflicts([oled(), second], [])).toContainEqual(expect.stringContaining('GPIO 16'))
  })

  it('is happy with two panels on one bus given distinct select, DC and reset', () => {
    const second = node('oled2', 'InfoDisplay', 'output', {
      csPin: 15, dcPin: 4, resetPin: 2, sckPin: 18, mosiPin: 23,
    })
    expect(findPinConflicts([oled(), second], [])).toEqual([])
  })
})

describe('InfoDisplay rendering', () => {
  beforeEach(() => resetEvaluatorState())

  it('draws a surface at the panel size', () => {
    const { lit, surface } = panelOf([oled()])
    expect(lit).toBe(true)
    expect(surface!.width).toBe(128)
    expect(surface!.height).toBe(64)
  })

  it('goes dark when disabled, drawing nothing at all', () => {
    const { lit, surface } = panelOf([oled({ enabled: false })])
    expect(lit).toBe(false)
    expect(surface).toBeNull()
  })

  // Unwired says so. A blank panel and a dead panel look identical on a bench.
  it('says it is waiting when nothing is plugged in', () => {
    expect(litCount(panelOf([oled()]).surface!)).toBeGreaterThan(60)
  })

  it('shows the clock a wired RTC gives it', () => {
    const waiting = panelOf([oled()])
    const clock = panelOf(
      [node('rtc', 'RTCInput', 'input'), oled()],
      [edge('e', 'rtc', 'display', 'oled', 'display')],
    )
    expect(litCount(clock.surface!)).not.toBe(litCount(waiting.surface!))
  })

  it('renders the highlighted pattern in the Pattern Browser preview', () => {
    const collection = node('collection', 'PatternCollection', 'show', { patternIds: ['white'] })
    const player = node('player', 'PatternSlideshow', 'show')
    const groups = {
      white: {
        nodes: [
          node('white', 'SolidColor', 'pattern', { r: 255, g: 255, b: 255 }),
          node('group-out', 'GroupOutput', 'output'),
        ],
        edges: [edge('group-frame', 'white', 'frame', 'group-out', 'frame')],
      },
    } as unknown as GroupRegistry
    const surface = panelOf(
      [collection, player, oled()],
      [
        edge('collection-player', 'collection', 'patternset', 'player', 'patternset'),
        edge('player-oled', 'player', 'display', 'oled', 'display'),
      ],
      groups,
    ).surface!

    let thumbnailPixels = 0
    for (let y = BROWSER_LAYOUT.thumbY; y < BROWSER_LAYOUT.thumbY + THUMBNAIL_H; y++) {
      for (let x = BROWSER_LAYOUT.thumbX; x < BROWSER_LAYOUT.thumbX + THUMBNAIL_W; x++) {
        if (getPixel(surface, x, y)) thumbnailPixels++
      }
    }
    expect(thumbnailPixels).toBe(THUMBNAIL_W * THUMBNAIL_H)
  })

  // The panel picture is identical on both controllers; only the column window
  // into controller RAM differs, and that belongs to the driver.
  it('draws the same pixels whichever module is chosen', () => {
    const sh = panelOf([oled({ partId: 'sh1106-oled-128x64' })]).surface!
    const ssd = panelOf([oled({ partId: 'ssd1306-oled-128x64' })]).surface!
    expect(Array.from(sh.data)).toEqual(Array.from(ssd.data))
  })

  it('shows a clock with no reading as such rather than as midnight', () => {
    // An RTC whose source is unreadable still picks the Clock screen; what it
    // cannot do is put a plausible time on it.
    const { surface } = panelOf(
      [node('rtc', 'RTCInput', 'input', { timeSource: 'Manual', startYear: 0 }), oled()],
      [edge('e', 'rtc', 'display', 'oled', 'display')],
    )
    expect(litCount(surface!)).toBeGreaterThan(0)
  })
})
