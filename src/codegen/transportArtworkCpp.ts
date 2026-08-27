// Finished RGB565 artwork tables for colour Transport Displays.

import { TRANSPORT_ARTWORK_BYTES, TRANSPORT_ARTWORK_H, TRANSPORT_ARTWORK_W } from '../state/transportDisplay'

export function transportArtworkStem(id: string): string {
  return id.replace(/[^A-Za-z0-9_]/g, '_')
}

function rows(data: Uint8Array, perRow = 16): string {
  const lines: string[] = []
  for (let i = 0; i < data.length; i += perRow) {
    lines.push('    ' + Array.from(data.slice(i, i + perRow))
      .map((byte) => `0x${byte.toString(16).padStart(2, '0')}`).join(', ') + ',')
  }
  return lines.join('\n')
}

export function transportArtworkTableCpp(id: string, artworks: readonly Uint8Array[]): string {
  const stem = transportArtworkStem(id)
  return `// ── Transport artwork (${stem}) ─────────────────────────────────────────────
#define ART_W_${stem} ${TRANSPORT_ARTWORK_W}
#define ART_H_${stem} ${TRANSPORT_ARTWORK_H}
#define ART_BYTES_${stem} ${TRANSPORT_ARTWORK_BYTES}
#define ART_COUNT_${stem} ${artworks.length}
${artworks.length === 0 ? '' : `static const uint8_t _artData_${stem}[ART_COUNT_${stem}][ART_BYTES_${stem}] PROGMEM = {
${artworks.map((artwork) => `  {\n${rows(artwork)}\n  },`).join('\n')}
};`}`
}
