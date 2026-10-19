/**
 * What each board family's LED drivers can do, read from the pinned FastLED
 * 3.10.5 rather than from taste. The wire-time estimate, Graph Health and
 * code generation all read these facts, so a driver claim is made once.
 *
 * Sources, all under the installed library's `src/`:
 * - default buses: `fl/channels/bus.h` (`DefaultBus<ClocklessChipset>`,
 *   `DefaultBus<SpiChipsetConfig>`);
 * - RMT channels and memory: `platforms/esp/32/drivers/rmt/rmt_5/README.md`,
 *   `rmt_memory_manager.cpp.hpp` and `common.h` (`FASTLED_RMT_MEM_BLOCKS` 2,
 *   `FASTLED_RMT_MEM_BLOCKS_NETWORK_MODE` 3);
 * - clockless timings: `fl/chipsets/led_timing.h`; clocked default rates:
 *   `fl/chipsets/apa102.h`, `hd108.h`, `ws2801.h`.
 *
 * Documented in docs/architecture/board-capabilities.md ("LED drivers").
 */
import type { BuildTargetFamily } from './buildProfile'

/** A FastLED 3.10.5 `fl::Bus`, or `LEGACY` for a platform's per-pin controller outside the channel API. */
export type LedBus =
  | 'RMT' | 'PARLIO' | 'I2S' | 'I2S_SPI' | 'LCD_SPI' | 'LCD_CLOCKLESS' | 'LCD_RGB'
  | 'SPI' | 'UART' | 'OBJECT_FLED' | 'FLEX_IO' | 'LPUART' | 'BIT_BANG' | 'LEGACY'

/** The RMT peripheral's transmit side, as FastLED's RMT5 memory manager sees it. */
export interface RmtFacts {
  /** TX channels the chip has. */
  txChannels: number
  /** TX symbol memory, in 32-bit words. */
  txMemoryWords: number
  /** Words in one memory block (`SOC_RMT_MEM_WORDS_PER_CHANNEL`). */
  blockWords: number
  /** Blocks a channel asks for with no network up. */
  idleBlocks: number
  /** Blocks a channel asks for with Wi-Fi, Ethernet or Bluetooth up. */
  networkBlocks: number
  /** Whether RX shares the TX pool (ESP32, S2), so an IR receiver takes TX memory. */
  sharedPool: boolean
}

export interface LedDriverFacts {
  /** The chip these facts describe, for messages. */
  chip: string
  /** FastLED's default clockless driver. */
  clocklessBus: LedBus
  /** FastLED's default clocked (SPI chipset) driver; `LEGACY` is hardware or bit-banged SPI per controller. */
  spiBus: LedBus
  /**
   * Clockless outputs the default driver sends at once. 1 means one after
   * another, so every output's wire time adds up.
   */
  parallelOutputs: number
  /** Present on chips whose default clockless driver is RMT. */
  rmt: RmtFacts | null
  /** Whether the CPU has a hardware floating-point unit. */
  fpu: boolean
}

const RMT_IDLE_BLOCKS = 2
const RMT_NETWORK_BLOCKS = 3

const rmt = (txChannels: number, blockWords: number, txMemoryWords: number, sharedPool: boolean): RmtFacts => ({
  txChannels, txMemoryWords, blockWords, idleBlocks: RMT_IDLE_BLOCKS, networkBlocks: RMT_NETWORK_BLOCKS, sharedPool,
})

const sequential = (chip: string, fpu: boolean): LedDriverFacts => ({
  chip, clocklessBus: 'LEGACY', spiBus: 'LEGACY', parallelOutputs: 1, rmt: null, fpu,
})

