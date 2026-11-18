// A small declarative checker for manifest JSON.
//
// A downloaded manifest is untrusted input: every value must have the shape
// the code that reads it assumes, and every number must be finite before it can
// reach preview maths or C++ text. Unknown keys are ignored rather than refused,
// so a later manifest that adds an optional field still loads in an older app.

export type FieldSpec =
  | { kind: 'number'; min?: number; max?: number; integer?: boolean }
  | { kind: 'string'; maxLength?: number; nonEmpty?: boolean }
  | { kind: 'boolean' }
  | { kind: 'literal'; values: readonly (string | number | boolean | null)[] }
  | { kind: 'array'; item: FieldSpec; minItems?: number; maxItems?: number }
  | { kind: 'tuple'; items: readonly FieldSpec[] }
  | { kind: 'object'; fields: Readonly<Record<string, FieldSpec>> }
  | { kind: 'record'; value: FieldSpec }
  | { kind: 'optional'; inner: FieldSpec }
  | { kind: 'nullable'; inner: FieldSpec }

/** Longest string any manifest field may hold; copy is short by design. */
export const MAX_STRING_LENGTH = 2000
/** Longest list any manifest field may hold. */
export const MAX_ARRAY_LENGTH = 512

export const num = (options: Omit<Extract<FieldSpec, { kind: 'number' }>, 'kind'> = {}): FieldSpec =>
  ({ kind: 'number', ...options })
export const int = (min = 0, max?: number): FieldSpec => ({ kind: 'number', integer: true, min, max })
export const str = (options: Omit<Extract<FieldSpec, { kind: 'string' }>, 'kind'> = {}): FieldSpec =>
  ({ kind: 'string', ...options })
export const bool = (): FieldSpec => ({ kind: 'boolean' })
export const oneOf = (...values: (string | number | boolean | null)[]): FieldSpec => ({ kind: 'literal', values })
export const arr = (item: FieldSpec, minItems?: number, maxItems?: number): FieldSpec =>
  ({ kind: 'array', item, minItems, maxItems })
export const tuple = (...items: FieldSpec[]): FieldSpec => ({ kind: 'tuple', items })
export const obj = (fields: Record<string, FieldSpec>): FieldSpec => ({ kind: 'object', fields })
export const record = (value: FieldSpec): FieldSpec => ({ kind: 'record', value })
export const opt = (inner: FieldSpec): FieldSpec => ({ kind: 'optional', inner })
export const nullable = (inner: FieldSpec): FieldSpec => ({ kind: 'nullable', inner })

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Every problem with `value` against `spec`, as `path: problem` lines.
 * Empty when it conforms.
 */
export function checkField(spec: FieldSpec, value: unknown, path: string): string[] {
  switch (spec.kind) {
    case 'optional':
      return value === undefined ? [] : checkField(spec.inner, value, path)
    case 'nullable':
      return value === null ? [] : checkField(spec.inner, value, path)
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return [`${path}: expected a finite number`]
      if (spec.integer && !Number.isInteger(value)) return [`${path}: expected a whole number`]
      if (spec.min !== undefined && value < spec.min) return [`${path}: must be at least ${spec.min}`]
      if (spec.max !== undefined && value > spec.max) return [`${path}: must be at most ${spec.max}`]
      return []
    }
    case 'string': {
      if (typeof value !== 'string') return [`${path}: expected text`]
      const limit = spec.maxLength ?? MAX_STRING_LENGTH
      if (value.length > limit) return [`${path}: longer than ${limit} characters`]
      if (spec.nonEmpty && value.trim() === '') return [`${path}: must not be empty`]
      return []
    }
    case 'boolean':
      return typeof value === 'boolean' ? [] : [`${path}: expected true or false`]
    case 'literal':
      return spec.values.includes(value as string | number | boolean | null)
        ? []
        : [`${path}: expected one of ${spec.values.map((v) => JSON.stringify(v)).join(', ')}`]
    case 'array': {
      if (!Array.isArray(value)) return [`${path}: expected a list`]
      const max = spec.maxItems ?? MAX_ARRAY_LENGTH
      if (value.length > max) return [`${path}: more than ${max} items`]
      if (spec.minItems !== undefined && value.length < spec.minItems) {
        return [`${path}: needs at least ${spec.minItems} item${spec.minItems === 1 ? '' : 's'}`]
      }
      return value.flatMap((item, index) => checkField(spec.item, item, `${path}[${index}]`))
    }
    case 'tuple': {
      if (!Array.isArray(value) || value.length !== spec.items.length) {
        return [`${path}: expected a list of ${spec.items.length}`]
      }
      return spec.items.flatMap((item, index) => checkField(item, value[index], `${path}[${index}]`))
    }
    case 'object': {
      if (!isPlainObject(value)) return [`${path}: expected an object`]
      return Object.entries(spec.fields).flatMap(([key, field]) => checkField(field, value[key], `${path}.${key}`))
    }
    case 'record': {
      if (!isPlainObject(value)) return [`${path}: expected an object`]
      const keys = Object.keys(value)
      if (keys.length > MAX_ARRAY_LENGTH) return [`${path}: more than ${MAX_ARRAY_LENGTH} entries`]
      return keys.flatMap((key) => checkField(spec.value, value[key], `${path}.${key}`))
    }
  }
}
