import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useEscapeLayer } from '../../hooks/useEscapeLayer'
import { boardPinVerdict, boardProfileById, selectedPhysicalBoardProfile } from '../../build/boardProfiles'
import { boardI2cDefault, profileI2cDefault } from '../../build/boardI2cDefaults'
import { customBoardRowsFromReference, resolveCustomBoard } from '../../build/customBoardProfile'
import { CUSTOM_BOARD_TEMPLATES, customBoardTemplate } from '../../build/customBoardTemplates'
import { collectPinUses } from '../../build/hardwareManifest'
import { BOARD_GPIO_BY_FQBN, pinSupports } from '../../state/boardGpio'
import {
  CUSTOM_BOARD_MAX_LABEL_LENGTH,
  CUSTOM_BOARD_MAX_PINS_PER_SIDE,
  createCustomBoardDraft,
  customBoardIssueBlocksApply,
  newCustomBoardSlotId,
  resizeCustomBoardSide,
  type CustomBoardDefinition,
  type CustomBoardIssue,
  type CustomBoardSlot,
} from '../../state/customBoard'
import { useGraphStore, useRootNodes } from '../../state/graphStore'
import { retargetDefaultI2c } from '../../state/pinRetarget'
import { useUploadStore } from '../../state/uploadStore'
import ClampedNumberInput from '../Canvas/ClampedNumberInput'
import { CustomBoardGraphic } from './CustomBoardGraphic'
import styles from './CustomBoardEditor.module.css'

/*
 * The custom board's own editor.
 *
 * It owns a local draft: nothing reaches the project until Apply, which saves
 * and selects the definition as one undo step, and Cancel leaves the project
 * exactly as it was. The preview is the same graphic every view draws, and
 * the consequences for wiring that already exists are listed before Apply
 * rather than discovered after it.
 */

type Side = 'leftPins' | 'rightPins'
type SlotRole = CustomBoardSlot['role']

const SIDES: readonly { key: Side; label: string; countLabel: string }[] = [
  { key: 'leftPins', label: 'Left header', countLabel: 'Left pins' },
  { key: 'rightPins', label: 'Right header', countLabel: 'Right pins' },
]

const ROLE_LABELS: Record<Exclude<SlotRole, 'undefined'>, string> = {
  gpio: 'GPIO',
  supply: 'Supply',
  ground: 'Ground',
  reset: 'Reset',
  reserved: 'Reserved',
  unconnected: 'Unconnected',
}

interface Props {
  boardNodeId: string
  /** The project's saved definition, when there is one. */
  saved?: unknown
  onClose: () => void
}

function savedDraft(saved: unknown): CustomBoardDefinition | undefined {
  // A saved value is only reopened when it has the shape the editor can hold;
  // anything else is recreated rather than half-loaded.
  if (!saved || typeof saved !== 'object') return undefined
  const value = saved as Partial<CustomBoardDefinition>
  return Array.isArray(value.leftPins) && Array.isArray(value.rightPins) && typeof value.referenceProfileId === 'string'
    ? saved as CustomBoardDefinition
    : undefined
}

function withRole(slot: CustomBoardSlot, role: SlotRole, freeGpio: number): CustomBoardSlot {
  const base = { id: slot.id, ...(slot.label ? { label: slot.label } : {}) }
  if (role === 'gpio') return { ...base, role, gpio: freeGpio, enabled: true }
  if (role === 'supply') return { ...base, role, voltage: 3.3, direction: 'output' }
  return { ...base, role }
}

function issueKey(definition: CustomBoardDefinition, issue: CustomBoardIssue): string | undefined {
  const parsed = /^(leftPins|rightPins)\.(\d+)/.exec(issue.path)
  if (parsed) return `${parsed[1]}.${parsed[2]}`
  const bySlot = /^slots\.([^.]+)/.exec(issue.path)
  if (!bySlot) return undefined
  for (const { key } of SIDES) {
    const index = definition[key].findIndex((slot) => slot.id === bySlot[1])
    if (index >= 0) return `${key}.${index}`
  }
  return undefined
}