const FAMILY_FACTS: Record<BuildTargetFamily, LedDriverFacts> = {
  esp32: { chip: 'ESP32', clocklessBus: 'RMT', spiBus: 'I2S_SPI', parallelOutputs: 8, rmt: rmt(8, 64, 512, true), fpu: true },
  'esp32-s2': { chip: 'ESP32-S2', clocklessBus: 'RMT', spiBus: 'LEGACY', parallelOutputs: 4, rmt: rmt(4, 64, 256, true), fpu: false },
  'esp32-s3': { chip: 'ESP32-S3', clocklessBus: 'RMT', spiBus: 'LCD_SPI', parallelOutputs: 4, rmt: rmt(4, 48, 192, false), fpu: true },
  'esp32-c3': { chip: 'ESP32-C3', clocklessBus: 'RMT', spiBus: 'LEGACY', parallelOutputs: 2, rmt: rmt(2, 48, 96, false), fpu: false },
  // PARLIO is the default on the C6 and H2; RMT stays the fallback FastLED uses
  // when PARLIO cannot take an output, so its memory facts still apply.
  'esp32-c6': { chip: 'ESP32-C6', clocklessBus: 'PARLIO', spiBus: 'LEGACY', parallelOutputs: 2, rmt: rmt(2, 48, 96, false), fpu: false },
  'esp32-h2': { chip: 'ESP32-H2', clocklessBus: 'PARLIO', spiBus: 'LEGACY', parallelOutputs: 2, rmt: rmt(2, 48, 96, false), fpu: false },
  esp8266: sequential('ESP8266', false),
  // The opt-in FASTLED_RP2040_CLOCKLESS_PIO_AUTO driver groups consecutive
  // pins; without it each PIO output is counted one after another.
  rp2040: sequential('RP2040', false),
  // Teensy 4.x defaults to ObjectFLED; `teensyFacts` separates the chips.
  teensy: { chip: 'Teensy 4.x', clocklessBus: 'OBJECT_FLED', spiBus: 'LEGACY', parallelOutputs: 16, rmt: null, fpu: true },
  avr: sequential('AVR', false),
  samd: sequential('SAMD', false),
  sam: sequential('SAM3X', false),
  renesas: sequential('RA4M1', true),
  nrf52: sequential('nRF52', true),
  unknown: sequential('this board', false),
}

/**
 * The facts for a build target, refined by the board's FQBN where one family
 * covers different chips: Teensy 3.x has no ObjectFLED, and the Pico 2's
 * RP2350 has an FPU the RP2040 lacks.
 */
export function ledDriverFacts(family: BuildTargetFamily, fqbn = ''): LedDriverFacts {
  const board = fqbn.toLowerCase().split(':').at(-1) ?? ''
  if (family === 'teensy' && board && !/^teensy4/.test(board)) {
    // 3.5/3.6 have a single-precision FPU; 3.2 and LC do not.
    return sequential(`Teensy ${board.replace(/^teensy/, '')}`, /^teensy3[56]$/.test(board))
  }
  if (family === 'rp2040' && /rpipico2|rp2350/.test(board)) return sequential('RP2350', true)
  return FAMILY_FACTS[family] ?? FAMILY_FACTS.unknown
}

/**
 * How many RMT outputs fit in TX memory at once, before FastLED serializes
 * the rest through its worker pool. `reservedWords` is memory something else
 * holds in the same pool (an IR receiver on a shared-pool chip).
 */
export function rmtOutputsThatFit(facts: RmtFacts, networkActive: boolean, reservedWords = 0): number {
  const perChannel = (networkActive ? facts.networkBlocks : facts.idleBlocks) * facts.blockWords
  const free = Math.max(0, facts.txMemoryWords - reservedWords)
  return Math.min(facts.txChannels, Math.floor(free / perChannel))
}

/** How a chipset puts bits on the wire. */
export type ChipsetWire =
  | { kind: 'clockless'; bitNs: number; bitsPerLed: number; resetUs: number }
  | { kind: 'clocked'; defaultHz: number; bitsPerLed: number; frameBits: (leds: number) => number }

/** Bit period T1+T2+T3 from `led_timing.h`. */
const WS2812_BIT_NS = 250 + 625 + 375

