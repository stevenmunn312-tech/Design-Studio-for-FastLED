import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react'
import type { DisplayTheme, DisplayWidget } from '../../state/displays/displayDocument'
import {
  DISPLAY_MARQUEE_DEFAULT_SPEED,
  DISPLAY_PICKER_HUE_MAX,
  DISPLAY_PICKER_MARKER_PX,
  displayChoiceOptions,
  displayControlRange,
  displayControlStartValue,
  displayGaugeGeometry,
  displayMarqueeSpeed,
  displayPickerStartHue,
  displayPickerStops,
  displayStepDecimals,
  displayStepKeyWidth,
  displayWidgetBodyFallback,
  displayWidgetCaptionLayout,
  displayWidgetContentBounds,
  type DisplayPreviewRenderer,
  type DisplayWidgetState,
} from '../../state/displays/displayRegistry'
import { displayAsset, displayAssetUrl } from '../../state/displays/displayAssets'
import { displayWidgetTextTokens, resolveDisplayThemeTokens } from '../../state/displays/displayTheme'
import { formatNumberText, normalizeNumberFormat } from '../../state/displays/displayText'
import { rgbToHex } from '../../state/palettes/customPalette'
import { isPatternSelect } from '../../state/patterns/patternSelection'
import styles from './DisplayWidgetPreview.module.css'

/**
 * LVGL's circular label scroll, as the preview draws it.
 *
 * LVGL 9.5's `LV_LABEL_DEF_SCROLL_SPEED` is `lv_anim_speed_clamped(40, 300,
 * 10000)`: 40 px/s, but one loop never takes less than 0.3 s or more than
 * 10 s, so text over 400 px travels faster. The loop's gap is three spaces
 * (`LV_LABEL_WAIT_CHAR_COUNT`). Text that fits does not move, on either.
 */
const SCROLL_MIN_MS = 300
const SCROLL_MAX_MS = 10000
const SCROLL_GAP = '   '

function ScrollingText({ text, className, style }: { text: string; className: string; style: CSSProperties }) {
  const outer = useRef<HTMLSpanElement>(null)
  const inner = useRef<HTMLSpanElement>(null)
  const [overflows, setOverflows] = useState(false)

  // Layout widths, not rendered ones: the surface is scaled with a transform,
  // and the speed is in the panel's own pixels.
  useLayoutEffect(() => {
    const box = outer.current
    const first = inner.current?.firstElementChild as HTMLElement | null
    if (!box || !first) return
    const measure = () => setOverflows(first.offsetWidth > box.clientWidth + 0.5)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(box)
    return () => observer.disconnect()
  }, [text])

  useLayoutEffect(() => {
    const track = inner.current
    const first = track?.firstElementChild as HTMLElement | null
    if (!overflows || !track || !first) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const distance = first.offsetWidth
    // Transform only, never a filter: an endless animation on a filtered
    // layer is what kept GPU memory climbing until the tab died.
    const animation = track.animate?.(
      [{ transform: 'translateX(0)' }, { transform: `translateX(${-distance}px)` }],
      {
        duration: Math.min(SCROLL_MAX_MS, Math.max(SCROLL_MIN_MS, (distance / DISPLAY_MARQUEE_DEFAULT_SPEED) * 1000)),
        iterations: Infinity,
        easing: 'linear',
      },
    )
    return () => animation?.cancel()
  }, [overflows, text])

  return (
    <span ref={outer} className={className} style={{ ...style, textOverflow: 'clip' }}>
      <span ref={inner} className={styles.scrollTrack}>
        <span>{text}{overflows ? SCROLL_GAP : ''}</span>
        {overflows && <span aria-hidden="true">{text}{SCROLL_GAP}</span>}
      </span>
    </span>
  )
}

/**
 * A Marquee, as `_cdSetMarquee` moves it on the glass: the text starts at the
 * left edge, travels left at `speed` panel pixels per second until it has
 * gone, then enters again from the right. New text keeps the place the old
 * had reached, or starts again from the right when it is too short to be
 * there.
 */
