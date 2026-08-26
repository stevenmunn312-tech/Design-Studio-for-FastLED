// Baked pattern thumbnails and names, emitted into flash.
//
// The bake happens in the browser (see utils/bakePatternThumbnails.ts); this
// only writes the finished bytes out. There is deliberately no dithering here
// — a second implementation would not be parity, it would be the bug, because
// the preview and the panel are supposed to be showing the *same* bytes rather
// than two renderings that agree.
//
// PROGMEM and pgm_read_byte throughout. On an ESP32 that is a no-op, since
// .rodata is already memory-mapped flash, but a thumbnail table is exactly the
// kind of thing that would otherwise be copied into RAM on a board where it
// isn't, and RAM here belongs to the LED buffers and the audio decoder.

import {
  THUMBNAIL_W, THUMBNAIL_H, THUMBNAIL_BYTES, type PatternThumbnail,
} from '../state/patternThumbnail'
import { cppStringLiteral, displayString } from '../state/displayText'

export interface ThumbnailEmit {
  /** Pattern name as the browser will show it. */
  name: string
  thumbnail: PatternThumbnail
}

/** Identifier-safe stem so several collections cannot collide in one sketch. */
function stem(id: string): string {
  return id.replace(/[^A-Za-z0-9_]/g, '_')
}

function byteRows(data: Uint8Array, perRow = 16): string[] {
  const rows: string[] = []
  for (let i = 0; i < data.length; i += perRow) {
    const row = Array.from(data.slice(i, i + perRow))
      .map((byte) => `0x${byte.toString(16).padStart(2, '0')}`)
      .join(', ')
    rows.push(`    ${row},`)
  }
  return rows
}

/**
 * The whole table for one collection: geometry, bytes, names, and readers.
 *
 * Emitted once per Pattern Browser rather than once per sketch, because two
 * browsers could be showing different collections and a shared table would
 * quietly make the second one draw the first one's pictures.
 */
export function patternThumbnailTableCpp(id: string, entries: readonly ThumbnailEmit[]): string {
  const s = stem(id)
  const count = entries.length
  const names = entries.map((entry, i) =>
    `static const char _thumbName_${s}_${i}[] PROGMEM = ${cppStringLiteral(displayString(entry.name))};`)

  return `// ── Pattern thumbnails (${s}) ───────────────────────────────────────────────
// Baked in the browser at export and blitted verbatim; see
// state/patternThumbnail.ts for why the dither does not live on this side.
#define THUMB_W_${s}      ${THUMBNAIL_W}
#define THUMB_H_${s}      ${THUMBNAIL_H}
#define THUMB_BYTES_${s}  ${THUMBNAIL_BYTES}
#define THUMB_COUNT_${s}  ${count}
${count === 0 ? `// The collection is empty, so there is nothing to bake.` : `
static const uint8_t _thumbData_${s}[THUMB_COUNT_${s}][THUMB_BYTES_${s}] PROGMEM = {
${entries.map((entry) => `  {\n${byteRows(entry.thumbnail.data).join('\n')}\n  },`).join('\n')}
};

${names.join('\n')}
static const char *const _thumbNames_${s}[THUMB_COUNT_${s}] PROGMEM = {
${entries.map((_, i) => `  _thumbName_${s}_${i},`).join('\n')}
};

// Copied out rather than pointed at: the name is a PROGMEM string, and on a
// board where that is a separate address space reading it directly returns
// whatever happens to sit at the same RAM offset.
static void _thumbName_${s}_read(char *dst, size_t dstSize, uint16_t index) {
  if (index >= THUMB_COUNT_${s} || dstSize == 0) { if (dstSize) dst[0] = 0; return; }
  strncpy_P(dst, (const char *)pgm_read_ptr(&_thumbNames_${s}[index]), dstSize - 1);
  dst[dstSize - 1] = 0;
}

// One page-major column byte, the same packing OledSurface uses, so the blit
// below is a copy rather than a transpose.
static uint8_t _thumbByte_${s}(uint16_t index, uint16_t offset) {
  if (index >= THUMB_COUNT_${s} || offset >= THUMB_BYTES_${s}) return 0;
  return pgm_read_byte(&_thumbData_${s}[index][offset]);
}`}
`
}

/** Draw helper, emitted once per sketch however many browsers there are. */
export const THUMBNAIL_DRAW_CPP = `// ── Thumbnail blit ──────────────────────────────────────────────────────────
// A whole number of pages tall and landed on a page boundary, so each column
// is one store instead of eight read-modify-writes. That is the reason a
// thumbnail is 32 tall rather than 30.
static void _oledThumb(OledPanel &p, int x, int y, uint16_t width, uint16_t height,
                       uint8_t (*readByte)(uint16_t, uint16_t), uint16_t index) {
  for (uint16_t sy = 0; sy < height; sy++) {
    uint16_t base = (sy / 8) * width;
    uint8_t bit = (uint8_t)(1 << (sy % 8));
    for (uint16_t sx = 0; sx < width; sx++) {
      if (readByte(index, (uint16_t)(base + sx)) & bit) _oledPixel(p, x + sx, y + sy);
    }
  }
}

// An empty frame, so a pattern whose thumbnail did not bake reads as a missing
// picture rather than as one of the several patterns that legitimately render
// black.
static void _oledThumbMissing(OledPanel &p, int x, int y, uint16_t width, uint16_t height) {
  _oledRect(p, x, y, (int)width, (int)height);
}
`
