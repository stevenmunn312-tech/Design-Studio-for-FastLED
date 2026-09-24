import { describe, expect, it } from 'vitest'
import { PART_OPTIONS, partOptionProperty, partOptionsFor, resolvePartIdentity } from '../partOptions'
import { partById } from '../partCatalogue'
import { DEFAULT_MIC_MODULE, MIC_MODULES, micModuleFor } from '../micModules'

describe('part options', () => {
  it('offers exactly the microphones the firmware has a factory for', () => {
    // A module earns a row when FastLED ships a `Config` factory and a
    // `MicProfile` for it, and not otherwise — offering one the generator
    // cannot call would be a claim the firmware cannot keep. Derived from
    // MIC_MODULES rather than restated, so the two cannot drift.
    expect(partOptionsFor('MicInput').map((option) => option.id))
      .toEqual(MIC_MODULES.map((module) => module.partId))
    expect(resolvePartIdentity('MicInput', {})!.hasChoice).toBe(true)
  })

  it('names a microphone module every option can be built with', () => {
    for (const module of MIC_MODULES) {
      expect(module.factory, module.label).toMatch(/^Create[A-Za-z0-9]+$/)
      expect(module.profile, module.label).toMatch(/^[A-Za-z0-9]+$/)
      expect(partById(module.partId), module.label).toBeDefined()
    }
    // No two modules may share a factory: the option list exists to name a
    // difference, and two rows resolving to one capture config would not be one.
    expect(new Set(MIC_MODULES.map((module) => module.factory)).size).toBe(MIC_MODULES.length)
  })

  it('resolves a stale or absent microphone choice to the default', () => {
    expect(micModuleFor(undefined)).toBe(DEFAULT_MIC_MODULE)
    expect(micModuleFor('a-module-that-was-retired')).toBe(DEFAULT_MIC_MODULE)
    expect(micModuleFor('ics-43434-i2s-microphone').factory).toBe('CreateIcs43434')
  })

  it('offers the RTC clock module choices', () => {
    expect(partOptionsFor('RTCInput').map((option) => option.id)).toEqual([
      'ds3231-rtc-module',
      'jaycar-xc9044-rtc-module',
    ])
    expect(resolvePartIdentity('RTCInput', {})!.hasChoice).toBe(true)
  })

  it('offers the amplifier a real choice', () => {
    expect(partOptionsFor('Amplifier').length).toBeGreaterThan(1)
    expect(resolvePartIdentity('Amplifier', {})!.hasChoice).toBe(true)
  })

  it('defaults to the module the app was built around', () => {
    expect(resolvePartIdentity('Amplifier', {})!.option.id).toBe('max98357a-i2s-amplifier')
    expect(resolvePartIdentity('MicInput', {})!.option.id).toBe('inmp441-i2s-microphone')
    expect(resolvePartIdentity('RTCInput', {})!.option.id).toBe('ds3231-rtc-module')
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
   * Every I2S stage has to say what comes out of it, because that decides
   * whether a power amplifier may follow it — see state/audioOutput.ts.
   */
  it('makes every I2S stage declare a speaker or line-level output', () => {
    for (const option of partOptionsFor('Amplifier')) {
      expect(option.output, option.label).toMatch(/^(speaker|line)$/)
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

  it('offers the analog amplifiers as power amplifiers, not I2S stages', () => {
    const i2s = partOptionsFor('Amplifier').map((option) => option.id)
    const power = partOptionsFor('PowerAmplifier').map((option) => option.id)
    expect(power).toEqual(expect.arrayContaining([
      'pam8403-3w-stereo-amplifier', 'pam8610-stereo-amplifier', 'dx-0809-stereo-amplifier',
    ]))
    expect(i2s.filter((id) => power.includes(id))).toEqual([])
    const identity = resolvePartIdentity('PowerAmplifier', { partId: 'pam8403-3w-stereo-amplifier' })!
    expect(identity.entry?.label).toContain('PAM8403')
    // Its note is the only place the app says what can feed it.
    expect(identity.notes.join(' ')).toMatch(/DAC/)
  })
})
