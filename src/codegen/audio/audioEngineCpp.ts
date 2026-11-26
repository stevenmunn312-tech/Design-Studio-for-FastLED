// The live audio engine a sketch hosts when a physical capture source feeds an
// output: capture adapters for each microphone family and the shared globals.
import type { StudioEdge, StudioNode } from '../../state/graphStore'
import { vuNormalizedLevelCpp } from './stereoLevelCpp'
import { VU_RMS_NOISE_GATE, VU_RMS_REFERENCE } from '../../audio/stereoLevels'
import { MIC_DEFAULTS, MIC_MAX_GAIN, MIC_MAX_NOISE_GATE, noiseGateCloseThreshold } from '../../audio/micAnalysis'
import { selectedPhysicalBoardProfile } from '../../build/boards/boardProfiles'
import {
  type MicFirmwareBackend,
  micFqbnForBoardProfile,
  micFirmwareBackendForBoard,
  micSupportedForBoard,
} from '../../build/pins/micPinDefaults'
import { type MicModule, micModuleFor } from '../../state/peripherals/micModules'
import { sanitizePin } from '../hardwarePins'
import { resolveAudioCapabilitySource } from '../../state/audio/audioCapabilities'
import { AUDIO_SOURCE_POSITION_CPP, audioSourceSwitchFor } from '../../state/audio/audioSourceSwitch'
import type { GroupRegistry } from '../../state/evaluator/types'
import { pitchGlobalsCpp, pitchHelperCpp } from '../helpers/pitchHelperCpp'
import { WAVE_SAMPLES } from '../../state/evaluator/waveform'

/** Whether a node of `type` exists in the graph or any group it can expand.
 *  Detectors are lazy on the processor and allocate, so the engine only
 *  registers one when a node will read it. */
function graphUsesNodeType(type: string, nodes: readonly StudioNode[], groups: GroupRegistry): boolean {
  const matches = (node: StudioNode) => node.data.nodeType === type
  return nodes.some(matches) || Object.values(groups).some((group) => group.nodes.some(matches))
}

export const graphUsesVibe = (nodes: readonly StudioNode[], groups: GroupRegistry = {}): boolean =>
  graphUsesNodeType('Vibe', nodes, groups)

/** Whether any Audio Features node has an output wired that reads the host's
 *  loudness: Loudness itself, and Level and Silence, which are derived from
 *  it. Loudness costs the host an RMS per frame, so it is published only
 *  when read. */
const LOUDNESS_OUTPUTS: ReadonlySet<string | null | undefined> = new Set(['loudness', 'level', 'silence'])

export function graphUsesLoudness(
  nodes: readonly StudioNode[], edges: readonly StudioEdge[], groups: GroupRegistry = {},
): boolean {
  const reads = (graphNodes: readonly StudioNode[], graphEdges: readonly StudioEdge[]) => {
    const features = new Set(graphNodes.filter((node) => node.data.nodeType === 'AudioFeatures').map((node) => node.id))
    return graphEdges.some((edge) => LOUDNESS_OUTPUTS.has(edge.sourceHandle) && features.has(edge.source))
  }
  return reads(nodes, edges) || Object.values(groups).some((group) => reads(group.nodes, group.edges))
}
/** Peak-preserving decimation of the current chunk into `_audioWave`, the
 *  firmware twin of `decimateWave` in state/evaluator/waveform.ts. */
function waveformHelperCpp(sample: string): string[] {
  return [
    '// Waveform: the current chunk peak-decimated to ' + WAVE_SAMPLES + ' samples in -1..1.',
    'static uint32_t _waveStamp = 0;',
    'static void _audioWaveStep() {',
    `  const fl::audio::Sample& sample = ${sample};`,
    '  if (!sample.isValid() || sample.timestamp() == _waveStamp) return;',
    '  _waveStamp = sample.timestamp();',
    '  const auto& pcm = sample.pcm();',
    '  size_t n = pcm.size();',
    `  size_t block = n / ${WAVE_SAMPLES};`,
    '  if (block < 1) block = 1;',
    `  for (int i = 0; i < ${WAVE_SAMPLES}; ++i) {`,
    '    float best = 0.0f, bestAbs = -1.0f;',
    '    for (size_t j = 0; j < block; ++j) {',
    '      size_t idx = (size_t)i * block + j;',
    '      float v = idx < n ? (float)pcm[idx] / 32768.0f : 0.0f;',
    '      if (fabsf(v) > bestAbs) { bestAbs = fabsf(v); best = v; }',
    '    }',
    '    _audioWave[i] = best;',
    '  }',
    '}',
  ]
}

export const graphUsesWaveform = (nodes: readonly StudioNode[], groups: GroupRegistry = {}): boolean =>
  graphUsesNodeType('Waveform', nodes, groups)
export const graphUsesPitch = (nodes: readonly StudioNode[], groups: GroupRegistry = {}): boolean =>
  graphUsesNodeType('PitchDetect', nodes, groups)
export const graphUsesSongStructure = (nodes: readonly StudioNode[], groups: GroupRegistry = {}): boolean =>
  graphUsesNodeType('SongStructure', nodes, groups)

