// XPT2046 sampling and fixed-layout player actions.
//
// The controller is sampled with a tiny software SPI transaction. That is
// intentional: the module exposes a separately routable touch bus, while the
// display and SD player already share the Arduino SPI singleton. Bit-banging
// lets either wiring described by the hardware model work without re-beginning
// the SD/display host underneath another client.

import { transportTouchRegions } from '../state/transportTouch'
import { type TftController, type TftRotation } from '../state/tftSurface'
import type { TransportDisplayLayout } from '../state/transportDisplay'

export interface TftTouchEmit {
  id: string
  controller: TftController
  rotation: TftRotation
  layout: TransportDisplayLayout
  enabled: boolean
  touch: {
    csPin: number; irqPin: number; sckPin: number; mosiPin: number; misoPin: number
    xMin: number; xMax: number; yMin: number; yMax: number
  }
}

export function tftTouchGlobalCpp(display: TftTouchEmit): string {
  return `static bool _touchDown_${display.id} = false; static int16_t _touchX_${display.id} = 0, _touchY_${display.id} = 0; static uint16_t _touchRawX_${display.id} = 0, _touchRawY_${display.id} = 0;`
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

static bool _xptPoint(uint8_t cs, uint8_t irq, uint8_t sck, uint8_t mosi, uint8_t miso,
                      int rawXMin, int rawXMax, int rawYMin, int rawYMax,
                      int nativeW, int nativeH, uint8_t rotation, int16_t &x, int16_t &y,
                      uint16_t &rawX, uint16_t &rawY) {
  if (irq != 255 && digitalRead(irq) != LOW) return false;
  rawX = _xptRead12(cs, sck, mosi, miso, 0xD0);
  rawY = _xptRead12(cs, sck, mosi, miso, 0x90);
  if (rawXMax <= rawXMin || rawYMax <= rawYMin) return false;
  int px = constrain((long)(rawX - rawXMin) * (nativeW - 1) / (rawXMax - rawXMin), 0L, (long)nativeW - 1);
  int py = constrain((long)(rawY - rawYMin) * (nativeH - 1) / (rawYMax - rawYMin), 0L, (long)nativeH - 1);
  if (rotation == 1) { x = nativeH - 1 - py; y = px; }
  else if (rotation == 2) { x = nativeW - 1 - px; y = nativeH - 1 - py; }
  else if (rotation == 3) { x = py; y = nativeW - 1 - px; }
  else { x = px; y = py; }
  return true;
}
`

export function tftTouchSetupCpp(display: TftTouchEmit): string[] {
  const t = display.touch
  return [
    `  pinMode(${t.csPin}, OUTPUT); digitalWrite(${t.csPin}, HIGH);`,
    `  pinMode(${t.sckPin}, OUTPUT); digitalWrite(${t.sckPin}, LOW);`,
    `  pinMode(${t.mosiPin}, OUTPUT); pinMode(${t.misoPin}, INPUT);`,
    `  pinMode(${t.irqPin}, INPUT_PULLUP);`,
  ]
}

function inside(x: string, y: string, rect: { x: number; y: number; w: number; h: number }): string {
  return `${x} >= ${rect.x} && ${x} < ${rect.x + rect.w} && ${y} >= ${rect.y} && ${y} < ${rect.y + rect.h}`
}

/**
 * Where a press goes once the panel has decided what was pressed.
 *
 * Two sinks, because two generators have different things to press *on*. The
 * player calls its own transport directly, which is why this file could hard-
 * code those calls for as long as the player was the only generator sampling
 * touch. A normal sketch has no transport at all: its panel publishes the same
 * `playercontrols` bundle a Player Controls node does, and whatever is wired
 * downstream decides what that means — today an LED output's blackout and
 * dimming latch.
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
  const v = sink.variable
  switch (action) {
    case 'playPause': return `${v}.playPause = true;`
    case 'previous': return `${v}.previous = true;`
    case 'next': return `${v}.next = true;`
    case 'ledToggle': return `${v}.ledToggle = true;`
    case 'volume': return `${v}.hasVolume = true; ${v}.volume = ${valueExpr};`
    case 'brightness': return `${v}.hasBrightness = true; ${v}.brightness = ${valueExpr};`
    default: return null
  }
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
    `    ${down} = ${display.enabled ? '' : 'false && '}_xptPoint(${t.csPin}, ${t.irqPin}, ${t.sckPin}, ${t.mosiPin}, ${t.misoPin}, `
      + `${t.xMin}, ${t.xMax}, ${t.yMin}, ${t.yMax}, ${display.controller.width}, ${display.controller.height}, ${rotation}, ${pointX}, ${pointY}, ${rawX}, ${rawY});`,
    `    static bool _touchPrev_${id} = false;`,
  ]
  for (const region of regions) {
    const hit = `(${inside(pointX, pointY, region.rect)})`
    const value = region.valueAxis === 'x'
      ? `constrain((${pointX} - ${region.rect.x}) / ${Math.max(1, region.rect.w - 1)}.0f, 0.0f, 1.0f)`
      : null
    const body = sinkStatements(sink, region.action, value)
    if (!body) continue
    // A momentary action fires on the touch-down edge; an absolute slider
    // tracks for as long as the finger stays down. The evaluator publishes
    // them the same way, so chaining a panel through Player Controls cannot
    // fire a button every tick it is held in one place and not the other.
    const guard = region.valueAxis === 'x' ? '' : `!_touchPrev_${id} && `
    lines.push(`    if (${down} && ${guard}${hit}) { ${body} }`)
  }
  lines.push(`    _touchPrev_${id} = ${down};`, `  }`)
  return lines
}
