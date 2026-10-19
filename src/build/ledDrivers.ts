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
