import { useEffect } from 'react'
import type {
  PhysicalBoardPinAnchor,
  PhysicalBoardPinProfile,
  PhysicalBoardProfile,
} from '../../build/boardProfiles'
import styles from './BoardPinoutPicker.module.css'

/*
 * Compare reviewed pinouts side by side, then pick one.
 *
 * Distinct from `Upload/BoardPinoutPopup`, which answers "is this the board in
 * my hand?" for a board already chosen, using its photographic render. This
 * one answers "which of these do I want?", so it draws every candidate as the
 * same schematic at the same size — a photo per board would compare the
 * photography as much as the headers.
 *
 * It lived in Build Diagram until that view was reduced to reporting the board
 * rather than choosing it; the Hardware tab owns the choice, so it owns this.
 */

function boardPinColor(role: PhysicalBoardPinProfile['role'], unavailable: boolean) {
  if (unavailable) return '#9b4b4b'
  if (role === 'power-in' || role === 'power-out') return '#d84c42'
  if (role === 'ground') return '#26383b'
  if (role === 'analog') return '#d77d32'
  if (role === 'reserved') return '#6d7478'
  return '#65a94f'
}

function BoardPinoutPreview({ profile }: { profile: PhysicalBoardProfile }) {
  const anchorById = new Map((profile.pinAnchors ?? []).map((anchor) => [anchor.id, anchor]))
  const pinsBySide = (side: PhysicalBoardPinAnchor['labelAlign']) => (profile.pins ?? [])
    .filter((pin) => anchorById.get(pin.anchorId)?.labelAlign === side)
  // Every profile stores its rails USB-down, so no per-board rotation here.
  // The XIAO used to need one because its map was held in another orientation.
  const leftPins = pinsBySide('left')
  const rightPins = pinsBySide('right')
  const bottomPins = pinsBySide('bottom')
  const topPins = pinsBySide('top')
  const isDevKitC = profile.id === 'espressif-esp32-s3-devkitc-1'
  const verticalY = (index: number, count: number) => count <= 1 ? 214 : 42 + ((344 * index) / (count - 1))
  const horizontalX = (index: number, count: number) => count <= 1 ? 280 : 210 + ((140 * index) / (count - 1))

  return (
    <svg className={styles.boardPinout} viewBox="0 0 560 430" role="img" aria-label={`${profile.label} pinout`}>
      <rect x="198" y="28" width="164" height="366" rx={isDevKitC ? 5 : 24} className={`${styles.pinoutBoardBody} ${isDevKitC ? styles.pinoutDevKitBody : ''}`} />
      {isDevKitC ? <>
        <rect x="220" y="42" width="120" height="148" rx="5" className={styles.pinoutDevKitModule} />
        <path d="M232 50h96v28h-14V61h-17v17h-17V61h-17v17h-17V61h-14z" className={styles.pinoutDevKitAntenna} />
        <rect x="228" y="82" width="104" height="98" rx="3" className={styles.pinoutDevKitShield} />
        <text x="280" y="107" textAnchor="middle" className={styles.pinoutBoardName}>ESP32-S3-WROOM</text>
        <circle cx="252" cy="230" r="10" className={styles.pinoutDevKitLed} />
        <text x="268" y="234" className={styles.pinoutDeviceText}>RGB IO38</text>
        <rect x="258" y="270" width="44" height="46" rx="4" className={styles.pinoutDevKitChip} />
        <text x="280" y="297" textAnchor="middle" className={styles.pinoutDeviceText}>CP2102</text>
        <rect x="226" y="330" width="38" height="24" rx="5" className={styles.pinoutDevKitButton} />
        <rect x="296" y="330" width="38" height="24" rx="5" className={styles.pinoutDevKitButton} />
        <text x="245" y="326" textAnchor="middle" className={styles.pinoutDeviceText}>BOOT</text>
        <text x="315" y="326" textAnchor="middle" className={styles.pinoutDeviceText}>RESET</text>
        <rect data-board-usb="bottom" x="218" y="370" width="56" height="48" rx="6" className={styles.pinoutUsb} />
        <rect data-board-usb="bottom" x="286" y="370" width="56" height="48" rx="6" className={styles.pinoutUsb} />
        <text x="246" y="367" textAnchor="middle" className={styles.pinoutDeviceText}>UART</text>
        <text x="314" y="367" textAnchor="middle" className={styles.pinoutDeviceText}>USB</text>
      </> : <>
        <rect data-board-usb="bottom" x="250" y="370" width="60" height="48" rx="8" className={styles.pinoutUsb} />
        <rect x="220" y="164" width="120" height="174" rx="10" className={styles.pinoutModule} />
        <text x="280" y="256" textAnchor="middle" className={styles.pinoutBoardName}>{profile.model}</text>
      </>}
      {leftPins.map((pin, index) => {
        const y = verticalY(index, leftPins.length)
        return <g key={pin.id} data-pin-id={pin.id} data-pin-side="left" opacity={pin.availability === 'unavailable' ? 0.58 : 1}>
          <rect x="12" y={y - 8} width="174" height="16" rx="4" fill={boardPinColor(pin.role, pin.availability === 'unavailable')} />
          <text x="178" y={y + 3} textAnchor="end" className={styles.pinoutPinText}>{pin.label}</text>
          <line x1="186" y1={y} x2="198" y2={y} className={styles.pinoutLead} />
          <circle cx="198" cy={y} r="5" className={styles.pinoutPad} />
        </g>
      })}
      {rightPins.map((pin, index) => {
        const y = verticalY(index, rightPins.length)
        return <g key={pin.id} data-pin-id={pin.id} data-pin-side="right" opacity={pin.availability === 'unavailable' ? 0.58 : 1}>
          <line x1="362" y1={y} x2="374" y2={y} className={styles.pinoutLead} />
          <circle cx="362" cy={y} r="5" className={styles.pinoutPad} />
          <rect x="374" y={y - 8} width="174" height="16" rx="4" fill={boardPinColor(pin.role, pin.availability === 'unavailable')} />
          <text x="382" y={y + 3} className={styles.pinoutPinText}>{pin.label}</text>
        </g>
      })}
      {bottomPins.map((pin, index) => {
        const x = horizontalX(index, bottomPins.length)
        return <g key={pin.id} data-pin-id={pin.id} data-pin-side="bottom" opacity={pin.availability === 'unavailable' ? 0.58 : 1}>
          <line x1={x} y1="394" x2={x} y2="406" className={styles.pinoutLead} />
          <circle cx={x} cy="394" r="5" className={styles.pinoutPad} />
          <text x={x} y="421" textAnchor="middle" className={styles.pinoutBottomText}>{pin.label}</text>
        </g>
      })}
      {topPins.map((pin, index) => {
        const x = horizontalX(index, topPins.length)
        return <g key={pin.id} data-pin-id={pin.id} data-pin-side="top" opacity={pin.availability === 'unavailable' ? 0.58 : 1}>
          <text x={x} y="10" textAnchor="middle" className={styles.pinoutBottomText}>{pin.label}</text>
          <line x1={x} y1="16" x2={x} y2="28" className={styles.pinoutLead} />
          <circle cx={x} cy="28" r="5" className={styles.pinoutPad} />
        </g>
      })}
    </svg>
  )
}

export default function BoardPinoutPicker({ profiles, selectedId, onPick, onClose }: {
  profiles: PhysicalBoardProfile[]
  selectedId?: string
  onPick: (profileId: string) => void
  onClose: () => void
}) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return (
    <div className={styles.backdrop} onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="board-picker-title">
        <div className={styles.header}>
          <div>
            <h2 id="board-picker-title" className={styles.title}>Choose your board</h2>
            <p>Scroll sideways to compare reviewed pinouts.</p>
          </div>
          <button type="button" className={styles.close} aria-label="Close board picker" onClick={onClose}>Close</button>
        </div>
        <div className={styles.scroller}>
          {profiles.map((profile) => (
            <button
              key={profile.id}
              type="button"
              className={`${styles.card} ${selectedId === profile.id ? styles.cardActive : ''}`}
              onClick={() => onPick(profile.id)}
            >
              <BoardPinoutPreview profile={profile} />
              <strong>{profile.label}</strong>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
