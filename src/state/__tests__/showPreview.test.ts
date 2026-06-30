import { describe, it, expect, vi } from 'vitest'

vi.mock('../audioStore', () => ({
  useAudioStore: { getState: () => ({ active: false, bass: 0, mids: 0, treble: 0, beat: false, bpm: 120, spectrum: Array(16).fill(0) }) },
}))

import { showStateAt, beatFlashAt, renderShowFrame, sectionAt } from '../showPreview'
import type { ShowFile } from '../../types/showFile'

const show: ShowFile = {
  version: 1,
  songTitle: 'Test',
  durationMs: 2000,
  bpm: 120,
  events: [
    { t: 0,    cmd: 'SET_PATTERN',    params: { name: 'Plasma' } },
    { t: 0,    cmd: 'SET_PALETTE',    params: { name: 'ocean' } },
    { t: 0,    cmd: 'SET_BRIGHTNESS', params: { value: 255 } },
    { t: 500,  cmd: 'BEAT_FLASH',     params: { intensity: 255, decay: 255 } },
    { t: 1000, cmd: 'SET_PATTERN',    params: { name: 'Fire' } },
    { t: 1000, cmd: 'SET_BRIGHTNESS', params: { value: 0 } },
  ],
}

const W = 8, H = 8

describe('showStateAt', () => {
  it('returns the latest state at or before the position', () => {
    expect(showStateAt(show, 200).pattern).toBe('Plasma')
    expect(showStateAt(show, 200).palette).toBe('ocean')
    expect(showStateAt(show, 1500).pattern).toBe('Fire')
    expect(showStateAt(show, 1500).brightness).toBe(0)
  })
})

describe('beatFlashAt', () => {
  it('peaks at the flash and decays afterwards', () => {
    expect(beatFlashAt(show, 500)).toBeCloseTo(1, 2)
    const later = beatFlashAt(show, 900)
    expect(later).toBeGreaterThan(0)
    expect(later).toBeLessThan(1)
    expect(beatFlashAt(show, 200)).toBe(0)  // before any flash
  })
})

describe('sectionAt', () => {
  const sections = [
    { startMs: 0, endMs: 1000, type: 'intro' as const, energy: 0.2 },
    { startMs: 1000, endMs: 2000, type: 'verse' as const, energy: 0.5 },
  ]

  it('uses inclusive starts and exclusive ends', () => {
    expect(sectionAt(sections, 999)?.type).toBe('intro')
    expect(sectionAt(sections, 1000)?.type).toBe('verse')
    expect(sectionAt(sections, 2000)).toBeUndefined()
  })
})

