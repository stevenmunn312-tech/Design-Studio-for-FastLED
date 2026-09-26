// Where each part sits on the Hardware bench, as CSS: its box, the LED
// lens and spill over an output, a broken run's cut, and its caption.
import type { CSSProperties } from 'react'
import { ledPitchMm } from '../../state/hardware'
import type { LedOutputForm } from '../../state/ledOutputForm'
import { hardwareCaptionWorldScale } from './hardwareLayout'
import type { HardwareArrangement, PlacedPart } from './hardwareLayout'
import type { useHardwareView } from './useHardwareView'

export interface BenchPartStyleInputs {
  view: ReturnType<typeof useHardwareView>
  arrangement: HardwareArrangement | null
  placed: Map<string, PlacedPart>
  brokenRuns: Map<string, { cells: { index: number; slot: number }[]; span: number }>
}

/** Style helpers bound to one arrangement of the bench and its current view. */
export function benchPartStyles({ view, arrangement, placed, brokenRuns }: BenchPartStyleInputs) {
  const partStyle = (id: string): CSSProperties | undefined => {
    const part = placed.get(id)
    if (!part) return undefined
    return { left: part.x, top: part.y, width: part.width, height: part.height }
  }

  /*
   * The box the layout gave a part, at true scale: exactly one square cell per
   * LED, so a string is one row of them and a panel is a grid of them.
   */
  const outputStyle = (partId: string): CSSProperties | undefined => {
    const part = placed.get(partId)
    if (!part) return undefined
    return { left: part.x, top: part.y, width: part.width, height: part.height }
  }

  /*
   * The diffuser over a part: one dome per LED, registered to the same tile as
   * the render beneath so the lens sits on the LED rather than between two.
   *
   * Static by design. It never changes as frames arrive, so it costs nothing
   * per frame and — unlike a filter over live content — cannot trip the
   * renderer-memory leak that `src/dev/animationFilterGuard.ts` guards against.
   * The colour comes from the lit cells underneath and reads through the
   * transparent centre.
   */
  const lensStyle = (partId: string, form: LedOutputForm): CSSProperties | undefined => {
    const part = placed.get(partId)
    if (!part) return undefined
    // The same pitch the part was sized at, so the tile divides its box exactly
    // and one dome lands on one emitter. `.lens` tiles from the box origin for
    // the same reason — centred tiling puts the domes half a pitch out on any
    // even-sided panel, which is every panel anyone buys.
    const tile = ledPitchMm(form) * part.mmScale
    return { backgroundSize: `${tile}px ${tile}px` }
  }

  /*
   * The pool layer sits behind a part and reaches past its edges, because the
   * whole point of spill is the light that lands off the object. The margin
   * scales with the part's short side so a thin run glows proportionally rather
   * than being swamped.
   */
  const spillGeometry = (partId: string, sampleCols: number, sampleRows: number) => {
    const part = placed.get(partId)
    if (!part) return undefined
    // Enough to read as light on the bench without hazing the whole pane.
    const margin = Math.max(20, Math.min(part.width, part.height) * 0.9)
    return {
      style: {
        left: part.x - margin,
        top: part.y - margin,
        width: part.width + (margin * 2),
        height: part.height + (margin * 2),
      } as CSSProperties,
      insetX: (margin * sampleCols) / Math.max(1, part.width),
      insetY: (margin * sampleRows) / Math.max(1, part.height),
    }
  }

  /*
   * The gradient that takes a broken run's middle out of a layer drawn across
   * its whole box — the bare board, and the diffuser over it. The emitters need
   * none: they are drawn per slot and simply leave the gap empty.
   *
   * On those layers rather than on the part itself, because a mask clips its
   * whole subtree and isolates it from the backdrop. Over the live cells that
   * would take the LEDs' bloom with it, and a run that cannot throw light onto
   * the bench reads as printed rather than as lit.
   */
  const runCutMask = (partId: string): string | undefined => {
    const part = placed.get(partId)
    const run = brokenRuns.get(partId)
    if (!part?.broken || !run) return undefined
    const from = (part.broken.head / run.span) * 100
    const to = ((part.broken.head + part.broken.gap) / run.span) * 100
    // A string runs across its box and a VU rail runs down one.
    const angle = part.broken.axis === 'x' ? '90deg' : '180deg'
    return `linear-gradient(${angle}, #000 0 ${from}%, transparent ${from}% ${to}%, #000 ${to}% 100%)`
  }

  /*
   * Where the two strokes that mark a break are drawn, in world coordinates.
   *
   * A sibling of the part rather than a child of it: the layers that make the
   * gap are masked, and a mask takes the element's children with it. Without
   * the strokes a gap reads as two separate strings rather than one string
   * drawn short, which is the entire job of the convention.
   */
  const runBreakStyle = (partId: string): CSSProperties | null => {
    const part = placed.get(partId)
    const run = brokenRuns.get(partId)
    if (!part?.broken || !run) return null
    const acrossX = part.broken.axis === 'x'
    const unit = (acrossX ? part.width : part.height) / run.span
    const start = part.broken.head * unit
    const size = part.broken.gap * unit
    // Overhanging the run is part of the convention — a break mark crosses the
    // object and continues past both of its edges.
    const box = acrossX
      ? {
        left: part.x + start,
        top: part.y - (part.height * 0.4),
        width: size,
        height: part.height * 1.8,
      }
      : {
        left: part.x - (part.width * 0.08),
        top: part.y + start,
        width: part.width * 1.16,
        height: size,
      }
    // Space the strokes by the dimension they run along, not by the width of
    // the gap: pitched off a narrow gap they close into a solid hatch that
    // reads as damage rather than as a cut.
    const across = acrossX ? box.height : box.width
    return {
      ...box,
      // CSS gradient angles are measured on screen, not in the element's own
      // squashed coordinates, so a stroke stays a diagonal however thin the gap
      // is — which is why this is not an SVG with a stretched viewBox.
      '--break-angle': acrossX ? '74deg' : '16deg',
      '--break-pitch': `${Math.max(2, across * 0.3)}px`,
      '--break-stroke': `${Math.max(0.75, across * 0.035)}px`,
    } as CSSProperties
  }

  /* Captions hang under the band on the layout's own anchor, so a long run
     keeps its label near its start rather than off screen at its midpoint. */
  const captionStyle = (id: string): CSSProperties | undefined => {
    const part = placed.get(id)
    if (!part) return undefined
    return {
      left: part.captionX,
      top: part.captionY,
      '--hardware-caption-scale': hardwareCaptionWorldScale(
        arrangement?.uiScale ?? 0,
        view.transform.k,
      ),
    } as CSSProperties
  }

  return { partStyle, outputStyle, lensStyle, spillGeometry, runCutMask, runBreakStyle, captionStyle }
}
