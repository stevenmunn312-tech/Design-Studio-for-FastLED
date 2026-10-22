import { hexToRgb } from '../../state/palettes/polinePalette'
import {
  STEREO_VU_MODES,
  stereoVuSettings,
  stereoVuShuffleOrder,
} from '../../state/audio/stereoVuMeter'
import { paletteCppRef, resolvePaletteId } from '../../state/palettes/paletteCatalog'
import {
  customPaletteStops16,
  hexToRgb as customHexToRgb,
  normalizeCustomPalette,
} from '../../state/palettes/customPalette'
import { SPI_CHIPSETS } from '../../state/nodeLibrary'
import type { StudioEdge, StudioNode } from '../../state/graphStore'
import { sanitizePin } from '../hardwarePins'

export const STEREO_VU_CPP_FORWARD = 'struct StereoVuConfig;\nstruct StereoVuState;'

export interface StereoVuEmit {
  id: string
  properties: Record<string, unknown>
  leftPin: number
  rightPin: number
  /** Only meaningful when `clocked`; a clockless rail never reads them. */
  leftClockPin: number
  rightClockPin: number
  /** The chipset needs a clock line beside each rail's data line. */
  clocked: boolean
  activeExpr: string
  leftExpr: string
  rightExpr: string
  beatExpr: string
  paletteExpr?: string
  paletteDeclaration?: string
}

export interface StereoVuExpressions {
  active: string
  left: string
  right: string
  beat: string
}

export type StereoVuRail = 'left' | 'right'

/** The fixture's pins as the sketch sees them, one place for every generator. */
export function stereoVuPins(properties: Record<string, unknown>): Pick<StereoVuEmit, 'leftPin' | 'rightPin' | 'leftClockPin' | 'rightClockPin' | 'clocked'> {
  return {
    leftPin: sanitizePin(properties.leftDataPin, 5),
    rightPin: sanitizePin(properties.rightDataPin, 6),
    leftClockPin: sanitizePin(properties.leftClockPin, 18),
    rightClockPin: sanitizePin(properties.rightClockPin, 19),
    clocked: SPI_CHIPSETS.has(String(properties.chipset ?? 'WS2812B')),
  }
}

/** Fixed-template generators do not walk sinks through generateCpp. Resolve
 * only fixtures with an explicit Audio wire, preserving the same activation
 * boundary as the normal sketch generator. */
export function stereoVuEmitsFromGraph(
  nodes: StudioNode[],
  edges: Array<Pick<StudioEdge, 'source' | 'target' | 'targetHandle'>>,
  expressions: StereoVuExpressions,
): StereoVuEmit[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const audioIds = new Set(nodes
    .filter((node) => node.data.nodeType === 'Audio')
    .map((node) => node.id))
  const wiredMeters = new Set(edges
    .filter((edge) => edge.targetHandle === 'audio' && audioIds.has(edge.source))
    .map((edge) => edge.target))
  return nodes
    .filter((node) => node.data.nodeType === 'StereoVuMeter' && wiredMeters.has(node.id))
    .map((node) => {
      const properties = node.data.properties as Record<string, unknown>
      const safeMeterId = node.id.replace(/[^a-zA-Z0-9_]/g, '_')
      const paletteEdge = edges.find((edge) => edge.target === node.id && edge.targetHandle === 'paletteIn')
      const paletteSource = paletteEdge ? nodeById.get(paletteEdge.source) : undefined
      let paletteExpr: string | undefined
      let paletteDeclaration: string | undefined
      if (paletteSource?.data.nodeType === 'CustomPalette') {
        const paletteProperties = paletteSource.data.properties as Record<string, unknown>
        const local = normalizeCustomPalette(paletteProperties.colors, paletteProperties.positions)
        const stops = customPaletteStops16(local.colors.map(customHexToRgb), local.positions)
        paletteExpr = `_vuPalette_${safeMeterId}`
        paletteDeclaration = `const CRGBPalette16 ${paletteExpr}(${stops
          .map((color) => `CRGB(${color.r}, ${color.g}, ${color.b})`)
          .join(', ')});`
      } else if (paletteSource) {
        const paletteProperties = paletteSource.data.properties as Record<string, unknown>
        paletteExpr = paletteCppRef(resolvePaletteId(String(paletteProperties.palette ?? 'rainbow').toLowerCase()))
      }
      return {
        id: safeMeterId,
        properties,
        ...stereoVuPins(properties),
        activeExpr: properties.enabled === false ? 'false' : expressions.active,
        leftExpr: expressions.left,
        rightExpr: expressions.right,
        beatExpr: expressions.beat,
        paletteExpr,
        paletteDeclaration,
      }
    })
}

