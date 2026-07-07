// Speed / scale normalization. The `speed` and `scale` inline sliders are 0–1;
// the evaluator (`denormRate`) and the C++ generator (`rateCpp`) map that 0–1
// onto each node's internal animation rate, so one slider spans the node's
// useful range. This mirrors `audioFlowRange.ts` (which does the same for the
// AudioFlow node) and is the single source of truth shared by both consumers —
// keep the two in lockstep.
//
// The bundled `Noise` node tunes per `noiseType` variant, so its maps are keyed
// by variant rather than node type.

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/** speed `1.0` (slider max) maps to this internal rate, per node type. */
export const SPEED_MAX: Record<string, number> = {
  Plasma: 2, RadialBurst: 2, Spiral: 2, FlowField: 1.5, Starfield: 3,
  Blobs: 2, GaborNoise: 1.5, Noise2D: 1, FractalNoise: 1.2, FieldNoise: 1.2, PaletteGradient: 2,
  // Rainbow — startHue units (0–255) per second; ~one sweep every couple seconds.
  Rainbow: 120,
  Pride2015: 1.2, Pacifica: 1,
}

/** scale `1.0` (slider max) maps to this internal scale, per node type. */
export const SCALE_MAX: Record<string, number> = {
  FlowField: 1, Blobs: 0.5, GaborNoise: 0.5, Noise2D: 1, FractalNoise: 0.5, FieldNoise: 0.5,
  Pride2015: 1.5, Pacifica: 1,
}

/** Bundled Noise node — speed `1.0` per `noiseType` variant. */
export const NOISE_SPEED_MAX: Record<string, number> = {
  field: 5, simplex: 3, noise3d: 5, worley: 5, plasma: 5,
}

/** Bundled Noise node — scale `1.0` per `noiseType` variant. */
export const NOISE_SCALE_MAX: Record<string, number> = {
  field: 2, simplex: 0.5, noise3d: 0.5, worley: 0.3, plasma: 0.2,
}

/** Map a 0–1 UI value onto the internal `[0, max]` rate (evaluator side). */
export function denormRate(value: number, max: number): number {
  return clamp01(value) * max
}

/** C++ expression mapping a 0–1 `expr` onto `[0, max]` (codegen side). */
export function rateCpp(expr: string, max: number): string {
  return `(constrain((${expr}), 0.0f, 1.0f) * ${max.toFixed(3)}f)`
}
