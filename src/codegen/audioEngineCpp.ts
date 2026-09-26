// The live audio engine a sketch hosts when a physical capture source feeds an
// output: capture adapters for each microphone family and the shared globals.
import type { StudioNode } from '../state/graphStore'
import { vuNormalizedLevelCpp } from './stereoLevelCpp'
import { MIC_DEFAULTS, MIC_MAX_GAIN } from '../audio/micAnalysis'
import { selectedPhysicalBoardProfile } from '../build/boardProfiles'
import {
  type MicFirmwareBackend,
  micFqbnForBoardProfile,
  micFirmwareBackendForBoard,
  micSupportedForBoard,
} from '../state/micPinDefaults'
import { type MicModule, DEFAULT_MIC_MODULE, micModuleFor } from '../state/micModules'
import { sanitizePin } from './hardwarePins'
import { resolveAudioCapabilitySource } from '../state/audioCapabilities'

// FastLED 3.10.3+ owns the live I2S microphone pipeline: capture, signal
// conditioning, shared FFT, adaptive frequency-band normalization, equalizer,
// and beat detection. Studio keeps the small _audio* global interface used by
// generated nodes and controller sketches, but no longer emits a second I2S
// driver or a parallel FFT implementation.
//
// The SD-card player intentionally does not use this block: it supplies the
// same globals from its baked song envelope.
function audioEngineCpp(
  backend: MicFirmwareBackend,
  ws: number,
  sck: number,
  sd: number,
  channel: 'Left' | 'Right' | 'Both',
  gain: number,
  serialDebug = false,
  source: 'microphone' | 'line-in' = 'microphone',
  mclk = -1,
  micModule: MicModule = DEFAULT_MIC_MODULE,
): string[] {
  const audioChannel = channel === 'Right'
    ? 'fl::audio::AudioChannel::Right'
    : channel === 'Both'
      ? 'fl::audio::AudioChannel::Both'
      : 'fl::audio::AudioChannel::Left'
  const sph0645 = source === 'microphone' && micModule.capture === 'sph0645-classic-esp32'
  const captureAdapter = source === 'line-in'
    ? pcm1802CaptureAdapterCpp(channel)
    : sph0645
      ? sph0645CaptureAdapterCpp(channel === 'Right' ? 'Right' : 'Left')
      : audioCaptureAdapterCpp(backend, channel === 'Both' ? 'Left' : channel)
  const createInput = source === 'line-in'
    ? [
        '  _lineInput = fl::make_shared<StudioPcm1802Input>();',
        '  _audioProcessor = FastLED.add(_lineInput);',
      ]
    : sph0645
    ? ['  _audioProcessor = FastLED.add(fl::make_shared<StudioSph0645Input>());']
    : backend === 'fastled-esp32'
    ? [`  auto config = fl::audio::Config::${micModule.factory}(MIC_WS, MIC_SD, MIC_SCK, ${audioChannel});`, '  _audioProcessor = FastLED.add(config);']
    : backend === 'fastled-teensy'
      ? [`  auto config = fl::audio::Config::CreateTeensyI2S(fl::audio::TeensyI2S::I2SPort::I2S1, ${audioChannel}, 44100, 16, fl::audio::MicProfile::${micModule.profile});`, '  _audioProcessor = FastLED.add(config);']
      : ['  _audioProcessor = FastLED.add(fl::make_shared<StudioI2sMicInput>());']
  // Only FastLED's own two capture paths take a MicProfile. The hand-written
  // wrapper below is plain I2S with nowhere to hand one, so on those boards
  // choosing a different module changes the wiring picture and the name and
  // nothing in the signal — said here rather than left to be discovered by
  // comparing two sketches.
  const profileApplies = (backend === 'fastled-esp32' || backend === 'fastled-teensy') && !sph0645
  return [
    `// ── FastLED ${source === 'line-in' ? 'PCM1802 line-in' : micModule.label} audio reactivity ─────────────────────────────────`,
    ...(source === 'microphone' && !profileApplies
      ? [`// This capture backend applies no mic response profile, so the ${micModule.label}`,
         '// is read with the same plain I2S path as any other I2S MEMS module.']
      : []),
    `#define MIC_WS    ${ws}`,
    `#define MIC_SCK   ${sck}`,
    `#define MIC_SD    ${sd}`,
    `#define LINE_IN_MCLK ${mclk}`,
    `#define MIC_GAIN  ${gain.toFixed(3)}f`,
    `#define MIC_DEBUG ${serialDebug ? 1 : 0}   // print FastLED processor levels (~10×/sec)`,
    ...captureAdapter,
    'float _audioBass = 0, _audioMids = 0, _audioTreble = 0, _audioBpm = 120;',
    'float _audioLeftLevel = 0, _audioRightLevel = 0;',
    'bool  _audioBeat = false;',
    'static float _audioSpectrum[32];',
    ...(source === 'line-in' ? ['static fl::shared_ptr<StudioPcm1802Input> _lineInput;'] : []),
    'static fl::shared_ptr<fl::audio::Processor> _audioProcessor;',
    'static volatile uint32_t _audioBeatCount = 0;',
    'static uint32_t _audioBeatSeen = 0;',
    '',
    'void setupAudio() {',
    '#if MIC_DEBUG',
    '  Serial.begin(115200);',
    '#endif',
    ...createInput,
    '  if (!_audioProcessor) return;',
    '  _audioProcessor->setGain(MIC_GAIN);',
    '  _audioProcessor->onBeat([] { _audioBeatCount = _audioBeatCount + 1; });',
    '  // Processor detectors are lazy. Register every detector whose values the',
    '  // generated graph polls before the auto-pumped input processes its first block.',
    '  (void)_audioProcessor->getBassLevel();',
    '  (void)_audioProcessor->getMidLevel();',
    '  (void)_audioProcessor->getTrebleLevel();',
    '  (void)_audioProcessor->getBPM();',
    '  (void)_audioProcessor->getEqBin(0);',
    '}',
    '',
    'void updateAudio() {',
    '  if (!_audioProcessor) {',
    '    _audioBass = _audioMids = _audioTreble = 0.0f;',
    '    _audioLeftLevel = _audioRightLevel = 0.0f;',
    '    _audioBeat = false;',
    '    for (int i = 0; i < 32; ++i) _audioSpectrum[i] = 0.0f;',
    '    return;',
    '  }',
    '  _audioBass = _audioProcessor->getBassLevel();',
    '  _audioMids = _audioProcessor->getMidLevel();',
    '  _audioTreble = _audioProcessor->getTrebleLevel();',
    ...(source === 'line-in' ? [
      '  _audioLeftLevel = _lineInput ? _lineInput->leftLevel() : 0.0f;',
      '  _audioRightLevel = _lineInput ? _lineInput->rightLevel() : 0.0f;',
    ] : [
      '  // A one-channel microphone intentionally drives both VU channels.',
      '  _audioLeftLevel = _audioRightLevel = max(_audioBass, max(_audioMids, _audioTreble));',
    ]),
    '  _audioBpm = _audioProcessor->getBPM();',
    '  uint32_t beatCount = _audioBeatCount;',
    '  _audioBeat = beatCount != _audioBeatSeen;',
    '  _audioBeatSeen = beatCount;',
    '  // FastLED Equalizer exposes 16 normalized bins. Duplicate each into the',
    '  // established 32-slot Studio spectrum so existing generated nodes retain',
    '  // their low/mid/high index ranges without maintaining a second FFT.',
    '  for (int i = 0; i < 32; ++i) _audioSpectrum[i] = _audioProcessor->getEqBin(i >> 1);',
    '#if MIC_DEBUG',
    '  static uint32_t _dbgLast = 0;',
    '  if (millis() - _dbgLast >= 100) {',
    '    _dbgLast = millis();',
    '    const auto& stats = _audioProcessor->getSignalConditionerStats();',
    '    Serial.printf("fastled audio bass=%.2f mids=%.2f treble=%.2f beat=%d bpm=%.0f gate=%d dc=%ld spikes=%lu\\n",',
    '                  _audioBass, _audioMids, _audioTreble, (int)_audioBeat, _audioBpm,',
    '                  (int)stats.noiseGateOpen, (long)stats.dcOffset, (unsigned long)stats.spikesRejected);',
    '    Serial.printf("stereo levels left=%.3f right=%.3f\\n", _audioLeftLevel, _audioRightLevel);',
    '  }',
    '#endif',
    '}',
  ]
}

