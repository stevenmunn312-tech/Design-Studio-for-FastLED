import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Handle, Position, useUpdateNodeInternals } from '@xyflow/react'
import {
  addWebRemoteControl,
  removeWebRemoteControl,
  rootGraphNodes,
  updateWebRemoteControl,
  useGraphStore,
  useNodeProperties,
} from '../../../state/graphStore'
import {
  MAX_WEB_REMOTE_CONTROLS,
  WEB_REMOTE_CONTROL_TYPES,
  isWebRemoteControlType,
  normalizeWebRemoteControls,
  webRemoteChoiceOptions,
  webRemoteControlDataType,
  webRemoteControlKind,
  webRemoteControlOutput,
  webRemoteHueStops,
  webRemoteMdnsName,
  webRemotePortId,
  webRemoteQuantize,
  webRemoteStartState,
  webRemoteStateRange,
  type WebRemoteControl,
} from '../../../state/peripherals/webRemote'
import {
  readWebRemoteControl,
  subscribeWebRemote,
  webRemoteRevision,
  writeWebRemoteControl,
} from '../../../state/peripherals/webRemoteRuntime'
import { webRemotePageHtml } from '../../../state/peripherals/webRemotePage'
import { useNetworkCredentialsStore, EMPTY_CREDENTIALS } from '../../../state/peripherals/networkCredentials'
import { wiredNetworkIn, wiredNetworkPhrase } from '../../../state/peripherals/ethernetModule'
import { networkSourceIn } from '../../../codegen/peripherals/networkCpp'
import { displayWidgetDefinition, isDisplayRgb, TOUCH_CONTROL_ADD_DATA_TYPE, TOUCH_CONTROL_ADD_HANDLE } from '../../../state/displays/displayRegistry'
import type { DisplayWidgetProperty } from '../../../state/displays/displayDocument'
import { portColor } from '../../../state/nodeLibrary'
import { useEscapeLayer } from '../../../hooks/useEscapeLayer'
import { NODE_HANDLE_STYLE } from '../nodeHandleStyle'
import styles from './WebRemoteBody.module.css'
import WifiPasswordInput from '../WifiPasswordInput'

function activateHandleFromKeyboard(event: React.KeyboardEvent<HTMLDivElement>) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  event.stopPropagation()
  event.currentTarget.click()
}

const NEW_CONTROL_COLOR = portColor(TOUCH_CONTROL_ADD_DATA_TYPE)

function formatValue(control: WebRemoteControl, value: number): string {
  const step = webRemoteStateRange(control).step
  const decimals = Math.min(4, (String(step).split('.')[1] ?? '').length)
  return value.toFixed(decimals)
}

/** The node's own copy of a control, operable in the preview without a phone. */
function MiniControl({ nodeId, control }: { nodeId: string; control: WebRemoteControl }) {
  const start = webRemoteStartState(control)
  const value = readWebRemoteControl(nodeId, control.id, start)
  const write = (next: unknown) => writeWebRemoteControl(nodeId, control.id, webRemoteQuantize(control, next))
  const kind = webRemoteControlKind(control.type)
  const range = webRemoteStateRange(control)
  const number = typeof value === 'number' ? value : value === true ? 1 : 0
  switch (kind) {
    case 'text':
      return <TextControl control={control} value={typeof value === 'string' ? value : ''} onConfirm={write} />
    case 'press': {
      const text = String(control.properties.text ?? '') || 'Press'
      return (
        <div className={styles.control}>
          <button
            type="button"
            className={`nodrag ${styles.mini} ${styles.press}`}
            aria-pressed={value === true}
            aria-label={`Press ${control.label}`}
            onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); write(true) }}
            onPointerUp={() => write(false)}
            onPointerCancel={() => write(false)}
            onLostPointerCapture={() => write(false)}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') write(true) }}
            onKeyUp={(event) => { if (event.key === 'Enter' || event.key === ' ') write(false) }}
          >
            {text}
          </button>
        </div>
      )
    }
    case 'latch': {
      const on = value === true
      return (
        <div className={styles.control}>
          <button
            type="button"
            className={`nodrag ${styles.mini}`}
            aria-pressed={on}
            aria-label={`${control.label}: ${on ? 'on' : 'off'}`}
            onClick={() => write(!on)}
          >
            {on ? String(control.properties.onLabel ?? 'ON') : String(control.properties.offLabel ?? 'OFF')}
          </button>
        </div>
      )
    }
    case 'choice': {
      const options = webRemoteChoiceOptions(control)
      return (
        <div className={`${styles.control} ${styles.choices}`} role="group" aria-label={control.label}>
          {options.map((option, index) => (
            <button
              key={index}
              type="button"
              className={`nodrag ${styles.mini}`}
              aria-pressed={Math.round(number) === index}
              title={option}
              onClick={() => write(index)}
            >
              {option}
            </button>
          ))}
        </div>
      )
    }
    case 'range': {
      if (control.type === 'Step Control') {
        return (
          <div className={styles.control}>
            <button type="button" className={`nodrag ${styles.mini}`} aria-label={`Decrease ${control.label}`} onClick={() => write(number - range.step)}>−</button>
            <span className={styles.value}>{formatValue(control, number)}</span>
            <button type="button" className={`nodrag ${styles.mini}`} aria-label={`Increase ${control.label}`} onClick={() => write(number + range.step)}>+</button>
          </div>
        )
      }
      return (
        <div className={styles.control}>
          <input
            className="nodrag"
            type="range"
            min={range.min}
            max={range.max}
            step={range.step}
            value={number}
            aria-label={control.label}
            onChange={(event) => write(Number(event.target.value))}
          />
          <span className={styles.value}>{formatValue(control, number)}</span>
        </div>
      )
    }
    case 'hue': {
      const color = webRemoteControlOutput(control, number)
      const swatch = isDisplayRgb(color) ? `rgb(${color.r}, ${color.g}, ${color.b})` : 'transparent'
      return (
        <div className={styles.control}>
          <input
            className={`nodrag ${styles.hue}`}
            type="range"
            min={0}
            max={360}
            step={1}
            value={number}
            aria-label={`${control.label} hue`}
            style={{ background: `linear-gradient(90deg, ${webRemoteHueStops(control).join(', ')})` }}
            onChange={(event) => write(Number(event.target.value))}
          />
          <span className={styles.swatch} style={{ background: swatch }} aria-hidden="true" />
        </div>
      )
    }
  }
}

