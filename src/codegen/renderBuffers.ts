// The declaration of one render buffer, `CRGB buf_<id>[NUM_LEDS];` or
// `float field_<id>[NUM_LEDS];`, and the one fact about it a consumer of the
// finished text needs: whether it carries pixels between frames.
//
// The show generator receives each collected pattern as finished sketch text,
// so the mark travels in the declaration itself rather than beside it. A
// persistent buffer stays the pattern's own; the rest are pooled.

import type { BufferUse } from './emitContext'

const PERSISTS_MARK = '// keeps its pixels between frames'

/**
 * Node types whose frame buffer persists in at least one variant: the ones
 * codegen never lets render straight into `leds`. Whether a given node does is
 * decided by its emitter from properties and wiring; a RAM estimate that only
 * needs a safe bound reads this instead, and counts one frame too many when the
 * variant turns out not to persist. persistentRenderBuffers.test.ts derives the
 * list from every node variant, so it cannot drift.
 */
export const PERSISTENT_FRAME_NODE_TYPES: ReadonlySet<string> = new Set([
  'Code', 'ColorTrails', 'Confetti', 'DdpInput', 'FormulaPoints', 'Juggle', 'Ripple',
  'SDVideo', 'SpectrumVisualizer', 'Trails', 'TrebleSparks',
])

export type RenderBufferType = 'CRGB' | 'float'

export function bufferDeclCpp(type: RenderBufferType, name: string, persistent: ReadonlySet<string>): string {
  const decl = `${type} ${name}[NUM_LEDS];`
  return persistent.has(name) ? `${decl}   ${PERSISTS_MARK}` : decl
}

export interface RenderBufferDecl extends Required<BufferUse> {
  type: RenderBufferType
  name: string
}

/** A render-buffer declaration line, or null for any other line. */
export function parseBufferDecl(line: string): RenderBufferDecl | null {
  const m = line.match(/^(CRGB|float) ([A-Za-z_][A-Za-z0-9_]*)\[NUM_LEDS\];(?:\s+(\/\/.*))?$/)
  if (!m) return null
  return { type: m[1] as RenderBufferType, name: m[2], persists: m[3] === PERSISTS_MARK }
}

export function isPersistentBufferDecl(line: string): boolean {
  return parseBufferDecl(line)?.persists === true
}

const SHARES_MARK = '// shares its storage'
const LEDS_MARK = '// renders straight into the output buffer'

/**
 * A scratch buffer that uses another's storage, or `leds`. A PSRAM buffer is a
 * pointer assigned in setup(), so its alias is a reference to that pointer
 * rather than a copy of its value at static initialisation.
 */
export function bufferAliasCpp(type: RenderBufferType, name: string, target: string, psram: boolean): string {
  if (target === 'leds') return `CRGB* const ${name} = leds;   ${LEDS_MARK}`
  return `${type}*${psram ? '&' : ' const'} ${name} = ${target};   ${SHARES_MARK}`
}

/** A buffer alias line, or null for any other line. */
export function parseBufferAlias(line: string): { type: RenderBufferType; name: string; target: string } | null {
  const m = line.match(/^(CRGB|float)\*(?: const|&) ([A-Za-z_][A-Za-z0-9_]*) = ([A-Za-z_][A-Za-z0-9_]*);/)
  return m ? { type: m[1] as RenderBufferType, name: m[2], target: m[3] } : null
}
