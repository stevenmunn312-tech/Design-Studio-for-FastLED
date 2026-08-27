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
                      int nativeW, int nativeH, uint8_t rotation, int16_t &x, int16_t &y) {
  if (irq != 255 && digitalRead(irq) != LOW) return false;
  uint16_t rawX = _xptRead12(cs, sck, mosi, miso, 0xD0);
  uint16_t rawY = _xptRead12(cs, sck, mosi, miso, 0x90);
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

export function tftTouchServiceCpp(display: TftTouchEmit): string[] {
  const t = display.touch
  const id = display.id
  const pointX = `_touchX_${id}`
  const pointY = `_touchY_${id}`
  const down = `_touchDown_${id}`
  const rotation = ({ '0': 0, '90': 1, '180': 2, '270': 3 } as const)[display.rotation]
  const regions = transportTouchRegions(display.controller, display.rotation, display.layout)
  const lines = [
    `  { int16_t ${pointX} = 0, ${pointY} = 0;`,
    `    bool ${down} = ${display.enabled ? '' : 'false && '}_xptPoint(${t.csPin}, ${t.irqPin}, ${t.sckPin}, ${t.mosiPin}, ${t.misoPin}, `
      + `${t.xMin}, ${t.xMax}, ${t.yMin}, ${t.yMax}, ${display.controller.width}, ${display.controller.height}, ${rotation}, ${pointX}, ${pointY});`,
    `    static bool _touchPrev_${id} = false;`,
  ]
  for (const region of regions) {
    const hit = `(${inside(pointX, pointY, region.rect)})`
    if (region.action === 'playPause') {
      lines.push(`    if (${down} && !_touchPrev_${id} && ${hit}) { if (audio.pauseResume()) playerPaused = !playerPaused; }`)
    } else if (region.action === 'previous') {
      lines.push(`    if (${down} && !_touchPrev_${id} && ${hit}) { changePlayerTrack(-1); }`)
    } else if (region.action === 'next') {
      lines.push(`    if (${down} && !_touchPrev_${id} && ${hit}) { changePlayerTrack(1); }`)
    } else if (region.action === 'ledToggle') {
      lines.push(`    if (${down} && !_touchPrev_${id} && ${hit}) { ledsEnabled = !ledsEnabled; applyPlayerBrightness(); }`)
    } else if (region.action === 'volume') {
      lines.push(`    if (${down} && ${hit}) { playerVolume = constrain((${pointX} - ${region.rect.x}) / ${Math.max(1, region.rect.w - 1)}.0f, 0.0f, 1.0f); applyPlayerVolume(); }`)
    } else if (region.action === 'brightness') {
      lines.push(`    if (${down} && ${hit}) { playerBrightness = constrain((${pointX} - ${region.rect.x}) / ${Math.max(1, region.rect.w - 1)}.0f, 0.0f, 1.0f); applyPlayerBrightness(); }`)
    }
  }
  lines.push(`    _touchPrev_${id} = ${down};`, `  }`)
  return lines
}
