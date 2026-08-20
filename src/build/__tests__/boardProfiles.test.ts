import { describe, expect, it } from 'vitest'
import {
  BOARD_PROFILES,
  boardPinForGpio,
  boardProfileById,
  boardPinVerdict,
  compatibleBoardProfilesForFqbn,
  isBoardProfileCompatibleWithFqbn,
  UNMAPPED_CAPABILITY_IDS,
  validateBoardProfiles,
} from '../boardProfiles'
import type { PhysicalBoardProfile } from '../boardProfiles'

/** Minimal profile that passes the pre-existing checks, so each test below
 *  fails only on the capability rule it is actually about. */
function fixture(overrides: Partial<PhysicalBoardProfile> = {}): PhysicalBoardProfile {
  return {
    id: 'fixture-board',
    label: 'Fixture Board',
    manufacturer: 'Test',
    model: 'Fixture',
    revision: 'test',
    targetFamilies: ['esp32-s3'],
    compatibleFqbns: ['esp32:esp32:esp32s3'],
    dimensionsMm: { width: 20, height: 50 },
    confidence: 'manufacturer-verified',
    previewSvg: '<svg/>',
    notes: [],
    caveats: [],
    sourceSummary: 'fixture',
    ...overrides,
  }
}

describe('boardProfiles', () => {
  it('validates the built-in physical board registry', () => {
    expect(validateBoardProfiles()).toEqual([])
  })

  it('filters compatible profiles for the selected target family', () => {
    expect(compatibleBoardProfilesForFqbn('esp32:esp32:esp32s3').map((profile) => profile.id)).toEqual(
      BOARD_PROFILES.filter((profile) => profile.targetFamilies.includes('esp32-s3')).map((profile) => profile.id)
    )
    // Classic-ESP32 profiles are offered for both catalogue entries that map to
    // that silicon, and never for an S3 project. More than one board can share
    // a target — the 30-pin and 38-pin layouts are both plain ESP32 — so the
    // user picks which one they physically have.
    for (const fqbn of ['esp32:esp32:esp32doit-devkit-v1', 'esp32:esp32:esp32']) {
      expect(compatibleBoardProfilesForFqbn(fqbn).map((profile) => profile.id))
        .toEqual(expect.arrayContaining(['esp32-devkit-v1-30pin-esp32d', 'esp32-generic-devkit-38pin']))
    }
    for (const id of ['esp32-devkit-v1-30pin-esp32d', 'esp32-generic-devkit-38pin']) {
      expect(compatibleBoardProfilesForFqbn('esp32:esp32:esp32s3').map((profile) => profile.id)).not.toContain(id)
    }
    expect(compatibleBoardProfilesForFqbn('rp2040:rp2040:rpipico').map((profile) => profile.id))
      .toEqual(expect.arrayContaining(['raspberry-pi-pico', 'raspberry-pi-pico-2']))
  })

  it('checks exact-board compatibility against the project target', () => {
    expect(isBoardProfileCompatibleWithFqbn('seeed-xiao-esp32s3', 'esp32:esp32:esp32s3')).toBe(true)
    expect(isBoardProfileCompatibleWithFqbn('seeed-xiao-esp32s3', 'rp2040:rp2040:rpipico')).toBe(false)
  })

  it('maps reviewed board pins back from logical GPIO numbers', () => {
    const generic = BOARD_PROFILES.find((profile) => profile.id === 'generic-esp32-s3-n16r8-44pin-dual-usbc')
    const devkit = BOARD_PROFILES.find((profile) => profile.id === 'espressif-esp32-s3-devkitc-1')
    const xiao = BOARD_PROFILES.find((profile) => profile.id === 'seeed-xiao-esp32s3')

    // The 22 + 22 silkscreen order, confirmed against two physical boards.
    expect(boardPinForGpio(generic, 0)?.label).toBe('GPIO0 / BOOT')
    expect(boardPinForGpio(generic, 14)?.label).toBe('GPIO14')
    expect(boardPinForGpio(generic, 35)?.availability).toBe('unavailable')
    expect(generic?.pins).toHaveLength(44)
    // GPIO19/20 are the native USB pair and live on this board's left rail;
    // the previous map put a straight GPIO1..GPIO18 run there instead.
    expect(boardPinForGpio(generic, 19)?.anchorId).toBe('left-13')
    expect(boardPinForGpio(generic, 20)?.anchorId).toBe('left-14')
    expect(boardPinForGpio(generic, 43)?.label).toBe('TX / GPIO43')
    expect(boardPinForGpio(devkit, 14)?.label).toBe('GPIO14')
    expect(boardPinForGpio(devkit, 0)?.label).toBe('GPIO0 / BOOT')
    expect(boardPinForGpio(devkit, 20)?.label).toBe('USB_D+ / GPIO20')
    expect(boardPinForGpio(xiao, 43)?.label).toBe('D6 / GPIO43')

    const esp32d = BOARD_PROFILES.find((profile) => profile.id === 'esp32-devkit-v1-30pin-esp32d')
    expect(esp32d?.pins).toHaveLength(30)
    expect(boardPinForGpio(esp32d, 16)?.label).toBe('RX2 / GPIO16')
    expect(boardPinForGpio(esp32d, 36)?.note).toMatch(/Input-only/)
    // GPIO0 reaches the BOOT button only — there is no header pad to wire to.
    expect(boardPinForGpio(esp32d, 0)).toBeUndefined()
  })
})