/**
 * A Text Entry's field: typing edits a draft, and only Enter confirms it, the
 * way the phone's Send key and the screen widget's keyboard do.
 */
function TextControl({ control, value, onConfirm }: {
  control: WebRemoteControl
  value: string
  onConfirm: (text: string) => void
}) {
  const [draft, setDraft] = useState(value)
  const [editing, setEditing] = useState(false)
  const shown = editing ? draft : value
  return (
    <div className={styles.control}>
      <input
        className={`nodrag ${styles.fieldInput}`}
        type="text"
        aria-label={`${control.label}, press Enter to send`}
        placeholder={String(control.properties.placeholder ?? '')}
        maxLength={webRemoteStateRange(control).max}
        value={shown}
        onFocus={() => { setDraft(value); setEditing(true) }}
        onBlur={() => setEditing(false)}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { onConfirm(draft); event.currentTarget.blur() }
          if (event.key === 'Escape') { event.preventDefault(); event.currentTarget.blur() }
        }}
      />
    </div>
  )
}

/** A text field that commits on blur or Enter, so typing is one undo step. */
function DraftField({ label, value, onCommit, maxLength }: {
  label: string
  value: string
  onCommit: (value: string) => void
  maxLength?: number
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <input
      className={`nodrag ${styles.fieldInput}`}
      type="text"
      aria-label={label}
      value={draft}
      maxLength={maxLength}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => { if (draft !== value) onCommit(draft) }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') { event.preventDefault(); setDraft(value); event.currentTarget.blur() }
      }}
    />
  )
}

function NumberField({ label, value, onCommit }: { label: string; value: number; onCommit: (value: number) => void }) {
  return (
    <label className={styles.field}>
      {label}
      <DraftField
        label={label}
        value={String(value)}
        onCommit={(text) => {
          const next = Number(text)
          if (text.trim() !== '' && Number.isFinite(next)) onCommit(next)
        }}
      />
    </label>
  )
}

/** The settings each control type shows in Edit mode: the widget's own fields. */
function ControlSettings({ nodeId, control }: { nodeId: string; control: WebRemoteControl }) {
  const set = (properties: Record<string, DisplayWidgetProperty>) => updateWebRemoteControl(nodeId, control.id, { properties })
  const kind = webRemoteControlKind(control.type)
  const text = (key: string, label: string, fallback: string) => (
    <label className={styles.field}>
      {label}
      <DraftField label={`${control.label} ${label}`} value={String(control.properties[key] ?? fallback)} onCommit={(value) => set({ [key]: value })} />
    </label>
  )
  if (kind === 'press') return <div className={styles.editFields}>{text('text', 'button text', '')}</div>
  if (kind === 'latch') return <div className={styles.editFields}>{text('offLabel', 'off', 'OFF')}{text('onLabel', 'on', 'ON')}</div>
  if (kind === 'choice') return <div className={styles.editFields}>{text('options', 'options, comma separated', '')}</div>
  if (kind === 'text') {
    return (
      <div className={styles.editFields}>
        {text('text', 'starts with', '')}
        {text('placeholder', 'hint when empty', '')}
        <NumberField label="max length" value={webRemoteStateRange(control).max} onCommit={(value) => set({ maxLength: value })} />
      </div>
    )
  }
  if (kind === 'hue') {
    const tone = (key: 'saturation' | 'brightness') => Number(control.properties[key] ?? 1)
    return (
      <div className={styles.editFields}>
        <NumberField label="saturation" value={tone('saturation')} onCommit={(value) => set({ saturation: value })} />
        <NumberField label="brightness" value={tone('brightness')} onCommit={(value) => set({ brightness: value })} />
      </div>
    )
  }
  const range = webRemoteStateRange(control)
  return (
    <div className={styles.editFields}>
      <NumberField label="min" value={range.min} onCommit={(value) => set({ min: value })} />
      <NumberField label="max" value={range.max} onCommit={(value) => set({ max: value })} />
      <NumberField label="step" value={range.step} onCommit={(value) => set({ step: value })} />
    </div>
  )
}

