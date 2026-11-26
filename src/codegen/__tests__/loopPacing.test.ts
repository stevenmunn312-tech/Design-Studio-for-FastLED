import { describe, expect, it } from 'vitest'
import { isLoopPacing, loopPacingCpp, withLoopPacing } from '../loopPacing'
import { generateCpp } from '../cppGenerator'
import { generateShowSketch } from '../showGenerator'
import { buildShowPlayer } from '../../utils/showUpload'
import { NODE_LIBRARY, libraryDefaults } from '../../state/nodeLibrary'
import type { StudioEdge, StudioNode } from '../../state/graphStore'
import type { GroupRegistry } from '../../state/graphEvaluator'

/**
 * Every loop ends in one wait for a fixed deadline, never `FastLED.delay`.
 *
 * FastLED 3.10.9's `delay` re-sends the frame until the time is up, so a
 * frame went out at least twice and the sleep added to the work. The pacing
 * function is added from the finished sketch text, so these hold the three
 * generators to the same function and the form to what the build sends.
 */

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
    label: nodeType, nodeType, category: definition?.category ?? 'output',
    properties: { ...libraryDefaults(nodeType), ...properties },
    inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
  } } as StudioNode
}

const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge =>
  ({ id: `${source}-${target}`, source, sourceHandle, target, targetHandle }) as StudioEdge

const groups = {
  pattern: {
    nodes: [node('fill', 'SolidColor'), node('end', 'GroupOutput')],
    edges: [edge('fill', 'frame', 'end', 'frame')],
  },
} as unknown as GroupRegistry

const board = node('board', 'Board', { profileId: 'generic-esp32-s3-n16r8-44pin-dual-usbc', frameRate: 30 })
const strip = node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 4 })

const SKETCHES = [
  {
    name: 'normal sketch',
    build: () => generateCpp([board, strip, node('fill', 'SolidColor')], [edge('fill', 'frame', 'out', 'frame')]),
  },
  {
    name: 'generative show',
    build: () => generateShowSketch(
      [board, strip, node('collection', 'PatternCollection', { patternIds: ['pattern'] }), node('show', 'PatternSlideshow')],
      [edge('collection', 'patternset', 'show', 'patternset'), edge('show', 'frame', 'out', 'frame')],
      groups,
    ),
  },
  {
    name: 'SD player',
    build: () => buildShowPlayer(
      [board, strip, node('player', 'PatternMaster'), node('sd', 'SDCard'), node('amp', 'Amplifier')],
      [edge('player', 'frame', 'out', 'frame')],
      groups,
      { patternSet: ['pattern'], bakedAudio: false, genericPlayer: true, preferredTrack: '' },
    ),
  },
] as const

describe('loop pacing', () => {
  for (const sketch of SKETCHES) {
    it(`${sketch.name} paces to a deadline once, at the end of loop()`, () => {
      const lines = sketch.build().split('\n')
      expect(lines.join('\n')).not.toContain('FastLED.delay')
      const loopAt = lines.indexOf('void loop() {')
      const loopEnd = lines.indexOf('}', loopAt)
      const paces = lines.filter(isLoopPacing)
      expect(paces).toEqual(['  _paceFrame(33333);  // ~30 fps'])
      expect(lines.indexOf(paces[0])).toBe(loopEnd - 1)
      const helperAt = lines.indexOf('void _paceFrame(uint32_t periodUs) {')
      expect(helperAt).toBeGreaterThan(-1)
      expect(helperAt).toBeLessThan(loopAt)
      expect(lines.filter((line) => line === 'void _paceFrame(uint32_t periodUs) {')).toHaveLength(1)
      // A sketch that sends keeps the dither refreshes that fit.
      expect(lines).toContain('static uint32_t _paceSendUs = 0;  // one measured FastLED.show(), 0 until measured')
    })
  }

  it('only sleeps when nothing is sent through FastLED', () => {
    const source = withLoopPacing(['void setup() {', '}', 'void loop() {', loopPacingCpp(60), '}'].join('\n'))
    expect(source).toContain('void _paceFrame(uint32_t periodUs) {')
    expect(source).not.toContain('FastLED')
  })

  it('does not count a send that is only mentioned in a comment', () => {
    const source = withLoopPacing([' * calls FastLED.show();', 'void loop() {', '  // FastLED.show();', loopPacingCpp(60), '}'].join('\n'))
    expect(source).not.toContain('_paceSendUs')
  })

  it('leaves a sketch without the pacing call alone', () => {
    const source = ['void loop() {', '  delay(5);', '}'].join('\n')
    expect(withLoopPacing(source)).toBe(source)
  })

  it('adds the function once however often it is applied', () => {
    const once = withLoopPacing(['void loop() {', '  FastLED.show();', loopPacingCpp(60), '}'].join('\n'))
    expect(withLoopPacing(once)).toBe(once)
  })

  // Sampled once a frame, a detent whose middle state was shorter than a frame
  // read as no movement. The wait polls the encoder about once a millisecond.
  it('polls a rotary encoder through the wait, in both forms', () => {
    const body = ['static void _encPoll_knob() {', '}', 'void loop() {', '  _encPoll_knob();']
    const sending = withLoopPacing([...body, '  FastLED.show();', loopPacingCpp(60), '}'].join('\n'))
    expect(sending).toContain('    _encPoll_knob();')
    expect(sending).toContain('while ((left = (int32_t)(_paceDeadlineUs - micros())) > 1000) { _encPoll_knob(); delay(1); }')
    const sleeping = withLoopPacing([...body, loopPacingCpp(60), '}'].join('\n'))
    expect(sleeping).toContain('{ _encPoll_knob(); delay(1); }')
    // Without one the wait is the single sleep it always was.
    const plain = withLoopPacing(['void loop() {', '  FastLED.show();', loopPacingCpp(60), '}'].join('\n'))
    expect(plain).not.toContain('while ((left')
    expect(plain).toContain('      delay((uint32_t)left / 1000ul);')
  })

  // An AVR sends LEDs with interrupts off, and IRremote samples from a timer
  // interrupt, so a send across an IR code cuts it short.
  describe('with an IR receiver on a board that sends with interrupts off', () => {
    const sketch = ['#include <IRremote.hpp>', 'void loop() {', '  FastLED.show();', loopPacingCpp(60), '}'].join('\n')

    it('sends only while the receiver is idle and sends nothing in the wait', () => {
      const quiet = withLoopPacing(sketch, { sendsBlockInterrupts: true })
      expect(quiet).toContain('  if (IrReceiver.isIdle()) FastLED.show();')
      expect(quiet.match(/FastLED\.show\(\);/g)).toHaveLength(1)
      expect(quiet).not.toContain('_paceSendUs')
    })

    it('leaves every other board and an IR-free sketch as they were', () => {
      expect(withLoopPacing(sketch)).toContain('_paceSendUs')
      expect(withLoopPacing(sketch)).not.toContain('isIdle')
      const noIr = withLoopPacing(sketch.replace('#include <IRremote.hpp>\n', ''), { sendsBlockInterrupts: true })
      expect(noIr).not.toContain('isIdle')
      expect(noIr).toContain('_paceSendUs')
    })
  })
})
