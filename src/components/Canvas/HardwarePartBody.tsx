import { rootGraphNodes, useGraphStore } from '../../state/graphStore'
import { PART_FIELDS } from '../../state/partFields'
import {
  isGpioPinProperty,
  isPropertyEnabled,
  libraryDefaults,
  propertyLabel,
  propertyMeta,
} from '../../state/nodeLibrary'
import styles from './BoardNodeBody.module.css'
import PartIdentity from '../Hardware/PartIdentity'
import BoardPinPicker from '../Hardware/BoardPinPicker'

// A physical part's settings, shown in the hardware view rather than on its
// signal node. Hardware-only parts and graph-visible inputs/outputs share this
// body so every assignment has exactly one editing surface.
//
// `model` exists so the graph can name the exact part. The player generator has
// always assumed a MAX98357A and nothing in the UI ever said so, which is the
// class of silent assumption naming the part is meant to end.



interface Props { nodeId: string; nodeType?: string }

function hardwareFieldLabel(nodeType: string, key: string, declared?: string): string {
  if (declared) return declared
  const known = propertyLabel(nodeType, key)
  if (known !== key) return known
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export default function HardwarePartBody({ nodeId, nodeType = 'Amplifier' }: Props) {
  const updateNodeProperty = useGraphStore((s) => s.updateNodeProperty)
  const savedProps = useGraphStore((s) => {
    const node = rootGraphNodes(s).find((n) => n.id === nodeId)
    return (node?.data.properties ?? {}) as Record<string, unknown>
  })
  const props = { ...libraryDefaults(nodeType), ...savedProps }
  const nodeLabel = useGraphStore((s) => rootGraphNodes(s).find((n) => n.id === nodeId)?.data.label ?? nodeType)
  const declaredFields = PART_FIELDS[nodeType] ?? []
  const pinKeys = [...new Set([
    ...Object.keys(props).filter((key) => isGpioPinProperty(nodeType, key)),
    ...declaredFields.filter((field) => field.kind === 'pin').map((field) => field.key),
  ])].filter((key) => isPropertyEnabled(nodeType, key, props))
  const otherFields = declaredFields.filter((field) => field.kind !== 'pin')

  return (
    <div className={styles.body}>
      <PartIdentity nodeId={nodeId} nodeType={nodeType} />

      {pinKeys.length > 0 && (
        <div className={styles.settingsSection} aria-label={`${nodeLabel} pin assignments`}>
          <div className={styles.settingsHeader}>
            <strong>Pin assignments</strong>
            <span>Known-good GPIOs are filtered for this connection.</span>
          </div>
          {pinKeys.map((key) => {
            const field = declaredFields.find((candidate) => candidate.key === key)
            const meta = propertyMeta(nodeType, key)
            const value = Number(props[key] ?? 0)
            const label = hardwareFieldLabel(nodeType, key, field?.label)
            return (
              <label key={key} className={styles.settingField}>
                <span>{label}</span>
                <BoardPinPicker
                  nodeId={nodeId}
                  nodeType={nodeType}
                  propertyKey={key}
                  properties={props}
                  value={value}
                  min={meta?.control === 'slider' ? meta.min : 0}
                  max={meta?.control === 'slider' ? meta.max : 255}
                  ariaLabel={label}
                  onChange={(next) => updateNodeProperty(nodeId, key, next)}
                />
              </label>
            )
          })}
        </div>
      )}

      {otherFields.length > 0 && (
        <div className={styles.detail}>
        {otherFields.map((field) => (
          <label key={field.key} className={styles.row}>
            <span className={styles.key}>{field.label}</span>
            {field.kind === 'select' ? (
              <select
                className={`nodrag ${styles.picker}`}
                value={String(props[field.key] ?? field.options[0])}
                onChange={(event) => updateNodeProperty(nodeId, field.key, event.target.value)}
              >
                {field.options.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            ) : (
              <input
                className={`nodrag nowheel ${styles.picker}`}
                type="number"
                min={field.kind === 'number' ? field.min : 0}
                max={field.kind === 'number' ? field.max : undefined}
                value={Number(props[field.key] ?? 0)}
                onChange={(event) => updateNodeProperty(nodeId, field.key, Number(event.target.value))}
              />
            )}
          </label>
        ))}
        </div>
      )}
    </div>
  )
}
