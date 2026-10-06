import { DISPLAY_THEME_TOKENS, type DisplayPackThemeTokens } from './displayAssets'
import { DEFAULT_DISPLAY_THEME, type DisplayTheme } from './displayDocument'
import { mixDisplayColors } from './displayTheme'

/*
 * The design pack's themes, as presets a document can take.
 *
 * A preset is applied, not referenced. Picking one writes concrete colours into
 * the document's own `DisplayTheme`, so a workspace stays readable with no pack
 * installed, a retired theme cannot leave a document unrenderable, and codegen
 * stays synchronous — the same reasoning that keeps an asset *id* in a document
 * but resolves its file through the registry.
 *
 * Two of the studio's roles have no pack counterpart. `inactive` and `disabled`
 * are expressed in the pack as state *opacities* rather than colours, while
 * `displayTheme.ts` resolves five states from a palette. They are blended here,
 * once, through the same `mixDisplayColors` the DOM preview and the LVGL
 * emitter use, rather than restated as literals per theme.
 */

/** How far a muted role sits from the surface it is drawn on. */
const INACTIVE_MIX = 0.62
const DISABLED_MIX = 0.34

export interface DisplayThemePreset {
  id: string
  name: string
  theme: DisplayTheme
  /** Baked backgrounds this theme ships, by shape. */
  backgroundAssets: DisplayPackThemeTokens['backgroundAssets']
}

export function displayThemeFromPackTokens(tokens: DisplayPackThemeTokens): DisplayTheme {
  const { colours } = tokens
  return {
    // A pack theme leads with its two-stop background; a flat colour would
    // throw away the thing that distinguishes most of these sets on a panel.
    background: {
      kind: 'gradient',
      startColor: colours.backgroundStart,
      endColor: colours.backgroundEnd,
      direction: 'vertical',
    },
    surfaceColor: colours.surface,
    textColor: colours.text,
    accentColor: colours.accent,
    warningColor: colours.warning,
    successColor: colours.success,
    inactiveColor: mixDisplayColors(colours.textMuted, colours.surface, INACTIVE_MIX),
    disabledColor: mixDisplayColors(colours.textMuted, colours.surface, DISABLED_MIX),
    font: DEFAULT_DISPLAY_THEME.font,
    fontSize: DEFAULT_DISPLAY_THEME.fontSize,
    cornerRadius: tokens.cornerRadius,
    borderWidth: tokens.borderWidth,
  }
}

export const DISPLAY_THEME_PRESETS: readonly DisplayThemePreset[] = Object.values(DISPLAY_THEME_TOKENS)
  .map((tokens) => ({
    id: tokens.id,
    name: tokens.name,
    theme: displayThemeFromPackTokens(tokens),
    backgroundAssets: tokens.backgroundAssets,
  }))

export function displayThemePreset(id: string): DisplayThemePreset | undefined {
  return DISPLAY_THEME_PRESETS.find((preset) => preset.id === id)
}

/**
 * A preset applied to a document, keeping what the document decided for itself.
 *
 * Font and text size stay: they are legibility choices for one screen at one
 * size, not part of a theme's identity, and silently resizing every label
 * because someone tried a palette is the kind of edit nobody asks for.
 */
export function applyDisplayThemePreset(current: DisplayTheme, id: string): DisplayTheme {
  const preset = displayThemePreset(id)
  if (!preset) return current
  return { ...preset.theme, font: current.font, fontSize: current.fontSize }
}

/** The theme's baked background for a document of this size, if it ships one. */
export function displayThemeBackgroundFor(
  preset: DisplayThemePreset,
  size: { width: number; height: number },
): string | undefined {
  if (size.width === size.height) return preset.backgroundAssets.square
  return size.width > size.height ? preset.backgroundAssets.landscape : preset.backgroundAssets.portrait
}
