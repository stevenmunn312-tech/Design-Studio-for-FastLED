/**
 * Wire jumps: where one drawn wire crosses another it does not join, the
 * jumping wire hops over it in a small half circle, the usual wiring-diagram
 * sign that the two pass without connecting.
 *
 * Paths here are the diagram's orthogonal runs, written only with M, H and V.
 * Anything else is returned unchanged rather than guessed at.
 */

/** Hop radius. A hop shrinks to fit when a crossing sits close to a corner. */
export const WIRE_JUMP_RADIUS = 7
const MIN_JUMP_RADIUS = 2

interface Segment {
  x1: number
  y1: number
  x2: number
  y2: number
}

/** Parse an M/H/V path into its runs, or `undefined` for any other command. */
function segmentsOf(path: string): Segment[][] | undefined {
  const tokens = path.match(/[MHV]|-?\d*\.?\d+(?:e-?\d+)?/gi)
  if (!tokens || tokens.join('').length === 0) return undefined
  if (/[^MHV\d\s.,eE-]/.test(path)) return undefined
  const subpaths: Segment[][] = []
  let x = 0
  let y = 0
  let index = 0
  while (index < tokens.length) {
    const command = tokens[index++]
    if (command === 'M') {
      x = Number(tokens[index++])
      y = Number(tokens[index++])
      subpaths.push([])
    } else if (command === 'H' || command === 'V') {
      const value = Number(tokens[index++])
      const current = subpaths[subpaths.length - 1]
      if (!current) return undefined
      const next = command === 'H' ? { x: value, y } : { x, y: value }
      current.push({ x1: x, y1: y, x2: next.x, y2: next.y })
      x = next.x
      y = next.y
    } else {
      return undefined
    }
    if (Number.isNaN(x) || Number.isNaN(y)) return undefined
  }
  return subpaths
}

const between = (value: number, a: number, b: number) => value > Math.min(a, b) + 0.5 && value < Math.max(a, b) - 0.5

/**
 * Redraw `path` with a hop wherever one of its runs crosses a perpendicular
 * run of `others`. Touching at an end or running alongside is not a crossing.
 */
export function withWireJumps(path: string, others: readonly string[]): string {
  const own = segmentsOf(path)
  if (!own) return path
  const obstacles = others.flatMap((other) => segmentsOf(other)?.flat() ?? [])
  let jumped = false
  const format = (value: number) => String(value)
  const redrawn = own.map((segments) => {
    if (segments.length === 0) return ''
    let d = `M${format(segments[0].x1)} ${format(segments[0].y1)}`
    for (const segment of segments) {
      const horizontal = segment.y1 === segment.y2
      const start = horizontal ? segment.x1 : segment.y1
      const end = horizontal ? segment.x2 : segment.y2
      const direction = Math.sign(end - start)
      const crossings = obstacles
        .filter((other) => horizontal
          ? other.x1 === other.x2 && between(other.x1, segment.x1, segment.x2) && between(segment.y1, other.y1, other.y2)
          : other.y1 === other.y2 && between(other.y1, segment.y1, segment.y2) && between(segment.x1, other.x1, other.x2))
        .map((other) => (horizontal ? other.x1 : other.y1))
        .sort((a, b) => (a - b) * direction)
      // Crossings closer than a hop's width share one longer hop, so a run
      // past a bundle of parallel wires clears all of them.
      const groups: number[][] = []
      for (const at of crossings) {
        const last = groups[groups.length - 1]
        if (last && Math.abs(at - last[last.length - 1]) < (WIRE_JUMP_RADIUS * 2) + 2) last.push(at)
        else groups.push([at])
      }
      let cursor = start
      for (const group of groups) {
        const first = group[0]
        const last = group[group.length - 1]
        const room = Math.min(Math.abs(first - cursor), Math.abs(end - last)) - 0.5
        const radius = Math.min(WIRE_JUMP_RADIUS, room)
        if (radius < MIN_JUMP_RADIUS) continue
        const before = first - (direction * radius)
        const after = last + (direction * radius)
        const halfSpan = Math.abs(after - before) / 2
        // Clockwise when running right or down, so every hop bulges up or right.
        const arc = `A${format(halfSpan)} ${radius} 0 0 ${direction > 0 ? 1 : 0}`
        if (horizontal) {
          d += `H${format(before)}${arc} ${format(after)} ${format(segment.y1)}`
        } else {
          // An ellipse's x radius runs across the screen, so a vertical hop
          // swaps the two radii.
          d += `V${format(before)}A${radius} ${format(halfSpan)} 0 0 ${direction > 0 ? 1 : 0} ${format(segment.x1)} ${format(after)}`
        }
        cursor = after
        jumped = true
      }
      d += horizontal ? `H${format(end)}` : `V${format(end)}`
    }
    return d
  }).join('')
  // A path with nothing to hop keeps its exact original text.
  return jumped ? redrawn : path
}
