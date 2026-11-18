// Base64url (RFC 4648 section 5, unpadded) without Buffer or atob, so it runs
// the same in the browser, WebView2 and Node.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const LOOKUP: Record<string, number> = {}
for (let i = 0; i < ALPHABET.length; i += 1) LOOKUP[ALPHABET[i]] = i

/** Decode unpadded base64url. Returns null for any character outside the alphabet or a bad length. */
export function base64urlDecode(text: string): Uint8Array | null {
  if (typeof text !== 'string' || text.length % 4 === 1) return null
  const out = new Uint8Array(Math.floor((text.length * 3) / 4))
  let bits = 0
  let acc = 0
  let n = 0
  for (let i = 0; i < text.length; i += 1) {
    const v = LOOKUP[text[i]]
    if (v === undefined) return null
    acc = (acc << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out[n] = (acc >> bits) & 0xff
      n += 1
      acc &= (1 << bits) - 1
    }
  }
  return out.subarray(0, n)
}

export function base64urlEncode(bytes: Uint8Array): string {
  let out = ''
  let acc = 0
  let bits = 0
  for (let i = 0; i < bytes.length; i += 1) {
    acc = (acc << 8) | bytes[i]
    bits += 8
    while (bits >= 6) {
      bits -= 6
      out += ALPHABET[(acc >> bits) & 63]
    }
    acc &= (1 << bits) - 1
  }
  if (bits > 0) out += ALPHABET[(acc << (6 - bits)) & 63]
  return out
}
