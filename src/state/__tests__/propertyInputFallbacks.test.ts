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

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { NODE_LIBRARY } from '../nodeLibrary'

interface Fallback { node: string; port: string; key: string; literal: string }

/**
 * Every node handler of one kind (`evaluate` or `codegen`), as
 * `[nodeType, body]`, read from the category modules in `src/nodes/`.
 *
 * A handler is a method of its category's table, split on the method name
 * rather than brace-matched: the table closes each file, and nothing but a
 * method starts a line two spaces in with `Name(`. Types that share a body are
 * listed as `Type: sharedHandler,` and resolve to that arrow's text.
 */
function handlerBodies(kind: 'evaluate' | 'codegen'): [string, string][] {
  const dir = path.join(process.cwd(), 'src', 'nodes')
  const bodies: [string, string][] = []
  for (const category of readdirSync(dir)) {
    const file = path.join(dir, category, `${kind}.ts`)
    if (!existsSync(file)) continue
    const source = readFileSync(file, 'utf8')
    const shared = new Map([...source.matchAll(/^const (\w+): Node\w+ = \([\s\S]*?\n\}\n/gm)].map((m) => [m[1], m[0]]))
    const table = source.slice(source.search(/^export const \w+: Node\w+s = \{$/m))
    for (const [, node, handler] of table.matchAll(/^ {2}(\w+): (\w+),$/gm)) bodies.push([node, shared.get(handler) ?? ''])
    const parts = table.split(/\n {2}(\w+)\(/)
    for (let index = 1; index < parts.length; index += 2) bodies.push([parts[index], parts[index + 1]])
  }
  return bodies
}

/** The fallbacks every handler names, first mention of each port/key winning. */
function fallbacks(bodies: [string, string][], call: RegExp, extra?: (body: string) => Omit<Fallback, 'node'>[]): Fallback[] {
  const found: Fallback[] = []
  const seen = new Set<string>()
  for (const [node, body] of bodies) {
    const here = [...body.matchAll(call)].map(([, port, key, literal]) => ({ port, key, literal: literal.trim() }))
    for (const one of [...here, ...(extra?.(body) ?? [])]) {
      const id = `${node}|${one.port}|${one.key}`
      if (seen.has(id)) continue
      seen.add(id)
      found.push({ node, ...one })
    }
  }
  return found
}

/*
 * The generator resolves a colour triple through one `channelColor` call
 * rather than three `f()` calls, so its three literals sit outside the parse
 * above — and an unparsed literal is not a passing comparison, it is no
 * comparison, which is the one failure this file exists to prevent. Expanded
 * here so the triples are held to the same agreement as every other knob.
 */
const CHANNEL_COLOR = /channelColor\('[A-Za-z0-9_]+',\s*(\d+),\s*(\d+),\s*(\d+)\)/g
function channelFallbacks(body: string): Omit<Fallback, 'node'>[] {
  const found: Omit<Fallback, 'node'>[] = []
  for (const match of body.matchAll(CHANNEL_COLOR)) {
    ;(['r', 'g', 'b'] as const).forEach((key, index) => {
      found.push({ port: key, key, literal: match[index + 1] })
    })
  }
  return found
}

const EVALUATOR = fallbacks(
  handlerBodies('evaluate'),
  /num\(\s*id,\s*'([A-Za-z0-9_]+)',\s*props,\s*'([A-Za-z0-9_]+)',\s*([^,)]+)\)/g,
)
const GENERATOR = fallbacks(
  handlerBodies('codegen'),
  /\bf\(\s*'([A-Za-z0-9_]+)',\s*'([A-Za-z0-9_]+)',\s*([^,)]+)\)/g,
  channelFallbacks,
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

/*
 * A palette socket and a palette field are one control, everywhere.
 *
 * `paletteExpr` (generator) and `pal` (evaluator) both resolve a `paletteIn`
 * port wire-first and fall back to the node's own `palette` field, on every
 * node that has the pair. That is the property-input contract already, so the
 * declaration is the only thing that can be missing — and four nodes were
 * missing it, which showed up as a palette socket that could not be hidden
 * while the identical socket on the node beside it could.
 *
 * Derived over the catalogue rather than listed, so the next node to grow a
 * palette input joins the rule instead of quietly sitting outside it. Only the
 * categories whose palette is a *tuning* parameter are covered: a Palette
 * Sampler's input is the substance it operates on, and step 1 settled that
 * colour and field nodes keep every input visible.
 */
describe('palette inputs', () => {
  const TUNING_CATEGORIES = new Set(['pattern', 'show', 'output'])

  it('declares the pairing wherever the port and the field both exist', () => {
    const missing: string[] = []
    let checked = 0
    for (const definition of NODE_LIBRARY) {
      if (!TUNING_CATEGORIES.has(definition.category)) continue
      if (!definition.inputs.some((port) => port.id === 'paletteIn')) continue
      if (!Object.prototype.hasOwnProperty.call(definition.defaultProperties ?? {}, 'palette')) continue
      checked += 1
      if (definition.propertyInputs?.palette !== 'paletteIn') missing.push(definition.type)
    }
    expect(checked, 'nothing was checked — the catalogue query has stopped matching').toBeGreaterThan(20)
    expect(missing).toEqual([])
  })
})
