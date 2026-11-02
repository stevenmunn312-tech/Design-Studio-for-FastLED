import { PARTICLE_STYLES, SHOW_PALETTES, SHOW_PATTERNS, SHOW_TRANSITIONS } from '../../codegen/performanceGenerator'
import { paletteCssGradient } from '../../state/palettes/paletteCatalog'
import { SHOW_VALUE_RANGES } from '../../state/player/showEventMeta'
import type { ShowEvent } from '../../types/showFile'
import { stopWheelWhileFocused } from './wheelBehavior'
import styles from './ShowEventFields.module.css'

/**
 * The params of one show event, edited in place. Every change keeps the
 * params it does not touch, so a ramp survives a new value.
 */
export default function ShowEventFields({ event, patternLabels, paramNames, onChange }: {
  event: ShowEvent
  /** Collection pattern names, by index. Absent for a show of built-in patterns. */
  patternLabels?: readonly string[]
  paramNames?: readonly string[]
  onChange: (params: ShowEvent['params']) => void
}) {
  const set = (patch: ShowEvent['params']) => onChange({ ...event.params, ...patch })
  const value = Number(event.params.value)
  switch (event.cmd) {
    case 'SET_PATTERN':
      if (event.params.index !== undefined && Number(event.params.index) < 0) {
        return <p className={styles.field}><span>Pattern</span><span>Picked by its tags</span></p>
      }
      return patternLabels ? (
        <IndexSelect label="Pattern" options={patternLabels} value={Number(event.params.index ?? 0)}
          onChange={(index) => onChange({ index })} />
      ) : (
        <ParamSelect label="Pattern" options={SHOW_PATTERNS} value={String(event.params.name)}
          onChange={(name) => onChange({ name })} />
      )
    case 'SET_PALETTE': {
      const gradient = paletteCssGradient(String(event.params.name))
      return (
        <>
          <ParamSelect label="Palette" options={[...SHOW_PALETTES]} value={String(event.params.name)}
            onChange={(name) => set({ name })} />
          {gradient && <div className={styles.field}><span /><span className={styles.swatch} style={{ background: gradient }} /></div>}
        </>
      )
    }
    case 'SET_SPEED':
      return <ParamSlider label="Speed" {...SHOW_VALUE_RANGES.SET_SPEED} value={value} fmtVal={(v) => `×${v.toFixed(2)}`} onChange={(v) => set({ value: v })} />
    case 'SET_BRIGHTNESS':
      return <ParamSlider label="Brightness" {...SHOW_VALUE_RANGES.SET_BRIGHTNESS} value={value} fmtVal={(v) => String(Math.round(v))} onChange={(v) => set({ value: Math.round(v) })} />
    case 'SET_ENERGY':
      return <ParamSlider label="Energy" {...SHOW_VALUE_RANGES.SET_ENERGY} value={value} fmtVal={(v) => v.toFixed(2)} onChange={(v) => set({ value: v })} />
    case 'SET_PARAM': {
      const range = SHOW_VALUE_RANGES.SET_PARAM
      const name = paramNames?.[Number(event.params.index ?? 0)] ?? 'Value'
      return (
        <ParamSlider label={name} min={Math.min(range.min, value)} max={Math.max(range.max, value)} step={range.step}
          value={value} fmtVal={(v) => v.toFixed(2)} onChange={(v) => set({ value: v })} />
      )
    }
    case 'BEAT_FLASH':
      return (
        <>
          <ParamSlider label="Intensity" min={0} max={255} step={1} value={Number(event.params.intensity)} fmtVal={(v) => String(Math.round(v))}
            onChange={(v) => set({ intensity: Math.round(v) })} />
          <ParamSlider label="Decay" min={0} max={255} step={1} value={Number(event.params.decay)} fmtVal={(v) => String(Math.round(v))}
            onChange={(v) => set({ decay: Math.round(v) })} />
        </>
      )
    case 'PARTICLE_BURST':
      return (
        <>
          <ParamSelect label="Style" options={PARTICLE_STYLES as unknown as string[]} value={PARTICLE_STYLES[Number(event.params.style ?? 0)] ?? 'rise'}
            onChange={(v) => set({ style: Math.max(0, PARTICLE_STYLES.indexOf(v as typeof PARTICLE_STYLES[number])) })} />
          <ParamSlider label="Intensity" min={0} max={255} step={1} value={Number(event.params.intensity)} fmtVal={(v) => String(Math.round(v))}
            onChange={(v) => set({ intensity: Math.round(v) })} />
          <ParamSlider label="Hue" min={0} max={255} step={1} value={Number(event.params.hue)} fmtVal={(v) => String(Math.round(v))}
            onChange={(v) => set({ hue: Math.round(v) })} />
        </>
      )
    case 'TRANSITION':
      return (
        <>
          <ParamSelect label="Style" options={SHOW_TRANSITIONS} value={String(event.params.type ?? 'crossfade')}
            onChange={(type) => set({ type })} />
          <ParamSlider label="Duration" min={0.1} max={3} step={0.1} value={Number(event.params.duration)} fmtVal={(v) => `${v.toFixed(1)}s`}
            onChange={(duration) => set({ duration })} />
        </>
      )
  }
}

function ParamSelect({ label, options, value, onChange }: {
  label: string; options: readonly string[]; value: string; onChange: (v: string) => void
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <select className="nodrag" value={value} onWheelCapture={stopWheelWhileFocused} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  )
}

// Like ParamSelect but the option value is an index (for collection SET_PATTERN,
// which stores a numeric index into the show's patternSet, not a name).
function IndexSelect({ label, options, value, onChange }: {
  label: string; options: readonly string[]; value: number; onChange: (i: number) => void
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <select className="nodrag" value={value} onWheelCapture={stopWheelWhileFocused} onChange={(e) => onChange(Number(e.target.value))}>
        {options.map((o, i) => <option key={i} value={i}>{o}</option>)}
      </select>
    </label>
  )
}

function ParamSlider({ label, min, max, step, value, fmtVal, onChange }: {
  label: string; min: number; max: number; step: number; value: number
  fmtVal: (v: number) => string; onChange: (v: number) => void
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <input className="nodrag" type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} />
      <span className={styles.val}>{fmtVal(value)}</span>
    </label>
  )
}
