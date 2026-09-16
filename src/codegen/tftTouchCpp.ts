// XPT2046 sampling and fixed-layout player actions.
//
// The controller is sampled with a tiny software SPI transaction. That is
// intentional: the module exposes a separately routable touch bus, while the
// display and SD player already share the Arduino SPI singleton. Bit-banging
// lets either wiring described by the hardware model work without re-beginning
// the SD/display host underneath another client.

import { TELEMETRY_TOUCH_INTERVAL_MS } from '../state/deviceTelemetry'
import { transportTouchRegions } from '../state/transportTouch'
import { type TftController, type TftRotation } from '../state/tftSurface'
import type { TransportDisplayLayout } from '../state/transportDisplay'
import { TELEMETRY_TOUCH_PRESS_CPP, telemetryTouchSampleCpp } from './deviceTelemetryCpp'

export interface TftTouchEmit {
  /**
   * Stamp each press for bench telemetry.
   *
   * Set only when the Board asks for telemetry, so an ordinary build carries
   * neither the call nor the statics behind it.
   */
  telemetry?: boolean
  id: string
  controller: TftController
  rotation: TftRotation
  layout: TransportDisplayLayout
  /** Runtime gate: a disabled panel reads no touch, as it draws nothing. */
  enabledExpr: string
  touch: {
    csPin: number; irqPin: number; sckPin: number; mosiPin: number; misoPin: number
    xFrom: number; xTo: number; yFrom: number; yTo: number
  }
}

export function tftTouchGlobalCpp(display: TftTouchEmit): string {
  const sampleClock = display.telemetry ? ` static uint32_t _touchSampleMs_${display.id} = 0;` : ''
  return `static bool _touchDown_${display.id} = false; static int16_t _touchX_${display.id} = 0, _touchY_${display.id} = 0; static uint16_t _touchRawX_${display.id} = 0, _touchRawY_${display.id} = 0;${sampleClock}`
}

export const TFT_TOUCH_CPP_HELPERS = `// ── XPT2046 touch ────────────────────────────────────────────────────────────
static uint16_t _xptRead12(uint8_t cs, uint8_t sck, uint8_t mosi, uint8_t miso, uint8_t command) {
  digitalWrite(cs, LOW);
  for (int bit = 7; bit >= 0; bit--) {
    digitalWrite(sck, LOW); digitalWrite(mosi, (command >> bit) & 1); digitalWrite(sck, HIGH);
  }
  uint16_t word = 0;
  for (int bit = 0; bit < 16; bit++) {
    digitalWrite(sck, LOW); digitalWrite(sck, HIGH); word = (uint16_t)((word << 1) | digitalRead(miso));
  }
  digitalWrite(sck, LOW); digitalWrite(cs, HIGH);
  return (word >> 3) & 0x0FFF;
}

/*
 * Raw digitiser counts to rotated screen pixels.
 *
 * Shared by every reader, because the calibration span is the one thing two
 * touch paths must not each have an opinion about: a digitiser chip and a bare
 * resistive sheet disagree about how a reading is *obtained* and agree
 * completely about what it means once obtained.
 */
static bool _touchMap(uint16_t rawX, uint16_t rawY,
                      int rawXFrom, int rawXTo, int rawYFrom, int rawYTo,
                      int nativeW, int nativeH, uint8_t rotation, int16_t &x, int16_t &y) {
  // A descending span is a reversed axis, not an error: flipping a linear map
  // is the same as swapping its endpoints, so the caller hands them over in
  // the order the glass actually counts and this stays one multiply. Both
  // operands of the division change sign together, so integer truncation
  // behaves exactly as it does for an ascending span.
  if (rawXTo == rawXFrom || rawYTo == rawYFrom) return false;
  int px = constrain((long)(rawX - rawXFrom) * (nativeW - 1) / (rawXTo - rawXFrom), 0L, (long)nativeW - 1);
  int py = constrain((long)(rawY - rawYFrom) * (nativeH - 1) / (rawYTo - rawYFrom), 0L, (long)nativeH - 1);
  if (rotation == 1) { x = nativeH - 1 - py; y = px; }
  else if (rotation == 2) { x = nativeW - 1 - px; y = nativeH - 1 - py; }
  else if (rotation == 3) { x = py; y = nativeW - 1 - px; }
  else { x = px; y = py; }
  return true;
}

static bool _xptPoint(uint8_t cs, uint8_t irq, uint8_t sck, uint8_t mosi, uint8_t miso,
                      int rawXFrom, int rawXTo, int rawYFrom, int rawYTo,
                      int nativeW, int nativeH, uint8_t rotation, int16_t &x, int16_t &y,
                      uint16_t &rawX, uint16_t &rawY) {
  if (irq != 255 && digitalRead(irq) != LOW) return false;
  rawX = _xptRead12(cs, sck, mosi, miso, 0xD0);
  rawY = _xptRead12(cs, sck, mosi, miso, 0x90);
  return _touchMap(rawX, rawY, rawXFrom, rawXTo, rawYFrom, rawYTo, nativeW, nativeH, rotation, x, y);
}
`

