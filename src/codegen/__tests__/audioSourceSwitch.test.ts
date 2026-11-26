import { describe, expect, it } from 'vitest'
import type { StudioEdge, StudioNode } from '../../state/graphStore'
import type { GroupRegistry } from '../../state/graphEvaluator'
import { NODE_LIBRARY, libraryDefaults } from '../../state/nodeLibrary'
import { FIRST_BUTTON_HANDLE } from '../../state/player/buttonBank'
import { generateCpp } from '../cppGenerator'
import { buildShowPlayer } from '../../utils/showUpload'
import { findAudioSourceSwitchIssues, findDeployBlockingErrors } from '../../utils/validateGraph'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = nodeType === 'GroupOutput'
    ? { label: 'Group Output', category: 'composite', inputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }], outputs: [] }
    : NODE_LIBRARY.find((entry) => entry.type === nodeType)
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

const S3 = 'esp32:esp32:esp32s3'

const group = (inner: StudioNode[], edges: StudioEdge[]) => ({ nodes: [...inner, node('go', 'GroupOutput')], edges })
const groups = {
  reactive: group([node('au', 'Audio', { sourceId: 'kind:decoder' }), node('fft', 'FFTAnalyzer'), node('sc', 'SolidColor', { b: 60 })],
    [edge('au', 'audio', 'fft', 'audio'), edge('fft', 'bass', 'sc', 'r'), edge('sc', 'frame', 'go', 'frame')]),
  plasma: group([node('pl', 'Plasma')], [edge('pl', 'frame', 'go', 'frame')]),
} as unknown as GroupRegistry

/** The sound shelf: an S3 Music Player with a card, an amp, a mic and a VU meter. */
function shelf(boardId = 'espressif-esp32-s3-devkitc-1', control?: [StudioNode, string]) {
  const nodes = [node('board', 'Board', { profileId: boardId }),
    node('amp', 'Amplifier', { i2sBclk: 15, i2sLrc: 16, i2sDout: 17 }),
    node('sd', 'SDCard', { sdCsPin: 10, sdSckPin: 12, sdMisoPin: 13, sdMosiPin: 11 }),
    node('mic', 'MicInput', { partId: 'inmp441-i2s-microphone', i2sWs: 4, i2sSck: 5, i2sSd: 6 }),
    node('master', 'PatternMaster'),
    node('collection', 'PatternCollection', { patternIds: ['reactive', 'plasma'] }),
    node('out', 'MatrixOutput', { form: 'ring', ledCount: 24, dataPin: 18 }),
    node('audio', 'Audio', { sourceId: 'kind:microphone' }),
    node('vu', 'StereoVuMeter', { targetOutputId: '', leftLedCount: 16, rightLedCount: 16, leftDataPin: 21, rightDataPin: 47 }),
    ...(control ? [control[0]] : [])]
  const edges = [edge('master', 'frame', 'out', 'frame'), edge('collection', 'patternset', 'master', 'patternset'),
    edge('audio', 'audio', 'vu', 'audio'), ...(control ? [edge(control[0].id, control[1], 'audio', 'source')] : [])]
  return { nodes, edges }
}

const player = (nodes: StudioNode[], edges: StudioEdge[]) => buildShowPlayer(nodes, edges, groups, {
  patternSet: ['reactive', 'plasma'], bakedAudio: false, preferredTrack: '', genericPlayer: true, fqbn: S3,
})

