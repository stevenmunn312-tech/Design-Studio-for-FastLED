// The wires the Hardware workspace draws between the board and each part.
import { usePreviewStore } from '../../state/previewStore'
import { CATEGORY_COLOR } from '../../state/nodeLibrary'
import HardwareLink from './HardwareLink'
import type { PlacedLink } from './hardwareLayout'

/** One run from an input part into the board, lit by that part's own output. */
export function InputLink({ signalKey, dataType, effects, label, link, visualScale }: {
  signalKey: string
  dataType?: string
  effects: boolean
  label: string
  link: PlacedLink
  visualScale: number
}) {
  const signal = usePreviewStore((state) => state.signals.get(signalKey))
  return (
    <HardwareLink
      dataType={dataType ?? 'audio'}
      color={CATEGORY_COLOR.input}
      emissive={signal?.emissive}
      energy={signal?.energy}
      effects={effects}
      label={label}
      visualScale={visualScale}
      {...link}
    />
  )
}

/**
 * One run from the board to an output, lit by that output's own feed.
 *
 * A component per link rather than a lookup in the pane: the number of outputs
 * is dynamic, and each needs its own previewStore subscription so a frame on
 * one run does not re-render every other part in the view.
 */
export function OutputLink({ signalKey, effects, label, link, visualScale }: {
  signalKey: string | null
  effects: boolean
  label: string
  link: PlacedLink
  visualScale: number
}) {
  const signal = usePreviewStore((state) => (signalKey ? state.signals.get(signalKey) : undefined))
  return (
    <HardwareLink
      dataType="frame"
      color={CATEGORY_COLOR.output}
      emissive={signal?.emissive}
      energy={signal?.energy}
      effects={effects}
      label={label}
      visualScale={visualScale}
      {...link}
    />
  )
}
