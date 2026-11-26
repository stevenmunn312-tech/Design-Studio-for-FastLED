import { beforeEach, describe, expect, it } from 'vitest'
import type { StudioEdge, StudioNode } from '../../graphStore'
import { NODE_LIBRARY, libraryDefaults } from '../../nodeLibrary'
import { FIRST_BUTTON_HANDLE } from '../../player/buttonBank'
import { evaluateGraphFull } from '../../graphEvaluator'
import { resetEvaluatorState } from '../../evaluator/memory'
import { useAudioStore } from '../audioStore'
import { useDecoderAudioStore } from '../decoderAudioStore'
import {
  audioSourcePosition,
  audioSourceSwitchFor,
  audioSwitchProblems,
  audioSwitchSources,
  blankAudioSourceSwitchState,
  esp32I2sPortCount,
  previewCaptureSource,
  stepAudioSourceSwitch,
} from '../audioSourceSwitch'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  if (!definition) throw new Error(`no node type ${nodeType}`)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: definition.label, nodeType, category: definition.category,
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition.inputs, outputs: definition.outputs,
    },
  } as StudioNode
}

const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge =>
  ({ id: `${source}-${sourceHandle}-${target}-${targetHandle}`, source, sourceHandle, target, targetHandle }) as StudioEdge

const mic = () => node('mic', 'MicInput', { partId: 'inmp441-i2s-microphone' })
const lineIn = () => node('line', 'LineInput')
const player = () => [node('sd', 'SDCard'), node('amp', 'Amplifier'), node('master', 'PatternMaster')]

describe('audio source switch: which sources', () => {
  it('cycles only through the sources on the bench, in the menu order', () => {
    expect(audioSwitchSources([]).map((source) => source.kind)).toEqual([])
    expect(audioSwitchSources([mic()]).map((source) => source.kind)).toEqual(['microphone'])
    // The decoder needs the player, the card and the amplifier, as the menu does.
    expect(audioSwitchSources([...player(), mic()]).map((source) => source.kind)).toEqual(['microphone', 'decoder'])
    expect(audioSwitchSources([node('sd', 'SDCard'), mic()]).map((source) => source.kind)).toEqual(['microphone'])
    expect(audioSwitchSources([...player(), lineIn(), mic()]).map((source) => source.kind))
      .toEqual(['microphone', 'line-in', 'decoder'])
  })

  it('finds the wired switch and starts on the body’s choice when it is on the bench', () => {
    const nodes = [...player(), mic(), node('audio', 'Audio', { sourceId: 'kind:decoder' }), node('press', 'Compare')]
    const sw = audioSourceSwitchFor(nodes, [edge('press', 'result', 'audio', 'select')])
    expect(sw?.drive).toBe('press')
    expect(sw?.startIndex).toBe(1)
    expect(audioSourceSwitchFor(nodes, [])).toBeNull()
    // A choice not on the bench starts on the first source.
    const lineChoice = nodes.map((entry) => entry.id === 'audio' ? node('audio', 'Audio', { sourceId: 'kind:line-in' }) : entry)
    expect(audioSourceSwitchFor(lineChoice, [edge('press', 'result', 'audio', 'select')])?.startIndex).toBe(0)
  })

  it('reads a switch output as a press and anything else as a position', () => {
    const nodes = [mic(), node('audio', 'Audio'), node('knob', 'EncoderInput'), node('button', 'ButtonBank')]
    expect(audioSourceSwitchFor(nodes, [edge('knob', 'position', 'audio', 'select')])?.drive).toBe('position')
    expect(audioSourceSwitchFor(nodes, [edge('knob', 'level', 'audio', 'select')])?.drive).toBe('position')
    expect(audioSourceSwitchFor(nodes, [edge('knob', 'pressed', 'audio', 'select')])?.drive).toBe('press')
    expect(audioSourceSwitchFor(nodes, [edge('button', FIRST_BUTTON_HANDLE, 'audio', 'select')])?.drive).toBe('press')
  })

  it('keeps the browser listening while the switch can reach a microphone', () => {
    const nodes = [...player(), mic(), node('audio', 'Audio', { sourceId: 'kind:decoder' }), node('press', 'Compare')]
    expect(previewCaptureSource(nodes, [])).toBeNull()
    expect(previewCaptureSource(nodes, [edge('press', 'result', 'audio', 'select')])?.kind).toBe('microphone')
  })
})

