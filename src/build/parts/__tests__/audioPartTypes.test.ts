import { afterEach, describe, expect, it } from 'vitest'
import { partOptionsFor, partOptionFor, resolvePartIdentity } from '../partOptions'
import { registerParts, resetRegisteredPartsForTests } from '../partCatalogue'
import { partTypeById } from '../partTypes'
import { validatePartManifest } from '../manifest/partManifest'
import { PART_CATALOGUE_DATA } from '../../generated/partCatalogueData'
import { buildHardwareManifest } from '../../hardwareManifest'
import { micModuleFor, micModules } from '../../../state/peripherals/micModules'
import { powerAmplifierFeed } from '../../../state/audio/audioOutput'
import type { StudioNode } from '../../../state/graphStore'

afterEach(() => resetRegisteredPartsForTests())

function node(id: string, nodeType: string, properties: Record<string, unknown>): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'output', properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

type Json = Record<string, unknown>

/** A downloadable copy of a bundled part: same shape, new identity, `changes` applied on top. */
function downloaded(baseId: string, partId: string, changes: Json = {}): Json {
  const base = JSON.parse(JSON.stringify(PART_CATALOGUE_DATA[baseId])) as Json
  return {
    ...base,
    partId,
    label: `Downloaded ${partId}`,
    revision: 1,
    verification: 'reviewed',
    sources: [{ facts: ['dimensionsMm'], ref: 'https://example.com/datasheet' }],
    ...changes,
  }
}

// The Add Hardware rows of the four audio types as they were written by hand in
// partOptions.ts and micModules.ts before the catalogue's blocks carried them.
const LEGACY_ROWS: Record<string, Array<Json>> = {
  MicInput: [
    { id: 'inmp441-i2s-microphone', label: 'INMP441', summary: 'The common three-wire I2S MEMS module' },
    {
      id: 'ics-43434-i2s-microphone',
      label: 'ICS-43434',
      summary: 'Lower noise floor, same three wires',
      note: 'Wires exactly like an INMP441 and costs about the same; firmware applies the ICS43434 response correction instead.',
    },
    {
      id: 'generic-i2s-mems-microphone',
      label: 'Generic I2S MEMS',
      summary: 'Low-cost MSM261S4030H0-class board',
      note: 'For the unbranded boards often sold as INMP441. The GenericMEMS profile is an average MEMS correction, not this module\'s measured response.',
    },
    {
      id: 'sph0645lm4h-i2s-microphone',
      label: 'SPH0645LM4H',
      summary: 'Knowles I2S mic, classic ESP32 only',
      note: 'Captured by the app with the published ESP32 timing fix, not by FastLED, so no response correction is applied. Classic ESP32 only: the fix is documented for the I2S receiver of that chip, not for the ESP32-S3. SEL to ground selects the left channel.',
    },
  ],
  LineInput: [{
    id: 'pcm1802-line-in-adc',
    label: 'PCM1802 line-in ADC',
    summary: 'Stereo RCA line in to I2S',
    note: 'Connect a player module\'s line-level DAC output, not its bridge-tied speaker output, to the RCA inputs.',
  }],
  Amplifier: [
    { id: 'max98357a-i2s-amplifier', aliases: ['MAX98357A'], label: 'MAX98357A', output: 'speaker', summary: 'I2S in, drives a speaker directly' },
    {
      id: 'max98357a-stereo-pair',
      label: 'MAX98357A stereo pair',
      output: 'speaker',
      summary: 'Two I2S amps, one per channel',
      note: 'Both boards share BCLK, LRC and DIN. Each plays the channel its SD pin selects (see the SD_MODE table in the MAX98357A datasheet); an unmodified breakout plays the left-plus-right mix, so set one board to left and the other to right.',
    },
    {
      id: 'pcm5102a-i2s-dac',
      label: 'PCM5102A',
      output: 'line',
      summary: 'I2S DAC — line out, needs an amp',
      note: 'A DAC, not an amplifier — the same three I2S wires, but a line-level output that needs a powered speaker or a power amplifier.',
    },
    {
      id: 'uda1334a-i2s-dac',
      label: 'UDA1334A',
      output: 'line',
      summary: 'I2S DAC — line out, needs an amp',
      note: 'Line-level I2S DAC, wired the same as the PCM5102A.',
    },
  ],
  PowerAmplifier: [
    {
      id: 'pam8403-3w-stereo-amplifier',
      label: 'PAM8403',
      summary: '2 x 3 W, 5 V — line level in',
      note: 'Takes line level, not I2S. Fed from a PCM5102A or UDA1334A, or on a classic ESP32 from its own DAC on GPIO25/26.',
    },
    {
      id: 'pam8610-stereo-amplifier',
      label: 'PAM8610',
      summary: '2 x 15 W, 12 V — line level in',
      note: 'Needs its own 7-15 V supply; the controller cannot power it. Share its ground with the board and the DAC.',
    },
    {
      id: 'dx-0809-stereo-amplifier',
      label: 'DX-0809',
      summary: '2 x 15 W, 12 V — AUX line in',
      note: 'Needs its own 12 V supply; the controller cannot power it. Feed its AUX input from the line out of a DAC, and share ground with the board.',
    },
  ],
}

