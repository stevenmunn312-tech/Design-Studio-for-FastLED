// The music-free pattern player.
//
// What is worth testing here is only what differs from the Music Player: the
// show engine itself is `evalPatternShow`, covered by patternShowSelection.ts
// and the show generator's own tests. So: one interval rather than a range, a
// stated order, reactivity as a switch, and a pattern change that lands
// immediately because there is no browse/confirm split to show.

import { describe, it, expect, beforeEach } from 'vitest'
import { evaluateGraph, getPatternShowSelection, resetEvaluatorState, type AudioSignal } from '../graphEvaluator'
import { NODE_LIBRARY } from '../nodeLibrary'
import { advanceSlideshowSilenceFade, slideshowSettings, asSlideshowOrder } from '../patternSlideshow'
import { validateGraph } from '../../utils/validateGraph'
import { useHardwareInputStore } from '../hardwareInputStore'
import { ENCODER_COUNTS_PER_STEP } from '../patternSelection'
import type { StudioNode, StudioEdge } from '../graphStore'

function node(id: string, nodeType: string, props: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category: 'show', properties: props,
      inputs: def?.inputs ?? [], outputs: def?.outputs ?? [],
    },
  } as unknown as StudioNode
}

function edge(id: string, source: string, sh: string, target: string, th: string): StudioEdge {
  return { id, source, target, sourceHandle: sh, targetHandle: th } as unknown as StudioEdge
}

/** A pattern group rendering one flat colour, so a frame names its pattern. */
function solidGroup(blue: number) {
  return {
    nodes: [node('sc', 'SolidColor', { r: 0, g: 0, b: blue }), node('go', 'GroupOutput', {})],
    edges: [edge('eg', 'sc', 'frame', 'go', 'frame')],
  }
}

const IDS = ['grp-a', 'grp-b', 'grp-c', 'grp-d']
const GROUPS = Object.fromEntries(IDS.map((id, i) => [id, solidGroup((i + 1) * 10)]))

/**
 * One frame of a slideshow, at `seconds` of show time.
 *
 * `evaluateGraph` takes a frame count and divides by 60 to get seconds, so a
 * test that wants an interval to elapse has to count in frames.
 */
function runSlideshow(props: Record<string, unknown>, seconds: number, extra: {
  nodes?: StudioNode[]
  edges?: StudioEdge[]
  audioOverride?: AudioSignal | null
} = {}) {
  const nodes = [
    node('coll', 'PatternCollection', { patternIds: IDS }),
    node('show', 'PatternSlideshow', props),
    node('out', 'MatrixOutput', {}),
    ...(extra.nodes ?? []),
  ]
  const edges = [
    edge('e1', 'coll', 'patternset', 'show', 'patternset'),
    edge('e2', 'show', 'frame', 'out', 'frame'),
    ...(extra.edges ?? []),
  ]
  return evaluateGraph(
    nodes, edges, seconds * 60, 4, 4, GROUPS,
    '', new Set(), {}, extra.audioOverride ?? null, true, nodes, seconds * 60,
  )
}

const playingIndex = () => getPatternShowSelection('show')!.currentIndex

describe('slideshowSettings', () => {
  it('reads one interval, not a range', () => {
    expect(slideshowSettings({ interval: 45 }).intervalSec).toBe(45)
    // Below a second a slideshow is a strobe, so the floor is the resolver's
    // rather than something each of the two readers applies its own way.
    expect(slideshowSettings({ interval: 0.1 }).intervalSec).toBe(1)
    expect(slideshowSettings({}).intervalSec).toBe(20)
  })

  it('lets a wired interval take over from the property', () => {
    expect(slideshowSettings({ interval: 20 }, 5).intervalSec).toBe(5)
    expect(slideshowSettings({ interval: 20 }, null).intervalSec).toBe(20)
  })

  it('reports transitions off as a zero-length fade', () => {
    // Both the evaluator and the generator already render a zero-length
    // transition as a cut, so "off" needs no second code path in either.
    expect(slideshowSettings({ transitionsEnabled: false, transitionSec: 2 }).transitionSec).toBe(0)
    expect(slideshowSettings({ transitionSec: 2 }).transitionSec).toBe(2)
    // A deliberate zero with transitions on is left alone rather than floored
    // up to a default the user did not ask for.
    expect(slideshowSettings({ transitionsEnabled: true, transitionSec: 0 }).transitionSec).toBe(0)
  })

  it('defaults to a random order and to not reacting', () => {
    expect(slideshowSettings({}).order).toBe('Random')
    expect(slideshowSettings({}).audioReactive).toBe(false)
    expect(asSlideshowOrder('Sequential')).toBe('Sequential')
    expect(asSlideshowOrder('nonsense')).toBe('Random')
  })

  it('uses real elapsed time to fade down on silence and restore on sound', () => {
    const halfDark = advanceSlideshowSilenceFade(1, 0, 0.25)
    expect(halfDark).toBe(0.5)
    expect(advanceSlideshowSilenceFade(halfDark, 0, 0.25)).toBe(0)
    expect(advanceSlideshowSilenceFade(0, 0.5, 0.125)).toBe(0.5)
    expect(advanceSlideshowSilenceFade(0.5, 0.5, 0.125)).toBe(1)
  })
})