/**
 * Classic-ESP32 capture for the SPH0645LM4H, which FastLED's driver cannot
 * read correctly.
 *
 * The ESP32 samples DOUT on the same BCLK edge the SPH0645 changes it, so
 * every sample arrives one bit left and loses its sign bit. The published fix
 * keeps Philips framing (RX MSB shift) and delays the receiver's SD input
 * sampling, through two fields of the classic ESP32's I2S register block.
 * FastLED 3.10.5's ESP32 driver always configures Philips, ignores the
 * requested format and exposes no timing control, so the app owns the receive
 * channel here, as it does for the PCM1802. The ESP32-S3's I2S block has no
 * documented equivalent, which is why this module is offered on classic ESP32
 * alone (`micSupportedForBoard`).
 *
 * The chip sends 18 significant bits MSB-first in a 32-bit slot; the top 16
 * become the Sample FastLED's Processor takes, whose signal conditioning
 * removes the part's DC offset. Both core generations are emitted, and the
 * delay is written after the channel starts so a driver reconfiguring the
 * block on enable cannot clear it.
 */
function sph0645CaptureAdapterCpp(channel: 'Left' | 'Right'): string[] {
  return [
    '',
    `#define SPH0645_SLOT ${channel === 'Right' ? 1 : 0}  // 0=left (SEL to GND), 1=right (SEL to 3V)`,
    'class StudioSph0645Input final : public fl::audio::IInput {',
    ' public:',
    '  void start() noexcept override {',
    '#if ESP_IDF_VERSION_MAJOR >= 5',
    '    i2s_chan_config_t channel = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_0, I2S_ROLE_MASTER);',
    '    channel.dma_desc_num = 8;',
    '    channel.dma_frame_num = SAMPLE_COUNT;',
    '    if (i2s_new_channel(&channel, nullptr, &_rx) != ESP_OK) { _failed = true; return; }',
    '    i2s_std_config_t config = {',
    '      .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(44100),',
    '      .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_32BIT, I2S_SLOT_MODE_STEREO),',
    '      .gpio_cfg = {',
    '        .mclk = GPIO_NUM_NC, .bclk = (gpio_num_t)MIC_SCK,',
    '        .ws = (gpio_num_t)MIC_WS, .dout = GPIO_NUM_NC, .din = (gpio_num_t)MIC_SD,',
    '        .invert_flags = { .mclk_inv = false, .bclk_inv = false, .ws_inv = false },',
    '      },',
    '    };',
    '    if (i2s_channel_init_std_mode(_rx, &config) != ESP_OK || i2s_channel_enable(_rx) != ESP_OK) {',
    '      _failed = true; stop(); return;',
    '    }',
    '#else',
    '    i2s_config_t config = {};',
    '    config.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX);',
    '    config.sample_rate = 44100;',
    '    config.bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT;',
    '    config.channel_format = I2S_CHANNEL_FMT_RIGHT_LEFT;',
    '    config.communication_format = I2S_COMM_FORMAT_STAND_I2S;',
    '    config.intr_alloc_flags = ESP_INTR_FLAG_LEVEL1;',
    '    config.dma_buf_count = 8;',
    '    config.dma_buf_len = SAMPLE_COUNT;',
    '    if (i2s_driver_install(I2S_NUM_0, &config, 0, nullptr) != ESP_OK) { _failed = true; return; }',
    '    _installed = true;',
    '    i2s_pin_config_t pins = {};',
    '    pins.mck_io_num = I2S_PIN_NO_CHANGE;',
    '    pins.bck_io_num = MIC_SCK; pins.ws_io_num = MIC_WS;',
    '    pins.data_out_num = I2S_PIN_NO_CHANGE; pins.data_in_num = MIC_SD;',
    '    if (i2s_set_pin(I2S_NUM_0, &pins) != ESP_OK) { _failed = true; stop(); return; }',
    '#endif',
    '    // The SPH0645 timing fix: Philips framing, and the SD input sampled two',
    '    // cycles later so it reads the bit the microphone is presenting.',
    '    REG_SET_BIT(I2S_CONF_REG(0), I2S_RX_MSB_SHIFT);',
    '    SET_PERI_REG_BITS(I2S_TIMING_REG(0), I2S_RX_SD_IN_DELAY, 2, I2S_RX_SD_IN_DELAY_S);',
    '  }',
    '  void stop() noexcept override {',
    '#if ESP_IDF_VERSION_MAJOR >= 5',
    '    if (_rx) { i2s_channel_disable(_rx); i2s_del_channel(_rx); _rx = nullptr; }',
    '#else',
    '    if (_installed) { i2s_driver_uninstall(I2S_NUM_0); _installed = false; }',
    '#endif',
    '  }',
    '  bool error(fl::string* msg = nullptr) noexcept override {',
    '    if (_failed && msg) *msg = "SPH0645 I2S receive failed";',
    '    return _failed;',
    '  }',
    '  fl::audio::Sample read() noexcept override {',
    '    if (_failed) return fl::audio::Sample();',
    '    size_t bytes = 0;',
    '#if ESP_IDF_VERSION_MAJOR >= 5',
    '    if (!_rx || i2s_channel_read(_rx, _raw, sizeof(_raw), &bytes, 0) != ESP_OK) return fl::audio::Sample();',
    '#else',
    '    if (!_installed || i2s_read(I2S_NUM_0, _raw, sizeof(_raw), &bytes, 0) != ESP_OK) return fl::audio::Sample();',
    '#endif',
    '    size_t frames = bytes / (sizeof(int32_t) * 2);',
    '    if (!frames) return fl::audio::Sample();',
    '    if (frames > SAMPLE_COUNT) frames = SAMPLE_COUNT;',
    '    for (size_t i = 0; i < frames; ++i) _mono[i] = (fl::i16)(_raw[i * 2 + SPH0645_SLOT] >> 16);',
    '    return fl::audio::Sample(fl::span<const fl::i16>(_mono, frames), millis());',
    '  }',
    ' private:',
    '  static const size_t SAMPLE_COUNT = 512;',
    '#if ESP_IDF_VERSION_MAJOR >= 5',
    '  i2s_chan_handle_t _rx = nullptr;',
    '#else',
    '  bool _installed = false;',
    '#endif',
    '  bool _failed = false;',
    '  int32_t _raw[SAMPLE_COUNT * 2];',
    '  fl::i16 _mono[SAMPLE_COUNT];',
    '};',
  ]
}

