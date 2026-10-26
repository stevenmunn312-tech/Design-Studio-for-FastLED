import { partById, type PartEncoderSpec } from '../../build/parts/partCatalogue'
import { ENCODER_COUNTS_PER_STEP } from '../patterns/patternSelection'

/**
 * Which rotary encoder an Encoder node is.
 *
 * The module the app has always drawn carries its own pull-ups and a VCC pad,
 * and clicks every four A/B transitions. A bare encoder carries nothing: its
 * contacts float unless the controller pulls them up, and its click size is
 * whatever its pulses and detents make it. Both facts come from the part's
 * `encoder` block, so the firmware, the pin checks and the diagram read one
 * answer.
 */
export const SR1230_ENCODER_PART_ID = 'jaycar-sr1230-rotary-encoder'

/** The catalogued contract, or null for the uncatalogued module. */
export function encoderSpec(props: Record<string, unknown>): PartEncoderSpec | null {
  return partById(String(props.partId ?? ''))?.encoder ?? null
}

/** Whether the part leaves its contacts for the controller to pull up. */
export function encoderIsBare(props: Record<string, unknown>): boolean {
  return encoderSpec(props)?.onboardPullUps === false
}

/**
 * Whether A, B and SW are read through INPUT_PULLUP.
 *
 * A bare encoder's contacts only ever pull to ground, so without the pull-up
 * every line floats. That is never a wiring choice, which is why the saved
 * toggle cannot turn it off.
 */
export function encoderUsesPullup(props: Record<string, unknown>): boolean {
  return encoderIsBare(props) || props.pullup !== false
}

/**
 * How much each A/B transition adds to the node's position.
 *
 * The position counts in the module's units — four per click — whatever part
 * is fitted, so a pattern browser, a volume step or a graph scaled off the
 * position turns the same amount per click on either part. An SR1230 makes two
 * transitions per click (15 pulses, 30 detents), so each one counts two.
 */
export function encoderCountScale(props: Record<string, unknown>): number {
  const spec = encoderSpec(props)
  if (!spec) return 1
  const transitionsPerDetent = (4 * spec.pulsesPerRevolution) / spec.detents
  return transitionsPerDetent > 0 ? ENCODER_COUNTS_PER_STEP / transitionsPerDetent : 1
}
