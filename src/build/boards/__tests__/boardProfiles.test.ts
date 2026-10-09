import { describe, expect, it } from 'vitest'
import {
  BOARD_PROFILES,
  BOARD_PROFILE_FAMILIES,
  boardPinForGpio,
  boardProfileById,
  boardProfileFamilyId,
  boardProfilesForFamily,
  selectedBoardFlashMb,
  boardPinVerdict,
  compatibleBoardProfilesForFqbn,
  isBoardProfileCompatibleWithFqbn,
  UNMAPPED_CAPABILITY_IDS,
  UNLISTED_SAFETY_IDS,
  lacksPinAdvice,
  validateBoardProfiles,
} from '../boardProfiles'
import type { PhysicalBoardProfile } from '../boardProfiles'
import { CYD_TOUCH_DISPLAY } from '../integratedBoardHardware'
import { NO_PIN } from '../boardGpio'

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
  it('splits ESP32 boards into their silicon variants', () => {
    expect(BOARD_PROFILE_FAMILIES.filter((family) => family.id.startsWith('esp32')))
      .toEqual([
        { id: 'esp32', label: 'ESP32' },
        { id: 'esp32-s2', label: 'ESP32-S2' },
        { id: 'esp32-s3', label: 'ESP32-S3' },
        { id: 'esp32-c3', label: 'ESP32-C3' },
        { id: 'esp32-c6', label: 'ESP32-C6' },
        { id: 'esp32-h2', label: 'ESP32-H2' },
      ])

    expect(boardProfileFamilyId(boardProfileById('seeed-xiao-esp32s3')!)).toBe('esp32-s3')
    expect(boardProfileFamilyId(boardProfileById('lolin-c3-mini')!)).toBe('esp32-c3')
    expect(boardProfilesForFamily('esp32')).toContainEqual(
      expect.objectContaining({ id: 'esp32-generic-devkit-38pin' }),
    )

    const esp32Boards = BOARD_PROFILES.filter((profile) =>
      profile.compatibleFqbns[0]?.startsWith('esp32:'),
    )
    expect(esp32Boards.every((profile) =>
      boardProfilesForFamily(boardProfileFamilyId(profile)).includes(profile),
    )).toBe(true)
  })

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

