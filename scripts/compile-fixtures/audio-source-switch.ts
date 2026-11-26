/**
 * Generate the sketches that prove the Audio node's runtime Source switch
 * builds: every source on the bench opened at once, each on its own I2S port,
 * and one FastLED Processor fed by whichever is active.
 *
 * - `player-s3-mic-encoder`: the sound shelf. An ESP32-S3 Music Player with
 *   an SD card, a MAX98357A, an INMP441 and a Stereo VU meter; an Encoder's
 *   Position picks between the microphone and the Audio Decoder.
 * - `player-s3-mic-button`: the same with a Button stepping the source, so the
 *   press arm of the switch builds too.
 * - `sketch-s3-mic-line-in`: no Music Player. An Encoder's Level picks between
 *   an INMP441 and a PCM1802 line input in a single-board sketch.
 *
 * Every graph is checked by the deploy gate for its board before it is
 * written, and the manifest names the board each one builds on.
 *
 *   npm run gen:compile-fixtures -- audio-source-switch [output-dir]
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generateCpp } from '../../src/codegen/cppGenerator'
import { buildShowPlayer } from '../../src/utils/showUpload'
import type { GroupRegistry } from '../../src/state/graphEvaluator'
import { NODE_LIBRARY, libraryDefaults } from '../../src/state/nodeLibrary'
import type { StudioEdge, StudioNode } from '../../src/state/graphStore'
import { findBoardPinCompatibility, findDeployBlockingErrors, findPinConflicts } from '../../src/utils/validateGraph'

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

interface Fixture { fqbn: string; source: string }
const fixtures: Record<string, Fixture> = {}

/** Refuse a graph the app would refuse: a fixture nobody could build proves nothing. */
function checked(name: string, fqbn: string, nodes: StudioNode[], edges: StudioEdge[], groups: GroupRegistry = {}): void {
  const errors = [
    ...findPinConflicts(nodes, edges),
    ...findDeployBlockingErrors(nodes, edges, fqbn, undefined, groups),
    ...findBoardPinCompatibility(nodes, fqbn).errors,
  ]
  if (errors.length > 0) throw new Error(`${name}: the deploy gate refuses it: ${[...new Set(errors)].join('; ')}`)
}

// ── The sound shelf: Music Player, microphone and decoder ──────────────────
{
  const group = (inner: StudioNode[], edges: StudioEdge[]) => ({ nodes: [...inner, node('go', 'GroupOutput')], edges })
  const groups = {
    reactive: group([node('au', 'Audio', { sourceId: 'kind:decoder' }), node('fft', 'FFTAnalyzer'), node('sc', 'SolidColor', { b: 60 })],
      [edge('au', 'audio', 'fft', 'audio'), edge('fft', 'bass', 'sc', 'r'), edge('sc', 'frame', 'go', 'frame')]),
    plasma: group([node('pl', 'Plasma')], [edge('pl', 'frame', 'go', 'frame')]),
  } as unknown as GroupRegistry
  const shelf = (control: StudioNode, controlPort: string) => {
    const nodes = [node('board', 'Board', { profileId: 'espressif-esp32-s3-devkitc-1' }),
      node('amp', 'Amplifier', { i2sBclk: 15, i2sLrc: 16, i2sDout: 17 }),
      node('sd', 'SDCard', { sdCsPin: 10, sdSckPin: 12, sdMisoPin: 13, sdMosiPin: 11 }),
      node('mic', 'MicInput', { partId: 'inmp441-i2s-microphone', i2sWs: 4, i2sSck: 5, i2sSd: 6 }),
      node('master', 'PatternMaster', { beatTransitions: true }),
      node('collection', 'PatternCollection', { patternIds: ['reactive', 'plasma'] }),
      node('out', 'MatrixOutput', { form: 'ring', ledCount: 24, dataPin: 18, chipset: 'WS2812B', colorOrder: 'GRB' }),
      node('audio', 'Audio', { sourceId: 'kind:microphone' }),
      node('vu', 'StereoVuMeter', {
        targetOutputId: '', leftLedCount: 16, rightLedCount: 16, leftDataPin: 21, rightDataPin: 47, chipset: 'WS2812B', colorOrder: 'GRB',
      }),
      control]
    const edges = [edge('master', 'frame', 'out', 'frame'), edge('collection', 'patternset', 'master', 'patternset'),
      edge('audio', 'audio', 'vu', 'audio'), edge(control.id, controlPort, 'audio', 'source')]
    return { nodes, edges }
  }
  for (const [name, control, port] of [
    ['player-s3-mic-encoder', node('knob', 'EncoderInput', { pinA: 7, pinB: 8, pinSW: 9 }), 'position'],
    ['player-s3-mic-button', node('button', 'ButtonBank', { buttons: [{ id: 'b1', label: 'Source', pin: 7, pullup: true }] }), 'button-b1'],
  ] as const) {
    const { nodes, edges } = shelf(control, port)
    checked(name, S3, nodes, edges, groups)
    fixtures[name] = { fqbn: S3, source: buildShowPlayer(nodes, edges, groups, {
      patternSet: ['reactive', 'plasma'], bakedAudio: false, preferredTrack: '', genericPlayer: true, fqbn: S3,
    }) }
  }
}