/** ESP32 PCM1802 capture with a controller-generated 256× sample-rate MCLK.
 * FastLED's public ConfigI2S deliberately models three-wire MEMS microphones,
 * so it cannot name the ADC's fourth clock. This adapter owns the receive
 * channel and hands the same 16-bit mono Sample contract to FastLED's shared
 * Processor. Both Arduino-ESP32 core generations used by Studio are emitted:
 * IDF 5's channel API and IDF 4's legacy driver. */
function pcm1802CaptureAdapterCpp(channel: 'Left' | 'Right' | 'Both'): string[] {
  const channelMode = channel === 'Left' ? 0 : channel === 'Right' ? 1 : 2
  return [
    '',
    `#define LINE_IN_CHANNEL ${channelMode}  // 0=left, 1=right, 2=stereo downmix`,
    'class StudioPcm1802Input final : public fl::audio::IInput {',
    ' public:',
    '  void start() noexcept override {',
    '#if ESP_IDF_VERSION_MAJOR >= 5',
    '    i2s_chan_config_t channel = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_0, I2S_ROLE_MASTER);',
    '    channel.dma_desc_num = 8;',
    '    channel.dma_frame_num = SAMPLE_COUNT;',
    '    if (i2s_new_channel(&channel, nullptr, &_rx) != ESP_OK) { _failed = true; return; }',
    '    i2s_std_config_t config = {',
    '      .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(44100),',
    '      .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_24BIT, I2S_SLOT_MODE_STEREO),',
    '      .gpio_cfg = {',
    '        .mclk = (gpio_num_t)LINE_IN_MCLK, .bclk = (gpio_num_t)MIC_SCK,',
    '        .ws = (gpio_num_t)MIC_WS, .dout = GPIO_NUM_NC, .din = (gpio_num_t)MIC_SD,',
    '        .invert_flags = { .mclk_inv = false, .bclk_inv = false, .ws_inv = false },',
    '      },',
    '    };',
    '    config.clk_cfg.mclk_multiple = I2S_MCLK_MULTIPLE_256;',
    '    if (i2s_channel_init_std_mode(_rx, &config) != ESP_OK || i2s_channel_enable(_rx) != ESP_OK) {',
    '      _failed = true; stop(); return;',
    '    }',
    '#else',
    '    i2s_config_t config = {};',
    '    config.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX);',
    '    config.sample_rate = 44100;',
    '    config.bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT;',
    '    config.channel_format = I2S_CHANNEL_FMT_RIGHT_LEFT;',
    '    config.communication_format = I2S_COMM_FORMAT_STAND_I2S;',
    '    config.intr_alloc_flags = ESP_INTR_FLAG_LEVEL1;',
    '    config.dma_buf_count = 8;',
    '    config.dma_buf_len = SAMPLE_COUNT;',
    '    config.use_apll = true;',
    '    config.tx_desc_auto_clear = false;',
    '    config.fixed_mclk = 44100 * 256;',
    '    config.mclk_multiple = I2S_MCLK_MULTIPLE_256;',
    '    config.bits_per_chan = I2S_BITS_PER_CHAN_32BIT;',
    '    if (i2s_driver_install(I2S_NUM_0, &config, 0, nullptr) != ESP_OK) { _failed = true; return; }',
    '    _installed = true;',
    '    i2s_pin_config_t pins = {',
    '      .mck_io_num = LINE_IN_MCLK, .bck_io_num = MIC_SCK, .ws_io_num = MIC_WS,',
    '      .data_out_num = I2S_PIN_NO_CHANGE, .data_in_num = MIC_SD,',
    '    };',
    '    if (i2s_set_pin(I2S_NUM_0, &pins) != ESP_OK) { _failed = true; stop(); return; }',
    '#endif',
    '  }',
    '  void stop() noexcept override {',
    '#if ESP_IDF_VERSION_MAJOR >= 5',
    '    if (_rx) { i2s_channel_disable(_rx); i2s_del_channel(_rx); _rx = nullptr; }',
    '#else',
    '    if (_installed) { i2s_driver_uninstall(I2S_NUM_0); _installed = false; }',
    '#endif',
    '  }',
    '  bool error(fl::string* msg = nullptr) noexcept override {',
    '    if (_failed && msg) *msg = "PCM1802 I2S receive failed";',
    '    return _failed;',
    '  }',
    '  float leftLevel() const noexcept { return _leftLevel; }',
    '  float rightLevel() const noexcept { return _rightLevel; }',
    '  fl::audio::Sample read() noexcept override {',
    '    if (_failed) return fl::audio::Sample();',
    '    size_t bytes = 0;',
    '#if ESP_IDF_VERSION_MAJOR >= 5',
    '    if (!_rx || i2s_channel_read(_rx, _raw, sizeof(_raw), &bytes, 0) != ESP_OK) return fl::audio::Sample();',
    '#else',
    '    if (!_installed || i2s_read(I2S_NUM_0, _raw, sizeof(_raw), &bytes, 0) != ESP_OK) return fl::audio::Sample();',
    '#endif',
    '    size_t frames = bytes / (sizeof(int32_t) * 2);',
    '    if (!frames) return fl::audio::Sample();',
    '    if (frames > SAMPLE_COUNT) frames = SAMPLE_COUNT;',
    '    uint64_t leftSquares = 0, rightSquares = 0;',
    '    for (size_t i = 0; i < frames; ++i) {',
    '      int32_t left = _raw[i * 2] >> 16;',
    '      int32_t right = _raw[i * 2 + 1] >> 16;',
    '      leftSquares += (uint64_t)((int64_t)left * left);',
    '      rightSquares += (uint64_t)((int64_t)right * right);',
    '#if LINE_IN_CHANNEL == 0',
    '      _mono[i] = (fl::i16)left;',
    '#elif LINE_IN_CHANNEL == 1',
    '      _mono[i] = (fl::i16)right;',
    '#else',
    '      _mono[i] = (fl::i16)((left + right) / 2);',
    '#endif',
    '    }',
    '    _leftLevel = normalizedLevel(leftSquares, frames);',
    '    _rightLevel = normalizedLevel(rightSquares, frames);',
    '#if LINE_IN_CHANNEL == 0',
    '    _rightLevel = _leftLevel;',
    '#elif LINE_IN_CHANNEL == 1',
    '    _leftLevel = _rightLevel;',
    '#endif',
    '    return fl::audio::Sample(fl::span<const fl::i16>(_mono, frames), millis());',
    '  }',
    ' private:',
    ...vuNormalizedLevelCpp({
      name: 'normalizedLevel', indent: '  ', qualifier: 'static ', gainExpr: 'MIC_GAIN',
    }),
    '  static const size_t SAMPLE_COUNT = 512;',
    '#if ESP_IDF_VERSION_MAJOR >= 5',
    '  i2s_chan_handle_t _rx = nullptr;',
    '#else',
    '  bool _installed = false;',
    '#endif',
    '  int32_t _raw[SAMPLE_COUNT * 2];',
    '  fl::i16 _mono[SAMPLE_COUNT];',
    '  volatile float _leftLevel = 0.0f;',
    '  volatile float _rightLevel = 0.0f;',
    '  bool _failed = false;',
    '};',
    '',
  ]
}

