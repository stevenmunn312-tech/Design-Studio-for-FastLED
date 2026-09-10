import { describe, it, expect } from 'vitest'
import { STARTER_TEMPLATES, buildBoardAwareStarter } from '../starterTemplates'
import { useNodeDefaults } from '../nodeDefaults'
import { outputForm } from '../ledOutputForm'
import { NODE_LIBRARY, portsCompatible } from '../nodeLibrary'
import {
  buildGraphDiagnostics,
  findBoardPinCompatibility,
  findExactBoardPinIssues,
  findPinConflicts,
  validateGraph,
} from '../../utils/validateGraph'
import type { StudioNode, StudioNodeData } from '../graphStore'

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
    const audio = nodeByType.get('Audio')!
    expect(comment.position.x).toBeLessThan(audio.position.x)
    expect(comment.position.y).toBe(audio.position.y)
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

    expect(audio.data.properties.sourceId).toBe('kind:decoder')
    expect(validateGraph(nodes, edges).errors).toEqual([])
  })

  /*
   * Every starter, on both reference boards, not just Music Player.
   *
   * A starter is the first thing a new user sees, so one that loads holding a
   * pin conflict teaches that the app ships broken. The control starters made
   * this worth checking across the gallery rather than for one patch: they add
   * buttons, knobs and screens, which is where a board runs out of pool and
   * where the allocator's own bugs surface.
   */
  it.each([
    ['Generic ESP32', 'esp32-generic-devkit-38pin', 'esp32:esp32:esp32'],
    ['Generic ESP32-S3', 'generic-esp32-s3-n16r8-44pin-dual-usbc', 'esp32:esp32:esp32s3'],
  ])('loads every starter without a pin conflict on %s', (_, profileId, fqbn) => {
    const board = {
      id: 'board-root', type: 'studioNode', position: { x: 0, y: 0 },
      data: {
        nodeType: 'Board', label: 'Board', category: 'output',
        properties: { profileId }, inputs: [], outputs: [],
      },
    } as unknown as StudioNode

    for (const template of STARTER_TEMPLATES) {
      const { nodes, edges } = buildBoardAwareStarter(template, [board], fqbn)
      expect(findPinConflicts(nodes), `${template.id} pin conflicts`).toEqual([])
      expect(validateGraph(nodes, edges, fqbn).errors, `${template.id} errors`).toEqual([])
      expect(findExactBoardPinIssues(nodes).errors, `${template.id} exact-board`).toEqual([])
    }
  })

  it.each([
    ['Generic ESP32', 'esp32-generic-devkit-38pin', 'esp32:esp32:esp32'],
    ['Generic ESP32-S3', 'generic-esp32-s3-n16r8-44pin-dual-usbc', 'esp32:esp32:esp32s3'],
  ])('loads Music Player with compatible, unique defaults on %s', (_, profileId, fqbn) => {
    const template = STARTER_TEMPLATES.find((entry) => entry.id === 'generative-show')!
    const board = {
      id: 'board-root',
      type: 'studioNode',
      position: { x: 0, y: 0 },
      data: {
        nodeType: 'Board',
        label: 'Board',
        category: 'output',
        properties: { profileId },
        inputs: [],
        outputs: [],
      },
    } as unknown as StudioNode
    const { nodes, edges } = buildBoardAwareStarter(template, [board], fqbn)

    const loadedBoard = nodes.find((node) => node.data.nodeType === 'Board')!
    expect(loadedBoard.id).toBe(board.id)
    expect(loadedBoard.data.properties).toMatchObject({
      powerLimit: true,
      volts: 5,
      milliamps: 15400,
    })
    expect(findPinConflicts(nodes)).toEqual([])
    expect(findBoardPinCompatibility(nodes, fqbn)).toEqual({ errors: [], warnings: [] })
    expect(findExactBoardPinIssues(nodes)).toEqual({ errors: [], warnings: [] })
    expect(validateGraph(nodes, edges, fqbn).errors).toEqual([])
    const diagnostics = buildGraphDiagnostics(nodes, edges, { selectedFqbn: fqbn })
    expect(diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([])
    expect(diagnostics.filter((diagnostic) => diagnostic.severity === 'warning')).toEqual([])
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
        // The node's own ports, not the library's: Player Controls and Button
        // Bank mint theirs from their properties, so a starter that wires one
        // has to carry the port it wired.
        const srcPorts = ((src!.data as StudioNodeData).outputs ?? srcDef.outputs) as typeof srcDef.outputs
        const tgtPorts = ((tgt!.data as StudioNodeData).inputs ?? tgtDef.inputs) as typeof tgtDef.inputs
        const outPort = srcPorts.find((p) => p.id === edge.sourceHandle)
        const inPort = tgtPorts.find((p) => p.id === edge.targetHandle)
        expect(outPort, `${srcDef.type} has output "${edge.sourceHandle}"`).toBeTruthy()
        expect(inPort, `${tgtDef.type} has input "${edge.targetHandle}"`).toBeTruthy()
        expect(portsCompatible(outPort!.dataType, inPort!.dataType)).toBe(true)
      }

      // Loading a template shouldn't trip graph validation errors (missing
      // MatrixOutput, unconnected Frame input, unresolved audio source, etc).
      // Warnings are fine — e.g. a deliberately conservative power estimate.
      //
      // Against the board-aware build, because that is the only build the app
      // performs: `build()` hands back library-default pins that several parts
      // share, and the allocator is what resolves them. The per-board pass
      // above checks the same thing on both reference boards.
      const placed = buildBoardAwareStarter(template, [], 'esp32:esp32:esp32')
      const { errors } = validateGraph(placed.nodes, placed.edges)
      expect(errors).toEqual([])
    })
  }
})
