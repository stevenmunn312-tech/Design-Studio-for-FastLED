import { FORMULA_POINTS_SPEED_MAX, denormRate, SPEED_MAX, SCALE_MAX } from '../../state/speedRange'
import { particleRadius } from '../../state/particleScale'
import { type Frame, type Palette, samplePalette, hsv, type RGB } from '../../state/ledColor'
import type { NodeEvaluators } from '../../state/evaluator/types'
import {
  buildFrame,
  DEFAULT_W,
  DEFAULT_H,
  blankFrame,
  splatDisc,
  scaleRgb,
  clamp01,
  rawBlankFrame,
  byte,
} from '../../state/evaluator/frames'
import { allocFrame, instanceState } from '../../state/evaluator/memory'
import {
  seededRngState,
  seededRandom,
  _snoise2,
  seededHash,
  worleyHash,
  normalizedSeed,
} from '../../state/evaluator/random'

// ── Persistent state for stateful pattern nodes ───────────────────────────────
const fireHeat    = instanceState('fireHeat', new Map<string, number[][]>())
// Fire/Fire2012 deterministic-reseed PRNG — an LCG per instance, only used
// when the node's `seed` property is nonzero (0 = free-running Math.random,
// unchanged from before this control existed).
const fireRngState = instanceState('fireRngState', new Map<string, { seed: number; lcg: number }>())

interface Particle { x: number; y: number; vx: number; vy: number; life: number; r: number; g: number; b: number; seed?: number }
const particleState = instanceState('particleState', new Map<string, Particle[]>())
const particleSeedState = instanceState('particleSeedState', new Map<string, string>())

interface RDState { u: Float32Array; v: Float32Array; un: Float32Array; vn: Float32Array; w: number; h: number; seed: number }
const rdState = instanceState('rdState', new Map<string, RDState>())

interface GolState { cells: Uint8Array; next: Uint8Array; bright: Float32Array; w: number; h: number; seed: number; lastStep: number; stale: number }
const golState = instanceState('golState', new Map<string, GolState>())

interface FlowState { px: Float32Array; py: Float32Array; trail: Float32Array; w: number; h: number; seed: number }
const flowState = instanceState('flowState', new Map<string, FlowState>())

interface StarState { x: Float32Array; y: Float32Array; z: Float32Array; w: number; h: number; seed: number }
const starState = instanceState('starState', new Map<string, StarState>())

interface BoidState { x: Float32Array; y: Float32Array; vx: Float32Array; vy: Float32Array; w: number; h: number; seed: number }
const boidState = instanceState('boidState', new Map<string, BoidState>())

// ── Shared Fire/Fire2012 controls (direction, turbulence, paletteMix, mirror,
// seed) — both nodes keep their own heat algorithm but share this exact set
// of extra controls. Keep these helpers in sync with cppGenerator's Fire/
// Fire2012 cases.
export type FireDirection = 'up' | 'down' | 'left' | 'right'

// The heat simulation always runs in a canonical [P][S] grid — P (primary) is
// the distance from the flame base (index 0 = the base, where sparks land)
// and S (secondary) is the position across the flame's width — so the same
// cool/propagate/spark code works for every direction. `firePrimary`/
// `fireSecondary` give P/S's *lengths*; the mapping back to real (x, y) only
// happens once, in `fireToXY`, when sampling the palette for the output frame.
function firePrimaryLen(direction: FireDirection, W: number, H: number): number {
  return direction === 'left' || direction === 'right' ? W : H
}
function fireSecondaryLen(direction: FireDirection, W: number, H: number): number {
  return direction === 'left' || direction === 'right' ? H : W
}
function fireToXY(direction: FireDirection, p: number, s: number, W: number, H: number): [number, number] {
  switch (direction) {
    case 'down':  return [s, p]
    case 'left':  return [W - 1 - p, s]
    case 'right': return [p, s]
    case 'up':
    default:      return [s, H - 1 - p]
  }
}

// 0–1 random draw. `seed === 0` (the default) is unseeded — plain
// Math.random, unchanged from before this control existed. A nonzero seed
// switches to a per-instance LCG so the whole simulation is reproducible from
// a fresh start (reseeds automatically whenever `seed` itself changes).
function fireRandom(nodeId: string, seed: number): number {
  if (!seed) return Math.random()
  let st = fireRngState.get(nodeId)
  if (!st || st.seed !== seed) { st = { seed, lcg: seed >>> 0 }; fireRngState.set(nodeId, st) }
  st.lcg = (st.lcg * 1664525 + 1013904223) >>> 0
  return st.lcg / 4294967296
}

// Folds the frame symmetric across its width (the axis perpendicular to the
// flame's rise): up/down mirror columns, left/right mirror rows.
function fireMirror(frame: Frame, direction: FireDirection, W: number, H: number): Frame {
  const vertical = direction === 'up' || direction === 'down'
  return buildFrame(W, H, (x, y) => vertical ? frame[y][Math.min(x, W - 1 - x)] : frame[Math.min(y, H - 1 - y)][x])
}

function evalFire(
  nodeId: string, intensity: number, cooling: number, sparking: number, palette: Palette,
  W = DEFAULT_W, H = DEFAULT_H,
  direction: FireDirection = 'up', turbulence = 1, paletteMix = 1, mirror = false, seed = 0,
): Frame {
  const P = firePrimaryLen(direction, W, H), S = fireSecondaryLen(direction, W, H)
  const stored = fireHeat.get(nodeId)
  if (!stored || stored.length !== P || stored[0].length !== S) {
    fireHeat.set(nodeId, Array.from({ length: P }, () => Array(S).fill(0)))
  }
  const heat = fireHeat.get(nodeId)!
  const cool = Math.max(0, Math.min(255, cooling)) / 255 * 0.18
  const spread = Math.max(0, Math.round(turbulence))

  for (let p = 0; p < P; p++)
    for (let s = 0; s < S; s++)
      heat[p][s] = Math.max(0, heat[p][s] - cool - fireRandom(nodeId, seed) * cool)

  // Propagate from p-1 (closer to the base) into p, averaging a
  // `turbulence`-wide window across the secondary axis (spread=1 reproduces
  // the original fixed 3-wide/4-sample kernel exactly).
  for (let p = P - 1; p >= 1; p--) {
    for (let s = 0; s < S; s++) {
      let sum = 0
      for (let ds = -spread; ds <= spread; ds++) sum += heat[p - 1][Math.max(0, Math.min(S - 1, s + ds))]
      heat[p][s] = (heat[p][s] + sum) / (spread * 2 + 2)
    }
  }

  const sparkChance = Math.max(0, Math.min(1, (Math.max(0, Math.min(255, sparking)) / 255) * (0.35 + Math.max(0, Math.min(1, intensity)) * 0.65)))
  for (let s = 0; s < S; s++)
    if (fireRandom(nodeId, seed) < sparkChance)
      heat[0][s] = Math.min(1, 0.75 + fireRandom(nodeId, seed) * 0.25)

  const mix = Math.max(0, Math.min(1, paletteMix))
  const frame = allocFrame(W, H)
  for (let p = 0; p < P; p++) {
    for (let s = 0; s < S; s++) {
      const [x, y] = fireToXY(direction, p, s, W, H)
      const h = heat[p][s]
      const c = samplePalette(palette, h)
      const px = frame[y][x]
      if (mix >= 1) { px.r = c.r; px.g = c.g; px.b = c.b }
      else {
        const gray = h * 255
        px.r = Math.round(gray * (1 - mix) + c.r * mix)
        px.g = Math.round(gray * (1 - mix) + c.g * mix)
        px.b = Math.round(gray * (1 - mix) + c.b * mix)
      }
    }
  }
  return mirror ? fireMirror(frame, direction, W, H) : frame
}

