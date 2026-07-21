import type { CSSProperties, ReactNode } from 'react'
import styles from './IndustrialUI.module.css'

type Accent = 'amber' | 'cyan' | 'blue' | 'green' | 'violet'

const accentColor: Record<Accent, string> = {
  amber: '#f4ad22',
  cyan: '#2fd8ff',
  blue: '#247dff',
  green: '#79bd42',
  violet: '#8d48cb',
}

export interface RackPanelProps {
  title?: string
  eyebrow?: string
  children: ReactNode
  className?: string
}

export function Screw({ className = '' }: { className?: string }) {
  return <span className={`${styles.screw} ${className}`} aria-hidden="true" />
}

export function RackPanel({ title, eyebrow, children, className = '' }: RackPanelProps) {
  return (
    <section className={`${styles.panel} ${className}`}>
      <Screw className={styles.screwTopLeft} />
      <Screw className={styles.screwTopRight} />
      <Screw className={styles.screwBottomLeft} />
      <Screw className={styles.screwBottomRight} />
      {(eyebrow || title) && (
        <header className={styles.panelHeader}>
          {eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}
          {title && <h2>{title}</h2>}
        </header>
      )}
      <div className={styles.panelBody}>{children}</div>
    </section>
  )
}

export interface RackButtonProps {
  children: ReactNode
  active?: boolean
  accent?: Accent
  compact?: boolean
  onClick?: () => void
  ariaLabel?: string
}

export function RackButton({
  children,
  active = false,
  accent = 'amber',
  compact = false,
  onClick,
  ariaLabel,
}: RackButtonProps) {
  return (
    <button
      type="button"
      className={`${styles.rackButton} ${active ? styles.rackButtonActive : ''} ${compact ? styles.rackButtonCompact : ''}`}
      style={{ '--control-accent': accentColor[accent] } as CSSProperties}
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  )
}

export interface RotaryKnobProps {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  precision?: number
  accent?: Accent
  size?: 'small' | 'large'
  onChange: (value: number) => void
}

export function RotaryKnob({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  precision = 2,
  accent = 'amber',
  size = 'small',
  onChange,
}: RotaryKnobProps) {
  const safeValue = Math.min(max, Math.max(min, value))
  const ratio = max === min ? 0 : (safeValue - min) / (max - min)
  const angle = -135 + ratio * 270
  return (
    <label className={`${styles.knobControl} ${size === 'large' ? styles.knobControlLarge : ''}`}>
      <span className={styles.controlLabel}>{label}</span>
      <span
        className={styles.knob}
        style={{
          '--knob-angle': `${angle}deg`,
          '--control-accent': accentColor[accent],
        } as CSSProperties}
      >
        <span className={styles.knobCap} aria-hidden="true" />
        <input
          className={styles.knobInput}
          type="range"
          min={min}
          max={max}
          step={step}
          value={safeValue}
          onChange={(event) => onChange(Number(event.target.value))}
          aria-label={label}
        />
      </span>
      <output className={styles.numberReadout}>{safeValue.toFixed(precision)}</output>
    </label>
  )
}

export interface ToggleSwitchProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  accent?: Accent
}

export function ToggleSwitch({ label, checked, onChange, accent = 'amber' }: ToggleSwitchProps) {
  return (
    <div className={styles.toggleControl}>
      <span className={styles.controlLabel}>{label}</span>
      <button
        type="button"
        className={`${styles.toggle} ${checked ? styles.toggleOn : ''}`}
        style={{ '--control-accent': accentColor[accent] } as CSSProperties}
        onClick={() => onChange(!checked)}
        role="switch"
        aria-checked={checked}
        aria-label={label}
      >
        <span className={styles.toggleOff}>OFF</span>
        <span className={styles.toggleTrack}><span className={styles.toggleThumb} /></span>
        <span className={styles.toggleOnLabel}>ON</span>
      </button>
    </div>
  )
}

export interface JackSocketProps {
  label: string
  connected?: boolean
  accent?: Accent
  onClick?: () => void
}

export function JackSocket({ label, connected = false, accent = 'amber', onClick }: JackSocketProps) {
  return (
    <button
      type="button"
      className={`${styles.jackControl} ${connected ? styles.jackConnected : ''}`}
      style={{ '--control-accent': accentColor[accent] } as CSSProperties}
      onClick={onClick}
      aria-pressed={connected}
      aria-label={`${label} ${connected ? 'connected' : 'disconnected'}`}
    >
      <span className={styles.jackLabel}>{label}</span>
      <span className={styles.jackSocket} aria-hidden="true">
        {connected && <span className={styles.jackPlug} />}
      </span>
    </button>
  )
}