describe('imported board profiles', () => {
  it('keeps the authored map when a generated one exists for the same board', () => {
    // Several manifests describe boards that already have a hand-checked map —
    // some confirmed against hardware in hand. The generated map must never
    // displace those, or a verified pinout silently becomes an inferred one.
    const xiao = BOARD_PROFILES.filter((p) => p.id === 'seeed-xiao-esp32s3')
    expect(xiao).toHaveLength(1)
    expect(xiao[0].confidence).toBe('manufacturer-verified')
    expect(xiao[0].caveats.join(' ')).not.toMatch(/not hand-checked/)
    // ...while still picking up the imported capability data.
    expect(xiao[0].pinSafety?.safeGeneralPurpose.length).toBeGreaterThan(0)
    expect(xiao[0].render?.file).toBe('boards/seeed-xiao-esp32s3.webp')
  })

  it('marks generated profiles as unverified and says so in a caveat', () => {
    const generated = BOARD_PROFILES.find((p) => p.id === 'lolin-s2-mini')
    expect(generated).toBeTruthy()
    expect(generated!.confidence).toBe('visual-match-only')
    expect(generated!.caveats.join(' ')).toMatch(/not hand-checked against a physical board/)
    expect(generated!.targetFamilies.length).toBeGreaterThan(0)
  })

  it('carries no duplicate board ids after the merge', () => {
    const ids = BOARD_PROFILES.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps imported boards visible while leaving unresolved pins neutral', () => {
    const feather = BOARD_PROFILES.find((p) => p.id === 'adafruit-feather-esp32-v2')
    expect(feather).toBeTruthy()
    expect(feather?.render?.file).toBe('boards/adafruit-feather-esp32-v2.webp')
    expect(feather?.pins?.some((pin) => pin.label === 'D14' && pin.gpio === 14)).toBe(true)
    expect(UNMAPPED_CAPABILITY_IDS).toEqual([])
  })
})