const MAX_PARTICLES = 600

// Extra variant-specific Particles controls (see PROPERTY_META.Particles /
// isPropertyEnabled in nodeLibrary.ts, gated to the modes that use them):
// `count` sets the pool size directly for the fixed-population modes,
// decoupled from spawn `rate`; `spread` widens/narrows a width-spawning mode's
// spawn area; `gravity`/`bounce` scale a mode's built-in accel/restitution
// constant. `size` scales the rendered particle radius for every mode.
export interface ParticleOpts { size: number; count: number; spread: number; gravity: number; bounce: number }
const DEFAULT_PARTICLE_OPTS: ParticleOpts = { size: 1, count: 24, spread: 1, gravity: 1, bounce: 1 }

// Bundled particle systems — `mode` picks the simulation. Each mode spawns and
// advances the persistent particle pool, then a shared pass renders every live
// particle additively at its `life` brightness. Keep the modes in sync with
// PROPERTY_META.particleType and cppGenerator's `Particles` case.
function evalParticles(nodeId: string, mode: string, rate: number, palette: Palette, decay: number, t: number, W = DEFAULT_W, H = DEFAULT_H, opts: ParticleOpts = DEFAULT_PARTICLE_OPTS, seed = 0): Frame {
  const seedKey = `${mode}:${seed}`
  if (particleSeedState.get(nodeId) !== seedKey) {
    particleState.set(nodeId, [])
    particleSeedState.set(nodeId, seedKey)
    seededRngState.delete(`${nodeId}:particles`)
  }
  if (!particleState.has(nodeId)) particleState.set(nodeId, [])
  let particles = particleState.get(nodeId)!
  const rnd = () => seededRandom(`${nodeId}:particles`, seed)
  const { size, count, spread, gravity, bounce } = opts
  // Spawn colour is a representative palette sample kept only so the pool objects
  // stay well-formed; every particle is actually rendered by its life (age)
  // through the palette below, so a palette change applies to live particles too.
  const color = samplePalette(palette, 0.8)

  switch (mode) {
    case 'gravity': {
      // Drops fall from the top and bounce off the floor, losing energy.
      if (rnd() < rate) particles.push({ x: W / 2 + (rnd() - 0.5) * W * spread, y: 0, vx: (rnd() - 0.5) * 0.4 * spread, vy: rnd() * 0.2, life: 1, r: color.r, g: color.g, b: color.b })
      for (const p of particles) {
        p.vy += 0.045 * gravity; p.x += p.vx; p.y += p.vy
        if (p.y >= H - 1) { p.y = H - 1; p.vy *= -0.55 * bounce; p.vx *= 0.8; p.life *= 0.9 }
        p.life *= decay
      }
      particles = particles.filter(p => p.life > 0.05)
      break
    }
    case 'fireworks': {
      // Occasional radial burst from a random point; gravity + drag pull it apart.
      if (rnd() < rate * 0.12) {
        const cx = rnd() * W, cy = rnd() * H * 0.5 + H * 0.1
        const hue = rnd() * 360, n = 14 + Math.floor(rnd() * 8)
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + rnd() * 0.3
          const spd = rnd() * 0.5 + 0.35
          const c = hsv(hue + (rnd() - 0.5) * 30, 1, 1)
          particles.push({ x: cx, y: cy, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, life: 1, r: c.r, g: c.g, b: c.b })
        }
      }
      for (const p of particles) { p.vy += 0.022 * gravity; p.vx *= 0.965; p.vy *= 0.965; p.x += p.vx; p.y += p.vy; p.life *= decay * 0.985 }
      particles = particles.filter(p => p.life > 0.05)
      break
    }
    case 'sparkle': {
      // Sparkle rain — random twinkles drizzle down and fade.
      const spawn = Math.max(1, Math.round(rate * W * 0.8))
      for (let i = 0; i < spawn; i++) if (rnd() < rate) particles.push({ x: W / 2 + (rnd() - 0.5) * W * spread, y: rnd() * H * 0.3, vx: 0, vy: rnd() * 0.25 + 0.05, life: 1, r: color.r, g: color.g, b: color.b })
      for (const p of particles) { p.y += p.vy; p.life *= decay * 0.9 }
      particles = particles.filter(p => p.life > 0.05 && p.y < H)
      break
    }
    case 'comet': {
      // A head traces a Lissajous path; each frame drops a fading trail dot.
      const hx = (W - 1) * (0.5 + 0.45 * Math.sin(t * 0.9))
      const hy = (H - 1) * (0.5 + 0.45 * Math.sin(t * 0.6 + 1.3))
      particles.push({ x: hx, y: hy, vx: 0, vy: 0, life: 1, r: color.r, g: color.g, b: color.b })
      for (const p of particles) p.life *= decay
      particles = particles.filter(p => p.life > 0.04)
      break
    }
    case 'snow': {
      // Snow drifts down with a gentle horizontal sway; recycles at the floor.
      if (rnd() < rate) particles.push({ x: W / 2 + (rnd() - 0.5) * W * spread, y: 0, vx: 0, vy: rnd() * 0.12 + 0.05, life: 0.7 + rnd() * 0.3, r: color.r, g: color.g, b: color.b, seed: rnd() * 6.28 })
      for (const p of particles) { p.y += p.vy; p.x += Math.sin(t * 1.5 + (p.seed ?? 0)) * 0.12 }
      particles = particles.filter(p => p.y < H)
      break
    }
    case 'swarm': {
      // Boids — cohesion, alignment, separation; wrap at the edges.
      const N = Math.max(2, Math.min(80, Math.round(count)))
      while (particles.length < N) particles.push({ x: rnd() * W, y: rnd() * H, vx: (rnd() - 0.5) * 0.6, vy: (rnd() - 0.5) * 0.6, life: 1, r: color.r, g: color.g, b: color.b })
      if (particles.length > N) particles = particles.slice(0, N)
      const R = Math.max(3, Math.min(W, H) * 0.5)
      particles = particles.map(p => {
        let cx = 0, cy = 0, ax = 0, ay = 0, sx = 0, sy = 0, n = 0
        for (const q of particles) {
          if (q === p) continue
          const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy)
          if (d < R && d > 0) {
            cx += q.x; cy += q.y; ax += q.vx; ay += q.vy; n++
            if (d < R * 0.4) { sx -= dx / d; sy -= dy / d }
          }
        }
        let vx = p.vx, vy = p.vy
        if (n > 0) {
          vx += (cx / n - p.x) * 0.0008 + (ax / n - p.vx) * 0.05 + sx * 0.04
          vy += (cy / n - p.y) * 0.0008 + (ay / n - p.vy) * 0.05 + sy * 0.04
        }
        const sp = Math.hypot(vx, vy), max = 0.7
        if (sp > max) { vx = (vx / sp) * max; vy = (vy / sp) * max }
        return { ...p, x: (p.x + vx + W) % W, y: (p.y + vy + H) % H, vx, vy }
      })
      break
    }
    case 'rain': {
      // Fast wind-blown streaks from the top.
      if (rnd() < rate) particles.push({ x: W / 2 + (rnd() - 0.5) * W * spread, y: 0, vx: (rnd() - 0.5) * 0.18, vy: rnd() * 0.45 + 0.35, life: 1, r: color.r, g: color.g, b: color.b })
      for (const p of particles) { p.x += p.vx; p.y += p.vy; p.life *= decay * 0.995 }
      particles = particles.filter(p => p.y < H && p.life > 0.05)
      break
    }
    case 'embers': {
      // Warm motes lift from the floor and wander as they cool.
      if (rnd() < rate) particles.push({ x: rnd() * W, y: H - 1, vx: (rnd() - 0.5) * 0.12, vy: -(rnd() * 0.18 + 0.04), life: 1, r: color.r, g: color.g, b: color.b, seed: rnd() * 6.28 })
      for (const p of particles) { p.x += p.vx + Math.sin(t * 2 + (p.seed ?? 0)) * 0.05; p.y += p.vy; p.life *= decay * 0.985 }
      particles = particles.filter(p => p.y >= 0 && p.life > 0.05)
      break
    }
    case 'bubbles': {
      // Buoyant dots rise from below with a broad side-to-side wobble.
      if (rnd() < rate) particles.push({ x: rnd() * W, y: H - 1, vx: 0, vy: -(rnd() * 0.16 + 0.06), life: 1, r: color.r, g: color.g, b: color.b, seed: rnd() * 6.28 })
      for (const p of particles) { p.x += Math.sin(t * 3 + (p.seed ?? 0)) * 0.1; p.y += p.vy }
      particles = particles.filter(p => p.y >= 0)
      break
    }
    case 'vortex': {
      // Particles spiral around the centre while being pulled slowly inward.
      if (rnd() < rate) particles.push({ x: rnd() * W, y: rnd() * H, vx: 0, vy: 0, life: 1, r: color.r, g: color.g, b: color.b })
      const cx = (W - 1) / 2, cy = (H - 1) / 2
      for (const p of particles) {
        const dx = p.x - cx, dy = p.y - cy, d = Math.max(0.5, Math.hypot(dx, dy))
        p.x += (-dy / d) * 0.24 - dx * 0.006; p.y += (dx / d) * 0.24 - dy * 0.006; p.life *= decay * 0.995
      }
      particles = particles.filter(p => p.life > 0.05)
      break
    }
    case 'orbit': {
      // A stable constellation of dots circles the matrix centre.
      const N = Math.max(2, Math.min(80, Math.round(count)))
      while (particles.length < N) particles.push({ x: rnd() * W, y: rnd() * H, vx: 0, vy: 0, life: 1, r: color.r, g: color.g, b: color.b, seed: rnd() * 0.08 + 0.025 })
      if (particles.length > N) particles = particles.slice(0, N)
      const cx = (W - 1) / 2, cy = (H - 1) / 2
      for (const p of particles) {
        const dx = p.x - cx, dy = p.y - cy, a = p.seed ?? 0.04
        p.x = cx + dx * Math.cos(a) - dy * Math.sin(a); p.y = cy + dx * Math.sin(a) + dy * Math.cos(a); p.life = 1
      }
      break
    }
    case 'confetti': {
      // Short-lived flecks appear throughout the matrix and drift downward.
      const spawn = Math.max(1, Math.round(rate * 4))
      for (let i = 0; i < spawn; i++) if (rnd() < rate) particles.push({ x: W / 2 + (rnd() - 0.5) * W * spread, y: rnd() * H, vx: (rnd() - 0.5) * 0.16, vy: rnd() * 0.08 + 0.02, life: 1, r: color.r, g: color.g, b: color.b })
      for (const p of particles) { p.x += p.vx; p.y += p.vy; p.life *= decay * 0.94 }
      particles = particles.filter(p => p.life > 0.05 && p.y < H)
      break
    }
    case 'fireflies': {
      // A persistent cloud meanders in smoothly changing directions.
      const N = Math.max(2, Math.min(80, Math.round(count)))
      while (particles.length < N) particles.push({ x: rnd() * W, y: rnd() * H, vx: (rnd() - 0.5) * 0.12, vy: (rnd() - 0.5) * 0.12, life: 0.45 + rnd() * 0.55, r: color.r, g: color.g, b: color.b, seed: rnd() * 6.28 })
      if (particles.length > N) particles = particles.slice(0, N)
      const spanX = Math.max(1, W - 1), spanY = Math.max(1, H - 1)
      for (const p of particles) { p.x = (p.x + p.vx + Math.sin(t + (p.seed ?? 0)) * 0.035 + spanX) % spanX; p.y = (p.y + p.vy + Math.cos(t * 0.8 + (p.seed ?? 0)) * 0.035 + spanY) % spanY; p.life = 0.65 + Math.sin(t * 3 + (p.seed ?? 0)) * 0.35 }
      break
    }
    case 'meteor': {
      // A bright diagonal head continuously lays down a fading tail.
      const span = Math.max(1, Math.max(W, H) - 1), phase = (t * Math.max(2, W * 0.45)) % span
      particles.push({ x: phase * (W - 1) / span, y: phase * (H - 1) / span, vx: 0, vy: 0, life: 1, r: color.r, g: color.g, b: color.b })
      for (const p of particles) p.life *= decay * 0.96
      particles = particles.filter(p => p.life > 0.04)
      break
    }
    case 'tornado': {
      // Rising motes tighten into a rotating funnel.
      if (rnd() < rate) particles.push({ x: W / 2, y: H - 1, vx: 0, vy: -(rnd() * 0.16 + 0.06), life: 1, r: color.r, g: color.g, b: color.b, seed: rnd() * 6.28 })
      for (const p of particles) { p.y += p.vy; const h = Math.max(0, Math.min(1, 1 - p.y / H)); p.x = W / 2 + Math.sin(t * 5 + (p.seed ?? 0) + p.y * 0.7) * (0.5 + h * W * 0.35); p.life *= decay * 0.995 }
      particles = particles.filter(p => p.y >= 0 && p.life > 0.05)
      break
    }
    case 'pinwheel': {
      // Curved spokes stream out from the centre.
      if (rnd() < rate) {
        const a = rnd() * Math.PI * 2
        particles.push({ x: W / 2, y: H / 2, vx: Math.cos(a) * 0.18, vy: Math.sin(a) * 0.18, life: 1, r: color.r, g: color.g, b: color.b })
      }
      for (const p of particles) { const vx = p.vx - p.vy * 0.035, vy = p.vy + p.vx * 0.035; p.vx = vx; p.vy = vy; p.x += vx; p.y += vy; p.life *= decay * 0.99 }
      particles = particles.filter(p => p.life > 0.05 && p.x >= 0 && p.x < W && p.y >= 0 && p.y < H)
      break
    }
    case 'bounce': {
      // A rate-controlled set of particles ricochets around the panel.
      const N = Math.max(2, Math.min(80, Math.round(count)))
      while (particles.length < N) particles.push({ x: rnd() * W, y: rnd() * H, vx: (rnd() - 0.5) * 0.5, vy: (rnd() - 0.5) * 0.5, life: 1, r: color.r, g: color.g, b: color.b })
      if (particles.length > N) particles = particles.slice(0, N)
      for (const p of particles) { p.x += p.vx; p.y += p.vy; if (p.x <= 0 || p.x >= W - 1) { p.x = Math.max(0, Math.min(W - 1, p.x)); p.vx *= -1 } if (p.y <= 0 || p.y >= H - 1) { p.y = Math.max(0, Math.min(H - 1, p.y)); p.vy *= -1 } p.life = 1 }
      break
    }
    case 'attractor': {
      // Particles chase a moving attractor, overshooting into loose loops.
      if (rnd() < rate) particles.push({ x: rnd() * W, y: rnd() * H, vx: (rnd() - 0.5) * 0.1, vy: (rnd() - 0.5) * 0.1, life: 1, r: color.r, g: color.g, b: color.b })
      const ax = (W - 1) * (0.5 + 0.35 * Math.sin(t * 0.7)), ay = (H - 1) * (0.5 + 0.35 * Math.cos(t * 0.9))
      for (const p of particles) { const dx = ax - p.x, dy = ay - p.y, d = Math.max(1, Math.hypot(dx, dy)); p.vx = p.vx * 0.97 + dx / d * 0.025; p.vy = p.vy * 0.97 + dy / d * 0.025; p.x += p.vx; p.y += p.vy; p.life *= decay * 0.998 }
      particles = particles.filter(p => p.life > 0.05)
      break
    }
    case 'waterfall': {
      // Dense drops accelerate down a narrow central stream and splash outward.
      const spawn = Math.max(1, Math.round(rate * 3))
      for (let i = 0; i < spawn; i++) if (rnd() < rate) particles.push({ x: W * 0.5 + (rnd() - 0.5) * 0.3 * W * spread, y: 0, vx: (rnd() - 0.5) * 0.08, vy: rnd() * 0.2 + 0.12, life: 1, r: color.r, g: color.g, b: color.b })
      for (const p of particles) { p.vy += 0.025 * gravity; p.x += p.vx; p.y += p.vy; if (p.y >= H - 1) { p.y = H - 1; p.vy *= -0.3 * bounce; p.vx += (rnd() - 0.5) * 0.35; p.life *= 0.7 } p.life *= decay * 0.995 }
      particles = particles.filter(p => p.life > 0.05 && p.y < H)
      break
    }
    case 'fountain':
    default: {
      // Sparks rise from the bottom, arc under gravity, and fade.
      if (rnd() < rate) particles.push({ x: W / 2 + (rnd() - 0.5) * W * spread, y: H - 1, vx: (rnd() - 0.5) * 0.6 * spread, vy: -(rnd() * 0.5 + 0.1), life: 1, r: color.r, g: color.g, b: color.b })
      for (const p of particles) { p.x += p.vx; p.y += p.vy; p.vy += 0.02 * gravity; p.life *= decay }
      particles = particles.filter(p => p.life > 0.04 && p.y >= 0)
      break
    }
  }

  if (particles.length > MAX_PARTICLES) particles = particles.slice(particles.length - MAX_PARTICLES)
  particleState.set(nodeId, particles)

  const frame = blankFrame(W, H)
  // Particles render as a soft circular blob whose radius scales with matrix
  // size (see particleScale.ts) so a spark reads at roughly the same visual
  // size on a 64x64 panel as on the reference 16x16 one, instead of shrinking
  // to a single near-invisible pixel. `size` further scales that radius.
  const radius = Math.max(0.5, particleRadius(W, H) * size)
  for (const p of particles) {
    const k = Math.min(1, p.life)
    // Colour each particle by its life through the palette — young/bright
    // particles land at the palette's hot end and cool toward its start as they fade.
    splatDisc(frame, p.x, p.y, radius, scaleRgb(samplePalette(palette, k), k))
  }
  return frame
}

