import { describe, it, expect } from 'vitest'
import { STARTER_TEMPLATES } from '../starterTemplates'
import { useNodeDefaults } from '../nodeDefaults'
import { outputForm } from '../ledOutputForm'
import { NODE_LIBRARY, portsCompatible } from '../nodeLibrary'
import { validateGraph } from '../../utils/validateGraph'
import type { StudioNodeData } from '../graphStore'

const LIBRARY_DEF = new Map(NODE_LIBRARY.map((d) => [d.type, d]))

describe('starterTemplates', () => {
  it('has unique ids', () => {
    const ids = STARTER_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  // The form is part of the lesson: Fire teaches matching flame direction to
  // how a matrix is mounted, Scrolling Text teaches how text fits it, and
  // Juggle is a run of tape. Saved node defaults must not reshape any of them.
  it('pins each output form against a saved node default', () => {
    useNodeDefaults.setState({ overrides: { MatrixOutput: { form: 'strip', ledCount: 300 } } })
    try {
      const forms = new Map(STARTER_TEMPLATES.map((template) => {
        const output = template.build().nodes.find((node) => node.data.nodeType === 'MatrixOutput')
        return [template.id, output && outputForm(output.data.properties)]
      }))
      expect(forms.get('juggle')).toBe('strip')
      for (const [id, form] of forms) {
        if (id === 'juggle') continue
        expect(form, `${id} output form`).toBe('matrix')
      }
    } finally {
      useNodeDefaults.setState({ overrides: {} })
    }
  })

  it('gives every starter a tutorial note and concrete next steps', () => {
    for (const template of STARTER_TEMPLATES) {
      expect(template.completionSteps?.length, `${template.name} completion steps`).toBeGreaterThanOrEqual(3)
      const { nodes } = template.build()
      const comments = nodes.filter((node) => node.data.nodeType === 'Comment')
      expect(comments, `${template.name} tutorial comments`).toHaveLength(1)
      expect(String(comments[0].data.properties.text)).toContain('\n')
      expect(template.preview.nodes.some((node) => node.category === 'note')).toBe(false)
    }
  })

  it('marks only the live-audio starter to request microphone access', () => {
    expect(STARTER_TEMPLATES.filter((template) => template.activateMicrophone).map((template) => template.id))
      .toEqual(['audio-spectrum'])
  })

  it('builds the Music Player starter shown in the start gallery', () => {
    const template = STARTER_TEMPLATES.find((entry) => entry.id === 'generative-show')!
    expect(template.name).toBe('Music Player')

    const { nodes, edges } = template.build()
    const nodeByType = new Map(nodes.map((node) => [(node.data as StudioNodeData).nodeType, node]))
    expect([...nodeByType.keys()]).toEqual(expect.arrayContaining([
      'Audio',
      'PlayerControls',
      'PatternCollection',
      'PatternMaster',
      'MatrixOutput',
      'Comment',
    ]))

    const comment = nodeByType.get('Comment')!
    expect((comment.data as StudioNodeData).properties.text).toBe(
      'BUILD A SHOW \nSpecify your board, audio source and music player hardware from the hardware bench below then add some patterns into the Pattern Collection.\nCheck that you have the correct GPIO\'s for your hardware then use the capacity checker to ensure the sketch will fit on your board and upload.',
    )

    const expectedEdges = [
      ['Audio', 'audio', 'PatternMaster', 'audio'],
      ['PlayerControls', 'controls', 'PatternMaster', 'controls'],
      ['PatternCollection', 'patternset', 'PatternMaster', 'patternset'],
      ['PatternMaster', 'frame', 'MatrixOutput', 'frame'],
    ]
    expect(edges.map((edge) => {
      const source = nodes.find((node) => node.id === edge.source)!
      const target = nodes.find((node) => node.id === edge.target)!
      return [
        (source.data as StudioNodeData).nodeType,
        edge.sourceHandle,
        (target.data as StudioNodeData).nodeType,
        edge.targetHandle,
      ]
    })).toEqual(expectedEdges)

    const { errors } = validateGraph(nodes, edges)
    expect(errors).toEqual([
      'Audio has no attached source — add a microphone, line-in ADC, or SD music player, or choose an available source',
    ])
  })

  it('puts every part the SD player drives on the bench, and wires the show to one of them', () => {
    // The player is a whole firmware for a whole board: it reads the card,
    // turns the song into sound, and drives the LEDs. If a part is not on the
    // hardware view it does not exist in the generated output, so a starter
    // that omitted one produced a board that lit nothing, played nothing, or
    // both — and the generator filled the gap by scanning for whichever
    // MatrixOutput came first and assuming an audio path from the board.
    const { nodes, edges } = STARTER_TEMPLATES.find((t) => t.id === 'music-sync-sd-show')!.build()
    const types = nodes.map((n) => (n.data as StudioNodeData).nodeType)
    expect(types).toContain('SDCard')
    expect(types).toContain('Amplifier')
    expect(types).toContain('MatrixOutput')

    const generator = nodes.find((n) => (n.data as StudioNodeData).nodeType === 'PerformanceGenerator')!
    const output = nodes.find((n) => (n.data as StudioNodeData).nodeType === 'MatrixOutput')!
    expect(edges.some((e) => e.source === generator.id && e.target === output.id
      && e.sourceHandle === 'frame' && e.targetHandle === 'frame')).toBe(true)
  })

  for (const template of STARTER_TEMPLATES) {
    it(`"${template.name}" builds a well-formed, type-compatible graph`, () => {
      const { nodes, edges } = template.build()
      expect(nodes.length).toBeGreaterThan(0)

      const nodeIds = new Set(nodes.map((n) => n.id))
      expect(nodeIds.size).toBe(nodes.length)

      for (const node of nodes) {
        const data = node.data as StudioNodeData
        expect(LIBRARY_DEF.has(data.nodeType)).toBe(true)
      }

      for (const edge of edges) {
        const src = nodes.find((n) => n.id === edge.source)
        const tgt = nodes.find((n) => n.id === edge.target)
        expect(src, `source node ${edge.source} exists`).toBeTruthy()
        expect(tgt, `target node ${edge.target} exists`).toBeTruthy()
        const srcDef = LIBRARY_DEF.get((src!.data as StudioNodeData).nodeType)!
        const tgtDef = LIBRARY_DEF.get((tgt!.data as StudioNodeData).nodeType)!
        const outPort = srcDef.outputs.find((p) => p.id === edge.sourceHandle)
        const inPort = tgtDef.inputs.find((p) => p.id === edge.targetHandle)
        expect(outPort, `${srcDef.type} has output "${edge.sourceHandle}"`).toBeTruthy()
        expect(inPort, `${tgtDef.type} has input "${edge.targetHandle}"`).toBeTruthy()
        expect(portsCompatible(outPort!.dataType, inPort!.dataType)).toBe(true)
      }

      // Loading a template shouldn't trip unexpected graph validation errors
      // (missing MatrixOutput, unconnected Frame input, etc). Music Player is
      // deliberately incomplete until its audio hardware is added on the bench.
      // Warnings are fine — e.g. its Pattern Collection also starts empty.
      const { errors } = validateGraph(nodes, edges)
      const unexpectedErrors = template.id === 'generative-show'
        ? errors.filter((error) => !error.startsWith('Audio has no attached source'))
        : errors
      expect(unexpectedErrors).toEqual([])
    })
  }
})