const VIBE_LEVELS = [
  ['Bass', 'getVibeBass'], ['Mid', 'getVibeMid'], ['Treble', 'getVibeTreb'], ['Volume', 'getVibeVol'],
  ['BassAtt', 'getVibeBassAtt'], ['MidAtt', 'getVibeMidAtt'], ['TrebleAtt', 'getVibeTrebAtt'],
] as const
const VIBE_SPIKES = [
  ['BassSpike', 'isVibeBassSpike'], ['MidSpike', 'isVibeMidSpike'], ['TrebleSpike', 'isVibeTrebSpike'],
] as const

/** The optional FastLED detectors a sketch polls beyond the core levels, beat
 *  and spectrum. Every host of an `_audioProcessor` — the live capture engine
 *  and the SD player's decoder tap — emits the same globals and updates from
 *  these helpers, so a node reads one contract whichever source feeds it. */
export interface AudioFeatures {
  vibe: boolean
  structure: boolean
  pitch: boolean
  waveform: boolean
  /** Audio Features' absolute Loudness (`_audioLoudness`). Each host publishes
   *  it itself, from whatever absolute meter its source has, so the shared
   *  emitters below leave it alone. Optional: hosts that only replay baked
   *  detectors never read it. */
  loudness?: boolean
}

const AUDIO_FEATURE_GLOBALS: Record<keyof AudioFeatures, RegExp> = {
  vibe: /\b_audioVibe[A-Z]\w*\b/,
  structure: /\b_audio(?:Downbeat|Building|Drop|DropImpact|TempoStable|MeasurePhase|BuildupProgress|Valence|Arousal|BeatNumber)\b/,
  pitch: /\b_audio(?:Pitch|Key)[A-Z]\w*\b/,
  waveform: /\b_audioWave\b/,
  loudness: /\b_audioLoudness\b/,
}

/** Which optional detectors already-emitted code reads, for hosts that see
 *  compiled pattern code rather than the graph. */
export function audioFeaturesInCode(blocks: readonly string[]): AudioFeatures {
  const reads = (pattern: RegExp) => blocks.some((code) => pattern.test(code))
  return {
    vibe: reads(AUDIO_FEATURE_GLOBALS.vibe),
    structure: reads(AUDIO_FEATURE_GLOBALS.structure),
    pitch: reads(AUDIO_FEATURE_GLOBALS.pitch),
    waveform: reads(AUDIO_FEATURE_GLOBALS.waveform),
    loudness: reads(AUDIO_FEATURE_GLOBALS.loudness),
  }
}

/** Feature globals; emit after the core `_audio*` globals. */
export function audioFeatureGlobalsCpp(f: AudioFeatures): string[] {
  return [
    ...(f.vibe ? [
      '// FastLED Vibe: levels are relative to the song average (about 1.0), unbounded above.',
      `float ${VIBE_LEVELS.map(([name]) => `_audioVibe${name} = 0.0f`).join(', ')};`,
      `bool  ${VIBE_SPIKES.map(([name]) => `_audioVibe${name} = false`).join(', ')};`,
    ] : []),
    ...(f.structure ? [
      '// FastLED song structure. Downbeat and drop are callback-only events, so they',
      '// become counters; buildup and tempo stability become flags the callbacks set.',
      'bool  _audioDownbeat = false, _audioBuilding = false, _audioDrop = false, _audioTempoStable = false;',
      'float _audioMeasurePhase = 0.0f, _audioBuildupProgress = 0.0f, _audioDropImpact = 0.0f;',
      'float _audioValence = 0.0f, _audioArousal = 0.0f;',
      'int   _audioBeatNumber = 0;',
      'static volatile uint32_t _audioDownbeatCount = 0, _audioDropCount = 0;',
      'static uint32_t _audioDownbeatSeen = 0, _audioDropSeen = 0;',
    ] : []),
    ...(f.pitch ? ['#include "fl/audio/detector/key.h"', ...pitchGlobalsCpp()] : []),
    ...(f.waveform ? [`float _audioWave[${WAVE_SAMPLES}] = {0};`] : []),
  ]
}

/** Feature step functions; emit after `_audioProcessor` is declared.
 *  `sample` yields the chunk Pitch and Waveform read (see pitchHelperCpp). */
export function audioFeatureHelpersCpp(f: AudioFeatures, sample = '_audioProcessor->getSample()'): string[] {
  return [
    ...(f.pitch ? ['', ...pitchHelperCpp(sample)] : []),
    ...(f.waveform ? ['', ...waveformHelperCpp(sample)] : []),
  ]
}

/** Detector registration and callbacks, inside setup once `_audioProcessor` exists. */
export function audioFeatureSetupCpp(f: AudioFeatures): string[] {
  return [
    ...(f.vibe ? ['  (void)_audioProcessor->getVibeBass();'] : []),
    ...(f.structure ? [
      '  _audioProcessor->onDownbeat([] { _audioDownbeatCount = _audioDownbeatCount + 1; });',
      '  _audioProcessor->onBuildupStart([] { _audioBuilding = true; });',
      '  _audioProcessor->onBuildupEnd([] { _audioBuilding = false; });',
      '  _audioProcessor->onDrop([] { _audioDropCount = _audioDropCount + 1; });',
      '  _audioProcessor->onTempoStable([] { _audioTempoStable = true; });',
      '  _audioProcessor->onTempoUnstable([] { _audioTempoStable = false; });',
      '  (void)_audioProcessor->getMoodValence();',
    ] : []),
    ...(f.pitch ? [
      '  _audioProcessor->onKey([](const fl::audio::detector::Key& key) {',
      '    _audioKeyRoot = key.rootNote; _audioKeyMinor = key.isMinor; _audioKeyConf = key.confidence;',
      '  });',
      '  _audioProcessor->onKeyEnd([] { _audioKeyRoot = 0; _audioKeyMinor = false; _audioKeyConf = 0.0f; });',
    ] : []),
  ]
}