// ── Formula Points (curated stateful point/trajectory generators — see
// docs/development/design/formula-pattern-nodes.md) ────────────────────────
// The pattern-category, self-contained-frame-generator sibling of
// FormulaField: unlike Particles' procedural spawn/decay pools, each variant
// is exact closed-form/iterated math shared identically by evaluator and
// codegen (same "no algorithm drift" property FormulaField's rose/
// superformula/etc. already rely on).
const GOLDEN_ANGLE = 2 * Math.PI * (1 - 1 / 1.618033988749895)

// de Jong attractor coefficients (x' = sin(a·y) − cos(b·x), y' = sin(c·x) −
// cos(d·y)) — unconditionally bounded to [-2,2] regardless of (a,b,c,d) since
// sin/cos never exceed 1, so every preset is stable with no escape/clamp
// logic needed. Named presets instead of exposing raw coefficients, the same
// convention Fire/Fire2012 use for their `seed` LCG rather than raw params.
const DE_JONG_PRESETS: Readonly<Record<string, readonly [number, number, number, number]>> = {
  classic: [1.4, -2.3, 2.4, -2.1],
  swirl: [-2.7, -0.09, -0.86, -2.2],
  web: [-0.827, -1.637, 1.659, -0.943],
}

export interface FormulaPointsParams {
  formulaType: string
  speed: number
  dotSize: number
  palette: Palette
  count: number
  persistence: number
  freqA: number
  freqB: number
  petals: number
  chaos: number
  preset: string
}

