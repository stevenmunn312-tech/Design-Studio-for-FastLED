import { useMemo } from 'react'
import { useGraphStore } from '../../state/graphStore'
import { useUploadStore } from '../../state/uploadStore'
import { BOARD_PROFILES, boardProfileById } from '../../build/boardProfiles'
import styles from './BoardNodeBody.module.css'

// The Board node picks a *profile*, not an FQBN. `esp32:esp32:esp32` names the
// silicon and leaves the header layout ambiguous — two different DevKit
// profiles claim that exact target — so selecting by chip is what produced the
// class of bug where a pin exists on the die but not on any header.
//
// Non-breaking slice: the profile lives on the node, and its first compatible
// FQBN is mirrored into uploadStore so upload keeps working unchanged. Pin
// ownership has not moved off the peripheral nodes yet.
// See docs/development/design/board-node-architecture.md.

interface Props { nodeId: string }

export default function BoardNodeBody({ nodeId }: Props) {
  const updateNodeProperty = useGraphStore((s) => s.updateNodeProperty)
  const setSelectedFqbn = useUploadStore((s) => s.setSelectedFqbn)

  const profileId = useGraphStore((s) => {
    const node = s.nodes.find((n) => n.id === nodeId)
    const props = node?.data.properties as Record<string, unknown> | undefined
    return typeof props?.profileId === 'string' ? props.profileId : ''
  })

  // One board per sketch is a fact of codegen, not a preference — a second
  // Board node has no meaning, so say so rather than silently letting one win.
  const boardNodeCount = useGraphStore(
    (s) => s.nodes.filter((n) => n.data.nodeType === 'Board').length)

  const profile = useMemo(() => boardProfileById(profileId), [profileId])

  function choose(nextId: string) {
    updateNodeProperty(nodeId, 'profileId', nextId)
    const next = boardProfileById(nextId)
    // Profiles list the specific FQBN first and the family fallback after, so
    // the first entry is the closest match for this exact board.
    const fqbn = next?.compatibleFqbns[0]
    if (fqbn) setSelectedFqbn(fqbn)
  }

  const safeCount = profile?.pinSafety?.safeGeneralPurpose.length ?? 0
  const peripherals = profile?.peripheralPins

  return (
    <div className={`${styles.body} nodrag`}>
      <select
        className={styles.picker}
        value={profileId}
        onChange={(e) => choose(e.target.value)}
        aria-label="Controller board"
      >
        <option value="">Choose your board…</option>
        {BOARD_PROFILES.map((p) => (
          <option key={p.id} value={p.id}>{p.label}</option>
        ))}
      </select>

      {!profile && (
        <p className={styles.empty}>
          Pin advice stays chip-level until an exact board is chosen.
        </p>
      )}

      {profile && (
        <div className={styles.detail}>
          <div className={styles.row}>
            <span className={styles.key}>Made by</span>
            <span className={styles.value}>{profile.manufacturer}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.key}>Source</span>
            <span className={styles.value}>{profile.confidence.replace(/-/g, ' ')}</span>
          </div>
          {profile.processor && (
            <div className={styles.row}>
              <span className={styles.key}>Chip</span>
              <span className={styles.value}>{profile.processor}</span>
            </div>
          )}

          {profile.pinSafety ? (
            <div className={styles.row}>
              <span className={styles.key}>Free pins</span>
              <span className={styles.value}>{safeCount} on the header</span>
            </div>
          ) : (
            // Distinguish "checked, and here is the answer" from "never
            // checked". Silence would read as the former.
            <p className={styles.pending}>
              No pin-safety data yet for this board — validation falls back to
              chip-level rules.
            </p>
          )}

          {peripherals && (
            <ul className={styles.peripherals}>
              {peripherals.fastLedData && (
                <li>LED data → GPIO{peripherals.fastLedData.recommendedDefault}</li>
              )}
              {peripherals.inmp441 && (
                <li>
                  Mic → WS {peripherals.inmp441.wsLrclk} · SCK{' '}
                  {peripherals.inmp441.sckBclk} · SD {peripherals.inmp441.sdDout}
                </li>
              )}
              {peripherals.max98357 && (
                <li>
                  Amp → BCLK {peripherals.max98357.bclk} · LRC{' '}
                  {peripherals.max98357.lrc} · DIN {peripherals.max98357.din}
                </li>
              )}
            </ul>
          )}
        </div>
      )}

      {boardNodeCount > 1 && (
        <p className={styles.warning}>
          {boardNodeCount} Board nodes on this canvas. A sketch targets one
          controller — remove the extras.
        </p>
      )}
    </div>
  )
}
