import { normalizeButtonEdgeSettings, blankButtonEdgeState, buttonEdge } from '../../state/transportBridge'
import { type StudioNode, useGraphStore } from '../../state/graphStore'
import { songInfoOutputs, blankSongInfo, resolveSongInfo } from '../../state/songInfo'
import {
  type PatternSlideshowOrder,
  slideshowSettings,
  advanceSlideshowSilenceFade,
} from '../../state/patternSlideshow'
import { isDisplaySignal, type DisplaySignal } from '../../state/displaySignal'
import {
  type PatternSelectionState,
  type PatternCursor,
  patternSelectionView,
  blankPatternSelection,
  blankPatternCursor,
  updatePatternSelection,
  reconcilePatternCursor,
  encoderSteps,
  type PatternSelectValue,
  blankPatternSelectValue,
} from '../../state/patternSelection'
import { hexToRgb } from '../../state/polinePalette'
import { type Frame, type RGB, hsv } from '../../state/ledColor'
import { usePlayerTransport } from '../../state/playerTransport'
import { playerControlActionRepeats, playerControlActionPortsFor } from '../../state/playerControlAssignments'
import { clamp01, DEFAULT_W, DEFAULT_H, buildFrame, blankFrame, cloneFrame } from '../../state/evaluator/frames'
import { seededRandom, seededRngState, normalizedSeed } from '../../state/evaluator/random'
import {
  blankPlayerControls,
  playerControlsState,
  toggleTapPress,
  isPlayerControls,
  isAudioSignal,
  isPlayerParticles,
} from '../../state/evaluator/signals'
import type {
  PlayerControls,
  PortValue,
  GroupRegistry,
  AudioOverride,
  AudioSignal,
  PlayerParticles,
  NodeEvaluators, EvaluateGraph,
} from '../../state/evaluator/types'
import { instanceState } from '../../state/evaluator/memory'

const patternShowState = instanceState('patternShowState', new Map<string, ShowState>())
const patternSlideshowFadeState = instanceState('patternSlideshowFadeState', new Map<string, { level: number; lastT: number }>())

/** One selection per Music Player. The player owns which pattern is playing;
 *  a panel reads it and decides nothing. */
const patternSelectionState = instanceState('patternSelectionState', new Map<string, PatternSelectionState>())
interface MusicPlayerRuntimeState {
  ledEnabled: boolean
  brightness: number
  volume: number
  controls: PlayerControls
}
const musicPlayerRuntimeState = instanceState('musicPlayerRuntimeState', new Map<string, MusicPlayerRuntimeState>())

/**
 * Fold a control bundle into the engine's own transport, lamp and volume.
 *
 * Shared by the two nodes that hold a track — Music Player and Performance
 * Generator — because a press means one thing to a player and the firmware
 * behind both is the same SD player sketch. A transport command leaves through
 * the preview player (it owns the `<audio>` element either way); the lamp and
 * the level stay here, where the node that reads them can apply them.
 */
function applyPlayerTransportControls(
  key: string, controls: PlayerControls,
): MusicPlayerRuntimeState {
  const existing = musicPlayerRuntimeState.get(key)
  const previousVolume = existing?.volume
  const runtime = existing ?? {
    ledEnabled: true,
    brightness: controls.brightness ?? 1,
    volume: controls.volume ?? 1,
    controls,
  }
  if (controls.volume != null) runtime.volume = controls.volume
  runtime.volume = clamp01(runtime.volume + controls.volumeDelta)
  if (controls.brightness != null) runtime.brightness = controls.brightness
  runtime.brightness = clamp01(runtime.brightness + controls.brightnessDelta)
  if (controls.ledToggle) runtime.ledEnabled = !runtime.ledEnabled
  runtime.controls = controls
  musicPlayerRuntimeState.set(key, runtime)

  const volumeChanged = (controls.volume != null || controls.volumeDelta !== 0)
    && (previousVolume == null || Math.abs(previousVolume - runtime.volume) > 1e-6)
  if (controls.playPause || controls.previous || controls.next || volumeChanged) {
    usePlayerTransport.getState().dispatchControls({
      sourceId: key,
      playPause: controls.playPause,
      previous: controls.previous,
      next: controls.next,
      ...(volumeChanged ? { volume: runtime.volume } : {}),
    })
  }
  return runtime
}

function combinePlayerControls(base: PlayerControls, direct: PlayerControls | null): PlayerControls {
  if (!direct) return base
  const controls: PlayerControls = {
    playPause: base.playPause || direct.playPause,
    previous: base.previous || direct.previous,
    next: base.next || direct.next,
    volumeDelta: base.volumeDelta + direct.volumeDelta,
    ledToggle: base.ledToggle || direct.ledToggle,
    brightnessDelta: base.brightnessDelta + direct.brightnessDelta,
    patternSteps: base.patternSteps + direct.patternSteps,
    patternConfirm: base.patternConfirm || direct.patternConfirm,
  }
  if (base.volume != null) controls.volume = base.volume
  if (direct.volume != null) controls.volume = direct.volume
  if (base.brightness != null) controls.brightness = base.brightness
  if (direct.brightness != null) controls.brightness = direct.brightness
  if (base.speed != null) controls.speed = base.speed
  if (direct.speed != null) controls.speed = direct.speed
  return controls
}

function directPlayerActionControls(
  ownerId: string,
  key: string,
  ports: readonly { id: string }[],
  t: number,
  incoming: ReadonlyMap<string, { srcId: string; srcPort: string }>,
  input: (nodeId: string, port: string, fallback: PortValue) => PortValue,
  nodeMap: ReadonlyMap<string, StudioNode>,
): PlayerControls | null {
  const active = ports.filter((port) => incoming.has(`${ownerId}:${port.id}`)).map((port) => port.id)
  if (active.length === 0) return null
  const controls = blankPlayerControls()
  const directKey = key
  const nowMs = t * 1000
  let state = playerControlsState.get(directKey)
  if (!state || t < state.lastT) state = { lastT: t, buttons: {} }
  state.lastT = t
  const edgeSettings = normalizeButtonEdgeSettings({})
  const pressed = (port: string): boolean => {
    const wire = incoming.get(`${ownerId}:${port}`)
    if (!wire) return false
    const tap = toggleTapPress(`${directKey}:${port}`, wire, nodeMap)
    if (tap !== null) return tap
    const raw = Boolean(input(ownerId, port, false))
    const source = nodeMap.get(wire.srcId)
    if (source?.data.nodeType === 'TouchInput' && wire.srcPort === port) return raw
    let bs = state!.buttons[port]
    if (!bs) {
      bs = blankButtonEdgeState(nowMs)
      state!.buttons[port] = bs
    }
    return buttonEdge(bs, raw, nowMs, playerControlActionRepeats(port), edgeSettings)
  }
  if (active.includes('playPause')) controls.playPause = pressed('playPause')
  if (active.includes('previous')) controls.previous = pressed('previous')
  if (active.includes('next')) controls.next = pressed('next')
  if (active.includes('ledToggle')) controls.ledToggle = pressed('ledToggle')
  if (active.includes('volumeUp')) controls.volumeDelta += pressed('volumeUp') ? 0.05 : 0
  if (active.includes('volumeDown')) controls.volumeDelta -= pressed('volumeDown') ? 0.05 : 0
  if (active.includes('brightnessUp')) controls.brightnessDelta += pressed('brightnessUp') ? 0.05 : 0
  if (active.includes('brightnessDown')) controls.brightnessDelta -= pressed('brightnessDown') ? 0.05 : 0
  if (active.includes('patternNext')) controls.patternSteps += pressed('patternNext') ? 1 : 0
  if (active.includes('patternPrevious')) controls.patternSteps -= pressed('patternPrevious') ? 1 : 0
  if (active.includes('patternConfirm')) controls.patternConfirm = pressed('patternConfirm')
  playerControlsState.set(directKey, state)
  return controls
}

/** The bundle a `controls` port carries, or an all-idle one when unwired. */
const IDLE_PLAYER_CONTROLS: PlayerControls = {
  playPause: false, previous: false, next: false, volumeDelta: 0,
  ledToggle: false, brightnessDelta: 0, patternSteps: 0, patternConfirm: false,
}

function evalWipe(a: Frame, b: Frame, tt: number, direction: string, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return buildFrame(W, H, (x, y) => {
      let revealed: boolean
      switch (direction) {
        case 'left':  revealed = x > W * (1 - tt); break
        case 'up':    revealed = y > H * (1 - tt); break
        case 'down':  revealed = y < H * tt;       break
        default:      revealed = x < W * tt;       break // 'right'
      }
      return revealed ? { ...b[y][x] } : { ...a[y][x] }
    })
}

function evalDissolve(a: Frame, b: Frame, tt: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return buildFrame(W, H, (x, y) => {
      const hash = (((x * 1664525 + y * 1013904223) >>> 0) / 0xffffffff)
      return hash < tt ? { ...b[y][x] } : { ...a[y][x] }
    })
}

