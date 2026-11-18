// The signed parts index payload. Lenient about unknown fields (forward
// compatibility), strict about the fields the client acts on. A malformed part
// entry is dropped and counted; it never poisons the rest of the index.

import { readKeyAnnouncement, type KeyAnnouncement } from './keyring'

/** Highest `indexVersion` this build understands. */
export const SUPPORTED_INDEX_VERSION = 1

/** Largest package or render the client will download, in bytes. */
export const MAX_PACKAGE_BYTES = 1024 * 1024
export const MAX_RENDER_BYTES = 2 * 1024 * 1024
/** Largest render side, in pixels. */
export const MAX_RENDER_PX = 2048

export type Verification = 'drafted' | 'reviewed' | 'bench'
/** Only these are offered on the shelf. */
export const OFFERED_VERIFICATION: readonly Verification[] = ['reviewed', 'bench']

export interface IndexCategory {
  id: string
  label: string
  order: number
  parent: string | null
  aliases: string[]
}

export interface IndexFileRef {
  url: string
  sha256: string
  bytes: number
}

export interface IndexRenderRef extends IndexFileRef {
  widthPx: number
  heightPx: number
}

export interface IndexPart {
  partId: string
  revision: number
  /** The manifest's part types, in its order. */
  partTypes: string[]
  label: string
  manufacturer?: string
  interfaces: string[]
  chips: string[]
  categories: string[]
  verification: Verification
  package: IndexFileRef
  render?: IndexRenderRef
}

export interface PartsIndex {
  indexVersion: number
  generatedAt: string
  categories: IndexCategory[]
  parts: IndexPart[]
  keys: KeyAnnouncement
  /** Part entries that failed validation and were left out. */
  droppedParts: number
}

export type ParseIndexResult =
  | { ok: true; index: PartsIndex }
  | { ok: false; reason: 'needs-newer-app' | 'invalid' }

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const SHA256 = /^[0-9a-f]{64}$/

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const text = (v: unknown, max = 200): string | null =>
  typeof v === 'string' && v.length > 0 && v.length <= max ? v : null

function strings(v: unknown, max = 32): string[] | null {
  if (v === undefined) return []
  if (!Array.isArray(v) || v.length > max) return null
  const out: string[] = []
  for (const s of v) {
    const t = text(s)
    if (t === null) return null
    out.push(t)
  }
  return out
}

function fileRef(v: unknown, maxBytes: number): IndexFileRef | null {
  if (!isObject(v)) return null
  const url = text(v.url, 500)
  const bytes = v.bytes
  if (url === null || typeof v.sha256 !== 'string' || !SHA256.test(v.sha256)) return null
  if (typeof bytes !== 'number' || !Number.isInteger(bytes) || bytes < 1 || bytes > maxBytes) return null
  return { url, sha256: v.sha256, bytes }
}

function renderRef(v: unknown): IndexRenderRef | undefined {
  const ref = fileRef(v, MAX_RENDER_BYTES)
  if (!ref || !isObject(v)) return undefined
  const { widthPx, heightPx } = v
  const ok = (n: unknown): n is number =>
    typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= MAX_RENDER_PX
  // A bad render never rejects the part; the part just has no picture.
  if (!ok(widthPx) || !ok(heightPx)) return undefined
  return { ...ref, widthPx, heightPx }
}

function parseCategory(v: unknown): IndexCategory | null {
  if (!isObject(v)) return null
  const id = text(v.id, 64)
  const label = text(v.label)
  if (id === null || !ID.test(id) || label === null) return null
  const order = typeof v.order === 'number' && Number.isFinite(v.order) ? v.order : 0
  const parent = v.parent === null || v.parent === undefined ? null : text(v.parent, 64)
  if (v.parent !== null && v.parent !== undefined && parent === null) return null
  const aliases = strings(v.aliases)
  if (aliases === null) return null
  return { id, label, order, parent, aliases }
}

function parsePart(v: unknown): IndexPart | null {
  if (!isObject(v)) return null
  const partId = text(v.partId, 64)
  const partTypes = strings(v.partTypes, 8)
  const label = text(v.label)
  if (partId === null || !ID.test(partId) || !partTypes || partTypes.length === 0 || label === null) return null
  if (typeof v.revision !== 'number' || !Number.isInteger(v.revision) || v.revision < 1) return null
  if (v.verification !== 'drafted' && v.verification !== 'reviewed' && v.verification !== 'bench') return null
  const interfaces = strings(v.interfaces)
  const chips = strings(v.chips)
  const categories = strings(v.categories)
  const pkg = fileRef(v.package, MAX_PACKAGE_BYTES)
  if (!interfaces || !chips || !categories || !pkg) return null
  const manufacturer = v.manufacturer === undefined ? undefined : (text(v.manufacturer) ?? undefined)
  const part: IndexPart = {
    partId,
    revision: v.revision,
    partTypes,
    label,
    interfaces,
    chips,
    categories,
    verification: v.verification,
    package: pkg,
  }
  if (manufacturer) part.manufacturer = manufacturer
  const render = v.render === undefined ? undefined : renderRef(v.render)
  if (render) part.render = render
  return part
}

export function parseIndexPayload(payload: string): ParseIndexResult {
  let value: unknown
  try {
    value = JSON.parse(payload)
  } catch {
    return { ok: false, reason: 'invalid' }
  }
  if (!isObject(value)) return { ok: false, reason: 'invalid' }
  const version = value.indexVersion
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, reason: 'invalid' }
  }
  if (version > SUPPORTED_INDEX_VERSION) return { ok: false, reason: 'needs-newer-app' }
  if (typeof value.generatedAt !== 'string' || Number.isNaN(Date.parse(value.generatedAt))) {
    return { ok: false, reason: 'invalid' }
  }
  if (!Array.isArray(value.parts) || !Array.isArray(value.categories)) {
    return { ok: false, reason: 'invalid' }
  }
  const categories: IndexCategory[] = []
  for (const c of value.categories) {
    const cat = parseCategory(c)
    if (cat) categories.push(cat)
  }
  const parts: IndexPart[] = []
  const seen = new Set<string>()
  let droppedParts = 0
  for (const p of value.parts) {
    const part = parsePart(p)
    // One entry per partId: the first wins, so a duplicate cannot shadow it.
    if (!part || seen.has(part.partId)) {
      droppedParts += 1
      continue
    }
    seen.add(part.partId)
    parts.push(part)
  }
  return {
    ok: true,
    index: {
      indexVersion: version,
      generatedAt: value.generatedAt,
      categories,
      parts,
      keys: readKeyAnnouncement(value.keys),
      droppedParts,
    },
  }
}

/** The parts the shelf may offer: reviewed and bench only. */
export function offeredParts(index: PartsIndex): IndexPart[] {
  return index.parts.filter((p) => OFFERED_VERIFICATION.includes(p.verification))
}
