// An LED output that names a product (docs/design/led-output-parts.md).
//
// `partId` on a MatrixOutput is optional. Empty is Custom: today's node, with
// its own form, chipset and size. Naming a part *stamps* the part's facts into
// the node's existing properties, so the node stays the single evaluated truth:
// the evaluator, the sketch generators, power, the diagram and Graph Health keep
// reading the same properties, and a part-backed output and a hand-set Custom
// one with equal properties produce the same preview, C++ and power.
//
// What a part owns is locked (`lockedLedKeys`, honoured by `isPropertyEnabled`).
// Two things stay the installer's: `colorOrder` (batches differ; the part's value
// is only the starting point) and `ledCount` within the part's bounds. Changing
// `form` to one the part does not fit detaches the part. Everything here is pure:
// the store, the load reconcile and the tests apply the same rules.

import { partById, type PartLedOutputSpec } from '../../build/parts/partCatalogue'
import { MAX_LED_RUN } from './ledOutputForm'
import { usesPositions } from './stringPositions'

type Props = Record<string, unknown>

export interface LedProduct {
  partId: string
  label: string
  spec: PartLedOutputSpec
}

/** The saved `partId`, or null for a Custom output (missing or empty). */
export function ledPartId(props: Props | undefined | null): string | null {
  const value = props?.partId
  if (value === undefined || value === null) return null
  const id = String(value)
  return id.trim() === '' ? null : id
}

/** The product a part id names, or null when this version has no LED product by that id. */
export function resolveLedProduct(partId: unknown): LedProduct | null {
  if (typeof partId !== 'string' || partId.trim() === '') return null
  const entry = partById(partId)
  return entry?.ledOutput ? { partId: entry.partId, label: entry.label, spec: entry.ledOutput } : null
}

/** The product a node's properties name; null for Custom and for a part this version lacks. */
export function ledProductOf(props: Props | undefined | null): LedProduct | null {
  return resolveLedProduct(ledPartId(props))
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Math.round(Number(value))
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback
}

/** Whether a node in form `nodeForm` can sit on a part of form `partForm`: a corkscrew is a strip wound on a cylinder. */
export function ledFormFits(partForm: PartLedOutputSpec['form'], nodeForm: unknown): boolean {
  return nodeForm === partForm || (partForm === 'strip' && nodeForm === 'corkscrew')
}

/**
 * The panels across and down the node composes, which a product's tile size is
 * multiplied by. A node that is not tiled (`layout` is not `panels`) is one tile.
 */
export function ledTileCounts(props: Props): { x: number; y: number } {
  if (props.layout !== 'panels') return { x: 1, y: 1 }
  return { x: clampInt(props.tilesX, 1, 1, 16), y: clampInt(props.tilesY, 1, 1, 16) }
}

/** The LED counts a part allows: a fixed count is one value, a cut strip runs from one cut unit to the reel. */
export function ledCountBounds(spec: PartLedOutputSpec): { min: number; max: number; step: number } | null {
  if (spec.count !== undefined) return { min: spec.count, max: spec.count, step: 1 }
  if (spec.maxCount !== undefined) {
    const step = spec.cutEvery ?? 1
    return { min: step, max: spec.maxCount, step }
  }
  return null
}

/** `value` clamped to the part's bounds and snapped to its cut unit; unchanged for a grid part. */
export function clampLedCount(spec: PartLedOutputSpec, value: unknown): number {
  const bounds = ledCountBounds(spec)
  const requested = clampInt(value, bounds?.min ?? 1, 1, MAX_LED_RUN)
  if (!bounds) return requested
  const snapped = Math.round(requested / bounds.step) * bounds.step
  return Math.max(bounds.min, Math.min(bounds.max, snapped))
}

/** Whether `ledCount` is the installer's to change: not on a fixed-count part. */
export function ledCountEditable(spec: PartLedOutputSpec): boolean {
  const bounds = ledCountBounds(spec)
  return bounds !== null && bounds.max > bounds.min
}

/** The fastest SPI clock the product takes, in MHz; null for Custom, a clockless product and an unknown part. */
export function ledDataRateCeilingMhz(props: Props | undefined | null): number | null {
  return ledProductOf(props)?.spec.maxDataRateMhz ?? null
}

function isLinear(spec: PartLedOutputSpec): boolean {
  return spec.form === 'strip' || spec.form === 'ring'
}

/**
 * The properties a part owns and the node may not edit while it names the part.
 * `colorOrder` and an editable `ledCount` are not here; neither is `form`,
 * because changing it detaches the part rather than being refused.
 */