/**
 * Wire facts for every chipset the LED output offers.
 *
 * Clockless resets are FastLED's own figures (WS2815's is 0 there). Clocked
 * frames count the APA102 start and end frames and HD108's 64-bit start
 * frame; WS2801 latches by holding the clock low.
 */
export const CHIPSET_WIRE: Record<string, ChipsetWire> = {
  WS2812B: { kind: 'clockless', bitNs: WS2812_BIT_NS, bitsPerLed: 24, resetUs: 280 },
  NEOPIXEL: { kind: 'clockless', bitNs: WS2812_BIT_NS, bitsPerLed: 24, resetUs: 280 },
  // FastLED's WS2811 is the 800 kHz controller (TIMING_WS2811_800KHZ_LEGACY).
  WS2811: { kind: 'clockless', bitNs: 250 + 350 + 650, bitsPerLed: 24, resetUs: 280 },
  WS2815: { kind: 'clockless', bitNs: 250 + 1090 + 550, bitsPerLed: 24, resetUs: 0 },
  SK6812: { kind: 'clockless', bitNs: 300 + 600 + 300, bitsPerLed: 24, resetUs: 80 },
  'SK6812-RGBW': { kind: 'clockless', bitNs: 300 + 600 + 300, bitsPerLed: 32, resetUs: 80 },
  // 16 bits a channel, forwarded through the WS2812 controller.
  WS2816: { kind: 'clockless', bitNs: WS2812_BIT_NS, bitsPerLed: 48, resetUs: 280 },
  SM16824E: { kind: 'clockless', bitNs: 300 + 900 + 100, bitsPerLed: 24, resetUs: 200 },
  APA102: { kind: 'clocked', defaultHz: 6_000_000, bitsPerLed: 32, frameBits: (leds) => 32 + Math.max(32, Math.ceil(leds / 2)) },
  APA102HD: { kind: 'clocked', defaultHz: 6_000_000, bitsPerLed: 32, frameBits: (leds) => 32 + Math.max(32, Math.ceil(leds / 2)) },
  HD108: { kind: 'clocked', defaultHz: 25_000_000, bitsPerLed: 64, frameBits: () => 128 },
  WS2801: { kind: 'clocked', defaultHz: 1_000_000, bitsPerLed: 24, frameBits: () => 0 },
}

/**
 * The clock rates, in whole MHz, the LED output offers for each clocked
 * chipset, slowest first. Each list holds FastLED's own default
 * (`CHIPSET_WIRE[...].defaultHz`) and stops at the part's ceiling:
 * - APA102 and APA102HD: 24 MHz. `apa102.h` defaults to 6 MHz because long
 *   strips lose data at full speed (the clock degrades LED to LED), and names
 *   12 and 24 MHz as the rates its controllers were tuned at;
 * - HD108: 40 MHz, the maximum `hd108.h` states beside its 25 MHz default;
 * - WS2801: 25 MHz, the datasheet's maximum, which `ws2801.h` also uses as the
 *   WS2803 default.
 *
 * Only whole MHz: on software-SPI platforms `DATA_RATE_MHZ(n)` is a CPU-cycle
 * divider computed with integer division. ESP32 hardware SPI takes the rate in
 * Hz and rounds it down to the nearest divider of its 80 MHz clock.
 */
export const CLOCKED_DATA_RATES_MHZ: Readonly<Record<string, readonly number[]>> = {
  APA102: [1, 2, 4, 6, 8, 10, 12, 16, 20, 24],
  APA102HD: [1, 2, 4, 6, 8, 10, 12, 16, 20, 24],
  HD108: [6, 8, 10, 12, 16, 20, 25, 30, 40],
  WS2801: [1, 2, 4, 5, 8, 10, 12, 16, 20, 25],
}

