// C++ emitters for the `string` port type.
//
// Every constant and every rule here comes from `state/displayText.ts` rather
// than being restated, because the whole point of that module is that the
// browser and the device format text the same way. A literal copied into this
// file would be a second definition, and second definitions drift.
//
// The generated code uses fixed `char` buffers and `snprintf`. Arduino `String`
// is deliberately absent: a display updated in `loop()` would reallocate once
// per LED frame and fragment the heap on exactly the long runs an installation
// is built for.

import {
  DISPLAY_TEXT_BUFFER_BYTES,
  DISPLAY_TEXT_ELLIPSIS,
  DISPLAY_TEXT_NO_READING,
  DISPLAY_TEXT_OVERFLOW,
  cppStringLiteral,
  type NumberTextFormat,
  type DateTimeTextMode,
} from '../state/displayText'

/**
 * Shared runtime helpers, emitted once when a sketch contains any string node.
 *
 * `_dsFormatNumber` reproduces `formatNumberText`: scale, round half away from
 * zero, then print the integer and fractional halves separately. It does not
 * use `%.*f`, because a C library's tie handling depends on the current
 * rounding mode and would disagree with the browser on exactly the values a
 * user notices — a readout that shows 119 in preview and 120 on the bench.
 *
 * The arithmetic is `double` to match JavaScript's number type. In `float` the
 * scaling multiply loses bits that change the rounded result near a tie.
 *
 * `_dsFormatDateTime` reproduces `formatDateTimeText`, including its dashed
 * masks: an invalid clock reads as a clock with no time, never as midnight.
 */
export const DISPLAY_TEXT_CPP_HELPERS = `// ── Display text ────────────────────────────────────────────────────────────
// Mirrors src/state/displayText.ts so preview and firmware format identically.
#define DS_TEXT_BYTES ${DISPLAY_TEXT_BUFFER_BYTES}

static const char *_dsWeekday(int weekday) {
  static const char *_names[7] = {"SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"};
  int i = weekday % 7;
  if (i < 0) i += 7;
  return _names[i];
}

// Copies at most DS_TEXT_BYTES-1 bytes and always terminates. Copying stops on
// a UTF-8 continuation byte boundary so a truncated multi-byte character is
// dropped whole rather than left as bytes no decoder accepts.
static void _dsCopy(char *dst, const char *src) {
  size_t n = 0;
  while (src[n] != 0 && n < (size_t)(DS_TEXT_BYTES - 1)) n++;
  while (n > 0 && ((unsigned char)src[n] & 0xC0) == 0x80) n--;
  memcpy(dst, src, n);
  dst[n] = 0;
}

static void _dsFormatNumber(char *dst, double value, int decimals, int padWidth,
                            bool showSign, int maxIntegerDigits,
                            const char *prefix, const char *suffix) {
  if (!isfinite(value)) {
    snprintf(dst, DS_TEXT_BYTES, "%s${DISPLAY_TEXT_NO_READING}%s", prefix, suffix);
    return;
  }
  double scale = 1.0;
  for (int i = 0; i < decimals; i++) scale *= 10.0;
  // Half away from zero, in both directions, matching scaleAndRound().
  double product = value * scale;
  long long scaled = (long long)(product < 0 ? -floor(-product + 0.5) : floor(product + 0.5));

  bool negative = scaled < 0;
  unsigned long long magnitude = (unsigned long long)(negative ? -scaled : scaled);
  unsigned long long divisor = 1;
  for (int i = 0; i < decimals; i++) divisor *= 10ULL;
  unsigned long long whole = magnitude / divisor;
  unsigned long long fraction = magnitude % divisor;

  int digits = 1;
  for (unsigned long long probe = whole; probe >= 10ULL; probe /= 10ULL) digits++;
  if (digits > maxIntegerDigits) {
    snprintf(dst, DS_TEXT_BYTES, "%s${DISPLAY_TEXT_OVERFLOW}%s", prefix, suffix);
    return;
  }

  const char *sign = negative ? "-" : (showSign ? "+" : "");
  if (decimals > 0) {
    snprintf(dst, DS_TEXT_BYTES, "%s%s%0*llu.%0*llu%s",
             prefix, sign, padWidth, whole, decimals, fraction, suffix);
  } else {
    snprintf(dst, DS_TEXT_BYTES, "%s%s%0*llu%s", prefix, sign, padWidth, whole, suffix);
  }
}

// mode indices match DATE_TIME_TEXT_MODES in src/state/displayText.ts.
static void _dsFormatDateTime(char *dst, int mode, bool valid, int hour, int minute,
                              int second, int weekday, int day, int month, int year) {
  if (!valid) {
    switch (mode) {
      case 1: _dsCopy(dst, "--:--:--"); return;
      case 2: _dsCopy(dst, "----------"); return;
      case 3: _dsCopy(dst, "-----"); return;
      case 4: _dsCopy(dst, "---"); return;
      case 5: _dsCopy(dst, "--- --:--"); return;
      default: _dsCopy(dst, "--:--"); return;
    }
  }
  int hh = abs(hour) % 100, mm = abs(minute) % 100, ss = abs(second) % 100;
  int dd = abs(day) % 100, mo = abs(month) % 100, yy = abs(year) % 10000;
  switch (mode) {
    case 1: snprintf(dst, DS_TEXT_BYTES, "%02d:%02d:%02d", hh, mm, ss); return;
    case 2: snprintf(dst, DS_TEXT_BYTES, "%04d-%02d-%02d", yy, mo, dd); return;
    case 3: snprintf(dst, DS_TEXT_BYTES, "%02d-%02d", dd, mo); return;
    case 4: snprintf(dst, DS_TEXT_BYTES, "%s", _dsWeekday(weekday)); return;
    case 5: snprintf(dst, DS_TEXT_BYTES, "%s %02d:%02d", _dsWeekday(weekday), hh, mm); return;
    default: snprintf(dst, DS_TEXT_BYTES, "%02d:%02d", hh, mm); return;
  }
}
`

