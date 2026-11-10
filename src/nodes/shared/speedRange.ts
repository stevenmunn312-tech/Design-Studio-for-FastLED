// Speed / scale normalization. The `speed` and `scale` inline sliders are 0–1;
// the evaluator (`denormRate`) and the C++ generator (`rateCpp`) map that 0–1
// onto each node's internal animation rate, so one slider spans the node's
// useful range. This mirrors `audioFlowRange.ts` (which does the same for the
// AudioFlow node) and is the single source of truth shared by both consumers —
// keep the two in lockstep.
//
// The bundled `Noise` and `Plasma` nodes tune per variant (`noiseType`,
// `plasmaStyle`), so their maps are keyed by variant rather than node type.

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/** speed `1.0` (slider max) maps to this internal rate, per node type. */
export const SPEED_MAX: Record<string, number> = {
  RadialBurst: 2, Spiral: 2, FlowField: 1.5, Starfield: 3,
  // Boids — constant flock speed in px/tick (floored at 0.1 in the evaluator).
  Boids: 0.7,
  // StringParticles — track cells a full-power drift particle moves per frame, before the 0.6 step.
  StringParticles: 2,
  // Ripple — LEDs per second along a network edge.
  Ripple: 60,
  // DigitalRain: head cells per frame a full-speed stream advances, before the shared 0.5 step.
  DigitalRain: 2,
  // NoiseSignal — noise-lattice cells travelled per second at speed 1.
  NoiseSignal: 2,
  Blobs: 2, FieldNoise: 1.2, PaletteGradient: 2,
  // Rainbow — startHue units (0–255) per second; ~one sweep every couple seconds.
  Rainbow: 120,
  Pride2015: 1.2, Pacifica: 1,
  // TwinkleFox — cycles per second of each pixel's independent twinkle.
  TwinkleFox: 1,
  // Scanner — ping-pong sweeps per second across the chosen axis.
  Scanner: 1.2,
  // TheaterChase — chase steps per second.
  TheaterChase: 12,
  // ColorWipe — full wipes per second.
  ColorWipe: 1.5,
  // Confetti — colour drift through the palette; Density alone sets the spawn count.
  Confetti: 1.4,
  // Juggle — sweep rate for the dot phases.
  Juggle: 1.2,
}

/** scale `1.0` (slider max) maps to this internal scale, per node type. */
export const SCALE_MAX: Record<string, number> = {
  // FlowField — past about 0.3 every pixel has its own eddy, so 0.25 tops the slider.
  FlowField: 0.25, Blobs: 0.5, FieldNoise: 0.5,
  Pride2015: 1.5, Pacifica: 1,
}

/** Bundled Noise node — speed `1.0` per `noiseType` variant. */
export const NOISE_SPEED_MAX: Record<string, number> = {
  noise4d: 2, worley: 5, plasma: 5, fbm: 1.2, gabor: 1.5,
}

/** Bundled Noise node — scale `1.0` per `noiseType` variant. */
export const NOISE_SCALE_MAX: Record<string, number> = {
  noise4d: 0.5, worley: 0.3, plasma: 0.2, fbm: 0.5, gabor: 0.5,
}

/**
 * Plasma — speed `1.0` per `plasmaStyle`. Sine Grid and Sine 2D keep the
 * ranges they had as Noise types, so a converted graph moves as it did.
 */
export const PLASMA_SPEED_MAX: Record<string, number> = {
  classic: 2, sineGrid: 5, sine2d: 1,
}

/** Plasma — scale `1.0` per `plasmaStyle`; the classic default 0.5 is its old fixed size. */
export const PLASMA_SCALE_MAX: Record<string, number> = {
  classic: 2, sineGrid: 2, sine2d: 1,
}

/** Bundled FormulaPoints node — speed `1.0` (radians/sec) per `formulaType`
 *  variant. `logisticMap`/`attractor` aren't time-driven (their churn comes
 *  from `count` iterations/frame instead), so they have no entry here. */
export const FORMULA_POINTS_SPEED_MAX: Record<string, number> = {
  phyllotaxis: 1, lissajousPath: 2, rosePath: 2,
}

/** Bundled GeometryField node — speed `1.0` per `formulaType` variant. Units
 *  are radians/sec of rotation for the angle-driven variants, and
 *  index-units/sec of ring drift for `goldenTiling`. */
export const GEOMETRY_FIELD_SPEED_MAX: Record<string, number> = {
  fibonacciSpiral: 1, goldenTiling: 6, lissajousField: 1.5,
}

/** Map a 0–1 UI value onto the internal `[0, max]` rate (evaluator side). */
export function denormRate(value: number, max: number): number {
  return clamp01(value) * max
}

/** C++ expression mapping a 0–1 `expr` onto `[0, max]` (codegen side). */
export function rateCpp(expr: string, max: number): string {
  return `(constrain((${expr}), 0.0f, 1.0f) * ${max.toFixed(3)}f)`
}
