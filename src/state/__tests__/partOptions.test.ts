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

  /*
   * This used to demonstrate the rule with the PCM5102A, which had no entry of
   * its own. Now that everything offered is modelled there is no unmodelled
   * option left to point at, so it checks the mechanism instead: the entry is
   * looked up by the option's own id, and can never be another module's photo
   * and size standing in for it.
   */
  it('never lends a module another part\'s catalogue entry', () => {
    for (const [nodeType, config] of Object.entries(PART_OPTIONS)) {
      for (const option of config.options) {
        const identity = resolvePartIdentity(nodeType, { [config.property]: option.id })!
        expect(identity.option.id, nodeType).toBe(option.id)
        expect(identity.entry?.partId, `${nodeType}/${option.label}`).toBe(option.id)
      }
    }
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

  /*
   * No module is offered before it has been modelled.
   *
   * An option with no catalogue entry is a part number the app cannot draw,
   * cannot size and cannot list a header for — exactly the "list of plausible
   * part numbers the app treats identically" this module was written to avoid.
   * The PCM5102A and UDA1334A sat in that state until their renders landed, so
   * the hardware view drew them at the MAX98357A's size, with its picture.
   *
   * This checks every option, not just the default: the fallback was the only
   * one covered before, which is how the other two got in.
   */
  it('offers no module without a catalogue entry behind it', () => {
    for (const [nodeType, config] of Object.entries(PART_OPTIONS)) {
      for (const option of config.options) {
        const entry = partById(option.id)
        expect(entry, `${nodeType}/${option.label}`).toBeDefined()
        // A render and a verified size are the point of the entry.
        expect(entry!.render?.file, `${nodeType}/${option.label}`).toBeTruthy()
        expect(entry!.dimensionsMm.width, `${nodeType}/${option.label}`).toBeGreaterThan(0)
        expect(entry!.dimensionsMm.height, `${nodeType}/${option.label}`).toBeGreaterThan(0)
      }
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

  /*
   * The Add Hardware menu shows this line under each module. A full caveat in
   * that slot stretched the panel most of the way across the window, so the
   * long text stays in `note`, where the part panel reads it.
   */
  it('gives every module a short menu summary where a choice exists', () => {
    for (const [nodeType, config] of Object.entries(PART_OPTIONS)) {
      if (config.options.length < 2) continue
      for (const option of config.options) {
        expect(option.summary, `${nodeType}/${option.label}`).toBeTruthy()
        expect(option.summary!.length, `${nodeType}/${option.label}`).toBeLessThanOrEqual(48)
      }
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
