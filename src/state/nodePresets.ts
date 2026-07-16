import { create } from 'zustand'
import type { NodeDefinition } from '../types'
import { NODE_LIBRARY, propertyMeta } from './nodeLibrary'

const KEY = 'fastled-studio.node-presets.v1'

export interface NodePreset {
  id: string
  name: string
  nodeType: string
  properties: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

interface NodePresetState {
  presets: NodePreset[]
  savePreset: (nodeType: string, name: string, properties: Record<string, unknown>) => NodePreset | null
  deletePreset: (id: string) => void
}

const BLOCKED_KEYS = new Set([
  'animation',
  'bypassed',
  'channel',
  'chipset',
  'clockPin',
  'clampInputs',
  'colorOrder',
  'correction',
  'customXYMap',
  'dataPin',
  'dither',
  'font',
  'globalCode',
  'graphId',
  'groupId',
  'i2sSck',
  'i2sSd',
  'i2sWs',
  'image',
  'layout',
  'loop',
  'milliamps',
  'overclock',
  'patternIds',
  'patternSections',
  'pin',
  'pinA',
  'pinB',
  'pinSW',
  'playbackRate',
  'powerLimit',
  'previewHidden',
  'psramMode',
  'pullup',
  // Legacy MicInput field; analysis is fixed at 16 kHz in preview + firmware.
  'sampleRate',
  'sdCsPin',
  'serialDebug',
  'supersample',
  'tileRotations',
  'tileSerpentine',
  'tilesX',
  'tilesY',
  'useGroupInputs',
  'usePsram',
  'volts',
])

const BLOCKED_KEY_PARTS = ['pin', 'port', 'fqbn', 'board', 'toolchain']
const CODE_KEYS = new Set(['code', 'globalCode'])

function load(): NodePreset[] {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed.filter((p): p is NodePreset =>
      p && typeof p === 'object' &&
      typeof p.id === 'string' &&
      typeof p.name === 'string' &&
      typeof p.nodeType === 'string' &&
      p.properties && typeof p.properties === 'object' &&
      typeof p.createdAt === 'number' &&
      typeof p.updatedAt === 'number'
    )
  } catch {
    return []
  }
}

function persist(presets: NodePreset[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(presets))
  } catch {
    // Keep the in-memory store usable if storage is full or unavailable.
  }
}

function nodeDef(nodeType: string): NodeDefinition | undefined {
  return NODE_LIBRARY.find((def) => def.type === nodeType)
}

function isPlainPresetValue(value: unknown): boolean {
  return value == null || ['string', 'number', 'boolean'].includes(typeof value)
}

function isSafePropertyKey(key: string): boolean {
  if (BLOCKED_KEYS.has(key) || CODE_KEYS.has(key)) return false
  const lower = key.toLocaleLowerCase()
  return !BLOCKED_KEY_PARTS.some((part) => lower.includes(part))
}

export function presettableProperties(nodeType: string, properties: Record<string, unknown>): Record<string, unknown> {
  const def = nodeDef(nodeType)
  if (def && ['input', 'output', 'hardware'].includes(def.category)) return {}
  const keys = new Set([
    ...Object.keys(def?.defaultProperties ?? {}),
    ...Object.keys(properties),
  ])
  const out: Record<string, unknown> = {}
  for (const key of keys) {
    if (!isSafePropertyKey(key)) continue
    const value = properties[key] ?? def?.defaultProperties?.[key]
    if (isPlainPresetValue(value)) out[key] = value
  }
  return out
}

export function presetsForNodeType(nodeType: string, presets = useNodePresets.getState().presets): NodePreset[] {
  return presets
    .filter((preset) => preset.nodeType === nodeType)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function defaultPropertiesForNodeType(nodeType: string): Record<string, unknown> {
  return { ...(nodeDef(nodeType)?.defaultProperties ?? {}) }
}

function snap(value: number, step: number): number {
  const snapped = Math.round(value / step) * step
  const decimals = Math.max(0, String(step).split('.')[1]?.length ?? 0)
  return Number(snapped.toFixed(decimals))
}

function randomChoice<T>(values: readonly T[]): T {
  return values[Math.floor(Math.random() * values.length)]
}

function randomHex(): string {
  const n = Math.floor(Math.random() * 0xffffff)
  return `#${n.toString(16).padStart(6, '0')}`
}

function randomizeValue(nodeType: string, key: string, current: unknown, mutate: boolean): unknown {
  const meta = propertyMeta(nodeType, key)
  if (meta?.control === 'select') return randomChoice(meta.options)
  if (meta?.control === 'slider') {
    const span = meta.max - meta.min
    const next = mutate && typeof current === 'number'
      ? current + (Math.random() - 0.5) * span * 0.3
      : meta.min + Math.random() * span
    return Math.min(meta.max, Math.max(meta.min, snap(next, meta.step)))
  }
  if (typeof current === 'boolean') return mutate ? (Math.random() < 0.3 ? !current : current) : Math.random() < 0.5
  if (typeof current === 'number') {
    if (['r', 'g', 'b'].includes(key)) return Math.floor(Math.random() * 256)
    const def = nodeDef(nodeType)?.defaultProperties?.[key]
    const basis = Number.isFinite(current) ? current : Number(def ?? 1)
    const spread = Math.max(1, Math.abs(basis))
    return snap(Math.max(0, basis + (Math.random() - 0.5) * spread), 0.01)
  }
  if (typeof current === 'string' && /^#[0-9a-f]{6}$/i.test(current)) return randomHex()
  return current
}

export function variationProperties(
  nodeType: string,
  properties: Record<string, unknown>,
  mode: 'randomize' | 'mutate',
): Record<string, unknown> {
  const safe = presettableProperties(nodeType, properties)
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(safe)) {
    if (typeof value === 'string' && !/^#[0-9a-f]{6}$/i.test(value) && !propertyMeta(nodeType, key)) continue
    if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
      out[key] = randomizeValue(nodeType, key, value, mode === 'mutate')
    }
  }
  return out
}

export const useNodePresets = create<NodePresetState>((set) => ({
  presets: load(),

  savePreset: (nodeType, rawName, properties) => {
    const name = rawName.trim()
    const presetProperties = presettableProperties(nodeType, properties)
    if (!name || Object.keys(presetProperties).length === 0) return null
    let saved: NodePreset | null = null
    set((s) => {
      const now = Date.now()
      const existing = s.presets.find((preset) =>
        preset.nodeType === nodeType && preset.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase()
      )
      const presets = existing
        ? s.presets.map((preset) => preset.id === existing.id
          ? { ...preset, name, properties: presetProperties, updatedAt: now }
          : preset)
        : [...s.presets, {
          id: `preset-${nodeType}-${now}`,
          name,
          nodeType,
          properties: presetProperties,
          createdAt: now,
          updatedAt: now,
        }]
      saved = presets.find((preset) => preset.nodeType === nodeType && preset.name === name) ?? null
      persist(presets)
      return { presets }
    })
    return saved
  },

  deletePreset: (id) =>
    set((s) => {
      const presets = s.presets.filter((preset) => preset.id !== id)
      persist(presets)
      return { presets }
    }),
}))
