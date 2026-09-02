import { describe, expect, it } from 'vitest'
import {
  hardwareArrangement,
  hardwareCaptionDetail,
  hardwareCaptionScale,
  hardwareCaptionWorldScale,
  hardwareUiScale,
  mediaBandHeight,
  runCells,
  type HardwarePartBox,
  type HardwarePartLink,
} from '../hardwareLayout'

const BOARD: HardwarePartBox = { id: 'board', widthMm: 25.6, heightMm: 55 }
const MIC: HardwarePartBox = { id: 'mic', widthMm: 20.5, heightMm: 14.5 }
/** One WS2812B pitch, which is every part of that LED: a panel's grid, a
 *  string drawn as one row of it, a VU rail as one column. */
const PITCH_MM = 10
const STRIP: HardwarePartBox = {
  id: 'led-string',
  widthMm: 60 * PITCH_MM,
  heightMm: PITCH_MM,
}
/** A 16x8 panel of the same LED. */
const PANEL: HardwarePartBox = {
  id: 'panel',
  widthMm: 16 * PITCH_MM,
  heightMm: 8 * PITCH_MM,
  emitterMm: PITCH_MM,
}

const STAGE = { width: 1000, height: 400, offsetX: 0 }

const RUN_STRIP: HardwarePartBox = {
  ...STRIP,
  run: { axis: 'x', units: 60, unitMm: PITCH_MM },
}
const VU_RAIL: HardwarePartBox = {
  id: 'vu',
  widthMm: 6 * PITCH_MM,
  heightMm: 60 * PITCH_MM,
  run: { axis: 'y', units: 60, unitMm: PITCH_MM },
}
const TO_VU: HardwarePartLink = { source: 'board', target: 'vu' }

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
  it('scales captions with the resizeable hardware band', () => {
    expect(hardwareCaptionScale(mediaBandHeight(452))).toBe(1)
    expect(hardwareCaptionScale(mediaBandHeight(226))).toBeCloseTo(0.5)
  })

  it('scales layout chrome with the controller when a tall installation dominates', () => {
    const tallFixture: HardwarePartBox = { id: 'vu', widthMm: 110, heightMm: 600 }
    const result = arrange(
      [MIC, BOARD, tallFixture],
      [{ source: 'mic', target: 'board' }, { source: 'board', target: 'vu' }],
    )
    const board = index(result.parts).get('board')!

    expect(result.uiScale).toBeCloseTo(hardwareUiScale(result.band, board.height))
    // Chrome still follows the controller rather than the band — but under a
    // compressed scale a part ten times the controller's size no longer
    // reduces the controller to a few pixels, so the clearance it implies is a
    // usable one rather than a collapsed one.
    expect(result.uiScale).toBeLessThan(hardwareCaptionScale(result.band))
    expect(board.height / result.band).toBeGreaterThan(0.3)
  })

  it('compresses the size difference between parts without distorting any of them', () => {
    const { parts } = arrange([MIC, BOARD, STRIP], CHAIN)
    const byId = index(parts)
    const mic = byId.get('mic')!
    const board = byId.get('board')!

    // Each part is drawn at one factor of its own, so its shape is untouched:
    // a strip is still as long and thin as a strip is.
    for (const part of [MIC, BOARD, STRIP]) {
      const placed = byId.get(part.id)!
      expect(placed.width / placed.height).toBeCloseTo(part.widthMm / part.heightMm, 3)
      expect(placed.width).toBeCloseTo(part.widthMm * placed.mmScale)
    }

    // The controller still reads as the bigger of the two, but by a factor the
    // bench can draw both at rather than by the true one.
    const trueRatio = BOARD.heightMm / MIC.heightMm
    const drawnRatio = board.height / mic.height
    expect(drawnRatio).toBeGreaterThan(1)
    expect(drawnRatio).toBeLessThan(trueRatio)
  })

  it('draws the physically larger part larger, whatever the compression', () => {
    const tiny: HardwarePartBox = { id: 'tiny', widthMm: 6, heightMm: 5 }
    const { parts } = arrange([tiny, MIC, BOARD], [
      { source: 'tiny', target: 'board' },
      { source: 'mic', target: 'board' },
    ])
    const byId = index(parts)
    expect(byId.get('tiny')!.height).toBeLessThan(byId.get('mic')!.height)
    expect(byId.get('mic')!.height).toBeLessThan(byId.get('board')!.height)
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

  it('draws a long part whole and undistorted, at a compressed multiple of the board', () => {
    const { parts } = arrange([BOARD, STRIP], [CHAIN[1]])
    const byId = index(parts)
    const strip = byId.get('led-string')!
    const board = byId.get('board')!

    expect(strip.broken).toBeNull()
    expect(strip.width).toBeCloseTo(STRIP.widthMm * strip.mmScale)
    expect(strip.width / strip.height).toBeCloseTo(STRIP.widthMm / STRIP.heightMm, 3)

    // Still conspicuously the long thing on the bench, but at a small multiple
    // of the controller rather than the fifty-to-one one shared scale gave it.
    const trueRatio = STRIP.widthMm / BOARD.widthMm
    const drawnRatio = strip.width / board.width
    expect(drawnRatio).toBeGreaterThan(3)
    expect(drawnRatio).toBeLessThan(trueRatio / 3)
  })

  it('puts what feeds the board above it and what it drives below', () => {
    const { parts } = arrange([STRIP, BOARD, MIC], CHAIN)
    const byId = index(parts)
    const board = byId.get('board')!
    const mic = byId.get('mic')!
    const strip = byId.get('led-string')!

    // Which side a part belongs on is read off the runs, not declared.
    expect(mic.y + mic.height).toBeLessThanOrEqual(board.y)
    expect(strip.y).toBeGreaterThanOrEqual(board.y + board.height)
    // And both rows are centred on the board rather than trailing off one side.
    expect(mic.x + mic.width / 2).toBeCloseTo(board.x + board.width / 2, 0)
    expect(strip.x + strip.width / 2).toBeCloseTo(board.x + board.width / 2, 0)
  })

  it('shrinks layout gaps with the band so zooming in does not spread parts apart', () => {
    const tall = arrange([MIC, BOARD], [CHAIN[0]], { width: 1000, height: 452, offsetX: 0 })
    const short = arrange([MIC, BOARD], [CHAIN[0]], { width: 1000, height: 104, offsetX: 0 })
    const clearance = (parts: typeof tall.parts) => {
      const byId = index(parts)
      const mic = byId.get('mic')!
      const board = byId.get('board')!
      return board.x - (mic.x + mic.width)
    }

    // Comparing in full-band units models zooming each arrangement until the
    // controller is the same visible size. Their whitespace should then match.
    expect(clearance(short.parts) / short.band)
      .toBeCloseTo(clearance(tall.parts) / tall.band, 1)
  })

  it('keeps electronics close when a physically tall fixture sets the scale', () => {
    const tallFixture: HardwarePartBox = { id: 'vu', widthMm: 110, heightMm: 600 }
    const { parts, uiScale } = arrange(
      [MIC, BOARD, tallFixture],
      [{ source: 'mic', target: 'board' }, { source: 'board', target: 'vu' }],
    )
    const byId = index(parts)
    const mic = byId.get('mic')!
    const board = byId.get('board')!
    const clearanceAtReadableScale = (board.x - (mic.x + mic.width)) / uiScale

    expect(clearanceAtReadableScale).toBeLessThan(120)
  })

  it('aligns a row on the edge its runs leave from, whatever the heights', () => {
    const enc: HardwarePartBox = { id: 'enc', widthMm: 32, heightMm: 30 }
    const panel: HardwarePartBox = { id: 'panel', widthMm: 160, heightMm: 160 }
    const { parts, band } = arrange(
      [MIC, enc, BOARD, STRIP, panel],
      [
        { source: 'mic', target: 'board' },
        { source: 'enc', target: 'board' },
        { source: 'board', target: 'led-string' },
        { source: 'board', target: 'panel' },
      ],
    )
    const byId = index(parts)
    const lower = (id: string) => byId.get(id)!.y + byId.get(id)!.height

    // Inputs share a lower edge and outputs an upper one, so a bundle of runs
    // meets a straight line of parts rather than a ragged one.
    expect(lower('mic')).toBeCloseTo(lower('enc'))
    expect(byId.get('led-string')!.y).toBeCloseTo(byId.get('panel')!.y)
    // The band is filled by the tallest part whose size sets the scale, which
    // here is the panel rather than the controller.
    expect(byId.get('panel')!.height).toBeCloseTo(band)
  })

  it('labels the outside of the bench, leaving the channel to the wiring', () => {
    const { parts } = arrange([MIC, BOARD, STRIP], CHAIN)
    const byId = index(parts)
    const mic = byId.get('mic')!
    const board = byId.get('board')!
    const strip = byId.get('led-string')!

    // An input labels above itself because the space below it is the bundle
    // into the board; an output labels below for the same reason reversed.
    expect(mic.captionAnchor).toBe('above')
    expect(mic.captionY).toBeLessThanOrEqual(mic.y)
    expect(strip.captionAnchor).toBe('below')
    expect(strip.captionY).toBeGreaterThanOrEqual(strip.y + strip.height)

    // The board is wired on both sides, so neither is free for its label.
    expect(board.captionAnchor).toBe('left')
    expect(board.captionX).toBeLessThan(board.x)
    expect(board.captionY).toBeCloseTo(board.y + board.height / 2)
  })

  it('turns only square corners', () => {
    const { links } = arrange([MIC, BOARD, STRIP], CHAIN)
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) {
      expect(link.points.length).toBeGreaterThanOrEqual(3)
      for (let i = 1; i < link.points.length; i++) {
        const from = link.points[i - 1]
        const to = link.points[i]
        // Every segment moves along exactly one axis — no diagonals anywhere.
        const horizontal = Math.abs(from.y - to.y) < 1e-6
        const vertical = Math.abs(from.x - to.x) < 1e-6
        expect(horizontal || vertical).toBe(true)
      }
    }
  })

  it('leaves a part on the edge facing the channel', () => {
    const { parts, links } = arrange([MIC, BOARD, STRIP], CHAIN)
    const byId = index(parts)
    const mic = byId.get('mic')!
    const strip = byId.get('led-string')!

    const incoming = links.find((link) => link.target === 'board')!
    expect(incoming.y1).toBeCloseTo(mic.y + mic.height)

    const outgoing = links.find((link) => link.source === 'board')!
    expect(outgoing.y2).toBeCloseTo(strip.y)
  })

  it('plugs into the flanks of the board, not its ends', () => {
    const { parts, links } = arrange([MIC, BOARD, STRIP], CHAIN)
    const byId = index(parts)
    const board = byId.get('board')!

    // Where a dev board's headers are. The ends stay clear, which is what the
    // detail drawn on the board needs to stay readable.
    const onAFlank = (x: number) =>
      Math.min(Math.abs(x - board.x), Math.abs(x - (board.x + board.width)))

    const incoming = links.find((link) => link.target === 'board')!
    expect(onAFlank(incoming.x2)).toBeCloseTo(0)
    expect(incoming.y2).toBeGreaterThan(board.y)
    expect(incoming.y2).toBeLessThan(board.y + board.height)

    const outgoing = links.find((link) => link.source === 'board')!
    expect(onAFlank(outgoing.x1)).toBeCloseTo(0)
    expect(outgoing.y1).toBeGreaterThan(board.y)
    expect(outgoing.y1).toBeLessThan(board.y + board.height)
  })

  it('takes the side of the board its part already sits on', () => {
    const left: HardwarePartBox = { ...STRIP, id: 'led-string-left' }
    const right: HardwarePartBox = { ...STRIP, id: 'led-string-right' }
    const { parts, links } = arrange(
      [MIC, BOARD, left, right],
      [
        { source: 'mic', target: 'board' },
        { source: 'board', target: 'led-string-left' },
        { source: 'board', target: 'led-string-right' },
      ],
    )
    const byId = index(parts)
    const board = byId.get('board')!
    // Nothing crosses the board to reach a header on the far side of it.
    for (const link of links.filter((run) => run.source === 'board')) {
      const part = byId.get(link.target)!
      const partLeft = part.x + part.width / 2 <= board.x + board.width / 2
      expect(link.x1).toBeCloseTo(partLeft ? board.x : board.x + board.width)
    }
  })

  it('routes a full bench without one run crossing another', () => {
    // Derived rather than eyeballed: the ordering rules in `planBus` exist to
    // make this true, and a bench wide enough to have a near and a far part on
    // both flanks is what exercises all three of them at once.
    const outputs = ['matrix', 'amp', 'tft', 'strip', 'panel']
      .map((id) => ({ ...STRIP, id }))
    const inputs = ['mic', 'mic-2', 'mic-3'].map((id) => ({ ...MIC, id }))
    const { links } = arrange(
      [...inputs, BOARD, ...outputs],
      [
        ...inputs.map((part) => ({ source: part.id, target: 'board' })),
        ...outputs.map((part) => ({ source: 'board', target: part.id })),
      ],
    )
    expect(links).toHaveLength(inputs.length + outputs.length)

    const segments = links.map((link) => link.points
      .slice(1)
      .map((to, index) => ({ from: link.points[index], to })))
    const spans = (a: number, b: number) => [Math.min(a, b), Math.max(a, b)] as const
    const overlap = (a: readonly [number, number], b: readonly [number, number]) =>
      a[0] <= b[1] + 1e-6 && b[0] <= a[1] + 1e-6

    for (let a = 0; a < segments.length; a++) {
      for (let b = a + 1; b < segments.length; b++) {
        for (const one of segments[a]) {
          for (const other of segments[b]) {
            // Two axis-aligned segments meet only where both spans overlap.
            const crossed = overlap(spans(one.from.x, one.to.x), spans(other.from.x, other.to.x))
              && overlap(spans(one.from.y, one.to.y), spans(other.from.y, other.to.y))
            if (crossed) {
              throw new Error(
                `${links[a].source}->${links[a].target} crosses ${links[b].source}->${links[b].target}`
                + ` at (${one.from.x},${one.from.y})-(${one.to.x},${one.to.y})`,
              )
            }
          }
        }
      }
    }
  })

  it("keeps the board's caption clear of the bundle down its flank", () => {
    const left: HardwarePartBox = { ...STRIP, id: 'led-string-left' }
    const second: HardwarePartBox = { ...STRIP, id: 'led-string-left-2' }
    const { parts, links } = arrange(
      [MIC, BOARD, left, second],
      [
        { source: 'mic', target: 'board' },
        { source: 'board', target: 'led-string-left' },
        { source: 'board', target: 'led-string-left-2' },
      ],
    )
    const byId = index(parts)
    const board = byId.get('board')!
    // The lanes running down the left flank: beside the board, not past it.
    const flank = links
      .flatMap((link) => link.points)
      .filter((point) =>
        point.x < board.x && point.y > board.y && point.y < board.y + board.height)
      .map((point) => point.x)
    expect(flank.length).toBeGreaterThan(0)
    expect(board.captionX).toBeLessThan(Math.min(...flank))
  })

  it('drops out of a part vertically and travels in the channel between', () => {
    const { parts, links } = arrange([MIC, BOARD, STRIP], CHAIN)
    const byId = index(parts)
    const board = byId.get('board')!
    const run = links.find((link) => link.source === 'mic')!

    // Down out of the part, across a lane, down into the board.
    expect(run.points[0].x).toBeCloseTo(run.points[1].x)
    expect(run.points[1].y).toBeCloseTo(run.points[2].y)
    expect(run.points[2].x).toBeCloseTo(run.points[3].x)
    // The lane is in the channel: clear of the part above and of the board.
    const laneY = run.points[1].y
    expect(laneY).toBeLessThan(board.y)
    expect(laneY).toBeGreaterThan(byId.get('mic')!.y + byId.get('mic')!.height)
  })

  it('takes the next slot across for a second part on the same side', () => {
    const second: HardwarePartBox = { ...STRIP, id: 'led-string-2' }
    const { parts } = arrange(
      [MIC, BOARD, STRIP, second],
      [...CHAIN, { source: 'board', target: 'led-string-2' }],
    )
    const byId = index(parts)
    // Sideways, not downwards: adding a part widens the bench, which is the
    // dimension this pane has spare.
    expect(byId.get('led-string')!.y).toBeCloseTo(byId.get('led-string-2')!.y)
    expect(byId.get('led-string')!.x).toBeLessThan(byId.get('led-string-2')!.x)
  })

  it('gives every run a lane of its own rather than one shared trunk', () => {
    const second: HardwarePartBox = { ...STRIP, id: 'led-string-2' }
    const { links } = arrange(
      [MIC, BOARD, STRIP, second],
      [...CHAIN, { source: 'board', target: 'led-string-2' }],
    )
    const outgoing = links.filter((link) => link.source === 'board')
    expect(outgoing).toHaveLength(2)

    // These are different pins, not one bus: drawing them on the same line
    // would say they were joined.
    expect(outgoing[0].points[1].y).not.toBeCloseTo(outgoing[1].points[1].y)
    // They leave the board at different points along its edge too, so nothing
    // crosses in the short stretch beside it.
    expect(outgoing[0].x1).not.toBeCloseTo(outgoing[1].x1)
  })

  it('keeps a stacked arrangement within the pane', () => {
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
    expect(stacked.band).toBeLessThanOrEqual(mediaBandHeight(short.height))
    // Compact stacking still leaves every physical part its own shape.
    const byId = index(stacked.parts)
    for (const part of [MIC, BOARD]) {
      const placed = byId.get(part.id)!
      expect(placed.width / placed.height).toBeCloseTo(part.widthMm / part.heightMm, 3)
    }
  })

  it('centres on the controller within the area the side panels leave', () => {
    const inset = { width: 600, height: 400, offsetX: 280 }
    const { parts } = hardwareArrangement([MIC, BOARD], [CHAIN[0]], inset, 'board')
    const board = index(parts).get('board')!
    expect(board.x + board.width / 2).toBeCloseTo(inset.offsetX + inset.width / 2)
  })

  it('sizes a slot for the label its part will draw, not just for the render', () => {
    // A module whose render is narrower than its label still gets a slot wide
    // enough to hold it, or its pin line writes across its neighbour's.
    const { parts } = arrange([MIC, BOARD, STRIP], CHAIN)
    for (const part of parts.filter((placed) => placed.captionBlock > 0)) {
      expect(part.slotWidth).toBeGreaterThanOrEqual(part.width - 0.001)
    }
  })

  it('centres a label on the slot its part was given', () => {
    const { parts } = arrange([MIC, BOARD, STRIP], CHAIN)
    for (const part of parts.filter((placed) => placed.captionAnchor !== 'left')) {
      expect(part.captionX).toBeCloseTo(part.x + part.width / 2, 0)
    }
  })

  it('keeps the band within its bounds however the pane is resized', () => {
    expect(mediaBandHeight(0)).toBe(52)
    expect(mediaBandHeight(4000)).toBe(226)
    expect(mediaBandHeight(300)).toBe(150)
  })

  it('does not let a run standing on end set the scale for everything else', () => {
    const { parts, band } = arrange([MIC, BOARD, VU_RAIL], [CHAIN[0], TO_VU])
    const byId = index(parts)

    // Unbroken, a 1.3 m rail beside a 55 mm controller left the controller a
    // few pixels tall. The controller is the tallest part whose size is worth
    // comparing, so it is the one that fills the band.
    expect(byId.get('board')!.height).toBeCloseTo(band)
    expect(byId.get('vu')!.broken).not.toBeNull()
    // Still the tallest thing on the bench — a rail is tall — but by a factor
    // the controller survives rather than by the twenty-four the tape implies.
    expect(byId.get('vu')!.height).toBeLessThan(byId.get('board')!.height * 3)
  })

  it('breaks a long run rather than drawing its emitters at a smaller pitch', () => {
    const { parts } = arrange([BOARD, RUN_STRIP], [CHAIN[1]])
    const strip = index(parts).get('led-string')!
    const broken = strip.broken!

    expect(broken.total).toBe(60)
    expect(broken.head + broken.tail).toBeLessThan(60)
    // The cross-section keeps the part's own scale — only length was taken.
    expect(strip.height).toBeCloseTo(STRIP.heightMm * strip.mmScale)
    // And what remains is still drawn at one whole LED per emitter pitch.
    const span = broken.head + broken.gap + broken.tail
    expect(strip.width).toBeCloseTo(span * PITCH_MM * strip.mmScale)
    expect(strip.width).toBeLessThan(STRIP.widthMm * strip.mmScale)
  })

  /*
   * Every WS2812B is the same component, so the bench draws it the same size
   * wherever it appears. A run is the one part that can drift: its own
   * compressed scale comes from a diagonal its length dominates, so it takes
   * the emitter size the panel beside it has already settled.
   */
  it.each([
    { what: 'a string', id: 'led-string', run: RUN_STRIP },
    { what: 'a VU rail', id: 'vu', run: VU_RAIL },
  ])('draws one LED of $what the size a panel of the same LED draws one', ({ id, run }) => {
    const { parts } = arrange([BOARD, PANEL, run], [
      { source: 'board', target: 'panel' },
      { source: 'board', target: id },
    ])
    const byId = index(parts)
    // Emitter to emitter, each through its own part's scale: the panel draws
    // sixteen LEDs across its width, the run one per pitch.
    const panelEmitter = byId.get('panel')!.width / 16
    expect(byId.get(id)!.mmScale * PITCH_MM).toBeCloseTo(panelEmitter, 6)
  })

  it('does not take its emitter from a panel built on a different LED', () => {
    // A HUB75 panel is a genuinely denser part — 4 mm pixels against 10 — and
    // matching a string to it would draw the string as the part it is not.
    const hub75: HardwarePartBox = {
      id: 'panel',
      widthMm: 64 * 4,
      heightMm: 32 * 4,
      emitterMm: 4,
    }
    const { parts } = arrange([BOARD, hub75, RUN_STRIP], [
      { source: 'board', target: 'panel' },
      { source: 'board', target: 'led-string' },
    ])
    const byId = index(parts)

    expect(byId.get('led-string')!.mmScale * PITCH_MM)
      .toBeGreaterThan(byId.get('panel')!.width / 64)
  })

  it('leaves a run that already fits alone', () => {
    const short: HardwarePartBox = {
      id: 'led-string',
      widthMm: 4 * PITCH_MM,
      heightMm: PITCH_MM,
      run: { axis: 'x', units: 4, unitMm: PITCH_MM },
    }
    const { parts } = arrange([BOARD, short], [CHAIN[1]])
    const strip = index(parts).get('led-string')!

    expect(strip.broken).toBeNull()
    expect(strip.width).toBeCloseTo(short.widthMm * strip.mmScale)
  })

  it('cuts a run at the same emitters however the pane is resized', () => {
    // The pitch scales with the band, so the capacity that decides the cut
    // cancels out — the shrink-to-fit pass cannot make a run gain or lose
    // emitters as it narrows the band underneath it.
    const cut = (height: number) => hardwareArrangement(
      [BOARD, RUN_STRIP],
      [CHAIN[1]],
      { width: 1000, height, offsetX: 0 },
      'board',
    ).parts.find((part) => part.id === 'led-string')!.broken

    expect(cut(400)).toEqual(cut(120))
  })

  it('draws the two ends of a broken run, on the grid the whole run would use', () => {
    const { cells, span } = runCells({ axis: 'x', head: 3, tail: 2, gap: 2, total: 60 })

    expect(span).toBe(7)
    // Near end first, then the far end past the gap — and each cell names the
    // emitter it really is, so the LED after the break is LED 59, not LED 5.
    expect(cells).toEqual([
      { index: 0, slot: 0 },
      { index: 1, slot: 1 },
      { index: 2, slot: 2 },
      { index: 58, slot: 5 },
      { index: 59, slot: 6 },
    ])
  })

  it('keeps a caption the same size on screen however far the view is zoomed', () => {
    const onScreen = (zoom: number) => hardwareCaptionWorldScale(1, zoom) * zoom

    expect(onScreen(0.35)).toBeCloseTo(onScreen(1))
    expect(onScreen(40)).toBeCloseTo(onScreen(1))
  })

  it('stops shrinking caption type and drops caption detail instead', () => {
    // A dense arrangement asks for small type; past a point it would be
    // decoration rather than text, so the size holds and the lines go.
    expect(hardwareCaptionWorldScale(0.05, 1)).toBeGreaterThan(0.5)
    expect(hardwareCaptionDetail(200)).toBe('full')
    expect(hardwareCaptionDetail(40)).toBe('name')
    expect(hardwareCaptionDetail(10)).toBe('none')
  })
})