interface FormulaPointsState {
  /** Persistent render buffer for the trail/accumulate variants
   *  (lissajousPath/rosePath/attractor) — unpooled, like trailState. */
  frame?: Frame
  logisticX?: number
  attractorX?: number
  attractorY?: number
}
const formulaPointsState = instanceState('formulaPointsState', new Map<string, FormulaPointsState>())

function fadeFrameInPlace(frame: Frame, retain: number): void {
  const r = clamp01(retain)
  for (let y = 0; y < frame.length; y++) {
    const row = frame[y]
    for (let x = 0; x < row.length; x++) {
      const px = row[x]
      px.r = Math.round(px.r * r)
      px.g = Math.round(px.g * r)
      px.b = Math.round(px.b * r)
    }
  }
}

function formulaPointsTrailBuf(st: FormulaPointsState, W: number, H: number): Frame {
  return st.frame && st.frame.length === H && st.frame[0]?.length === W ? st.frame : rawBlankFrame(W, H)
}

function hueWrap01(v: number): number {
  const w = v % 1
  return w < 0 ? w + 1 : w
}

function evalFormulaPoints(key: string, p: FormulaPointsParams, t: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const radius = Math.max(0.5, particleRadius(W, H) * Math.max(0.1, p.dotSize))
  const st = formulaPointsState.get(key) ?? {}
  const count = Math.max(1, Math.min(300, Math.round(p.count)))

  switch (p.formulaType) {
    case 'logisticMap': {
      let x = st.logisticX ?? 0.5
      const r = Math.max(0, Math.min(4, p.chaos))
      const frame = blankFrame(W, H)
      for (let i = 0; i < count; i++) {
        x = r * x * (1 - x)
        const ang = (i / count) * Math.PI * 2
        const rad = 0.5 * x
        const px = (0.5 + rad * Math.cos(ang)) * (W - 1)
        const py = (0.5 + rad * Math.sin(ang)) * (H - 1)
        splatDisc(frame, px, py, radius, samplePalette(p.palette, x))
      }
      st.logisticX = x
      formulaPointsState.set(key, st)
      return frame
    }

    case 'attractor': {
      const [a, b, c, d] = DE_JONG_PRESETS[p.preset] ?? DE_JONG_PRESETS.classic
      let ax = st.attractorX ?? 0.1, ay = st.attractorY ?? 0.1
      const buf = formulaPointsTrailBuf(st, W, H)
      fadeFrameInPlace(buf, p.persistence)
      for (let i = 0; i < count; i++) {
        const nx = Math.sin(a * ay) - Math.cos(b * ax)
        const ny = Math.sin(c * ax) - Math.cos(d * ay)
        ax = nx; ay = ny
        const px = ((ax + 2) / 4) * (W - 1)
        const py = ((ay + 2) / 4) * (H - 1)
        splatDisc(buf, px, py, radius, samplePalette(p.palette, i / count))
      }
      st.attractorX = ax; st.attractorY = ay; st.frame = buf
      formulaPointsState.set(key, st)
      return buf
    }

    case 'lissajousPath': {
      const buf = formulaPointsTrailBuf(st, W, H)
      fadeFrameInPlace(buf, p.persistence)
      const phase = t * p.speed * (FORMULA_POINTS_SPEED_MAX.lissajousPath ?? 1)
      const cx = Math.sin(Math.max(1, p.freqA) * phase)
      const cy = Math.sin(Math.max(1, p.freqB) * phase)
      const px = ((cx + 1) / 2) * (W - 1)
      const py = ((cy + 1) / 2) * (H - 1)
      splatDisc(buf, px, py, radius, samplePalette(p.palette, hueWrap01(phase / (2 * Math.PI))))
      st.frame = buf
      formulaPointsState.set(key, st)
      return buf
    }

    case 'rosePath': {
      const buf = formulaPointsTrailBuf(st, W, H)
      fadeFrameInPlace(buf, p.persistence)
      const phase = t * p.speed * (FORMULA_POINTS_SPEED_MAX.rosePath ?? 1)
      const k = Math.max(1, p.petals)
      const rr = Math.cos(k * phase)
      const cx = rr * Math.cos(phase)
      const cy = rr * Math.sin(phase)
      const px = ((cx + 1) / 2) * (W - 1)
      const py = ((cy + 1) / 2) * (H - 1)
      splatDisc(buf, px, py, radius, samplePalette(p.palette, hueWrap01(phase / (2 * Math.PI))))
      st.frame = buf
      formulaPointsState.set(key, st)
      return buf
    }

    case 'phyllotaxis':
    default: {
      const spin = t * p.speed * (FORMULA_POINTS_SPEED_MAX.phyllotaxis ?? 1)
      const frame = blankFrame(W, H)
      for (let i = 0; i < count; i++) {
        const ang = i * GOLDEN_ANGLE + spin
        const rr = Math.sqrt(i / count)
        const px = (0.5 + 0.5 * rr * Math.cos(ang)) * (W - 1)
        const py = (0.5 + 0.5 * rr * Math.sin(ang)) * (H - 1)
        splatDisc(frame, px, py, radius, samplePalette(p.palette, i / count))
      }
      return frame
    }
  }
}

