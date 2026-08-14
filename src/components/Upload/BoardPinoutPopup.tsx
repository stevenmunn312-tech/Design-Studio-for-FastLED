import { useMemo } from 'react'
import { boardPinVerdict, boardProfileById } from '../../build/boardProfiles'
import { useUploadStore } from '../../state/uploadStore'
import type { PhysicalBoardPinProfile, PhysicalBoardProfile } from '../../build/boardProfiles'
import styles from './BoardPinout.module.css'

// "Is this the board in my hand?" — the render beside its own pin list, so the
// answer is a glance rather than a pin-by-pin comparison against a datasheet.
//
// Pins are grouped by the side their anchor declares, matching the physical
// board when held USB-down. Every profile stores its rails in that orientation,
// so there is no per-board rotation here.

function sideOf(profile: PhysicalBoardProfile, pin: PhysicalBoardPinProfile) {
  return profile.pinAnchors?.find((a) => a.id === pin.anchorId)?.labelAlign
}

function PinRow({ profile, pin, align }: {
  profile: PhysicalBoardProfile
  pin: PhysicalBoardPinProfile
  align: 'left' | 'right'
}) {
  const verdict = pin.gpio !== undefined ? boardPinVerdict(profile, pin.gpio) : undefined
  // Only three states earn a colour. `unknown` stays neutral on purpose: it
  // means the board has no opinion, which must not look like approval.
  const tone = verdict?.standing === 'safe' ? styles.safe
    : verdict?.standing === 'caution' ? styles.caution
      : verdict?.standing === 'reserved' ? styles.reserved
        : styles.unknown
  return (
    <li className={`${styles.pin} ${align === 'right' ? styles.pinRight : ''}`}>
      <span className={`${styles.dot} ${tone}`} aria-hidden="true" />
      <span className={styles.pinLabel}>{pin.label}</span>
      {verdict?.reason && <span className={styles.pinReason} title={verdict.reason}>ⓘ</span>}
    </li>
  )
}

export default function BoardPinoutPopup() {
  const pinoutProfileId = useUploadStore((s) => s.pinoutProfileId)
  const closePinout = useUploadStore((s) => s.closePinout)
  const profile = pinoutProfileId ? boardProfileById(pinoutProfileId) : undefined

  const { left, right, other } = useMemo(() => {
    const pins = profile?.pins ?? []
    return {
      left: pins.filter((p) => sideOf(profile!, p) === 'left'),
      right: pins.filter((p) => sideOf(profile!, p) === 'right'),
      other: pins.filter((p) => {
        const side = sideOf(profile!, p)
        return side !== 'left' && side !== 'right'
      }),
    }
  }, [profile])

  if (!profile) return null

  return (
    <div className={styles.overlay} onClick={closePinout} role="presentation">
      <div
        className={styles.popup}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${profile.label} pinout`}
      >
        <div className={styles.header}>
          <div>
            <div className={styles.title}>{profile.label}</div>
            <div className={styles.subtitle}>
              {profile.manufacturer}
              {profile.processor ? ` · ${profile.processor}` : ''}
              {profile.memory ? ` · ${profile.memory.flashMb} MB flash` : ''}
              {profile.memory?.psramMb ? ` · ${profile.memory.psramMb} MB PSRAM` : ''}
            </div>
          </div>
          <button className={styles.closeBtn} onClick={closePinout} aria-label="Close pinout">×</button>
        </div>

        <div className={styles.board}>
          <ul className={styles.rail}>
            {left.map((pin) => <PinRow key={pin.id} profile={profile} pin={pin} align="left" />)}
          </ul>

          {profile.render
            ? (
              <img
                className={styles.render}
                src={`/${profile.render.file}`}
                width={profile.render.widthPx}
                height={profile.render.heightPx}
                alt={`${profile.label} board render, USB connector down`}
                loading="lazy"
              />
            )
            : <div className={styles.noRender}>No render imported for this board.</div>}

          <ul className={`${styles.rail} ${styles.railRight}`}>
            {right.map((pin) => <PinRow key={pin.id} profile={profile} pin={pin} align="right" />)}
          </ul>
        </div>

        {other.length > 0 && (
          <div className={styles.otherRail}>
            <div className={styles.otherTitle}>Not on the side headers</div>
            <ul className={styles.otherPins}>
              {other.map((pin) => <PinRow key={pin.id} profile={profile} pin={pin} align="left" />)}
            </ul>
          </div>
        )}

        <ul className={styles.legend}>
          <li><span className={`${styles.dot} ${styles.safe}`} /> Free to use</li>
          <li><span className={`${styles.dot} ${styles.caution}`} /> Usable, with a caveat</li>
          <li><span className={`${styles.dot} ${styles.reserved}`} /> Not available on this board</li>
          <li><span className={`${styles.dot} ${styles.unknown}`} /> No board data</li>
        </ul>

        {profile.safetyNotes && profile.safetyNotes.length > 0 && (
          <details className={styles.notes}>
            <summary>Board notes ({profile.safetyNotes.length})</summary>
            <ul>{profile.safetyNotes.map((note, i) => <li key={i}>{note}</li>)}</ul>
          </details>
        )}

        {profile.caveats.length > 0 && (
          <p className={styles.caveat}>{profile.caveats.join(' ')}</p>
        )}
      </div>
    </div>
  )
}
