/**
 * Mirror's radial fold, which was the Kaleidoscope node, keeps its pixel
 * kernel in shared/integerPatterns.ts (`kaleidoSource`); its wedge and turn
 * are set up once a frame by the helpers below, on both sides.
 *
 * Mirror's diagonal fold, shared by the preview and the sketch. The fold is
 * across the line from the top-left corner to the bottom-right one, in
 * normalised coordinates, so a wide panel mirrors across its own diagonal:
 * clamping `min(x, y)` to the matrix had smeared every column past the
 * height into strips. On a square matrix it is exactly (min, max) of x and
 * y. Integer maths both sides; a/b rounds as floor((2a + b) / 2b).
 */

/** The kept pixel (`b`) and its reflected partner (`a`) for (x, y). */
export function diagonalFold(x: number, y: number, W: number, H: number): { bx: number; by: number; ax: number; ay: number } {
  const rx = Math.floor((2 * y * (W - 1) + (H - 1)) / (2 * Math.max(H - 1, 1)))
  const ry = Math.floor((2 * x * (H - 1) + (W - 1)) / (2 * Math.max(W - 1, 1)))
  return x * (H - 1) <= y * (W - 1)
    ? { bx: x, by: y, ax: rx, ay: ry }
    : { bx: rx, by: ry, ax: x, ay: y }
}

/** Mirror's axes, the select's options; Radial folds into wedges round the centre. */
export const MIRROR_MODES = ['horizontal', 'vertical', 'quad', 'diagonal', 'radial'] as const

/**
 * Whether the glow bloom applies. Radial has no single partner to blend in
 * (a pixel's reflection is a whole ring of wedges), so it never glows.
 */
export function mirrorGlows(props: Record<string, unknown>): boolean {
  return props.glow === true && props.mirrorMode !== 'radial'
}

/** Radial wedge count; fewer than two has nothing to mirror. */
export const MIRROR_SEGMENTS = { min: 2, max: 16 } as const

/** The radial wedge in 16-bit angle units, as the sketch truncates it. */
export function radialWedge(segments: number): number {
  return Math.trunc(65536 / Math.max(MIRROR_SEGMENTS.min, Math.min(MIRROR_SEGMENTS.max, segments)))
}

/** C++ for `radialWedge`: sets `int32_t _kW`. */
export function radialWedgeCpp(segments: string): string {
  return `int32_t _kW=(int32_t)(65536.0f/constrain((float)(${segments}),${MIRROR_SEGMENTS.min}.0f,${MIRROR_SEGMENTS.max}.0f));`
}

/**
 * The radial fold's turn in 16-bit angle units: Rotation (degrees, held to
 * ±180 as Tile Symmetry holds it) plus the integrated Spin phase, taken round
 * a whole turn first so the cast never overflows. A positive turn moves the
 * picture the way Tile Symmetry's does.
 */
export function radialTurn16(rotationDeg: number, spinPhaseDeg: number): number {
  const degrees = (Math.max(-180, Math.min(180, rotationDeg)) + spinPhaseDeg) % 360
  return Math.trunc(degrees * 65536 / 360) & 0xffff
}

/** C++ for `radialTurn16`: sets `uint16_t _kT`. */
export function radialTurnCpp(rotation: string, spinPhase: string): string {
  return `uint16_t _kT=(uint16_t)(int32_t)(fmodf(constrain(${rotation},-180.0f,180.0f)+${spinPhase},360.0f)*65536.0f/360.0f);`
}

/** C++ for `diagonalFold` at (_x, _y): sets the kept `_sx, _sy` and, with `partner`, `_ax, _ay`. */
export function diagonalFoldCpp(partner: boolean): string[] {
  // 32-bit products: a 16-bit int on AVR overflows past a 181-pixel side.
  return [
    `int32_t _rx=(int32_t)((2*(int32_t)_y*(WIDTH-1)+(HEIGHT-1))/(2*max(HEIGHT-1,1))),_ry=(int32_t)((2*(int32_t)_x*(HEIGHT-1)+(WIDTH-1))/(2*max(WIDTH-1,1)));`,
    `bool _dk=(int32_t)_x*(HEIGHT-1)<=(int32_t)_y*(WIDTH-1);`,
    `_sx=_dk?_x:_rx; _sy=_dk?_y:_ry;`,
    ...(partner ? [`int _ax=_dk?_rx:_x,_ay=_dk?_ry:_y;`] : []),
  ]
}