// ── Extra transition variants (bundled into the `Transition` node) ───────────
// All blend frame A→B by `tt` (0–1); keep in sync with cppGenerator's
// `Transition` case.

function evalIris(a: Frame, b: Frame, tt: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const cx = W / 2, cy = H / 2
  const r = tt * Math.hypot(cx, cy)
  return buildFrame(W, H, (x, y) => Math.hypot(x - cx, y - cy) < r ? { ...b[y][x] } : { ...a[y][x] })
}

function evalClockWipe(a: Frame, b: Frame, tt: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const cx = W / 2, cy = H / 2
  return buildFrame(W, H, (x, y) => {
      // atan2 shifted so 12 o'clock = 0 and the sweep goes clockwise
      const norm = (Math.atan2(x - cx, -(y - cy)) + Math.PI) / (2 * Math.PI)
      return norm < tt ? { ...b[y][x] } : { ...a[y][x] }
    })
}

function evalPush(a: Frame, b: Frame, tt: number, direction: string, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return buildFrame(W, H, (x, y) => {
      let ax: number, ay: number, bx: number, by: number
      switch (direction) {
        case 'left':
          ax = Math.round(x - tt * W); ay = y; bx = Math.round(x + (1 - tt) * W); by = y; break
        case 'up':
          ax = x; ay = Math.round(y - tt * H); bx = x; by = Math.round(y + (1 - tt) * H); break
        case 'down':
          ax = x; ay = Math.round(y + tt * H); bx = x; by = Math.round(y - (1 - tt) * H); break
        default: // 'right'
          ax = Math.round(x + tt * W); ay = y; bx = Math.round(x - (1 - tt) * W); by = y
      }
      if (bx >= 0 && bx < W && by >= 0 && by < H) return { ...b[by][bx] }
      if (ax >= 0 && ax < W && ay >= 0 && ay < H) return { ...a[ay][ax] }
      return { r: 0, g: 0, b: 0 }
    })
}

function evalCheckerboard(a: Frame, b: Frame, tt: number, tileSize: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return buildFrame(W, H, (x, y) => {
      const isEven = (Math.floor(x / tileSize) + Math.floor(y / tileSize)) % 2 === 0
      const threshold = isEven ? tt * 2 : tt * 2 - 1
      return threshold >= 1 ? { ...b[y][x] } : { ...a[y][x] }
    })
}

function evalDiagonal(a: Frame, b: Frame, tt: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return buildFrame(W, H, (x, y) => (x / W + y / H) / 2 < tt ? { ...b[y][x] } : { ...a[y][x] })
}

function evalFadeThroughBlack(a: Frame, b: Frame, tt: number): Frame {
  const [src, alpha] = tt < 0.5 ? [a, 1 - tt * 2] : [b, (tt - 0.5) * 2]
  return buildFrame(src[0]?.length ?? 0, src.length, (x, y) => {
    const px = src[y][x]
    return { r: Math.round(px.r * alpha), g: Math.round(px.g * alpha), b: Math.round(px.b * alpha) }
  })
}

function evalFadeThroughWhite(a: Frame, b: Frame, tt: number): Frame {
  const [src, alpha] = tt < 0.5 ? [a, 1 - tt * 2] : [b, (tt - 0.5) * 2]
  const w = (1 - alpha) * 255
  return buildFrame(src[0]?.length ?? 0, src.length, (x, y) => {
    const px = src[y][x]
    return { r: Math.round(px.r * alpha + w), g: Math.round(px.g * alpha + w), b: Math.round(px.b * alpha + w) }
  })
}

function evalBlinds(a: Frame, b: Frame, tt: number, count: number, axis: string, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const slatSize = Math.max(1, Math.floor((axis === 'horizontal' ? H : W) / count))
  return buildFrame(W, H, (x, y) => {
      const pos = axis === 'horizontal' ? y : x
      return (pos % slatSize) / slatSize < tt ? { ...b[y][x] } : { ...a[y][x] }
    })
}

function evalRippleWipe(a: Frame, b: Frame, tt: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const cx = W / 2, cy = H / 2, maxR = Math.hypot(cx, cy), edge = 0.08
  return buildFrame(W, H, (x, y) => {
      const norm = Math.hypot(x - cx, y - cy) / maxR
      if (norm < tt - edge) return { ...b[y][x] }
      if (norm >= tt) return { ...a[y][x] }
      const blend = (tt - norm) / edge, pa = a[y][x], pb = b[y][x]
      return {
        r: Math.round(pa.r * (1 - blend) + pb.r * blend),
        g: Math.round(pa.g * (1 - blend) + pb.g * blend),
        b: Math.round(pa.b * (1 - blend) + pb.b * blend),
      }
    })
}

function evalSpiralWipe(a: Frame, b: Frame, tt: number, turns: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const cx = W / 2, cy = H / 2, maxR = Math.hypot(cx, cy)
  return buildFrame(W, H, (x, y) => {
      const r = Math.hypot(x - cx, y - cy) / maxR
      const normAngle = (Math.atan2(y - cy, x - cx) + Math.PI) / (2 * Math.PI)
      return (r + normAngle / turns) / (1 + 1 / turns) < tt ? { ...b[y][x] } : { ...a[y][x] }
    })
}

function evalCurtain(a: Frame, b: Frame, tt: number, axis: string, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return buildFrame(W, H, (x, y) => {
      // distance from the centre axis: reveals the centre gap first
      const dist = axis === 'horizontal' ? Math.abs(2 * y / H - 1) : Math.abs(2 * x / W - 1)
      return dist < tt ? { ...b[y][x] } : { ...a[y][x] }
    })
}

function evalScanLines(a: Frame, b: Frame, tt: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return buildFrame(W, H, (x, y) => {
    // even rows complete in [0, 0.5), odd rows in [0.5, 1.0)
    const threshold = y % 2 === 0 ? (y / H) * 0.5 : 0.5 + ((y - 1) / H) * 0.5
    return tt > threshold ? b[y][x] : a[y][x]
  })
}

function evalZoom(a: Frame, b: Frame, tt: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const cx = W / 2, cy = H / 2
  return buildFrame(W, H, (x, y) => {
      const pa = a[y][x]
      if (tt <= 0) return { ...pa }
      if (tt >= 1) return { ...b[y][x] }
      const scale = Math.max(0.01, tt)
      const bx = Math.round((x - cx) / scale + cx), by = Math.round((y - cy) / scale + cy)
      if (bx >= 0 && bx < W && by >= 0 && by < H) {
        const pb = b[by][bx]
        return {
          r: Math.round(pa.r * (1 - tt) + pb.r * tt),
          g: Math.round(pa.g * (1 - tt) + pb.g * tt),
          b: Math.round(pa.b * (1 - tt) + pb.b * tt),
        }
      }
      return { r: Math.round(pa.r * (1 - tt)), g: Math.round(pa.g * (1 - tt)), b: Math.round(pa.b * (1 - tt)) }
    })
}

// ── 3D transitions ──────────────────────────────────────────────────────────
// All five work the way every other style here already does — an inverse
// per-pixel sample — with a perspective divide where `zoom` uses a linear
// scale. At LED resolution the texture is illegible either way, so what has to
// read is the silhouette: a rectangle growing out of a vanishing point, a card
// narrowing to a line, a seam sweeping across a turning cube, two panels
// swinging open, a slab tipping away. Styles that sell depth through shading
// gradients, or arbitrary multi-axis tumbles, are deliberately not here; at
// 16x16 they are indistinguishable from noise.
//
// Mirrored by cases 16-20 of TRANSITION_HELPER_CPP and by the matching arms in
// cppGenerator.ts. Every one lands exactly on A at t=0 and exactly on B at t=1
// through the geometry itself, not through the endpoint guards: the generators
// see a runtime t and cannot branch on it, so a style that only reached its
// endpoints via a guard would part company with firmware at both ends.

/** How far a receding surface dims. The limit at infinity is 1 - this. */
const TRANSITION_DEPTH_FADE = 0.55

/** Depth cue: unshaded on the screen plane (z = 1), dimmer further away.
 *  Nearer than the plane stays fully lit rather than blowing out, so a near
 *  edge overshooting the frame does not clip to white. */
function depthShade(z: number): number {
  return 1 - TRANSITION_DEPTH_FADE * (1 - 1 / Math.max(1, z))
}

/** How much a surface turned away from the viewer dims. Same floor as
 *  depthShade, so a panel that both turns and recedes reads consistently. */
function facingShade(cosPhi: number): number {
  return 1 - TRANSITION_DEPTH_FADE * (1 - Math.max(0, cosPhi))
}

function clampIndex(v: number, n: number): number {
  return v < 0 ? 0 : v >= n ? n - 1 : v
}

function shadePixel(px: RGB, k: number): RGB {
  return {
    r: Math.floor(px.r * k + 0.5),
    g: Math.floor(px.g * k + 0.5),
    b: Math.floor(px.b * k + 0.5),
  }
}

