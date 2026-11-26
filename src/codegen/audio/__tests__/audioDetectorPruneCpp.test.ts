import { describe, expect, it } from 'vitest'
import { withoutUnreadAudioDetectors } from '../audioDetectorPruneCpp'

// What the engine looks like once the unread globals are pruned: a value
// nothing reads is left as a bare call, which is what keeps its detector alive.
const setup = [
  'static volatile uint32_t _audioBeatCount = 0;',
  'void setupAudio() {',
  '  _audioProcessor->onBeat([] { _audioBeatCount = _audioBeatCount + 1; });',
  '  (void)_audioProcessor->getBassLevel();',
  '  (void)_audioProcessor->getMidLevel();',
  '  (void)_audioProcessor->getTrebleLevel();',
  '  (void)_audioProcessor->getBPM();',
  '  (void)_audioProcessor->getEqBin(0);',
  '}',
]
const sketch = (loop: string[]) => [...setup, 'void updateAudio() {', ...loop, '}'].join('\n')

describe('unread audio detectors', () => {
  it('keeps only the equaliser for a graph that reads the spectrum', () => {
    const pruned = withoutUnreadAudioDetectors(sketch([
      '  (void)(_audioProcessor->getBassLevel());',
      '  (void)(_audioProcessor->getMidLevel());',
      '  (void)(_audioProcessor->getTrebleLevel());',
      '  (void)(_audioProcessor->getBPM());',
      '  (void)(_audioProcessor->getBeatConfidence());',
      '  for (int i = 0; i < 32; ++i) _audioSpectrum[i] = _audioProcessor->getEqBin(i >> 1);',
    ]))
    expect(pruned).toContain('(void)_audioProcessor->getEqBin(0);')
    expect(pruned).toContain('_audioSpectrum[i] = _audioProcessor->getEqBin(i >> 1);')
    for (const gone of ['getBassLevel', 'getMidLevel', 'getTrebleLevel', 'getBPM', 'getBeatConfidence', 'onBeat', '_audioBeatCount']) {
      expect(pruned).not.toContain(gone)
    }
  })

  // The three bands are one detector: reading any keeps its registration.
  it('keeps a detector while one of its values is read', () => {
    const pruned = withoutUnreadAudioDetectors(sketch([
      '  _audioBass = _audioProcessor->getBassLevel();',
      '  (void)(_audioProcessor->getMidLevel());',
      '  (void)(_audioProcessor->getBPM());',
    ]))
    expect(pruned).toContain('(void)_audioProcessor->getBassLevel();')
    expect(pruned).toContain('_audioBass = _audioProcessor->getBassLevel();')
    expect(pruned).toContain('(void)(_audioProcessor->getMidLevel());')
    expect(pruned).not.toContain('getBPM')
    expect(pruned).not.toContain('onBeat')
    expect(pruned).not.toContain('getEqBin')
  })

  // `onBeat` builds the beat detector, so a read beat keeps it without the polls.
  it('keeps the beat callback while the beat is read', () => {
    const pruned = withoutUnreadAudioDetectors(sketch([
      '  (void)(_audioProcessor->getBPM());',
      '  uint32_t beatCount = _audioBeatCount;',
    ]))
    expect(pruned).toContain('_audioProcessor->onBeat(')
    expect(pruned).toContain('static volatile uint32_t _audioBeatCount = 0;')
    expect(pruned).not.toContain('getBPM')
  })

  it('leaves a sketch with every value read, or with no audio, alone', () => {
    const all = sketch([
      '  _audioBass = _audioProcessor->getBassLevel();',
      '  _audioBpm = _audioProcessor->getBPM();',
      '  uint32_t beatCount = _audioBeatCount;',
      '  x = _audioProcessor->getEqBin(1);',
    ])
    expect(withoutUnreadAudioDetectors(all)).toBe(all)
    expect(withoutUnreadAudioDetectors('void loop() {}')).toBe('void loop() {}')
  })

  it('changes nothing when applied again', () => {
    const once = withoutUnreadAudioDetectors(sketch(['  (void)(_audioProcessor->getBPM());']))
    expect(withoutUnreadAudioDetectors(once)).toBe(once)
  })
})
