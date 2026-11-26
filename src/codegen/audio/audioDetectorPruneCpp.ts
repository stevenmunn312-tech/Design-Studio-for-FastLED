/**
 * Drop the FastLED audio detectors a finished sketch never reads.
 *
 * FastLED's `audio::Processor` builds a detector the first time one of its
 * getters is called, and from then on runs that detector on every block of
 * samples. The engine registers and polls all of them, because it is written
 * before the graph says which values it reads. Once the unread globals are
 * pruned, what is left of an unread value is the bare call, kept because a
 * library call cannot be proved pure:
 *
 *     (void)(_audioProcessor->getBassLevel());
 *
 * That call is the whole cost: it is what keeps the detector alive. A graph
 * that reads only the spectrum was running the band and beat analysers for
 * nothing. This pass runs on the pruned sketch and removes each group of
 * getters that survives only as bare calls.
 */

/** Getters that share one detector: a live use of any keeps the group. */
const DETECTOR_GROUPS: readonly (readonly string[])[] = [
  ['getBassLevel', 'getMidLevel', 'getTrebleLevel'],
  ['getBPM', 'getBeatConfidence'],
  ['getEqBin'],
]

const BEAT_GROUP = DETECTOR_GROUPS[1]
const BEAT_COUNT = '_audioBeatCount'
const ON_BEAT = /^\s*_audioProcessor->onBeat\(/
const BEAT_COUNT_DECLARATION = /^static volatile uint32_t _audioBeatCount = 0;\s*$/

const bareCall = (getter: string) => new RegExp(`^\\s*\\(void\\)\\(?_audioProcessor->${getter}\\([^()]*\\)\\)?;\\s*$`)
const anyCall = (getter: string) => new RegExp(`_audioProcessor->${getter}\\(`)

export function withoutUnreadAudioDetectors(source: string): string {
  if (!source.includes('_audioProcessor->')) return source
  let lines = source.split('\n')
  // The beat count is read by `updateAudio` when anything uses the beat.
  const beatRead = lines.some((line) => line.includes(BEAT_COUNT) && !ON_BEAT.test(line) && !BEAT_COUNT_DECLARATION.test(line))
  for (const group of DETECTOR_GROUPS) {
    const live = group.some((getter) => lines.some((line) => anyCall(getter).test(line) && !bareCall(getter).test(line)))
    if (live) continue
    // `onBeat` builds the beat detector by itself, so with the beat read the
    // bare polls can still go; the registration stays.
    lines = lines.filter((line) => !group.some((getter) => bareCall(getter).test(line)))
    if (group === BEAT_GROUP && !beatRead) {
      lines = lines.filter((line) => !ON_BEAT.test(line) && !BEAT_COUNT_DECLARATION.test(line))
    }
  }
  return lines.join('\n')
}
