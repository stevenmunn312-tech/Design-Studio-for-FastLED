import type { CSSProperties } from 'react'
import type { DisplayWidget } from '../../state/displayDocument'
import type { DisplayPreviewRenderer } from '../../state/displayRegistry'
import styles from './DisplayWidgetPreview.module.css'

export interface DisplayWidgetPreviewProps {
  widget: DisplayWidget
  renderer: DisplayPreviewRenderer
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

export default function DisplayWidgetPreview({ widget, renderer, value }: DisplayWidgetPreviewProps) {
  const amount = normalized(widget, value)
  const fillStyle = { '--widget-fill': `${amount * 100}%` } as CSSProperties
  const text = typeof value === 'string' ? value : stringProperty(widget, 'text', widget.label)
  const active = typeof value === 'boolean' ? value : true
  const pressed = value === true

  switch (renderer) {
    case 'text':
      return <span className={styles.text} style={{ color: stringProperty(widget, 'color', 'inherit') }}>{text || widget.label}</span>
    case 'numeric': {
      const decimals = Math.max(0, Math.min(4, Math.round(numberProperty(widget, 'decimals', 1))))
      return <span className={styles.numeric}>{stringProperty(widget, 'prefix')}{numericValue(value, 42).toFixed(decimals)}{stringProperty(widget, 'suffix')}</span>
    }
    case 'timecode':
      return <span className={styles.numeric}>{timecode(numericValue(value, 83), boolProperty(widget, 'showHours'))}</span>
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
    case 'image':
      return <span className={styles.image}>{stringProperty(widget, 'assetId') ? '▧' : 'Choose asset'}</span>
    case 'button':
      return <span className={`${styles.button} ${pressed ? styles.pressed : ''}`}>{stringProperty(widget, 'text', widget.label)}</span>
    case 'toggle':
      return <span className={`${styles.toggle} ${active ? styles.active : ''}`}><span />{active ? stringProperty(widget, 'onLabel', 'On') : stringProperty(widget, 'offLabel', 'Off')}</span>
    case 'slider':
      return <span className={styles.slider} style={fillStyle}><span className={styles.fill} /><span className={styles.thumb} /></span>
    case 'dial':
      return <span className={styles.dial} style={{ '--dial-angle': `${-135 + amount * 270}deg` } as CSSProperties}><span /></span>
  }
}
