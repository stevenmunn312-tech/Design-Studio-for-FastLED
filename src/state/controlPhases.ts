/*
 * The order a control pass runs in, stated once.
 *
 * A control graph is a loop with a feedback path: a finger moves a slider, the
 * slider drives a value, the value comes back to the widget that set it. Every
 * surface that runs one — the browser evaluator and all three sketch
 * generators — already agrees on the order below, but each expressed it in its
 * own idiom, so "when is this read" was a question answered by reading four
 * files. This module is the answer in one place, and `controlPhaseViolation`
 * is what holds the generators to it over their emitted text rather than over
 * their source.
 *
 * The order matters because sample-touch and snapshot-controls read state the
 * output half writes later in the same pass. Those reads are *deliberately*
 * one pass behind (see `priorSample`); the alternative is evaluating the same
 * expression at three sites that can disagree, which is worse than a single
 * frame of lag on the one frame a gate changes. sample-ir reads the receiver,
 * which nothing later in the pass writes.
 *
 * This is not a scheduler. Nothing here runs the phases — it names them, says
 * what each may assume, and gives the emitted anchors a test can find.
 */

export type ControlPhaseId =
  | 'sample-touch'
  | 'snapshot-controls'
  | 'sample-ir'
  | 'resolve-graph'
  | 'apply-destinations'
  | 'publish-feedback'
  | 'refresh-screens'

/**
 * Which side of the pass a phase belongs to.
 *
 * The split is not cosmetic, and it is why the check below is not simply "all
 * of phase N before all of phase N+1". The input half reads the world and must
 * *close* before anything acts on it — one snapshot, observed identically by
 * every binding, including feedback that crosses two screens. The output half
 * may run more than once in one pass: the SD player publishes and repaints on
 * its track-advance exit as well as at the foot of the loop, and both are the
 * same pass ending. So the input half is checked occurrence by occurrence, and
 * the output half on where each phase begins.
 */
export type ControlPhaseHalf = 'input' | 'output'

export interface ControlPhase {
  id: ControlPhaseId
  title: string
  half: ControlPhaseHalf
  /** What happens here, and what it may assume has already happened. */
  summary: string
  /**
   * Patterns matching a line an emitted sketch places in this phase.
   *
   * A phase with no anchors is unobservable in emitted text and is skipped.
   * `resolve-graph` is the only one, because what it emits is whatever the
   * user's graph happens to be.
   */
  anchors: readonly RegExp[]
  /** Set when this phase reads state a later phase writes, and therefore sees
   *  the previous pass's value. Names that state. */
  priorSample?: string
}

