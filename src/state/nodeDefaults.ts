// Per-node-type default property overrides, persisted to localStorage. Some
// nodes (MicInput, MatrixOutput — see their "Set Default" checkbox in
// StudioNode.tsx) let the user pin their current settings as the starting
// point for future nodes of that type, since those properties are almost
// always hardware-specific (pins, chipset, board wiring) and rarely change
// once dialled in for a given rig.

import { create } from 'zustand'
import { micPinDefaultsForSelectedBoard } from './micPinDefaults'
import { useUploadStore } from './uploadStore'
import { boardI2cDefault } from '../build/boardI2cDefaults'
import { sdSpiPinsForBoard } from './sdPinDefaults'
import type { PhysicalBoardProfile } from '../build/boardProfiles'

const KEY = 'design-studio-for-fastled.node-defaults.v1'
const MIC_KEY = 'design-studio-for-fastled.mic-defaults-by-board.v1'

function sanitizeProperties(nodeType: string, properties: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...properties }
  // FastLED's audio pipeline owns the 44.1 kHz analysis rate. Older Studio
  // versions exposed a sample-rate field which never controlled either path,
  // so do not let a saved personal default bring it back on new nodes.
  if (nodeType === 'MicInput') delete sanitized.sampleRate
  return sanitized
}

function load(key = KEY, fixedNodeType?: string): Record<string, Record<string, unknown>> {
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : {}
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.fromEntries(
      Object.entries(parsed).map(([nodeType, properties]) => [
        nodeType,
        properties && typeof properties === 'object'
          ? sanitizeProperties(fixedNodeType ?? nodeType, properties as Record<string, unknown>)
          : {},
      ])
    )
  } catch {
    return {}
  }
}

function persist(overrides: Record<string, Record<string, unknown>>, key = KEY) {
  try {
    localStorage.setItem(key, JSON.stringify(overrides))
  } catch {
    // Quota exceeded or private-mode storage disabled — keep the in-memory copy.
  }
}

interface NodeDefaultsState {
  overrides: Record<string, Record<string, unknown>>
  /** MicInput is hardware wiring, so its remembered settings are isolated by
   * upload target rather than sharing the global per-node-type bucket. */
  micOverridesByFqbn: Record<string, Record<string, unknown>>
  setDefault: (nodeType: string, properties: Record<string, unknown>, fqbn?: string) => void
  clearDefault: (nodeType: string, fqbn?: string) => void
}

const loadedOverrides = load()
const loadedMicOverrides = load(MIC_KEY, 'MicInput')

// Older releases had one global MicInput default. Preserve it by assigning it
// to the board that is selected during migration; there is no older board key
// from which a more precise association could be recovered.
if (loadedOverrides.MicInput) {
  const fqbn = useUploadStore.getState().selectedFqbn
  if (!loadedMicOverrides[fqbn]) loadedMicOverrides[fqbn] = loadedOverrides.MicInput
  delete loadedOverrides.MicInput
  persist(loadedOverrides)
  persist(loadedMicOverrides, MIC_KEY)
}

function targetFqbn(fqbn?: string): string {
  return fqbn ?? useUploadStore.getState().selectedFqbn
}

export const useNodeDefaults = create<NodeDefaultsState>((set) => ({
  overrides: loadedOverrides,
  micOverridesByFqbn: loadedMicOverrides,

  setDefault: (nodeType, properties, fqbn) =>
    set((s) => {
      if (nodeType === 'MicInput') {
        const board = targetFqbn(fqbn)
        const micOverridesByFqbn = {
          ...s.micOverridesByFqbn,
          [board]: sanitizeProperties(nodeType, properties),
        }
        persist(micOverridesByFqbn, MIC_KEY)
        return { micOverridesByFqbn }
      }
      const overrides = { ...s.overrides, [nodeType]: sanitizeProperties(nodeType, properties) }
      persist(overrides)
      return { overrides }
    }),

  clearDefault: (nodeType, fqbn) =>
    set((s) => {
      if (nodeType === 'MicInput') {
        const board = targetFqbn(fqbn)
        if (!(board in s.micOverridesByFqbn)) return s
        const micOverridesByFqbn = { ...s.micOverridesByFqbn }
        delete micOverridesByFqbn[board]
        persist(micOverridesByFqbn, MIC_KEY)
        return { micOverridesByFqbn }
      }
      if (!(nodeType in s.overrides)) return s
      const overrides = { ...s.overrides }
      delete overrides[nodeType]
      persist(overrides)
      return { overrides }
    }),
}))

/** Resolve the properties a newly created node of `nodeType` should start
 *  with, layered lowest to highest:
 *
 *  1. the library's hardcoded default;
 *  2. defaults that depend on the selected board (MicInput's I2S pins — the
 *     library's are ESP32-S3 pads that don't exist on half the ESP32 family);
 *  3. the custom default pinned via "Set Default", which always wins because
 *     the user chose it for their own rig.
 *
 *  Layering rather than replacing means properties added to the library after
 *  a pin was saved still reach new nodes. */
/**
 * Properties the hardware view owns, stripped out of a saved default.
 *
 * `form` says what the output physically is, and only placing a part decides
 * that. A default carrying one would hand every new output the shape of
 * whichever part happened to be on the bench when the user pressed save —
 * which is exactly how the starters came to load as LED Strings.
 *
 * Filtered on read rather than on save, so a default that already carries one
 * stops applying immediately instead of waiting to be re-saved.
 */
const HARDWARE_OWNED_KEYS = new Set([
  'form', 'sdaPin', 'sclPin', 'sdCsPin', 'sdSckPin', 'sdMisoPin', 'sdMosiPin',
])

function withoutHardwareOwned(override: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!override) return {}
  return Object.fromEntries(Object.entries(override).filter(([key]) => !HARDWARE_OWNED_KEYS.has(key)))
}

export function resolveDefaultProperties(
  nodeType: string,
  libraryDefault: Record<string, unknown> | undefined,
  // The board a part is being added to, when the caller knows it. Lets a
  // microphone start on the pins this exact board exposes rather than the
  // chip-level FQBN guess.
  boardProfile?: PhysicalBoardProfile,
): Record<string, unknown> {
  const state = useNodeDefaults.getState()
  const fqbn = useUploadStore.getState().selectedFqbn
  const override = nodeType === 'MicInput'
    ? state.micOverridesByFqbn[fqbn]
    : state.overrides[nodeType]
  const rtcPins = nodeType === 'RTCInput' ? boardI2cDefault(boardProfile?.id) : undefined
  const sdSpiPins = nodeType === 'SDCard' ? sdSpiPinsForBoard(boardProfile, fqbn) : null
  const boardDefault = nodeType === 'MicInput'
    ? micPinDefaultsForSelectedBoard(boardProfile)
    : rtcPins
      ? { sdaPin: rtcPins.sda.arduinoPin, sclPin: rtcPins.scl.arduinoPin }
      : sdSpiPins
        ? {
            sdCsPin: sdSpiPins.cs,
            sdSckPin: sdSpiPins.sck,
            sdMisoPin: sdSpiPins.miso,
            sdMosiPin: sdSpiPins.mosi,
          }
        : undefined
  return sanitizeProperties(nodeType, {
    ...(libraryDefault ?? {}),
    ...(boardDefault ?? {}),
    ...withoutHardwareOwned(override),
  })
}

export function hasCustomNodeDefault(nodeType: string, fqbn?: string): boolean {
  const state = useNodeDefaults.getState()
  return nodeType === 'MicInput'
    ? targetFqbn(fqbn) in state.micOverridesByFqbn
    : nodeType in state.overrides
}
