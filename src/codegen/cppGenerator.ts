import type { StudioNode, StudioEdge } from '../state/graphStore'
import type { GroupRegistry } from '../state/graphEvaluator'
import {
  BEAT_FLASH_ATTACK_MAX_SEC,
  VOCAL_AURORA_MAX_INPUT_GAIN,
  VOCAL_AURORA_MIN_INPUT_GAIN,
  GOLDEN_RATIO,
  LISSAJOUS_FIELD_SAMPLES,
  audioHueWeight,
  scheduleTimeOfDay,
} from '../state/graphEvaluator'
import {
  asFont, textBlockLayout, textAlignMode, textColumns, DEFAULT_FONT, FONT_H, FONT_W, TEXT_LINE_GAP,
} from '../state/font'
import { asAnimatedImage, asImage } from '../state/image'
import { imagePaletteStops16 } from '../state/imagePalette'
import { polineStops16, hexToRgb } from '../state/polinePalette'
import { customPaletteDeclarationsCpp, paletteCppRef, resolvePaletteId } from '../state/paletteCatalog'
import { audioFlowExpr } from '../state/audioFlowRange'
import { SPEED_MAX, SCALE_MAX, NOISE_SPEED_MAX, NOISE_SCALE_MAX, FORMULA_FIELD_SPEED_MAX, rateCpp } from '../state/speedRange'
import { denormalizeBeatParam, FLUX_GAIN } from '../audio/beatDetection'
import {
  MIC_DEFAULTS,
  MIC_MAX_GAIN,
} from '../audio/micAnalysis'
import { inputClampRange, bypassPort, CHIPSET_OPTIONS, COLOR_ORDER_OPTIONS, CORRECTION_OPTIONS, SPI_CHIPSETS, HUB75_CHIPSET, resolveNodeScalarExpressions } from '../state/nodeLibrary'
import { CPP_SHIM_HELPERS, cppRewriteShims, usesShims } from '../state/fastledShims'
import { isNodeFormulaValid } from '../state/formulaLang'
import { particleRadius } from '../state/particleScale'
import { buildXYTable, rotatePoint, tileRotationAt } from '../state/xyLayout'
import { customPaletteStops16, hexToRgb as customHexToRgb, normalizeCustomPalette, type RGB } from '../state/customPalette'
import { animartrixCppLines } from '../animartrix/codegen'
import { compositionDims, leadingOutputRoutes, outputMirrorLeaders, outputRoutes, ringMapFor } from '../state/outputRouting'
import { isLinearForm, outputCanvasDims, outputForm, outputLedTotal } from '../state/ledOutputForm'
import { getNetworkCredentials } from '../state/networkCredentials'
import { selectedPhysicalBoardProfile } from '../build/boardProfiles'
import {
  inmp441FirmwareBackendForBoard,
  inmp441FqbnForBoardProfile,
  type Inmp441FirmwareBackend,
} from '../state/micPinDefaults'
import { sanitizePin } from './hardwarePins'
import { resolveWireframeMesh, meshBoundingRadius, WIREFRAME_FIT_MARGIN, WIREFRAME_CAM_FAR, WIREFRAME_CAM_NEAR } from '../state/wireframeModel'

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_')
}

function seedProp(p: Record<string, unknown>): number {
  const n = Math.round(Number(p.seed ?? 0))
  return Number.isFinite(n) ? Math.max(0, n) >>> 0 : 0
}

function floatLit(value: number, digits = 4): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return '0.0f'
  if (Object.is(n, -0)) return '0.0f'
  if (Number.isInteger(n)) return `${n.toFixed(1)}f`
  return `${n.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '.0')}f`
}

// Circle's and ClockDisplay's `radius` were originally tuned as raw pixel
// counts against a 16x16 matrix (graphEvaluator.ts's DEFAULT_W/DEFAULT_H).
// scaleWithMatrix (opt-in per node) scales that radius proportionally by the
// target matrix's shorter side, using the WIDTH/HEIGHT *macro names* (not
// baked JS numbers) so it tracks the supersampled render resolution — mirrors
// graphEvaluator.ts's matrixSizeScale(); keep the reference size (16) in sync.
// Returns `radiusExpr` unchanged when the toggle is off, so existing sketches
// generate byte-identical code.
function withMatrixScale(radiusExpr: string, p: Record<string, unknown>): string {
  return p.scaleWithMatrix ? `${radiusExpr}*(min(WIDTH,HEIGHT)/16.0f)` : radiusExpr
}

// Fire/Fire2012 share these direction/turbulence/paletteMix/mirror/seed
// controls — mirrors graphEvaluator.ts's firePrimaryLen/fireSecondaryLen/
// fireToXY. The heat simulation always runs in a canonical [P][S] grid (P =
// distance from the flame base where sparks land, S = position across the
// flame's width). P/S are emitted as the `WIDTH`/`HEIGHT` *macro names*
// (never baked JS numbers) so the heat array's size tracks whatever those
// macros actually expand to — including the supersampled render resolution,
// which the raw `width`/`height` JS constants don't reflect. The mapping back
// to real (x, y) only happens once, in the final palette-sampling loop.
function fireGrid(direction: string): { P: string; S: string } {
  const vertical = direction !== 'left' && direction !== 'right'
  return { P: vertical ? 'HEIGHT' : 'WIDTH', S: vertical ? 'WIDTH' : 'HEIGHT' }
}
function fireXYExpr(direction: string, pExpr: string, sExpr: string): { x: string; y: string } {
  switch (direction) {
    case 'down':  return { x: sExpr, y: pExpr }
    case 'left':  return { x: `(WIDTH-1-(${pExpr}))`, y: sExpr }
    case 'right': return { x: pExpr, y: sExpr }
    case 'up':
    default:      return { x: sExpr, y: `(HEIGHT-1-(${pExpr}))` }
  }
}

/**
 * Expand every `Group` node into the graph in place: the group's subgraph nodes
 * are inlined (their ids prefixed with the group-instance path so repeated or
 * nested groups stay unique), the `GroupOutput` terminal is dropped, and the
 * group's external consumers are rewired to whatever fed that terminal. The
 * result is a flat graph the rest of the generator already understands.
 *
 * Edges into a Group are dropped (groups expose no inputs yet — ADR Phase 3),
 * and unknown or self-referential groups are skipped.
 */
function flattenGroups(
  nodes: StudioNode[],
  edges: StudioEdge[],
  groups: GroupRegistry,
  prefix = '',
  groupStack: ReadonlySet<string> = new Set(),
): { nodes: StudioNode[]; edges: StudioEdge[] } {
  const pid = (id: string) => prefix + id
  const nodeType = (n: StudioNode) => (n.data as { nodeType?: string }).nodeType
  const outNodes: StudioNode[] = []
  const outEdges: StudioEdge[] = []
  // Prefixed Group-node id → the flattened source that fed its GroupOutput.
  const terminalFor = new Map<string, { id: string; port: string }>()
  // Prefixed Group-node id → (paramId → internal consumers of that GroupInput).
  const paramConsumers = new Map<string, Map<string, { id: string; port: string }[]>>()

  for (const n of nodes) {
    if (nodeType(n) === 'Group') {
      const groupId = (n.data.properties as { groupId?: string })?.groupId
      if (!groupId || !groups[groupId] || groupStack.has(groupId)) continue
      const sub = groups[groupId]
      const flat = flattenGroups(sub.nodes, sub.edges, groups, `${pid(n.id)}__`, new Set([...groupStack, groupId]))

      const out = flat.nodes.find((x) => nodeType(x) === 'GroupOutput')
      if (out) {
        const fed = flat.edges.find((e) => e.target === out.id && e.targetHandle === 'frame')
        if (fed?.source && fed.sourceHandle) terminalFor.set(pid(n.id), { id: fed.source, port: fed.sourceHandle })
      }

      // Record each GroupInput's downstream consumers so the boundary edge that
      // feeds this group's param can be wired straight to them.
      const giNodes = flat.nodes.filter((x) => nodeType(x) === 'GroupInput')
      const giIds = new Set(giNodes.map((x) => x.id))
      const consumers = new Map<string, { id: string; port: string }[]>()
      for (const gi of giNodes) {
        const paramId = (gi.data.properties as { paramId?: string })?.paramId ?? ''
        consumers.set(paramId, flat.edges
          .filter((e) => e.source === gi.id && e.target && e.targetHandle)
          .map((e) => ({ id: e.target!, port: e.targetHandle! })))
      }
      paramConsumers.set(pid(n.id), consumers)

      for (const x of flat.nodes) if (nodeType(x) !== 'GroupOutput' && nodeType(x) !== 'GroupInput') outNodes.push(x)
      for (const e of flat.edges) if (!(out && e.target === out.id) && !giIds.has(e.source!)) outEdges.push(e)
    } else {
      outNodes.push({ ...n, id: pid(n.id) })
    }
  }

  const isGroup = (id?: string | null) =>
    nodes.some((n) => n.id === id && nodeType(n) === 'Group')

  for (const e of edges) {
    if (!e.source || !e.target) continue
    // Resolve the source through a group's GroupOutput terminal if needed.
    const term = terminalFor.get(pid(e.source))
    const srcId = term ? term.id : pid(e.source)
    const srcPort = term ? term.port : e.sourceHandle

    if (isGroup(e.target)) {
      // Boundary edge into a group param → wire the source to each consumer of
      // the matching GroupInput inside the (now-inlined) subgraph.
      const cons = paramConsumers.get(pid(e.target))?.get(e.targetHandle ?? '') ?? []
      for (const c of cons) {
        outEdges.push({
          id: pid(`${e.id ?? `${e.source}-${e.target}`}-${c.id}`),
          source: srcId, sourceHandle: srcPort, target: c.id, targetHandle: c.port,
        } as StudioEdge)
      }
      continue
    }

    outEdges.push({
      ...e,
      id: pid(e.id ?? `${e.source}-${e.target}`),
      source: srcId,
      sourceHandle: srcPort,
      target: pid(e.target),
      targetHandle: e.targetHandle,
    } as StudioEdge)
  }

  return { nodes: outNodes, edges: outEdges }
}

/** Topological sort: dependencies before dependents */
function topoSort(nodes: StudioNode[], edges: StudioEdge[]): StudioNode[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const parents = new Map<string, string[]>()
  for (const n of nodes) parents.set(n.id, [])
  for (const e of edges) {
    if (e.source && e.target) parents.get(e.target)?.push(e.source)
  }

  const visited = new Set<string>()
  const result: StudioNode[] = []

  function visit(id: string) {
    if (visited.has(id)) return
    visited.add(id)
    for (const p of parents.get(id) ?? []) visit(p)
    const n = nodeMap.get(id)
    if (n) result.push(n)
  }

  for (const n of nodes) visit(n.id)
  return result
}

// FastLED 3.10.3+ owns the live INMP441 pipeline: capture, signal
// conditioning, shared FFT, adaptive frequency-band normalization, equalizer,
// and beat detection. Studio keeps the small _audio* global interface used by
// generated nodes and controller sketches, but no longer emits a second I2S
// driver or a parallel FFT implementation.
//
// The SD-card player intentionally does not use this block: it supplies the
// same globals from its baked song envelope.
function audioEngineCpp(
  backend: Inmp441FirmwareBackend,
  ws: number,
  sck: number,
  sd: number,
  channel: 'Left' | 'Right',
  gain: number,
  serialDebug = false,
): string[] {
  const audioChannel = channel === 'Right'
    ? 'fl::audio::AudioChannel::Right'
    : 'fl::audio::AudioChannel::Left'
  const captureAdapter = audioCaptureAdapterCpp(backend, channel)
  const createInput = backend === 'fastled-esp32'
    ? [`  auto config = fl::audio::Config::CreateInmp441(MIC_WS, MIC_SD, MIC_SCK, ${audioChannel});`, '  _audioProcessor = FastLED.add(config);']
    : backend === 'fastled-teensy'
      ? [`  auto config = fl::audio::Config::CreateTeensyI2S(fl::audio::TeensyI2S::I2SPort::I2S1, ${audioChannel}, 44100, 16, fl::audio::MicProfile::INMP441);`, '  _audioProcessor = FastLED.add(config);']
      : ['  _audioProcessor = FastLED.add(fl::make_shared<StudioInmp441Input>());']
  return [
    '// ── FastLED INMP441 audio reactivity ───────────────────────────────────────',
    `#define MIC_WS    ${ws}`,
    `#define MIC_SCK   ${sck}`,
    `#define MIC_SD    ${sd}`,
    `#define MIC_GAIN  ${gain.toFixed(3)}f`,
    `#define MIC_DEBUG ${serialDebug ? 1 : 0}   // print FastLED processor levels (~10×/sec)`,
    ...captureAdapter,
    'float _audioBass = 0, _audioMids = 0, _audioTreble = 0, _audioBpm = 120;',
    'bool  _audioBeat = false;',
    'static float _audioSpectrum[32];',
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
    '    _audioBeat = false;',
    '    for (int i = 0; i < 32; ++i) _audioSpectrum[i] = 0.0f;',
    '    return;',
    '  }',
    '  _audioBass = _audioProcessor->getBassLevel();',
    '  _audioMids = _audioProcessor->getMidLevel();',
    '  _audioTreble = _audioProcessor->getTrebleLevel();',
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
    '  }',
    '#endif',
    '}',
  ]
}

function audioCaptureAdapterCpp(
  backend: Inmp441FirmwareBackend,
  channel: 'Left' | 'Right',
): string[] {
  if (backend === 'fastled-esp32' || backend === 'fastled-teensy') return []
  const side = channel === 'Right' ? 'right' : 'left'

  if (backend === 'pico-i2s') {
    return [
      '',
      '// Earle Philhower RP2040/RP2350 PIO-I2S -> FastLED PCM adapter.',
      'class StudioInmp441Input final : public fl::audio::IInput {',
      ' public:',
      '  StudioInmp441Input() : _i2s(INPUT) {}',
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
      'class StudioInmp441Input final : public fl::audio::IInput {',
      ' public:',
      '  StudioInmp441Input() : _i2s(MIC_WS, MIC_SCK, PIN_I2S_SD, MIC_SD) {}',
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
    'class StudioInmp441Input final : public fl::audio::IInput {',
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

// ── Code generator ────────────────────────────────────────────────────────────

// PSRAM buffer placement (ESP32 family only). When the MatrixOutput node's
// "Use PSRAM" toggle is on, the per-node render buffers — the dominant static
// RAM cost, one CRGB/float buffer per frame/field node — are declared as
// pointers and allocated from external PSRAM in setup() instead of landing in
// the (small, fixed) internal `.bss` segment. `leds` itself deliberately stays
// a static internal-RAM array: FastLED's ESP32 drivers read it from ISR/DMA
// context, where PSRAM access can fault while the flash cache is disabled.
// `_psAlloc` falls back to the internal heap when the module has no PSRAM (or
// the build didn't enable it), so the sketch still runs — just without the
// RAM relief.
export const PSRAM_ALLOC_CPP = [
  '// Allocate a render buffer in external PSRAM when present; falls back to the',
  '// internal heap, and halts (rather than crashing on a null write) if neither',
  '// has room.',
  'void* _psAlloc(size_t n) {',
  '  void* p = psramFound() ? ps_malloc(n) : nullptr;',
  '  if (!p) p = malloc(n);',
  '  if (!p) { for (;;) delay(1000); }  // out of memory',
  '  memset(p, 0, n);',
  '  return p;',
  '}',
].join('\n')

/** Convert a static render-buffer declaration (`CRGB name[NUM_LEDS];` or
 *  `float name[NUM_LEDS];`) into its PSRAM form: a null pointer declaration
 *  plus the matching `_psAlloc` line for setup(). Returns null for any other
 *  line. Shared with the show generator, which collects the same declarations
 *  from the per-pattern sub-sketches. */
export function psramBufferDecl(decl: string): { decl: string; alloc: string } | null {
  const m = decl.match(/^(CRGB|float) ([A-Za-z0-9_]+)\[NUM_LEDS\];/)
  if (!m) return null
  return {
    decl: `${m[1]}* ${m[2]} = nullptr;`,
    alloc: `  ${m[2]} = (${m[1]}*)_psAlloc(sizeof(${m[1]}) * NUM_LEDS);`,
  }
}

// ── LED hardware setup (MatrixOutput → FastLED init) ────────────────────────
// Shared by generateCpp, the show generator, and the music-sync player so all
// three sketches initialise the strip identically from the same MatrixOutput
// properties.

export interface LedHardware {
  chipset: string      // sanitised against CHIPSET_OPTIONS (interpolated into C++)
  colorOrder: string
  brightness: number   // FastLED.setBrightness, 0–255
  correction: string   // 'none' | a CORRECTION_OPTIONS constant
  dither: boolean      // false → setDither(DISABLE_DITHER)
  overclock: number    // 1 = stock; >1 → #define FASTLED_OVERCLOCK (clockless only)
  clockPin: number     // SPI chipsets only
}

/** Resolve + sanitise a MatrixOutput node's LED hardware properties. Enum-ish
 *  strings are validated against the nodeLibrary option lists (they end up in
 *  C++ template arguments), numerics clamped; missing values keep the exact
 *  pre-quick-wins behaviour (brightness 200, no correction, dither on). */
export function ledHardwareFromProps(p: Record<string, unknown>): LedHardware {
  const pick = (v: unknown, options: readonly string[], def: string) =>
    options.includes(String(v)) ? String(v) : def
  const num = (v: unknown, def: number, min: number, max: number) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def
  }
  return {
    // The form is what makes an output a scan panel; the chipset property is
    // only ever consulted for the addressable forms, so a HUB75 panel can never
    // be flashed as WS2812B because a stale chipset string disagreed with it.
    chipset:    outputForm(p) === 'hub75' ? HUB75_CHIPSET : pick(p.chipset, CHIPSET_OPTIONS, 'WS2812B'),
    colorOrder: pick(p.colorOrder, COLOR_ORDER_OPTIONS, 'GRB'),
    brightness: Math.round(num(p.brightness, 200, 0, 255)),
    correction: pick(p.correction, CORRECTION_OPTIONS, 'none'),
    dither:     p.dither !== false,
    overclock:  num(p.overclock, 1, 1, 2),
    clockPin:   sanitizePin(p.clockPin, 6),
  }
}

/** `#define FASTLED_OVERCLOCK …` lines — MUST be emitted before
 *  `#include <FastLED.h>`. Empty unless overclocking a clockless chipset. */
export function overclockDefineCpp(hw: LedHardware): string[] {
  if (hw.overclock <= 1.001 || SPI_CHIPSETS.has(hw.chipset)) return []
  return [
    `// Overclock clockless-chipset timing by ${hw.overclock}× (WS2812 usually`,
    `// tolerates up to ~1.25; back off if the strip glitches).`,
    `#define FASTLED_OVERCLOCK ${hw.overclock}`,
  ]
}

/** setup() lines initialising the strip: addLeds (SPI chipsets get the clock
 *  pin, SK6812-RGBW gets `.setRgbw()`), brightness, correction, dithering.
 *  Pass `brightness: null` to skip the setBrightness line (the music-sync
 *  player drives brightness from show events instead). */
export function fastledSetupCpp(
  hw: LedHardware,
  opts: { dataPinMacro?: string; clockPinMacro?: string; brightness?: number | null; ledCountMacro?: string; ledsName?: string; controllerName?: string } = {},
): string[] {
  const data = opts.dataPinMacro ?? 'DATA_PIN'
  const clock = opts.clockPinMacro ?? 'CLOCK_PIN'
  // Physical strip length — differs from the render buffer's NUM_LEDS when the
  // sketch supersamples (renders large, then downscales into `leds`).
  const count = opts.ledCountMacro ?? 'NUM_LEDS'
  const ledsName = opts.ledsName ?? 'leds'
  const chip = hw.chipset === 'SK6812-RGBW' ? 'SK6812' : hw.chipset
  const rgbw = hw.chipset === 'SK6812-RGBW' ? '.setRgbw(RgbwDefault())' : ''
  const pins = SPI_CHIPSETS.has(hw.chipset) ? `${data}, ${clock}` : data
  // FastLED's NEOPIXEL alias hardcodes GRB and takes no order template arg.
  const args = chip === 'NEOPIXEL' ? `${pins}` : `${pins}, ${hw.colorOrder}`
  const add = `FastLED.addLeds<${chip}, ${args}>(${ledsName}, ${count})${rgbw}`
  const lines = [opts.controllerName ? `  CLEDController& ${opts.controllerName} = ${add};` : `  ${add};`]
  const brightness = opts.brightness === undefined ? hw.brightness : opts.brightness
  if (brightness !== null) lines.push(`  FastLED.setBrightness(${brightness});`)
  const target = opts.controllerName ?? 'FastLED'
  if (hw.correction !== 'none') lines.push(`  ${target}.setCorrection(${hw.correction});`)
  if (!hw.dither) lines.push(`  ${target}.setDither(DISABLE_DITHER);`)
  return lines
}

// ── HUB75 hardware setup (MatrixOutput → ESP32-HUB75-MatrixPanel-DMA) ──────
// A HUB75 route (docs/development/design/hub75-output.md) has no FastLED
// driver — it's driven over its own 13-14 signal ribbon via a separate DMA
// library instead of FastLED's addLeds<>()/leds[]/show(). Scoped for now to a
// single Matrix Output route and no supersampling — see findHub75ConfigIssues
// in validateGraph.ts for the gate.

/** A folded 2D grid of chained panels (`layout: 'panels'`, `tilesY > 1`)
 *  needs the DMA library's `VirtualMatrixPanel_T` wrapper — the base
 *  `MatrixPanel_I2S_DMA` class can only address one row's worth of height
 *  (`mx_height`) directly, so a second row of panels has nowhere to go
 *  without it. `chainType` is a compile-time template parameter (an enum
 *  value baked into the generated source, not a runtime string) — one of
 *  the 8 real `PANEL_CHAIN_TYPE` values, verified against the vendored
 *  header (tag 3.0.14). Picked `CHAIN_TOP_LEFT_DOWN`/`_ZZ` as the best match
 *  for this app's existing row-major-from-top-left model (`tileSerpentine`
 *  → the `_ZZ` zigzag variant) — the class's own naming describes exactly
 *  that topology, but the precise row-to-DMA-offset direction inside its
 *  transform wasn't independently confirmed against real 2+ panel hardware
 *  (only against the source, which was ambiguous on this one point). May
 *  need revisiting once real multi-row hardware exists to test against. */
export interface Hub75VirtualGrid {
  rows: number
  cols: number
  chainType: string
}

export interface Hub75Hardware {
  panelResX: number
  panelResY: number
  chainLength: number
  virtualGrid: Hub75VirtualGrid | null
  // Logical (x, y) -> display-space (x, y) remap for per-panel tileRotations,
  // packed as y<<8 | x (MatrixOutput dimensions clamp to <=64).
  coordMap: number[] | null
  pins: {
    r1: number; g1: number; b1: number; r2: number; g2: number; b2: number
    a: number; b: number; c: number; d: number; e: number
    lat: number; oe: number; clk: number
  }
  colorDepthBits: number
  brightness: number
}

function hub75CoordMapFromProps(
  p: Record<string, unknown>,
  width: number,
  height: number,
  tilesX: number,
  tilesY: number,
): number[] | null {
  if (String(p.layout ?? 'matrix') !== 'panels') return null
  if (width % tilesX !== 0 || height % tilesY !== 0) return null
  const tileW = width / tilesX
  const tileH = height / tilesY
  const map = new Array<number>(width * height)
  let needsMap = false
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tx = Math.floor(x / tileW)
      const ty = Math.floor(y / tileH)
      const lx = x - tx * tileW
      const ly = y - ty * tileH
      const deg = tileRotationAt(p, ty * tilesX + tx)
      if (deg !== 0) needsMap = true
      const r = rotatePoint(lx, ly, tileW, tileH, deg)
      map[y * width + x] = ((ty * tileH + r.y) << 8) | (tx * tileW + r.x)
    }
  }
  return needsMap ? map : null
}

/** Resolve + sanitise a MatrixOutput node's HUB75 properties. `width`/`height`
 *  are the composed matrix's dimensions; for `layout: 'panels'`,
 *  `width`/`height` split evenly across `tilesX`×`tilesY` chained panels. A
 *  single row (`tilesY === 1`) needs no wrapper at all: the DMA library's base
 *  class already addresses that whole chain directly
 *  (`PIXELS_PER_ROW = mx_width * chain_length`). A folded 2D grid
 *  (`tilesY > 1`) uses `VirtualMatrixPanel_T` for the chain routing, and an
 *  optional coordMap handles this app's independent per-panel tileRotations on
 *  top of that virtual display. `hub75EPin` is only meaningful when
 *  `hub75WideScan` is on — the DMA library's own convention for "unused" is
 *  -1, matching its documented default pinout. Fallback pin numbers MUST
 *  match nodeLibrary.ts's MatrixOutput defaultProperties exactly (kept in
 *  sync by hand) — validateGraph.ts's collectPinUses reads the same library
 *  defaults to check pins that were never explicitly saved on an older node,
 *  so a mismatch here would let a codegen-only default escape validation
 *  again. Chosen as the exact intersection of valid, output-capable GPIOs
 *  across every `HUB75_SUPPORTED_FQBNS` board (ESP32/S2/S3) — see the
 *  comment on these defaults in nodeLibrary.ts for the full derivation and
 *  the GPIO0/CLK caveat. */
export function hub75HardwareFromProps(p: Record<string, unknown>, width: number, height: number): Hub75Hardware {
  const num = (v: unknown, def: number, min: number, max: number) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def
  }
  const wideScan = p.hub75WideScan === true
  const isPanels = String(p.layout ?? 'matrix') === 'panels'
  const tilesX = isPanels ? Math.max(1, Math.round(Number(p.tilesX ?? 1))) : 1
  const tilesY = isPanels ? Math.max(1, Math.round(Number(p.tilesY ?? 1))) : 1
  const chainLength = tilesX * tilesY
  const panelResX = tilesX > 1 ? Math.round(width / tilesX) : width
  const panelResY = tilesY > 1 ? Math.round(height / tilesY) : height
  const chainType = p.tileSerpentine === true ? 'CHAIN_TOP_LEFT_DOWN_ZZ' : 'CHAIN_TOP_LEFT_DOWN'
  return {
    panelResX,
    panelResY,
    chainLength,
    virtualGrid: tilesY > 1 ? { rows: tilesY, cols: tilesX, chainType } : null,
    coordMap: hub75CoordMapFromProps(p, width, height, tilesX, tilesY),
    pins: {
      r1: sanitizePin(p.hub75R1Pin, 1), g1: sanitizePin(p.hub75G1Pin, 2), b1: sanitizePin(p.hub75B1Pin, 3),
      r2: sanitizePin(p.hub75R2Pin, 4), g2: sanitizePin(p.hub75G2Pin, 5), b2: sanitizePin(p.hub75B2Pin, 12),
      a: sanitizePin(p.hub75APin, 13), b: sanitizePin(p.hub75BPin, 14), c: sanitizePin(p.hub75CPin, 15), d: sanitizePin(p.hub75DPin, 16),
      e: wideScan ? sanitizePin(p.hub75EPin, 33) : -1,
      lat: sanitizePin(p.hub75LatPin, 17), oe: sanitizePin(p.hub75OePin, 18), clk: sanitizePin(p.hub75ClkPin, 0),
    },
    colorDepthBits: Math.round(num(p.hub75ColorDepthBits, 8, 1, 8)),
    brightness: Math.round(num(p.brightness, 200, 0, 255)),
  }
}

/** `#include` lines a HUB75 sketch needs — the base header always, plus the
 *  VirtualMatrixPanel_T header when a 2D panel grid needs it. */
export function hub75IncludesCpp(hw: Hub75Hardware): string[] {
  return [
    '#include <ESP32-HUB75-MatrixPanel-I2S-DMA.h>',
    ...(hw.virtualGrid ? ['#include <ESP32-HUB75-VirtualMatrixPanel_T.hpp>'] : []),
  ]
}

/** Global-scope declarations for the display object(s) — the base DMA
 *  display always, plus the virtual-grid wrapper (templated on its chain
 *  type) when needed. */
export function hub75GlobalsCpp(hw: Hub75Hardware): string[] {
  return [
    'MatrixPanel_I2S_DMA *dma_display = nullptr;',
    ...(hw.virtualGrid ? [`VirtualMatrixPanel_T<${hw.virtualGrid.chainType}> *hub75Virtual = nullptr;`] : []),
    ...(hw.coordMap ? ['const uint16_t _hub75CoordMap[NUM_LEDS] PROGMEM = { ' + hw.coordMap.join(',') + ' };'] : []),
  ]
}

/** Which display object a per-pixel `drawPixelRGB888()` call should target —
 *  the virtual-grid wrapper when one exists (it re-maps into the base
 *  display internally), otherwise the base DMA display directly. */
export function hub75DisplayVar(hw: Hub75Hardware): string {
  return hw.virtualGrid ? 'hub75Virtual' : 'dma_display'
}

/** Emit the row-major CRGB -> HUB75 blit. When per-panel tileRotations are in
 *  play, `_hub75CoordMap` remaps each logical pixel into the correct panel-
 *  local rotated coordinate before handing it to the DMA display object. */
export function hub75BlitRowsCpp(hw: Hub75Hardware, srcExpr = 'leds[_y * WIDTH + _x]'): string[] {
  const display = hub75DisplayVar(hw)
  const lines = [
    '  for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {',
    `    CRGB _c = ${srcExpr};`,
  ]
  if (hw.coordMap) {
    lines.push(
      '    uint16_t _hub75XY = pgm_read_word(&_hub75CoordMap[_y * WIDTH + _x]);',
      `    ${display}->drawPixelRGB888(_hub75XY & 0xFF, _hub75XY >> 8, _c.r, _c.g, _c.b);`,
    )
  } else {
    lines.push(`    ${display}->drawPixelRGB888(_x, _y, _c.r, _c.g, _c.b);`)
  }
  lines.push('  }')
  return lines
}

/** setup() lines initialising the DMA display: pin struct, HUB75_I2S_CFG,
 *  MatrixPanel_I2S_DMA, begin(), brightness, an initial clear, and (for a 2D
 *  panel grid) the VirtualMatrixPanel_T wrapper — mirrors the example
 *  sketches bundled with ESP32-HUB75-MatrixPanel-DMA (verified against the
 *  vendored tag, 3.0.14). */
export function hub75SetupCpp(hw: Hub75Hardware): string[] {
  const p = hw.pins
  const lines = [
    `  HUB75_I2S_CFG::i2s_pins _hub75Pins = { ${p.r1}, ${p.g1}, ${p.b1}, ${p.r2}, ${p.g2}, ${p.b2}, ${p.a}, ${p.b}, ${p.c}, ${p.d}, ${p.e}, ${p.lat}, ${p.oe}, ${p.clk} };`,
    `  HUB75_I2S_CFG _hub75Cfg(${hw.panelResX}, ${hw.panelResY}, ${hw.chainLength}, _hub75Pins);`,
    `  _hub75Cfg.setPixelColorDepthBits(${hw.colorDepthBits});`,
    `  dma_display = new MatrixPanel_I2S_DMA(_hub75Cfg);`,
    `  dma_display->begin();`,
    `  dma_display->setBrightness8(${hw.brightness});`,
    `  dma_display->clearScreen();`,
  ]
  if (hw.virtualGrid) {
    lines.push(
      `  hub75Virtual = new VirtualMatrixPanel_T<${hw.virtualGrid.chainType}>(${hw.virtualGrid.rows}, ${hw.virtualGrid.cols}, ${hw.panelResX}, ${hw.panelResY});`,
      `  hub75Virtual->setDisplay(*dma_display);`,
    )
  }
  return lines
}

/**
 * The on-device FastLED audio processor for a graph that
 * contains a MicInput, so a *controller* sketch (e.g. the generative pattern
 * show) can host the engine once while the render functions it compiles from
 * subgraphs reference the `_audioBass`/`_audioMids`/`_audioTreble`/`_audioBeat`
 * globals. Returns null when the graph has no MicInput. Mirrors the block
 * generateCpp inlines for a mic-bearing single-pattern sketch.
 */
export function audioEngineForGraph(nodes: StudioNode[]): { preInclude: string[]; include: string; code: string[]; fqbn: string; backend: Inmp441FirmwareBackend } | null {
  const micNode = nodes.find((n) => n.data.nodeType === 'MicInput')
  if (!micNode) return null
  // The Board node is the sole target authority. MatrixOutput's legacy board
  // field and the upload store are intentionally not consulted here.
  const fqbn = inmp441FqbnForBoardProfile(selectedPhysicalBoardProfile(nodes))
  const backend = fqbn ? inmp441FirmwareBackendForBoard(fqbn) : undefined
  if (!fqbn || !backend) return null
  const p = micNode.data.properties as Record<string, unknown>
  const fc = (v: unknown, d: number, min: number, max: number) => {
    const n = Number(v); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : d
  }
  const channel: 'Left' | 'Right' = String(p.channel ?? 'Left') === 'Right' ? 'Right' : 'Left'
  return {
    // FastLED 3.10.5's SAMD ISR translation unit still names the SAMD21-style
    // PMUX/EIC symbols. Adafruit's SAMD51 CMSIS headers expose their equivalent
    // indexed forms; aliases here keep exported sketches compilable without
    // modifying the user's FastLED installation.
    preInclude: backend === 'samd51-zero-i2s' ? [
      '// The INMP441 + clockless LED path does not need SAMD hardware SPI.',
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
      `// INMP441 capture feeds the same FastLED Processor contract as preview.`,
      ...(backend === 'fastled-teensy' ? [
        `// Keep the build system's library scanner aware of PJRC Audio sources.`,
        `#include <Audio.h>`,
      ] : []),
      ...(backend === 'pico-i2s' ? [`#include <I2S.h>`] : []),
      ...(backend === 'samd51-zero-i2s' ? [`#include <Adafruit_ZeroI2S.h>`] : []),
    ].join('\n'),
    code: audioEngineCpp(
      backend,
      sanitizePin(p.i2sWs, 39), sanitizePin(p.i2sSck, 40), sanitizePin(p.i2sSd, 41), channel,
      fc(p.gain, MIC_DEFAULTS.gain, 0, MIC_MAX_GAIN),
      p.serialDebug === true,
    ),
    fqbn,
    backend,
  }
}

// Every character the Clock Display can print, in every mode (digits, the
// separators, and the AM/PM letters). Its glyph columns are pulled from the
// shared bitmap font when the sketch is generated.
const CLOCK_GLYPH_CHARS = '0123456789:.-AMP'

// Mirrors graphEvaluator's textAlignedStart/normalizedCenterAxis for the Text
// node's C++ codegen: 'center' keeps the existing centred formula (an object
// of half-extent `lengthExpr/2` sliding so its centre tracks `valueExpr`);
// 'start'/'end' instead anchor a zero-extent edge to `valueExpr`, matching
// the JS float-then-floor order exactly — floor happens before subtracting
// the (integer) length for 'end', not inside it, since hAlign/vAlign/wrap are
// static node properties (never wired), so the branch is resolved here at
// generation time rather than emitted as C++ conditionals.
function textAxisStartExpr(valueExpr: string, sizeVar: string, lengthExpr: string, align: 'start' | 'center' | 'end', wrap: boolean): string {
  if (align === 'center') {
    const half = `(${lengthExpr}) * 0.5f`
    if (wrap) {
      return `floorf((${sizeVar} * 0.5f - ${sizeVar}) + (${valueExpr}) * (${sizeVar} * 2.0f) - (${half}))`
    }
    return `floorf((0.5f - ((${half}) + 1.0f)) + (${valueExpr}) * ((${sizeVar} - 1.0f) + 2.0f * ((${half}) + 1.0f)) - (${half}))`
  }
  const edge = wrap
    ? `floorf((${sizeVar} * 0.5f - ${sizeVar}) + (${valueExpr}) * (${sizeVar} * 2.0f))`
    : `floorf((0.5f - 1.0f) + (${valueExpr}) * ((${sizeVar} - 1.0f) + 2.0f))`
  return align === 'end' ? `(${edge}) - (${lengthExpr})` : edge
}

function rtcHelperCpp(): string[] {
  return [
    '// ── RTC software clock helpers ────────────────────────────────────────────',
    'struct _RtcDateTime {',
    '  int16_t year;',
    '  uint8_t month, day, hour, minute, second, weekday;',
    '  bool valid;',
    '};',
    '',
    'bool _rtcLeap(int16_t year) {',
    '  return (year % 4 == 0) && ((year % 100 != 0) || (year % 400 == 0));',
    '}',
    '',
    'uint8_t _rtcDaysInMonth(int16_t year, uint8_t month) {',
    '  switch (month) {',
    '    case 2: return _rtcLeap(year) ? 29 : 28;',
    '    case 4: case 6: case 9: case 11: return 30;',
    '    default: return 31;',
    '  }',
    '}',
    '',
    'bool _rtcValidDateTime(int16_t year, uint8_t month, uint8_t day, uint8_t hour, uint8_t minute, uint8_t second) {',
    '  if (year < 1970 || year > 9999) return false;',
    '  if (month < 1 || month > 12) return false;',
    '  if (day < 1 || day > _rtcDaysInMonth(year, month)) return false;',
    '  if (hour > 23 || minute > 59 || second > 59) return false;',
    '  return true;',
    '}',
    '',
    'int32_t _rtcDaysFromCivil(int16_t year, uint8_t month, uint8_t day) {',
    '  year -= month <= 2;',
    '  const int32_t era = (year >= 0 ? year : year - 399) / 400;',
    '  const uint32_t yoe = (uint32_t)(year - era * 400);',
    '  const uint32_t shiftedMonth = (uint32_t)(month > 2 ? month - 3 : month + 9);',
    '  const uint32_t doy = (153u * shiftedMonth + 2u) / 5u + day - 1u;',
    '  const uint32_t doe = yoe * 365u + yoe / 4u - yoe / 100u + doy;',
    '  return era * 146097 + (int32_t)doe - 719468;',
    '}',
    '',
    'void _rtcCivilFromDays(int32_t z, int16_t &year, uint8_t &month, uint8_t &day) {',
    '  z += 719468;',
    '  const int32_t era = (z >= 0 ? z : z - 146096) / 146097;',
    '  const uint32_t doe = (uint32_t)(z - era * 146097);',
    '  const uint32_t yoe = (doe - doe / 1460u + doe / 36524u - doe / 146096u) / 365u;',
    '  year = (int16_t)(yoe + era * 400);',
    '  const uint32_t doy = doe - (365u * yoe + yoe / 4u - yoe / 100u);',
    '  const uint32_t mp = (5u * doy + 2u) / 153u;',
    '  day = (uint8_t)(doy - (153u * mp + 2u) / 5u + 1u);',
    '  month = (uint8_t)(mp < 10u ? mp + 3u : mp - 9u);',
    '  year += month <= 2;',
    '}',
    '',
    'uint8_t _rtcWeekdayFromDays(int32_t days) {',
    '  int32_t weekday = (days + 4) % 7;',
    '  if (weekday < 0) weekday += 7;',
    '  return (uint8_t)weekday;',
    '}',
    '',
    'uint8_t _rtcMonthFromBuildDate(const char *dateStr) {',
    "  switch (dateStr[0]) {",
    "    case 'J': return dateStr[1] == 'a' ? 1 : (dateStr[2] == 'n' ? 6 : 7);",
    "    case 'F': return 2;",
    "    case 'M': return dateStr[2] == 'r' ? 3 : 5;",
    "    case 'A': return dateStr[1] == 'p' ? 4 : 8;",
    "    case 'S': return 9;",
    "    case 'O': return 10;",
    "    case 'N': return 11;",
    "    case 'D': return 12;",
    "    default: return 0;",
    '  }',
    '}',
    '',
    'bool _rtcParseBuildStamp(const char *dateStr, const char *timeStr, _RtcDateTime &out) {',
    '  const uint8_t month = _rtcMonthFromBuildDate(dateStr);',
    "  const uint8_t day = (uint8_t)((dateStr[4] == ' ' ? 0 : (dateStr[4] - '0')) * 10 + (dateStr[5] - '0'));",
    "  const int16_t year = (int16_t)((dateStr[7] - '0') * 1000 + (dateStr[8] - '0') * 100 + (dateStr[9] - '0') * 10 + (dateStr[10] - '0'));",
    "  const uint8_t hour = (uint8_t)((timeStr[0] - '0') * 10 + (timeStr[1] - '0'));",
    "  const uint8_t minute = (uint8_t)((timeStr[3] - '0') * 10 + (timeStr[4] - '0'));",
    "  const uint8_t second = (uint8_t)((timeStr[6] - '0') * 10 + (timeStr[7] - '0'));",
    '  if (!_rtcValidDateTime(year, month, day, hour, minute, second)) { out.valid = false; return false; }',
    '  out.year = year;',
    '  out.month = month;',
    '  out.day = day;',
    '  out.hour = hour;',
    '  out.minute = minute;',
    '  out.second = second;',
    '  out.weekday = _rtcWeekdayFromDays(_rtcDaysFromCivil(year, month, day));',
    '  out.valid = true;',
    '  return true;',
    '}',
    '',
  ]
}

/** Minimal DS3231 reader built on Arduino Wire. Keeping the register decoder in
 * generated code avoids a third-party RTClib dependency and works with every
 * supported Arduino core's default I2C bus. */
function ds3231HelperCpp(): string[] {
  return [
    '// ── DS3231 hardware clock (I2C address 0x68) ─────────────────────────────',
    'uint8_t _rtcBcdToDec(uint8_t value) {',
    '  return (uint8_t)((value >> 4) * 10u + (value & 0x0fu));',
    '}',
    '',
    'bool _rtcReadDs3231(_RtcDateTime &out, bool &oscillatorStopped) {',
    '  Wire.beginTransmission(0x68);',
    '  Wire.write((uint8_t)0x00);',
    '  if (Wire.endTransmission() != 0) return false;',
    '  if (Wire.requestFrom((uint8_t)0x68, (uint8_t)7) != 7) return false;',
    '  const uint8_t rawSecond = Wire.read();',
    '  const uint8_t rawMinute = Wire.read();',
    '  const uint8_t rawHour = Wire.read();',
    '  Wire.read();  // chip day-of-week; derive it from the validated date below',
    '  const uint8_t rawDay = Wire.read();',
    '  const uint8_t rawMonth = Wire.read();',
    '  const uint8_t rawYear = Wire.read();',
    '',
    '  uint8_t hour;',
    '  if (rawHour & 0x40u) {',
    '    hour = _rtcBcdToDec(rawHour & 0x1fu);',
    '    if (hour == 12u) hour = 0u;',
    '    if (rawHour & 0x20u) hour = (uint8_t)(hour + 12u);',
    '  } else {',
    '    hour = _rtcBcdToDec(rawHour & 0x3fu);',
    '  }',
    '  const uint8_t month = _rtcBcdToDec(rawMonth & 0x1fu);',
    '  const int16_t year = (int16_t)(2000 + _rtcBcdToDec(rawYear) + ((rawMonth & 0x80u) ? 100 : 0));',
    '  const uint8_t day = _rtcBcdToDec(rawDay & 0x3fu);',
    '  const uint8_t minute = _rtcBcdToDec(rawMinute & 0x7fu);',
    '  const uint8_t second = _rtcBcdToDec(rawSecond & 0x7fu);',
    '  if (!_rtcValidDateTime(year, month, day, hour, minute, second)) return false;',
    '',
    '  out.year = year; out.month = month; out.day = day;',
    '  out.hour = hour; out.minute = minute; out.second = second;',
    '  out.weekday = _rtcWeekdayFromDays(_rtcDaysFromCivil(year, month, day));',
    '  out.valid = true;',
    '',
    '  // OSF (status bit 7) means the oscillator stopped and the stored time may',
    '  // be wrong. A status-register read failure also leaves the sample stale.',
    '  oscillatorStopped = true;',
    '  Wire.beginTransmission(0x68);',
    '  Wire.write((uint8_t)0x0f);',
    '  if (Wire.endTransmission() == 0 && Wire.requestFrom((uint8_t)0x68, (uint8_t)1) == 1) {',
    '    oscillatorStopped = (Wire.read() & 0x80u) != 0;',
    '  }',
    '  return true;',
    '}',
    '',
  ]
}

/** Free text made safe to drop into a `//` comment.
 *
 *  A newline would end the comment and turn the remainder of the value into
 *  code. Nothing can currently smuggle one in — `normalizeLoadedGraph` resets
 *  every library node's label from `NODE_LIBRARY` on load, and there is no
 *  in-session rename — but that invariant lives in the graph store, far from
 *  the generator that depends on it, and is enforced by code with no idea
 *  codegen relies on it. Escaping here keeps it an incidental fact rather than
 *  a load-bearing one, so adding node renaming later can't quietly turn an
 *  imported project's label into an injection point in exported firmware. */
export function cppComment(value: unknown): string {
  return String(value ?? '').replace(/[\r\n\u2028\u2029]+/g, ' ').slice(0, 120)
}

function cppStringLiteral(value: unknown): string {
  return `"${String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')}"`
}

function parseIpv4Literal(value: unknown): [number, number, number, number] | null {
  const parts = String(value ?? '').trim().split('.')
  if (parts.length !== 4) return null
  const nums = parts.map((part) => Number(part))
  if (nums.some((num) => !Number.isInteger(num) || num < 0 || num > 255)) return null
  return nums as [number, number, number, number]
}

function ipAddressExpr(value: [number, number, number, number] | null): string {
  const ip = value ?? [0, 0, 0, 0]
  return `IPAddress(${ip[0]}, ${ip[1]}, ${ip[2]}, ${ip[3]})`
}

/**
 * Show-pipeline nodes have no `emit()` case here *by design* — they are handled
 * by a different generator, not missing from this one. Without this table the
 * `default:` branch below labelled them "not yet supported in code gen", which
 * two shipped starter templates (Generative Show, Music-synced SD Show) then
 * baked into their exported `.ino` — telling users a hardware-validated
 * workflow was unfinished. Say where each one is actually handled instead.
 */
const SHOW_PIPELINE_NOTES: Record<string, string> = {
  MusicLibrary: 'song source for the music-sync SD show; the Player sketch (Upload show to SD) consumes it, not this sketch',
  PerformanceGenerator: 'builds the timed .show file exported to the SD card; no equivalent in a normal sketch',
  SDCard: 'SD/I2S player configuration; emitted by the Player sketch (Upload show to SD)',
  PatternCollection: 'resolved by the show controller generator once its Show Engine drives a Matrix Output',
  TransitionSet: 'transition pool read by the Show Engine / Performance Generator, not emitted directly',
}

export function generateCpp(
  nodes: StudioNode[], edges: StudioEdge[], groups: GroupRegistry = {},
  // `externalAudio`: the host sketch already provides the audio-engine globals
  // (used when compiling a pattern subgraph into a controller that hosts the
  // engine), so FFTAnalyzer/BeatDetect reference them without re-emitting it.
  // `psramAllowed`: gate for the MatrixOutput `usePsram` property — the upload
  // UI passes false when the selected board has no PSRAM support, so a stale
  // toggle can't emit ESP32-only allocation calls into an AVR/RP2040 sketch.
  opts: { externalAudio?: boolean; nativeFastLedAudio?: boolean; groupInputExprs?: Record<string, string>; psramAllowed?: boolean } = {},
): string {
  if (nodes.length === 0) return '// No nodes in graph\n'

  // Inline any Group nodes so the rest of the generator works on a flat graph.
  const flat = flattenGroups(nodes, edges, groups)
  nodes = flat.nodes
  edges = flat.edges

  const incoming = new Map<string, { srcId: string; srcPort: string }>()
  for (const e of edges) {
    if (e.source && e.target && e.sourceHandle && e.targetHandle)
      incoming.set(`${e.target}:${e.targetHandle}`, { srcId: e.source, srcPort: e.sourceHandle })
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]))

  const allOutputNodes = nodes.filter((n) => n.data.nodeType === 'MatrixOutput')
  /*
   * Runs wired in parallel off one GPIO are one controller, not several: the
   * pixels reach the mirror down the leader's wire, so it gets no `leds` array,
   * no `addLeds`, and no blit. `outputMirrorLeaders` decides which is which
   * (same frame + same data pin), and everything downstream here works from
   * the leaders alone — including whether this is a single-output sketch at
   * all, so two mirrored panels emit the same simple sketch one panel does.
   */
  const mirrorLeaders = outputMirrorLeaders(outputRoutes(nodes), edges)
  const isMirrorOf = (node: StudioNode) => {
    const leader = mirrorLeaders.get(node.id)
    return leader && leader !== node.id ? leader : null
  }
  const outputNodes = allOutputNodes.filter((n) => !isMirrorOf(n))
  const outputNode = outputNodes[0]
  const multipleOutputs = outputNodes.length > 1
  const rawProps = (n: StudioNode) => n.data.properties as Record<string, unknown>

  // Sanitise numeric properties so a stray/garbage value (e.g. a hex string
  // pasted into the width field) can't emit `#define WIDTH NaN` and break the
  // compile — clamp to sane integer bounds, matching the live-preview clamps.
  const intProp = (val: unknown, def: number, min: number, max: number) => {
    const n = Math.round(Number(val))
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def
  }
  const floatProp = (val: unknown, def: number, min: number, max: number) => {
    const n = Number(val)
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def
  }
  const composition = compositionDims(nodes, edges)
  // What the single output physically is (src/state/ledOutputForm.ts). A string
  // renders on its own 1 x N grid, a ring on the square its circle is inscribed
  // in, a matrix or panel on its panel — so the render canvas comes from the
  // form rather than from width/height, which two of the four forms don't use.
  const singleForm = outputNode ? outputForm(rawProps(outputNode)) : 'matrix'
  const singleLinear = !multipleOutputs && isLinearForm(singleForm)
  const singleCanvas = outputNode ? outputCanvasDims(rawProps(outputNode)) : { width: 16, height: 16 }
  const width      = multipleOutputs ? composition.w : singleCanvas.width
  const height     = multipleOutputs ? composition.h : singleCanvas.height
  const expressionScale = !multipleOutputs && !singleLinear && outputNode && rawProps(outputNode).supersample === true ? 2 : 1
  const props = (n: StudioNode) => resolveNodeScalarExpressions(
    n.data.nodeType as string,
    rawProps(n),
    width * expressionScale,
    height * expressionScale,
  )
  const dataPin    = sanitizePin(outputNode ? props(outputNode).dataPin : undefined, 5)
  // Chipset, colour order, master brightness, correction, dithering, overclock
  // — sanitised centrally (shared with the show/player generators).
  const hw = ledHardwareFromProps(outputNode ? props(outputNode) : {})
  // HUB75 has no FastLED driver — it's driven via a separate DMA library
  // instead of addLeds<>()/leds[]/show(). Scoped to a single Matrix Output
  // route for now; findUnimplementedChipsetErrors blocks every other
  // combination (multi-route, panel chaining, supersample) before deploy.
  const isHub75 = !multipleOutputs && hw.chipset === HUB75_CHIPSET
  const hub75Hw = isHub75 ? hub75HardwareFromProps(props(outputNode!), width, height) : null
  // Serpentine (zig-zag) matrices wire alternate rows in reverse; buffers stay
  // row-major and MatrixOutput remaps grid → physical index via XY(). Panel/
  // custom layouts (src/state/xyLayout.ts) fold into the same XY() remap, so
  // there's one physical-wiring code path regardless of which combination of
  // pixel serpentine, multi-panel tiling, or a custom map is in play.
  const xyTable = buildXYTable(width, height, outputNode ? props(outputNode) : {})
  // Supersample: render every buffer at SS× the panel resolution (so WIDTH/
  // HEIGHT/NUM_LEDS become the render size) and average each SS×SS block down
  // into the physical `leds` (PANEL_LEDS) at MatrixOutput. 1 = off (unchanged
  // output). 2× only for now, matching the preview.
  // A single chain has no 2 x 2 block to average down, whatever a supersample
  // flag left over from an earlier form still says.
  const supersample = !multipleOutputs && !singleLinear && (outputNode ? props(outputNode).supersample : false) === true ? 2 : 1
  const ss = supersample > 1
  // Physical strip length + panel width for the XY map (differ from the render
  // NUM_LEDS/WIDTH only when supersampling).
  // A ring's LEDs sit around a circle inscribed in the render canvas, so it has
  // its own physical count the way a supersampled panel does — the render buffer
  // is NUM_LEDS either way, and the strip FastLED drives is not.
  const isRing = !multipleOutputs && singleForm === 'ring'
  // Single-output: WIDTH/HEIGHT are the ring's own square, so its map is built
  // against exactly that.
  const ringMap = isRing && outputNode
    ? ringMapFor(outputRoutes([outputNode])[0], width, height)
    : null
  const physLeds = isRing ? 'RING_LEDS' : ss ? 'PANEL_LEDS' : 'NUM_LEDS'
  const panelW = ss ? 'PANEL_W' : 'WIDTH'
  // Optional power cap (FastLED.setMaxPowerInVoltsAndMilliamps) — dims globally
  // to keep the PSU draw under a limit so a big matrix can't brown out the board.
  // Every physical run, mirrors included — a parallel panel is a second panel
  // on the PSU even though it shares an array.
  const poweredOutputs = allOutputNodes.filter((node) => props(node).powerLimit === true)
  const powerLimit = poweredOutputs.length > 0
  const volts      = intProp(poweredOutputs[0] ? props(poweredOutputs[0]).volts : outputNode ? props(outputNode).volts : undefined, 5, 1, 60)
  const milliamps  = poweredOutputs.length > 0
    ? poweredOutputs.reduce((sum, node) => sum + intProp(props(node).milliamps, 2000, 100, 100000), 0)
    : intProp(outputNode ? props(outputNode).milliamps : undefined, 2000, 100, 100000)
  // Per-node render buffers in external PSRAM (ESP32 family; see PSRAM_ALLOC_CPP).
  const usePsram = opts.psramAllowed !== false && allOutputNodes.some((node) => props(node).usePsram === true)

  const outputConfigs = leadingOutputRoutes(nodes, edges).map((route) => {
    const p = props(route.node)
    return {
      ...route,
      safeId: safeId(route.id),
      dataPin: sanitizePin(p.dataPin, 5),
      hardware: ledHardwareFromProps(p),
      xyTable: buildXYTable(route.width, route.height, p),
      /** Physical LEDs on this route: a panel's grid, or a chain's length. */
      ledTotal: outputLedTotal(p),
      // Built against the emitted WIDTH/HEIGHT, which is the shared composition
      // canvas whenever there is more than one output — a ring beside a bigger
      // matrix reads that canvas, not the smaller square its own circumference
      // asked for.
      ringMap: ringMapFor(route, composition.w, composition.h),
    }
  })

  // A MicInput node turns on FastLED's on-device INMP441 audio processor; its
  // pins/channel configure FastLED's input. `emitEngine` means this sketch hosts
  // the processor; `useAudioGlobals` means FFTAnalyzer/BeatDetect
  // resolve to the live band levels (either because we host the engine, or a
  // controller does — `externalAudio`) instead of placeholder constants.
  const audio = audioEngineForGraph(nodes)
  const emitEngine = !!audio
  const useAudioGlobals = emitEngine || !!opts.externalAudio
  const nativeFastLedAudio = emitEngine || !!opts.nativeFastLedAudio

  const sorted = topoSort(nodes, edges)
  const emitRtcHelpers = sorted.some((n) => n.data.nodeType === 'RTCInput')
  const needsDs3231 = sorted.some((n) => n.data.nodeType === 'RTCInput' && String(props(n).timeSource ?? 'Compile Time') === 'DS3231')
  const dmxInputs = sorted.filter((n) => n.data.nodeType === 'DMXInput')
  const needsArtNet = dmxInputs.some((n) => String(props(n).inputMode ?? 'Art-Net') === 'Art-Net')
  const needsDmx512 = dmxInputs.some((n) => String(props(n).inputMode ?? 'Art-Net') === 'DMX512')
  const ntpNodes = sorted.filter((n) => n.data.nodeType === 'RTCInput' && String(props(n).timeSource ?? 'Compile Time') === 'NTP')
  const needsNtp = ntpNodes.length > 0
  const needsWifi = needsArtNet || needsNtp
  const networkSource = sorted.find((n) => {
    const p = props(n)
    return (n.data.nodeType === 'DMXInput' && String(p.inputMode ?? 'Art-Net') === 'Art-Net')
      || (n.data.nodeType === 'RTCInput' && String(p.timeSource ?? 'Compile Time') === 'NTP')
  })
  const networkProps = networkSource ? props(networkSource) : {}
  // SSID/password are deliberately not node properties — see networkCredentials.ts —
  // so they're looked up by node id from that browser-local store instead of `props`.
  const networkCredentials = networkSource ? getNetworkCredentials(networkSource.id) : { ssid: '', password: '' }
  const networkCfg = {
    ssid: cppStringLiteral(networkCredentials.ssid),
    password: cppStringLiteral(networkCredentials.password),
    hostname: cppStringLiteral(networkProps.wifiHostname ?? 'fastled-node'),
    useDhcp: networkProps.useDhcp !== false,
    staticIp: parseIpv4Literal(networkProps.staticIp),
    staticGateway: parseIpv4Literal(networkProps.staticGateway),
    staticSubnet: parseIpv4Literal(networkProps.staticSubnet),
    staticDns: parseIpv4Literal(networkProps.staticDns),
  }

  // Resolve a float input to a C++ expression
  function floatExpr(nodeId: string, portId: string, nodeProps: Record<string, unknown>, propKey: string, def: number): string {
    const up = incoming.get(`${nodeId}:${portId}`)
    if (up) {
      const expr = `n_${safeId(up.srcId)}_${up.srcPort}`
      // Mirror the evaluator's `clampInputs` toggle: clamp wired signals to the
      // control's range so the firmware matches the live preview.
      if (nodeProps.clampInputs) {
        const r = inputClampRange(nodeMap.get(nodeId)?.data.nodeType as string, propKey)
        if (r) return `constrain(${expr}, ${r.min}, ${r.max})`
      }
      return expr
    }
    const pv = nodeProps[propKey]
    return pv !== undefined ? String(Number(pv)) : String(def)
  }

  function boolExpr(nodeId: string, portId: string): string {
    const up = incoming.get(`${nodeId}:${portId}`)
    if (up) return `n_${safeId(up.srcId)}_${up.srcPort}`
    return 'false'
  }

  function colorExpr(nodeId: string, portId: string, fallback = 'CRGB::Black'): string {
    const up = incoming.get(`${nodeId}:${portId}`)
    if (up) return `n_${safeId(up.srcId)}_${up.srcPort}`
    return fallback
  }

  function colorPropExpr(nodeProps: Record<string, unknown>, rKey: string, gKey: string, bKey: string, fallback: RGB): string {
    const r = intProp(nodeProps[rKey], fallback.r, 0, 255)
    const g = intProp(nodeProps[gKey], fallback.g, 0, 255)
    const b = intProp(nodeProps[bKey], fallback.b, 0, 255)
    return `CRGB(${r},${g},${b})`
  }

  // Canonical ids of every palette `fastledPalette` resolves below. The emit
  // pass runs before the declarations are written, so this set is complete by
  // the time it gates them.
  const usedPalettes = new Set<string>()

  // Resolve a palette name to its baked `paldef_*` table, recording the
  // canonical id so only the palettes this sketch names are declared. Each
  // declaration is a non-const 48-byte global, so unused ones cost real RAM.
  function fastledPalette(name: string): string {
    const id = resolvePaletteId(name.toLowerCase())
    usedPalettes.add(id)
    return paletteCppRef(id)
  }

  // Resolve the FastLED palette for a palette-consuming port: runtime palette
  // builders resolve to their generated `pal_*` value; selectors resolve to a
  // preset constant; otherwise use the consuming node's palette property.
  function paletteExpr(nodeId: string, portId: string, nodeProps: Record<string, unknown>): string {
    const up = incoming.get(`${nodeId}:${portId}`)
    if (up) {
      const src = nodeMap.get(up.srcId)
      if (src) {
        // Palette builders create a CRGBPalette16 in their emit cases; reference
        // it by name. A palette-role GroupInput (collection-show codegen)
        // likewise resolves to its `pal_<id>` copy of the render_pN param.
        if (src.data.nodeType === 'CustomPalette' || src.data.nodeType === 'PaletteFromImage' || src.data.nodeType === 'PaletteBlend' || src.data.nodeType === 'Poline') return `pal_${safeId(up.srcId)}`
        if (src.data.nodeType === 'GroupInput' && String(props(src).paramId ?? '') === 'palette') return `pal_${safeId(up.srcId)}`
        return fastledPalette(String(props(src).palette ?? 'rainbow'))
      }
    }
    return fastledPalette(String(nodeProps.palette ?? 'rainbow'))
  }

  const loopLines: string[] = []
  // pinMode(...) calls contributed by hardware-input nodes, emitted in setup().
  // A Set so two nodes reading the same pin don't emit it twice.
  const pinSetupLines = new Set<string>()
  const setupLines: string[] = []
  if (needsDs3231) setupLines.push(`  Wire.begin();  // DS3231 on the board's default SDA/SCL pins`)
  // File-scope lines contributed by Code nodes (helpers, persistent vars, etc.),
  // emitted between the buffer declarations and setup().
  const globalLines: string[] = []
  const needsMapFloat: boolean[] = [false]
  const needsWorley = { v: false }
  const needsKelvin = { v: false }
  const needsT = { v: false }
  const needsShims = { v: false }
  const needsPhi = { v: false }
  const needsXyMap = { v: false }
  // Frame-producing nodes each render into their own CRGB buffer, so multiple
  // layers can coexist and be composited. Collected here, declared as globals.
  const frameBufs = new Set<string>()
  // Field-producing nodes (FieldFormula …) render into a parallel float buffer.
  const fieldBufs = new Set<string>()
  // Stateful feedback history buffers stay as static internal RAM even when
  // MatrixOutput moves ordinary render buffers into PSRAM.
  const feedbackHistoryBufs = new Map<string, number>()

  function emit(node: StudioNode): void {
    const id = safeId(node.id)
    const p = props(node)
    const type = node.data.nodeType as string

    const ln = (s: string) => loopLines.push(s)
    const v = (port: string) => `n_${id}_${port}`
    const f = (port: string, pk: string, def: number) => floatExpr(node.id, port, p, pk, def)

    // This node's own frame buffer (registers it for global declaration).
    const fbuf = `buf_${id}`
    const ownBuf = () => { frameBufs.add(id); return fbuf }
    // The buffer of the node feeding `port`, or null if unconnected.
    const srcBuf = (port: string): string | null => {
      const up = incoming.get(`${node.id}:${port}`)
      if (!up) return null
      frameBufs.add(safeId(up.srcId))
      return `buf_${safeId(up.srcId)}`
    }
    // A statement that seeds `fbuf` from a frame input (or black if unwired).
    const seedFrom = (port: string) => {
      const s = srcBuf(port)
      return s ? `::memmove(${fbuf}, ${s}, sizeof(CRGB) * NUM_LEDS);` : `fill_solid(${fbuf}, NUM_LEDS, CRGB::Black);`
    }
    // This node's own float field buffer.
    const ffbuf = `field_${id}`
    const ownField = () => { fieldBufs.add(id); return ffbuf }
    // The float field buffer of the node feeding `port`, or null if unconnected.
    const srcField = (port: string): string | null => {
      const up = incoming.get(`${node.id}:${port}`)
      if (!up) return null
      fieldBufs.add(safeId(up.srcId))
      return `field_${safeId(up.srcId)}`
    }

    // Bypassed effect-chain nodes just copy their matching frame/field input
    // into their own buffer, skipping their own render entirely — mirrors the
    // evaluator's bypass so firmware matches the live A/B preview.
    if (p.bypassed) {
      const nodeOutputs = node.data.outputs as { id: string; dataType?: string }[]
      const nodeInputs = node.data.inputs as { id: string; dataType?: string }[]
      const bp = bypassPort(nodeOutputs, nodeInputs)
      const bpType = bp ? nodeOutputs.find((o) => o.id === bp.outPort)?.dataType : undefined
      // A bypassed node skips its own body, so any scalar side outputs it also
      // publishes (e.g. Clock Display's transport readouts) still need a
      // declaration or a downstream reference would not compile.
      const declareScalarOutputs = () => {
        for (const o of nodeOutputs) {
          if (o.dataType === 'float') ln(`  float ${v(o.id)} = 0.0f;`)
          else if (o.dataType === 'bool') ln(`  bool ${v(o.id)} = false;`)
        }
      }
      if (bp && bpType === 'frame') {
        ownBuf()
        ln(`  ${seedFrom(bp.inPort)}`)
        declareScalarOutputs()
        return
      }
      if (bp && bpType === 'field') {
        declareScalarOutputs()
        const src = srcField(bp.inPort)
        const buf = ownField()
        ln(src ? `  memcpy(${buf}, ${src}, sizeof(float) * NUM_LEDS);` : `  memset(${buf}, 0, sizeof(float) * NUM_LEDS);`)
        return
      }
    }

    switch (type) {
      case 'TimeNode':
        needsT.v = true
        ln(`  float ${v('time')} = t;`)
        ln(`  float ${v('dt')} = 1.0f / 60.0f;`)
        break

      // A role-tagged group input kept by buildPattern (collection-show codegen)
      // resolves to the matching render_pN parameter. Float roles (energy/speed)
      // become `float n_<id>_out = <role>;`; the palette role copies the param
      // into `pal_<id>` so paletteExpr can reference it. Normal graphs flatten
      // GroupInputs away via flattenGroups, so this case is only reached for the
      // patterns the show player drives.
      case 'GroupInput': {
        const role = String(p.paramId ?? 'energy')
        if (role === 'palette') ln(`  CRGBPalette16 pal_${id} = palette;`)
        else ln(`  float ${v('out')} = ${opts.groupInputExprs?.[role] ?? role};`)
        break
      }

      // Bundled binary math — `mathOp` picks the operator. Keep in sync with the
      // `Math` case in graphEvaluator.ts.
      case 'Math': {
        const op = String(p.mathOp ?? 'add')
        const idn = op === 'multiply' || op === 'divide' ? 1 : 0
        const a = f('a', 'a', idn), b = f('b', 'b', idn)
        let expr: string
        switch (op) {
          case 'subtract': expr = `(${a}) - (${b})`; break
          case 'multiply': expr = `(${a}) * (${b})`; break
          case 'divide':   expr = `((${b}) == 0.0f ? 0.0f : (${a}) / (${b}))`; break
          case 'min':      expr = `min((float)(${a}), (float)(${b}))`; break
          case 'max':      expr = `max((float)(${a}), (float)(${b}))`; break
          case 'add':
          default:         expr = `(${a}) + (${b})`; break
        }
        ln(`  float ${v('result')} = ${expr};`)
        break
      }

      case 'Lerp':
        ln(`  float ${v('result')} = (${f('a', 'a', 0)}) + ((${f('b', 'b', 1)}) - (${f('a', 'a', 0)})) * (${f('t', 't', 0.5)});`)
        break

      case 'Clamp':
        ln(`  float ${v('result')} = constrain(${f('value', 'value', 0)}, ${f('min', 'min', 0)}, ${f('max', 'max', 1)});`)
        break

      case 'MapRange':
        needsMapFloat[0] = true
        ln(`  float ${v('result')} = mapFloat(${f('value', 'value', 0)}, ${f('inMin', 'inMin', 0)}, ${f('inMax', 'inMax', 1)}, ${f('outMin', 'outMin', 0)}, ${f('outMax', 'outMax', 1)});`)
        break

      case 'Sin':
        ln(`  float ${v('result')} = sin((${f('x', 'x', 0)}) * TWO_PI);`)
        break

      case 'Cos':
        ln(`  float ${v('result')} = cos((${f('x', 'x', 0)}) * TWO_PI);`)
        break

      case 'Wave': {
        needsT.v = true
        const amp = f('amplitude', 'amplitude', 1), freq = f('frequency', 'frequency', 1), phase = f('phase', 'phase', 0)
        const wf = String(p.waveform ?? 'sine')
        const arg = `((${freq}) * t + (${phase}))`
        let wave: string
        switch (wf) {
          case 'square':   wave = `((_ph < 0.5f) ? (${amp}) : -(${amp}))`; break
          case 'sawtooth': wave = `((${amp}) * (2.0f * _ph - 1.0f))`; break
          case 'triangle': wave = `((${amp}) * (4.0f * fabsf(_ph - 0.5f) - 1.0f))`; break
          default:         wave = `((${amp}) * sinf(6.2831853f * _arg))` // sine
        }
        ln(`  float ${v('result')};`)
        ln(`  { float _arg = ${arg}, _ph = fmodf(fmodf(_arg, 1.0f) + 1.0f, 1.0f); ${v('result')} = ${wave}; }`)
        break
      }

      case 'ComplexWave': {
        const a = f('a', 'a', 0), b = f('b', 'b', 0)
        const op = String(p.operation ?? 'add')
        let expr: string
        switch (op) {
          case 'multiply':   expr = `(${a}) * (${b})`; break
          case 'average':    expr = `((${a}) + (${b})) * 0.5f`; break
          case 'min':        expr = `min((float)(${a}), (float)(${b}))`; break
          case 'max':        expr = `max((float)(${a}), (float)(${b}))`; break
          case 'difference': expr = `(${a}) - (${b})`; break
          default:           expr = `(${a}) + (${b})` // add
        }
        ln(`  float ${v('result')} = ${expr};`)
        break
      }

      // Easing curve on a 0–1 value via legacy lib8tion or FastLED's accurate
      // fl::ease* functions. Existing ids keep their historical calls.
      case 'Ease': {
        const type = String(p.easeType ?? 'inOutCubic')
        const fn = type === 'inOutQuad' ? 'ease8InOutQuad'
          : type === 'linear' ? ''
          : type === 'inOutApprox' ? 'ease8InOutApprox'
          : type === 'inQuad' ? 'fl::easeInQuad8'
          : type === 'outQuad' ? 'fl::easeOutQuad8'
          : type === 'inCubic' ? 'fl::easeInCubic8'
          : type === 'outCubic' ? 'fl::easeOutCubic8'
          : type === 'inSine' ? 'fl::easeInSine8'
          : type === 'outSine' ? 'fl::easeOutSine8'
          : type === 'inOutSine' ? 'fl::easeInOutSine8'
          : type === 'triwave' ? 'triwave8'
          : type === 'quadwave' ? 'quadwave8'
          : type === 'cubicwave' ? 'cubicwave8'
          : 'ease8InOutCubic'
        const input = `(uint8_t)(constrain(${f('t', 't', 0)}, 0.0f, 1.0f) * 255)`
        ln(`  float ${v('result')} = ${fn ? `${fn}(${input})` : input} / 255.0f;`)
        break
      }

      // Metronome — a boolean pulse every `interval` seconds, via a millis timer.
      // Mirrors the stateful `Interval` case in graphEvaluator.ts.
      case 'Interval': {
        const ms = Math.max(50, Math.round(Number(p.interval ?? 0.5) * 1000))
        ln(`  static uint32_t _iv_${id} = 0; bool ${v('pulse')} = false;`)
        ln(`  if (millis() - _iv_${id} >= ${ms}u) { _iv_${id} = millis(); ${v('pulse')} = true; }`)
        break
      }

      case 'HueCycle': {
        needsT.v = true
        const rate = f('rate', 'rate', 0.1), s = f('s', 's', 1), val = f('v', 'v', 1)
        ln(`  CRGB ${v('color')};`)
        ln(`  { float _huePhase = fmodf(fmodf(t * (${rate}), 1.0f) + 1.0f, 1.0f); ${v('color')} = CHSV((uint8_t)(_huePhase * 256.0f), (uint8_t)((${s}) * 255.0f), (uint8_t)((${val}) * 255.0f)); }`)
        break
      }

      case 'HSVToRGB':
        ln(`  CRGB ${v('color')} = CHSV((uint8_t)((${f('h', 'h', 0)}) / 360.0f * 255), (uint8_t)((${f('s', 's', 1)}) * 255), (uint8_t)((${f('v', 'v', 1)}) * 255));`)
        break

      // The inverse of HSVToRGB — via FastLED's rgb2hsv_approximate.
      case 'RGBToHSV': {
        const rgb = colorExpr(node.id, 'rgb', colorPropExpr(p, 'r', 'g', 'b', { r: 0, g: 0, b: 0 }))
        ln(`  CHSV _hsv_${id} = rgb2hsv_approximate(${rgb});`)
        ln(`  float ${v('h')} = _hsv_${id}.hue / 255.0f * 360.0f;`)
        ln(`  float ${v('s')} = _hsv_${id}.sat / 255.0f;`)
        ln(`  float ${v('v')} = _hsv_${id}.val / 255.0f;`)
        break
      }

      case 'Temperature':
        needsKelvin.v = true
        needsMapFloat[0] = true
        ln(`  CRGB ${v('color')} = kelvinToRGB(mapFloat(constrain(${f('kelvin', 'kelvin', 0.27)}, 0.0f, 1.0f), 0.0f, 1.0f, 1000.0f, 12000.0f));`)
        break

      case 'HeatColor':
        ln(`  CRGB ${v('color')} = HeatColor((uint8_t)(constrain(${f('heat', 'heat', 0.5)}, 0.0f, 1.0f) * 255));`)
        break

      case 'BlendColors': {
        const ca = colorExpr(node.id, 'a', colorPropExpr(p, 'rA', 'gA', 'bA', { r: 255, g: 0, b: 0 }))
        const cb = colorExpr(node.id, 'b', colorPropExpr(p, 'rB', 'gB', 'bB', { r: 0, g: 0, b: 255 }))
        const mix = f('t', 't', 0.5)
        ln(`  CRGB ${v('color')} = blend(${ca}, ${cb}, (uint8_t)((${mix}) * 255));`)
        break
      }

      case 'FFTAnalyzer': {
        const gain = Math.max(0.25, Math.min(4, Number(p.gain ?? 1)))
        const rawSmoothing = Number(p.smoothing ?? 0.72)
        const smoothing = Math.max(0, Math.min(0.95, rawSmoothing > 1 ? rawSmoothing / 4 : rawSmoothing))
        const tilt = Math.max(0, Math.min(1, Number(p.tilt ?? 0)))
        const midsGain = gain * (1 + tilt * 0.6)
        const trebleGain = gain * (1 + tilt * 1.8)
        // `bands` genuinely drives analysis resolution here — mirrors
        // graphEvaluator.ts's FFTAnalyzer case exactly: resample the raw
        // 32-bin spectrum to `bands` bins (same technique as
        // SpectrumVisualizer's `_svBands`), then average contiguous thirds
        // into bass/mids/treble. `bands` is baked in at generation time, so
        // the group boundaries are plain compile-time constants.
        const bands = Math.max(8, Math.min(32, Math.round(Number(p.bands ?? 24))))
        const groupBounds = (start: number, end: number): [number, number] => {
          const from = Math.max(0, Math.floor(start))
          const to = Math.max(from + 1, Math.min(bands, Math.ceil(end)))
          return [from, to]
        }
        const third = bands / 3
        const [bassFrom, bassTo] = groupBounds(0, third)
        const [midsFrom, midsTo] = groupBounds(third, third * 2)
        const [trebleFrom, trebleTo] = groupBounds(third * 2, bands)
        const bandsVar = `_fftBands_${id}`
        const groupExpr = (from: number, to: number) =>
          `(${Array.from({ length: to - from }, (_, i) => `${bandsVar}[${from + i}]`).join('+')}) / ${(to - from).toFixed(1)}f`
        const rawBass = `${v('bass')}_raw`
        const rawMids = `${v('mids')}_raw`
        const rawTreble = `${v('treble')}_raw`
        if (!useAudioGlobals) ln(`  // FFTAnalyzer — add a Microphone node to drive these from the INMP441`)
        // The resample loop's counters (_b/_lo/_hi/_i/_sum) are generic
        // names, so they're scoped to a block — multiple FFTAnalyzer nodes
        // in the same sketch would otherwise redeclare them.
        ln(`  float ${rawBass}, ${rawMids}, ${rawTreble};`)
        ln(`  {`)
        ln(`    float ${bandsVar}[${bands}];`)
        ln(`    for (int _b = 0; _b < ${bands}; _b++) { int _lo = (_b * 32) / ${bands}, _next = ((_b + 1) * 32) / ${bands}, _hi = _next > _lo ? _next : _lo + 1; float _sum = 0.0f; for (int _i = _lo; _i < _hi; _i++) _sum += ${useAudioGlobals ? '_audioSpectrum[_i]' : '0.0f'}; ${bandsVar}[_b] = _sum / (_hi - _lo); }`)
        ln(`    ${rawBass} = ${groupExpr(bassFrom, bassTo)};`)
        ln(`    ${rawMids} = ${groupExpr(midsFrom, midsTo)};`)
        ln(`    ${rawTreble} = ${groupExpr(trebleFrom, trebleTo)};`)
        ln(`  }`)
        ln(`  float ${v('bass')}_target = constrain(${rawBass} * ${gain.toFixed(3)}f, 0.0f, 1.0f), ${v('mids')}_target = constrain(${rawMids} * ${midsGain.toFixed(3)}f, 0.0f, 1.0f), ${v('treble')}_target = constrain(${rawTreble} * ${trebleGain.toFixed(3)}f, 0.0f, 1.0f);`)
        ln(`  static float ${v('bass')}_smooth = -1, ${v('mids')}_smooth = -1, ${v('treble')}_smooth = -1;`)
        ln(`  ${v('bass')}_smooth = ${v('bass')}_smooth < 0 ? ${v('bass')}_target : ${v('bass')}_smooth * ${smoothing.toFixed(3)}f + ${v('bass')}_target * ${(1 - smoothing).toFixed(3)}f;`)
        ln(`  ${v('mids')}_smooth = ${v('mids')}_smooth < 0 ? ${v('mids')}_target : ${v('mids')}_smooth * ${smoothing.toFixed(3)}f + ${v('mids')}_target * ${(1 - smoothing).toFixed(3)}f;`)
        ln(`  ${v('treble')}_smooth = ${v('treble')}_smooth < 0 ? ${v('treble')}_target : ${v('treble')}_smooth * ${smoothing.toFixed(3)}f + ${v('treble')}_target * ${(1 - smoothing).toFixed(3)}f;`)
        ln(`  float ${v('bass')} = ${v('bass')}_smooth, ${v('mids')} = ${v('mids')}_smooth, ${v('treble')} = ${v('treble')}_smooth;`)
        break
      }

      case 'BeatDetect': {
        if (nativeFastLedAudio) {
          ln(`  bool ${v('beat')} = _audioBeat; float ${v('bpm')} = _audioBpm;`)
          ln(`  float ${v('flux')} = 0.0f, ${v('onset')} = 0.0f, ${v('contrast')} = 0.0f, ${v('threshold')} = 0.0f, ${v('cooldownMs')} = 0.0f;`)
        } else if (useAudioGlobals) {
          const threshold = denormalizeBeatParam('threshold', floatProp(p.threshold, 0.2, 0, 1))
          const attack = denormalizeBeatParam('attack', floatProp(p.attack, 0.55, 0, 1))
          const decay = denormalizeBeatParam('decay', floatProp(p.decay, 0.25, 0, 1))
          const prefix = v('detector')
          ln(`  bool ${v('beat')} = false;`)
          ln(`  static float ${v('bpm')} = 120.0f, ${prefix}_fast = 0.0f, ${prefix}_slow = 0.0f, ${prefix}_prevFlux = 0.0f;`)
          ln(`  float ${v('flux')} = 0.0f, ${v('onset')} = 0.0f, ${v('contrast')} = 0.0f, ${v('cooldownMs')} = 0.0f;`)
          ln(`  const float ${v('threshold')} = ${threshold.toFixed(4)}f;`)
          ln(`  static float ${prefix}_prevSpectrum[32]; static bool ${prefix}_ready = false; static uint32_t ${prefix}_lastBeat = 0, ${prefix}_lastMs = 0;`)
          ln(`  if (${prefix}_ready) {`)
          ln(`    float _flux = 0.0f, _weightSum = 0.0f;`)
          ln(`    for (int _i = 0; _i < 32; _i++) {`)
          ln(`      float _diff = _audioSpectrum[_i] - ${prefix}_prevSpectrum[_i]; if (_diff < 0.0f) _diff = 0.0f;`)
          ln(`      float _weight = _i < 6 ? 3.0f : (_i < 12 ? 1.6f : (_i < 20 ? 0.5f : 0.06f)); _flux += _diff * _weight; _weightSum += _weight;`)
          ln(`    }`)
          ln(`    _flux = _weightSum > 0.0f ? constrain((_flux / _weightSum) * ${FLUX_GAIN.toFixed(1)}f, 0.0f, 1.0f) : 0.0f;`)
          ln(`    uint32_t _now = millis();`)
          ln(`    // Per-frame attack/decay scaled to the actual loop interval (60 fps calibration; see beatDetection.ts).`)
          ln(`    float _dtF = ${prefix}_lastMs > 0 ? constrain((float)(_now - ${prefix}_lastMs), 1.0f, 500.0f) / 16.667f : 1.0f;`)
          ln(`    ${prefix}_lastMs = _now;`)
          ln(`    float _prevSlow = ${prefix}_slow;`)
          ln(`    ${prefix}_fast += (_flux - ${prefix}_fast) * (1.0f - powf(1.0f - ${attack.toFixed(4)}f, _dtF));`)
          ln(`    ${prefix}_slow += (_flux - ${prefix}_slow) * (1.0f - powf(1.0f - ${decay.toFixed(4)}f, _dtF));`)
          ln(`    float _onset = ${prefix}_fast - _prevSlow, _baseline = _prevSlow > 0.02f ? _prevSlow : 0.02f;`)
          ln(`    float _gap = constrain(60000.0f / ${v('bpm')} * 0.42f, 150.0f, 600.0f);`)
          ln(`    bool _rising = _flux > ${prefix}_prevFlux;`)
          ln(`    ${v('beat')} = _flux > ${threshold.toFixed(4)}f && _rising && _onset > ${(threshold * 0.45).toFixed(4)}f && _onset / _baseline > 1.1f && (${prefix}_lastBeat == 0 || _now - ${prefix}_lastBeat >= (uint32_t)_gap);`)
          ln(`    if (${v('beat')}) { if (${prefix}_lastBeat != 0) { float _interval = _now - ${prefix}_lastBeat; if (_interval >= 220.0f && _interval <= 1800.0f) {`)
          ln(`      float _instant = 60000.0f / _interval;`)
          ln(`      // Octave folding — stray offbeats must not double the BPM estimate.`)
          ln(`      if (_instant > ${v('bpm')} * 1.6f && _instant * 0.5f >= 50.0f) _instant *= 0.5f; else if (_instant < ${v('bpm')} * 0.55f) _instant *= 2.0f;`)
          ln(`      ${v('bpm')} = ${v('bpm')} * 0.65f + _instant * 0.35f;`)
          ln(`    } } ${prefix}_lastBeat = _now; }`)
          ln(`    ${prefix}_prevFlux = _flux;`)
          ln(`    ${v('flux')} = _flux; ${v('onset')} = _onset; ${v('contrast')} = _onset / _baseline; ${v('cooldownMs')} = _gap;`)
          ln(`  }`)
          ln(`  for (int _i = 0; _i < 32; _i++) ${prefix}_prevSpectrum[_i] = _audioSpectrum[_i]; ${prefix}_ready = true;`)
        } else {
          ln(`  // BeatDetect — add a Microphone node for on-device beat detection`)
          ln(`  bool ${v('beat')} = false; float ${v('bpm')} = 120.0f;`)
          ln(`  float ${v('flux')} = 0.0f, ${v('onset')} = 0.0f, ${v('contrast')} = 0.0f, ${v('threshold')} = 0.0f, ${v('cooldownMs')} = 0.0f;`)
        }
        break
      }

      case 'PercussionDetect': {
        const sensitivity = floatProp(p.sensitivity, 0.55, 0, 1)
        const decay = Math.max(0, Math.min(0.98, Number(p.decay ?? 0.72)))
        const separation = floatProp(p.separation, 0.4, 0, 1)
        if (useAudioGlobals) {
          const prefix = v('perc')
          const threshold = 0.06 + (1 - sensitivity) * 0.18
          ln(`  static float ${prefix}_prevSpectrum[32]; static bool ${prefix}_ready = false;`)
          ln(`  static float ${v('kick')} = 0.0f, ${v('snare')} = 0.0f, ${v('hihat')} = 0.0f;`)
          ln(`  {`)
          ln(`    float _low = 0.0f, _lowMid = 0.0f, _mids = 0.0f, _highs = 0.0f, _lowFlux = 0.0f, _midFlux = 0.0f, _highFlux = 0.0f;`)
          ln(`    for (int _i = 0; _i < 32; _i++) {`)
          ln(`      float _cur = _audioSpectrum[_i];`)
          ln(`      float _prev = ${prefix}_ready ? ${prefix}_prevSpectrum[_i] : _cur;`)
          ln(`      float _diff = _cur - _prev; if (_diff < 0.0f) _diff = 0.0f;`)
          ln(`      if (_i < 4) _low += _cur;`)
          ln(`      if (_i >= 4 && _i < 9) _lowMid += _cur;`)
          ln(`      if (_i >= 8 && _i < 16) _mids += _cur;`)
          ln(`      if (_i >= 20) _highs += _cur;`)
          ln(`      if (_i < 5) _lowFlux += _diff;`)
          ln(`      if (_i >= 6 && _i < 17) _midFlux += _diff;`)
          ln(`      if (_i >= 18) _highFlux += _diff;`)
          ln(`      ${prefix}_prevSpectrum[_i] = _cur;`)
          ln(`    }`)
          ln(`    _low /= 4.0f; _lowMid /= 5.0f; _mids /= 8.0f; _highs /= 12.0f;`)
          ln(`    _lowFlux /= 5.0f; _midFlux /= 11.0f; _highFlux /= 14.0f;`)
          ln(`    float _kickTarget = constrain(_lowFlux * 3.1f + _low * 0.9f - _lowMid * ${(0.3 + separation * 0.45).toFixed(4)}f - ${threshold.toFixed(4)}f, 0.0f, 1.0f);`)
          ln(`    float _snareTarget = constrain(_midFlux * 2.6f + _mids * 0.55f - _low * ${(0.18 + separation * 0.22).toFixed(4)}f - _highs * 0.08f - ${(threshold * 0.8).toFixed(4)}f, 0.0f, 1.0f);`)
          ln(`    float _hihatTarget = constrain(_highFlux * 3.2f + _highs * 0.45f - _mids * ${(0.08 + separation * 0.18).toFixed(4)}f - ${(threshold * 0.65).toFixed(4)}f, 0.0f, 1.0f);`)
          ln(`    ${v('kick')} = _kickTarget >= ${v('kick')} ? _kickTarget : ${v('kick')} * ${decay.toFixed(4)}f + _kickTarget * ${(1 - decay).toFixed(4)}f;`)
          ln(`    ${v('snare')} = _snareTarget >= ${v('snare')} ? _snareTarget : ${v('snare')} * ${decay.toFixed(4)}f + _snareTarget * ${(1 - decay).toFixed(4)}f;`)
          ln(`    ${v('hihat')} = _hihatTarget >= ${v('hihat')} ? _hihatTarget : ${v('hihat')} * ${decay.toFixed(4)}f + _hihatTarget * ${(1 - decay).toFixed(4)}f;`)
          ln(`    ${prefix}_ready = true;`)
          ln(`  }`)
        } else {
          ln(`  // PercussionDetect — add a Microphone node for on-device percussion envelopes`)
          ln(`  float ${v('kick')} = 0.0f, ${v('snare')} = 0.0f, ${v('hihat')} = 0.0f;`)
        }
        break
      }

      case 'AudioFeatures': {
        const sensitivity = floatProp(p.sensitivity, 0.5, 0, 1)
        const gate = floatProp(p.gate, 0.12, 0, 1)
        const smoothing = Math.max(0, Math.min(0.95, Number(p.smoothing ?? 0.8)))
        if (useAudioGlobals) {
          const prefix = v('feat')
          const silenceThreshold = 0.015 + gate * 0.35
          ln(`  static float ${prefix}_prevSpectrum[32]; static bool ${prefix}_ready = false;`)
          ln(`  static float ${v('vocals')} = 0.0f, ${v('energy')} = 0.0f;`)
          ln(`  {`)
          ln(`    float _low = 0.0f, _presence = 0.0f, _air = 0.0f, _presenceFlux = 0.0f, _total = 0.0f;`)
          ln(`    for (int _i = 0; _i < 32; _i++) {`)
          ln(`      float _cur = _audioSpectrum[_i];`)
          ln(`      float _prev = ${prefix}_ready ? ${prefix}_prevSpectrum[_i] : _cur;`)
          ln(`      float _diff = _cur - _prev; if (_diff < 0.0f) _diff = 0.0f;`)
          ln(`      _total += _cur;`)
          ln(`      if (_i < 5) _low += _cur;`)
          ln(`      if (_i >= 9 && _i < 18) { _presence += _cur; _presenceFlux += _diff; }`)
          ln(`      if (_i >= 18) _air += _cur;`)
          ln(`      ${prefix}_prevSpectrum[_i] = _cur;`)
          ln(`    }`)
          ln(`    _total /= 32.0f; _low /= 5.0f; _presence /= 9.0f; _presenceFlux /= 9.0f; _air /= 14.0f;`)
          ln(`    float _energyTarget = constrain((_total * 0.7f + _low * 0.2f + _presence * 0.1f) * ${(0.8 + sensitivity * 0.6).toFixed(4)}f, 0.0f, 1.0f);`)
          ln(`    float _vocalsTarget = constrain((_presence * 1.35f + _presenceFlux * 2.1f - _low * 0.3f - _air * 0.12f) * ${(0.75 + sensitivity * 0.7).toFixed(4)}f - ${(gate * 0.35).toFixed(4)}f, 0.0f, 1.0f);`)
          ln(`    ${v('energy')} = ${v('energy')} * ${smoothing.toFixed(4)}f + _energyTarget * ${(1 - smoothing).toFixed(4)}f;`)
          ln(`    ${v('vocals')} = ${v('vocals')} * ${smoothing.toFixed(4)}f + _vocalsTarget * ${(1 - smoothing).toFixed(4)}f;`)
          ln(`    ${prefix}_ready = true;`)
          ln(`  }`)
          ln(`  bool ${v('silence')} = ${v('energy')} < ${silenceThreshold.toFixed(4)}f;`)
        } else {
          ln(`  // AudioFeatures — add a Microphone node for on-device audio feature extraction`)
          ln(`  float ${v('vocals')} = 0.0f, ${v('energy')} = 0.0f; bool ${v('silence')} = true;`)
        }
        break
      }

      case 'MicInput':
        ln(`  // MicInput — FastLED auto-pumps the INMP441 processor; updateAudio() polls its outputs.`)
        ln(`  // Source gain is applied through fl::audio::Processor::setGain().`)
        break

      case 'ButtonInput': {
        const pin = sanitizePin(p.pin, 0)
        pinSetupLines.add(`  pinMode(${pin}, ${p.pullup === false ? 'INPUT' : 'INPUT_PULLUP'});`)
        ln(`  bool ${v('pressed')} = digitalRead(${pin}) == LOW;`)
        break
      }

      case 'PotInput':
        ln(`  float ${v('value')} = analogRead(${sanitizePin(p.pin, 4)}) / 4095.0f;`)
        break

      // Polling quadrature decode (no interrupts) via a standard 4x lookup
      // table; `position` is an unbounded running count.
      case 'EncoderInput': {
        const pinA = sanitizePin(p.pinA, 6), pinB = sanitizePin(p.pinB, 7), pinSW = sanitizePin(p.pinSW, 8)
        const mode = p.pullup === false ? 'INPUT' : 'INPUT_PULLUP'
        for (const pin of [pinA, pinB, pinSW]) pinSetupLines.add(`  pinMode(${pin}, ${mode});`)
        ln(`  static int8_t _encLast_${id} = 0; static float _encPos_${id} = 0;`)
        ln(`  { int8_t _a=digitalRead(${pinA}),_b=digitalRead(${pinB}); int8_t _s=(_a<<1)|_b;`)
        ln(`    static const int8_t _encTbl_${id}[16]={0,-1,1,0, 1,0,0,-1, -1,0,0,1, 0,1,-1,0};`)
        ln(`    _encPos_${id}+=_encTbl_${id}[(_encLast_${id}<<2)|_s]; _encLast_${id}=_s; }`)
        ln(`  bool ${v('pressed')} = digitalRead(${pinSW}) == LOW;`)
        if (p.resetOnPress === true) {
          ln(`  static bool _encSwLast_${id} = false;`)
          ln(`  if (${v('pressed')} && !_encSwLast_${id}) _encPos_${id} = 0;`)
          ln(`  _encSwLast_${id} = ${v('pressed')};`)
        }
        ln(`  float ${v('position')} = _encPos_${id};`)
        break
      }

      case 'DMXInput': {
        const inputMode = String(p.inputMode ?? 'Art-Net')
        const universe = intProp(p.universe, 0, 0, 32767)
        globalLines.push(`uint8_t _dmxData_${id}[512] = {0};`)
        globalLines.push(`bool _dmxValid_${id} = false, _dmxLive_${id} = false;`)
        globalLines.push(`float _dmxPacketRate_${id} = 0.0f;`)
        globalLines.push(`uint32_t _dmxLastPacketMs_${id} = 0;`)

        if (inputMode === 'DMX512') {
          const dmxPort = intProp(p.dmxPort, 1, 1, 2)
          const txPin = sanitizePin(p.dmxTxPin, 17)
          const rxPin = sanitizePin(p.dmxRxPin, 16)
          const enPin = sanitizePin(p.dmxEnablePin, 21)
          globalLines.push(`#if defined(ESP32)`)
          globalLines.push(`static dmx_port_t _dmxPort_${id} = (dmx_port_t)${dmxPort};`)
          globalLines.push(`#endif`)
          setupLines.push(`#if defined(ESP32)`)
          setupLines.push(`  dmx_config_t _dmxConfig_${id} = DMX_CONFIG_DEFAULT;`)
          setupLines.push(`  dmx_personality_t _dmxPersonality_${id}[] = { {1, "Studio"} };`)
          setupLines.push(`  dmx_driver_install(_dmxPort_${id}, &_dmxConfig_${id}, _dmxPersonality_${id}, 1);`)
          setupLines.push(`  dmx_set_pin(_dmxPort_${id}, ${txPin}, ${rxPin}, ${enPin});`)
          setupLines.push(`#endif`)
          ln(`#if defined(ESP32)`)
          ln(`  dmx_packet_t _dmxPacket_${id};`)
          ln(`  if (dmx_receive(_dmxPort_${id}, &_dmxPacket_${id}, DMX_TIMEOUT_TICK)) {`)
          ln(`    if (!_dmxPacket_${id}.err) {`)
          ln(`      uint8_t _dmxRaw_${id}[DMX_PACKET_SIZE] = {0};`)
          ln(`      dmx_read(_dmxPort_${id}, _dmxRaw_${id}, _dmxPacket_${id}.size);`)
          ln(`      uint16_t _dmxSlots_${id} = (uint16_t)min<int>(max(0, (int)_dmxPacket_${id}.size - 1), 512);`)
          ln(`      memset(_dmxData_${id}, 0, 512);`)
          ln(`      if (_dmxSlots_${id} > 0) memcpy(_dmxData_${id}, _dmxRaw_${id} + 1, _dmxSlots_${id});`)
          ln(`      uint32_t _dmxNow_${id} = millis();`)
          ln(`      if (_dmxLastPacketMs_${id}) _dmxPacketRate_${id} = 1000.0f / max(1u, _dmxNow_${id} - _dmxLastPacketMs_${id});`)
          ln(`      _dmxLastPacketMs_${id} = _dmxNow_${id};`)
          ln(`      _dmxValid_${id} = true;`)
          ln(`      _dmxLive_${id} = true;`)
          ln(`    }`)
          ln(`  } else if (_dmxLastPacketMs_${id} && millis() - _dmxLastPacketMs_${id} > 1000u) {`)
          ln(`    _dmxLive_${id} = false;`)
          ln(`  }`)
          ln(`#else`)
          ln(`  _dmxValid_${id} = false;`)
          ln(`  _dmxLive_${id} = false;`)
          ln(`  _dmxPacketRate_${id} = 0.0f;`)
          ln(`#endif`)
        } else {
          const port = intProp(p.previewPort, 6454, 1, 65535)
          globalLines.push(`#if FLS_WIFI_SUPPORTED`)
          globalLines.push(`WiFiUDP _artnetUdp_${id};`)
          globalLines.push(`#endif`)
          setupLines.push(`#if FLS_WIFI_SUPPORTED`)
          setupLines.push(`  _artnetUdp_${id}.begin(${port});`)
          setupLines.push(`#endif`)
          ln(`  _wifiEnsureConnected();`)
          ln(`#if FLS_WIFI_SUPPORTED`)
          ln(`  if (_wifiConnected()) {`)
          ln(`    int _artPkt_${id} = _artnetUdp_${id}.parsePacket();`)
          ln(`    while (_artPkt_${id} > 0) {`)
          ln(`      uint8_t _artBuf_${id}[530] = {0};`)
          ln(`      int _artLen_${id} = _artnetUdp_${id}.read(_artBuf_${id}, sizeof(_artBuf_${id}));`)
          ln(`      if (_artLen_${id} >= 18 && memcmp(_artBuf_${id}, "Art-Net\\0", 8) == 0) {`)
          ln(`        uint16_t _artOp_${id} = (uint16_t)_artBuf_${id}[8] | ((uint16_t)_artBuf_${id}[9] << 8);`)
          ln(`        uint16_t _artUni_${id} = (uint16_t)_artBuf_${id}[14] | ((uint16_t)_artBuf_${id}[15] << 8);`)
          ln(`        uint16_t _artCount_${id} = ((uint16_t)_artBuf_${id}[16] << 8) | (uint16_t)_artBuf_${id}[17];`)
          ln(`        if (_artOp_${id} == 0x5000u && _artUni_${id} == ${universe}) {`)
          ln(`          uint16_t _artSlots_${id} = min<uint16_t>(_artCount_${id}, 512u);`)
          ln(`          if (18 + (int)_artSlots_${id} <= _artLen_${id}) {`)
          ln(`            memset(_dmxData_${id}, 0, 512);`)
          ln(`            memcpy(_dmxData_${id}, _artBuf_${id} + 18, _artSlots_${id});`)
          ln(`            uint32_t _artNow_${id} = millis();`)
          ln(`            if (_dmxLastPacketMs_${id}) _dmxPacketRate_${id} = 1000.0f / max(1u, _artNow_${id} - _dmxLastPacketMs_${id});`)
          ln(`            _dmxLastPacketMs_${id} = _artNow_${id};`)
          ln(`            _dmxValid_${id} = true;`)
          ln(`            _dmxLive_${id} = true;`)
          ln(`          }`)
          ln(`        }`)
          ln(`      }`)
          ln(`      _artPkt_${id} = _artnetUdp_${id}.parsePacket();`)
          ln(`    }`)
          ln(`  }`)
          ln(`  if (_dmxLastPacketMs_${id} && millis() - _dmxLastPacketMs_${id} > 2000u) _dmxLive_${id} = false;`)
          ln(`#else`)
          ln(`  _dmxValid_${id} = false;`)
          ln(`  _dmxLive_${id} = false;`)
          ln(`  _dmxPacketRate_${id} = 0.0f;`)
          ln(`#endif`)
        }
        break
      }

      case 'DMXChannel': {
        const channel = intProp(p.channel, 1, 1, 512)
        const threshold = intProp(p.activeThreshold, 1, 0, 255)
        const up = incoming.get(`${node.id}:dmx`)
        const src = up ? nodeMap.get(up.srcId) : null
        const srcId = src?.data.nodeType === 'DMXInput' ? safeId(up!.srcId) : ''
        ln(`  uint8_t _dmxByte_${id} = ${srcId ? `_dmxData_${srcId}[${channel - 1}]` : '0'};`)
        ln(`  static bool _dmxSeen_${id} = false;`)
        ln(`  static uint8_t _dmxPrev_${id} = 0;`)
        ln(`  float ${v('value')} = _dmxByte_${id} / 255.0f;`)
        ln(`  float ${v('byte')} = (float)_dmxByte_${id};`)
        ln(`  bool ${v('active')} = _dmxByte_${id} >= ${threshold};`)
        ln(`  bool ${v('changed')} = _dmxSeen_${id} && _dmxByte_${id} != _dmxPrev_${id};`)
        ln(`  _dmxSeen_${id} = true;`)
        ln(`  _dmxPrev_${id} = _dmxByte_${id};`)
        break
      }

      case 'RTCInput': {
        const rawInt = (value: unknown, def: number) => {
          const n = Math.round(Number(value))
          return Number.isFinite(n) ? n : def
        }
        const source = String(p.timeSource ?? 'Compile Time')
        const startYear = rawInt(p.startYear, 2026)
        const startMonth = rawInt(p.startMonth, 1)
        const startDay = rawInt(p.startDay, 1)
        const startHour = rawInt(p.startHour, 12)
        const startMinute = rawInt(p.startMinute, 0)
        const startSecond = rawInt(p.startSecond, 0)
        const timezoneOffsetMinutes = rawInt(p.timezoneOffsetMinutes, 0)
        const ntpServer = cppStringLiteral(p.ntpServer ?? 'pool.ntp.org')
        const ntp = source === 'NTP'
        const ds3231 = source === 'DS3231'
        ln(`  static bool _rtcInit_${id} = false, _rtcSeedValid_${id} = false;`)
        ln(`  static bool _rtcNtpConfigured_${id} = false;`)
        ln(`  static int32_t _rtcBaseDays_${id} = 0;`)
        ln(`  static uint32_t _rtcBaseSeconds_${id} = 0, _rtcLastMillis_${id} = 0;`)
        ln(`  static uint64_t _rtcElapsedMillis_${id} = 0;`)
        ln(`  if (!_rtcInit_${id}) {`)
        if (source === 'Manual') {
          ln(`    _rtcSeedValid_${id} = _rtcValidDateTime(${startYear}, ${startMonth}, ${startDay}, ${startHour}, ${startMinute}, ${startSecond});`)
          ln(`    if (_rtcSeedValid_${id}) {`)
          ln(`      _rtcBaseDays_${id} = _rtcDaysFromCivil(${startYear}, ${startMonth}, ${startDay});`)
          ln(`      _rtcBaseSeconds_${id} = (uint32_t)(${startHour}) * 3600u + (uint32_t)(${startMinute}) * 60u + (uint32_t)(${startSecond});`)
          ln(`    }`)
        } else if (!ds3231) {
          // NTP seeds from the build stamp too, so the clock runs (flagged
          // stale, not synced) before the first successful sync instead of
          // leaving every output dark until Wi-Fi comes up.
          ln(`    _RtcDateTime _rtcBuild_${id};`)
          ln(`    _rtcSeedValid_${id} = _rtcParseBuildStamp(__DATE__, __TIME__, _rtcBuild_${id});`)
          ln(`    if (_rtcSeedValid_${id}) {`)
          ln(`      _rtcBaseDays_${id} = _rtcDaysFromCivil(_rtcBuild_${id}.year, _rtcBuild_${id}.month, _rtcBuild_${id}.day);`)
          ln(`      _rtcBaseSeconds_${id} = (uint32_t)_rtcBuild_${id}.hour * 3600u + (uint32_t)_rtcBuild_${id}.minute * 60u + (uint32_t)_rtcBuild_${id}.second;`)
          ln(`    }`)
        }
        ln(`    _rtcLastMillis_${id} = millis();`)
        ln(`    _rtcInit_${id} = true;`)
        ln(`  }`)
        ln(`  bool ${v('valid')} = false, ${v('synced')} = false, ${v('stale')} = false, ${v('weekend')} = false;`)
        ln(`  float ${v('hour')} = 0.0f, ${v('minute')} = 0.0f, ${v('second')} = 0.0f;`)
        ln(`  float ${v('weekday')} = 0.0f, ${v('day')} = 0.0f, ${v('month')} = 0.0f, ${v('year')} = 0.0f;`)
        ln(`  float ${v('secondsOfDay')} = 0.0f;`)
        // Free-running software clock. It is the clock for Compile Time and
        // Manual, and the pre-sync fallback for NTP (which overwrites the
        // fields below once the network hands back a real epoch).
        ln(`  if (_rtcSeedValid_${id}) {`)
        ln(`    uint32_t _rtcNowMs_${id} = millis();`)
        ln(`    _rtcElapsedMillis_${id} += (uint32_t)(_rtcNowMs_${id} - _rtcLastMillis_${id});`)
        ln(`    _rtcLastMillis_${id} = _rtcNowMs_${id};`)
        ln(`    uint64_t _rtcWholeSeconds_${id} = _rtcElapsedMillis_${id} / 1000ull;`)
        ln(`    uint32_t _rtcMillisRema_${id} = (uint32_t)(_rtcElapsedMillis_${id} % 1000ull);`)
        ln(`    uint64_t _rtcTotalSeconds_${id} = (uint64_t)_rtcBaseSeconds_${id} + _rtcWholeSeconds_${id};`)
        ln(`    int32_t _rtcDays_${id} = _rtcBaseDays_${id} + (int32_t)(_rtcTotalSeconds_${id} / 86400ull);`)
        ln(`    uint32_t _rtcSecondsOfDay_${id} = (uint32_t)(_rtcTotalSeconds_${id} % 86400ull);`)
        ln(`    int16_t _rtcYear_${id}; uint8_t _rtcMonth_${id}, _rtcDay_${id};`)
        ln(`    _rtcCivilFromDays(_rtcDays_${id}, _rtcYear_${id}, _rtcMonth_${id}, _rtcDay_${id});`)
        ln(`    uint8_t _rtcWeekday_${id} = _rtcWeekdayFromDays(_rtcDays_${id});`)
        ln(`    ${v('valid')} = true;`)
        ln(`    ${v('synced')} = ${ntp ? 'false' : 'true'};`)
        ln(`    ${v('stale')} = ${ntp ? 'true' : 'false'};`)
        ln(`    ${v('hour')} = (float)(_rtcSecondsOfDay_${id} / 3600u);`)
        ln(`    ${v('minute')} = (float)((_rtcSecondsOfDay_${id} / 60u) % 60u);`)
        ln(`    ${v('second')} = (float)(_rtcSecondsOfDay_${id} % 60u);`)
        ln(`    ${v('weekday')} = (float)_rtcWeekday_${id};`)
        ln(`    ${v('day')} = (float)_rtcDay_${id};`)
        ln(`    ${v('month')} = (float)_rtcMonth_${id};`)
        ln(`    ${v('year')} = (float)_rtcYear_${id};`)
        ln(`    ${v('secondsOfDay')} = (float)_rtcSecondsOfDay_${id} + _rtcMillisRema_${id} / 1000.0f;`)
        ln(`    ${v('weekend')} = _rtcWeekday_${id} == 0 || _rtcWeekday_${id} == 6;`)
        ln(`  }`)
        if (ntp) {
          ln(`  _wifiEnsureConnected();`)
          ln(`#if FLS_WIFI_SUPPORTED`)
          ln(`  if (_wifiConnected() && !_rtcNtpConfigured_${id}) {`)
          ln(`    configTime(${timezoneOffsetMinutes * 60}, 0, ${ntpServer});`)
          ln(`    _rtcNtpConfigured_${id} = true;`)
          ln(`  }`)
          ln(`  time_t _rtcEpoch_${id} = time(nullptr);`)
          ln(`  if (_rtcEpoch_${id} >= 946684800) {`)
          ln(`    struct tm _rtcTm_${id};`)
          ln(`    localtime_r(&_rtcEpoch_${id}, &_rtcTm_${id});`)
          ln(`    ${v('valid')} = true;`)
          ln(`    ${v('synced')} = _wifiConnected();`)
          ln(`    ${v('stale')} = !_wifiConnected();`)
          ln(`    ${v('hour')} = (float)_rtcTm_${id}.tm_hour;`)
          ln(`    ${v('minute')} = (float)_rtcTm_${id}.tm_min;`)
          ln(`    ${v('second')} = (float)_rtcTm_${id}.tm_sec;`)
          ln(`    ${v('weekday')} = (float)_rtcTm_${id}.tm_wday;`)
          ln(`    ${v('day')} = (float)_rtcTm_${id}.tm_mday;`)
          ln(`    ${v('month')} = (float)(_rtcTm_${id}.tm_mon + 1);`)
          ln(`    ${v('year')} = (float)(_rtcTm_${id}.tm_year + 1900);`)
          ln(`    ${v('secondsOfDay')} = (float)(_rtcTm_${id}.tm_hour * 3600 + _rtcTm_${id}.tm_min * 60 + _rtcTm_${id}.tm_sec);`)
          ln(`    ${v('weekend')} = _rtcTm_${id}.tm_wday == 0 || _rtcTm_${id}.tm_wday == 6;`)
          ln(`  }`)
          ln(`#endif`)
        }
        if (ds3231) {
          ln(`  static _RtcDateTime _rtcChip_${id};`)
          ln(`  static bool _rtcChipValid_${id} = false, _rtcChipStale_${id} = true, _rtcChipAttempted_${id} = false;`)
          ln(`  static uint32_t _rtcChipLastRead_${id} = 0;`)
          ln(`  uint32_t _rtcChipNow_${id} = millis();`)
          ln(`  if (!_rtcChipAttempted_${id} || (uint32_t)(_rtcChipNow_${id} - _rtcChipLastRead_${id}) >= 250u) {`)
          ln(`    _RtcDateTime _rtcCandidate_${id}; bool _rtcOscillatorStopped_${id} = true;`)
          ln(`    if (_rtcReadDs3231(_rtcCandidate_${id}, _rtcOscillatorStopped_${id})) {`)
          ln(`      _rtcChip_${id} = _rtcCandidate_${id};`)
          ln(`      _rtcChipValid_${id} = true;`)
          ln(`      _rtcChipStale_${id} = _rtcOscillatorStopped_${id};`)
          ln(`    } else if (_rtcChipValid_${id}) {`)
          ln(`      _rtcChipStale_${id} = true;  // retain the last good sample through a transient bus failure`)
          ln(`    }`)
          ln(`    _rtcChipAttempted_${id} = true;`)
          ln(`    _rtcChipLastRead_${id} = _rtcChipNow_${id};`)
          ln(`  }`)
          ln(`  if (_rtcChipValid_${id}) {`)
          ln(`    ${v('valid')} = true;`)
          ln(`    ${v('synced')} = !_rtcChipStale_${id};`)
          ln(`    ${v('stale')} = _rtcChipStale_${id};`)
          ln(`    ${v('hour')} = (float)_rtcChip_${id}.hour;`)
          ln(`    ${v('minute')} = (float)_rtcChip_${id}.minute;`)
          ln(`    ${v('second')} = (float)_rtcChip_${id}.second;`)
          ln(`    ${v('weekday')} = (float)_rtcChip_${id}.weekday;`)
          ln(`    ${v('day')} = (float)_rtcChip_${id}.day;`)
          ln(`    ${v('month')} = (float)_rtcChip_${id}.month;`)
          ln(`    ${v('year')} = (float)_rtcChip_${id}.year;`)
          ln(`    ${v('secondsOfDay')} = (float)((uint32_t)_rtcChip_${id}.hour * 3600u + (uint32_t)_rtcChip_${id}.minute * 60u + _rtcChip_${id}.second);`)
          ln(`    ${v('weekend')} = _rtcChip_${id}.weekday == 0 || _rtcChip_${id}.weekday == 6;`)
          ln(`  }`)
        }
        break
      }

      case 'ScheduleTrigger': {
        const mode = String(p.scheduleMode ?? 'Window')
        const dayMode = String(p.dayMode ?? 'Every day')
        const requireSync = p.requireSync === true
        const enabledDefault = p.enable !== false
        // Same per-field clamping the evaluator applies, via the shared helper,
        // so preview and firmware resolve the same instant.
        const startSec = scheduleTimeOfDay(p.startHour, p.startMinute, p.startSecond)
        const endSec = scheduleTimeOfDay(p.endHour, p.endMinute, p.endSecond)
        const sunday = p.sunday !== false
        const monday = p.monday !== false
        const tuesday = p.tuesday !== false
        const wednesday = p.wednesday !== false
        const thursday = p.thursday !== false
        const friday = p.friday !== false
        const saturday = p.saturday !== false
        ln(`  static bool _schedulePrevActive_${id} = false;`)
        ln(`  static int32_t _scheduleLastPulseDay_${id} = -1;`)
        // Previous usable seconds-of-day sample (negative = none), so Trigger
        // mode fires on the crossing of its instant instead of only while
        // inside a one-second window — see the evaluator's ScheduleState.
        ln(`  static float _schedulePrevSeconds_${id} = -1.0f;`)
        ln(`  static int32_t _schedulePrevDay_${id} = -1;`)
        ln(`  bool _scheduleValid_${id} = ${boolExpr(node.id, 'valid')};`)
        ln(`  bool _scheduleSynced_${id} = ${boolExpr(node.id, 'synced')};`)
        ln(`  bool _scheduleEnabled_${id} = ${incoming.has(`${node.id}:enable`) ? boolExpr(node.id, 'enable') : enabledDefault ? 'true' : 'false'};`)
        ln(`  int _scheduleWeekday_${id} = constrain((int)roundf(${floatExpr(node.id, 'weekday', p, 'weekday', 0)}), 0, 6);`)
        ln(`  float _scheduleSeconds_${id} = constrain(${floatExpr(node.id, 'secondsOfDay', p, 'secondsOfDay', 0)}, 0.0f, 86399.999f);`)
        ln(`  int _scheduleDay_${id} = constrain((int)roundf(${floatExpr(node.id, 'day', p, 'day', 1)}), 1, 31);`)
        ln(`  int _scheduleMonth_${id} = constrain((int)roundf(${floatExpr(node.id, 'month', p, 'month', 1)}), 1, 12);`)
        ln(`  int _scheduleYear_${id} = max(1970, (int)roundf(${floatExpr(node.id, 'year', p, 'year', 1970)}));`)
        ln(`  bool _scheduleDayAllowed_${id} = true;`)
        if (dayMode === 'Weekdays') {
          ln(`  _scheduleDayAllowed_${id} = _scheduleWeekday_${id} >= 1 && _scheduleWeekday_${id} <= 5;`)
        } else if (dayMode === 'Weekends') {
          ln(`  _scheduleDayAllowed_${id} = _scheduleWeekday_${id} == 0 || _scheduleWeekday_${id} == 6;`)
        } else if (dayMode === 'Custom') {
          ln(`  switch (_scheduleWeekday_${id}) {`)
          ln(`    case 0: _scheduleDayAllowed_${id} = ${sunday ? 'true' : 'false'}; break;`)
          ln(`    case 1: _scheduleDayAllowed_${id} = ${monday ? 'true' : 'false'}; break;`)
          ln(`    case 2: _scheduleDayAllowed_${id} = ${tuesday ? 'true' : 'false'}; break;`)
          ln(`    case 3: _scheduleDayAllowed_${id} = ${wednesday ? 'true' : 'false'}; break;`)
          ln(`    case 4: _scheduleDayAllowed_${id} = ${thursday ? 'true' : 'false'}; break;`)
          ln(`    case 5: _scheduleDayAllowed_${id} = ${friday ? 'true' : 'false'}; break;`)
          ln(`    default: _scheduleDayAllowed_${id} = ${saturday ? 'true' : 'false'}; break;`)
          ln(`  }`)
        }
        ln(`  bool _scheduleTimeReady_${id} = _scheduleValid_${id} && ${requireSync ? '_scheduleSynced_' + id : 'true'};`)
        ln(`  int32_t _scheduleDayKey_${id} = _scheduleYear_${id} * 10000 + _scheduleMonth_${id} * 100 + _scheduleDay_${id};`)
        ln(`  bool ${v('active')} = false;`)
        ln(`  bool ${v('start')} = false;`)
        ln(`  bool ${v('end')} = false;`)
        ln(`  float ${v('progress')} = 0.0f;`)
        ln(`  if (_scheduleEnabled_${id} && _scheduleTimeReady_${id} && _scheduleDayAllowed_${id}) {`)
        if (mode === 'Trigger') {
          // A new calendar day puts the whole day ahead of us; no previous
          // sample at all never fires, so a board booting after the instant
          // does not back-fire.
          ln(`    float _scheduleSince_${id} = _schedulePrevDay_${id} < 0 ? -2.0f`)
          ln(`      : (_schedulePrevDay_${id} == _scheduleDayKey_${id} ? _schedulePrevSeconds_${id} : -1.0f);`)
          ln(`    if (_scheduleSince_${id} > -2.0f && _scheduleSince_${id} < ${startSec}.0f && _scheduleSeconds_${id} >= ${startSec}.0f`)
          ln(`        && _scheduleLastPulseDay_${id} != _scheduleDayKey_${id}) {`)
          ln(`      ${v('start')} = true;`)
          ln(`      _scheduleLastPulseDay_${id} = _scheduleDayKey_${id};`)
          ln(`    }`)
        } else {
          if (startSec <= endSec) {
            ln(`    ${v('active')} = _scheduleSeconds_${id} >= ${startSec}.0f && _scheduleSeconds_${id} <= ${endSec}.0f;`)
          } else {
            ln(`    ${v('active')} = _scheduleSeconds_${id} >= ${startSec}.0f || _scheduleSeconds_${id} <= ${endSec}.0f;`)
          }
          // Mirrors scheduleWindowProgress: elapsed / span, both measured
          // across the wrap when the window crosses midnight.
          const span = endSec >= startSec ? endSec - startSec : 86400 - startSec + endSec
          if (span > 0) {
            ln(`    if (${v('active')}) {`)
            ln(`      float _scheduleElapsed_${id} = _scheduleSeconds_${id} >= ${startSec}.0f`)
            ln(`        ? _scheduleSeconds_${id} - ${startSec}.0f : ${86400 - startSec}.0f + _scheduleSeconds_${id};`)
            ln(`      ${v('progress')} = constrain(_scheduleElapsed_${id} / ${span}.0f, 0.0f, 1.0f);`)
            ln(`    }`)
          }
        }
        ln(`  }`)
        ln(`  if (${v('active')} && !_schedulePrevActive_${id}) ${v('start')} = true;`)
        ln(`  if (!${v('active')} && _schedulePrevActive_${id}) ${v('end')} = true;`)
        ln(`  _schedulePrevActive_${id} = ${v('active')};`)
        // Only remember a sample the clock vouched for, so the first frame
        // after a sync is a fresh start rather than one giant jump.
        ln(`  _schedulePrevSeconds_${id} = _scheduleTimeReady_${id} ? _scheduleSeconds_${id} : -1.0f;`)
        ln(`  _schedulePrevDay_${id} = _scheduleTimeReady_${id} ? _scheduleDayKey_${id} : -1;`)
        break
      }

      // Web MIDI has no embedded-hardware equivalent — preview-only, so
      // firmware just sees the idle default.
      case 'MidiInput':
        ln(`  float ${v('note')} = 0.0f; bool ${v('gate')} = false; float ${v('cc')} = 0.0f;`)
        break

      case 'SolidColor': {
        const ob = ownBuf()
        const r = Number(p.r ?? 255), g = Number(p.g ?? 0), b = Number(p.b ?? 128)
        const color = incoming.has(`${node.id}:color`) ? colorExpr(node.id, 'color') : `CRGB(${r}, ${g}, ${b})`
        ln(`  fill_solid(${ob}, NUM_LEDS, ${color});`)
        break
      }

      case 'Circle': {
        // A circle is Shape's ellipse at aspect 1 — same SDF coverage and
        // nblend compositing as the Shape case, so drawing matches exactly.
        const ob = ownBuf()
        const hexCrgb = (hex: unknown, def: number) => {
          const m = /^#([0-9a-f]{6})$/i.exec(String(hex))
          const n = m ? parseInt(m[1], 16) : def
          return `CRGB(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
        }
        const fillE = incoming.get(`${node.id}:fill`) ? colorExpr(node.id, 'fill') : hexCrgb(p.fill, 0xff3080)
        const edgeE = incoming.get(`${node.id}:edge`) ? colorExpr(node.id, 'edge') : hexCrgb(p.edge, 0xff0080)
        const filled = (p.filled ?? true) !== false
        const emitCirclePass = (cxExpr: string, cyExpr: string, indent: string) => {
          ln(`${indent}for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
          ln(`${indent}  float _dx=(_x+0.5f)-${cxExpr},_dy=(_y+0.5f)-${cyExpr},_sd=sqrtf(_dx*_dx+_dy*_dy)-_rad;`)
          ln(`${indent}  float _fc=${filled ? 'constrain(0.5f-_sd,0.0f,1.0f)' : '0.0f'};`)
          ln(`${indent}  float _ec=constrain(_th*0.5f+0.5f-fabsf(_sd),0.0f,1.0f);`)
          ln(`${indent}  float _al=max(_fc,_ec); if(_al<=0.0f) continue;`)
          ln(`${indent}  CRGB _col=_fill; nblend(_col,_edge,(uint8_t)(_ec*255.0f)); nblend(${ob}[_y*WIDTH+_x],_col,(uint8_t)(_al*255.0f)); }`)
        }
        ln(`  { ${seedFrom('base')}`)
        ln(`    float _rad=max(0.5f,${withMatrixScale(f('radius', 'radius', 6), p)});`)
        ln(`    CRGB _fill=${fillE},_edge=${edgeE};`)
        ln(`    float _th=max(0.0f,${f('thickness', 'thickness', 1.5)});`)
        ln(`    float _extent=_rad+_th*0.5f;`)
        ln(`    float _cxv=${f('cx', 'cx', 0.5)},_cyv=${f('cy', 'cy', 0.5)};`)
        if (p.wrap) {
          ln(`    float _cx=_cxv>1.0f?_cxv:(WIDTH*0.5f-WIDTH)+_cxv*(WIDTH*2.0f),_cy=_cyv>1.0f?_cyv:(HEIGHT*0.5f-HEIGHT)+_cyv*(HEIGHT*2.0f);`)
          ln(`    float _wrapX[3]={-(float)WIDTH,0.0f,(float)WIDTH};`)
          ln(`    float _wrapY[3]={-(float)HEIGHT,0.0f,(float)HEIGHT};`)
          ln(`    for(int _wy=0;_wy<3;_wy++) for(int _wx=0;_wx<3;_wx++){`)
          ln(`      float _wcx=_cx+_wrapX[_wx],_wcy=_cy+_wrapY[_wy];`)
          emitCirclePass('_wcx', '_wcy', '      ')
          ln(`    }`)
        } else {
          ln(`    float _m=_extent+1.0f;`)
          ln(`    float _cx=_cxv>1.0f?_cxv:(0.5f-_m)+_cxv*((WIDTH-1.0f)+2.0f*_m),_cy=_cyv>1.0f?_cyv:(0.5f-_m)+_cyv*((HEIGHT-1.0f)+2.0f*_m);`)
          emitCirclePass('_cx', '_cy', '    ')
        }
        break
      }

      case 'Line': {
        const ob = ownBuf()
        const colorE = incoming.get(`${node.id}:color`)
          ? colorExpr(node.id, 'color')
          : `CRGB(${Number(p.r ?? 0)}, ${Number(p.g ?? 200)}, ${Number(p.b ?? 255)})`
        const x1 = f('x1', 'x1', 0), y1 = f('y1', 'y1', 0)
        const x2 = f('x2', 'x2', 0), y2 = f('y2', 'y2', 0)
        ln(`  { ${seedFrom('base')}`)
        ln(`    float _x0 = ${x1}, _y0 = ${y1}, _x1 = ${x2}, _y1 = ${y2};`)
        ln(`    float _len = sqrtf((_x1 - _x0) * (_x1 - _x0) + (_y1 - _y0) * (_y1 - _y0));`)
        ln(`    int _steps = max(1, (int)ceilf(_len * 2.0f));`)
        ln(`    for (int _i = 0; _i <= _steps; _i++) {`)
        ln(`      float _u = _i / (float)_steps;`)
        ln(`      float _sx = _x0 + (_x1 - _x0) * _u, _sy = _y0 + (_y1 - _y0) * _u, _rad = 0.5f;`)
        ln(`      int _xmin = max(0, (int)floorf(_sx - _rad - 1.0f)), _xmax = min(WIDTH - 1, (int)ceilf(_sx + _rad + 1.0f));`)
        ln(`      int _ymin = max(0, (int)floorf(_sy - _rad - 1.0f)), _ymax = min(HEIGHT - 1, (int)ceilf(_sy + _rad + 1.0f));`)
        ln(`      for (int _y = _ymin; _y <= _ymax; _y++) for (int _x = _xmin; _x <= _xmax; _x++) {`)
        ln(`        float _dx = (_x + 0.5f) - _sx, _dy = (_y + 0.5f) - _sy;`)
        ln(`        float _cov = constrain(_rad + 0.5f - sqrtf(_dx * _dx + _dy * _dy), 0.0f, 1.0f);`)
        ln(`        if (_cov <= 0.0f) continue; CRGB _add = ${colorE}; _add.nscale8((uint8_t)(_cov * 255.0f)); ${ob}[_y * WIDTH + _x] += _add; } } }`)
        break
      }

      // Bundled shape: rect / ellipse / regular polygon, filled (fill colour)
      // and/or outlined (edge colour, thickness), over-composited with AA.
      // Fractional `sides` blends floor/ceil polygon SDFs for a seamless morph.
      // Keep in sync with evalShape() in graphEvaluator.ts.
      case 'Shape': {
        const ob = ownBuf()
        const hexCrgb = (hex: unknown, def: number) => {
          const m = /^#([0-9a-f]{6})$/i.exec(String(hex))
          const n = m ? parseInt(m[1], 16) : def
          return `CRGB(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
        }
        const shape = ['rect', 'ellipse'].includes(String(p.shape)) ? String(p.shape) : 'polygon'
        const cx = Number(p.cx ?? 0.5), cy = Number(p.cy ?? 0.5)
        const size = Math.max(0.5, Number(p.size ?? 6))
        const aspect = shape === 'polygon' ? 1 : Math.max(0.01, Number(p.aspect ?? 1))
        const rot = Number(p.rotation ?? 0)
        const thick = Math.max(0, Number(p.thickness ?? 1.5))
        const filled = (p.filled ?? true) !== false
        const fillE = incoming.get(`${node.id}:fill`) ? colorExpr(node.id, 'fill') : hexCrgb(p.fill, 0xff3080)
        const edgeE = incoming.get(`${node.id}:edge`) ? colorExpr(node.id, 'edge') : hexCrgb(p.edge, 0x00e0ff)
        const emitShapePass = (cxExpr: string, cyExpr: string, indent: string) => {
          ln(`${indent}for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
          ln(`${indent}  float _dx=(_x+0.5f)-${cxExpr},_dy=(_y+0.5f)-${cyExpr},_lx=_dx*_cr-_dy*_sr,_ly=_dx*_sr+_dy*_cr,_sd;`)
          if (shape === 'rect') {
            ln(`${indent}  float _ax=_size*_aspect,_ay=_size;`)
            ln(`${indent}  float _qx=fabsf(_lx)-_ax,_qy=fabsf(_ly)-_ay,_mx=max(_qx,0.0f),_my=max(_qy,0.0f);`)
            ln(`${indent}  _sd=sqrtf(_mx*_mx+_my*_my)+min(max(_qx,_qy),0.0f);`)
          } else if (shape === 'ellipse') {
            ln(`${indent}  float _ax=_size*_aspect,_ay=_size,_ex=_lx/_ax,_ey=_ly/_ay; _sd=(sqrtf(_ex*_ex+_ey*_ey)-1.0f)*min(_ax,_ay);`)
          } else {
            ln(`${indent}  float _r=sqrtf(_lx*_lx+_ly*_ly),_pa=atan2f(_ly,_lx);`)
            ln(`${indent}  float _s0=6.2831853f/_nlo,_a0=fmodf(fmodf(_pa,_s0)+_s0,_s0)-_s0*0.5f,_sdl=_r-_size*cosf(3.14159265f/_nlo)/cosf(_a0),_sd2=_sdl;`)
            ln(`${indent}  if(_fr>0.0f){ float _s1=6.2831853f/(_nlo+1),_a1=fmodf(fmodf(_pa,_s1)+_s1,_s1)-_s1*0.5f; _sd2=_r-_size*cosf(3.14159265f/(_nlo+1))/cosf(_a1); }`)
            ln(`${indent}  _sd=_sdl*(1.0f-_fr)+_sd2*_fr;`)
          }
          ln(`${indent}  float _fc=${filled ? 'constrain(0.5f-_sd,0.0f,1.0f)' : '0.0f'};`)
          ln(`${indent}  float _ec=constrain(_th*0.5f+0.5f-fabsf(_sd),0.0f,1.0f);`)
          ln(`${indent}  float _al=max(_fc,_ec); if(_al<=0.0f) continue;`)
          ln(`${indent}  CRGB _col=_fill; nblend(_col,_edge,(uint8_t)(_ec*255.0f)); nblend(${ob}[_y*WIDTH+_x],_col,(uint8_t)(_al*255.0f)); }`)
        }
        ln(`  { ${seedFrom('base')}`)
        ln(`    float _size=max(0.5f,${f('size', 'size', size)}),_aspect=max(0.01f,${f('aspect', 'aspect', aspect)}),_ra=-(${f('rotation', 'rotation', rot)})*0.01745329f,_cr=cosf(_ra),_sr=sinf(_ra);`)
        ln(`    CRGB _fill=${fillE},_edge=${edgeE};`)
        ln(`    float _th=max(0.0f,${f('thickness', 'thickness', thick)});`)
        if (shape === 'polygon') {
          ln(`    float _extentX=_size+_th*0.5f,_extentY=_size+_th*0.5f;`)
        } else {
          ln(`    float _ax=max(0.01f,_size*_aspect),_ay=max(0.01f,_size);`)
          ln(`    float _extentX=_ax*fabsf(_cr)+_ay*fabsf(_sr)+_th*0.5f,_extentY=_ax*fabsf(_sr)+_ay*fabsf(_cr)+_th*0.5f;`)
        }
        if (shape === 'polygon') ln(`    float _n=max(3.0f,(float)(${f('sides', 'sides', 5)})); int _nlo=(int)floorf(_n); float _fr=_n-_nlo;`)
        ln(`    float _cxv=${f('cx', 'cx', cx)},_cyv=${f('cy', 'cy', cy)};`)
        if (p.wrap) {
          ln(`    float _cx=_cxv>1.0f?_cxv:(WIDTH*0.5f-WIDTH)+_cxv*(WIDTH*2.0f),_cy=_cyv>1.0f?_cyv:(HEIGHT*0.5f-HEIGHT)+_cyv*(HEIGHT*2.0f);`)
          ln(`    float _wrapX[3]={-(float)WIDTH,0.0f,(float)WIDTH};`)
          ln(`    float _wrapY[3]={-(float)HEIGHT,0.0f,(float)HEIGHT};`)
          ln(`    for(int _wy=0;_wy<3;_wy++) for(int _wx=0;_wx<3;_wx++){`)
          ln(`      float _wcx=_cx+_wrapX[_wx],_wcy=_cy+_wrapY[_wy];`)
          emitShapePass('_wcx', '_wcy', '      ')
          ln(`    }`)
        } else {
          ln(`    float _mx=_extentX+1.0f,_my=_extentY+1.0f;`)
          ln(`    float _cx=_cxv>1.0f?_cxv:(0.5f-_mx)+_cxv*((WIDTH-1.0f)+2.0f*_mx),_cy=_cyv>1.0f?_cyv:(0.5f-_my)+_cyv*((HEIGHT-1.0f)+2.0f*_my);`)
          emitShapePass('_cx', '_cy', '    ')
        }
        ln(`  }`)
        break
      }

      case 'Path': {
        const ob = ownBuf()
        const colorE = incoming.get(`${node.id}:color`)
          ? colorExpr(node.id, 'color')
          : `CRGB(${Number(p.r ?? 255)}, ${Number(p.g ?? 220)}, ${Number(p.b ?? 80)})`
        const shape = String(p.pathShape ?? 'circle')
        const scale = Number(p.scale ?? 0.8)
        const thickness = Number(p.thickness ?? 1.25)
        const tExpr = f('t', 't', 0)
        let pathExpr = `float _px = cosf(_ang), _py = sinf(_ang);`
        if (shape === 'heart') {
          pathExpr = `float _px = 16.0f * powf(sinf(_ang), 3.0f) / 18.0f; float _py = (13.0f*cosf(_ang)-5.0f*cosf(_ang*2.0f)-2.0f*cosf(_ang*3.0f)-cosf(_ang*4.0f)) / 18.0f;`
        } else if (shape === 'lissajous') {
          pathExpr = `float _px = sinf(_ang + 1.5707963f), _py = sinf(_ang * 2.0f);`
        } else if (shape === 'rose') {
          pathExpr = `float _pr = cosf(_ang * 4.0f); float _px = _pr * cosf(_ang), _py = _pr * sinf(_ang);`
        }
        ln(`  { ${seedFrom('base')}`)
        ln(`    float _tt = constrain(${tExpr}, 0.0f, 1.0f);`)
        ln(`    float _ang = _tt * 6.2831853f;`)
        ln(`    ${pathExpr}`)
        ln(`    float _rad = max(0.25f, ${f('thickness', 'thickness', thickness)} * 0.5f);`)
        ln(`    float _ext = max(0.0f, min((float)WIDTH, (float)HEIGHT) * 0.5f * ${f('scale', 'scale', scale)} - _rad);`)
        ln(`    float _sx = (WIDTH - 1) * 0.5f + _px * _ext;`)
        ln(`    float _sy = (HEIGHT - 1) * 0.5f - _py * _ext;`)
        ln(`    int _x0 = max(0, (int)floorf(_sx - _rad - 1.0f)), _x1 = min(WIDTH - 1, (int)ceilf(_sx + _rad + 1.0f));`)
        ln(`    int _y0 = max(0, (int)floorf(_sy - _rad - 1.0f)), _y1 = min(HEIGHT - 1, (int)ceilf(_sy + _rad + 1.0f));`)
        ln(`    for (int _y = _y0; _y <= _y1; _y++) for (int _x = _x0; _x <= _x1; _x++) {`)
        ln(`      float _dx = (_x + 0.5f) - _sx, _dy = (_y + 0.5f) - _sy;`)
        ln(`      float _cov = constrain(_rad + 0.5f - sqrtf(_dx * _dx + _dy * _dy), 0.0f, 1.0f);`)
        ln(`      if (_cov <= 0.0f) continue; CRGB _add = ${colorE}; _add.nscale8((uint8_t)(_cov * 255.0f)); ${ob}[_y * WIDTH + _x] += _add; } }`)
        break
      }

      // Rotating 3D wireframe. The selected preset (or validated custom
      // upload) is baked as flat vertex/edge arrays at codegen time; the
      // per-frame rotation/projection/edge-rasterization math is a hand-port
      // of projectWireframeVertices() in state/wireframeModel.ts and the
      // Wireframe3D case in graphEvaluator.ts — keep all three in lockstep.
      case 'Wireframe3D': {
        const ob = ownBuf()
        needsT.v = true
        const mesh = resolveWireframeMesh(p.model, p.mesh)
        const vertCount = mesh.vertices.length / 3
        const edgeCount = mesh.edges.length / 2
        const radius = meshBoundingRadius(mesh)
        const spinX = Number(p.spinX ?? 0)
        const spinY = Number(p.spinY ?? 40)
        const spinZ = Number(p.spinZ ?? 0)
        const scaleMul = Math.max(0.05, Number(p.scale ?? 1))
        const perspective = p.projection === 'perspective'
        const strength = Math.max(0, Math.min(1, Number(p.perspectiveStrength ?? 0.4)))
        const camDist = WIREFRAME_CAM_FAR - strength * (WIREFRAME_CAM_FAR - WIREFRAME_CAM_NEAR)
        const depthShade = p.depthShade !== false
        const colorE = incoming.get(`${node.id}:color`)
          ? colorExpr(node.id, 'color')
          : `CRGB(${Number(p.r ?? 0)}, ${Number(p.g ?? 200)}, ${Number(p.b ?? 255)})`
        ln(`  { ${seedFrom('base')}`)
        ln(`    static const float _vtx_${id}[] = {${mesh.vertices.map((n) => `${n.toFixed(6)}f`).join(',')}};`)
        ln(`    static const uint8_t _edg_${id}[] = {${mesh.edges.join(',')}};`)
        ln(`    CRGB _wfColor = ${colorE};`)
        ln(`    float _ax = ${spinX.toFixed(3)}f * t * 0.017453293f, _ay = ${spinY.toFixed(3)}f * t * 0.017453293f, _az = ${spinZ.toFixed(3)}f * t * 0.017453293f;`)
        ln(`    float _cx1=cosf(_ax),_sx1=sinf(_ax),_cy1=cosf(_ay),_sy1=sinf(_ay),_cz1=cosf(_az),_sz1=sinf(_az);`)
        ln(`    float _ccx=(WIDTH-1)*0.5f,_ccy=(HEIGHT-1)*0.5f;`)
        ln(`    float _fit=(min((float)WIDTH,(float)HEIGHT)*0.5f)*${WIREFRAME_FIT_MARGIN}f*${scaleMul.toFixed(4)}f;`)
        ln(`    float _sxp[${vertCount}], _syp[${vertCount}], _sdp[${vertCount}];`)
        ln(`    for (int _i = 0; _i < ${vertCount}; _i++) {`)
        ln(`      float _x=_vtx_${id}[_i*3]/${radius.toFixed(6)}f,_y=_vtx_${id}[_i*3+1]/${radius.toFixed(6)}f,_z=_vtx_${id}[_i*3+2]/${radius.toFixed(6)}f;`)
        ln(`      float _ry=_y*_cx1-_z*_sx1,_rz=_y*_sx1+_z*_cx1; _y=_ry; _z=_rz;`)
        ln(`      float _rx=_x*_cy1+_z*_sy1; _rz=-_x*_sy1+_z*_cy1; _x=_rx; _z=_rz;`)
        ln(`      _rx=_x*_cz1-_y*_sz1; _ry=_x*_sz1+_y*_cz1; _x=_rx; _y=_ry;`)
        if (perspective) {
          ln(`      float _factor=${camDist.toFixed(4)}f/(${camDist.toFixed(4)}f-_z);`)
          ln(`      _sxp[_i]=_ccx+_x*_factor*_fit; _syp[_i]=_ccy-_y*_factor*_fit;`)
        } else {
          ln(`      _sxp[_i]=_ccx+_x*_fit; _syp[_i]=_ccy-_y*_fit;`)
        }
        ln(`      _sdp[_i]=(_z+1.0f)*0.5f;`)
        ln(`    }`)
        ln(`    for (int _e = 0; _e < ${edgeCount}; _e++) {`)
        ln(`      int _i0=_edg_${id}[_e*2],_i1=_edg_${id}[_e*2+1];`)
        ln(`      float _x0=_sxp[_i0],_y0=_syp[_i0],_x1=_sxp[_i1],_y1=_syp[_i1];`)
        ln(`      float _len=sqrtf((_x1-_x0)*(_x1-_x0)+(_y1-_y0)*(_y1-_y0));`)
        ln(`      int _steps=max(1,(int)ceilf(_len*2.0f));`)
        ln(`      for (int _s = 0; _s <= _steps; _s++) {`)
        ln(`        float _u=_s/(float)_steps;`)
        ln(`        float _px=_x0+(_x1-_x0)*_u,_py=_y0+(_y1-_y0)*_u;`)
        if (depthShade) {
          ln(`        float _depth=_sdp[_i0]+(_sdp[_i1]-_sdp[_i0])*_u,_bright=0.35f+0.65f*_depth;`)
        } else {
          ln(`        float _bright=1.0f;`)
        }
        ln(`        float _rad=0.5f;`)
        ln(`        int _xmin=max(0,(int)floorf(_px-_rad-1.0f)),_xmax=min(WIDTH-1,(int)ceilf(_px+_rad+1.0f));`)
        ln(`        int _ymin=max(0,(int)floorf(_py-_rad-1.0f)),_ymax=min(HEIGHT-1,(int)ceilf(_py+_rad+1.0f));`)
        ln(`        for (int _y = _ymin; _y <= _ymax; _y++) for (int _x = _xmin; _x <= _xmax; _x++) {`)
        ln(`          float _dx=(_x+0.5f)-_px,_dy=(_y+0.5f)-_py;`)
        ln(`          float _cov=constrain(_rad+0.5f-sqrtf(_dx*_dx+_dy*_dy),0.0f,1.0f);`)
        ln(`          if (_cov<=0.0f) continue; CRGB _add=_wfColor; _add.nscale8((uint8_t)(_bright*_cov*255.0f)); ${ob}[_y*WIDTH+_x] += _add; } } }`)
        ln(`  }`)
        break
      }

      case 'Text': {
        const ob = ownBuf()
        const text = String(p.text ?? 'HELLO')
        const font = asFont(p.font)
        const letterSpacing = Math.max(0, Math.round(Number(p.letterSpacing ?? 1)))
        const layout = textBlockLayout(text, font, letterSpacing)
        const hAlign = textAlignMode(p.hAlign ?? 'center', 'left', 'right')
        const vAlign = textAlignMode(p.vAlign ?? 'middle', 'top', 'bottom')
        const scrollAxis: 'horizontal' | 'vertical' = p.scrollAxis === 'vertical' ? 'vertical' : 'horizontal'
        const wrap = Boolean(p.wrap)
        const renderableLines = layout.lines
          .map((line, index) => ({ ...line, index }))
          .filter((line) => line.cols.length > 0)
        const dynamic = !!incoming.get(`${node.id}:scroll`) || Number(p.scroll ?? 0) !== 0
        const colorE = incoming.get(`${node.id}:color`)
          ? colorExpr(node.id, 'color')
          : `CRGB(${Number(p.r ?? 0)}, ${Number(p.g ?? 255)}, ${Number(p.b ?? 255)})`
        ln(`  { // Text "${text.replace(/[^ -~]/g, '?')}"`)
        for (const line of renderableLines) {
          ln(`    static const uint8_t _txt_${id}_${line.index}[] = {${line.cols.join(',')}};`)
          ln(`    const int _tn_${id}_${line.index} = ${line.cols.length};`)
        }
        ln(`    fill_solid(${ob}, NUM_LEDS, CRGB::Black);`)
        if (dynamic) {
          needsT.v = true
          if (scrollAxis === 'vertical') {
            ln(`    int _totY = ${layout.height} + HEIGHT, _offY = (((int)(t * (${f('scroll', 'scroll', 0)})) % _totY) + _totY) % _totY, _offX = 0;`)
          } else {
            ln(`    int _totX = ${layout.width} + WIDTH, _offX = (((int)(t * (${f('scroll', 'scroll', 0)})) % _totX) + _totX) % _totX, _offY = 0;`)
          }
        } else {
          ln(`    int _offX = 0, _offY = 0;`)
        }
        const syExpr = textAxisStartExpr(f('y', 'y', 0.5), 'HEIGHT', `${layout.height}`, vAlign, wrap)
        ln(`    int _sy = (int)${syExpr};`)
        for (const line of renderableLines) {
          const sxExpr = textAxisStartExpr(f('x', 'x', 0.5), 'WIDTH', `_tn_${id}_${line.index}`, hAlign, wrap)
          ln(`    int _sx_${line.index} = (int)${sxExpr};`)
        }
        if (wrap) {
          ln(`    int _wrapX[3] = {-WIDTH, 0, WIDTH};`)
          ln(`    int _wrapY[3] = {-HEIGHT, 0, HEIGHT};`)
          ln(`    for (int _wy = 0; _wy < 3; _wy++) for (int _wx = 0; _wx < 3; _wx++) {`)
          for (const line of renderableLines) {
            const lineOffset = line.index * (font.h + TEXT_LINE_GAP)
            ln(`      for (int _x = 0; _x < WIDTH; _x++) { int _ci = _x - (_sx_${line.index} + _wrapX[_wx]) + _offX; if (_ci < 0 || _ci >= _tn_${id}_${line.index}) continue; uint8_t _col = _txt_${id}_${line.index}[_ci];`)
            ln(`        for (int _r = 0; _r < ${font.h}; _r++) if (_col & (1 << _r)) { int _yy = (_sy + _wrapY[_wy] + ${lineOffset}) + _r - _offY; if (_yy >= 0 && _yy < HEIGHT) ${ob}[_yy * WIDTH + _x] = ${colorE}; } }`)
          }
          ln(`    }`)
        } else {
          for (const line of renderableLines) {
            const lineOffset = line.index * (font.h + TEXT_LINE_GAP)
            ln(`    for (int _x = 0; _x < WIDTH; _x++) { int _ci = _x - _sx_${line.index} + _offX; if (_ci < 0 || _ci >= _tn_${id}_${line.index}) continue; uint8_t _col = _txt_${id}_${line.index}[_ci];`)
            ln(`      for (int _r = 0; _r < ${font.h}; _r++) if (_col & (1 << _r)) { int _yy = (_sy + ${lineOffset}) + _r - _offY; if (_yy >= 0 && _yy < HEIGHT) ${ob}[_yy * WIDTH + _x] = ${colorE}; } }`)
          }
        }
        ln(`  }`)
        break
      }

      case 'ClockDisplay': {
        const ob = ownBuf()
        const mode = String(p.displayMode ?? 'Digital HH:MM')
        const analog = mode === 'Analog' || mode === 'Analog + Date'
        const transport = mode === 'Stopwatch' || mode === 'Timer'
        const hAlign = textAlignMode(p.hAlign ?? 'center', 'left', 'right')
        const vAlign = textAlignMode(p.vAlign ?? 'middle', 'top', 'bottom')
        const colorE = incoming.get(`${node.id}:color`)
          ? colorExpr(node.id, 'color')
          : `CRGB(${Number(p.r ?? 255)}, ${Number(p.g ?? 220)}, ${Number(p.b ?? 90)})`
        const xExpr = f('x', 'x', 0.5)
        const yExpr = f('y', 'y', 0.5)
        // The evaluator treats an unwired `valid` as true whenever a time is
        // available, so a graph that wires the seconds but not the valid flag
        // must not preview a running clock and then flash dashes. With neither
        // wired there is no clock at all on hardware, so dashes are correct —
        // buildGraphDiagnostics flags that case.
        const validExpr = incoming.get(`${node.id}:valid`)
          ? boolExpr(node.id, 'valid')
          : (incoming.get(`${node.id}:secondsOfDay`) ? 'true' : 'false')
        const secondsExpr = f('secondsOfDay', 'secondsOfDay', 0)
        const dayExpr = f('day', 'day', 1)
        const monthExpr = f('month', 'month', 1)
        const runExpr = incoming.get(`${node.id}:run`) ? boolExpr(node.id, 'run') : (p.run === false ? 'false' : 'true')
        const resetExpr = incoming.get(`${node.id}:reset`) ? boolExpr(node.id, 'reset') : (p.reset === true ? 'true' : 'false')
        const durationExpr = `max(0.0f, ${f('durationSec', 'durationSec', 300)})`
        // Declared outside the render block so downstream nodes can read the
        // transport readouts (clock modes pass the time of day through).
        ln(`  float ${v('seconds')} = 0.0f; bool ${v('done')} = false;`)
        ln(`  { // Clock Display`)
        ln(`    ${seedFrom('base')}`)
        ln(`    auto _clkPx = [&](int _x, int _y, const CRGB &_col) {`)
        ln(`      if (_x < 0 || _x >= WIDTH || _y < 0 || _y >= HEIGHT) return;`)
        ln(`      CRGB &_dst = ${ob}[_y * WIDTH + _x];`)
        ln(`      _dst.r = max(_dst.r, _col.r); _dst.g = max(_dst.g, _col.g); _dst.b = max(_dst.b, _col.b);`)
        ln(`    };`)
        // The clock's text is assembled at runtime (unlike the Text node, whose
        // string is known here and baked as columns), so the sketch carries a
        // glyph lookup — generated from the shared bitmap font in state/font.ts
        // rather than hand-transcribed, so preview and firmware cannot drift.
        ln(`    static const char _clkChars_${id}[] = "${CLOCK_GLYPH_CHARS}";`)
        ln(`    static const uint8_t _clkGlyphs_${id}[][${FONT_W}] = {${
          [...CLOCK_GLYPH_CHARS].map((ch) => `{${textColumns(ch, DEFAULT_FONT, 0).join(',')}}`).join(', ')
        }};`)
        ln(`    auto _clkCols = [&](char _ch, uint8_t *_cols) {`)
        ln(`      for (int _c = 0; _c < ${FONT_W}; _c++) _cols[_c] = 0;`)
        ln(`      for (int _g = 0; _clkChars_${id}[_g]; _g++) if (_clkChars_${id}[_g] == _ch) {`)
        ln(`        for (int _c = 0; _c < ${FONT_W}; _c++) _cols[_c] = _clkGlyphs_${id}[_g][_c];`)
        ln(`        return;`)
        ln(`      }`)
        ln(`    };`)
        ln(`    auto _clkText = [&](const char *_s, int _sx, int _sy, const CRGB &_col) {`)
        ln(`      for (int _i = 0; _s[_i]; _i++) {`)
        ln(`        uint8_t _cols[${FONT_W}]; _clkCols(_s[_i], _cols);`)
        ln(`        for (int _c = 0; _c < ${FONT_W}; _c++) { int _x = _sx + _i * ${FONT_W} + _c; if (_x < 0 || _x >= WIDTH) continue; uint8_t _bits = _cols[_c];`)
        ln(`          for (int _r = 0; _r < ${FONT_H}; _r++) if (_bits & (1 << _r)) _clkPx(_x, _sy + _r, _col); }`)
        ln(`      }`)
        ln(`    };`)
        ln(`    auto _clkLine = [&](float _x0, float _y0, float _x1, float _y1, const CRGB &_col) {`)
        ln(`      int _steps = max(1, (int)ceilf(max(fabsf(_x1 - _x0), fabsf(_y1 - _y0)) * 2.0f));`)
        ln(`      for (int _i = 0; _i <= _steps; _i++) { float _tt = _steps > 0 ? (float)_i / (float)_steps : 0.0f; _clkPx((int)roundf(_x0 + (_x1 - _x0) * _tt), (int)roundf(_y0 + (_y1 - _y0) * _tt), _col); }`)
        ln(`    };`)
        ln(`    auto _clkRing = [&](float _cx, float _cy, float _rad, const CRGB &_col) {`)
        ln(`      int _x0 = max(0, (int)floorf(_cx - _rad - 1.0f)), _x1 = min(WIDTH - 1, (int)ceilf(_cx + _rad + 1.0f));`)
        ln(`      int _y0 = max(0, (int)floorf(_cy - _rad - 1.0f)), _y1 = min(HEIGHT - 1, (int)ceilf(_cy + _rad + 1.0f));`)
        ln(`      for (int _y = _y0; _y <= _y1; _y++) for (int _x = _x0; _x <= _x1; _x++) {`)
        ln(`        float _dx = _x - _cx, _dy = _y - _cy; if (fabsf(sqrtf(_dx * _dx + _dy * _dy) - _rad) <= 0.65f) _clkPx(_x, _y, _col);`)
        ln(`      }`)
        ln(`    };`)
        // Pixel extents of the strings each mode prints, derived from the
        // shared font so they stay in step with blitText's own layout maths.
        const glyphRun = (chars: number) => `${chars * FONT_W}`
        const twoLineHeight = `${FONT_H * 2 + TEXT_LINE_GAP}`
        const subLineOffset = FONT_H + TEXT_LINE_GAP
        if (transport) {
          const syExpr = textAxisStartExpr(yExpr, 'HEIGHT', twoLineHeight, vAlign, false)
          const sxMainExpr = textAxisStartExpr(xExpr, 'WIDTH', glyphRun(5), hAlign, false)
          const sxSubExpr = textAxisStartExpr(xExpr, 'WIDTH', glyphRun(2), hAlign, false)
          ln(`    static float _clkElapsed_${id} = 0.0f, _clkRemaining_${id} = 0.0f, _clkLastDuration_${id} = -1.0f;`)
          ln(`    static uint32_t _clkLastMs_${id} = 0; static bool _clkPrevReset_${id} = false;`)
          ln(`    uint32_t _clkNow_${id} = millis(); float _clkDuration_${id} = ${durationExpr}; bool _clkRun_${id} = ${runExpr}; bool _clkReset_${id} = ${resetExpr};`)
          ln(`    if (_clkLastMs_${id} == 0 || _clkNow_${id} < _clkLastMs_${id}) { _clkLastMs_${id} = _clkNow_${id}; _clkElapsed_${id} = 0.0f; _clkRemaining_${id} = _clkDuration_${id}; _clkLastDuration_${id} = _clkDuration_${id}; _clkPrevReset_${id} = false; }`)
          ln(`    float _clkDt_${id} = min(0.25f, max(0.0f, (_clkNow_${id} - _clkLastMs_${id}) / 1000.0f));`)
          ln(`    if (fabsf(_clkLastDuration_${id} - _clkDuration_${id}) > 0.0001f) { _clkRemaining_${id} = _clkDuration_${id}; _clkLastDuration_${id} = _clkDuration_${id}; _clkDt_${id} = 0.0f; }`)
          ln(`    bool _clkResetEdge_${id} = _clkReset_${id} && !_clkPrevReset_${id};`)
          ln(`    if (_clkResetEdge_${id}) { _clkElapsed_${id} = 0.0f; _clkRemaining_${id} = _clkDuration_${id}; _clkDt_${id} = 0.0f; }`)
          if (mode === 'Timer') ln(`    if (_clkRun_${id}) _clkRemaining_${id} = max(0.0f, _clkRemaining_${id} - _clkDt_${id});`)
          else ln(`    if (_clkRun_${id}) _clkElapsed_${id} += _clkDt_${id};`)
          ln(`    _clkLastMs_${id} = _clkNow_${id}; _clkPrevReset_${id} = _clkReset_${id};`)
          ln(`    float _clkShow_${id} = ${mode === 'Timer' ? `_clkRemaining_${id}` : `_clkElapsed_${id}`};`)
          ln(`    ${v('seconds')} = _clkShow_${id};`)
          ln(`    ${v('done')} = ${mode === 'Timer' ? `_clkRemaining_${id} <= 0.0f` : 'false'};`)
          ln(`    int _clkWhole_${id} = max(0, (int)floorf(_clkShow_${id}));`)
          ln(`    int _clkHours_${id} = _clkWhole_${id} / 3600, _clkMinutes_${id} = (_clkWhole_${id} % 3600) / 60, _clkSeconds_${id} = _clkWhole_${id} % 60;`)
          ln(`    int _clkCentis_${id} = ((int)floorf((_clkShow_${id} - _clkWhole_${id}) * 100.0f)) % 100;`)
          ln(`    char _clkMain_${id}[6], _clkSub_${id}[3];`)
          ln(`    if (_clkHours_${id} > 0) { snprintf(_clkMain_${id}, sizeof(_clkMain_${id}), "%02d:%02d", min(_clkHours_${id}, 99), _clkMinutes_${id}); snprintf(_clkSub_${id}, sizeof(_clkSub_${id}), "%02d", _clkSeconds_${id}); }`)
          ln(`    else { snprintf(_clkMain_${id}, sizeof(_clkMain_${id}), "%02d:%02d", _clkMinutes_${id}, _clkSeconds_${id}); snprintf(_clkSub_${id}, sizeof(_clkSub_${id}), "%02d", _clkCentis_${id}); }`)
          ln(`    int _clkSy_${id} = (int)${syExpr}, _clkSx0_${id} = (int)${sxMainExpr}, _clkSx1_${id} = (int)${sxSubExpr};`)
          ln(`    _clkText(_clkMain_${id}, _clkSx0_${id}, _clkSy_${id}, ${colorE});`)
          ln(`    _clkText(_clkSub_${id}, _clkSx1_${id}, _clkSy_${id} + ${subLineOffset}, ${colorE});`)
        } else if (analog) {
          const radiusExpr = `max(2.0f, ${withMatrixScale(f('radius', 'radius', 6), p)})`
          ln(`    float _clkRad_${id} = ${radiusExpr};`)
          ln(`    float _clkXv_${id} = ${xExpr}, _clkYv_${id} = ${yExpr};`)
          ln(`    float _clkCx_${id} = _clkXv_${id} > 1.0f ? _clkXv_${id} : (0.5f - (_clkRad_${id} + 1.0f)) + _clkXv_${id} * ((WIDTH - 1.0f) + 2.0f * (_clkRad_${id} + 1.0f));`)
          ln(`    float _clkCy_${id} = _clkYv_${id} > 1.0f ? _clkYv_${id} : (0.5f - (_clkRad_${id} + 1.0f)) + _clkYv_${id} * ((HEIGHT - 1.0f) + 2.0f * (_clkRad_${id} + 1.0f));`)
          ln(`    float _clkSec_${id} = ${validExpr} ? ${secondsExpr} : 0.0f;`)
          ln(`    while (_clkSec_${id} < 0.0f) _clkSec_${id} += 86400.0f; while (_clkSec_${id} >= 86400.0f) _clkSec_${id} -= 86400.0f;`)
          ln(`    ${v('seconds')} = ${validExpr} ? _clkSec_${id} : 0.0f;`)
          ln(`    int _clkHour_${id} = (int)floorf(_clkSec_${id} / 3600.0f); int _clkMinute_${id} = ((int)floorf(_clkSec_${id} / 60.0f)) % 60;`)
          ln(`    float _clkRingScale_${id} = 0.45f, _clkTickScale_${id} = 0.30f, _clkSecondScale_${id} = 0.70f;`)
          ln(`    CRGB _clkRingCol_${id} = ${colorE}; _clkRingCol_${id}.nscale8((uint8_t)(_clkRingScale_${id} * 255.0f));`)
          ln(`    CRGB _clkTickCol_${id} = ${colorE}; _clkTickCol_${id}.nscale8((uint8_t)(_clkTickScale_${id} * 255.0f));`)
          ln(`    CRGB _clkSecondCol_${id} = ${colorE}; _clkSecondCol_${id}.nscale8((uint8_t)(_clkSecondScale_${id} * 255.0f));`)
          ln(`    _clkRing(_clkCx_${id}, _clkCy_${id}, _clkRad_${id}, _clkRingCol_${id});`)
          ln(`    for (int _m = 0; _m < 4; _m++) { float _a = -1.5707963f + _m * 1.5707963f; _clkPx((int)roundf(_clkCx_${id} + cosf(_a) * _clkRad_${id}), (int)roundf(_clkCy_${id} + sinf(_a) * _clkRad_${id}), _clkTickCol_${id}); }`)
          ln(`    float _clkHourA_${id} = -1.5707963f + (((_clkHour_${id} % 12) + _clkMinute_${id} / 60.0f + fmodf(_clkSec_${id}, 60.0f) / 3600.0f) / 12.0f) * 6.2831853f;`)
          ln(`    float _clkMinuteA_${id} = -1.5707963f + ((_clkMinute_${id} + fmodf(_clkSec_${id}, 60.0f) / 60.0f) / 60.0f) * 6.2831853f;`)
          ln(`    float _clkSecondA_${id} = -1.5707963f + (fmodf(_clkSec_${id}, 60.0f) / 60.0f) * 6.2831853f;`)
          ln(`    _clkLine(_clkCx_${id}, _clkCy_${id}, _clkCx_${id} + cosf(_clkHourA_${id}) * max(2.0f, _clkRad_${id} * 0.50f), _clkCy_${id} + sinf(_clkHourA_${id}) * max(2.0f, _clkRad_${id} * 0.50f), ${colorE});`)
          ln(`    _clkLine(_clkCx_${id}, _clkCy_${id}, _clkCx_${id} + cosf(_clkMinuteA_${id}) * max(3.0f, _clkRad_${id} * 0.78f), _clkCy_${id} + sinf(_clkMinuteA_${id}) * max(3.0f, _clkRad_${id} * 0.78f), ${colorE});`)
          ln(`    _clkLine(_clkCx_${id}, _clkCy_${id}, _clkCx_${id} + cosf(_clkSecondA_${id}) * max(3.0f, _clkRad_${id} * 0.92f), _clkCy_${id} + sinf(_clkSecondA_${id}) * max(3.0f, _clkRad_${id} * 0.92f), _clkSecondCol_${id});`)
          ln(`    _clkPx((int)roundf(_clkCx_${id}), (int)roundf(_clkCy_${id}), ${colorE});`)
          if (mode === 'Analog + Date') {
            const dateXExpr = textAxisStartExpr(xExpr, 'WIDTH', glyphRun(5), 'center', false)
            ln(`    char _clkDate_${id}[6];`)
            ln(`    if (${validExpr}) snprintf(_clkDate_${id}, sizeof(_clkDate_${id}), "%02d.%02d", (int)(${dayExpr}), (int)(${monthExpr}));`)
            ln(`    else memcpy(_clkDate_${id}, "--.--", 6);`)
            ln(`    CRGB _clkDateCol_${id} = ${colorE}; _clkDateCol_${id}.nscale8((uint8_t)(0.90f * 255.0f));`)
            ln(`    _clkText(_clkDate_${id}, (int)${dateXExpr}, (int)floorf(_clkCy_${id} + _clkRad_${id} + 1.0f), _clkDateCol_${id});`)
          }
        } else {
          const twoLine = mode !== 'Digital HH:MM'
          const syExpr = textAxisStartExpr(yExpr, 'HEIGHT', twoLine ? twoLineHeight : `${FONT_H}`, vAlign, false)
          const sxMainExpr = textAxisStartExpr(xExpr, 'WIDTH', glyphRun(5), hAlign, false)
          const sxSubExpr = textAxisStartExpr(xExpr, 'WIDTH', glyphRun(mode === 'Digital + Date' ? 5 : 2), hAlign, false)
          ln(`    float _clkSec_${id} = ${secondsExpr}; while (_clkSec_${id} < 0.0f) _clkSec_${id} += 86400.0f; while (_clkSec_${id} >= 86400.0f) _clkSec_${id} -= 86400.0f;`)
          ln(`    ${v('seconds')} = ${validExpr} ? _clkSec_${id} : 0.0f;`)
          ln(`    int _clkHour_${id} = (int)floorf(_clkSec_${id} / 3600.0f), _clkMinute_${id} = ((int)floorf(_clkSec_${id} / 60.0f)) % 60, _clkSecond_${id} = ((int)floorf(_clkSec_${id})) % 60;`)
          ln(`    char _clkMain_${id}[6], _clkSub_${id}[6] = "";`)
          if (mode === 'Digital HH:MM:SS') {
            ln(`    if (${validExpr}) { snprintf(_clkMain_${id}, sizeof(_clkMain_${id}), "%02d:%02d", _clkHour_${id}, _clkMinute_${id}); snprintf(_clkSub_${id}, sizeof(_clkSub_${id}), "%02d", _clkSecond_${id}); }`)
            ln(`    else { memcpy(_clkMain_${id}, "--:--", 6); memcpy(_clkSub_${id}, "--", 3); }`)
          } else if (mode === 'Digital 12H') {
            ln(`    if (${validExpr}) { int _clkH12_${id} = _clkHour_${id} % 12; if (_clkH12_${id} == 0) _clkH12_${id} = 12; snprintf(_clkMain_${id}, sizeof(_clkMain_${id}), "%02d:%02d", _clkH12_${id}, _clkMinute_${id}); memcpy(_clkSub_${id}, _clkHour_${id} < 12 ? "AM" : "PM", 3); }`)
            ln(`    else { memcpy(_clkMain_${id}, "--:--", 6); memcpy(_clkSub_${id}, "--", 3); }`)
          } else if (mode === 'Digital + Date') {
            ln(`    if (${validExpr}) { snprintf(_clkMain_${id}, sizeof(_clkMain_${id}), "%02d:%02d", _clkHour_${id}, _clkMinute_${id}); snprintf(_clkSub_${id}, sizeof(_clkSub_${id}), "%02d.%02d", (int)(${dayExpr}), (int)(${monthExpr})); }`)
            ln(`    else { memcpy(_clkMain_${id}, "--:--", 6); memcpy(_clkSub_${id}, "--.--", 6); }`)
          } else {
            ln(`    if (${validExpr}) snprintf(_clkMain_${id}, sizeof(_clkMain_${id}), "%02d:%02d", _clkHour_${id}, _clkMinute_${id});`)
            ln(`    else memcpy(_clkMain_${id}, "--:--", 6);`)
          }
          ln(`    int _clkSy_${id} = (int)${syExpr}, _clkSx0_${id} = (int)${sxMainExpr};`)
          ln(`    _clkText(_clkMain_${id}, _clkSx0_${id}, _clkSy_${id}, ${colorE});`)
          if (twoLine) {
            ln(`    int _clkSx1_${id} = (int)${sxSubExpr};`)
            ln(`    _clkText(_clkSub_${id}, _clkSx1_${id}, _clkSy_${id} + ${subLineOffset}, ${colorE});`)
          }
        }
        ln(`  }`)
        break
      }

      // Bundled noise node — `noiseType` picks the algorithm. Each variant
      // writes a raw scalar field, then the node maps that field through its
      // palette for the normal frame output. Keep the cases in sync with
      // PROPERTY_META.noiseType and the `Noise` case in graphEvaluator.
      case 'Noise': {
        needsT.v = true
        const ob = ownBuf()
        const of = ownField()
        const noiseType = String(p.noiseType ?? 'field')
        const speed = rateCpp(f('speed', 'speed', 0.5), NOISE_SPEED_MAX[noiseType] ?? 1)
        const scale = rateCpp(f('scale', 'scale', 0.5), NOISE_SCALE_MAX[noiseType] ?? 1)
        const seed = seedProp(p)
        const timeExpr = seed ? `(t+${(seed * 0.013).toFixed(3)}f)` : 't'
        const pal = paletteExpr(node.id, 'paletteIn', p)
        switch (noiseType) {
          case 'simplex':
            ln(`  { // Simplex2D`)
            ln(`    float _spd=${speed},_sc=${scale},_t=${timeExpr};`)
            ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
            ln(`      float _n=sin(_x*_sc+sin(_y*_sc*0.8f+_t*_spd*0.5f)+_t*_spd)`)
            ln(`            +0.5f*sin(_x*_sc*2+_t*_spd*1.9f)+0.25f*sin(_x*_sc*4+_t*_spd*4.1f);`)
            ln(`      ${of}[_y*WIDTH+_x]=constrain(_n*0.25f+0.5f,0.0f,1.0f);}}`)
            break
          case 'noise3d':
            ln(`  { // Noise3D`)
            ln(`    float _spd=${speed},_sc=${scale},_t=${timeExpr};`)
            ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
            ln(`      float _n=(sin(_x*_sc+_t*_spd)+cos(_y*_sc+_t*_spd*0.7f))*0.5f`)
            ln(`            +(sin(_x*_sc*1.7f+_t*_spd*1.3f+_y*_sc*0.9f)*0.33f)`)
            ln(`            +(cos(_x*_sc*2.9f+_t*_spd*2.1f)*0.17f);`)
            ln(`      ${of}[_y*WIDTH+_x]=constrain(_n*0.3f+0.5f,0.0f,1.0f);}}`)
            break
          case 'noise4d':
            ln(`  { // Noise4D (looping inoise16 x,y,z,t path)`)
            ln(`    float _spd=${speed},_sc=${scale},_t=${timeExpr},_ang=_t*_spd*6.2831853f;`)
            ln(`    uint32_t _z=(uint32_t)((cosf(_ang)*0.5f+0.5f)*65535.0f);`)
            ln(`    uint32_t _w=(uint32_t)((sinf(_ang)*0.5f+0.5f)*65535.0f);`)
            ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
            ln(`      float _amp=1.0f,_fr=_sc*128.0f,_fn=0.0f,_sum=0.0f;`)
            ln(`      for(int _o=0;_o<3;_o++){`)
            ln(`        uint16_t _raw=inoise16((uint32_t)(_x*_fr),(uint32_t)(_y*_fr),_z+(uint32_t)(_o*8192),_w+(uint32_t)(_o*12288));`)
            ln(`        _fn+=_amp*(_raw/65535.0f); _sum+=_amp; _amp*=0.5f; _fr*=2.0f;`)
            ln(`      }`)
            ln(`      ${of}[_y*WIDTH+_x]=constrain(_fn/max(0.001f,_sum),0.0f,1.0f);`)
            ln(`    }`)
            ln(`  }`)
            break
          case 'worley':
            needsWorley.v = true
            ln(`  { // Worley noise`)
            ln(`    float _spd=${speed},_sc=${scale},_t=${timeExpr};`)
            ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
            ln(`      float _px=_x*_sc,_py=_y*_sc; int _xi=(int)floorf(_px),_yi=(int)floorf(_py); float _f1=1e9f;`)
            ln(`      for(int _dj=-1;_dj<=1;_dj++) for(int _di=-1;_di<=1;_di++){`)
            ln(`        int _cx=_xi+_di,_cy=_yi+_dj; float _h=_worleyHash(_cx,_cy);`)
            ln(`        float _fx=_cx+0.5f+0.45f*sin(_t*_spd+_h*6.2831f);`)
            ln(`        float _fy=_cy+0.5f+0.45f*cos(_t*_spd*1.1f+_h*6.2831f);`)
            ln(`        float _d=sqrtf((_px-_fx)*(_px-_fx)+(_py-_fy)*(_py-_fy)); if(_d<_f1)_f1=_d; }`)
            ln(`      ${of}[_y*WIDTH+_x]=min(1.0f,_f1);}}`)
            break
          case 'plasma':
            ln(`  { float _spd=${speed},_sc=${scale},_t=${timeExpr}; uint16_t _z=(uint16_t)(_t*_spd*10);`)
            ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
            ln(`      float _v=sin(_x*0.2f+_t*_spd)+sin(_y*0.25f+_t*_spd*0.8f)+sin((_x+_y)*0.15f+_t*_spd*0.6f);`)
            ln(`      float _amp=1,_fr=_sc*96,_fn=0; for(int _o=0;_o<3;_o++){ _fn+=_amp*(inoise8((uint16_t)(_x*_fr),(uint16_t)(_y*_fr),_z)/255.0f-0.5f); _amp*=0.5f; _fr*=2; }`)
            ln(`      _v+=_fn*5; float _nf=fmodf(_v*0.15f,1.0f); if(_nf<0)_nf+=1.0f;`)
            ln(`      ${of}[_y*WIDTH+_x]=_nf;}}`)
            break
          case 'sine':
            ln(`  { // Sine 2D — layered sine/cosine interference`)
            ln(`    float _spd=${speed},_sc=${scale},_t=${timeExpr};`)
            ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
            ln(`      float _v=0,_amp=1,_fr=_sc;`)
            ln(`      for(int _o=0;_o<3;_o++){ _v+=_amp*sin(_x*_fr+_t*_spd+_o*1.7f)*cos(_y*_fr*1.3f+_t*_spd*0.8f+_o*2.3f); _amp*=0.5f; _fr*=2.1f; }`)
            ln(`      float _nf=fmodf(_v*0.5f+0.5f,1.0f); if(_nf<0)_nf+=1.0f;`)
            ln(`      ${of}[_y*WIDTH+_x]=_nf;}}`)
            break
          case 'field':
          default:
            ln(`  {`)
            ln(`    float _spd = ${speed}, _scl = ${scale}, _t=${timeExpr};`)
            ln(`    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {`)
            ln(`      float _v = (sin(_x * _scl * 0.5f + _t * _spd) + cos(_y * _scl * 0.5f + _t * _spd * 0.7f)) / 2.0f;`)
            ln(`      ${of}[_y * WIDTH + _x] = constrain((_v + 1) * 0.5f, 0.0f, 1.0f);`)
            ln(`    }`)
            ln(`  }`)
            break
        }
        ln(`  for(int _i=0;_i<NUM_LEDS;_i++) ${ob}[_i]=ColorFromPalette(${pal},(uint8_t)(constrain(${of}[_i],0.0f,1.0f)*255.0f));`)
        break
      }

      case 'Plasma': {
        needsT.v = true
        const ob = ownBuf()
        const speed = rateCpp(f('speed', 'speed', 0.5), SPEED_MAX.Plasma)
        const pal = paletteExpr(node.id, 'paletteIn', p)
        ln(`  {`)
        ln(`    float _spd = ${speed};`)
        ln(`    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {`)
        ln(`      float _v = sin(_x / 3.0f + t * _spd) + sin(_y / 3.0f + t * _spd * 0.8f)`)
        ln(`              + sin((_x + _y) / 5.0f + t * _spd * 0.6f)`)
        ln(`              + sin(sqrt((_x - WIDTH/2.0f)*(_x - WIDTH/2.0f) + (_y - HEIGHT/2.0f)*(_y - HEIGHT/2.0f)) / 3.0f + t * _spd * 0.5f);`)
        ln(`      ${ob}[_y * WIDTH + _x] = ColorFromPalette(${pal}, (uint8_t)(_v * 45 + t * 20));`)
        ln(`    }`)
        ln(`  }`)
        break
      }

      case 'Rainbow': {
        needsT.v = true
        const ob = ownBuf()
        const deltaHue = Math.max(0, Math.min(255, Math.round(Number(p.deltaHue ?? 6))))
        const rate = rateCpp(f('speed', 'speed', 0.3), SPEED_MAX.Rainbow)
        ln(`  fill_rainbow(${ob}, NUM_LEDS, (uint8_t)(t * ${rate}), ${deltaHue});`)
        break
      }

      // Homage to Pride2015 (see the evaluator's evalPride2015 comment) —
      // identical formula on both sides, mapped through CHSV like Plasma.
      case 'Pride2015': {
        needsT.v = true
        const ob = ownBuf()
        const speed = rateCpp(f('speed', 'speed', 0.4), SPEED_MAX.Pride2015)
        const scale = rateCpp(f('scale', 'scale', 0.4), SCALE_MAX.Pride2015)
        ln(`  { float _spd=${speed},_sc=${scale}; int _i=0;`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _hue=fmodf(_i*_sc*6.0f+t*_spd*40.0f,360.0f); if(_hue<0)_hue+=360.0f;`)
        ln(`      float _bt=_i*_sc*3.0f+t*_spd*15.0f;`)
        ln(`      float _bri=0.35f+0.65f*(sinf(_bt)*0.5f+0.5f);`)
        ln(`      ${ob}[_y*WIDTH+_x]=CHSV((uint8_t)(_hue/360.0f*255.0f),230,(uint8_t)(_bri*255.0f));`)
        ln(`      _i++; } }`)
        break
      }

      // Homage to the FastLED "Pacifica" ocean-wave demo (see the evaluator's
      // evalPacifica comment) — identical layered-wave formula on both sides.
      case 'Pacifica': {
        needsT.v = true
        const ob = ownBuf()
        const speed = rateCpp(f('speed', 'speed', 0.35), SPEED_MAX.Pacifica)
        const scale = rateCpp(f('scale', 'scale', 0.5), SCALE_MAX.Pacifica)
        const pal = paletteExpr(node.id, 'paletteIn', p)
        ln(`  { float _spd=${speed},_sc=${scale};`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _v=sinf(_x*0.3f*_sc+t*_spd)`)
        ln(`              +sinf((_x*0.15f*_sc-_y*0.1f*_sc)+t*_spd*0.6f)*0.7f`)
        ln(`              +sinf((_x+_y)*0.08f*_sc+t*_spd*1.3f)*0.5f;`)
        ln(`      float _n=constrain(_v/2.2f*0.5f+0.5f,0.0f,1.0f);`)
        ln(`      CRGB _c=ColorFromPalette(${pal},(uint8_t)(_n*255.0f));`)
        ln(`      float _foam=sinf(_x*0.9f*_sc+_y*0.4f*_sc+t*_spd*2.2f);`)
        ln(`      if(_foam>0.85f){float _w=(_foam-0.85f)/0.15f;`)
        ln(`        _c.r=(uint8_t)(_c.r+(255-_c.r)*_w); _c.g=(uint8_t)(_c.g+(255-_c.g)*_w); _c.b=(uint8_t)(_c.b+(255-_c.b)*_w);}`)
        ln(`      ${ob}[_y*WIDTH+_x]=_c;`)
        ln(`    } }`)
        break
      }

      // Homage to Mark Kriegsman's TwinkleFox (see the evaluator's
      // evalTwinkleFox comment) — the same per-pixel hash + brightness cycle on
      // both sides, so each pixel twinkles identically in preview and firmware.
      case 'TwinkleFox': {
        needsT.v = true
        const ob = ownBuf()
        const speed = rateCpp(f('speed', 'speed', 0.5), SPEED_MAX.TwinkleFox)
        const density = `constrain((${f('density', 'density', 0.5)}),0.0f,1.0f)`
        const seed = seedProp(p)
        const pal = paletteExpr(node.id, 'paletteIn', p)
        ln(`  { float _spd=${speed}; float _exp=6.0f-5.0f*${density}; int _i=0;`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      int _si=_i+${seed * 131};`)
        ln(`      float _ph=sinf(_si*12.9898f)*43758.5453f; _ph=_ph-floorf(_ph);`)
        ln(`      float _rt=sinf((_si+11)*12.9898f)*43758.5453f; _rt=0.5f+(_rt-floorf(_rt));`)
        ln(`      float _ci=sinf((_si+23)*12.9898f)*43758.5453f; _ci=_ci-floorf(_ci);`)
        ln(`      float _cy=fmodf(t*_spd*_rt+_ph,1.0f);`)
        ln(`      float _tri=1.0f-fabsf(2.0f*_cy-1.0f);`)
        ln(`      float _bri=powf(_tri,_exp);`)
        ln(`      CRGB _px=ColorFromPalette(${pal},(uint8_t)(_ci*255.0f));`)
        ln(`      _px.nscale8_video((uint8_t)(_bri*255.0f));`)
        ln(`      ${ob}[_y*WIDTH+_x]=_px; _i++; } }`)
        break
      }

      case 'Scanner': {
        needsT.v = true
        const ob = ownBuf()
        const speed = rateCpp(f('speed', 'speed', 0.45), SPEED_MAX.Scanner)
        const width = Math.max(1, Number(p.width ?? 2))
        const fade = `constrain((${f('fade', 'fade', 0.6)}),0.0f,1.0f)`
        const horizontal = String(p.axis ?? 'horizontal') !== 'vertical'
        const pal = paletteExpr(node.id, 'paletteIn', p)
        ln(`  { float _spd=${speed},_w=${width.toFixed(3)}f,_fd=${fade};`)
        ln(`    float _span=${horizontal ? 'WIDTH' : 'HEIGHT'};`)
        ln(`    float _ph=fmodf(t*_spd,2.0f); if(_ph<0)_ph+=2.0f;`)
        ln(`    float _travel=_ph<=1.0f?_ph:2.0f-_ph;`)
        ln(`    float _pos=_travel*max(0.0f,_span-1.0f);`)
        ln(`    float _core=max(0.5f,_w*0.5f),_tail=_core+_fd*max(1.0f,_span*0.35f),_den=max(0.001f,_tail-_core);`)
        ln(`    CRGB _base=ColorFromPalette(${pal},(uint8_t)(_travel*255.0f));`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _coord=${horizontal ? '(float)_x' : '(float)_y'};`)
        ln(`      float _dist=fabsf(_coord-_pos);`)
        ln(`      float _v=_dist<=_core?1.0f:max(0.0f,1.0f-(_dist-_core)/_den);`)
        ln(`      _v*=_v; CRGB _px=_base; _px.nscale8_video((uint8_t)(_v*255.0f));`)
        ln(`      ${ob}[_y*WIDTH+_x]=_px; } }`)
        break
      }

      case 'Confetti': {
        needsT.v = true
        const ob = ownBuf()
        const speed = rateCpp(f('speed', 'speed', 0.45), SPEED_MAX.Confetti)
        const density = `constrain((${f('density', 'density', 0.45)}),0.0f,1.0f)`
        const fade = `constrain((${f('fade', 'fade', 0.28)}),0.0f,1.0f)`
        const seed = seedProp(p)
        const rnd8 = seed ? `_rnd8_${id}()` : 'random8()'
        const rnd16 = seed ? `(((uint16_t)_rnd8_${id}()<<8)|_rnd8_${id}())` : 'random16()'
        const pal = paletteExpr(node.id, 'paletteIn', p)
        ln(`  {`)
        if (seed) ln(`    static uint32_t _rng_${id}=${seed}u; auto _rnd8_${id}=[&](){ _rng_${id}=_rng_${id}*1664525u+1013904223u; return (uint8_t)(_rng_${id}>>24); };`)
        ln(`    float _spd=${speed}, _den=${density}, _fd=${fade};`)
        ln(`    fadeToBlackBy(${ob}, NUM_LEDS, (uint8_t)(_fd * 255.0f));`)
        ln(`    int _spawns=(int)(_den * (0.08f + _spd * 0.2142857f) * sqrtf((float)NUM_LEDS));`)
        ln(`    if(_spawns<1 && _den * _spd > 0.08f) _spawns=1;`)
        ln(`    uint8_t _drift=(uint8_t)(t * _spd * 14.5714f);`)
        ln(`    for(int _s=0; _s<_spawns; _s++){`)
        ln(`      int _i=${rnd16}%NUM_LEDS;`)
        ln(`      ${ob}[_i] += ColorFromPalette(${pal}, ${rnd8} + _drift);`)
        ln(`    }`)
        ln(`  }`)
        break
      }

      case 'Juggle': {
        needsT.v = true
        const ob = ownBuf()
        const speed = rateCpp(f('speed', 'speed', 0.5), SPEED_MAX.Juggle)
        const dots = Math.max(1, Math.round(Number(p.count ?? 4)))
        const fade = `constrain((${f('fade', 'fade', 0.22)}),0.0f,1.0f)`
        const seed = seedProp(p)
        const pal = paletteExpr(node.id, 'paletteIn', p)
        ln(`  {`)
        ln(`    float _spd=${speed}, _fd=${fade};`)
        ln(`    const int _dots=${dots};`)
        ln(`    fadeToBlackBy(${ob}, NUM_LEDS, (uint8_t)(_fd * 255.0f));`)
        ln(`    for(int _d=0; _d<_dots; _d++){`)
        ln(`      float _phase=${seed ? `${(seed * 0.013).toFixed(3)}f+_d*0.17f` : '0.0f'};`)
        ln(`      float _travel=sinf(t*_spd*(2.5f+_d*0.35f)+_d*0.9f+_phase)*0.5f+0.5f;`)
        ln(`      int _x=(int)roundf(_travel*(WIDTH-1));`)
        ln(`      int _y=_dots<=1 ? (int)roundf((HEIGHT-1)*0.5f) : (int)roundf(((_d+0.5f)*HEIGHT)/(float)_dots-0.5f);`)
        ln(`      float _pulse=0.75f+0.25f*sinf(t*_spd*3.0f+_d+_phase);`)
        ln(`      CRGB _dot=ColorFromPalette(${pal}, (uint8_t)fmodf((_travel*0.35f+_d/(float)_dots)*255.0f, 255.0f));`)
        ln(`      _dot.nscale8_video((uint8_t)(_pulse*255.0f));`)
        ln(`      int _i=_y*WIDTH+_x; ${ob}[_i]+=_dot;`)
        ln(`      CRGB _edge=_dot; _edge.nscale8_video(89);`)
        ln(`      if(_x>0) ${ob}[_i-1]+=_edge; if(_x+1<WIDTH) ${ob}[_i+1]+=_edge;`)
        ln(`      CRGB _vert=_dot; _vert.nscale8_video(46);`)
        ln(`      if(_y>0) ${ob}[_i-WIDTH]+=_vert; if(_y+1<HEIGHT) ${ob}[_i+WIDTH]+=_vert;`)
        ln(`    }`)
        ln(`  }`)
        break
      }

      case 'Fire': {
        const ob = ownBuf()
        const intensity = f('intensity', 'intensity', 0.7)
        const cooling = f('cooling', 'cooling', 55)
        const sparking = f('sparking', 'sparking', 120)
        const pal = paletteExpr(node.id, 'paletteIn', p)
        const direction = String(p.direction ?? 'up')
        const spread = Math.max(0, Math.round(Number(p.turbulence ?? 1)))
        const paletteMixP = Math.max(0, Math.min(1, Number(p.paletteMix ?? 1)))
        const mirrorP = Boolean(p.mirror)
        const seedP = Math.max(0, Math.round(Number(p.seed ?? 0)))
        const { P, S } = fireGrid(direction)
        const HB = `_fireHeat_${id}`
        const useLcg = seedP > 0
        const rnd01 = useLcg
          ? `((_fireLcg_${id}=_fireLcg_${id}*1664525u+1013904223u)/4294967296.0f)`
          : `(random8()/255.0f)`
        ln(`  { // Fire pattern`)
        ln(`    static uint8_t ${HB}[${P}][${S}];`)
        if (useLcg) ln(`    static uint32_t _fireLcg_${id} = ${seedP}u;`)
        ln(`    float _cool=max(0.0f,min(255.0f,${cooling}))*(55.0f/255.0f);`)
        ln(`    float _spark=min(1.0f,max(0.0f,(max(0.0f,min(255.0f,${sparking}))/255.0f)*(0.35f+min(1.0f,max(0.0f,${intensity}))*0.65f)));`)
        ln(`    for (int _p = 0; _p < ${P}; _p++) for (int _s = 0; _s < ${S}; _s++)`)
        ln(`      ${HB}[_p][_s] = qsub8(${HB}[_p][_s], (uint8_t)(${rnd01}*_cool));`)
        // Propagate from _p-1 (closer to the flame base) into _p, averaging a
        // turbulence-wide window (spread=1 reproduces the original fixed
        // 3-wide/4-sample kernel exactly). Mirrors evalFire in graphEvaluator.ts.
        ln(`    for (int _p = (${P})-1; _p >= 1; _p--) for (int _s = 0; _s < ${S}; _s++) {`)
        ln(`      int _sum=0; for (int _ds=-${spread}; _ds<=${spread}; _ds++) _sum += ${HB}[_p-1][max(0,min((${S})-1,_s+_ds))];`)
        ln(`      ${HB}[_p][_s] = (${HB}[_p][_s] + _sum) / ${spread * 2 + 2}; }`)
        ln(`    for (int _s = 0; _s < ${S}; _s++)`)
        ln(`      if (${rnd01} < _spark) ${HB}[0][_s] = (uint8_t)(200 + ${rnd01}*55);`)
        ln(`    for (int _p = 0; _p < ${P}; _p++) for (int _s = 0; _s < ${S}; _s++) {`)
        const { x: fx, y: fy } = fireXYExpr(direction, '_p', '_s')
        ln(`      uint8_t _h=${HB}[_p][_s]; CRGB _c=ColorFromPalette(${pal}, _h);`)
        if (paletteMixP >= 1) {
          ln(`      ${ob}[(${fy})*WIDTH+(${fx})] = _c;`)
        } else {
          const keep = floatLit(1 - paletteMixP)
          const mix = floatLit(paletteMixP)
          ln(`      ${ob}[(${fy})*WIDTH+(${fx})] = CRGB((uint8_t)(_h*${keep}+_c.r*${mix}),(uint8_t)(_h*${keep}+_c.g*${mix}),(uint8_t)(_h*${keep}+_c.b*${mix}));`)
        }
        ln(`    }`)
        if (mirrorP) {
          // Fold the rendered buffer symmetric across the flame's width —
          // up/down mirror columns, left/right mirror rows. Mirrors fireMirror.
          if (direction === 'left' || direction === 'right')
            ln(`    for (int _y=0;_y<HEIGHT/2;_y++) for (int _x=0;_x<WIDTH;_x++) ${ob}[(HEIGHT-1-_y)*WIDTH+_x] = ${ob}[_y*WIDTH+_x];`)
          else
            ln(`    for (int _y=0;_y<HEIGHT;_y++) for (int _x=0;_x<WIDTH/2;_x++) ${ob}[_y*WIDTH+(WIDTH-1-_x)] = ${ob}[_y*WIDTH+_x];`)
        }
        ln(`  }`)
        break
      }

      case 'SpectrumBars': {
        needsT.v = true
        const ob = ownBuf()
        // Test Signal is preview-only; an unwired firmware pattern rests at 0.
        const bass = f('bass', 'bass', 0)
        const mids = f('mids', 'mids', 0)
        const treble = f('treble', 'treble', 0)
        const energy = f('energy', 'energy', 0.7)
        const speed = f('speed', 'speed', 0.6)
        const pal = paletteExpr(node.id, 'paletteIn', p)
        const mirror = p.mirror !== false
        ln(`  {`)
        ln(`    fill_solid(${ob}, NUM_LEDS, CRGB::Black);`)
        ln(`    float _b = min(1.0f, max(0.0f, ${bass})), _m = min(1.0f, max(0.0f, ${mids})), _t = min(1.0f, max(0.0f, ${treble}));`)
        ln(`    float _strength = min(1.0f, max(0.0f, ${energy}));`)
        ln(`    float _spd = min(1.0f, max(0.0f, ${speed}));`)
        ln(`    const int _cols = max(1, ${mirror ? '((WIDTH + 1) / 2)' : 'WIDTH'});`)
        ln(`    float _levels[3] = { _b, _m, _t };`)
        ln(`    float _geometryMotion = t * (0.45f + _spd * 3.2f);`)
        ln(`    float _paletteScroll = t * (0.08f + _spd * 0.42f);`)
        ln(`    for (int _x = 0; _x < _cols; _x++) {`)
        ln(`      float _nx = _cols <= 1 ? 0.0f : (float)_x / (float)(_cols - 1);`)
        ln(`      float _spec = _nx * 2.0f;`)
        ln(`      int _left = (int)floorf(_spec);`)
        ln(`      int _right = min(2, _left + 1);`)
        ln(`      float _mix = _spec - (float)_left;`)
        ln(`      float _base = _levels[_left] * (1.0f - _mix) + _levels[_right] * _mix;`)
        ln(`      float _ripple = sinf(_nx * 10.5f - _geometryMotion * (1.1f + _t * 1.8f)) * 0.08f * _strength;`)
        ln(`      float _shimmer = max(0.0f, sinf(_nx * 21.0f + _geometryMotion * (2.0f + _m * 2.5f))) * 0.06f * _t * _strength;`)
        ln(`      float _level = min(1.0f, max(0.0f, _base * (0.45f + _strength * 0.9f) + _ripple + _shimmer));`)
        ln(`      int _barH = max(0, (int)roundf(_level * HEIGHT));`)
        ln(`      for (int _row = 0; _row < _barH; _row++) {`)
        ln(`        int _y = HEIGHT - 1 - _row;`)
        ln(`        float _vertical = HEIGHT <= 1 ? 0.0f : (float)_row / (float)(HEIGHT - 1);`)
        ln(`        float _pulse = 0.72f + 0.28f * sinf(_vertical * 6.2f - _geometryMotion * (1.4f + _b * 1.6f));`)
        ln(`        float _v = min(1.0f, max(0.0f, (0.28f + _vertical * 0.72f) * _pulse));`)
        ln(`        float _pt = _nx + _paletteScroll + _vertical * (0.12f + _m * 0.12f) + _spec * 0.08f;`)
        ln(`        CRGB _px = ColorFromPalette(${pal}, (uint8_t)(_pt * 255));`)
        ln(`        _px.nscale8((uint8_t)(_v * 255));`)
        ln(`        ${ob}[_y * WIDTH + _x] = _px;`)
        if (mirror) ln(`        ${ob}[_y * WIDTH + (WIDTH - 1 - _x)] = _px;`)
        ln(`      }`)
        ln(`      if (_barH > 0) {`)
        ln(`        int _peakY = max(0, HEIGHT - _barH);`)
        ln(`        CRGB _peak = ColorFromPalette(${pal}, (uint8_t)((_nx + _paletteScroll + _spec * 0.08f) * 255));`)
        ln(`        _peak.nscale8((uint8_t)(min(1.0f, 0.6f + _t * 0.35f + _strength * 0.2f) * 255));`)
        ln(`        ${ob}[_peakY * WIDTH + _x] = _peak;`)
        if (mirror) ln(`        ${ob}[_peakY * WIDTH + (WIDTH - 1 - _x)] = _peak;`)
        ln(`      }`)
        ln(`    }`)
        ln(`  }`)
        break
      }

      case 'SpectrumVisualizer': {
        const ob = ownBuf()
        const style = String(p.style ?? 'Bars')
        const bands = Math.max(4, Math.min(32, Math.round(Number(p.bands ?? 16))))
        const gain = Math.max(0.25, Math.min(4, Number(p.gain ?? 1.25)))
        const smoothing = Math.max(0, Math.min(0.95, Number(p.smoothing ?? 0.58)))
        const tilt = Math.max(0, Math.min(1, Number(p.tilt ?? 0.2)))
        const peakHoldMs = Math.max(0, Math.min(2000, Number(p.peakHold ?? 0.42) * 1000))
        const peakGravity = Math.max(0.2, Math.min(6, Number(p.peakGravity ?? 1.8)))
        const waterfallSpeed = Math.max(1, Math.min(30, Number(p.waterfallSpeed ?? 10)))
        const pal = paletteExpr(node.id, 'paletteIn', p)
        const audioConnected = incoming.has(`${node.id}:audio`) && useAudioGlobals
        ln(`  { // SpectrumVisualizer · ${style}`)
        ln(`    static float _svLevel_${id}[WIDTH]={0},_svPeak_${id}[WIDTH]={0},_svVelocity_${id}[WIDTH]={0};`)
        ln(`    static uint32_t _svHold_${id}[WIDTH]={0},_svLast_${id}=0;`)
        ln(`    uint32_t _svNow=millis(); float _svDt=_svLast_${id} ? constrain((_svNow-_svLast_${id})/1000.0f,0.0f,0.1f) : (1.0f/60.0f); _svLast_${id}=_svNow;`)
        ln(`    float _svBands[${bands}]={0};`)
        ln(`    for(int _b=0;_b<${bands};_b++){ int _lo=(_b*32)/${bands},_hi=max(_lo+1,((_b+1)*32)/${bands}); float _sum=0.0f; for(int _i=_lo;_i<_hi;_i++) _sum+=${audioConnected ? '_audioSpectrum[_i]' : '0.0f'}; _svBands[_b]=_sum/(_hi-_lo); }`)
        ln(`    float _svRetain=powf(${smoothing.toFixed(4)}f,_svDt*60.0f);`)
        ln(`    for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _pos=WIDTH<=1?0.0f:_x/(float)(WIDTH-1)*${bands - 1}.0f; int _left=(int)floorf(_pos),_right=min(${bands - 1},_left+1); float _mix=_pos-_left;`)
        ln(`      float _freq=${bands <= 1 ? '0.0f' : `_pos/${bands - 1}.0f`}; float _raw=_svBands[_left]*(1.0f-_mix)+_svBands[_right]*_mix; float _target=constrain(_raw*${gain.toFixed(4)}f*(1.0f+_freq*${(tilt * 1.8).toFixed(4)}f),0.0f,1.0f);`)
        ln(`      _svLevel_${id}[_x]=_svLevel_${id}[_x]*_svRetain+_target*(1.0f-_svRetain);`)
        ln(`      if(_svLevel_${id}[_x]>=_svPeak_${id}[_x]){ _svPeak_${id}[_x]=_svLevel_${id}[_x]; _svVelocity_${id}[_x]=0.0f; _svHold_${id}[_x]=_svNow+${Math.round(peakHoldMs)}U; }`)
        ln(`      else if((int32_t)(_svNow-_svHold_${id}[_x])>=0){ _svVelocity_${id}[_x]+=${peakGravity.toFixed(4)}f*_svDt; _svPeak_${id}[_x]=max(_svLevel_${id}[_x],_svPeak_${id}[_x]-_svVelocity_${id}[_x]*_svDt); }`)
        ln(`    }`)
        ln(`    auto _svColor=[&](float _amount,float _brightness)->CRGB{ return ColorFromPalette(${pal},(uint8_t)(constrain(0.14f+_amount*0.82f,0.0f,1.0f)*255.0f),(uint8_t)(constrain(_brightness,0.0f,1.0f)*255.0f),LINEARBLEND); };`)

        if (style === 'Waterfall') {
          ln(`    static uint32_t _svWaterfall_${id}=0; if(!_svWaterfall_${id})_svWaterfall_${id}=_svNow;`)
          ln(`    int _steps=min(HEIGHT,(int)((_svNow-_svWaterfall_${id})*${waterfallSpeed.toFixed(3)}f/1000.0f));`)
          ln(`    if(_steps>0){ _svWaterfall_${id}+=(uint32_t)(_steps*(1000.0f/${waterfallSpeed.toFixed(3)}f)); for(int _step=0;_step<_steps;_step++){`)
          ln(`      if(HEIGHT>1)::memmove(${ob},${ob}+WIDTH,sizeof(CRGB)*WIDTH*(HEIGHT-1));`)
          ln(`      for(int _x=0;_x<WIDTH;_x++){ float _lv=constrain(_svLevel_${id}[_x],0.0f,1.0f); ${ob}[(HEIGHT-1)*WIDTH+_x]=_lv<0.02f?CRGB::Black:_svColor(_lv,0.25f+_lv*0.75f); }`)
          ln(`    } }`)
        } else if (style === 'Orbit') {
          ln(`    fill_solid(${ob},NUM_LEDS,CRGB::Black); float _cx=(WIDTH-1)*0.5f,_cy=(HEIGHT-1)*0.5f,_minDim=max(2,min(WIDTH,HEIGHT)); float _pixelRadius=0.72f/_minDim;`)
          ln(`    for(int _y=0;_y<HEIGHT;_y++)for(int _x=0;_x<WIDTH;_x++){ float _dx=(_x-_cx)/_minDim,_dy=(_y-_cy)/_minDim,_radius=hypotf(_dx,_dy); float _angle=fmodf(atan2f(_dy,_dx)+TWO_PI*1.25f,TWO_PI)/TWO_PI; int _col=min(WIDTH-1,(int)(_angle*WIDTH)); float _lv=_svLevel_${id}[_col],_peak=_svPeak_${id}[_col]; float _outer=0.15f+_lv*0.32f,_peakRadius=0.15f+_peak*0.32f; if(_peak>0.015f&&fabsf(_radius-_peakRadius)<=_pixelRadius)${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)(_angle*255.0f),255,LINEARBLEND); else if(_radius>=0.15f&&_radius<=_outer)${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)(_angle*255.0f),(uint8_t)((0.34f+_lv*0.66f)*255.0f),LINEARBLEND); }`)
        } else if (style === 'Centre Mirror') {
          ln(`    fill_solid(${ob},NUM_LEDS,CRGB::Black); int _upper=(HEIGHT-1)/2,_lower=HEIGHT/2,_reach=max(1,HEIGHT/2);`)
          ln(`    for(int _x=0;_x<WIDTH;_x++){ int _len=(int)roundf(_svLevel_${id}[_x]*_reach); for(int _row=0;_row<_len;_row++){ float _amount=_reach<=1?1.0f:_row/(float)(_reach-1); CRGB _c=_svColor(_amount,0.4f+_amount*0.6f); if(_upper-_row>=0)${ob}[(_upper-_row)*WIDTH+_x]=_c; if(_lower+_row<HEIGHT)${ob}[(_lower+_row)*WIDTH+_x]=_c; } int _po=(int)roundf(_svPeak_${id}[_x]*_reach); if(_svPeak_${id}[_x]>0.015f){ CRGB _p=_svColor(_svPeak_${id}[_x],1.0f); if(_upper-_po>=0)${ob}[(_upper-_po)*WIDTH+_x]=_p; if(_lower+_po<HEIGHT)${ob}[(_lower+_po)*WIDTH+_x]=_p; } }`)
        } else {
          const ribbon = style === 'Ribbon'
          ln(`    fill_solid(${ob},NUM_LEDS,CRGB::Black);`)
          ln(`    for(int _x=0;_x<WIDTH;_x++){ int _barH=(int)roundf(_svLevel_${id}[_x]*HEIGHT); for(int _row=0;_row<_barH;_row++){ int _y=HEIGHT-1-_row; float _amount=HEIGHT<=1?1.0f:_row/(float)(HEIGHT-1); float _brightness=${ribbon ? '(_row==_barH-1?1.0f:0.18f+_amount*0.42f)' : '0.34f+_amount*0.66f'}; ${ob}[_y*WIDTH+_x]=_svColor(_amount,_brightness); } int _py=HEIGHT-1-(int)roundf(_svPeak_${id}[_x]*(HEIGHT-1)); if(_svPeak_${id}[_x]>0.015f&&_py>=0&&_py<HEIGHT)${ob}[_py*WIDTH+_x]=_svColor(_svPeak_${id}[_x],1.0f); }`)
        }
        if (!audioConnected) ln(`    // Connect a Microphone to the Audio input to populate the spectrum on-device.`)
        ln(`  }`)
        break
      }

      case 'BassPulse': {
        const ob = ownBuf()
        const pal = paletteExpr(node.id, 'paletteIn', p)
        const bass = f('bass', 'bass', 0)
        ln(`  { float _lv = constrain(${bass}, 0.0f, 1.0f); float _v = sqrtf(_lv);`)
        ln(`    CRGB _c = ColorFromPalette(${pal}, (uint8_t)(_lv * 255)); _c.nscale8((uint8_t)(_v * 255));`)
        ln(`    fill_solid(${ob}, NUM_LEDS, _c); }`)
        break
      }

      case 'BassRings': {
        needsT.v = true
        const ob = ownBuf()
        const bass = f('bass', 'bass', 0.5)
        const energy = f('energy', 'energy', 0.7)
        const speed = f('speed', 'speed', 1)
        const pal = paletteExpr(node.id, 'paletteIn', p)
        ln(`  {`)
        ln(`    float _b = min(1.0f, max(0.0f, ${bass}));`)
        ln(`    float _strength = min(1.0f, max(0.0f, ${energy}));`)
        ln(`    float _spd = min(1.0f, max(0.0f, ${speed}));`)
        ln(`    float _cx = WIDTH * 0.5f, _cy = HEIGHT * 0.5f, _maxD = sqrtf(_cx * _cx + _cy * _cy);`)
        ln(`    float _motion = _spd * (0.75f + _b * 1.75f * _strength);`)
        ln(`    float _phase = t * (1.2f + _motion * 4.8f);`)
        ln(`    float _rings = 4.0f + _b * 8.0f * _strength;`)
        ln(`    float _floor = 0.04f + _b * 0.1f * _strength;`)
        ln(`    float _gain = 0.16f + _b * 0.84f * _strength;`)
        ln(`    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {`)
        ln(`      float _dx = _x - _cx, _dy = _y - _cy;`)
        ln(`      float _dist = sqrtf(_dx * _dx + _dy * _dy) / max(0.0001f, _maxD);`)
        ln(`      float _wave = sinf(_dist * _rings * 6.2831853f - _phase);`)
        ln(`      float _crisp = powf(max(0.0f, _wave * 0.5f + 0.5f), 2.4f);`)
        ln(`      float _v = min(1.0f, _floor + _crisp * _gain);`)
        ln(`      int _i = _y * WIDTH + _x;`)
        ln(`      ${ob}[_i] = ColorFromPalette(${pal}, (uint8_t)(_dist * 255));`)
        ln(`      ${ob}[_i].nscale8((uint8_t)(_v * 255));`)
        ln(`    }`)
        ln(`  }`)
        break
      }

      case 'MidrangeWaves': {
        needsT.v = true
        const ob = ownBuf()
        const mids = f('mids', 'mids', 0.5)
        const energy = f('energy', 'energy', 0.7)
        const speed = f('speed', 'speed', 1)
        const pal = paletteExpr(node.id, 'paletteIn', p)
        ln(`  {`)
        ln(`    float _m = ${mids}, _intensity = ${energy}, _spd = ${speed};`)
        ln(`    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {`)
        ln(`      float _mAmt = min(1.0f, max(0.0f, _m));`)
        ln(`      float _strength = min(1.0f, max(0.0f, _intensity));`)
        ln(`      float _motion = _spd * (1.0f + _mAmt * 1.5f * _strength);`)
        ln(`      float _contrast = 0.7f + _mAmt * 1.8f * _strength;`)
        ln(`      float _wBase = sin(_x * 0.8f + t * _motion * 4) * sin(_y * 0.5f + t * _motion * 2.5f);`)
        ln(`      float _w = min(1.0f, max(-1.0f, _wBase * _contrast));`)
        ln(`      float _int = min(1.0f, 0.1f + powf(_mAmt, 0.65f) * 1.25f * _strength);`)
        ln(`      float _v = (_w + 1) / 2.0f * _int;`)
        ln(`      ${ob}[_y * WIDTH + _x] = ColorFromPalette(${pal}, (uint8_t)((_w + 1) * 127.5f));`)
        ln(`      ${ob}[_y * WIDTH + _x].nscale8((uint8_t)(_v * 255));`)
        ln(`    }`)
        ln(`  }`)
        break
      }

      case 'MidrangeBloom': {
        needsT.v = true
        const ob = ownBuf()
        const mids = f('mids', 'mids', 0.5)
        const energy = f('energy', 'energy', 0.7)
        const speed = f('speed', 'speed', 1)
        const pal = paletteExpr(node.id, 'paletteIn', p)
        ln(`  {`)
        ln(`    float _m = ${mids}, _intensity = ${energy}, _spd = ${speed};`)
        ln(`    float _mAmt = min(1.0f, max(0.0f, _m));`)
        ln(`    float _strength = min(1.0f, max(0.0f, _intensity));`)
        ln(`    float _motion = min(1.0f, max(0.0f, _spd)) * (0.8f + _mAmt * 2.2f * _strength);`)
        ln(`    float _cx0 = (WIDTH - 1) / 2.0f, _cy0 = (HEIGHT - 1) / 2.0f;`)
        ln(`    float _sx = max(1.0f, WIDTH / 2.0f), _sy = max(1.0f, HEIGHT / 2.0f);`)
        ln(`    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {`)
        ln(`      float _cx = (_x - _cx0) / _sx, _cy = (_y - _cy0) / _sy;`)
        ln(`      float _radial = sqrtf(_cx * _cx + _cy * _cy);`)
        ln(`      float _swirl = sinf((_cx * _cx - _cy * _cy) * 6 + t * _motion * 3.2f) + cosf((_cx + _cy) * 4 - t * _motion * 2.4f);`)
        ln(`      float _bloom = sinf(_radial * (5.0f + _mAmt * 8.0f * _strength) * 3.14159265f - t * _motion * 4.0f + _swirl * 0.6f);`)
        ln(`      float _crisp = powf(max(0.0f, _bloom * 0.5f + 0.5f), 1.8f);`)
        ln(`      float _v = min(1.0f, _crisp * (0.22f + _mAmt * 0.78f * _strength));`)
        ln(`      float _pt = _radial * 0.6f + _swirl * 0.12f + t * _motion * 0.05f;`)
        ln(`      ${ob}[_y * WIDTH + _x] = ColorFromPalette(${pal}, (uint8_t)(_pt * 255));`)
        ln(`      ${ob}[_y * WIDTH + _x].nscale8((uint8_t)(_v * 255));`)
        ln(`    }`)
        ln(`  }`)
        break
      }

      case 'TrebleSparks': {
        const ob = ownBuf()
        const treble = f('treble', 'treble', 0.5)
        const density = f('density', 'density', 0.5)
        const pal = paletteExpr(node.id, 'paletteIn', p)
        ln(`  {`)
        ln(`    float _t = ${treble}, _d = ${density};`)
        ln(`    fadeToBlackBy(${ob}, NUM_LEDS, (uint8_t)(110 + (1.0f - constrain(_t, 0.0f, 1.0f)) * 40));`)
        ln(`    int _spawns = (int)(NUM_LEDS * constrain(_d, 0.0f, 1.0f) * (0.03f + constrain(_t, 0.0f, 1.0f) * 0.12f));`)
        ln(`    if (_spawns < 1 && _d * _t > 0.05f) _spawns = 1;`)
        ln(`    uint8_t _spawnChance = (uint8_t)(51 + constrain(_t, 0.0f, 1.0f) * 204);`)
        ln(`    for (int _s = 0; _s < _spawns; _s++) if (random8() <= _spawnChance) {`)
        ln(`      int _x = random16(WIDTH), _y = random16(HEIGHT), _i = _y * WIDTH + _x;`)
        ln(`      CRGB _spark = blend(ColorFromPalette(${pal}, random8()), CRGB::White, (uint8_t)(89 + constrain(_t, 0.0f, 1.0f) * 89));`)
        ln(`      _spark.nscale8((uint8_t)(min(255.0f, (0.7f + constrain(_t, 0.0f, 1.0f) * 0.6f) * (140 + random8(116)))));`)
        ln(`      ${ob}[_i] += _spark;`)
        ln(`      CRGB _edge = _spark; _edge.nscale8((uint8_t)(107));`)
        ln(`      if (_x > 0) ${ob}[_i - 1] += _edge; if (_x + 1 < WIDTH) ${ob}[_i + 1] += _edge;`)
        ln(`      if (_y > 0) ${ob}[_i - WIDTH] += _edge; if (_y + 1 < HEIGHT) ${ob}[_i + WIDTH] += _edge;`)
        ln(`      CRGB _corner = _spark; _corner.nscale8((uint8_t)(41));`)
        ln(`      if (_x > 0 && _y > 0) ${ob}[_i - WIDTH - 1] += _corner;`)
        ln(`      if (_x + 1 < WIDTH && _y > 0) ${ob}[_i - WIDTH + 1] += _corner;`)
        ln(`      if (_x > 0 && _y + 1 < HEIGHT) ${ob}[_i + WIDTH - 1] += _corner;`)
        ln(`      if (_x + 1 < WIDTH && _y + 1 < HEIGHT) ${ob}[_i + WIDTH + 1] += _corner;`)
        ln(`    }`)
        ln(`  }`)
        break
      }

      case 'TreblePrism': {
        needsT.v = true
        const ob = ownBuf()
        const treble = f('treble', 'treble', 0.5)
        const energy = f('energy', 'energy', 0.7)
        const speed = f('speed', 'speed', 1)
        const pal = paletteExpr(node.id, 'paletteIn', p)
        ln(`  {`)
        ln(`    float _t = min(1.0f, max(0.0f, ${treble}));`)
        ln(`    float _strength = min(1.0f, max(0.0f, ${energy}));`)
        ln(`    float _spd = min(1.0f, max(0.0f, ${speed}));`)
        ln(`    float _motion = _spd * (1.2f + _t * 3.2f * _strength);`)
        ln(`    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {`)
        ln(`      float _diagA = _x * 1.7f + _y * 1.15f, _diagB = _x * -1.1f + _y * 1.9f;`)
        ln(`      float _waveA = sinf(_diagA + t * _motion * 7.5f);`)
        ln(`      float _waveB = sinf(_diagB - t * _motion * 6.1f);`)
        ln(`      float _prism = max(0.0f, _waveA * 0.55f + _waveB * 0.45f);`)
        ln(`      float _shard = powf(_prism, 3.6f);`)
        ln(`      float _flash = powf(max(0.0f, sinf((_x + _y) * 2.4f - t * _motion * 9.0f) * 0.5f + 0.5f), 10.0f);`)
        ln(`      float _v = min(1.0f, _shard * (0.3f + _t * 0.7f * _strength) + _flash * _t * 0.9f * _strength);`)
        ln(`      float _pt = (_x + _y) / (float)(WIDTH + HEIGHT);`)
        ln(`      int _i = _y * WIDTH + _x;`)
        ln(`      ${ob}[_i] = ColorFromPalette(${pal}, (uint8_t)(_pt * 255));`)
        ln(`      ${ob}[_i].nscale8((uint8_t)(_v * 255));`)
        ln(`    }`)
        ln(`  }`)
        break
      }

      case 'AudioCascade': {
        needsT.v = true
        const ob = ownBuf()
        const bass = f('bass', 'bass', 0.5)
        const mids = f('mids', 'mids', 0.5)
        const treble = f('treble', 'treble', 0.5)
        const energy = f('energy', 'energy', 0.7)
        const speed = f('speed', 'speed', 1)
        const pal = paletteExpr(node.id, 'paletteIn', p)
        ln(`  {`)
        ln(`    float _b = min(1.0f, max(0.0f, ${bass})), _m = min(1.0f, max(0.0f, ${mids})), _t = min(1.0f, max(0.0f, ${treble}));`)
        ln(`    float _strength = min(1.0f, max(0.0f, ${energy}));`)
        ln(`    float _spd = min(1.0f, max(0.0f, ${speed}));`)
        ln(`    float _motion = _spd * (0.8f + (_b + _m + _t) * 1.4f * _strength);`)
        ln(`    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {`)
        ln(`      float _nx = WIDTH > 1 ? (float)_x / (float)(WIDTH - 1) : 0.0f;`)
        ln(`      float _ny = HEIGHT > 1 ? (float)_y / (float)(HEIGHT - 1) : 0.0f;`)
        ln(`      float _ribbon = sinf((_nx * 7.0f + _ny * 2.5f) + t * _motion * (2.0f + _m * 3.0f * _strength));`)
        ln(`      float _sweep = cosf((_ny * 9.0f - _nx * 3.0f) - t * _motion * (1.4f + _b * 2.2f * _strength));`)
        ln(`      float _shimmer = powf(max(0.0f, sinf((_nx + _ny) * 18.0f + t * _motion * (4.0f + _t * 8.0f * _strength)) * 0.5f + 0.5f), 6.0f);`)
        ln(`      float _body = max(0.0f, _ribbon * 0.55f + _sweep * 0.45f);`)
        ln(`      float _v = min(1.0f, _body * (0.18f + _m * 0.52f * _strength) + _b * 0.24f * _strength + _shimmer * _t * 0.85f * _strength);`)
        ln(`      float _pt = _nx * (0.2f + _b * 0.5f) + _ny * (0.35f + _m * 0.45f) + _shimmer * 0.15f + t * _motion * 0.03f;`)
        ln(`      ${ob}[_y * WIDTH + _x] = ColorFromPalette(${pal}, (uint8_t)(_pt * 255));`)
        ln(`      ${ob}[_y * WIDTH + _x].nscale8((uint8_t)(_v * 255));`)
        ln(`    }`)
        ln(`  }`)
        break
      }

      case 'BeatFlash': {
        const ob = ownBuf()
        const beat = boolExpr(node.id, 'beat')
        const attack = f('attack', 'attack', 0)
        const decay = f('decay', 'decay', 0.85)
        const intensity = f('intensity', 'intensity', 1)
        const blendMode = String(p.blendMode ?? 'screen') === 'add' ? 'add' : 'screen'
        const preserveBase = p.preserveBase !== false
        const paletteWired = incoming.has(`${node.id}:paletteIn`)
        const usePalette = paletteWired || String(p.palette ?? 'none') !== 'none'
        const flashPal = usePalette ? paletteExpr(node.id, 'paletteIn', p) : null
        const cr = intProp(p.r, 255, 0, 255)
        const cg = intProp(p.g, 255, 0, 255)
        const cb = intProp(p.b, 255, 0, 255)
        ln(`  {`)
        ln(`    ${seedFrom('frame')}`)
        ln(`    static float _flash_${id} = 0; static bool _flashRise_${id} = false;`)
        ln(`    float _fAtkSec_${id} = max(0.0f, ${attack}) * ${BEAT_FLASH_ATTACK_MAX_SEC}f;`)
        ln(`    float _fAtkStep_${id} = _fAtkSec_${id} > 0 ? min(1.0f, 1.0f / (_fAtkSec_${id} * 60.0f)) : 1.0f;`)
        ln(`    if (${beat}) _flashRise_${id} = true;`)
        ln(`    if (_flashRise_${id}) { _flash_${id} = min(1.0f, _flash_${id} + _fAtkStep_${id}); if (_flash_${id} >= 1.0f) _flashRise_${id} = false; }`)
        ln(`    else _flash_${id} *= ${decay};`)
        ln(`    if (_flash_${id} >= 0.003f) {`)
        ln(`      float _feff_${id} = max(0.0f, _flash_${id} * ${intensity});`)
        ln(`      CRGB _fc_${id} = ${flashPal ? `ColorFromPalette(${flashPal}, (uint8_t)((1.0f - _flash_${id}) * 255))` : `CRGB(${cr}, ${cg}, ${cb})`};`)
        ln(`      for (int _i = 0; _i < NUM_LEDS; _i++) {`)
        if (!preserveBase) {
          ln(`        ${ob}[_i] = CRGB((uint8_t)min(255.0f, _fc_${id}.r * _feff_${id}), (uint8_t)min(255.0f, _fc_${id}.g * _feff_${id}), (uint8_t)min(255.0f, _fc_${id}.b * _feff_${id}));`)
        } else if (blendMode === 'add') {
          ln(`        ${ob}[_i].r = qadd8(${ob}[_i].r, (uint8_t)min(255.0f, _fc_${id}.r * _feff_${id}));`)
          ln(`        ${ob}[_i].g = qadd8(${ob}[_i].g, (uint8_t)min(255.0f, _fc_${id}.g * _feff_${id}));`)
          ln(`        ${ob}[_i].b = qadd8(${ob}[_i].b, (uint8_t)min(255.0f, _fc_${id}.b * _feff_${id}));`)
        } else {
          ln(`        ${ob}[_i].r = qadd8(${ob}[_i].r, (uint8_t)max(0.0f, ((float)_fc_${id}.r - ${ob}[_i].r) * _feff_${id}));`)
          ln(`        ${ob}[_i].g = qadd8(${ob}[_i].g, (uint8_t)max(0.0f, ((float)_fc_${id}.g - ${ob}[_i].g) * _feff_${id}));`)
          ln(`        ${ob}[_i].b = qadd8(${ob}[_i].b, (uint8_t)max(0.0f, ((float)_fc_${id}.b - ${ob}[_i].b) * _feff_${id}));`)
        }
        ln(`      }`)
        ln(`    }`)
        ln(`  }`)
        break
      }

      case 'KickShock': {
        needsT.v = true
        const ob = ownBuf()
        const kick = f('kick', 'kick', 0)
        const snare = f('snare', 'snare', 0)
        const hihat = f('hihat', 'hihat', 0)
        const energy = f('energy', 'energy', 0.7)
        const speed = f('speed', 'speed', 1)
        const tiles = f('tiles', 'tiles', 1)
        const pal = paletteExpr(node.id, 'paletteIn', p)
        const CAP = Math.max(1, Math.round(Number(p.count ?? 8)))
        const lifeMult = Math.max(0.05, Number(p.decay ?? 1))
        const bandMult = Math.max(0.05, Number(p.thickness ?? 1))
        const spread = Math.max(0, Math.min(1, Number(p.spawnSpread ?? 0)))
        const spreadF = floatLit(spread)
        const additive = String(p.blendMode ?? 'add') !== 'max'
        const lifeK = (1.9 * lifeMult).toFixed(4), lifeS = (1.0 * lifeMult).toFixed(4)
        const bandK = (0.10 * bandMult).toFixed(4), bandS = (0.055 * bandMult).toFixed(4)
        ln(`  { // KickShock`)
        ln(`    static float _ksBorn_${id}[${CAP}]; static float _ksX_${id}[${CAP}]; static float _ksY_${id}[${CAP}]; static uint8_t _ksKind_${id}[${CAP}]; static bool _ksAlive_${id}[${CAP}]; static bool _ksInit_${id}=false; static uint8_t _ksNext_${id}=0; static bool _ksPrevKick_${id}=false,_ksPrevSnare_${id}=false;`)
        ln(`    if(!_ksInit_${id}){ for(int _i=0;_i<${CAP};_i++) _ksAlive_${id}[_i]=false; _ksInit_${id}=true; }`)
        ln(`    float _spd=${speed},_strength=min(1.0f,max(0.0f,${energy})),_hihatAmt=min(1.0f,max(0.0f,${hihat})); int _tiles=max(1,min(8,(int)roundf(${tiles})));`)
        ln(`    bool _kickHit=(${kick})>0.5f, _snareHit=(${snare})>0.5f;`)
        ln(`    float _tileW=WIDTH/(float)_tiles,_tileH=HEIGHT/(float)_tiles,_ksCx=(_tileW-1)/2.0f,_ksCy=(_tileH-1)/2.0f;`)
        ln(`    if(_kickHit && !_ksPrevKick_${id}){ _ksX_${id}[_ksNext_${id}]=_ksCx+(random8()/255.0f*_tileW-_ksCx)*${spreadF}; _ksY_${id}[_ksNext_${id}]=_ksCy+(random8()/255.0f*_tileH-_ksCy)*${spreadF}; _ksBorn_${id}[_ksNext_${id}]=t; _ksKind_${id}[_ksNext_${id}]=0; _ksAlive_${id}[_ksNext_${id}]=true; _ksNext_${id}=(uint8_t)((_ksNext_${id}+1)%${CAP}); }`)
        ln(`    if(_snareHit && !_ksPrevSnare_${id}){ _ksX_${id}[_ksNext_${id}]=_ksCx+(random8()/255.0f*_tileW-_ksCx)*${spreadF}; _ksY_${id}[_ksNext_${id}]=_ksCy+(random8()/255.0f*_tileH-_ksCy)*${spreadF}; _ksBorn_${id}[_ksNext_${id}]=t; _ksKind_${id}[_ksNext_${id}]=1; _ksAlive_${id}[_ksNext_${id}]=true; _ksNext_${id}=(uint8_t)((_ksNext_${id}+1)%${CAP}); }`)
        ln(`    _ksPrevKick_${id}=_kickHit; _ksPrevSnare_${id}=_snareHit;`)
        // Divide by lifeMult so total travel (speed*life) stays constant
        // regardless of decay — mirrors the evaluator (see evalKickShock).
        ln(`    float _spdK=(0.35f+_strength*0.5f)*max(0.2f,_spd)/${lifeMult.toFixed(4)}f, _spdS=_spdK*1.8f;`)
        ln(`    const float _lifeK=${lifeK}f,_lifeS=${lifeS}f,_bandK=${bandK}f,_bandS=${bandS}f;`)
        ln(`    float _maxD=max(1e-6f,sqrtf(_ksCx*_ksCx+_ksCy*_ksCy));`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _lx=fmodf((_x+0.5f)*_tiles,WIDTH)/_tiles-0.5f,_ly=fmodf((_y+0.5f)*_tiles,HEIGHT)/_tiles-0.5f;`)
        ln(`      float _cdx=_lx-_ksCx,_cdy=_ly-_ksCy,_distC=sqrtf(_cdx*_cdx+_cdy*_cdy)/_maxD;`)
        ln(`      float _wave=0;`)
        ln(`      for(int _r=0;_r<${CAP};_r++){ if(!_ksAlive_${id}[_r]) continue;`)
        ln(`        float _age=t-_ksBorn_${id}[_r]; bool _isKick=_ksKind_${id}[_r]==0;`)
        ln(`        float _spdR=_isKick?_spdK:_spdS,_life=_isKick?_lifeK:_lifeS,_band=_isKick?_bandK:_bandS;`)
        ln(`        if(_age<0||_age>_life) continue;`)
        ln(`        float _rdx=_lx-_ksX_${id}[_r],_rdy=_ly-_ksY_${id}[_r],_dist=sqrtf(_rdx*_rdx+_rdy*_rdy)/_maxD;`)
        ln(`        float _d=_dist-_age*_spdR; float _front=expf(-(_d*_d)/(2.0f*_band*_band));`)
        ln(additive
          ? `        _wave+=_front*(1.0f-_age/_life); }`
          : `        _wave=max(_wave,_front*(1.0f-_age/_life)); }`)
        ln(`      _wave=min(1.0f,_wave);`)
        ln(`      float _jitter=_hihatAmt*0.18f*(sinf(_distC*50.0f-t*_spd*22.0f)*0.5f+0.5f);`)
        ln(`      float _v=min(1.0f,_wave*(0.5f+_strength*0.5f)+_jitter*_wave+0.03f*_strength);`)
        ln(`      ${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)((_distC*0.5f+t*_spd*0.03f)*255));`)
        ln(`      ${ob}[_y*WIDTH+_x].nscale8((uint8_t)(_v*255));`)
        ln(`    }`)
        ln(`  }`)
        break
      }

      case 'VocalAurora': {
        needsT.v = true
        const ob = ownBuf()
        const vocals = f('vocals', 'vocals', 0)
        const energy = f('energy', 'energy', 0.7)
        const silence = boolExpr(node.id, 'silence')
        const speed = f('speed', 'speed', 1)
        const pal = paletteExpr(node.id, 'paletteIn', p)
        ln(`  { // VocalAurora`)
        ln(`    float _rawLevel=min(1.0f,max(0.0f,${vocals}));`)
        ln(`    float _level=_rawLevel*(${VOCAL_AURORA_MIN_INPUT_GAIN.toFixed(1)}f+_rawLevel*${(VOCAL_AURORA_MAX_INPUT_GAIN - VOCAL_AURORA_MIN_INPUT_GAIN).toFixed(1)}f),_strength=min(1.0f,max(0.0f,${energy}));`)
        ln(`    float _gate=(${silence})?0.0f:1.0f;`)
        // Integrated drift phase — mirrors evalVocalAurora: the rate depends on
        // the live vocals level, so scaling absolute t would jump the phase on
        // every level change.
        ln(`    static float _vaPhase_${id}=0.0f,_vaLast_${id}=-1.0f;`)
        ln(`    float _vaDt_${id}=(_vaLast_${id}<0.0f)?0.0f:min(0.25f,max(0.0f,t-_vaLast_${id})); _vaLast_${id}=t;`)
        ln(`    _vaPhase_${id}+=_vaDt_${id}*${speed}*(0.15f+_level*0.35f);`)
        ln(`    float _drift=_vaPhase_${id};`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _ny=HEIGHT>1?(float)_y/(HEIGHT-1):0.0f;`)
        ln(`      float _curtain=0;`)
        ln(`      for(int _bnd=0;_bnd<3;_bnd++){`)
        ln(`        float _bandPhase=_ny*3.0f+_bnd*2.1f+_drift*(1.0f+_bnd*0.4f);`)
        ln(`        float _xOff=sinf(_bandPhase)*(1.2f+_level*1.8f)+sinf(_bandPhase*0.5f+_bnd)*0.6f;`)
        ln(`        float _dx=(_x-WIDTH/2.0f)/max(1.0f,WIDTH/2.0f)-_xOff*0.35f;`)
        ln(`        _curtain+=expf(-_dx*_dx*3.0f)*(0.5f+0.5f*sinf(_bandPhase*1.7f+_bnd*1.3f)); }`)
        ln(`      float _vb=min(1.0f,(0.12f+_strength*0.35f+_level*0.65f)*_gate);`)
        ln(`      float _v=min(1.0f,_curtain*0.6f)*_vb;`)
        ln(`      ${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)((_ny*0.6f+_drift*0.08f+_level*0.25f)*255));`)
        ln(`      ${ob}[_y*WIDTH+_x].nscale8((uint8_t)(_v*255));`)
        ln(`    }`)
        ln(`  }`)
        break
      }

      case 'BeatKaleidoscope': {
        needsT.v = true
        const ob = ownBuf()
        const beat = boolExpr(node.id, 'beat')
        const hue = f('hue', 'hue', 0)
        const energy = f('energy', 'energy', 0.7)
        const speed = f('speed', 'speed', 1)
        const pal = paletteExpr(node.id, 'paletteIn', p)
        ln(`  { // BeatKaleidoscope`)
        ln(`    static float _bkPunch_${id}=0;`)
        ln(`    _bkPunch_${id}=(${beat})?1.0f:_bkPunch_${id}*0.85f;`)
        ln(`    float _strength=min(1.0f,max(0.0f,${energy}));`)
        ln(`    int _wedges=6+(int)roundf(_bkPunch_${id}*6.0f);`)
        // Integrated rotation phase — mirrors evalBeatKaleidoscope: the rate
        // depends on the live energy level, so scaling absolute t would jump
        // the phase on every level change.
        ln(`    static float _bkPhase_${id}=0.0f,_bkLast_${id}=-1.0f;`)
        ln(`    float _bkDt_${id}=(_bkLast_${id}<0.0f)?0.0f:min(0.25f,max(0.0f,t-_bkLast_${id})); _bkLast_${id}=t;`)
        ln(`    _bkPhase_${id}+=_bkDt_${id}*${speed}*(0.15f+_strength*0.35f);`)
        ln(`    float _rot=_bkPhase_${id}+_bkPunch_${id}*0.8f;`)
        ln(`    float _wedgeAngle=6.2831853f/_wedges;`)
        ln(`    float _cx=(WIDTH-1)/2.0f,_cy=(HEIGHT-1)/2.0f,_maxD=max(1e-6f,sqrtf(_cx*_cx+_cy*_cy));`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _dx=_x-_cx,_dy=_y-_cy,_dist=sqrtf(_dx*_dx+_dy*_dy)/_maxD;`)
        ln(`      float _ang=atan2f(_dy,_dx)+_rot;`)
        ln(`      float _a=fmodf(fmodf(_ang,_wedgeAngle)+_wedgeAngle,_wedgeAngle);`)
        ln(`      if(_a>_wedgeAngle/2.0f) _a=_wedgeAngle-_a;`)
        ln(`      float _tex=sinf(_a*10.0f+_dist*8.0f*(1.0f+_bkPunch_${id}*0.6f)-t*${speed}*3.0f)*cosf(_dist*5.0f*(1.0f+_bkPunch_${id}*0.6f)-_a*6.0f);`)
        ln(`      float _v=min(1.0f,max(0.0f,_tex*0.5f+0.5f)*(0.35f+_strength*0.65f)+_bkPunch_${id}*0.25f);`)
        ln(`      ${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)((_dist*0.5f+_a*0.3f+${hue}/360.0f+t*${speed}*0.05f)*255));`)
        ln(`      ${ob}[_y*WIDTH+_x].nscale8((uint8_t)(_v*255));`)
        ln(`    }`)
        ln(`  }`)
        break
      }

      case 'SpectraMosaic': {
        needsT.v = true
        const ob = ownBuf()
        const bass = f('bass', 'bass', 0.5)
        const mids = f('mids', 'mids', 0.5)
        const treble = f('treble', 'treble', 0.5)
        const energy = f('energy', 'energy', 0.7)
        const speed = f('speed', 'speed', 1)
        const tiles = f('tiles', 'tiles', 4)
        const pal = paletteExpr(node.id, 'paletteIn', p)
        ln(`  { // SpectraMosaic`)
        ln(`    float _b=${bass},_m=${mids},_tr=${treble},_strength=min(1.0f,max(0.0f,${energy}));`)
        ln(`    int _n=(int)max(2.0f,min(8.0f,roundf(${tiles})));`)
        ln(`    float _cellW=WIDTH/(float)_n,_cellH=HEIGHT/(float)_n;`)
        // Integrated sweep phase — mirrors evalSpectraMosaic (see BeatKaleidoscope).
        ln(`    static float _smPhase_${id}=0.0f,_smLast_${id}=-1.0f;`)
        ln(`    float _smDt_${id}=(_smLast_${id}<0.0f)?0.0f:min(0.25f,max(0.0f,t-_smLast_${id})); _smLast_${id}=t;`)
        ln(`    _smPhase_${id}+=_smDt_${id}*${speed}*(0.4f+_strength*0.8f);`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      int _cx=(int)(_x/_cellW),_cy=(int)(_y/_cellH);`)
        ln(`      float _diag=(_cx+_cy)/(2.0f*(float)max(1,_n-1));`)
        ln(`      float _mix=_b*(1.0f-_diag)+_m*0.5f+_tr*_diag;`)
        ln(`      float _phase=_cx*0.6f+_cy*0.9f+_smPhase_${id};`)
        ln(`      float _shimmer=sinf(_phase)*0.5f+0.5f;`)
        ln(`      float _v=min(1.0f,0.15f+_mix*0.6f*_strength+_shimmer*0.25f);`)
        ln(`      ${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)((_diag*0.6f+_mix*0.3f+t*${speed}*0.04f)*255));`)
        ln(`      ${ob}[_y*WIDTH+_x].nscale8((uint8_t)(_v*255));`)
        ln(`    }`)
        ln(`  }`)
        break
      }

      case 'PercussionBlobs': {
        needsT.v = true
        const ob = ownBuf()
        const kick = f('kick', 'kick', 0)
        const snare = f('snare', 'snare', 0)
        const hihat = f('hihat', 'hihat', 0)
        const pal = paletteExpr(node.id, 'paletteIn', p)
        const CAP = Math.max(1, Math.round(Number(p.count ?? 12)))
        const sizeMult = Math.max(0.1, Number(p.size ?? 1))
        const lifeMult = Math.max(0.05, Number(p.decay ?? 1))
        const spread = Math.max(0, Math.min(1, Number(p.spawnSpread ?? 1)))
        const spreadF = floatLit(spread)
        const additive = String(p.blendMode ?? 'add') !== 'max'
        const pr = [0.34, 0.20, 0.10].map((v) => (v * sizeMult).toFixed(4))
        const pl = [1.4, 0.7, 0.35].map((v) => (v * lifeMult).toFixed(4))
        ln(`  { // PercussionBlobs`)
        ln(`    static float _pbx_${id}[${CAP}],_pby_${id}[${CAP}],_pbt_${id}[${CAP}]; static uint8_t _pbk_${id}[${CAP}]; static bool _pbAlive_${id}[${CAP}]; static bool _pbInit_${id}=false; static uint8_t _pbNext_${id}=0; static bool _pbPrevKick_${id}=false,_pbPrevSnare_${id}=false,_pbPrevHihat_${id}=false;`)
        ln(`    if(!_pbInit_${id}){ for(int _i=0;_i<${CAP};_i++) _pbAlive_${id}[_i]=false; _pbInit_${id}=true; }`)
        ln(`    bool _kickHit=(${kick})>0.5f, _snareHit=(${snare})>0.5f, _hihatHit=(${hihat})>0.55f;`)
        ln(`    float _pbCx=WIDTH/2.0f,_pbCy=HEIGHT/2.0f;`)
        ln(`    if(_kickHit && !_pbPrevKick_${id}){ _pbx_${id}[_pbNext_${id}]=_pbCx+(random8()/255.0f*WIDTH-_pbCx)*${spreadF}; _pby_${id}[_pbNext_${id}]=_pbCy+(random8()/255.0f*HEIGHT-_pbCy)*${spreadF}; _pbt_${id}[_pbNext_${id}]=t; _pbk_${id}[_pbNext_${id}]=0; _pbAlive_${id}[_pbNext_${id}]=true; _pbNext_${id}=(uint8_t)((_pbNext_${id}+1)%${CAP}); }`)
        ln(`    if(_snareHit && !_pbPrevSnare_${id}){ _pbx_${id}[_pbNext_${id}]=_pbCx+(random8()/255.0f*WIDTH-_pbCx)*${spreadF}; _pby_${id}[_pbNext_${id}]=_pbCy+(random8()/255.0f*HEIGHT-_pbCy)*${spreadF}; _pbt_${id}[_pbNext_${id}]=t; _pbk_${id}[_pbNext_${id}]=1; _pbAlive_${id}[_pbNext_${id}]=true; _pbNext_${id}=(uint8_t)((_pbNext_${id}+1)%${CAP}); }`)
        ln(`    if(_hihatHit && !_pbPrevHihat_${id}){ _pbx_${id}[_pbNext_${id}]=_pbCx+(random8()/255.0f*WIDTH-_pbCx)*${spreadF}; _pby_${id}[_pbNext_${id}]=_pbCy+(random8()/255.0f*HEIGHT-_pbCy)*${spreadF}; _pbt_${id}[_pbNext_${id}]=t; _pbk_${id}[_pbNext_${id}]=2; _pbAlive_${id}[_pbNext_${id}]=true; _pbNext_${id}=(uint8_t)((_pbNext_${id}+1)%${CAP}); }`)
        ln(`    _pbPrevKick_${id}=_kickHit; _pbPrevSnare_${id}=_snareHit; _pbPrevHihat_${id}=_hihatHit;`)
        ln(`    const float _pr[3]={${pr[0]}f,${pr[1]}f,${pr[2]}f}, _pl[3]={${pl[0]}f,${pl[1]}f,${pl[2]}f};`)
        ln(`    float _minDim=min((float)WIDTH,(float)HEIGHT);`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _field=0;`)
        ln(`      for(int _bl=0;_bl<${CAP};_bl++){ if(!_pbAlive_${id}[_bl]) continue;`)
        ln(`        float _age=t-_pbt_${id}[_bl]; uint8_t _kind=_pbk_${id}[_bl]; float _life=_pl[_kind];`)
        ln(`        if(_age<0||_age>_life) continue;`)
        ln(`        float _lifeT=_age/_life;`)
        ln(`        float _radius=_pr[_kind]*_minDim*(0.4f+0.6f*min(1.0f,_lifeT*2.0f));`)
        ln(`        float _decay=1.0f-_lifeT;`)
        ln(`        float _dx=_x-_pbx_${id}[_bl],_dy=_y-_pby_${id}[_bl];`)
        ln(additive
          ? `        _field+=_decay*(_radius*_radius)/(_dx*_dx+_dy*_dy+_radius*_radius*0.15f); }`
          : `        _field=max(_field,_decay*(_radius*_radius)/(_dx*_dx+_dy*_dy+_radius*_radius*0.15f)); }`)
        ln(`      float _v=min(1.0f,_field/(_field+1.1f));`)
        ln(`      ${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)(min(1.0f,_field*0.4f)*255));`)
        ln(`      ${ob}[_y*WIDTH+_x].nscale8((uint8_t)(_v*255));`)
        ln(`    }`)
        ln(`  }`)
        break
      }

      case 'EmberPulse': {
        needsT.v = true
        const ob = ownBuf()
        const bass = f('bass', 'bass', 0.5)
        const mids = f('mids', 'mids', 0.5)
        const treble = f('treble', 'treble', 0.5)
        const beat = boolExpr(node.id, 'beat')
        const energy = f('energy', 'energy', 0.7)
        const speed = f('speed', 'speed', 1)
        ln(`  { // EmberPulse`)
        ln(`    static float _epBurst_${id}=0;`)
        ln(`    _epBurst_${id}=(${beat})?min(1.0f,_epBurst_${id}+0.6f):_epBurst_${id}*0.90f;`)
        ln(`    float _b=${bass},_m=${mids},_tr=${treble},_strength=min(1.0f,max(0.0f,${energy}));`)
        ln(`    float _flicker=t*${speed}*3.0f;`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _nx=WIDTH>1?(float)_x/(WIDTH-1):0.0f;`)
        ln(`      float _hfb=HEIGHT>1?(float)(HEIGHT-1-_y)/(HEIGHT-1):0.0f;`)
        ln(`      float _centerDist=fabsf(_nx-0.5f)*2.0f;`)
        ln(`      float _bandWeight=_b*(1.0f-_centerDist)+_m*(1.0f-fabsf(_centerDist-0.5f)*2.0f)+_tr*_centerDist;`)
        ln(`      float _f1=sinf(_nx*17.0f+_flicker+_hfb*4.0f)*0.5f+0.5f;`)
        ln(`      float _f2=sinf(_nx*29.0f-_flicker*1.3f)*0.5f+0.5f;`)
        ln(`      float _falloff=max(0.0f,1.0f-_hfb*(1.1f-_bandWeight*0.5f-_strength*0.3f));`)
        ln(`      float _heat=_falloff*(0.35f+_bandWeight*0.65f*_strength)*(0.7f+_f1*0.2f+_f2*0.1f);`)
        ln(`      _heat=min(1.0f,_heat+_epBurst_${id}*max(0.0f,1.0f-_hfb*0.6f)*0.8f);`)
        ln(`      ${ob}[_y*WIDTH+_x]=HeatColor((uint8_t)(_heat*255));`)
        ln(`    }`)
        ln(`  }`)
        break
      }

      case 'TurbulentBloom': {
        needsT.v = true
        const ob = ownBuf()
        const bass = f('bass', 'bass', 0.5)
        const mids = f('mids', 'mids', 0.5)
        const treble = f('treble', 'treble', 0.5)
        const energy = f('energy', 'energy', 0.7)
        const speed = f('speed', 'speed', 1)
        const pal = paletteExpr(node.id, 'paletteIn', p)
        // inoise8 takes uint16_t coordinates; casting a negative float would be
        // UB, so every coordinate is folded into [0,240) first (240*256<65536).
        const wrap = (expr: string) => `fmodf(fmodf((${expr}),240.0f)+240.0f,240.0f)`
        ln(`  { // TurbulentBloom`)
        ln(`    float _b=${bass},_m=${mids},_tr=${treble},_strength=min(1.0f,max(0.0f,${energy}));`)
        ln(`    float _trebleAmp=0.15f+_tr*0.6f,_midsAmp=0.3f+_m*0.9f,_bassPulse=0.5f+sqrtf(constrain(_b,0.0f,1.0f))*0.5f;`)
        // Two integrated warp phases — mirrors evalTurbulentBloom (see BeatKaleidoscope).
        ln(`    static float _tbFast_${id}=0.0f,_tbSlow_${id}=0.0f,_tbLast_${id}=-1.0f;`)
        ln(`    float _tbDt_${id}=(_tbLast_${id}<0.0f)?0.0f:min(0.25f,max(0.0f,t-_tbLast_${id})); _tbLast_${id}=t;`)
        ln(`    _tbFast_${id}+=_tbDt_${id}*${speed}*(1.5f+_tr*2.0f); _tbSlow_${id}+=_tbDt_${id}*${speed}*(0.3f+_m*0.6f);`)
        ln(`    float _tFast=_tbFast_${id},_tSlow=_tbSlow_${id};`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _cx=(_x-(WIDTH-1)/2.0f)/max(1.0f,WIDTH/2.0f), _cy=(_y-(HEIGHT-1)/2.0f)/max(1.0f,HEIGHT/2.0f);`)
        ln(`      float _n1=((inoise8((uint16_t)(${wrap('_cx*3.0f+_tFast')}*256.0f),(uint16_t)(${wrap('_cy*3.0f-_tFast')}*256.0f))/255.0f)-0.5f)*2.0f;`)
        ln(`      float _n2=((inoise8((uint16_t)(${wrap('_cx*0.6f+_tSlow')}*256.0f),(uint16_t)(${wrap('_cy*0.6f+50.0f+_tSlow')}*256.0f))/255.0f)-0.5f)*2.0f;`)
        ln(`      float _n3=((inoise8((uint16_t)(${wrap('_cx*3.0f+50.0f+_tFast')}*256.0f),(uint16_t)(${wrap('_cy*3.0f+50.0f-_tFast')}*256.0f))/255.0f)-0.5f)*2.0f;`)
        ln(`      float _n4=((inoise8((uint16_t)(${wrap('_cx*0.6f+50.0f+_tSlow')}*256.0f),(uint16_t)(${wrap('_cy*0.6f+_tSlow')}*256.0f))/255.0f)-0.5f)*2.0f;`)
        ln(`      float _nOffX=_n1*_trebleAmp+_n2*_midsAmp, _nOffY=_n3*_trebleAmp+_n4*_midsAmp;`)
        ln(`      float _wx=_cx+_nOffX,_wy=_cy+_nOffY,_radial=sqrtf(_wx*_wx+_wy*_wy);`)
        ln(`      float _bloom=sinf(_radial*6.0f-t*${speed}*3.0f)+cosf((_wx+_wy)*3.0f+t*${speed}*2.0f);`)
        ln(`      float _crisp=powf(max(0.0f,_bloom*0.5f+0.5f),1.6f);`)
        ln(`      float _v=min(1.0f,_crisp*(0.2f+0.8f*_strength)*_bassPulse);`)
        ln(`      ${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)((_radial*0.5f+_tSlow*0.05f)*255));`)
        ln(`      ${ob}[_y*WIDTH+_x].nscale8((uint8_t)(_v*255));`)
        ln(`    }`)
        ln(`  }`)
        break
      }

      case 'GravityWell': {
        needsT.v = true
        const ob = ownBuf()
        const bass = f('bass', 'bass', 0.5)
        const energy = f('energy', 'energy', 0.7)
        const speed = f('speed', 'speed', 1)
        const colorE = incoming.get(`${node.id}:color`)
          ? colorExpr(node.id, 'color')
          : `CRGB(${Number(p.r ?? 80)}, ${Number(p.g ?? 160)}, ${Number(p.b ?? 255)})`
        ln(`  { // GravityWell`)
        ln(`    float _level=min(1.0f,max(0.0f,${bass})),_strength=min(1.0f,max(0.0f,${energy}));`)
        ln(`    float _cx0=(WIDTH-1)/2.0f,_cy0=(HEIGHT-1)/2.0f;`)
        ln(`    float _orbitR=min((float)WIDTH,(float)HEIGHT)*0.12f*(0.5f+_strength*0.5f);`)
        ln(`    float _wellX=_cx0+cosf(t*${speed}*0.25f)*_orbitR, _wellY=_cy0+sinf(t*${speed}*0.35f)*_orbitR;`)
        ln(`    float _maxD=max(1e-6f,sqrtf(_cx0*_cx0+_cy0*_cy0));`)
        ln(`    float _k=5.0f+_level*10.0f*_strength, _phase=t*(1.0f+${speed}*2.2f);`)
        ln(`    CRGB _base=${colorE};`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _dx=_x-_wellX,_dy=_y-_wellY,_dist=sqrtf(_dx*_dx+_dy*_dy)/_maxD;`)
        ln(`      float _wave=sinf(_k/(_dist+0.12f)-_phase);`)
        ln(`      float _crisp=powf(max(0.0f,_wave*0.5f+0.5f),2.2f);`)
        ln(`      float _v=min(1.0f,0.03f+_level*0.08f*_strength+_crisp*(0.15f+_level*0.85f*_strength));`)
        ln(`      int _i=_y*WIDTH+_x;`)
        ln(`      ${ob}[_i]=_base;`)
        ln(`      ${ob}[_i].nscale8((uint8_t)(_v*255));`)
        ln(`    }`)
        ln(`  }`)
        break
      }

      case 'RainRipples': {
        needsT.v = true
        const ob = ownBuf()
        const trigger = boolExpr(node.id, 'trigger')
        const energy = f('energy', 'energy', 0.7)
        const speed = f('speed', 'speed', 1)
        const pal = paletteExpr(node.id, 'paletteIn', p)
        const CAP = Math.max(1, Math.round(Number(p.count ?? 8)))
        const lifeMult = Math.max(0.05, Number(p.decay ?? 1))
        const bandMult = Math.max(0.05, Number(p.thickness ?? 1))
        const spread = Math.max(0, Math.min(1, Number(p.spawnSpread ?? 1)))
        const spreadF = floatLit(spread)
        const additive = String(p.blendMode ?? 'max') === 'add'
        ln(`  { // RainRipples`)
        ln(`    static float _rrx_${id}[${CAP}],_rry_${id}[${CAP}],_rrt_${id}[${CAP}]; static bool _rrAlive_${id}[${CAP}]; static bool _rrInit_${id}=false; static uint8_t _rrNext_${id}=0; static bool _rrPrevTrig_${id}=false;`)
        ln(`    if(!_rrInit_${id}){ for(int _i=0;_i<${CAP};_i++) _rrAlive_${id}[_i]=false; _rrInit_${id}=true; }`)
        ln(`    bool _trig=(${trigger});`)
        ln(`    float _rrCx=WIDTH/2.0f,_rrCy=HEIGHT/2.0f;`)
        ln(`    if(_trig && !_rrPrevTrig_${id}){ _rrx_${id}[_rrNext_${id}]=_rrCx+(random8()/255.0f*WIDTH-_rrCx)*${spreadF}; _rry_${id}[_rrNext_${id}]=_rrCy+(random8()/255.0f*HEIGHT-_rrCy)*${spreadF}; _rrt_${id}[_rrNext_${id}]=t; _rrAlive_${id}[_rrNext_${id}]=true; _rrNext_${id}=(uint8_t)((_rrNext_${id}+1)%${CAP}); }`)
        ln(`    _rrPrevTrig_${id}=_trig;`)
        ln(`    float _strength=min(1.0f,max(0.0f,${energy})); float _spd=max(0.2f,${speed});`)
        ln(`    float _life=(1.6f/_spd)*${lifeMult.toFixed(4)}f; float _speedPx=max((float)WIDTH,(float)HEIGHT)*0.9f/_life;`)
        ln(`    float _band=(0.9f+(1.0f-_strength)*0.6f)*${bandMult.toFixed(4)}f;`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _v=0;`)
        ln(`      for(int _r=0;_r<${CAP};_r++){ if(!_rrAlive_${id}[_r]) continue;`)
        ln(`        float _age=t-_rrt_${id}[_r]; if(_age<0||_age>_life) continue;`)
        ln(`        float _dx=_x-_rrx_${id}[_r],_dy=_y-_rry_${id}[_r],_dist=sqrtf(_dx*_dx+_dy*_dy);`)
        ln(`        float _d=_dist-_age*_speedPx; float _ring=expf(-(_d*_d)/(2.0f*_band*_band));`)
        ln(additive
          ? `        _v+=_ring*(1.0f-_age/_life); }`
          : `        _v=max(_v,_ring*(1.0f-_age/_life)); }`)
        ln(`      _v=min(1.0f,_v*(0.6f+_strength*0.6f));`)
        ln(`      ${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)((_v*0.5f+t*${speed}*0.02f)*255));`)
        ln(`      ${ob}[_y*WIDTH+_x].nscale8((uint8_t)(_v*255));`)
        ln(`    }`)
        ln(`  }`)
        break
      }

      case 'PrismStorm': {
        needsT.v = true
        needsWorley.v = true
        const ob = ownBuf()
        const treble = f('treble', 'treble', 0.5)
        const mids = f('mids', 'mids', 0.5)
        const hihat = f('hihat', 'hihat', 0)
        const energy = f('energy', 'energy', 0.7)
        const speed = f('speed', 'speed', 1)
        const pal = paletteExpr(node.id, 'paletteIn', p)
        ln(`  { // PrismStorm`)
        ln(`    static float _psOri_${id}=0; static bool _psInit_${id}=false,_psPrevAbove_${id}=false;`)
        ln(`    if(!_psInit_${id}){ _psOri_${id}=random16()/65535.0f*360.0f; _psInit_${id}=true; }`)
        ln(`    bool _above=(${hihat})>0.55f;`)
        ln(`    if(_above && !_psPrevAbove_${id}) _psOri_${id}=random16()/65535.0f*360.0f;`)
        ln(`    _psPrevAbove_${id}=_above;`)
        ln(`    float _strength=min(1.0f,max(0.0f,${energy}));`)
        // Integrated orientation drift — mirrors evalPrismStorm (see BeatKaleidoscope).
        ln(`    static float _psPhase_${id}=0.0f,_psLast_${id}=-1.0f;`)
        ln(`    float _psDt_${id}=(_psLast_${id}<0.0f)?0.0f:min(0.25f,max(0.0f,t-_psLast_${id})); _psLast_${id}=t;`)
        ln(`    _psPhase_${id}+=_psDt_${id}*${speed}*(4.0f+${mids}*8.0f);`)
        ln(`    float _drift=_psPhase_${id};`)
        ln(`    float _omega=(_psOri_${id}+_drift)*0.01745329f,_co=cosf(_omega),_si=sinf(_omega);`)
        ln(`    float _freq=0.8f+${treble}*2.5f,_sc=0.5f+${mids}*0.4f;`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _px=_x*_sc,_py=_y*_sc; int _xi=(int)floorf(_px),_yi=(int)floorf(_py); float _v=0;`)
        ln(`      for(int _dj=-1;_dj<=1;_dj++) for(int _di=-1;_di<=1;_di++){`)
        ln(`        int _cx=_xi+_di,_cy=_yi+_dj; float _h=_worleyHash(_cx,_cy),_h2=_worleyHash(_cx+31,_cy-17);`)
        ln(`        float _fx=_cx+0.5f+(_h-0.5f),_fy=_cy+0.5f+(_h2-0.5f);`)
        ln(`        float _dx=_px-_fx,_dy=_py-_fy,_g=expf(-2.5f*(_dx*_dx+_dy*_dy));`)
        ln(`        float _proj=_dx*_co+_dy*_si,_w=_h2<0.5f?1.0f:-1.0f;`)
        ln(`        _v+=_w*_g*cosf(6.2831853f*_freq*_proj+t*${speed}*2.0f+_h*6.2831853f); }`)
        ln(`      float _shard=powf(max(0.0f,_v*0.5f+0.5f),1.4f);`)
        ln(`      float _vv=min(1.0f,_shard*(0.25f+_strength*0.75f));`)
        ln(`      ${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)((_v*0.5f+0.5f+${mids}*0.2f)*255));`)
        ln(`      ${ob}[_y*WIDTH+_x].nscale8((uint8_t)(_vv*255));`)
        ln(`    }`)
        ln(`  }`)
        break
      }

      case 'BrightnessMod': {
        const ob = ownBuf()
        const br = f('brightness', 'brightness', 1)
        ln(`  { ${seedFrom('frame')} float _br = fmaxf(0.0f, ${br}); for (int _i = 0; _i < NUM_LEDS; _i++) ${ob}[_i] = CRGB((uint8_t)fminf(255.0f, ${ob}[_i].r * _br), (uint8_t)fminf(255.0f, ${ob}[_i].g * _br), (uint8_t)fminf(255.0f, ${ob}[_i].b * _br)); }`)
        break
      }

      case 'Fade': {
        const ob = ownBuf()
        const fade = f('fade', 'fade', 0.5)
        ln(`  { ${seedFrom('frame')} uint8_t _fa = (uint8_t)(constrain(${fade}, 0, 1) * 255); fadeToBlackBy(${ob}, NUM_LEDS, _fa); }`)
        break
      }

      // Manual A/B frame selector; copies the wired side when the other is
      // empty (matching the evaluator's fallback).
      case 'FrameSwitch': {
        const ob = ownBuf()
        const a = srcBuf('a'), b = srcBuf('b'), sel = boolExpr(node.id, 'sel')
        if (a && b) ln(`  ::memmove(${ob}, (${sel}) ? ${b} : ${a}, sizeof(CRGB) * NUM_LEDS);`)
        else if (a || b) ln(`  ::memmove(${ob}, ${a ?? b}, sizeof(CRGB) * NUM_LEDS);`)
        else ln(`  fill_solid(${ob}, NUM_LEDS, CRGB::Black);`)
        break
      }

      // Named rectangular zones — mirrors the evaluator's Zones case: seed
      // from base (or black), then for each enabled+wired zone, copy its own
      // buffer into this node's buffer only within that zone's rectangle.
      case 'Zones': {
        const ob = ownBuf()
        const base = srcBuf('base')
        ln(base ? `  ::memmove(${ob}, ${base}, sizeof(CRGB) * NUM_LEDS);` : `  fill_solid(${ob}, NUM_LEDS, CRGB::Black);`)
        for (const key of ['a', 'b', 'c', 'd'] as const) {
          if (p[`${key}Enabled`] === false) continue
          const zbuf = srcBuf(key)
          if (!zbuf) continue
          const zx = Math.max(0, Math.min(1, Number(p[`${key}X`] ?? 0)))
          const zy = Math.max(0, Math.min(1, Number(p[`${key}Y`] ?? 0)))
          const zw = Math.max(0, Math.min(1, Number(p[`${key}W`] ?? 1)))
          const zh = Math.max(0, Math.min(1, Number(p[`${key}H`] ?? 1)))
          ln(`  for (int _y=(int)(${floatLit(zy)}*HEIGHT); _y<(int)(${floatLit(zy + zh)}*HEIGHT) && _y<HEIGHT; _y++)`)
          ln(`    for (int _x=(int)(${floatLit(zx)}*WIDTH); _x<(int)(${floatLit(zx + zw)}*WIDTH) && _x<WIDTH; _x++)`)
          ln(`      ${ob}[_y*WIDTH+_x] = ${zbuf}[_y*WIDTH+_x];`)
        }
        break
      }

      // Feedback/trails buffer — the persistent buf_ own buffer is deliberately
      // not seeded from the input each frame (see the Code node comment above);
      // it fades in place, then re-lightens per-channel wherever the input is
      // brighter. Mirrors the evaluator's Trails case.
      case 'Trails': {
        const ob = ownBuf()
        const src = srcBuf('frame')
        if (!src) { ln(`  fill_solid(${ob}, NUM_LEDS, CRGB::Black);`); break }
        const decay = f('decay', 'decay', 0.15)
        ln(`  { // Trails: fadeToBlackBy(decay^3) then re-lighten from the input (per-channel max)`)
        ln(`    float _decay = constrain(${decay},0.0f,1.0f); _decay = _decay*_decay*_decay;`)
        ln(`    fadeToBlackBy(${ob}, NUM_LEDS, (uint8_t)(_decay*255.0f));`)
        ln(`    for(int _i=0;_i<NUM_LEDS;_i++){`)
        ln(`      if(${src}[_i].r>${ob}[_i].r)${ob}[_i].r=${src}[_i].r;`)
        ln(`      if(${src}[_i].g>${ob}[_i].g)${ob}[_i].g=${src}[_i].g;`)
        ln(`      if(${src}[_i].b>${ob}[_i].b)${ob}[_i].b=${src}[_i].b;}`)
        ln(`  }`)
        break
      }

      case 'FrameFeedback': {
        const ob = ownBuf()
        const src = srcBuf('frame')
        if (!src) { ln(`  fill_solid(${ob}, NUM_LEDS, CRGB::Black);`); break }
        const delay = Math.max(1, Math.min(32, Math.round(Number(p.delayFrames ?? 2))))
        const capacity = delay + 1
        feedbackHistoryBufs.set(id, capacity)
        const hist = `_fb_${id}`
        const fade = f('fade', 'fade', 0.08)
        const amount = f('amount', 'amount', 0.5)
        const offX = f('offsetX', 'offsetX', 0)
        const offY = f('offsetY', 'offsetY', 0)
        const angle = f('angle', 'angle', 0)
        const scale = f('scale', 'scale', 1)
        const mode = String(p.blendMode ?? 'screen')
        const transformMode = String(p.feedbackTransform ?? 'none')
        ln(`  { // FrameFeedback: ${delay}-frame recursive ring buffer`)
        ln(`    static uint8_t _fb_idx_${id}=0;`)
        ln(`    const uint8_t _fb_cap_${id}=${capacity};`)
        ln(`    uint8_t _fb_read_${id}=(_fb_idx_${id}+_fb_cap_${id}-${delay})%_fb_cap_${id};`)
        ln(`    float _fb_fade_${id}=1.0f-constrain(${fade},0.0f,1.0f);`)
        ln(`    float _fb_amt_${id}=constrain(${amount},0.0f,1.0f);`)
        ln(`    float _fb_cx_${id}=(WIDTH-1)/2.0f,_fb_cy_${id}=(HEIGHT-1)/2.0f;`)
        if (transformMode === 'translate') {
          ln(`    float _fb_dx_${id}=${offX},_fb_dy_${id}=${offY};`)
        } else if (transformMode === 'rotate') {
          ln(`    float _fb_a_${id}=${angle}*0.01745329f,_fb_co_${id}=cos(_fb_a_${id}),_fb_si_${id}=sin(_fb_a_${id});`)
        } else if (transformMode === 'scale') {
          ln(`    float _fb_s_${id}=constrain(${scale},0.05f,4.0f);`)
        }
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        if (transformMode === 'translate') {
          ln(`      int _sx=(((int)floorf(_x-_fb_dx_${id}+0.5f))%WIDTH+WIDTH)%WIDTH,_sy=(((int)floorf(_y-_fb_dy_${id}+0.5f))%HEIGHT+HEIGHT)%HEIGHT;`)
          ln(`      CRGB _fb=${hist}[_fb_read_${id}][_sy*WIDTH+_sx];`)
        } else if (transformMode === 'rotate') {
          ln(`      float _rx=_x-_fb_cx_${id},_ry=_y-_fb_cy_${id}; int _sx=(int)floorf(_fb_cx_${id}+_rx*_fb_co_${id}+_ry*_fb_si_${id}+0.5f),_sy=(int)floorf(_fb_cy_${id}-_rx*_fb_si_${id}+_ry*_fb_co_${id}+0.5f);`)
          ln(`      CRGB _fb=(_sx>=0&&_sx<WIDTH&&_sy>=0&&_sy<HEIGHT)?${hist}[_fb_read_${id}][_sy*WIDTH+_sx]:CRGB::Black;`)
        } else if (transformMode === 'scale') {
          ln(`      int _sx=(int)floorf(_fb_cx_${id}+(_x-_fb_cx_${id})/_fb_s_${id}+0.5f),_sy=(int)floorf(_fb_cy_${id}+(_y-_fb_cy_${id})/_fb_s_${id}+0.5f);`)
          ln(`      CRGB _fb=(_sx>=0&&_sx<WIDTH&&_sy>=0&&_sy<HEIGHT)?${hist}[_fb_read_${id}][_sy*WIDTH+_sx]:CRGB::Black;`)
        } else {
          ln(`      CRGB _fb=${hist}[_fb_read_${id}][_y*WIDTH+_x];`)
        }
        ln(`      _fb.nscale8((uint8_t)(_fb_fade_${id}*255.0f));`)
        ln(`      CRGB _a=${src}[_y*WIDTH+_x];`)
        if (mode === 'normal') {
          ln(`      CRGB _r=_a; nblend(_r,_fb,(uint8_t)(_fb_amt_${id}*255.0f)); ${ob}[_y*WIDTH+_x]=_r;`)
        } else if (mode === 'lighten') {
          ln(`      ${ob}[_y*WIDTH+_x]=CRGB((uint8_t)(_a.r*(1.0f-_fb_amt_${id})+max(_a.r,_fb.r)*_fb_amt_${id}),(uint8_t)(_a.g*(1.0f-_fb_amt_${id})+max(_a.g,_fb.g)*_fb_amt_${id}),(uint8_t)(_a.b*(1.0f-_fb_amt_${id})+max(_a.b,_fb.b)*_fb_amt_${id}));`)
        } else {
          const expr: Record<string, string> = {
            multiply:   '_av*_bv',
            screen:     '1.0f-(1.0f-_av)*(1.0f-_bv)',
            add:        'min(1.0f,_av+_bv)',
            difference: 'fabsf(_av-_bv)',
          }
          ln(`      for(int _c=0;_c<3;_c++){ float _av=_a[_c]/255.0f,_bv=_fb[_c]/255.0f;`)
          ln(`        float _m=${expr[mode] ?? '1.0f-(1.0f-_av)*(1.0f-_bv)'};`)
          ln(`        ${ob}[_y*WIDTH+_x][_c]=(uint8_t)((_av*(1.0f-_fb_amt_${id})+_m*_fb_amt_${id})*255.0f); }`)
        }
        ln(`    }`)
        ln(`    ::memmove(${hist}[_fb_idx_${id}], ${ob}, sizeof(CRGB) * NUM_LEDS);`)
        ln(`    _fb_idx_${id}=(_fb_idx_${id}+1)%_fb_cap_${id};`)
        ln(`  }`)
        break
      }

      case 'Mask': {
        const ob = ownBuf()
        const mask = srcBuf('mask')
        ln(`  { ${seedFrom('frame')}`)
        if (mask) ln(`    for (int _i = 0; _i < NUM_LEDS; _i++) ${ob}[_i].nscale8((${mask}[_i].r + ${mask}[_i].g + ${mask}[_i].b) / 3);`)
        ln(`  }`)
        break
      }

      case 'HueShift': {
        const ob = ownBuf()
        const shift = f('shift', 'shift', 0)
        ln(`  { ${seedFrom('frame')} uint8_t _sh = (uint8_t)((${shift}) * 255); for (int _i = 0; _i < NUM_LEDS; _i++) ${ob}[_i] = CHSV(rgb2hsv_approximate(${ob}[_i]).hue + _sh, rgb2hsv_approximate(${ob}[_i]).sat, rgb2hsv_approximate(${ob}[_i]).val); }`)
        break
      }

      // RGB→HSV (rgb2hsv_approximate)→scale saturation→CHSV back to RGB.
      case 'Saturation': {
        const ob = ownBuf()
        const amount = f('amount', 'amount', 1)
        ln(`  { ${seedFrom('frame')} for (int _i = 0; _i < NUM_LEDS; _i++) {`)
        ln(`      CHSV _hs = rgb2hsv_approximate(${ob}[_i]);`)
        ln(`      uint8_t _s2 = (uint8_t)constrain((float)_hs.sat * (${amount}), 0.0f, 255.0f);`)
        ln(`      ${ob}[_i] = CHSV(_hs.hue, _s2, _hs.val); } }`)
        break
      }

      case 'ColorBoost': {
        const ob = ownBuf()
        const boost = f('boost', 'boost', 0.5)
        ln(`  { ${seedFrom('frame')} float _cb = constrain(${boost}, 0.0f, 1.0f); float _cs = 1.0f + _cb * 1.5f; for (int _i = 0; _i < NUM_LEDS; _i++) {`)
        ln(`      float _l = ${ob}[_i].r * 0.2126f + ${ob}[_i].g * 0.7152f + ${ob}[_i].b * 0.0722f;`)
        ln(`      ${ob}[_i].r = (uint8_t)constrain(_l + (${ob}[_i].r - _l) * _cs, 0.0f, 255.0f);`)
        ln(`      ${ob}[_i].g = (uint8_t)constrain(_l + (${ob}[_i].g - _l) * _cs, 0.0f, 255.0f);`)
        ln(`      ${ob}[_i].b = (uint8_t)constrain(_l + (${ob}[_i].b - _l) * _cs, 0.0f, 255.0f);`)
        ln(`    } }`)
        break
      }

      case 'Gamma': {
        const ob = ownBuf()
        const g = f('gamma', 'gamma', 2.2)
        ln(`  { ${seedFrom('frame')} napplyGamma_video(${ob}, NUM_LEDS, max(0.1f, ${g})); }`)
        break
      }

      case 'Transform': {
        needsT.v = true
        const ob = ownBuf()
        const src = srcBuf('frame')
        if (!src) { ln(`  fill_solid(${ob}, NUM_LEDS, CRGB::Black); // Transform: no input`); break }
        const mode = String(p.transform ?? 'rotate')
        const rate = f('rate', 'rate', 90)
        const angle = f('angle', 'angle', 0)
        ln(`  { float _cx=(WIDTH-1)/2.0f,_cy=(HEIGHT-1)/2.0f,_rate=${rate};`)
        if (mode === 'translate') {
          ln(`    float _a=${angle}*0.01745329f,_dx=cos(_a)*_rate*t,_dy=sin(_a)*_rate*t;`)
          ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
          ln(`      int _sx=(((int)floorf(_x-_dx+0.5f))%WIDTH+WIDTH)%WIDTH, _sy=(((int)floorf(_y-_dy+0.5f))%HEIGHT+HEIGHT)%HEIGHT;`)
          ln(`      ${ob}[_y*WIDTH+_x]=${src}[_sy*WIDTH+_sx];}}`)
        } else if (mode === 'scale') {
          ln(`    float _s=1.0f+(_rate/100.0f)*t; _s=constrain(_s,0.05f,20.0f);`)
          ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
          ln(`      int _sx=(int)floorf(_cx+(_x-_cx)/_s+0.5f), _sy=(int)floorf(_cy+(_y-_cy)/_s+0.5f);`)
          ln(`      ${ob}[_y*WIDTH+_x]=(_sx>=0&&_sx<WIDTH&&_sy>=0&&_sy<HEIGHT)?${src}[_sy*WIDTH+_sx]:CRGB::Black;}}`)
        } else {
          ln(`    float _a=_rate*t*0.01745329f,_co=cos(_a),_si=sin(_a);`)
          ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
          ln(`      float _rx=_x-_cx,_ry=_y-_cy; int _sx=(int)floorf(_cx+_rx*_co+_ry*_si+0.5f), _sy=(int)floorf(_cy-_rx*_si+_ry*_co+0.5f);`)
          ln(`      ${ob}[_y*WIDTH+_x]=(_sx>=0&&_sx<WIDTH&&_sy>=0&&_sy<HEIGHT)?${src}[_sy*WIDTH+_sx]:CRGB::Black;}}`)
        }
        break
      }

      // Blender-style array: composite `count` copies of the input, each offset/
      // rotated/scaled by an accumulating step about the matrix centre, dimmed by
      // falloff^i. High→low paint order so copy 0 lands on top for `over`. Keep
      // in sync with evalArray() in graphEvaluator.ts.
      case 'Array': {
        const ob = ownBuf()
        const src = srcBuf('frame')
        if (!src) { ln(`  fill_solid(${ob}, NUM_LEDS, CRGB::Black); // Array: no input`); break }
        const offX = f('offsetX', 'offsetX', 3), offY = f('offsetY', 'offsetY', 0)
        // `angle` and `count` are wire-able (see nodeLibrary inputs) so an
        // animated signal can spin/grow the array; unwired they bake the slider.
        const ang = f('angle', 'angle', 0)
        const scl = `max(0.05f, ${f('scale', 'scale', 1)})`, fo = f('falloff', 'falloff', 0.7)
        const mode = ['lighten', 'over'].includes(String(p.blendMode)) ? String(p.blendMode) : 'add'
        const countWired = incoming.has(`${node.id}:count`)
        const countLit = Math.max(1, Math.min(32, Math.round(Number(p.count ?? 5))))
        ln(`  { // Array${countWired ? '' : ` x${countLit}`}`)
        ln(`    fill_solid(${ob}, NUM_LEDS, CRGB::Black);`)
        // A wired count is clamped to [1, 32] at runtime (the evaluator's cap).
        if (countWired) ln(`    int _cnt=(int)(${f('count', 'count', 5)}+0.5f); _cnt=_cnt<1?1:(_cnt>32?32:_cnt);`)
        ln(`    float _cx=(WIDTH-1)/2.0f,_cy=(HEIGHT-1)/2.0f;`)
        ln(`    for(int _i=${countWired ? '_cnt-1' : countLit - 1};_i>=0;_i--){`)
        ln(`      float _ox=${offX}*_i,_oy=${offY}*_i,_a=${ang}*_i*0.01745329f,_co=cos(_a),_si=sin(_a);`)
        ln(`      float _inv=1.0f/powf(${scl},_i),_dim=powf(${fo},_i);`)
        ln(`      for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`        float _px=_x-_ox-_cx,_py=_y-_oy-_cy,_rx=_px*_co+_py*_si,_ry=-_px*_si+_py*_co;`)
        ln(`        int _sx=(int)floorf(_cx+_rx*_inv+0.5f),_sy=(int)floorf(_cy+_ry*_inv+0.5f);`)
        ln(`        if(_sx<0||_sx>=WIDTH||_sy<0||_sy>=HEIGHT) continue;`)
        ln(`        CRGB _s=${src}[_sy*WIDTH+_sx]; uint8_t _r=(uint8_t)(_s.r*_dim),_g=(uint8_t)(_s.g*_dim),_b=(uint8_t)(_s.b*_dim);`)
        ln(`        CRGB& _o=${ob}[_y*WIDTH+_x];`)
        if (mode === 'lighten') {
          ln(`        _o.r=max(_o.r,_r); _o.g=max(_o.g,_g); _o.b=max(_o.b,_b);`)
        } else if (mode === 'over') {
          ln(`        float _cov=max(_r,max(_g,_b))/255.0f;`)
          ln(`        _o.r=(uint8_t)min(255.0f,_o.r*(1-_cov)+_r); _o.g=(uint8_t)min(255.0f,_o.g*(1-_cov)+_g); _o.b=(uint8_t)min(255.0f,_o.b*(1-_cov)+_b);`)
        } else {
          ln(`        _o.r=qadd8(_o.r,_r); _o.g=qadd8(_o.g,_g); _o.b=qadd8(_o.b,_b);`)
        }
        ln(`      } } }`)
        break
      }

      // Frame blend with real blend modes — `blendMode` picks the operator,
      // `amount` is opacity (0–255). Keep in sync with the `Blend` case in
      // graphEvaluator.ts. `normal` uses FastLED's nblend; other modes blend
      // per channel then cross-fade against the base by opacity.
      case 'Blend': {
        const ob = ownBuf()
        // `amount` is opacity 0–1; FastLED's nblend / cross-fade want 0–255.
        const a = srcBuf('a'), b = srcBuf('b'), amt = f('amount', 'amount', 0.5)
        const mode = String(p.blendMode ?? 'normal')
        ln(`  { ${a ? `::memmove(${ob}, ${a}, sizeof(CRGB) * NUM_LEDS);` : `fill_solid(${ob}, NUM_LEDS, CRGB::Black);`}`)
        if (mode === 'normal') {
          ln(`    nblend(${ob}, ${b ?? ob}, NUM_LEDS, (uint8_t)((${amt}) * 255)); }`)
        } else {
          const expr: Record<string, string> = {
            multiply:   '_av*_bv',
            screen:     '1.0f-(1.0f-_av)*(1.0f-_bv)',
            overlay:    '_av<0.5f?2.0f*_av*_bv:1.0f-2.0f*(1.0f-_av)*(1.0f-_bv)',
            add:        'min(1.0f,_av+_bv)',
            difference: 'fabsf(_av-_bv)',
          }
          ln(`    float _op=(${amt}); for(int _i=0;_i<NUM_LEDS;_i++){`)
          ln(`      CRGB _a=${ob}[_i], _b=${b ?? ob}[_i];`)
          ln(`      for(int _c=0;_c<3;_c++){ float _av=_a[_c]/255.0f,_bv=_b[_c]/255.0f;`)
          ln(`        float _r=${expr[mode] ?? '_bv'};`)
          ln(`        ${ob}[_i][_c]=(uint8_t)((_av*(1.0f-_op)+_r*_op)*255.0f); } } }`)
        }
        break
      }

      case 'RadialBurst': {
        needsT.v = true
        const ob = ownBuf()
        const speed = rateCpp(f('speed', 'speed', 0.5), SPEED_MAX.RadialBurst)
        const rings = f('arms', 'arms', 8)
        const pal = paletteExpr(node.id, 'paletteIn', p)
        ln(`  { float _spd=${speed},_rings=max(1.0f,min(32.0f,${rings})); for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`    float _d=sqrt((_x-WIDTH/2.0f)*(_x-WIDTH/2.0f)+(_y-HEIGHT/2.0f)*(_y-HEIGHT/2.0f))/sqrt(WIDTH*WIDTH/4.0f+HEIGHT*HEIGHT/4.0f);`)
        ln(`    float _w=(sin((_d*_rings-t*_spd*3)*3.14159f)+1)/2.0f;`)
        ln(`    ${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)(_d*255)); ${ob}[_y*WIDTH+_x].nscale8((uint8_t)(_w*255));}}`)
        break
      }

      case 'Spiral': {
        needsT.v = true
        const ob = ownBuf()
        const speed = rateCpp(f('speed', 'speed', 0.5), SPEED_MAX.Spiral), arms = f('arms', 'arms', 2)
        const pal = paletteExpr(node.id, 'paletteIn', p)
        ln(`  { float _spd=${speed}; for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`    float _d=sqrt((_x-WIDTH/2.0f)*(_x-WIDTH/2.0f)+(_y-HEIGHT/2.0f)*(_y-HEIGHT/2.0f))/sqrt(WIDTH*WIDTH/4.0f+HEIGHT*HEIGHT/4.0f);`)
        ln(`    float _a=atan2(_y-HEIGHT/2.0f,_x-WIDTH/2.0f);float _s=(_a+_d*12.57f-t*_spd*3.14159f)*${arms};`)
        ln(`    ${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)((_d+t*0.083f)*255)); ${ob}[_y*WIDTH+_x].nscale8((uint8_t)((sin(_s)+1)/2.0f*230));}}`)
        break
      }

      // Wedge mirror — folds each pixel's polar angle into a single segment,
      // reflects it about the segment's midline, and samples the source there.
      // Mirrors evalKaleidoscope in graphEvaluator.ts: same W/2,H/2 centre, the
      // same two-step fold, and floorf(v+0.5f) to match JS Math.round, so the
      // preview and the flashed sketch produce identical frames.
      case 'Kaleidoscope': {
        const ob = ownBuf()
        const src = srcBuf('frame')
        if (!src) { ln(`  fill_solid(${ob}, NUM_LEDS, CRGB::Black); // Kaleidoscope: no input`); break }
        // `segments` is wireable, so the wedge angle is computed per frame.
        const seg = f('segments', 'segments', 6)
        ln(`  { float _kCx=WIDTH/2.0f,_kCy=HEIGHT/2.0f;`)
        ln(`    float _kSeg=6.2831853f/max(2.0f,(float)(${seg}));`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _kdx=_x-_kCx,_kdy=_y-_kCy,_kd=sqrtf(_kdx*_kdx+_kdy*_kdy);`)
        ln(`      float _ka=fmodf(fmodf(atan2f(_kdy,_kdx),_kSeg)+_kSeg,_kSeg);`)
        ln(`      if(_ka>_kSeg*0.5f) _ka=_kSeg-_ka;`)
        ln(`      int _ksx=(int)floorf(_kCx+_kd*cosf(_ka)+0.5f),_ksy=(int)floorf(_kCy+_kd*sinf(_ka)+0.5f);`)
        ln(`      ${ob}[_y*WIDTH+_x]=(_ksx<0||_ksx>=WIDTH||_ksy<0||_ksy>=HEIGHT)?CRGB::Black:${src}[_ksy*WIDTH+_ksx];`)
        ln(`    } }`)
        break
      }

      case 'Particles': {
        const ob = ownBuf()
        const mode = String(p.particleType ?? 'fountain')
        if (['comet', 'snow', 'embers', 'bubbles', 'fireflies', 'meteor', 'tornado', 'attractor'].includes(mode)) needsT.v = true
        const rate = f('rate', 'rate', 0.3)
        const decayL = f('decay', 'decay', 0.92)
        const pal = paletteExpr(node.id, 'paletteIn', p)
        // Extra variant-specific controls — see PARTICLE_*_MODES in
        // nodeLibrary.ts for which mode reads which. Compile-time constants
        // (not wired ports), mirroring the evaluator's ParticleOpts.
        const sizeP = Number(p.size ?? 1)
        const countP = Math.max(2, Math.min(80, Math.round(Number(p.count ?? 24))))
        const spreadP = Number(p.spread ?? 1)
        const gravityP = Number(p.gravity ?? 1)
        const bounceP = Number(p.bounce ?? 1)
        const seed = seedProp(p)
        // Fixed-size pool (SoA): l[i] <= 0.04 marks a free slot. swarm keeps every
        // slot live (boids), so its pool is sized directly from `count` (capped
        // for the O(N^2) step) instead of a fixed 40.
        const cap = mode === 'swarm' ? Math.max(2, Math.min(80, countP)) : 120
        const A = `_pa_${id}`
        ln(`  { // Particles: ${mode}`)
        ln(`    const int _PN=${cap};`)
        ln(`    static float ${A}x[_PN], ${A}y[_PN], ${A}vx[_PN], ${A}vy[_PN], ${A}l[_PN], ${A}s[_PN]; static uint8_t ${A}r[_PN], ${A}g[_PN], ${A}b[_PN]; static bool ${A}init=false;`)
        if (seed) ln(`    static bool ${A}seeded=false; if(!${A}seeded){ random16_set_seed(${seed}u); ${A}seeded=true; }`)
        // Spawn colour is a fixed palette sample kept only so the (unused-at-render)
        // per-particle colour slots stay well-formed; render colours by life below.
        ln(`    float _rate=${rate}; CRGB _pc=ColorFromPalette(${pal},180);`)

        if (mode === 'swarm') {
          ln(`    if(!${A}init){ for(int i=0;i<_PN;i++){ ${A}x[i]=random8()/255.0f*WIDTH; ${A}y[i]=random8()/255.0f*HEIGHT; ${A}vx[i]=(random8()/255.0f-0.5f)*0.6f; ${A}vy[i]=(random8()/255.0f-0.5f)*0.6f; ${A}l[i]=1; ${A}r[i]=_pc.r; ${A}g[i]=_pc.g; ${A}b[i]=_pc.b; } ${A}init=true; }`)
          ln(`    float _R=max(3.0f, min(WIDTH,HEIGHT)*0.5f); static float ${A}nvx[_PN], ${A}nvy[_PN];`)
          ln(`    for(int i=0;i<_PN;i++){ float cx=0,cy=0,ax=0,ay=0,sx=0,sy=0; int n=0;`)
          ln(`      for(int j=0;j<_PN;j++){ if(j==i) continue; float dx=${A}x[j]-${A}x[i], dy=${A}y[j]-${A}y[i]; float d=sqrtf(dx*dx+dy*dy);`)
          ln(`        if(d<_R&&d>0){ cx+=${A}x[j]; cy+=${A}y[j]; ax+=${A}vx[j]; ay+=${A}vy[j]; n++; if(d<_R*0.4f){ sx-=dx/d; sy-=dy/d; } } }`)
          ln(`      float vx=${A}vx[i], vy=${A}vy[i];`)
          ln(`      if(n>0){ vx+=(cx/n-${A}x[i])*0.0008f+(ax/n-${A}vx[i])*0.05f+sx*0.04f; vy+=(cy/n-${A}y[i])*0.0008f+(ay/n-${A}vy[i])*0.05f+sy*0.04f; }`)
          ln(`      float sp=sqrtf(vx*vx+vy*vy); if(sp>0.7f){ vx=vx/sp*0.7f; vy=vy/sp*0.7f; } ${A}nvx[i]=vx; ${A}nvy[i]=vy; }`)
          ln(`    for(int i=0;i<_PN;i++){ ${A}vx[i]=${A}nvx[i]; ${A}vy[i]=${A}nvy[i]; ${A}x[i]=fmodf(${A}x[i]+${A}vx[i]+WIDTH,WIDTH); ${A}y[i]=fmodf(${A}y[i]+${A}vy[i]+HEIGHT,HEIGHT); }`)
        } else {
          ln(`    if(!${A}init){ for(int i=0;i<_PN;i++) ${A}l[i]=0; ${A}init=true; }`)

          // ── spawn ──
          // Width-spawning modes centre their random x on WIDTH/2 and scale the
          // deviation by `spreadP` (spreadP=1 reproduces the old full-width
          // random8()/255.0f*WIDTH distribution exactly).
          const spreadF = floatLit(spreadP)
          const gravityF = floatLit(gravityP)
          const bounceF = floatLit(bounceP)
          const spawnX = `(WIDTH*0.5f+(random8()/255.0f-0.5f)*WIDTH*${spreadF})`
          if (mode === 'fountain')
            ln(`    if(random8()<(uint8_t)(_rate*255)){ for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=${spawnX}; ${A}y[i]=HEIGHT-1; ${A}vx[i]=(random8()/255.0f-0.5f)*0.6f*${spreadF}; ${A}vy[i]=-(random8()/255.0f*0.5f+0.1f); ${A}l[i]=1; ${A}r[i]=_pc.r; ${A}g[i]=_pc.g; ${A}b[i]=_pc.b; break; } }`)
          else if (mode === 'gravity')
            ln(`    if(random8()<(uint8_t)(_rate*255)){ for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=${spawnX}; ${A}y[i]=0; ${A}vx[i]=(random8()/255.0f-0.5f)*0.4f*${spreadF}; ${A}vy[i]=random8()/255.0f*0.2f; ${A}l[i]=1; ${A}r[i]=_pc.r; ${A}g[i]=_pc.g; ${A}b[i]=_pc.b; break; } }`)
          else if (mode === 'fireworks') {
            ln(`    if(random8()<(uint8_t)(_rate*0.12f*255)){ uint8_t _hue=random8(); int _n=14+random8()/32; float _cx=random8()/255.0f*WIDTH, _cy=random8()/255.0f*HEIGHT*0.5f+HEIGHT*0.1f;`)
            ln(`      for(int k=0;k<_n;k++) for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ float _a=(k/(float)_n)*6.2831f+random8()/255.0f*0.3f, _sp=random8()/255.0f*0.5f+0.35f; ${A}x[i]=_cx; ${A}y[i]=_cy; ${A}vx[i]=cos(_a)*_sp; ${A}vy[i]=sin(_a)*_sp; ${A}l[i]=1; CRGB _fc=CHSV(_hue+(random8()%30)-15,255,255); ${A}r[i]=_fc.r; ${A}g[i]=_fc.g; ${A}b[i]=_fc.b; break; } }`)
          } else if (mode === 'sparkle')
            ln(`    { int _sp=max(1,(int)(_rate*WIDTH*0.8f)); for(int k=0;k<_sp;k++) if(random8()<(uint8_t)(_rate*255)){ for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=${spawnX}; ${A}y[i]=random8()/255.0f*HEIGHT*0.3f; ${A}vx[i]=0; ${A}vy[i]=random8()/255.0f*0.25f+0.05f; ${A}l[i]=1; ${A}r[i]=_pc.r; ${A}g[i]=_pc.g; ${A}b[i]=_pc.b; break; } } }`)
          else if (mode === 'comet')
            ln(`    { float _hx=(WIDTH-1)*(0.5f+0.45f*sin(t*0.9f)), _hy=(HEIGHT-1)*(0.5f+0.45f*sin(t*0.6f+1.3f)); for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=_hx; ${A}y[i]=_hy; ${A}vx[i]=0; ${A}vy[i]=0; ${A}l[i]=1; ${A}r[i]=_pc.r; ${A}g[i]=_pc.g; ${A}b[i]=_pc.b; break; } }`)
          else if (mode === 'snow')
            ln(`    if(random8()<(uint8_t)(_rate*255)){ for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=${spawnX}; ${A}y[i]=0; ${A}vy[i]=random8()/255.0f*0.12f+0.05f; ${A}l[i]=0.7f+random8()/255.0f*0.3f; ${A}s[i]=random8()/255.0f*6.28f; ${A}r[i]=_pc.r; ${A}g[i]=_pc.g; ${A}b[i]=_pc.b; break; } }`)
          else if (mode === 'rain')
            ln(`    if(random8()<(uint8_t)(_rate*255)){ for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=${spawnX}; ${A}y[i]=0; ${A}vx[i]=(random8()/255.0f-0.5f)*0.18f; ${A}vy[i]=random8()/255.0f*0.45f+0.35f; ${A}l[i]=1; break; } }`)
          else if (mode === 'embers')
            ln(`    if(random8()<(uint8_t)(_rate*255)){ for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=random8()/255.0f*WIDTH; ${A}y[i]=HEIGHT-1; ${A}vx[i]=(random8()/255.0f-0.5f)*0.12f; ${A}vy[i]=-(random8()/255.0f*0.18f+0.04f); ${A}s[i]=random8()/255.0f*6.28f; ${A}l[i]=1; break; } }`)
          else if (mode === 'bubbles')
            ln(`    if(random8()<(uint8_t)(_rate*255)){ for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=random8()/255.0f*WIDTH; ${A}y[i]=HEIGHT-1; ${A}vy[i]=-(random8()/255.0f*0.16f+0.06f); ${A}s[i]=random8()/255.0f*6.28f; ${A}l[i]=1; break; } }`)
          else if (mode === 'vortex')
            ln(`    if(random8()<(uint8_t)(_rate*255)){ for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=random8()/255.0f*WIDTH; ${A}y[i]=random8()/255.0f*HEIGHT; ${A}l[i]=1; break; } }`)
          else if (mode === 'orbit')
            ln(`    { int _target=${countP}; for(int i=0;i<_target;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=random8()/255.0f*WIDTH; ${A}y[i]=random8()/255.0f*HEIGHT; ${A}s[i]=random8()/255.0f*0.08f+0.025f; ${A}l[i]=1; } for(int i=_target;i<_PN;i++) ${A}l[i]=0; }`)
          else if (mode === 'confetti')
            ln(`    { int _sp=max(1,(int)(_rate*4)); for(int k=0;k<_sp;k++) if(random8()<(uint8_t)(_rate*255)){ for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=${spawnX}; ${A}y[i]=random8()/255.0f*HEIGHT; ${A}vx[i]=(random8()/255.0f-0.5f)*0.16f; ${A}vy[i]=random8()/255.0f*0.08f+0.02f; ${A}l[i]=1; break; } } }`)
          else if (mode === 'fireflies')
            ln(`    { int _target=${countP}; for(int i=0;i<_target;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=random8()/255.0f*WIDTH; ${A}y[i]=random8()/255.0f*HEIGHT; ${A}vx[i]=(random8()/255.0f-0.5f)*0.12f; ${A}vy[i]=(random8()/255.0f-0.5f)*0.12f; ${A}s[i]=random8()/255.0f*6.28f; ${A}l[i]=1; } for(int i=_target;i<_PN;i++) ${A}l[i]=0; }`)
          else if (mode === 'meteor')
            ln(`    { float _span=max(1.0f,max(WIDTH,HEIGHT)-1.0f),_phase=fmodf(t*max(2.0f,WIDTH*0.45f),_span); for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=_phase*(WIDTH-1)/_span; ${A}y[i]=_phase*(HEIGHT-1)/_span; ${A}l[i]=1; break; } }`)
          else if (mode === 'tornado')
            ln(`    if(random8()<(uint8_t)(_rate*255)){ for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=WIDTH/2.0f; ${A}y[i]=HEIGHT-1; ${A}vy[i]=-(random8()/255.0f*0.16f+0.06f); ${A}s[i]=random8()/255.0f*6.28f; ${A}l[i]=1; break; } }`)
          else if (mode === 'pinwheel')
            ln(`    if(random8()<(uint8_t)(_rate*255)){ for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ float _a=random8()/255.0f*6.2831f; ${A}x[i]=WIDTH/2.0f; ${A}y[i]=HEIGHT/2.0f; ${A}vx[i]=cos(_a)*0.18f; ${A}vy[i]=sin(_a)*0.18f; ${A}l[i]=1; break; } }`)
          else if (mode === 'bounce')
            ln(`    { int _target=${countP}; for(int i=0;i<_target;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=random8()/255.0f*WIDTH; ${A}y[i]=random8()/255.0f*HEIGHT; ${A}vx[i]=(random8()/255.0f-0.5f)*0.5f; ${A}vy[i]=(random8()/255.0f-0.5f)*0.5f; ${A}l[i]=1; } for(int i=_target;i<_PN;i++) ${A}l[i]=0; }`)
          else if (mode === 'attractor')
            ln(`    if(random8()<(uint8_t)(_rate*255)){ for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=random8()/255.0f*WIDTH; ${A}y[i]=random8()/255.0f*HEIGHT; ${A}vx[i]=(random8()/255.0f-0.5f)*0.1f; ${A}vy[i]=(random8()/255.0f-0.5f)*0.1f; ${A}l[i]=1; break; } }`)
          else if (mode === 'waterfall')
            ln(`    { int _sp=max(1,(int)(_rate*3)); for(int k=0;k<_sp;k++) if(random8()<(uint8_t)(_rate*255)){ for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=WIDTH*0.5f+(random8()/255.0f-0.5f)*0.3f*WIDTH*${spreadF}; ${A}y[i]=0; ${A}vx[i]=(random8()/255.0f-0.5f)*0.08f; ${A}vy[i]=random8()/255.0f*0.2f+0.12f; ${A}l[i]=1; break; } } }`)

          // ── update ──
          ln(`    for(int i=0;i<_PN;i++){ if(${A}l[i]<=0.04f) continue;`)
          if (mode === 'fountain')
            ln(`      ${A}x[i]+=${A}vx[i]; ${A}y[i]+=${A}vy[i]; ${A}vy[i]+=0.02f*${gravityF}; ${A}l[i]*=${decayL}; if(${A}y[i]<0) ${A}l[i]=0; }`)
          else if (mode === 'gravity')
            ln(`      ${A}vy[i]+=0.045f*${gravityF}; ${A}x[i]+=${A}vx[i]; ${A}y[i]+=${A}vy[i]; if(${A}y[i]>=HEIGHT-1){ ${A}y[i]=HEIGHT-1; ${A}vy[i]*=-0.55f*${bounceF}; ${A}vx[i]*=0.8f; ${A}l[i]*=0.9f; } ${A}l[i]*=${decayL}; }`)
          else if (mode === 'fireworks')
            ln(`      ${A}vy[i]=(${A}vy[i]+0.022f*${gravityF})*0.965f; ${A}vx[i]*=0.965f; ${A}x[i]+=${A}vx[i]; ${A}y[i]+=${A}vy[i]; ${A}l[i]*=${decayL}*0.985f; }`)
          else if (mode === 'sparkle')
            ln(`      ${A}y[i]+=${A}vy[i]; ${A}l[i]*=${decayL}*0.9f; if(${A}y[i]>=HEIGHT) ${A}l[i]=0; }`)
          else if (mode === 'comet')
            ln(`      ${A}l[i]*=${decayL}; }`)
          else if (mode === 'snow')
            ln(`      ${A}y[i]+=${A}vy[i]; ${A}x[i]+=sin(t*1.5f+${A}s[i])*0.12f; if(${A}y[i]>=HEIGHT) ${A}l[i]=0; }`)
          else if (mode === 'rain')
            ln(`      ${A}x[i]+=${A}vx[i]; ${A}y[i]+=${A}vy[i]; ${A}l[i]*=${decayL}*0.995f; if(${A}y[i]>=HEIGHT) ${A}l[i]=0; }`)
          else if (mode === 'embers')
            ln(`      ${A}x[i]+=${A}vx[i]+sin(t*2+${A}s[i])*0.05f; ${A}y[i]+=${A}vy[i]; ${A}l[i]*=${decayL}*0.985f; if(${A}y[i]<0) ${A}l[i]=0; }`)
          else if (mode === 'bubbles')
            ln(`      ${A}x[i]+=sin(t*3+${A}s[i])*0.1f; ${A}y[i]+=${A}vy[i]; if(${A}y[i]<0) ${A}l[i]=0; }`)
          else if (mode === 'vortex')
            ln(`      { float dx=${A}x[i]-(WIDTH-1)/2.0f,dy=${A}y[i]-(HEIGHT-1)/2.0f,d=max(0.5f,sqrtf(dx*dx+dy*dy)); ${A}x[i]+=-dy/d*0.24f-dx*0.006f; ${A}y[i]+=dx/d*0.24f-dy*0.006f; ${A}l[i]*=${decayL}*0.995f; } }`)
          else if (mode === 'orbit')
            ln(`      { float dx=${A}x[i]-(WIDTH-1)/2.0f,dy=${A}y[i]-(HEIGHT-1)/2.0f,c=cos(${A}s[i]),s=sin(${A}s[i]); ${A}x[i]=(WIDTH-1)/2.0f+dx*c-dy*s; ${A}y[i]=(HEIGHT-1)/2.0f+dx*s+dy*c; ${A}l[i]=1; } }`)
          else if (mode === 'confetti')
            ln(`      ${A}x[i]+=${A}vx[i]; ${A}y[i]+=${A}vy[i]; ${A}l[i]*=${decayL}*0.94f; if(${A}y[i]>=HEIGHT) ${A}l[i]=0; }`)
          else if (mode === 'fireflies')
            ln(`      { float sx=max(1.0f,WIDTH-1.0f),sy=max(1.0f,HEIGHT-1.0f); ${A}x[i]=fmodf(${A}x[i]+${A}vx[i]+sin(t+${A}s[i])*0.035f+sx,sx); ${A}y[i]=fmodf(${A}y[i]+${A}vy[i]+cos(t*0.8f+${A}s[i])*0.035f+sy,sy); ${A}l[i]=0.65f+sin(t*3+${A}s[i])*0.35f; } }`)
          else if (mode === 'meteor')
            ln(`      ${A}l[i]*=${decayL}*0.96f; }`)
          else if (mode === 'tornado')
            ln(`      ${A}y[i]+=${A}vy[i]; { float h=max(0.0f,min(1.0f,1-${A}y[i]/HEIGHT)); ${A}x[i]=WIDTH/2.0f+sin(t*5+${A}s[i]+${A}y[i]*0.7f)*(0.5f+h*WIDTH*0.35f); } ${A}l[i]*=${decayL}*0.995f; if(${A}y[i]<0) ${A}l[i]=0; }`)
          else if (mode === 'pinwheel')
            ln(`      { float vx=${A}vx[i]-${A}vy[i]*0.035f,vy=${A}vy[i]+${A}vx[i]*0.035f; ${A}vx[i]=vx; ${A}vy[i]=vy; ${A}x[i]+=vx; ${A}y[i]+=vy; ${A}l[i]*=${decayL}*0.99f; if(${A}x[i]<0||${A}x[i]>=WIDTH||${A}y[i]<0||${A}y[i]>=HEIGHT) ${A}l[i]=0; } }`)
          else if (mode === 'bounce')
            ln(`      ${A}x[i]+=${A}vx[i]; ${A}y[i]+=${A}vy[i]; if(${A}x[i]<=0||${A}x[i]>=WIDTH-1){ ${A}x[i]=max(0.0f,min(WIDTH-1.0f,${A}x[i])); ${A}vx[i]*=-1; } if(${A}y[i]<=0||${A}y[i]>=HEIGHT-1){ ${A}y[i]=max(0.0f,min(HEIGHT-1.0f,${A}y[i])); ${A}vy[i]*=-1; } ${A}l[i]=1; }`)
          else if (mode === 'attractor')
            ln(`      { float ax=(WIDTH-1)*(0.5f+0.35f*sin(t*0.7f)),ay=(HEIGHT-1)*(0.5f+0.35f*cos(t*0.9f)),dx=ax-${A}x[i],dy=ay-${A}y[i],d=max(1.0f,sqrtf(dx*dx+dy*dy)); ${A}vx[i]=${A}vx[i]*0.97f+dx/d*0.025f; ${A}vy[i]=${A}vy[i]*0.97f+dy/d*0.025f; ${A}x[i]+=${A}vx[i]; ${A}y[i]+=${A}vy[i]; ${A}l[i]*=${decayL}*0.998f; } }`)
          else if (mode === 'waterfall')
            ln(`      ${A}vy[i]+=0.025f*${gravityF}; ${A}x[i]+=${A}vx[i]; ${A}y[i]+=${A}vy[i]; if(${A}y[i]>=HEIGHT-1){ ${A}y[i]=HEIGHT-1; ${A}vy[i]*=-0.3f*${bounceF}; ${A}vx[i]+=(random8()/255.0f-0.5f)*0.35f; ${A}l[i]*=0.7f; } ${A}l[i]*=${decayL}*0.995f; }`)
        }

        // ── render (shared) ── every particle is coloured by its life through the
        // palette, so young/bright particles land at the palette's hot end and cool
        // toward its start as they fade (mirrors evalParticles).
        // Blob radius baked from the panel's configured WIDTH/HEIGHT — mirrors
        // the evaluator's particleScale.ts so firmware matches preview.
        // `sizeP` further scales it, same as the evaluator's `size` opt.
        const R = Math.max(0.5, particleRadius(width, height) * sizeP)
        const Rf = Number.isInteger(R) ? R.toFixed(1) : String(R)
        ln(`    fill_solid(${ob}, NUM_LEDS, CRGB::Black);`)
        ln(`    for(int i=0;i<_PN;i++){ if(${A}l[i]<=0.04f) continue; float _k=min(1.0f,${A}l[i]), _sx=${A}x[i], _sy=${A}y[i];`)
        ln(`      int _x0=max(0,(int)floorf(_sx-${Rf}f-1.0f)), _x1=min(WIDTH-1,(int)ceilf(_sx+${Rf}f+1.0f));`)
        ln(`      int _y0=max(0,(int)floorf(_sy-${Rf}f-1.0f)), _y1=min(HEIGHT-1,(int)ceilf(_sy+${Rf}f+1.0f));`)
        ln(`      CRGB _pcol=ColorFromPalette(${pal},(uint8_t)(_k*255)); _pcol.nscale8((uint8_t)(_k*255));`)
        ln(`      for(int _y=_y0;_y<=_y1;_y++) for(int _x=_x0;_x<=_x1;_x++){`)
        ln(`        float _dx=(_x+0.5f)-_sx,_dy=(_y+0.5f)-_sy; float _cov=constrain(${Rf}f+0.5f-sqrtf(_dx*_dx+_dy*_dy),0.0f,1.0f);`)
        ln(`        if(_cov<=0.0f) continue; CRGB _add=_pcol; _add.nscale8((uint8_t)(_cov*255.0f)); ${ob}[_y*WIDTH+_x]+=_add; } } }`)
        break
      }

      // Curated stateful point/trajectory generators — exact same math as
      // evalFormulaPoints in graphEvaluator.ts (no algorithm drift), one
      // dedicated block per formulaType baked at generation time (the variant
      // isn't wired, so there's nothing to branch on at runtime). See
      // docs/development/design/formula-pattern-nodes.md.
      case 'FormulaPoints': {
        const ob = ownBuf()
        const formulaType = String(p.formulaType ?? 'phyllotaxis')
        const pal = paletteExpr(node.id, 'paletteIn', p)
        const dotSize = Math.max(0.1, Number(p.dotSize ?? 1))
        const R = Math.max(0.5, particleRadius(width, height) * dotSize)
        const Rf = floatLit(R)
        const speed01 = Math.max(0, Math.min(1, Number(p.speed ?? 0.3)))
        const count = Math.max(1, Math.min(300, Math.round(Number(p.count ?? 60))))
        const A = `_fp_${id}`
        if (formulaType === 'phyllotaxis' || formulaType === 'lissajousPath' || formulaType === 'rosePath') needsT.v = true

        // Splats one soft disc of `colorExpr` at (xExpr, yExpr) into `buf` —
        // same bounding-box + coverage technique as the Particles case above.
        // Emits its own nested `{ }` block, so it's safe to call from inside
        // an enclosing `for` loop.
        const splat = (xExpr: string, yExpr: string, colorExpr: string, buf: string) => {
          ln(`      { float _sx=${xExpr}, _sy=${yExpr};`)
          ln(`        int _x0=max(0,(int)floorf(_sx-${Rf}-1.0f)), _x1=min(WIDTH-1,(int)ceilf(_sx+${Rf}+1.0f));`)
          ln(`        int _y0=max(0,(int)floorf(_sy-${Rf}-1.0f)), _y1=min(HEIGHT-1,(int)ceilf(_sy+${Rf}+1.0f));`)
          ln(`        CRGB _pcol=${colorExpr};`)
          ln(`        for(int _py=_y0;_py<=_y1;_py++) for(int _px=_x0;_px<=_x1;_px++){`)
          ln(`          float _dx=(_px+0.5f)-_sx,_dy=(_py+0.5f)-_sy; float _cov=constrain(${Rf}+0.5f-sqrtf(_dx*_dx+_dy*_dy),0.0f,1.0f);`)
          ln(`          if(_cov<=0.0f) continue; CRGB _add=_pcol; _add.nscale8((uint8_t)(_cov*255.0f)); ${buf}[_py*WIDTH+_px]+=_add; } }`)
        }

        switch (formulaType) {
          case 'logisticMap': {
            const chaos = floatLit(Math.max(0, Math.min(4, Number(p.chaos ?? 3.8))))
            ln(`  { // Formula Points: logisticMap`)
            ln(`    static float ${A}x=0.5f;`)
            ln(`    float _r=${chaos};`)
            ln(`    fill_solid(${ob}, NUM_LEDS, CRGB::Black);`)
            ln(`    for(int _i=0;_i<${count};_i++){`)
            ln(`      ${A}x=_r*${A}x*(1.0f-${A}x);`)
            ln(`      float _ang=((float)_i/${count})*6.2831853f, _rad=0.5f*${A}x;`)
            splat(`(0.5f+_rad*cosf(_ang))*(WIDTH-1)`, `(0.5f+_rad*sinf(_ang))*(HEIGHT-1)`, `ColorFromPalette(${pal},(uint8_t)(${A}x*255.0f))`, ob)
            ln(`    }`)
            ln(`  }`)
            break
          }

          case 'attractor': {
            const presets: Record<string, readonly [number, number, number, number]> = {
              classic: [1.4, -2.3, 2.4, -2.1],
              swirl: [-2.7, -0.09, -0.86, -2.2],
              web: [-0.827, -1.637, 1.659, -0.943],
            }
            // Resolve the preset name against the known set before echoing it:
            // the raw property travels in a shared graph, and a newline in it
            // would end this `//` comment and inject the rest as code.
            const presetName = String(p.preset ?? 'classic') in presets ? String(p.preset ?? 'classic') : 'classic'
            const [pa, pb, pc, pd] = presets[presetName]
            const persist = Math.max(0, Math.min(1, Number(p.persistence ?? 0.85)))
            ln(`  { // Formula Points: attractor (de Jong, ${presetName})`)
            ln(`    static float ${A}ax=0.1f, ${A}ay=0.1f;`)
            ln(`    fadeToBlackBy(${ob}, NUM_LEDS, (uint8_t)(${floatLit(1 - persist)}*255.0f));`)
            ln(`    for(int _i=0;_i<${count};_i++){`)
            ln(`      float _nx=sinf(${floatLit(pa)}*${A}ay)-cosf(${floatLit(pb)}*${A}ax);`)
            ln(`      float _ny=sinf(${floatLit(pc)}*${A}ax)-cosf(${floatLit(pd)}*${A}ay);`)
            ln(`      ${A}ax=_nx; ${A}ay=_ny;`)
            splat(`((${A}ax+2.0f)/4.0f)*(WIDTH-1)`, `((${A}ay+2.0f)/4.0f)*(HEIGHT-1)`, `ColorFromPalette(${pal},(uint8_t)(((float)_i/${count})*255.0f))`, ob)
            ln(`    }`)
            ln(`  }`)
            break
          }

          case 'lissajousPath': {
            const persist = Math.max(0, Math.min(1, Number(p.persistence ?? 0.85)))
            const freqA = floatLit(Math.max(1, Number(p.freqA ?? 3)))
            const freqB = floatLit(Math.max(1, Number(p.freqB ?? 2)))
            const speedMax = floatLit(speed01 * 2) // FORMULA_POINTS_SPEED_MAX.lissajousPath
            ln(`  { // Formula Points: lissajousPath`)
            ln(`    fadeToBlackBy(${ob}, NUM_LEDS, (uint8_t)(${floatLit(1 - persist)}*255.0f));`)
            ln(`    float _phase=t*${speedMax};`)
            ln(`    float _cx=sinf(${freqA}*_phase), _cy=sinf(${freqB}*_phase);`)
            ln(`    float _hue=fmodf(_phase/6.2831853f,1.0f); if(_hue<0.0f)_hue+=1.0f;`)
            splat(`(_cx+1.0f)/2.0f*(WIDTH-1)`, `(_cy+1.0f)/2.0f*(HEIGHT-1)`, `ColorFromPalette(${pal},(uint8_t)(_hue*255.0f))`, ob)
            ln(`  }`)
            break
          }

          case 'rosePath': {
            const persist = Math.max(0, Math.min(1, Number(p.persistence ?? 0.85)))
            const k = floatLit(Math.max(1, Number(p.petals ?? 5)))
            const speedMax = floatLit(speed01 * 2) // FORMULA_POINTS_SPEED_MAX.rosePath
            ln(`  { // Formula Points: rosePath`)
            ln(`    fadeToBlackBy(${ob}, NUM_LEDS, (uint8_t)(${floatLit(1 - persist)}*255.0f));`)
            ln(`    float _phase=t*${speedMax};`)
            ln(`    float _rr=cosf(${k}*_phase);`)
            ln(`    float _cx=_rr*cosf(_phase), _cy=_rr*sinf(_phase);`)
            ln(`    float _hue=fmodf(_phase/6.2831853f,1.0f); if(_hue<0.0f)_hue+=1.0f;`)
            splat(`(_cx+1.0f)/2.0f*(WIDTH-1)`, `(_cy+1.0f)/2.0f*(HEIGHT-1)`, `ColorFromPalette(${pal},(uint8_t)(_hue*255.0f))`, ob)
            ln(`  }`)
            break
          }

          case 'phyllotaxis':
          default: {
            // GOLDEN_ANGLE = 2π(1 − 1/φ) — same literal as graphEvaluator.ts.
            // Extra precision (default floatLit rounds to 4 digits): this
            // literal is multiplied by `_i` up to `count` (≤300), so 4-digit
            // rounding would drift the outer spiral arms visibly out of sync
            // with the preview's full-precision angle.
            const goldenAngle = floatLit(2 * Math.PI * (1 - 1 / 1.618033988749895), 8)
            const speedMax = floatLit(speed01 * 1) // FORMULA_POINTS_SPEED_MAX.phyllotaxis
            ln(`  { // Formula Points: phyllotaxis`)
            ln(`    float _spin=t*${speedMax};`)
            ln(`    fill_solid(${ob}, NUM_LEDS, CRGB::Black);`)
            ln(`    for(int _i=0;_i<${count};_i++){`)
            ln(`      float _ang=_i*${goldenAngle}+_spin, _rr=sqrtf((float)_i/${count});`)
            splat(`(0.5f+0.5f*_rr*cosf(_ang))*(WIDTH-1)`, `(0.5f+0.5f*_rr*sinf(_ang))*(HEIGHT-1)`, `ColorFromPalette(${pal},(uint8_t)(((float)_i/${count})*255.0f))`, ob)
            ln(`    }`)
            ln(`  }`)
            break
          }
        }
        break
      }

      case 'Invert': {
        const ob = ownBuf()
        ln(`  ${seedFrom('frame')} for(int _i=0;_i<NUM_LEDS;_i++){${ob}[_i].r=255-${ob}[_i].r;${ob}[_i].g=255-${ob}[_i].g;${ob}[_i].b=255-${ob}[_i].b;}`)
        break
      }

      case 'Mirror': {
        const ob = ownBuf()
        const src = srcBuf('frame')
        if (!src) { ln(`  fill_solid(${ob}, NUM_LEDS, CRGB::Black); // Mirror: no input`); break }
        const mode = String(p.mirrorMode ?? 'horizontal')
        const glow = Boolean(p.glow)
        ln(`  { for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        // base = the mirrored source pixel (min-side of the reflection)
        ln(`    int _sx=_x,_sy=_y;`)
        if (mode === 'horizontal' || mode === 'quad') ln(`    _sx=min(_x,WIDTH-1-_x);`)
        if (mode === 'vertical' || mode === 'quad') ln(`    _sy=min(_y,HEIGHT-1-_y);`)
        if (mode === 'diagonal') ln(`    _sx=min(min(_x,_y),WIDTH-1);_sy=min(max(_x,_y),HEIGHT-1);`)
        if (glow) {
          // additive bloom: base + glowAmount× the discarded partner, tinted
          // per-channel by the `color` input (white neutral). scale8 chain = g/255.
          const g = f('glowAmount', 'glowAmount', 0.35)
          const tintE = incoming.get(`${node.id}:color`)
            ? colorExpr(node.id, 'color')
            : `CRGB(${Number(p.r ?? 255)}, ${Number(p.g ?? 255)}, ${Number(p.b ?? 255)})`
          ln(`    int _ax=_x,_ay=_y;`)
          if (mode === 'horizontal' || mode === 'quad') ln(`    _ax=max(_x,WIDTH-1-_x);`)
          if (mode === 'vertical' || mode === 'quad') ln(`    _ay=max(_y,HEIGHT-1-_y);`)
          if (mode === 'diagonal') ln(`    _ax=min(max(_x,_y),WIDTH-1);_ay=min(min(_x,_y),HEIGHT-1);`)
          ln(`    CRGB _b=${src}[_sy*WIDTH+_sx], _a=${src}[_ay*WIDTH+_ax], _t=${tintE};`)
          ln(`    ${ob}[_y*WIDTH+_x]=CRGB(qadd8(_b.r,scale8(scale8(_a.r,_t.r),(uint8_t)(constrain(${g},0.0f,1.0f)*255.0f))),qadd8(_b.g,scale8(scale8(_a.g,_t.g),(uint8_t)(constrain(${g},0.0f,1.0f)*255.0f))),qadd8(_b.b,scale8(scale8(_a.b,_t.b),(uint8_t)(constrain(${g},0.0f,1.0f)*255.0f))));}}`)
          break
        }
        ln(`    ${ob}[_y*WIDTH+_x]=${src}[_sy*WIDTH+_sx];}}`)
        break
      }

      case 'GradientFrame': {
        const ob = ownBuf()
        const rA = Number(p.rA ?? 0), gA = Number(p.gA ?? 200), bA = Number(p.bA ?? 255)
        const rB = Number(p.rB ?? 255), gB = Number(p.gB ?? 0), bB = Number(p.bB ?? 255)
        const vert = incoming.get(`${node.id}:vertical`) ? null : Boolean(p.vertical)
        ln(`  { for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`    float _t=${vert === null ? `((${boolExpr(node.id, 'vertical')}) ? _y/(HEIGHT-1.0f) : _x/(WIDTH-1.0f))` : vert ? '_y/(HEIGHT-1.0f)' : '_x/(WIDTH-1.0f)'};`)
        ln(`    ${ob}[_y*WIDTH+_x]=CRGB((uint8_t)(${rA}*(1-_t)+${rB}*_t),(uint8_t)(${gA}*(1-_t)+${gB}*_t),(uint8_t)(${bA}*(1-_t)+${bB}*_t));}}`)
        break
      }

      case 'GradientSampler': {
        const tt = f('t', 't', 0)
        const rA = Number(p.rA ?? 0), gA = Number(p.gA ?? 200), bA = Number(p.bA ?? 255)
        const rB = Number(p.rB ?? 255), gB = Number(p.gB ?? 0), bB = Number(p.bB ?? 255)
        ln(`  CRGB ${v('color')} = CRGB((uint8_t)(${rA}*(1-(${tt}))+${rB}*(${tt})),(uint8_t)(${gA}*(1-(${tt}))+${gB}*(${tt})),(uint8_t)(${bA}*(1-(${tt}))+${bB}*(${tt})));`)
        break
      }

      case 'PaletteSampler': {
        const tt = f('t', 't', 0), pal = paletteExpr(node.id, 'paletteIn', p)
        ln(`  CRGB ${v('color')} = ColorFromPalette(${pal}, (uint8_t)((${tt})*255));`)
        break
      }

      case 'PaletteSweep': {
        needsT.v = true
        const rate = f('rate', 'rate', 0.1)
        const pal = paletteExpr(node.id, 'paletteIn', p)
        const easing = String(p.easing ?? 'sine')
        ln(`  float _psPhase_${id} = fmodf(fmodf(t * fmaxf(0.0f, (${rate})), 1.0f) + 1.0f, 1.0f);`)
        ln(`  float _psPos_${id} = _psPhase_${id} < 0.5f ? _psPhase_${id} * 2.0f : (1.0f - _psPhase_${id}) * 2.0f;`)
        if (easing === 'quad') {
          ln(`  _psPos_${id} = _psPos_${id} < 0.5f ? 2.0f * _psPos_${id} * _psPos_${id} : 1.0f - powf(-2.0f * _psPos_${id} + 2.0f, 2.0f) / 2.0f;`)
        } else if (easing === 'cubic') {
          ln(`  _psPos_${id} = _psPos_${id} < 0.5f ? 4.0f * _psPos_${id} * _psPos_${id} * _psPos_${id} : 1.0f - powf(-2.0f * _psPos_${id} + 2.0f, 3.0f) / 2.0f;`)
        } else if (easing !== 'linear') {
          ln(`  _psPos_${id} = (1.0f - cosf(3.14159265f * _psPos_${id})) * 0.5f;`)
        }
        ln(`  CRGB ${v('color')} = ColorFromPalette(${pal}, (uint8_t)(_psPos_${id} * 255.0f));`)
        break
      }

      case 'Abs':
        ln(`  float ${v('result')} = fabs(${f('x', 'x', 0)});`)
        break

      case 'Mod': {
        const mx = f('x', 'x', 0), mm = f('m', 'm', 1)
        ln(`  float ${v('result')} = fmod(fmod(${mx}, ${mm}) + (${mm}), ${mm});`)
        break
      }

      case 'Random': {
        const lo = Number(p.min ?? 0), hi = Number(p.max ?? 1)
        const seed = seedProp(p)
        const loLit = floatLit(lo)
        const spanLit = floatLit(hi - lo)
        if (seed) {
          ln(`  static uint32_t _rng_${id} = ${seed}u; _rng_${id} = _rng_${id} * 1664525u + 1013904223u;`)
          ln(`  float ${v('value')} = ${loLit} + (((_rng_${id} >> 16) & 0xFFFFu) / 65535.0f) * ${spanLit};`)
        } else {
          ln(`  float ${v('value')} = ${loLit} + (random16() / 65535.0f) * ${spanLit};`)
        }
        break
      }

      case 'Counter': {
        const rate = f('rate', 'rate', 0.5)
        ln(`  static float ${v('value')} = 0;`)
        ln(`  ${v('value')} = fmod(${v('value')} + (${rate}) / 60.0f, 1.0f);`)
        break
      }

      case 'Gate': {
        const val = f('value', 'value', 0), gate = boolExpr(node.id, 'gate')
        ln(`  float ${v('result')} = (${gate}) ? (${val}) : ${Number(p.fallback ?? 0)};`)
        break
      }

      // Low-pass smoothing — millis()-based EMA with time constant `response`
      // seconds, seeded from the first sample. Mirrors the evaluator's Smooth.
      case 'Smooth': {
        const resp = Math.max(0, Number(p.response ?? 0.25))
        const val = f('value', 'value', 0)
        if (resp <= 0.01) { ln(`  float ${v('result')} = ${val};`); break }
        ln(`  static float ${v('result')} = 0; static uint32_t _smT_${id} = 0; static bool _smI_${id} = false;`)
        ln(`  { float _in = ${val}; uint32_t _now = millis();`)
        ln(`    if (!_smI_${id}) { ${v('result')} = _in; _smI_${id} = true; }`)
        ln(`    else ${v('result')} += (_in - ${v('result')}) * (1.0f - expf(-(float)(_now - _smT_${id}) / 1000.0f / ${resp.toFixed(3)}f));`)
        ln(`    _smT_${id} = _now; }`)
        break
      }

      // Sample & hold — latch `value` on a rising edge of `trigger` (seeded
      // from the first sample, matching the evaluator).
      case 'SampleHold': {
        const val = f('value', 'value', 0), trig = boolExpr(node.id, 'trigger')
        ln(`  static float ${v('result')} = 0; static bool _shP_${id} = false, _shI_${id} = false;`)
        ln(`  { bool _t = (${trig}); if (!_shI_${id} || (_t && !_shP_${id})) { ${v('result')} = ${val}; _shI_${id} = true; } _shP_${id} = _t; }`)
        break
      }

      case 'Switch': {
        const a = f('a', 'a', 0), b2 = f('b', 'b', 1), sel = boolExpr(node.id, 'sel')
        ln(`  float ${v('result')} = (${sel}) ? (${b2}) : (${a});`)
        break
      }

      // Trigger envelope — optional linear attack to 1 on a rising edge, then
      // linear decay to 0; outputs 0 until the first trigger.
      case 'Envelope': {
        const trig = boolExpr(node.id, 'trigger')
        const attackProp = Number(p.attack ?? 0)
        const decayProp = Number(p.decay ?? 0.5)
        const attackMs = Number.isFinite(attackProp) ? Math.max(0, Math.round(attackProp * 1000)) : 0
        const decayMs = Number.isFinite(decayProp) ? Math.max(50, Math.round(decayProp * 1000)) : 500
        ln(`  static uint32_t _envT_${id} = 0; static bool _envF_${id} = false, _envP_${id} = false;`)
        ln(`  { bool _t = (${trig}); if (_t && !_envP_${id}) { _envT_${id} = millis(); _envF_${id} = true; } _envP_${id} = _t; }`)
        ln(`  float ${v('result')} = 0.0f;`)
        ln(`  if (_envF_${id}) { uint32_t _envAge_${id} = millis() - _envT_${id};`)
        if (attackMs > 0) ln(`    ${v('result')} = _envAge_${id} < ${attackMs}u ? constrain(_envAge_${id} / ${attackMs}.0f, 0.0f, 1.0f) : constrain(1.0f - (_envAge_${id} - ${attackMs}u) / ${decayMs}.0f, 0.0f, 1.0f);`)
        else ln(`    ${v('result')} = constrain(1.0f - _envAge_${id} / ${decayMs}.0f, 0.0f, 1.0f);`)
        ln(`  }`)
        break
      }

      case 'Not': {
        const x = boolExpr(node.id, 'x')
        ln(`  bool ${v('result')} = !(${x});`)
        break
      }

      case 'Compare': {
        const a = f('a', 'a', 0), b2 = f('b', 'b', 0.5)
        ln(`  bool ${v('result')} = (${a}) > (${b2});`)
        break
      }

      // Bundled trigger/edge utility — `triggerOp` picks the variant. Every
      // branch is a millis()-based static, mirroring the stateful `Trigger`
      // case in graphEvaluator.ts so preview and firmware timing match.
      case 'Trigger': {
        const op = String(p.triggerOp ?? 'debounce')
        const trig = boolExpr(node.id, 'trigger')
        const outVar = v('out')
        if (op === 'toggle') {
          ln(`  static bool ${outVar} = false; static bool _trP_${id} = false;`)
          ln(`  { bool _t = (${trig}); if (_t && !_trP_${id}) ${outVar} = !${outVar}; _trP_${id} = _t; }`)
        } else if (op === 'oneShot') {
          const ms = Math.max(20, Math.round(Number(p.holdTime ?? 0.1) * 1000))
          ln(`  static uint32_t _trT_${id} = 0xFFFFFFFFu; static bool _trP_${id} = false;`)
          ln(`  { bool _t = (${trig}); if (_t && !_trP_${id}) _trT_${id} = millis(); _trP_${id} = _t; }`)
          ln(`  bool ${outVar} = (millis() - _trT_${id}) < ${ms}u;`)
        } else if (op === 'pulseDivider') {
          const n = Math.max(2, Math.round(Number(p.divideBy ?? 2)))
          ln(`  static uint8_t _trC_${id} = 0; static bool _trP_${id} = false; bool ${outVar} = false;`)
          ln(`  { bool _t = (${trig}); if (_t && !_trP_${id}) { _trC_${id}++; if (_trC_${id} >= ${n}) { _trC_${id} = 0; ${outVar} = true; } } _trP_${id} = _t; }`)
        } else if (op === 'delay') {
          const ms = Math.max(10, Math.round(Number(p.delayTime ?? 0.5) * 1000))
          ln(`  static uint32_t _trS_${id} = 0; static bool _trA_${id} = false, _trP_${id} = false; bool ${outVar} = false;`)
          ln(`  { bool _t = (${trig}); if (_t && !_trP_${id}) { _trS_${id} = millis() + ${ms}u; _trA_${id} = true; } _trP_${id} = _t; }`)
          ln(`  if (_trA_${id} && millis() >= _trS_${id}) { ${outVar} = true; _trA_${id} = false; }`)
        } else { // debounce
          const ms = Math.max(5, Math.round(Number(p.stableTime ?? 0.05) * 1000))
          ln(`  static bool _trC_${id} = false, _trCommit_${id} = false, _trInit_${id} = false; static uint32_t _trSince_${id} = 0;`)
          ln(`  { bool _t = (${trig});`)
          ln(`    if (!_trInit_${id}) { _trC_${id} = _t; _trCommit_${id} = _t; _trSince_${id} = millis(); _trInit_${id} = true; }`)
          ln(`    else { if (_t != _trC_${id}) { _trC_${id} = _t; _trSince_${id} = millis(); }`)
          ln(`      if (_t == _trC_${id} && (millis() - _trSince_${id}) >= ${ms}u) _trCommit_${id} = _t; } }`)
          ln(`  bool ${outVar} = _trCommit_${id};`)
        }
        break
      }

      // Bundled transitions — `transitionType` picks one of 16 A→B effects.
      // Every variant works on the per-node frame buffers (seed `ob` from A,
      // then composite B in) so the generated firmware actually renders the
      // transition. Keep in sync with the `Transition` case in graphEvaluator.ts.
      case 'Transition': {
        const ob = ownBuf()
        const a = srcBuf('a'), b = srcBuf('b'), tt = f('t', 't', 0.5)
        const type = String(p.transitionType ?? 'crossfade')
        const B = b ?? ob                                  // unconnected B ⇒ behaves like A
        const aPix = (i: string) => a ? `${a}[${i}]` : 'CRGB::Black'
        const bPix = (i: string) => b ? `${b}[${i}]` : 'CRGB::Black'
        const seed = a ? `::memmove(${ob}, ${a}, sizeof(CRGB) * NUM_LEDS);` : `fill_solid(${ob}, NUM_LEDS, CRGB::Black);`
        const idx = '_y*WIDTH+_x'
        // Most variants reveal B where a per-pixel condition holds; this emits the
        // shared seed-A + loop wrapper, with `body` supplying the `if(...)` lines.
        const reveal = (head: string, body: string[]) => {
          ln(`  { ${seed} float _tt=${tt}; ${head}`)
          ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
          body.forEach(l => ln(`      ${l}`))
          ln(`    } }`)
        }
        switch (type) {
          case 'wipe': {
            const dir = String(p.direction ?? 'right')
            const axis = (dir === 'up' || dir === 'down') ? '_y' : '_x'
            const dim  = (dir === 'up' || dir === 'down') ? 'HEIGHT' : 'WIDTH'
            const cmp  = (dir === 'right' || dir === 'down') ? '<' : '>'
            const rhs  = (dir === 'right' || dir === 'down') ? `(int)(_tt*${dim})` : `(int)((1.0f-_tt)*${dim})`
            reveal('', [`if(${axis} ${cmp} ${rhs}) ${ob}[${idx}] = ${B}[${idx}];`])
            break
          }
          case 'dissolve':
            ln(`  { ${seed} float _tt=${tt}; for(int _i=0;_i<NUM_LEDS;_i++){`)
            ln(`      uint32_t _h=((uint32_t)(_i)*1664525u+1013904223u);`)
            ln(`      if((_h&0xFFFF)<(uint32_t)(_tt*65535)) ${ob}[_i] = ${B}[_i]; } }`)
            break
          case 'iris':
            reveal('float _cx=WIDTH*0.5f,_cy=HEIGHT*0.5f,_r=_tt*sqrtf(_cx*_cx+_cy*_cy);', [
              `float _dx=_x-_cx,_dy=_y-_cy;`,
              `if(sqrtf(_dx*_dx+_dy*_dy)<_r) ${ob}[${idx}] = ${B}[${idx}];`,
            ])
            break
          case 'clockwipe':
            reveal('float _cx=WIDTH*0.5f,_cy=HEIGHT*0.5f;', [
              `float _n=(atan2f(_x-_cx,-(_y-_cy))+3.14159265f)/6.2831853f;`,
              `if(_n<_tt) ${ob}[${idx}] = ${B}[${idx}];`,
            ])
            break
          case 'push': {
            const dir = String(p.direction ?? 'right')
            const remap =
              dir === 'left' ? `int _ax=(int)roundf(_x-_tt*WIDTH),_ay=_y,_bx=(int)roundf(_x+(1.0f-_tt)*WIDTH),_by=_y;`
              : dir === 'up' ? `int _ax=_x,_ay=(int)roundf(_y-_tt*HEIGHT),_bx=_x,_by=(int)roundf(_y+(1.0f-_tt)*HEIGHT);`
              : dir === 'down' ? `int _ax=_x,_ay=(int)roundf(_y+_tt*HEIGHT),_bx=_x,_by=(int)roundf(_y-(1.0f-_tt)*HEIGHT);`
              : `int _ax=(int)roundf(_x+_tt*WIDTH),_ay=_y,_bx=(int)roundf(_x-(1.0f-_tt)*WIDTH),_by=_y;`
            ln(`  { fill_solid(${ob}, NUM_LEDS, CRGB::Black); float _tt=${tt};`)
            ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
            ln(`      ${remap}`)
            ln(`      if(_bx>=0&&_bx<WIDTH&&_by>=0&&_by<HEIGHT) ${ob}[${idx}] = ${bPix('_by*WIDTH+_bx')};`)
            ln(`      else if(_ax>=0&&_ax<WIDTH&&_ay>=0&&_ay<HEIGHT) ${ob}[${idx}] = ${aPix('_ay*WIDTH+_ax')};`)
            ln(`    } }`)
            break
          }
          case 'checkerboard': {
            const tile = Math.max(1, Math.round(Number(p.tileSize ?? 4)))
            reveal('', [
              `int _tx=_x/${tile},_ty=_y/${tile};`,
              `float _thr=((_tx+_ty)%2==0)?_tt*2.0f:_tt*2.0f-1.0f;`,
              `if(_thr>=1.0f) ${ob}[${idx}] = ${B}[${idx}];`,
            ])
            break
          }
          case 'diagonal':
            reveal('', [
              `float _n=((float)_x/WIDTH+(float)_y/HEIGHT)*0.5f;`,
              `if(_n<_tt) ${ob}[${idx}] = ${B}[${idx}];`,
            ])
            break
          case 'fadeblack':
            ln(`  { float _tt=${tt}; float _al=_tt<0.5f?1.0f-_tt*2.0f:(_tt-0.5f)*2.0f;`)
            ln(`    for(int _i=0;_i<NUM_LEDS;_i++){ CRGB _s=_tt<0.5f?${aPix('_i')}:${bPix('_i')};`)
            ln(`      ${ob}[_i]=CRGB((uint8_t)(_s.r*_al),(uint8_t)(_s.g*_al),(uint8_t)(_s.b*_al)); } }`)
            break
          case 'fadewhite':
            ln(`  { float _tt=${tt}; float _al=_tt<0.5f?1.0f-_tt*2.0f:(_tt-0.5f)*2.0f; float _w=(1.0f-_al)*255.0f;`)
            ln(`    for(int _i=0;_i<NUM_LEDS;_i++){ CRGB _s=_tt<0.5f?${aPix('_i')}:${bPix('_i')};`)
            ln(`      ${ob}[_i]=CRGB((uint8_t)(_s.r*_al+_w),(uint8_t)(_s.g*_al+_w),(uint8_t)(_s.b*_al+_w)); } }`)
            break
          case 'blinds': {
            const count = Math.max(1, Math.round(Number(p.count ?? 4)))
            const axis = String(p.axis ?? 'horizontal')
            const dim = axis === 'horizontal' ? 'HEIGHT' : 'WIDTH'
            const pos = axis === 'horizontal' ? '_y' : '_x'
            reveal(`int _slat=max(1,${dim}/${count});`, [
              `float _p=(float)(${pos}%_slat)/_slat;`,
              `if(_p<_tt) ${ob}[${idx}] = ${B}[${idx}];`,
            ])
            break
          }
          case 'ripple':
            reveal('float _cx=WIDTH*0.5f,_cy=HEIGHT*0.5f,_maxR=sqrtf(_cx*_cx+_cy*_cy),_e=0.08f;', [
              `float _dx=_x-_cx,_dy=_y-_cy,_n=sqrtf(_dx*_dx+_dy*_dy)/_maxR;`,
              `if(_n<_tt-_e) ${ob}[${idx}] = ${B}[${idx}];`,
              `else if(_n<_tt){ float _bl=(_tt-_n)/_e; ${ob}[${idx}]=blend(${ob}[${idx}], ${B}[${idx}], (uint8_t)(_bl*255)); }`,
            ])
            break
          case 'spiral': {
            const turns = Math.max(1, Math.round(Number(p.turns ?? 2)))
            reveal(`float _cx=WIDTH*0.5f,_cy=HEIGHT*0.5f,_maxR=sqrtf(_cx*_cx+_cy*_cy),_k=1.0f+1.0f/(float)${turns};`, [
              `float _dx=_x-_cx,_dy=_y-_cy,_r=sqrtf(_dx*_dx+_dy*_dy)/_maxR;`,
              `float _na=(atan2f(_dy,_dx)+3.14159265f)/6.2831853f;`,
              `if((_r+_na/(float)${turns})/_k<_tt) ${ob}[${idx}] = ${B}[${idx}];`,
            ])
            break
          }
          case 'curtain': {
            const axis = String(p.axis ?? 'horizontal')
            const dist = axis === 'horizontal' ? 'fabsf(2.0f*_y/HEIGHT-1.0f)' : 'fabsf(2.0f*_x/WIDTH-1.0f)'
            reveal('', [
              `if(${dist}<_tt) ${ob}[${idx}] = ${B}[${idx}];`,
            ])
            break
          }
          case 'scanlines':
            reveal('', [
              `float _thr=(_y%2==0)?((float)_y/HEIGHT)*0.5f:0.5f+((float)(_y-1)/HEIGHT)*0.5f;`,
              `if(_tt>_thr) ${ob}[${idx}] = ${B}[${idx}];`,
            ])
            break
          case 'zoom':
            ln(`  { ${seed} float _tt=${tt},_cx=WIDTH*0.5f,_cy=HEIGHT*0.5f,_sc=max(0.01f,_tt);`)
            ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
            ln(`      int _bx=(int)((_x-_cx)/_sc+_cx),_by=(int)((_y-_cy)/_sc+_cy);`)
            ln(`      if(_bx>=0&&_bx<WIDTH&&_by>=0&&_by<HEIGHT) ${ob}[${idx}]=blend(${ob}[${idx}], ${bPix('_by*WIDTH+_bx')}, (uint8_t)(_tt*255));`)
            ln(`      else ${ob}[${idx}].nscale8((uint8_t)((1.0f-_tt)*255));`)
            ln(`    } }`)
            break
          default: // crossfade
            ln(`  { ${seed} nblend(${ob}, ${B}, NUM_LEDS, (uint8_t)((${tt}) * 255)); }`)
        }
        break
      }

      case 'FractalNoise': {
        needsT.v = true
        const ob = ownBuf()
        const speed = rateCpp(f('speed', 'speed', 0.25), SPEED_MAX.FractalNoise), scale = rateCpp(f('scale', 'scale', 0.3), SCALE_MAX.FractalNoise)
        const octaves = Math.max(1, Math.min(6, Math.floor(Number(p.octaves ?? 4))))
        const pal = paletteExpr(node.id, 'paletteIn', p)
        const seed = seedProp(p)
        const timeExpr = seed ? `(t+${(seed * 0.013).toFixed(3)}f)` : 't'
        ln(`  { // Fractal noise (fBm via inoise8)`)
        ln(`    float _spd=${speed},_sc=${scale},_t=${timeExpr}; uint16_t _z=(uint16_t)(_t*_spd*40);`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _v=0,_amp=0.5f,_norm=0,_freq=_sc*96;`)
        ln(`      for(int _o=0;_o<${octaves};_o++){`)
        ln(`        _v+=_amp*(inoise8((uint16_t)(_x*_freq),(uint16_t)(_y*_freq),_z)/255.0f);`)
        ln(`        _norm+=_amp; _amp*=0.5f; _freq*=2; }`)
        ln(`      ${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)((_v/_norm)*255));}}`)
        break
      }

      case 'GaborNoise': {
        needsT.v = true
        needsWorley.v = true
        const ob = ownBuf()
        const speed = rateCpp(f('speed', 'speed', 0.33), SPEED_MAX.GaborNoise), scale = rateCpp(f('scale', 'scale', 0.7), SCALE_MAX.GaborNoise)
        const freq = f('frequency', 'frequency', 1.2)
        const orientation = f('orientation', 'orientation', 45)
        const pal = paletteExpr(node.id, 'paletteIn', p)
        const seed = seedProp(p)
        const timeExpr = seed ? `(t+${(seed * 0.013).toFixed(3)}f)` : 't'
        ln(`  { // Gabor noise`)
        ln(`    float _spd=${speed},_sc=${scale},_fr=${freq},_om=${orientation}*0.01745329f,_co=cos(_om),_si=sin(_om);`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _px=_x*_sc,_py=_y*_sc; int _xi=(int)floorf(_px),_yi=(int)floorf(_py); float _v=0;`)
        ln(`      for(int _dj=-1;_dj<=1;_dj++) for(int _di=-1;_di<=1;_di++){`)
        ln(`        int _cx=_xi+_di,_cy=_yi+_dj; float _h=_worleyHash(_cx,_cy),_h2=_worleyHash(_cx+31,_cy-17);`)
        ln(`        float _fx=_cx+0.5f+(_h-0.5f),_fy=_cy+0.5f+(_h2-0.5f);`)
        ln(`        float _dx=_px-_fx,_dy=_py-_fy,_g=expf(-2.5f*(_dx*_dx+_dy*_dy));`)
        ln(`        float _proj=_dx*_co+_dy*_si,_w=_h2<0.5f?1.0f:-1.0f;`)
        ln(`        _v+=_w*_g*cosf(6.2831853f*_fr*_proj+${timeExpr}*_spd+_h*6.2831853f); }`)
        ln(`      ${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)((_v*0.5f+0.5f)*255));}}`)
        break
      }

      case 'PaletteGradient': {
        const ob = ownBuf()
        const angle = f('angle', 'angle', 45), repeat = f('repeat', 'repeat', 1)
        const speed = rateCpp(f('speed', 'speed', 0), SPEED_MAX.PaletteGradient)
        const pal = paletteExpr(node.id, 'paletteIn', p)
        const scroll = `+t*${speed}`
        needsT.v = true
        ln(`  { // Palette gradient`)
        ln(`    float _a=${angle}*0.01745329f,_co=cos(_a),_si=sin(_a);`)
        ln(`    float _pmin=(_co<0?(WIDTH-1)*_co:0)+(_si<0?(HEIGHT-1)*_si:0);`)
        ln(`    float _pmax=(_co>0?(WIDTH-1)*_co:0)+(_si>0?(HEIGHT-1)*_si:0);`)
        ln(`    float _rng=max(1e-6f,_pmax-_pmin);`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _tn=(_x*_co+_y*_si-_pmin)/_rng;`)
        ln(`      ${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)((_tn*${repeat}${scroll})*255));}}`)
        break
      }

      case 'Image': {
        const ob = ownBuf()
        // Animation if one is loaded, else the still — the node carries one only.
        const animation = asAnimatedImage(p.animation)
        const frames = animation?.frames
        const img = frames?.[0] ?? asImage(p.image)
        if (!img) {
          ln(`  fill_solid(${ob}, NUM_LEDS, CRGB::Black); // ${node.data.nodeType}: none uploaded`)
          break
        }
        const storedPixels = frames ? frames.flatMap((frame) => frame.pixels) : img.pixels
        const hasAlpha = frames ? frames.some((frame) => Boolean(frame.alpha)) : Boolean(img.alpha)
        const storedAlpha = hasAlpha
          ? (frames ?? [img]).flatMap((frame) => frame.alpha ?? Array(frame.w * frame.h).fill(255))
          : null
        const fit = ['contain', 'cover', 'original'].includes(String(p.fit)) ? String(p.fit) : 'stretch'
        const background = hexToRgb(String(p.background ?? '#000000'))
        const finite = (value: unknown, fallback: number, min: number, max: number) => {
          const n = Number(value ?? fallback)
          return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback
        }
        const saturation = p.monochrome ? 0 : finite(p.saturation, 1, 0, 2)
        const contrast = finite(p.contrast, 1, 0, 2)
        const gamma = finite(p.gamma, 1, 1, 3.5)
        const rawLevels = Number(p.paletteLevels)
        const paletteLevels = Number.isFinite(rawLevels) && rawLevels >= 2 ? Math.min(32, Math.round(rawLevels)) : 0
        const dithering = p.dithering === 'ordered2x2' || p.dithering === 'ordered4x4' ? p.dithering : 'none'
        const sampling = p.sampling === 'smooth' ? 'smooth' : 'nearest'
        const fl = (value: number) => floatLit(value)
        ln(`  { // ${node.data.nodeType} ${img.w}x${img.h}`)
        ln(`    static const uint8_t _img_${id}[] PROGMEM = {${storedPixels.join(',')}};`)
        if (storedAlpha) ln(`    static const uint8_t _imga_${id}[] PROGMEM = {${storedAlpha.join(',')}};`)
        if (animation) ln(`    static const uint32_t _imgd_${id}[] PROGMEM = {${animation.durations.map((duration) => Math.round(duration)).join(',')}};`)
        ln(`    const int _iw=${img.w}, _ih=${img.h};`)
        ln(`    int _rot=(((int)roundf(${f('rotation', 'rotation', Number(p.rotation ?? 0))}/90.0f))%4+4)%4, _rw=(_rot&1)?_ih:_iw, _rh=(_rot&1)?_iw:_ih;`)
        if (animation) {
          const total = Math.max(1, Math.round(animation.durations.reduce((sum, duration) => sum + duration, 0)))
          ln(`    uint32_t _it=(uint32_t)(millis()*max(0.25f,min(4.0f,${f('playbackRate', 'playbackRate', 1)})));`)
          if (p.loop !== false) ln(`    _it%=${total}UL;`)
          else ln(`    _it=min(_it,${total - 1}UL);`)
          ln(`    int _ifr=0; uint32_t _iacc=0; for(int _i=0;_i<${animation.frames.length};_i++){ _iacc+=pgm_read_dword(&_imgd_${id}[_i]); if(_it<_iacc){_ifr=_i;break;} }`)
          ln(`    const int _ibase=_ifr*_iw*_ih;`)
        } else {
          ln(`    const int _ibase=0;`)
        }
        if (fit === 'contain' || fit === 'cover') {
          const scaleFn = fit === 'contain' ? 'fminf' : 'fmaxf'
          ln(`    float _isc=${scaleFn}((float)WIDTH/_rw,(float)HEIGHT/_rh), _dw=_rw*_isc, _dh=_rh*_isc;`)
        } else if (fit === 'original') {
          ln(`    float _dw=(float)_rw, _dh=(float)_rh;`)
        } else {
          ln(`    float _dw=(float)WIDTH, _dh=(float)HEIGHT;`)
        }
        ln(`    float _iox=(WIDTH-_dw)*constrain(${f('positionX', 'positionX', 0.5)},0.0f,1.0f), _ioy=(HEIGHT-_dh)*constrain(${f('positionY', 'positionY', 0.5)},0.0f,1.0f);`)
        ln(`    const float _ibr=max(0.0f,min(1.0f,${f('brightness', 'brightness', 1)})), _izv=1.0f/max(1.0f,min(8.0f,${f('zoom', 'zoom', 1)}));`)
        if (dithering === 'ordered2x2') ln(`    static const uint8_t _idither[] PROGMEM={0,2,3,1};`)
        else if (dithering === 'ordered4x4') ln(`    static const uint8_t _idither[] PROGMEM={0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5};`)
        ln(`    struct _ImgPx { float r,g,b,a; };`)
        ln(`    auto _imgpx=[&](int _px,int _py)->_ImgPx{`)
        if (p.flipX) ln(`      _px=_rw-1-_px;`)
        if (p.flipY) ln(`      _py=_rh-1-_py;`)
        ln(`      int _sx=_px,_sy=_py; if(_rot==1){ _sx=_py; _sy=_ih-1-_px; } else if(_rot==2){ _sx=_iw-1-_px; _sy=_ih-1-_py; } else if(_rot==3){ _sx=_iw-1-_py; _sy=_px; }`)
        ln(`      int _ai=_ibase+_sy*_iw+_sx, _pi=_ai*3;`)
        if (storedAlpha) ln(`      float _a=pgm_read_byte(&_imga_${id}[_ai])/255.0f;`)
        else ln(`      float _a=1.0f;`)
        ln(`      return {(float)pgm_read_byte(&_img_${id}[_pi])*_a,(float)pgm_read_byte(&_img_${id}[_pi+1])*_a,(float)pgm_read_byte(&_img_${id}[_pi+2])*_a,_a};};`)
        ln(`    auto _imgcolor=[&](_ImgPx _p,int _x,int _y)->CRGB{`)
        ln(`      float _r=(_p.r+${fl(background.r)}*(1-_p.a))*_ibr, _g=(_p.g+${fl(background.g)}*(1-_p.a))*_ibr, _b=(_p.b+${fl(background.b)}*(1-_p.a))*_ibr;`)
        ln(`      float _h=max(-180.0f,min(180.0f,${f('hueShift', 'hueShift', 0)}))*0.01745329f,_hc=cosf(_h),_hs=sinf(_h);`)
        ln(`      float _hr=_r*(.213f+.787f*_hc-.213f*_hs)+_g*(.715f-.715f*_hc-.715f*_hs)+_b*(.072f-.072f*_hc+.928f*_hs);`)
        ln(`      float _hg=_r*(.213f-.213f*_hc+.143f*_hs)+_g*(.715f+.285f*_hc+.140f*_hs)+_b*(.072f-.072f*_hc-.283f*_hs);`)
        ln(`      float _hb=_r*(.213f-.213f*_hc-.787f*_hs)+_g*(.715f-.715f*_hc+.715f*_hs)+_b*(.072f+.928f*_hc+.072f*_hs);`)
        ln(`      float _sat=${p.monochrome ? '0.0f' : `max(0.0f,min(2.0f,${f('saturation', 'saturation', saturation)}))`}, _con=max(0.0f,min(2.0f,${f('contrast', 'contrast', contrast)}));`)
        ln(`      float _lum=_hr*0.2126f+_hg*0.7152f+_hb*0.0722f; _r=(_lum+(_hr-_lum)*_sat-127.5f)*_con+127.5f; _g=(_lum+(_hg-_lum)*_sat-127.5f)*_con+127.5f; _b=(_lum+(_hb-_lum)*_sat-127.5f)*_con+127.5f;`)
        ln(`      float _gamma=max(1.0f,min(3.5f,${f('gamma', 'gamma', gamma)})); if(fabsf(_gamma-1.0f)>0.0001f){ _r=powf(constrain(_r,0.0f,255.0f)/255.0f,_gamma)*255.0f; _g=powf(constrain(_g,0.0f,255.0f)/255.0f,_gamma)*255.0f; _b=powf(constrain(_b,0.0f,255.0f)/255.0f,_gamma)*255.0f; } else { _r=constrain(_r,0.0f,255.0f); _g=constrain(_g,0.0f,255.0f); _b=constrain(_b,0.0f,255.0f); }`)
        if (paletteLevels) {
          if (dithering === 'ordered2x2') ln(`      float _dt=(pgm_read_byte(&_idither[(_y&1)*2+(_x&1)])+0.5f)/4.0f;`)
          else if (dithering === 'ordered4x4') ln(`      float _dt=(pgm_read_byte(&_idither[(_y&3)*4+(_x&3)])+0.5f)/16.0f;`)
          else ln(`      float _dt=0.5f;`)
          ln(`      auto _iq=[&](float _c)->uint8_t{ float _s=_c*${paletteLevels - 1}.0f/255.0f; int _base=(int)floorf(_s), _lv=_base+((_s-_base)>=_dt?1:0); return (uint8_t)(constrain(_lv,0,${paletteLevels - 1})*255.0f/${paletteLevels - 1}.0f+0.5f);}; return CRGB(_iq(_r),_iq(_g),_iq(_b));};`)
        } else {
          ln(`      return CRGB((uint8_t)(_r+0.5f),(uint8_t)(_g+0.5f),(uint8_t)(_b+0.5f));};`)
        }
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _u=(_x+0.5f-_iox)/_dw, _v=(_y+0.5f-_ioy)/_dh;`)
        ln(`      if(_u<0||_u>=1||_v<0||_v>=1){ ${ob}[_y*WIDTH+_x]=_imgcolor({${fl(background.r)},${fl(background.g)},${fl(background.b)},1.0f},_x,_y); continue; }`)
        ln(`      _u=(1-_izv)*constrain(${f('cropX', 'cropX', 0.5)},0.0f,1.0f)+_u*_izv; _v=(1-_izv)*constrain(${f('cropY', 'cropY', 0.5)},0.0f,1.0f)+_v*_izv;`)
        if (sampling === 'smooth') {
          ln(`      float _fx=_u*_rw-0.5f, _fy=_v*_rh-0.5f; int _x0=(int)floorf(_fx), _y0=(int)floorf(_fy);`)
          ln(`      float _tx=_fx-_x0, _ty=_fy-_y0; int _x1=_x0+1, _y1=_y0+1;`)
          ln(`      _x0=max(0,min(_rw-1,_x0)); _x1=max(0,min(_rw-1,_x1)); _y0=max(0,min(_rh-1,_y0)); _y1=max(0,min(_rh-1,_y1));`)
          ln(`      _ImgPx _c00=_imgpx(_x0,_y0), _c10=_imgpx(_x1,_y0), _c01=_imgpx(_x0,_y1), _c11=_imgpx(_x1,_y1);`)
          ln(`      float _rr=_c00.r+(_c10.r-_c00.r)*_tx, _rg=_c00.g+(_c10.g-_c00.g)*_tx, _rb=_c00.b+(_c10.b-_c00.b)*_tx;`)
          ln(`      _rr+=((_c01.r+(_c11.r-_c01.r)*_tx)-_rr)*_ty; _rg+=((_c01.g+(_c11.g-_c01.g)*_tx)-_rg)*_ty; _rb+=((_c01.b+(_c11.b-_c01.b)*_tx)-_rb)*_ty;`)
          ln(`      float _ra=_c00.a+(_c10.a-_c00.a)*_tx; _ra+=((_c01.a+(_c11.a-_c01.a)*_tx)-_ra)*_ty;`)
          ln(`      ${ob}[_y*WIDTH+_x]=_imgcolor({_rr,_rg,_rb,_ra},_x,_y);}}`)
        } else {
          ln(`      _ImgPx _ic=_imgpx(min(_rw-1,(int)(_u*_rw)),min(_rh-1,(int)(_v*_rh)));`)
          ln(`      ${ob}[_y*WIDTH+_x]=_imgcolor(_ic,_x,_y);}}`)
        }
        break
      }

      case 'Blobs': {
        needsT.v = true
        const ob = ownBuf()
        const speed = rateCpp(f('speed', 'speed', 0.3), SPEED_MAX.Blobs), scale = rateCpp(f('scale', 'scale', 0.44), SCALE_MAX.Blobs)
        const pal = paletteExpr(node.id, 'paletteIn', p)
        ln(`  { // Blobs (metaballs)`)
        ln(`    float _spd=${speed}, _r=${scale}*min(WIDTH,HEIGHT), _r2=_r*_r;`)
        ln(`    int _count=max(1,min(6,(int)floorf(${f('count', 'count', 3)}))); float _bx[6], _by[6];`)
        ln(`    for(int _i=0;_i<_count;_i++){ _bx[_i]=WIDTH*(0.5f+0.4f*sin(t*_spd*(0.7f+_i*0.13f)+_i*1.7f)); _by[_i]=HEIGHT*(0.5f+0.4f*cos(t*_spd*(0.6f+_i*0.17f)+_i*2.3f)); }`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){ float _f=0;`)
        ln(`      for(int _i=0;_i<_count;_i++){ float _dx=_x-_bx[_i],_dy=_y-_by[_i]; _f+=_r2/(_dx*_dx+_dy*_dy+1.0f); }`)
        ln(`      ${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)((_f/(_f+1.0f))*255)); }}`)
        break
      }

      case 'FlowField': {
        needsT.v = true
        const ob = ownBuf()
        const speed = rateCpp(f('speed', 'speed', 0.67), SPEED_MAX.FlowField), scale = rateCpp(f('scale', 'scale', 0.08), SCALE_MAX.FlowField)
        const fadeL = f('fade', 'fade', 0.9)
        const pal = paletteExpr(node.id, 'paletteIn', p)
        const seed = seedProp(p)
        const px = `_fpx_${id}`, py = `_fpy_${id}`, tr = `_ftr_${id}`
        ln(`  { // Flow field`)
        ln(`    const int _count=max(8,min(400,(int)floorf(${f('count', 'count', 80)}))); static float ${px}[400], ${py}[400], ${tr}[NUM_LEDS]; static bool _fi_${id}=false;`)
        if (seed) ln(`    static bool _fs_${id}=false; if(!_fs_${id}){ random16_set_seed(${seed}u); _fs_${id}=true; }`)
        ln(`    if(!_fi_${id}){ for(int _i=0;_i<400;_i++){ ${px}[_i]=(random8()/255.0f)*WIDTH; ${py}[_i]=(random8()/255.0f)*HEIGHT; } for(int _i=0;_i<NUM_LEDS;_i++)${tr}[_i]=0; _fi_${id}=true; }`)
        ln(`    float _spd=${speed},_sc=${scale}; uint16_t _z=(uint16_t)(t*100);`)
        ln(`    for(int _i=0;_i<NUM_LEDS;_i++) ${tr}[_i]*=${fadeL};`)
        ln(`    for(int _i=0;_i<_count;_i++){`)
        ln(`      float _a=(inoise8((uint16_t)(${px}[_i]*_sc*256),(uint16_t)(${py}[_i]*_sc*256),_z)/255.0f)*6.2831f*2;`)
        ln(`      ${px}[_i]=fmodf(${px}[_i]+cos(_a)*_spd*0.6f+WIDTH,WIDTH); ${py}[_i]=fmodf(${py}[_i]+sin(_a)*_spd*0.6f+HEIGHT,HEIGHT);`)
        ln(`      int _xi=(int)${px}[_i],_yi=(int)${py}[_i]; if(_xi>=0&&_xi<WIDTH&&_yi>=0&&_yi<HEIGHT){ int _id=_yi*WIDTH+_xi; ${tr}[_id]=min(1.0f,${tr}[_id]+0.5f); } }`)
        ln(`    for(int _i=0;_i<NUM_LEDS;_i++) ${ob}[_i]=ColorFromPalette(${pal},(uint8_t)(${tr}[_i]*255)); }`)
        break
      }

      case 'Starfield': {
        const ob = ownBuf()
        const speed = rateCpp(f('speed', 'speed', 0.33), SPEED_MAX.Starfield)
        const pal = paletteExpr(node.id, 'paletteIn', p)
        const seed = seedProp(p)
        const sx = `_sfx_${id}`, sy = `_sfy_${id}`, sz = `_sfz_${id}`
        ln(`  { // Starfield`)
        ln(`    const int _count=max(8,min(300,(int)floorf(${f('count', 'count', 60)}))); static float ${sx}[300], ${sy}[300], ${sz}[300]; static bool _sfi_${id}=false;`)
        if (seed) ln(`    static bool _sfs_${id}=false; if(!_sfs_${id}){ random16_set_seed(${seed}u); _sfs_${id}=true; }`)
        ln(`    if(!_sfi_${id}){ for(int _i=0;_i<300;_i++){ ${sx}[_i]=random8()/127.5f-1; ${sy}[_i]=random8()/127.5f-1; ${sz}[_i]=random8()/255.0f*0.9f+0.1f; } _sfi_${id}=true; }`)
        ln(`    float _spd=${speed}; fill_solid(${ob}, NUM_LEDS, CRGB::Black);`)
        ln(`    for(int _i=0;_i<_count;_i++){ ${sz}[_i]-=_spd*0.015f;`)
        ln(`      if(${sz}[_i]<=0.02f){ ${sx}[_i]=random8()/127.5f-1; ${sy}[_i]=random8()/127.5f-1; ${sz}[_i]=1; }`)
        ln(`      int _px=(int)(WIDTH/2.0f+(${sx}[_i]/${sz}[_i])*WIDTH*0.35f), _py=(int)(HEIGHT/2.0f+(${sy}[_i]/${sz}[_i])*HEIGHT*0.35f);`)
        ln(`      if(_px>=0&&_px<WIDTH&&_py>=0&&_py<HEIGHT){ float _db=min(1.0f,1-${sz}[_i]); ${ob}[_py*WIDTH+_px]=ColorFromPalette(${pal},(uint8_t)(_db*255)); ${ob}[_py*WIDTH+_px].nscale8((uint8_t)(_db*255)); } } }`)
        break
      }

      case 'Boids': {
        const ob = ownBuf()
        const speed = rateCpp(f('speed', 'speed', 0.5), SPEED_MAX.Boids)
        const sep = f('separation', 'separation', 0.6), ali = f('alignment', 'alignment', 0.5)
        const coh = f('cohesion', 'cohesion', 0.4), range = f('visualRange', 'visualRange', 4)
        const colorMode = String(p.colorMode ?? 'solid')
        if (colorMode === 'cycle') needsT.v = true  // time-cycling hue needs `t`
        const colorE = incoming.get(`${node.id}:color`)
          ? colorExpr(node.id, 'color')
          : `CRGB(${Number(p.r ?? 120)}, ${Number(p.g ?? 200)}, ${Number(p.b ?? 255)})`
        const pal = paletteExpr(node.id, 'paletteIn', p)
        const seed = seedProp(p)
        const bx = `_bx_${id}`, by = `_by_${id}`, bvx = `_bvx_${id}`, bvy = `_bvy_${id}`
        const nvx = `_bnx_${id}`, nvy = `_bny_${id}`, nn = `_bnn_${id}`
        const needNN = colorMode === 'density'  // per-boid neighbour count (density colouring only)
        const rng2 = `(${range})*(${range})`, sepR2 = `((${range})*0.5f)*((${range})*0.5f)`
        ln(`  { // Boids (Reynolds flocking)`)
        ln(`    const int _count=max(2,min(80,(int)floorf(${f('count', 'count', 24)}))); static float ${bx}[80], ${by}[80], ${bvx}[80], ${bvy}[80]; static bool _bi_${id}=false;`)
        if (seed) ln(`    static bool _bs_${id}=false; if(!_bs_${id}){ random16_set_seed(${seed}u); _bs_${id}=true; }`)
        ln(`    if(!_bi_${id}){ for(int _i=0;_i<80;_i++){ ${bx}[_i]=(random8()/255.0f)*WIDTH; ${by}[_i]=(random8()/255.0f)*HEIGHT; float _a=(random8()/255.0f)*6.2831f; ${bvx}[_i]=cosf(_a); ${bvy}[_i]=sinf(_a); } _bi_${id}=true; }`)
        ln(`    float _ms=${speed}; if(_ms<0.1f)_ms=0.1f; float ${nvx}[80], ${nvy}[80];${needNN ? ` int ${nn}[80];` : ''}`)
        ln(`    for(int _i=0;_i<_count;_i++){`)
        ln(`      float _sx=0,_sy=0,_avx=0,_avy=0,_cx=0,_cy=0; int _near=0,_sc=0;`)
        ln(`      for(int _j=0;_j<_count;_j++){ if(_j==_i)continue; float _dx=${bx}[_j]-${bx}[_i],_dy=${by}[_j]-${by}[_i]; float _d2=_dx*_dx+_dy*_dy;`)
        ln(`        if(_d2<(${rng2})){ _avx+=${bvx}[_j];_avy+=${bvy}[_j];_cx+=${bx}[_j];_cy+=${by}[_j];_near++; if(_d2<(${sepR2})&&_d2>0){_sx-=_dx;_sy-=_dy;_sc++;} } }`)
        ln(`      float _stx=0,_sty=0;`)
        ln(`      if(_near>0){ _stx+=(_avx/_near-${bvx}[_i])*(${ali})*0.08f; _sty+=(_avy/_near-${bvy}[_i])*(${ali})*0.08f; _stx+=(_cx/_near-${bx}[_i])*(${coh})*0.005f; _sty+=(_cy/_near-${by}[_i])*(${coh})*0.005f; }`)
        ln(`      if(_sc>0){ _stx+=_sx*(${sep})*0.05f; _sty+=_sy*(${sep})*0.05f; }`)
        ln(`      ${nvx}[_i]=${bvx}[_i]+_stx; ${nvy}[_i]=${bvy}[_i]+_sty;${needNN ? ` ${nn}[_i]=_near;` : ''} }`)
        ln(`    fill_solid(${ob}, NUM_LEDS, CRGB::Black);`)
        if (colorMode === 'solid') ln(`    CRGB _bc0=${colorE};`)
        else if (colorMode === 'radial') ln(`    float _bcx=WIDTH/2.0f,_bcy=HEIGHT/2.0f,_bmr=sqrtf(_bcx*_bcx+_bcy*_bcy); if(_bmr<=0)_bmr=1;`)
        const boidColor =
          colorMode === 'palette' ? `CRGB _bc=ColorFromPalette(${pal},(uint8_t)(_i/(float)_count*255.0f));`
          : colorMode === 'heading' ? `CRGB _bc=CHSV((uint8_t)((atan2f(_diry,_dirx)/6.2831853f+0.5f)*255.0f),255,255);`
          : colorMode === 'spectrum' ? `CRGB _bc=CHSV((uint8_t)(_i/(float)_count*255.0f),255,255);`
          : colorMode === 'density' ? `CRGB _bc=CHSV((uint8_t)((1.0f-min(1.0f,${nn}[_i]/8.0f))*0.7f*255.0f),255,255);`
          : colorMode === 'position' ? `CRGB _bc=CHSV((uint8_t)((${bx}[_i]/WIDTH+${by}[_i]/HEIGHT)*0.5f*255.0f),255,255);`
          : colorMode === 'cycle' ? `CRGB _bc=CHSV((uint8_t)(t*0.1f*255.0f),255,255);`
          : colorMode === 'radial' ? `CRGB _bc=CHSV((uint8_t)(sqrtf((${bx}[_i]-_bcx)*(${bx}[_i]-_bcx)+(${by}[_i]-_bcy)*(${by}[_i]-_bcy))/_bmr*255.0f),255,255);`
          : `CRGB _bc=_bc0;`
        ln(`    for(int _i=0;_i<_count;_i++){`)
        ln(`      float _sp=sqrtf(${nvx}[_i]*${nvx}[_i]+${nvy}[_i]*${nvy}[_i]); if(_sp<=0)_sp=1; float _dirx=${nvx}[_i]/_sp,_diry=${nvy}[_i]/_sp;`)
        ln(`      ${bvx}[_i]=_dirx*_ms; ${bvy}[_i]=_diry*_ms;`)
        ln(`      ${bx}[_i]=fmodf(${bx}[_i]+${bvx}[_i]+WIDTH,WIDTH); ${by}[_i]=fmodf(${by}[_i]+${bvy}[_i]+HEIGHT,HEIGHT);`)
        ln(`      ${boidColor} CRGB _bt=_bc; _bt.nscale8(64);`)
        ln(`      int _px=(int)${bx}[_i],_py=(int)${by}[_i]; if(_px>=0&&_px<WIDTH&&_py>=0&&_py<HEIGHT) ${ob}[_py*WIDTH+_px]=_bc;`)
        ln(`      int _tx=(int)fmodf(${bx}[_i]-_dirx+WIDTH,WIDTH),_ty=(int)fmodf(${by}[_i]-_diry+HEIGHT,HEIGHT);`)
        ln(`      if(_tx>=0&&_tx<WIDTH&&_ty>=0&&_ty<HEIGHT){ int _ti=_ty*WIDTH+_tx; ${ob}[_ti].r=max(${ob}[_ti].r,_bt.r); ${ob}[_ti].g=max(${ob}[_ti].g,_bt.g); ${ob}[_ti].b=max(${ob}[_ti].b,_bt.b); } } }`)
        break
      }

      case 'AudioFlow': {
        needsT.v = true
        const ob = ownBuf()
        const bass = f('bass', 'bass', 0.5), mids = f('mids', 'mids', 0.5), treble = f('treble', 'treble', 0.3)
        const speed = audioFlowExpr('speed', f('speed', 'speed', 0.5))
        const scale = audioFlowExpr('scale', f('scale', 'scale', 0.5))
        const pal = paletteExpr(node.id, 'paletteIn', p)
        ln(`  { float _b=${bass},_m=${mids},_tr=${treble},_spd=${speed},_sc=${scale};`)
        // Integrated flow phase — mirrors evalAudioFlow (see BeatKaleidoscope).
        ln(`    static float _afPhase_${id}=0.0f,_afLast_${id}=-1.0f;`)
        ln(`    float _afDt_${id}=(_afLast_${id}<0.0f)?0.0f:min(0.25f,max(0.0f,t-_afLast_${id})); _afLast_${id}=t;`)
        ln(`    _afPhase_${id}+=_afDt_${id}*_spd*(0.2f+_m*1.5f);`)
        ln(`    float _flow=_afPhase_${id}; uint8_t _bright=(uint8_t)((0.25f+sqrtf(constrain(_b,0.0f,1.0f))*0.75f)*255);`)
        ln(`    float _vamp=0.2f+_tr*0.7f+_b*0.3f;`)
        ln(`    float _vflow=((float)inoise8((uint16_t)((t*_spd*4.0f+50)*256),4429)/128.0f-1.0f)*_vamp;`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      uint8_t _v=inoise8((uint16_t)((_x*_sc+_flow)*256),(uint16_t)((_y*_sc*0.6f+_vflow+8.0f)*256));`)
        ln(`      ${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)(_v+_tr*80)); ${ob}[_y*WIDTH+_x].nscale8(_bright);}}`)
        break
      }

      case 'ColorTrails': {
        needsT.v = true
        const ob = ownBuf()
        const tmpId = `cttmp_${id}`
        frameBufs.add(tmpId)
        const tmp = `buf_${tmpId}`
        const bass = f('bass', 'bass', 0), mids = f('mids', 'mids', 0), treble = f('treble', 'treble', 0)
        const beat = boolExpr(node.id, 'beat')
        const pal = paletteExpr(node.id, 'paletteIn', p)
        const xSpeed = f('xSpeed', 'xSpeed', 0.1), xAmp = f('xAmplitude', 'xAmplitude', 1), xFreq = f('xFrequency', 'xFrequency', 0.33)
        const ySpeed = f('ySpeed', 'ySpeed', 0.1), yAmp = f('yAmplitude', 'yAmplitude', 1), yFreq = f('yFrequency', 'yFrequency', 0.32)
        const displacement = f('displacement', 'displacement', 1.8)
        const endpointSpeed = f('endpointSpeed', 'endpointSpeed', 0.35)
        const colorSpeed = f('colorSpeed', 'colorSpeed', 0.1)
        const persistence = f('persistence', 'persistence', 0.99922)
        const seed = seedProp({ seed: p.seed ?? 42 })
        const injectionMode = String(p.injectionMode ?? 'Moving Line')
        const injectLine = injectionMode !== 'Rainbow Border'
        const injectBorder = injectionMode !== 'Moving Line'
        const morphFlow = String(p.flowMode ?? 'Scrolling') === 'Morphing 2D'
        ln(`  { // ColorTrails: ${injectionMode} injection + two-pass subpixel feedback advection`)
        ln(`    // Adapted from prototype work by Stefan Petrick, creator of AnimARTrix:`)
        ln(`    // https://github.com/StefanPetrick/animartrix`)
        ln(`    static float _ctLast_${id}=-1.0f,_ctBeatPulse_${id}=0.0f;`)
        ln(`    float _ctDtf=_ctLast_${id}<0.0f?1.0f:constrain((t-_ctLast_${id})*60.0f,0.0f,4.0f); _ctLast_${id}=t;`)
        ln(`    if(_ctDtf>0.0f){`)
        ln(`      float _ctBass=constrain(${bass},0.0f,1.0f),_ctMids=constrain(${mids},0.0f,1.0f),_ctTreble=constrain(${treble},0.0f,1.0f);`)
        ln(`      _ctBeatPulse_${id}=(${beat})?1.0f:_ctBeatPulse_${id}*powf(0.78f,_ctDtf);`)
        ln(`      float _ctEpSpeed=(${endpointSpeed})*(1.0f+_ctMids*1.5f);`)
        ln(`      float _ctColorSpeed=(${colorSpeed})*(1.0f+_ctTreble*2.0f);`)
        ln(`      float _ctDisp=max(0.0f,(float)(${displacement}))*(1.0f+_ctBass*1.5f)*_ctDtf;`)
        ln(`      auto _ctHash=[](int32_t _q,uint32_t _seed)->uint32_t{ uint32_t _h=((uint32_t)_q)^_seed; _h=(_h^(_h>>16))*0x7feb352dU; _h=(_h^(_h>>15))*0x846ca68bU; return _h^(_h>>16); };`)
        ln(`      auto _ctNoise=[&](float _x,uint32_t _seed)->float{ int32_t _xi=(int32_t)floorf(_x); float _xf=_x-_xi; float _u=_xf*_xf*_xf*(_xf*(_xf*6.0f-15.0f)+10.0f); float _a=(_ctHash(_xi,_seed)&1U)?-_xf:_xf; float _d=_xf-1.0f; float _b=(_ctHash(_xi+1,_seed)&1U)?-_d:_d; return _a+(_b-_a)*_u; };`)
        if (morphFlow) {
          ln(`      auto _ctHash2=[&](int32_t _x,int32_t _y,uint32_t _seed)->uint32_t{ uint32_t _q=((uint32_t)_x*0x8da6b343U)^((uint32_t)_y*0xd8163841U); return _ctHash((int32_t)_q,_seed); };`)
          ln(`      auto _ctGrad=[](uint32_t _h,float _x,float _y)->float{ switch(_h&7U){ case 0:return _x+_y; case 1:return -_x+_y; case 2:return _x-_y; case 3:return -_x-_y; case 4:return _x; case 5:return -_x; case 6:return _y; default:return -_y; } };`)
          ln(`      auto _ctNoise2=[&](float _x,float _y,uint32_t _seed)->float{ int32_t _xi=(int32_t)floorf(_x),_yi=(int32_t)floorf(_y); float _xf=_x-_xi,_yf=_y-_yi; float _u=_xf*_xf*_xf*(_xf*(_xf*6.0f-15.0f)+10.0f),_v=_yf*_yf*_yf*(_yf*(_yf*6.0f-15.0f)+10.0f); float _aa=_ctGrad(_ctHash2(_xi,_yi,_seed),_xf,_yf),_ba=_ctGrad(_ctHash2(_xi+1,_yi,_seed),_xf-1.0f,_yf); float _ab=_ctGrad(_ctHash2(_xi,_yi+1,_seed),_xf,_yf-1.0f),_bb=_ctGrad(_ctHash2(_xi+1,_yi+1,_seed),_xf-1.0f,_yf-1.0f); float _x0=_aa+(_ba-_aa)*_u,_x1=_ab+(_bb-_ab)*_u; return _x0+(_x1-_x0)*_v; };`)
        }
        ln(`      auto _ctColor=[&](float _u)->CRGB{ float _h=fmodf(t*_ctColorSpeed+_u,1.0f); if(_h<0.0f)_h+=1.0f; return ColorFromPalette(${pal},(uint8_t)(_h*255.0f),255,LINEARBLEND); };`)
        ln(`      auto _ctBlend=[&](int _x,int _y,const CRGB& _c,float _weight){ if(_x<0||_x>=WIDTH||_y<0||_y>=HEIGHT)return; float _w=constrain(_weight*(1.0f+_ctBeatPulse_${id}*0.65f),0.0f,1.0f); _w=1.0f-powf(1.0f-_w,_ctDtf); CRGB& _d=${ob}[_y*WIDTH+_x]; _d.r=(uint8_t)(_d.r*(1.0f-_w)+_c.r*_w+0.5f); _d.g=(uint8_t)(_d.g*(1.0f-_w)+_c.g*_w+0.5f); _d.b=(uint8_t)(_d.b*(1.0f-_w)+_c.b*_w+0.5f); };`)
        if (injectLine) {
          ln(`      float _cx=(WIDTH-1)*0.5f,_cy=(HEIGHT-1)*0.5f;`)
          ln(`      float _x1=_cx+(WIDTH-1)*(11.5f/31.0f)*sinf(t*_ctEpSpeed*1.13f+0.20f);`)
          ln(`      float _y1=_cy+(HEIGHT-1)*(10.5f/31.0f)*sinf(t*_ctEpSpeed*1.71f+1.30f);`)
          ln(`      float _x2=_cx+(WIDTH-1)*(12.0f/31.0f)*sinf(t*_ctEpSpeed*1.89f+2.20f);`)
          ln(`      float _y2=_cy+(HEIGHT-1)*(11.0f/31.0f)*sinf(t*_ctEpSpeed*1.37f+0.70f);`)
          ln(`      float _dx=_x2-_x1,_dy=_y2-_y1; int _steps=max(1,(int)(max(fabsf(_dx),fabsf(_dy))*3.0f));`)
          ln(`      for(int _i=0;_i<=_steps;_i++){ float _u=_i/(float)_steps,_x=_x1+_dx*_u,_y=_y1+_dy*_u; int _xi=(int)floorf(_x),_yi=(int)floorf(_y); float _fx=_x-_xi,_fy=_y-_yi; CRGB _c=_ctColor(_u); _ctBlend(_xi,_yi,_c,(1.0f-_fx)*(1.0f-_fy)); _ctBlend(_xi+1,_yi,_c,_fx*(1.0f-_fy)); _ctBlend(_xi,_yi+1,_c,(1.0f-_fx)*_fy); _ctBlend(_xi+1,_yi+1,_c,_fx*_fy); }`)
          ln(`      float _radius=0.85f+_ctBeatPulse_${id}*0.9f;`)
          ln(`      auto _ctDisc=[&](float _ex,float _ey,const CRGB& _c){ int _minX=max(0,(int)floorf(_ex-_radius-1.0f)),_maxX=min(WIDTH-1,(int)ceilf(_ex+_radius+1.0f)); int _minY=max(0,(int)floorf(_ey-_radius-1.0f)),_maxY=min(HEIGHT-1,(int)ceilf(_ey+_radius+1.0f)); for(int _py=_minY;_py<=_maxY;_py++)for(int _px=_minX;_px<=_maxX;_px++){ float _dd=hypotf(_px+0.5f-_ex,_py+0.5f-_ey); _ctBlend(_px,_py,_c,constrain(_radius+0.5f-_dd,0.0f,1.0f)); } };`)
          ln(`      _ctDisc(_x1,_y1,_ctColor(0.0f)); _ctDisc(_x2,_y2,_ctColor(1.0f));`)
        }
        if (injectBorder) {
          ln(`      int _ctPi=0,_ctPn=max(1,2*WIDTH+2*HEIGHT-4);`)
          ln(`      for(int _x=0;_x<WIDTH;_x++)_ctBlend(_x,0,_ctColor(_ctPi++/(float)_ctPn),1.0f);`)
          ln(`      for(int _y=1;_y<HEIGHT;_y++)_ctBlend(WIDTH-1,_y,_ctColor(_ctPi++/(float)_ctPn),1.0f);`)
          ln(`      if(HEIGHT>1)for(int _x=WIDTH-2;_x>=0;_x--)_ctBlend(_x,HEIGHT-1,_ctColor(_ctPi++/(float)_ctPn),1.0f);`)
          ln(`      if(WIDTH>1)for(int _y=HEIGHT-2;_y>0;_y--)_ctBlend(0,_y,_ctColor(_ctPi++/(float)_ctPn),1.0f);`)
        }
        ln(`      const uint32_t _seedX=${seed}U,_seedY=${(seed + 1295) >>> 0}U;`)
        const yNoise = morphFlow ? `_ctNoise2(_y*0.23f*(${yFreq}),t*(${ySpeed}),_seedY)` : `_ctNoise(_y*0.23f*(${yFreq})+t*(${ySpeed}),_seedY)`
        const xNoise = morphFlow ? `_ctNoise2((WIDTH-1-_x)*0.23f*(${xFreq}),t*(${xSpeed}),_seedX)` : `_ctNoise((WIDTH-1-_x)*0.23f*(${xFreq})+t*(${xSpeed}),_seedX)`
        ln(`      for(int _y=0;_y<HEIGHT;_y++){ float _profile=${yNoise}*(${yAmp}); float _shift=constrain(_profile*_ctDisp,-1.0f,1.0f); for(int _x=0;_x<WIDTH;_x++){ float _sx=fmodf(_x-_shift,(float)WIDTH); if(_sx<0)_sx+=WIDTH; int _x0=(int)floorf(_sx),_xN=(_x0+1)%WIDTH; float _f=_sx-_x0; CRGB _a=${ob}[_y*WIDTH+_x0],_b=${ob}[_y*WIDTH+_xN]; ${tmp}[_y*WIDTH+_x]=CRGB((uint8_t)(_a.r*(1.0f-_f)+_b.r*_f+0.5f),(uint8_t)(_a.g*(1.0f-_f)+_b.g*_f+0.5f),(uint8_t)(_a.b*(1.0f-_f)+_b.b*_f+0.5f)); } }`)
        ln(`      float _fade=powf(constrain((float)(${persistence}),0.0f,0.99999f),_ctDtf);`)
        ln(`      for(int _x=0;_x<WIDTH;_x++){ float _profile=${xNoise}*(${xAmp}); float _shift=constrain(_profile*_ctDisp,-1.0f,1.0f); for(int _y=0;_y<HEIGHT;_y++){ float _sy=fmodf(_y-_shift,(float)HEIGHT); if(_sy<0)_sy+=HEIGHT; int _y0=(int)floorf(_sy),_yN=(_y0+1)%HEIGHT; float _f=_sy-_y0; CRGB _a=${tmp}[_y0*WIDTH+_x],_b=${tmp}[_yN*WIDTH+_x]; ${ob}[_y*WIDTH+_x]=CRGB((uint8_t)((_a.r*(1.0f-_f)+_b.r*_f)*_fade+0.5f),(uint8_t)((_a.g*(1.0f-_f)+_b.g*_f)*_fade+0.5f),(uint8_t)((_a.b*(1.0f-_f)+_b.b*_f)*_fade+0.5f)); } }`)
        ln(`    }`)
        ln(`  }`)
        break
      }

      case 'Animartrix': {
        needsT.v = true
        const ob = ownBuf()
        loopLines.push(...animartrixCppLines({
          id,
          output: ob,
          effect: p.effect,
          speed: f('speed', 'speed', 0.65),
          audioAmount: f('audioAmount', 'audioAmount', 1),
          bass: f('bass', 'bass', 0),
          mids: f('mids', 'mids', 0),
          treble: f('treble', 'treble', 0),
          kick: f('kick', 'kick', 0),
          snare: f('snare', 'snare', 0),
          hihat: f('hihat', 'hihat', 0),
          beat: boolExpr(node.id, 'beat'),
        }))
        break
      }

      case 'ReactionDiffusion': {
        const ob = ownBuf()
        const feed = f('feed', 'feed', 0.055), kill = f('kill', 'kill', 0.062)
        const pal = paletteExpr(node.id, 'paletteIn', p)
        const seed = seedProp(p)
        if (seed) needsWorley.v = true
        const u = `_u_${id}`, v = `_v_${id}`, un = `_un_${id}`, vn = `_vn_${id}`
        ln(`  { // ReactionDiffusion (Gray-Scott)`)
        ln(`    static float ${u}[NUM_LEDS], ${v}[NUM_LEDS], ${un}[NUM_LEDS], ${vn}[NUM_LEDS]; static bool _rd_${id} = false;`)
        ln(`    if (!_rd_${id}) { for (int _i = 0; _i < NUM_LEDS; _i++) { ${u}[_i] = 1; ${v}[_i] = 0; }`)
        ln(`      for (int _y = HEIGHT/2-2; _y <= HEIGHT/2+1; _y++) for (int _x = WIDTH/2-2; _x <= WIDTH/2+1; _x++)`)
        ln(`        if (_x>=0&&_x<WIDTH&&_y>=0&&_y<HEIGHT) { ${u}[_y*WIDTH+_x]=0.5f; ${v}[_y*WIDTH+_x]=${seed ? `0.25f+_worleyHash(_x+${seed},_y-${seed})*0.5f` : '0.5f'}; } _rd_${id}=true; }`)
        ln(`    float _f=${feed}, _k=${kill};`)
        ln(`    for (int _it=0, _iters=max(1,min(20,(int)floorf(${f('speed', 'speed', 8)}))); _it<_iters; _it++) {`)
        ln(`      for (int _y=0; _y<HEIGHT; _y++) { int _ym=((_y-1+HEIGHT)%HEIGHT)*WIDTH,_yp=((_y+1)%HEIGHT)*WIDTH,_yr=_y*WIDTH;`)
        ln(`        for (int _x=0; _x<WIDTH; _x++) { int _xm=(_x-1+WIDTH)%WIDTH,_xp=(_x+1)%WIDTH,_i=_yr+_x;`)
        ln(`          float _lu=(${u}[_ym+_x]+${u}[_yp+_x]+${u}[_yr+_xm]+${u}[_yr+_xp])*0.2f+(${u}[_ym+_xm]+${u}[_ym+_xp]+${u}[_yp+_xm]+${u}[_yp+_xp])*0.05f-${u}[_i];`)
        ln(`          float _lv=(${v}[_ym+_x]+${v}[_yp+_x]+${v}[_yr+_xm]+${v}[_yr+_xp])*0.2f+(${v}[_ym+_xm]+${v}[_ym+_xp]+${v}[_yp+_xm]+${v}[_yp+_xp])*0.05f-${v}[_i];`)
        ln(`          float _uvv=${u}[_i]*${v}[_i]*${v}[_i];`)
        ln(`          ${un}[_i]=constrain(${u}[_i]+0.16f*_lu-_uvv+_f*(1-${u}[_i]),0.0f,1.0f);`)
        ln(`          ${vn}[_i]=constrain(${v}[_i]+0.08f*_lv+_uvv-(_k+_f)*${v}[_i],0.0f,1.0f); } }`)
        ln(`      ::memcpy(${u},${un},sizeof(${u})); ::memcpy(${v},${vn},sizeof(${v})); }`)
        ln(`    for (int _i=0; _i<NUM_LEDS; _i++) ${ob}[_i]=ColorFromPalette(${pal},(uint8_t)(${v}[_i]*255)); }`)
        break
      }

      case 'GameOfLife': {
        const ob = ownBuf()
        const pal = paletteExpr(node.id, 'paletteIn', p)
        const speed = f('speed', 'speed', 8)
        const fadeL = f('fade', 'fade', 0.75)
        const seed = seedProp(p)
        const c = `_gc_${id}`, nx = `_gn_${id}`, br = `_gb_${id}`
        ln(`  { // Game of Life`)
        ln(`    static uint8_t ${c}[NUM_LEDS], ${nx}[NUM_LEDS]; static float ${br}[NUM_LEDS]; static bool _gi_${id}=false; static uint32_t _gt_${id}=0;`)
        if (seed) ln(`    static bool _gs_${id}=false; if(!_gs_${id}){ random16_set_seed(${seed}u); _gs_${id}=true; }`)
        ln(`    if (!_gi_${id}) { for (int _i=0;_i<NUM_LEDS;_i++){${c}[_i]=random8()<77?1:0;${br}[_i]=0;} _gi_${id}=true; }`)
        ln(`    if (millis() - _gt_${id} >= (uint32_t)(1000.0f / max(1.0f, (float)(${speed})))) {`)
        ln(`      int _pop=0;`)
        ln(`      for (int _y=0;_y<HEIGHT;_y++){ int _ym=((_y-1+HEIGHT)%HEIGHT)*WIDTH,_yp=((_y+1)%HEIGHT)*WIDTH,_yr=_y*WIDTH;`)
        ln(`        for (int _x=0;_x<WIDTH;_x++){ int _xm=(_x-1+WIDTH)%WIDTH,_xp=(_x+1)%WIDTH,_i=_yr+_x;`)
        ln(`          int _n=${c}[_ym+_xm]+${c}[_ym+_x]+${c}[_ym+_xp]+${c}[_yr+_xm]+${c}[_yr+_xp]+${c}[_yp+_xm]+${c}[_yp+_x]+${c}[_yp+_xp];`)
        ln(`          ${nx}[_i]=${c}[_i]?((_n==2||_n==3)?1:0):(_n==3?1:0); _pop+=${nx}[_i]; } }`)
        ln(`      ::memcpy(${c},${nx},sizeof(${c}));`)
        ln(`      if (_pop==0) { for (int _i=0;_i<NUM_LEDS;_i++) ${c}[_i]=random8()<77?1:0; }`)
        ln(`      _gt_${id}=millis(); }`)
        ln(`    for (int _i=0;_i<NUM_LEDS;_i++){ ${br}[_i]=${c}[_i]?1.0f:${br}[_i]*${fadeL}; ${ob}[_i]=ColorFromPalette(${pal},(uint8_t)(${br}[_i]*255)); ${ob}[_i].nscale8((uint8_t)(${br}[_i]*255)); } }`)
        break
      }

      case 'PatternMaster': {
        // The generative pattern-show controller is Phase 4 (per-pattern .h +
        // controller .ino); for now keep the sketch valid with a black fill.
        const ob = ownBuf()
        ln(`  fill_solid(${ob}, NUM_LEDS, CRGB::Black); // Pattern Master — show codegen is Phase 4`)
        break
      }

      case 'Sequencer': {
        const ob = ownBuf()
        const interval = Number(p.interval ?? 4), fade = Number(p.fade ?? 1)
        const bufs = ['p0', 'p1', 'p2', 'p3'].map((port) => srcBuf(port)).filter((b): b is string => !!b)
        // C++ float literal (avoids "4f" — needs "4.0f").
        const fl = (x: number) => { const s = (+x.toFixed(4)).toString(); return (s.includes('.') ? s : `${s}.0`) + 'f' }
        const iv = Math.max(0.1, interval)
        const fadeDur = Math.max(0, Math.min(fade, iv))
        ln(`  { // Sequencer (interval ${interval}s, fade ${fade}s)`)
        if (bufs.length === 0) {
          ln(`    fill_solid(${ob}, NUM_LEDS, CRGB::Black);`)
        } else if (bufs.length === 1) {
          ln(`    ::memmove(${ob}, ${bufs[0]}, sizeof(CRGB) * NUM_LEDS);`)
        } else {
          needsT.v = true
          const n = bufs.length
          ln(`    static CRGB* const _seq_${id}[] = { ${bufs.join(', ')} };`)
          ln(`    float _ph = t / ${fl(iv)};`)
          ln(`    int _idx = ((int)floor(_ph)) % ${n};`)
          ln(`    float _into = (_ph - floor(_ph)) * ${fl(iv)};`)
          ln(`    ::memmove(${ob}, _seq_${id}[_idx], sizeof(CRGB) * NUM_LEDS);`)
          if (fadeDur > 0) {
            ln(`    if (_into >= ${fl(iv - fadeDur)}) {`)
            ln(`      uint8_t _m = (uint8_t)((_into - ${fl(iv - fadeDur)}) / ${fl(fadeDur)} * 255);`)
            ln(`      nblend(${ob}, _seq_${id}[(_idx + 1) % ${n}], NUM_LEDS, _m);`)
            ln(`    }`)
          }
        }
        ln(`  }`)
        break
      }

      case 'CustomFormula': {
        needsT.v = true
        const raw = String(p.formula ?? 'sin(x*6+t)*0.5+0.5')
        // Fail closed on anything the sandboxed parser rejects: a formula
        // arrives inside a shared graph, and an unvalidated string pasted
        // into an expression is a C++ injection hole. `validateGraph` blocks
        // export/upload on the same check, so this is the last line rather
        // than the message the user sees.
        const safe = isNodeFormulaValid(raw)
        if (safe && usesShims(raw)) needsShims.v = true
        if (safe && /\bPHI\b/.test(raw)) needsPhi.v = true
        const formula = safe ? cppRewriteShims(raw).replace(/\*\//g, '* /') : '0.0f'
        const ob = ownBuf()
        const pal = paletteExpr(node.id, 'paletteIn', p)
        ln(`  { /* CustomFormula: ${safe ? raw.replace(/\*\//g, '* /') : 'invalid formula — rendering blank' } */`)
        ln(`    float a=${f('a', 'a', 0)}, b=${f('b', 'b', 0)}; (void)a; (void)b;`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float x=(float)_x/(WIDTH-1>0?WIDTH-1:1),y=(float)_y/(HEIGHT-1>0?HEIGHT-1:1);`)
        ln(`      float cx=((float)_x-WIDTH/2.0f)/(WIDTH/2.0f),cy=((float)_y-HEIGHT/2.0f)/(HEIGHT/2.0f);`)
        ln(`      float r=sqrtf(cx*cx+cy*cy),angle=atan2f(cy,cx); (void)cx;(void)cy;(void)r;(void)angle;`)
        ln(`      float _v=${formula};`)
        ln(`      ${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)(fmod(fmod(_v,1)+1,1)*255));}}`)
        break
      }

      // ── Float Field ────────────────────────────────────────────────────
      case 'FieldFormula': {
        needsT.v = true
        const raw = String(p.formula ?? 'sin8(r*200 + t*60)/255')
        // Same fail-closed validation as CustomFormula above.
        const safe = isNodeFormulaValid(raw)
        if (safe && usesShims(raw)) needsShims.v = true
        if (safe && /\bPHI\b/.test(raw)) needsPhi.v = true
        const formula = safe ? cppRewriteShims(raw).replace(/\*\//g, '* /') : '0.0f'
        const of = ownField()
        const a = f('a', 'a', 0), b = f('b', 'b', 0)
        const fin = srcField('fieldIn')
        ln(`  { /* FieldFormula: ${safe ? raw.replace(/\*\//g, '* /') : 'invalid formula — rendering blank' } */`)
        ln(`    float a=${a}, b=${b}; (void)a;(void)b;`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float x=_x, y=_y; (void)x;(void)y;`)
        ln(`      float cx=((float)_x-WIDTH/2.0f)/(WIDTH/2.0f),cy=((float)_y-HEIGHT/2.0f)/(HEIGHT/2.0f);`)
        ln(`      float r=sqrtf(cx*cx+cy*cy),angle=atan2f(cy,cx); (void)cx;(void)cy;(void)r;(void)angle;`)
        ln(`      float fieldIn=${fin ? `${fin}[_y*WIDTH+_x]` : '0.0f'}; (void)fieldIn;`)
        ln(`      float _v=${formula};`)
        ln(`      ${of}[_y*WIDTH+_x]=constrain(_v,0.0f,1.0f);}}`)
        break
      }

      // Same fBm construction as FractalNoise's codegen (inoise8), but written
      // straight to the field buffer instead of through a palette.
      case 'FieldNoise': {
        needsT.v = true
        const of = ownField()
        const speed = rateCpp(f('speed', 'speed', 0.25), SPEED_MAX.FieldNoise)
        const scale = rateCpp(f('scale', 'scale', 0.3), SCALE_MAX.FieldNoise)
        const octaves = Math.max(1, Math.min(6, Math.floor(Number(p.octaves ?? 4))))
        const seed = seedProp(p)
        const timeExpr = seed ? `(t+${(seed * 0.013).toFixed(3)}f)` : 't'
        ln(`  { // Field noise (fBm via inoise8)`)
        ln(`    float _spd=${speed},_sc=${scale},_t=${timeExpr}; uint16_t _z=(uint16_t)(_t*_spd*40);`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _v=0,_amp=0.5f,_norm=0,_freq=_sc*96;`)
        ln(`      for(int _o=0;_o<${octaves};_o++){`)
        ln(`        _v+=_amp*(inoise8((uint16_t)(_x*_freq),(uint16_t)(_y*_freq),_z)/255.0f);`)
        ln(`        _norm+=_amp; _amp*=0.5f; _freq*=2; }`)
        ln(`      ${of}[_y*WIDTH+_x]=constrain(_v/_norm,0.0f,1.0f);}}`)
        break
      }

      // Curated closed-form fields — exact same math as evalFormulaField in
      // graphEvaluator.ts (no approximation gap, unlike inoise8-backed fields),
      // one dedicated block per formulaType baked at generation time (the
      // variant isn't wired, so there's nothing to branch on at runtime). See
      // docs/development/design/formula-pattern-nodes.md.
      case 'FormulaField': {
        needsT.v = true
        const of = ownField()
        const formulaType = String(p.formulaType ?? 'rose')
        const speed01 = Math.max(0, Math.min(1, Number(p.speed ?? 0.3)))
        const rotRate = speed01 * (FORMULA_FIELD_SPEED_MAX[formulaType] ?? 1)
        const rotLit = floatLit(rotRate)
        switch (formulaType) {
          case 'superformula': {
            const m = floatLit(Math.max(1, Number(p.symmetry ?? 6)))
            const invN1 = floatLit(1 / Math.max(0.05, Number(p.n1 ?? 0.3)))
            const n2 = floatLit(Math.max(0.05, Number(p.n2 ?? 0.3)))
            const n3 = floatLit(Math.max(0.05, Number(p.n3 ?? 0.3)))
            const sfA = floatLit(Math.max(0.05, Number(p.a ?? 1)))
            const sfB = floatLit(Math.max(0.05, Number(p.b ?? 1)))
            ln(`  { /* Formula Field: superformula */ float _rot=t*${rotLit};`)
            ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
            ln(`      float _cx=((float)_x-WIDTH/2.0f)/(WIDTH/2.0f),_cy=((float)_y-HEIGHT/2.0f)/(HEIGHT/2.0f);`)
            ln(`      float _r=sqrtf(_cx*_cx+_cy*_cy),_theta=atan2f(_cy,_cx)+_rot;`)
            ln(`      float _t1=fabsf(cosf(${m}*_theta/4.0f)/${sfA}),_t2=fabsf(sinf(${m}*_theta/4.0f)/${sfB});`)
            ln(`      float _raux=powf(powf(_t1,${n2})+powf(_t2,${n3}),-${invN1});`)
            ln(`      ${of}[_y*WIDTH+_x]=constrain(1.0f-(_r-_raux)/0.06f,0.0f,1.0f);}}`)
            break
          }
          case 'fibonacciSpiral': {
            const nTurns = Math.max(1, Number(p.turns ?? 3))
            const aSp = floatLit(Math.max(0.02, Number(p.tightness ?? 0.15)))
            const bw = floatLit(Math.max(0.02, Number(p.bandWidth ?? 0.25)))
            const period = (2 * Math.PI) / nTurns
            const periodLit = floatLit(period)
            const lnPhiLit = floatLit(Math.log(GOLDEN_RATIO))
            ln(`  { /* Formula Field: fibonacciSpiral */ float _rot=t*${rotLit};`)
            ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
            ln(`      float _cx=((float)_x-WIDTH/2.0f)/(WIDTH/2.0f),_cy=((float)_y-HEIGHT/2.0f)/(HEIGHT/2.0f);`)
            ln(`      float _r=sqrtf(_cx*_cx+_cy*_cy); if(_r<1e-4f)_r=1e-4f;`)
            ln(`      float _ang=atan2f(_cy,_cx);`)
            ln(`      float _phaseAtR=(3.14159265f/2.0f)*logf(_r/${aSp})/${lnPhiLit};`)
            ln(`      float _delta=fmodf(_ang+_rot-_phaseAtR,${periodLit}); if(_delta<0.0f)_delta+=${periodLit};`)
            ln(`      if(_delta>${periodLit}/2.0f)_delta=${periodLit}-_delta;`)
            ln(`      ${of}[_y*WIDTH+_x]=constrain(1.0f-_delta/${bw},0.0f,1.0f);}}`)
            break
          }
          case 'goldenTiling': {
            const dens = floatLit(Math.max(1, Number(p.density ?? 12)))
            const phase = floatLit(Number(p.phase ?? 0))
            const invPhi = floatLit(1 / GOLDEN_RATIO)
            ln(`  { /* Formula Field: goldenTiling */ float _rot=t*${rotLit};`)
            ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
            ln(`      float _cx=((float)_x-WIDTH/2.0f)/(WIDTH/2.0f),_cy=((float)_y-HEIGHT/2.0f)/(HEIGHT/2.0f);`)
            ln(`      float _r=sqrtf(_cx*_cx+_cy*_cy);`)
            ln(`      float _n=floorf(_r*${dens}+_rot+${phase});`)
            ln(`      float _g=_n*${invPhi};`)
            ln(`      ${of}[_y*WIDTH+_x]=_g-floorf(_g);}}`)
            break
          }
          case 'lissajousField': {
            const freqA = floatLit(Math.max(1, Number(p.freqA ?? 3)))
            const freqB = floatLit(Math.max(1, Number(p.freqB ?? 2)))
            const thickness = floatLit(Math.max(0.02, Number(p.thickness ?? 0.1)))
            ln(`  { /* Formula Field: lissajousField */ float _rot=t*${rotLit};`)
            ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
            ln(`      float _cx=((float)_x-WIDTH/2.0f)/(WIDTH/2.0f),_cy=((float)_y-HEIGHT/2.0f)/(HEIGHT/2.0f);`)
            ln(`      float _minDSq=1e9f;`)
            ln(`      for(int _s=0;_s<${LISSAJOUS_FIELD_SAMPLES};_s++){`)
            ln(`        float _sp=((float)_s/${LISSAJOUS_FIELD_SAMPLES}.0f)*6.2831853f;`)
            ln(`        float _lx=sinf(${freqA}*_sp+_rot),_ly=sinf(${freqB}*_sp);`)
            ln(`        float _dx=_cx-_lx,_dy=_cy-_ly,_dSq=_dx*_dx+_dy*_dy;`)
            ln(`        if(_dSq<_minDSq)_minDSq=_dSq; }`)
            ln(`      ${of}[_y*WIDTH+_x]=constrain(1.0f-sqrtf(_minDSq)/${thickness},0.0f,1.0f);}}`)
            break
          }
          case 'rose':
          default: {
            const k = floatLit(Math.max(1, Number(p.petals ?? 5)))
            const offsetRad = floatLit((Number(p.offset ?? 0) * Math.PI) / 180)
            ln(`  { /* Formula Field: rose */ float _rot=t*${rotLit};`)
            ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
            ln(`      float _cx=((float)_x-WIDTH/2.0f)/(WIDTH/2.0f),_cy=((float)_y-HEIGHT/2.0f)/(HEIGHT/2.0f);`)
            ln(`      float _r=sqrtf(_cx*_cx+_cy*_cy),_ang=atan2f(_cy,_cx);`)
            ln(`      float _rr=cosf(${k}*(_ang+${offsetRad}+_rot));`)
            ln(`      ${of}[_y*WIDTH+_x]=constrain((_rr+1.0f)/2.0f*(1.0f-_r*0.15f),0.0f,1.0f);}}`)
            break
          }
        }
        break
      }

      case 'WaveSim': {
        const of = ownField()
        const trig = boolExpr(node.id, 'trigger')
        const speed = `max(1,min(12,(int)floorf(${f('speed', 'speed', 4)})))`
        const dampL = `max(0.8f,min(0.999f,${f('damping', 'damping', 0.985)}))`
        const impulseL = `max(0.1f,min(1.0f,${f('impulse', 'impulse', 1)}))`
        const A = `_ws_${id}`
        ln(`  { // WaveSim`)
        ln(`    static float ${A}p[NUM_LEDS], ${A}c[NUM_LEDS], ${A}n[NUM_LEDS]; static bool ${A}prev=false, ${A}init=false; static uint8_t ${A}pulse=1;`)
        ln(`    static const float ${A}px[5]={0.5f,0.26f,0.74f,0.34f,0.7f}, ${A}py[5]={0.5f,0.34f,0.4f,0.76f,0.7f};`)
        ln(`    auto _wsInject_${id}=[&](uint8_t _pulse,float _amp){ float _cx=${A}px[_pulse%5]*(WIDTH-1),_cy=${A}py[_pulse%5]*(HEIGHT-1),_rad=max(1.5f,min(WIDTH,HEIGHT)*0.12f);`)
        ln(`      int _x0=max(0,(int)floorf(_cx-_rad-1.0f)),_x1=min(WIDTH-1,(int)ceilf(_cx+_rad+1.0f)); int _y0=max(0,(int)floorf(_cy-_rad-1.0f)),_y1=min(HEIGHT-1,(int)ceilf(_cy+_rad+1.0f));`)
        ln(`      for(int _y=_y0;_y<=_y1;_y++) for(int _x=_x0;_x<=_x1;_x++){ float _d=sqrtf((_x-_cx)*(_x-_cx)+(_y-_cy)*(_y-_cy)); float _f=max(0.0f,1.0f-_d/_rad); if(_f<=0.0f) continue; int _i=_y*WIDTH+_x; ${A}c[_i]=constrain(${A}c[_i]+_amp*_f*_f,-1.0f,1.0f); } };`)
        ln(`    if(!${A}init){ for(int _i=0;_i<NUM_LEDS;_i++){ ${A}p[_i]=0; ${A}c[_i]=0; ${A}n[_i]=0; } _wsInject_${id}(0,${impulseL}); ${A}init=true; }`)
        ln(`    bool _tr=(${trig}); if(_tr&&!${A}prev){ _wsInject_${id}(${A}pulse,${impulseL}); ${A}pulse++; } ${A}prev=_tr;`)
        ln(`    for(int _it=0;_it<${speed};_it++){`)
        ln(`      for(int _y=0;_y<HEIGHT;_y++){ int _ym=((_y-1+HEIGHT)%HEIGHT)*WIDTH,_yp=((_y+1)%HEIGHT)*WIDTH,_yr=_y*WIDTH;`)
        ln(`        for(int _x=0;_x<WIDTH;_x++){ int _xm=(_x-1+WIDTH)%WIDTH,_xp=(_x+1)%WIDTH,_i=_yr+_x; float _avg=(${A}c[_ym+_x]+${A}c[_yp+_x]+${A}c[_yr+_xm]+${A}c[_yr+_xp])*0.5f; ${A}n[_i]=constrain((_avg-${A}p[_i])*${dampL},-1.0f,1.0f); } }`)
        ln(`      ::memcpy(${A}p,${A}c,sizeof(${A}p)); ::memcpy(${A}c,${A}n,sizeof(${A}c)); }`)
        ln(`    float _peak=0.0f; for(int _i=0;_i<NUM_LEDS;_i++) _peak=max(_peak,fabsf(${A}c[_i]));`)
        ln(`    if(_peak<0.002f){ _wsInject_${id}(${A}pulse,${impulseL}*0.6f); ${A}pulse++; }`)
        ln(`    for(int _i=0;_i<NUM_LEDS;_i++) ${of}[_i]=constrain(fabsf(${A}c[_i])*1.5f,0.0f,1.0f); }`)
        break
      }

      case 'FieldToFrame': {
        const ob = ownBuf()
        const pal = paletteExpr(node.id, 'paletteIn', p)
        const src = srcField('field')
        const bright = f('brightness', 'brightness', 1)
        if (!src) {
          ln(`  fill_solid(${ob}, NUM_LEDS, CRGB::Black);`)
        } else {
          ln(`  { float _br=constrain(${bright},0.0f,1.0f);`)
          ln(`    for(int _i=0;_i<NUM_LEDS;_i++)`)
          ln(`      ${ob}[_i]=ColorFromPalette(${pal},(uint8_t)(${src}[_i]*255),(uint8_t)(_br*255)); }`)
        }
        break
      }

      // The inverse of FieldToFrame: a 0–1 brightness field from a rendered
      // frame (average of r,g,b, matching Mask's mask-opacity convention).
      case 'FrameToField': {
        const of = ownField()
        const src = srcBuf('frame')
        if (!src) {
          ln(`  for(int _i=0;_i<NUM_LEDS;_i++) ${of}[_i]=0.0f;`)
        } else {
          ln(`  for(int _i=0;_i<NUM_LEDS;_i++) ${of}[_i]=(${src}[_i].r+${src}[_i].g+${src}[_i].b)/3.0f/255.0f;`)
        }
        break
      }

      case 'DistanceField': {
        const of = ownField()
        const px = f('px', 'px', 0.5), py = f('py', 'py', 0.5), scale = f('scale', 'scale', 1)
        ln(`  { /* DistanceField */`)
        ln(`    float _px=${px}, _py=${py}, _sc=${scale}; if(_sc<0.0001f)_sc=0.0001f;`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _nx=(float)_x/(WIDTH-1>0?WIDTH-1:1),_ny=(float)_y/(HEIGHT-1>0?HEIGHT-1:1);`)
        ln(`      float _dx=_nx-_px,_dy=_ny-_py;`)
        ln(`      float _d=sqrtf(_dx*_dx+_dy*_dy)/1.41421356f*_sc;`)
        ln(`      ${of}[_y*WIDTH+_x]=constrain(_d,0.0f,1.0f);}}`)
        break
      }

      case 'FieldMath': {
        const of = ownField()
        const op = String(p.fieldOp ?? 'add')
        const sa = srcField('a'), sb = srcField('b')
        const av = sa ? `${sa}[_i]` : '0.0f', bv = sb ? `${sb}[_i]` : '0.0f'
        let expr: string
        switch (op) {
          case 'subtract':   expr = `_a - _b`; break
          case 'multiply':   expr = `_a * _b`; break
          case 'mix':        expr = `(_a + _b) * 0.5f`; break
          case 'min':        expr = `min(_a, _b)`; break
          case 'max':        expr = `max(_a, _b)`; break
          case 'difference': expr = `fabsf(_a - _b)`; break
          case 'add':
          default:           expr = `_a + _b`; break
        }
        ln(`  { /* FieldMath: ${op} */`)
        ln(`    for(int _i=0;_i<NUM_LEDS;_i++){`)
        ln(`      float _a=${av}, _b=${bv};`)
        ln(`      ${of}[_i]=constrain(${expr},0.0f,1.0f);}}`)
        break
      }

      case 'FieldWarp': {
        const of = ownField()
        const st = f('strength', 'strength', 1)
        const src = srcField('field'), sdx = srcField('dx'), sdy = srcField('dy')
        const oxE = sdx ? `(2.0f*${sdx}[_y*WIDTH+_x]-1.0f)*_st` : '0.0f'
        const oyE = sdy ? `(2.0f*${sdy}[_y*WIDTH+_x]-1.0f)*_st` : '0.0f'
        ln(`  { /* FieldWarp */ float _st=${st};`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _ox=${oxE},_oy=${oyE};`)
        ln(`      int _sx=(int)roundf(_x+_ox); if(_sx<0)_sx=0; if(_sx>WIDTH-1)_sx=WIDTH-1;`)
        ln(`      int _sy=(int)roundf(_y+_oy); if(_sy<0)_sy=0; if(_sy>HEIGHT-1)_sy=HEIGHT-1;`)
        ln(`      ${of}[_y*WIDTH+_x]=${src ? `${src}[_sy*WIDTH+_sx]` : '0.0f'};}}`)
        break
      }

      case 'FieldRotate': {
        needsT.v = true
        const of = ownField()
        const angle = f('angle', 'angle', 0), spin = f('spin', 'spin', 0)
        const src = srcField('field')
        ln(`  { /* FieldRotate */ float _ang=((${angle})+t*${spin})*0.01745329f;`)
        ln(`    float _ca=cosf(-_ang),_sa=sinf(-_ang),_cx=(WIDTH-1)/2.0f,_cy=(HEIGHT-1)/2.0f;`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _dx=_x-_cx,_dy=_y-_cy;`)
        ln(`      int _sx=(((int)roundf(_dx*_ca-_dy*_sa+_cx))%WIDTH+WIDTH)%WIDTH;`)
        ln(`      int _sy=(((int)roundf(_dx*_sa+_dy*_ca+_cy))%HEIGHT+HEIGHT)%HEIGHT;`)
        ln(`      ${of}[_y*WIDTH+_x]=${src ? `${src}[_sy*WIDTH+_sx]` : '0.0f'};}}`)
        break
      }

      case 'FieldTile': {
        const of = ownField()
        const tx = f('tilesX', 'tilesX', 2)
        const ty = f('tilesY', 'tilesY', 2)
        const src = srcField('field')
        ln(`  { /* FieldTile */`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      int _tx=max(1,(int)roundf(${tx})),_ty=max(1,(int)roundf(${ty})); int _sx=(_x*_tx)%WIDTH,_sy=(_y*_ty)%HEIGHT;`)
        ln(`      ${of}[_y*WIDTH+_x]=${src ? `${src}[_sy*WIDTH+_sx]` : '0.0f'};}}`)
        break
      }

      case 'CHSV': {
        const hue = f('hue', 'hue', 128), sat = f('sat', 'sat', 255), val = f('val', 'val', 255)
        ln(`  CRGB ${v('rgb')} = CHSV((uint8_t)(${hue}), (uint8_t)(${sat}), (uint8_t)(${val}));`)
        break
      }

      case 'Code': {
        // Paste-through: the user's FastLED loop body writes into leds[], aliased
        // to this node's (global, persistent) buffer. A wired frame input seeds
        // it each loop; unwired the buffer persists, so fadeToBlackBy accumulates
        // trails the same way the live preview does.
        needsT.v = true
        const ob = ownBuf()
        const src = srcBuf('frame')
        const global = String(p.globalCode ?? '').trim()
        const code = String(p.code ?? '')
        if (global) {
          globalLines.push(`// ── Code node ${node.id} — globals ──`)
          for (const line of global.split('\n')) globalLines.push(line)
          globalLines.push(``)
        }
        ln(`  {`)
        if (src) ln(`    ::memmove(${ob}, ${src}, sizeof(CRGB) * NUM_LEDS);`)
        ln(`    CRGB* leds = ${ob}; (void)leds;`)
        for (const line of code.split('\n')) ln(`    ${line}`)
        ln(`  }`)
        break
      }

      case 'PaletteSelector':
        ln(`  // PaletteSelector — drives ${fastledPalette(String(p.palette ?? 'rainbow'))} in connected palette-consuming nodes`)
        break

      case 'CustomPalette': {
        // Positioned custom stops bake to a full CRGBPalette16. Wired color
        // inputs override their matching local stop for the first four slots.
        const local = normalizeCustomPalette(p.colors, p.positions)
        const localStops = customPaletteStops16(local.colors.map(customHexToRgb), local.positions)
        const colorStopExpr = (source: number) => {
          const port = `color${source}`
          if (source < 4 && incoming.get(`${node.id}:${port}`)) return colorExpr(node.id, port)
          const c = customHexToRgb(local.colors[source])
          return `CRGB(${c.r},${c.g},${c.b})`
        }
        const stopExpr = (idx: number) => {
          const position = idx / 15
          let right = 1
          while (right < local.positions.length - 1 && position > local.positions[right]) right++
          const left = Math.max(0, right - 1)
          const leftPos = local.positions[left] ?? 0
          const rightPos = local.positions[right] ?? 1
          const amount = Math.max(0, Math.min(255, Math.round(((position - leftPos) / Math.max(1e-6, rightPos - leftPos)) * 255)))
          if (amount <= 0) return colorStopExpr(left)
          if (amount >= 255) return colorStopExpr(right)
          const leftExpr = colorStopExpr(left)
          const rightExpr = colorStopExpr(right)
          if (!leftExpr.includes('n_') && !rightExpr.includes('n_')) {
            const c = localStops[idx]
            return `CRGB(${c.r},${c.g},${c.b})`
          }
          return `blend(${leftExpr}, ${rightExpr}, ${amount})`
        }
        ln(`  CRGBPalette16 pal_${id}(${Array.from({ length: 16 }, (_, i) => stopExpr(i)).join(', ')});`)
        break
      }

      case 'PaletteFromImage': {
        const upstream = incoming.get(`${node.id}:image`)
        const sourceNode = upstream ? nodeMap.get(upstream.srcId) : null
        const sourceProps = sourceNode?.data.nodeType === 'Image' ? props(sourceNode) : null
        const source = sourceProps
          ? (asAnimatedImage(sourceProps.animation) ?? asImage(sourceProps.image))
          : null
        const stops = imagePaletteStops16(source, Number(p.count ?? 6))
        const cppStops = stops.map((color) => `CRGB(${color.r},${color.g},${color.b})`).join(', ')
        if (!source) globalLines.push(`// Palette from Image: connect an Image node with an uploaded file.`)
        globalLines.push(`const CRGBPalette16 pal_${id}(${cppStops});`)
        break
      }

      case 'Poline': {
        // Bake the poline palette (computed from the configured anchor hex
        // props) into a CRGBPalette16. Live-wired anchors drive only the
        // preview; firmware uses the configured anchors.
        const a = hexToRgb(String(p.anchorA ?? '#1020ff'))
        const b = hexToRgb(String(p.anchorB ?? '#ff20a0'))
        const c = hexToRgb(String(p.anchorC ?? '#20ffd0'))
        const stops = polineStops16([a, b, c], Number(p.points ?? 4), String(p.position ?? 'sinusoidal'))
        const cppStops = stops.map((s) => `CRGB(${s.r},${s.g},${s.b})`).join(', ')
        if (incoming.get(`${node.id}:colorA`) || incoming.get(`${node.id}:colorB`) || incoming.get(`${node.id}:colorC`)) {
          ln(`  // Poline: wired anchors drive the live preview; firmware bakes the configured anchors.`)
        }
        ln(`  CRGBPalette16 pal_${id}(${cppStops});`)
        break
      }

      case 'PaletteBlend': {
        // Build a CRGBPalette16 by blending both palettes entry-by-entry.
        const a = paletteExpr(node.id, 'paletteA', { palette: p.paletteA })
        const b = paletteExpr(node.id, 'paletteB', { palette: p.paletteB })
        const amt = f('amount', 'amount', 0.5)
        ln(`  CRGBPalette16 pal_${id};`)
        ln(`  { uint8_t _amt = (uint8_t)((${amt}) * 255); for (int _i = 0; _i < 16; _i++) { uint8_t _p = (uint8_t)(_i * 255 / 15);`)
        ln(`    pal_${id}[_i] = blend(ColorFromPalette(${a}, _p), ColorFromPalette(${b}, _p), _amt); } }`)
        break
      }

      case 'BeatSin': {
        const bpmProp = Number(p.bpm ?? 60)
        const bpm = Number.isFinite(bpmProp) ? bpmProp : 60
        const lo = Number(p.low ?? 0), hi = Number(p.high ?? 1)
        ln(`  float ${v('value')} = ${lo.toFixed(3)}f + ((sinf(((millis() / 1000.0f) * ${bpm.toFixed(3)}f / 60.0f) * 6.2831853f) + 1.0f) * 0.5f) * (${hi.toFixed(3)}f - ${lo.toFixed(3)}f);`)
        break
      }

      // Free-running BPM clock/transport — millis()-based, mirroring the
      // stateful `Clock` case in graphEvaluator.ts (same tap/sync EMA and
      // beat/bar/subdivision edge semantics) so preview and firmware timing
      // match.
      case 'Clock': {
        const bpmProp = Math.max(1, Number(p.bpm ?? 120))
        const beatsPerBar = Math.max(1, Math.round(Number(p.beatsPerBar ?? 4)))
        const subdivision = Math.max(1, Math.round(Number(p.subdivision ?? 2)))
        const tap = boolExpr(node.id, 'tap')
        const sync = boolExpr(node.id, 'sync')
        const reset = boolExpr(node.id, 'reset')
        ln(`  static uint32_t _clkOrigin_${id} = 0; static bool _clkInit_${id} = false;`)
        ln(`  static uint32_t _clkLastPulse_${id} = 0; static bool _clkHasPulse_${id} = false;`)
        ln(`  static float _clkTapBpm_${id} = 0; static bool _clkHasTap_${id} = false;`)
        ln(`  static bool _clkPTap_${id} = false, _clkPSync_${id} = false, _clkPReset_${id} = false;`)
        ln(`  static uint32_t _clkLastBeat_${id} = 0, _clkLastSub_${id} = 0;`)
        ln(`  { if (!_clkInit_${id}) { _clkOrigin_${id} = millis(); _clkInit_${id} = true; }`)
        ln(`    bool _tapNow = (${tap}); bool _syncNow = (${sync}); bool _resetNow = (${reset});`)
        ln(`    bool _pulseNow = (_tapNow && !_clkPTap_${id}) || (_syncNow && !_clkPSync_${id});`)
        ln(`    if (_pulseNow) { uint32_t _now = millis();`)
        ln(`      if (_clkHasPulse_${id}) { uint32_t _iv = _now - _clkLastPulse_${id};`)
        ln(`        if (_iv > 200 && _iv < 3000) { float _sample = 60000.0f / _iv; _clkTapBpm_${id} = _clkHasTap_${id} ? (_clkTapBpm_${id} * 0.5f + _sample * 0.5f) : _sample; _clkHasTap_${id} = true; }`)
        ln(`        else { _clkHasTap_${id} = false; } }`)
        ln(`      _clkLastPulse_${id} = _now; _clkHasPulse_${id} = true; _clkOrigin_${id} = _now; }`)
        ln(`    if (_resetNow && !_clkPReset_${id}) { _clkOrigin_${id} = millis(); _clkHasPulse_${id} = false; _clkHasTap_${id} = false; _clkLastBeat_${id} = 0; _clkLastSub_${id} = 0; }`)
        ln(`    _clkPTap_${id} = _tapNow; _clkPSync_${id} = _syncNow; _clkPReset_${id} = _resetNow; }`)
        ln(`  float ${v('bpm')} = _clkHasTap_${id} ? _clkTapBpm_${id} : ${floatLit(bpmProp)};`)
        ln(`  float _clkElapsed_${id} = ((millis() - _clkOrigin_${id}) / 60000.0f) * ${v('bpm')};`)
        ln(`  float ${v('phase')} = _clkElapsed_${id} - (uint32_t)_clkElapsed_${id};`)
        ln(`  uint32_t _clkBeatCount_${id} = (uint32_t)_clkElapsed_${id};`)
        ln(`  bool ${v('beat')} = _clkBeatCount_${id} > _clkLastBeat_${id};`)
        ln(`  bool ${v('bar')} = ${v('beat')} && (_clkBeatCount_${id} % ${beatsPerBar}u == 0u);`)
        ln(`  uint32_t _clkSubCount_${id} = (uint32_t)(_clkElapsed_${id} * ${subdivision}.0f);`)
        ln(`  bool ${v('sub')} = _clkSubCount_${id} > _clkLastSub_${id};`)
        ln(`  _clkLastBeat_${id} = _clkBeatCount_${id}; _clkLastSub_${id} = _clkSubCount_${id};`)
        break
      }

      case 'Fire2012': {
        const ob = ownBuf()
        const cooling = f('cooling', 'cooling', 55), sparking = f('sparking', 'sparking', 120)
        const pal = paletteExpr(node.id, 'paletteIn', p)
        const direction = String(p.direction ?? 'up')
        const spread = Math.max(0, Math.round(Number(p.turbulence ?? 1)))
        const paletteMixP = Math.max(0, Math.min(1, Number(p.paletteMix ?? 1)))
        const mirrorP = Boolean(p.mirror)
        const seedP = Math.max(0, Math.round(Number(p.seed ?? 0)))
        const { P, S } = fireGrid(direction)
        const HB = `_heat_${id}`
        const useLcg = seedP > 0
        const rnd01 = useLcg
          ? `((_fireLcg_${id}=_fireLcg_${id}*1664525u+1013904223u)/4294967296.0f)`
          : `(random8()/255.0f)`
        ln(`  { // Fire2012`)
        ln(`    static uint8_t ${HB}[${P}][${S}] = {};`)
        if (useLcg) ln(`    static uint32_t _fireLcg_${id} = ${seedP}u;`)
        ln(`    for(int _p=0;_p<${P};_p++) for(int _s=0;_s<${S};_s++)`)
        ln(`      ${HB}[_p][_s]=qsub8(${HB}[_p][_s],(uint8_t)(${rnd01}*((${cooling}*10/(${P}))+2)));`)
        // Classic two-row lookahead: row _p from the single row _p-1 (closer to
        // the base) plus a turbulence-wide sideways window at _p-2 (spread=1
        // reproduces the original fixed 4-sample kernel). Mirrors evalFire2012.
        ln(`    for(int _p=(${P})-1;_p>=2;_p--) for(int _s=0;_s<${S};_s++) {`)
        ln(`      int _sum=${HB}[_p-1][_s]; for (int _ds=-${spread}; _ds<=${spread}; _ds++) _sum += ${HB}[_p-2][max(0,min((${S})-1,_s+_ds))];`)
        ln(`      ${HB}[_p][_s]=_sum/${spread * 2 + 2}; }`)
        ln(`    for(int _s=0;_s<${S};_s++) if(${rnd01}*255 < ${sparking}) ${HB}[0][_s]=qadd8(${HB}[0][_s],(uint8_t)(${rnd01}*95+160));`)
        ln(`    for (int _p = 0; _p < ${P}; _p++) for (int _s = 0; _s < ${S}; _s++) {`)
        const { x: fx, y: fy } = fireXYExpr(direction, '_p', '_s')
        ln(`      uint8_t _h=${HB}[_p][_s]; CRGB _c=ColorFromPalette(${pal}, _h);`)
        if (paletteMixP >= 1) {
          ln(`      ${ob}[(${fy})*WIDTH+(${fx})] = _c;`)
        } else {
          const keep = floatLit(1 - paletteMixP)
          const mix = floatLit(paletteMixP)
          ln(`      ${ob}[(${fy})*WIDTH+(${fx})] = CRGB((uint8_t)(_h*${keep}+_c.r*${mix}),(uint8_t)(_h*${keep}+_c.g*${mix}),(uint8_t)(_h*${keep}+_c.b*${mix}));`)
        }
        ln(`    }`)
        if (mirrorP) {
          if (direction === 'left' || direction === 'right')
            ln(`    for (int _y=0;_y<HEIGHT/2;_y++) for (int _x=0;_x<WIDTH;_x++) ${ob}[(HEIGHT-1-_y)*WIDTH+_x] = ${ob}[_y*WIDTH+_x];`)
          else
            ln(`    for (int _y=0;_y<HEIGHT;_y++) for (int _x=0;_x<WIDTH/2;_x++) ${ob}[_y*WIDTH+(WIDTH-1-_x)] = ${ob}[_y*WIDTH+_x];`)
        }
        ln(`  }`)
        break
      }

      case 'Blur2D': {
        const ob = ownBuf()
        // `amount` is a 0–1 strength; blur2d takes a 0–255 blur amount.
        // FastLED 3.10+ requires an XYMap argument — without it blur2d logs
        // "XY function not provided" and maps every pixel to index 0. Our
        // buffers are always row-major (serpentine remaps only at
        // MatrixOutput), so a rectangular grid map is correct here.
        needsXyMap.v = true
        const amount = f('amount', 'amount', 0.15)
        ln(`  ${seedFrom('frame')} blur2d(${ob}, WIDTH, HEIGHT, (uint8_t)(constrain(${amount},0.0f,1.0f)*255.0f), _xyMap);`)
        break
      }

      case 'XYMapper': {
        const xx = f('x', 'x', 0), yy = f('y', 'y', 0)
        ln(`  uint16_t ${v('index')} = (uint16_t)(${xx}) + (uint16_t)(${yy}) * WIDTH;`)
        break
      }

      case 'AudioHue': {
        const bass = f('bass','bass',0.5), mids = f('mids','mids',0.5), treble = f('treble','treble',0.5)
        // Band weights are node properties, not ports, so they bake in as
        // literals. audioHueWeight() is shared with the evaluator, including
        // its pre-weights fallback mix, so preview and firmware agree.
        const bw = floatLit(audioHueWeight(p.bassWeight,   0.5))
        const mw = floatLit(audioHueWeight(p.midsWeight,   0.3))
        const tw = floatLit(audioHueWeight(p.trebleWeight, 0.2))
        // The port contract is degrees (0..360), matching the evaluator and
        // HSVToRGB.  Keeping this as a byte silently compressed firmware hues
        // into 0..255 degrees and made the same patch change colour on-device.
        ln(`  float ${v('hue')} = ((${bass})*${bw}+(${mids})*${mw}+(${treble})*${tw})*360.0f;`)
        break
      }

      case 'MatrixOutput': {
        const mirrorOf = isMirrorOf(node)
        if (mirrorOf) {
          const leader = nodeMap.get(mirrorOf)
          ln(`  // ${cppComment(String(node.data.label ?? 'LED output'))} is wired in parallel with`)
          ln(`  // ${cppComment(String(leader?.data.label ?? 'the first output'))} on the same pin — same wire, same pixels.`)
          break
        }
        const src = srcBuf('frame')
        if (isHub75) {
          if (!src) {
            ln(`  dma_display->clearScreen();`)
          } else {
            for (const line of hub75BlitRowsCpp(hub75Hw!, `${src}[_y * WIDTH + _x]`)) ln(line)
          }
          break
        }
        if (multipleOutputs) {
          const route = outputConfigs.find((candidate) => candidate.id === node.id)!
          const leds = `leds_${route.safeId}`
          const xy = route.xyTable ? `XY_${route.safeId}(_x, _y)` : `_y * ${route.width} + _x`
          if (!src) {
            ln(`  fill_solid(${leds}, ${route.ledTotal}, CRGB::Black);`)
          } else if (route.ringMap) {
            ln(`  for (int _i = 0; _i < ${route.ringMap.length}; _i++) {`)
            ln(`    CRGB _c = ${src}[pgm_read_word(&_ringmap_${route.safeId}[_i])]; _c.nscale8_video(${route.hardware.brightness});`)
            ln(`    ${leds}[_i] = _c;`)
            ln(`  }`)
          } else if (route.routeMode === 'crop') {
            ln(`  for (int _y = 0; _y < ${route.height}; _y++) for (int _x = 0; _x < ${route.width}; _x++) {`)
            ln(`    int _sx = (${route.routeX} + _x) % WIDTH, _sy = (${route.routeY} + _y) % HEIGHT;`)
            ln(`    CRGB _c = ${src}[_sy * WIDTH + _sx]; _c.nscale8_video(${route.hardware.brightness});`)
            ln(`    ${leds}[${xy}] = _c;`)
            ln(`  }`)
          } else {
            ln(`  for (int _y = 0; _y < ${route.height}; _y++) for (int _x = 0; _x < ${route.width}; _x++) {`)
            ln(`    int _x0 = _x * WIDTH / ${route.width}, _x1 = (_x + 1) * WIDTH / ${route.width};`)
            ln(`    int _y0 = _y * HEIGHT / ${route.height}, _y1 = (_y + 1) * HEIGHT / ${route.height};`)
            ln(`    if (_x1 <= _x0) _x1 = _x0 + 1; if (_y1 <= _y0) _y1 = _y0 + 1;`)
            ln(`    uint32_t _r = 0, _g = 0, _b = 0, _n = 0;`)
            ln(`    for (int _sy = _y0; _sy < min(HEIGHT, _y1); _sy++) for (int _sx = _x0; _sx < min(WIDTH, _x1); _sx++) { CRGB _p = ${src}[_sy * WIDTH + _sx]; _r += _p.r; _g += _p.g; _b += _p.b; _n++; }`)
            ln(`    CRGB _c = _n ? CRGB(_r / _n, _g / _n, _b / _n) : CRGB::Black; _c.nscale8_video(${route.hardware.brightness});`)
            ln(`    ${leds}[${xy}] = _c;`)
            ln(`  }`)
          }
          break
        }
        if (!src) {
          ln(`  fill_solid(leds, ${physLeds}, CRGB::Black);`)
        } else if (ringMap) {
          ln(`  for (int _i = 0; _i < RING_LEDS; _i++) leds[_i] = ${src}[pgm_read_word(&_ringmap[_i])];`)
        } else if (ss) {
          // Average each SS×SS block of the render buffer into one physical LED.
          const dst = xyTable ? 'XY(_x, _y)' : `_y * PANEL_W + _x`
          ln(`  for (int _y = 0; _y < PANEL_H; _y++) for (int _x = 0; _x < PANEL_W; _x++) {`)
          ln(`    uint16_t _r = 0, _g = 0, _b = 0;`)
          ln(`    for (int _sy = 0; _sy < SS; _sy++) for (int _sx = 0; _sx < SS; _sx++) {`)
          ln(`      CRGB _c = ${src}[(_y * SS + _sy) * WIDTH + (_x * SS + _sx)];`)
          ln(`      _r += _c.r; _g += _c.g; _b += _c.b;`)
          ln(`    }`)
          ln(`    leds[${dst}] = CRGB(_r / (SS * SS), _g / (SS * SS), _b / (SS * SS));`)
          ln(`  }`)
        } else if (xyTable) {
          ln(`  for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) leds[XY(_x, _y)] = ${src}[_y * WIDTH + _x];`)
        } else {
          ln(`  ::memmove(leds, ${src}, sizeof(CRGB) * NUM_LEDS);`)
        }
        ln(`  FastLED.show();`)
        break
      }

      case 'Comment':
        // Canvas-only annotation — no ports, nothing to emit.
        break

      default:
        ln(`  // ${type} — ${SHOW_PIPELINE_NOTES[type] ?? 'not yet supported in code gen'}`)
    }
  }

  // Emit all node snippets first to collect needsMapFloat and needsT flags
  for (const node of sorted) emit(node)

  const lines: string[] = []

  // Header (the overclock define must precede the FastLED include)
  const clocklessRoutes = outputConfigs.filter((route) => !SPI_CHIPSETS.has(route.hardware.chipset))
  const overclockHw = multipleOutputs && clocklessRoutes.length > 0
    ? { ...clocklessRoutes[0].hardware, overclock: Math.max(...clocklessRoutes.map((route) => route.hardware.overclock)) }
    : hw
  lines.push(...overclockDefineCpp(overclockHw))
  if (audio) lines.push(...audio.preInclude)
  lines.push(`#include <FastLED.h>`)
  if (isHub75) lines.push(...hub75IncludesCpp(hub75Hw!))
  if (needsDs3231) lines.push(`#include <Wire.h>`)
  if (needsWifi) {
    lines.push(`#if defined(ESP32)`)
    lines.push(`#include <WiFi.h>`)
    lines.push(`#include <WiFiUdp.h>`)
    lines.push(`#include <time.h>`)
    lines.push(`#define FLS_WIFI_SUPPORTED 1`)
    lines.push(`#elif defined(ESP8266)`)
    lines.push(`#include <ESP8266WiFi.h>`)
    lines.push(`#include <WiFiUdp.h>`)
    lines.push(`#include <time.h>`)
    lines.push(`#define FLS_WIFI_SUPPORTED 1`)
    lines.push(`#else`)
    lines.push(`#define FLS_WIFI_SUPPORTED 0`)
    lines.push(`#endif`)
  }
  if (needsDmx512) {
    lines.push(`#if defined(ESP32)`)
    lines.push(`#include <esp_dmx.h>`)
    lines.push(`#endif`)
  }
  if (audio) lines.push(audio.include)
  lines.push(``)
  if (ss) {
    lines.push(`#define SS       ${supersample}          // supersample factor: render at SS×, downscale`)
    lines.push(`#define PANEL_W  ${width}`)
    lines.push(`#define PANEL_H  ${height}`)
    lines.push(`#define PANEL_LEDS (PANEL_W * PANEL_H)   // physical LED count`)
    lines.push(`#define WIDTH    (PANEL_W * SS)`)
    lines.push(`#define HEIGHT   (PANEL_H * SS)`)
    lines.push(`#define NUM_LEDS (WIDTH * HEIGHT)        // render-buffer resolution`)
  } else {
    lines.push(`#define WIDTH    ${width}`)
    lines.push(`#define HEIGHT   ${height}`)
    lines.push(`#define NUM_LEDS (WIDTH * HEIGHT)`)
  }
  if (ringMap) {
    lines.push(`#define RING_LEDS ${ringMap.length}                 // LEDs around the ring`)
  }
  if (multipleOutputs) {
    for (const route of outputConfigs) {
      lines.push(`#define DATA_PIN_${route.safeId} ${route.dataPin}`)
      if (SPI_CHIPSETS.has(route.hardware.chipset)) lines.push(`#define CLOCK_PIN_${route.safeId} ${route.hardware.clockPin}`)
    }
  } else if (!isHub75) {
    lines.push(`#define DATA_PIN ${dataPin}`)
    if (SPI_CHIPSETS.has(hw.chipset)) lines.push(`#define CLOCK_PIN ${hw.clockPin}`)
  }
  lines.push(``)
  if (multipleOutputs) {
    for (const route of outputConfigs) lines.push(`CRGB leds_${route.safeId}[${route.ledTotal}];`)
  } else if (isHub75) {
    lines.push(...hub75GlobalsCpp(hub75Hw!))
  } else {
    lines.push(`CRGB leds[${physLeds}];`)
  }
  // One render buffer per frame-producing node so layers can be composited, and
  // one float buffer per field-producing node (FieldFormula …). With `usePsram`
  // these become pointers allocated in setup() (leds stays internal — see
  // PSRAM_ALLOC_CPP); otherwise they're plain static arrays.
  const bufferDecls = [
    ...[...frameBufs].map((b) => `CRGB buf_${b}[NUM_LEDS];`),
    ...[...fieldBufs].map((b) => `float field_${b}[NUM_LEDS];`),
  ]
  const psramAllocs: string[] = []
  for (const d of bufferDecls) {
    const ps = usePsram ? psramBufferDecl(d) : null
    if (ps) { lines.push(ps.decl); psramAllocs.push(ps.alloc) }
    else lines.push(d)
  }
  for (const [id, capacity] of feedbackHistoryBufs) {
    lines.push(`CRGB _fb_${id}[${capacity}][NUM_LEDS];`)
  }
  lines.push(``)
  if (usePsram) {
    lines.push(PSRAM_ALLOC_CPP)
    lines.push(``)
  }

  if (needsShims.v) {
    lines.push(CPP_SHIM_HELPERS)
    lines.push(``)
  }

  if (needsPhi.v) {
    // Golden ratio — matches formulaLang.ts's MATH_CONSTANTS.PHI so a
    // CustomFormula/FieldFormula expression using PHI compiles unchanged.
    lines.push(`#define PHI 1.618033988749895f`)
    lines.push(``)
  }

  if (needsXyMap.v) {
    lines.push(`// Row-major coordinate map for FastLED 3.10+'s blur2d (buffers are always`)
    lines.push(`// row-major; serpentine wiring is remapped only at MatrixOutput).`)
    lines.push(`fl::XYMap _xyMap = fl::XYMap::constructRectangularGrid(WIDTH, HEIGHT);`)
    lines.push(``)
  }

  if (needsMapFloat[0]) {
    lines.push(`float mapFloat(float x, float inMin, float inMax, float outMin, float outMax) {`)
    lines.push(`  if (inMax == inMin) return outMin;`)
    lines.push(`  return outMin + (x - inMin) * (outMax - outMin) / (inMax - inMin);`)
    lines.push(`}`)
    lines.push(``)
  }

  if (needsKelvin.v) {
    lines.push(`// Approximate black-body white point for a colour temperature (Kelvin).`)
    lines.push(`CRGB kelvinToRGB(float kelvin) {`)
    lines.push(`  float t = constrain(kelvin, 1000.0f, 40000.0f) / 100.0f, r, g, b;`)
    lines.push(`  if (t <= 66) { r = 255; g = 99.4708025861f * log(t) - 161.1195681661f; }`)
    lines.push(`  else { r = 329.698727446f * pow(t - 60, -0.1332047592f); g = 288.1221695283f * pow(t - 60, -0.0755148492f); }`)
    lines.push(`  if (t >= 66) b = 255; else if (t <= 19) b = 0; else b = 138.5177312231f * log(t - 10) - 305.0447927307f;`)
    lines.push(`  return CRGB(constrain((int)r, 0, 255), constrain((int)g, 0, 255), constrain((int)b, 0, 255));`)
    lines.push(`}`)
    lines.push(``)
  }

  if (needsWorley.v) {
    lines.push(`// Integer hash → [0,1) placing one feature point per cell (Worley noise).`)
    lines.push(`float _worleyHash(int x, int y) {`)
    lines.push(`  uint32_t h = (uint32_t)(x * 374761393) + (uint32_t)(y * 668265263);`)
    lines.push(`  h = (h ^ (h >> 13)) * 1274126177u;`)
    lines.push(`  return ((h ^ (h >> 16)) & 0xFFFFFF) / 16777216.0f;`)
    lines.push(`}`)
    lines.push(``)
  }

  // A ring's map is the composition pixel each LED reads, baked from the same
  // pure helper the live preview routes through, so the circle on the bench and
  // the circle in the preview are the same circle by construction.
  if (multipleOutputs) {
    for (const route of outputConfigs) {
      if (!route.ringMap) continue
      lines.push(`// Ring sample map for ${cppComment(route.label)} — render index per LED.`)
      lines.push(`const uint16_t _ringmap_${route.safeId}[${route.ringMap.length}] PROGMEM = { ${route.ringMap.join(',')} };`)
      lines.push(``)
    }
  } else if (ringMap) {
    lines.push(`// Ring sample map (LED index -> render index), baked from the ring's`)
    lines.push(`// LED count, start angle, and direction.`)
    lines.push(`const uint16_t _ringmap[RING_LEDS] PROGMEM = { ${ringMap.join(',')} };`)
    lines.push(``)
  }

  if (multipleOutputs) {
    for (const route of outputConfigs) {
      if (!route.xyTable) continue
      lines.push(`// Physical wiring map for ${cppComment(route.label)}.`)
      lines.push(`const uint16_t _xytable_${route.safeId}[${route.width * route.height}] PROGMEM = { ${route.xyTable.join(',')} };`)
      lines.push(`uint16_t XY_${route.safeId}(uint8_t x, uint8_t y) { return pgm_read_word(&_xytable_${route.safeId}[(uint16_t)y * ${route.width} + x]); }`)
      lines.push(``)
    }
  } else if (xyTable) {
    lines.push(`// Physical wiring map (grid index -> physical LED index), baked from`)
    lines.push(`// MatrixOutput's layout/serpentine/tile settings.`)
    lines.push(`const uint16_t _xytable[${width * height}] PROGMEM = { ${xyTable.join(',')} };`)
    lines.push(`uint16_t XY(uint8_t x, uint8_t y) { return pgm_read_word(&_xytable[(uint16_t)y * ${panelW} + x]); }`)
    lines.push(``)
  }

  if (audio) {
    lines.push(...audio.code)
    lines.push(``)
  }

  if (emitRtcHelpers) {
    lines.push(...rtcHelperCpp())
  }
  if (needsDs3231) {
    lines.push(...ds3231HelperCpp())
  }

  if (needsWifi) {
    lines.push(`// Shared Wi-Fi bootstrap for Art-Net receive / NTP clock sync.`)
    lines.push(`static bool _wifiInit = false;`)
    lines.push(`static uint32_t _wifiLastAttemptMs = 0;`)
    lines.push(`void _wifiEnsureConnected() {`)
    lines.push(`#if FLS_WIFI_SUPPORTED`)
    lines.push(`  if (!_wifiInit) {`)
    lines.push(`    WiFi.mode(WIFI_STA);`)
    lines.push(`#if defined(ESP32)`)
    lines.push(`    WiFi.setHostname(${networkCfg.hostname});`)
    lines.push(`#elif defined(ESP8266)`)
    lines.push(`    WiFi.hostname(${networkCfg.hostname});`)
    lines.push(`#endif`)
    if (!networkCfg.useDhcp && networkCfg.staticIp && networkCfg.staticGateway && networkCfg.staticSubnet) {
      lines.push(`    WiFi.config(${ipAddressExpr(networkCfg.staticIp)}, ${ipAddressExpr(networkCfg.staticGateway)}, ${ipAddressExpr(networkCfg.staticSubnet)}, ${ipAddressExpr(networkCfg.staticDns)});`)
    }
    lines.push(`    _wifiInit = true;`)
    lines.push(`  }`)
    lines.push(`  if (WiFi.status() == WL_CONNECTED) return;`)
    lines.push(`  uint32_t _wifiNow = millis();`)
    lines.push(`  if (_wifiNow - _wifiLastAttemptMs < 5000u) return;`)
    lines.push(`  _wifiLastAttemptMs = _wifiNow;`)
    lines.push(`  WiFi.begin(${networkCfg.ssid}, ${networkCfg.password});`)
    lines.push(`#endif`)
    lines.push(`}`)
    lines.push(`bool _wifiConnected() {`)
    lines.push(`#if FLS_WIFI_SUPPORTED`)
    lines.push(`  return WiFi.status() == WL_CONNECTED;`)
    lines.push(`#else`)
    lines.push(`  return false;`)
    lines.push(`#endif`)
    lines.push(`}`)
    lines.push(``)
  }

  lines.push(...customPaletteDeclarationsCpp(usedPalettes))
  lines.push(``)

  // File-scope code from Code nodes (helpers, persistent vars, palettes).
  if (globalLines.length) {
    lines.push(...globalLines)
  }

  lines.push(`void setup() {`)
  lines.push(...psramAllocs)
  lines.push(...pinSetupLines)
  lines.push(...setupLines)
  if (multipleOutputs) {
    for (const route of outputConfigs) {
      lines.push(...fastledSetupCpp(route.hardware, {
        dataPinMacro: `DATA_PIN_${route.safeId}`,
        clockPinMacro: `CLOCK_PIN_${route.safeId}`,
        brightness: null,
        ledCountMacro: String(route.ledTotal),
        ledsName: `leds_${route.safeId}`,
        controllerName: `controller_${route.safeId}`,
      }))
    }
    lines.push(`  FastLED.setBrightness(255);  // per-output brightness is applied while routing pixels`)
  } else if (isHub75) {
    lines.push(...hub75SetupCpp(hub75Hw!))
  } else {
    lines.push(...fastledSetupCpp(hw, (ss || ringMap) ? { ledCountMacro: physLeds } : {}))
  }
  // HUB75 has no FastLED CLEDController registered, so setMaxPowerInVoltsAndMilliamps
  // would have nothing to throttle.
  if (powerLimit && !isHub75) lines.push(`  FastLED.setMaxPowerInVoltsAndMilliamps(${volts}, ${milliamps});`)
  if (emitEngine) lines.push(`  setupAudio();`)
  lines.push(`}`)
  lines.push(``)

  lines.push(`void loop() {`)
  if (emitEngine) lines.push(`  updateAudio();`)
  if (needsT.v) lines.push(`  float t = millis() / 1000.0f;`)
  lines.push(...loopLines)
  if (multipleOutputs || !sorted.some((n) => n.data.nodeType === 'MatrixOutput')) {
    lines.push(`  FastLED.show();`)
  }
  lines.push(`  FastLED.delay(16);  // ~60 fps`)
  lines.push(`}`)

  return lines.join('\n')
}
