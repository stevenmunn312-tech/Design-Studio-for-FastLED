import type { OutputRoute } from '../../state/output/outputRouting'
import { corkscrewAngleAt, type CorkscrewDirection, type RingDirection } from '../../state/output/ledOutputForm'

/**
 * Fraction of its cell one LED emitter covers.
 *
 * A 5050 package on a 10 mm pitch covers about half its cell, and that gap is
 * what makes a panel read as discrete LEDs rather than a screen. Shared so the
 * LED output node, the hardware bay and a source node's frame thumbnail all
 * draw the same emitter. Every part draws its own emitters now — a string and a
 * VU rail are a one-row and a one-column panel — so there is one answer rather
 * than one per kind of board.
 */
export const LED_CELL_FILL = 0.5

/*
 * The most cells a source node's frame thumbnail draws.
 *
 * A frame node previews on the same emitter grid the LED output uses, so the
 * chain reads left to right as one picture of one thing. Every ordinary panel
 * (16x16, 32x8, 32x32) is under this cap and therefore drawn cell for cell;
 * only a large panel is sampled down, and it still reads as the same LED look
 * rather than switching renderers halfway along the graph.
 */
export const THUMB_MAX_CELLS = 1024

/** The emitter grid a thumbnail draws for a frame of `w` x `h`, capped without
 *  changing its shape. */
export function thumbGrid(w: number, h: number): { cols: number; rows: number } {
  const cols = Math.max(1, Math.round(w))
  const rows = Math.max(1, Math.round(h))
  if (cols * rows <= THUMB_MAX_CELLS) return { cols, rows }
  const scale = Math.sqrt(THUMB_MAX_CELLS / (cols * rows))
  return { cols: Math.max(1, Math.round(cols * scale)), rows: Math.max(1, Math.round(rows * scale)) }
}

/**
 * The light coming off a lit LED, as layers stacked around the package.
 *
 * A real WS2812B blows its own package out to white and throws its colour into
 * a bloom about a pitch wide, spilling well past the edges of the board. These
 * layers stand in for that falloff. A blur is the obvious way to draw it and is
 * exactly what must not be used: this content changes every frame, and a filter
 * over content that changes every frame leaks renderer memory in Chromium —
 * the same rule the rest of the preview code follows.
 *
 * `along` and `across` are multiples of the emitter's own size on each of its
 * axes, and `opacity` is how much of the LED's colour that layer carries.
 */
export interface EmitterGlowLayer {
  along: number
  across: number
  opacity: number
}

/**
 * One soft layer, for every part.
 *
 * Emitters sit on a grid where the next LED is a pitch away, so a bloom much
 * wider than the package simply washes the board out, and the diffuser above it
 * already supplies the dome. A second, wider stack existed for the strip while
 * it was drawn over a photograph of tape and its light had to land on that
 * photograph; nothing is drawn over a picture any more.
 */
export const EMITTER_GLOW: readonly EmitterGlowLayer[] = [
  { along: 1.8, across: 1.44, opacity: 0.34 },
]

/** Half the width of one LED on a ring, in bounding-box fractions — a 5050
 *  package against the ~76 mm circle a 24-LED ring describes. */
export const RING_LED_RADIUS = 0.035
export const CORKSCREW_LED_RADIUS_X = 0.028
export const CORKSCREW_LED_RADIUS_Y = 0.016

export interface RingGeometry {
  ledCount: number
  startAngle: number
  direction: RingDirection
}

export interface CorkscrewGeometry {
  ledCount: number
  turns: number
  startAngle: number
  direction: CorkscrewDirection
}

export interface PositionsGeometry {
  canvasW: number
  canvasH: number
  points: ReadonlyArray<readonly [number, number]>
}

/**
 * A ring's LEDs on a unit-square box, in wire order. Angles match
 * `ringSampleMap` exactly — 0 degrees at 12 o'clock, clockwise positive — so
 * the LED lit here is the LED the frame was sampled for. `radius` is the
 * circle's radius in box fractions.
 */
export function ringUnitPoints(ring: RingGeometry, radius: number): Array<{ cx: number; cy: number }> {
  const sign = ring.direction === 'ccw' ? -1 : 1
  const start = ring.startAngle * Math.PI / 180
  return Array.from({ length: Math.max(1, ring.ledCount) }, (_, index) => {
    const theta = start + (sign * index * 2 * Math.PI / Math.max(1, ring.ledCount))
    return { cx: 0.5 + (radius * Math.sin(theta)), cy: 0.5 - (radius * Math.cos(theta)) }
  })
}

