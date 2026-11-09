// The music-free pattern player.
//
// What is worth testing here is what the slideshow resolves itself and what
// differs from the Music Player: the show engine is `evalPatternShow`, covered
// by patternShowSelection.ts and the show generator's own tests. So: the
// player's timing read through the slideshow's resolver, a stated order,
// reactivity as a switch, beat timing that reads the wire anyway, and a pattern
// change that lands immediately because there is no browse/confirm split.

import { describe, it, expect, beforeEach } from 'vitest'
import { evaluateGraph, getPatternShowSelection, resetEvaluatorState, type AudioSignal } from '../../graphEvaluator'
import { NODE_LIBRARY } from '../../nodeLibrary'
import { advanceSlideshowSilenceFade, slideshowSettings, asSlideshowOrder } from '../patternSlideshow'
import { validateGraph } from '../../../utils/validateGraph'
import { useHardwareInputStore } from '../../peripherals/hardwareInputStore'
import type { StudioNode, StudioEdge } from '../../graphStore'

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
  const reactive = { audioReactive: true }

  // Interval was the same setting shown twice: without Audio Reactive the
  // resolver set Min = Max = Interval, so turning on Energy Pacing had no
  // range to lean within. The hold is Min to Max Time either way now.
  it('reads the Music Player\'s min and max hold with or without Audio Reactive', () => {
    for (const mode of [{}, reactive]) {
      expect(slideshowSettings({ ...mode, minTime: 10, maxTime: 45 })).toMatchObject({ minTime: 10, maxTime: 45 })
      // Below a second a slideshow is a strobe, so the floor is the resolver's
      // rather than something each of the two readers applies its own way.
      expect(slideshowSettings({ ...mode, minTime: 0.1, maxTime: 0.1 })).toMatchObject({ minTime: 1, maxTime: 1 })
      // A max below the min is the min, as on the player.
      expect(slideshowSettings({ ...mode, minTime: 30, maxTime: 5 }).maxTime).toBe(30)
      // An unequal default, so pacing has a range to lean within.
      expect(slideshowSettings(mode)).toMatchObject({ minTime: 8, maxTime: 30 })
    }
    // A saved Interval is not read: it was removed rather than migrated.
    expect(slideshowSettings({ ['interval']: 12 })).toMatchObject({ minTime: 8, maxTime: 30 })
  })

  it('lets wired timing take over from the properties', () => {
    expect(slideshowSettings({ ...reactive, minTime: 20, maxTime: 40, transitionSec: 1 }, { minTime: 5, maxTime: 8, transitionSec: 3 }))
      .toMatchObject({ minTime: 5, maxTime: 8, transitionSec: 3 })
    expect(slideshowSettings({ ...reactive, minTime: 20, maxTime: 40 }, { minTime: null })).toMatchObject({ minTime: 20, maxTime: 40 })
    // Without Audio Reactive too: the sockets do not depend on the mode.
    expect(slideshowSettings({ minTime: 20, maxTime: 40 }, { minTime: 2, maxTime: 3 })).toMatchObject({ minTime: 2, maxTime: 3 })
    // A wired Transition opens a fade the property set to a cut.
    expect(slideshowSettings({ transitionSec: 0 }, { transitionSec: 3 }).transitionSec).toBe(3)
  })

  it('reads the player\'s timing switches only with Audio Reactive, all off by default', () => {
    const switches = { beatTransitions: true, energyPacing: true, dwellsAndBursts: true }
    expect(slideshowSettings(reactive)).toMatchObject({ beatTransitions: false, energyPacing: false, dwellsAndBursts: false })
    expect(slideshowSettings({ ...reactive, ...switches })).toMatchObject(switches)
    expect(slideshowSettings(switches)).toMatchObject({ beatTransitions: false, energyPacing: false, dwellsAndBursts: false })
  })

  it('runs Beat Transitions as a timer when nothing that can beat is wired', () => {
    // The node draws the row disabled with neither Beat nor Audio wired, so
    // the switch must not leave the show waiting for a beat that never comes.
    const props = { ...reactive, beatTransitions: true }
    expect(slideshowSettings(props, { beatSource: false }).beatTransitions).toBe(false)
    expect(slideshowSettings(props, { beatSource: true }).beatTransitions).toBe(true)
    // Omitted, the property alone decides, as every other reader expects.
    expect(slideshowSettings(props).beatTransitions).toBe(true)
  })

  // The Transitions switch went: off and Transition 0 both gave a cut, so
  // the duration alone says it.
  it('reads Transition 0 as a cut, and leaves it there', () => {
    expect(slideshowSettings({ transitionSec: 2 }).transitionSec).toBe(2)
    // A deliberate zero is left alone rather than floored up to a default the
    // user did not ask for.
    expect(slideshowSettings({ transitionSec: 0 }).transitionSec).toBe(0)
    expect(slideshowSettings({}).transitionSec).toBe(1.5)
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
    const props = { order: 'Sequential', minTime: 1, maxTime: 1, transitionSec: 0 }
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

  it('holds a pattern for the hold it was given', () => {
    const props = { order: 'Sequential', minTime: 10, maxTime: 10, transitionSec: 0 }
    runSlideshow(props, 0)
    runSlideshow(props, 9.5)
    expect(playingIndex()).toBe(0)
  })

  it('draws each hold between Min Time and Max Time', () => {
    const props = { audioReactive: true, order: 'Sequential', minTime: 2, maxTime: 4, transitionSec: 0, seed: 7 }
    // The hold is measured frame by frame, so every frame of the range runs.
    let changedAt: number | null = null
    for (let frame = 0; frame <= 5 * 60 && changedAt === null; frame++) {
      runSlideshow(props, frame / 60)
      if (playingIndex() !== 0) changedAt = frame / 60
    }
    expect(changedAt).not.toBeNull()
    expect(changedAt!).toBeGreaterThanOrEqual(2)
    expect(changedAt!).toBeLessThanOrEqual(4 + 1 / 30)
  })

  it('waits for a beat after the hold when Beat Transitions is on', () => {
    const provider = node('mic-provider', 'MicInput')
    const audioNode = node('audio', 'Audio', { sourceId: 'mic-provider' })
    const sound = (beat: boolean): AudioSignal => ({
      active: true, micActive: true, beat,
      micBass: 0.5, micMids: 0.5, micTreble: 0.5,
      spectrum: [], detectorSpectrum: [],
    })
    const extra = (beat: boolean) => ({
      nodes: [provider, audioNode],
      edges: [edge('ea', 'audio', 'audio', 'show', 'audio')],
      audioOverride: sound(beat),
    })
    const props = { order: 'Sequential', audioReactive: true, minTime: 1, maxTime: 1, transitionSec: 0, beatTransitions: true }
    runSlideshow(props, 0, extra(false))
    runSlideshow(props, 2, extra(false))
    runSlideshow(props, 2.1, extra(false))
    // Well past the hold, and still no beat.
    expect(playingIndex()).toBe(0)
    runSlideshow(props, 2.2, extra(true))
    runSlideshow(props, 2.3, extra(true))
    expect(playingIndex()).toBe(1)
  })

  it('takes a wired Beat over the Audio wire\'s detector, as the Music Player does', () => {
    const provider = node('mic-provider', 'MicInput')
    const audioNode = node('audio', 'Audio', { sourceId: 'mic-provider' })
    const button = node('btn', 'ButtonInput', { pin: 12 })
    const beating: AudioSignal = {
      active: true, micActive: true, beat: true,
      micBass: 0.5, micMids: 0.5, micTreble: 0.5,
      spectrum: [], detectorSpectrum: [],
    }
    const extra = {
      nodes: [provider, audioNode, button],
      edges: [
        edge('ea', 'audio', 'audio', 'show', 'audio'),
        edge('eb', 'btn', 'pressed', 'show', 'beat'),
      ],
      audioOverride: beating,
    }
    const props = { order: 'Sequential', audioReactive: true, minTime: 1, maxTime: 1, transitionSec: 0, beatTransitions: true }
    useHardwareInputStore.getState().setButton('btn', false)
    runSlideshow(props, 0, extra)
    runSlideshow(props, 2, extra)
    runSlideshow(props, 2.1, extra)
    // The Audio wire beats on every frame, and the show ignores it: the
    // wired Beat is the beat, and the button is up.
    expect(playingIndex()).toBe(0)
    useHardwareInputStore.getState().setButton('btn', true)
    runSlideshow(props, 2.2, extra)
    runSlideshow(props, 2.3, extra)
    expect(playingIndex()).toBe(1)
  })

  it('waits on a wired Beat with no Audio at all', () => {
    const button = node('btn', 'ButtonInput', { pin: 12 })
    const extra = { nodes: [button], edges: [edge('eb', 'btn', 'pressed', 'show', 'beat')] }
    const props = { order: 'Sequential', audioReactive: true, minTime: 1, maxTime: 1, transitionSec: 0, beatTransitions: true }
    useHardwareInputStore.getState().setButton('btn', false)
    runSlideshow(props, 0, extra)
    runSlideshow(props, 2, extra)
    expect(playingIndex()).toBe(0)
    useHardwareInputStore.getState().setButton('btn', true)
    runSlideshow(props, 2.1, extra)
    runSlideshow(props, 2.2, extra)
    expect(playingIndex()).toBe(1)
  })

  it('changes on the timer when Beat Transitions has nothing wired to beat', () => {
    // The disabled row means what it says: no Beat, no Audio, no waiting.
    const props = { order: 'Sequential', audioReactive: true, minTime: 1, maxTime: 1, transitionSec: 0, beatTransitions: true }
    runSlideshow(props, 0)
    runSlideshow(props, 2, {})
    runSlideshow(props, 2.1, {})
    expect(playingIndex()).toBe(1)
  })

  it('moves the running pattern the moment a control steps, with no confirm', () => {
    // Without transitions a step is a cut, so the LEDs change on this frame.
    const props = { order: 'Sequential', minTime: 9999, maxTime: 9999, transitionSec: 0 }
    const extra = {
      nodes: [node('ctl', 'ControlMap', {}), node('knob', 'PotInput', { pin: 34 })],
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

    // Pattern Select takes clicks, as an Encoder's Position reads: one click
    // is one pattern, applied here.
    useHardwareInputStore.getState().setPot('knob', 1)
    runSlideshow(props, 0.1, extra)
    expect(playingIndex()).toBe(1)
    expect(getPatternShowSelection('show')!.transitioning).toBe(false)
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
    const props = { audioReactive: true, order: 'Sequential', minTime: 9999, maxTime: 9999, transitionSec: 0 }

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

  it('refuses an audio-reactive Slideshow with no audio wired', () => {
    // Every frame is silence, so the fade would hold the LEDs black.
    const wiring = [
      edge('e1', 'coll', 'patternset', 'show', 'patternset'),
      edge('e2', 'show', 'frame', 'out', 'frame'),
    ]
    const deaf = validateGraph([collection, node('show', 'PatternSlideshow', { audioReactive: true }), out], wiring)
    expect(deaf.errors.join(' ')).toContain('Audio-reactive Pattern Slideshow has no audio')
    const still = validateGraph([collection, node('show', 'PatternSlideshow', { audioReactive: false }), out], wiring)
    expect(still.errors.join(' ')).not.toContain('has no audio')
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
    expect(errors.join(' ')).not.toContain('has no audio')
  })
})
