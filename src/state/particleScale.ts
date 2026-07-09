// Particle render size scales with matrix resolution so a spawned particle
// covers roughly the same fraction of the panel regardless of size — a single
// lit pixel reads as a full spark on a 16x16 matrix but is nearly invisible on
// a 64x64 one. Shared by the evaluator (computed per frame from the live W/H)
// and the C++ generator (baked once from the MatrixOutput width/height into a
// compile-time constant), so preview and firmware render particles at the same
// size — keep the two in lockstep.
const REFERENCE_DIM = 16
const MAX_RADIUS = 3

/** Blob radius in pixels for particle rendering on a `W`×`H` matrix. 0 = single pixel (16x16 and below). */
export function particleRadius(W: number, H: number): number {
  const scale = Math.max(1, Math.min(W, H) / REFERENCE_DIM)
  return Math.max(0, Math.min(MAX_RADIUS, Math.round((scale - 1) / 2)))
}
