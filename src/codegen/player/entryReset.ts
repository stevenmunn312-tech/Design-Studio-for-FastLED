// Restart entry for a collected pattern.
//
// A post-pass on the finished render_pN, so individual emitters stay
// untouched. The bool is added only when the function actually has a
// non-const static or a persistent buffer. Resume patterns and stateless
// Restart patterns keep the signature they have today, and a sketch with
// none of either stays byte-identical.
//
// The flag is true on the first rendered frame of an entry (the start of the
// incoming transition). Each non-const static is assigned its initializer
// again, and each array or persistent buffer is memset. static const and
// static constexpr are left alone.
//
// A static with no initializer starts zero-initialized, and is reset by
// value-initializing its own type. `= 0` was right only for numbers: on a
// CRGBPalette16 it chose the gradient-palette `operator=(const uint8_t*)`
// with a null pointer, and every Restart entry of a pattern with a Palette
// Bank read address 0 and rebooted the board.
//
// Resets call `::memset`. FastLED declares CRGB in namespace fl beside its own
// fl::memset, so an unqualified call on a CRGB buffer finds both through
// argument-dependent lookup and fails to compile as ambiguous.

export interface EntryResetResult {
  fn: string
  /** True when the signature gained `, bool entry`. */
  entry: boolean
}

interface Declarator {
  name: string
  array: boolean
  init: string | null
}

function splitDeclarators(body: string): string[] {
  const parts: string[] = []
  let current = ''
  let depth = 0
  for (const ch of body) {
    if (ch === '(' || ch === '[' || ch === '{') depth++
    else if (ch === ')' || ch === ']' || ch === '}') depth = Math.max(0, depth - 1)
    if (ch === ',' && depth === 0) {
      parts.push(current)
      current = ''
    } else current += ch
  }
  if (current.trim()) parts.push(current)
  return parts
}

function declarator(fragment: string): Declarator | null {
  const text = fragment.trim()
  if (!text) return null
  const named = text.match(/([A-Za-z_][A-Za-z0-9_]*)\s*(\[[^\]]*\])?\s*(?:=\s*([\s\S]+))?$/)
  if (!named) return null
  const name = named[1]
  if (name === 'static' || name === 'const' || name === 'constexpr') return null
  const array = named[2] !== undefined
  const init = named[3]?.trim() || null
  return { name, array, init }
}

/** A file-scope buffer and the byte count its declaration covers. */
export interface PersistentBuffer {
  name: string
  bytes: string
}

/**
 * Name and byte size of a file-scope buffer declaration, persistent or
 * history. The size comes from the declared type and dimensions, never from
 * `sizeof(name)`: with Use PSRAM on, `psramBufferDecl` turns the array into a
 * pointer and `sizeof` would clear only the pointer's width.
 */
export function persistentBuffer(decl: string): PersistentBuffer | null {
  const match = decl.match(/^\s*(?:static\s+)?([A-Za-z_][A-Za-z0-9_:]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*((?:\[[^\]]+\])+)/)
  if (!match) return null
  const dims = [...match[3].matchAll(/\[([^\]]+)\]/g)].map((dim) => {
    const text = dim[1].trim()
    return /^[A-Za-z0-9_]+$/.test(text) ? text : `(${text})`
  })
  return { name: match[2], bytes: [`sizeof(${match[1]})`, ...dims].join(' * ') }
}

function resetLine(indent: string, item: Declarator): string {
  if (item.array) return `${indent}if (entry) ::memset(${item.name}, 0, sizeof(${item.name}));`
  const init = item.init ?? `decltype(${item.name})()`
  return `${indent}if (entry) ${item.name} = ${init};`
}

/**
 * Insert an entry reset after every non-const static in `fn`, and memset each
 * persistent buffer at the top of the body. Returns the function unchanged
 * when there is nothing to reset.
 */