// Flow field: particles drift along a simplex-noise direction field, depositing
// fading trails that are coloured through a palette. Stateful.
function evalFlowField(nodeId: string, speed: number, scale: number, count: number, fade: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H, seed = 0): Frame {
  const N = W * H
  const pc = Math.max(8, Math.min(400, Math.floor(count)))
  let s = flowState.get(nodeId)
  if (!s || s.w !== W || s.h !== H || s.px.length !== pc || s.seed !== seed) {
    seededRngState.delete(`${nodeId}:flow`)
    const rnd = () => seededRandom(`${nodeId}:flow`, seed)
    const px = new Float32Array(pc), py = new Float32Array(pc)
    for (let i = 0; i < pc; i++) { px[i] = rnd() * W; py[i] = rnd() * H }
    s = { px, py, trail: new Float32Array(N), w: W, h: H, seed }
    flowState.set(nodeId, s)
  }
  const { px, py, trail } = s
  const f = Math.max(0, Math.min(1, fade))
  for (let i = 0; i < N; i++) trail[i] *= f
  const z = t * 0.1
  for (let i = 0; i < pc; i++) {
    const a = _snoise2(px[i] * scale + z, py[i] * scale) * Math.PI * 4
    px[i] = ((px[i] + Math.cos(a) * speed * 0.6) % W + W) % W
    py[i] = ((py[i] + Math.sin(a) * speed * 0.6) % H + H) % H
    const idx = Math.floor(py[i]) * W + Math.floor(px[i])
    trail[idx] = Math.min(1, trail[idx] + 0.5)
  }
  return buildFrame(W, H, (x, y) => samplePalette(palette, trail[y * W + x]))
}

// Warp starfield: stars fly outward from the centre; nearer stars are brighter.
function evalStarfield(nodeId: string, speed: number, count: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H, seed = 0): Frame {
  const pc = Math.max(8, Math.min(300, Math.floor(count)))
  let s = starState.get(nodeId)
  const rnd = () => seededRandom(`${nodeId}:star`, seed)
  if (!s || s.w !== W || s.h !== H || s.x.length !== pc || s.seed !== seed) {
    seededRngState.delete(`${nodeId}:star`)
    const x = new Float32Array(pc), y = new Float32Array(pc), z = new Float32Array(pc)
    for (let i = 0; i < pc; i++) { x[i] = rnd() * 2 - 1; y[i] = rnd() * 2 - 1; z[i] = rnd() * 0.9 + 0.1 }
    s = { x, y, z, w: W, h: H, seed }; starState.set(nodeId, s)
  }
  const { x, y, z } = s
  const frame = blankFrame(W, H)
  for (let i = 0; i < pc; i++) {
    z[i] -= speed * 0.015
    if (z[i] <= 0.02) { x[i] = rnd() * 2 - 1; y[i] = rnd() * 2 - 1; z[i] = 1 }
    const px = Math.round(W / 2 + (x[i] / z[i]) * W * 0.35), py = Math.round(H / 2 + (y[i] / z[i]) * H * 0.35)
    if (px >= 0 && px < W && py >= 0 && py < H) {
      const b = Math.min(1, 1 - z[i])
      // Depth (near = 1) picks the palette colour and the brightness.
      frame[py][px] = scaleRgb(samplePalette(palette, b), b)
    }
  }
  return frame
}