describe('Audio Source switch: Music Player firmware', () => {
  it('opens the microphone on I2S1 beside the decoder and lets an Encoder pick by position', () => {
    const { nodes, edges } = shelf(undefined, [node('knob', 'EncoderInput', { pinA: 7, pinB: 8, pinSW: 9 }), 'position'])
    expect(findDeployBlockingErrors(nodes, edges, S3, undefined, groups)).toEqual([])
    const sketch = player(nodes, edges)
    expect(sketch).toContain('_audioCapture[0] = fl::audio::IInput::create(fl::audio::Config::CreateInmp441(4, 6, 5, fl::audio::AudioChannel::Left, 44100ul, 1));')
    expect(sketch).toContain('static const uint8_t _audioSourceKind[2] = {AUDIO_SOURCE_MIC, AUDIO_SOURCE_DECODER};')
    expect(sketch).toContain('_audioProcessor->setMicProfile(fl::audio::MicProfile::INMP441);')
    // The body's choice is where the board starts.
    expect(sketch).toContain('static volatile uint8_t _audioSourceActive = 0;')
    // The analysis task feeds the processor from the capture while it is active.
    expect(sketch).toMatch(/if \(_audioSourceKind\[source\] != AUDIO_SOURCE_DECODER\) \{[\s\S]*?_audioCapture\[source\]->read\(\)[\s\S]*?_audioProcessor->update\(sample\);/)
    expect(sketch).toContain('if (_audioSourceKind[_audioSourceActive] != AUDIO_SOURCE_DECODER) break;')
    // The meter undoes the decoder's volume only while the decoder is heard.
    expect(sketch).toContain('(_audioSourceKind[_audioSourceActive] == AUDIO_SOURCE_DECODER ? _decoderVolumeComp : 1.0f)')
    expect(sketch).toContain('_audioSourcePosition((float)(n_knob_position), 2)')
  })

  it('steps on each press of a Button, debounced as a contact', () => {
    const { nodes, edges } = shelf(undefined, [node('button', 'ButtonBank', { buttons: [{ id: '1', label: 'Source', pin: 7, pullup: true }] }), FIRST_BUTTON_HANDLE])
    const sketch = player(nodes, edges)
    expect(sketch).toContain('_audioSourceActive = (uint8_t)((_audioSourceActive + 1) % 2);')
    expect(sketch).toContain('_asNow - _asChanged >= 30u')
    expect(sketch).not.toContain('_audioSourcePosition(')
  })

  it('emits nothing of the switch while Source is unwired', () => {
    const { nodes, edges } = shelf()
    const sketch = player(nodes, edges)
    expect(sketch).not.toContain('_audioSourceActive')
    expect(sketch).not.toContain('CreateInmp441')
  })

  it('refuses the pair on a board with one I2S port', () => {
    const { nodes, edges } = shelf('esp32-c3-devkitm-1', [node('knob', 'EncoderInput'), 'position'])
    expect(findAudioSourceSwitchIssues(nodes, edges).errors).toEqual([
      expect.stringContaining('has one I2S port, so the Microphone and the Audio Decoder cannot run at once'),
    ])
  })
})

describe('Audio Source switch: single-board sketch', () => {
  const graph = (wired: boolean) => {
    const nodes = [node('board', 'Board', { profileId: 'generic-esp32-s3-n16r8-44pin-dual-usbc' }),
      node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 4 }),
      node('mic', 'MicInput', { partId: 'inmp441-i2s-microphone', i2sWs: 5, i2sSck: 6, i2sSd: 7 }),
      node('line', 'LineInput', { i2sMclk: 14, i2sBclk: 15, i2sLrclk: 16, i2sDout: 17, gain: 2 }),
      node('knob', 'EncoderInput', { pinA: 8, pinB: 9, pinSW: 10 }),
      node('pulse', 'BassPulse'), node('audio', 'Audio', { sourceId: 'kind:line-in' })]
    const edges = [edge('audio', 'audio', 'pulse', 'audio'), edge('pulse', 'frame', 'out', 'frame'),
      ...(wired ? [edge('knob', 'level', 'audio', 'source')] : [])]
    return { nodes, edges }
  }

  it('opens the microphone and the line input on their own ports and switches between them', () => {
    const { nodes, edges } = graph(true)
    expect(findDeployBlockingErrors(nodes, edges, S3)).toEqual([])
    const sketch = generateCpp(nodes, edges)
    expect(sketch).toContain('_audioCapture[0] = fl::audio::IInput::create(fl::audio::Config::CreateInmp441(5, 7, 6, fl::audio::AudioChannel::Left, 44100ul, 0));')
    expect(sketch).toContain('_audioCapture[1] = (_lineInput = fl::make_shared<StudioPcm1802Input>());')
    expect(sketch).toContain('I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_1, I2S_ROLE_MASTER)')
    expect(sketch).not.toContain('I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_0, I2S_ROLE_MASTER)')
    // The line input's own meter keeps its gain.
    expect(sketch).toContain('#define MIC_GAIN  2.000f')
    // Starts on the body's choice; the Level then picks.
    expect(sketch).toContain('static volatile uint8_t _audioSourceActive = 1;')
    expect(sketch).toContain('_audioSourcePosition((float)(n_knob_level), 2)')
    expect(sketch).not.toContain('fl::task::run(0);')
  })

  it('keeps the one-source engine while Source is unwired', () => {
    const { nodes, edges } = graph(false)
    const sketch = generateCpp(nodes, edges)
    expect(sketch).not.toContain('_audioCapture')
    expect(sketch).toContain('fl::task::run(0);')
    expect(sketch).toContain('I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_0, I2S_ROLE_MASTER)')
  })
})
