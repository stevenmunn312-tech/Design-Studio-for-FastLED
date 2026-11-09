import { describe, it, expect } from 'vitest'
import { PARTICLE_MODES, particleMode, particleModeUsesDecay, particleModeUsesRate, particlePoolSize } from '../particleModes'
import { estimateFirmwareRam } from '../../../utils/validateGraph'
import type { StudioNode, StudioEdge } from '../../../state/graphStore'

const node = (id: string, nodeType: string, properties: Record<string, unknown> = {}) => ({
  id, type: 'studioNode', position: { x: 0, y: 0 },
  data: { label: nodeType, nodeType, category: 'pattern', properties, inputs: [], outputs: [] },
}) as unknown as StudioNode
const wire = { id: 'e', source: 'p', target: 'out', sourceHandle: 'frame', targetHandle: 'frame' } as unknown as StudioEdge

describe('Particles modes after the prune', () => {
  it('drops confetti and orbit, and keeps rain, sparkle and vortex', () => {
    expect(PARTICLE_MODES).not.toContain('confetti')
    expect(PARTICLE_MODES).not.toContain('orbit')
    for (const mode of ['rain', 'sparkle', 'vortex']) expect(PARTICLE_MODES).toContain(mode)
    expect(PARTICLE_MODES).toHaveLength(18)
  })

  it('runs a saved confetti or orbit as fountain', () => {
    expect(particleMode('confetti')).toBe('fountain')
    expect(particleMode('orbit')).toBe('fountain')
  })

  it('sizes every remaining pool as before: 240 for luminova, 120 otherwise', () => {
    for (const mode of PARTICLE_MODES) expect(particlePoolSize(mode), mode).toBe(mode === 'luminova' ? 240 : 120)
  })

  it('leaves the fixed-count modes reading Count rather than Rate', () => {
    for (const mode of ['bounce', 'fireflies', 'luminova']) expect(particleModeUsesRate(mode), mode).toBe(false)
    expect(particleModeUsesDecay('vortex')).toBe(true)
  })

  it('prices a removed mode as the fountain pool it runs as', () => {
    const out = node('out', 'MatrixOutput', { width: 4, height: 4 })
    const fountain = estimateFirmwareRam([node('p', 'Particles', { particleType: 'fountain' }), out], [wire])!
    for (const mode of ['orbit', 'confetti']) {
      const removed = estimateFirmwareRam([node('p', 'Particles', { particleType: mode }), out], [wire])!
      expect(removed.statefulBytes, mode).toBe(fountain.statefulBytes)
    }
  })
})