/*
 * A bare resistive sheet, read through four of the panel's own LCD lines.
 *
 * There is no controller here and no chip select: the sheet is two resistive
 * layers, and a reading means driving a gradient across one axis and measuring
 * where the finger taps it on the other. That is why these four pins need
 * `analogInput` while the panel's other nine do not.
 *
 * Every one of them is an LCD data or control line the rest of the frame drives
 * as an output, so the contract here is strict: leave all four outputs again
 * before returning, whatever happens in between. A read that returns early
 * without restoring them hands the next panel write a pin still configured as
 * an input, and because this panel has no framebuffer the corrupted write stays
 * on the glass until that field changes on its own.
 */
export const RESISTIVE_TOUCH_CPP_HELPERS = `// ── Bare resistive touch ─────────────────────────────────────────────────────
// Reads four LCD lines as a touch sheet, then hands them back as outputs.

// A finger shorts the two layers, so pressure reads as a small difference
// across the sheet. Bench-tunable: too low and the panel reports phantom
// presses from its own leakage, too high and a light touch is ignored.
#ifndef TOUCH_Z_MIN
#define TOUCH_Z_MIN 220
#endif

// Settling time after reversing a pin's direction. The sheet is resistive and
// the ADC samples fast enough to catch the previous level without it.
#ifndef TOUCH_SETTLE_US
#define TOUCH_SETTLE_US 24
#endif

static void _resRelease(uint8_t xp, uint8_t xm, uint8_t yp, uint8_t ym) {
  // Back to the LCD bus. Driven low rather than left floating so the next
  // write starts from the same level every other data line idles at.
  pinMode(xp, OUTPUT); digitalWrite(xp, LOW);
  pinMode(xm, OUTPUT); digitalWrite(xm, LOW);
  pinMode(yp, OUTPUT); digitalWrite(yp, LOW);
  pinMode(ym, OUTPUT); digitalWrite(ym, LOW);
}

static bool _resPoint(uint8_t xp, uint8_t xm, uint8_t yp, uint8_t ym,
                      int rawXFrom, int rawXTo, int rawYFrom, int rawYTo,
                      int nativeW, int nativeH, uint8_t rotation, int16_t &x, int16_t &y,
                      uint16_t &rawX, uint16_t &rawY) {
  // Pressure first: no point measuring a position nobody is touching.
  pinMode(xp, OUTPUT); digitalWrite(xp, LOW);
  pinMode(yp, OUTPUT); digitalWrite(yp, HIGH);
  pinMode(xm, INPUT);
  pinMode(ym, INPUT);
  delayMicroseconds(TOUCH_SETTLE_US);
  int z = analogRead(xm);
  if (z < TOUCH_Z_MIN) { _resRelease(xp, xm, yp, ym); return false; }

  // X: gradient across the X layer, measured on Y+.
  pinMode(xp, OUTPUT); digitalWrite(xp, HIGH);
  pinMode(xm, OUTPUT); digitalWrite(xm, LOW);
  pinMode(yp, INPUT);
  pinMode(ym, INPUT);
  delayMicroseconds(TOUCH_SETTLE_US);
  rawX = (uint16_t)analogRead(yp);

  // Y: the same, one layer over, measured on X-.
  pinMode(yp, OUTPUT); digitalWrite(yp, HIGH);
  pinMode(ym, OUTPUT); digitalWrite(ym, LOW);
  pinMode(xp, INPUT);
  pinMode(xm, INPUT);
  delayMicroseconds(TOUCH_SETTLE_US);
  rawY = (uint16_t)analogRead(xm);

  _resRelease(xp, xm, yp, ym);
  return _touchMap(rawX, rawY, rawXFrom, rawXTo, rawYFrom, rawYTo, nativeW, nativeH, rotation, x, y);
}
`

