/**
 * Arrangement for the hardware view, run through the same layered layout the
 * canvas's Tidy uses.
 *
 * The parts form a small dataflow DAG exactly as nodes do — sources feed the
 * board, the board feeds outputs — so rather than hand-placing them, this hands
 * the boxes to `tidyLayout` and renders the result: inputs left, board between,
 * outputs right, and each further part on a side taking the next slot down.
 * The design note's "connected by the view itself" is the point: there is no
 * arrangement for the user to maintain, and none for this file to invent.
 *
 * Two things it does that a graph layout would not:
 *
 * - **The board is the anchor.** The view centres on the controller rather than
 *   on the bounding box, so choosing a different board does not shift
 *   everything sideways.
 * - **Parts are drawn at compressed scale, not shared scale.** Each part has
 *   its own millimetres-to-pixels, taken from the cube root of its size, so a
 *   panel still reads bigger than a microphone without making the controller
 *   between them unreadable. See `SCALE_COMPRESSION`.
 * - **Runs are a bus, not a diagonal.** Inputs sit in a row above the board and
 *   everything the board drives sits in a row below it. Each run leaves a part
 *   vertically, travels its own horizontal lane in the channel between the
 *   rows, then comes down the flank of the board and plugs into its side, where
 *   a dev board's headers actually are. Every corner is square. Adding a part
 *   widens the bench rather than lengthening a diagonal across it, which is
 *   what puts the pane's spare horizontal space to use. See `routeBus`.
 *
 * Pure, so it is testable without mounting the pane.
 */

/**
 * A part that is a line of repeated emitters.
 *
 * Its cross-section is a fact worth drawing at true scale, but its length is
 * only a count, and a metre of tape drawn at the scale that makes a controller
 * legible is a run whose end nobody can see. So a run may be drawn *broken*,
 * the way a long part is broken in a mechanical drawing: both ends at true
 * pitch, the middle removed, and the real count still stated in the caption.
 * Nothing is rescaled to achieve it, so the one shared millimetre factor still
 * holds across every part on the bench.
 */
export interface HardwarePartRun {
  axis: 'x' | 'y'
  /** Emitters along the run. */
  units: number
  /** Pitch of one emitter, so a break is cut on a whole-LED boundary. */
  unitMm: number
}

/** A part as the layout sees it: a physical footprint in millimetres. */
export interface HardwarePartBox {
  id: string
  widthMm: number
  heightMm: number
  run?: HardwarePartRun
  /**
   * The pitch this part draws its LEDs on, when it draws them on a grid. A run
   * carries the same figure on its `run`; this is how a part that is *not* a
   * run declares one, so a run can be drawn at the size the bench already draws
   * that LED at. Left unset by anything without a grid of emitters — a board, a
   * module, a ring.
   */
  emitterMm?: number
}

/** Where a run was cut, measured in emitters. */
export interface RunBreak {
  axis: 'x' | 'y'
  /** Emitters drawn at the near end, and at the far end. */
  head: number
  tail: number
  /** Emitter slots the removed middle occupies. */
  gap: number
  /** Emitters the real part has. */
  total: number
}

export interface HardwarePartLink {
  source: string
  target: string
}

export interface StageBox {
  /** Usable width, with the overlaying sidebar/preview panels already removed. */
  width: number
  height: number
  /** Left edge of that usable area within the stage. */
  offsetX: number
}

export interface PlacedPart {
  id: string
  /** Top-left of the drawn render. */
  x: number
  y: number
  width: number
  height: number
  /**
   * Which side of this part its label sits on. A part in the upper row labels
   * above itself and one in the lower row below, so labels stay outside the
   * bench and the channel between the rows is left to the wiring. The board is
   * wired on both sides, so its label goes beside it.
   */
  captionAnchor: CaptionAnchor
  /** Where the caption is anchored, and the near edge of the caption block. */
  captionX: number
  captionY: number
  /**
   * The width this part was allotted in its row, which is what a label has to
   * fit inside. A part's own render is not that measurement: a 45 px module
   * given a 90 px slot has room for its pin line, and a 240 px strip given a
   * 240 px one does not have any more room than it needs.
   */
  slotWidth: number
  /** Set when this part is a run drawn with its middle removed. */
  broken: RunBreak | null
  /**
   * This part's own millimetres-to-pixels. Compressed against every other
   * part's, so anything drawn in physical units on top of this part — an LED
   * pitch, a diffuser tile — has to read it from here rather than from one
   * scale shared across the bench.
   */
  mmScale: number
  /**
   * World height reserved under this part for its label, and zero when it is
   * too small to be labelled at all. Read from the same rule the renderer
   * draws captions by, so a dense bench stops paying slot height for labels it
   * is never going to show.
   */
  captionBlock: number
}

