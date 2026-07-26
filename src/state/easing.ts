/**
 * Persisted Ease-node variants. Existing ids must keep their established
 * preview and firmware behaviour so saved public-beta projects do not change.
 */
export const EASE_TYPES = [
  'inOutCubic',
  'inOutQuad',
  'linear',
  'inOutApprox',
  'inQuad',
  'outQuad',
  'inCubic',
  'outCubic',
  'inSine',
  'outSine',
  'inOutSine',
  'triwave',
  'quadwave',
  'cubicwave',
] as const

export type EaseType = typeof EASE_TYPES[number]

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x))
}

function easeInOutQuad(x: number): number {
  return x < 0.5 ? 2 * x * x : 1 - 2 * (1 - x) * (1 - x)
}

function easeInOutCubic(x: number): number {
  return x * x * (3 - 2 * x)
}

function triwave(x: number): number {
  const h = ((x % 1) + 1) % 1
  return h < 0.5 ? 2 * h : 2 * (1 - h)
}

function inputByte(x: number): number {
  // Matches `(uint8_t)(constrain(x, 0, 1) * 255)` in generated firmware.
  return Math.floor(clamp01(x) * 255)
}

function byteResult(i: number, curve: (x: number) => number): number {
  return Math.max(0, Math.min(255, Math.round(curve(i / 255) * 255))) / 255
}

/** Exact TypeScript mirror of FastLED's legacy `ease8InOutApprox`. */
function easeInOutApprox8(i: number): number {
  if (i < 64) return Math.floor(i / 2)
  if (i > 191) return 255 - Math.floor((255 - i) / 2)
  const middle = i - 64
  return middle + Math.floor(middle / 2) + 32
}

/**
 * Apply an Ease-node curve to a normalized input.
 *
 * The five original variants retain their continuous preview implementation.
 * New FastLED variants use the same byte-domain input/output convention as
 * their generated C++ calls. Unknown persisted values keep the historical
 * cubic fallback.
 */
export function applyEase(type: string, x: number): number {
  const t = clamp01(x)
  switch (type) {
    // Existing modes — preserve preview behaviour for saved projects.
    case 'inOutQuad': return easeInOutQuad(t)
    case 'triwave': return triwave(t)
    case 'quadwave': return easeInOutQuad(triwave(t))
    case 'cubicwave': return easeInOutCubic(triwave(t))

    // New modes — mirror FastLED's 8-bit input/output contract.
    case 'linear': return inputByte(t) / 255
    case 'inOutApprox': return easeInOutApprox8(inputByte(t)) / 255
    case 'inQuad': {
      const i = inputByte(t)
      // FastLED's default fixed scale8(i, i): (i * (i + 1)) >> 8.
      return Math.floor((i * (i + 1)) / 256) / 255
    }
    case 'outQuad': return byteResult(inputByte(t), (v) => 1 - (1 - v) * (1 - v))
    case 'inCubic': return byteResult(inputByte(t), (v) => v * v * v)
    case 'outCubic': return byteResult(inputByte(t), (v) => 1 - (1 - v) ** 3)
    case 'inSine': return byteResult(inputByte(t), (v) => 1 - Math.cos((v * Math.PI) / 2))
    case 'outSine': return byteResult(inputByte(t), (v) => Math.sin((v * Math.PI) / 2))
    case 'inOutSine': return byteResult(inputByte(t), (v) => (1 - Math.cos(v * Math.PI)) / 2)
    case 'inOutCubic':
    default:
      return easeInOutCubic(t)
  }
}