function MarqueeText({ text, speed, className, style }: { text: string; speed: number; className: string; style: CSSProperties }) {
  const outer = useRef<HTMLSpanElement>(null)
  const inner = useRef<HTMLSpanElement>(null)
  const [width, setWidth] = useState(0)
  // How far the text has travelled from the right edge; null until it moves,
  // which is the text standing at the left edge.
  const travelled = useRef<number | null>(null)

  // Layout widths, not rendered ones: the surface is scaled with a transform,
  // and the speed is in the panel's own pixels.
  useLayoutEffect(() => {
    const box = outer.current
    if (!box) return
    const measure = () => setWidth(box.clientWidth)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(box)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    const line = inner.current
    if (!line || width <= 0) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const from = width
    const to = -line.offsetWidth
    const distance = from - to
    const at = travelled.current ?? from
    // Transform only, never a filter: an endless animation on a filtered
    // layer is what kept GPU memory climbing until the tab died.
    const animation = line.animate?.(
      [{ transform: `translateX(${from}px)` }, { transform: `translateX(${to}px)` }],
      { duration: (distance / speed) * 1000, iterations: Infinity, easing: 'linear' },
    )
    if (!animation) return
    animation.currentTime = at > 0 && at < distance ? (at / speed) * 1000 : 0
    return () => {
      const time = Number(animation.currentTime ?? 0)
      travelled.current = ((time / 1000) * speed) % distance
      animation.cancel()
    }
  }, [text, speed, width])

  return (
    <span ref={outer} className={`${className} ${styles.marquee}`} style={{ ...style, textOverflow: 'clip' }}>
      <span ref={inner} className={styles.scrollTrack}>{text}</span>
    </span>
  )
}

export interface DisplayWidgetPreviewProps {
  widget: DisplayWidget
  renderer: DisplayPreviewRenderer
  theme: DisplayTheme
  state: DisplayWidgetState
  value?: unknown
}