export function tftTouchSetupCpp(display: TftTouchEmit): string[] {
  const t = display.touch
  return [
    `  pinMode(${t.csPin}, OUTPUT); digitalWrite(${t.csPin}, HIGH);`,
    `  pinMode(${t.sckPin}, OUTPUT); digitalWrite(${t.sckPin}, LOW);`,
    `  pinMode(${t.mosiPin}, OUTPUT); pinMode(${t.misoPin}, INPUT);`,
    ...tftTouchIrqSetupCpp(t.irqPin),
  ]
}

/**
 * Classic ESP32 GPIO34-39 are input-only and have no internal pull-up. Keep
 * the pull-up on other targets/pins, while letting fixed-wiring CYD boards use
 * GPIO36 without the Arduino core logging gpio_pullup_en error 85.
 */
export function tftTouchIrqSetupCpp(irqPin: number): string[] {
  if (irqPin < 34 || irqPin > 39) return [`  pinMode(${irqPin}, INPUT_PULLUP);`]
  return [
    `#if defined(CONFIG_IDF_TARGET_ESP32)`,
    `  pinMode(${irqPin}, INPUT);  // classic ESP32 GPIO34-39 have no internal pull-up`,
    `#else`,
    `  pinMode(${irqPin}, INPUT_PULLUP);`,
    `#endif`,
  ]
}

function inside(x: string, y: string, rect: { x: number; y: number; w: number; h: number }): string {
  return `${x} >= ${rect.x} && ${x} < ${rect.x + rect.w} && ${y} >= ${rect.y} && ${y} < ${rect.y + rect.h}`
}

/**
 * Where a press goes once the panel has decided what was pressed.
 *
 * The player sketch can press its own transport directly. A normal sketch has
 * no transport at all, so its panel publishes either the same `playercontrols`
 * bundle a Control Map node does, direct scalar/boolean outputs for property
 * wires, or both from the same sample.
 *
 * Parameterising the sink rather than the whole function keeps the part that
 * matters — which rectangle is which action — resolved once from the shared
 * geometry. A second copy of the hit test is how the panel and the thing that
 * responds drift apart.
 */
export type TftTouchSink =
  /** Call the player sketch's own transport functions. */
  | { kind: 'player' }
  /** Fill a PlayerControlsValue local, as codegen/playerControlsCpp.ts defines it. */
  | { kind: 'bundle'; variable: string }
  /**
   * Write individual variables for direct wiring (no Control Map needed).
   * Each key is an action name mapped to its C++ variable and rest type.
   */
  | { kind: 'direct'; variables: Record<string, { variable: string; dataType: 'bool' | 'float' }> }
  /**
   * Fill the bundle and direct variables from the same touch sample.
   */
  | {
    kind: 'bundleDirect'
    variable: string
    variables: Record<string, { variable: string; dataType: 'bool' | 'float' }>
  }

function directSinkStatement(
  variables: Record<string, { variable: string; dataType: 'bool' | 'float' }>,
  action: string,
  valueExpr: string | null,
): string | null {
  const entry = variables[action]
  if (!entry) return null
  if (valueExpr !== null) return `${entry.variable} = ${valueExpr};`
  return `${entry.variable} = true;`
}

function bundleSinkStatement(variable: string, action: string, valueExpr: string | null): string | null {
  switch (action) {
    case 'playPause': return `${variable}.playPause = true;`
    case 'previous': return `${variable}.previous = true;`
    case 'next': return `${variable}.next = true;`
    case 'ledToggle': return `${variable}.ledToggle = true;`
    case 'volume': return `${variable}.hasVolume = true; ${variable}.volume = ${valueExpr};`
    case 'brightness': return `${variable}.hasBrightness = true; ${variable}.brightness = ${valueExpr};`
    default: return null
  }
}