/** FastLED's default clock for a clocked chipset, in MHz; null for a clockless one. */
export function defaultDataRateMhz(chipset: string): number | null {
  const wire = CHIPSET_WIRE[chipset]
  return wire?.kind === 'clocked' ? wire.defaultHz / 1_000_000 : null
}

/** The rates a chipset's data-rate setting offers; empty for a clockless chipset. */
export function dataRateOptionsMhz(chipset: string): readonly number[] {
  return CLOCKED_DATA_RATES_MHZ[chipset] ?? []
}

/**
 * The clock a LED output's `dataRateMhz` asks for, in MHz. Anything the
 * chipset does not offer (0, a stale rate left by another chipset, a
 * hand-edited save) means FastLED's default. Null for a clockless chipset.
 */
export function effectiveDataRateMhz(chipset: string, dataRateMhz: unknown): number | null {
  const fallback = defaultDataRateMhz(chipset)
  if (fallback === null) return null
  const rate = Number(dataRateMhz)
  return dataRateOptionsMhz(chipset).includes(rate) ? rate : fallback
}

/**
 * The `dataRateMhz` a chipset change should leave. A rate the new chipset
 * offers is kept unless it was simply the old chipset's default, which stops
 * meaning "FastLED's default" once the chipset changes (APA102's 6 MHz would
 * otherwise slow an HD108 from its 25 MHz). Everything else returns to 0, the
 * new chipset's default.
 */
export function dataRateAfterChipsetChange(fromChipset: string, toChipset: string, dataRateMhz: unknown): number {
  const rate = Number(dataRateMhz)
  if (!dataRateOptionsMhz(toChipset).includes(rate)) return 0
  if (rate === defaultDataRateMhz(fromChipset)) return 0
  return rate
}

/**
 * The "faster clock" fix for wire-time advice: the next rate up the chipset
 * offers from the one this output sends at, or null when it is clockless or
 * already at its ceiling.
 */
export function clockedRateFix(chipset: string, dataRateMhz: unknown): { fromMhz: number; toMhz: number } | null {
  const fromMhz = effectiveDataRateMhz(chipset, dataRateMhz)
  if (fromMhz === null) return null
  const toMhz = dataRateOptionsMhz(chipset).find((rate) => rate > fromMhz)
  return toMhz === undefined ? null : { fromMhz, toMhz }
}

/**
 * Microseconds one output takes to send `leds` LEDs, including its reset or
 * frame overhead. `dataRateHz` overrides a clocked chipset's default clock;
 * an unknown chipset is charged as a WS2812B.
 */
export function chipsetSendMicros(chipset: string, leds: number, dataRateHz?: number): number {
  const wire = CHIPSET_WIRE[chipset] ?? CHIPSET_WIRE.WS2812B
  if (wire.kind === 'clockless') return (leds * wire.bitsPerLed * wire.bitNs) / 1000 + wire.resetUs
  const hz = dataRateHz && dataRateHz > 0 ? dataRateHz : wire.defaultHz
  return ((leds * wire.bitsPerLed + wire.frameBits(leds)) * 1_000_000) / hz
}

// ── Drivers the Board can choose ─────────────────────────────────────────
//
// The Board's `ledDriver` property names one of these, or `auto` for FastLED's
// own choice above. Read from the same pinned 3.10.5:
// - `fl/channels/bus.h` (`enum class Bus`) and each driver's `bus_traits.h`
//   for the spelling and the header that makes `BusTraits<B>` visible;
// - `platforms/esp/32/feature_flags/enabled.h` for which chip builds which
//   driver (`FASTLED_ESP32_HAS_LCD_SPI` and `FASTLED_ESP32_HAS_I2S_LCD_CAM` on
//   the S3 only, the RMT5 driver on every chip with RMT);
// - `platforms/esp/32/drivers/i2s/clockless_i2s_esp32.h` and
//   `platforms/esp/clockless.h` for the classic ESP32's I2S driver, which is
//   not a `Bus` at all: `#define FASTLED_ESP32_I2S true` before the FastLED
//   include swaps the clockless controller every `addLeds` builds. `Bus::I2S`
//   names the S3's LCD_CAM driver instead (its `bus_traits.h` says so).
//
// Deliberately not offered: UART (`channel_manager_esp32.cpp.hpp` ranks it
// last as "broken, not recommended"), the clockless-over-SPI driver (ranked
// below RMT "due to reliability issues", one SPI host per output), FLEX_IO
// (one strip at a time on FlexIO2 pins, behind Teensy's 16-lane ObjectFLED
// default) and BIT_BANG. None of them sends a frame faster than the default.
//
// Documented in docs/architecture/board-capabilities.md ("LED drivers").

