import type { DisplayBackground, DisplayBounds, DisplayFont, DisplayTheme, DisplayWidget } from './displayDocument'
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
  /** Row pitch for wrapped text. Both renderers lay lines out on it, so a
   *  wrap lands on the same rows in the preview and on the glass. */
  lineHeight: number
  wrap: boolean
  /** Lines actually shown — the authored ceiling, lowered to what the widget
   *  is tall enough to hold when its bounds are known. */
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

/**
 * How far a muted state tints its own surface.
 *
 * One constant for both muted states, because a state is set back by its text
 * colour and its opacity — not by washing its surface toward the very colour
 * its text is about to be drawn in. `disabled` used 0.72 against `inactive`'s
 * 0.14 and so moved its surface most of the way to its own text: every launch
 * theme resolved a disabled control to between 1.14 and 1.39 contrast, which
 * is a blank rounded rectangle rather than a greyed-out label. The fade was
 * already being applied twice over — once in `disabledColor`, which the pack
 * derives by blending its muted text a third of the way to the surface, and
 * again in `opacity`, which both renderers apply — so a third helping only
 * cost the label. Sharing the wash leaves the two states told apart by the
 * two things that are supposed to tell them apart.
 */
const MUTED_SURFACE_WASH = 0.14

export function resolveDisplayThemeTokens(theme: DisplayTheme): DisplayThemeTokens {
  const defaultBorder = mixDisplayColors(theme.textColor, theme.surfaceColor, 0.14)
  const inactiveSurface = mixDisplayColors(theme.inactiveColor, theme.surfaceColor, MUTED_SURFACE_WASH)
  const disabledSurface = mixDisplayColors(theme.disabledColor, theme.surfaceColor, MUTED_SURFACE_WASH)
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

/**
 * Row pitch as a multiple of the font size.
 *
 * Named because the line budget below is computed from it and the DOM lays
 * text out on it; a browser default on one side and a constant on the other
 * would put the clamp and the rendering on different rows.
 */
const LINE_HEIGHT_RATIO = 1.25

/**
 * Chrome a label loses to its widget's own frame, per edge.
 *
 * The editor's widget box draws a border and pads its content, so the height
 * a label can use is smaller than the bounds saved in the document. Counting
 * the bounds alone made the budget one line too generous on a short widget,
 * which is the same overflow this is here to prevent.
 */
export const DISPLAY_WIDGET_TEXT_INSET_PX = 4

/** Text metrics and wrapping are semantic tokens, not DOM CSS choices. */
export function displayWidgetTextTokens(
  widget: Pick<DisplayWidget, 'type' | 'properties'> & { bounds?: DisplayBounds },
  theme: DisplayTheme,
): DisplayWidgetTextTokens {
  const textWidget = widget.type === 'Text'
  const align = stringProperty(widget, 'align')
  const numeric = widget.type === 'Numeric Readout' || widget.type === 'Timecode'
  const fontSize = Math.max(8, Math.min(96, Math.round(numberProperty(widget, 'fontSize') ?? theme.fontSize)))
  const lineHeight = Math.max(1, Math.round(fontSize * LINE_HEIGHT_RATIO))
  const authored = textWidget
    ? Math.max(1, Math.min(4, Math.round(numberProperty(widget, 'maxLines') ?? 2)))
    : 1
  return {
    align: align === 'center' || align === 'right' ? align : 'left',
    font: numeric ? 'mono' : theme.font,
    fontSize,
    lineHeight,
    wrap: textWidget ? (boolProperty(widget, 'wrap') ?? true) : false,
    maxLines: Math.min(authored, linesThatFit(widget.bounds, lineHeight, theme)),
    overflow: 'ellipsis',
  }
}

/**
 * How many whole lines the widget is tall enough to show.
 *
 * `maxLines` is what the author asked for; this is what the glass can
 * actually hold, and the smaller of the two is what gets drawn. Without it a
 * two-line ceiling on a one-line-tall widget renders the second line anyway
 * and lets it spill outside the widget's own bounds — over its neighbours in
 * the middle of a screen, and cut through by the panel edge at the bottom.
 * Rotating a design is what exposes it: the same text reflows into a
 * narrower box and wraps where it previously did not.
 *
 * Bounds are optional because a caller pricing fonts or emitting a style has
 * no layout question to ask; without them the authored ceiling stands.
 */
function linesThatFit(
  bounds: DisplayBounds | undefined,
  lineHeight: number,
  theme: DisplayTheme,
): number {
  if (!bounds) return Number.POSITIVE_INFINITY
  const chrome = 2 * (DISPLAY_WIDGET_TEXT_INSET_PX + Math.max(0, theme.borderWidth))
  return Math.max(1, Math.floor((bounds.height - chrome) / lineHeight))
}
