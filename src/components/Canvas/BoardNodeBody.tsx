import { useMemo } from 'react'
import { useGraphStore, useRootNodes } from '../../state/graphStore'
import { boardHasUsbCdc, boardByFqbn, useUploadStore } from '../../state/uploadStore'
import { controllerSettings } from '../../state/controllerSettings'
import { serialRouteSummary } from '../../state/serialRouting'
import { estimatePowerLoad } from '../../utils/validateGraph'
import ClampedNumberInput from './ClampedNumberInput'
import {
  BOARD_PROFILE_FAMILIES,
  boardProfileById,
  boardProfileFamilyId,
  boardProfilesForFamily,
} from '../../build/boardProfiles'
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
  const pinProperty = useGraphStore((s) => s.pinProperty)
  const unpinProperty = useGraphStore((s) => s.unpinProperty)
  const brightnessPin = useGraphStore((s) => s.performanceDeck.pins.find(
    (pin) => pin.nodeId === nodeId && pin.propertyKey === 'brightness'))
  const setSelectedFqbn = useUploadStore((s) => s.setSelectedFqbn)
  const openPinout = useUploadStore((s) => s.openPinout)
  const selectedFqbn = useUploadStore((s) => s.selectedFqbn)
  const selectedPort = useUploadStore((s) => s.selectedPort)
  const ports = useUploadStore((s) => s.ports)
  const graphNodes = useRootNodes()

  const profileId = useMemo(() => {
    const node = graphNodes.find((n) => n.id === nodeId)
    const props = node?.data.properties as Record<string, unknown> | undefined
    return typeof props?.profileId === 'string' ? props.profileId : ''
  }, [graphNodes, nodeId])

  // One board per sketch is a fact of codegen, not a preference — a second
  // Board node has no meaning, so say so rather than silently letting one win.
  const boardNodeCount = useMemo(
    () => graphNodes.filter((n) => n.data.nodeType === 'Board').length,
    [graphNodes],
  )

  const profile = useMemo(() => boardProfileById(profileId), [profileId])
  const boardTarget = boardByFqbn(selectedFqbn)
  const psramOptions = boardTarget?.psram
  const psramSupported = !!psramOptions || !!profile?.psramMode
  const hasUsbCdc = boardHasUsbCdc(selectedFqbn)
  const settings = useMemo(() => controllerSettings(graphNodes), [graphNodes])
  const power = useMemo(() => estimatePowerLoad(graphNodes), [graphNodes])
  const psramChoice = psramOptions?.find((option) => option.id === settings.psramMode) ?? psramOptions?.[0]
  const serialPort = ports.find((port) => port.address === selectedPort)
  const familyId = profile ? boardProfileFamilyId(profile) : ''
  const familyBoards = useMemo(() => boardProfilesForFamily(familyId), [familyId])

  function chooseBoard(nextId: string) {
    updateNodeProperty(nodeId, 'profileId', nextId)
    const next = boardProfileById(nextId)
    // Profiles list the specific FQBN first and the family fallback after, so
    // the first entry is the closest match for this exact board.
    const fqbn = next?.compatibleFqbns[0]
    if (fqbn) setSelectedFqbn(fqbn)
  }

  function chooseFamily(nextFamilyId: string) {
    const firstBoard = boardProfilesForFamily(nextFamilyId)[0]
    chooseBoard(firstBoard?.id ?? '')
  }

  const peripherals = profile?.peripheralPins
  const psramSummary = settings.psramPolicy === 'auto'
    ? settings.usePsram
      ? `Auto detected ${profile?.memory?.psramMb ?? ''} MB ${settings.psramMode.toUpperCase()} PSRAM from this board profile.`
      : 'This profile does not identify a safe PSRAM interface, so Auto leaves it off.'
    : settings.usePsram
      ? `Render buffers use ${psramChoice?.label ?? settings.psramMode.toUpperCase()} PSRAM.`
      : 'Render buffers stay in internal RAM.'
  const serialSummary = `${serialRouteSummary(settings.serialRoute, serialPort)}. This decides where the serial monitor, RTC set, SD-show transfer and live streaming talk. Use a manual choice only when the USB device does not expose enough identity for Auto.`

  return (
    <div className={`${styles.body} nodrag`}>
      <label className={styles.pickerField}>
        <span className={styles.pickerLabel}>Family</span>
        <select
          className={styles.picker}
          value={familyId}
          onChange={(e) => chooseFamily(e.target.value)}
          aria-label="Board family"
        >
          <option value="">Choose a family…</option>
          {BOARD_PROFILE_FAMILIES.map((family) => (
            <option key={family.id} value={family.id}>{family.label}</option>
          ))}
        </select>
      </label>

      <div className={styles.pickerRow}>
        <label className={styles.pickerField}>
          <span className={styles.pickerLabel}>Board</span>
          <select
            className={styles.picker}
            value={profileId}
            onChange={(e) => chooseBoard(e.target.value)}
            aria-label="Controller board"
            disabled={!familyId}
          >
            <option value="">Choose your board…</option>
            {familyBoards.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={styles.eyeBtn}
          onClick={() => profile && openPinout(profile.id)}
          disabled={!profile}
          title={profile ? `View the ${profile.label} pinout` : 'Choose a board first'}
          aria-label="View board pinout"
        >
          👁
        </button>
      </div>

      {!profile && (
        <p className={styles.empty}>
          Pin advice stays chip-level until an exact board is chosen.
        </p>
      )}

      {profile && (
        <div className={styles.detail}>
          {profile.processor && (
            <div className={styles.row}>
              <span className={styles.key}>Chip</span>
              <span className={styles.value}>{profile.processor}</span>
            </div>
          )}

          {peripherals?.fastLedData && (
            <ul className={styles.peripherals}>
              <li>LED data → GPIO{peripherals.fastLedData.recommendedDefault}</li>
            </ul>
          )}
        </div>
      )}

      <div className={styles.settingsSection}>
        <div className={styles.settingsHeader}>
          <strong>Controller Settings</strong>
        </div>

        <label className={styles.settingField}>
          <span>
            Master brightness
            <span className={styles.settingValue}>
              <b>{settings.brightness}</b>
              <button type="button" className={styles.pinButton}
                aria-label={brightnessPin ? 'Unpin master brightness from Performance Deck' : 'Pin master brightness to Performance Deck'}
                title={brightnessPin ? 'Unpin from Performance Deck' : 'Pin to Performance Deck'}
                onClick={() => brightnessPin ? unpinProperty(brightnessPin.id) : pinProperty(nodeId, 'brightness')}>
                📌
              </button>
            </span>
          </span>
          <input type="range" min={0} max={255} step={1} value={settings.brightness}
            aria-label="Master brightness"
            onChange={(event) => updateNodeProperty(nodeId, 'brightness', Number(event.target.value))} />
        </label>

        <label className={styles.settingField} title="Global FastLED clockless-chipset timing multiplier">
          <span>LED overclock <b>{settings.overclock.toFixed(2)}×</b></span>
          <input type="range" min={1} max={2} step={0.05} value={settings.overclock}
            aria-label="LED overclock"
            onChange={(event) => updateNodeProperty(nodeId, 'overclock', Number(event.target.value))} />
        </label>

        <label className={styles.checkField}>
          <input type="checkbox" checked={settings.powerLimit} aria-label="Enable global power cap"
            onChange={(event) => updateNodeProperty(nodeId, 'powerLimit', event.target.checked)} />
          <span>Enable global power cap</span>
        </label>

        {settings.powerLimit && (
          <div className={styles.numberRow}>
            <label>
              <span>Volts</span>
              <ClampedNumberInput
                value={settings.volts} min={3} max={24} step={1}
                ariaLabel="Power cap volts"
                onCommit={(next) => updateNodeProperty(nodeId, 'volts', next)} />
            </label>
            <label>
              <span>Milliamps</span>
              <ClampedNumberInput
                value={settings.milliamps} min={100} max={100000} step={100}
                ariaLabel="Power cap milliamps"
                onCommit={(next) => updateNodeProperty(nodeId, 'milliamps', next)} />
            </label>
          </div>
        )}

        {power && (
          <div className={styles.powerRequirement} aria-label="Required power supply">
            <span>Required power supply</span>
            <strong>
              5 V · at least {Number((power.requiredSupplyMa / 1000).toFixed(1))} A ·{' '}
              {power.requiredSupplyWattage} W continuous
            </strong>
            <small>
              Includes 20% operating headroom. LED wiring and fuses must still
              cover the {Number((power.worstCaseMa / 1000).toFixed(2))} A full-white ceiling.
            </small>
          </div>
        )}

        {psramSupported ? (
          <div className={styles.psramBlock}>
            <label className={styles.pickerField}>
              <span className={styles.pickerLabel}>Render-buffer memory</span>
              <select className={styles.picker} value={settings.psramPolicy} aria-label="PSRAM policy"
                title={psramSummary}
                onChange={(event) => updateNodeProperty(nodeId, 'psramPolicy', event.target.value)}>
                <option value="auto">Auto (recommended)</option>
                <option value="on">PSRAM on</option>
                <option value="off">PSRAM off</option>
              </select>
            </label>
            {settings.psramPolicy === 'on' && psramOptions && psramOptions.length > 1 && (
              <select className={styles.picker} value={psramChoice?.id} aria-label="PSRAM type"
                onChange={(event) => updateNodeProperty(nodeId, 'psramMode', event.target.value)}>
                {psramOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            )}
          </div>
        ) : (
          <p className={styles.pending}>PSRAM is not available for this board target.</p>
        )}

        {hasUsbCdc && (
          <div className={styles.psramBlock}>
            <label className={styles.pickerField}>
              <span className={styles.pickerLabel}>Serial connection</span>
              <select className={styles.picker} value={settings.serialRoute} aria-label="Serial route"
                title={serialSummary}
                onChange={(event) => updateNodeProperty(nodeId, 'serialRoute', event.target.value)}>
                <option value="auto">Auto (recommended)</option>
                <option value="native">Native USB</option>
                <option value="uart">UART bridge</option>
              </select>
            </label>
          </div>
        )}
      </div>

      {boardNodeCount > 1 && (
        <p className={styles.warning}>
          {boardNodeCount} Board nodes on this canvas. A sketch targets one
          controller — remove the extras.
        </p>
      )}
    </div>
  )
}
