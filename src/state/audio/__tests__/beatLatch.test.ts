import { beforeEach, describe, expect, it } from 'vitest'
import { AudioEngine, NUM_SPECTRUM_BARS, type AudioData } from '../../../audio/audioEngine'
import { DecoderAudioEngine } from '../../../audio/decoderAudioEngine'
import { useAudioStore } from '../audioStore'
import { useDecoderAudioStore } from '../decoderAudioStore'
import { consumeLiveBeats, liveAudioSignal } from '../liveAudioSignal'

// Drive the engines' subscribers the way a capture frame does.
type Emitter = { emit: (data: AudioData) => void }
const micEngine = AudioEngine.instance as unknown as Emitter
const decoderEngine = DecoderAudioEngine.instance as unknown as Emitter

// One capture frame, spelled out so nothing but signal fields reaches a
// store (a spread of a store would carry its actions across).
function frame(overrides: Partial<AudioData>): AudioData {
  const silent = () => Array(NUM_SPECTRUM_BARS).fill(0)
  return {
    active: true, nativeFastLed: true, bass: 0, mids: 0, treble: 0, beat: false, beatConfidence: 0, bpm: 120,
    spectrum: silent(), detectorSpectrum: silent(), previewSpectrum: silent(),
    micActive: true, micBass: 0, micMids: 0, micTreble: 0, micSpectrum: silent(), micDetectorSpectrum: silent(),
    leftLevel: 0, rightLevel: 0, channelCount: 1,
    ...overrides,
  }
}

beforeEach(() => {
  useAudioStore.setState({ active: true, micActive: true, beat: false })
  useDecoderAudioStore.setState({ active: true, beat: false })
})

describe('live beat latch', () => {
  it('holds a microphone beat across capture frames the evaluator skipped', () => {
    micEngine.emit(frame({ beat: true }))
    micEngine.emit(frame({ beat: false }))
    expect(liveAudioSignal('microphone').beat).toBe(true)
  })

  it('releases the beat once a pass has consumed it', () => {
    micEngine.emit(frame({ beat: true }))
    consumeLiveBeats()
    expect(liveAudioSignal('microphone').beat).toBe(false)
    micEngine.emit(frame({ beat: false }))
    expect(liveAudioSignal('microphone').beat).toBe(false)
  })

  it('latches the decoder the same way', () => {
    decoderEngine.emit(frame({ beat: true }))
    decoderEngine.emit(frame({ beat: false }))
    expect(liveAudioSignal('decoder').beat).toBe(true)
    consumeLiveBeats()
    expect(liveAudioSignal('decoder').beat).toBe(false)
  })

  it('drops the latch when the source stops', () => {
    micEngine.emit(frame({ beat: true }))
    micEngine.emit(frame({ active: false, micActive: false, beat: false }))
    expect(liveAudioSignal('microphone').beat).toBe(false)
  })
})
