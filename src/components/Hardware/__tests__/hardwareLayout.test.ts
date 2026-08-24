import { describe, expect, it } from 'vitest'
import {
  hardwareArrangement,
  mediaBandHeight,
  type HardwarePartBox,
  type HardwarePartLink,
} from '../hardwareLayout'

const BOARD: HardwarePartBox = { id: 'board', widthMm: 25.6, heightMm: 55 }
const MIC: HardwarePartBox = { id: 'mic', widthMm: 20.5, heightMm: 14.5 }
const STRIP: HardwarePartBox = { id: 'led-string', widthMm: 1305, heightMm: 8.41 }

const STAGE = { width: 1000, height: 400, offsetX: 0 }

const CHAIN: HardwarePartLink[] = [
  { source: 'mic', target: 'board' },
  { source: 'board', target: 'led-string' },
]

const arrange = (
  parts: HardwarePartBox[],
  links: HardwarePartLink[],
  stage = STAGE,
) => hardwareArrangement(parts, links, stage, 'board')

const index = <T extends { id: string }>(parts: T[]) =>
  new Map(parts.map((part) => [part.id, part]))

describe('hardware arrangement', () => {
  it('scales every part through one factor, so sizes stay in proportion', () => {
    const { parts, mmScale } = arrange([MIC, BOARD, STRIP], CHAIN)
    const byId = index(parts)

    // The tallest part fills the band; everything else follows from its own mm.
    expect(byId.get('board')!.height).toBeCloseTo(mediaBandHeight(STAGE.height))
    expect(byId.get('mic')!.height).toBeCloseTo(MIC.heightMm * mmScale)
    expect(byId.get('mic')!.width / byId.get('board')!.width)
      .toBeCloseTo(MIC.widthMm / BOARD.widthMm)
  })

  it('centres the view on the controller, not on the bounding box', () => {
    const boardOnly = arrange([BOARD], [])
    const withStrip = arrange([BOARD, STRIP], [CHAIN[1]])
    const centre = (parts: { x: number; width: number }[]) => parts[0].x + parts[0].width / 2

    expect(centre(boardOnly.parts.filter((part) => part.id === 'board')))
      .toBeCloseTo(STAGE.width / 2)
    // Adding a long run to the right must not push the board off centre.
    expect(centre(withStrip.parts.filter((part) => part.id === 'board')))
      .toBeCloseTo(STAGE.width / 2)
  })

  it('lets a long run continue off the stage rather than shrinking it', () => {
    const { parts, mmScale } = arrange([BOARD, STRIP], [CHAIN[1]])
    const strip = index(parts).get('led-string')!
    // Full physical length, at the same scale as every other part.
    expect(strip.width).toBeCloseTo(STRIP.widthMm * mmScale)
    expect(strip.x + strip.width).toBeGreaterThan(STAGE.width)
  })

  it('orders parts by dataflow: sources left, board between, outputs right', () => {
    const { parts } = arrange([STRIP, BOARD, MIC], CHAIN)
    const byId = index(parts)
    expect(byId.get('mic')!.x).toBeLessThan(byId.get('board')!.x)
    expect(byId.get('board')!.x).toBeLessThan(byId.get('led-string')!.x)
  })

  it('centres each part in its own slot, whatever its height', () => {
    const { parts, band } = arrange([MIC, BOARD, STRIP], CHAIN)
    const byId = index(parts)
    const centreOf = (id: string) => byId.get(id)!.y + byId.get(id)!.height / 2
    // A short part centred on the same line as a tall one is what keeps the
    // runs meeting the parts they join.
    expect(centreOf('mic')).toBeCloseTo(centreOf('board'))
    expect(centreOf('led-string')).toBeCloseTo(centreOf('board'))
    expect(byId.get('board')!.height).toBeCloseTo(band)
  })

  it('places every caption directly beneath its rendered part', () => {
    const { parts } = arrange([MIC, BOARD, STRIP], CHAIN)
    for (const part of parts) {
      expect(part.captionY - (part.y + part.height)).toBeCloseTo(8)
    }
  })

  it('gives every run a bend by attaching at stepped heights, not flat centres', () => {
    const { links } = arrange([MIC, BOARD, STRIP], CHAIN)
    for (const link of links) {
      expect(link.y1).not.toBeCloseTo(link.y2)
    }
  })

  it('attaches runs near the top of a part, the height a noodle leaves a node', () => {
    const { parts, links } = arrange([MIC, BOARD, STRIP], CHAIN)
    const board = index(parts).get('board')!
    const incoming = links.find((link) => link.target === 'board')!
    const fraction = (incoming.y2 - board.y) / board.height
    expect(fraction).toBeGreaterThan(0.1)
    expect(fraction).toBeLessThan(0.4)
  })

  it('runs each link from one part edge to the other', () => {
    const { parts, links } = arrange([MIC, BOARD, STRIP], CHAIN)
    const byId = index(parts)
    const micRun = links.find((link) => link.source === 'mic')!
    expect(micRun.x1).toBeCloseTo(byId.get('mic')!.x + byId.get('mic')!.width)
    expect(micRun.x2).toBeCloseTo(byId.get('board')!.x)
  })

  it('takes the next slot down for a second part on the same side', () => {
    const second: HardwarePartBox = { ...STRIP, id: 'led-string-2' }
    const { parts } = arrange(
      [MIC, BOARD, STRIP, second],
      [...CHAIN, { source: 'board', target: 'led-string-2' }],
    )
    const byId = index(parts)
    expect(byId.get('led-string')!.x).toBeCloseTo(byId.get('led-string-2')!.x)
    expect(byId.get('led-string')!.y).toBeLessThan(byId.get('led-string-2')!.y)
  })

  it('steps the attachment down per run so two runs on a side do not overlap', () => {
    const second: HardwarePartBox = { ...STRIP, id: 'led-string-2' }
    const { links } = arrange(
      [MIC, BOARD, STRIP, second],
      [...CHAIN, { source: 'board', target: 'led-string-2' }],
    )
    const outgoing = links.filter((link) => link.source === 'board')
    expect(outgoing).toHaveLength(2)
    expect(outgoing[0].y1).not.toBeCloseTo(outgoing[1].y1)
  })

  it('shrinks the band so a stacked arrangement still fits the pane', () => {
    const second: HardwarePartBox = { ...STRIP, id: 'led-string-2' }
    const short = { width: 1000, height: 330, offsetX: 0 }
    const stacked = hardwareArrangement(
      [MIC, BOARD, STRIP, second],
      [...CHAIN, { source: 'board', target: 'led-string-2' }],
      short,
      'board',
    )
    const top = Math.min(...stacked.parts.map((part) => part.y))
    const bottom = Math.max(...stacked.parts.map((part) => part.captionY))
    expect(bottom - top).toBeLessThanOrEqual(short.height)
    expect(stacked.band).toBeLessThan(mediaBandHeight(short.height))
    // Fitting shrinks the whole arrangement, so parts stay in proportion.
    const byId = index(stacked.parts)
    expect(byId.get('mic')!.width / byId.get('board')!.width)
      .toBeCloseTo(MIC.widthMm / BOARD.widthMm)
  })

  it('centres on the controller within the area the side panels leave', () => {
    const inset = { width: 600, height: 400, offsetX: 280 }
    const { parts } = hardwareArrangement([MIC, BOARD], [CHAIN[0]], inset, 'board')
    const board = index(parts).get('board')!
    expect(board.x + board.width / 2).toBeCloseTo(inset.offsetX + inset.width / 2)
  })

  it('holds a long run’s caption near its start rather than off screen', () => {
    const { parts } = arrange([BOARD, STRIP], [CHAIN[1]])
    const strip = index(parts).get('led-string')!
    expect(strip.captionX).toBeLessThan(strip.x + strip.width / 2)
    expect(strip.captionX).toBeGreaterThan(strip.x)
  })

  it('keeps the band within its bounds however the pane is resized', () => {
    expect(mediaBandHeight(0)).toBe(52)
    expect(mediaBandHeight(4000)).toBe(226)
    expect(mediaBandHeight(300)).toBe(150)
  })
})
