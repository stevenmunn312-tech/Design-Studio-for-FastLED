export const SLICE_PRESET_NAMES = [
  'solid', 'checker', 'pinwheel', 'blossom', 'star', 'lattice',
  'shards', 'rings', 'braid', 'snowflake', 'hourglass', 'paper',
] as const

export type SlicePresetName = typeof SLICE_PRESET_NAMES[number]

export interface SlicePattern {
  bits: Uint8Array
  bitsB: Uint8Array
  hex: string
  hexB: string
}

export type SliceMatrix = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
]

const childVertices = (split: number) => {
  const p01 = [1 - split, split, 0]
  const p02 = [1 - split, 0, split]
  const p12 = [0, 0.5, 0.5]
  return [
    [[1, 0, 0], p01, p02],
    [p01, [0, 1, 0], p12],
    [p02, p12, [0, 0, 1]],
    [p01, p12, p02],
  ] as number[][][]
}

function inverse3(columns: number[][]): SliceMatrix {
  const a = columns[0][0], b = columns[1][0], c = columns[2][0]
  const d = columns[0][1], e = columns[1][1], f = columns[2][1]
  const g = columns[0][2], h = columns[1][2], i = columns[2][2]
  const A = e * i - f * h, B = c * h - b * i, C = b * f - c * e
  const D = f * g - d * i, E = a * i - c * g, F = c * d - a * f
  const G = d * h - e * g, H = b * g - a * h, I = a * e - b * d
  const inv = 1 / (a * A + b * D + c * G)
  return [A * inv, B * inv, C * inv, D * inv, E * inv, F * inv, G * inv, H * inv, I * inv]
}

/** Four parent-barycentric → child-barycentric transforms for one level. */
export function buildSliceChildMatrices(warp: number): readonly SliceMatrix[] {
  const split = Math.max(0.2, Math.min(0.8, 0.5 + 0.3 * warp))
  return childVertices(split).map(inverse3)
}

function applyMatrix(matrix: SliceMatrix, lambda: readonly number[]): [number, number, number] {
  return [
    matrix[0] * lambda[0] + matrix[1] * lambda[1] + matrix[2] * lambda[2],
    matrix[3] * lambda[0] + matrix[4] * lambda[1] + matrix[5] * lambda[2],
    matrix[6] * lambda[0] + matrix[7] * lambda[1] + matrix[8] * lambda[2],
  ]
}

/** Walk one recursively quartered fan triangle and return its leaf and edge distance. */
export function walkSliceLeaf(
  lambda: readonly [number, number, number],
  depth: number,
  matrices: readonly SliceMatrix[],
): { leaf: number; lambda: [number, number, number] } {
  let current: [number, number, number] = [...lambda]
  let leaf = 0
  const levels = Math.max(1, Math.min(3, Math.round(depth)))
  for (let level = 0; level < levels; level++) {
    let child = 3
    let next = applyMatrix(matrices[3], current)
    for (let candidate = 0; candidate < 3; candidate++) {
      const mapped = applyMatrix(matrices[candidate], current)
      if (mapped[0] >= -1e-7 && mapped[1] >= -1e-7 && mapped[2] >= -1e-7) {
        child = candidate
        next = mapped
        break
      }
    }
    leaf = leaf * 4 + child
    current = next
  }
  return { leaf, lambda: current }
}

export function sliceBit(bytes: Uint8Array, leaf: number): number {
  return (bytes[leaf >> 3] >> (leaf & 7)) & 1
}

function solidBytes(bitCount: number): Uint8Array {
  const bytes = new Uint8Array(Math.ceil(bitCount / 8)).fill(0xff)
  const spare = bytes.length * 8 - bitCount
  if (spare > 0) bytes[bytes.length - 1] &= 0xff >> spare
  return bytes
}