const floatLit = (value: number): string => {
  if (!Number.isFinite(value)) return '0.0f'
  if (Number.isInteger(value)) return `${value.toFixed(1)}f`
  return `${value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '.0')}f`
}

const MODE = Object.fromEntries(STEREO_VU_MODES.map((name, index) => [name, index]))
const POLICY: Record<string, number> = { Manual: 0, 'Timed cycle': 1, 'Beat cycle': 2, Shuffle: 3 }

export function stereoVuPaletteId(properties: Record<string, unknown>): string {
  return resolvePaletteId(String(properties.palette ?? 'party').toLowerCase())
}

const RAIL = { left: 'LEFT', right: 'RIGHT' } as const
const RAIL_NAME = { left: 'Left', right: 'Right' } as const

/** The macros one rail's globals and `addLeds` call share. */
export function stereoVuRailMacros(id: string, rail: StereoVuRail) {
  return {
    leds: `VU_${RAIL[rail]}_LEDS_${id}`,
    dataPin: `VU_${RAIL[rail]}_PIN_${id}`,
    clockPin: `VU_${RAIL[rail]}_CLOCK_PIN_${id}`,
    array: `_vu${RAIL_NAME[rail]}_${id}`,
    history: `_vu${RAIL_NAME[rail]}History_${id}`,
    controller: `_vu${RAIL_NAME[rail]}Controller_${id}`,
  }
}

/**
 * The `fastledSetupCpp` options for one rail. Every generator — the normal
 * sketch, the show sketch and the player — registers a rail through this, so
 * a clocked fixture gets its clock macro in all three or in none.
 */
export function stereoVuRailSetupOptions(emit: StereoVuEmit, rail: StereoVuRail) {
  const macros = stereoVuRailMacros(emit.id, rail)
  return {
    dataPinMacro: macros.dataPin,
    clockPinMacro: macros.clockPin,
    brightness: null,
    ledCountMacro: macros.leds,
    ledsName: macros.array,
    controllerName: macros.controller,
  }
}

export function stereoVuGlobalCpp(emit: StereoVuEmit): string {
  const s = stereoVuSettings(emit.properties, emit.id)
  const left = hexToRgb(String(emit.properties.leftColor ?? '#20ff70'))
  const right = hexToRgb(String(emit.properties.rightColor ?? '#20a0ff'))
  const shuffle = stereoVuShuffleOrder(emit.id).join(', ')
  const L = stereoVuRailMacros(emit.id, 'left')
  const R = stereoVuRailMacros(emit.id, 'right')
  // A clock macro only exists when the chipset reads one: a clockless sketch
  // never names the pins, so nothing can wire them by accident.
  const clockDefines = emit.clocked
    ? `#define ${L.clockPin} ${emit.leftClockPin}\n#define ${R.clockPin} ${emit.rightClockPin}\n`
    : ''
  return `${emit.paletteDeclaration ? `${emit.paletteDeclaration}\n` : ''}// Stereo VU Meter ${emit.id}: state is per fixture, so peaks, history and policy never leak.
#define ${L.leds} ${s.leftLedCount}
#define ${R.leds} ${s.rightLedCount}
#define ${L.dataPin} ${emit.leftPin}
#define ${R.dataPin} ${emit.rightPin}
${clockDefines}CRGB ${L.array}[${L.leds}];
CRGB ${R.array}[${R.leds}];
float ${L.history}[${L.leds}] = {};
float ${R.history}[${R.leds}] = {};
StereoVuState _vuState_${emit.id} = {};
const StereoVuConfig _vuConfig_${emit.id} = {
  ${L.leds}, ${R.leds}, ${MODE[s.mode]}, ${POLICY[s.policy]}, ${floatLit(s.cycleIntervalSec)},
  CRGB(${left.r}, ${left.g}, ${left.b}), CRGB(${right.r}, ${right.g}, ${right.b}),
  ${floatLit(s.gain)}, ${floatLit(s.noiseGate)}, ${floatLit(s.responseCurve)},
  ${floatLit(s.attackMs / 1000)}, ${floatLit(s.releaseMs / 1000)}, ${floatLit(s.peakHoldMs / 1000)},
  ${floatLit(s.peakFallPerSec)}, ${floatLit(s.trailAmount)}, ${floatLit(s.beatAccent)}, ${floatLit(s.brightness)},
  ${s.leftDirection === 'Top' ? 'true' : 'false'}, ${s.rightDirection === 'Top' ? 'true' : 'false'}, ${s.swapChannels ? 'true' : 'false'},
  { ${shuffle} }
};`
}