describe('the audio part types read their blocks', () => {
  it.each(Object.keys(LEGACY_ROWS))('%s reproduces its hand-written rows, in order', (nodeType) => {
    expect(partOptionsFor(nodeType)).toEqual(LEGACY_ROWS[nodeType])
  })

  it('keeps the Amplifier property name and the alias every earlier save holds', () => {
    expect(partTypeById('Amplifier')?.property).toBe('model')
    expect(partOptionFor('Amplifier', 'MAX98357A')?.id).toBe('max98357a-i2s-amplifier')
    expect(resolvePartIdentity('Amplifier', { model: 'MAX98357A' })?.unresolved).toBeUndefined()
  })

  it.each(['MicInput', 'LineInput', 'Amplifier', 'PowerAmplifier'])('%s is open to downloads', (nodeType) => {
    const type = partTypeById(nodeType)
    expect(type?.downloadable).toBe(true)
    expect(type?.block).toBeDefined()
  })

  it('registers each bundled part against its own block with no unknown-id fallback', () => {
    expect(micModuleFor('inmp441-i2s-microphone')).toMatchObject({ factory: 'CreateInmp441', profile: 'INMP441' })
    expect(micModuleFor('sph0645lm4h-i2s-microphone')).toMatchObject({ capture: 'sph0645-classic-esp32' })
    expect(micModuleFor('sph0645lm4h-i2s-microphone')?.factory).toBeUndefined()
    // An unknown id, and the id of a part of another type, are nothing, not the INMP441.
    expect(micModuleFor('no-such-mic')).toBeNull()
    expect(micModuleFor('pcm5102a-i2s-dac')).toBeNull()
  })
})

