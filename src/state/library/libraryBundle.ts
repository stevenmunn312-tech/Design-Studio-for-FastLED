// The **library bundle**: one shareable shape for patterns, palettes and
// pattern collections, and the three ways it travels — a file, the clipboard
// and a `#library=` share link. See docs/design/library-sharing.md.
//
// Trust is deliberately not decided here. An import puts content into the
// library (or onto the canvas) exactly as it arrived; nothing is remembered as
// known, so the first drop of imported code untrusts the workspace the same
// way a pattern dropped from any other source does.

import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import { reachableGroupRegistry, useGraphStore } from '../graphStore'
import type { GraphContent, StudioNode } from '../graphStore'
import type { GroupRegistry } from '../graphEvaluator'
import {
  patternFingerprint,
  usePatternLibrary,
  withRegisteredGroups,
  type PatternOrigin,
  type PatternPort,
  type SavedPattern,
} from '../patterns/patternLibrary'
import { patternFormTags, type PatternFormTag } from '../patterns/patternTags'
import {
  clampPatternWeight,
  collectionProfiles,
  isEnergyBand,
  PATTERN_WEIGHT_DEFAULT,
  type EnergyBand,
  type PatternEntryPolicy,
} from '../patterns/patternPick'
import { isHexColor, normalizeCustomPalette } from '../palettes/customPalette'
import { NODE_LIBRARY } from '../nodeLibrary'
import { resolveDefaultProperties } from '../nodeDefaults'
import { sanitizeWorkspacePayload } from '../../utils/workspacePayload'
import { SHARE_URL_WARN_BYTES } from '../../utils/shareGraph'

export const LIBRARY_BUNDLE_KIND = 'fastled-library'
export const LIBRARY_HASH_KEY = 'library'

export interface SharedPaletteStop { position: number; color: string }
export interface SharedPalette { name: string; stops: SharedPaletteStop[] }

/** A library pattern as it travels: a `SavedPattern` minus the machine-local
 *  flags, plus the subgraphs of any Group nodes nested inside it. */
export interface BundledPattern {
  id?: string
  name: string
  createdAt?: number
  inputs: PatternPort[]
  outputs: PatternPort[]
  subgraph: GraphContent
  categoryId?: string
  bestOn?: PatternFormTag[]
  groups?: GroupRegistry
}

/** The per-pattern show profile a Pattern Collection keeps, in the shape the
 *  node stores (`patternSections`/`patternWeights`/`patternEnergy`/
 *  `patternEntry`, each keyed by group id). Every field is optional and a
 *  missing one means the node's default. */
export interface CollectionPatternProfile {
  sections?: string[]
  weight?: number
  energy?: EnergyBand[]
  entry?: PatternEntryPolicy
}

export interface SharedCollection {
  name: string
  patterns: BundledPattern[]
  /** Keyed by the pattern's index in `patterns`. */
  profiles: Record<string, CollectionPatternProfile>
}

export interface LibraryBundle {
  kind: typeof LIBRARY_BUNDLE_KIND
  version: 1
  patterns?: BundledPattern[]
  palettes?: SharedPalette[]
  collections?: SharedCollection[]
}

export interface LibraryBundleParts {
  patterns?: BundledPattern[]
  palettes?: SharedPalette[]
  collections?: SharedCollection[]
}

export type LibraryBundleParse = { bundle: LibraryBundle; error?: undefined } | { bundle?: undefined; error: string }

export interface LibraryImportSummary {
  patterns: number
  palettes: number
  collections: number
  /** Names of patterns that arrived with an id this library already uses for
   *  different content and were given a fresh id. */
  renamed: string[]
}

