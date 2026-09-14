import { useEffect, useRef } from 'react'
import FloatingMenu, { type FloatingAnchor } from '../Hardware/FloatingMenu'
import { portColor, propertyMeta } from '../../state/nodeLibrary'
import type { PropertyInput } from '../../state/propertyInputs'
import styles from './PropertyInputMenu.module.css'

interface Props {
  anchor: FloatingAnchor
  nodeType: string
  ports: readonly PropertyInput[]
  visibleIds: readonly string[]
  connected: ReadonlyMap<string, unknown>
  /** What drives a wired port, named for a reader: "Pot · Value". */
  describeSource: (id: string) => string | undefined
  onChange: (id: string, visible: boolean) => void
  /** Select and frame whatever drives this port. */
  onTrace: (id: string) => void
  onDisconnect: (id: string) => void
  onClose: () => void
}

export default function PropertyInputMenu({
  anchor, nodeType, ports, visibleIds, connected, describeSource,
  onChange, onTrace, onDisconnect, onClose,
}: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const previous = document.activeElement
    panelRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    const dismiss = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as globalThis.Node)) onClose()
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', escape, true)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', escape, true)
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [onClose])

  return (
    <FloatingMenu anchor={anchor} placement="below" align="start" className={styles.menu}
      role="menu" ariaLabel="Property inputs" panelRef={(element) => { panelRef.current = element }}>
      <div className="nodrag nopan" onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation()
          const buttons = Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
          if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && buttons.length) {
            event.preventDefault()
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
              : (index + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length
            buttons[next]?.focus()
          }
        }}>
        {ports.map((port) => {
          const visible = visibleIds.includes(port.id)
          const meta = propertyMeta(nodeType, port.propertyKey)
          const range = meta?.control === 'slider' ? ` · ${meta.min}–${meta.max}` : ''
          const dot = <span className={styles.dot} style={{ background: portColor(port.dataType) }} />
          // A wired socket cannot be hidden — the wire would go with it — so
          // the two things worth offering instead are finding what drives it
          // and pulling that wire, which restores the field beside the socket.
          if (connected.has(port.id)) {
            return (
              <div key={port.id} className={styles.group}>
                <button type="button" role="menuitem" className={styles.item}
                  onClick={() => { onTrace(port.id); onClose() }}>
                  {dot}
                  <span>Show what drives {port.label}
                    <small>{describeSource(port.id) ?? port.dataType}</small>
                  </span>
                </button>
                <button type="button" role="menuitem" className={styles.item}
                  onClick={() => { onDisconnect(port.id); onClose() }}>
                  {dot}
                  <span>Disconnect {port.label}
                    <small>restores the saved value</small>
                  </span>
                </button>
              </div>
            )
          }
          return (
            <button key={port.id} type="button" role="menuitem"
              className={styles.item}
              onClick={() => { onChange(port.id, !visible); onClose() }}>
              {dot}
              <span>{visible ? 'Hide input' : 'Expose input'}: {port.label}
                <small>{port.dataType}{range}</small>
              </span>
            </button>
          )
        })}
      </div>
    </FloatingMenu>
  )
}