/**
 * Mode index for the generated switch.
 *
 * Exported so the generator and its tests read the same mapping; the C++ side
 * documents the correspondence but cannot enforce it.
 */
export const DATE_TIME_CPP_MODE_INDEX: Record<DateTimeTextMode, number> = {
  'HH:MM': 0,
  'HH:MM:SS': 1,
  'YYYY-MM-DD': 2,
  'DD-MM': 3,
  Weekday: 4,
  'Weekday HH:MM': 5,
}

/**
 * A `TextValue`'s line, baked at generation time.
 *
 * The text is known here, so nothing is formatted at runtime — the sketch
 * carries the finished literal. `cppStringLiteral` validates it against
 * printable ASCII first, which is the requirement for any user text reaching
 * generated C++.
 */
export function textValueCpp(varName: string, text: string): string {
  return `  static const char ${varName}[] = ${cppStringLiteral(text)};`
}

/** A `FormatNumber`'s buffer and the call that fills it. */
export function formatNumberCpp(varName: string, valueExpr: string, format: NumberTextFormat): string[] {
  return [
    `  char ${varName}[DS_TEXT_BYTES];`,
    `  _dsFormatNumber(${varName}, (double)(${valueExpr}), ${format.decimals}, ${format.padWidth}, ` +
      `${format.showSign ? 'true' : 'false'}, ${format.maxIntegerDigits}, ` +
      `${cppStringLiteral(format.prefix)}, ${cppStringLiteral(format.suffix)});`,
  ]
}

/**
 * A `FormatDateTime`'s buffer and the call that fills it.
 *
 * `dateTimeExpr` is the upstream DateTime struct, or null when the port is
 * unwired — in which case the reading is invalid and the mode's dashed mask is
 * what the display shows. Falling back to the sketch's own uptime would put a
 * running clock on a build that has no clock.
 */
export function formatDateTimeCpp(
  varName: string,
  dateTimeExpr: string | null,
  mode: DateTimeTextMode,
): string[] {
  const index = DATE_TIME_CPP_MODE_INDEX[mode]
  if (!dateTimeExpr) {
    return [
      `  char ${varName}[DS_TEXT_BYTES];`,
      `  _dsFormatDateTime(${varName}, ${index}, false, 0, 0, 0, 0, 1, 1, 1970);`,
    ]
  }
  return [
    `  char ${varName}[DS_TEXT_BYTES];`,
    `  _dsFormatDateTime(${varName}, ${index}, ${dateTimeExpr}.valid, ${dateTimeExpr}.hour, ` +
      `${dateTimeExpr}.minute, ${dateTimeExpr}.second, ${dateTimeExpr}.weekday, ` +
      `${dateTimeExpr}.day, ${dateTimeExpr}.month, ${dateTimeExpr}.year);`,
  ]
}

/** Re-exported so a caller emitting its own buffer uses the same budget. */
export { DISPLAY_TEXT_BUFFER_BYTES, DISPLAY_TEXT_ELLIPSIS }
