import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Handle, Position, useUpdateNodeInternals } from '@xyflow/react'
import { rootGraphEdges, rootGraphNodes, useGraphStore } from '../../state/graphStore'
import { useHardwareInputStore } from '../../state/hardwareInputStore'
import { useIrLearnStore } from '../../state/irLearnStore'
import { useUiStore } from '../../state/uiStore'
import {
  IR_REMOTE_LEARN_HANDLE,
  IR_REMOTE_PROTOCOLS,
  MAX_IR_REMOTE_BUTTONS,
  irRemoteButtonHandle,
  normalizeIrRemoteButtons,
  type IrRemoteButton,
} from '../../state/irRemote'
import { portColor } from '../../state/nodeLibrary'
import styles from './IRRemoteBody.module.css'
import { NODE_HANDLE_STYLE } from './nodeHandleStyle'

const BOOL_COLOR = portColor('bool')

function activateHandleFromKeyboard(event: React.KeyboardEvent<HTMLDivElement>) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  event.stopPropagation()
  event.currentTarget.click()
}

function KeyRow({ nodeId, button, wired }: { nodeId: string; button: IrRemoteButton; wired: number }) {
  const pressed = useHardwareInputStore((state) => state.button.get(`${nodeId}:${button.id}`) ?? false)
  const setButton = useHardwareInputStore((state) => state.setButton)
  const update = useGraphStore((state) => state.updateIrRemoteButton)
  const remove = useGraphStore((state) => state.removeIrRemoteButton)
  const requestConfirm = useUiStore((state) => state.requestConfirm)
  const [label, setLabel] = useState(button.label)
  const stateKey = `${nodeId}:${button.id}`
  const handle = irRemoteButtonHandle(button.id)

  useEffect(() => setLabel(button.label), [button.label])

  const release = () => setButton(stateKey, false)
  const commitLabel = () => {
    if (label.trim() && label.trim() !== button.label) update(nodeId, button.id, { label })
    else setLabel(button.label)
  }
  const removeKey = async () => {
    if (wired > 0) {
      const ok = await requestConfirm({
        title: `Remove ${button.label}?`,
        message: wired === 1
          ? 'This key has a wire. Removing it disconnects that wire.'
          : `This key has ${wired} wires. Removing it disconnects them.`,
        confirmLabel: 'Remove',
        tone: 'danger',
      })
      if (!ok) return
    }
    remove(nodeId, button.id)
  }

  return (
    <div className={styles.row}>
      <button
        type="button"
        className={`nodrag ${styles.press} ${pressed ? styles.pressActive : ''}`}
        aria-label={`Press ${button.label}`}
        aria-pressed={pressed}
        title={button.repeat === 'held' ? 'Hold to keep sending' : 'Sends once per press'}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture?.(event.pointerId)
          setButton(stateKey, true)
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
      >
        <span />
      </button>
      <input
        className={`nodrag ${styles.name}`}
        aria-label={`${button.label} name`}
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        onBlur={commitLabel}
        onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
      />
      <select
        className={`nodrag ${styles.select}`}
        aria-label={`${button.label} repeat`}
        value={button.repeat}
        onChange={(event) => update(nodeId, button.id, { repeat: event.target.value === 'held' ? 'held' : 'once' })}
      >
        <option value="once">once</option>
        <option value="held">held</option>
      </select>
      <button
        type="button"
        className={`nodrag ${styles.remove}`}
        aria-label={`Remove ${button.label}`}
        title={wired > 0 ? `Remove ${button.label} and its wires` : `Remove ${button.label}`}
        onClick={() => { void removeKey() }}
      >
        ×
      </button>
      <div className={styles.codes}>
        <select
          className={`nodrag ${styles.select}`}
          aria-label={`${button.label} protocol`}
          value={button.protocol}
          onChange={(event) => update(nodeId, button.id, { protocol: event.target.value as IrRemoteButton['protocol'] })}
        >
          {button.protocol === '' && <option value="">repair</option>}
          {IR_REMOTE_PROTOCOLS.map((protocol) => <option key={protocol} value={protocol}>{protocol}</option>)}
        </select>
        <input
          className={`nodrag nowheel ${styles.code}`}
          type="number"
          min={0}
          aria-label={`${button.label} address`}
          value={button.address}
          onChange={(event) => update(nodeId, button.id, { address: Number(event.target.value) })}
        />
        <input
          className={`nodrag nowheel ${styles.code}`}
          type="number"
          min={0}
          aria-label={`${button.label} command`}
          value={button.command}
          onChange={(event) => update(nodeId, button.id, { command: Number(event.target.value) })}
        />
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id={handle}
        title={`${button.label} · bool`}
        role="button"
        tabIndex={0}
        aria-label={`Connect from IR Remote ${button.label} output, bool. Press Enter or Space to choose a destination port.`}
        onKeyDown={activateHandleFromKeyboard}
        style={{ ...NODE_HANDLE_STYLE, top: '50%', right: -8, background: BOOL_COLOR, boxShadow: `0 0 6px ${BOOL_COLOR}` }}
      />
    </div>
  )
}