export function StatusLamp({ label, active = true, accent = 'amber' }: { label: string; active?: boolean; accent?: Accent }) {
  return (
    <span className={styles.statusLamp} style={{ '--control-accent': accentColor[accent] } as CSSProperties}>
      <span className={`${styles.lampDot} ${active ? styles.lampDotActive : ''}`} aria-hidden="true" />
      {label}
    </span>
  )
}

export interface HorizontalFaderProps {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  accent?: Accent
  onChange: (value: number) => void
}

export function HorizontalFader({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  accent = 'amber',
  onChange,
}: HorizontalFaderProps) {
  const fill = max === min ? 0 : Math.min(1, Math.max(0, (value - min) / (max - min)))
  return (
    <label
      className={styles.faderControl}
      style={{ '--control-accent': accentColor[accent], '--fader-fill': `${fill * 100}%` } as CSSProperties}
    >
      <span className={styles.controlLabel}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <output>{Math.round(fill * 100)}%</output>
    </label>
  )
}

export function SpectrumMeter({ bars = 42 }: { bars?: number }) {
  return (
    <div className={styles.spectrum} aria-label="Signal spectrum" role="img">
      {Array.from({ length: bars }, (_, index) => {
        const wave = Math.sin(index * 0.72) * 0.28 + Math.sin(index * 0.19 + 1.4) * 0.2
        const height = Math.round(22 + Math.abs(wave + ((index * 17) % 11) / 16) * 56)
        const hue = 196 + (index / Math.max(1, bars - 1)) * 74
        return <span key={index} style={{ height: `${height}%`, '--bar-hue': hue } as CSSProperties} />
      })}
    </div>
  )
}

export interface LedMatrixProps {
  size?: number
  className?: string
}

export function LedMatrix({ size = 16, className = '' }: LedMatrixProps) {
  const pixels = Array.from({ length: size * size }, (_, index) => {
    const x = index % size
    const y = Math.floor(index / size)
    const signal = Math.sin(x * 0.68 + y * 0.24) + Math.cos(y * 0.72 - x * 0.18)
    const cyan = signal > 0.28
    return cyan ? '#42e6ff' : signal < -0.95 ? '#1548d8' : '#157cf6'
  })
  return (
    <div
      className={`${styles.ledMatrix} ${className}`}
      style={{ '--matrix-size': size } as CSSProperties}
      role="img"
      aria-label={`${size} by ${size} LED matrix preview`}
    >
      {pixels.map((color, index) => (
        <span key={index} style={{ '--led-color': color, '--led-delay': `${(index % 19) * -80}ms` } as CSSProperties} />
      ))}
    </div>
  )
}

export interface TransportControlsProps {
  playing: boolean
  onPlayingChange: (playing: boolean) => void
  onPrevious?: () => void
  onNext?: () => void
}

export function TransportControls({ playing, onPlayingChange, onPrevious, onNext }: TransportControlsProps) {
  return (
    <div className={styles.transport} aria-label="Transport controls">
      <RackButton compact onClick={onPrevious} ariaLabel="Previous">◀◀</RackButton>
      <RackButton compact active={playing} onClick={() => onPlayingChange(!playing)} ariaLabel={playing ? 'Pause' : 'Play'}>
        {playing ? 'Ⅱ' : '▶'}
      </RackButton>
      <RackButton compact onClick={onNext} ariaLabel="Next">▶▶</RackButton>
    </div>
  )
}

export function BrandMark() {
  const colors = ['#40c8ff', '#4989ff', '#4972ce', '#a260ff', '#d557d8']
  return (
    <div className={styles.brand}>
      <span className={styles.brandDots} aria-hidden="true">
        {Array.from({ length: 15 }, (_, index) => <i key={index} style={{ background: colors[index % colors.length] }} />)}
      </span>
      <span>Design Studio for FastLED</span>
    </div>
  )
}

export function PatchCable({ accent = 'amber' }: { accent?: Accent }) {
  return (
    <svg className={styles.patchCable} viewBox="0 0 220 100" preserveAspectRatio="none" aria-hidden="true">
      <path className={styles.patchCableShadow} d="M8 12 C 72 12, 48 91, 111 88 S 149 13, 212 17" />
      <path style={{ stroke: accentColor[accent] }} d="M8 12 C 72 12, 48 91, 111 88 S 149 13, 212 17" />
    </svg>
  )
}