export interface CorkscrewUnitPoint {
  index: number
  cx: number
  cy: number
  /** cos of the LED's angle: 1 at the front of the winding, -1 at the back. */
  depth: number
  opacity: number
  scale: number
}

/**
 * Front-on projection of the same corkscrew angles used by the authoring
 * sample map, on a unit-square box. Depth makes the back half quieter and
 * smaller; the wire-order index stays with each point so live colour painting
 * is unchanged whatever order the points are drawn in.
 */
export function corkscrewUnitPoints(corkscrew: CorkscrewGeometry): CorkscrewUnitPoint[] {
  const count = Math.max(1, corkscrew.ledCount)
  return Array.from({ length: count }, (_, index) => {
    const theta = corkscrewAngleAt(index, count, corkscrew.turns, corkscrew.startAngle, corkscrew.direction)
    // Same progress the firmware sample map uses (`corkscrewSampleMap`): a
    // single LED sits at the top, not mid-height.
    const progress = count <= 1 ? 0 : index / (count - 1)
    const depth = Math.cos(theta)
    return {
      index,
      cx: 0.5 + (0.42 * Math.sin(theta)),
      cy: 0.04 + (0.92 * progress),
      depth,
      opacity: 0.42 + (0.58 * ((depth + 1) / 2)),
      scale: 0.72 + (0.28 * ((depth + 1) / 2)),
    }
  })
}

/** One LED of a shaped output on the main preview canvas, in LED-pitch cells. */
export interface ShapeEmitter {
  x: number
  y: number
  /** Emitter size relative to a grid LED: the back of a corkscrew is smaller. */
  scale: number
  opacity: number
}

/**
 * Where a shape-mapped chain's LEDs sit, in cells of one LED pitch, so the
 * main LED Output pane can size and draw it the way it draws a matrix: a cell
 * is a cell, and the per-LED pixel budget is the same.
 */
export interface ShapeLayout {
  kind: 'ring' | 'corkscrew' | 'positions'
  /** The box the emitters sit in, in cells. */
  width: number
  height: number
  /** In wire order: emitter i shows LED i of the routed one-row frame. */
  emitters: ShapeEmitter[]
  /** Draw the wire joining the LEDs in order behind them. */
  wire: boolean
}

/**
 * The layout the main pane draws for a route, or null when the route is a grid
 * or a straight chain and the row-major canvas is already its true shape.
 *
 * A ring of N LEDs at one pitch has a circumference of N cells, so its box is
 * N / pi cells across plus one cell of emitter; a corkscrew's box follows its
 * diameter and height in millimetres; a positioned string's canvas units are
 * already one LED pitch. The angles are the ones `ringSampleMap` and
 * `corkscrewSampleMap` use, so the LED drawn here is the LED the frame was
 * sampled for.
 */
export function shapeLayoutFor(route: OutputRoute): ShapeLayout | null {
  if (route.ring) {
    const count = Math.max(1, route.ring.ledCount)
    const size = Math.max(3, count / Math.PI + 1)
    const radius = (size - 1) / 2
    return {
      kind: 'ring',
      width: size,
      height: size,
      emitters: ringUnitPoints(route.ring, radius / size).map((point) => ({
        x: point.cx * size, y: point.cy * size, scale: 1, opacity: 1,
      })),
      wire: false,
    }
  }
  if (route.corkscrew) {
    const count = Math.max(1, route.corkscrew.ledCount)
    const turns = Math.max(0.25, route.corkscrew.turns)
    const width = Math.max(3, count / (turns * Math.PI) + 1)
    const ratio = route.corkscrew.heightMm > 0 && route.corkscrew.diameterMm > 0
      ? route.corkscrew.heightMm / route.corkscrew.diameterMm
      : 2
    const height = Math.max(3, width * Math.max(0.5, Math.min(6, ratio)))
    return {
      kind: 'corkscrew',
      width,
      height,
      emitters: corkscrewUnitPoints(route.corkscrew).map((point) => ({
        x: point.cx * width, y: point.cy * height, scale: point.scale, opacity: point.opacity,
      })),
      wire: true,
    }
  }
  if (route.positions) {
    return {
      kind: 'positions',
      width: Math.max(1, route.positions.canvasW),
      height: Math.max(1, route.positions.canvasH),
      emitters: route.positions.points.map(([x, y]) => ({ x, y, scale: 1, opacity: 1 })),
      wire: true,
    }
  }
  return null
}