const BLACK_PIXEL: RGB = { r: 0, g: 0, b: 0 }

/**
 * Bilinear read at float pixel coordinates, with the depth shade folded into
 * the weights so each channel is quantised exactly once.
 *
 * Nearest-neighbour is what makes a warp crawl. The sample point crosses pixel
 * centres at different moments along a rotating edge, so the edge shimmers
 * frame to frame instead of moving; a scale like `zoom` gets away with it
 * because its sample points all cross together. Weighting the four neighbours
 * costs four reads and three lerps a channel and buys temporal stability,
 * which reads better in motion than a crisper single frame does — the eye
 * tracks a moving edge and forgives its softness, but not its jitter.
 *
 * Out-of-frame neighbours clamp to the edge rather than fading to black, so a
 * surface keeps a solid border instead of growing a dark fringe as it turns.
 *
 * An integral coordinate still reads exactly one pixel (the other three weigh
 * nothing), which is what keeps the endpoint-exactness rule intact.
 */
function sampleShaded(f: Frame, fx: number, fy: number, k: number, W: number, H: number): RGB {
  const x0 = Math.floor(fx), y0 = Math.floor(fy)
  const tx = fx - x0, ty = fy - y0
  const xa = clampIndex(x0, W), xb = clampIndex(x0 + 1, W)
  const ya = clampIndex(y0, H), yb = clampIndex(y0 + 1, H)
  const p00 = f[ya][xa], p10 = f[ya][xb], p01 = f[yb][xa], p11 = f[yb][xb]
  const w00 = (1 - tx) * (1 - ty) * k, w10 = tx * (1 - ty) * k
  const w01 = (1 - tx) * ty * k, w11 = tx * ty * k
  return {
    r: Math.floor(p00.r * w00 + p10.r * w10 + p01.r * w01 + p11.r * w11 + 0.5),
    g: Math.floor(p00.g * w00 + p10.g * w10 + p01.g * w01 + p11.g * w11 + 0.5),
    b: Math.floor(p00.b * w00 + p10.b * w10 + p01.b * w01 + p11.b * w11 + 0.5),
  }
}

/** The same, at a normalised texture coordinate with both axes in [-1, 1]. */
function sampleUnitShaded(f: Frame, u: number, v: number, k: number, W: number, H: number): RGB {
  return sampleShaded(f, u * (W / 2) + W / 2 - 0.5, v * (H / 2) + H / 2 - 0.5, k, W, H)
}

/** A's depth at t=1 under a dolly. Enough parallax to read; much more and the
 *  clamped edge band becomes the most prominent thing on screen, since that
 *  band is exactly what B has not covered yet. */
const DOLLY_RECEDE = 1.12

function evalDolly(a: Frame, b: Frame, tt: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const cx = W / 2, cy = H / 2
  // Depth comes from the coverage curve rather than the other way round.
  // Interpolating z directly — linearly or geometrically — is what a camera
  // closing at constant speed does, and it reads badly: screen size goes as
  // 1/z, so B stays a dot for most of the transition and then snaps. Choosing
  // an eased coverage and inverting it keeps a real perspective divide, and so
  // a real depth cue, while the growth stays visible throughout. It also starts
  // sub-pixel on a panel of any width for free, which a fixed far plane does
  // not: at 24 a 64-wide panel pops in a five-pixel slab at t=0.
  const za = Math.pow(DOLLY_RECEDE, tt)
  const zb = 1 / Math.max(1e-4, tt * tt)
  const shadeA = depthShade(za), shadeB = depthShade(zb)
  return buildFrame(W, H, (x, y) => {
      if (tt <= 0) return { ...a[y][x] }
      if (tt >= 1) return { ...b[y][x] }
      const ox = x + 0.5 - cx, oy = y + 0.5 - cy
      // B occludes A wherever it lands in bounds: its in-bounds region is a
      // centred rectangle growing from nothing to the full frame, which is the
      // whole read at this size.
      // The visible rectangle of B is exactly where a nearest read would have
      // landed in bounds, so bilinear softens its edge without moving it.
      const fbx = ox * zb + cx - 0.5, fby = oy * zb + cy - 0.5
      if (fbx >= -0.5 && fbx < W - 0.5 && fby >= -0.5 && fby < H - 0.5) {
        return sampleShaded(b, fbx, fby, shadeB, W, H)
      }
      // A recedes with its edge pixels extended rather than opening a black
      // border. The border is what stays visible longest while B covers the
      // middle, so a smear there reads better than a frame of black.
      return sampleShaded(a, ox * za + cx - 0.5, oy * za + cy - 0.5, shadeA, W, H)
    })
}

/** Camera distance and focal length in one: equal means t=0 is the identity
 *  map, and 3 keeps the near edge inside the frame through the whole turn. */
const FLIP_DEPTH = 3

function evalFlip(a: Frame, b: Frame, tt: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const cx = W / 2, cy = H / 2
  const theta = tt * Math.PI
  const ct = Math.cos(theta), sn = Math.sin(theta)
  // Past a quarter turn the card shows its back, which is B. Reading B mirrored
  // is what lands on B itself at t=1 rather than on B flipped.
  const back = tt >= 0.5
  const src = back ? b : a
  return buildFrame(W, H, (x, y) => {
      if (tt <= 0) return { ...a[y][x] }
      if (tt >= 1) return { ...b[y][x] }
      const sx = (x + 0.5 - cx) / cx, sy = (y + 0.5 - cy) / cy
      const den = FLIP_DEPTH * ct - sx * sn
      // Edge-on: the card is a line, so the frame is empty. Also the one place
      // the inverse map has no solution, so the guard is needed either way.
      if (Math.abs(den) < 1e-4) return BLACK_PIXEL
      const u = sx * FLIP_DEPTH / den
      if (u < -1 || u > 1) return BLACK_PIXEL
      const z = FLIP_DEPTH + u * sn
      if (z < 0.05) return BLACK_PIXEL
      const v = sy * z / FLIP_DEPTH
      if (v < -1 || v > 1) return BLACK_PIXEL
      return sampleUnitShaded(src, back ? -u : u, v, depthShade(z / FLIP_DEPTH), W, H)
    })
}

/** Cube of half-size 1 centred at CUBE_DEPTH, focal length CUBE_DEPTH - 1 so
 *  the face on the screen plane projects 1:1. That one choice makes both ends
 *  of the quarter turn exact: A's front face at t=0 and B's side face at t=1
 *  are each at that distance, so each maps onto the frame identically. */
const CUBE_DEPTH = 3
const CUBE_FOCAL = CUBE_DEPTH - 1

function evalCube(a: Frame, b: Frame, tt: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const cx = W / 2, cy = H / 2
  const theta = tt * Math.PI / 2
  const ct = Math.cos(theta), sn = Math.sin(theta)
  const D = CUBE_DEPTH, f = CUBE_FOCAL
  return buildFrame(W, H, (x, y) => {
      if (tt <= 0) return { ...a[y][x] }
      if (tt >= 1) return { ...b[y][x] }
      const sx = (x + 0.5 - cx) / cx, sy = (y + 0.5 - cy) / cy
      let face = -1, fu = 0, fv = 0, fz = 0
      // Front face carries A; the side face rotating into view carries B. Both
      // inverse maps can be in range at once, so the nearer one wins — which is
      // what draws the seam at all.
      const denA = f * ct + sx * sn
      if (Math.abs(denA) >= 1e-4) {
        const u = (sx * (D - ct) + f * sn) / denA
        const z = D - u * sn - ct
        const v = sy * z / f
        if (u >= -1 && u <= 1 && v >= -1 && v <= 1 && z > 0.05) { face = 0; fu = u; fv = v; fz = z }
      }
      const denB = f * sn - sx * ct
      if (Math.abs(denB) >= 1e-4) {
        const u = (sx * (D - sn) - f * ct) / denB
        const z = D - sn + u * ct
        const v = sy * z / f
        if (u >= -1 && u <= 1 && v >= -1 && v <= 1 && z > 0.05 && (face < 0 || z < fz)) {
          face = 1; fu = u; fv = v; fz = z
        }
      }
      if (face < 0) return BLACK_PIXEL
      return sampleUnitShaded(face === 0 ? a : b, fu, fv, depthShade(fz / f), W, H)
    })
}

/** Two panels of A hinged at the frame edges, swinging toward the viewer to
 *  uncover B. Depth equals focal length, so a closed door is the identity. */
const DOOR_DEPTH = 3