export const CONTROL_PHASES: readonly ControlPhase[] = [
  {
    id: 'sample-touch',
    title: 'Sample touch',
    half: 'input',
    summary: 'Read every digitiser once. A panel that is off reads nothing at all, so its '
      + 'controls cannot move while it is dark.',
    anchors: [/\blv_indev_read\(/],
    priorSample: 'the panel Enabled latch (_cdPanelOn_<id>), written in apply-destinations',
  },
  {
    id: 'snapshot-controls',
    title: 'Snapshot controls',
    half: 'input',
    summary: 'Freeze every widget output into one local per control, after all touch reads and '
      + 'before any of it is used. One snapshot is what lets a control feed back into its own '
      + 'screen, or across two screens, without either side reading a value the other half-wrote.',
    anchors: [/_cd(?:Bool|Float)Output\(/],
    priorSample: 'the panel Enabled latch, which rests the outputs of a dark panel',
  },
  {
    id: 'sample-ir',
    title: 'Sample IR',
    half: 'input',
    summary: 'Decode at most one infrared frame into the learned key outputs, after every touch '
      + 'read and the control snapshot. A key and a widget from this pass then agree, and nothing '
      + 'applies a destination until the frame has been taken.',
    anchors: [/IrReceiver\.decode\(/],
  },
  {
    id: 'resolve-graph',
    title: 'Resolve graph values',
    half: 'output',
    summary: 'Evaluate the graph against that snapshot: control bundles, property inputs and '
      + 'everything downstream of them. Nothing here writes to hardware.',
    anchors: [],
  },
  {
    id: 'apply-destinations',
    title: 'Apply destination state',
    half: 'output',
    summary: 'Hand resolved values to whatever owns them: the blackout/level latch on an LED '
      + 'output, the transport, the pattern cursor, the Enabled latch on each panel. This is the '
      + 'first point in the pass where a wired Enabled has a value, which is why the input half '
      + 'reads the latch rather than the expression.',
    anchors: [/_cdPanelOn_\w+ = _cdOn_\w+;/, /\{ \/\/ LED output run-time controls/],
  },
  {
    id: 'publish-feedback',
    title: 'Publish feedback',
    half: 'output',
    summary: 'Write graph-driven readings back into widgets and status fields. A control a finger '
      + 'owns is skipped here, so a press is never overwritten by the value it is still changing.',
    anchors: [/_cdSet(?:Text|Checked|Integer|Value)\(/],
  },
  {
    id: 'refresh-screens',
    title: 'Refresh screens',
    half: 'output',
    summary: 'Repaint. Last, and after the LED frame has shipped, because a panel repaint costs '
      + 'several LED frames of SPI time and the pixels must not wait on it.',
    anchors: [/_cdServiceLvgl\(\);/],
  },
]

export interface ControlPhaseSpan {
  phase: ControlPhase
  /** Offsets of the first and last anchor match in the text examined. */
  first: number
  last: number
}

/** Every phase observable in one emitted loop body, in declared order. */
export function controlPhaseSpans(loopSource: string): ControlPhaseSpan[] {
  const spans: ControlPhaseSpan[] = []
  for (const phase of CONTROL_PHASES) {
    let first = Infinity
    let last = -Infinity
    for (const anchor of phase.anchors) {
      const flags = anchor.flags.includes('g') ? anchor.flags : `${anchor.flags}g`
      for (const match of loopSource.matchAll(new RegExp(anchor.source, flags))) {
        first = Math.min(first, match.index)
        last = Math.max(last, match.index)
      }
    }
    if (first === Infinity) continue
    spans.push({ phase, first, last })
  }
  return spans
}

export interface ControlPhaseViolation {
  earlier: ControlPhase
  later: ControlPhase
  reason: string
}

/**
 * Where an emitted loop body breaks the model, or null when it honours it.
 *
 * Reported rather than thrown so a caller can name both phases itself.
 */
export function controlPhaseViolation(loopSource: string): ControlPhaseViolation | null {
  const spans = controlPhaseSpans(loopSource)
  const input = spans.filter((span) => span.phase.half === 'input')
  const output = spans.filter((span) => span.phase.half === 'output')

  // Input: every occurrence of a phase closes before the next one opens.
  for (let index = 1; index < input.length; index += 1) {
    for (let before = 0; before < index; before += 1) {
      if (input[before].last <= input[index].first) continue
      return {
        earlier: input[before].phase,
        later: input[index].phase,
        reason: `${input[before].phase.title} is still emitting after ${input[index].phase.title} has begun; `
          + 'each input phase must close before the next one opens.',
      }
    }
  }

  // The input half as a whole closes before anything acts on it.
  const inputEnd = input.reduce((end, span) => Math.max(end, span.last), -Infinity)
  for (const span of output) {
    if (inputEnd <= span.first) continue
    const culprit = input.find((entry) => entry.last === inputEnd)!
    return {
      earlier: culprit.phase,
      later: span.phase,
      reason: `${culprit.phase.title} emits after ${span.phase.title} has begun; nothing may act on the pass `
        + 'until every control has been sampled into the one snapshot.',
    }
  }

  // Output: a pass can end on more than one path, so each phase is judged on
  // where it begins rather than on where its last repetition sits.
  for (let index = 1; index < output.length; index += 1) {
    for (let before = 0; before < index; before += 1) {
      if (output[before].first <= output[index].first) continue
      return {
        earlier: output[before].phase,
        later: output[index].phase,
        reason: `${output[index].phase.title} begins before ${output[before].phase.title}.`,
      }
    }
  }

  return null
}