describe('audio source switch: stepping', () => {
  it('picks by whole position, wrapping both ways', () => {
    expect([0, 1, 2, 3, -1, -2].map((value) => audioSourcePosition(value, 2))).toEqual([0, 1, 0, 1, 1, 0])
    expect([0, 1, 2, 3, -1].map((value) => audioSourcePosition(value, 3))).toEqual([0, 1, 2, 0, 2])
    // An Encoder's Level: below one half is the first source, above it the second.
    expect([0, 0.3, 0.49, 0.5, 0.8, 1].map((value) => audioSourcePosition(value, 2))).toEqual([0, 0, 0, 1, 1, 1])
    expect(audioSourcePosition(Number.NaN, 2)).toBe(0)
    expect(audioSourcePosition(1, 0)).toBe(0)
  })

  it('selects a number on its first pass and on each change only', () => {
    const state = blankAudioSourceSwitchState(1, 0)
    expect(stepAudioSourceSwitch(state, 'position', 0, 2, 0)).toBe(0)
    expect(stepAudioSourceSwitch(state, 'position', 0.2, 2, 16)).toBe(0)
    expect(stepAudioSourceSwitch(state, 'position', 1, 2, 32)).toBe(1)
    expect(stepAudioSourceSwitch(state, 'position', 2, 2, 48)).toBe(0)
  })

  it('steps once per debounced press, never repeating while held', () => {
    const state = blankAudioSourceSwitchState(0, 0)
    const at = (pressed: boolean, ms: number) => stepAudioSourceSwitch(state, 'press', pressed, 2, ms, 'ButtonBank')
    expect(at(true, 0)).toBe(0)
    expect(at(true, 40)).toBe(1)  // past the 30 ms contact debounce
    expect(at(true, 2000)).toBe(1) // held: no repeat
    expect(at(false, 2100)).toBe(1)
    expect(at(false, 2140)).toBe(1)
    expect(at(true, 2200)).toBe(1)
    expect(at(true, 2240)).toBe(0) // wraps
    // A computed pulse is taken at once.
    const pulse = blankAudioSourceSwitchState(0, 0)
    expect(stepAudioSourceSwitch(pulse, 'press', true, 3, 1, 'Compare')).toBe(1)
  })
})

describe('audio source switch: what cannot work', () => {
  const nodes = [...player(), mic(), node('audio', 'Audio'), node('press', 'Compare')]
  const sw = () => audioSourceSwitchFor(nodes, [edge('press', 'result', 'audio', 'select')])!

  it('says when there is nothing to switch to', () => {
    const only = audioSourceSwitchFor([mic(), node('audio', 'Audio'), node('press', 'Compare')], [edge('press', 'result', 'audio', 'select')])!
    expect(audioSwitchProblems(only, { buildMode: 'sketch' })).toEqual([{
      severity: 'warning',
      message: 'Audio: Source switches between the audio sources on the bench, but only the Microphone is there. Add a Microphone or Line In part, or a Music Player with music and an amplifier, to switch to.',
    }])
  })

  it('counts I2S ports by ESP32 family', () => {
    expect(esp32I2sPortCount('esp32:esp32:esp32s3')).toBe(2)
    expect(esp32I2sPortCount('esp32:esp32:esp32')).toBe(2)
    expect(esp32I2sPortCount('esp32:esp32:esp32c3')).toBe(1)
    expect(esp32I2sPortCount('esp32:esp32:esp32s2')).toBe(1)
    expect(esp32I2sPortCount('teensy:avr:teensy41')).toBeUndefined()
  })

  it('refuses two I2S sources on a one-port chip and passes an ESP32-S3', () => {
    expect(audioSwitchProblems(sw(), { buildMode: 'player', fqbn: 'esp32:esp32:esp32s3', boardLabel: 'ESP32-S3-DevKitC-1' })).toEqual([])
    expect(audioSwitchProblems(sw(), { buildMode: 'player', fqbn: 'esp32:esp32:esp32c3', boardLabel: 'ESP32-C3' })).toEqual([{
      severity: 'error',
      message: 'Audio: the ESP32-C3 has one I2S port, so the Microphone and the Audio Decoder cannot run at once. Switch between them on an ESP32 or ESP32-S3, which have two.',
    }])
  })

  it('refuses three I2S sources on two ports', () => {
    const three = audioSourceSwitchFor([...nodes, lineIn()], [edge('press', 'result', 'audio', 'select')])!
    expect(audioSwitchProblems(three, { buildMode: 'player', fqbn: 'esp32:esp32:esp32s3', boardLabel: 'ESP32-S3' })[0]).toMatchObject({
      severity: 'error',
      message: 'Audio: the ESP32-S3 has 2 I2S ports, and the Microphone, the Line Input, the Audio Decoder need 3. Remove one of them from the bench to switch between the others.',
    })
  })

  it('warns that a slideshow listens to one source', () => {
    expect(audioSwitchProblems(sw(), { buildMode: 'show' })).toEqual([{
      severity: 'warning',
      message: 'Audio: Source switching runs in a single-board sketch or a Music Player build. This slideshow listens to the Microphone only.',
    }])
  })
})

describe('audio source switch: preview', () => {
  beforeEach(() => resetEvaluatorState())

  it('feeds the Audio node from the source the switch picks', () => {
    const nodes = [...player(), mic(), node('audio', 'Audio', { sourceId: 'kind:microphone' }), node('pick', 'Constant', { value: 1 })]
    const edges = [edge('pick', 'value', 'audio', 'select')]
    let out = evaluateGraphFull(nodes, edges, 0).outputs.get('audio')!
    expect(out.activeSource).toBe('decoder')
    expect(out.audio).toBe(useDecoderAudioStore.getState())
    const back = nodes.map((entry) => entry.id === 'pick' ? node('pick', 'Constant', { value: 2 }) : entry)
    out = evaluateGraphFull(back, edges, 1).outputs.get('audio')!
    expect(out.activeSource).toBe('microphone')
    expect(out.audio).toBe(useAudioStore.getState())
  })

  it('leaves an unwired Audio node on the body’s choice', () => {
    const nodes = [...player(), mic(), node('audio', 'Audio', { sourceId: 'kind:decoder' })]
    const out = evaluateGraphFull(nodes, [], 0).outputs.get('audio')!
    expect(out.activeSource).toBeUndefined()
    expect(out.audio).toBe(useDecoderAudioStore.getState())
  })
})
