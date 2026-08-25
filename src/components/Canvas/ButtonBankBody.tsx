import { useEffect, useMemo } from 'react'
import { Handle, Position, useUpdateNodeInternals } from '@xyflow/react'
import { rootGraphNodes, useGraphStore } from '../../state/graphStore'
import { useHardwareInputStore } from '../../state/hardwareInputStore'
import {
  BUTTON_BANK_ADD_HANDLE,
  MAX_BUTTON_BANK_ENTRIES,
  buttonBankHandle,
  normalizeButtonBankEntries,
} from '../../state/buttonBank'
import { portColor } from '../../state/nodeLibrary'
import styles from './ButtonBankBody.module.css'
import { NODE_HANDLE_STYLE } from './nodeHandleStyle'

const BOOL_COLOR = portColor('bool')

function activateHandleFromKeyboard(event: React.KeyboardEvent<HTMLDivElement>) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  event.stopPropagation()
  event.currentTarget.click()
}

export default function ButtonBankBody({ nodeId }: { nodeId: string }) {
  const saved = useGraphStore((state) => {
    const node = rootGraphNodes(state).find((candidate) => candidate.id === nodeId)
    return (node?.data.properties as Record<string, unknown> | undefined)?.buttons
  })
  const entries = useMemo(() => normalizeButtonBankEntries(saved), [saved])
  const pressed = useHardwareInputStore((state) => state.button)
  const setButton = useHardwareInputStore((state) => state.setButton)
  const updateNodeInternals = useUpdateNodeInternals()

  useEffect(() => updateNodeInternals(nodeId), [entries.length, nodeId, updateNodeInternals])

  const release = (key: string) => setButton(key, false)

  return (
    <div className={styles.bank} aria-label="Button bank controls">
      {entries.map((entry) => {
        const handle = buttonBankHandle(entry.id)
        const stateKey = `${nodeId}:${entry.id}`
        const isPressed = pressed.get(stateKey) ?? false
        return (
          <div className={styles.row} key={entry.id}>
            <button
              type="button"
              className={`nodrag ${styles.press} ${isPressed ? styles.pressActive : ''}`}
              aria-label={`Press ${entry.label}`}
              aria-pressed={isPressed}
              title={`Preview ${entry.label}`}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId)
                setButton(stateKey, true)
              }}
              onPointerUp={() => release(stateKey)}
              onPointerCancel={() => release(stateKey)}
              onLostPointerCapture={() => release(stateKey)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') setButton(stateKey, true)
              }}
              onKeyUp={(event) => {
                if (event.key === 'Enter' || event.key === ' ') release(stateKey)
              }}
            >
              <span />
            </button>
            <span className={styles.label} title={entry.label}>{entry.label}</span>
            <span className={styles.pin}>{entry.pin >= 0 ? `GPIO ${entry.pin}` : 'UNASSIGNED'}</span>
            <Handle
              type="source"
              position={Position.Right}
              id={handle}
              title={`${entry.label} · bool`}
              role="button"
              tabIndex={0}
              aria-label={`Connect from Button Bank ${entry.label} output, bool. Press Enter or Space to choose a destination port.`}
              onKeyDown={activateHandleFromKeyboard}
              style={{ ...NODE_HANDLE_STYLE, top: '50%', right: -8, background: BOOL_COLOR, boxShadow: `0 0 6px ${BOOL_COLOR}` }}
            />
          </div>
        )
      })}
      {entries.length < MAX_BUTTON_BANK_ENTRIES && (
        <div className={`${styles.row} ${styles.addRow}`}>
          <span className={styles.addGlyph}>+</span>
          <span className={styles.addLabel}>Connect button…</span>
          <Handle
            type="source"
            position={Position.Right}
            id={BUTTON_BANK_ADD_HANDLE}
            title="Connect to create and name a button"
            role="button"
            tabIndex={0}
            aria-label="Connect from Button Bank empty output to create a named button."
            onKeyDown={activateHandleFromKeyboard}
            style={{ ...NODE_HANDLE_STYLE, top: '50%', right: -8, background: BOOL_COLOR, boxShadow: `0 0 7px color-mix(in srgb, ${BOOL_COLOR} 45%, transparent)` }}
          />
        </div>
      )}
    </div>
  )
}