// Boids — Reynolds flocking. Each agent steers by three weighted rules over the
// neighbours inside `range` px: separation (push off close ones), alignment
// (match average heading), cohesion (drift toward the local centre of mass).
// Velocities update simultaneously (read old, write new), then are renormalised
// to a constant speed so the swarm stays bounded; positions wrap toroidally.
// Rendered as a bright head pixel plus a dim one-pixel tail along the heading.
// `colorMode` tints each boid: 'solid' (the wired/prop colour), 'palette' (a
// fixed per-boid position across the wired palette), 'heading' (hue from
// movement direction), 'spectrum' (a fixed per-boid hue across the wheel),
// 'density' (hue by local neighbour count — warm where the flock clusters),
// 'position' (a spatial hue gradient the flock moves through), 'cycle' (the whole
// flock breathing through the wheel over time), or 'radial' (hue by distance from
// the matrix centre — concentric rings the flock crosses).
// Kept a faithful mirror of the C++ emitter in cppGenerator.ts.
function evalBoids(nodeId: string, speed: number, count: number, sep: number, ali: number, coh: number, range: number, color: RGB, palette: Palette, colorMode: string, t: number, W = DEFAULT_W, H = DEFAULT_H, seed = 0): Frame {
  const n = Math.max(2, Math.min(80, Math.floor(count)))
  let s = boidState.get(nodeId)
  if (!s || s.w !== W || s.h !== H || s.x.length !== n || s.seed !== seed) {
    seededRngState.delete(`${nodeId}:boids`)
    const rnd = () => seededRandom(`${nodeId}:boids`, seed)
    const x = new Float32Array(n), y = new Float32Array(n), vx = new Float32Array(n), vy = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      x[i] = rnd() * W; y[i] = rnd() * H
      const a = rnd() * Math.PI * 2; vx[i] = Math.cos(a); vy[i] = Math.sin(a)
    }
    s = { x, y, vx, vy, w: W, h: H, seed }; boidState.set(nodeId, s)
  }
  const { x, y, vx, vy } = s
  const maxSpeed = Math.max(0.1, speed)
  const range2 = range * range
  const sepR2 = (range * 0.5) * (range * 0.5)
  const nvx = new Float32Array(n), nvy = new Float32Array(n), nn = new Int32Array(n)
  for (let i = 0; i < n; i++) {
    let sx = 0, sy = 0, avx = 0, avy = 0, cx = 0, cy = 0, near = 0, sc = 0
    for (let j = 0; j < n; j++) {
      if (j === i) continue
      const dx = x[j] - x[i], dy = y[j] - y[i]
      const d2 = dx * dx + dy * dy
      if (d2 < range2) {
        avx += vx[j]; avy += vy[j]; cx += x[j]; cy += y[j]; near++
        if (d2 < sepR2 && d2 > 0) { sx -= dx; sy -= dy; sc++ }
      }
    }
    nn[i] = near
    let stx = 0, sty = 0
    if (near > 0) {
      stx += (avx / near - vx[i]) * ali * 0.08
      sty += (avy / near - vy[i]) * ali * 0.08
      stx += (cx / near - x[i]) * coh * 0.005
      sty += (cy / near - y[i]) * coh * 0.005
    }
    if (sc > 0) { stx += sx * sep * 0.05; sty += sy * sep * 0.05 }
    nvx[i] = vx[i] + stx; nvy[i] = vy[i] + sty
  }
  const frame = blankFrame(W, H)
  for (let i = 0; i < n; i++) {
    const sp = Math.hypot(nvx[i], nvy[i]) || 1
    const dirx = nvx[i] / sp, diry = nvy[i] / sp
    vx[i] = dirx * maxSpeed; vy[i] = diry * maxSpeed
    x[i] = (x[i] + vx[i] + W) % W; y[i] = (y[i] + vy[i] + H) % H
    const bc = colorMode === 'palette' ? samplePalette(palette, i / n)
      : colorMode === 'heading' ? hsv((Math.atan2(diry, dirx) / (Math.PI * 2) + 0.5) * 360, 1, 1)
      : colorMode === 'spectrum' ? hsv((i / n) * 360, 1, 1)
      : colorMode === 'density' ? hsv((1 - Math.min(1, nn[i] / 8)) * 0.7 * 360, 1, 1)
      : colorMode === 'position' ? hsv((x[i] / W + y[i] / H) * 0.5 * 360, 1, 1)
      : colorMode === 'cycle' ? hsv(t * 0.1 * 360, 1, 1)
      : colorMode === 'radial' ? hsv(Math.hypot(x[i] - W / 2, y[i] - H / 2) / (Math.hypot(W / 2, H / 2) || 1) * 360, 1, 1)
      : color
    const tr = bc.r >> 2, tg = bc.g >> 2, tb = bc.b >> 2
    const px = Math.floor(x[i]), py = Math.floor(y[i])
    if (px >= 0 && px < W && py >= 0 && py < H) frame[py][px] = bc
    const tx = Math.floor((x[i] - dirx + W) % W), ty = Math.floor((y[i] - diry + H) % H)
    if (tx >= 0 && tx < W && ty >= 0 && ty < H) {
      const c = frame[ty][tx]
      frame[ty][tx] = { r: Math.max(c.r, tr), g: Math.max(c.g, tg), b: Math.max(c.b, tb) }
    }
  }
  return frame
}

// Gray-Scott reaction-diffusion. Two chemicals U, V diffuse on a toroidal grid
// and react; V is coloured through a palette. Stateful — steps each frame.
function evalReactionDiffusion(nodeId: string, feed: number, kill: number, iters: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H, seed = 0): Frame {
  const N = W * H
  let s = rdState.get(nodeId)
  if (!s || s.w !== W || s.h !== H || s.seed !== seed) {
    const u = new Float32Array(N).fill(1), v = new Float32Array(N)
    // Seed a small central patch of V to kick off the reaction.
    for (let y = (H >> 1) - 2; y <= (H >> 1) + 1; y++)
      for (let x = (W >> 1) - 2; x <= (W >> 1) + 1; x++)
        if (x >= 0 && x < W && y >= 0 && y < H) { u[y * W + x] = 0.5; v[y * W + x] = 0.25 + (seed ? seededHash(seed, x, y) : worleyHash(x, y)) * 0.5 }
    s = { u, v, un: new Float32Array(N), vn: new Float32Array(N), w: W, h: H, seed }
    rdState.set(nodeId, s)
  }
  const Du = 0.16, Dv = 0.08
  for (let it = 0; it < iters; it++) {
    const { u, v, un, vn } = s
    for (let y = 0; y < H; y++) {
      const ym = ((y - 1 + H) % H) * W, yp = ((y + 1) % H) * W, yr = y * W
      for (let x = 0; x < W; x++) {
        const xm = (x - 1 + W) % W, xp = (x + 1) % W, i = yr + x
        const lapU = (u[ym + x] + u[yp + x] + u[yr + xm] + u[yr + xp]) * 0.2
          + (u[ym + xm] + u[ym + xp] + u[yp + xm] + u[yp + xp]) * 0.05 - u[i]
        const lapV = (v[ym + x] + v[yp + x] + v[yr + xm] + v[yr + xp]) * 0.2
          + (v[ym + xm] + v[ym + xp] + v[yp + xm] + v[yp + xp]) * 0.05 - v[i]
        const uvv = u[i] * v[i] * v[i]
        un[i] = Math.max(0, Math.min(1, u[i] + Du * lapU - uvv + feed * (1 - u[i])))
        vn[i] = Math.max(0, Math.min(1, v[i] + Dv * lapV + uvv - (kill + feed) * v[i]))
      }
    }
    s.u = un; s.un = u; s.v = vn; s.vn = v   // swap front/back buffers
  }
  const v = s.v
  return buildFrame(W, H, (x, y) => samplePalette(palette, v[y * W + x]))
}