/** Return every feature to silence while no audio reaches the processor. */
export function audioFeatureResetCpp(f: AudioFeatures, indent = '    '): string[] {
  return [
    ...(f.vibe ? [
      `${VIBE_LEVELS.map(([name]) => `_audioVibe${name}`).join(' = ')} = 0.0f;`,
      `${VIBE_SPIKES.map(([name]) => `_audioVibe${name}`).join(' = ')} = false;`,
    ] : []),
    ...(f.structure ? [
      '_audioDownbeat = _audioBuilding = _audioDrop = _audioTempoStable = false;',
      '_audioMeasurePhase = _audioBuildupProgress = _audioDropImpact = _audioValence = _audioArousal = 0.0f;',
      '_audioBeatNumber = 0;',
    ] : []),
    ...(f.waveform ? [`for (int i = 0; i < ${WAVE_SAMPLES}; ++i) _audioWave[i] = 0.0f;`] : []),
    ...(f.pitch ? ['_audioPitchClear();', '_audioKeyRoot = 0; _audioKeyMinor = false; _audioKeyConf = 0.0f;'] : []),
  ].map((line) => indent + line)
}

/** Poll every feature from the processor, after it has consumed this loop's audio. */
export function audioFeatureUpdateCpp(f: AudioFeatures): string[] {
  return [...audioFeatureReadCpp(f), ...audioFeatureEdgesCpp(f)]
}

/** The feature values read straight off the processor. A host whose processor
 *  runs in another task calls these there, right after each update. */
export function audioFeatureReadCpp(f: AudioFeatures): string[] {
  return [
    ...(f.vibe ? [
      ...VIBE_LEVELS.map(([name, getter]) => `  _audioVibe${name} = _audioProcessor->${getter}();`),
      ...VIBE_SPIKES.map(([name, getter]) => `  _audioVibe${name} = _audioProcessor->${getter}();`),
    ] : []),
    ...(f.structure ? [
      '  _audioMeasurePhase = _audioProcessor->getMeasurePhase();',
      '  _audioBeatNumber = _audioProcessor->getCurrentBeatNumber();',
      '  _audioBuildupProgress = _audioProcessor->getBuildupProgress();',
      '  _audioDropImpact = _audioProcessor->getDropImpact();',
      '  _audioValence = _audioProcessor->getMoodValence();',
      '  _audioArousal = _audioProcessor->getMoodArousal();',
    ] : []),
  ]
}

/** The once-a-frame events: the callbacks' counters become one-frame flags,
 *  and Pitch and Waveform step on the newest chunk. Always in the loop, so a
 *  frame sees every event exactly once. */
export function audioFeatureEdgesCpp(f: AudioFeatures): string[] {
  return [
    ...(f.structure ? [
      '  uint32_t downbeatCount = _audioDownbeatCount, dropCount = _audioDropCount;',
      '  _audioDownbeat = downbeatCount != _audioDownbeatSeen;',
      '  _audioDrop = dropCount != _audioDropSeen;',
      '  _audioDownbeatSeen = downbeatCount;',
      '  _audioDropSeen = dropCount;',
    ] : []),
    ...(f.pitch ? ['  _audioPitchStep();'] : []),
    ...(f.waveform ? ['  _audioWaveStep();'] : []),
  ]
}

