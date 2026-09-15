/*
 * A property input's field must hold the value its code already fell back to.
 *
 * `propertyInputs.test.ts` requires that a declared property input *has* a
 * `defaultProperties` entry, because a disconnected wire needs something to
 * fall back to. This is the half that was missing: the entry has to hold the
 * *same* number the evaluator and the generator name as their own literal
 * fallback.
 *
 * The hazard is silent and one-directional. Before a field exists,
 * `num(id, 'bass', props, 'bass', 0)` reads the literal `0` because
 * `props.bass` is undefined. The moment someone adds `bass: 0.5` to
 * `defaultProperties` — to satisfy the rule above — the field wins and every
 * existing graph using that node renders differently, with no test failing and
 * nothing in the diff that looks like a behaviour change. Adding a field is
 * supposed to be inert until someone moves the slider.
 *
 * So the literals are read out of the two files rather than restated here: the
 * evaluator's `num(id, 'port', props, 'key', LIT)` and the generator's
 * `f('port', 'key', LIT)` have the same shape and the same meaning, which is
 * also what lets this compare the two against each other. A fallback that is
 * an expression rather than a plain number is skipped and counted — a handful
 * are deliberately computed (SpectrumBars' demo animation, Image's transform
 * variables) and there is nothing to compare them to.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { NODE_LIBRARY } from '../nodeLibrary'

interface Fallback { node: string; port: string; key: string; literal: string }

/**
 * Every `case 'Type': {` block in one file, with the fallbacks it names.
 *
 * Split on the case label rather than brace-matched, which is enough because
 * the only thing read out is a call shape that cannot appear before the first
 * case or after the last.
 */
function fallbacks(file: string, call: RegExp): Fallback[] {
  const source = readFileSync(path.join(process.cwd(), 'src', file), 'utf8')
  const parts = source.split(/\n {6}case '([A-Za-z0-9_]+)': \{/)
  const found: Fallback[] = []
  const seen = new Set<string>()
  for (let index = 1; index < parts.length; index += 2) {
    const node = parts[index]
    for (const match of parts[index + 1].matchAll(call)) {
      const [, port, key, literal] = match
      const id = `${node}|${port}|${key}`
      if (seen.has(id)) continue
      seen.add(id)
      found.push({ node, port, key, literal: literal.trim() })
    }
  }
  return found
}

const EVALUATOR = fallbacks(
  'state/graphEvaluator.ts',
  /num\(\s*id,\s*'([A-Za-z0-9_]+)',\s*props,\s*'([A-Za-z0-9_]+)',\s*([^,)]+)\)/g,
)
const GENERATOR = fallbacks(
  'codegen/cppGenerator.ts',
  /\bf\(\s*'([A-Za-z0-9_]+)',\s*'([A-Za-z0-9_]+)',\s*([^,)]+)\)/g,
)

/** A plain number, or null for a computed fallback there is nothing to compare. */
function literalNumber(text: string): number | null {
  const value = Number(text.replace(/f$/, ''))
  return Number.isFinite(value) ? value : null
}

describe('property input fallbacks', () => {
  // A guard that reads nothing is a guard that passes for the wrong reason.
  it('finds the fallbacks it is supposed to be checking', () => {
    expect(EVALUATOR.length).toBeGreaterThan(200)
    expect(GENERATOR.length).toBeGreaterThan(200)
  })

  it('gives every declared property input the number its code falls back to', () => {
    const declared = new Map<string, unknown>()
    for (const definition of NODE_LIBRARY) {
      for (const key of Object.keys(definition.propertyInputs ?? {})) {
        declared.set(`${definition.type}|${key}`, definition.defaultProperties?.[key])
      }
    }

    const mismatches: string[] = []
    let compared = 0
    for (const entry of EVALUATOR) {
      const id = `${entry.node}|${entry.key}`
      if (!declared.has(id)) continue
      const literal = literalNumber(entry.literal)
      if (literal === null) continue
      const field = declared.get(id)
      if (typeof field !== 'number') continue
      compared += 1
      if (field !== literal) {
        mismatches.push(`${entry.node}.${entry.key}: field ${field}, evaluator falls back to ${literal}`)
      }
    }

    expect(compared, 'nothing was compared — the parse has stopped matching').toBeGreaterThan(50)
    expect(mismatches).toEqual([])
  })

  /*
   * And the two sides agree with each other.
   *
   * The same relationship one step earlier: a field can only be "the value the
   * code falls back to" if both halves of the code fall back to one value. A
   * divergence here is a preview/firmware parity break in its own right,
   * whether or not the property is exposed as an input.
   */
  it('keeps the evaluator and the generator on one literal', () => {
    const byId = new Map(GENERATOR.map((entry) => [`${entry.node}|${entry.port}|${entry.key}`, entry]))
    const mismatches: string[] = []
    let compared = 0
    for (const entry of EVALUATOR) {
      const other = byId.get(`${entry.node}|${entry.port}|${entry.key}`)
      if (!other) continue
      const mine = literalNumber(entry.literal)
      const theirs = literalNumber(other.literal)
      if (mine === null || theirs === null) continue
      compared += 1
      if (mine !== theirs) {
        mismatches.push(`${entry.node}.${entry.port}: evaluator ${mine}, generator ${theirs}`)
      }
    }
    expect(compared, 'nothing was compared — the parse has stopped matching').toBeGreaterThan(100)
    expect(mismatches).toEqual([])
  })
})
