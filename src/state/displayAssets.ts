import {
  DISPLAY_ASSET_CATALOGUE_DATA,
  DISPLAY_ASSET_PACK_VERSION,
  DISPLAY_THEME_TOKEN_DATA,
} from '../build/generated/displayAssetCatalogueData'
import type { DisplayAssetKind, DisplayClass } from './displayRegistry'

/*
 * What a custom display may draw, and what each of those things costs.
 *
 * The counterpart to `partCatalogue.ts`: the parts on the bench are imported
 * from modelled assets, and the pictures on a screen are imported from the
 * design pack by `scripts/import-display-assets.py`. Neither is hand-declared,
 * for the same reason — a remembered dimension or a guessed flash figure is the
 * app telling a quiet lie about something the user will meet on hardware.
 *
 * The import boundary matters more here than the numbers do. A display document
 * persists an asset *id* and nothing else, so the pack's working-folder paths
 * stop at the import script and can never reach a saved or shared workspace.
 * Anything reaching this module from a file goes through
 * `normalizeDisplayAssetId`, which answers with a catalogue id or with nothing.
 */

export type DisplayAssetCategory =
  | 'icon'
  | 'control'
  | 'widget-glyph'
  | 'background'
  | 'theme'
  | 'template-preview'

export type DisplayAssetFormat = 'svg' | 'png' | 'json'

export interface DisplayAssetEntry {
  /** `category:name` or `category:name:variant`, stable across pack versions. */
  id: string
  category: DisplayAssetCategory
  label: string
  /** Widget asset-slot kinds this asset may fill; empty for one no widget references. */
  slots: readonly DisplayAssetKind[]
  /** Native pixel dimensions, zero for an asset that has none (theme tokens). */
  width: number
  height: number
  tintable: boolean
  format: DisplayAssetFormat
  /** Site-root relative, e.g. `display-assets/icons/power.svg`. Never a pack path. */
  file: string
  /** How a baked pixel is stored: an 8-bit alpha mask for a glyph, RGB565 for a
   * background, nothing for an asset that is never baked. */
  bytesPerPixel: number
}

/** A pack theme's own palette, carried across by the importer unchanged.
 * Mapping it onto the studio's `DisplayTheme` blends colours, and blending has
 * one owner — `displayTheme.ts` — so that mapping lives in
 * `displayThemePresets.ts` rather than in the import script. */
export interface DisplayPackThemeTokens {
  id: string
  name: string
  colours: {
    backgroundStart: string
    backgroundEnd: string
    surface: string
    surfaceRaised: string
    text: string
    textMuted: string
    accent: string
    accentSecondary: string
    border: string
    success: string
    warning: string
    error: string
  }
  cornerRadius: number
  borderWidth: number
  /** The pack's own finger gap. Compared against DISPLAY_TOUCH_SEPARATION_PX. */
  touchGap: number
  backgroundAssets: Partial<Record<'landscape' | 'portrait' | 'square', string>>
}

export const DISPLAY_THEME_TOKENS: Readonly<Record<string, DisplayPackThemeTokens>> = DISPLAY_THEME_TOKEN_DATA

export { DISPLAY_ASSET_PACK_VERSION }

/** Every display class the pack targets. Backgrounds are sized per class, so a
 * class that gains its own resolutions gains them through the pack, not here. */
const TOUCH_TFT: readonly DisplayClass[] = ['touch-tft']

export const DISPLAY_ASSETS: Readonly<Record<string, DisplayAssetEntry>> = DISPLAY_ASSET_CATALOGUE_DATA

export function displayAsset(id: string): DisplayAssetEntry | undefined {
  return Object.hasOwn(DISPLAY_ASSETS, id) ? DISPLAY_ASSETS[id] : undefined
}

/** The display classes an asset may be used on. Derived rather than repeated on
 * every entry: the pack exists for the touch panels, and a segment module or
 * small OLED has no design surface to place an asset on — so nothing resolves
 * for those rather than resolving wrongly. A pack that one day ships 1-bit
 * glyphs would give its entries a class of their own here. */
export function displayAssetClasses(): readonly DisplayClass[] {
  return TOUCH_TFT
}

/**
 * The catalogue id an untrusted document may keep, or `''`. Import, paste and
 * property normalization all land here, so an id that no longer exists in the
 * pack is dropped rather than persisted as a dangling reference — and a string
 * that is a path rather than an id can never be stored at all.
 */
export function normalizeDisplayAssetId(value: unknown): string {
  return typeof value === 'string' && displayAsset(value) ? value : ''
}

/** Assets offerable in a widget slot, ordered as the pack declares them. */
export function displayAssetsForSlot(
  kinds: readonly DisplayAssetKind[],
  displayClass: DisplayClass = 'touch-tft',
): DisplayAssetEntry[] {
  return Object.values(DISPLAY_ASSETS).filter((entry) => (
    entry.slots.some((slot) => kinds.includes(slot))
    && displayAssetClasses().includes(displayClass)
  ))
}

/**
 * Flash an asset costs when baked at a given size, in bytes. Vector masters are
 * rasterised at bake time, so the size that matters is the widget's, not the
 * pack's — `entry.width`/`height` are only the fallback for an asset drawn at
 * its native size. An asset that is never baked (theme tokens, a template
 * preview the editor shows and firmware never sees) costs nothing.
 */
export function displayAssetFlashCost(
  entry: DisplayAssetEntry,
  size?: { width: number; height: number },
): number {
  if (entry.bytesPerPixel === 0) return 0
  const width = Math.max(0, Math.round(size?.width ?? entry.width))
  const height = Math.max(0, Math.round(size?.height ?? entry.height))
  return width * height * entry.bytesPerPixel
}

/** Where the browser fetches an asset. Site-root relative in the catalogue, so
 * a deployment under a sub-path resolves through the configured base. */
export function displayAssetUrl(entry: DisplayAssetEntry): string {
  return `/${entry.file}`
}

export function displayAssetsByCategory(category: DisplayAssetCategory): DisplayAssetEntry[] {
  return Object.values(DISPLAY_ASSETS).filter((entry) => entry.category === category)
}

/** The themed control set an id belongs to, for grouping a picker by theme. */
export function displayControlTheme(entry: DisplayAssetEntry): string | undefined {
  return entry.category === 'control' ? entry.id.split(':')[1] : undefined
}