export function stereoVuLoopCpp(emit: StereoVuEmit): string {
  const palette = emit.paletteExpr ?? paletteCppRef(stereoVuPaletteId(emit.properties))
  const L = stereoVuRailMacros(emit.id, 'left')
  const R = stereoVuRailMacros(emit.id, 'right')
  return `  _stereoVuRender(_vuState_${emit.id}, _vuConfig_${emit.id},
    ${L.history}, ${R.history}, ${L.array}, ${R.array},
    ${palette}, ${emit.activeExpr}, ${emit.leftExpr}, ${emit.rightExpr}, ${emit.beatExpr}, millis());`
}

export const STEREO_VU_CPP_HELPERS = String.raw`// ── Stereo VU Meter renderer ────────────────────────────────────────────────
struct StereoVuConfig {
  uint16_t leftCount, rightCount; uint8_t mode, policy; float cycleSec;
  CRGB leftColor, rightColor;
  float gain, gate, curve, attackSec, releaseSec, peakHoldSec, peakFall, trail, beatAccent, brightness;
  bool reverseLeft, reverseRight, swapChannels;
  uint8_t shuffle[12];
};

struct StereoVuState {
  bool initialized, previousBeat;
  uint32_t lastMs, historyMs, policyMs, leftHoldUntilMs, rightHoldUntilMs;
  float leftLevel, rightLevel, leftPeak, rightPeak, beatGlow;
  uint8_t policyMode;
};

static float _vuClamp(float value) {
  if (!isfinite(value)) return 0.0f;
  return constrain(value, 0.0f, 1.0f);
}

static uint8_t _vuByte(float value) {
  return (uint8_t)constrain((int)lroundf(_vuClamp(value) * 255.0f), 0, 255);
}

static CRGB _vuScale(CRGB color, float amount) {
  float k = _vuClamp(amount);
  return CRGB(
    constrain((int)lroundf(color.r * k), 0, 255),
    constrain((int)lroundf(color.g * k), 0, 255),
    constrain((int)lroundf(color.b * k), 0, 255));
}

static CRGB _vuMix(CRGB a, CRGB b, float amount) {
  float k = _vuClamp(amount);
  return CRGB(
    constrain((int)lroundf(a.r + (b.r - a.r) * k), 0, 255),
    constrain((int)lroundf(a.g + (b.g - a.g) * k), 0, 255),
    constrain((int)lroundf(a.b + (b.b - a.b) * k), 0, 255));
}

static CRGB _vuAdd(CRGB a, CRGB b) {
  return CRGB(qadd8(a.r, b.r), qadd8(a.g, b.g), qadd8(a.b, b.b));
}

static CRGB _vuLadder(float position) {
  if (position < 0.65f) return _vuMix(CRGB(15, 210, 55), CRGB(235, 220, 30), position / 0.65f);
  return _vuMix(CRGB(235, 220, 30), CRGB(255, 35, 20), (position - 0.65f) / 0.35f);
}

static float _vuCondition(float raw, const StereoVuConfig& c) {
  float amplified = _vuClamp(raw) * c.gain;
  float gated = amplified <= c.gate ? 0.0f : (amplified - c.gate) / max(0.0001f, 1.0f - c.gate);
  return powf(_vuClamp(gated), c.curve);
}

static float _vuFollow(float previous, float target, float dt, float attack, float release) {
  float tau = target >= previous ? attack : release;
  if (dt <= 0.0f) return previous;
  if (tau <= 0.0f) return target;
  return previous + (target - previous) * (1.0f - expf(-dt / tau));
}

static void _vuReset(StereoVuState& s, float* leftHistory, float* rightHistory, const StereoVuConfig& c, uint32_t now) {
  memset(&s, 0, sizeof(s));
  s.initialized = true; s.lastMs = s.historyMs = s.policyMs = now; s.policyMode = c.mode;
  for (uint16_t i = 0; i < c.leftCount; ++i) leftHistory[i] = 0.0f;
  for (uint16_t i = 0; i < c.rightCount; ++i) rightHistory[i] = 0.0f;
}

// Scroll one rail's history by 'steps' samples. Past the rail's own length
// every slot already holds 'level', so a shorter rail stops there.
static void _vuShiftHistory(float* history, uint16_t count, uint16_t steps, float level) {
  steps = min<uint16_t>(steps, count);
  for (uint16_t step = 0; step < steps; ++step) {
    for (uint16_t i = count - 1; i > 0; --i) history[i] = history[i - 1];
    history[0] = level;
  }
}

static void _vuPeak(float level, float& peak, uint32_t& holdUntil, uint32_t now, float dt, const StereoVuConfig& c) {
  if (level >= peak) { peak = level; holdUntil = now + (uint32_t)lroundf(c.peakHoldSec * 1000.0f); return; }
  if ((int32_t)(now - holdUntil) < 0) return;
  peak = max(level, peak - c.peakFall * dt);
}

// One pixel of one rail. 'n' is that rail's own length: every mode draws at
// the rail's resolution, and the modes that read the other rail's level
// (Stereo Balance) still draw on this rail's pixels.
static CRGB _vuPixel(uint8_t mode, uint16_t i, uint16_t n, const StereoVuConfig& c, const CRGBPalette16& palette,
                     float level, float peak, const float* history, CRGB base, float other, bool left, float beatGlow) {
  const float position = n == 1 ? 0.0f : (float)i / (float)(n - 1);
  const float coverage = _vuClamp(level * n - i);
  const CRGB pal = ColorFromPalette(palette, _vuByte(position * 0.82f), 255, LINEARBLEND);
  switch (mode) {
    case 1: return _vuScale(pal, coverage);                                      // Palette Fill
    case 2: return _vuScale(base, level);                                       // Solid Channel
    case 3: return i % 4 == 3 ? CRGB::Black : _vuScale(_vuLadder(position), coverage);
    case 4: {                                                                    // Peak Cap
      uint16_t cap = min<uint16_t>(n - 1, (uint16_t)floorf(peak * n));
      return peak > 0.0f && i == cap ? CRGB::White : _vuScale(pal, coverage);
    }
    case 5: {                                                                    // Falling Comet
      int head = min<int>(n - 1, (int)lroundf(peak * (n - 1)));
      int tail = max<int>(1, (int)lroundf(1.0f + c.trail * min<int>(12, n - 1)));
      int distance = head - i;
      if (peak <= 0.0f || distance < 0 || distance > tail) return CRGB::Black;
      float glow = distance == 0 ? 1.0f : (1.0f - distance / (float)(tail + 1)) * c.trail;
      return _vuScale(pal, glow);
    }
    case 6: {                                                                    // Center Burst
      float center = (n - 1) * 0.5f, radius = level * n * 0.5f;
      float cover = _vuClamp(radius + 0.5f - fabsf(i - center));
      float p = fabsf(i - center) / max(1.0f, n * 0.5f);
      return _vuScale(ColorFromPalette(palette, _vuByte(p * 0.82f), 255, LINEARBLEND), cover);
    }
    case 7: {                                                                    // Frame-Inward
      uint16_t j = n - 1 - i;
      float jp = n == 1 ? 0.0f : (float)j / (float)(n - 1);
      return _vuScale(ColorFromPalette(palette, _vuByte((1.0f - jp) * 0.82f), 255, LINEARBLEND), _vuClamp(level * n - j));
    }
    case 8: {                                                                    // Dot Runner
      int head = min<int>(n - 1, (int)lroundf(level * (n - 1)));
      int tail = max<int>(1, (int)lroundf(c.trail * min<int>(8, n - 1)));
      int distance = head - i;
      if (distance < 0 || distance > tail) return CRGB::Black;
      return _vuScale(base, distance == 0 ? 1.0f : c.trail * (1.0f - distance / (float)(tail + 1)));
    }
    case 9: {                                                                    // History Trail
      float value = history[i];
      return _vuScale(ColorFromPalette(palette, _vuByte(value * 0.82f), 255, LINEARBLEND), value);
    }
    case 10: {                                                                   // Stereo Balance
      float total = _vuClamp((level + other) * 0.5f), balance = (level - other + 1.0f) * 0.5f;
      CRGB color = _vuMix(CRGB(35, 90, 255), CRGB(255, 45, 85), balance);
      float emphasis = left ? _vuClamp(0.55f + balance) : _vuClamp(1.55f - balance);
      return _vuScale(_vuScale(color, emphasis), _vuClamp(total * n - i));
    }
    case 11: {                                                                   // Beat Spark
      CRGB pixel = _vuScale(_vuLadder(position), coverage);
      uint16_t tip = min<uint16_t>(n - 1, (uint16_t)floorf(level * n));
      if (level > 0.0f && beatGlow > 0.0f) {
        if (i == tip) pixel = _vuAdd(pixel, _vuScale(CRGB::White, beatGlow * c.beatAccent));
        if (tip > 0 && i == tip - 1) pixel = _vuAdd(pixel, _vuScale(CRGB::White, beatGlow * c.beatAccent * 0.35f));
      }
      return pixel;
    }
    case 0:
    default: return _vuScale(_vuLadder(position), coverage);                    // Classic Ladder
  }
}

static void _stereoVuRender(StereoVuState& s, const StereoVuConfig& c, float* leftHistory, float* rightHistory,
                            CRGB* leftPixels, CRGB* rightPixels, const CRGBPalette16& palette,
                            bool active, float rawLeft, float rawRight, bool beat, uint32_t now) {
  if (!s.initialized) _vuReset(s, leftHistory, rightHistory, c, now);
  if (!active) {
    _vuReset(s, leftHistory, rightHistory, c, now);
    fill_solid(leftPixels, c.leftCount, CRGB::Black); fill_solid(rightPixels, c.rightCount, CRGB::Black); return;
  }
  float dt = min(0.25f, (now - s.lastMs) / 1000.0f); s.lastMs = now;
  float l = c.swapChannels ? rawRight : rawLeft, r = c.swapChannels ? rawLeft : rawRight;
  s.leftLevel = _vuFollow(s.leftLevel, _vuCondition(l, c), dt, c.attackSec, c.releaseSec);
  s.rightLevel = _vuFollow(s.rightLevel, _vuCondition(r, c), dt, c.attackSec, c.releaseSec);
  _vuPeak(s.leftLevel, s.leftPeak, s.leftHoldUntilMs, now, dt, c);
  _vuPeak(s.rightLevel, s.rightPeak, s.rightHoldUntilMs, now, dt, c);
  bool beatEdge = beat && !s.previousBeat; s.previousBeat = beat;
  s.beatGlow = beatEdge ? 1.0f : max(0.0f, s.beatGlow - dt * 5.0f);
  const uint32_t historyPeriod = 1000u / 30u;
  if (now - s.historyMs >= historyPeriod) {
    // One clock for both rails, bounded by the longer one.
    uint16_t steps = min<uint16_t>(max(c.leftCount, c.rightCount), (now - s.historyMs) / historyPeriod);
    _vuShiftHistory(leftHistory, c.leftCount, steps, s.leftLevel);
    _vuShiftHistory(rightHistory, c.rightCount, steps, s.rightLevel);
    s.historyMs += steps * historyPeriod;
  }
  uint8_t mode = c.mode;
  if (c.policy == 1 || c.policy == 3) {
    uint32_t interval = max<uint32_t>(250u, (uint32_t)lroundf(c.cycleSec * 1000.0f));
    uint32_t steps = (now - s.policyMs) / interval;
    mode = c.policy == 1 ? (c.mode + steps) % 12 : c.shuffle[steps % 12];
  } else if (c.policy == 2) {
    if (beatEdge && now - s.policyMs >= 350u) { s.policyMode = (s.policyMode + 1) % 12; s.policyMs = now; }
    mode = s.policyMode;
  }
  // Each rail at its own length; nothing maps one rail's pixels onto the other's.
  for (uint16_t i = 0; i < c.leftCount; ++i) {
    CRGB lp = _vuScale(_vuPixel(mode, i, c.leftCount, c, palette, s.leftLevel, s.leftPeak, leftHistory, c.leftColor, s.rightLevel, true, s.beatGlow), c.brightness);
    leftPixels[c.reverseLeft ? c.leftCount - 1 - i : i] = lp;
  }
  for (uint16_t i = 0; i < c.rightCount; ++i) {
    CRGB rp = _vuScale(_vuPixel(mode, i, c.rightCount, c, palette, s.rightLevel, s.rightPeak, rightHistory, c.rightColor, s.leftLevel, false, s.beatGlow), c.brightness);
    rightPixels[c.reverseRight ? c.rightCount - 1 - i : i] = rp;
  }
}`