function audioCaptureAdapterCpp(
  backend: MicFirmwareBackend,
  channel: 'Left' | 'Right',
): string[] {
  if (backend === 'fastled-esp32' || backend === 'fastled-teensy') return []
  const side = channel === 'Right' ? 'right' : 'left'

  if (backend === 'pico-i2s') {
    return [
      '',
      '// Earle Philhower RP2040/RP2350 PIO-I2S -> FastLED PCM adapter.',
      'class StudioI2sMicInput final : public fl::audio::IInput {',
      ' public:',
      '  StudioI2sMicInput() : _i2s(INPUT) {}',
      '  void start() noexcept override {',
      '    if (MIC_WS != MIC_SCK + 1) { _failed = true; return; }',
      '    _i2s.setBCLK(MIC_SCK);  // this core assigns LRCLK to BCLK + 1',
      '    _i2s.setDIN(MIC_SD);',
      '    _i2s.setBitsPerSample(32);',
      '    _i2s.setFrequency(44100);',
      '    _i2s.setBuffers(4, 256);',
      '    _failed = !_i2s.begin();',
      '  }',
      '  void stop() noexcept override { _i2s.end(); }',
      '  bool error(fl::string* msg = nullptr) noexcept override {',
      '    if (_failed && msg) *msg = "RP2040 I2S failed (LRCLK must be BCLK + 1)";',
      '    return _failed;',
      '  }',
      '  fl::audio::Sample read() noexcept override {',
      '    if (_failed) return fl::audio::Sample();',
      '    for (size_t i = 0; i < SAMPLE_COUNT; ++i) {',
      '      int32_t left = 0, right = 0;',
      '      if (!_i2s.read32(&left, &right)) { _failed = true; return fl::audio::Sample(); }',
      `      _pcm[i] = (fl::i16)(${side} >> 16);`,
      '    }',
      '    return fl::audio::Sample(fl::span<const fl::i16>(_pcm, SAMPLE_COUNT), millis());',
      '  }',
      ' private:',
      '  static const size_t SAMPLE_COUNT = 512;',
      '  I2S _i2s;',
      '  fl::i16 _pcm[SAMPLE_COUNT];',
      '  bool _failed = false;',
      '};',
      '',
    ]
  }

  if (backend === 'samd51-zero-i2s') {
    return [
      '',
      '// Adafruit SAMD51 ZeroI2S receive -> FastLED PCM adapter.',
      '#ifndef PIN_I2S_SD',
      '#define PIN_I2S_SD MIC_SD',
      '#endif',
      'class StudioI2sMicInput final : public fl::audio::IInput {',
      ' public:',
      '  StudioI2sMicInput() : _i2s(MIC_WS, MIC_SCK, PIN_I2S_SD, MIC_SD) {}',
      '  void start() noexcept override {',
      '    _failed = !_i2s.begin(I2S_32_BIT, 44100);',
      '    if (!_failed) _i2s.enableRx();',
      '  }',
      '  void stop() noexcept override { _i2s.disableRx(); }',
      '  bool error(fl::string* msg = nullptr) noexcept override {',
      '    if (_failed && msg) *msg = "SAMD51 ZeroI2S receive failed";',
      '    return _failed;',
      '  }',
      '  fl::audio::Sample read() noexcept override {',
      '    if (_failed) return fl::audio::Sample();',
      '    for (size_t i = 0; i < SAMPLE_COUNT; ++i) {',
      '      uint32_t waitStarted = micros();',
      '      while (!_i2s.rxReady()) {',
      '        if ((uint32_t)(micros() - waitStarted) > 5000U) return fl::audio::Sample();',
      '      }',
      '      int32_t left = 0, right = 0;',
      '      _i2s.read(&left, &right);',
      `      _pcm[i] = (fl::i16)(${side} >> 16);`,
      '    }',
      '    return fl::audio::Sample(fl::span<const fl::i16>(_pcm, SAMPLE_COUNT), millis());',
      '  }',
      ' private:',
      '  static const size_t SAMPLE_COUNT = 512;',
      '  Adafruit_ZeroI2S _i2s;',
      '  fl::i16 _pcm[SAMPLE_COUNT];',
      '  bool _failed = false;',
      '};',
      '',
    ]
  }

  return [
    '',
    '// STM32 SPI2/I2S2 polling receiver -> FastLED PCM adapter.',
    '// PB12=WS, PB13=BCLK, PB15=SD on the supported F1/F4 board profiles.',
    'class StudioI2sMicInput final : public fl::audio::IInput {',
    ' public:',
    '  void start() noexcept override {',
    '#if defined(STM32F1xx)',
    '    RCC->APB2ENR |= RCC_APB2ENR_AFIOEN | RCC_APB2ENR_IOPBEN;',
    '    RCC->APB1ENR |= RCC_APB1ENR_SPI2EN;',
    '    uint32_t crh = GPIOB->CRH;',
    '    crh &= ~((0xFU << 16) | (0xFU << 20) | (0xFU << 28));',
    '    crh |=  ((0xBU << 16) | (0xBU << 20) | (0x4U << 28));',
    '    GPIOB->CRH = crh;',
    '    SPI2->I2SPR = 13U;  // 72 MHz I2S clock -> about 43.27 kHz',
    '#elif defined(STM32F4xx)',
    '    RCC->AHB1ENR |= RCC_AHB1ENR_GPIOBEN;',
    '    RCC->APB1ENR |= RCC_APB1ENR_SPI2EN;',
    '    GPIOB->MODER = (GPIOB->MODER & ~((3U << 24) | (3U << 26) | (3U << 30))) |',
    '                   (2U << 24) | (2U << 26) | (2U << 30);',
    '    GPIOB->PUPDR &= ~((3U << 24) | (3U << 26) | (3U << 30));',
    '    GPIOB->OSPEEDR |= (3U << 24) | (3U << 26) | (3U << 30);',
    '    GPIOB->AFR[1] = (GPIOB->AFR[1] & ~((0xFU << 16) | (0xFU << 20) | (0xFU << 28))) |',
    '                    (5U << 16) | (5U << 20) | (5U << 28);',
    '    RCC->CR &= ~RCC_CR_PLLI2SON;',
    '    uint32_t pllWait = millis();',
    '    while ((RCC->CR & RCC_CR_PLLI2SRDY) && (uint32_t)(millis() - pllWait) < 20U) {}',
    '    RCC->PLLI2SCFGR = (RCC->PLLI2SCFGR & ~((0x1FFU << 6) | (7U << 28))) |',
    '                       (271U << 6) | (2U << 28);',
    '    RCC->CR |= RCC_CR_PLLI2SON;',
    '    pllWait = millis();',
    '    while (!(RCC->CR & RCC_CR_PLLI2SRDY) && (uint32_t)(millis() - pllWait) < 20U) {}',
    '#ifdef RCC_DCKCFGR_I2S2SRC',
    '    RCC->DCKCFGR &= ~RCC_DCKCFGR_I2S2SRC;',
    '#endif',
    '    SPI2->I2SPR = 24U;  // 135.5 MHz PLLI2S -> about 44.11 kHz',
    '#else',
    '    _failed = true;',
    '    return;',
    '#endif',
    '    SPI2->I2SCFGR = 0;',
    '    SPI2->I2SCFGR = SPI_I2SCFGR_I2SMOD | SPI_I2SCFGR_I2SCFG_0 |',
    '                      SPI_I2SCFGR_I2SCFG_1 | SPI_I2SCFGR_CHLEN |',
    '                      SPI_I2SCFGR_DATLEN_1;',
    '    SPI2->I2SCFGR |= SPI_I2SCFGR_I2SE;',
    '  }',
    '  void stop() noexcept override { SPI2->I2SCFGR &= ~SPI_I2SCFGR_I2SE; }',
    '  bool error(fl::string* msg = nullptr) noexcept override {',
    '    if (_failed && msg) *msg = "STM32 I2S2 receive failed";',
    '    return _failed;',
    '  }',
    '  fl::audio::Sample read() noexcept override {',
    '    if (_failed) return fl::audio::Sample();',
    '    for (size_t i = 0; i < SAMPLE_COUNT; ++i) {',
    '      uint16_t lHi, lLo, rHi, rLo;',
    '      if (!readHalf(lHi) || !readHalf(lLo) || !readHalf(rHi) || !readHalf(rLo))',
    '        return fl::audio::Sample();',
    '      int32_t left = (int32_t)(((uint32_t)lHi << 16) | lLo);',
    '      int32_t right = (int32_t)(((uint32_t)rHi << 16) | rLo);',
    `      _pcm[i] = (fl::i16)(${side} >> 16);`,
    '    }',
    '    return fl::audio::Sample(fl::span<const fl::i16>(_pcm, SAMPLE_COUNT), millis());',
    '  }',
    ' private:',
    '  bool readHalf(uint16_t& value) {',
    '    uint32_t waitStarted = micros();',
    '    while (!(SPI2->SR & SPI_SR_RXNE)) {',
    '      if ((uint32_t)(micros() - waitStarted) > 5000U) { _failed = true; return false; }',
    '    }',
    '    value = (uint16_t)SPI2->DR;',
    '    return true;',
    '  }',
    '  static const size_t SAMPLE_COUNT = 512;',
    '  fl::i16 _pcm[SAMPLE_COUNT];',
    '  bool _failed = false;',
    '};',
    '',
  ]
}