export function applyEntryReset(fn: string, persistentBuffers: readonly PersistentBuffer[]): EntryResetResult {
  const brace = fn.indexOf('{')
  const close = fn.lastIndexOf('}')
  if (brace < 0 || close < brace) return { fn, entry: false }
  const head = fn.slice(0, brace).trimEnd()
  const body = fn.slice(brace + 1, close)
  const lines = body.split('\n')
  const out: string[] = []
  let found = persistentBuffers.length > 0
  for (const line of lines) {
    out.push(line)
    const lead = line.match(/^(\s*)static\s/)
    if (!lead) continue
    const indent = lead[1]
    // Emitters often declare several statics on one line; each is reset.
    for (const match of line.matchAll(/(?<=^|;)\s*static\s+(?!const\b)(?!constexpr\b)([^;]*);/g)) {
      for (const item of splitDeclarators(match[1]).map(declarator)) {
        if (!item) continue
        found = true
        out.push(resetLine(indent || '  ', item))
      }
    }
  }
  if (!found) return { fn, entry: false }
  const signature = head.includes('bool entry') ? head : head.replace(/\)\s*$/, ', bool entry)')
  const buffers = persistentBuffers.map(({ name, bytes }) => `  if (entry) ::memset(${name}, 0, ${bytes});`)
  return { fn: `${signature} {\n${buffers.join('\n')}${buffers.length ? '\n' : ''}${out.join('\n')}}`, entry: true }
}

/**
 * Player twin of the slideshow slots. `renderPattern` takes seconds, so the
 * helper returns the clock the pattern should see and writes the entry flag.
 * Callers pass the show's `posMs`. Commit copies the incoming slot onto the
 * current one without moving its epoch.
 */
export function playerEntryClockCpp(restart: readonly boolean[]): string {
  const flags = restart.map((on) => (on ? '1' : '0')).join(', ')
  return [
    `static const uint8_t patternRestart[] PROGMEM = { ${flags} };`,
    'struct EntrySlot { uint8_t index; uint32_t epoch; uint8_t gen; uint8_t seen; };',
    'static EntrySlot entrySlot[2] = { {255, 0, 0, 0}, {255, 0, 0, 0} };',
    'static float entryClock(uint8_t slot, uint8_t index, uint32_t now, bool allowNew, bool* entry) {',
    '  EntrySlot& s = entrySlot[slot];',
    '  if (s.index != index) {',
    '    bool fresh = allowNew && s.index != index;',
    '    s.index = index;',
    '    if (fresh) { s.epoch = now; s.gen++; }',
    '  }',
    '  *entry = s.seen != s.gen;',
    '  s.seen = s.gen;',
    '  bool restarting = index < sizeof(patternRestart) && pgm_read_byte(&patternRestart[index]);',
    '  uint32_t ms = restarting ? now - s.epoch : now;',
    '  return ms / 1000.0f;',
    '}',
    'static void commitEntrySlot() { entrySlot[0] = entrySlot[1]; }',
  ].join('\n')
}

/** PROGMEM restart flags and the two-slot clock used while a transition renders both sides. */
export function entrySlotCpp(restart: readonly boolean[]): string {
  const flags = restart.map((on) => (on ? '1' : '0')).join(', ')
  return [
    '// Restart rebases the pattern clock from the frame it enters. Resume keeps',
    '// the show clock. Committing a transition copies the incoming slot so the',
    '// next frame is not a second entry.',
    `static const uint8_t patternRestart[] PROGMEM = { ${flags} };`,
    'struct EntrySlot { uint8_t index; uint32_t epoch; uint8_t gen; uint8_t seen; };',
    'static EntrySlot entrySlot[2] = { {255, 0, 0, 0}, {255, 0, 0, 0} };',
    'static void renderCollected(uint8_t slot, uint8_t index, uint32_t now, bool allowNew) {',
    '  EntrySlot& s = entrySlot[slot];',
    '  if (s.index != index) {',
    '    bool fresh = allowNew && s.index != index;',
    '    s.index = index;',
    '    if (fresh) { s.epoch = now; s.gen++; }',
    '  }',
    '  bool entry = s.seen != s.gen;',
    '  s.seen = s.gen;',
    '  bool restart = index < sizeof(patternRestart) && pgm_read_byte(&patternRestart[index]);',
    '  uint32_t ms = restart ? now - s.epoch : now;',
    '  renderPattern(index, ms, entry);',
    '}',
    'static void commitEntrySlot() { entrySlot[0] = entrySlot[1]; }',
  ].join('\n')
}