describe('a downloaded audio part', () => {
  it('is refused when its chip is outside what the type can drive', () => {
    const cases: Array<[string, Json]> = [
      ['MicInput', downloaded('inmp441-i2s-microphone', 'new-mic', { microphone: { device: 'SPM1423', fastledFactory: 'CreateInmp441', fastledProfile: 'INMP441' } })],
      ['LineInput', downloaded('pcm1802-line-in-adc', 'new-adc', { lineInput: { device: 'PCM1808', channels: 2 } })],
      ['Amplifier', downloaded('pcm5102a-i2s-dac', 'new-dac', { i2sAudio: { device: 'TAS5805M', output: 'speaker' } })],
    ]
    for (const [nodeType, manifest] of cases) {
      const result = validatePartManifest(manifest, 'downloaded')
      expect(result.status, nodeType).toBe('needs-newer-app')
      // And it is never registered, so nothing can drive it as another chip.
      expect(registerParts([manifest], 'downloaded')[0].status, nodeType).toBe('needs-newer-app')
    }
  })

  it('needs its block, which must be well formed', () => {
    const noBlock = downloaded('inmp441-i2s-microphone', 'no-block')
    delete noBlock.microphone
    expect(validatePartManifest(noBlock, 'downloaded').status).toBe('invalid')
    const halfPair = downloaded('inmp441-i2s-microphone', 'half-pair', { microphone: { device: 'INMP441', fastledFactory: 'CreateInmp441' } })
    expect(validatePartManifest(halfPair, 'downloaded').status).toBe('invalid')
    const badOutput = downloaded('pcm5102a-i2s-dac', 'bad-output', { i2sAudio: { device: 'PCM5102A', output: 'bridge' } })
    expect(validatePartManifest(badOutput, 'downloaded').status).toBe('invalid')
  })

  it('cannot put text of its own into the sketch through the FastLED factory', () => {
    const injected = downloaded('inmp441-i2s-microphone', 'injected', {
      microphone: { device: 'INMP441', fastledFactory: 'CreateInmp441(); system("x"); //', fastledProfile: 'INMP441' },
    })
    expect(validatePartManifest(injected, 'downloaded').status).toBe('invalid')
  })

  it('is offered, resolved and read like a bundled microphone', () => {
    const mic = downloaded('ics-43434-i2s-microphone', 'new-ics-board', {
      copy: { summary: 'A new ICS board', optionLabel: 'New ICS board', optionOrder: 1 },
    })
    expect(registerParts([mic], 'downloaded')[0].status).toBe('added')
    const rows = partOptionsFor('MicInput')
    expect(rows.map((row) => row.id)).toEqual([
      ...LEGACY_ROWS.MicInput.map((row) => row.id as string), 'new-ics-board',
    ])
    expect(micModuleFor('new-ics-board')).toMatchObject({ label: 'New ICS board', factory: 'CreateIcs43434', profile: 'ICS43434' })
    expect(micModules().map((module) => module.partId)).toContain('new-ics-board')
  })

  it('takes a DAC role from its own block when it feeds a power amplifier', () => {
    const dac = downloaded('pcm5102a-i2s-dac', 'new-dac-board', { i2sAudio: { device: 'UDA1334A', output: 'line' } })
    const speaker = downloaded('pcm5102a-i2s-dac', 'new-speaker-amp', { i2sAudio: { device: 'MAX98357A', output: 'speaker' } })
    expect(registerParts([dac, speaker], 'downloaded').map((result) => result.status)).toEqual(['added', 'added'])
    const power = node('power', 'PowerAmplifier', { partId: 'pam8610-stereo-amplifier' })
    expect(powerAmplifierFeed([power, node('amp', 'Amplifier', { model: 'new-dac-board' })])).toBe('dac')
    expect(powerAmplifierFeed([power, node('amp', 'Amplifier', { model: 'new-speaker-amp' })])).toBe('speakerAmp')
    // A part this version does not have is never mistaken for a DAC.
    expect(powerAmplifierFeed([power, node('amp', 'Amplifier', { model: 'not-installed' })])).toBe('speakerAmp')
  })
})

describe('the line input in the Build Diagram manifest', () => {
  const pins = { i2sMclk: 1, i2sBclk: 2, i2sLrclk: 3, i2sDout: 4 }

  it('is the PCM1802 for the bundled part, as it always was', () => {
    const manifest = buildHardwareManifest([
      node('line', 'LineInput', { partId: 'pcm1802-line-in-adc', ...pins }),
    ], [], 'esp32:esp32:esp32s3')
    const item = manifest.items.find((candidate) => candidate.sourceNodeId === 'line')
    expect(item?.subtitle).toBe('PCM1802 stereo line-level ADC')
    expect(item?.facts).toEqual({ partId: 'pcm1802-line-in-adc', input: 'stereo-line-level', output: 'i2s' })
  })

  it('reads the node\'s own part, not the bundled one', () => {
    const board = downloaded('pcm1802-line-in-adc', 'other-pcm1802-board')
    expect(registerParts([board], 'downloaded')[0].status).toBe('added')
    const manifest = buildHardwareManifest([
      node('line', 'LineInput', { partId: 'other-pcm1802-board', ...pins }),
    ], [], 'esp32:esp32:esp32s3')
    const item = manifest.items.find((candidate) => candidate.sourceNodeId === 'line')
    expect(item?.facts).toMatchObject({ partId: 'other-pcm1802-board' })
  })

  it('names an unknown part as itself, never as the PCM1802', () => {
    const manifest = buildHardwareManifest([
      node('line', 'LineInput', { partId: 'not-installed', ...pins }),
    ], [], 'esp32:esp32:esp32s3')
    const item = manifest.items.find((candidate) => candidate.sourceNodeId === 'line')
    expect(item?.facts).toMatchObject({ partId: 'not-installed' })
    expect(item?.subtitle).toBe('not-installed')
  })
})
