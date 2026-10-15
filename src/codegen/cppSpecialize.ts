import { cppCode } from './cppReachability'
import { selectedPhysicalBoardProfile } from '../build/boards/boardProfiles'
import type { StudioNode } from '../state/graphStore'

export function boardCppFacts(nodes: readonly StudioNode[]): Record<string, boolean> {
  const families = selectedPhysicalBoardProfile(nodes)?.targetFamilies
  if (!families?.length || families.length !== 1) return {}
  const family = families[0]
  return {
    ESP32: family.startsWith('esp32'), ESP8266: family === 'esp8266',
    CONFIG_IDF_TARGET_ESP32S3: family === 'esp32-s3',
  }
}

type Truth = boolean | undefined
/** Resolve only facts supplied by generation. Unknown library/platform macros
 * remain conditional; in particular, IDF and Arduino library versions are not
 * inferred from the board family. */
export function specializeCpp(source: string, facts: Record<string, boolean> = {}): string {
  const known = new Map(Object.entries(facts))
  const truth = (expression: string): Truth => {
    const text = expression.replace(/\/\/[^]*$/, '').trim()
    if (text.startsWith('(') && text.endsWith(')')) {
      let depth = 0
      let outer = true
      for (let i = 0; i < text.length - 1; i++) {
        if (text[i] === '(') depth++
        if (text[i] === ')') depth--
        if (!depth) { outer = false; break }
      }
      if (outer) return truth(text.slice(1, -1))
    }
    for (const operator of ['||', '&&']) {
      let depth = 0
      for (let i = 0; i < text.length; i++) {
        if (text[i] === '(') depth++
        if (text[i] === ')') depth--
        if (!depth && text.slice(i, i + 2) === operator) {
          const left = truth(text.slice(0, i)), right = truth(text.slice(i + 2))
          return operator === '&&'
            ? left === false || right === false ? false : left === true && right === true ? true : undefined
            : left === true || right === true ? true : left === false && right === false ? false : undefined
        }
      }
    }
    if (text.startsWith('!')) { const value = truth(text.slice(1)); return value === undefined ? undefined : !value }
    if (/^\d+$/.test(text)) return Number(text) !== 0
    const defined = text.match(/^defined\s*(?:\(\s*(\w+)\s*\)|(\w+))$/)
    return known.get(defined ? defined[1] ?? defined[2] : text)
  }
  const lines = source.split('\n')
  const process = (start: number, end: number): string[] => {
    const out: string[] = []
    for (let i = start; i < end; i++) {
      const line = lines[i]
      const define = line.match(/^\s*#define\s+(\w+)(?:\s+([01]))?\s*$/)
      if (define) known.set(define[1], define[2] !== '0')
      const open = line.match(/^\s*#(if|ifdef|ifndef)\s+(.+)$/)
      if (!open) { out.push(line); continue }
      const condition = open[1] === 'if' ? open[2] : `${open[1] === 'ifndef' ? '!' : ''}defined(${open[2].trim()})`
      const arms = [{ line: i, condition }]
      let depth = 1, close = i + 1
      for (; close < end; close++) {
        if (/^\s*#if(?:def|ndef)?\b/.test(lines[close])) depth++
        if (/^\s*#endif\b/.test(lines[close])) depth--
        if (!depth) break
        const branch = depth === 1 && lines[close].match(/^\s*#(elif|else)\b\s*(.*)$/)
        if (branch) arms.push({ line: close, condition: branch[1] === 'else' ? '1' : branch[2] })
      }
      if (close === end) { out.push(line); continue }
      let chosen = -1, uncertain = false
      for (let n = 0; n < arms.length; n++) {
        const value = truth(arms[n].condition)
        if (value === undefined) { uncertain = true; break }
        if (value) { chosen = n; break }
      }
      if (uncertain) {
        const saved = new Map(known)
        for (let n = 0; n < arms.length; n++) {
          known.clear(); for (const [name, value] of saved) known.set(name, value)
          out.push(lines[arms[n].line], ...process(arms[n].line + 1, arms[n + 1]?.line ?? close))
        }
        known.clear(); for (const [name, value] of saved) known.set(name, value)
        out.push(lines[close])
      } else if (chosen >= 0) out.push(...process(arms[chosen].line + 1, arms[chosen + 1]?.line ?? close))
      i = close
    }
    return out
  }
  return process(0, lines.length).join('\n')
}

/** A known switch input needs only its selected arm. Keep its lexical block,
 * and remove only the arm's terminating break, never nested loop breaks. */
export function specializeSwitch(source: string, expression: string, value: number): string {
  const code = cppCode(source)
  const escaped = expression.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`\\bswitch\\s*\\(\\s*${escaped}\\s*\\)\\s*\\{`, 'g')
  const edits: { start: number; end: number; body: string }[] = []
  for (const match of code.matchAll(pattern)) {
    const start = match.index!, bodyStart = start + match[0].length
    let depth = 1, end = bodyStart
    const arms: { start: number; body: number; value: number | null }[] = []
    for (; end < code.length && depth; end++) {
      if (depth === 1) {
        const arm = code.slice(end).match(/^(?:case\s+(-?\d+)|default)\s*:/)
        if (arm) arms.push({ start: end, body: end + arm[0].length, value: arm[1] === undefined ? null : Number(arm[1]) })
      }
      if (code[end] === '{') depth++
      if (code[end] === '}') depth--
    }
    const selected = arms.findIndex((arm) => arm.value === value)
    const index = selected >= 0 ? selected : arms.findIndex((arm) => arm.value === null)
    if (index < 0) continue
    const arm = arms[index]
    let body = source.slice(arm.body, arms[index + 1]?.start ?? end - 1)
    body = body.replace(/\bbreak;(?=\s*(?:}\s*)?$)/, '')
    edits.push({ start, end, body: `{${body}}` })
  }
  for (const edit of edits.reverse()) source = source.slice(0, edit.start) + edit.body + source.slice(edit.end)
  return source
}
