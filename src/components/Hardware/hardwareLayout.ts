import { tidyLayout, type TidyEdge, type TidyItem } from '../../utils/tidyLayout'

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
 *   everything sideways. A long LED run simply continues off screen — its
 *   length is a fact about the strip, and panning is how you follow it.
 * - **Runs attach at stepped points down a part's edge**, like the port rows on
 *   a node, so several parts on one side stay legible and every run is a curve
 *   rather than a flat line.
 *
 * Pure, so it is testable without mounting the pane.
 */

/** A part as the layout sees it: a physical footprint in millimetres. */
export interface HardwarePartBox {
  id: string
  widthMm: number
  heightMm: number
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
  /** Where this part's caption is centred, and the top of the caption block. */
  captionX: number
  captionY: number
}

export interface PlacedLink {
  source: string
  target: string
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface HardwareArrangement {
  parts: PlacedPart[]
  links: PlacedLink[]
  /** Millimetres-to-pixels, shared by every part so they stay in proportion. */
  mmScale: number
  /** Height of the slot each part's render is centred in. */
  band: number
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
/** Maximum rendered caption width; kept in sync with HardwarePane.module.css. */
const CAPTION_MAX_WIDTH = 220
/** Slots are at least this wide, so captions clear their neighbours. */
const SLOT_MIN_WIDTH = 150
/** A run longer than this has its caption held near its start, not its middle. */
const CAPTION_ANCHOR_MAX = 320
const GRID = 20

/** First attachment point, as a fraction down a part's own height. */
const ATTACH_TOP = 0.24
/** Step to the next one, matching the port rows stacked down a node's edge. */
const ATTACH_STEP = 0.2

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
    const used = arrangedHeight(arrangement, band)
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
  const left = Math.min(...arrangement.parts.map((part) =>
    Math.min(part.x, part.captionX - CAPTION_MAX_WIDTH / 2)))
  const right = Math.max(...arrangement.parts.map((part) =>
    Math.max(part.x + part.width, part.captionX + CAPTION_MAX_WIDTH / 2)))
  const top = Math.min(...arrangement.parts.map((part) => part.y))
  const bottom = Math.max(...arrangement.parts.map((part) =>
    Math.max(part.y + part.height, part.captionY + CAPTION_BLOCK)))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/** Full height of what was laid out, caption block included. */
function arrangedHeight(arrangement: HardwareArrangement, band: number): number {
  if (!arrangement.parts.length) return 0
  const top = Math.min(...arrangement.parts.map((part) => part.captionY - band))
  const bottom = Math.max(...arrangement.parts.map((part) => part.captionY + CAPTION_BLOCK))
  return bottom - top
}

function arrangeAtBand(
  parts: HardwarePartBox[],
  links: HardwarePartLink[],
  stage: StageBox,
  anchorId: string,
  band: number,
): HardwareArrangement {
  const tallestMm = Math.max(1, ...parts.map((part) => part.heightMm))
  const mmScale = band / tallestMm

  const drawn = new Map(parts.map((part) => [part.id, {
    width: part.widthMm * mmScale,
    height: part.heightMm * mmScale,
  }]))

  // Slots are as wide as the part or its caption, whichever is wider, so the
  // layout spaces columns to fit the labels rather than just the renders.
  const boxHeight = band + CAPTION_BLOCK
  const items: TidyItem[] = parts.map((part) => ({
    id: part.id,
    x: 0,
    y: 0,
    width: Math.max(drawn.get(part.id)!.width, SLOT_MIN_WIDTH),
    height: boxHeight,
  }))
  const edges: TidyEdge[] = links.map(({ source, target }) => ({ source, target }))

  // Runs need room to read as wiring; scale the column gap with the pane.
  const gapX = Math.max(28, Math.min(120, stage.width * 0.08))
  const placed = tidyLayout(items, edges, { gapX, gapY: 28, grid: GRID })

  // A single part has no edges, so nothing is connected and tidy returns
  // nothing to move — it belongs at the origin the centring below works from.
  const slots = new Map(items.map((item) => {
    const at = placed.get(item.id)
    return [item.id, { x: at?.x ?? 0, y: at?.y ?? 0, width: item.width }]
  }))

  // Anchor on the controller, not on the bounding box: every part is centred
  // in its slot, so the anchor's slot centre is the anchor's own centre.
  const anchor = slots.get(anchorId) ?? slots.values().next().value
  const shiftX = stage.offsetX + stage.width / 2 - (anchor ? anchor.x + anchor.width / 2 : 0)
  // Centre the band, not the box: the caption block below it must not push the
  // controller off the middle of the view.
  const shiftY = stage.height / 2 - (anchor ? anchor.y + band / 2 : 0)

  const placedParts: PlacedPart[] = items.map((item) => {
    const slot = slots.get(item.id)!
    const size = drawn.get(item.id)!
    const slotX = slot.x + shiftX
    const slotY = slot.y + shiftY
    return {
      id: item.id,
      // Centred in its slot, both ways: a short part sitting at the top of its
      // band is what made the runs appear to miss the parts they join.
      x: slotX + (slot.width - size.width) / 2,
      y: slotY + (band - size.height) / 2,
      width: size.width,
      height: size.height,
      captionX: slotX + Math.min(slot.width, CAPTION_ANCHOR_MAX) / 2,
      // Follow the rendered object's actual lower edge. Anchoring every label
      // to the bottom of the shared band left a large void under short boards
      // and modules; the tallest object still keeps the same eight-pixel gap.
      captionY: slotY + (band - size.height) / 2 + size.height + 8,
    }
  })

  return {
    parts: placedParts,
    links: routeLinks(links, placedParts),
    mmScale,
    band,
  }
}

/**
 * Attach each run at its own point down the facing edge of both parts, stepping
 * down like the port rows on a node. A part with one connection gets a single
 * point near its top — the height a noodle leaves a node at — and the offset
 * between the two ends is what gives every run its bend.
 */
function routeLinks(links: HardwarePartLink[], parts: PlacedPart[]): PlacedLink[] {
  const byId = new Map(parts.map((part) => [part.id, part]))
  const live = links.filter((link) => byId.has(link.source) && byId.has(link.target))

  // Per part and side, the runs that leave or arrive there, ordered by the
  // height of whatever they join, so runs on one side do not cross each other.
  const rank = new Map<string, number>()
  for (const part of parts) {
    for (const side of ['out', 'in'] as const) {
      const onSide = live.filter((link) => (side === 'out' ? link.source : link.target) === part.id)
      onSide
        .map((link) => ({
          link,
          other: byId.get(side === 'out' ? link.target : link.source)!,
        }))
        .sort((a, b) => a.other.y - b.other.y)
        .forEach(({ link }, index) => rank.set(`${side}:${link.source}->${link.target}`, index))
    }
  }

  const attachY = (part: PlacedPart, index: number) =>
    part.y + part.height * Math.min(ATTACH_TOP + index * ATTACH_STEP, 0.85)

  return live.map((link) => {
    const from = byId.get(link.source)!
    const to = byId.get(link.target)!
    const forward = from.x <= to.x
    return {
      source: link.source,
      target: link.target,
      x1: forward ? from.x + from.width : from.x,
      y1: attachY(from, rank.get(`out:${link.source}->${link.target}`) ?? 0),
      x2: forward ? to.x : to.x + to.width,
      y2: attachY(to, rank.get(`in:${link.source}->${link.target}`) ?? 0),
    }
  })
}