// Conway's Game of Life on a toroidal grid. Live cells glow at the palette's hot
// end; dead cells fade out (trails), cooling toward the palette start. Steps at
// `speed`/sec and reseeds when it stagnates.
function evalGameOfLife(nodeId: string, palette: Palette, speed: number, fade: number, tick: number, W = DEFAULT_W, H = DEFAULT_H, seed = 0): Frame {
  const N = W * H
  const reseed = (cells: Uint8Array) => {
    for (let i = 0; i < N; i++) cells[i] = seededRandom(`${nodeId}:gol`, seed) < 0.3 ? 1 : 0
  }
  let s = golState.get(nodeId)
  if (!s || s.w !== W || s.h !== H || s.seed !== seed) {
    seededRngState.delete(`${nodeId}:gol`)
    const cells = new Uint8Array(N); reseed(cells)
    s = { cells, next: new Uint8Array(N), bright: new Float32Array(N), w: W, h: H, seed, lastStep: -1e9, stale: 0 }
    golState.set(nodeId, s)
  }
  const interval = Math.max(1, Math.round(60 / Math.max(1, Math.min(60, speed))))
  if (tick - s.lastStep >= interval) {
    const { cells, next } = s
    let pop = 0, changed = false
    for (let y = 0; y < H; y++) {
      const ym = ((y - 1 + H) % H) * W, yp = ((y + 1) % H) * W, yr = y * W
      for (let x = 0; x < W; x++) {
        const xm = (x - 1 + W) % W, xp = (x + 1) % W, i = yr + x
        const n = cells[ym + xm] + cells[ym + x] + cells[ym + xp] + cells[yr + xm]
          + cells[yr + xp] + cells[yp + xm] + cells[yp + x] + cells[yp + xp]
        const nv = cells[i] ? (n === 2 || n === 3 ? 1 : 0) : (n === 3 ? 1 : 0)
        next[i] = nv; pop += nv; if (nv !== cells[i]) changed = true
      }
    }
    s.cells = next; s.next = cells   // swap
    s.stale = (pop === 0 || !changed) ? s.stale + 1 : 0
    if (s.stale > 3) { reseed(s.cells); s.stale = 0 }
    s.lastStep = tick
  }
  const { cells, bright } = s
  const f = Math.max(0, Math.min(1, fade))
  for (let i = 0; i < N; i++) bright[i] = cells[i] ? 1 : bright[i] * f
  return buildFrame(W, H, (x, y) => {
      const b = bright[y * W + x]
      return scaleRgb(samplePalette(palette, b), b)
    })
}

const fire2012Heat = instanceState('fire2012Heat', new Map<string, Uint8Array[]>())

function evalFire2012(
  nodeId: string, cooling: number, sparking: number, palette: Palette,
  W = DEFAULT_W, H = DEFAULT_H,
  direction: FireDirection = 'up', turbulence = 1, paletteMix = 1, mirror = false, seed = 0,
): Frame {
  const P = firePrimaryLen(direction, W, H), S = fireSecondaryLen(direction, W, H)
  const stored = fire2012Heat.get(nodeId)
  let heat: Uint8Array[]
  if (!stored || stored.length !== P || stored[0].length !== S) {
    heat = Array.from({ length: P }, () => new Uint8Array(S))
    fire2012Heat.set(nodeId, heat)
  } else {
    heat = stored
  }
  const spread = Math.max(0, Math.round(turbulence))

  for (let p = 0; p < P; p++)
    for (let s = 0; s < S; s++) {
      const cool = Math.floor(fireRandom(nodeId, seed) * ((cooling * 10 / P) + 2))
      heat[p][s] = Math.max(0, heat[p][s] - cool)
    }
  // Classic two-row lookahead: row p comes from the single row p-1 (closer to
  // the base) plus a `turbulence`-wide sideways window at p-2 (spread=1
  // reproduces the original fixed 4-sample kernel exactly).
  for (let p = P - 1; p >= 2; p--) {
    for (let s = 0; s < S; s++) {
      let sum = heat[p - 1][s]
      for (let ds = -spread; ds <= spread; ds++) sum += heat[p - 2][Math.max(0, Math.min(S - 1, s + ds))]
      heat[p][s] = Math.floor(sum / (spread * 2 + 2))
    }
  }
  for (let s = 0; s < S; s++)
    if (fireRandom(nodeId, seed) * 255 < sparking)
      heat[0][s] = Math.min(255, heat[0][s] + Math.floor(fireRandom(nodeId, seed) * 95) + 160)

  // Heat (0–255) indexes the palette; the default 'heat' palette reproduces the
  // classic FastLED HeatColors fire ramp. `paletteMix` blends toward plain
  // heat-brightness grayscale, same convention as Fire above.
  const mix = Math.max(0, Math.min(1, paletteMix))
  const frame = allocFrame(W, H)
  for (let p = 0; p < P; p++) {
    for (let s = 0; s < S; s++) {
      const [x, y] = fireToXY(direction, p, s, W, H)
      const h = heat[p][s]
      const c = samplePalette(palette, h / 255)
      const px = frame[y][x]
      if (mix >= 1) { px.r = c.r; px.g = c.g; px.b = c.b }
      else {
        px.r = Math.round(h * (1 - mix) + c.r * mix)
        px.g = Math.round(h * (1 - mix) + c.g * mix)
        px.b = Math.round(h * (1 - mix) + c.b * mix)
      }
    }
  }
  return mirror ? fireMirror(frame, direction, W, H) : frame
}