function evalDoor(a: Frame, b: Frame, tt: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const cx = W / 2, cy = H / 2
  const phi = tt * Math.PI / 2
  const ct = Math.cos(phi), sn = Math.sin(phi)
  const D = DOOR_DEPTH, f = DOOR_DEPTH
  const panelShade = facingShade(ct)
  // B sits behind the doors and comes into the light as they open, reaching
  // full brightness exactly as they leave the frame.
  const backShade = 0.5 + 0.5 * sn
  return buildFrame(W, H, (x, y) => {
      if (tt <= 0) return { ...a[y][x] }
      if (tt >= 1) return { ...b[y][x] }
      const sx = (x + 0.5 - cx) / cx, sy = (y + 0.5 - cy) / cy
      // s is the distance from the hinge along the panel, so 0..1 is on-panel
      // and anything else is past its free edge.
      const denL = f * ct + sx * sn
      if (Math.abs(denL) >= 1e-4) {
        const s = (sx * D + f) / denL
        if (s >= 0 && s <= 1) {
          const z = D - s * sn
          const v = sy * z / f
          if (v >= -1 && v <= 1 && z > 0.05) return sampleUnitShaded(a, s - 1, v, panelShade, W, H)
        }
      }
      const denR = sx * sn - f * ct
      if (Math.abs(denR) >= 1e-4) {
        const s = (sx * D - f) / denR
        if (s >= 0 && s <= 1) {
          const z = D - s * sn
          const v = sy * z / f
          if (v >= -1 && v <= 1 && z > 0.05) return sampleUnitShaded(a, 1 - s, v, panelShade, W, H)
        }
      }
      return shadePixel(b[y][x], backShade)
    })
}

/** A tips away about its bottom edge while B slides down over it. The hinge
 *  goes at the bottom so that the end of A which travels — its top — recedes
 *  into exactly the space B is arriving from; hinged at the top instead, A
 *  lifts off the bottom of the frame and opens a black band there that B does
 *  not reach until the last moment. A hinge line never moves at all, so a
 *  tipping slab can never clear the frame on its own: B arriving in front is
 *  what makes the ending exact rather than a residual strip. */
const TILT_DEPTH = 3
/** Just past 80 degrees: far enough that the slab reads as lying down. */
const TILT_MAX_ANGLE = 1.4
/** B's start, in frame half-heights above the top edge. Far enough up that none
 *  of it shows at t=0 even after its approach magnifies it. */
const TILT_SLIDE = 2.6
/** Extra depth B closes over the slide, so it grows slightly as it lands. */
const TILT_APPROACH = 0.8

function evalTilt(a: Frame, b: Frame, tt: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const cx = W / 2, cy = H / 2
  const phi = tt * TILT_MAX_ANGLE
  const ct = Math.cos(phi), sn = Math.sin(phi)
  const D = TILT_DEPTH, f = TILT_DEPTH
  const zb = D + TILT_APPROACH * (1 - tt)
  const dy = -TILT_SLIDE * (1 - tt)
  const shadeB = depthShade(zb / f)
  return buildFrame(W, H, (x, y) => {
      if (tt <= 0) return { ...a[y][x] }
      if (tt >= 1) return { ...b[y][x] }
      const sx = (x + 0.5 - cx) / cx, sy = (y + 0.5 - cy) / cy
      // B is in front of the tipping slab everywhere, so it is tested first.
      const bu = sx * zb / f, bv = sy * zb / f - dy
      if (bu >= -1 && bu <= 1 && bv >= -1 && bv <= 1) {
        return sampleUnitShaded(b, bu, bv, shadeB, W, H)
      }
      // s is the distance from the bottom hinge up the slab, 0..2 across it.
      const den = f * ct + sy * sn
      if (Math.abs(den) < 1e-4) return BLACK_PIXEL
      const s = (f - sy * D) / den
      if (s < 0 || s > 2) return BLACK_PIXEL
      const z = D + s * sn
      if (z < 0.05) return BLACK_PIXEL
      const u = sx * z / f
      if (u < -1 || u > 1) return BLACK_PIXEL
      return sampleUnitShaded(a, u, 1 - s, depthShade(z / f), W, H)
    })
}

// Dispatch one of the 21 A→B transition styles (the Transition node + the
// Pattern Master both composite through this). Unknown type → crossfade.
export function compositeTransition(
  type: string, a: Frame, b: Frame, tt: number, W = DEFAULT_W, H = DEFAULT_H,
  opts: { dir?: string; axis?: string; tileSize?: number; count?: number; turns?: number } = {},
): Frame {
  const dir = opts.dir ?? 'right'
  const axis = opts.axis ?? 'horizontal'
  const tileSize = Math.max(1, Math.round(opts.tileSize ?? 4))
  const count = Math.max(1, Math.round(opts.count ?? 4))
  const turns = Math.max(1, opts.turns ?? 2)
  switch (type) {
    case 'wipe':         return evalWipe(a, b, tt, dir, W, H)
    case 'dissolve':     return evalDissolve(a, b, tt, W, H)
    case 'iris':         return evalIris(a, b, tt, W, H)
    case 'clockwipe':    return evalClockWipe(a, b, tt, W, H)
    case 'push':         return evalPush(a, b, tt, dir, W, H)
    case 'checkerboard': return evalCheckerboard(a, b, tt, tileSize, W, H)
    case 'diagonal':     return evalDiagonal(a, b, tt, W, H)
    case 'fadeblack':    return evalFadeThroughBlack(a, b, tt)
    case 'fadewhite':    return evalFadeThroughWhite(a, b, tt)
    case 'blinds':       return evalBlinds(a, b, tt, count, axis, W, H)
    case 'ripple':       return evalRippleWipe(a, b, tt, W, H)
    case 'spiral':       return evalSpiralWipe(a, b, tt, turns, W, H)
    case 'curtain':      return evalCurtain(a, b, tt, axis, W, H)
    case 'scanlines':    return evalScanLines(a, b, tt, W, H)
    case 'zoom':         return evalZoom(a, b, tt, W, H)
    case 'dolly':        return evalDolly(a, b, tt, W, H)
    case 'flip':         return evalFlip(a, b, tt, W, H)
    case 'cube':         return evalCube(a, b, tt, W, H)
    case 'door':         return evalDoor(a, b, tt, W, H)
    case 'tilt':         return evalTilt(a, b, tt, W, H)
    default:             return blendFrame(a, b, tt, W, H)   // crossfade
  }
}

interface ShowState {
  /** Which pattern is running, through the shared selection contract. */
  sel: PatternSelectionState
  /** The pattern a running transition is heading for. */
  next: PatternCursor
  /** The collection as last seen, so a reader can resolve the selection
   *  without re-deriving it from the graph. */
  ids: readonly string[]
  phase: 'hold' | 'trans'
  start: number; dwell: number; trans: string; lastBeat: boolean
  seed: number
  /** The most recent beat-triggered particle burst, if any — style/colour are
   *  rolled once when the burst starts (randomStyle/randomColor) so they stay
   *  fixed for the burst's lifetime instead of re-rolling every frame. */
  burst?: { t: number; style: number; color: RGB }
}
export interface PatternShowSelection {
  currentIndex: number
  nextIndex: number
  transitioning: boolean
  /** The pattern a browser is looking at, which is the current one unless
   *  something is browsing away from it. */
  highlightIndex: number
  browsing: boolean
}
interface ShowOpts {
  minTime: number; maxTime: number; transSec: number; pool: string[]; beatEnabled: boolean
  particles: boolean; particleStyle: number; particleColor: RGB; particleIntensity: number
  randomStyle: boolean; randomColor: boolean
  seed: number
  /**
   * How the next pattern is chosen. Absent means random, which is what the
   * generative show has always done; a Pattern Slideshow can ask for the
   * order its collection is actually in.
   */
  order?: PatternSlideshowOrder
}

/** Read the current selection of a live PatternMaster by its evaluator state key.
 *  Root-level PatternMaster nodes use their node id as the key. */
export function getPatternShowSelection(key: string): PatternShowSelection | null {
  const st = patternShowState.get(key)
  if (!st) return null
  const view = patternSelectionView(st.sel, st.ids)
  return {
    currentIndex: view.activeIndex,
    nextIndex: st.next.index,
    transitioning: st.phase === 'trans',
    highlightIndex: view.highlightIndex,
    browsing: view.browsing,
  }
}

/** Latest semantic controls consumed by a Music Player. */
export function getMusicPlayerControls(key: string): PlayerControls | null {
  return musicPlayerRuntimeState.get(key)?.controls ?? null
}

// The generative show: hold a random pattern for a random dwell in
// [minTime, maxTime], then transition (a random style from `pool`) into another
// random pattern. A wired beat advances early, once at least minTime has passed.
// `render(groupId)` rasterises a pattern's subgraph to a frame.
// ── Particle-burst overlay ────────────────────────────────────────────────────
// A burst spawns PARTICLE_COUNT short-lived colored sparks that fade out, in one
// of seventeen motion styles. The motion is a pure function of burst time + spark
// index (deterministic), so the browser preview (showPreview re-exports this) and
// the firmware (the switch in playerSketchGenerator / showGenerator) spawn the
// same sparks. Keep the three switches in sync.
export const PARTICLE_LIFE_MS = 600
export const PARTICLE_COUNT = 16
const P_TAU = Math.PI * 2

