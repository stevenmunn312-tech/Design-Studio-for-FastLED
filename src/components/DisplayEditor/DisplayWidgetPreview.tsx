import type { CSSProperties, ReactElement } from 'react'
import type { DisplayTheme, DisplayWidget } from '../../state/displayDocument'
import type { DisplayPreviewRenderer, DisplayWidgetState } from '../../state/displayRegistry'
import { displayAsset, displayAssetUrl } from '../../state/displayAssets'
import { displayWidgetTextTokens } from '../../state/displayTheme'
import styles from './DisplayWidgetPreview.module.css'

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
    '--widget-text-lines': typography.maxLines,
  } as CSSProperties
  const text = typeof value === 'string' ? value : stringProperty(widget, 'text', widget.label)
  const active = state === 'active'
  const pressed = state === 'pressed'

  switch (renderer) {
    case 'text':
      return <span className={`${styles.text} ${typography.wrap ? styles.wrappedText : ''}`} style={{ ...textStyle, color: stringProperty(widget, 'color', 'inherit') }}>{text || widget.label}</span>
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
      const color = typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : '#36c8ff'
      return <span className={styles.swatch} style={{ background: color }}>{boolProperty(widget, 'showHex', true) ? color.toUpperCase() : ''}</span>
    }
    case 'pattern-browser':
      return <span className={styles.pattern}><span className={styles.patternArt}>✦</span><span><strong>Aurora Drift</strong><small>3 of 8</small></span></span>
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
      return (
        <span className={`${styles.button} ${pressed ? styles.pressed : ''} ${icon && !showText ? styles.iconOnly : ''}`}>
          {icon}{showText ? stringProperty(widget, 'text', widget.label) : null}
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
  }
}
