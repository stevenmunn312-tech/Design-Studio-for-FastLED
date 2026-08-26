// Segment-display drivers and digit rendering, emitted into the sketch.
//
// Two controllers behind one node contract. A TM1637 is a two-wire part with
// its own start/stop framing and a raw segment byte per digit; a MAX7219 is a
// shift register clocked in 16-bit register/value frames. What they share is
// everything above the wire — the digits, the rounding, the refusal to show a
// number that will not fit — so that lives in state/segmentDisplay.ts and only
// the transport differs here.
//
// Both drivers are written inline rather than pulled from a library. The
// protocols are short and stable, and bundling them keeps the segment slices
// off the optional-library staging path: nothing to fetch, nothing to pin,
// nothing to fail without a network.

import { SEGMENT_GLYPHS, SEGMENT_CONTROLLERS } from '../state/segmentDisplay'

const MAX_DIGITS = Math.max(...Object.values(SEGMENT_CONTROLLERS).map((c) => c.digits))

function tm1637GlyphTable(): string {
  return ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
    .map((d) => `0x${SEGMENT_GLYPHS[d].toString(16).padStart(2, '0')}`)
    .join(', ')
}

const DASH = `0x${SEGMENT_GLYPHS['-'].toString(16).padStart(2, '0')}`
const BLANK = `0x${SEGMENT_GLYPHS[' '].toString(16).padStart(2, '0')}`

/**
 * Shared struct, rendering and refresh policy for any segment module.
 *
 * `_segWrite` only touches a module when the rendered characters change or the
 * refresh deadline passes. An LED loop runs hundreds of times a second and both
 * transports are bit-banged, so rewriting every frame would spend more time
 * clocking digits than rendering the pixels they report on.
 */
/**
 * Forward declaration for the top of a sketch, above the includes' first
 * function.
 *
 * The Arduino .ino preprocessor hoists a prototype for every function it finds
 * to a point above all user type definitions, so `struct SegDisplay` — declared with
 * the helpers, far down the file — is not yet a name when the prototype for a
 * helper taking one by reference arrives. The build then fails on a line the
 * generator never wrote. The same trap already cost the FastLED declarations
 * that sit beside this one in the emitted preamble.
 */
export const SEGMENT_DISPLAY_CPP_FORWARD = 'struct SegDisplay;'