function particlePrnd(n: number): number {
  const s = Math.sin(n * 12.9898) * 43758.5453
  return s - Math.floor(s)
}

/** Additive spark overlay (0–255 per channel, pre-brightness) for a burst that
 *  started at `burstTms`, or null when outside its lifetime. `intensity` 0–1. */
export function renderParticleBurst(
  burstTms: number, timeMs: number, intensity: number, style: number, col: RGB,
  W = DEFAULT_W, H = DEFAULT_H,
): Frame | null {
  if (timeMs < burstTms || timeMs >= burstTms + PARTICLE_LIFE_MS) return null
  const ov = blankFrame(W, H)
  const ageSec = (timeMs - burstTms) / 1000
  const f = (timeMs - burstTms) / PARTICLE_LIFE_MS
  const cx = W * 0.5, cy = H * 0.5, maxR = Math.min(W, H) * 0.5
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const base = burstTms * 0.001 + i * 7.13
    const r1 = particlePrnd(base + 1), r2 = particlePrnd(base + 2), r3 = particlePrnd(base + 3), r4 = particlePrnd(base + 4)
    let x: number, y: number, bri = 1 - f
    switch (style) {
      case 1:  // rain
        x = r1 * W + (r4 - 0.5) * 2 * ageSec
        y = r2 * H * 0.5 + (4 + r3 * 6) * ageSec
        break
      case 2: {  // explode
        const a = r1 * P_TAU, sp = 2 + r2 * 6
        x = cx + Math.cos(a) * sp * ageSec; y = cy + Math.sin(a) * sp * ageSec
        break
      }
      case 3: {  // fireworks
        const a = r1 * P_TAU, sp = 3 + r2 * 5
        x = cx + (r3 - 0.5) * W * 0.3 + Math.cos(a) * sp * ageSec
        y = cy + Math.sin(a) * sp * ageSec + 4 * ageSec * ageSec
        bri = (1 - f) * (1 - f)
        break
      }
      case 4: {  // swirl
        const a = r1 * P_TAU + 6 * ageSec, rad = (0.15 + f * 0.85) * maxR
        x = cx + Math.cos(a) * rad; y = cy + Math.sin(a) * rad
        break
      }
      case 5:  // twinkle
        x = r1 * W; y = r2 * H
        bri = Math.max(0, 1 - Math.abs(f - r3) * 3)
        break
      case 6: {  // ring
        const a = r1 * P_TAU, rad = f * maxR
        x = cx + Math.cos(a) * rad; y = cy + Math.sin(a) * rad
        bri = (1 - f) * 1.25
        break
      }
      case 7:  // fountain
        x = cx + (r1 - 0.5) * 10 * ageSec
        y = H - 1 - (3 + r2 * 6) * ageSec + 5 * ageSec * ageSec
        break
      case 8: {  // helix
        const a = (i % 2) * Math.PI + r1 * 0.7 + ageSec * 9
        x = cx + Math.cos(a) * maxR * 0.55
        y = H - 1 - f * (H + 2) + (r2 - 0.5) * 2
        break
      }
      case 9:  // meteor
        x = -2 + f * (W + 6) - r1 * 5
        y = r2 * H + x * 0.35 + (r3 - 0.5) * 2
        bri = (1 - r1 * 0.7) * (1 - f * 0.5)
        break
      case 10:  // confetti
        x = r1 * W + Math.sin(ageSec * 7 + r3 * P_TAU) * 1.5
        y = (r2 * H + ageSec * (2 + r4 * 4)) % H
        bri = (1 - f) * (0.55 + 0.45 * Math.sin(ageSec * 12 + r3 * P_TAU) ** 2)
        break
      case 11:  // sparkle — fast twinkle drizzling slowly down
        x = r1 * W + (r4 - 0.5)
        y = r2 * H * 0.3 + ageSec * (2 + r3 * 3)
        bri = Math.max(0, Math.sin(ageSec * (30 + r3 * 30) + r4 * P_TAU)) * (1 - f)
        break
      case 12: {  // comet — one shared Lissajous head with a fading trail of sparks
        const trailT = ageSec - (i / PARTICLE_COUNT) * 0.4
        const tt = Math.max(0, trailT)
        x = W * 0.5 + 0.42 * (W - 1) * Math.sin(tt * 8.0)
        y = H * 0.5 + 0.42 * (H - 1) * Math.sin(tt * 5.5 + 1.3)
        bri = trailT < 0 ? 0 : (1 - f) * (1 - i / PARTICLE_COUNT)
        break
      }
      case 13:  // snow — slow fall with a gentle horizontal sway
        x = r1 * W + Math.sin(ageSec * 1.5 + r4 * P_TAU) * 1.3
        y = r2 * H * 0.5 + ageSec * (1.2 + r3 * 1.3)
        bri = (1 - f) * (0.6 + 0.4 * r4)
        break
      case 14:  // gravity — drops from the top, accelerating as they fall
        x = r1 * W + (r4 - 0.5)
        y = r2 * H * 0.35 + 5.5 * ageSec * ageSec
        break
      case 15: {  // bubbles — buoyant rise with a wobble, popping partway up
        x = r1 * W + Math.sin(ageSec * 3 + r4 * P_TAU)
        y = (H - 1) - ageSec * (2 + r2 * 2)
        const popT = 0.3 + r3 * 0.5
        bri = f < popT ? 1 - f : 0
        break
      }
      case 16: {  // vortex — spirals inward toward the centre, spinning faster as it collapses
        const a = r1 * P_TAU + (2 + f * 10) * ageSec, rad = (1 - f * 0.85) * maxR
        x = cx + Math.cos(a) * rad; y = cy + Math.sin(a) * rad
        break
      }
      default:  // rise
        x = r1 * W + (r3 - 0.5) * 8 * ageSec
        y = r2 * H + (-(1 + r4 * 3)) * ageSec + 3 * ageSec * ageSec
        break
    }
    const xi = Math.round(x), yi = Math.round(y)
    if (xi < 0 || xi >= W || yi < 0 || yi >= H) continue
    const b = intensity * Math.max(0, Math.min(1, bri))
    const cell = ov[yi][xi]
    cell.r = Math.min(255, cell.r + col.r * b)
    cell.g = Math.min(255, cell.g + col.g * b)
    cell.b = Math.min(255, cell.b + col.b * b)
  }
  return ov
}

/**
 * Rasterise one collected pattern (a group) to a frame.
 *
 * Shared by the two nodes that run a collection — the Music Player and the
 * Pattern Slideshow — because "what a collected pattern is" must not be two
 * answers. Namespaced per pattern so stateful nodes in a reused group do not
 * clash, and the workspace's trust is passed straight through: an untrusted
 * show must not run formula or Code nodes just because they sit inside a
 * collected pattern group.
 */
interface CollectedPatternCtx {
  groups: GroupRegistry
  groupStack: ReadonlySet<string>
  instancePrefix: string
  nodeId: string
  tick: number
  /** Unscaled elapsed tick for any real-time scheduler nested in the group. */
  elapsedTick: number
  W: number
  H: number
  trusted: boolean
  capabilityNodes: readonly StudioNode[]
  audioOverride: AudioOverride | null
  /** Live audio for the patterns inside, or null when they get none. */
  audio: AudioSignal | null
  evaluateGraph: EvaluateGraph
}

function renderCollectedPattern(gid: string, ctx: CollectedPatternCtx): Frame {
  const def = ctx.groups[gid]
  if (!def || ctx.groupStack.has(gid)) return blankFrame(ctx.W, ctx.H)
  const groupInputs: Record<string, PortValue> = ctx.audio
    ? semanticAudioInputs({
        micBass: clamp01(Number(ctx.audio.bass ?? ctx.audio.micBass ?? 0)),
        micMids: clamp01(Number(ctx.audio.mids ?? ctx.audio.micMids ?? 0)),
        micTreble: clamp01(Number(ctx.audio.treble ?? ctx.audio.micTreble ?? 0)),
      })
    : {}
  if (ctx.audio) {
    for (const groupNode of def.nodes) {
      if (String(groupNode.data.nodeType ?? '') !== 'GroupInput') continue
      const paramId = String((groupNode.data.properties as { paramId?: string } | undefined)?.paramId ?? '')
      const outputType = ((groupNode.data.outputs as { dataType?: string }[] | undefined)?.[0]?.dataType) ?? ''
      if (paramId && outputType === 'audio') groupInputs[paramId] = ctx.audio
    }
  }
  return ctx.evaluateGraph(
    def.nodes, def.edges, ctx.tick, ctx.W, ctx.H, ctx.groups,
    `${ctx.instancePrefix}${ctx.nodeId}/${gid}/`,
    new Set([...ctx.groupStack, gid]), groupInputs, ctx.audioOverride,
    ctx.trusted, ctx.capabilityNodes, ctx.elapsedTick,
  ) ?? blankFrame(ctx.W, ctx.H)
}