/** Which side of a part its label sits on. */
export type CaptionAnchor = 'above' | 'below' | 'left'

export interface PlacedLink {
  source: string
  target: string
  /** The run's two ends, where it plugs into each part. */
  x1: number
  y1: number
  x2: number
  y2: number
  /** Every corner of the run, both ends included, in order. */
  points: Array<{ x: number; y: number }>
  /** Radius the renderer rounds this run's corners to. */
  corner: number
}

export interface HardwareArrangement {
  parts: PlacedPart[]
  links: PlacedLink[]
  /**
   * The anchor's millimetres-to-pixels: the reference for anything not tied to
   * one part, such as wire weight. Each part carries its own `mmScale`, which
   * is what physical detail drawn on that part must use.
   */
  mmScale: number
  /** Maximum physical render height available to the arrangement. */
  band: number
  /** Scale for captions and layout clearance around the rendered electronics. */
  uiScale: number
  /**
   * World scale a caption is drawn at in the untransformed view, and therefore
   * the space the layout reserved for one. Captions hold a readable size on
   * screen where clearance does not, so past a dense enough bench the two part
   * company and the reservation has to follow the caption.
   */
  captionScale: number
}

export interface HardwareArrangementBounds {
  x: number
  y: number
  width: number
  height: number
}

const BAND_MIN = 52
const BAND_MAX = 226
/** Room under the band for the two-line caption, so labels never collide. */
const CAPTION_BLOCK = 46
/** The same for a part only big enough to carry its name. */
const CAPTION_LINE_BLOCK = 26
/** Maximum rendered caption width; kept in sync with HardwarePane.module.css. */
const CAPTION_MAX_WIDTH = 180
/** Minimum readable footprint around a part at a full controller-sized scale. */
const SLOT_MIN_WIDTH = 112
/**
 * Width a labelled part reserves for its label, whatever its render measures.
 * Deliberately under the 180 px a caption may reach: most labels are far
 * shorter, and sizing every slot for the longest possible one would space a row
 * out around text that is not there.
 */
const CAPTION_SLOT_WIDTH = 96
/** Clearance between a part and its label. */
const CAPTION_GAP = 6

/** Spacing between the parallel lanes a fan-out travels in. */
const LANE_STEP = 9
/** Clearance between a part's edge and the nearest lane. */
const LANE_MARGIN = 14
/** How sharply a run turns its corners. */
const LINK_CORNER = 10

/**
 * How hard the size difference between parts is compressed.
 *
 * One shared millimetre scale spans a twenty-to-one range the moment a panel
 * and a microphone share a bench, and no framing survives that: fit the panel
 * and the controller is a speck, size the controller and the panel is off the
 * stage. Each part is drawn at its own scale instead, taken from the cube root
 * of its size, so a 320 mm panel reads under twice a 63 mm controller rather
 * than five times it.
 *
 * What survives is the part anyone actually uses: the panel is still the big
 * thing and the microphone is still a chip. What goes is the literal ratio,
 * which was never legible off a screen and which the bench has no second board
 * to compare against anyway. Aspect ratio is untouched — the compression is one
 * factor per part, so a strip stays as long and thin as a strip is.
 *
 * At 1 this is the old shared scale; at 0 every part is drawn the same size.
 */
const SCALE_COMPRESSION = 1 / 3

/**
 * The smallest an emitter may be drawn before a run stops being a picture of
 * LEDs.
 *
 * A run cannot be sized the way every other part is, because its compressed
 * size comes from a diagonal its length dominates: a metre of tape compressed
 * that way draws a hairline, correct to its own aspect ratio and a picture of
 * nothing. What is recognisable about a run is its emitters, so the emitter is
 * what its scale is set from and the cross-section follows. Breaking cannot
 * help here — it removes emitters without making the remaining ones any bigger
 * — so length is bounded separately, below.
 *
 * This figure is the fallback. Where the bench already draws that same LED on a
 * panel, the run takes its size from there instead, so one component is one
 * size; see `partScale`.
 *
 * Held as a share of the band rather than as a pixel count, so that it shrinks
 * with everything else. A fixed floor would make a run the one thing the
 * shrink-to-fit pass could not shrink, and the pass would narrow the band
 * around a run that never moved.
 */
const RUN_MIN_EMITTER_BANDS = 20 / BAND_MAX

/**
 * How many band-heights a run may occupy before it is drawn broken.
 *
 * Sideways a run is allowed to be conspicuously long — that is what a strip is.
 * Downwards it is held much closer, because height is the scarce dimension: a
 * vertical run is what the shrink-to-fit pass below takes out of every other
 * part on the bench, and a 1.3 m rail left a 55 mm controller a few pixels
 * tall. Neither limit is absolute — a break still needs both ends and a gap,
 * and where one emitter is already a large share of the band that costs more
 * than the limit allows. The floor wins there, and a break that would not
 * actually shorten the run is declined instead.
 */