// ── A single-board sketch: microphone and line input ───────────────────────
{
  const nodes = [node('board', 'Board', { profileId: 'generic-esp32-s3-n16r8-44pin-dual-usbc' }),
    node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 4 }),
    node('mic', 'MicInput', { partId: 'inmp441-i2s-microphone', i2sWs: 5, i2sSck: 6, i2sSd: 7 }),
    node('line', 'LineInput', { i2sMclk: 14, i2sBclk: 15, i2sLrclk: 16, i2sDout: 17 }),
    node('knob', 'EncoderInput', { pinA: 8, pinB: 9, pinSW: 10 }),
    node('pulse', 'BassPulse'), node('audio', 'Audio', { sourceId: 'kind:microphone' })]
  const edges = [edge('audio', 'audio', 'pulse', 'audio'), edge('pulse', 'frame', 'out', 'frame'),
    edge('knob', 'level', 'audio', 'source')]
  checked('sketch-s3-mic-line-in', S3, nodes, edges)
  fixtures['sketch-s3-mic-line-in'] = { fqbn: S3, source: generateCpp(nodes, edges) }
}

// What each sketch must contain to be the test it is named for.
const required: Record<string, string[]> = {
  'player-s3-mic-encoder': ['Config::CreateInmp441(4, 6, 5, fl::audio::AudioChannel::Left, 44100ul, 1)', '_audioSourceApply(', '_audioSourcePosition(', 'audio_process_i2s('],
  'player-s3-mic-button': ['Config::CreateInmp441(', '_asStable', 'audio_process_i2s('],
  'sketch-s3-mic-line-in': ['StudioPcm1802Input', 'Config::CreateInmp441(5, 7, 6, fl::audio::AudioChannel::Left, 44100ul, 0)', 'I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_1', '_audioSourcePosition('],
}
for (const [name, symbols] of Object.entries(required)) {
  const missing = symbols.filter((symbol) => !fixtures[name].source.includes(symbol))
  if (missing.length) throw new Error(`${name}: missing ${missing.join(', ')}`)
}

const outputDir = resolve(process.argv[2] ?? 'artifacts/audio-source-switch-compile')
mkdirSync(outputDir, { recursive: true })
for (const file of readdirSync(outputDir)) if (file.endsWith('.ino')) rmSync(resolve(outputDir, file))
const manifest: Record<string, { fqbn: string; bytes: number; sha256: string }> = {}
for (const [name, { fqbn, source }] of Object.entries(fixtures)) {
  writeFileSync(resolve(outputDir, `${name}.ino`), source, 'utf8')
  manifest[name] = { fqbn, bytes: Buffer.byteLength(source), sha256: createHash('sha256').update(source).digest('hex') }
}
writeFileSync(resolve(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`wrote ${Object.keys(fixtures).length} audio source switch compile fixtures to ${outputDir}`)
