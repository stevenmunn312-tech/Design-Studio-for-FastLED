// Inline SVG glyphs for the music player under the main LED preview. All are
// 24×24 viewBox, sized via the `size` prop and tinted by `currentColor` so the
// buttons' CSS controls their colour.

interface IconProps {
  size?: number
}

export function IconPlay({ size = 16 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M8 5.5v13a1 1 0 0 0 1.53.85l10.2-6.5a1 1 0 0 0 0-1.7L9.53 4.65A1 1 0 0 0 8 5.5z" />
    </svg>
  )
}

export function IconPause({ size = 16 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  )
}

export function IconPrev({ size = 16 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <rect x="5" y="5" width="2.6" height="14" rx="1" />
      <path d="M19 5.9v12.2a1 1 0 0 1-1.55.83L8.9 12.83a1 1 0 0 1 0-1.66l8.55-6.1A1 1 0 0 1 19 5.9z" />
    </svg>
  )
}

export function IconNext({ size = 16 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <rect x="16.4" y="5" width="2.6" height="14" rx="1" />
      <path d="M5 5.9v12.2a1 1 0 0 0 1.55.83l8.55-6.1a1 1 0 0 0 0-1.66L6.55 5.07A1 1 0 0 0 5 5.9z" />
    </svg>
  )
}

export function IconAdd({ size = 16 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      {/* music note + plus: add tracks */}
      <path d="M9 4.5v9.05A3.5 3.5 0 1 0 11 16.7V8h5V4.5H9z" />
      <path d="M18.5 13v2.5H21v2h-2.5V20h-2v-2.5H14v-2h2.5V13h2z" />
    </svg>
  )
}

export function IconClear({ size = 16 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M9.5 3h5l.8 1.6H19v2H5v-2h3.7L9.5 3zM6.3 8.6h11.4l-.9 11.5a1 1 0 0 1-1 .9H8.2a1 1 0 0 1-1-.9L6.3 8.6zM10 11v7h1.6v-7H10zm2.4 0v7H14v-7h-1.6z" />
    </svg>
  )
}

export function IconVolume({ size = 16 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d="M4 9.5v5h3.4L12 18.5v-13L7.4 9.5H4z" />
      <path
        d="M15 9a4.2 4.2 0 0 1 0 6M17.5 6.5a7.6 7.6 0 0 1 0 11"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function IconVolumeMuted({ size = 16 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d="M4 9.5v5h3.4L12 18.5v-13L7.4 9.5H4z" />
      <path
        d="M15.5 9.5l5 5m0-5l-5 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}