export const SIMULATIONS_EVALUATORS: NodeEvaluators = {
  Fire({ num, pal, W, H, stateKey }, id, props) {
    const intensity = num(id, 'intensity', props, 'intensity', 0.7)
    const cooling = num(id, 'cooling', props, 'cooling', 55)
    const sparking = num(id, 'sparking', props, 'sparking', 120)
    const palette = pal(id, 'paletteIn', props, 'palette', 'fire')
    const direction = (String(props.direction ?? 'up')) as FireDirection
    const turbulence = Math.max(0, Math.min(2, num(id, 'turbulence', props, 'turbulence', 1)))
    const paletteMix = Math.max(0, Math.min(1, num(id, 'paletteMix', props, 'paletteMix', 1)))
    const mirror = Boolean(props.mirror)
    const seed = Math.max(0, Math.round(Number(props.seed ?? 0)))
    return { frame: evalFire(stateKey(id), intensity, cooling, sparking, palette, W, H, direction, turbulence, paletteMix, mirror, seed) }
  },
  Particles({ num, pal, t, W, H, stateKey }, id, props) {
    const mode = String(props.particleType ?? 'fountain')
    const rate = num(id, 'rate', props, 'rate', 0.3)
    const decay = num(id, 'decay', props, 'decay', 0.92)
    const palette = pal(id, 'paletteIn', props, 'palette', 'party')
    /*
     * Each knob is bounded to the domain its own slider declares, and to
     * the same bounds the generator emits. Only the floors were applied
     * before, which cost nothing while a bounded slider was the only
     * source; a wire has no ceiling of its own.
     *
     * `count` stays a property — the swarm variant sizes its pool from it,
     * so the firmware has to know it when the array is declared.
     */
    const opts: ParticleOpts = {
      size: Math.max(0.25, Math.min(3, num(id, 'size', props, 'size', 1))),
      count: Math.max(2, Number(props.count ?? 24)),
      spread: Math.max(0, Math.min(2, num(id, 'spread', props, 'spread', 1))),
      gravity: Math.max(0, Math.min(3, num(id, 'gravity', props, 'gravity', 1))),
      bounce: Math.max(0, Math.min(1.5, num(id, 'bounce', props, 'bounce', 1))),
    }
    return { frame: evalParticles(stateKey(id), mode, rate, palette, decay, t, W, H, opts, normalizedSeed(props.seed)) }
  },
  // Curated stateful point/trajectory generators (phyllotaxis/Lissajous/
  // rose paths/logistic map/de Jong attractor) — see
  // docs/development/design/formula-pattern-nodes.md. Every numeric knob
  // reads wire-then-property; the two selects are baked by the generator
  // and so stay properties.
  FormulaPoints({ num, pal, t, W, H, stateKey }, id, props) {
    const fp: FormulaPointsParams = {
      formulaType: String(props.formulaType ?? 'phyllotaxis'),
      speed: num(id, 'speed', props, 'speed', 0.3),
      dotSize: num(id, 'dotSize', props, 'dotSize', 1),
      palette: pal(id, 'paletteIn', props, 'palette', 'rainbow'),
      count: num(id, 'count', props, 'count', 60),
      persistence: num(id, 'persistence', props, 'persistence', 0.85),
      freqA: num(id, 'freqA', props, 'freqA', 3),
      freqB: num(id, 'freqB', props, 'freqB', 2),
      petals: num(id, 'petals', props, 'petals', 5),
      chaos: num(id, 'chaos', props, 'chaos', 3.8),
      preset: String(props.preset ?? 'classic'),
    }
    return { frame: evalFormulaPoints(stateKey(id), fp, t, W, H) }
  },
  FlowField({ num, pal, t, W, H, stateKey }, id, props) {
    const speed = denormRate(num(id, 'speed', props, 'speed', 0.67), SPEED_MAX.FlowField)
    const scale = denormRate(num(id, 'scale', props, 'scale', 0.08), SCALE_MAX.FlowField)
    const count = num(id, 'count', props, 'count', 80)
    const fade = num(id, 'fade', props, 'fade', 0.9)
    const palette = pal(id, 'paletteIn', props, 'palette', 'ocean')
    return { frame: evalFlowField(stateKey(id), speed, scale, count, fade, t, palette, W, H, normalizedSeed(props.seed)) }
  },
  Starfield({ num, pal, W, H, stateKey }, id, props) {
    const speed = denormRate(num(id, 'speed', props, 'speed', 0.33), SPEED_MAX.Starfield)
    const count = num(id, 'count', props, 'count', 60)
    const palette = pal(id, 'paletteIn', props, 'palette', 'ice')
    return { frame: evalStarfield(stateKey(id), speed, count, palette, W, H, normalizedSeed(props.seed)) }
  },
  Boids({ input, num, pal, t, W, H, stateKey }, id, props) {
    const speed = denormRate(num(id, 'speed', props, 'speed', 0.5), SPEED_MAX.Boids)
    const count = num(id, 'count', props, 'count', 24)
    const sep = num(id, 'separation', props, 'separation', 0.6)
    const ali = num(id, 'alignment', props, 'alignment', 0.5)
    const coh = num(id, 'cohesion', props, 'cohesion', 0.4)
    const range = num(id, 'visualRange', props, 'visualRange', 4)
    const colorMode = String(props.colorMode ?? 'solid')
    const colorIn = input(id, 'color', null) as RGB | null
    const color = colorIn ?? {
      r: byte(num(id, 'r', props, 'r', 120)  / 255),
      g: byte(num(id, 'g', props, 'g', 200)  / 255),
      b: byte(num(id, 'b', props, 'b', 255)  / 255),
    }
    const palette = pal(id, 'paletteIn', props, 'palette', 'rainbow')
    return { frame: evalBoids(stateKey(id), speed, count, sep, ali, coh, range, color, palette, colorMode, t, W, H, normalizedSeed(props.seed)) }
  },
  ReactionDiffusion({ num, pal, W, H, stateKey }, id, props) {
    const feed  = num(id, 'feed', props, 'feed', 0.055)
    const kill  = num(id, 'kill', props, 'kill', 0.062)
    const iters = Math.max(1, Math.min(20, Math.floor(num(id, 'speed', props, 'speed', 8))))
    const palette = pal(id, 'paletteIn', props, 'palette', 'ocean')
    return { frame: evalReactionDiffusion(stateKey(id), feed, kill, iters, palette, W, H, normalizedSeed(props.seed)) }
  },
  GameOfLife({ num, pal, tick, W, H, stateKey }, id, props) {
    const palette = pal(id, 'paletteIn', props, 'palette', 'mojito')
    const speed = num(id, 'speed', props, 'speed', 8)
    const fade = num(id, 'fade', props, 'fade', 0.75)
    return { frame: evalGameOfLife(stateKey(id), palette, speed, fade, tick, W, H, normalizedSeed(props.seed)) }
  },
  Fire2012({ num, pal, W, H, stateKey }, id, props) {
    const cooling  = num(id, 'cooling', props, 'cooling', 55)
    const sparking = num(id, 'sparking', props, 'sparking', 120)
    const palette = pal(id, 'paletteIn', props, 'palette', 'heat')
    const direction = (String(props.direction ?? 'up')) as FireDirection
    const turbulence = Math.max(0, Math.min(2, num(id, 'turbulence', props, 'turbulence', 1)))
    const paletteMix = Math.max(0, Math.min(1, num(id, 'paletteMix', props, 'paletteMix', 1)))
    const mirror = Boolean(props.mirror)
    const seed = Math.max(0, Math.round(Number(props.seed ?? 0)))
    return { frame: evalFire2012(stateKey(id), cooling, sparking, palette, W, H, direction, turbulence, paletteMix, mirror, seed) }
  },
}