const RUN_MAX_BANDS_X = 2.4
const RUN_MAX_BANDS_Y = 2.2
/** Emitter slots the removed middle occupies: wide enough to read as a cut. */
const RUN_BREAK_GAP = 2
/** Below this many drawn emitters a break stops being a picture of a run. */
const RUN_MIN_SHOWN = 4

/**
 * Captions are drawn at a constant size on screen, so past a point it is the
 * part that has become too small to label rather than the label that is too
 * big. Detail drops instead of type size.
 */
const CAPTION_NAME_MIN_PX = 26
const CAPTION_FULL_MIN_PX = 68
/** Smallest readable share of the design caption size. */
const CAPTION_MIN_SCREEN_SCALE = 0.72


/** The band scales with the pane, which is resizeable from zero. */
export function mediaBandHeight(stageHeight: number): number {
  return Math.max(BAND_MIN, Math.min(BAND_MAX, stageHeight * 0.5))
}

/**
 * Captions were designed at the full-height hardware band. When the resizeable
 * pane makes that band smaller, keep the type in the same proportion as the
 * physical parts instead of leaving a full-size label under a miniature part.
 */
export function hardwareCaptionScale(band: number): number {
  return Math.min(1, Math.max(0, band / BAND_MAX))
}

/**
 * UI spacing follows the controller's rendered size, not merely the height of
 * the pane. A tall installation such as a VU rail can make a board only a few
 * pixels high while the band itself remains full size; using the band for
 * captions and gaps in that case leaves tiny electronics hundreds of pixels
 * apart. Scaling the non-physical chrome with the anchor keeps that cluster
 * compact, and zooming the board back to a readable size restores normal type
 * and clearance with it.
 */
export function hardwareUiScale(band: number, anchorHeight: number): number {
  return Math.min(hardwareCaptionScale(band), Math.max(0, anchorHeight / BAND_MAX))
}

/**
 * Where to cut a run so it fits the bench, or `null` if it already does.
 *
 * Measured in whole emitters, because a break that lands mid-LED draws half a
 * package. Both the drawn box and the renderer's cell list come from this one
 * answer, so the picture and the geometry cannot disagree.
 *
 * Independent of the band: the run's pitch scales with `mmScale`, which is
 * itself the band over the tallest part, so the capacity below cancels out and
 * the shrink-to-fit pass cannot make a run gain or lose emitters as it goes.
 */
export function runBreakFor(
  run: HardwarePartRun,
  mmScale: number,
  band: number,
): RunBreak | null {
  const unitPx = run.unitMm * mmScale
  if (!(unitPx > 0)) return null
  const maxPx = band * (run.axis === 'x' ? RUN_MAX_BANDS_X : RUN_MAX_BANDS_Y)
  const capacity = Math.floor(maxPx / unitPx)
  if (run.units <= capacity) return null
  const shown = Math.max(RUN_MIN_SHOWN, capacity - RUN_BREAK_GAP)
  // Measured against the slots the break occupies, not the emitters it keeps:
  // a cut that draws as long as the whole run has bought nothing and only
  // costs the reader two strokes to interpret.
  if (shown + RUN_BREAK_GAP >= run.units) return null
  const head = Math.ceil(shown / 2)
  return { axis: run.axis, head, tail: shown - head, gap: RUN_BREAK_GAP, total: run.units }
}

/**
 * The emitters a broken run actually draws: which real LED each one is, and
 * the slot it occupies along the run. Slots are whole emitter pitches, so the
 * two ends stay on the same grid the unbroken run would have used and the
 * middle is simply missing.
 */
export function runCells(broken: RunBreak): {
  cells: Array<{ index: number; slot: number }>
  span: number
} {
  const cells: Array<{ index: number; slot: number }> = []
  for (let i = 0; i < broken.head; i++) cells.push({ index: i, slot: i })
  for (let i = 0; i < broken.tail; i++) {
    cells.push({
      index: broken.total - broken.tail + i,
      slot: broken.head + broken.gap + i,
    })
  }
  return { cells, span: broken.head + broken.gap + broken.tail }
}

/** The drawn length of a broken run, in pixels. */
export function brokenRunLength(broken: RunBreak, unitMm: number, mmScale: number): number {
  return (broken.head + broken.gap + broken.tail) * unitMm * mmScale
}

/** How much of a caption is worth drawing beside a part this wide on screen. */
export type CaptionDetail = 'full' | 'name' | 'none'