/**
 * The phone page itself, from the generator the firmware embeds, in a
 * sandboxed frame. The page notices it is in a `srcdoc` frame and talks to
 * this window instead of the board: each set it posts lands in the same
 * runtime the node's own controls write, and every change is posted back.
 */
function PhonePreview({ nodeId, title, controls, onClose }: {
  nodeId: string
  title: unknown
  controls: WebRemoteControl[]
  onClose: () => void
}) {
  const frame = useRef<HTMLIFrameElement>(null)
  const html = useMemo(() => webRemotePageHtml(title, controls), [title, controls])
  useEscapeLayer(onClose)

  useEffect(() => {
    const state = () => controls.map((control) => {
      const value = readWebRemoteControl(nodeId, control.id, webRemoteStartState(control))
      return typeof value === 'boolean' ? (value ? 1 : 0) : value
    })
    const post = () => frame.current?.contentWindow?.postMessage({ fls: 'wr', v: state() }, '*')
    const onMessage = (event: MessageEvent) => {
      if (!frame.current || event.source !== frame.current.contentWindow) return
      const data = event.data as { fls?: unknown; op?: unknown; i?: unknown; v?: unknown } | null
      if (!data || data.fls !== 'wr') return
      if (data.op === 'set') {
        const index = Number(data.i)
        const control = Number.isInteger(index) ? controls[index] : undefined
        if (control) writeWebRemoteControl(nodeId, control.id, webRemoteQuantize(control, data.v))
      }
      post()
    }
    window.addEventListener('message', onMessage)
    const unsubscribe = subscribeWebRemote(nodeId, post)
    return () => {
      window.removeEventListener('message', onMessage)
      unsubscribe()
      // A press held when the preview closes is let go, as a phone locking would.
      for (const control of controls) {
        if (webRemoteControlKind(control.type) === 'press') writeWebRemoteControl(nodeId, control.id, false)
      }
    }
  }, [controls, nodeId])

  if (typeof document === 'undefined') return null
  return createPortal(
    <div className={`nodrag nowheel ${styles.overlay}`} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={`${nodeId}-phone-title`}>
        <div className={styles.dialogHead}>
          <h2 id={`${nodeId}-phone-title`}>Phone preview</h2>
          <button type="button" className={styles.toolButton} onClick={onClose}>Close</button>
        </div>
        <p>The page the board serves, working against the preview. Controls here and on the node move together.</p>
        <iframe
          ref={frame}
          className={styles.phone}
          title="Web Remote phone page"
          sandbox="allow-scripts"
          srcDoc={html}
        />
      </div>
    </div>,
    document.body,
  )
}

