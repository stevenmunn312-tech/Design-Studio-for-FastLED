import { describe, expect, it } from 'vitest'
import { DEFAULT_DISPLAY_THEME, type DisplayWidget } from '../displayDocument'
import {
  displayWidgetTextTokens,
  displayWidgetVisualState,
  mixDisplayColors,
  resolveDisplayThemeTokens,
} from '../displayTheme'

function widget(
  type: DisplayWidget['type'],
  properties: DisplayWidget['properties'] = {},
  height = 48,
): DisplayWidget {
  return {
    id: type.toLowerCase().replaceAll(' ', '-'),
    type,
    label: type,
    bounds: { x: 0, y: 0, width: 100, height },
    properties,
  }
}

describe('display theme tokens', () => {
  it('resolves every semantic widget state without renderer-specific colour mixing', () => {
    const tokens = resolveDisplayThemeTokens(DEFAULT_DISPLAY_THEME)

    expect(Object.keys(tokens.states)).toEqual(['default', 'pressed', 'active', 'inactive', 'disabled'])
    expect(tokens.states.default).toMatchObject({
      surfaceColor: DEFAULT_DISPLAY_THEME.surfaceColor,
      textColor: DEFAULT_DISPLAY_THEME.textColor,
      indicatorColor: DEFAULT_DISPLAY_THEME.accentColor,
      opacity: 1,
      pressedOffset: 0,
    })
    expect(tokens.states.pressed).toMatchObject({
      borderColor: DEFAULT_DISPLAY_THEME.accentColor,
      pressedOffset: 1,
    })
    expect(tokens.states.active.indicatorColor).toBe(DEFAULT_DISPLAY_THEME.successColor)
    expect(tokens.states.inactive.indicatorColor).toBe(DEFAULT_DISPLAY_THEME.inactiveColor)
    expect(tokens.states.disabled.opacity).toBeLessThan(tokens.states.inactive.opacity)
    for (const state of Object.values(tokens.states)) {
      for (const color of [state.surfaceColor, state.textColor, state.borderColor, state.indicatorColor, state.trackColor, state.thumbColor]) {
        expect(color).toMatch(/^#[0-9a-f]{6}$/)
      }
    }
  })

  it('uses deterministic RGB blends that can also be emitted by LVGL codegen', () => {
    expect(mixDisplayColors('#ffffff', '#000000', 0)).toBe('#000000')
    expect(mixDisplayColors('#ffffff', '#000000', 0.5)).toBe('#808080')
    expect(mixDisplayColors('#ffffff', '#000000', 1)).toBe('#ffffff')
  })

  it('retains solid, gradient, and baked-image background contracts', () => {
    expect(resolveDisplayThemeTokens(DEFAULT_DISPLAY_THEME).background).toEqual({ kind: 'solid', color: '#080b12' })
    expect(resolveDisplayThemeTokens({
      ...DEFAULT_DISPLAY_THEME,
      background: { kind: 'gradient', startColor: '#001122', endColor: '#334455', direction: 'vertical' },
    }).background).toEqual({
      kind: 'gradient', startColor: '#001122', endColor: '#334455', direction: 'vertical',
    })
    expect(resolveDisplayThemeTokens({
      ...DEFAULT_DISPLAY_THEME,
      background: { kind: 'image', assetId: 'backgrounds/now-playing' },
    }).background).toEqual({
      kind: 'image', assetId: 'backgrounds/now-playing', fallbackColor: DEFAULT_DISPLAY_THEME.surfaceColor,
    })
  })

  it('defines state selection and text wrapping independently of the DOM', () => {
    expect(displayWidgetVisualState(widget('Button'), true)).toBe('pressed')
    expect(displayWidgetVisualState(widget('Button'), false)).toBe('default')
    expect(displayWidgetVisualState(widget('Toggle'), true)).toBe('active')
    expect(displayWidgetVisualState(widget('Toggle'), false)).toBe('inactive')
    expect(displayWidgetVisualState(widget('Slider'), 0.5, { pressed: true })).toBe('pressed')
    expect(displayWidgetVisualState(widget('Toggle'), true, { disabled: true })).toBe('disabled')

    expect(displayWidgetTextTokens(widget('Text', {
      align: 'center', fontSize: 22, wrap: true, maxLines: 3,
    }, 120), DEFAULT_DISPLAY_THEME)).toEqual({
      align: 'center', font: 'sans', fontSize: 22, lineHeight: 28,
      wrap: true, maxLines: 3, overflow: 'ellipsis',
    })
    expect(displayWidgetTextTokens(widget('Numeric Readout'), DEFAULT_DISPLAY_THEME)).toMatchObject({
      font: 'mono', wrap: false, maxLines: 1,
    })
  })

  it('never budgets more lines than the widget is tall enough to show', () => {
    // The authored ceiling is what the author wants; this is what the glass
    // can hold. A widget rendering the extra line anyway spills outside its
    // own bounds — over its neighbours mid-screen, and cut through by the
    // panel edge at the bottom, which is what a rotation exposes when the
    // same text reflows into a narrower box.
    const asked = { fontSize: 22, wrap: true, maxLines: 4 }
    expect(displayWidgetTextTokens(widget('Text', asked, 48), DEFAULT_DISPLAY_THEME).maxLines).toBe(1)
    expect(displayWidgetTextTokens(widget('Text', asked, 160), DEFAULT_DISPLAY_THEME).maxLines).toBe(4)
    // Never zero: a widget too short for even one line still shows the line
    // it has, clipped by its own box, rather than rendering nothing at all.
    expect(displayWidgetTextTokens(widget('Text', asked, 4), DEFAULT_DISPLAY_THEME).maxLines).toBe(1)
  })

  it('leaves the authored ceiling alone when there are no bounds to judge', () => {
    // Pricing a font or emitting a style asks no layout question, so a caller
    // without bounds must not be handed a budget derived from a guess.
    const placed = widget('Text', { fontSize: 22, maxLines: 3 })
    expect(displayWidgetTextTokens(
      { type: placed.type, properties: placed.properties },
      DEFAULT_DISPLAY_THEME,
    ).maxLines).toBe(3)
  })
})
