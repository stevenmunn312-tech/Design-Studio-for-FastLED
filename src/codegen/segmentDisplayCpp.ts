// TM1637 driver and digit rendering, emitted into the sketch.
//
// Written inline rather than pulled from a library. The TM1637 protocol is a
// two-wire start/stop/ack sequence of about forty lines, and bundling it keeps
// the display slice off the optional-library staging path entirely — nothing to
// fetch, nothing to pin, nothing to fail on a machine with no network. A
// controller that genuinely needs a driver (LVGL, a colour panel) is a
// different decision from this one.
//
// The digit layout mirrors state/segmentDisplay.ts, which the evaluator uses.
// The glyph table is generated from that module's own map rather than typed out
// again: a second table written from memory is how a `6` ends up missing its
// top bar on hardware and nowhere else.

import { SEGMENT_GLYPHS, SEGMENT_DIGITS } from '../state/segmentDisplay'

function glyphTableCpp(): string {
  const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
  const bytes = digits.map((d) => `0x${SEGMENT_GLYPHS[d].toString(16).padStart(2, '0')}`)
  return bytes.join(', ')
}

const DASH = `0x${SEGMENT_GLYPHS['-'].toString(16).padStart(2, '0')}`
const BLANK = `0x${SEGMENT_GLYPHS[' '].toString(16).padStart(2, '0')}`

/**
 * Driver plus rendering, emitted once when a sketch contains any segment
 * display.
 *
 * `_segWrite` only touches the module when the rendered bytes change or the
 * refresh deadline passes. The plan's rule, and it matters: an LED loop runs
 * hundreds of times a second and a TM1637 transfer is bit-banged with
 * microsecond delays, so rewriting it every frame would spend more time
 * clocking four bytes than rendering the LEDs.
 */
