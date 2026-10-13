import { describe, expect, it } from 'vitest'
import { mathOperandIdentity, retargetMathOperands } from '../mathIdentity'
import { libraryDefaults } from '../../../state/nodeLibrary'

describe('Math operand identity', () => {
  it('gives a fresh Math node A and B rows at the add identity', () => {
    expect(libraryDefaults('Math')).toEqual({ mathOp: 'add', a: 0, b: 0 })
  })

  it('moves an operand still at the old identity to the new one', () => {
    expect(retargetMathOperands({ mathOp: 'add', a: 0, b: 0 }, { mathOp: 'multiply', a: 0, b: 0 }))
      .toEqual({ mathOp: 'multiply', a: 1, b: 1 })
    expect(retargetMathOperands({ mathOp: 'divide', a: 1, b: 1 }, { mathOp: 'max', a: 1, b: 1 }))
      .toEqual({ mathOp: 'max', a: 0, b: 0 })
  })

  it('keeps a value the user set, and leaves ops that share an identity alone', () => {
    expect(retargetMathOperands({ mathOp: 'add', a: 0, b: 0.5 }, { mathOp: 'multiply', a: 0, b: 0.5 }))
      .toEqual({ mathOp: 'multiply', a: 1, b: 0.5 })
    const next = { mathOp: 'subtract', a: 0, b: 0 }
    expect(retargetMathOperands({ mathOp: 'add', a: 0, b: 0 }, next)).toBe(next)
    expect(mathOperandIdentity('min')).toBe(0)
  })
})