function evalPatternShow(
  key: string, ids: string[], render: (groupId: string) => Frame,
  beat: boolean, o: ShowOpts, t: number, W = DEFAULT_W, H = DEFAULT_H,
  // The player's selection, so its own advance and a user's confirm move the
  // same cursor. Without this the show kept a private one and a confirmed
  // pattern changed only what the panel said.
  selection?: PatternSelectionState,
): Frame {
  const n = ids.length
  if (n === 0) return blankFrame(W, H)
  const sequential = o.order === 'Sequential'
  const rnd = () => seededRandom(`${key}:show`, o.seed)
  const pickDwell = () => o.minTime + rnd() * Math.max(0, o.maxTime - o.minTime)

  let st = patternShowState.get(key)
  if (!st || st.seed !== o.seed) {
    // Only a new show or a re-seeded one starts over. A collection that gained
    // or lost a pattern used to land here too, which restarted the dwell and
    // jumped to a random pattern — editing the collection of a running show
    // interrupted the show.
    seededRngState.delete(`${key}:show`)
    st = { sel: selection ?? blankPatternSelection(), next: blankPatternCursor(), ids,
           phase: 'hold', start: t, dwell: pickDwell(), trans: 'crossfade', lastBeat: beat, seed: o.seed }
    updatePatternSelection(st.sel, { ids, nowMs: t * 1000, setActive: sequential ? 0 : Math.floor(rnd() * n) })
  }

  // Every frame, because the collection can change under a running show. The
  // contract keeps playing the same pattern through a reorder and hands a
  // deleted pattern's slot to whatever took it.
  if (selection && st.sel !== selection) st.sel = selection
  updatePatternSelection(st.sel, { ids, nowMs: t * 1000 })
  reconcilePatternCursor(st.next, ids)
  st.ids = ids
  const cur = st.sel.active.index

  const beatEdge = o.beatEnabled && beat && !st.lastBeat
  st.lastBeat = beat
  // Each beat also fires a particle burst (independent of the dwell-gated
  // pattern advance), if the node has particles enabled. Style/colour are
  // rolled once here (when randomStyle/randomColor are on) so they stay fixed
  // for the whole burst instead of changing every frame.
  if (beatEdge && o.particles) {
    st.burst = {
      t: t * 1000,
      style: o.randomStyle ? Math.floor(rnd() * 17) : o.particleStyle,
      color: o.randomColor ? hsv(rnd() * 360, 1, 1) : o.particleColor,
    }
  }

  if (st.phase === 'hold' && n > 1) {
    const timeUp = t >= st.start + st.dwell
    const beatTrig = beatEdge && t >= st.start + o.minTime
    if (timeUp || beatTrig) {
      // Sequential walks the collection in the order it was arranged; random
      // picks uniformly from everything except what is already showing.
      const target = sequential ? (cur + 1) % n : (cur + 1 + Math.floor(rnd() * (n - 1))) % n
      st.next.index = target
      st.next.id = ids[target]
      st.trans = o.pool.length ? o.pool[Math.floor(rnd() * o.pool.length)] : 'crossfade'
      st.phase = 'trans'
      st.start = t
    }
  }

  let frame: Frame
  if (st.phase === 'trans') {
    const prog = o.transSec <= 0 ? 1 : Math.min(1, (t - st.start) / o.transSec)
    frame = compositeTransition(st.trans, render(ids[cur]), render(ids[st.next.index]), prog, W, H)
    if (prog >= 1) {
      // The show's own advance goes through the contract, so a display naming
      // the pattern and the show playing it cannot disagree.
      updatePatternSelection(st.sel, { ids, nowMs: t * 1000, setActive: st.next.index })
      st.phase = 'hold'
      st.start = t
      st.dwell = pickDwell()
    }
  } else {
    frame = render(ids[cur])
  }

  // Overlay a beat-triggered particle burst additively (pre-brightness), the
  // same sparks the firmware spawns on _audioBeat.
  if (o.particles && st.burst != null) {
    const ov = renderParticleBurst(st.burst.t, t * 1000, o.particleIntensity, st.burst.style, st.burst.color, W, H)
    if (ov) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const s = ov[y][x], px = frame[y][x]
        px.r = Math.min(255, px.r + s.r); px.g = Math.min(255, px.g + s.g); px.b = Math.min(255, px.b + s.b)
      }
    }
  }

  patternShowState.set(key, st)
  return frame
}

/** Per-pixel linear blend of two frames, m=0 → a, m=1 → b. */
function blendFrame(a: Frame, b: Frame, m: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const k = Math.max(0, Math.min(1, m))
  return buildFrame(W, H, (x, y) => {
      const pa = a[y]?.[x] ?? { r: 0, g: 0, b: 0 }
      const pb = b[y]?.[x] ?? { r: 0, g: 0, b: 0 }
      return {
        r: Math.round(pa.r * (1 - k) + pb.r * k),
        g: Math.round(pa.g * (1 - k) + pb.g * k),
        b: Math.round(pa.b * (1 - k) + pb.b * k),
      }
    })
}

/**
 * Timeline-as-a-node: cycles through its frame inputs, holding each for
 * `interval` seconds and crossfading into the next over the trailing `fade`
 * seconds. Stateless — fully determined by `t`.
 */
function evalSequencer(frames: (Frame | null)[], interval: number, fade: number, t: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const valid = frames.filter((f): f is Frame => f !== null)
  if (valid.length === 0) return blankFrame(W, H)
  if (valid.length === 1) return valid[0]

  const iv = Math.max(0.1, interval)
  const phase = t / iv
  const idx = Math.floor(phase) % valid.length
  const into = (phase - Math.floor(phase)) * iv          // seconds into this slot
  const fadeDur = Math.max(0, Math.min(fade, iv))
  if (fadeDur <= 0 || into < iv - fadeDur) return valid[idx]

  const m = (into - (iv - fadeDur)) / fadeDur            // 0 → 1 across the fade
  return blendFrame(valid[idx], valid[(idx + 1) % valid.length], m, W, H)
}

function semanticAudioInputs(audio: Pick<AudioOverride, 'micBass' | 'micMids' | 'micTreble'>): Record<string, PortValue> {
  return {
    bass: audio.micBass,
    mids: audio.micMids,
    treble: audio.micTreble,
    kick: audio.micBass,
    snare: audio.micMids,
    hihat: audio.micTreble,
    vocals: audio.micMids,
    energy: (audio.micBass + audio.micMids + audio.micTreble) / 3,
    beat: false,
    silence: audio.micBass + audio.micMids + audio.micTreble < 0.03,
  }
}

