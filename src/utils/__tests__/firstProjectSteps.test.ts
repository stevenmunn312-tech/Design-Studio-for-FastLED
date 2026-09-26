import { describe, expect, it } from 'vitest'
import type { StudioEdge, StudioNode } from '../../state/graphStore'
import {
  appearanceFingerprint,
  firstProjectSteps,
  type FirstProjectInput,
} from '../firstProjectSteps'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}, x = 0): StudioNode {
  return {
    id, type: 'studioNode', position: { x, y: 0 },
    data: { label: nodeType, nodeType, category: 'pattern', properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}
const wire = { id: 'w', source: 'juggle', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' } as StudioEdge

const board = (profileId = '') => node('board', 'Board', { profileId })
const juggle = (count = 4, x = 0) => node('juggle', 'Juggle', { count, speed: 0.5 }, x)
const output = () => node('out', 'MatrixOutput', { form: 'strip' })

function input(overrides: Partial<FirstProjectInput> = {}): FirstProjectInput {
  return {
    nodes: [board()], edges: [], baseline: null, graphBlockerCount: 0,
    capacityVerdict: 'unknown', port: { state: 'none', address: '' }, uploaded: false, skipped: [],
    ...overrides,
  }
}
const states = (steps: ReturnType<typeof firstProjectSteps>) => steps.map((step) => `${step.id}:${step.state}`)

describe('appearanceFingerprint', () => {
  it('ignores where nodes sit, and the Board', () => {
    const a = appearanceFingerprint([board(), juggle(4, 0), output()], [wire])
    const b = appearanceFingerprint([board('esp32-devkit'), output(), juggle(4, 300)], [wire])
    expect(a).toBe(b)
  })

  it('changes with a setting or a wire', () => {
    const base = appearanceFingerprint([juggle(4), output()], [wire])
    expect(appearanceFingerprint([juggle(5), output()], [wire])).not.toBe(base)
    expect(appearanceFingerprint([juggle(4), output()], [])).not.toBe(base)
  })
})

describe('firstProjectSteps', () => {
  it('starts at choosing a starter on an empty project', () => {
    const steps = firstProjectSteps(input())
    expect(states(steps)).toEqual(['starter:current', 'look:todo', 'board:todo', 'ready:todo', 'upload:todo'])
    expect(steps[0].actions.map((a) => a.action)).toEqual(['open-starters'])
  })

  it('takes an existing project as the starting point rather than asking for a starter', () => {
    const nodes = [board(), juggle(), output()]
    const steps = firstProjectSteps(input({ nodes, edges: [wire], baseline: appearanceFingerprint(nodes, [wire]) }))
    expect(states(steps).slice(0, 2)).toEqual(['starter:done', 'look:current'])
  })

  it('counts a changed setting as making it yours, but not a moved node', () => {
    const baseline = appearanceFingerprint([board(), juggle(4), output()], [wire])
    const moved = firstProjectSteps(input({ nodes: [board(), juggle(4, 500), output()], edges: [wire], baseline }))
    expect(moved[1].state).toBe('current')
    const changed = firstProjectSteps(input({ nodes: [board(), juggle(5), output()], edges: [wire], baseline }))
    expect(changed[1].state).toBe('done')
  })

  it('counts the board as chosen once the Board names a profile, and offers LED setup when there is an output', () => {
    const nodes = [board(), juggle(), output()]
    const baseline = appearanceFingerprint(nodes, [wire])
    const open = firstProjectSteps(input({ nodes, edges: [wire], baseline, skipped: ['look'] }))
    expect(open[2].state).toBe('current')
    expect(open[2].actions.map((a) => a.action)).toEqual(['open-hardware', 'led-setup'])
    const chosen = firstProjectSteps(input({ nodes: [board('esp32-devkit'), juggle(), output()], edges: [wire], baseline, skipped: ['look'] }))
    expect(chosen[2].state).toBe('done')
  })

  it('says how many things to fix, and is ready only once it fits', () => {
    const nodes = [board('esp32-devkit'), juggle(5), output()]
    const base = { nodes, edges: [wire], baseline: 'before' }
    const blocked = firstProjectSteps(input({ ...base, graphBlockerCount: 2 }))
    expect(blocked[3]).toMatchObject({ state: 'current' })
    expect(blocked[3].detail).toMatch(/^2 things to fix first/)
    expect(firstProjectSteps(input({ ...base, capacityVerdict: 'unknown' }))[3].detail).toMatch(/Check capacity/)
    expect(firstProjectSteps(input({ ...base, capacityVerdict: 'tight' }))[3].state).toBe('done')
    expect(firstProjectSteps(input({ ...base, capacityVerdict: 'overflow' }))[3].state).toBe('current')
  })

  it('ends on a plain connection instruction when no board is plugged in', () => {
    const nodes = [board('esp32-devkit'), juggle(5), output()]
    const base = { nodes, edges: [wire], baseline: 'before', capacityVerdict: 'fits' as const }
    const detail = (port: FirstProjectInput['port']) => firstProjectSteps(input({ ...base, port }))[4].detail
    expect(detail({ state: 'none', address: '' })).toMatch(/Plug your board in with a USB cable/)
    expect(detail({ state: 'disconnected', address: 'COM6' })).toMatch(/^COM6 isn’t there right now/)
    expect(detail({ state: 'offline', address: '' })).toMatch(/build tools aren’t running/)
    expect(detail({ state: 'connected', address: 'COM6' })).toBe('Your board is on COM6. Press Upload on the Upload tab.')
  })

  it('finishes on an upload, which also shows it was ready', () => {
    const nodes = [board('esp32-devkit'), juggle(5), output()]
    const steps = firstProjectSteps(input({ nodes, edges: [wire], baseline: 'before', uploaded: true }))
    expect(steps.every((step) => step.state === 'done')).toBe(true)
  })

  it('moves past a skipped step and keeps it skipped until it is done', () => {
    const steps = firstProjectSteps(input({ skipped: ['starter', 'look'] }))
    expect(states(steps)).toEqual(['starter:skipped', 'look:skipped', 'board:current', 'ready:todo', 'upload:todo'])
  })
})
