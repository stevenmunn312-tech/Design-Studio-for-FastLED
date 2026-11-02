import type { ShowTargetEdge } from '../../state/player/showTarget'
import { particleEnergyGate, particleRestMs, particleVolleyBursts } from '../../state/player/playerDynamics'
import { hexToRgb } from '../../state/palettes/polinePalette'

/** Player Particles as a generator freezes it: the bundle's inspector values
 *  are show appearance rather than hardware configuration, so they bake into
 *  the sketch just like transition choices. */
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

/** The Particle FX bundle wired into the show engine `engineId`: a Music
 *  Player or a Pattern Slideshow, which read the same node the same way. No
 *  wire means no overlay. */
export function playerParticlesWiredTo(
  nodes: readonly ConfigNode[], edges: readonly ShowTargetEdge[], engineId: string,
): PlayerParticlesConfig | null {
  const link = edges.find((edge) =>
    edge.target === engineId && edge.targetHandle === 'particleFx')
  const node = link && nodes.find((candidate) =>
    candidate.id === link.source && candidate.data.nodeType === 'PlayerParticles')
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