export const SEGMENT_DISPLAY_CPP_HELPERS = `// ── TM1637 segment display ──────────────────────────────────────────────────
// Mirrors src/state/segmentDisplay.ts so the module shows what the preview does.
#define SEG_DIGITS ${SEGMENT_DIGITS}
// Longest gap between writes when nothing changed, so a module that was
// unplugged and returned redraws itself without the loop polling it.
#define SEG_REFRESH_MS 1000

static const uint8_t _segDigitGlyph[10] = { ${glyphTableCpp()} };
static const uint8_t _segDash  = ${DASH};
static const uint8_t _segBlank = ${BLANK};

struct SegDisplay {
  uint8_t clk;
  uint8_t dio;
  uint8_t brightness;
  uint8_t last[SEG_DIGITS];
  bool written;
  uint32_t lastWriteMs;
};

static void _segStart(SegDisplay &d) {
  digitalWrite(d.dio, HIGH); digitalWrite(d.clk, HIGH); delayMicroseconds(2);
  digitalWrite(d.dio, LOW);  delayMicroseconds(2);
}

static void _segStop(SegDisplay &d) {
  digitalWrite(d.clk, LOW);  delayMicroseconds(2);
  digitalWrite(d.dio, LOW);  delayMicroseconds(2);
  digitalWrite(d.clk, HIGH); delayMicroseconds(2);
  digitalWrite(d.dio, HIGH); delayMicroseconds(2);
}

// The ack is read but not acted on: there is no recovery for a module that is
// not answering beyond trying again on the next refresh, which is what the
// deadline already does.
static void _segByte(SegDisplay &d, uint8_t value) {
  for (uint8_t i = 0; i < 8; i++) {
    digitalWrite(d.clk, LOW);
    digitalWrite(d.dio, (value & 0x01) ? HIGH : LOW);
    delayMicroseconds(3);
    digitalWrite(d.clk, HIGH);
    delayMicroseconds(3);
    value >>= 1;
  }
  digitalWrite(d.clk, LOW);
  pinMode(d.dio, INPUT);
  delayMicroseconds(3);
  digitalWrite(d.clk, HIGH);
  delayMicroseconds(3);
  digitalWrite(d.clk, LOW);
  pinMode(d.dio, OUTPUT);
  delayMicroseconds(3);
}

static void _segBegin(SegDisplay &d, uint8_t clk, uint8_t dio, uint8_t brightness) {
  d.clk = clk; d.dio = dio; d.brightness = brightness;
  d.written = false; d.lastWriteMs = 0;
  for (uint8_t i = 0; i < SEG_DIGITS; i++) d.last[i] = 0;
  pinMode(clk, OUTPUT); pinMode(dio, OUTPUT);
  digitalWrite(clk, LOW); digitalWrite(dio, LOW);
}

// Writes only on a change or once the refresh deadline passes: a bit-banged
// four-byte transfer every LED frame would cost more than the render.
static void _segWrite(SegDisplay &d, const uint8_t *bytes, bool lit) {
  uint32_t now = millis();
  bool changed = !d.written;
  for (uint8_t i = 0; i < SEG_DIGITS && !changed; i++) changed = d.last[i] != bytes[i];
  if (!changed && (now - d.lastWriteMs) < SEG_REFRESH_MS) return;
  for (uint8_t i = 0; i < SEG_DIGITS; i++) d.last[i] = bytes[i];
  d.written = true;
  d.lastWriteMs = now;

  _segStart(d); _segByte(d, 0x40); _segStop(d);            // auto-increment write
  _segStart(d); _segByte(d, 0xC0);                          // from address 0
  for (uint8_t i = 0; i < SEG_DIGITS; i++) _segByte(d, bytes[i]);
  _segStop(d);
  // Display-control byte: 0x88 turns the panel on, low three bits are level.
  _segStart(d);
  _segByte(d, lit ? (uint8_t)(0x88 | (d.brightness & 0x07)) : (uint8_t)0x80);
  _segStop(d);
}

// ── Rendering ───────────────────────────────────────────────────────────────
// Mirrors renderSegmentNumber / renderSegmentClock / renderSegmentIndex.

static void _segBlankAll(uint8_t *out) {
  for (uint8_t i = 0; i < SEG_DIGITS; i++) out[i] = _segBlank;
}

static void _segAllDash(uint8_t *out) {
  for (uint8_t i = 0; i < SEG_DIGITS; i++) out[i] = _segDash;
}

static void _segNumber(uint8_t *out, float value, int decimals, bool leadingZero) {
  if (!isfinite(value)) { _segAllDash(out); return; }
  if (decimals < 0) decimals = 0;
  if (decimals > 3) decimals = 3;
  double scale = 1.0;
  for (int i = 0; i < decimals; i++) scale *= 10.0;
  // Half away from zero, matching scaleAndRound() in state/displayText.ts.
  double product = (double)value * scale;
  long scaled = (long)(product < 0 ? -floor(-product + 0.5) : floor(product + 0.5));

  bool negative = scaled < 0;
  unsigned long magnitude = (unsigned long)(negative ? -scaled : scaled);
  char body[12];
  int len = snprintf(body, sizeof(body), "%lu", magnitude);
  int room = SEG_DIGITS - (negative ? 1 : 0);
  if (len > room) { _segAllDash(out); return; }

  char text[SEG_DIGITS + 1];
  for (int i = 0; i < SEG_DIGITS; i++) text[i] = ' ';
  text[SEG_DIGITS] = 0;
  int pad = leadingZero ? room : len;
  int start = SEG_DIGITS - pad;
  for (int i = 0; i < pad; i++) {
    int from = i - (pad - len);
    text[start + i] = from >= 0 ? body[from] : '0';
  }
  if (negative) text[start - 1 < 0 ? 0 : start - 1] = '-';

  for (int i = 0; i < SEG_DIGITS; i++) {
    char c = text[i];
    if (c >= '0' && c <= '9') out[i] = _segDigitGlyph[c - '0'];
    else if (c == '-') out[i] = _segDash;
    else out[i] = _segBlank;
  }
  if (decimals > 0) {
    int at = SEG_DIGITS - 1 - decimals;
    if (at >= 0) out[at] |= 0x80;
  }
}

static void _segClock(uint8_t *out, int hour, int minute, bool colon) {
  int hh = abs(hour) % 100, mm = abs(minute) % 100;
  out[0] = _segDigitGlyph[(hh / 10) % 10];
  out[1] = _segDigitGlyph[hh % 10];
  out[2] = _segDigitGlyph[(mm / 10) % 10];
  out[3] = _segDigitGlyph[mm % 10];
  if (colon) out[1] |= 0x80;
}

static void _segIndex(uint8_t *out, long index) {
  if (index < 0 || index > 9999) { _segAllDash(out); return; }
  char body[8];
  snprintf(body, sizeof(body), "%ld", index);
  int len = (int)strlen(body);
  for (int i = 0; i < SEG_DIGITS; i++) {
    int from = i - (SEG_DIGITS - len);
    out[i] = from >= 0 ? _segDigitGlyph[body[from] - '0'] : _segBlank;
  }
}
`