describe('reviewed controller profiles', () => {
  const reviewed = ['esp32-c3-super-mini', 'esp32-c6-devkitc-1', 'esp8266-lolin-d1-mini', 'raspberry-pi-pico-w', 'teensy-4-1', 'arduino-nano-esp32', 'wt32-eth01', 'quinled-dig-uno', 'quinled-dig-quad']

  it.each(reviewed)('authors %s rather than taking the generated map', (id) => {
    const profile = boardProfileById(id)!
    expect(profile.confidence).not.toBe('visual-match-only')
    expect(profile.caveats.join(' ')).not.toMatch(/not hand-checked/)
    expect(profile.render?.file).toBe(`boards/${id}.webp`)
    expect(profile.pinSafety?.safeGeneralPurpose.length).toBeGreaterThan(0)
    expect(profile.pins?.filter((pin) => pin.role === 'power-in')).toHaveLength(1)
  })

  /*
   * The common Super Mini pinout image is the underside with USB at the top.
   * Copied without turning it over, it put 5V at the antenna end of the board
   * and GPIO0 beside the USB-C; the photographed board has them the other way.
   */
  it('puts the C3 Super Mini supply pads beside its USB-C connector', () => {
    const c3 = boardProfileById('esp32-c3-super-mini')
    expect(c3?.pins?.map((pin) => pin.label.split(' ')[0])).toEqual([
      'GPIO0', 'GPIO1', 'GPIO2', 'GPIO3', 'GPIO4', '3V3', 'GND', '5V',
      'GPIO21', 'GPIO20', 'GPIO10', 'GPIO9', 'GPIO8', 'GPIO7', 'GPIO6', 'GPIO5',
    ])
    // A clone's power path is unverified, so no converter is planned into it.
    expect(c3?.confidence).toBe('pinout-verified')
  })

  it('maps the D1 Mini A0 pad to the analog-only pin the core calls 17', () => {
    const d1 = boardProfileById('esp8266-lolin-d1-mini')
    expect(boardPinForGpio(d1, 17)).toMatchObject({ label: 'A0', role: 'analog', anchorId: 'left-2' })
    expect(boardPinForGpio(d1, 2)?.label).toBe('D4 / GPIO2')
  })

  it('feeds the Pico W through VSYS, not VBUS', () => {
    const pico = boardProfileById('raspberry-pi-pico-w')
    expect(pico?.pins?.find((pin) => pin.role === 'power-in')?.label).toBe('VSYS')
    expect(pico?.pins?.find((pin) => pin.label === 'VBUS')?.role).toBe('power-out')
    expect(boardPinForGpio(pico, 0)?.anchorId).toBe('right-20')
  })

  /*
   * The Nano ESP32's core numbers pins by their D and A names unless told
   * otherwise; Studio's sketches use GPIO numbers, so the map must too.
   */
  it('maps the Nano ESP32 header by GPIO number, D6 being GPIO9', () => {
    const nano = boardProfileById('arduino-nano-esp32')
    expect(nano?.pins).toHaveLength(30)
    expect(boardPinForGpio(nano, 9)?.label).toBe('D6 / GPIO9')
    expect(boardPinForGpio(nano, 48)?.anchorId).toBe('right-15')
    expect(boardPinForGpio(nano, 43)?.anchorId).toBe('left-1')
    expect(nano?.targetFamilies).toEqual(['esp32-s3'])
    expect(nano?.pins?.find((pin) => pin.role === 'power-in')).toMatchObject({ label: 'VIN', inputVoltage: { min: 6, max: 21 } })
  })

  it('keeps the Teensy 4.1 rails in PJRC order, USB at the bottom', () => {
    const teensy = boardProfileById('teensy-4-1')
    expect(teensy?.pins).toHaveLength(48)
    expect(boardPinForGpio(teensy, 33)?.anchorId).toBe('left-1')
    expect(boardPinForGpio(teensy, 0)?.anchorId).toBe('right-23')
    expect(teensy?.pins?.find((pin) => pin.role === 'power-in')?.anchorId).toBe('left-24')
  })

  /*
   * Wireless-Tag's drawing: the flashing header's EN, GND, 3V3 and TXD0, RXD0,
   * IO0 head the two rails. The LAN8720A owns ten pins over RMII, and GPIO0 is
   * on the header only because the ROM bootloader needs it.
   */
  it('maps the WT32-ETH01 header and its built-in Ethernet', () => {
    const wt32 = boardProfileById('wt32-eth01')
    expect(wt32?.pins).toHaveLength(26)
    expect(boardPinForGpio(wt32, 4)?.anchorId).toBe('right-11')
    expect(boardPinForGpio(wt32, 32)?.label).toBe('IO32 / CFG')
    expect(boardPinForGpio(wt32, 0)).toMatchObject({ role: 'reserved', availability: 'unavailable' })
    expect(wt32?.pins?.filter((pin) => pin.role === 'power-in').map((pin) => pin.label)).toEqual(['5V'])
    expect(wt32?.hasUsb).toBe(false)
    expect(wt32?.onboardEthernet).toEqual({
      phy: 'ETH_PHY_LAN8720', phyAddress: 1, mdcPin: 23, mdioPin: 18, powerPin: 16, clockMode: 'ETH_CLOCK_GPIO0_IN',
    })
    for (const gpio of [16, 18, 19, 21, 22, 23, 25, 26, 27]) expect(boardPinForGpio(wt32, gpio), `GPIO${gpio}`).toBeUndefined()
  })

  it('maps the Dig-Uno output terminals and exposed headers', () => {
    const uno = boardProfileById('quinled-dig-uno')
    expect(uno?.pins).toHaveLength(16)
    expect(uno?.pins?.find((pin) => pin.role === 'power-in')).toMatchObject({
      label: 'VIN 5-24V', inputVoltage: { min: 5, max: 24 },
    })
    expect(boardPinForGpio(uno, 16)).toMatchObject({ anchorId: 'right-4', label: 'LED1 / GPIO16' })
    expect(boardPinForGpio(uno, 3)).toMatchObject({ anchorId: 'right-3', label: 'LED2 / GPIO3' })
    expect(boardPinForGpio(uno, 21)?.label).toBe('SDA / GPIO21')
    expect(boardPinForGpio(uno, 36)?.role).toBe('analog')
  })

  it('maps the Sparkle Motion terminals, STEMMA bus and MINI-1 UART pads', () => {
    const board = boardProfileById('adafruit-sparkle-motion')
    expect(board?.pins).toHaveLength(15)
    expect(board?.render).toBeUndefined()
    expect(board?.dimensionsMm).toEqual({ width: 50.8, height: 33.147 })
    expect(board?.pins?.find((pin) => pin.role === 'power-in')).toMatchObject({
      label: 'VIN 5-24V', inputVoltage: { min: 5, max: 24 },
    })
    expect([21, 22, 19, 23].map((gpio) => boardPinForGpio(board, gpio)?.label)).toEqual([
      'SIG1 / GPIO21', 'SIG2 / GPIO22', 'SIG3 / GPIO19', 'SIG4 / GPIO23',
    ])
    expect(boardPinForGpio(board, 14)?.label).toBe('SDA / GPIO14')
    expect(boardPinForGpio(board, 13)?.label).toBe('SCL / GPIO13')
    expect(boardPinForGpio(board, 9)?.label).toBe('TX / GPIO9')
    expect(boardPinForGpio(board, 10)?.label).toBe('RX / GPIO10')
    expect(board?.pinSafety?.safeGeneralPurpose).toEqual(expect.arrayContaining([9, 10, 18]))
    expect(board?.pinSafety?.boardReservedOrNotExposed[25]).toMatch(/microphone/)
    expect(board?.pinSafety?.boardReservedOrNotExposed[32]).toMatch(/IR/)
    expect(board?.peripheralPins?.fastLedData?.recommendedDefault).toBe(21)
    expect(board?.peripheralPins?.inmp441).toEqual({ wsLrclk: 27, sckBclk: 18, sdDout: 9 })
  })

  it('maps the Sparkle Motion Mini as a USB-powered two-output board', () => {
    const board = boardProfileById('adafruit-sparkle-motion-mini')
    expect(board?.pins).toHaveLength(13)
    expect(board?.render).toBeUndefined()
    expect(board?.pins?.filter((pin) => pin.role === 'power-in')).toEqual([])
    expect(board?.pins?.find((pin) => pin.label === '5V')?.role).toBe('power-out')
    expect([32, 33].map((gpio) => boardPinForGpio(board, gpio)?.label)).toEqual([
      'SIG1 / GPIO32', 'SIG2 / GPIO33',
    ])
    expect(boardPinForGpio(board, 19)?.label).toBe('SDA / GPIO19')
    expect(boardPinForGpio(board, 22)?.label).toBe('SCL / GPIO22')
    expect(boardPinForGpio(board, 9)).toBeUndefined()
    expect(board?.pinSafety?.boardReservedOrNotExposed[9]).toMatch(/microphone/)
    expect(board?.pinSafety?.boardReservedOrNotExposed[5]).toMatch(/3\.3 V/)
    expect(board?.peripheralPins?.fastLedData).toMatchObject({
      recommendedDefault: 32, commonAlternatives: [33],
    })
  })

  it('maps the Dig-Quad four output terminals and exposed headers', () => {
    const quad = boardProfileById('quinled-dig-quad')
    expect(quad?.pins).toHaveLength(18)
    expect(quad?.pins?.find((pin) => pin.role === 'power-in')).toMatchObject({
      label: 'VIN 5-24V', inputVoltage: { min: 5, max: 24 },
    })
    expect([16, 3, 1, 4].map((gpio) => boardPinForGpio(quad, gpio)?.label)).toEqual([
      'LED1 / GPIO16', 'LED2 / GPIO3', 'LED3 / GPIO1', 'LED4 / GPIO4',
    ])
    expect(boardPinForGpio(quad, 21)?.label).toBe('SDA / GPIO21')
    expect(boardPinForGpio(quad, 36)?.role).toBe('analog')
  })
})