export function hardwareCaptionDetail(screenWidth: number): CaptionDetail {
  if (screenWidth < CAPTION_NAME_MIN_PX) return 'none'
  if (screenWidth < CAPTION_FULL_MIN_PX) return 'name'
  return 'full'
}

/**
 * World-space scale for a caption, so it draws at one readable size on screen
 * however far the view is zoomed.
 *
 * Captions live inside the panned and zoomed world, so without this they are
 * multiplied by the zoom twice over: dust at a fit-everything view and a
 * billboard when you close in on a pin. Dividing the design scale back out
 * leaves the label the size it was drawn at, wherever the camera is. It stops
 * shrinking at `CAPTION_MIN_SCREEN_SCALE`, below which `hardwareCaptionDetail`
 * removes lines rather than making type no one can read.
 */
export function hardwareCaptionWorldScale(uiScale: number, zoom: number): number {
  const onScreen = Math.min(1, Math.max(CAPTION_MIN_SCREEN_SCALE, uiScale))
  return onScreen / Math.max(0.0001, zoom)
}

/**
 * Arrange, then shrink to fit vertically. A single row always fits the band,
 * but the moment the layout stacks anything the arrangement is taller than the
 * band alone, so the band comes down until it is all in view. Width is left
 * alone deliberately — a long strip running off the side is intended.
 */
export function hardwareArrangement(
  parts: HardwarePartBox[],
  links: HardwarePartLink[],
  stage: StageBox,
  anchorId: string,
): HardwareArrangement {
  let band = mediaBandHeight(stage.height)
  let arrangement = arrangeAtBand(parts, links, stage, anchorId, band)
  for (let pass = 0; pass < 4; pass++) {
    const used = arrangedHeight(arrangement)
    if (used <= stage.height || band <= BAND_MIN) break
    band = Math.max(BAND_MIN, band * (stage.height / used) * 0.98)
    arrangement = arrangeAtBand(parts, links, stage, anchorId, band)
  }
  return arrangement
}

/**
 * Bounds of everything the user reads on the bench, including captions.
 * Links always terminate on parts, so the part/caption union also contains
 * every link without needing a second bounds pass.
 */