describe('board pin safety', () => {
  const safe = fixture({
    pinSafety: {
      safeGeneralPurpose: [16, 17, 21],
      useWithCaution: { 12: 'ADC2 — conflicts with Wi-Fi' },
      boardReservedOrNotExposed: { 39: 'Underside pad, not on a header' },
    },
  })

  it('never reports a pin as safe on a profile with no safety data', () => {
    // The whole point of this data is that "the chip has it" and "you can reach
    // it" are different questions. A profile that has not been imported yet
    // must not answer the second one — 'unknown' tells the caller to fall back
    // to chip-level rules rather than trusting silence.
    expect(boardPinVerdict(fixture(), 16)).toEqual({ standing: 'unknown' })
    expect(boardPinVerdict(undefined, 16)).toEqual({ standing: 'unknown' })
  })

  it('reports standing and reason per GPIO', () => {
    expect(boardPinVerdict(safe, 16)).toEqual({ standing: 'safe' })
    expect(boardPinVerdict(safe, 12)).toEqual({
      standing: 'caution',
      reason: 'ADC2 — conflicts with Wi-Fi',
    })
    // This is the XIAO microphone bug in miniature: a real ESP32-S3 GPIO that
    // the board does not bring out to a header.
    expect(boardPinVerdict(safe, 39)).toEqual({
      standing: 'reserved',
      reason: 'Underside pad, not on a header',
    })
    // Known board, unlisted pin — still not an endorsement.
    expect(boardPinVerdict(safe, 99).standing).toBe('unknown')
  })

  it('rejects a pin claimed as both safe and unreachable', () => {
    const issues = validateBoardProfiles([fixture({
      pinSafety: {
        safeGeneralPurpose: [16, 39],
        useWithCaution: {},
        boardReservedOrNotExposed: { 39: 'Underside pad' },
      },
    })])
    expect(issues).toContain('fixture-board: GPIO39 is listed as both safe and board-reserved')
  })

  it('rejects peripheral starting points that collide with each other', () => {
    // Mic, amp and LED data are handed out as working defaults, so they have to
    // coexist. Two peripherals sharing a pin means one of them is silently dead.
    const issues = validateBoardProfiles([fixture({
      pinSafety: {
        safeGeneralPurpose: [16, 17, 18, 21, 33, 34],
        useWithCaution: {},
        boardReservedOrNotExposed: {},
      },
      peripheralPins: {
        inmp441: { wsLrclk: 33, sckBclk: 34, sdDout: 16 },
        max98357: { bclk: 17, lrc: 18, din: 16 },
      },
    })])
    expect(issues).toContain(
      'fixture-board: GPIO16 is the starting point for both INMP441 SD and MAX98357 DIN')
  })

  it('rejects a peripheral starting point on a reserved pin', () => {
    const issues = validateBoardProfiles([fixture({
      pinSafety: {
        safeGeneralPurpose: [16, 17],
        useWithCaution: {},
        boardReservedOrNotExposed: { 39: 'Underside pad' },
      },
      peripheralPins: {
        fastLedData: { recommendedDefault: 39, commonAlternatives: [] },
      },
    })])
    expect(issues).toContain(
      'fixture-board: FastLED data starts on GPIO39, which is board-reserved (Underside pad)')
  })

  it('rejects a peripheral starting point the safety summary never mentions', () => {
    const issues = validateBoardProfiles([fixture({
      pinSafety: {
        safeGeneralPurpose: [16, 17],
        useWithCaution: {},
        boardReservedOrNotExposed: {},
      },
      peripheralPins: {
        fastLedData: { recommendedDefault: 21, commonAlternatives: [] },
      },
    })])
    expect(issues).toContain(
      'fixture-board: FastLED data starts on GPIO21, which the safety summary does not mention')
  })

  it('accepts a coherent profile', () => {
    expect(validateBoardProfiles([fixture({
      pinSafety: {
        safeGeneralPurpose: [16, 17, 18, 21, 33, 34, 35],
        useWithCaution: { 12: 'ADC2' },
        boardReservedOrNotExposed: { 39: 'Underside pad' },
      },
      peripheralPins: {
        inmp441: { wsLrclk: 33, sckBclk: 34, sdDout: 35 },
        max98357: { bclk: 17, lrc: 18, din: 16 },
        fastLedData: { recommendedDefault: 21, commonAlternatives: [16] },
      },
    })])).toEqual([])
  })
})

describe('ESP32 DevKit v1 (ESP-32D) audio pins', () => {
  it('carries the amp pinout that was validated on the physical board', () => {
    // The generated data has no amp entry for this board, so an Amplifier
    // arriving here inherited the 38-pin profile's 27/14/22 — GPIO14 included,
    // which this board's own safety map flags. 27/26/25 was meter-verified on
    // the bench on 2026-08-18 and confirmed by a clean tone through the amp.
    const profile = boardProfileById('esp32-devkit-v1-30pin-esp32d')
    expect(profile?.peripheralPins?.max98357).toEqual({ bclk: 27, lrc: 26, din: 25 })

    // ...and all three are pins this board actually brings out safely.
    const safe = new Set(profile?.pinSafety?.safeGeneralPurpose ?? [])
    for (const pin of [27, 26, 25]) expect(safe.has(pin), `GPIO${pin} is safe here`).toBe(true)
  })
})