describe('imported board profiles', () => {
  it('includes the complete 15-board import batch with renders and pin maps', () => {
    const importedBoardIds = [
      'arduino-uno-r3-dip',
      'esp32-c3-devkitm-1',
      'esp32-c3-super-mini',
      'esp32-c6-devkitc-1',
      'esp32-c6-devkitm-1',
      'esp32-c6-super-mini',
      'esp32-h2-devkitm-1',
      'esp32-h2-super-mini',
      'esp8266-adafruit-feather-huzzah',
      'esp8266-lolin-d1-mini',
      'esp8266-nodemcu-v2-amica',
      'esp8266-wemos-d1-r2',
      'lolin-c3-mini',
      'seeed-xiao-esp32c3',
      'seeed-xiao-esp32c6',
    ]

    for (const id of importedBoardIds) {
      const profile = boardProfileById(id)
      expect(profile, id).toBeDefined()
      expect(profile?.render?.file, id).toBe(`boards/${id}.webp`)
      expect(profile?.pins?.length, id).toBeGreaterThan(0)
      expect(profile?.compatibleFqbns.length, id).toBeGreaterThan(0)
    }
  })

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

  it('imports integrated controller/display packages as boards, not plug-in parts', () => {
    const cyd = boardProfileById('esp32-2432s028r')
    expect(cyd).toBeTruthy()
    expect(cyd?.render?.file).toBe('boards/esp32-2432s028r.webp')
    expect(cyd?.compatibleFqbns).toContain('esp32:esp32:esp32')
    expect(cyd?.pins).toHaveLength(9)
    expect(boardPinForGpio(cyd, 35)?.label).toBe('GPIO35')
  })

  it('has explicit positive pin advice for every board with header pins', () => {
    expect(UNLISTED_SAFETY_IDS).toEqual([])
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

  it('rejects an unusable declared internal-RAM budget', () => {
    expect(validateBoardProfiles([fixture({ internalRamBudgetBytes: 0 })]))
      .toContain('fixture-board: internal RAM budget must be a positive whole number of bytes')
    expect(validateBoardProfiles([fixture({ internalRamBudgetBytes: 1024.5 })]))
      .toContain('fixture-board: internal RAM budget must be a positive whole number of bytes')
  })
})

describe('internal-RAM budgets', () => {
  it('gives the known S3 boards more graph-allocation headroom than classic ESP32 boards', () => {
    expect(boardProfileById('esp32-generic-devkit-38pin')?.internalRamBudgetBytes).toBe(96 * 1024)
    expect(boardProfileById('esp32-devkit-v1-30pin-esp32d')?.internalRamBudgetBytes).toBe(96 * 1024)
    expect(boardProfileById('espressif-esp32-s3-devkitc-1')?.internalRamBudgetBytes).toBe(192 * 1024)
  })

  /*
   * The classic budget has to admit a custom screen, which is what it was
   * raised on 2026-09-22 to do.
   *
   * At 48 KiB it refused one outright — a 14-widget design estimates 77,556
   * bytes of graph allocations — so every custom-screen build on every classic
   * ESP32 was rejected before a compiler ran, and HW-25 existed to explain
   * that as a hardware limit it is not. Asserting against the estimator's real
   * figure rather than a literal, so a future change to what a screen costs
   * fails here instead of silently re-closing the door.
   */
  it('admits a custom screen on a classic ESP32, with headroom', () => {
    const classic = boardProfileById('esp32-generic-devkit-38pin')!.internalRamBudgetBytes!
    const measuredCustomScreenBytes = 77_556
    expect(classic).toBeGreaterThan(measuredCustomScreenBytes)
    expect(classic - measuredCustomScreenBytes).toBeGreaterThan(16 * 1024)
  })

  /*
   * The one imported profile that has been on a bench carries a budget; the
   * rest still do not, which is the rule below rather than an oversight.
   */
  it('gives the measured CYD the same classic-ESP32 budget as its siblings', () => {
    expect(boardProfileById('esp32-2432s028r')?.internalRamBudgetBytes).toBe(96 * 1024)
  })

  it('leaves uncalibrated profiles undeclared so callers can use the warning fallback', () => {
    expect(boardProfileById('lolin-s2-mini')?.internalRamBudgetBytes).toBeUndefined()
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

describe('Generic ESP32-S3 N16R8 audio pins', () => {
  it('uses amplifier pins that exist on the 44-pin header', () => {
    const profile = boardProfileById('generic-esp32-s3-n16r8-44pin-dual-usbc')
    expect(profile?.peripheralPins?.max98357).toEqual({ bclk: 17, lrc: 18, din: 16 })

    for (const pin of [17, 18, 16]) {
      expect(boardPinForGpio(profile, pin), `GPIO${pin} is exposed`).toBeTruthy()
      expect(profile?.pinSafety?.safeGeneralPurpose).toContain(pin)
    }
    // These are classic-ESP32 defaults, not pins on this board.
    for (const pin of [26, 25, 22]) expect(boardPinForGpio(profile, pin), `GPIO${pin} is absent`).toBeUndefined()
  })
})

describe('module flash size', () => {
  it('records what the N16R8 boards actually carry', () => {
    // The part number says it and esptool confirms it on the bench: 16MB flash,
    // 8MB octal PSRAM. Recorded because `esp32:esp32:esp32s3` is generic and
    // resolves to the stock 8MB N8 board id, so without this the build and the
    // capacity meter both target half the real flash.
    for (const id of ['generic-esp32-s3-n16r8-44pin-dual-usbc', 'lolin-s3-40pin-dual-usbc']) {
      expect(boardProfileById(id)?.memory, id).toEqual({ flashMb: 16, psramMb: 8 })
      expect(boardProfileById(id)?.psramMode, id).toBe('opi')
    }
  })

  it('says nothing for a board whose module size is not documented', () => {
    // Never guessed: an N8 part told it has 16MB produces an image it cannot
    // boot, so silence leaves the board id's own manifest in charge.
    expect(selectedBoardFlashMb([
      { data: { nodeType: 'Board', properties: { profileId: 'espressif-esp32-s3-devkitc-1' } } },
    ])).toBeUndefined()
  })

  it('reads the size off the board the graph selected', () => {
    expect(selectedBoardFlashMb([
      { data: { nodeType: 'Board', properties: { profileId: 'generic-esp32-s3-n16r8-44pin-dual-usbc' } } },
    ])).toBe(16)
  })
})


describe('a board whose package carries no pin safety', () => {
  // `pinSafetySummary` is a field of the Blender board asset, and the CYD's
  // package has none — it arrived as an integrated controller/display package
  // rather than as a devkit. Hand-authored safety fills that gap; these tests
  // exist because the gap itself used to be invisible.
  const cyd = () => boardProfileById(CYD_TOUCH_DISPLAY.boardProfileId)

  it('counts a profile with no safety data at all as a gap, not as complete', () => {
    // The shape that hid: the old check asked whether the allowlist was empty,
    // which a profile carrying no `pinSafety` at all can never be. So a board
    // with no advice whatsoever passed the audit while the allocator fell
    // through to chip-level rules behind it.
    const withPins = { pins: [{ id: 'p1', label: 'GPIO4', role: 'gpio' as const, anchorId: 'a1', gpio: 4 }] }
    expect(lacksPinAdvice(fixture(withPins))).toBe(true)
    expect(lacksPinAdvice(fixture({
      ...withPins,
      pinSafety: { safeGeneralPurpose: [], useWithCaution: {}, boardReservedOrNotExposed: {} },
    }))).toBe(true)
    expect(lacksPinAdvice(fixture({
      ...withPins,
      pinSafety: { safeGeneralPurpose: [4], useWithCaution: {}, boardReservedOrNotExposed: {} },
    }))).toBe(false)
    // A board with no pin map has nothing to advise about.
    expect(lacksPinAdvice(fixture())).toBe(false)
  })

  it('offers the two pads the CYD actually brings out, and nothing else', () => {
    // Four GPIO pads, two of them spoken for: GPIO21 is the fitted panel's
    // backlight and GPIO35 is input-only on a classic ESP32.
    expect(cyd()?.pinSafety?.safeGeneralPurpose).toEqual([22, 27])
    for (const pin of [22, 27]) {
      expect(boardPinForGpio(cyd(), pin)?.label, `GPIO${pin} is a pad`).toBe(`GPIO${pin}`)
      expect(boardPinVerdict(cyd(), pin)).toEqual({ standing: 'safe' })
    }
    expect(boardPinVerdict(cyd(), 35).standing).toBe('caution')
  })

  it('reserves the UART pins the chip-level fallback used to offer first', () => {
    // The symptom that sent us looking: with no board-level advice, an LED
    // output added on this board was offered GPIO1 — the USB-serial TX.
    expect(boardPinVerdict(cyd(), 1).standing).toBe('reserved')
    expect(boardPinVerdict(cyd(), 3).standing).toBe('reserved')
  })

  it('reserves every pin the fitted display is soldered to, and no tied line', () => {
    // Derived from `integratedBoardHardware.ts` rather than restated, so a
    // bench rerun that corrects a pin there corrects this with it.
    for (const [key, value] of Object.entries(CYD_TOUCH_DISPLAY.panelProperties)) {
      if (typeof value !== 'number') continue
      if (value === NO_PIN) {
        // The panel reset is tied to the board's own EN line. There is no GPIO
        // to reserve, and reserving 255 would invent a pin.
        expect(boardPinVerdict(cyd(), value).standing).toBe('unknown')
        continue
      }
      expect(boardPinVerdict(cyd(), value).standing, key).toBe('reserved')
    }
    // The backlight is a pad someone can reach, so its reason has to say what
    // is already on it rather than claiming it is not brought out.
    expect(boardPinVerdict(cyd(), 21).reason).toMatch(/touch display \(backlight\)/)
  })

  it('explains itself in the board notes as well as per pin', () => {
    expect(cyd()?.safetyNotes?.join(' ')).toMatch(/four GPIO pads/)
  })
})
