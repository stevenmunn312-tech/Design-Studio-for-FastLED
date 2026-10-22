import { describe, it, expect } from 'vitest'
import { generatePlayerSketch } from '../playerSketchGenerator'

// The SD player's ADET reader: emitted only when a collected pattern reads a
// detector global, loading only the blocks those patterns read, and leaving
// every other player sketch exactly as it was.
describe('playerSketchGenerator baked detectors', () => {
  const rendererReading = (expr: string) => ({
    buffers: [], helpers: [],
    functions: [`void render_p0(uint32_t ms) { (void)ms; leds[0] = CRGB(${expr} * 255.0f, 0, 0); }`],
    count: 1, params: [],
  })

  it('reads the ADET trailer and fills the Vibe globals when a pattern reads them, without a decoder tap', () => {
    const sketch = generatePlayerSketch({}, rendererReading('_audioVibeBass'), { audioEnvelope: true, decoderTap: false })
    expect(sketch).toContain("dtag[0]=='A' && dtag[1]=='D' && dtag[2]=='E' && dtag[3]=='T'")
    expect(sketch).toContain('uint8_t*  audioDetVibe = nullptr;')
    expect(sketch).toContain('audioDetVibe = (uint8_t*)malloc(frames * 7);')
    expect(sketch).toContain('_audioVibeBass = r[0] / 32.0f;')
    expect(sketch).toContain('uint32_t detPos = (uint32_t)f.position() + frames * bins;')
    // The other blocks are skipped, not loaded.
    expect(sketch).not.toContain('audioDetStructure')
    expect(sketch).not.toContain('audioDetPitch')
    expect(sketch).toContain('if (dflags & 2) f.seek(f.position() + frames * 7);  // structure: no pattern reads it')
    expect(sketch).toContain('if (dflags & 4) f.seek(f.position() + frames * 8);  // pitch: no pattern reads it')
    // No processor hosts the globals here, so the player declares them itself, once.
    expect(sketch.match(/float _audioVibeBass = 0\.0f/g)).toHaveLength(1)
  })

  it('fires the baked structure and pitch events once per frame and declares the globals once beside a decoder tap', () => {
    // Every asserted global is read here: the dead-code pass drops a store to
    // a global nothing reads, which is the point of loading only what is used.
    const sketch = generatePlayerSketch({}, rendererReading(
      '(_audioDownbeat || _audioDrop || _audioPitchNoteOn ? 1.0f : _audioPitchVelocity + (float)_audioKeyRoot)',
    ), { audioEnvelope: true, decoderTap: true })
    expect(sketch).toContain('uint8_t*  audioDetStructure = nullptr;')
    expect(sketch).toContain('uint8_t*  audioDetPitch = nullptr;')
    expect(sketch).toContain('bool fresh = d != audioDetLast;')
    expect(sketch).toContain('_audioDownbeat = fresh && (r[0] & 1) != 0; _audioDrop = fresh && (r[0] & 2) != 0;')
    expect(sketch).toContain('_audioPitchNoteOn = fresh && (r[6] & 1) != 0;')
    expect(sketch).toContain('_audioKeyRoot = r[5] == 255 ? 0 : r[5];')
    expect(sketch).toContain('if (dflags & 1) f.seek(f.position() + frames * 7);  // vibe: no pattern reads it')
    expect(sketch).toContain('if (!_decoderTapLive) updateShowAudio(posMs);')
    expect(sketch.match(/bool {2}_audioDownbeat = false/g)).toHaveLength(1)
    expect(sketch.match(/int {3}_audioKeyRoot = 0;/g)).toHaveLength(1)
  })

  it('leaves a player whose patterns read no detector exactly as it was', () => {
    const sketch = generatePlayerSketch({}, rendererReading('_audioBass'), { audioEnvelope: true, decoderTap: false })
    expect(sketch).not.toContain('ADET')
    expect(sketch).not.toContain('audioDet')
    expect(sketch).not.toContain('detPos')
    expect(sketch).toContain('f.read();  // equalizer bins per frame; no pattern reads the spectrum')
    expect(sketch).not.toContain('_audioVibe')
  })

  it('a Music Player opens no show file, so a detector read bakes nothing', () => {
    const sketch = generatePlayerSketch({}, rendererReading('_audioVibeBass'), { genericPlayer: true, audioEnvelope: true, decoderTap: true })
    expect(sketch).not.toContain('ADET')
    expect(sketch).not.toContain('audioDet')
  })
})
