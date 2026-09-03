import type { DisplayBackground, DisplayFont, DisplayTheme, DisplayWidget } from './displayDocument'
import type { DisplayWidgetState } from './displayRegistry'

/**
 * Renderer-neutral display tokens. The DOM preview and the LVGL emitter must
 * resolve authored themes through this module instead of inventing their own
 * state colours or text rules.
 */
export interface DisplayWidgetStateTokens {
  surfaceColor: string
  textColor: string
  borderColor: string
  indicatorColor: string
  trackColor: string
  thumbColor: string
  opacity: number
  pressedOffset: number
}

export type DisplayBackgroundTokens =
  | { kind: 'solid'; color: string }
  | { kind: 'gradient'; startColor: string; endColor: string; direction: 'horizontal' | 'vertical' }
  | { kind: 'image'; assetId: string; fallbackColor: string }

export interface DisplayThemeTokens {
  background: DisplayBackgroundTokens
  font: DisplayFont
  fontSize: number
  cornerRadius: number
  borderWidth: number
  states: Readonly<Record<DisplayWidgetState, DisplayWidgetStateTokens>>
}

export interface DisplayWidgetTextTokens {
  align: 'left' | 'center' | 'right'
  font: DisplayFont
  fontSize: number
  wrap: boolean
  maxLines: number
  overflow: 'ellipsis'
}

export interface DisplayWidgetStateContext {
  pressed?: boolean
  active?: boolean
  disabled?: boolean
}

function rgb(color: string): [number, number, number] {
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ]
}

function channel(value: number): string {
  return Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, '0')
}

/** Blend two normalized theme colours without relying on CSS color-mix, so
 * firmware can consume exactly the same resolved colour. */
export function mixDisplayColors(foreground: string, background: string, foregroundAmount: number): string {
  const amount = Math.max(0, Math.min(1, foregroundAmount))
  const front = rgb(foreground)
  const back = rgb(background)
  return `#${front.map((value, index) => channel(value * amount + back[index] * (1 - amount))).join('')}`
}

function backgroundTokens(background: DisplayBackground, fallbackColor: string): DisplayBackgroundTokens {
  if (background.kind === 'gradient') return { ...background }
  if (background.kind === 'image') return { ...background, fallbackColor }
  return { ...background }
}

export function resolveDisplayThemeTokens(theme: DisplayTheme): DisplayThemeTokens {
  const defaultBorder = mixDisplayColors(theme.textColor, theme.surfaceColor, 0.14)
  const inactiveSurface = mixDisplayColors(theme.inactiveColor, theme.surfaceColor, 0.14)
  const disabledSurface = mixDisplayColors(theme.disabledColor, theme.surfaceColor, 0.72)
  return {
    background: backgroundTokens(theme.background, theme.surfaceColor),
    font: theme.font,
    fontSize: theme.fontSize,
    cornerRadius: theme.cornerRadius,
    borderWidth: theme.borderWidth,
    states: {
      default: {
        surfaceColor: theme.surfaceColor,
        textColor: theme.textColor,
        borderColor: defaultBorder,
        indicatorColor: theme.accentColor,
        trackColor: mixDisplayColors(theme.textColor, theme.surfaceColor, 0.18),
        thumbColor: theme.textColor,
        opacity: 1,
        pressedOffset: 0,
      },
      pressed: {
        surfaceColor: mixDisplayColors(theme.accentColor, theme.surfaceColor, 0.34),
        textColor: theme.textColor,
        borderColor: theme.accentColor,
        indicatorColor: theme.accentColor,
        trackColor: mixDisplayColors(theme.accentColor, theme.surfaceColor, 0.42),
        thumbColor: theme.textColor,
        opacity: 1,
        pressedOffset: 1,
      },
      active: {
        surfaceColor: mixDisplayColors(theme.accentColor, theme.surfaceColor, 0.22),
        textColor: theme.textColor,
        borderColor: mixDisplayColors(theme.accentColor, theme.surfaceColor, 0.72),
        indicatorColor: theme.successColor,
        trackColor: mixDisplayColors(theme.accentColor, theme.surfaceColor, 0.36),
        thumbColor: theme.textColor,
        opacity: 1,
        pressedOffset: 0,
      },
      inactive: {
        surfaceColor: inactiveSurface,
        textColor: theme.inactiveColor,
        borderColor: mixDisplayColors(theme.inactiveColor, theme.surfaceColor, 0.38),
        indicatorColor: theme.inactiveColor,
        trackColor: mixDisplayColors(theme.inactiveColor, theme.surfaceColor, 0.24),
        thumbColor: theme.inactiveColor,
        opacity: 0.82,
        pressedOffset: 0,
      },
      disabled: {
        surfaceColor: disabledSurface,
        textColor: theme.disabledColor,
        borderColor: mixDisplayColors(theme.disabledColor, theme.surfaceColor, 0.55),
        indicatorColor: theme.disabledColor,
        trackColor: disabledSurface,
        thumbColor: theme.disabledColor,
        opacity: 0.58,
        pressedOffset: 0,
      },
    },
  }
}

export function displayWidgetVisualState(
  widget: Pick<DisplayWidget, 'type'>,
  value: unknown,
  context: DisplayWidgetStateContext = {},
): DisplayWidgetState {
  if (context.disabled) return 'disabled'
  if (context.pressed || (widget.type === 'Button' && value === true)) return 'pressed'
  if (context.active !== undefined) return context.active ? 'active' : 'inactive'
  if ((widget.type === 'Toggle' || widget.type === 'Status Indicator') && typeof value === 'boolean') {
    return value ? 'active' : 'inactive'
  }
  return 'default'
}

function stringProperty(widget: Pick<DisplayWidget, 'properties'>, key: string): string | undefined {
  const value = widget.properties[key]
  return typeof value === 'string' ? value : undefined
}

function numberProperty(widget: Pick<DisplayWidget, 'properties'>, key: string): number | undefined {
  const value = widget.properties[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function boolProperty(widget: Pick<DisplayWidget, 'properties'>, key: string): boolean | undefined {
  const value = widget.properties[key]
  return typeof value === 'boolean' ? value : undefined
}

/** Text metrics and wrapping are semantic tokens, not DOM CSS choices. */
export function displayWidgetTextTokens(
  widget: Pick<DisplayWidget, 'type' | 'properties'>,
  theme: DisplayTheme,
): DisplayWidgetTextTokens {
  const textWidget = widget.type === 'Text'
  const align = stringProperty(widget, 'align')
  const numeric = widget.type === 'Numeric Readout' || widget.type === 'Timecode'
  return {
    align: align === 'center' || align === 'right' ? align : 'left',
    font: numeric ? 'mono' : theme.font,
    fontSize: Math.max(8, Math.min(96, Math.round(numberProperty(widget, 'fontSize') ?? theme.fontSize))),
    wrap: textWidget ? (boolProperty(widget, 'wrap') ?? true) : false,
    maxLines: textWidget
      ? Math.max(1, Math.min(4, Math.round(numberProperty(widget, 'maxLines') ?? 2)))
      : 1,
    overflow: 'ellipsis',
  }
}
