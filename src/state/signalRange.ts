// A 0–1 signal wired into an input that does not read 0–1.
//
// `num()` in graphEvaluator.ts passes a wired value straight through. Only the
// `speed`/`scale` class is stretched onto the node's own rate for you, by
// speedRange.ts. So an audio band wired into Fire2012's Sparking sets it to
// about 1 out of 255 and the fire never lights, into ReactionDiffusion's Feed
// it lands ten times past a usable 0.03–0.065, and into Starfield's Count it
// asks for one star. Nothing errors, nothing looks disconnected, and the graph
// on screen is the graph the author drew — which is what makes it expensive to
// find. Naming the wire is the cheap half of the repair; the other half is a
// Map Range into the target's own domain.
//
// The two halves of the judgement are asymmetric on purpose.
//
// The **target's** domain needs no list: `inputClampRange` already reads the
// slider the property draws, and every input the evaluator denormalises for you
// is a 0–1 slider *because* that is what denormalising means. So "the slider is
// not 0–1" is exactly "the evaluator hands the wired number through untouched",
// derived rather than restated, and a node retuned later cannot drift out of
// step with a second table here. `signalRangeTest` in the tests holds that
// equivalence.
//
// The **source's** range is a semantic fact only the node knows, and there is
// nowhere to derive it from, so it is listed — deliberately short, and only
// where the contract is unambiguous. A port that is *sometimes* 0–1 stays off
// the list: a false warning on a correct wire costs more than a missed one on a
// wrong wire, because the first teaches people to ignore the drawer.

import { inputClampRange } from './nodeLibrary'

/**
 * Outputs that are 0–1 by contract, not by happening to land there.
 *
 * The three analysers clamp their levels (`clamp01`/`Math.min(1, …)` in the
 * evaluator, mirrored in firmware); the two sensors are documented as 0–1 and
 * read from the same normalised run-state map. Everything else with a float
 * output is either already scaled by the author (Map Range, Math, Lerp), in
 * units of its own (BPM, hours, a pixel index, an encoder count), or carries a
 * range that its own properties set (BeatSin's low↔high), so none of them can
 * state a range here.
 */
export const NORMALIZED_OUTPUTS: Readonly<Record<string, readonly string[]>> = {
  FFTAnalyzer: ['bass', 'mids', 'treble'],
  PercussionDetect: ['kick', 'snare', 'hihat'],
  AudioFeatures: ['vocals', 'energy'],
  PotInput: ['value'],
  LightInput: ['level'],
}

/** Whether this output is 0–1 by contract. */
export function isNormalizedOutput(nodeType: string, portId: string | null | undefined): boolean {
  return !!portId && (NORMALIZED_OUTPUTS[nodeType]?.includes(portId) ?? false)
}

export interface SignalRangeMismatch {
  /** The domain the target actually reads, from its own slider. */
  min: number
  max: number
}

/**
 * The domain a 0–1 source would have to be mapped into to drive this input.
 *
 * `null` when there is nothing to say: the input has no bounded domain, or its
 * domain is already 0–1 — which is also every input the evaluator denormalises,
 * so a wired Speed is correctly left alone.
 */
export function signalRangeMismatch(
  targetNodeType: string,
  targetPortId: string | null | undefined,
): SignalRangeMismatch | null {
  if (!targetPortId) return null
  const range = inputClampRange(targetNodeType, targetPortId)
  if (!range) return null
  if (range.min === 0 && range.max === 1) return null
  return range
}

/** How a range reads in a sentence, en dash and all. */
export function formatSignalRange(range: SignalRangeMismatch): string {
  return `${range.min}–${range.max}`
}