export const SEGMENT_DISPLAY_CPP_HELPERS = `// ── Segment displays ────────────────────────────────────────────────────────
// Mirrors src/state/segmentDisplay.ts so a module shows what the preview does.
#define SEG_MAX_DIGITS ${MAX_DIGITS}
#define SEG_KIND_TM1637 0
#define SEG_KIND_MAX7219 1
// Longest gap between writes when nothing changed, so a module that was
// unplugged and returned redraws itself without the loop polling it.
#define SEG_REFRESH_MS 1000

static const uint8_t _segDigitGlyph[10] = { ${tm1637GlyphTable()} };
static const uint8_t _segDash  = ${DASH};
static const uint8_t _segBlank = ${BLANK};

struct SegDisplay {
  uint8_t kind;
  uint8_t digits;
  // TM1637 uses clk + data; MAX7219 uses clk + data + load/CS.
  uint8_t clk, data, cs;
  uint8_t brightness;
  char last[SEG_MAX_DIGITS];
  int lastDecimal;
  bool lastColon;
  bool written;
  uint32_t lastWriteMs;
};

// ── TM1637 ──────────────────────────────────────────────────────────────────

static void _tmStart(SegDisplay &d) {
  digitalWrite(d.data, HIGH); digitalWrite(d.clk, HIGH); delayMicroseconds(2);
  digitalWrite(d.data, LOW);  delayMicroseconds(2);
}

static void _tmStop(SegDisplay &d) {
  digitalWrite(d.clk, LOW);  delayMicroseconds(2);
  digitalWrite(d.data, LOW); delayMicroseconds(2);
  digitalWrite(d.clk, HIGH); delayMicroseconds(2);
  digitalWrite(d.data, HIGH); delayMicroseconds(2);
}

// The ack is clocked but not acted on: there is no recovery for a module that
// is not answering beyond trying again, which the refresh deadline already does.
static void _tmByte(SegDisplay &d, uint8_t value) {
  for (uint8_t i = 0; i < 8; i++) {
    digitalWrite(d.clk, LOW);
    digitalWrite(d.data, (value & 0x01) ? HIGH : LOW);
    delayMicroseconds(3);
    digitalWrite(d.clk, HIGH);
    delayMicroseconds(3);
    value >>= 1;
  }
  digitalWrite(d.clk, LOW);
  pinMode(d.data, INPUT);
  delayMicroseconds(3);
  digitalWrite(d.clk, HIGH);
  delayMicroseconds(3);
  digitalWrite(d.clk, LOW);
  pinMode(d.data, OUTPUT);
  delayMicroseconds(3);
}

// Raw segment bytes, bit 0 = top bar through bit 6 = centre, bit 7 = point.
static uint8_t _tmSegments(char c) {
  if (c >= '0' && c <= '9') return _segDigitGlyph[c - '0'];
  if (c == '-') return _segDash;
  return _segBlank;
}

static void _tmFlush(SegDisplay &d, const char *text, int decimalAt, bool colon, bool lit) {
  _tmStart(d); _tmByte(d, 0x40); _tmStop(d);            // auto-increment write
  _tmStart(d); _tmByte(d, 0xC0);                         // from address 0
  for (uint8_t i = 0; i < d.digits; i++) {
    uint8_t byte = lit ? _tmSegments(text[i]) : 0x00;
    if (lit && (int)i == decimalAt) byte |= 0x80;
    // The TM1637 carries the colon on the second digit's high bit.
    if (lit && colon && i == 1) byte |= 0x80;
    _tmByte(d, byte);
  }
  _tmStop(d);
  _tmStart(d);
  _tmByte(d, lit ? (uint8_t)(0x88 | (d.brightness & 0x07)) : (uint8_t)0x80);
  _tmStop(d);
}

// ── MAX7219 ─────────────────────────────────────────────────────────────────

static void _maxSend(SegDisplay &d, uint8_t reg, uint8_t value) {
  digitalWrite(d.cs, LOW);
  uint16_t frame = ((uint16_t)reg << 8) | value;
  for (int8_t i = 15; i >= 0; i--) {
    digitalWrite(d.clk, LOW);
    digitalWrite(d.data, (frame >> i) & 1 ? HIGH : LOW);
    digitalWrite(d.clk, HIGH);
  }
  digitalWrite(d.cs, HIGH);
}

/*
 * Code B decode rather than raw segments.
 *
 * The MAX7219 numbers its segment bits in the opposite order to the TM1637, so
 * writing raw bytes would need a second, reversed glyph table — one more place
 * for a 6 to lose its top bar on one controller only. Code B has the chip do
 * the decoding from a digit value, and it covers everything the shared renderer
 * produces: 0-9, a dash, and blank.
 */
static uint8_t _maxCodeB(char c) {
  if (c >= '0' && c <= '9') return (uint8_t)(c - '0');
  if (c == '-') return 0x0A;
  return 0x0F;   // blank
}

static void _maxFlush(SegDisplay &d, const char *text, int decimalAt, bool lit) {
  if (!lit) { _maxSend(d, 0x0C, 0x00); return; }   // shutdown
  _maxSend(d, 0x0C, 0x01);
  _maxSend(d, 0x0A, (uint8_t)(d.brightness & 0x0F));
  // Digit 1 is the rightmost, so the buffer is written in reverse.
  for (uint8_t i = 0; i < d.digits; i++) {
    uint8_t value = _maxCodeB(text[d.digits - 1 - i]);
    if ((int)(d.digits - 1 - i) == decimalAt) value |= 0x80;
    _maxSend(d, (uint8_t)(i + 1), value);
  }
}

// ── Shared ──────────────────────────────────────────────────────────────────

static void _segBegin(SegDisplay &d, uint8_t kind, uint8_t digits, uint8_t clk,
                      uint8_t data, uint8_t cs, uint8_t brightness) {
  d.kind = kind; d.digits = digits;
  d.clk = clk; d.data = data; d.cs = cs;
  d.brightness = brightness;
  d.written = false; d.lastWriteMs = 0; d.lastDecimal = -1; d.lastColon = false;
  for (uint8_t i = 0; i < SEG_MAX_DIGITS; i++) d.last[i] = 0;

  pinMode(clk, OUTPUT); pinMode(data, OUTPUT);
  if (kind == SEG_KIND_MAX7219) {
    pinMode(cs, OUTPUT);
    digitalWrite(cs, HIGH);
    _maxSend(d, 0x0F, 0x00);                       // display test off
    _maxSend(d, 0x09, 0xFF);                       // Code B on every digit
    _maxSend(d, 0x0B, (uint8_t)(digits - 1));      // scan limit
    _maxSend(d, 0x0A, (uint8_t)(brightness & 0x0F));
    _maxSend(d, 0x0C, 0x01);                       // out of shutdown
  } else {
    digitalWrite(clk, LOW); digitalWrite(data, LOW);
  }
}

// Writes only on a change or once the refresh deadline passes: a bit-banged
// transfer every LED frame would cost more than the render it reports on.
static void _segWrite(SegDisplay &d, const char *text, int decimalAt, bool colon, bool lit) {
  uint32_t now = millis();
  bool changed = !d.written || d.lastDecimal != decimalAt || d.lastColon != colon;
  for (uint8_t i = 0; i < d.digits && !changed; i++) changed = d.last[i] != text[i];
  if (!changed && (now - d.lastWriteMs) < SEG_REFRESH_MS) return;
  for (uint8_t i = 0; i < d.digits; i++) d.last[i] = text[i];
  d.lastDecimal = decimalAt;
  d.lastColon = colon;
  d.written = true;
  d.lastWriteMs = now;

  if (d.kind == SEG_KIND_MAX7219) _maxFlush(d, text, decimalAt, lit);
  else _tmFlush(d, text, decimalAt, colon, lit);
}

// ── Rendering ───────────────────────────────────────────────────────────────
// Mirrors renderSegmentNumber / renderSegmentClock / renderSegmentIndex. These
// produce characters rather than segment bytes, so one renderer feeds both
// controllers and each maps characters to its own wire format above.

static void _segBlankAll(char *out, uint8_t digits) {
  for (uint8_t i = 0; i < digits; i++) out[i] = ' ';
  out[digits] = 0;
}

static void _segAllDash(char *out, uint8_t digits) {
  for (uint8_t i = 0; i < digits; i++) out[i] = '-';
  out[digits] = 0;
}

static void _segNumber(char *out, uint8_t digits, float value, int decimals,
                       bool leadingZero, int *decimalAt) {
  *decimalAt = -1;
  if (!isfinite(value)) { _segAllDash(out, digits); return; }
  if (decimals < 0) decimals = 0;
  if (decimals > 3) decimals = 3;
  double scale = 1.0;
  for (int i = 0; i < decimals; i++) scale *= 10.0;
  // Half away from zero, matching scaleAndRound() in state/displayText.ts.
  double product = (double)value * scale;
  long scaled = (long)(product < 0 ? -floor(-product + 0.5) : floor(product + 0.5));

  bool negative = scaled < 0;
  unsigned long magnitude = (unsigned long)(negative ? -scaled : scaled);
  char body[16];
  // Zero-padded to at least one whole digit, matching renderSegmentNumber: a
  // value under 1 would otherwise put the decimal point on a blank digit.
  int len = snprintf(body, sizeof(body), "%0*lu", decimals + 1, magnitude);
  int room = digits - (negative ? 1 : 0);
  if (len > room) { _segAllDash(out, digits); return; }

  for (uint8_t i = 0; i < digits; i++) out[i] = ' ';
  out[digits] = 0;
  int pad = leadingZero ? room : len;
  int start = digits - pad;
  for (int i = 0; i < pad; i++) {
    int from = i - (pad - len);
    out[start + i] = from >= 0 ? body[from] : '0';
  }
  if (negative && start - 1 >= 0) out[start - 1] = '-';
  if (decimals > 0) *decimalAt = digits - 1 - decimals;
}

static void _segClock(char *out, uint8_t digits, int hour, int minute, int second) {
  char body[16];
  // Seconds only fit where there are six digits; on four they are the part
  // nobody reads at a glance.
  if (digits >= 6) {
    snprintf(body, sizeof(body), "%02d%02d%02d", abs(hour) % 100, abs(minute) % 100, abs(second) % 100);
  } else {
    snprintf(body, sizeof(body), "%02d%02d", abs(hour) % 100, abs(minute) % 100);
  }
  int len = (int)strlen(body);
  for (uint8_t i = 0; i < digits; i++) out[i] = ' ';
  out[digits] = 0;
  int start = digits - len;
  for (int i = 0; i < len && start + i >= 0; i++) out[start + i] = body[i];
}

static void _segIndex(char *out, uint8_t digits, float value) {
  // Guarded before the rounding, not after: lroundf on a NaN is unspecified,
  // so folding first would let this disagree with the browser about a reading
  // neither of them has.
  if (!isfinite(value)) { _segAllDash(out, digits); return; }
  long index = lroundf(value);
  char body[16];
  snprintf(body, sizeof(body), "%ld", index < 0 ? -index : index);
  int len = (int)strlen(body);
  if (index < 0 || len > digits) { _segAllDash(out, digits); return; }
  for (uint8_t i = 0; i < digits; i++) out[i] = ' ';
  out[digits] = 0;
  for (int i = 0; i < len; i++) out[digits - len + i] = body[i];
}
`