export default function WebRemoteBody({ nodeId }: { nodeId: string }) {
  const props = useNodeProperties(nodeId)
  const controls = useMemo(() => normalizeWebRemoteControls(props.controls), [props.controls])
  useSyncExternalStore(
    (listener) => subscribeWebRemote(nodeId, listener),
    () => webRemoteRevision(nodeId),
  )
  const [editing, setEditing] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const updateNodeInternals = useUpdateNodeInternals()
  const portKey = controls.map((control) => control.id).join('|')
  useEffect(() => updateNodeInternals(nodeId), [editing, nodeId, portKey, updateNodeInternals])

  const credentials = useNetworkCredentialsStore((s) => s.byNodeId[nodeId] ?? EMPTY_CREDENTIALS)
  const setCredentials = useNetworkCredentialsStore((s) => s.setCredentials)
  const wired = useGraphStore((s) => {
    const network = wiredNetworkIn(rootGraphNodes(s))
    return network ? wiredNetworkPhrase(network) : null
  })
  // The page answers to the shared connection's hostname, which is this
  // node's unless another network user comes first.
  const hostname = useGraphStore((s) => {
    const source = networkSourceIn(rootGraphNodes(s))
    return webRemoteMdnsName((source?.data.properties as Record<string, unknown> | undefined)?.wifiHostname ?? props.wifiHostname)
  })

  return (
    <div className={styles.body} aria-label="Web Remote controls">
      <div className={styles.toolbar}>
        <span className={styles.address} title="Open this on a phone on the same network">http://{hostname}.local</span>
        <button type="button" className={`nodrag ${styles.toolButton}`} aria-pressed={editing} onClick={() => setEditing(!editing)}>
          {editing ? 'Done' : 'Edit'}
        </button>
        <button type="button" className={`nodrag ${styles.toolButton}`} onClick={() => setPreviewOpen(true)}>
          Phone preview
        </button>
      </div>
      {controls.map((control) => {
        const port = webRemotePortId(control.id)
        const color = portColor(webRemoteControlDataType(control.type))
        return (
          <div className={`${styles.row} ${editing ? styles.editRow : ''}`} key={control.id}>
            {editing ? (
              <>
                <div className={styles.editHead}>
                  <DraftField
                    label={`${control.label} name`}
                    value={control.label}
                    maxLength={40}
                    onCommit={(label) => updateWebRemoteControl(nodeId, control.id, { label })}
                  />
                  <span className={styles.typeTag}>{displayWidgetDefinition(control.type).label}</span>
                  <button
                    type="button"
                    className={`nodrag ${styles.mini}`}
                    aria-label={`Remove ${control.label}`}
                    title="Remove this control and its wires"
                    onClick={() => removeWebRemoteControl(nodeId, control.id)}
                  >
                    ×
                  </button>
                </div>
                <ControlSettings nodeId={nodeId} control={control} />
              </>
            ) : (
              <>
                <span className={styles.label} title={control.label}>{control.label}</span>
                <MiniControl nodeId={nodeId} control={control} />
              </>
            )}
            <Handle
              type="source"
              position={Position.Right}
              id={port}
              title={`${control.label} · ${webRemoteControlDataType(control.type)}`}
              role="button"
              tabIndex={0}
              aria-label={`Connect from Web Remote ${control.label} output, ${webRemoteControlDataType(control.type)}. Press Enter or Space to choose a destination port.`}
              onKeyDown={activateHandleFromKeyboard}
              style={{ ...NODE_HANDLE_STYLE, top: '50%', right: -8, background: color, boxShadow: `0 0 6px ${color}` }}
            />
          </div>
        )
      })}
      {controls.length < MAX_WEB_REMOTE_CONTROLS && (
        <div className={`${styles.row} ${styles.addRow}`}>
          <span className={styles.addLabel}>Add control…</span>
          <select
            className={`nodrag ${styles.addSelect}`}
            aria-label="Add a control of type"
            value=""
            onChange={(event) => {
              if (isWebRemoteControlType(event.target.value)) addWebRemoteControl(nodeId, event.target.value)
            }}
          >
            <option value="" disabled>Add…</option>
            {WEB_REMOTE_CONTROL_TYPES.map((type) => (
              <option key={type} value={type}>{displayWidgetDefinition(type).label}</option>
            ))}
          </select>
          <Handle
            type="source"
            position={Position.Right}
            id={TOUCH_CONTROL_ADD_HANDLE}
            title="Drag onto a property row to make a control for it"
            role="button"
            tabIndex={0}
            aria-label="Connect from Web Remote Add control to make a control for a property."
            onKeyDown={activateHandleFromKeyboard}
            style={{ ...NODE_HANDLE_STYLE, top: '50%', right: -8, background: NEW_CONTROL_COLOR, boxShadow: `0 0 7px color-mix(in srgb, ${NEW_CONTROL_COLOR} 45%, transparent)` }}
          />
        </div>
      )}
      {wired ? (
        <div className={styles.note}>Firmware reaches the network through {wired}, so no Wi-Fi credentials are needed.</div>
      ) : (
        <>
          <label className={styles.field}>
            Wi-Fi SSID
            <input
              className={`nodrag ${styles.fieldInput}`}
              type="text"
              autoComplete="off"
              value={credentials.ssid}
              onChange={(event) => setCredentials(nodeId, { ssid: event.target.value })}
              placeholder="network name"
            />
          </label>
          <label className={styles.field}>
            Wi-Fi password
            <WifiPasswordInput
              className={`nodrag ${styles.fieldInput}`}
              value={credentials.password}
              onChange={(password) => setCredentials(nodeId, { password })}
            />
          </label>
          <div className={styles.note}>Stored in this browser only — never saved in the project file or share links.</div>
        </>
      )}
      {previewOpen && (
        <PhonePreview nodeId={nodeId} title={props.title} controls={controls} onClose={() => setPreviewOpen(false)} />
      )}
    </div>
  )
}