function numberProperty(widget: DisplayWidget, key: string, fallback: number): number {
  const value = widget.properties[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function stringProperty(widget: DisplayWidget, key: string, fallback = ''): string {
  const value = widget.properties[key]
  return typeof value === 'string' ? value : fallback
}

function boolProperty(widget: DisplayWidget, key: string, fallback = false): boolean {
  const value = widget.properties[key]
  return typeof value === 'boolean' ? value : fallback
}

function numericValue(value: unknown, fallback = 0.62): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function normalized(widget: DisplayWidget, value: unknown): number {
  const min = numberProperty(widget, 'min', 0)
  const max = numberProperty(widget, 'max', 1)
  return Math.max(0, Math.min(1, (numericValue(value) - min) / Math.max(Number.EPSILON, max - min)))
}

function colorValue(value: unknown): string {
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) return value
  if (value && typeof value === 'object') {
    const color = value as { r?: unknown; g?: unknown; b?: unknown }
    if ([color.r, color.g, color.b].every((channel) => typeof channel === 'number')) {
      return rgbToHex(color as { r: number; g: number; b: number })
    }
  }
  return '#36c8ff'
}

function timecode(seconds: number, showHours: boolean): string {
  const whole = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const rest = whole % 60
  return showHours || hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
    : `${minutes}:${String(rest).padStart(2, '0')}`
}

/**
 * The optional icon a Button or Toggle carries, honouring its `presentation`.
 *
 * Themed player-control art is drawn as it comes rather than tinted: a set is
 * chosen for its own colours, unlike the semantic glyphs an Image/Icon masks to
 * one tint. An icon-only control with no asset chosen still shows its text —
 * a blank key and a broken one look identical on a panel.
 */
function controlIcon(widget: DisplayWidget): { icon: ReactElement | null; showText: boolean } {
  const presentation = stringProperty(widget, 'presentation', 'text')
  if (presentation === 'text') return { icon: null, showText: true }
  const asset = displayAsset(stringProperty(widget, 'assetId'))
  if (!asset) return { icon: null, showText: true }
  return {
    icon: <img className={styles.controlIcon} src={displayAssetUrl(asset)} alt="" aria-hidden="true" />,
    showText: presentation !== 'icon',
  }
}

export default function DisplayWidgetPreview({ widget, renderer, theme, state, value }: DisplayWidgetPreviewProps) {
  const amount = normalized(widget, value)
  const fillStyle = { '--widget-fill': `${amount * 100}%` } as CSSProperties
  const typography = displayWidgetTextTokens(widget, theme)
  const textStyle = {
    '--widget-text-align': typography.align,
    '--widget-text-font': typography.font === 'mono' ? 'var(--font-code)' : 'var(--font-body)',
    '--widget-text-size': `${typography.fontSize}px`,
    // The pitch the line budget was computed against. Left to the browser's
    // default the two disagree, and a clamp measured in rows the renderer
    // does not use is no clamp at all.
    '--widget-text-line-height': `${typography.lineHeight}px`,
    '--widget-text-lines': typography.maxLines,
  } as CSSProperties
  // A reading, once there is one, is shown as it is — an empty artist is a
  // blank row, as on the glass, not the widget's placeholder. The authored
  // text stands in only while nothing has been read at all (the designer, or
  // a field this source never publishes).
  const text = typeof value === 'string'
    ? value
    : stringProperty(widget, 'text') || displayWidgetBodyFallback(widget)
  const active = state === 'active'
  const pressed = state === 'pressed'

  const body = (() => {
  switch (renderer) {
    case 'text':
      if (typography.overflow === 'scroll') {
        return <ScrollingText text={text} className={styles.text} style={{ ...textStyle, color: stringProperty(widget, 'color', 'inherit') }} />
      }
      return <span className={`${styles.text} ${typography.wrap ? styles.wrappedText : ''}`} style={{ ...textStyle, color: stringProperty(widget, 'color', 'inherit') }}>{text}</span>
    case 'marquee':
      return <MarqueeText text={text} speed={displayMarqueeSpeed(widget)} className={styles.text} style={{ ...textStyle, color: stringProperty(widget, 'color', 'inherit') }} />
    case 'numeric': {
      const decimals = Math.max(0, Math.min(4, Math.round(numberProperty(widget, 'decimals', 1))))
      return <span className={styles.numeric} style={textStyle}>{stringProperty(widget, 'prefix')}{numericValue(value, 42).toFixed(decimals)}{stringProperty(widget, 'suffix')}</span>
    }
    case 'timecode':
      return <span className={styles.numeric} style={textStyle}>{timecode(numericValue(value, 83), boolProperty(widget, 'showHours'))}</span>
    case 'progress':
      return <span className={styles.track} style={fillStyle}><span className={styles.fill} /></span>
    case 'meter':
      return <span className={`${styles.track} ${stringProperty(widget, 'orientation') === 'vertical' ? styles.vertical : ''}`} style={fillStyle}><span className={styles.fill} /></span>
    case 'status':
      return <span className={`${styles.status} ${active ? styles.active : ''}`}><span />{active ? stringProperty(widget, 'onLabel', 'ON') : stringProperty(widget, 'offLabel', 'OFF')}</span>
    case 'swatch': {
      const color = colorValue(value)
      return <span className={styles.swatch} style={{ background: color }}>{boolProperty(widget, 'showHex', true) ? color.toUpperCase() : ''}</span>
    }
    case 'pattern-browser': {
      const selection = isPatternSelect(value) ? value : null
      const index = selection
        ? (selection.browsing ? selection.highlightIndex : selection.activeIndex)
        : -1
      const name = selection && index >= 0
        ? selection.names[index] || selection.ids[index] || 'Unnamed pattern'
        : 'No patterns'
      const ordinal = selection && index >= 0 ? `${index + 1} of ${selection.count}` : '0 of 0'
      return (
        <span className={styles.pattern}>
          {boolProperty(widget, 'showThumbnail', true) && <span className={styles.patternArt}>✦</span>}
          <span><strong>{name}</strong>{boolProperty(widget, 'showOrdinal', true) && <small>{ordinal}</small>}</span>
        </span>
      )
    }
    case 'image': {
      const asset = displayAsset(stringProperty(widget, 'assetId'))
      if (!asset) return <span className={styles.image}>Choose asset</span>
      // A tintable glyph is an alpha mask, so a tint paints through it rather
      // than recolouring the pack's own strokes — the same thing the firmware
      // baker does with an 8-bit mask and one colour.
      if (asset.tintable && boolProperty(widget, 'tint')) {
        const mask = `url("${displayAssetUrl(asset)}")`
        return (
          <span
            className={styles.imageAsset}
            role="img"
            aria-label={asset.label}
            style={{
              maskImage: mask,
              WebkitMaskImage: mask,
              background: stringProperty(widget, 'tintColor', '#f4f7ff'),
            }}
          />
        )
      }
      return <img className={styles.imageAsset} src={displayAssetUrl(asset)} alt={asset.label} />
    }
    case 'button': {
      const { icon, showText } = controlIcon(widget)
      const face = stringProperty(widget, 'text') || displayWidgetBodyFallback(widget)
      return (
        <span className={`${styles.button} ${pressed ? styles.pressed : ''} ${icon && !showText ? styles.iconOnly : ''}`}>
          {icon}{showText ? face : null}
        </span>
      )
    }
    case 'toggle': {
      const { icon, showText } = controlIcon(widget)
      return (
        <span className={`${styles.toggle} ${active ? styles.active : ''} ${icon && !showText ? styles.iconOnly : ''}`}>
          <span />{icon}
          {showText ? (active ? stringProperty(widget, 'onLabel', 'On') : stringProperty(widget, 'offLabel', 'Off')) : null}
        </span>
      )
    }
    case 'slider':
      return <span className={styles.slider} style={fillStyle}><span className={styles.fill} /><span className={styles.thumb} /></span>
    case 'dial':
      return <span className={styles.dial} style={{ '--dial-angle': `${-135 + amount * 270}deg` } as CSSProperties}><span /></span>
    case 'choice': {
      // The chosen option wears the theme's active state, as its LVGL button
      // does when checked.
      const selected = Math.round(numericValue(value, displayControlStartValue(widget) ?? 0))
      const chosen = resolveDisplayThemeTokens(theme).states.active
      return (
        <span className={styles.choice}>
          {displayChoiceOptions(widget).map((option, index) => (
            <span
              key={index}
              className={styles.choiceOption}
              data-selected={index === selected || undefined}
              style={index === selected
                ? { background: chosen.surfaceColor, color: chosen.textColor }
                : undefined}
            >
              {option}
            </span>
          ))}
        </span>
      )
    }
    case 'stepper': {
      const current = numericValue(value, displayControlStartValue(widget) ?? displayControlRange(widget).min)
      // Keys laid out in the pixels the emitter uses, as a share of the width
      // so they scale with the canvas.
      const content = widget.bounds
        ? displayWidgetContentBounds({ ...widget, bounds: widget.bounds }, typography.fontSize)
        : null
      const key = content ? `${(displayStepKeyWidth(content.width, content.height) / content.width) * 100}%` : '33%'
      return (
        <span className={styles.stepper} style={{ '--step-key': key } as CSSProperties}>
          <span className={styles.stepKey}>-</span>
          <span className={styles.stepValue}>{current.toFixed(displayStepDecimals(widget))}</span>
          <span className={styles.stepKey}>+</span>
        </span>
      )
    }
    case 'colour-picker': {
      // Seven stops, 60 degrees apart: the six two-stop segments the LVGL
      // strip is built from, so both show the same colour under a finger.
      const stops = displayPickerStops(widget)
        .map((stop, index) => `${rgbToHex(stop)} ${((index / 6) * 100).toFixed(4)}%`)
        .join(', ')
      const hue = numericValue(value, displayPickerStartHue(widget))
      const at = Math.max(0, Math.min(1, hue / DISPLAY_PICKER_HUE_MAX))
      return (
        <span
          className={styles.picker}
          style={{
            background: `linear-gradient(to right, ${stops})`,
            '--picker-at': `${at * 100}%`,
            '--picker-marker': `${DISPLAY_PICKER_MARKER_PX}px`,
          } as CSSProperties}
        >
          <span className={styles.pickerMarker} />
        </span>
      )
    }
    case 'gauge': {
      // Drawn in the content box's own pixels, from the geometry the LVGL
      // arc is sized by: 270 degrees from 135, clockwise, gap at the bottom.
      const content = widget.bounds
        ? displayWidgetContentBounds({ ...widget, bounds: widget.bounds }, typography.fontSize)
        : { width: 64, height: 64 }
      const { size, stroke } = displayGaugeGeometry(content.width, content.height, resolveDisplayThemeTokens(theme).borderWidth)
      const radius = Math.max(0.5, (size - stroke) / 2)
      // The same resting reading `normalized` fills the arc from.
      const reading = numericValue(value)
      const arc = (sweep: number) => ({
        cx: size / 2, cy: size / 2, r: radius, fill: 'none', strokeWidth: stroke,
        pathLength: 360, strokeDasharray: `${sweep} 360`,
        transform: `rotate(135 ${size / 2} ${size / 2})`,
      })
      return (
        <span className={styles.gauge}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
            <circle {...arc(270)} className={styles.gaugeTrack} />
            {amount > 0 && <circle {...arc(270 * amount)} className={styles.gaugeFill} />}
          </svg>
          {boolProperty(widget, 'showValue', true) && (
            <span className={styles.gaugeValue} style={textStyle}>
              {formatNumberText(reading, normalizeNumberFormat(widget.properties))}
            </span>
          )}
        </span>
      )
    }
  }
  })()

  // Laid out in the pixels displayRegistry resolved, not in ems: the caption
  // takes the same strip out of the widget here as it does on the glass.
  const caption = displayWidgetCaptionLayout(widget, typography.fontSize, widget.bounds?.height)
  if (!caption) return body
  return (
    <span
      className={styles.labeled}
      style={{ '--widget-caption-gap': `${caption.gap}px` } as CSSProperties}
    >
      <span
        className={styles.caption}
        style={{
          height: caption.height,
          fontSize: caption.fontSize,
          lineHeight: `${caption.height}px`,
        }}
      >
        {caption.text}
      </span>
      {body}
    </span>
  )
}