/**
 * The on-device FastLED audio processor for a graph that
 * contains an Audio capability backed by a physical capture provider, so a
 * controller sketch can host the engine once while compiled subgraphs refer
 * to `_audioBass`/`_audioMids`/`_audioTreble`/`_audioBeat`. Returns null when
 * the reachable graph has no physical capture source. Mirrors the block
 * generateCpp inlines for a source-bearing single-pattern sketch.
 */
export function audioEngineForGraph(
  nodes: StudioNode[],
  capabilityNodes: StudioNode[] = nodes,
): { preInclude: string[]; include: string; code: string[]; fqbn: string; backend: MicFirmwareBackend } | null {
  const capabilitySource = nodes
    .filter((node) => node.data.nodeType === 'Audio')
    .map((node) => resolveAudioCapabilitySource(capabilityNodes, (node.data.properties as Record<string, unknown>).sourceId)?.node)
    .find((node) => node?.data.nodeType === 'MicInput' || node?.data.nodeType === 'LineInput')
  const sourceNode = capabilitySource
  if (!sourceNode) return null
  // The Board node is the sole target authority. MatrixOutput's legacy board
  // field and the upload store are intentionally not consulted here.
  const fqbn = micFqbnForBoardProfile(selectedPhysicalBoardProfile(capabilityNodes))
  const backend = fqbn ? micFirmwareBackendForBoard(fqbn) : undefined
  if (!fqbn || !backend) return null
  const lineInput = sourceNode.data.nodeType === 'LineInput'
  // PCM1802's MCLK path is implemented against the ESP32 I2S peripheral. The
  // UI and validation keep it off other families, but codegen stays defensive
  // for imported/hand-authored workspaces.
  if (lineInput && (!fqbn.startsWith('esp32:esp32:esp32s3') || backend !== 'fastled-esp32')) return null
  const p = sourceNode.data.properties as Record<string, unknown>
  // The SPH0645 adapter is written against the classic ESP32's I2S registers;
  // validation refuses it elsewhere, and codegen stays defensive for imports.
  if (!lineInput && !micSupportedForBoard(fqbn, p.partId)) return null
  const fc = (v: unknown, d: number, min: number, max: number) => {
    const n = Number(v); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : d
  }
  // Which module: the exact part the node names, resolved the same way the
  // hardware views resolve it, so the factory the sketch calls and the picture
  // the Build Diagram draws come from one answer.
  const micModule = micModuleFor(p.partId)
  const savedChannel = String(p.channel ?? (lineInput ? 'Both' : 'Left'))
  const channel: 'Left' | 'Right' | 'Both' = savedChannel === 'Right'
    ? 'Right'
    : savedChannel === 'Both' && lineInput
      ? 'Both'
      : 'Left'
  return {
    // FastLED 3.10.5's SAMD ISR translation unit still names the SAMD21-style
    // PMUX/EIC symbols. Adafruit's SAMD51 CMSIS headers expose their equivalent
    // indexed forms; aliases here keep exported sketches compilable without
    // modifying the user's FastLED installation.
    preInclude: !lineInput && backend === 'samd51-zero-i2s' ? [
      '// The I2S microphone + clockless LED path does not need SAMD hardware SPI.',
      '#define FASTLED_FORCE_SOFTWARE_SPI 1',
      '#if defined(__SAMD51__)',
      '#ifndef PORT_PMUX_PMUXO_A',
      '#define PORT_PMUX_PMUXO_A PORT_PMUX_PMUXO(0)',
      '#define PORT_PMUX_PMUXE_A PORT_PMUX_PMUXE(0)',
      '#endif',
      '#ifndef EIC_IRQn',
      '#define EIC_IRQn EIC_0_IRQn',
      '#endif',
      '#endif',
    ] : [],
    include: [
      `// ${lineInput ? 'PCM1802 line-in' : micModule.label} capture feeds the same FastLED Processor contract as preview.`,
      ...(lineInput || micModule.capture === 'sph0645-classic-esp32' ? [
        '#include <esp_idf_version.h>',
        '#if ESP_IDF_VERSION_MAJOR >= 5',
        '#include <driver/i2s_std.h>',
        '#else',
        '#include <driver/i2s.h>',
        '#endif',
      ] : []),
      ...(micModule.capture === 'sph0645-classic-esp32' && !lineInput ? [
        '#include <soc/soc.h>',
        '#include <soc/i2s_reg.h>',
      ] : []),
      ...(!lineInput && backend === 'fastled-teensy' ? [
        `// Keep the build system's library scanner aware of PJRC Audio sources.`,
        `#include <Audio.h>`,
      ] : []),
      ...(!lineInput && backend === 'pico-i2s' ? [`#include <I2S.h>`] : []),
      ...(!lineInput && backend === 'samd51-zero-i2s' ? [`#include <Adafruit_ZeroI2S.h>`] : []),
    ].join('\n'),
    code: audioEngineCpp(
      backend,
      sanitizePin(lineInput ? p.i2sLrclk : p.i2sWs, lineInput ? 26 : 39),
      sanitizePin(lineInput ? p.i2sBclk : p.i2sSck, lineInput ? 27 : 40),
      sanitizePin(lineInput ? p.i2sDout : p.i2sSd, lineInput ? 25 : 41),
      channel,
      fc(p.gain, MIC_DEFAULTS.gain, 0, MIC_MAX_GAIN),
      p.serialDebug === true,
      lineInput ? 'line-in' : 'microphone',
      lineInput ? sanitizePin(p.i2sMclk, 14) : -1,
      micModule,
    ),
    fqbn,
    backend,
  }
}
