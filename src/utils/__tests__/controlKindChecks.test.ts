import { describe, it, expect } from 'vitest'
import { buildGraphDiagnostics, findUnusablePlayerControlWarnings } from '../validateGraph'
import { NODE_LIBRARY } from '../../state/nodeLibrary'
import { FIRST_BUTTON_HANDLE, singleButtonRow } from '../../state/player/buttonBank'
import type { StudioNode, StudioEdge } from '../../state/graphStore'

function node(id: string, nodeType: string, props: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: def?.label ?? nodeType, nodeType, category: def?.category ?? 'output',
      properties: { ...(def?.defaultProperties ?? {}), ...props },
      inputs: def?.inputs ?? [], outputs: def?.outputs ?? [],
    },
  } as unknown as StudioNode
}
const edge = (id: string, s: string, sh: string, t: string, th: string): StudioEdge =>
  ({ id, source: s, target: t, sourceHandle: sh, targetHandle: th }) as unknown as StudioEdge

const button = () => node('btn', 'ButtonBank', { buttons: singleButtonRow(4) })
const knob = () => node('knob', 'PotInput', { pin: 34 })
// A plain sketch: a colour straight into an LED output.
const sketch = [node('fill', 'SolidColor'), node('out', 'MatrixOutput')]
const sketchEdges = [edge('frame', 'fill', 'frame', 'out', 'frame')]
// A show build: a Slideshow playing a collection into the same output.
const show = [node('master', 'PatternSlideshow'), node('coll', 'PatternCollection', { patternIds: ['a'] }), node('out', 'MatrixOutput')]
const showEdges = [
  edge('set', 'coll', 'patternset', 'master', 'patternset'),
  edge('frame', 'master', 'frame', 'out', 'frame'),
]

describe('a button doing a knob’s job, and a knob doing a button’s', () => {
  // The rows a button can use instead are named as the node names them.
  it('points Pattern Selection at Previous Pattern and Next Pattern', () => {
    const found = findUnusablePlayerControlWarnings(
      [...show, button(), node('pc', 'ControlMap')],
      [...showEdges, edge('a', 'btn', FIRST_BUTTON_HANDLE, 'pc', 'patternSelect'), edge('b', 'pc', 'controls', 'master', 'controls')],
    )
    expect(found).toHaveLength(1)
    expect(found[0]).toContain('the Previous Pattern and Next Pattern rows')
    expect(found[0]).not.toContain('Up / Down')
  })

  // An LED output's Brightness at rest is 0 under a button: the fixture is
  // dark until somebody holds it. Same rule as the Player Controls row.
  it('flags a button wired straight into an LED output’s Brightness', () => {
    const diagnostics = buildGraphDiagnostics([...sketch, button()],
      [...sketchEdges, edge('dim', 'btn', FIRST_BUTTON_HANDLE, 'out', 'brightness')])
    expect(diagnostics).toContainEqual(expect.objectContaining({
      severity: 'warning',
      title: 'A button is doing a knob’s job',
      message: 'Brightness on LED Matrix is driven by a press, so it only jumps between off and full.',
      fix: expect.stringContaining('the Brightness Up and Brightness Down rows'),
      nodeIds: ['out'], edgeIds: ['dim'],
    }))
  })

  it('flags a knob wired straight into an LED output’s blackout toggle', () => {
    const found = findUnusablePlayerControlWarnings([...sketch, knob()],
      [...sketchEdges, edge('bo', 'knob', 'value', 'out', 'ledToggle')])
    expect(found).toEqual([expect.stringMatching(/^Toggle blackout on LED Matrix is driven by a knob.*Use a button\.$/)])
  })

  it('accepts a knob on Brightness and a button on Brightness Up', () => {
    expect(findUnusablePlayerControlWarnings([...sketch, knob(), button()], [
      ...sketchEdges,
      edge('dim', 'knob', 'value', 'out', 'brightness'),
      edge('up', 'btn', FIRST_BUTTON_HANDLE, 'out', 'brightnessUp'),
    ])).toEqual([])
  })

  // Enabled is a level, not one of the control jobs: a button holding the
  // fixture on is a legitimate wire.
  it('leaves an LED output’s Enabled alone', () => {
    expect(findUnusablePlayerControlWarnings([...sketch, button()],
      [...sketchEdges, edge('en', 'btn', FIRST_BUTTON_HANDLE, 'out', 'enabled')])).toEqual([])
  })
})

describe('a firmware refusal that leads with its cause', () => {
  it('says the button is the problem first, and offers the button rows', () => {
    const diagnostics = buildGraphDiagnostics([...show, button()],
      [...showEdges, edge('dim', 'btn', FIRST_BUTTON_HANDLE, 'out', 'brightness')])
    const card = diagnostics.find((entry) => entry.title === 'Output firmware cannot honour these controls')!
    expect(card.message).toBe('Brightness on LED Matrix is driven by a press, so it only jumps between off and full. '
      + 'LED Matrix: a generated show controller cannot evaluate the wire feeding Brightness.')
    expect(card.fix).toBe('Use a knob, or the Brightness Up and Brightness Down rows (Expose input shows them) for buttons.')
    // The control graph's own wording stays out of the card.
    expect(`${card.message} ${card.fix}`).not.toContain('control graph requires')
    // One card for one wire: the warning would only repeat it.
    expect(diagnostics.filter((entry) => entry.edgeIds?.includes('dim') && entry.severity === 'warning')).toEqual([])
  })

  it('names a source the build cannot read before the general advice', () => {
    const card = buildGraphDiagnostics([...show, node('wave', 'ComplexWave')],
      [...showEdges, edge('dim', 'wave', 'result', 'out', 'brightness')])
      .find((entry) => entry.title === 'Output firmware cannot honour these controls')!
    expect(card.message).toMatch(/^Complex ?Wave(’s Result)? is not something this build can read as a level for Brightness on LED Matrix\. /)
    expect(card.fix).toContain('Use supported scalar nodes')
    expect(card.fix).not.toContain('control graph requires')
  })
})