export interface LibraryImportOptions {
  origin: PatternOrigin
  /** Where palette and collection nodes land on the active canvas. */
  position?: { x: number; y: number }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

// ── Content hygiene ────────────────────────────────────────────────────────

/** Wi-Fi settings used to be ordinary node properties. They are browser-local
 *  now (networkCredentials.ts), but a pattern saved before that can still
 *  carry them, and a bundle must never. */
const CREDENTIAL_KEYS = ['wifiSsid', 'wifiPassword'] as const

function stripCredentials(content: GraphContent): GraphContent {
  return {
    nodes: content.nodes.map((node) => {
      const properties = node.data?.properties
      if (!isPlainObject(properties) || !CREDENTIAL_KEYS.some((key) => key in properties)) return node
      const cleaned = { ...properties }
      for (const key of CREDENTIAL_KEYS) delete cleaned[key]
      return { ...node, data: { ...node.data, properties: cleaned } }
    }),
    edges: content.edges,
  }
}

/** Keep only nodes and edges the editor can load (the same rule a share link
 *  applies), with credentials removed from what stays. */
function cleanContent(subgraph: unknown, groups: unknown): { subgraph: GraphContent; groups?: GroupRegistry } | null {
  if (!isPlainObject(subgraph) || !Array.isArray(subgraph.nodes) || !Array.isArray(subgraph.edges)) return null
  const sanitized = sanitizeWorkspacePayload({
    nodes: subgraph.nodes,
    edges: subgraph.edges,
    ...(isPlainObject(groups) ? { graphData: groups } : {}),
  })
  if (!sanitized) return null
  const cleanedGroups: GroupRegistry = {}
  for (const [id, content] of Object.entries(sanitized.workspace.graphData ?? {})) {
    cleanedGroups[id] = stripCredentials(content)
  }
  return {
    subgraph: stripCredentials({ nodes: sanitized.workspace.nodes, edges: sanitized.workspace.edges }),
    ...(Object.keys(cleanedGroups).length ? { groups: cleanedGroups } : {}),
  }
}

function isPort(value: unknown): value is PatternPort {
  return isPlainObject(value) && typeof value.id === 'string' && typeof value.label === 'string' && typeof value.dataType === 'string'
}

function readPorts(value: unknown): PatternPort[] {
  return Array.isArray(value) ? value.filter(isPort).map(({ id, label, dataType }) => ({ id, label, dataType })) : []
}

/** A bundled pattern, a bare `SavedPattern` file, or a community `patternJson`
 *  (`{ name, subgraph, groups }`) — all three are one pattern. */
function readBundledPattern(value: unknown): BundledPattern | null {
  if (!isPlainObject(value)) return null
  const name = typeof value.name === 'string' ? value.name.trim() : ''
  if (!name) return null
  const cleaned = cleanContent(value.subgraph, value.groups)
  if (!cleaned) return null
  const bestOn = patternFormTags(value.bestOn)
  return {
    ...(typeof value.id === 'string' && value.id.trim() ? { id: value.id } : {}),
    name,
    ...(typeof value.createdAt === 'number' && Number.isFinite(value.createdAt) ? { createdAt: value.createdAt } : {}),
    inputs: readPorts(value.inputs),
    outputs: readPorts(value.outputs),
    subgraph: cleaned.subgraph,
    ...(typeof value.categoryId === 'string' && value.categoryId.trim() ? { categoryId: value.categoryId } : {}),
    ...(bestOn.length ? { bestOn } : {}),
    ...(cleaned.groups ? { groups: cleaned.groups } : {}),
  }
}

function readSharedPalette(value: unknown): SharedPalette | null {
  if (!isPlainObject(value) || !Array.isArray(value.stops)) return null
  const name = typeof value.name === 'string' ? value.name.trim() : ''
  const stops = value.stops.filter((stop): stop is SharedPaletteStop => (
    isPlainObject(stop) && isHexColor(stop.color) && typeof stop.position === 'number' && Number.isFinite(stop.position)
  ))
  if (!name || stops.length === 0) return null
  const normalized = normalizeCustomPalette(stops.map((stop) => stop.color), stops.map((stop) => stop.position))
  return { name, stops: normalized.colors.map((color, i) => ({ position: normalized.positions[i], color })) }
}

function readProfile(value: unknown): CollectionPatternProfile | null {
  if (!isPlainObject(value)) return null
  const profile: CollectionPatternProfile = {}
  if (Array.isArray(value.sections)) {
    const sections = value.sections.filter((tag): tag is string => typeof tag === 'string')
    if (sections.length) profile.sections = sections
  }
  if (typeof value.weight === 'number' && Number.isFinite(value.weight)) {
    const weight = clampPatternWeight(value.weight)
    if (weight !== PATTERN_WEIGHT_DEFAULT) profile.weight = weight
  }
  if (Array.isArray(value.energy)) {
    const energy = value.energy.filter(isEnergyBand)
    if (energy.length) profile.energy = energy
  }
  if (value.entry === 'resume') profile.entry = 'resume'
  return Object.keys(profile).length ? profile : null
}

function readSharedCollection(value: unknown): SharedCollection | null {
  if (!isPlainObject(value) || !Array.isArray(value.patterns)) return null
  const name = typeof value.name === 'string' ? value.name.trim() : ''
  const patterns = value.patterns.map(readBundledPattern).filter((pattern): pattern is BundledPattern => pattern !== null)
  if (!name || patterns.length === 0) return null
  const profiles: Record<string, CollectionPatternProfile> = {}
  if (isPlainObject(value.profiles)) {
    for (const [key, entry] of Object.entries(value.profiles)) {
      const index = Number(key)
      if (!Number.isInteger(index) || index < 0 || index >= patterns.length) continue
      const profile = readProfile(entry)
      if (profile) profiles[String(index)] = profile
    }
  }
  return { name, patterns, profiles }
}

// ── Export ─────────────────────────────────────────────────────────────────

/** A library pattern as it should travel: nested groups collected the way the
 *  community upload collects them, credentials and unloadable items dropped,
 *  machine-local flags left behind. */
export function bundledPatternFromLibrary(
  pattern: SavedPattern,
  graphData: Record<string, GraphContent> = useGraphStore.getState().graphData,
): BundledPattern {
  const registry: Record<string, GraphContent> = { ...graphData, ...(pattern.groups ?? {}) }
  const groups = reachableGroupRegistry(pattern.subgraph.nodes, registry)
  const cleaned = cleanContent(pattern.subgraph, groups)
  const bestOn = patternFormTags(pattern.bestOn)
  return {
    id: pattern.id,
    name: pattern.name,
    createdAt: pattern.createdAt,
    inputs: readPorts(pattern.inputs),
    outputs: readPorts(pattern.outputs),
    subgraph: cleaned?.subgraph ?? { nodes: [], edges: [] },
    ...(pattern.categoryId ? { categoryId: pattern.categoryId } : {}),
    ...(bestOn.length ? { bestOn } : {}),
    ...(cleaned?.groups ? { groups: cleaned.groups } : {}),
  }
}

/** The palette a `CustomPalette` node holds, or null for any other node. */
export function sharedPaletteFromNode(node: StudioNode): SharedPalette | null {
  if (node.data?.nodeType !== 'CustomPalette') return null
  const properties = node.data.properties ?? {}
  const { colors, positions } = normalizeCustomPalette(properties.colors, properties.positions)
  return {
    name: String(node.data.label ?? 'Custom Palette'),
    stops: colors.map((color, i) => ({ position: positions[i], color })),
  }
}

function derivedPorts(content: GraphContent): { inputs: PatternPort[]; outputs: PatternPort[] } {
  const inputs: PatternPort[] = []
  let outputs: PatternPort[] = []
  for (const node of content.nodes) {
    if (node.data?.nodeType === 'GroupInput') {
      const paramId = String((node.data.properties as { paramId?: unknown } | undefined)?.paramId ?? '')
      const out = (node.data.outputs as PatternPort[] | undefined)?.[0]
      if (paramId && out) inputs.push({ id: paramId, label: out.label, dataType: out.dataType })
    } else if (node.data?.nodeType === 'GroupOutput') {
      outputs = readPorts(node.data.inputs)
    }
  }
  return { inputs, outputs }
}

/** A Pattern Collection node's patterns (each with its subgraph and nested
 *  groups) and the show profile the node keeps for each, or null when the
 *  node is not a collection. Port signatures come from the library entry the
 *  group was made from when it still exists, otherwise from the subgraph's
 *  own GroupInput/GroupOutput nodes. */
export function sharedCollectionFromNode(
  node: StudioNode,
  state: Pick<ReturnType<typeof useGraphStore.getState>, 'graphs' | 'graphData'> = useGraphStore.getState(),
  library: SavedPattern[] = usePatternLibrary.getState().patterns,
): SharedCollection | null {
  if (node.data?.nodeType !== 'PatternCollection') return null
  const properties = (node.data.properties ?? {}) as {
    patternIds?: string[]
    patternSections?: Record<string, string[]>
    patternWeights?: Record<string, unknown>
    patternEnergy?: Record<string, readonly unknown[] | undefined>
    patternEntry?: Record<string, unknown>
  }
  const ids = (properties.patternIds ?? []).filter((id) => !!state.graphData[id])
  const profiles = collectionProfiles(ids, properties)
  const patterns: BundledPattern[] = []
  const sharedProfiles: Record<string, CollectionPatternProfile> = {}
  ids.forEach((groupId, index) => {
    const content = state.graphData[groupId]
    const meta = state.graphs[groupId]
    const source = meta?.sourcePatternId ? library.find((pattern) => pattern.id === meta.sourcePatternId) : undefined
    const ports = source ? { inputs: source.inputs, outputs: source.outputs } : derivedPorts(content)
    patterns.push(bundledPatternFromLibrary({
      id: source?.id ?? groupId,
      name: meta?.name ?? source?.name ?? groupId,
      createdAt: source?.createdAt ?? Date.now(),
      inputs: ports.inputs,
      outputs: ports.outputs,
      subgraph: content,
      bestOn: source?.bestOn,
    }, state.graphData))
    const profile: CollectionPatternProfile = {}
    if (profiles.sectionTags[index].length) profile.sections = profiles.sectionTags[index]
    if (profiles.weights[index] !== PATTERN_WEIGHT_DEFAULT) profile.weight = profiles.weights[index]
    if (profiles.energyTags[index].length) profile.energy = profiles.energyTags[index]
    if (profiles.entry[index] === 'resume') profile.entry = 'resume'
    if (Object.keys(profile).length) sharedProfiles[String(index)] = profile
  })
  return { name: String(node.data.label ?? 'Pattern Collection'), patterns, profiles: sharedProfiles }
}

export function buildLibraryBundle(parts: LibraryBundleParts): LibraryBundle {
  return {
    kind: LIBRARY_BUNDLE_KIND,
    version: 1,
    ...(parts.patterns?.length ? { patterns: parts.patterns } : {}),
    ...(parts.palettes?.length ? { palettes: parts.palettes } : {}),
    ...(parts.collections?.length ? { collections: parts.collections } : {}),
  }
}

/** The bundle as file text. */
export function exportLibraryBundle(parts: LibraryBundleParts): string {
  return JSON.stringify(buildLibraryBundle(parts), null, 2)
}

export function isEmptyLibraryBundle(bundle: LibraryBundle): boolean {
  return !bundle.patterns?.length && !bundle.palettes?.length && !bundle.collections?.length
}

// ── Parse ──────────────────────────────────────────────────────────────────

function readLibraryLinkPayload(text: string): string | null {
  const marker = `#${LIBRARY_HASH_KEY}=`
  const at = text.indexOf(marker)
  if (at < 0) return null
  const compressed = text.slice(at + marker.length).trim()
  if (!compressed) return null
  try {
    return decompressFromEncodedURIComponent(compressed) || null
  } catch {
    return null
  }
}

/**
 * Read a bundle from file text, pasted JSON, a share link, or an already
 * parsed object. A bare `SavedPattern` file and a community `patternJson`
 * both read as a bundle holding that one pattern, so every pattern file
 * Studio has ever written still imports.
 */
export function parseLibraryBundle(input: unknown): LibraryBundleParse {
  let value: unknown = input
  if (typeof input === 'string') {
    const text = input.trim()
    if (!text) return { error: 'Nothing to import' }
    const fromLink = readLibraryLinkPayload(text)
    try {
      value = JSON.parse(fromLink ?? text)
    } catch {
      return { error: fromLink === null && /#\w+=/.test(text) ? 'This link does not hold a library' : 'Not valid JSON' }
    }
  }
  if (!isPlainObject(value)) return { error: 'Not a library bundle or pattern file' }

  if (value.kind === LIBRARY_BUNDLE_KIND) {
    if (value.version !== 1) return { error: `Library bundle version ${String(value.version)} is not supported` }
    const patterns = Array.isArray(value.patterns)
      ? value.patterns.map(readBundledPattern).filter((pattern): pattern is BundledPattern => pattern !== null)
      : []
    const palettes = Array.isArray(value.palettes)
      ? value.palettes.map(readSharedPalette).filter((palette): palette is SharedPalette => palette !== null)
      : []
    const collections = Array.isArray(value.collections)
      ? value.collections.map(readSharedCollection).filter((collection): collection is SharedCollection => collection !== null)
      : []
    const bundle = buildLibraryBundle({ patterns, palettes, collections })
    if (isEmptyLibraryBundle(bundle)) return { error: 'This bundle holds nothing Studio can import' }
    return { bundle }
  }

  const single = readBundledPattern(value)
  if (single) return { bundle: buildLibraryBundle({ patterns: [single] }) }
  return { error: 'Not a library bundle or pattern file' }
}

// ── Share link ─────────────────────────────────────────────────────────────

export function buildLibraryLink(bundle: LibraryBundle, base: string = window.location.href): string {
  const url = new URL(base)
  url.hash = `${LIBRARY_HASH_KEY}=${compressToEncodedURIComponent(JSON.stringify(bundle))}`
  return url.toString()
}

/** Null while the link is within the size most apps will carry. Same
 *  threshold as a graph share link; the remedy is a file, not a project. */
export function libraryLinkSizeWarning(url: string): string | null {
  if (url.length <= SHARE_URL_WARN_BYTES) return null
  const kb = Math.ceil(url.length / 1024)
  return `This share link is ${kb} KB. Links past about 30 KB get cut off by browsers and chat apps. Export a library file instead for this much content.`
}

/** The bundle in the page's `#library=` hash, or null when the hash is
 *  something else. An unreadable payload is an error, not null, so the
 *  caller can say so and clear it. */
export function readLibraryHash(): LibraryBundleParse | null {
  const hash = window.location.hash.replace(/^#/, '')
  if (!hash.startsWith(`${LIBRARY_HASH_KEY}=`)) return null
  return parseLibraryBundle(`#${hash}`)
}

export function clearLibraryHash() {
  history.replaceState(null, '', window.location.pathname + window.location.search)
}

// ── Import ─────────────────────────────────────────────────────────────────

let importCounter = 0
function freshPatternId(now: number): string {
  importCounter += 1
  return `pat-${now}-${importCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

interface PatternImportResult {
  pattern: SavedPattern
  /** False when the library already held exactly this pattern. */
  imported: boolean
  /** True when the bundle's id was taken by different content. */
  renamed: boolean
}

/** Put one bundled pattern into the library. Identical content (by
 *  fingerprint, nested groups included) is a no-op that returns the existing
 *  entry; an id the library already uses for different content is replaced
 *  by a fresh one rather than overwriting that entry. The pattern is never
 *  remembered as known content. */
function importBundledPattern(bundled: BundledPattern, origin: PatternOrigin, now: number): PatternImportResult {
  const lib = usePatternLibrary.getState()
  const categoryId = bundled.categoryId && lib.categories.some((category) => category.id === bundled.categoryId)
    ? bundled.categoryId
    : undefined
  const candidate: Omit<SavedPattern, 'id' | 'createdAt'> = {
    name: bundled.name,
    inputs: bundled.inputs,
    outputs: bundled.outputs,
    subgraph: bundled.subgraph,
    ...(categoryId ? { categoryId } : {}),
    ...(bundled.bestOn?.length ? { bestOn: bundled.bestOn } : {}),
    ...(bundled.groups ? { groups: bundled.groups } : {}),
  }
  const fingerprint = patternFingerprint(candidate)
  const same = lib.patterns.find((pattern) => patternFingerprint(pattern) === fingerprint)
  if (same) return { pattern: same, imported: false, renamed: false }
  const idTaken = !!bundled.id && lib.patterns.some((pattern) => pattern.id === bundled.id)
  const pattern: SavedPattern = {
    ...candidate,
    id: bundled.id && !idTaken ? bundled.id : freshPatternId(now),
    createdAt: bundled.createdAt ?? now,
    origin,
    importedAt: now,
  }
  lib.putPattern(pattern)
  return { pattern, imported: true, renamed: idTaken }
}

function customPaletteNode(palette: SharedPalette, position: { x: number; y: number }, index: number, now: number): StudioNode | null {
  const def = NODE_LIBRARY.find((entry) => entry.type === 'CustomPalette')
  if (!def) return null
  return {
    id: `CustomPalette-${now}-${index}`,
    type: 'studioNode',
    position,
    data: {
      label: palette.name,
      nodeType: def.type,
      category: def.category,
      properties: {
        ...resolveDefaultProperties(def.type, def.defaultProperties),
        colors: palette.stops.map((stop) => stop.color),
        positions: palette.stops.map((stop) => stop.position),
      },
      inputs: def.inputs,
      outputs: def.outputs,
    },
  } as StudioNode
}

function importCollection(collection: SharedCollection, origin: PatternOrigin, position: { x: number; y: number }, now: number, summary: LibraryImportSummary): boolean {
  const def = NODE_LIBRARY.find((entry) => entry.type === 'PatternCollection')
  if (!def) return false
  const saved = collection.patterns.map((bundled) => {
    const result = importBundledPattern(bundled, origin, now)
    if (result.imported) summary.patterns += 1
    if (result.renamed) summary.renamed.push(bundled.name)
    return withRegisteredGroups(result.pattern)
  })
  const store = useGraphStore.getState()
  const before = new Set(store.nodes.map((node) => node.id))
  store.createCollectionFromPatterns(saved, position, resolveDefaultProperties(def.type, def.defaultProperties), true)
  const created = useGraphStore.getState().nodes.find((node) => !before.has(node.id) && node.data?.nodeType === 'PatternCollection')
  if (!created) return false
  const groupIds = ((created.data.properties as { patternIds?: string[] }).patternIds) ?? []
  const patternSections: Record<string, string[]> = {}
  const patternWeights: Record<string, number> = {}
  const patternEnergy: Record<string, EnergyBand[]> = {}
  const patternEntry: Record<string, string> = {}
  for (const [key, profile] of Object.entries(collection.profiles)) {
    const groupId = groupIds[Number(key)]
    if (!groupId) continue
    if (profile.sections?.length) patternSections[groupId] = [...profile.sections]
    if (profile.weight !== undefined && profile.weight !== PATTERN_WEIGHT_DEFAULT) patternWeights[groupId] = profile.weight
    if (profile.energy?.length) patternEnergy[groupId] = [...profile.energy]
    if (profile.entry === 'resume') patternEntry[groupId] = 'resume'
  }
  if (Object.keys(collection.profiles).length) {
    useGraphStore.getState().updateNodeProperties(created.id, { patternSections, patternWeights, patternEnergy, patternEntry })
  }
  if (collection.name.trim()) {
    useGraphStore.setState((s) => ({
      nodes: s.nodes.map((node) => (node.id === created.id ? { ...node, data: { ...node.data, label: collection.name } } : node)),
    }))
  }
  return true
}

/**
 * Bring a parsed bundle in: patterns into the library, palettes onto the
 * active canvas as Custom Palette nodes, collections as a Pattern Collection
 * node whose patterns also join the library. Returns counts for the status
 * line. Nothing imported is remembered as known content.
 */
export function importLibraryBundle(bundle: LibraryBundle, options: LibraryImportOptions): LibraryImportSummary {
  const summary: LibraryImportSummary = { patterns: 0, palettes: 0, collections: 0, renamed: [] }
  const now = Date.now()
  const position = options.position ?? { x: 300, y: 250 }

  for (const bundled of bundle.patterns ?? []) {
    const result = importBundledPattern(bundled, options.origin, now)
    if (result.imported) summary.patterns += 1
    if (result.renamed) summary.renamed.push(bundled.name)
  }

  ;(bundle.palettes ?? []).forEach((palette, index) => {
    const node = customPaletteNode(palette, { x: position.x + index * 32, y: position.y + index * 24 }, index, now)
    if (!node) return
    const before = useGraphStore.getState().nodes.length
    useGraphStore.getState().addNode(node, true)
    if (useGraphStore.getState().nodes.length > before) summary.palettes += 1
  })

  ;(bundle.collections ?? []).forEach((collection, index) => {
    const offset = (bundle.palettes?.length ?? 0) + index
    if (importCollection(collection, options.origin, { x: position.x + offset * 32, y: position.y + offset * 24 }, now, summary)) {
      summary.collections += 1
    }
  })

  return summary
}

/** One line for the status bar. */
export function libraryImportStatus(summary: LibraryImportSummary): string {
  const parts: string[] = []
  const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`
  if (summary.patterns) parts.push(plural(summary.patterns, 'pattern'))
  if (summary.palettes) parts.push(plural(summary.palettes, 'palette'))
  if (summary.collections) parts.push(plural(summary.collections, 'collection'))
  const base = parts.length ? `Imported ${parts.join(', ')}` : 'Nothing new to import — the library already holds this content'
  if (summary.renamed.length === 0) return base
  const named = summary.renamed.length === 1
    ? `“${summary.renamed[0]}” kept its own copy`
    : `${summary.renamed.length} patterns kept their own copies`
  return `${base}. ${named} — the library already used that id for something else.`
}