export function lockedLedKeys(spec: PartLedOutputSpec): readonly string[] {
  const keys = ['chipset']
  if (isLinear(spec)) {
    if (!ledCountEditable(spec)) keys.push('ledCount')
  } else {
    keys.push('width', 'height')
    if (spec.form === 'hub75') keys.push('hub75WideScan')
    if (spec.wiring) keys.push('serpentine', 'startCorner', 'firstRun')
  }
  return keys
}

/** Whether `key` of a node naming a resolvable product is locked to it. */
export function ledPropertyLocked(props: Props, key: string): boolean {
  const product = ledProductOf(props)
  return product !== null && lockedLedKeys(product.spec).includes(key)
}

/**
 * The part-owned facts as node properties: what reconciling writes, and the
 * locked set plus `form` and, for a chain, the clamped `ledCount`.
 */
export function ledProductFacts(spec: PartLedOutputSpec, props: Props): Props {
  const facts: Props = {
    form: ledFormFits(spec.form, props.form) ? props.form ?? spec.form : spec.form,
    chipset: spec.chipset,
  }
  if (isLinear(spec)) {
    // A positioned layout derives its own count; leave what it stored.
    if (!usesPositions(props) || !ledCountEditable(spec)) facts.ledCount = clampLedCount(spec, spec.count ?? props.ledCount)
  } else {
    const tiles = ledTileCounts(props)
    facts.width = (spec.width ?? 1) * tiles.x
    facts.height = (spec.height ?? 1) * tiles.y
    if (spec.form === 'hub75') facts.hub75WideScan = spec.scan === 32
    if (spec.wiring) {
      facts.serpentine = spec.wiring.serpentine
      facts.startCorner = spec.wiring.startCorner
      facts.firstRun = spec.wiring.firstRun
    }
  }
  return facts
}

/** Every key `stampLedProduct` writes: the locked set, `form`, `colorOrder`, `ledCount` and `partId`. */
export function stampedLedKeys(spec: PartLedOutputSpec, props: Props = {}): readonly string[] {
  return [...new Set(['partId', 'colorOrder', ...Object.keys(ledProductFacts(spec, props))])]
}

/** The same props with `next` merged over them, or the very same object when nothing changed. */
function withFacts(props: Props, next: Props): Props {
  let changed = false
  for (const [key, value] of Object.entries(next)) {
    if (props[key] !== value) { changed = true; break }
  }
  return changed ? { ...props, ...next } : props
}

/**
 * Choose a product: its facts go in, the tile count the node already has is
 * kept (so the stamped size is tile size times tiles), and the colour order
 * starts at the part's own. Returns null for a part id this version lacks.
 */
export function stampLedProduct(props: Props, partId: string): Props | null {
  const product = resolveLedProduct(partId)
  if (!product) return null
  const next: Props = { ...ledProductFacts(product.spec, props), partId: product.partId }
  if (product.spec.colorOrder) next.colorOrder = product.spec.colorOrder
  return withFacts(props, next)
}

/**
 * Re-stamp the part-owned facts. The load path and every edit run it, so a
 * hand-edited save or a stray writer cannot leave a locked value drifting from
 * the part. `colorOrder` is the installer's and is not touched. A Custom node,
 * and a node naming a part this version lacks (which is held, not guessed at),
 * come back as the same object.
 */
export function reconcileLedProduct(props: Props): Props {
  const product = ledProductOf(props)
  if (!product) return props
  return withFacts(props, ledProductFacts(product.spec, props))
}

/** Detach the part: the values stay, `partId` goes. A Custom node comes back unchanged. */
export function makeLedOutputCustom(props: Props): Props {
  if (!('partId' in props)) return props
  const rest = { ...props }
  delete rest.partId
  return rest
}

/**
 * The node's properties `after` `updates` were applied: choosing a part stamps it, clearing it makes the node custom,
 * changing the form to one the part does not fit detaches it, and any other
 * edit of a part-backed node is reconciled so a locked key cannot hold a
 * different value. Custom nodes pass through untouched.
 */
export function applyLedProductEdit(after: Props, updates: Props): Props {
  if (Object.prototype.hasOwnProperty.call(updates, 'partId')) {
    const requested = ledPartId({ partId: updates.partId })
    if (requested === null) return makeLedOutputCustom(after)
    return stampLedProduct(after, requested) ?? after
  }
  const product = ledProductOf(after)
  if (!product) return after
  if (Object.prototype.hasOwnProperty.call(updates, 'form') && !ledFormFits(product.spec.form, after.form)) {
    return makeLedOutputCustom(after)
  }
  return reconcileLedProduct(after)
}