describe('renderShowFrame', () => {
  it('renders a W×H frame that is lit while a pattern is active', () => {
    const frame = renderShowFrame(show, 200, W, H)
    expect(frame.length).toBe(H)
    expect(frame[0].length).toBe(W)
    const lit = frame.flat().filter((px) => px.r + px.g + px.b > 0).length
    expect(lit).toBeGreaterThan(0)
  })

  it('goes dark when brightness drops to 0', () => {
    const frame = renderShowFrame(show, 1200, W, H)
    const lit = frame.flat().filter((px) => px.r + px.g + px.b > 0).length
    expect(lit).toBe(0)
  })

  it('renders a collection (v2) show by evaluating the indexed group subgraph', () => {
    const mk = (id: string, nodeType: string, properties: Record<string, unknown>, inputs: unknown[] = [], outputs: unknown[] = []) =>
      ({ id, type: 'studioNode', position: { x: 0, y: 0 }, data: { label: nodeType, nodeType, category: 'pattern', properties, inputs, outputs } })
    const groups = {
      g1: {
        nodes: [
          mk('inner', 'SolidColor', { r: 255, g: 0, b: 0 }, [], [{ id: 'frame', dataType: 'frame' }]),
          mk('go', 'GroupOutput', {}, [{ id: 'frame', dataType: 'frame' }], []),
        ],
        edges: [{ id: 'ie', source: 'inner', sourceHandle: 'frame', target: 'go', targetHandle: 'frame' }],
      },
    } as unknown as Parameters<typeof renderShowFrame>[4]

    const collectionShow: ShowFile = {
      version: 2, songTitle: 'C', durationMs: 1000, bpm: 120,
      patternSet: ['g1'],
      events: [
        { t: 0, cmd: 'SET_PATTERN', params: { index: 0 } },
        { t: 0, cmd: 'SET_BRIGHTNESS', params: { value: 255 } },
      ],
    }
    const frame = renderShowFrame(collectionShow, 0, 4, 4, groups)
    expect(frame.flat().some((px) => px.r > 100)).toBe(true)   // the group's red SolidColor

    // With no registry the group can't resolve, so it renders blank.
    const blankFrame = renderShowFrame(collectionShow, 0, 4, 4)
    expect(blankFrame.flat().every((px) => px.r + px.g + px.b === 0)).toBe(true)
  })

  it('feeds section energy to the energy group-input role only when enabled', () => {
    const mk = (id: string, nodeType: string, properties: Record<string, unknown>, inputs: unknown[] = [], outputs: unknown[] = []) =>
      ({ id, type: 'studioNode', position: { x: 0, y: 0 }, data: { label: nodeType, nodeType, category: 'pattern', properties, inputs, outputs } })
    // A group whose white frame is dimmed by a BrightnessMod driven by the
    // `energy` GroupInput, so a lower energy → a darker frame (when enabled).
    const groups = {
      g1: {
        nodes: [
          mk('white', 'SolidColor', { r: 255, g: 255, b: 255 }, [], [{ id: 'frame', dataType: 'frame' }]),
          mk('gi', 'GroupInput', { paramId: 'energy' }, [], [{ id: 'out', dataType: 'float' }]),
          mk('bm', 'BrightnessMod', {}, [{ id: 'frame', dataType: 'frame' }, { id: 'brightness', dataType: 'float' }], [{ id: 'frame', dataType: 'frame' }]),
          mk('go', 'GroupOutput', {}, [{ id: 'frame', dataType: 'frame' }], []),
        ],
        edges: [
          { id: 'e1', source: 'white', sourceHandle: 'frame', target: 'bm', targetHandle: 'frame' },
          { id: 'e2', source: 'gi', sourceHandle: 'out', target: 'bm', targetHandle: 'brightness' },
          { id: 'e3', source: 'bm', sourceHandle: 'frame', target: 'go', targetHandle: 'frame' },
        ],
      },
    } as unknown as Parameters<typeof renderShowFrame>[4]

    const show: ShowFile = {
      version: 2, songTitle: 'C', durationMs: 1000, bpm: 120, patternSet: ['g1'],
      events: [
        { t: 0, cmd: 'SET_PATTERN', params: { index: 0 } },
        { t: 0, cmd: 'SET_BRIGHTNESS', params: { value: 255 } },
        { t: 0, cmd: 'SET_ENERGY', params: { value: 0.2 } },
      ],
    }
    const sum = (f: ReturnType<typeof renderShowFrame>) => f.flat().reduce((a, px) => a + px.r + px.g + px.b, 0)
    const modulated = renderShowFrame(show, 0, 4, 4, groups, true)   // energy 0.2 dims it
    const authored  = renderShowFrame(show, 0, 4, 4, groups, false)  // energy ignored → full
    expect(sum(modulated)).toBeLessThan(sum(authored))
  })

  it('feeds the normalised section speed to the speed group-input role only when enabled', () => {
    const mk = (id: string, nodeType: string, properties: Record<string, unknown>, inputs: unknown[] = [], outputs: unknown[] = []) =>
      ({ id, type: 'studioNode', position: { x: 0, y: 0 }, data: { label: nodeType, nodeType, category: 'pattern', properties, inputs, outputs } })
    // A group whose white frame is dimmed by a BrightnessMod driven by the
    // `speed` GroupInput, so a lower speed → a darker frame (when enabled).
    const groups = {
      g1: {
        nodes: [
          mk('white', 'SolidColor', { r: 255, g: 255, b: 255 }, [], [{ id: 'frame', dataType: 'frame' }]),
          mk('gi', 'GroupInput', { paramId: 'speed' }, [], [{ id: 'out', dataType: 'float' }]),
          mk('bm', 'BrightnessMod', {}, [{ id: 'frame', dataType: 'frame' }, { id: 'brightness', dataType: 'float' }], [{ id: 'frame', dataType: 'frame' }]),
          mk('go', 'GroupOutput', {}, [{ id: 'frame', dataType: 'frame' }], []),
        ],
        edges: [
          { id: 'e1', source: 'white', sourceHandle: 'frame', target: 'bm', targetHandle: 'frame' },
          { id: 'e2', source: 'gi', sourceHandle: 'out', target: 'bm', targetHandle: 'brightness' },
          { id: 'e3', source: 'bm', sourceHandle: 'frame', target: 'go', targetHandle: 'frame' },
        ],
      },
    } as unknown as Parameters<typeof renderShowFrame>[4]

    const show: ShowFile = {
      version: 2, songTitle: 'C', durationMs: 1000, bpm: 120, patternSet: ['g1'],
      events: [
        { t: 0, cmd: 'SET_PATTERN', params: { index: 0 } },
        { t: 0, cmd: 'SET_BRIGHTNESS', params: { value: 255 } },
        { t: 0, cmd: 'SET_SPEED', params: { value: 0.4 } },   // 0.4 / 2 = 0.2 → dim
      ],
    }
    const sum = (f: ReturnType<typeof renderShowFrame>) => f.flat().reduce((a, px) => a + px.r + px.g + px.b, 0)
    const modulated = renderShowFrame(show, 0, 4, 4, groups, true)   // speed role dims it
    const authored  = renderShowFrame(show, 0, 4, 4, groups, false)  // speed ignored → full
    expect(sum(modulated)).toBeLessThan(sum(authored))
  })

  it('scales a beat flash through global brightness like FastLED', () => {
    const dimShow: ShowFile = {
      ...show,
      events: [
        { t: 0, cmd: 'SET_PATTERN', params: { name: 'SolidColor' } },
        { t: 0, cmd: 'SET_BRIGHTNESS', params: { value: 64 } },
        { t: 0, cmd: 'BEAT_FLASH', params: { intensity: 255, decay: 255 } },
      ],
    }
    const px = renderShowFrame(dimShow, 0, 1, 1)[0][0]
    expect(px).toEqual({ r: 64, g: 64, b: 64 })
  })
})