// FastLED 3.10.3+ owns the live I2S microphone pipeline: capture, signal
// conditioning, shared FFT, adaptive frequency-band normalization, equalizer,
// and beat detection. Studio keeps the small _audio* global interface used by
// generated nodes and controller sketches, but no longer emits a second I2S
// driver or a parallel FFT implementation.
//
// The SD-card player does not use this block: its decoder tap hosts its own
// processor and shares the optional-detector helpers above.
function audioEngineCpp(
  backend: MicFirmwareBackend,
  ws: number,
  sck: number,
  sd: number,
  channel: 'Left' | 'Right' | 'Both',
  gain: number,
  noiseGate: number,
  serialDebug = false,
  source: 'microphone' | 'line-in' = 'microphone',
  mclk = -1,
  micModule: MicModule | null = null,
  vibe = false,
  structure = false,
  pitch = false,
  waveform = false,
  loudness = false,
  switched: CaptureSwitch | null = null,
): string[] {
  const audioChannel = channel === 'Right'
    ? 'fl::audio::AudioChannel::Right'
    : channel === 'Both'
      ? 'fl::audio::AudioChannel::Both'
      : 'fl::audio::AudioChannel::Left'
  const sph0645 = source === 'microphone' && micModule?.capture === 'sph0645-classic-esp32'
  const captureAdapter = switched
    ? switched.sources.flatMap((entry) => entry.globals)
    : source === 'line-in'
    ? pcm1802CaptureAdapterCpp(channel)
    : sph0645
      ? sph0645CaptureAdapterCpp(channel === 'Right' ? 'Right' : 'Left')
      : audioCaptureAdapterCpp(backend, channel === 'Both' ? 'Left' : channel)
  const lineInLevels = switched ? switched.sources.some((entry) => entry.lineIn) : source === 'line-in'
  const createInput = switched
    ? [
        '  // Every source on the bench is opened, each on its own I2S port, and',
        '  // one Processor hears whichever is active (state/audio/audioSourceSwitch.ts).',
        ...switched.sources.map((entry, index) => `  _audioCapture[${index}] = ${entry.createExpr};`),
        `  for (int i = 0; i < AUDIO_SOURCE_COUNT; ++i) if (_audioCapture[i]) _audioCapture[i]->start();`,
        '  _audioProcessor = fl::make_shared<fl::audio::Processor>();',
      ]
    : source === 'line-in'
    ? [
        '  _lineInput = fl::make_shared<StudioPcm1802Input>();',
        '  _audioProcessor = FastLED.add(_lineInput);',
      ]
    : sph0645
    ? ['  _audioProcessor = FastLED.add(fl::make_shared<StudioSph0645Input>());']
    : backend === 'fastled-esp32'
    ? [`  auto config = fl::audio::Config::${micModule?.factory}(MIC_WS, MIC_SD, MIC_SCK, ${audioChannel});`, '  _audioProcessor = FastLED.add(config);']
    : backend === 'fastled-teensy'
      ? [`  auto config = fl::audio::Config::CreateTeensyI2S(fl::audio::TeensyI2S::I2SPort::I2S1, ${audioChannel}, 44100, 16, fl::audio::MicProfile::${micModule?.profile});`, '  _audioProcessor = FastLED.add(config);']
      : ['  _audioProcessor = FastLED.add(fl::make_shared<StudioI2sMicInput>());']
  // Only FastLED's own two capture paths take a MicProfile. The hand-written
  // wrapper below is plain I2S with nowhere to hand one, so on those boards
  // choosing a different module changes the wiring picture and the name and
  // nothing in the signal — said here rather than left to be discovered by
  // comparing two sketches.
  const features: AudioFeatures = { vibe, structure, pitch, waveform, loudness }
  const profileApplies = (backend === 'fastled-esp32' || backend === 'fastled-teensy') && !sph0645
  return [
    `// ── FastLED ${switched ? 'switchable' : source === 'line-in' ? 'PCM1802 line-in' : micModule?.label} audio reactivity ─────────────────────────────────`,
    ...(source === 'microphone' && !profileApplies && !switched
      ? [`// This capture backend applies no mic response profile, so the ${micModule?.label}`,
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
    ...(features.loudness ? [
      '// Audio Features\' Loudness: the conditioned chunk\'s RMS on the VU meter scale',
      '// (audio/stereoLevels.ts), unlike the peak-normalised bands and spectrum.',
      'float _audioLoudness = 0.0f;',
    ] : []),
    'bool  _audioBeat = false;',
    '// Confidence of FastLED\'s latest beat (0-1); Beat Detect gates on it.',
    'float _audioBeatConfidence = 0.0f;',
    ...audioFeatureGlobalsCpp(features),
    'static float _audioSpectrum[32];',
    ...(lineInLevels ? ['static fl::shared_ptr<StudioPcm1802Input> _lineInput;'] : []),
    'static fl::shared_ptr<fl::audio::Processor> _audioProcessor;',
    'static volatile uint32_t _audioBeatCount = 0;',
    'static uint32_t _audioBeatSeen = 0;',
    ...(switched ? [
      `#define AUDIO_SOURCE_COUNT ${switched.sources.length}`,
      'static fl::shared_ptr<fl::audio::IInput> _audioCapture[AUDIO_SOURCE_COUNT];',
      ...audioSourceStateCpp(switched.startIndex),
      ...audioSourceApplyCpp(switched.sources),
      ...(switched.drive === 'position' ? AUDIO_SOURCE_POSITION_CPP : []),
    ] : []),
    ...audioFeatureHelpersCpp(features),
    '',
    'void setupAudio() {',
    '#if MIC_DEBUG',
    '  Serial.begin(115200);',
    '#endif',
    ...createInput,
    '  if (!_audioProcessor) return;',
    ...(switched ? [
      '  _audioSourceApply(_audioSourceActive);',
      '  _audioSourceApplied = _audioSourceActive;',
    ] : ['  _audioProcessor->setGain(MIC_GAIN);']),
    ...(noiseGate === MIC_DEFAULTS.noiseGate || switched ? [] : [
      '  // Noise gate from the input node; FastLED applies it before MIC_GAIN.',
      '  fl::audio::SignalConditionerConfig conditioner;',
      `  conditioner.noiseGateOpenThreshold = ${noiseGate};`,
      `  conditioner.noiseGateCloseThreshold = ${noiseGateCloseThreshold(noiseGate)};`,
      '  _audioProcessor->configureSignalConditioner(conditioner);',
    ]),
    '  _audioProcessor->onBeat([] { _audioBeatCount = _audioBeatCount + 1; });',
    '  // Processor detectors are lazy. Register every detector whose values the',
    '  // generated graph polls before the auto-pumped input processes its first block.',
    '  (void)_audioProcessor->getBassLevel();',
    '  (void)_audioProcessor->getMidLevel();',
    '  (void)_audioProcessor->getTrebleLevel();',
    '  (void)_audioProcessor->getBPM();',
    '  (void)_audioProcessor->getEqBin(0);',
    ...audioFeatureSetupCpp(features),
    '}',
    '',
    'void updateAudio() {',
    '  if (!_audioProcessor) {',
    '    _audioBass = _audioMids = _audioTreble = 0.0f;',
    '    _audioLeftLevel = _audioRightLevel = 0.0f;',
    ...(features.loudness ? ['    _audioLoudness = 0.0f;'] : []),
    '    _audioBeat = false;',
    '    _audioBeatConfidence = 0.0f;',
    ...audioFeatureResetCpp(features),
    '    for (int i = 0; i < 32; ++i) _audioSpectrum[i] = 0.0f;',
    '    return;',
    '  }',
    ...(switched ? [
      '  uint8_t source = _audioSourceActive;',
      '  if (source != _audioSourceApplied) {',
      '    _audioSourceApply(source);',
      '    _audioSourceApplied = source;',
      '  }',
      '  // Every input is drained each frame, so the one switched to next starts',
      '  // on fresh audio; only the active one reaches the processor.',
      '  for (int i = 0; i < AUDIO_SOURCE_COUNT; ++i) {',
      '    if (!_audioCapture[i]) continue;',
      '    for (int n = 0; n < 8; ++n) {',
      '      fl::audio::Sample sample = _audioCapture[i]->read();',
      '      if (!sample.isValid()) break;',
      '      if (i == source) _audioProcessor->update(sample);',
      '    }',
      '  }',
    ] : [
      '  // FastLED reads the capture input from a 1 ms scheduler task, and since',
      '  // 3.10.7 nothing in show() or its driver wait loops runs that scheduler.',
      '  // Without this pump the processor never sees a sample and every level',
      '  // below stays at zero, however loud the room is.',
      '  fl::task::run(0);',
    ]),
    '  _audioBass = _audioProcessor->getBassLevel();',
    '  _audioMids = _audioProcessor->getMidLevel();',
    '  _audioTreble = _audioProcessor->getTrebleLevel();',
    ...(switched && lineInLevels ? [
      `  if (_audioSourceKind[source] == AUDIO_SOURCE_LINE_IN) {`,
      '    _audioLeftLevel = _lineInput ? _lineInput->leftLevel() : 0.0f;',
      '    _audioRightLevel = _lineInput ? _lineInput->rightLevel() : 0.0f;',
      '  } else {',
      '    _audioLeftLevel = _audioRightLevel = max(_audioBass, max(_audioMids, _audioTreble));',
      '  }',
      ...(features.loudness ? ['  _audioLoudness = max(_audioLeftLevel, _audioRightLevel);'] : []),
    ] : source === 'line-in' && !switched ? [
      '  _audioLeftLevel = _lineInput ? _lineInput->leftLevel() : 0.0f;',
      '  _audioRightLevel = _lineInput ? _lineInput->rightLevel() : 0.0f;',
      ...(features.loudness ? ['  _audioLoudness = max(_audioLeftLevel, _audioRightLevel);'] : []),
    ] : [
      '  // A one-channel microphone intentionally drives both VU channels.',
      '  _audioLeftLevel = _audioRightLevel = max(_audioBass, max(_audioMids, _audioTreble));',
      ...(features.loudness ? [
        '  {',
        '    // The VU bands above adapt to their recent peak; Loudness is the',
        '    // gained chunk\'s RMS against the fixed meter reference instead.',
        '    const fl::audio::Sample& _chunk = _audioProcessor->getSample();',
        '    float _rms = _chunk.isValid() ? _chunk.rms() / 32768.0f : 0.0f;',
        `    float _level = (_rms - ${VU_RMS_NOISE_GATE}f) / (${VU_RMS_REFERENCE}f - ${VU_RMS_NOISE_GATE}f);`,
        '    _audioLoudness = _level <= 0.0f ? 0.0f : (_level >= 1.0f ? 1.0f : _level);',
        '  }',
      ] : []),
    ]),
    '  _audioBpm = _audioProcessor->getBPM();',
    ...audioFeatureUpdateCpp(features),
    '  uint32_t beatCount = _audioBeatCount;',
    '  _audioBeat = beatCount != _audioBeatSeen;',
    '  _audioBeatSeen = beatCount;',
    '  _audioBeatConfidence = _audioProcessor->getBeatConfidence();',
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
    ...(vibe ? [
      '    Serial.printf("vibe bass=%.2f mid=%.2f treble=%.2f spikes=%d%d%d\\n",',
      '                  _audioVibeBass, _audioVibeMid, _audioVibeTreble,',
      '                  (int)_audioVibeBassSpike, (int)_audioVibeMidSpike, (int)_audioVibeTrebleSpike);',
    ] : []),
    ...(structure ? [
      '    Serial.printf("structure beat=%d phase=%.2f building=%d progress=%.2f drop=%d impact=%.2f stable=%d valence=%.2f arousal=%.2f\\n",',
      '                  _audioBeatNumber, _audioMeasurePhase, (int)_audioBuilding, _audioBuildupProgress,',
      '                  (int)_audioDrop, _audioDropImpact, (int)_audioTempoStable, _audioValence, _audioArousal);',
    ] : []),
    ...(pitch ? [
      '    Serial.printf("pitch hz=%.1f note=%d conf=%.2f velocity=%.2f key=%d%s keyconf=%.2f\\n",',
      '                  _audioPitchHz, _audioPitchNote, _audioPitchConf, _audioPitchVelocity,',
      '                  _audioKeyRoot, _audioKeyMinor ? "m" : "", _audioKeyConf);',
    ] : []),
    ...(waveform ? [
      `    { float lo = 0.0f, hi = 0.0f; for (int i = 0; i < ${WAVE_SAMPLES}; ++i) { if (_audioWave[i] < lo) lo = _audioWave[i]; if (_audioWave[i] > hi) hi = _audioWave[i]; }`,
      '      Serial.printf("wave min=%.2f max=%.2f\\n", lo, hi); }',
    ] : []),
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
 * FastLED 3.10.9's ESP32 driver always configures Philips, ignores the
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
  groups: GroupRegistry = {},
  edges: readonly StudioEdge[] = [],
): { include: string; code: string[]; fqbn: string; backend: MicFirmwareBackend; switched?: CaptureSwitch } | null {
  const capabilitySource = nodes
    .filter((node) => node.data.nodeType === 'Audio')
    .map((node) => resolveAudioCapabilitySource(capabilityNodes, (node.data.properties as Record<string, unknown>).sourceId)?.node)
    .find((node) => node?.data.nodeType === 'MicInput' || node?.data.nodeType === 'LineInput')
  const sourceNode = capabilitySource
  // The Board node is the sole target authority. MatrixOutput's legacy board
  // field and the upload store are intentionally not consulted here.
  const fqbn = micFqbnForBoardProfile(selectedPhysicalBoardProfile(capabilityNodes))
  const backend = fqbn ? micFirmwareBackendForBoard(fqbn) : undefined
  if (!fqbn || !backend) return null
  // A wired Source switch between two capture parts opens both.
  const switched = captureSwitchForGraph(nodes, capabilityNodes, edges, fqbn)
  if (switched) {
    const adapterSource = switched.sources.find((source) => source.pins)
    const adapter = adapterSource?.pins
    const includes = [...new Set(switched.sources.flatMap((source) => source.include))]
    return {
      include: ['// Switchable capture: every source on the bench feeds one FastLED Processor in turn.', ...includes].join('\n'),
      code: audioEngineCpp(
        backend, adapter?.ws ?? -1, adapter?.sck ?? -1, adapter?.sd ?? -1, 'Left',
        adapterSource?.gain ?? MIC_DEFAULTS.gain, MIC_DEFAULTS.noiseGate,
        switched.serialDebug,
        'microphone', adapter?.mclk ?? -1, null,
        graphUsesVibe(nodes, groups), graphUsesSongStructure(nodes, groups), graphUsesPitch(nodes, groups),
        graphUsesWaveform(nodes, groups), graphUsesLoudness(nodes, edges, groups), switched,
      ),
      fqbn,
      backend,
      switched,
    }
  }
  if (!sourceNode) return null
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
  // A line input has no microphone module: the engine's microphone-only
  // branches are all guarded by `lineInput`, so none is passed.
  const micModule = lineInput ? null : micModuleFor(p.partId)
  if (!lineInput && !micModule) return null
  const savedChannel = String(p.channel ?? (lineInput ? 'Both' : 'Left'))
  const channel: 'Left' | 'Right' | 'Both' = savedChannel === 'Right'
    ? 'Right'
    : savedChannel === 'Both' && lineInput
      ? 'Both'
      : 'Left'
  return {
    include: [
      `// ${lineInput ? 'PCM1802 line-in' : micModule?.label} capture feeds the same FastLED Processor contract as preview.`,
      ...(lineInput || micModule?.capture === 'sph0645-classic-esp32' ? [
        '#include <esp_idf_version.h>',
        '#if ESP_IDF_VERSION_MAJOR >= 5',
        '#include <driver/i2s_std.h>',
        '#else',
        '#include <driver/i2s.h>',
        '#endif',
      ] : []),
      ...(micModule?.capture === 'sph0645-classic-esp32' && !lineInput ? [
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
      Math.round(fc(p.noiseGate, MIC_DEFAULTS.noiseGate, 0, MIC_MAX_NOISE_GATE)),
      p.serialDebug === true,
      lineInput ? 'line-in' : 'microphone',
      lineInput ? sanitizePin(p.i2sMclk, 14) : -1,
      micModule,
      graphUsesVibe(nodes, groups),
      graphUsesSongStructure(nodes, groups),
      graphUsesPitch(nodes, groups),
      graphUsesWaveform(nodes, groups),
      graphUsesLoudness(nodes, edges, groups),
    ),
    fqbn,
    backend,
  }
}

// ── Runtime source switch ─────────────────────────────────────────────────────

/**
 * One capture source a switching sketch opens beside the others, each on its
 * own I2S port: the decoder's amplifier holds I2S0 in a player build, so a
 * microphone there takes I2S1; in a sketch the first source takes I2S0 and
 * the second I2S1. FastLED's microphone factories take the port; the app's
 * own adapters are rewritten onto it.
 */
export interface CaptureSwitchSource {
  kind: 'microphone' | 'line-in'
  /** File-scope code: the app's adapter class. */
  globals: string[]
  /** Driver headers the adapter needs. */
  include: string[]
  /** The `fl::shared_ptr<fl::audio::IInput>` for this source, created in setup. */
  createExpr: string
  gain: number
  noiseGate: number
  /** `fl::audio::MicProfile` member applied while this source is active. */
  profile: string
  /** The PCM1802 adapter, which meters its own stereo levels. */
  lineIn: boolean
  /** An adapter's pins, which the engine's MIC_* macros name. */
  pins?: { ws: number; sck: number; sd: number; mclk: number }
}

export interface CaptureSwitch {
  sources: CaptureSwitchSource[]
  startIndex: number
  /** How the wire drives it: a press steps on, a number picks by position. */
  drive: 'press' | 'position'
  /** Any of the parts asked for serial levels. */
  serialDebug: boolean
}

/** Move an adapter written for I2S0 onto another port; port 0 is left as written. */
function onI2sPort(lines: string[], port: number): string[] {
  if (port === 0) return lines
  return lines.map((line) => line.replace(/I2S_NUM_0/g, `I2S_NUM_${port}`).replace(/_REG\(0\)/g, `_REG(${port})`))
}

/**
 * The capture side of one MicInput or LineInput for a switching ESP32 sketch,
 * or null where it cannot be opened beside another source (not an ESP32, or a
 * part this board cannot read).
 */
export function captureSwitchSource(node: StudioNode, fqbn: string, port: number): CaptureSwitchSource | null {
  if (micFirmwareBackendForBoard(fqbn) !== 'fastled-esp32') return null
  const p = node.data.properties as Record<string, unknown>
  const fc = (v: unknown, d: number, min: number, max: number) => {
    const n = Number(v); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : d
  }
  const gain = fc(p.gain, MIC_DEFAULTS.gain, 0, MIC_MAX_GAIN)
  const noiseGate = Math.round(fc(p.noiseGate, MIC_DEFAULTS.noiseGate, 0, MIC_MAX_NOISE_GATE))
  const driverHeaders = ['#include <esp_idf_version.h>', '#if ESP_IDF_VERSION_MAJOR >= 5', '#include <driver/i2s_std.h>', '#else', '#include <driver/i2s.h>', '#endif']
  if (node.data.nodeType === 'LineInput') {
    if (!fqbn.startsWith('esp32:esp32:esp32s3')) return null
    const saved = String(p.channel ?? 'Both')
    const channel = saved === 'Left' || saved === 'Right' ? saved : 'Both'
    return {
      kind: 'line-in', include: driverHeaders,
      globals: onI2sPort(pcm1802CaptureAdapterCpp(channel), port),
      createExpr: '(_lineInput = fl::make_shared<StudioPcm1802Input>())',
      gain, noiseGate, profile: 'None', lineIn: true,
      pins: { ws: sanitizePin(p.i2sLrclk, 26), sck: sanitizePin(p.i2sBclk, 27), sd: sanitizePin(p.i2sDout, 25), mclk: sanitizePin(p.i2sMclk, 14) },
    }
  }
  if (node.data.nodeType !== 'MicInput' || !micSupportedForBoard(fqbn, p.partId)) return null
  const micModule = micModuleFor(p.partId)
  if (!micModule) return null
  const ws = sanitizePin(p.i2sWs, 39), sck = sanitizePin(p.i2sSck, 40), sd = sanitizePin(p.i2sSd, 41)
  const side = String(p.channel ?? 'Left') === 'Right' ? 'Right' : 'Left'
  if (micModule.capture === 'sph0645-classic-esp32') {
    return {
      kind: 'microphone', include: [...driverHeaders, '#include <soc/soc.h>', '#include <soc/i2s_reg.h>'],
      globals: onI2sPort(sph0645CaptureAdapterCpp(side), port),
      createExpr: 'fl::make_shared<StudioSph0645Input>()',
      gain, noiseGate, profile: 'None', lineIn: false,
      pins: { ws, sck, sd, mclk: -1 },
    }
  }
  if (!micModule.factory) return null
  return {
    kind: 'microphone', include: [], globals: [],
    createExpr: `fl::audio::IInput::create(fl::audio::Config::${micModule.factory}(${ws}, ${sd}, ${sck}, fl::audio::AudioChannel::${side}, 44100ul, ${port}))`,
    gain, noiseGate, profile: micModule.profile ?? 'None', lineIn: false,
  }
}

/**
 * The active source, written by whatever reads the Source input and read by
 * whatever feeds the processor. `_audioSourceApplied` belongs to the feeder:
 * the processor's settings change only where it runs.
 */
export function audioSourceStateCpp(startIndex: number): string[] {
  return [
    `static volatile uint8_t _audioSourceActive = ${startIndex};`,
    'static uint8_t _audioSourceApplied = 255;',
  ]
}

/** One source's settings, as `_audioSourceApply` needs them; the decoder takes FastLED's defaults. */
export interface AudioSourceSettings {
  kind: 'microphone' | 'line-in' | 'decoder'
  gain: number
  noiseGate: number
  profile: string
}

export const DECODER_SOURCE_SETTINGS: AudioSourceSettings = {
  kind: 'decoder', gain: 1, noiseGate: MIC_DEFAULTS.noiseGate, profile: 'None',
}

/**
 * `_audioSourceApply(i)`: hand the one shared Processor the gain, noise gate
 * and mic response of source `i`. The Processor is not reset: `reset()` drops
 * its detectors and the callbacks registered on them, and its adaptive levels
 * settle on the new source within a second anyway, as they do on a new song.
 */
export function audioSourceApplyCpp(sources: readonly AudioSourceSettings[]): string[] {
  const kindId = (kind: AudioSourceSettings['kind']) =>
    kind === 'line-in' ? 'AUDIO_SOURCE_LINE_IN' : kind === 'decoder' ? 'AUDIO_SOURCE_DECODER' : 'AUDIO_SOURCE_MIC'
  const label = (kind: AudioSourceSettings['kind']) =>
    kind === 'decoder' ? 'Audio Decoder' : kind === 'line-in' ? 'Line Input' : 'Microphone'
  return [
    'enum : uint8_t { AUDIO_SOURCE_MIC = 0, AUDIO_SOURCE_LINE_IN = 1, AUDIO_SOURCE_DECODER = 2 };',
    `static const uint8_t _audioSourceKind[${sources.length}] = {${sources.map((source) => kindId(source.kind)).join(', ')}};`,
    'static void _audioSourceApply(uint8_t source) {',
    '  if (!_audioProcessor) return;',
    '  fl::audio::SignalConditionerConfig conditioner;',
    '  switch (source) {',
    ...sources.flatMap((source, index) => [
      `    case ${index}:  // ${label(source.kind)}`,
      `      _audioProcessor->setGain(${source.gain.toFixed(3)}f);`,
      ...(source.noiseGate !== MIC_DEFAULTS.noiseGate ? [
        `      conditioner.noiseGateOpenThreshold = ${source.noiseGate};`,
        `      conditioner.noiseGateCloseThreshold = ${noiseGateCloseThreshold(source.noiseGate)};`,
      ] : []),
      `      _audioProcessor->setMicProfile(fl::audio::MicProfile::${source.profile});`,
      '      break;',
    ]),
    '    default: break;',
    '  }',
    '  _audioProcessor->configureSignalConditioner(conditioner);',
    '}',
  ]
}

/** The ESP32 boards whose two I2S controllers let two capture sources run at once. */
function hasTwoI2sPorts(fqbn: string): boolean {
  if (!fqbn.startsWith('esp32:esp32:')) return false
  return !/^esp32:esp32:esp32(?:s2|c\d|h\d)/.test(fqbn)
}

/**
 * The switch a sketch can host: two capture sources on an ESP32 with a port
 * for each, wired to the Audio node's Source input. Null otherwise, and the
 * sketch then listens to the body's choice alone; Checks says why.
 */
export function captureSwitchForGraph(
  nodes: readonly StudioNode[], capabilityNodes: readonly StudioNode[], edges: readonly StudioEdge[], fqbn: string,
): CaptureSwitch | null {
  const sw = audioSourceSwitchFor(nodes, edges, capabilityNodes)
  if (!sw || sw.sources.length !== 2 || sw.sources.some((source) => source.kind === 'decoder')) return null
  if (!hasTwoI2sPorts(fqbn)) return null
  const sources = sw.sources.map((source, index) => captureSwitchSource(source.node, fqbn, index))
  if (sources.some((source) => !source)) return null
  // One adapter at most: the MIC_* pin macros are shared.
  if (sources.filter((source) => source!.pins).length > 1) return null
  return {
    sources: sources as CaptureSwitchSource[],
    startIndex: sw.startIndex,
    drive: sw.drive,
    serialDebug: sw.sources.some((source) => source.node.data.properties.serialDebug === true),
  }
}

/**
 * The loop's read of the Source input, writing `_audioSourceActive`: a press
 * steps on once per press, debounced like a contact when it comes from one and
 * never repeating; a number selects on each change of position, and at boot.
 * The preview's twin is `stepAudioSourceSwitch`.
 */
export function audioSourceControlCpp(o: {
  drive: 'press' | 'position'; valueExpr: string; count: number; debounceMs: number
}): string[] {
  if (o.drive === 'press') {
    return [
      '  // Audio Source: each press steps to the next source on the bench.',
      '  { static bool _asRaw = false, _asStable = false; static uint32_t _asChanged = 0;',
      `    const bool _asIn = ${o.valueExpr}; const uint32_t _asNow = millis();`,
      '    if (_asIn != _asRaw) { _asRaw = _asIn; _asChanged = _asNow; }',
      `    if (_asStable != _asRaw && _asNow - _asChanged >= ${Math.round(o.debounceMs)}u) {`,
      '      _asStable = _asRaw;',
      `      if (_asStable) _audioSourceActive = (uint8_t)((_audioSourceActive + 1) % ${o.count});`,
      '    } }',
    ]
  }
  return [
    '  // Audio Source: the number picks a source by position, on each change.',
    `  { static int _asChosen = -1; const int _asPick = _audioSourcePosition((float)(${o.valueExpr}), ${o.count});`,
    '    if (_asPick != _asChosen) { _asChosen = _asPick; _audioSourceActive = (uint8_t)_asPick; } }',
  ]
}