export default function CustomBoardEditor({ boardNodeId, saved, onClose }: Props) {
  const applyCustomBoard = useGraphStore((state) => state.applyCustomBoard)
  const setSelectedFqbn = useUploadStore((state) => state.setSelectedFqbn)
  const rootNodes = useRootNodes()
  const titleId = useId()
  const nameRef = useRef<HTMLInputElement>(null)
  const savedDefinition = savedDraft(saved)
  const [draft, setDraft] = useState<CustomBoardDefinition>(
    () => savedDefinition ?? createCustomBoardDraft(CUSTOM_BOARD_TEMPLATES[0].referenceProfileId),
  )
  const [pendingCopy, setPendingCopy] = useState<Pick<CustomBoardDefinition, 'leftPins' | 'rightPins'> | null>(null)
  const [applyIssues, setApplyIssues] = useState<CustomBoardIssue[]>([])

  useEffect(() => { nameRef.current?.focus() }, [])
  // Opened from the board menu, so it answers Escape before the menu does.
  useEscapeLayer(onClose)

  const reference = boardProfileById(draft.referenceProfileId)
  const template = customBoardTemplate(draft.referenceProfileId)
  const chip = template ? BOARD_GPIO_BY_FQBN[template.capabilityFqbn] : undefined
  const resolution = useMemo(() => resolveCustomBoard(draft, boardProfileById), [draft])
  const draftProfile = resolution.profile
  const issues = resolution.issues
  const blocking = issues.filter((issue) => customBoardIssueBlocksApply(issue, draft))
  const rowIssues = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const issue of issues) {
      const key = issueKey(draft, issue)
      if (key) map.set(key, [...(map.get(key) ?? []), issue.message])
    }
    return map
  }, [draft, issues])
  const generalIssues = issues.filter((issue) => !issueKey(draft, issue))

  const slots = [...draft.leftPins, ...draft.rightPins]
  const usedGpios = new Map(slots.flatMap((slot) => slot.role === 'gpio' ? [[slot.gpio, slot.id] as const] : []))
  const chipPins = chip ? Array.from({ length: (chip.maxPin ?? 0) + 1 }, (_, pin) => pin) : []
  const supportedPins = new Set((chip?.recommended ?? []).map((note) => note.pin))
  const freeGpio = chipPins.find((pin) => supportedPins.has(pin) && !template?.blockedGpios[pin] && !usedGpios.has(pin)) ?? 0
  // SDA and SCL are both driven and read, so only enabled pins able to do
  // both are offered for the bus.
  const i2cPins = slots.flatMap((slot) => {
    if (slot.role !== 'gpio' || !slot.enabled || template?.blockedGpios[slot.gpio]) return []
    const note = chip?.recommended.find((entry) => entry.pin === slot.gpio)
    return note && pinSupports(note, 'digitalInput') && pinSupports(note, 'digitalOutput') ? [slot.gpio] : []
  })
  const previewBus = draft.defaultI2c.mode === 'custom'
    ? { sda: { arduinoPin: draft.defaultI2c.sda }, scl: { arduinoPin: draft.defaultI2c.scl } }
    : draftProfile ? profileI2cDefault(draftProfile) : undefined
  const inheritedBus = boardI2cDefault(draft.referenceProfileId)

  // What applying does to wiring that already exists, said before Apply.
  const current = useMemo(() => selectedPhysicalBoardProfile(rootNodes), [rootNodes])
  const consequences = useMemo(() => {
    if (!draftProfile) return undefined
    const unavailable = collectPinUses(rootNodes)
      .filter((use) => boardPinVerdict(draftProfile, use.pin).standing === 'reserved')
    const sameBoard = current?.id === draftProfile.id
    const i2cMoves = sameBoard
      ? retargetDefaultI2c(rootNodes, draftProfile).nodes
        .filter((node, index) => node !== rootNodes[index])
        .map((node) => node.data.label)
      : []
    return { unavailable, i2cMoves, boardChange: !sameBoard }
  }, [current, draftProfile, rootNodes])

  const update = (patch: Partial<CustomBoardDefinition>) => {
    setApplyIssues([])
    setDraft((previous) => ({ ...previous, ...patch }))
  }
  const updateSide = (side: Side, next: CustomBoardSlot[]) => update({ [side]: next })
  const updateSlot = (side: Side, index: number, slot: CustomBoardSlot) =>
    updateSide(side, draft[side].map((entry, position) => position === index ? slot : entry))
  const moveSlot = (side: Side, index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= draft[side].length) return
    const next = [...draft[side]]
    ;[next[index], next[target]] = [next[target], next[index]]
    updateSide(side, next)
  }
  const switchSide = (side: Side, index: number) => {
    const other: Side = side === 'leftPins' ? 'rightPins' : 'leftPins'
    if (draft[other].length >= CUSTOM_BOARD_MAX_PINS_PER_SIDE) return
    const slot = draft[side][index]
    update({
      [side]: draft[side].filter((_, position) => position !== index),
      [other]: [...draft[other], slot],
    })
  }

  const copyFromReference = () => {
    const rows = reference ? customBoardRowsFromReference(reference) : undefined
    if (!rows) return
    const defined = slots.some((slot) => slot.role !== 'undefined')
    if (defined) setPendingCopy(rows)
    else update(rows)
  }

  const apply = () => {
    const result = applyCustomBoard(boardNodeId, draft)
    if (!result.ok) {
      setApplyIssues(result.issues)
      return
    }
    const fqbn = reference?.compatibleFqbns[0]
    if (fqbn) setSelectedFqbn(fqbn)
    onClose()
  }

  const copyAvailable = !!reference && !!customBoardRowsFromReference(reference)

  // Rendered in place, not portalled: the board menu that opens it closes on
  // any pointer outside its own DOM, which a portal would be.
  return (
    <div className={styles.backdrop} onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className={styles.header}>
          <div>
            <h2 id={titleId} className={styles.title}>Custom board</h2>
            <p className={styles.subtitle}>
              Define each header position as printed on your board, front side up with row 1 at the top.
            </p>
          </div>
          <button type="button" className={styles.secondary} onClick={onClose}>Cancel</button>
        </header>

        <div className={styles.body}>
          <div className={styles.form}>
            <fieldset className={styles.group}>
              <legend>Board</legend>
              <label className={styles.field}>
                <span>Name</span>
                <input ref={nameRef} value={draft.name} maxLength={80}
                  onChange={(event) => update({ name: event.target.value })} />
              </label>
              <label className={styles.field}>
                <span>Uses the same processor/build settings as…</span>
                <select value={draft.referenceProfileId}
                  onChange={(event) => update({ referenceProfileId: event.target.value })}>
                  {!template && <option value={draft.referenceProfileId}>Unsupported template — choose one</option>}
                  {CUSTOM_BOARD_TEMPLATES.map((entry) => (
                    <option key={entry.referenceProfileId} value={entry.referenceProfileId}>
                      {boardProfileById(entry.referenceProfileId)?.label ?? entry.referenceProfileId}
                    </option>
                  ))}
                </select>
              </label>
              {reference && (
                <dl className={styles.facts} aria-label="Inherited build settings">
                  <div><dt>Target</dt><dd>{reference.compatibleFqbns[0]}</dd></div>
                  {reference.processor && <div><dt>Processor</dt><dd>{reference.processor}</dd></div>}
                  <div><dt>Memory</dt><dd>{reference.memory
                    ? `${reference.memory.flashMb} MB flash · ${reference.memory.psramMb ? `${reference.memory.psramMb} MB ${reference.psramMode?.toUpperCase() ?? ''} PSRAM` : 'no PSRAM'}`
                    : 'Flash from the target defaults · no PSRAM declared'}</dd></div>
                </dl>
              )}
              <p className={styles.hint}>
                Choose the template with the same module, not merely a similar-looking board: its flash, PSRAM and pin limits apply to yours.
              </p>
              <label className={styles.field}>
                <span>Controller power</span>
                <select value={draft.controllerPower}
                  onChange={(event) => update({ controllerPower: event.target.value as CustomBoardDefinition['controllerPower'] })}>
                  <option value="unspecified">Not decided yet</option>
                  <option value="usb">USB</option>
                  <option value="external">External supply</option>
                </select>
              </label>
            </fieldset>

            <fieldset className={styles.group}>
              <legend>Headers</legend>
              <div className={styles.counts}>
                {SIDES.map(({ key, countLabel }) => (
                  <label key={key} className={styles.field}>
                    <span>{countLabel}</span>
                    <ClampedNumberInput value={draft[key].length} min={0} max={CUSTOM_BOARD_MAX_PINS_PER_SIDE} step={1}
                      ariaLabel={countLabel}
                      onCommit={(count) => updateSide(key, resizeCustomBoardSide(draft[key], count))} />
                  </label>
                ))}
              </div>
              <p className={styles.hint}>Counts include power and ground. Shortening a header removes its bottom rows.</p>
              {copyAvailable && (
                <button type="button" className={styles.secondary} onClick={copyFromReference}>
                  Copy pin map from {reference?.label}
                </button>
              )}
              {pendingCopy && (
                <div className={styles.confirm} role="alert">
                  <p>
                    Replace the current {draft.leftPins.length} left and {draft.rightPins.length} right rows with
                    {' '}{pendingCopy.leftPins.length} left and {pendingCopy.rightPins.length} right rows from {reference?.label}?
                    Supply pads and unnumbered pads arrive undefined for you to define.
                  </p>
                  <div className={styles.actions}>
                    <button type="button" className={styles.primary} onClick={() => { update(pendingCopy); setPendingCopy(null) }}>Replace rows</button>
                    <button type="button" className={styles.secondary} onClick={() => setPendingCopy(null)}>Keep current rows</button>
                  </div>
                </div>
              )}
            </fieldset>

            {SIDES.map(({ key, label }) => (
              <fieldset key={key} className={styles.group}>
                <legend>{label}</legend>
                {draft[key].length === 0 && <p className={styles.hint}>No positions on this side.</p>}
                <ol className={styles.rows}>
                  {draft[key].map((slot, index) => {
                    const messages = rowIssues.get(`${key}.${index}`) ?? []
                    const row = `${label} row ${index + 1}`
                    return (
                      <li key={slot.id} className={`${styles.row} ${messages.length ? styles.rowInvalid : ''}`}>
                        <span className={styles.rowNumber} aria-hidden="true">{index + 1}</span>
                        <select aria-label={`${row} role`} value={slot.role}
                          onChange={(event) => updateSlot(key, index, withRole(slot, event.target.value as SlotRole, freeGpio))}>
                          {slot.role === 'undefined' && <option value="undefined" disabled>Choose role…</option>}
                          {Object.entries(ROLE_LABELS).map(([role, roleLabel]) => (
                            <option key={role} value={role}>{roleLabel}</option>
                          ))}
                        </select>
                        {slot.role === 'gpio' && <>
                          <select aria-label={`${row} GPIO`} value={slot.gpio}
                            onChange={(event) => updateSlot(key, index, { ...slot, gpio: Number(event.target.value) })}>
                            {chipPins.map((pin) => {
                              const blocked = template?.blockedGpios[pin] ?? (!supportedPins.has(pin) ? 'not a GPIO on this module' : undefined)
                              const elsewhere = usedGpios.get(pin)
                              const taken = elsewhere !== undefined && elsewhere !== slot.id
                              return (
                                <option key={pin} value={pin} disabled={(!!blocked || taken) && pin !== slot.gpio}>
                                  {`GPIO${pin}${blocked ? ` — ${blocked}` : taken ? ' — already placed' : ''}`}
                                </option>
                              )
                            })}
                          </select>
                          <label className={styles.inline}>
                            <input type="checkbox" checked={slot.enabled}
                              onChange={(event) => updateSlot(key, index, { ...slot, enabled: event.target.checked })} />
                            <span>Enabled</span>
                          </label>
                        </>}
                        {slot.role === 'supply' && <>
                          <ClampedNumberInput value={slot.voltage} min={0.1} max={48} step={0.1}
                            ariaLabel={`${row} voltage`} className={styles.voltage}
                            onCommit={(voltage) => updateSlot(key, index, { ...slot, voltage })} />
                          <span className={styles.unit}>V</span>
                          <select aria-label={`${row} direction`} value={slot.direction}
                            onChange={(event) => updateSlot(key, index, { ...slot, direction: event.target.value as 'input' | 'output' })}>
                            <option value="output">Output</option>
                            <option value="input">Input</option>
                          </select>
                        </>}
                        <input className={styles.label} aria-label={`${row} printed label`} placeholder="Printed label"
                          value={slot.label ?? ''} maxLength={CUSTOM_BOARD_MAX_LABEL_LENGTH}
                          onChange={(event) => {
                            const next = { ...slot }
                            if (event.target.value) next.label = event.target.value
                            else delete next.label
                            updateSlot(key, index, next)
                          }} />
                        <span className={styles.rowTools}>
                          <button type="button" aria-label={`Move ${row} up`} disabled={index === 0} onClick={() => moveSlot(key, index, -1)}>↑</button>
                          <button type="button" aria-label={`Move ${row} down`} disabled={index === draft[key].length - 1} onClick={() => moveSlot(key, index, 1)}>↓</button>
                          <button type="button" aria-label={`Move ${row} to the other header`} onClick={() => switchSide(key, index)}>⇄</button>
                          <button type="button" aria-label={`Remove ${row}`} onClick={() => updateSide(key, draft[key].filter((_, position) => position !== index))}>✕</button>
                        </span>
                        {messages.length > 0 && <p className={styles.rowIssue}>{messages.join(' ')}</p>}
                      </li>
                    )
                  })}
                </ol>
                <button type="button" className={styles.secondary} disabled={draft[key].length >= CUSTOM_BOARD_MAX_PINS_PER_SIDE}
                  onClick={() => updateSide(key, [...draft[key], { id: newCustomBoardSlotId(), role: 'undefined' }])}>
                  Add position
                </button>
              </fieldset>
            ))}

            <fieldset className={styles.group}>
              <legend>Default I2C bus</legend>
              <label className={styles.inline}>
                <input type="radio" name={`${titleId}-i2c`} checked={draft.defaultI2c.mode === 'inherit'}
                  onChange={() => update({ defaultI2c: { mode: 'inherit' } })} />
                <span>
                  Keep the template default
                  {inheritedBus ? ` (SDA GPIO${inheritedBus.sda.arduinoPin} · SCL GPIO${inheritedBus.scl.arduinoPin})` : ''}
                </span>
              </label>
              <label className={styles.inline}>
                <input type="radio" name={`${titleId}-i2c`} checked={draft.defaultI2c.mode === 'custom'}
                  disabled={i2cPins.length < 2}
                  onChange={() => update({ defaultI2c: { mode: 'custom', sda: i2cPins[0], scl: i2cPins[1] } })} />
                <span>Choose SDA and SCL from this board’s enabled input/output GPIOs</span>
              </label>
              {draft.defaultI2c.mode === 'custom' && (
                <div className={styles.counts}>
                  {(['sda', 'scl'] as const).map((role) => {
                    const bus = draft.defaultI2c as Extract<CustomBoardDefinition['defaultI2c'], { mode: 'custom' }>
                    return (
                      <label key={role} className={styles.field}>
                        <span>{role.toUpperCase()}</span>
                        <select value={bus[role]} onChange={(event) => update({ defaultI2c: { ...bus, [role]: Number(event.target.value) } })}>
                          {!i2cPins.includes(bus[role]) && <option value={bus[role]}>{`GPIO${bus[role]} — not an enabled input/output pin`}</option>}
                          {i2cPins.map((pin) => <option key={pin} value={pin}>{`GPIO${pin}`}</option>)}
                        </select>
                      </label>
                    )
                  })}
                </div>
              )}
              <p className={styles.hint}>
                SDA and SCL stay GPIOs with a bus function. A printed label alone changes no bus.
              </p>
              {issues.filter((issue) => issue.scope === 'i2c').map((issue) => (
                <p key={issue.path} className={customBoardIssueBlocksApply(issue, draft) ? styles.error : styles.warning}>{issue.message}</p>
              ))}
            </fieldset>
          </div>

          <aside className={styles.preview} aria-label="Live preview">
            <CustomBoardGraphic definition={draft} defaultI2c={previewBus} className={styles.graphic} />
            {(generalIssues.length > 0 || applyIssues.length > 0) && (
              <ul className={styles.issues} aria-label="Problems to fix">
                {[...generalIssues, ...applyIssues.filter((issue) => !issues.includes(issue))]
                  .filter((issue) => issue.scope !== 'i2c')
                  .map((issue, index) => (
                    <li key={`${issue.path}-${index}`} className={customBoardIssueBlocksApply(issue, draft) ? styles.error : styles.warning}>
                      {issue.message}
                    </li>
                  ))}
              </ul>
            )}
            {rowIssues.size > 0 && <p className={styles.error}>{`${rowIssues.size} row${rowIssues.size === 1 ? '' : 's'} need attention.`}</p>}
            <section className={styles.effects} aria-label="Effect on existing wiring">
              <h3>Existing wiring</h3>
              {!consequences && <p>Complete the definition to see how it affects existing wiring.</p>}
              {consequences?.boardChange && (
                <p>Applying selects this board. Parts the app placed move onto its pins; pins you chose are remembered for the board they were chosen on.</p>
              )}
              {consequences && consequences.unavailable.length > 0 && (
                <ul>
                  {consequences.unavailable.map((use) => (
                    <li key={`${use.nodeId}-${use.propertyKey}`} className={styles.warning}>
                      {consequences.boardChange
                        ? `${use.label} is on GPIO${use.pin}, which this board will not offer. A pin the app placed moves to a free one; a pin you chose stays and blocks firmware until you move it.`
                        : `${use.label} keeps GPIO${use.pin}, which this board will not offer. It stays assigned and blocks firmware until you move it.`}
                    </li>
                  ))}
                </ul>
              )}
              {consequences && consequences.i2cMoves.length > 0 && (
                <p>{`Follows the new I2C pair: ${consequences.i2cMoves.join(', ')}. Pins you chose yourself stay as they are.`}</p>
              )}
              {consequences && !consequences.boardChange && consequences.unavailable.length === 0 && consequences.i2cMoves.length === 0 && (
                <p>No existing connection changes.</p>
              )}
            </section>
          </aside>
        </div>

        <footer className={styles.footer}>
          <div className={styles.actions}>
            {savedDefinition && (
              <button type="button" className={styles.secondary} onClick={() => update(savedDefinition)}>Reset edits</button>
            )}
            <button type="button" className={styles.secondary}
              // The project's board keeps its identity, so choices remembered
              // for it still apply once it is defined again.
              onClick={() => { setPendingCopy(null); update({ ...createCustomBoardDraft(draft.referenceProfileId), id: draft.id }) }}>
              Start over
            </button>
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={onClose}>Cancel</button>
            <button type="button" className={styles.primary} disabled={blocking.length > 0 || !draftProfile} onClick={apply}>
              Apply
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}
