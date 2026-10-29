import type { AudioSignal } from '../evaluator/types'
import { useAudioStore } from './audioStore'
import { useDecoderAudioStore } from './decoderAudioStore'

/** The signal an Audio capability of `kind` feeds the graph right now:
 *  microphone and line-in read browser capture, the decoder reads the in-app
 *  music player. One source for the Audio node and for a group opened on the
 *  canvas, so both bind the same thing. */
export function liveAudioSignal(kind: 'microphone' | 'line-in' | 'decoder'): AudioSignal {
  return kind === 'decoder' ? useDecoderAudioStore.getState() : useAudioStore.getState()
}

/** Release the beats an evaluation pass has just read. Each store holds a
 *  beat raised until this runs (see beatLatch.ts), so the preview loop calls
 *  it once after every pass it evaluates. */
export function consumeLiveBeats(): void {
  useAudioStore.getState().consumeBeat()
  useDecoderAudioStore.getState().consumeBeat()
}