/** The Board's `ledDriver` value that keeps FastLED's own choice. */
export const LED_DRIVER_AUTO = 'auto'
export type LedDriverChoice = typeof LED_DRIVER_AUTO | LedBus

/** A peripheral a driver takes for its own, for Graph Health's conflict checks. */
export type LedDriverPeripheral = 'LCD_CAM' | 'I2S0' | 'RMT'

export interface SelectableLedDriver {
  /** The `fl::Bus` the sketch names (the Board's `ledDriver` value). */
  bus: LedBus
  /** Short name for the Board's driver select. */
  label: string
  /** One sentence for the select's help and Graph Health. */
  summary: string
  /**
   * How a sketch selects it. `exclusive`: `FastLED.setExclusiveDriver<B>()`
   * before the first output, with the clockless outputs built on the channel
   * API, because a legacy `addLeds<CHIPSET, PIN>` controller binds the
   * platform default in its own constructor (`idf5_clockless.h`,
   * `clockless_parlio_esp32.h`) and naming another bus alone moves nothing.
   * `legacy-define`: a define before the FastLED include.
   */
  selection: 'exclusive' | 'legacy-define'
  /** The header giving `BusTraits<bus>`, under FastLED's `src/` (exclusive only). */
  traitsHeader?: string
  /** Clockless outputs the driver sends at once. */
  parallelOutputs: number
  /** Whether every lane is clocked together, so all of them need one timing. */
  sharedTiming: boolean
  /** The peripheral it takes. */
  peripheral: LedDriverPeripheral
}

const S3_LCD_CLOCKLESS: SelectableLedDriver = {
  bus: 'LCD_CLOCKLESS',
  label: 'LCD_CAM parallel',
  summary: 'Sends up to 16 clockless outputs at once through the S3\'s LCD_CAM peripheral, instead of four at a time over RMT.',
  selection: 'exclusive',
  traitsHeader: 'platforms/esp/32/drivers/lcd_spi/bus_traits.h',
  parallelOutputs: 16,
  sharedTiming: true,
  peripheral: 'LCD_CAM',
}

const S3_I2S_LCD_CAM: SelectableLedDriver = {
  bus: 'I2S',
  label: 'LCD_CAM, older driver',
  summary: 'FastLED\'s earlier LCD_CAM driver (named I2S in FastLED), up to 16 outputs at once. LCD_CAM parallel replaces it.',
  selection: 'exclusive',
  traitsHeader: 'platforms/esp/32/drivers/i2s/bus_traits.h',
  parallelOutputs: 16,
  sharedTiming: true,
  peripheral: 'LCD_CAM',
}

const CLASSIC_I2S: SelectableLedDriver = {
  bus: 'I2S',
  label: 'I2S parallel',
  summary: 'FastLED\'s I2S driver for the classic ESP32, up to 24 outputs at once. FastLED warns it may not be reliable on ESP-IDF 5 (Arduino-ESP32 3.x).',
  selection: 'legacy-define',
  parallelOutputs: 24,
  sharedTiming: true,
  peripheral: 'I2S0',
}

