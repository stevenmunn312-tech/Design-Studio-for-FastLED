import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PARTICLE_STYLES, particleStyleIndex } from '../particleStyles'
import { libraryDefaults, propertyMeta } from '../../nodeLibrary'
import { playerParticlesWiredTo, playerParticleBurstCpp } from '../../../codegen/player/playerParticlesConfig'

// Style was a 0-16 slider although every style has a name. It is a named
// select now; the name's position is the id the switches dispatch on.
describe('Player Particles styles', () => {
  it('offers the seventeen styles by name, defaulting to rise', () => {
    expect(PARTICLE_STYLES).toHaveLength(17)
    expect(propertyMeta('PlayerParticles', 'style')).toEqual({ control: 'select', options: PARTICLE_STYLES })
    expect(libraryDefaults('PlayerParticles').style).toBe('rise')
  })

  it('maps a name to its id, and anything else to rise', () => {
    expect(particleStyleIndex('rise')).toBe(0)
    expect(particleStyleIndex('swirl')).toBe(4)
    expect(particleStyleIndex('vortex')).toBe(16)
    expect(particleStyleIndex('nope')).toBe(0)
    expect(particleStyleIndex(3)).toBe(0)
  })

  // The preview, the SD player and the show sketch each name every arm; the
  // list must agree with all three, or a select would draw one style and
  // flash another.
  it('lists the styles in the order the preview and firmware switches number them', () => {
    const arms = (path: string) => {
      const source = readFileSync(resolve(__dirname, path), 'utf8')
      const start = source.indexOf('switch (style)') >= 0 ? source.indexOf('switch (style)') : source.indexOf('switch (burstStyle)')
      const body = source.slice(start, source.indexOf('default:', start) + 40)
      const named = [...body.matchAll(/case (\d+):\s*\{?\s*\/\/ (\w+)/g)].map(([, id, name]) => [Number(id), name])
      const fallback = /default:\s*\/\/ (\w+)/.exec(body)?.[1]
      return { named, fallback }
    }
    for (const path of [
      '../../../nodes/show/evaluate.ts',
      '../../../codegen/playerSketchGenerator.ts',
      '../../../codegen/helpers/transitionHelperCpp.ts',
    ]) {
      const { named, fallback } = arms(path)
      expect(named.length, path).toBe(16)
      for (const [id, name] of named) expect(PARTICLE_STYLES[id as number], `${path} case ${id}`).toBe(name)
      expect(fallback, path).toBe(PARTICLE_STYLES[0])
    }
  })

  it('bakes the named style as its id, and rolls among all of them when random', () => {
    const nodes = [
      { id: 'fx', data: { nodeType: 'PlayerParticles', properties: { style: 'helix' } } },
      { id: 'player', data: { nodeType: 'PatternMaster', properties: {} } },
    ]
    const edges = [{ source: 'fx', sourceHandle: 'particleFx', target: 'player', targetHandle: 'particleFx' }]
    const fx = playerParticlesWiredTo(nodes, edges, 'player')!
    expect(fx.style).toBe(8)
    expect(playerParticleBurstCpp(fx, {}).style).toBe('8')
    expect(playerParticleBurstCpp({ ...fx, randomStyle: true }, {}).style).toBe('random8(17)')
  })
})