export default function IRRemoteBody({ nodeId }: { nodeId: string }) {
  const saved = useGraphStore((state) => {
    const node = rootGraphNodes(state).find((candidate) => candidate.id === nodeId)
    return (node?.data.properties as Record<string, unknown> | undefined)?.buttons
  })
  const edgeKey = useGraphStore((state) => rootGraphEdges(state)
    .filter((edge) => edge.source === nodeId && edge.sourceHandle)
    .map((edge) => edge.sourceHandle)
    .join('|'))
  const wireCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const handle of edgeKey.split('|').filter(Boolean)) {
      counts.set(handle, (counts.get(handle) ?? 0) + 1)
    }
    return counts
  }, [edgeKey])
  const add = useGraphStore((state) => state.addIrRemoteButton)
  const buttons = useMemo(() => normalizeIrRemoteButtons(saved), [saved])
  const updateNodeInternals = useUpdateNodeInternals()

  useEffect(() => updateNodeInternals(nodeId), [buttons.length, nodeId, updateNodeInternals])

  return (
    <div className={styles.remote} aria-label="IR remote keys">
      {buttons.map((button) => (
        <KeyRow
          key={button.id}
          nodeId={nodeId}
          button={button}
          wired={wireCounts.get(irRemoteButtonHandle(button.id)) ?? 0}
        />
      ))}
      <button
        type="button"
        className={`nodrag ${styles.add}`}
        disabled={buttons.length >= MAX_IR_REMOTE_BUTTONS}
        onClick={() => add(nodeId)}
      >
        Add key
      </button>
      {buttons.length < MAX_IR_REMOTE_BUTTONS && (
        <div className={styles.learn}>
          <button type="button" className="nodrag" onClick={() => { void beginLearn(nodeId) }}>
            Learn button…
          </button>
          <Handle
            type="source"
            position={Position.Right}
            id={IR_REMOTE_LEARN_HANDLE}
            title="Learn button…"
            role="button"
            tabIndex={0}
            aria-label="Connect from IR Remote Learn button output, bool."
            onKeyDown={activateHandleFromKeyboard}
            style={{ ...NODE_HANDLE_STYLE, top: '50%', right: -8, background: BOOL_COLOR, boxShadow: `0 0 6px ${BOOL_COLOR}` }}
          />
        </div>
      )}
      <LearnDialog nodeId={nodeId} />
    </div>
  )
}

async function beginLearn(nodeId: string) {
  const ui = useUiStore.getState()
  const label = await ui.requestPrompt({
    title: 'Learn a button',
    message: 'Name the key. After the diagnostic sketch uploads, press that key once on the remote.',
    confirmLabel: 'Continue',
  })
  if (!label?.trim()) return
  if (!useGraphStore.getState().trusted) {
    const trust = await ui.requestConfirm({
      title: 'Trust this workspace?',
      message: 'Learning flashes a diagnostic sketch and reads the serial port. Trust this workspace before talking to the board.',
      confirmLabel: 'Trust and learn',
      tone: 'danger',
    })
    if (!trust) return
    useGraphStore.getState().setTrusted(true)
  }
  useIrLearnStore.getState().start(nodeId, label.trim())
  void useIrLearnStore.getState().prepare()
}

function LearnDialog({ nodeId }: { nodeId: string }) {
  const session = useIrLearnStore((state) => state.session?.nodeId === nodeId ? state.session : null)
  const confirm = useIrLearnStore((state) => state.confirm)
  const cancel = useIrLearnStore((state) => state.cancel)
  const listenAgain = () => useIrLearnStore.setState((state) => state.session?.sketchUploaded
    ? { session: { ...state.session, phase: 'listening', captured: null, error: null } }
    : state)
  if (!session || typeof document === 'undefined') return null
  const captured = session.captured
  return createPortal(
    <div className={`nodrag nowheel ${styles.overlay}`} onMouseDown={(event) => { if (event.target === event.currentTarget) cancel() }}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="ir-learn-title">
        <h2 id="ir-learn-title">Learn {session.label}</h2>
        {session.preparing && <p>Uploading a receiver-only sketch. It will not replace Upload last sketch.</p>}
        {session.phase === 'listening' && !session.preparing && <p>Press {session.label} once on the remote. Repeats are ignored.</p>}
        {captured && (
          <p>
            {captured.protocol} · address {captured.address} · command {captured.command}
          </p>
        )}
        {session.error && <p>{session.error}</p>}
        <div className={styles.actions}>
          <button type="button" onClick={cancel}>Cancel</button>
          {captured && <button type="button" onClick={listenAgain}>Try again</button>}
          {captured && <button type="button" onClick={confirm}>Save key</button>}
        </div>
      </div>
    </div>,
    document.body,
  )
}