const rmtDriver = (txChannels: number): SelectableLedDriver => ({
  bus: 'RMT',
  label: 'RMT',
  summary: `The RMT peripheral instead of PARLIO, ${txChannels} outputs at once.`,
  selection: 'exclusive',
  traitsHeader: 'platforms/esp/32/drivers/rmt/rmt_5/bus_traits.h',
  parallelOutputs: txChannels,
  sharedTiming: false,
  peripheral: 'RMT',
})

/**
 * The drivers the Board can choose for a target besides `auto`, in the order
 * the select offers them. Empty means FastLED's choice is the only one.
 */
export function selectableLedDrivers(family: BuildTargetFamily, fqbn = ''): readonly SelectableLedDriver[] {
  switch (family) {
    case 'esp32': return [CLASSIC_I2S]
    case 'esp32-s3': return [S3_LCD_CLOCKLESS, S3_I2S_LCD_CAM]
    case 'esp32-c6':
    case 'esp32-h2': return [rmtDriver(ledDriverFacts(family, fqbn).rmt?.txChannels ?? 2)]
    default: return []
  }
}

/** The chosen driver if the target offers it, else null (`auto`, or anything unlisted). */
export function selectedLedDriverFor(family: BuildTargetFamily, fqbn: string, choice: unknown): SelectableLedDriver | null {
  if (typeof choice !== 'string' || choice === LED_DRIVER_AUTO) return null
  return selectableLedDrivers(family, fqbn).find((driver) => driver.bus === choice) ?? null
}

/** `choice` if the target offers it, otherwise `auto`. */
export function normalizeLedDriverChoice(family: BuildTargetFamily, fqbn: string, choice: unknown): LedDriverChoice {
  return selectedLedDriverFor(family, fqbn, choice)?.bus ?? LED_DRIVER_AUTO
}

export interface LedDriverSuggestion {
  /** The `ledDriver` value to set. */
  choice: LedBus
  driver: SelectableLedDriver
  /** Outputs FastLED's default driver sends at once on this graph. */
  defaultOutputsAtOnce: number
  /** Advice, ready for a Graph Health fix line. */
  message: string
}

/**
 * A parallel driver to suggest when a graph has more clockless outputs (or
 * lanes) than the default RMT driver sends at once, so the rest wait their
 * turn. Applies where RMT is the default and the Board offers a parallel
 * driver: the S3, whose four TX channels drop further with a network up.
 * `reservedRmtWords` is TX memory something else holds on a shared-pool chip
 * (an IR receiver; the S3's RX memory is its own).
 */
export function suggestParallelLedDriver(
  family: BuildTargetFamily,
  fqbn: string,
  clocklessOutputs: number,
  options: { networkActive?: boolean; reservedRmtWords?: number } = {},
): LedDriverSuggestion | null {
  const facts = ledDriverFacts(family, fqbn)
  if (facts.clocklessBus !== 'RMT' || !facts.rmt) return null
  // The wire-time model's reading (`ledOutputConcurrency`): with no network
  // FastLED drops to one block a channel rather than refuse one, so every
  // channel that fits single-buffered sends; with one up, only those that fit
  // at the network rate do, at least one.
  const reserved = options.reservedRmtWords ?? 0
  const atOnce = Math.max(1, options.networkActive === true
    ? rmtOutputsThatFit(facts.rmt, true, reserved)
    : Math.min(facts.rmt.txChannels, Math.floor(Math.max(0, facts.rmt.txMemoryWords - reserved) / facts.rmt.blockWords)))
  if (clocklessOutputs <= atOnce) return null
  const driver = selectableLedDrivers(family, fqbn)
    .find((candidate) => candidate.selection === 'exclusive' && candidate.parallelOutputs >= clocklessOutputs)
  if (!driver) return null
  return {
    choice: driver.bus,
    driver,
    defaultOutputsAtOnce: atOnce,
    message: `Choose the ${driver.label} LED driver on the Board: it sends all ${clocklessOutputs} outputs at once, where RMT sends ${atOnce} at a time on the ${facts.chip}.`,
  }
}
