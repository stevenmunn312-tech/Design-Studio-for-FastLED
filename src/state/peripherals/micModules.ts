// Which I2S MEMS microphone a MicInput is, and what the firmware does about it.
//
// A thin read of the part catalogue: the two facts that decide whether a module
// may be offered at all are the same two the generator needs, the
// `fl::audio::Config` factory that builds its capture config and the
// `fl::audio::MicProfile` response correction that factory applies, and both
// live in the part's `microphone` block. A module with neither (and no capture
// adapter of the app's own) cannot be listed honestly — that was the whole
// reason this node offered exactly one option until FastLED shipped the other
// two factories.
//
// Deliberately not a list of every module that wires the same way. An analog
// electret board (MAX9814, MAX4466) has no I2S at all and `fl::audio::Config`
// is a variant of I2S and PDM only, so listing one would be the
// misrepresentation `partOptions.ts` exists to prevent.

import {
  bundledPartsForType, partById, registeredPartsForType, type PartCatalogueEntry,
} from '../../build/parts/partCatalogue'
import type { PartManifest } from '../../build/parts/manifest/partManifest'
import { partIdOrDefault } from './partSpec'

const MIC_NODE_TYPE = 'MicInput'

export interface MicModule {
  /** Catalogue part id. Also the value stored in the node's `partId`. */
  partId: string
  /** The short name: the part's `copy.optionLabel`, else its full `label`. */
  label: string
  /** One short line for the Add Hardware menu. */
  summary: string
  /** The caveat worth reading while wiring, when there is one. */
  note?: string
  /**
   * `fl::audio::Config` factory the ESP32 backend calls. Absent for a module
   * FastLED ships no factory for, which the app captures itself — see
   * `capture`.
   */
  factory?: string
  /** `fl::audio::MicProfile` member the Teensy backend is handed explicitly. */
  profile?: string
  /**
   * The app's own capture adapter, for a module FastLED's driver cannot read
   * correctly. Its presence narrows the boards the module works on to the ones
   * the adapter was written for (`micSupportedForBoard` says which).
   */
  capture?: 'sph0645-classic-esp32'
}

// One object per catalogue entry, so a caller comparing two reads of the same
// part sees the same module. Entries are never mutated once registered.
const modulesByEntry = new WeakMap<PartCatalogueEntry, MicModule | null>()

function moduleOf(entry: PartCatalogueEntry | undefined): MicModule | null {
  if (!entry) return null
  const cached = modulesByEntry.get(entry)
  if (cached !== undefined) return cached
  const block = entry.microphone
  const copy = (entry as Partial<PartManifest>).copy
  // Either FastLED's factory and profile together, or the app's own adapter.
  const drivable = block && (block.captureAdapter || (block.fastledFactory && block.fastledProfile))
  const module: MicModule | null = block && drivable
    ? {
        partId: entry.partId,
        label: copy?.optionLabel ?? entry.label,
        summary: copy?.summary ?? '',
        ...(copy?.wiringNote ? { note: copy.wiringNote } : {}),
        ...(block.fastledFactory ? { factory: block.fastledFactory } : {}),
        ...(block.fastledProfile ? { profile: block.fastledProfile } : {}),
        ...(block.captureAdapter ? { capture: block.captureAdapter } : {}),
      }
    : null
  modulesByEntry.set(entry, module)
  return module
}

/** The bundled microphones, in the Add Hardware menu's order (the first is the default). */
export function bundledMicModules(): MicModule[] {
  return bundledPartsForType(MIC_NODE_TYPE).flatMap((manifest) => moduleOf(manifest) ?? [])
}

/** Every microphone the catalogue holds: the bundled ones, then each registered part. */
export function micModules(): MicModule[] {
  const registered = registeredPartsForType(MIC_NODE_TYPE).flatMap((manifest) => moduleOf(manifest) ?? [])
  return [...bundledMicModules(), ...registered]
}

/** The module a MicInput carrying no choice resolves to: the first bundled one. */
export const DEFAULT_MIC_PART_ID: string = bundledPartsForType(MIC_NODE_TYPE)[0].partId

/**
 * The module a saved `partId` names. A missing id is the default microphone; an
 * unknown one is `null`, never another module's facts (`partResolution` holds
 * such a node).
 */
export function micModuleFor(partId: unknown): MicModule | null {
  return moduleOf(partById(partIdOrDefault(partId, DEFAULT_MIC_PART_ID)))
}
