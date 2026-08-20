import { describe, expect, it } from 'vitest'
import { PART_OPTIONS, partOptionProperty, partOptionsFor, resolvePartIdentity } from '../partOptions'
import { partById } from '../partCatalogue'

describe('part options', () => {
  it('offers the microphone exactly one module', () => {
    // The generator is hard-bound to it: CreateInmp441 and MicProfile::INMP441.
    // A second option would be a claim the firmware cannot keep — what varies
    // per board is the capture backend, not the microphone.
    expect(partOptionsFor('MicInput')).toHaveLength(1)
    expect(resolvePartIdentity('MicInput', {})!.hasChoice).toBe(false)
  })

  it('offers the amplifier a real choice', () => {
    expect(partOptionsFor('Amplifier').length).toBeGreaterThan(1)
    expect(resolvePartIdentity('Amplifier', {})!.hasChoice).toBe(true)
  })

  it('defaults to the module the app was built around', () => {
    expect(resolvePartIdentity('Amplifier', {})!.option.id).toBe('max98357a-i2s-amplifier')
    expect(resolvePartIdentity('MicInput', {})!.option.id).toBe('inmp441-i2s-microphone')
  })

  it('still resolves a value it does not recognise', () => {
    // An unset or stale property means "the default part", never "no part" —
    // every one of these nodes describes something physically on the bench.
    expect(resolvePartIdentity('Amplifier', { model: 'something-else' })!.option.id)
      .toBe('max98357a-i2s-amplifier')
  })

  it('accepts the display name older saves stored', () => {
    expect(resolvePartIdentity('Amplifier', { model: 'MAX98357A' })!.option.id)
      .toBe('max98357a-i2s-amplifier')
  })

  it('carries the asset caveats through', () => {
    const identity = resolvePartIdentity('MicInput', {})!
    expect(identity.entry).toBeDefined()
    expect(identity.notes.some((note) => note.includes('do not drive it with 5 V logic'))).toBe(true)
    expect(identity.entry!.pinLabelsLeftToRight).toEqual(['L/R', 'GND', 'WS', 'SCK', 'SD', 'VDD'])
  })

  it('adds the option note to the asset ones', () => {
    const identity = resolvePartIdentity('Amplifier', { model: 'pcm5102a-i2s-dac' })!
    expect(identity.notes.some((note) => note.includes('not an amplifier'))).toBe(true)
  })

  it('admits when a chosen module has not been modelled', () => {
    // Selecting it must not silently show the default part's photo and size.
    const identity = resolvePartIdentity('Amplifier', { model: 'pcm5102a-i2s-dac' })!
    expect(identity.entry).toBeUndefined()
  })

  it('names a property for every part that offers options', () => {
    for (const nodeType of Object.keys(PART_OPTIONS)) {
      expect(partOptionProperty(nodeType), nodeType).toBeTruthy()
    }
  })

  it('has nothing to say about a node that is not a part', () => {
    expect(resolvePartIdentity('Plasma', {})).toBeNull()
    expect(partOptionsFor('Plasma')).toEqual([])
  })

  it('points its default options at real catalogue entries', () => {
    // The first option is what the part falls back to, so it is the one that
    // must have a verified size and a picture behind it.
    for (const [nodeType, config] of Object.entries(PART_OPTIONS)) {
      expect(partById(config.options[0].id), nodeType).toBeDefined()
    }
  })

  /*
   * Every amplifier has to say how sound reaches it. Leaving it unstated is
   * what let "there is an amplifier" mean "this build uses I2S", which is only
   * true of the I2S ones — see state/audioOutput.ts.
   */
  it('makes every amplifier declare whether it takes I2S or line level', () => {
    for (const option of partOptionsFor('Amplifier')) {
      expect(option.input, option.label).toMatch(/^(i2s|analog)$/)
    }
  })

  it('knows the PAM8403 is the analog one', () => {
    const identity = resolvePartIdentity('Amplifier', { model: 'pam8403-3w-stereo-amplifier' })!
    expect(identity.option.input).toBe('analog')
    expect(identity.entry?.label).toContain('PAM8403')
    // Its note is the only place the app explains why an ESP32-S3 cannot use it.
    expect(identity.notes.join(' ')).toMatch(/DAC/)
  })
})