describe('a running Pattern Slideshow', () => {
  beforeEach(() => resetEvaluatorState())

  it('starts at the top of the collection and walks it in order', () => {
    const props = { order: 'Sequential', interval: 1, transitionsEnabled: false }
    runSlideshow(props, 0)
    expect(playingIndex()).toBe(0)
    // Past one interval with no transition, so the advance is a cut and the
    // next frame is already the next pattern.
    runSlideshow(props, 1.1)
    runSlideshow(props, 1.2)
    expect(playingIndex()).toBe(1)
    runSlideshow(props, 2.3)
    runSlideshow(props, 2.4)
    expect(playingIndex()).toBe(2)
  })

  it('holds a pattern for the interval it was given', () => {
    const props = { order: 'Sequential', interval: 10, transitionsEnabled: false }
    runSlideshow(props, 0)
    runSlideshow(props, 9.5)
    expect(playingIndex()).toBe(0)
  })

  it('moves the running pattern the moment a control steps, with no confirm', () => {
    // The player's browse-then-confirm split exists so scrolling past a
    // pattern does not play it. A slideshow has no second cursor to show
    // anybody, so a step is the change — and the panel never reads "browsing".
    const props = { order: 'Sequential', interval: 9999 }
    const extra = {
      nodes: [node('ctl', 'PlayerControls', {}), node('knob', 'PotInput', { pin: 34 })],
      edges: [
        edge('ek', 'knob', 'value', 'ctl', 'patternSelect'),
        edge('ec', 'ctl', 'controls', 'show', 'controls'),
      ],
    }
    // The first reading of a running count is never travel, so this frame
    // only parks the encoder where it already is.
    useHardwareInputStore.getState().setPot('knob', 0)
    runSlideshow(props, 0, extra)
    expect(playingIndex()).toBe(0)

    // One detent — four quadrature counts — is one pattern, applied here.
    useHardwareInputStore.getState().setPot('knob', ENCODER_COUNTS_PER_STEP)
    runSlideshow(props, 0.1, extra)
    expect(playingIndex()).toBe(1)
    expect(getPatternShowSelection('show')!.browsing).toBe(false)
    expect(getPatternShowSelection('show')!.highlightIndex).toBe(1)
  })

  it('fades the rendered pattern to black during silence only in audio-reactive mode', () => {
    const provider = node('mic-provider', 'MicInput')
    const audioNode = node('audio', 'Audio', { sourceId: 'mic-provider' })
    const silent: AudioSignal = {
      active: true,
      micActive: true,
      micBass: 0,
      micMids: 0,
      micTreble: 0,
      spectrum: [],
      detectorSpectrum: [],
    }
    const extra = {
      nodes: [provider, audioNode],
      edges: [edge('ea', 'audio', 'audio', 'show', 'audio')],
      audioOverride: silent,
    }
    const props = { audioReactive: true, order: 'Sequential', interval: 9999, transitionsEnabled: false }

    const lit = runSlideshow(props, 0, extra)!
    const halfway = runSlideshow(props, 0.25, extra)!
    const black = runSlideshow(props, 0.5, extra)!

    expect(lit[0][0].b).toBe(10)
    expect(halfway[0][0].b).toBe(5)
    expect(black[0][0]).toEqual({ r: 0, g: 0, b: 0 })

    resetEvaluatorState()
    const unchanged = runSlideshow({ ...props, audioReactive: false }, 1, extra)!
    expect(unchanged[0][0].b).toBe(10)
  })
})

describe('what the graph refuses', () => {
  const collection = node('coll', 'PatternCollection', { patternIds: IDS })
  const out = node('out', 'MatrixOutput', {})

  it('tells a Music Player with no card what it is missing, and names the Slideshow', () => {
    // This used to be the music-free show: a Music Player with nothing to play
    // built the show sketch, so the two workflows were indistinguishable on the
    // canvas and an incomplete player looked like a working graph.
    const { errors } = validateGraph(
      [collection, node('master', 'PatternMaster', {}), out],
      [
        edge('e1', 'coll', 'patternset', 'master', 'patternset'),
        edge('e2', 'master', 'frame', 'out', 'frame'),
      ],
    )
    expect(errors.join(' ')).toContain('missing an SD card and an amplifier')
    expect(errors.join(' ')).toContain('Pattern Slideshow')
  })

  it('refuses to point a Slideshow at the Audio Decoder', () => {
    // The decoder is the player's own audio. A slideshow plays no files, so
    // there is no decoded stream to analyse — caught here rather than on a
    // bench, where it presents as a microphone that never hears anything.
    const audio = node('audio', 'Audio', { sourceId: 'kind:decoder' })
    const { errors } = validateGraph(
      [collection, node('show', 'PatternSlideshow', {}), out, audio],
      [
        edge('e1', 'coll', 'patternset', 'show', 'patternset'),
        edge('e2', 'show', 'frame', 'out', 'frame'),
        edge('e3', 'audio', 'audio', 'show', 'audio'),
      ],
    )
    expect(errors.join(' ')).toContain('cannot listen to the Audio Decoder')
  })

  it('accepts a live source', () => {
    const audio = node('audio', 'Audio', { sourceId: 'kind:microphone' })
    const { errors } = validateGraph(
      [collection, node('show', 'PatternSlideshow', {}), out, audio],
      [
        edge('e1', 'coll', 'patternset', 'show', 'patternset'),
        edge('e2', 'show', 'frame', 'out', 'frame'),
        edge('e3', 'audio', 'audio', 'show', 'audio'),
      ],
    )
    expect(errors.join(' ')).not.toContain('Audio Decoder')
  })
})
