import { describe, it, expect } from 'vitest'
import { MATH_EVALUATORS } from '../evaluate'
import { scalarControlCpp } from '../../../codegen/scalarControlCpp'
import { compileCppSnippet } from '../../../test-utils/cppSnippet'
import type { EvalContext } from '../../../state/evaluator/types'
import type { StudioNode } from '../../../state/graphStore'

/** One stateless scalar node, preview and firmware, at the same inputs. */
function both(type: string, props: Record<string, unknown>, inputs: Record<string, number>, port = 'result') {
  const ports = Object.keys(inputs)
  const lines = scalarControlCpp(type, 'n', props, (p) => (ports.includes(p) ? `in_${p}` : '0'))!.loop
  const step = compileCppSnippet(lines, ports.map((p) => `in_${p}`), [`n_n_${port}`])
  const firmware = step(0, Object.fromEntries(ports.map((p) => [`in_${p}`, inputs[p]])))[`n_n_${port}`]
  const ctx = { num: (_id: string, key: string, p: Record<string, unknown>, prop: string, fallback: number) => inputs[key] ?? Number(p[prop] ?? fallback) }
  const preview = MATH_EVALUATORS[type]!(ctx as unknown as EvalContext, 'n', props, {} as StudioNode, type)[port]
  return { preview, firmware }
}

describe('stateless math nodes, preview against firmware', () => {
  it.each([
    [0.5, 0, 1], [3, 0, 1], [-2, 0, 1],
    // min above max: the preview answers min whatever the value.
    [0.2, 0.8, 0.3], [0.5, 0.8, 0.3], [0.9, 0.8, 0.3],
  ])('Clamp %f into [%f, %f]', (value, min, max) => {
    const { preview, firmware } = both('Clamp', {}, { value, min, max })
    expect(firmware).toBe(preview)
  })

  it.each([-2.5, -1.5, -0.5, 0.5, 2.5, -2.4, 2.6])('Function round(%f)', (x) => {
    const { preview, firmware } = both('Function', { fn: 'round' }, { x })
    // Math.round(-0.5) is -0; a float on the board has no use for the sign.
    expect(firmware === preview).toBe(true)
  })
})