/** Parse exactly 4^depth hexadecimal bits, leaf zero in the low bit. */
export function parseSliceBits(text: unknown, depth: number): Uint8Array | null {
  const bitCount = 4 ** Math.max(1, Math.min(3, Math.round(depth)))
  const digits = Math.ceil(bitCount / 4)
  const raw = String(text ?? '').trim().replace(/^0x/i, '')
  if (raw.length !== digits || !/^[0-9a-f]+$/i.test(raw)) return null
  const bytes = new Uint8Array(Math.ceil(bitCount / 8))
  for (let nibble = 0; nibble < raw.length; nibble++) {
    const value = Number.parseInt(raw[raw.length - 1 - nibble], 16)
    const bit = nibble * 4
    bytes[bit >> 3] |= value << (bit & 7)
  }
  return bytes
}

function patternHex(depth: number, predicate: (digits: readonly number[]) => boolean): string {
  const bitCount = 4 ** depth
  const bytes = new Uint8Array(Math.ceil(bitCount / 8))
  for (let leaf = 0; leaf < bitCount; leaf++) {
    let value = leaf
    const digits: number[] = []
    for (let level = 0; level < depth; level++) {
      digits.unshift(value % 4)
      value = Math.floor(value / 4)
    }
    if (predicate(digits)) bytes[leaf >> 3] |= 1 << (leaf & 7)
  }
  const hex = [...bytes].reverse().map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return hex.slice(-Math.ceil(bitCount / 4))
}

const selectors: Record<SlicePresetName, readonly [(d: readonly number[]) => boolean, (d: readonly number[]) => boolean]> = {
  solid: [() => true, () => true],
  checker: [(d) => d.reduce((a, b) => a + b, 0) % 2 === 0, (d) => d.reduce((a, b) => a + b, 0) % 2 !== 0],
  pinwheel: [(d) => d[d.length - 1] === 0 || d[d.length - 1] === 3, (d) => d[d.length - 1] <= 1],
  blossom: [(d) => !d.includes(3), (d) => !d.includes(0)],
  star: [(d) => d.every((v, i) => v === 0 || i === d.length - 1), (d) => d.every((v, i) => v === 3 || i === d.length - 1)],
  lattice: [(d) => d.some((v) => v === 3), (d) => d.some((v) => v === 0)],
  shards: [(d) => d[0] === 1 || d[d.length - 1] === 2, (d) => d[0] === 2 || d[d.length - 1] === 1],
  rings: [(d) => d.filter((v) => v === 3).length % 2 === 0, (d) => d.filter((v) => v === 3).length % 2 !== 0],
  braid: [(d) => d.every((v, i) => (v + i) % 3 !== 0), (d) => d.every((v, i) => (v + i) % 3 !== 1)],
  snowflake: [(d) => d.reduce((a, b) => a ^ b, 0) === 0, (d) => d.reduce((a, b) => a ^ b, 0) === 3],
  hourglass: [(d) => d.every((v) => v === 0 || v === 3), (d) => d.every((v) => v === 1 || v === 2)],
  paper: [(d) => d.reduce((a, b, i) => a + (i + 1) * b, 0) % 4 < 2, (d) => d.reduce((a, b, i) => a + (i + 1) * b, 0) % 4 >= 2],
}

export const SLICE_TILING_PRESETS = SLICE_PRESET_NAMES.reduce((presets, name) => {
  presets[name] = Object.fromEntries([1, 2, 3].map((depth) => [
    depth,
    [patternHex(depth, selectors[name][0]), patternHex(depth, selectors[name][1])],
  ]))
  return presets
}, {} as Record<SlicePresetName, Record<number, readonly [string, string]>>)

export function resolveSlicePattern(
  preset: unknown,
  depth: number,
  customBits: unknown,
  customBitsB: unknown,
): SlicePattern {
  const d = Math.max(1, Math.min(3, Math.round(depth)))
  let hex: string, hexB: string
  if (preset === 'custom') {
    hex = String(customBits ?? '')
    hexB = String(customBitsB ?? '')
  } else {
    const name = SLICE_PRESET_NAMES.includes(preset as SlicePresetName) ? preset as SlicePresetName : 'pinwheel'
    ;[hex, hexB] = SLICE_TILING_PRESETS[name][d]
  }
  const bitCount = 4 ** d
  const bits = parseSliceBits(hex, d) ?? solidBytes(bitCount)
  const bitsB = parseSliceBits(hexB, d) ?? solidBytes(bitCount)
  return { bits, bitsB, hex, hexB }
}