export function hardwareArrangementBounds(
  arrangement: HardwareArrangement,
): HardwareArrangementBounds | null {
  if (!arrangement.parts.length) return null
  const boxes = arrangement.parts.map((part) => captionBox(part, arrangement.captionScale))
  const left = Math.min(...arrangement.parts.map((part, index) =>
    Math.min(part.x, boxes[index].left)))
  const right = Math.max(...arrangement.parts.map((part, index) =>
    Math.max(part.x + part.width, boxes[index].right)))
  const top = Math.min(...arrangement.parts.map((part, index) =>
    Math.min(part.y, boxes[index].top)))
  const bottom = Math.max(...arrangement.parts.map((part, index) =>
    Math.max(part.y + part.height, boxes[index].bottom)))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/**
 * The rectangle a part's label occupies, which depends on the side it is
 * anchored to: a label above a part grows upwards from its anchor, one beside
 * it grows leftwards and is centred on the part's own middle. An unlabelled
 * part collapses to its anchor point and contributes nothing.
 */
function captionBox(part: PlacedPart, captionScale: number) {
  if (part.captionBlock <= 0) {
    return { left: part.captionX, right: part.captionX, top: part.captionY, bottom: part.captionY }
  }
  const width = CAPTION_MAX_WIDTH * captionScale
  if (part.captionAnchor === 'left') {
    return {
      left: part.captionX - width,
      right: part.captionX,
      top: part.captionY - (part.captionBlock / 2),
      bottom: part.captionY + (part.captionBlock / 2),
    }
  }
  const half = width / 2
  if (part.captionAnchor === 'above') {
    return {
      left: part.captionX - half,
      right: part.captionX + half,
      top: part.captionY - part.captionBlock,
      bottom: part.captionY,
    }
  }
  return {
    left: part.captionX - half,
    right: part.captionX + half,
    top: part.captionY,
    bottom: part.captionY + part.captionBlock,
  }
}

/** Full height of what was laid out, caption block included. */
function arrangedHeight(arrangement: HardwareArrangement): number {
  if (!arrangement.parts.length) return 0
  const boxes = arrangement.parts.map((part) => captionBox(part, arrangement.captionScale))
  const top = Math.min(...arrangement.parts.map((part, index) =>
    Math.min(part.y, boxes[index].top)))
  const bottom = Math.max(...arrangement.parts.map((part, index) =>
    Math.max(part.y + part.height, boxes[index].bottom)))
  return bottom - top
}

function arrangeAtBand(
  parts: HardwarePartBox[],
  links: HardwarePartLink[],
  stage: StageBox,
  anchorId: string,
  band: number,
): HardwareArrangement {
  // Each part's size before anything is normalised: the cube root of its own
  // diagonal, so the ratios between parts compress while each part keeps its
  // own shape.
  const rawScale = (part: HardwarePartBox) =>
    Math.pow(Math.max(1, Math.hypot(part.widthMm, part.heightMm)), SCALE_COMPRESSION - 1)

  // The band is set by the parts whose size is a fact about the part. A run's
  // is a fact about how much tape was bought, and letting it set the band left
  // a 55 mm controller a few pixels tall beside a metre of vertical rail.
  const fixed = parts.filter((part) => !part.run)
  const tallest = Math.max(1e-6, ...(fixed.length ? fixed : parts)
    .map((part) => part.heightMm * rawScale(part)))
  const normalise = band / tallest

  const partScale = new Map(parts.map((part) => {
    const scale = normalise * rawScale(part)
    if (!part.run) return [part.id, scale]
    // The same LED, drawn the same size. A panel on the bench has already
    // settled how big this emitter is, and a string whose LEDs draw three times
    // a panel's reads as a different component rather than as the same one in a
    // different shape. Equal pitches, so matching the scale matches the emitter.
    const twin = Math.max(0, ...parts
      .filter((other) => !other.run && other.emitterMm === part.run?.unitMm)
      .map((other) => normalise * rawScale(other)))
    // Nothing to match: a run is then drawn at whatever scale keeps one emitter
    // visible, and the break below stops the length that implies leaving the
    // stage. Where there is a twin it wins outright — a run beside a panel is
    // legible exactly when that panel is, which is the comparison being made.
    const minEmitter = band * RUN_MIN_EMITTER_BANDS
    return [part.id, twin || Math.max(scale, minEmitter / Math.max(0.001, part.run.unitMm))]
  }))
  const mmScale = partScale.get(anchorId) ?? normalise

  const broken = new Map(parts.map((part) => [
    part.id,
    part.run ? runBreakFor(part.run, partScale.get(part.id)!, band) : null,
  ]))
  const drawn = new Map(parts.map((part) => {
    const scale = partScale.get(part.id)!
    const width = part.widthMm * scale
    const height = part.heightMm * scale
    const cut = broken.get(part.id)
    if (!cut || !part.run) return [part.id, { width, height }]
    // Only the length is taken; the cross-section keeps the part's own scale,
    // which is what keeps a break honest about the tape it is a picture of.
    const length = brokenRunLength(cut, part.run.unitMm, scale)
    return [part.id, cut.axis === 'x' ? { width: length, height } : { width, height: length }]
  }))
  const anchorSize = drawn.get(anchorId) ?? drawn.values().next().value
  const layoutScale = hardwareUiScale(band, anchorSize?.height ?? band)
  // Clearance may shrink with the electronics; a label may not shrink past
  // being read. Reserve what a caption actually occupies in the untransformed
  // view, or a dense bench draws readable captions into the part below.
  const captionScale = hardwareCaptionWorldScale(layoutScale, 1)

  // Only the parts that will be labelled reserve room for a label. Giving every
  // module a two-line block on a bench where its render is a few pixels wide
  // buys nothing — the caption is not drawn at that size — and the height comes
  // straight out of the shrink-to-fit pass below, off every part on the bench.
  const captionBlock = new Map(parts.map((part) => {
    const detail = hardwareCaptionDetail(drawn.get(part.id)!.width)
    // Measured against the render here rather than the slot, because the slot
    // is sized from this answer — asking it of the slot would be circular. The
    // renderer asks the slot, which can only ever drop a line this reserved,
    // never add one.
    const lines = detail === 'none' ? 0 : detail === 'name' ? CAPTION_LINE_BLOCK : CAPTION_BLOCK
    return [part.id, lines * captionScale]
  }))

  // Every non-physical measurement follows the band scale, so zooming a small
  // arrangement back up preserves the intended density rather than magnifying
  // fixed pixel gaps.
  const gapX = Math.max(20, Math.min(72, stage.width * 0.05)) * layoutScale
  const laneStep = LANE_STEP * layoutScale
  const laneMargin = LANE_MARGIN * layoutScale

  // Which side of the board a part belongs on, read off the runs rather than
  // declared: a part that feeds the board is an input and goes above it, and
  // everything else hangs below. Nothing has to tell the layout what a part is.
  const feeds = new Set(links.filter((link) => link.target === anchorId).map((link) => link.source))
  const inputs = parts.filter((part) => part.id !== anchorId && feeds.has(part.id))
  const outputs = parts.filter((part) => part.id !== anchorId && !feeds.has(part.id))

  /*
   * A row of parts, spread across the bench and centred on the board.
   *
   * A slot is wide enough for the part, for a minimum readable footprint, and
   * for the label the part is going to draw — a 45 px module with a 130 px
   * caption otherwise writes across its neighbour's. Width is the dimension
   * this view has to spare, so spending it here is the point.
   */
  const rowSlots = (row: HardwarePartBox[], centreX: number) => {
    const widths = row.map((part) => Math.max(
      drawn.get(part.id)!.width,
      SLOT_MIN_WIDTH * layoutScale,
      captionBlock.get(part.id)! > 0 ? CAPTION_SLOT_WIDTH * captionScale : 0,
    ))
    const total = widths.reduce((sum, width) => sum + width, 0)
      + gapX * Math.max(0, row.length - 1)
    let cursor = centreX - total / 2
    return row.map((part, index) => {
      const slot = { part, x: cursor, width: widths[index] }
      cursor += widths[index] + gapX
      return slot
    })
  }

  const centreX = stage.offsetX + stage.width / 2
  const anchorBox = drawn.get(anchorId) ?? anchorSize ?? { width: 0, height: 0 }
  const anchorX = centreX - anchorBox.width / 2
  const anchorY = stage.height / 2 - anchorBox.height / 2

  // The lanes a fan-out travels along, plus clearance either side of the bundle.
  const channel = (count: number) => laneMargin * 2 + Math.max(0, count - 1) * laneStep
  const inChannel = channel(inputs.length)
  const outChannel = channel(outputs.length)

  // Rows sit against the channel, aligned on the edge their runs leave from:
  // inputs on their lower edge, outputs on their upper one, so a bundle meets a
  // straight line of parts rather than a ragged one.
  const inputBottom = anchorY - inChannel
  const outputTop = anchorY + anchorBox.height + outChannel

  const placedParts: PlacedPart[] = []
  const place = (
    part: HardwarePartBox,
    x: number,
    y: number,
    captionX: number,
    slotWidth: number,
    captionAnchor: CaptionAnchor,
  ) => {
    const size = drawn.get(part.id)!
    const block = captionBlock.get(part.id)!
    placedParts.push({
      id: part.id,
      x,
      y,
      width: size.width,
      height: size.height,
      slotWidth,
      broken: broken.get(part.id) ?? null,
      captionBlock: block,
      mmScale: partScale.get(part.id)!,
      captionAnchor,
      captionX,
      // The anchor point, not the block's top: a label above a part hangs from
      // the part's upper edge and grows upwards, one beside it is centred on
      // the part's middle, and only a label below grows downwards from its
      // anchor the way the CSS box naturally does.
      captionY: captionAnchor === 'above'
        ? y - (CAPTION_GAP * layoutScale)
        : captionAnchor === 'left'
          ? y + (size.height / 2)
          : y + size.height + (CAPTION_GAP * layoutScale),
    })
  }

  for (const slot of rowSlots(inputs, centreX)) {
    const size = drawn.get(slot.part.id)!
    // Labels on the outside, runs on the inside: an input's caption goes above
    // it because the space below it is the bundle into the board.
    place(
      slot.part,
      slot.x + (slot.width - size.width) / 2,
      inputBottom - size.height,
      slot.x + slot.width / 2,
      slot.width,
      'above',
    )
  }
  for (const slot of rowSlots(outputs, centreX)) {
    const size = drawn.get(slot.part.id)!
    place(
      slot.part,
      slot.x + (slot.width - size.width) / 2,
      outputTop,
      slot.x + slot.width / 2,
      slot.width,
      'below',
    )
  }
  // Planned before the board is placed, because its caption is placed beside it
  // and the bundle coming down that flank is what the caption has to clear.
  const runs = planBus(
    links,
    new Map([
      ...placedParts.map((part) => [part.id, { x: part.x, width: part.width }] as const),
      [anchorId, { x: anchorX, width: anchorBox.width }] as const,
    ]),
    anchorId,
  )

  const anchorPart = parts.find((part) => part.id === anchorId)
  if (anchorPart) {
    // The board is wired on both flanks, so its label cannot go beside it
    // without clearing the lanes first — and it cannot go above or below it,
    // where the channels are. It sits outside the left-hand bundle.
    place(
      anchorPart,
      anchorX,
      anchorY,
      anchorX - busBundleWidth(runs, 'left', { laneMargin, laneStep })
        - (CAPTION_GAP * 2 * layoutScale),
      CAPTION_MAX_WIDTH * captionScale,
      'left',
    )
  }

  return {
    parts: placedParts,
    links: routeBus(runs, placedParts, anchorId, {
      laneMargin,
      laneStep,
      corner: LINK_CORNER * layoutScale,
    }),
    mmScale,
    band,
    uiScale: layoutScale,
    captionScale,
  }
}

/**
 * How a single run leaves the board, before any of it is measured in pixels.
 *
 * Split out from the routing itself because the board's caption has to know the
 * answer too: the label sits beside the board, and the bundle of runs down that
 * side is what it has to clear.
 */
interface BusRun {
  link: HardwarePartLink
  /** True when the run feeds the board, false when the board drives it. */
  inbound: boolean
  /** Which edge of the board the run plugs into. */
  side: 'left' | 'right'
  /** Lane index outward from the board's flank, within this side. */
  flank: number
  /** Lane index outward from the board in the channel, within this side. */
  lane: number
  /** Slot down that edge the run plugs into, counted from the board's top. */
  port: number
  /** Slots on that edge, so a port can be spread along it. */
  ports: number
}

/**
 * Decide which edge each run leaves by, and in what order.
 *
 * A run takes the side of the board its part is already on, so nothing crosses
 * the board to reach a header on the far side of it. Within a side, runs are
 * ordered by how far away their part is, and that one ordering settles all
 * three of a run's lanes — but not all in the same direction, which is the
 * whole difficulty:
 *
 * - **Flank, nearest innermost.** The stretch beside the board nests, so an
 *   outer run's reach into the edge passes beyond the end of every lane inside
 *   it rather than through them.
 * - **Port, nearest closest to its own row.** Forced by the flank order: a run
 *   coming down an outer flank has to plug in past the ports of everything
 *   inside it, or its last stretch crosses their lanes.
 * - **Channel lane, nearest *outermost*.** The opposite order, and this is the
 *   one that is easy to get wrong. A far run's lane has to cross the bench over
 *   the top of every nearer part, so it must travel in the lane closest to the
 *   board — above where the nearer runs have already turned down into their
 *   parts. Give the nearest run the innermost lane instead and every longer run
 *   crosses it.
 *
 * Feeds and driven parts index independently: they use opposite halves of the
 * edge and opposite channels, so they never share a stretch to collide in.
 *
 * Takes horizontal extents only, so it can be answered before the board's
 * caption is placed and again while the runs are being drawn.
 */
function planBus(
  links: HardwarePartLink[],
  boxes: Map<string, { x: number; width: number }>,
  anchorId: string,
): BusRun[] {
  const anchor = boxes.get(anchorId)
  if (!anchor) return []
  const anchorCentre = anchor.x + anchor.width / 2
  const otherEnd = (link: HardwarePartLink) =>
    link.source === anchorId ? link.target : link.source
  const centreOf = (id: string) => {
    const box = boxes.get(id)!
    return box.x + box.width / 2
  }
  // Only runs with one end on the board: the bench draws the board's wiring,
  // and a run between two other parts has no lane to travel in.
  const live = links.filter((link) =>
    boxes.has(link.source) && boxes.has(link.target)
    && (link.source === anchorId) !== (link.target === anchorId))

  const reach = (link: HardwarePartLink) => Math.abs(centreOf(otherEnd(link)) - anchorCentre)
  const nearestFirst = (group: HardwarePartLink[]) =>
    [...group].sort((a, b) => reach(a) - reach(b))

  const runs: BusRun[] = []
  for (const side of ['left', 'right'] as const) {
    const here = live.filter((link) =>
      (centreOf(otherEnd(link)) <= anchorCentre ? 'left' : 'right') === side)
    const inbound = nearestFirst(here.filter((link) => link.target === anchorId))
    const outbound = nearestFirst(here.filter((link) => link.source === anchorId))
    const ports = inbound.length + outbound.length
    // Feeds take the upper half of the edge and everything driven takes the
    // lower half, so a run never has to pass the ports of the other direction
    // to reach its own.
    inbound.forEach((link, index) => {
      runs.push({
        link,
        inbound: true,
        side,
        flank: index,
        lane: inbound.length - 1 - index,
        port: index,
        ports,
      })
    })
    outbound.forEach((link, index) => {
      runs.push({
        link,
        inbound: false,
        side,
        flank: index,
        lane: outbound.length - 1 - index,
        port: inbound.length + (outbound.length - 1 - index),
        ports,
      })
    })
  }
  return runs
}

/** Outward reach of one side's lane bundle, or zero where that side is bare. */
function busBundleWidth(
  runs: BusRun[],
  side: 'left' | 'right',
  geometry: { laneMargin: number; laneStep: number },
): number {
  const lanes = runs
    .filter((run) => run.side === side)
    .reduce((most, run) => Math.max(most, run.flank + 1), 0)
  return lanes > 0 ? geometry.laneMargin + (lanes - 1) * geometry.laneStep : 0
}

/**
 * Route every run as a bus: out of one part, along a horizontal lane of its
 * own, down the side of the board and into its edge, turning square corners.
 *
 * This is the shape a wiring or network diagram uses, and it is what lets the
 * bench spread sideways — parts sit in rows and the runs travel in the channel
 * between them, so adding a part widens the bench rather than lengthening a
 * diagonal across it.
 *
 * The board is wired on its sides rather than its ends, because that is where a
 * dev board's headers are: a run drops out of its part, crosses the channel,
 * comes down the flank of the board and plugs into the header it lands on. The
 * ends of the board stay clear, which is also what the on-board detail — the
 * USB connector, the antenna — needs to stay readable.
 *
 * Each run gets a lane to itself rather than sharing a trunk. A network bus can
 * draw one line for many devices because it really is one wire; these are not.
 * Every run here is a different pin, and stacking them on one line would say
 * they were joined.
 *
 * Crossings still occur in the channel where a wide row fans into a narrow
 * board — they are right-angled and legible, and cannot be removed entirely
 * when every run leaves from the same part.
 */
function routeBus(
  runs: BusRun[],
  parts: PlacedPart[],
  anchorId: string,
  geometry: { laneMargin: number; laneStep: number; corner: number },
): PlacedLink[] {
  const byId = new Map(parts.map((part) => [part.id, part]))
  const anchor = byId.get(anchorId)
  if (!anchor) return []

  const routed: PlacedLink[] = []
  for (const run of runs) {
    const part = byId.get(run.inbound ? run.link.source : run.link.target)
    if (!part) continue
    const partX = part.x + part.width / 2
    // Where the run plugs into the board, and the lane it comes down to reach
    // that point — clear of the board's own outline either way.
    const edgeX = run.side === 'left' ? anchor.x : anchor.x + anchor.width
    const flank = geometry.laneMargin + run.flank * geometry.laneStep
    const sideX = run.side === 'left' ? anchor.x - flank : edgeX + flank
    const portY = anchor.y + anchor.height * ((run.port + 1) / (run.ports + 1))
    const channel = geometry.laneMargin + run.lane * geometry.laneStep

    if (run.inbound) {
      const startY = part.y + part.height
      const laneY = anchor.y - channel
      routed.push({
        source: run.link.source,
        target: run.link.target,
        x1: partX,
        y1: startY,
        x2: edgeX,
        y2: portY,
        corner: geometry.corner,
        points: [
          { x: partX, y: startY },
          { x: partX, y: laneY },
          { x: sideX, y: laneY },
          { x: sideX, y: portY },
          { x: edgeX, y: portY },
        ],
      })
      continue
    }

    const laneY = anchor.y + anchor.height + channel
    routed.push({
      source: run.link.source,
      target: run.link.target,
      x1: edgeX,
      y1: portY,
      x2: partX,
      y2: part.y,
      corner: geometry.corner,
      points: [
        { x: edgeX, y: portY },
        { x: sideX, y: portY },
        { x: sideX, y: laneY },
        { x: partX, y: laneY },
        { x: partX, y: part.y },
      ],
    })
  }

  return routed
}

/**
 * An orthogonal run as an SVG path, each corner rounded just enough to read as
 * a bend rather than a mitre.
 *
 * The radius is clamped to half the shorter of the two segments meeting at a
 * corner, so a lane only a few pixels from the part it leaves still draws a
 * corner rather than an overshoot that doubles back on itself.
 */
export function orthogonalLinkPath(
  points: Array<{ x: number; y: number }>,
  radius: number,
): string {
  if (points.length < 2) return ''
  const towards = (
    from: { x: number; y: number },
    to: { x: number; y: number },
    distance: number,
  ) => {
    const length = Math.max(1e-6, Math.hypot(to.x - from.x, to.y - from.y))
    return {
      x: from.x + ((to.x - from.x) / length) * distance,
      y: from.y + ((to.y - from.y) / length) * distance,
    }
  }
  const drawn = [`M ${points[0].x} ${points[0].y}`]
  for (let index = 1; index < points.length - 1; index++) {
    const previous = points[index - 1]
    const corner = points[index]
    const next = points[index + 1]
    const inLength = Math.hypot(corner.x - previous.x, corner.y - previous.y)
    const outLength = Math.hypot(next.x - corner.x, next.y - corner.y)
    const r = Math.max(0, Math.min(radius, inLength / 2, outLength / 2))
    if (r === 0) {
      drawn.push(`L ${corner.x} ${corner.y}`)
      continue
    }
    const enter = towards(corner, previous, r)
    const leave = towards(corner, next, r)
    drawn.push(`L ${enter.x} ${enter.y}`)
    drawn.push(`Q ${corner.x} ${corner.y} ${leave.x} ${leave.y}`)
  }
  const last = points[points.length - 1]
  drawn.push(`L ${last.x} ${last.y}`)
  return drawn.join(' ')
}