export const SHOW_EVALUATORS: NodeEvaluators = {
  // Bundled transitions (Crossfade / Wipe / Dissolve), selected by
  // `transitionType`. All blend frame A→B by `t`; `direction` only applies to
  // wipe. Keep in sync with cppGenerator's `Transition`.
  Transition({ input, num, W, H }, id, props) {
    const fa = input(id, 'a', null) as Frame | null
    const fb = input(id, 'b', null) as Frame | null
    const tt = num(id, 't', props, 't', 0.5)
    const ca = fa ?? blankFrame(W, H)
    const cb = fb ?? blankFrame(W, H)
    return {
      frame: compositeTransition(String(props.transitionType ?? 'crossfade'), ca, cb, tt, W, H, {
        dir: String(props.direction ?? 'right'),
        axis: String(props.axis ?? 'horizontal'),
        tileSize: Number(props.tileSize ?? 4),
        count: Number(props.count ?? 4),
        turns: Number(props.turns ?? 2),
      }),
    }
  },
  ControlMap({ input, t, stateKey, incoming, nodeMap }, id, props) {
    const key = stateKey(id)
    const nowMs = t * 1000
    let state = playerControlsState.get(key)
    if (!state || t < state.lastT) state = { lastT: t, buttons: {} }
    state.lastT = t
    // The edge rules live in state/transportBridge.ts so Transport Control
    // uses the identical ones — a display's Next and a panel-mounted Next
    // must not disagree about what a press is.
    const edgeSettings = normalizeButtonEdgeSettings(props)
    const button = (port: string, repeat: boolean): boolean => {
      const tap = toggleTapPress(`${key}:${port}`, incoming.get(`${id}:${port}`), nodeMap)
      if (tap !== null) return tap
      let bs = state!.buttons[port]
      if (!bs) {
        bs = blankButtonEdgeState(nowMs)
        state!.buttons[port] = bs
      }
      return buttonEdge(bs, Boolean(input(id, port, false)), nowMs, repeat, edgeSettings)
    }

    const upstreamValue = input(id, 'controlsIn', null)
    const upstream = isPlayerControls(upstreamValue) ? upstreamValue : null
    const volumeUp = button('volumeUp', true)
    const volumeDown = button('volumeDown', true)
    const brightnessUp = button('brightnessUp', true)
    const brightnessDown = button('brightnessDown', true)
    const playPause = button('playPause', false)
    const previous = button('previous', false)
    const next = button('next', false)
    const ledToggle = button('ledToggle', false)

    // Buttons step by one; the encoder steps by however many detents it
    // turned. Both, because a panel may have three buttons and no encoder.
    let patternSteps = (button('patternNext', true) ? 1 : 0) - (button('patternPrevious', true) ? 1 : 0)
    if (incoming.has(`${id}:patternSelect`)) {
      if (!state.patternEncoder) state.patternEncoder = blankPatternSelection()
      patternSteps += encoderSteps(state.patternEncoder, Number(input(id, 'patternSelect', 0)))
    }

    const controls: PlayerControls = {
      playPause: Boolean(upstream?.playPause) || playPause,
      previous: Boolean(upstream?.previous) || previous,
      next: Boolean(upstream?.next) || next,
      volumeDelta: (upstream?.volumeDelta ?? 0)
        + (volumeUp ? Math.max(0, Number(props.volumeStep ?? 0.05)) : 0)
        - (volumeDown ? Math.max(0, Number(props.volumeStep ?? 0.05)) : 0),
      ledToggle: Boolean(upstream?.ledToggle) || ledToggle,
      brightnessDelta: (upstream?.brightnessDelta ?? 0)
        + (brightnessUp ? Math.max(0, Number(props.brightnessStep ?? 0.05)) : 0)
        - (brightnessDown ? Math.max(0, Number(props.brightnessStep ?? 0.05)) : 0),
      patternSteps: (upstream?.patternSteps ?? 0) + patternSteps,
      patternConfirm: Boolean(upstream?.patternConfirm) || button('patternConfirm', false),
    }
    if (incoming.has(`${id}:volume`)) controls.volume = clamp01(Number(input(id, 'volume', 0)))
    else if (upstream?.volume != null) controls.volume = clamp01(upstream.volume)
    if (incoming.has(`${id}:brightness`)) controls.brightness = clamp01(Number(input(id, 'brightness', 0)))
    else if (upstream?.brightness != null) controls.brightness = clamp01(upstream.brightness)
    // Absolutes all follow one rule: wired here beats wired upstream, and
    // unwired stays absent so nothing downstream is overruled by silence.
    if (incoming.has(`${id}:masterSpeed`)) controls.speed = Number(input(id, 'masterSpeed', 1))
    else if (upstream?.speed != null) controls.speed = upstream.speed
    playerControlsState.set(key, state)
    return { controls }
  },
  SongInfo({ input }, id) {
    // The same envelope a panel takes, because it already carries a whole
    // SongInfo for the player arm. Anything else plugged in — a clock, a
    // slideshow, nothing at all — reports blanks rather than the last
    // track's readings, so an unwired field reads as "no music" instead of
    // as stale music.
    const signalValue = input(id, 'display', null)
    const signal = isDisplaySignal(signalValue) ? signalValue : null
    return songInfoOutputs(signal?.kind === 'player' ? signal.song : blankSongInfo())
  },
  PlayerParticles({ input }, id, props) {
    const colorIn = input(id, 'color', null)
    return {
      particleFx: {
        enabled: Boolean(input(id, 'enabled', Boolean(props.enabled))),
        style: Math.max(0, Math.min(16, Math.round(Number(props.style ?? 0)))),
        color: colorIn && typeof colorIn === 'object' && !Array.isArray(colorIn)
          ? colorIn as RGB
          : hexToRgb(String(props.color ?? '#ff8000')),
        intensity: clamp01(Number(input(id, 'intensity', Number(props.intensity ?? 0.8)))),
        randomColor: Boolean(input(id, 'randomColor', Boolean(props.randomColor))),
        randomStyle: Boolean(input(id, 'randomStyle', Boolean(props.randomStyle))),
      } satisfies PlayerParticles,
    }
  },
  PatternMaster({ input, num, t, tick, W, H, stateKey, incoming, nodeMap, groups, groupStack, instancePrefix, audioOverride, trusted, capabilityNodes, evaluateGraph }, id, props) {
    let out: Record<string, PortValue> = {}
    const ids = (input(id, 'patternset', null) as string[] | null) ?? []
    const audioSignal = input(id, 'audio', null)
    const audio = isAudioSignal(audioSignal) ? audioSignal : null
    const beat = input(id, 'beat', false) as boolean
    const render = (gid: string): Frame => renderCollectedPattern(gid, {
      groups, groupStack, instancePrefix, nodeId: id, tick, W, H,
      elapsedTick: tick,
      trusted, capabilityNodes, audioOverride, audio, evaluateGraph,
    })
    // Transitions come from a wired TransitionSet (the same node type feeds
    // PerformanceGenerator); with nothing wired the show just crossfades.
    const wiredPool = input(id, 'transitions', null) as string[] | null
    const pool = wiredPool && wiredPool.length ? wiredPool : ['crossfade']
    const particleValue = input(id, 'particleFx', null)
    const particleFx = isPlayerParticles(particleValue) ? particleValue : null
    const o = {
      minTime: num(id, 'minTime', props, 'minTime', 4),
      maxTime: num(id, 'maxTime', props, 'maxTime', 12),
      transSec: num(id, 'transitionSec', props, 'transitionSec', 1),
      pool,
      beatEnabled: incoming.has(`${id}:beat`),
      particles: particleFx?.enabled ?? false,
      particleStyle: particleFx?.style ?? 0,
      particleColor: particleFx?.color ?? { r: 255, g: 128, b: 0 },
      particleIntensity: particleFx?.intensity ?? 0.8,
      randomStyle: particleFx?.randomStyle ?? false,
      randomColor: particleFx?.randomColor ?? false,
      seed: normalizedSeed(props.seed),
    }
    const key = stateKey(id)
    const controlsValue = input(id, 'controls', null)
    const bundleControls: PlayerControls = isPlayerControls(controlsValue)
      ? controlsValue
      : IDLE_PLAYER_CONTROLS
    let controls = combinePlayerControls(
      bundleControls,
      directPlayerActionControls(
        id, stateKey(`${id}/direct-actions`), playerControlActionPortsFor('player'),
        t, incoming, input, nodeMap,
      ),
    )
    if (incoming.has(`${id}:volume`)) {
      controls = { ...controls, volume: clamp01(num(id, 'volume', props, 'volume', 1)) }
    }
    const runtime = applyPlayerTransportControls(key, controls)

    // One selection per player. The show's own advance goes through it
    // too (inside evalPatternShow), so a confirmed pattern and a
    // dwell-driven one cannot disagree about what is running.
    let selection = patternSelectionState.get(key)
    if (!selection) {
      selection = blankPatternSelection()
      patternSelectionState.set(key, selection)
    }
    updatePatternSelection(selection, {
      ids,
      nowMs: t * 1000,
      step: controls.patternSteps,
      confirm: controls.patternConfirm,
    })

    const frame = evalPatternShow(key, ids, render, beat, o, t, W, H, selection)
    /*
     * What the browser honestly knows about the track. Tag fields stay
     * empty: the library has a filename and an analysis, not an ID3 frame,
     * and the case this feature exists for is a card of files the app has
     * never seen. Those are read by the player on the device.
     */
    const player = usePlayerTransport.getState()
    // A show owns the player when one is selected; otherwise the preview
    // is playing its own playlist, and the file it has open is the track.
    const track = player.transport ?? player.localTrack
    // Tags come only with a local file; a show transport carries none.
    const tags = player.transport ? null : player.localTrack
    const songInfo = resolveSongInfo({
      title: track?.title ?? '',
      artist: tags?.artist ?? '',
      album: tags?.album ?? '',
      posMs: player.posMs,
      durationMs: track?.durationMs ?? 0,
      playing: player.playing,
      loaded: track !== null,
      volume: runtime.volume,
    })
    // Read *after* the show has run: its own advance moves the same cursor,
    // and publishing the pre-show snapshot left the panel a frame behind
    // the LEDs on the first frame of every collection.
    const selectionView = patternSelectionView(selection, ids)
    const graphNames = useGraphStore.getState().graphs
    const patternSelect: PatternSelectValue = ids.length > 0
      ? {
        ids,
        names: ids.map((gid) => graphNames[gid]?.name ?? ''),
        activeIndex: selectionView.activeIndex,
        highlightIndex: selectionView.highlightIndex,
        count: selectionView.count,
        browsing: selectionView.browsing,
      }
      : blankPatternSelectValue()

    // The per-field ports and the envelope come from one reading, so a
    // panel and a custom UI cannot be told different things. Built after
    // the selection for the same reason the selection is read late: the
    // envelope carries it, so building it earlier would publish the
    // pre-show cursor to the panel and the post-show one to the port.
    const song = {
      ...songInfoOutputs(songInfo),
      display: {
        kind: 'player',
        song: songInfo,
        selection: ids.length > 0 ? patternSelect : null,
      } satisfies DisplaySignal,
    }

    if (!runtime.ledEnabled) out = { ...song, patternSelect, frame: blankFrame(W, H) }
    else if (runtime.brightness < 1) {
      const dimmed = cloneFrame(frame)
      for (const row of dimmed) for (const px of row) {
        px.r *= runtime.brightness
        px.g *= runtime.brightness
        px.b *= runtime.brightness
      }
      out = { ...song, patternSelect, frame: dimmed }
    } else out = { ...song, patternSelect, frame }
    return out
  },
  PatternSlideshow({ input, num, elapsedT, tick, elapsedTick, W, H, stateKey, incoming, nodeMap, groups, groupStack, instancePrefix, audioOverride, trusted, capabilityNodes, evaluateGraph }, id, props) {
    // The same show as the Music Player with the music taken out. What is
    // shared is shared outright: one collected-pattern renderer, one
    // `evalPatternShow`, one selection contract. What differs is only what
    // a slideshow needs — a single interval, a stated order, and audio it
    // ignores unless asked.
    const ids = (input(id, 'patternset', null) as string[] | null) ?? []
    const settings = slideshowSettings(
      props,
      incoming.has(`${id}:interval`) ? num(id, 'interval', props, 'interval', 20) : null,
    )
    const audioSignal = input(id, 'audio', null)
    // Reactivity is a switch, not a consequence of wiring: a slideshow with
    // a microphone attached holds still until it is asked to react, because
    // the mode exists for patterns that should not twitch at room noise.
    const audio = settings.audioReactive && isAudioSignal(audioSignal) ? audioSignal : null
    const render = (gid: string): Frame => renderCollectedPattern(gid, {
      groups, groupStack, instancePrefix, nodeId: id, tick, W, H,
      elapsedTick,
      trusted, capabilityNodes, audioOverride, audio, evaluateGraph,
    })
    const wiredPool = input(id, 'transitions', null) as string[] | null
    const pool = wiredPool && wiredPool.length ? wiredPool : ['crossfade']
    const key = stateKey(id)

    let selection = patternSelectionState.get(key)
    if (!selection) {
      selection = blankPatternSelection()
      patternSelectionState.set(key, selection)
    }
    // No confirm step. A slideshow has no split between what you are
    // looking at and what is playing to show anybody, so a step *is* the
    // change — which is what `confirm` on the same update means.
    const controlsValue = input(id, 'controls', null)
    const controls = combinePlayerControls(
      isPlayerControls(controlsValue) ? controlsValue : IDLE_PLAYER_CONTROLS,
      directPlayerActionControls(
        id, stateKey(`${id}/direct-actions`), playerControlActionPortsFor('engine'),
        elapsedT, incoming, input, nodeMap,
      ),
    )
    const steps = controls ? Math.trunc(controls.patternSteps) : 0
    updatePatternSelection(selection, {
      ids,
      nowMs: elapsedT * 1000,
      step: steps,
      confirm: steps !== 0 || controls?.patternConfirm === true,
    })

    let frame = evalPatternShow(key, ids, render, false, {
      minTime: settings.intervalSec,
      maxTime: settings.intervalSec,
      transSec: settings.transitionSec,
      pool,
      beatEnabled: false,
      particles: false,
      particleStyle: 0,
      particleColor: { r: 0, g: 0, b: 0 },
      particleIntensity: 0,
      randomStyle: false,
      randomColor: false,
      seed: settings.seed,
      order: settings.order,
    }, elapsedT, W, H, selection)

    if (settings.audioReactive) {
      const energy = audio
        ? (audio.micBass + audio.micMids + audio.micTreble) / 3
        : 0
      const previousFade = patternSlideshowFadeState.get(key) ?? { level: 1, lastT: elapsedT }
      const level = advanceSlideshowSilenceFade(
        previousFade.level,
        energy,
        Math.max(0, elapsedT - previousFade.lastT),
      )
      patternSlideshowFadeState.set(key, { level, lastT: elapsedT })
      if (level <= 0) frame = blankFrame(W, H)
      else if (level < 1) {
        const dimmed = cloneFrame(frame)
        for (const row of dimmed) for (const pixel of row) {
          pixel.r *= level
          pixel.g *= level
          pixel.b *= level
        }
        frame = dimmed
      }
    } else {
      patternSlideshowFadeState.delete(key)
    }

    // Read after the show has run, for the same reason the player does:
    // its own advance moves this cursor, and publishing the pre-show
    // snapshot leaves a panel a frame behind the LEDs.
    const view = patternSelectionView(selection, ids)
    const graphNames = useGraphStore.getState().graphs
    const patternSelect: PatternSelectValue = ids.length > 0
      ? {
        ids,
        names: ids.map((gid) => graphNames[gid]?.name ?? ''),
        activeIndex: view.activeIndex,
        highlightIndex: view.highlightIndex,
        count: view.count,
        browsing: view.browsing,
      }
      : blankPatternSelectValue()

    return {
      frame,
      patternSelect,
      display: { kind: 'slideshow', selection: patternSelect } satisfies DisplaySignal,
    }
  },
  Sequencer({ input, t, W, H }, id, props) {
    const frames = [
      input(id, 'p0', null) as Frame | null,
      input(id, 'p1', null) as Frame | null,
      input(id, 'p2', null) as Frame | null,
      input(id, 'p3', null) as Frame | null,
    ]
    const interval = Number(props.interval ?? 4)
    const fade = Number(props.fade ?? 1)
    return { frame: evalSequencer(frames, interval, fade, t, W, H) }
  },
  // Outputs its absorbed patterns (group ids) as a patternset; the Show
  // Engine resolves each id via the group registry.
  PatternCollection(_c, _id, props) {
    return { patternset: (props.patternIds as string[] | undefined) ?? [] }
  },
  // Outputs its toggled pool of extra transition styles; a Performance
  // Generator wired to it mixes them into its rule-based picks (resolved
  // live from the graph by musicStore, not through this frame-eval path —
  // this case just keeps the port well-defined for any generic probe).
  TransitionSet(_c, _id, props) {
    return { transitions: (props.transitions as string[] | undefined) ?? [] }
  },
  MusicLibrary() {
    return { music: true }
  },
  PerformanceGenerator({ input, t, W, H, stateKey, incoming, nodeMap }, id) {
    // The `frame` edge names the show's destination; it does not carry it.
    // Playback lives in the node body (PerformanceGeneratorBody) and, opt-in
    // via `showInMainPreview`, reaches the main LED preview through
    // showPlayback.ts — which composites over this frame rather than through
    // it, because a show is driven by an audio transport that the evaluator's
    // tick has no relationship to. So the port emits blank: with nothing
    // playing, nothing is what the LEDs are doing.
    //
    // `display` is a different matter, and is real here. This generator is
    // holding a track, and the body publishes what it knows about it to the
    // shared transport; a panel reads that the same way it reads a Music
    // Player's. The blackout and dimming a bundle latches are kept for the
    // level the panel reports, but cannot darken this preview: the show
    // frame is composited outside the evaluator (above), so there is no
    // frame here to scale. On the device both apply — the SD player sketch
    // this graph builds is the same one a Music Player builds.
    const key = stateKey(id)
    const controlsValue = input(id, 'controls', null)
    const controls = combinePlayerControls(
      isPlayerControls(controlsValue) ? controlsValue : IDLE_PLAYER_CONTROLS,
      directPlayerActionControls(
        id, stateKey(`${id}/direct-actions`), playerControlActionPortsFor('performance'),
        t, incoming, input, nodeMap,
      ),
    )
    const runtime = applyPlayerTransportControls(
      key, controls,
    )

    // Only the generator that actually owns the preview transport may
    // report a track. A second generator on the canvas is not playing this
    // one's song, and a panel wired to it must say so rather than mirror
    // whichever node happened to register last.
    const player = usePlayerTransport.getState()
    const owned = player.transport?.nodeId === id
    const songInfo = resolveSongInfo({
      title: owned ? player.transport?.title ?? '' : '',
      posMs: owned ? player.posMs : 0,
      durationMs: owned ? player.transport?.durationMs ?? 0 : 0,
      playing: owned && player.playing,
      loaded: owned,
      volume: runtime.volume,
    })

    // Which pattern the show is on, from the show file itself: the body
    // resolves it against the timeline and publishes it beside the
    // position. Unlike a Music Player there is no cursor to browse here —
    // the timeline schedules the patterns — so the highlight is the active
    // one and `browsing` is never true.
    const ids = (input(id, 'patternset', null) as string[] | null) ?? []
    const activeIndex = owned && player.patternIndex >= 0
      ? Math.min(player.patternIndex, Math.max(0, ids.length - 1))
      : 0
    const graphNames = useGraphStore.getState().graphs
    const selection: PatternSelectValue | null = ids.length > 0
      ? {
        ids,
        names: ids.map((gid) => graphNames[gid]?.name ?? ''),
        activeIndex,
        highlightIndex: activeIndex,
        count: ids.length,
        browsing: false,
      }
      : null

    return {
      frame: blankFrame(W, H),
      shows: null,
      display: { kind: 'player', song: songInfo, selection } satisfies DisplaySignal,
    }
  },
  SDCard() {
    return {}
  },
}
