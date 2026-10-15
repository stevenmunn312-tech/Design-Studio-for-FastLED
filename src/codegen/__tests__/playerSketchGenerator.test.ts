import { describe, it, expect } from 'vitest'
import { generatePlayerSketch, playerConfigFromGraph, playerControlsFromGraph, playerParticlesFromGraph } from '../playerSketchGenerator'
import { FRAME_SAMPLE_HELPER_CPP } from '../helpers/frameSampleHelperCpp'
import { patternRenderersUseAudio } from '../showGenerator'

// The show's LED target comes off a wire now — the generator's `frame` into an
// output's `frame` — so a fixture that wants its MatrixOutput read has to say
// so, exactly like a real graph does. Without the edge there is no target and
// the config falls back to defaults, which is the point of the change.
const SHOW_EDGE = [{ source: 'pg', target: 'mo', sourceHandle: 'frame', targetHandle: 'frame' }]
const generator = { id: 'pg', data: { nodeType: 'PerformanceGenerator', properties: {} } }

describe('playerSketchGenerator', () => {
  it.each([
    { audioEnvelope: false, decoderTap: false, fades: false },
    // A Music Player opens no show file, so a baked envelope has nothing to read.
    { audioEnvelope: true, decoderTap: false, fades: false },
    { audioEnvelope: false, decoderTap: true, fades: true },
  ])('only fades generic collections with audio analysis (%j)', ({ audioEnvelope, decoderTap, fades }) => {
    const renderers = { buffers: [], helpers: [], functions: ['void render_p0(uint32_t ms) { (void)ms; }'], count: 1, params: [] }
    const sketch = generatePlayerSketch({}, renderers, { genericPlayer: true, audioEnvelope, decoderTap })
    expect(sketch.includes('float audioEnergy = constrain((_audioBass')).toBe(fades)
    expect(sketch.includes('constrain(patternFade * 255.0f')).toBe(fades)
    expect(/float\s+_audioBass\b/.test(sketch)).toBe(fades)
  })

  // The transition dispatcher carries the frame sampler, so a Frame Warp or
  // Symmetry pattern must not emit a second copy, and the one copy has to sit
  // above the render functions that call it.
  it('emits the frame sampler once, above the patterns that sample frames', () => {
    const renderers = {
      buffers: [], helpers: [FRAME_SAMPLE_HELPER_CPP],
      functions: ['void render_p0(uint32_t ms) { (void)ms; leds[0] = _sampleFrame(leds, 0.0f, 0.0f, 0, false); }'],
      count: 1, params: [],
    }
    const sketch = generatePlayerSketch({}, renderers, { genericPlayer: true })
    expect(sketch.match(/static inline CRGB _sampleFrame\(/g)).toHaveLength(1)
    expect(sketch.indexOf('_sampleFrame(')).toBeLessThan(sketch.indexOf('void render_p0('))
    // No 3D transition is reachable, so the shaded sampler is not emitted.
    expect(sketch).not.toContain('_sampleShaded')
  })

  // The preview draws each change's style from the wired pool; the device used
  // to crossfade whatever was wired.
  it('draws each pattern change from the wired transition pool', () => {
    const renderers = {
      buffers: [], helpers: [],
      functions: ['void render_p0(uint32_t ms) { (void)ms; }', 'void render_p1(uint32_t ms) { (void)ms; }'],
      count: 2, params: [],
    }
    const pooled = generatePlayerSketch({}, renderers, { genericPlayer: true, transitionIds: [1, 3] })
    expect(pooled).toContain('const uint8_t TRANS_POOL[] = { 1, 3 };')
    expect(pooled).toContain('transType = TRANS_POOL[random8(TRANS_POOL_N)];')
    expect(pooled).toContain('case 3: {  // iris')
    expect(pooled).not.toContain('default: {  // crossfade (0)')
    const single = generatePlayerSketch({}, renderers, { genericPlayer: true, transitionIds: [4] })
    expect(single).not.toContain('TRANS_POOL')
    // One style is a constant passed straight to the dispatcher.
    expect(single).not.toContain('transType')
    expect(single).toContain('compositeTransition(4, leds, showA, showB, tp);')
  })

  // A Vibe node in a slideshow pattern read _audioVibe* globals the player
  // never declared: the decoder tap hosts the processor, so it must host the
  // optional detectors too.
  it('declares, registers and polls the optional detectors its patterns read', () => {
    const renderers = {
      buffers: [], helpers: [],
      functions: ['void render_p0(uint32_t ms) { float v = _audioVibeMidAtt + _audioMeasurePhase; (void)v; (void)ms; }'],
      count: 1, params: [],
    }
    expect(patternRenderersUseAudio(renderers)).toBe(true)
    const sketch = generatePlayerSketch({}, renderers, { genericPlayer: true, decoderTap: true })
    expect(/float [^;]*_audioVibeMidAtt = 0\.0f/.test(sketch)).toBe(true)
    // Bass is registered with the detector but never read, so it is not stored.
    expect(sketch).not.toContain('_audioVibeBass')
    expect(sketch.indexOf('_audioVibeMidAtt = 0.0f')).toBeLessThan(sketch.indexOf('void render_p0('))
    expect(sketch).toContain('  (void)_audioProcessor->getVibeBass();')
    expect(sketch).toContain('  _audioVibeMidAtt = _audioProcessor->getVibeMidAtt();')
    expect(sketch).toContain('_audioProcessor->onDownbeat(')
    expect(sketch).toContain('  _audioMeasurePhase = _audioProcessor->getMeasurePhase();')
    // Only what a pattern reads is compiled.
    expect(sketch).not.toContain('_audioWave')
    expect(sketch).not.toContain('_audioPitch')
  })

  it('fades only the patterns that listen, crossing the factor through a transition', () => {
    const renderers = {
      buffers: [], helpers: [],
      functions: ['void render_p0(uint32_t ms) { (void)ms; }', 'void render_p1(uint32_t ms) { (void)ms; }'],
      count: 2, params: [], audioReactive: [true, false],
    }
    const sketch = generatePlayerSketch({}, renderers, { genericPlayer: true, decoderTap: true })
    expect(sketch).toContain('static const bool PATTERN_AUDIO_REACTIVE[2] = { true, false };')
    expect(sketch).toContain('PATTERN_AUDIO_REACTIVE[pid] ? audioFade : 1.0f')
    expect(sketch).toContain('fadeFor(prevPatternId) + (fadeFor(patternId) - fadeFor(prevPatternId)) * tp')
    expect(sketch).toContain('leds[i].nscale8((uint8_t)constrain(patternFade * 255.0f, 0.0f, 255.0f));')
    // The fade and the sparks use the shared numbers, not literals of their own.
    expect(sketch).toContain('audioEnergy <= 0.025f')
    expect(sketch).toContain('/ 0.18f')
    expect(sketch).toContain('? 0.045f : 0.18f')
  })

  describe("the LED output's own fields", () => {
    const withOutput = (properties: Record<string, unknown>) => playerConfigFromGraph([
      generator,
      { id: 'mo', data: { nodeType: 'MatrixOutput', properties: { width: 8, height: 8, ...properties } } },
    ], SHOW_EDGE)
    const drawIndex = (sketch: string, needle: string) => sketch.indexOf(needle, sketch.indexOf('void loop()'))

    it('dims the output by its Brightness field after drawing and before show()', () => {
      const sketch = generatePlayerSketch(withOutput({ outputBrightness: 0.4 }))
      const scale = drawIndex(sketch, 'leds[_i].nscale8_video(')
      expect(scale).toBeGreaterThan(0)
      expect(sketch).toContain('constrain(0.400f, 0.0f, 1.0f)')
      expect(scale).toBeLessThan(drawIndex(sketch, 'FastLED.show();'))
    })

    it('keeps an output switched off dark', () => {
      const sketch = generatePlayerSketch(withOutput({ enabled: false }))
      // Off is a constant, so blacking out is unconditional.
      expect(sketch).toMatch(/\n\s*fill_solid\(leds, NUM_LEDS, CRGB::Black\);/)
      expect(sketch).not.toContain('if (!(false))')
    })

    it('adds nothing while the fields are at lit and full', () => {
      const sketch = generatePlayerSketch(withOutput({}))
      expect(sketch).not.toContain('LED output run-time controls')
      expect(sketch).not.toContain('fill_solid(leds, NUM_LEDS, CRGB::Black)')
    })
  })

  // The player composes into `leds`, WIDTH x HEIGHT; a shape-mapped chain or a
  // wired matrix drives a physical array of its own through the table a
  // normal sketch bakes, so the SD player no longer refuses those forms.
  describe('the LED output\'s geometry', () => {
    const withOutput = (properties: Record<string, unknown>) => playerConfigFromGraph([
      generator,
      { id: 'mo', data: { nodeType: 'MatrixOutput', properties } },
    ], SHOW_EDGE)

    it('takes a string its length, not the unused grid defaults', () => {
      const cfg = withOutput({ form: 'strip', ledCount: 60, width: 16, height: 16 })
      expect([cfg.ledWidth, cfg.ledHeight, cfg.ledShape, cfg.ledXyTable]).toEqual([60, 1, null, null])
      const sketch = generatePlayerSketch(cfg)
      expect(sketch).toContain('#define NUM_LEDS      60')
      expect(sketch).not.toContain('ledsOut')
    })

    it('drives a ring through its sample map into a physical array', () => {
      const cfg = withOutput({ form: 'ring', ledCount: 24, chipset: 'WS2812B', colorOrder: 'GRB' })
      expect([cfg.ledWidth, cfg.ledHeight, cfg.ledShape?.kind, cfg.ledShape?.ledCount]).toEqual([8, 8, 'ring', 24])
      const sketch = generatePlayerSketch(cfg)
      expect(sketch).toContain('#define NUM_LEDS      64')
      expect(sketch).toContain('#define RING_LEDS 24')
      expect(sketch).toContain('CRGB leds[NUM_LEDS];')
      expect(sketch).toContain('CRGB ledsOut[RING_LEDS];')
      expect(sketch).toContain('const uint16_t _ringmap[RING_LEDS] PROGMEM = {')
      expect(sketch).toContain('FastLED.addLeds<WS2812B, LED_DATA_PIN, GRB>(ledsOut, RING_LEDS);')
      const copy = sketch.indexOf('for (int _i = 0; _i < RING_LEDS; _i++) ledsOut[_i] = leds[pgm_read_word(&_ringmap[_i])];')
      expect(copy).toBeGreaterThan(sketch.indexOf('void loop()'))
      expect(copy).toBeLessThan(sketch.indexOf('FastLED.show();', copy))
    })

    it('drives a corkscrew and a positioned string the same way', () => {
      const helix = generatePlayerSketch(withOutput({ form: 'corkscrew', ledCount: 120, corkscrewTurns: 6 }))
      expect(helix).toContain('#define CORKSCREW_LEDS 120')
      expect(helix).toContain('ledsOut[_i] = leds[pgm_read_word(&_corkscrewmap[_i])];')
      expect(helix).toContain('(ledsOut, CORKSCREW_LEDS);')
      const positioned = generatePlayerSketch(withOutput({
        form: 'strip', stripLayout: 'positions', ledCount: 3, positionsWidth: 8, positionsHeight: 4,
        positionsPreset: 'custom', positions: '0.5,0.5 2.5,1.5 3.5,3.5',
      }))
      expect(positioned).toContain('#define WIDTH         8')
      expect(positioned).toContain('#define HEIGHT        4')
      expect(positioned).toContain('const uint16_t _posmap[POS_LEDS * 2] PROGMEM = { 128,128,640,384,896,896 };')
      expect(positioned).toContain('pgm_read_word(&_posmap[_i * 2])')
      expect(positioned).toContain('(ledsOut, POS_LEDS);')
    })

    it('remaps a serpentine matrix through XY() into the physical array', () => {
      const cfg = withOutput({ form: 'matrix', width: 4, height: 2, serpentine: true })
      expect(cfg.ledXyTable).toEqual([0, 1, 2, 3, 7, 6, 5, 4])
      const sketch = generatePlayerSketch(cfg)
      expect(sketch).toContain('CRGB ledsOut[NUM_LEDS];')
      expect(sketch).toContain('const uint16_t _xytable[NUM_LEDS] PROGMEM = { 0,1,2,3,7,6,5,4 };')
      expect(sketch).toContain('ledsOut[XY(_x, _y)] = leds[_y * WIDTH + _x];')
      expect(sketch).toContain('(ledsOut, NUM_LEDS);')
      expect(generatePlayerSketch(withOutput({ form: 'matrix', width: 4, height: 2 }))).not.toContain('ledsOut')
    })
  })

  describe('Player Controls', () => {
    it('traces a chained controls bundle and lets the downstream mapper override an action', () => {
      const nodes = [
        { id: 'master', data: { nodeType: 'PatternMaster', properties: {} } },
        { id: 'base', data: { nodeType: 'ControlMap', properties: {} } },
        { id: 'controls', data: { nodeType: 'ControlMap', properties: {
          debounceMs: 45, volumeStep: 0.08, brightnessStep: 0.09,
          repeatDelayMs: 525, repeatIntervalMs: 150,
        } } },
        { id: 'old-next', data: { nodeType: 'ButtonInput', properties: { pin: 3 } } },
        { id: 'next', data: { nodeType: 'ButtonInput', properties: { pin: 7, pullup: false } } },
        { id: 'volume', data: { nodeType: 'PotInput', properties: { pin: 4 } } },
        { id: 'encoder', data: { nodeType: 'EncoderInput', properties: { pinA: 8, pinB: 9, pinSW: 10 } } },
      ]
      const edges = [
        { source: 'base', sourceHandle: 'controls', target: 'controls', targetHandle: 'controlsIn' },
        { source: 'controls', sourceHandle: 'controls', target: 'master', targetHandle: 'controls' },
        { source: 'old-next', sourceHandle: 'pressed', target: 'base', targetHandle: 'next' },
        { source: 'next', sourceHandle: 'pressed', target: 'controls', targetHandle: 'next' },
        { source: 'volume', sourceHandle: 'value', target: 'base', targetHandle: 'volume' },
        { source: 'encoder', sourceHandle: 'position', target: 'controls', targetHandle: 'brightness' },
      ]

      expect(playerControlsFromGraph(nodes, edges)).toEqual({
        bindings: {
          next: { kind: 'button', pin: 7, pullup: false },
          volume: { kind: 'pot', pin: 4 },
          brightness: { kind: 'encoderPosition', pinA: 8, pinB: 9, pullup: true, key: 'encoder' },
        },
        debounceMs: 45,
        volumeStep: 0.08,
        brightnessStep: 0.09,
        repeatDelayMs: 525,
        repeatIntervalMs: 150,
      })
    })

    it('resolves a named Button Bank row as a physical player button', () => {
      const nodes = [
        { id: 'master', data: { nodeType: 'PatternMaster', properties: {} } },
        { id: 'controls', data: { nodeType: 'ControlMap', properties: {} } },
        { id: 'bank', data: { nodeType: 'ButtonBank', properties: {
          buttons: [{ id: 'playPause', label: 'Play / Pause', pin: 12, pullup: false }],
        } } },
      ]
      const edges = [
        { source: 'controls', sourceHandle: 'controls', target: 'master', targetHandle: 'controls' },
        { source: 'bank', sourceHandle: 'button-playPause', target: 'controls', targetHandle: 'playPause' },
      ]

      expect(playerControlsFromGraph(nodes, edges).bindings.playPause)
        .toEqual({ kind: 'button', pin: 12, pullup: false })
    })

    it('emits debounced transport, repeat adjustments, normalized pots, and brightness ceilings', () => {
      const sketch = generatePlayerSketch({ maxVolume: 17, ledBrightness: 143 }, undefined, {
        controls: {
          bindings: {
            playPause: { kind: 'button', pin: 2, pullup: true },
            next: { kind: 'encoderButton', pin: 10, pullup: true },
            volume: { kind: 'pot', pin: 4 },
            volumeDown: { kind: 'button', pin: 5, pullup: true },
            ledToggle: { kind: 'button', pin: 6, pullup: false },
            brightnessUp: { kind: 'button', pin: 7, pullup: true },
          },
          debounceMs: 35,
          volumeStep: 0.07,
          brightnessStep: 0.09,
          repeatDelayMs: 500,
          repeatIntervalMs: 140,
        },
      })

      expect(sketch).toContain('now - changedAt >= 35')
      expect(sketch).toContain('repeatAt = now + 500')
      expect(sketch).toContain('repeatAt = now + 140')
      expect(sketch).toContain('audio.pauseResume()')
      expect(sketch).toContain('changePlayerTrack(1);')
      expect(sketch).toContain('analogRead(4) / 4095.0f')
      expect(sketch).toContain('playerVolume * 17')
      expect(sketch).toContain('playerBrightness * showBrightness')
      expect(sketch).toContain('* 143')
      expect(sketch).toContain('ledsEnabled = !ledsEnabled; applyPlayerBrightness();')
      expect(sketch).toContain('audio.stopSong();')
      expect(sketch).toContain('servicePlayerControls();')
      expect(sketch).toContain('pinMode(6, INPUT);')
      expect(sketch).toContain('digitalRead(6) == HIGH')
      expect(sketch).toContain('playerVolume - 0.070f')
      expect(sketch).toContain('playerBrightness + 0.090f')
    })

    it('uses the HUB75 brightness API for runtime controls', () => {
      const sketch = generatePlayerSketch({ chipset: 'HUB75' }, undefined, {
        controls: {
          bindings: { brightness: { kind: 'pot', pin: 4 } },
          debounceMs: 30, volumeStep: 0.05, brightnessStep: 0.05,
          repeatDelayMs: 400, repeatIntervalMs: 120,
        },
      })
      expect(sketch).toContain('dma_display->setBrightness8(value);')
      expect(sketch).toContain('showBrightness = constrain(ev.params[0] / 255.0f')
    })

    it('emits the player selection state for pattern controls without an OLED browser', () => {
      const renderers = {
        buffers: [], helpers: [],
        functions: ['void render_p0(uint32_t ms) { (void)ms; }'],
        count: 1, params: [],
      }
      const sketch = generatePlayerSketch({}, renderers, {
        controls: {
          bindings: { patternNext: { kind: 'button', pin: 7, pullup: true } },
          debounceMs: 30, volumeStep: 0.05, brightnessStep: 0.05,
          repeatDelayMs: 400, repeatIntervalMs: 120,
        },
      })

      expect(sketch).toContain('struct PatternSel;')
      expect(sketch).toContain('static PatternSel _sel_player;')
      expect(sketch).toContain('_selBegin(_sel_player);')
      expect(sketch).toContain('_selUpdate(_sel_player, PATTERN_COUNT, now);')
    })

    it('rotates the generic player relative to the cursor, so a confirm survives', () => {
      // The rotation used to be posMs / dwell % count, an index derived purely
      // from the clock. It was pushed into the selection every loop, so the
      // instant a confirm cleared the browse flag the next iteration put the
      // clock's own choice back: the press selected and nothing changed.
      const renderers = {
        buffers: [], helpers: [],
        functions: ['void render_p0(uint32_t ms) { (void)ms; }',
                    'void render_p1(uint32_t ms) { (void)ms; }'],
        count: 2, params: [],
      }
      const sketch = generatePlayerSketch({}, renderers, {
        genericPlayer: true,
        patternOrder: 'Sequential',
        controls: {
          bindings: { patternConfirm: { kind: 'button', pin: 7, pullup: true } },
          debounceMs: 30, volumeStep: 0.05, brightnessStep: 0.05,
          repeatDelayMs: 400, repeatIntervalMs: 120,
        },
      })

      expect(sketch).not.toContain('posMs / 8000UL')
      // Steps from where the cursor is, so a confirmed pattern decides what
      // plays next rather than the clock overruling it.
      expect(sketch).toContain('(uint16_t)((selActive + 1) % PATTERN_COUNT)')
      // A move the show did not make restarts the dwell, giving a confirmed
      // pattern a whole window rather than the tail of someone else's.
      expect(sketch).toMatch(/if \(selActive != rotatedFrom\) \{\s+rotatedFrom = selActive; rotatedAtMs = posMs;/)
      // posMs rewinds on a track change; the unsigned difference would wrap.
      expect(sketch).toContain('if (posMs < previousPosMs) {')
    })
  })

  describe('pattern order', () => {
    const renderers = {
      buffers: [], helpers: [],
      functions: Array.from({ length: 4 }, (_, i) => `void render_p${i}(uint32_t ms) { (void)ms; }`),
      count: 4, params: [],
    }
    const controls = {
      bindings: { patternConfirm: { kind: 'button' as const, pin: 7, pullup: true } },
      debounceMs: 30, volumeStep: 0.05, brightnessStep: 0.05,
      repeatDelayMs: 400, repeatIntervalMs: 120,
    }

    it.each([false, true])('walks sequentially with physical controls %s', (hasControls) => {
      const sketch = generatePlayerSketch({}, renderers, {
        genericPlayer: true, patternOrder: 'Sequential',
        controls: hasControls ? controls : undefined,
      })
      expect(sketch).not.toContain('patternId = (uint8_t)random(')
      expect(sketch).toContain(hasControls
        ? '(uint16_t)((selActive + 1) % PATTERN_COUNT)'
        : '(uint8_t)((rotateIndex + 1) % 4)')
    })

    it.each([false, true])('defaults to random playback excluding the current pattern with physical controls %s', (hasControls) => {
      const sketch = generatePlayerSketch({}, renderers, {
        genericPlayer: true, controls: hasControls ? controls : undefined,
      })
      expect(sketch).toContain('patternId = (uint8_t)random(4);')
      expect(sketch).toContain(hasControls
        ? '(uint16_t)((selActive + 1 + random(PATTERN_COUNT - 1)) % PATTERN_COUNT)'
        : '(uint8_t)((rotateIndex + 1 + random(3)) % 4)')
      if (hasControls) {
        expect(sketch).toContain('_selSetActive(_sel_player, PATTERN_COUNT, patternId);')
        expect(sketch).toMatch(/if \(selActive != rotatedFrom\) \{\s+rotatedFrom = selActive; rotatedAtMs = posMs;/)
      } else {
        expect(sketch).toContain('static uint8_t rotateIndex = patternId;')
      }
    })

    it('leaves Performance show scheduling in charge of its patterns', () => {
      const sketch = generatePlayerSketch({}, renderers, { patternOrder: 'Random', controls })
      expect(sketch).not.toContain('patternId = (uint8_t)random(')
      expect(sketch).not.toContain('const uint32_t rotateMs')
      expect(sketch).toContain('_selSetActive(_sel_player, PATTERN_COUNT, (uint16_t)patternId);')
    })
  })

  describe('Player Particles', () => {
    it('resolves only the Particle FX node wired into Music Player', () => {
      const nodes = [
        { id: 'master', data: { nodeType: 'PatternMaster', properties: {} } },
        { id: 'fx', data: { nodeType: 'PlayerParticles', properties: {
          enabled: true, style: 6, color: '#3366cc', intensity: 0.72,
          randomColor: true, randomStyle: false,
        } } },
      ]
      const edges = [{ source: 'fx', sourceHandle: 'particleFx', target: 'master', targetHandle: 'particleFx' }]
      expect(playerParticlesFromGraph(nodes, edges)).toEqual({
        enabled: true, style: 6, color: { r: 51, g: 102, b: 204 }, intensity: 0.72,
        randomColor: true, randomStyle: false, volleyBursts: 3, restMs: 4000, energyGate: 0,
      })
      expect(playerParticlesFromGraph(nodes, [])).toBeNull()
    })

    it('turns live decoder beats into configured generic-player bursts', () => {
      const renderers = {
        buffers: [], helpers: [],
        functions: ['void render_p0(uint32_t ms) { fill_solid(leds, NUM_LEDS, CRGB::Blue); }'],
        count: 1, params: [],
      }
      const sketch = generatePlayerSketch({}, renderers, {
        genericPlayer: true,
        decoderTap: true,
        particleFx: {
          enabled: true, style: 6, color: { r: 51, g: 102, b: 204 }, intensity: 0.72,
          randomColor: false, randomStyle: true, volleyBursts: 2, restMs: 2500, energyGate: 0,
        },
      })
      // No Min Energy: the beat alone opens the gate.
      expect(sketch).toContain('  if (_audioBeat) {')
      expect(sketch).toContain('#define PARTICLE_VOLLEY_BURSTS 2')
      expect(sketch).toContain('#define PARTICLE_REST_MS   2500')
      expect(sketch).toContain('if (burstVolleyLeft == 0 && (burstStart == 0 || posMs - burstStart >= PARTICLE_REST_MS)) {')
      expect(sketch).toContain('if (burstVolleyLeft > 0) { burstVolleyLeft--; burstDue = true; }')
      expect(sketch).toContain('if (burstDue) {')
      expect(sketch).toContain('burstIntensity = 0.720f;')
      expect(sketch).toContain('burstStyle = random8(17);')
      expect(sketch).toContain('burstColor = CRGB(51, 102, 204);')
      expect(sketch).toContain('CRGB base = burstColor;')
    })

    it('holds back beats below Min Energy before the volley sees them', () => {
      const renderers = {
        buffers: [], helpers: [],
        functions: ['void render_p0(uint32_t ms) { fill_solid(leds, NUM_LEDS, CRGB::Blue); }'],
        count: 1, params: [],
      }
      const sketch = generatePlayerSketch({}, renderers, {
        genericPlayer: true,
        decoderTap: true,
        particleFx: {
          enabled: true, style: 6, color: { r: 51, g: 102, b: 204 }, intensity: 0.72,
          randomColor: false, randomStyle: false, volleyBursts: 3, restMs: 4000, energyGate: 0.35,
        },
      })
      expect(sketch).toContain('  if (_audioBeat && (_audioBass + _audioMids + _audioTreble) / 3.0f >= 0.350f) {')
    })
  })

  describe('PSRAM buffers', () => {
    const renderers = {
      buffers: ['CRGB p0_buf_frame[NUM_LEDS];', 'float p0_field_noise[NUM_LEDS];'],
      helpers: [],
      functions: ['void render_p0(uint32_t ms) { fill_solid(p0_buf_frame, NUM_LEDS, CRGB::Blue); p0_field_noise[0] = 0; }'],
      count: 1,
      params: [],
    }

    it('moves transition and pattern render buffers through the shared safe allocator', () => {
      const sketch = generatePlayerSketch({ usePsram: true }, renderers, { psramAllowed: true })
      expect(sketch).toContain('CRGB leds[NUM_LEDS];')
      expect(sketch).toContain('CRGB* showA = nullptr;')
      expect(sketch).toContain('CRGB* showB = nullptr;')
      expect(sketch).toContain('CRGB* p0_buf_frame = nullptr;')
      expect(sketch).toContain('float* p0_field_noise = nullptr;')
      expect(sketch).toContain('void* p = psramFound() ? ps_malloc(n) : nullptr;')
      expect(sketch).toContain('if (!p) p = malloc(n);')
      expect(sketch).toContain('showA = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);')
      expect(sketch).toContain('p0_field_noise = (float*)_psAlloc(sizeof(float) * NUM_LEDS);')
    })

    it('keeps static internal buffers when the selected board has no PSRAM option', () => {
      const sketch = generatePlayerSketch({ usePsram: true }, renderers, { psramAllowed: false })
      expect(sketch).toContain('CRGB showA[NUM_LEDS];')
      expect(sketch).toContain('CRGB showB[NUM_LEDS];')
      expect(sketch).toContain('CRGB p0_buf_frame[NUM_LEDS];')
      expect(sketch).toContain('float p0_field_noise[NUM_LEDS];')
      expect(sketch).not.toContain('psramFound()')
      expect(sketch).not.toContain('_psAlloc(')
    })
  })

  describe('serial file receiver', () => {
    const sketch = generatePlayerSketch(playerConfigFromGraph([
      generator,
      { id: 'mo', data: { nodeType: 'MatrixOutput', properties: { width: 16, height: 16 } } },
    ], SHOW_EDGE))

    it('accepts the provisioner wire protocol, so shows reach a flashed board', () => {
      // Folding the receiver in is what removes a whole compile-and-flash cycle
      // from every upload: the board is flashed once and files are pushed to it
      // while it runs.
      expect(sketch).toContain('void provServiceSerial() {')
      expect(sketch).toContain('if (line == "PING") {')
      expect(sketch).toContain('if (line.startsWith("PUT ")) {')
      expect(sketch).toContain('if (line == "END") {')
      expect(sketch).toContain('Serial.println("A");')      // per-block ack
      expect(sketch).toContain('Serial.println("DONE");')
      expect(sketch).toContain('Serial.println("BYE");')
      expect(sketch).toContain('provServiceSerial();')      // called from loop()
    })

    it('bounds every read, so a dropped byte cannot wedge the board', () => {
      // The Adalight stream receiver desynced permanently on one byte lost to
      // FastLED.show()'s interrupts-disabled window, with nothing visible to
      // the host. This sketch drives LEDs too, so an unbounded wait would
      // reproduce that exactly — a timeout costs one transfer instead.
      expect(sketch).not.toContain('while (!Serial.available())')
      expect(sketch).toContain('if (millis() - last > timeoutMs) return String();')
      expect(sketch).toContain('if (millis() - last > PROV_BLOCK_TIMEOUT_MS) {')
      // ...and a host that dies mid-protocol must not leave the board mute.
      expect(sketch).toContain('millis() - provLastCommandMs > PROV_SESSION_TIMEOUT_MS')
    })

    it('raises the link on request, and puts it back afterwards', () => {
      // A song is megabytes; at 115200 that is ~11 minutes, which makes the
      // feature unusable. Boot stays slow so first contact can never be what
      // fails, and the host verifies the new rate with a PING before trusting
      // it.
      expect(sketch).toContain('if (line.startsWith("BAUD ")) {')
      expect(sketch).toContain('Serial.updateBaudRate(rate);')
      // ...and back down at the end, or the status heartbeat becomes garbage
      // in a serial monitor the user opened at 115200.
      expect(sketch).toContain('Serial.updateBaudRate(115200);')
    })

    it('holds the render loop while a transfer is running', () => {
      // Rendering ends in FastLED.show(), whose interrupts-disabled window is
      // the thing that drops UART bytes in the first place.
      expect(sketch).toContain('if (provTransferring) return;')
    })

    it('reports a mount failure in the wording the host diagnoses', () => {
      // The host turns this exact string into a real explanation (card seated?
      // FAT32? CS pin?); a human sentence here would be passed through as an
      // unrecognised greeting instead. Said once, from setup(), so it stays a
      // greeting rather than a stream the host has to filter.
      expect(sketch).toContain('if (!sdMounted) Serial.println("ERR sd-mount-failed");')
    })

    it('reports the card state on every heartbeat, not just at boot', () => {
      // A serial monitor is almost always opened after the board has booted,
      // so the one-time greeting is the line nobody sees. Without this field
      // the monitor shows uptime climbing and audioPos at 0 — a healthy-looking
      // board playing nothing, with no hint that the card is why. The help's
      // SD troubleshooting tells people to read this field first.
      expect(sketch).toContain('sd=%s')
      expect(sketch).toContain('sdMounted ? "ok" : "MISSING"')
      expect(sketch).toContain('(unsigned long)audioPosMs')
      expect(sketch).not.toContain('(unsigned long)audio.getFilePos()')
    })

    it('surfaces audio-library failures and does not claim a failed open is playing', () => {
      // ESP32-audioI2S otherwise hides decoder/I2S failures behind weak
      // callbacks, leaving a static file position as the only symptom.
      expect(sketch).toContain('void audio_info(const char* info)')
      expect(sketch).toContain('[audio] %s')
      expect(sketch).toContain('if (audio.connecttoFS(SD, path.c_str()))')
      expect(sketch).toContain('ERR audio-open-failed')
    })

    it('primes local-file decoding before expensive LED rendering can time it out', () => {
      expect(sketch).toContain('void primeAudioDecoder()')
      expect(sketch).toContain('millis() - deadline')
      expect(sketch).toContain('audio.getAudioCurrentTime() == 0')
      expect(sketch).toMatch(/Playing \(fallback\): %s[^]*?primeAudioDecoder\(\);/)
    })

    it('dispatches the final event boundary after the audio library resets at EOF', () => {
      expect(sketch).toContain('showDurationMs = ((uint32_t)header[7])')
      expect(sketch).toContain('audioEnded = true;')
      expect(sketch).toContain('audioEnded ? showDurationMs : audio.getAudioCurrentTime() * 1000')
    })

    it('keeps trying to mount, instead of halting on a missing card', () => {
      // Nothing about a missing card is permanent — it can be unseated, or out
      // at a reader. Halting meant a physical reset was the only way back.
      expect(sketch).not.toMatch(/sd-mount-failed[^\n]*while\s*\(\s*1\s*\)/)
      expect(sketch).toContain('void sdRetryMount() {')
      expect(sketch).toContain('sdRetryMount();')
      // Releases the bus first: begin() against stale driver state can keep
      // failing even once the card is seated.
      expect(sketch).toMatch(/SD\.end\(\);\n\s*if \(!sdMountBestEffort\(\)\) return;/)
      // And retries at the speed the header parser needs, not the cautious
      // default that could not feed it — see sdMountBestEffort.
      expect(sketch).toContain('if (SD.begin(SD_CS, SPI, 20000000)) return true;')
      expect(sketch).toContain('return SD.begin(SD_CS, SPI, 4000000);')
      // ...and picks up playback once the card turns up, since setup() could
      // not have started any.
      expect(sketch).toMatch(/sdMounted = true;\n[^]*?startPlayback\(\);/)
    })

    it('sizes the RX buffer before begin(), where the driver reads it', () => {
      const rx = sketch.indexOf('Serial.setRxBufferSize(PROV_RX_BUFFER);')
      expect(rx).toBeGreaterThan(-1)
      expect(rx).toBeLessThan(sketch.indexOf('Serial.begin(115200);'))
    })

    it('resumes playback after a transfer, and stays quiet during one', () => {
      // The card changed underneath the player, so the track has to be picked
      // again — a board that arrived with an empty card would otherwise stay
      // on "no playable track" until power-cycled.
      expect(sketch).toContain('bool startPlayback() {')
      // "BYE" leaves before the link drops back to 115200 — the host is still
      // listening at whatever rate BAUD raised it to, and reordering these two
      // turns the reply it is waiting on into garbage.
      expect(sketch).toMatch(
        /Serial\.println\("BYE"\);\n\s*provEndSession\(\);\n\s*startPlayback\(\);/,
      )
      // The heartbeat is line-based like the protocol's own replies, so it
      // must not interleave with them.
      expect(sketch).toContain('if (!provTransferring && millis() - _dbgLast >= 2000) {')
    })
  })

  describe('HUB75 (docs/design/hub75-output.md)', () => {
    const hub75Cfg = playerConfigFromGraph([
      generator,
      { id: 'mo', data: { nodeType: 'MatrixOutput', properties: { width: 8, height: 8, chipset: 'HUB75' } } },
    ], SHOW_EDGE)

    it('resolves HUB75 props from the MatrixOutput node', () => {
      expect(hub75Cfg.chipset).toBe('HUB75')
      expect(hub75Cfg.hub75Props).toMatchObject({ width: 8, height: 8, chipset: 'HUB75' })
    })

    it('drives the DMA library instead of FastLED addLeds/show, still rendering into leds', () => {
      const sketch = generatePlayerSketch(hub75Cfg)
      expect(sketch).toContain('#include <ESP32-HUB75-MatrixPanel-I2S-DMA.h>')
      expect(sketch).toContain('MatrixPanel_I2S_DMA *dma_display = nullptr;')
      expect(sketch).toContain('HUB75_I2S_CFG _hub75Cfg(8, 8, 1, _hub75Pins);')
      expect(sketch).toContain('dma_display = new MatrixPanel_I2S_DMA(_hub75Cfg);')
      expect(sketch).not.toContain('#define LED_DATA_PIN')
      expect(sketch).not.toContain('FastLED.addLeds<')
      expect(sketch).not.toContain('FastLED.show();')
      // The controller's startup brightness (overridden live by
      // SET_BRIGHTNESS events) still applies to the HUB75 setup path.
      expect(sketch).toContain('dma_display->setBrightness8(128);')
      // Pattern rendering, transitions, beat flash, and the particle overlay
      // are untouched — still CRGB math into the shared `leds` buffer.
      expect(sketch).toContain('void renderPattern(')
      expect(sketch).toContain('compositeTransition(transType, leds, showA, showB, tp);')
      expect(sketch).toContain('for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {')
      expect(sketch).toContain('dma_display->drawPixelRGB888(_x, _y, _c.r, _c.g, _c.b);')
    })

    it('routes CMD_SET_BRIGHTNESS to dma_display->setBrightness8 instead of FastLED.setBrightness', () => {
      const sketch = generatePlayerSketch(hub75Cfg)
      expect(sketch).toContain('case CMD_SET_BRIGHTNESS: dma_display->setBrightness8((uint8_t)ev.params[0]); break;')
      expect(sketch).not.toContain('FastLED.setBrightness((uint8_t)ev.params[0])')
    })

    it('drives a single-row HUB75 panel chain via chain_length', () => {
      const chainedCfg = playerConfigFromGraph([
        generator,
        { id: 'mo', data: { nodeType: 'MatrixOutput', properties: { width: 24, height: 8, chipset: 'HUB75', layout: 'panels', tilesX: 3, tilesY: 1 } } },
      ], SHOW_EDGE)
      const sketch = generatePlayerSketch(chainedCfg)
      expect(sketch).toContain('HUB75_I2S_CFG _hub75Cfg(8, 8, 3, _hub75Pins);')
    })

    it('remaps square-tile per-panel rotation through a HUB75 coord table', () => {
      const rotatedCfg = playerConfigFromGraph([
        generator,
        { id: 'mo', data: { nodeType: 'MatrixOutput', properties: { width: 16, height: 8, chipset: 'HUB75', layout: 'panels', tilesX: 2, tilesY: 1, tileRotations: '0,90' } } },
      ], SHOW_EDGE)
      const sketch = generatePlayerSketch(rotatedCfg)
      expect(sketch).toContain('const uint16_t _hub75CoordMap[NUM_LEDS] PROGMEM = {')
      expect(sketch).toContain('dma_display->drawPixelRGB888(_hub75XY & 0xFF, _hub75XY >> 8, _c.r, _c.g, _c.b);')
    })

    it('drives a folded 2D HUB75 panel grid via VirtualMatrixPanel_T', () => {
      const gridCfg = playerConfigFromGraph([
        generator,
        { id: 'mo', data: { nodeType: 'MatrixOutput', properties: { width: 16, height: 16, chipset: 'HUB75', layout: 'panels', tilesX: 2, tilesY: 2 } } },
      ], SHOW_EDGE)
      const sketch = generatePlayerSketch(gridCfg)
      expect(sketch).toContain('#include <ESP32-HUB75-VirtualMatrixPanel_T.hpp>')
      expect(sketch).toContain('HUB75_I2S_CFG _hub75Cfg(8, 8, 4, _hub75Pins);')
      expect(sketch).toContain('hub75Virtual = new VirtualMatrixPanel_T<CHAIN_TOP_LEFT_DOWN>(2, 2, 8, 8);')
      // Brightness has no VirtualMatrixPanel_T passthrough (confirmed against
      // the vendored header — it exposes no setBrightness8 of its own), so it
      // always targets the underlying real display, virtual grid or not.
      expect(sketch).toContain('case CMD_SET_BRIGHTNESS: dma_display->setBrightness8((uint8_t)ev.params[0]); break;')
      expect(sketch).toContain('hub75Virtual->drawPixelRGB888(_x, _y, _c.r, _c.g, _c.b);')
    })

    it('remaps rotated tiles before drawing into a folded 2D HUB75 virtual grid', () => {
      const gridCfg = playerConfigFromGraph([
        generator,
        { id: 'mo', data: { nodeType: 'MatrixOutput', properties: { width: 16, height: 16, chipset: 'HUB75', layout: 'panels', tilesX: 2, tilesY: 2, tileRotations: '0,90,180,270' } } },
      ], SHOW_EDGE)
      const sketch = generatePlayerSketch(gridCfg)
      expect(sketch).toContain('const uint16_t _hub75CoordMap[NUM_LEDS] PROGMEM = {')
      expect(sketch).toContain('hub75Virtual->drawPixelRGB888(_hub75XY & 0xFF, _hub75XY >> 8, _c.r, _c.g, _c.b);')
    })
  })
})
