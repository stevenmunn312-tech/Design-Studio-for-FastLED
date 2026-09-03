import { describe, expect, it } from 'vitest'
import {
  DISPLAY_THEME_PRESETS,
  applyDisplayThemePreset,
  displayThemeBackgroundFor,
  displayThemePreset,
} from '../displayThemePresets'
import { DEFAULT_DISPLAY_THEME } from '../displayDocument'
import { resolveDisplayThemeTokens } from '../displayTheme'
import { displayAsset } from '../displayAssets'
import { DISPLAY_TOUCH_SEPARATION_PX } from '../displayRegistry'
import { DISPLAY_THEME_TOKENS } from '../displayAssets'

describe('pack theme presets', () => {
  it('offers every pack theme as a complete, resolvable studio theme', () => {
    expect(DISPLAY_THEME_PRESETS).toHaveLength(18)
    for (const preset of DISPLAY_THEME_PRESETS) {
      expect(preset.id).toMatch(/^theme:/)
      for (const role of ['surfaceColor', 'textColor', 'accentColor', 'warningColor',
        'successColor', 'inactiveColor', 'disabledColor'] as const) {
        expect(preset.theme[role], `${preset.id}.${role}`).toMatch(/^#[0-9a-f]{6}$/)
      }
      // Resolving is what the DOM preview and the LVGL emitter both do; a
      // preset that cannot produce five states is not usable by either.
      const tokens = resolveDisplayThemeTokens(preset.theme)
      expect(Object.keys(tokens.states)).toEqual(['default', 'pressed', 'active', 'inactive', 'disabled'])
      expect(tokens.background.kind).toBe('gradient')
    }
  })

  it('blends the two roles the pack expresses as opacity rather than colour', () => {
    const neon = displayThemePreset('theme:01-neon-orbit')!
    const { colours } = DISPLAY_THEME_TOKENS['theme:01-neon-orbit']
    // Muted text sits between the pack's own muted colour and its surface, so
    // an inactive control reads dimmer than a live one on every theme.
    expect(neon.theme.inactiveColor).not.toBe(colours.textMuted)
    expect(neon.theme.disabledColor).not.toBe(neon.theme.inactiveColor)
    expect(neon.theme).toMatchObject({
      surfaceColor: colours.surface,
      textColor: colours.text,
      accentColor: colours.accent,
      cornerRadius: 12,
      borderWidth: 2,
    })
  })

  it('keeps the document’s own legibility choices when a preset is applied', () => {
    const authored = { ...DEFAULT_DISPLAY_THEME, font: 'mono' as const, fontSize: 24 }
    const applied = applyDisplayThemePreset(authored, 'theme:03-synthwave')

    expect(applied).toMatchObject({ font: 'mono', fontSize: 24 })
    expect(applied.accentColor).not.toBe(authored.accentColor)
    expect(applyDisplayThemePreset(authored, 'theme:not-installed')).toBe(authored)
  })

  it('names a baked background that the asset registry actually has', () => {
    const preset = displayThemePreset('theme:07-aurora')!
    const landscape = displayThemeBackgroundFor(preset, { width: 320, height: 240 })
    const portrait = displayThemeBackgroundFor(preset, { width: 240, height: 320 })
    const square = displayThemeBackgroundFor(preset, { width: 240, height: 240 })

    expect(landscape).toBe('background:07-aurora:320x240')
    for (const id of [landscape, portrait, square]) {
      expect(displayAsset(id!)).toMatchObject({ category: 'background' })
    }
  })

  it('agrees with the studio about how far apart a finger needs targets', () => {
    // The pack authored its own touchGap. If a future pack disagrees, the
    // editor's separation rule and the art it lays out would drift apart.
    for (const tokens of Object.values(DISPLAY_THEME_TOKENS)) {
      expect(tokens.touchGap, tokens.id).toBe(DISPLAY_TOUCH_SEPARATION_PX)
    }
  })
})
