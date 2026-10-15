// Scratch render buffers that are never live at the same time share storage.
//
// A scratch buffer is written whole before anything reads it each frame
// (persistentRenderBuffers.test.ts holds every node to that), so its value
// matters only from its first reference in the loop to its last. Two buffers
// whose spans do not meet can use one array. A node that seeds its buffer
// with a full copy of its source, where nothing reads the source afterwards,
// can work on the source's array in place, and the copy goes.
//
// Spans are measured in top-level statements, not lines: a loop written over
// several lines runs each of them many times, so a buffer read on its first
// line is still live when a later line writes.

import type { RenderBufferType } from './renderBuffers'

export interface ScratchSharing {
  /** Scratch buffer → the buffer whose storage it uses, or `leds`. */
  aliases: Map<string, string>
  /** The loop with every copy made redundant by sharing removed. */
  loop: string[]
}

interface Span { name: string; type: RenderBufferType; first: number; last: number }
interface Seed { from: string; to: string; line: number; text: string }

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Code only: no comments, and string and character literals emptied. */
function codeOf(lines: readonly string[]): string[] {
  let inComment = false
  return lines.map((line) => {
    let out = ''
    for (let i = 0; i < line.length; i++) {
      if (inComment) {
        if (line.startsWith('*/', i)) { inComment = false; i++ }
        continue
      }
      if (line.startsWith('/*', i)) { inComment = true; i++; continue }
      if (line.startsWith('//', i)) break
      const quote = line[i]
      if (quote === '"' || quote === '\'') {
        let j = i + 1
        while (j < line.length && line[j] !== quote) j += line[j] === '\\' ? 2 : 1
        out += `${quote}${quote}`
        i = j
        continue
      }
      out += line[i]
    }
    return out
  })
}

/**
 * The top-level statement each line belongs to, or null when the braces do
 * not balance. A statement ends at depth zero on `;` or `}`, unless the next
 * line continues it (`else`, or the `while` of a `do`).
 */
function statementOf(code: readonly string[]): number[] | null {
  const out: number[] = []
  let depth = 0, statement = 0
  for (let i = 0; i < code.length; i++) {
    out.push(statement)
    for (const ch of code[i]) {
      if (ch === '{') depth++
      else if (ch === '}' && --depth < 0) return null
    }
    const end = code[i].trimEnd()
    if (depth > 0 || !/[;}]$/.test(end)) continue
    const next = code.slice(i + 1).find((line) => line.trim() !== '')?.trim() ?? ''
    if (!/^(?:else|while)\b/.test(next)) statement++
  }
  return depth === 0 ? out : null
}

/**
 * `scratch` holds the buffers that may share, by name: declared, not
 * persistent, and referenced nowhere but the loop. `ledsAlias` is the buffer
 * already rendering into `leds`, if any; a chain seeding it joins it there,
 * unless something else touches `leds` while the chain is live.
 */
export function shareScratchBuffers(
  loop: readonly string[],
  scratch: ReadonlyMap<string, RenderBufferType>,
  ledsAlias: string | null,
): ScratchSharing {
  const unchanged = { aliases: new Map(ledsAlias ? [[ledsAlias, 'leds']] : []), loop: [...loop] }
  const code = codeOf(loop)
  const statements = statementOf(code)
  if (!statements) return unchanged

  const spanOf = (name: string): { first: number; last: number } | null => {
    const re = new RegExp(`\\b${escape(name)}\\b`)
    let first = -1, last = -1
    code.forEach((line, i) => { if (re.test(line)) { if (first < 0) first = statements[i]; last = statements[i] } })
    return first < 0 ? null : { first, last }
  }
  const spans = new Map<string, Span>()
  for (const [name, type] of scratch) {
    const span = spanOf(name)
    if (span) spans.set(name, { name, type, ...span })
  }

  // Seeds that can run in place: the source's last statement is the
  // destination's first, and in it the source appears only in the copy.
  const seeds: Seed[] = []
  for (const to of spans.values()) {
    const size = to.type === 'CRGB' ? 'sizeof\\(CRGB\\) \\* NUM_LEDS' : 'sizeof\\(float\\) \\* NUM_LEDS'
    const call = to.type === 'CRGB' ? '::memmove' : 'memcpy'
    const re = new RegExp(`${escape(call)}\\(${escape(to.name)}, ([A-Za-z_][A-Za-z0-9_]*), ${size}\\);`, 'g')
    const found: Seed[] = []
    loop.forEach((line, i) => {
      if (statements[i] !== to.first) return
      for (const m of line.matchAll(re)) found.push({ from: m[1], to: to.name, line: i, text: m[0] })
    })
    if (found.length !== 1) continue
    const from = spans.get(found[0].from)
    if (!from || from.type !== to.type || from.last !== to.first || from.first >= to.first) continue
    const re2 = new RegExp(`\\b${escape(from.name)}\\b`, 'g')
    const uses = code.reduce((n, line, i) => n + (statements[i] === to.first ? (line.match(re2) ?? []).length : 0), 0)
    if (uses === 1) seeds.push(found[0])
  }

  // Chains: each seed joins its source and destination into one group.
  const group = new Map<string, string>()
  const root = (name: string): string => {
    const up = group.get(name)
    if (!up || up === name) return name
    const top = root(up)
    group.set(name, top)
    return top
  }
  const kept = new Set<Seed>()
  // Walk the chain into `leds` from the terminal back, and stop it where
  // something else references `leds` while the chain would hold it.
  const ledsBusy = (from: number, to: number) => code.some((line, i) =>
    statements[i] >= from && statements[i] < to && /\bleds\b/.test(line))
  const ledsChain = new Set<string>(ledsAlias && spans.has(ledsAlias) ? [ledsAlias] : [])
  for (let grew = true; grew;) {
    grew = false
    for (const seed of seeds) {
      if (!ledsChain.has(seed.to) || ledsChain.has(seed.from)) continue
      if (ledsBusy(spans.get(seed.from)!.first, spans.get(seed.to)!.first)) continue
      ledsChain.add(seed.from)
      kept.add(seed)
      grew = true
    }
  }
  for (const seed of seeds) {
    if (ledsChain.has(seed.to) || ledsChain.has(seed.from)) continue
    group.set(root(seed.from), root(seed.to))
    kept.add(seed)
  }

  // Everything outside the `leds` chain takes the first slot of its type
  // free by the time its group starts.
  const groups = new Map<string, Span[]>()
  for (const span of spans.values()) {
    if (ledsChain.has(span.name)) continue
    const key = root(span.name)
    groups.set(key, [...(groups.get(key) ?? []), span])
  }
  const ordered = [...groups.values()]
    .map((members) => members.sort((a, b) => a.first - b.first))
    .sort((a, b) => a[0].first - b[0].first)
  const slots: { type: RenderBufferType; head: string; last: number }[] = []
  const aliases = new Map<string, string>()
  for (const name of ledsChain) aliases.set(name, 'leds')
  if (ledsAlias) aliases.set(ledsAlias, 'leds')
  for (const members of ordered) {
    const { type, first } = members[0]
    const last = Math.max(...members.map((m) => m.last))
    let slot = slots.find((s) => s.type === type && s.last < first)
    if (!slot) slots.push(slot = { type, head: members[0].name, last })
    slot.last = last
    for (const m of members) if (m.name !== slot.head) aliases.set(m.name, slot.head)
  }

  const out = [...loop]
  for (const seed of kept) out[seed.line] = out[seed.line].replace(new RegExp(`${escape(seed.text)} ?`), '')
  return { aliases, loop: out.filter((line, i) => line === loop[i] || line.trim() !== '') }
}
