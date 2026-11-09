import type { CSSProperties } from 'react'

/**
 * The socket vocabulary: one shape per port data type, drawn the same way
 * wherever a port appears. The handle on a node is a CSS box, the sidebar
 * glyph, help reference and wire terminal are SVG, so each symbol carries
 * both an SVG path in a 20-unit box and the CSS that cuts a 12 px handle to
 * the same outline.
 */
export type PortSymbol = 'square' | 'diamond' | 'circle' | 'smallSquare' | 'hexagon' | 'pill' | 'dot'

export const PORT_SYMBOL_FOR_TYPE: Record<string, PortSymbol> = {
  frame: 'square', image: 'square', display: 'square', storage: 'square', patternset: 'square',
  field: 'diamond', transitionset: 'diamond', playerparticles: 'diamond',
  float: 'circle', datetime: 'circle', string: 'circle', playercontrols: 'circle',
  bool: 'smallSquare', newcontrol: 'smallSquare',
  audio: 'hexagon', dmx: 'hexagon',
  palette: 'pill',
  color: 'dot',
}

export function portSymbol(dataType: string | undefined): PortSymbol {
  return (dataType ? PORT_SYMBOL_FOR_TYPE[dataType] : undefined) ?? 'circle'
}

/** Outline paths in a 20 × 20 box, centred on (10, 10). */
export const PORT_SYMBOL_PATH: Record<PortSymbol, string> = {
  square: 'M3 3h14v14H3Z',
  diamond: 'M10 2l8 8-8 8-8-8Z',
  circle: 'M10 4a6 6 0 1 1 0 12a6 6 0 1 1 0-12Z',
  smallSquare: 'M6 6h8v8H6Z',
  hexagon: 'M6 3h8l4 7-4 7H6l-4-7Z',
  pill: 'M6 6h8a4 4 0 0 1 0 8H6a4 4 0 0 1 0-8Z',
  dot: 'M10 6a4 4 0 1 1 0 8a4 4 0 0 1 0-8Z',
}

/** Symbols drawn filled rather than stroked. */
export const PORT_SYMBOL_FILLED: ReadonlySet<PortSymbol> = new Set<PortSymbol>(['dot'])

/** Detail drawn over the outline (the pill's stripes). */
export const PORT_SYMBOL_DETAIL: Partial<Record<PortSymbol, string>> = {
  pill: 'M9 6v8M13 6v8',
}

const PILL_STRIPES = 'repeating-linear-gradient(90deg, transparent 0 3px, rgba(0, 0, 0, 0.38) 3px 5px)'

/** The CSS that cuts a handle box to the symbol's outline. */
export const PORT_SYMBOL_HANDLE: Record<PortSymbol, CSSProperties> = {
  square: { borderRadius: 2 },
  diamond: { borderRadius: 0, clipPath: 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)' },
  circle: { borderRadius: '50%' },
  smallSquare: { width: 10, height: 10, borderRadius: 1 },
  hexagon: { borderRadius: 0, clipPath: 'polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)' },
  pill: { width: 16, height: 10, borderRadius: 5, backgroundImage: PILL_STRIPES },
  dot: { width: 9, height: 9, borderRadius: '50%' },
}