export interface SegmentDisplayEmit {
  /** Unique C identifier stem for this display's globals. */
  id: string
  controller: 'TM1637' | 'MAX7219'
  digits: number
  clkPin: number
  /** DIO on a TM1637, DIN on a MAX7219. */
  dataPin: number
  /** Load/CS. Unused by the TM1637, which has no select line. */
  csPin: number
  brightness: number
  mode: 'Number' | 'Clock' | 'Index'
  decimals: number
  leadingZero: boolean
  showColon: boolean
  valueExpr: string | null
  dateTimeExpr: string | null
  enabledExpr: string
}

export function segmentDisplayGlobalCpp(display: SegmentDisplayEmit): string {
  return `static SegDisplay _seg_${display.id};`
}

export function segmentDisplaySetupCpp(display: SegmentDisplayEmit): string[] {
  const kind = display.controller === 'MAX7219' ? 'SEG_KIND_MAX7219' : 'SEG_KIND_TM1637'
  return [
    `  _segBegin(_seg_${display.id}, ${kind}, ${display.digits}, ${display.clkPin}, ` +
      `${display.dataPin}, ${display.csPin}, ${display.brightness});`,
  ]
}

/** The per-frame render and conditional write for one display. */
export function segmentDisplayLoopCpp(display: SegmentDisplayEmit): string[] {
  const v = `_segBuf_${display.id}`
  const d = `_segDec_${display.id}`
  const on = `_segOn_${display.id}`
  const digits = display.digits
  const lines = [
    `  { // Segment Display`,
    `    char ${v}[SEG_MAX_DIGITS + 1];`,
    `    int ${d} = -1;`,
    `    bool ${on} = ${display.enabledExpr};`,
    `    if (!${on}) {`,
    `      _segBlankAll(${v}, ${digits});`,
  ]

  if (display.mode === 'Clock') {
    const dt = display.dateTimeExpr
    // No trustworthy reading shows dashes, never a plausible midnight.
    lines.push(
      `    } else if (${dt ? `${dt}.valid` : 'false'}) {`,
      `      _segClock(${v}, ${digits}, ${dt ? `${dt}.hour` : '0'}, ` +
        `${dt ? `${dt}.minute` : '0'}, ${dt ? `${dt}.second` : '0'});`,
      `    } else {`,
      `      _segAllDash(${v}, ${digits});`,
    )
  } else if (display.mode === 'Index') {
    lines.push(
      `    } else {`,
      `      _segIndex(${v}, ${digits}, ${display.valueExpr ?? '0'});`,
    )
  } else {
    lines.push(
      `    } else {`,
      `      _segNumber(${v}, ${digits}, ${display.valueExpr ?? '0'}, ${display.decimals}, ` +
        `${display.leadingZero ? 'true' : 'false'}, &${d});`,
    )
  }

  const colon = display.showColon && display.controller === 'TM1637'
  const colonExpr = display.mode === 'Clock' && colon
    ? '((millis() / 1000) % 2) == 0'
    : colon ? 'true' : 'false'
  lines.push(
    `    }`,
    `    _segWrite(_seg_${display.id}, ${v}, ${d}, ${colonExpr}, ${on});`,
    `  }`,
  )
  return lines
}