function sinkStatements(
  sink: TftTouchSink,
  action: string,
  valueExpr: string | null,
): string | null {
  if (sink.kind === 'player') {
    switch (action) {
      case 'playPause': return 'if (audio.pauseResume()) playerPaused = !playerPaused;'
      case 'previous': return 'changePlayerTrack(-1);'
      case 'next': return 'changePlayerTrack(1);'
      case 'ledToggle': return 'ledsEnabled = !ledsEnabled; applyPlayerBrightness();'
      case 'volume': return `playerVolume = ${valueExpr}; applyPlayerVolume();`
      case 'brightness': return `playerBrightness = ${valueExpr}; applyPlayerBrightness();`
      default: return null
    }
  }
  if (sink.kind === 'direct') {
    return directSinkStatement(sink.variables, action, valueExpr)
  }
  if (sink.kind === 'bundleDirect') {
    const statements = [
      directSinkStatement(sink.variables, action, valueExpr),
      bundleSinkStatement(sink.variable, action, valueExpr),
    ].filter((entry): entry is string => Boolean(entry))
    return statements.length > 0 ? statements.join(' ') : null
  }
  return bundleSinkStatement(sink.variable, action, valueExpr)
}

export function tftTouchServiceCpp(
  display: TftTouchEmit,
  sink: TftTouchSink = { kind: 'player' },
): string[] {
  const t = display.touch
  const id = display.id
  const pointX = `_touchX_${id}`
  const pointY = `_touchY_${id}`
  const rawX = `_touchRawX_${id}`
  const rawY = `_touchRawY_${id}`
  const down = `_touchDown_${id}`
  const rotation = ({ '0': 0, '90': 1, '180': 2, '270': 3 } as const)[display.rotation]
  const regions = transportTouchRegions(display.controller, display.rotation, display.layout)
  const lines = [
    `  {`,
    `    ${down} = (${display.enabledExpr}) && _xptPoint(${t.csPin}, ${t.irqPin}, ${t.sckPin}, ${t.mosiPin}, ${t.misoPin}, `
      + `${t.xFrom}, ${t.xTo}, ${t.yFrom}, ${t.yTo}, ${display.controller.width}, ${display.controller.height}, ${rotation}, ${pointX}, ${pointY}, ${rawX}, ${rawY});`,
    `    static bool _touchPrev_${id} = false;`,
  ]
  // On the down edge only, and before the region tests, so the stamp measures
  // from the press rather than from whichever control happened to be under it.
  if (display.telemetry) {
    const sampleClock = `_touchSampleMs_${id}`
    const now = `_touchSampleNow_${id}`
    lines.push(
      `    if (${down} && !_touchPrev_${id}) ${TELEMETRY_TOUCH_PRESS_CPP}`,
      `    if (${down}) {`,
      `      uint32_t ${now} = millis();`,
      `      if (${sampleClock} == 0 || (uint32_t)(${now} - ${sampleClock}) >= ${TELEMETRY_TOUCH_INTERVAL_MS}u) {`,
      `        ${telemetryTouchSampleCpp(rawX, rawY)}`,
      `        ${sampleClock} = ${now};`,
      `      }`,
      `    } else { ${sampleClock} = 0; }`,
    )
  }
  // Direct variables reset to rest value every pass, before the region tests
  // write into whichever one the finger is on.  A momentary action therefore
  // fires for exactly one loop iteration; a continuous one holds its value
  // only while the finger stays down.
  if (sink.kind === 'direct' || sink.kind === 'bundleDirect') {
    for (const entry of Object.values(sink.variables)) {
      lines.push(`    ${entry.variable} = ${entry.dataType === 'float' ? '0.0f' : 'false'};`)
    }
  }
  for (const region of regions) {
    const hit = `(${inside(pointX, pointY, region.rect)})`
    const value = region.valueAxis === 'x'
      ? `constrain((${pointX} - ${region.rect.x}) / ${Math.max(1, region.rect.w - 1)}.0f, 0.0f, 1.0f)`
      : null
    const body = sinkStatements(sink, region.action, value)
    if (!body) continue
    // A momentary action fires on the touch-down edge; an absolute slider
    // tracks for as long as the finger stays down. The evaluator publishes
    // them the same way, so chaining a panel through Control Map cannot
    // fire a button every tick it is held in one place and not the other.
    const guard = region.valueAxis === 'x' ? '' : `!_touchPrev_${id} && `
    lines.push(`    if (${down} && ${guard}${hit}) { ${body} }`)
  }
  lines.push(`    _touchPrev_${id} = ${down};`, `  }`)
  return lines
}
