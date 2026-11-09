import type { ShowTargetEdge } from '../../state/player/showTarget'
import { particleEnergyGate, particleRestMs, particleVolleyBursts } from '../../state/player/playerDynamics'
import { hexToRgb } from '../../state/palettes/polinePalette'

/** Player Particles' inspector values as a generator reads them. A wired
 *  Enabled, Intensity, Color, Random Style or Random Color is read live
 *  instead (`PlayerParticleLiveInputs`), as the preview reads it; the rest
 *  bake into the sketch like transition choices. */
export interface PlayerParticlesConfig {
  enabled: boolean
  style: number
  color: { r: number; g: number; b: number }
  intensity: number
  randomColor: boolean
  randomStyle: boolean
  volleyBursts: number
  restMs: number
  energyGate: number
}

interface ConfigNode { id: string; data: { nodeType: string; properties: Record<string, unknown> } }

/** The ports the show and SD player read live through their control graph. */
export const PLAYER_PARTICLE_LIVE_PORTS = [
  { port: 'enabled', type: 'bool' },
  { port: 'intensity', type: 'float' },
  { port: 'color', type: 'color' },
  { port: 'randomStyle', type: 'bool' },
  { port: 'randomColor', type: 'bool' },
] as const

export type PlayerParticleLivePort = typeof PLAYER_PARTICLE_LIVE_PORTS[number]['port']

/** C++ expressions for the wired ports, from the control graph; an absent
 *  port reads the node's own field. */
export type PlayerParticleLiveInputs = Partial<Record<PlayerParticleLivePort, string>>

function particlesNodeWiredTo<T extends ConfigNode>(
  nodes: readonly T[], edges: readonly ShowTargetEdge[], engineId: string | null | undefined,
): T | null {
  if (!engineId) return null
  const link = edges.find((edge) =>
    edge.target === engineId && edge.targetHandle === 'particleFx')
  return (link && nodes.find((candidate) =>
    candidate.id === link.source && candidate.data.nodeType === 'PlayerParticles')) || null
}

/** The Particle FX bundle wired into the show engine `engineId`: a Music
 *  Player or a Pattern Slideshow, which read the same node the same way. No
 *  wire means no overlay. */
export function playerParticlesWiredTo(
  nodes: readonly ConfigNode[], edges: readonly ShowTargetEdge[], engineId: string,
): PlayerParticlesConfig | null {
  const node = particlesNodeWiredTo(nodes, edges, engineId)
  if (!node) return null
  const props = node.data.properties
  const clamp = (value: unknown, fallback: number, min: number, max: number) => {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback
  }
  return {
    enabled: props.enabled !== false,
    style: Math.round(clamp(props.style, 0, 0, 16)),
    color: hexToRgb(String(props.color ?? '#ff8000')),
    intensity: clamp(props.intensity, 0.8, 0, 1),
    randomColor: props.randomColor === true,
    randomStyle: props.randomStyle === true,
    volleyBursts: particleVolleyBursts(props.volleyBursts),
    restMs: particleRestMs(props.restSec),
    energyGate: particleEnergyGate(props.energyGate),
  }
}

/** The control-graph inputs for the wired ports of the Player Particles node
 *  feeding `engineId`. */
export function playerParticleControlInputs(
  nodes: readonly ConfigNode[], edges: readonly ShowTargetEdge[], engineId: string | null | undefined,
) {
  const node = particlesNodeWiredTo(nodes, edges, engineId)
  if (!node) return []
  return PLAYER_PARTICLE_LIVE_PORTS
    .filter(({ port }) => edges.some((edge) => edge.target === node.id && edge.targetHandle === port))
    .map(({ port, type }) => ({ nodeId: node.id, port, type }))
}

/** The routed expressions for those inputs, by port. */
export function playerParticleLiveInputs(
  nodes: readonly ConfigNode[], edges: readonly ShowTargetEdge[], engineId: string | null | undefined,
  scalarInputs: ReadonlyMap<string, string>,
): PlayerParticleLiveInputs {
  const live: PlayerParticleLiveInputs = {}
  for (const { nodeId, port } of playerParticleControlInputs(nodes, edges, engineId)) {
    const expression = scalarInputs.get(`${nodeId}:${port}`)
    if (expression) live[port] = expression
  }
  return live
}

/** Whether the overlay is emitted at all: a wired Enabled can switch it on. */
export function playerParticlesActive(fx: PlayerParticlesConfig | null | undefined, live: PlayerParticleLiveInputs): boolean {
  return !!fx && (fx.enabled || !!live.enabled)
}

/**
 * The burst's C++, wire-then-field, matching the preview: Enabled gates both
 * new bursts and the drawn overlay; Intensity is read while the burst draws;
 * colour and style are rolled when a burst starts.
 */
export function playerParticleBurstCpp(fx: PlayerParticlesConfig, live: PlayerParticleLiveInputs) {
  const baked = `CRGB(${fx.color.r}, ${fx.color.g}, ${fx.color.b})`
  const fixedColor = live.color ?? baked
  return {
    /** A condition, or null when Enabled is unwired (the overlay is on). */
    enabled: live.enabled ? `(${live.enabled})` : null,
    /** The intensity a burst starts at. */
    intensity: live.intensity ? `constrain(${live.intensity}, 0.0f, 1.0f)` : `${fx.intensity.toFixed(3)}f`,
    /** A frame's update that keeps a wired Intensity live while sparks draw. */
    liveIntensity: live.intensity
      ? [`  if (burstStart != 0) burstIntensity = constrain(${live.intensity}, 0.0f, 1.0f);`]
      : [],
    style: live.randomStyle ? `((${live.randomStyle}) ? random8(17) : ${fx.style})`
      : fx.randomStyle ? 'random8(17)' : String(fx.style),
    /** False when the style is fixed, so the overlay's switch can keep one arm. */
    styleVaries: !!live.randomStyle || fx.randomStyle,
    /** The colour a burst starts with, always an expression. */
    color: live.randomColor ? `((${live.randomColor}) ? CRGB(CHSV(random8(), 255, 255)) : ${fixedColor})`
      : fx.randomColor ? 'CHSV(random8(), 255, 255)' : fixedColor,
    /** False when every burst takes the node's own colour. */
    colorVaries: !!live.randomColor || fx.randomColor || !!live.color,
  }
}
