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
  onChange: (id: string, visible: boolean) => void
  onClose: () => void
}

export default function PropertyInputMenu({ anchor, nodeType, ports, visibleIds, connected, onChange, onClose }: Props) {
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
          const wired = connected.has(port.id)
          const meta = propertyMeta(nodeType, port.propertyKey)
          const range = meta?.control === 'slider' ? ` · ${meta.min}–${meta.max}` : ''
          return (
            <button key={port.id} type="button" role="menuitem" disabled={wired}
              className={styles.item} title={wired ? 'Disconnect this input before hiding it' : undefined}
              onClick={() => { onChange(port.id, !visible); onClose() }}>
              <span className={styles.dot} style={{ background: portColor(port.dataType) }} />
              <span>{wired ? 'Connected' : visible ? 'Hide input' : 'Expose input'}: {port.label}
                <small>{port.dataType}{range}{wired ? ' · disconnect to hide' : ''}</small>
              </span>
            </button>
          )
        })}
      </div>
    </FloatingMenu>
  )
}
