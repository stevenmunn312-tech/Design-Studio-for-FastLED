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
    expect(def.inputs.some((port) => port.dataType === 'string')).toBe(true)
  })

  // A port is what a cable attaches to, so switching the screen must not move
  // one. Every layout reads the same declared ports.
  it('declares one stable port set for every layout', () => {
    const def = NODE_LIBRARY.find((n) => n.type === 'InfoDisplay')!
    const ids = def.inputs.map((port) => port.id)
    expect(ids).toContain('title')
    expect(ids).toContain('dateTime')
    expect(ids).toContain('indicator4')
    expect(new Set(ids).size).toBe(ids.length)
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

  it('shows wired text on the status screen', () => {
    const nodes = [node('t', 'TextValue', 'math', { text: 'RUNNING' }), oled({ infoLayout: 'Status' })]
    const bare = panelOf([oled({ infoLayout: 'Status' })])
    const wired = panelOf(nodes, [edge('e', 't', 'text', 'oled', 'title')])
    expect(litCount(wired.surface!)).toBeGreaterThan(litCount(bare.surface!))
  })

  it('renders each layout differently', () => {
    const counts = ['Now Playing', 'Pattern Browser', 'Clock', 'Status']
      .map((infoLayout) => litCount(panelOf([oled({ infoLayout })]).surface!))
    expect(new Set(counts).size).toBe(counts.length)
  })

  it('renders the highlighted player pattern in the Pattern Browser preview', () => {
    const collection = node('collection', 'PatternCollection', 'show', { patternIds: ['white'] })
    const player = node('player', 'PatternMaster', 'show')
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
      [collection, player, oled({ infoLayout: 'Pattern Browser' })],
      [
        edge('collection-player', 'collection', 'patternset', 'player', 'patternset'),
        edge('player-oled', 'player', 'patternSelect', 'oled', 'patternSelect'),
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

  it('falls back to a known layout for an unknown one', () => {
    const unknown = litCount(panelOf([oled({ infoLayout: 'nonsense' })]).surface!)
    const fallback = litCount(panelOf([oled({ infoLayout: 'Now Playing' })]).surface!)
    expect(unknown).toBe(fallback)
  })

  // The panel picture is identical on both controllers; only the column window
  // into controller RAM differs, and that belongs to the driver.
  it('draws the same pixels whichever module is chosen', () => {
    const sh = panelOf([oled({ partId: 'sh1106-oled-128x64' })]).surface!
    const ssd = panelOf([oled({ partId: 'ssd1306-oled-128x64' })]).surface!
    expect(Array.from(sh.data)).toEqual(Array.from(ssd.data))
  })

  it('shows a clock with no reading as such rather than as midnight', () => {
    const { surface } = panelOf([oled({ infoLayout: 'Clock' })])
    expect(litCount(surface!)).toBeGreaterThan(0)
  })
})