export interface SegmentDisplayEmit {
  /** Unique C identifier stem for this display's globals. */
  id: string
  clkPin: number
  dioPin: number
  brightness: number
  mode: 'Number' | 'Clock' | 'Index'
  decimals: number
  leadingZero: boolean
  showColon: boolean
  /** C++ expression for the value, or null in Clock mode. */
  valueExpr: string | null
  /** C++ expression for the upstream DateTime struct, or null. */
  dateTimeExpr: string | null
  /** C++ boolean expression for whether the module is lit. */
  enabledExpr: string
}

/** The global declaration for one display. */
export function segmentDisplaySetupCpp(display: SegmentDisplayEmit): string[] {
  return [
    `  _segBegin(_seg_${display.id}, ${display.clkPin}, ${display.dioPin}, ${display.brightness});`,
  ]
}

export function segmentDisplayGlobalCpp(display: SegmentDisplayEmit): string {
  return `static SegDisplay _seg_${display.id};`
}

/** The per-frame render and conditional write for one display. */
export function segmentDisplayLoopCpp(display: SegmentDisplayEmit): string[] {
  const v = `_segBuf_${display.id}`
  const lines = [
    `  { // Segment Display`,
    `    uint8_t ${v}[SEG_DIGITS];`,
    `    bool _segOn_${display.id} = ${display.enabledExpr};`,
    `    if (!_segOn_${display.id}) {`,
    `      _segBlankAll(${v});`,
  ]
  if (display.mode === 'Clock') {
    const dt = display.dateTimeExpr
    // No trustworthy reading shows dashes, never a plausible midnight.
    lines.push(
      `    } else if (${dt ? `${dt}.valid` : 'false'}) {`,
      `      _segClock(${v}, ${dt ? `${dt}.hour` : '0'}, ${dt ? `${dt}.minute` : '0'}, ` +
        `${display.showColon ? '((millis() / 1000) % 2) == 0' : 'false'});`,
      `    } else {`,
      `      _segAllDash(${v});`,
    )
  } else if (display.mode === 'Index') {
    lines.push(
      `    } else {`,
      `      _segIndex(${v}, (long)lroundf(${display.valueExpr ?? '0'}));`,
    )
    if (display.showColon) lines.push(`      ${v}[1] |= 0x80;`)
  } else {
    lines.push(
      `    } else {`,
      `      _segNumber(${v}, ${display.valueExpr ?? '0'}, ${display.decimals}, ` +
        `${display.leadingZero ? 'true' : 'false'});`,
    )
    if (display.showColon) lines.push(`      ${v}[1] |= 0x80;`)
  }
  lines.push(
    `    }`,
    `    _segWrite(_seg_${display.id}, ${v}, _segOn_${display.id});`,
    `  }`,
  )
  return lines
}
