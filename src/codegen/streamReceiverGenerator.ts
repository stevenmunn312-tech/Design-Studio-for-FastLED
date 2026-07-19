import type { StudioNode } from '../state/graphStore'
import { ledHardwareFromProps, fastledSetupCpp, overclockDefineCpp } from './cppGenerator'
import { SPI_CHIPSETS } from '../state/nodeLibrary'

// A tiny, generic Adalight-protocol receiver — flashed once, then the studio
// pushes already-computed live-preview frames straight to it over serial at
// interactive rates (see src/state/streamStore.ts + src/utils/adalight.ts),
// skipping the usual compile+flash cycle on every tweak. Unlike the normal
// generated sketch this has no pattern logic at all: it just waits for the
// classic "Ada" + hi/lo + checksum header, then reads NUM_LEDS RGB triples and
// shows them. The frontend already resolves serpentine wiring into physical
// strip order before sending, so the receiver writes bytes straight into
// `leds[]` with no XY() remap of its own.
export interface StreamLayout { width: number; height: number; serpentine: boolean; baud: number }

function intProp(val: unknown, def: number, min: number, max: number): number {
  const n = Math.round(Number(val))
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def
}

/** Resolve the layout the receiver sketch (and the packet builder) must agree
 *  on, from the graph's MatrixOutput node. Returns null if there isn't one. */
export function streamLayoutForGraph(nodes: StudioNode[]): StreamLayout | null {
  const outputNode = nodes.find((n) => n.data.nodeType === 'MatrixOutput')
  if (!outputNode) return null
  const p = outputNode.data.properties as Record<string, unknown>
  return {
    width: intProp(p.width, 16, 1, 64),
    height: intProp(p.height, 16, 1, 64),
    serpentine: p.serpentine === true,
    // A generous fixed baud for the receiver — independent of the show/upload
    // path's rate, chosen high enough that a 32×32 frame (~3 KB) clears well
    // under one frame interval.
    baud: 921600,
  }
}

/** Generate the receiver `.ino` for the graph's MatrixOutput hardware config. */
export function generateStreamReceiverSketch(nodes: StudioNode[]): string | null {
  const outputNode = nodes.find((n) => n.data.nodeType === 'MatrixOutput')
  if (!outputNode) return null
  const layout = streamLayoutForGraph(nodes)
  if (!layout) return null
  const p = outputNode.data.properties as Record<string, unknown>
  const dataPin = intProp(p.dataPin, 5, 0, 48)
  const hw = ledHardwareFromProps(p)

  const lines: string[] = []
  lines.push('// Design Studio for FastLED — generic live-stream receiver (Adalight protocol).')
  lines.push('// Flash this once; the studio then pushes frames over serial at runtime')
  lines.push('// via the ✎ Live Stream control on the MatrixOutput node. Re-flash only if')
  lines.push('// the matrix size, chipset, pins, or serpentine wiring change.')
  lines.push(...overclockDefineCpp(hw))
  lines.push('#include <FastLED.h>')
  lines.push('')
  lines.push(`#define DATA_PIN ${dataPin}`)
  if (SPI_CHIPSETS.has(hw.chipset)) lines.push(`#define CLOCK_PIN ${hw.clockPin}`)
  lines.push(`#define WIDTH ${layout.width}`)
  lines.push(`#define HEIGHT ${layout.height}`)
  lines.push(`#define NUM_LEDS (WIDTH * HEIGHT)`)
  lines.push('')
  lines.push('CRGB leds[NUM_LEDS];')
  lines.push('')
  lines.push('void setup() {')
  lines.push(`  Serial.begin(${layout.baud});`)
  lines.push(...fastledSetupCpp(hw))
  lines.push('}')
  lines.push('')
  lines.push('// Classic Adalight sync: "Ada" magic word, then hi/lo LED-count bytes and a')
  lines.push('// checksum (hi ^ lo ^ 0x55). The count is only used to sync framing — this')
  lines.push('// receiver always reads exactly NUM_LEDS triples, baked in at flash time.')
  lines.push('void loop() {')
  lines.push('  static const uint8_t prefix[] = { \'A\', \'d\', \'a\' };')
  lines.push('  for (uint8_t i = 0; i < sizeof(prefix); ) {')
  lines.push('    while (!Serial.available()) {}')
  lines.push('    i = (Serial.read() == prefix[i]) ? i + 1 : 0;')
  lines.push('  }')
  lines.push('  while (!Serial.available()) {}')
  lines.push('  uint8_t hi = Serial.read();')
  lines.push('  while (!Serial.available()) {}')
  lines.push('  uint8_t lo = Serial.read();')
  lines.push('  while (!Serial.available()) {}')
  lines.push('  uint8_t chk = Serial.read();')
  lines.push('  if (chk != (uint8_t)(hi ^ lo ^ 0x55)) return;')
  lines.push('  for (uint16_t i = 0; i < NUM_LEDS; i++) {')
  lines.push('    while (!Serial.available()) {}')
  lines.push('    uint8_t r = Serial.read();')
  lines.push('    while (!Serial.available()) {}')
  lines.push('    uint8_t g = Serial.read();')
  lines.push('    while (!Serial.available()) {}')
  lines.push('    uint8_t b = Serial.read();')
  lines.push('    leds[i] = CRGB(r, g, b);')
  lines.push('  }')
  lines.push('  FastLED.show();')
  lines.push('}')
  lines.push('')
  return lines.join('\n')
}
