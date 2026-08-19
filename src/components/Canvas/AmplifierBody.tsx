import { useGraphStore } from '../../state/graphStore'
import styles from './BoardNodeBody.module.css'

// The amplifier's settings, shown in the hardware view rather than on a graph
// node — it carries no signal, so it has no business on the signal canvas.
// Bespoke and small, the same shape as BoardNodeBody, because a hardware-only
// part has a handful of fields rather than the generic property list a node
// body renders.
//
// `model` exists so the graph can name the exact part. The player generator has
// always assumed a MAX98357A and nothing in the UI ever said so, which is the
// class of silent assumption naming the part is meant to end.

/** Amplifiers Studio can generate a player for, and what each implies. */
const AMPLIFIER_MODELS = [
  { id: 'MAX98357A', note: 'Mono I2S class-D. Gain is set by a resistor on the module, not in software.' },
  { id: 'MAX98357A x2', note: 'Two mono modules for stereo, sharing BCLK and LRC with SD pins swapped.' },
  { id: 'PCM5102A', note: 'I2S DAC with a line-level output — needs a powered speaker or a separate amp.' },
  { id: 'UDA1334A', note: 'I2S DAC, line level. Same wiring as the PCM5102A.' },
] as const

const PIN_FIELDS = [
  { key: 'i2sBclk', label: 'BCLK' },
  { key: 'i2sLrc', label: 'LRC / WS' },
  { key: 'i2sDout', label: 'DIN' },
] as const

interface Props { nodeId: string }

export default function AmplifierBody({ nodeId }: Props) {
  const updateNodeProperty = useGraphStore((s) => s.updateNodeProperty)
  const props = useGraphStore((s) => {
    const node = s.nodes.find((n) => n.id === nodeId)
    return (node?.data.properties ?? {}) as Record<string, unknown>
  })

  const model = String(props.model ?? 'MAX98357A')
  const note = AMPLIFIER_MODELS.find((entry) => entry.id === model)?.note

  return (
    <div className={styles.body}>
      <label className={styles.pickerField}>
        <span className={styles.pickerLabel}>Model</span>
        <select
          className={`nodrag ${styles.picker}`}
          value={model}
          onChange={(event) => updateNodeProperty(nodeId, 'model', event.target.value)}
        >
          {AMPLIFIER_MODELS.map((entry) => (
            <option key={entry.id} value={entry.id}>{entry.id}</option>
          ))}
        </select>
      </label>

      {note && <p className={styles.warning}>{note}</p>}

      <div className={styles.detail}>
        {PIN_FIELDS.map((field) => (
          <label key={field.key} className={styles.row}>
            <span className={styles.key}>{field.label}</span>
            <input
              className={`nodrag nowheel ${styles.picker}`}
              type="number"
              min={0}
              value={Number(props[field.key] ?? 0)}
              onChange={(event) => updateNodeProperty(nodeId, field.key, Number(event.target.value))}
            />
          </label>
        ))}
      </div>
    </div>
  )
}
