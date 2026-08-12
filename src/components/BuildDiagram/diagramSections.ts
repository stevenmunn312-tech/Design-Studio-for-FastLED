import type { HardwareManifestItem } from '../../build/hardwareManifest'

/**
 * Subsystem sheets.
 *
 * One sheet carrying every device made the controller's pin corridor
 * unreadable once a build had more than a few peripherals. Splitting by
 * subsystem is only worth it if each sheet also drops the layers and
 * controller pins it does not use — otherwise it is the same congestion
 * drawn four times.
 */

export type BuildSectionId = 'all' | 'data' | 'audio' | 'controls' | 'power'

export interface BuildSectionLayers {
  /** Controller-to-device signal runs. */
  signalWires: boolean
  /** 74AHCT125 chips and their series resistors. */
  levelShifter: boolean
  /** PSU zones, fixed fuse blocks, per-feed capacitors, injection feeds, and the shared-net callout. */
  powerDistribution: boolean
}

export interface BuildSection {
  id: BuildSectionId
  label: string
  summary: string
  /** Item kinds this sheet covers. An empty list means every kind. */
  kinds: HardwareManifestItem['kind'][]
  layers: BuildSectionLayers
}

const ALL_LAYERS: BuildSectionLayers = { signalWires: true, levelShifter: true, powerDistribution: true }

export const BUILD_SECTIONS: BuildSection[] = [
  {
    id: 'all',
    label: 'All',
    summary: 'Every subsystem on one sheet.',
    kinds: [],
    layers: ALL_LAYERS,
  },
  {
    id: 'data',
    label: 'Data',
    summary: 'Controller data pins through the level shifter to each LED output.',
    kinds: ['matrix-output'],
    layers: { signalWires: true, levelShifter: true, powerDistribution: false },
  },
  {
    id: 'audio',
    label: 'Audio',
    summary: 'Controller I2S pins to the microphone breakout.',
    kinds: ['mic-input'],
    layers: { signalWires: true, levelShifter: false, powerDistribution: false },
  },
  {
    id: 'controls',
    label: 'Controls',
    summary: 'Controller GPIO to each button, potentiometer, and encoder.',
    kinds: ['button-input', 'pot-input', 'encoder-input'],
    layers: { signalWires: true, levelShifter: false, powerDistribution: false },
  },
  {
    id: 'power',
    label: 'Power',
    summary: 'PSU zones, fixed fuse blocks, and a fused capacitor stage for every LED power feed.',
    kinds: ['matrix-output'],
    layers: { signalWires: false, levelShifter: false, powerDistribution: true },
  },
]

export const DEFAULT_SECTION_ID: BuildSectionId = 'all'

export function buildSectionById(id: BuildSectionId): BuildSection {
  return BUILD_SECTIONS.find((section) => section.id === id) ?? BUILD_SECTIONS[0]
}

export function sectionIncludesItem(section: BuildSection, item: HardwareManifestItem): boolean {
  return section.kinds.length === 0 || section.kinds.includes(item.kind)
}

/**
 * Sections with nothing to show are omitted rather than rendered empty, so the
 * tab strip reflects the build the user actually has. `all` always survives so
 * there is a sheet to fall back to.
 */
export function availableSections(items: HardwareManifestItem[]): BuildSection[] {
  return BUILD_SECTIONS.filter((section) =>
    section.id === 'all' || items.some((item) => sectionIncludesItem(section, item)))
}
