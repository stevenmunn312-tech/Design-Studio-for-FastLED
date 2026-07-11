import type { StudioNode, StudioEdge } from '../state/graphStore'
import type { GroupRegistry } from '../state/graphEvaluator'
import { asFont, textColumns } from '../state/font'
import { asAnimatedImage, asImage } from '../state/image'
import { polineStops16, hexToRgb } from '../state/polinePalette'
import { customPaletteDeclarationsCpp, paletteCppRef } from '../state/paletteCatalog'
import { audioFlowExpr } from '../state/audioFlowRange'
import { SPEED_MAX, SCALE_MAX, NOISE_SPEED_MAX, NOISE_SCALE_MAX, rateCpp } from '../state/speedRange'
import { denormalizeBeatParam } from '../audio/beatDetection'
import { inputClampRange, CHIPSET_OPTIONS, COLOR_ORDER_OPTIONS, CORRECTION_OPTIONS, SPI_CHIPSETS } from '../state/nodeLibrary'
import { CPP_SHIM_HELPERS, cppRewriteShims, usesShims } from '../state/fastledShims'
import { particleRadius } from '../state/particleScale'

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_')
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

// On-device audio engine for an INMP441 MEMS mic on ESP32: an I2S reader + a
// self-contained radix-2 FFT (no external library) that updates global
// _audioBass/_audioMids/_audioTreble (0–1, smoothed, optional AGC, and an
// adaptive noise gate) and a _audioBeat flag once per frame.
//
// The I2S code is emitted twice behind an ESP_IDF_VERSION gate: the new
// channel-based driver (driver/i2s_std.h) on IDF 5+ (Arduino core 3.x) and the
// legacy driver (driver/i2s.h) on older cores. This is not just politeness —
// FastLED 3.10's bundled audio framework links the *new* driver into every
// ESP32 binary, and IDF 5 aborts at boot ("i2s(legacy): CONFLICT!") if the
// legacy driver is linked alongside it, so on modern cores the legacy path
// must not even be compiled.
// NOTE: ESP32-only.
function audioEngineCpp(ws: number, sck: number, sd: number, channel: 'Left' | 'Right', gain: number, agc: boolean, threshold: number, attack: number, decay: number, serialDebug = false): string[] {
  const legacyFmt = channel === 'Right' ? 'I2S_CHANNEL_FMT_ONLY_RIGHT' : 'I2S_CHANNEL_FMT_ONLY_LEFT'
  const stdSlot = channel === 'Right' ? 'I2S_STD_SLOT_RIGHT' : 'I2S_STD_SLOT_LEFT'
  return [
    '// ── INMP441 I2S microphone + FFT (on-device audio reactivity) ───────────────',
    `#define MIC_WS   ${ws}`,
    `#define MIC_SCK  ${sck}`,
    `#define MIC_SD   ${sd}`,
    `#define MIC_GAIN  ${gain.toFixed(3)}f`,
    `#define MIC_AGC   ${agc ? 1 : 0}`,
    `#define MIC_NOISE_THRESHOLD ${threshold.toFixed(3)}f`,
    `#define MIC_NOISE_ATTACK     ${attack.toFixed(3)}f`,
    `#define MIC_NOISE_DECAY      ${decay.toFixed(3)}f`,
    `#define MIC_DEBUG ${serialDebug ? 1 : 0}   // print band levels to serial (~10×/sec)`,
    '#define AUDIO_N   512        // FFT size (power of two)',
    '#define AUDIO_SR  16000      // I2S sample rate (Hz)',
    'float _audioBass = 0, _audioMids = 0, _audioTreble = 0, _audioBpm = 120;',
    'bool  _audioBeat = false;',
    'static float _audioBeatFast = 0, _audioBeatSlow = 0, _audioBeatPrevFlux = 0, _audioBeatPrevPrevFlux = 0;',
    'static float _audioPrevSpectrum[32];',
    'static float _audioSpectrum[32];',
    'static bool _audioHavePrevSpectrum = false;',
    'static uint32_t _audioBeatLast = 0;',
    'static float _bassFloor = 0.02f, _midsFloor = 0.02f, _trebleFloor = 0.02f;',
    'static float _bassSmooth = 0, _midsSmooth = 0, _trebleSmooth = 0;',
    'static float _aRe[AUDIO_N], _aIm[AUDIO_N];',
    '',
    '// In-place iterative radix-2 FFT (Cooley–Tukey).',
    'void _audioFFT(float* re, float* im, int n) {',
    '  for (int i = 1, j = 0; i < n; i++) {',
    '    int bit = n >> 1;',
    '    for (; j & bit; bit >>= 1) j ^= bit;',
    '    j ^= bit;',
    '    if (i < j) { float tr = re[i]; re[i] = re[j]; re[j] = tr; float ti = im[i]; im[i] = im[j]; im[j] = ti; }',
    '  }',
    '  for (int len = 2; len <= n; len <<= 1) {',
    '    float ang = -2.0f * PI / len, wr = cos(ang), wi = sin(ang);',
    '    for (int i = 0; i < n; i += len) {',
    '      float cr = 1, ci = 0;',
    '      for (int k = 0; k < len / 2; k++) {',
    '        int a = i + k, b = i + k + len / 2;',
    '        float vr = re[b] * cr - im[b] * ci, vi = re[b] * ci + im[b] * cr;',
    '        re[b] = re[a] - vr; im[b] = im[a] - vi;',
    '        re[a] += vr;        im[a] += vi;',
    '        float ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;',
    '      }',
    '    }',
    '  }',
    '}',
    '',
    'float _audioNoiseGate(float raw, float& floor, float& smooth) {',
    '  floor = floor + (raw - floor) * (raw > floor ? 0.0025f : 0.03f);',
    '  floor = constrain(floor, 0.0f, 1.0f);',
    '  float gate = constrain(floor + MIC_NOISE_THRESHOLD, 0.0f, 1.0f);',
    '  float span = 1.0f - gate; if (span < 0.0001f) span = 0.0001f;',
    '  float target = raw > gate ? constrain((raw - gate) / span, 0.0f, 1.0f) : 0.0f;',
    '  float follow = target > smooth ? MIC_NOISE_ATTACK : MIC_NOISE_DECAY;',
    '  smooth = constrain(smooth + (target - smooth) * follow, 0.0f, 1.0f);',
    '  return smooth;',
    '}',
    '',
    '#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 0, 0)',
    '// New channel-based I2S driver (IDF 5 / Arduino core 3.x). The legacy',
    '// driver cannot coexist with FastLED 3.10\'s audio framework on IDF 5.',
    'static i2s_chan_handle_t _micChan = NULL;',
    'void setupAudio() {',
    '#if MIC_DEBUG',
    '  Serial.begin(115200);',
    '#endif',
    '  i2s_chan_config_t chanCfg = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_AUTO, I2S_ROLE_MASTER);',
    '  i2s_new_channel(&chanCfg, NULL, &_micChan);',
    '  i2s_std_config_t cfg = {',
    '    .clk_cfg  = I2S_STD_CLK_DEFAULT_CONFIG(AUDIO_SR),',
    '    .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_32BIT, I2S_SLOT_MODE_MONO),',
    '    .gpio_cfg = {',
    '      .mclk = I2S_GPIO_UNUSED,',
    '      .bclk = (gpio_num_t)MIC_SCK,',
    '      .ws   = (gpio_num_t)MIC_WS,',
    '      .dout = I2S_GPIO_UNUSED,',
    '      .din  = (gpio_num_t)MIC_SD,',
    '      .invert_flags = { .mclk_inv = false, .bclk_inv = false, .ws_inv = false },',
    '    },',
    '  };',
    `  cfg.slot_cfg.slot_mask = ${stdSlot};   // INMP441 outputs on the slot its L/R pin selects`,
    '  i2s_channel_init_std_mode(_micChan, &cfg);',
    '  i2s_channel_enable(_micChan);',
    '}',
    '#else',
    '// Legacy I2S driver (IDF 4 / Arduino core 2.x).',
    'void setupAudio() {',
    '#if MIC_DEBUG',
    '  Serial.begin(115200);',
    '#endif',
    '  i2s_config_t cfg = {',
    '    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),',
    '    .sample_rate = AUDIO_SR,',
    '    .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,',
    `    .channel_format = ${legacyFmt},`,
    '    .communication_format = I2S_COMM_FORMAT_STAND_I2S,',
    '    .intr_alloc_flags = 0,',
    '    .dma_buf_count = 4,',
    '    .dma_buf_len = 256,',
    '    .use_apll = false,',
    '    .tx_desc_auto_clear = false,',
    '    .fixed_mclk = 0',
    '  };',
    '  i2s_pin_config_t pins = { .bck_io_num = MIC_SCK, .ws_io_num = MIC_WS, .data_out_num = I2S_PIN_NO_CHANGE, .data_in_num = MIC_SD };',
    '  i2s_driver_install(I2S_NUM_0, &cfg, 0, NULL);',
    '  i2s_set_pin(I2S_NUM_0, &pins);',
    '}',
    '#endif',
    '',
    '// Read one block from the mic, FFT it, split into bass/mid/treble bands.',
    'void updateAudio() {',
    '  static int32_t raw[AUDIO_N];',
    '  size_t bytesRead = 0;',
    '#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 0, 0)',
    '  i2s_channel_read(_micChan, raw, sizeof(raw), &bytesRead, 20);   // timeout in ms',
    '#else',
    '  i2s_read(I2S_NUM_0, raw, sizeof(raw), &bytesRead, 20 / portTICK_PERIOD_MS);',
    '#endif',
    '  int got = bytesRead / sizeof(int32_t);',
    '  for (int i = 0; i < AUDIO_N; i++) {',
    '    float s = (i < got) ? (float)(raw[i] >> 8) / 8388608.0f : 0.0f;   // 24-bit sample',
    '    float w = 0.5f - 0.5f * cos(2.0f * PI * i / (AUDIO_N - 1));        // Hann window',
    '    _aRe[i] = s * w; _aIm[i] = 0;',
    '  }',
    '  _audioFFT(_aRe, _aIm, AUDIO_N);',
    '  float binHz = (float)AUDIO_SR / AUDIO_N;',
    '  float bass = 0, mids = 0, treble = 0; int nb = 0, nm = 0, nt = 0;',
    '  for (int i = 1; i < AUDIO_N / 2; i++) {',
    '    float mag = sqrtf(_aRe[i] * _aRe[i] + _aIm[i] * _aIm[i]);',
    '    float hz = i * binHz;',
    '    if (hz < 250)       { bass   += mag; nb++; }',
    '    else if (hz < 2000) { mids   += mag; nm++; }',
    '    else                { treble += mag; nt++; }',
    '  }',
    '  if (nb) bass /= nb; if (nm) mids /= nm; if (nt) treble /= nt;',
    '  static float mx = 0.0001f;                  // slow auto-gain (running peak)',
    '  float peak = max(bass, max(mids, treble));',
    '  if (MIC_AGC) {',
    '    mx = (peak > mx) ? peak : (mx * 0.999f + peak * 0.001f);',
    '    if (mx < 0.0001f) mx = 0.0001f;',
    '  } else {',
    '    mx = 1.0f;',
    '  }',
    '  float agcGain = MIC_GAIN * (MIC_AGC ? (1.0f / mx) : 1.0f);',
    '  _audioBass   = _audioNoiseGate(constrain(bass   * agcGain, 0.0f, 1.0f), _bassFloor, _bassSmooth);',
    '  _audioMids   = _audioNoiseGate(constrain(mids   * agcGain, 0.0f, 1.0f), _midsFloor, _midsSmooth);',
    '  _audioTreble = _audioNoiseGate(constrain(treble * agcGain, 0.0f, 1.0f), _trebleFloor, _trebleSmooth);',
    '  for (int band = 0; band < 32; band++) {',
    '    float t0 = (float)band / 32.0f;',
    '    float t1 = (float)(band + 1) / 32.0f;',
    '    float hz0 = 30.0f * powf(12000.0f / 30.0f, t0);',
    '    float hz1 = 30.0f * powf(12000.0f / 30.0f, t1);',
    '    int startBin = max(1, (int)floorf(hz0 / binHz));',
    '    int endBin = min(AUDIO_N / 2 - 1, max(startBin, (int)ceilf(hz1 / binHz)));',
    '    float acc = 0.0f;',
    '    int count = 0;',
    '    for (int i = startBin; i <= endBin; i++) {',
    '      float mag = sqrtf(_aRe[i] * _aRe[i] + _aIm[i] * _aIm[i]);',
      '      acc += constrain(mag * agcGain, 0.0f, 1.0f);',
    '      count++;',
    '    }',
    '    _audioSpectrum[band] = count > 0 ? constrain(acc / count, 0.0f, 1.0f) : 0.0f;',
    '  }',
    '  _audioBeat = false;',
    '  if (_audioHavePrevSpectrum) {',
    '    float flux = 0.0f;',
    '    float weightSum = 0.0f;',
    '    for (int i = 0; i < 32; i++) {',
    '      float diff = _audioSpectrum[i] - _audioPrevSpectrum[i];',
    '      if (diff < 0.0f) diff = 0.0f;',
    '      float weight = i < 6 ? 2.0f : (i < 12 ? 1.35f : (i < 20 ? 0.85f : 0.45f));',
    '      flux += diff * weight;',
    '      weightSum += weight;',
    '    }',
    '    flux = weightSum > 0.0f ? flux / weightSum : 0.0f;',
    '    _audioBeatFast += (flux - _audioBeatFast) * 0.45f;',
    '    _audioBeatSlow += (flux - _audioBeatSlow) * 0.13f;',
    '    float onset = _audioBeatFast - _audioBeatSlow;',
    '    float baseline = _audioBeatSlow > 0.02f ? _audioBeatSlow : 0.02f;',
    '    float contrast = onset / baseline;',
    '    uint32_t now = millis();',
    '    float gap = _audioBpm > 0.0f ? 60000.0f / _audioBpm * 0.42f : 160.0f;',
    '    if (gap < 160.0f) gap = 160.0f; else if (gap > 600.0f) gap = 600.0f;',
    '    bool isPeak = flux > _audioBeatPrevFlux && _audioBeatPrevFlux >= _audioBeatPrevPrevFlux;',
    '    _audioBeat = (flux > 0.07f && isPeak && onset > 0.07f * 0.45f && contrast > 1.1f && (_audioBeatLast == 0 || now - _audioBeatLast >= (uint32_t)gap));',
    '    if (_audioBeat) {',
    '      if (_audioBeatLast != 0) {',
    '        float interval = now - _audioBeatLast;',
    '        if (interval >= 220.0f && interval <= 1800.0f) {',
    '          float instant = 60000.0f / interval;',
    '          _audioBpm = _audioBpm * 0.65f + instant * 0.35f;',
    '        }',
    '      }',
    '      _audioBeatLast = now;',
    '    }',
    '    _audioBeatPrevPrevFlux = _audioBeatPrevFlux;',
    '    _audioBeatPrevFlux = flux;',
    '  }',
    '  for (int i = 0; i < 32; i++) _audioPrevSpectrum[i] = _audioSpectrum[i];',
    '  _audioHavePrevSpectrum = true;',
    '#if MIC_DEBUG',
    '  { static uint32_t _dbgLast = 0;',
    '    if (millis() - _dbgLast >= 100) { _dbgLast = millis();',
    '      // pk = largest raw 24-bit sample this block (pre-gate, pre-gain):',
    '      // ~0 means the I2S slot is silent (wiring/L-R); big-but-bands-0.00',
    '      // means the mic works and the noise gate/gain needs tuning.',
    '      int32_t _pk = 0;',
    '      for (int i = 0; i < got; i++) { int32_t v = raw[i] >> 8; if (v < 0) v = -v; if (v > _pk) _pk = v; }',
    '      Serial.printf("audio bass=%.2f mids=%.2f treble=%.2f beat=%d bpm=%.0f raw=%d pk=%ld\\n",',
    '                    _audioBass, _audioMids, _audioTreble, (int)_audioBeat, _audioBpm, got, (long)_pk); } }',
    '#endif',
    '}',
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
    chipset:    pick(p.chipset, CHIPSET_OPTIONS, 'WS2812B'),
    colorOrder: pick(p.colorOrder, COLOR_ORDER_OPTIONS, 'GRB'),
    brightness: Math.round(num(p.brightness, 200, 0, 255)),
    correction: pick(p.correction, CORRECTION_OPTIONS, 'none'),
    dither:     p.dither !== false,
    overclock:  num(p.overclock, 1, 1, 2),
    clockPin:   Math.round(num(p.clockPin, 6, 0, 48)),
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
  opts: { dataPinMacro?: string; clockPinMacro?: string; brightness?: number | null; ledCountMacro?: string } = {},
): string[] {
  const data = opts.dataPinMacro ?? 'DATA_PIN'
  const clock = opts.clockPinMacro ?? 'CLOCK_PIN'
  // Physical strip length — differs from the render buffer's NUM_LEDS when the
  // sketch supersamples (renders large, then downscales into `leds`).
  const count = opts.ledCountMacro ?? 'NUM_LEDS'
  const chip = hw.chipset === 'SK6812-RGBW' ? 'SK6812' : hw.chipset
  const rgbw = hw.chipset === 'SK6812-RGBW' ? '.setRgbw(RgbwDefault())' : ''
  const pins = SPI_CHIPSETS.has(hw.chipset) ? `${data}, ${clock}` : data
  // FastLED's NEOPIXEL alias hardcodes GRB and takes no order template arg.
  const args = chip === 'NEOPIXEL' ? `${pins}` : `${pins}, ${hw.colorOrder}`
  const lines = [`  FastLED.addLeds<${chip}, ${args}>(leds, ${count})${rgbw};`]
  const brightness = opts.brightness === undefined ? hw.brightness : opts.brightness
  if (brightness !== null) lines.push(`  FastLED.setBrightness(${brightness});`)
  if (hw.correction !== 'none') lines.push(`  FastLED.setCorrection(${hw.correction});`)
  if (!hw.dither) lines.push(`  FastLED.setDither(DISABLE_DITHER);`)
  return lines
}

/**
 * The on-device audio engine (INMP441 I2S reader + FFT) for a graph that
 * contains a MicInput, so a *controller* sketch (e.g. the generative pattern
 * show) can host the engine once while the render functions it compiles from
 * subgraphs reference the `_audioBass`/`_audioMids`/`_audioTreble`/`_audioBeat`
 * globals. Returns null when the graph has no MicInput. Mirrors the block
 * generateCpp inlines for a mic-bearing single-pattern sketch.
 */
export function audioEngineForGraph(nodes: StudioNode[]): { include: string; code: string[] } | null {
  const micNode = nodes.find((n) => n.data.nodeType === 'MicInput')
  if (!micNode) return null
  const p = micNode.data.properties as Record<string, unknown>
  const ic = (v: unknown, d: number, min: number, max: number) => {
    const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : d
  }
  const fc = (v: unknown, d: number, min: number, max: number) => {
    const n = Number(v); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : d
  }
  const channel: 'Left' | 'Right' = String(p.channel ?? 'Left') === 'Right' ? 'Right' : 'Left'
  return {
    include: [
      `// INMP441 I2S microphone (ESP32) — new driver on IDF 5+ (the legacy one`,
      `// conflicts with FastLED 3.10's audio framework there), legacy before.`,
      `#include <esp_idf_version.h>`,
      `#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 0, 0)`,
      `#include <driver/i2s_std.h>`,
      `#else`,
      `#include <driver/i2s.h>`,
      `#endif`,
    ].join('\n'),
    code: audioEngineCpp(
      ic(p.i2sWs, 39, 0, 48), ic(p.i2sSck, 40, 0, 48), ic(p.i2sSd, 41, 0, 48), channel,
      fc(p.gain, 1, 0, 4), Boolean(p.agc), fc(p.threshold, 0.08, 0, 1), fc(p.attack, 0.2, 0, 1), fc(p.decay, 0.05, 0, 1),
      p.serialDebug === true,
    ),
  }
}

export function generateCpp(
  nodes: StudioNode[], edges: StudioEdge[], groups: GroupRegistry = {},
  // `externalAudio`: the host sketch already provides the audio-engine globals
  // (used when compiling a pattern subgraph into a controller that hosts the
  // engine), so FFTAnalyzer/BeatDetect reference them without re-emitting it.
  // `psramAllowed`: gate for the MatrixOutput `usePsram` property — the upload
  // UI passes false when the selected board has no PSRAM support, so a stale
  // toggle can't emit ESP32-only allocation calls into an AVR/RP2040 sketch.
  opts: { externalAudio?: boolean; groupInputExprs?: Record<string, string>; psramAllowed?: boolean } = {},
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

  const outputNode = nodes.find((n) => n.data.nodeType === 'MatrixOutput')
  const props = (n: StudioNode) => n.data.properties as Record<string, unknown>

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
  const width      = intProp(outputNode ? props(outputNode).width   : undefined, 16, 1, 64)
  const height     = intProp(outputNode ? props(outputNode).height  : undefined, 16, 1, 64)
  const dataPin    = intProp(outputNode ? props(outputNode).dataPin : undefined, 5, 0, 48)
  // Chipset, colour order, master brightness, correction, dithering, overclock
  // — sanitised centrally (shared with the show/player generators).
  const hw = ledHardwareFromProps(outputNode ? props(outputNode) : {})
  // Serpentine (zig-zag) matrices wire alternate rows in reverse; buffers stay
  // row-major and MatrixOutput remaps grid → physical index via XY().
  const serpentine = (outputNode ? props(outputNode).serpentine : false) === true
  // Supersample: render every buffer at SS× the panel resolution (so WIDTH/
  // HEIGHT/NUM_LEDS become the render size) and average each SS×SS block down
  // into the physical `leds` (PANEL_LEDS) at MatrixOutput. 1 = off (unchanged
  // output). 2× only for now, matching the preview.
  const supersample = (outputNode ? props(outputNode).supersample : false) === true ? 2 : 1
  const ss = supersample > 1
  // Physical strip length + panel width for the XY map (differ from the render
  // NUM_LEDS/WIDTH only when supersampling).
  const physLeds = ss ? 'PANEL_LEDS' : 'NUM_LEDS'
  const panelW = ss ? 'PANEL_W' : 'WIDTH'
  // Optional power cap (FastLED.setMaxPowerInVoltsAndMilliamps) — dims globally
  // to keep the PSU draw under a limit so a big matrix can't brown out the board.
  const powerLimit = (outputNode ? props(outputNode).powerLimit : false) === true
  const volts      = intProp(outputNode ? props(outputNode).volts     : undefined, 5, 1, 60)
  const milliamps  = intProp(outputNode ? props(outputNode).milliamps : undefined, 2000, 100, 100000)
  // Per-node render buffers in external PSRAM (ESP32 family; see PSRAM_ALLOC_CPP).
  const usePsram = opts.psramAllowed !== false && (outputNode ? props(outputNode).usePsram : false) === true

  // A MicInput node turns on the on-device audio engine (INMP441 over I2S + FFT);
  // its pins/channel configure the generated I2S reader. `emitEngine` means this
  // sketch hosts the engine itself; `useAudioGlobals` means FFTAnalyzer/BeatDetect
  // resolve to the live band levels (either because we host the engine, or a
  // controller does — `externalAudio`) instead of placeholder constants.
  const audio = audioEngineForGraph(nodes)
  const emitEngine = !!audio
  const useAudioGlobals = emitEngine || !!opts.externalAudio

  const sorted = topoSort(nodes, edges)

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

  function colorExpr(nodeId: string, portId: string): string {
    const up = incoming.get(`${nodeId}:${portId}`)
    if (up) return `n_${safeId(up.srcId)}_${up.srcPort}`
    return 'CRGB::Black'
  }

  // Resolve a palette name to its FastLED preset palette constant.
  function fastledPalette(name: string): string {
    return paletteCppRef(name.toLowerCase())
  }

  // Resolve the FastLED palette constant for a palette-consuming port: follow a
  // connected PaletteSelector/PaletteBlend back to its chosen palette, otherwise
  // fall back to the node's own `palette` property. (PaletteBlend resolves to its
  // base palette A; runtime blending is left as a generated comment.)
  function paletteExpr(nodeId: string, portId: string, nodeProps: Record<string, unknown>): string {
    const up = incoming.get(`${nodeId}:${portId}`)
    if (up) {
      const src = nodeMap.get(up.srcId)
      if (src) {
        // CustomPalette and PaletteBlend build a runtime CRGBPalette16 (see
        // their emit cases); reference it by name. A palette-role GroupInput
        // (collection-show codegen) likewise resolves to its `pal_<id>` copy of
        // the render_pN palette param.
        if (src.data.nodeType === 'CustomPalette' || src.data.nodeType === 'PaletteBlend' || src.data.nodeType === 'Poline') return `pal_${safeId(up.srcId)}`
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
  // File-scope lines contributed by Code nodes (helpers, persistent vars, etc.),
  // emitted between the buffer declarations and setup().
  const globalLines: string[] = []
  const needsMapFloat: boolean[] = [false]
  const needsWorley = { v: false }
  const needsKelvin = { v: false }
  const needsT = { v: false }
  const needsShims = { v: false }
  const needsXyMap = { v: false }
  // Frame-producing nodes each render into their own CRGB buffer, so multiple
  // layers can coexist and be composited. Collected here, declared as globals.
  const frameBufs = new Set<string>()
  // Field-producing nodes (FieldFormula …) render into a parallel float buffer.
  const fieldBufs = new Set<string>()

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

    switch (type) {
      case 'TimeNode':
        needsT.v = true
        ln(`  float ${v('time')} = t;`)
        ln(`  float ${v('dt')} = 0.016f;`)
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
        ln(`  float ${v('result')} = mapFloat(${f('value', 'value', 0)}, ${f('inMin', 'inMin', 0)}, ${f('inMax', 'inMax', 1)}, ${Number(p.outMin ?? 0)}, ${Number(p.outMax ?? 1)});`)
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

      // Easing curve on a 0–1 value via FastLED lib8tion. Keep the branch map in
      // sync with `applyEase` in graphEvaluator.ts.
      case 'Ease': {
        const type = String(p.easeType ?? 'inOutCubic')
        const fn = type === 'inOutQuad' ? 'ease8InOutQuad'
          : type === 'triwave' ? 'triwave8'
          : type === 'quadwave' ? 'quadwave8'
          : type === 'cubicwave' ? 'cubicwave8'
          : 'ease8InOutCubic'
        ln(`  float ${v('result')} = ${fn}((uint8_t)(constrain(${f('t', 't', 0)}, 0.0f, 1.0f) * 255)) / 255.0f;`)
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

      case 'HSVToRGB':
        ln(`  CRGB ${v('color')} = CHSV((uint8_t)((${f('h', 'h', 0)}) / 360.0f * 255), (uint8_t)((${f('s', 's', 1)}) * 255), (uint8_t)((${f('v', 'v', 1)}) * 255));`)
        break

      // The inverse of HSVToRGB — via FastLED's rgb2hsv_approximate.
      case 'RGBToHSV': {
        const rgb = colorExpr(node.id, 'rgb')
        ln(`  CHSV _hsv_${id} = rgb2hsv_approximate(${rgb});`)
        ln(`  float ${v('h')} = _hsv_${id}.hue / 255.0f * 360.0f;`)
        ln(`  float ${v('s')} = _hsv_${id}.sat / 255.0f;`)
        ln(`  float ${v('v')} = _hsv_${id}.val / 255.0f;`)
        break
      }

      case 'Temperature':
        needsKelvin.v = true
        ln(`  CRGB ${v('color')} = kelvinToRGB(${f('kelvin', 'kelvin', 4000)});`)
        break

      case 'HeatColor':
        ln(`  CRGB ${v('color')} = HeatColor((uint8_t)(constrain(${f('heat', 'heat', 0.5)}, 0.0f, 1.0f) * 255));`)
        break

      case 'BlendColors': {
        const ca = colorExpr(node.id, 'a')
        const cb = colorExpr(node.id, 'b')
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
        const bass = useAudioGlobals ? '_audioBass' : '0.5f'
        const mids = useAudioGlobals ? '_audioMids' : '0.5f'
        const treble = useAudioGlobals ? '_audioTreble' : '0.5f'
        if (!useAudioGlobals) ln(`  // FFTAnalyzer — add a Microphone node to drive these from the INMP441`)
        ln(`  float ${v('bass')}_target = constrain(${bass} * ${gain.toFixed(3)}f, 0.0f, 1.0f), ${v('mids')}_target = constrain(${mids} * ${midsGain.toFixed(3)}f, 0.0f, 1.0f), ${v('treble')}_target = constrain(${treble} * ${trebleGain.toFixed(3)}f, 0.0f, 1.0f);`)
        ln(`  static float ${v('bass')}_smooth = -1, ${v('mids')}_smooth = -1, ${v('treble')}_smooth = -1;`)
        ln(`  ${v('bass')}_smooth = ${v('bass')}_smooth < 0 ? ${v('bass')}_target : ${v('bass')}_smooth * ${smoothing.toFixed(3)}f + ${v('bass')}_target * ${(1 - smoothing).toFixed(3)}f;`)
        ln(`  ${v('mids')}_smooth = ${v('mids')}_smooth < 0 ? ${v('mids')}_target : ${v('mids')}_smooth * ${smoothing.toFixed(3)}f + ${v('mids')}_target * ${(1 - smoothing).toFixed(3)}f;`)
        ln(`  ${v('treble')}_smooth = ${v('treble')}_smooth < 0 ? ${v('treble')}_target : ${v('treble')}_smooth * ${smoothing.toFixed(3)}f + ${v('treble')}_target * ${(1 - smoothing).toFixed(3)}f;`)
        ln(`  float ${v('bass')} = ${v('bass')}_smooth, ${v('mids')} = ${v('mids')}_smooth, ${v('treble')} = ${v('treble')}_smooth;`)
        break
      }

      case 'BeatDetect': {
        if (useAudioGlobals) {
          const threshold = denormalizeBeatParam('threshold', floatProp(p.threshold, 0.2, 0, 1))
          const attack = denormalizeBeatParam('attack', floatProp(p.attack, 0.55, 0, 1))
          const decay = denormalizeBeatParam('decay', floatProp(p.decay, 0.25, 0, 1))
          const prefix = v('detector')
          ln(`  bool ${v('beat')} = false;`)
          ln(`  static float ${v('bpm')} = 120.0f, ${prefix}_fast = 0.0f, ${prefix}_slow = 0.0f, ${prefix}_prevFlux = 0.0f, ${prefix}_prevPrevFlux = 0.0f;`)
          ln(`  static float ${prefix}_prevSpectrum[32]; static bool ${prefix}_ready = false; static uint32_t ${prefix}_lastBeat = 0;`)
          ln(`  if (${prefix}_ready) {`)
          ln(`    float _flux = 0.0f, _weightSum = 0.0f;`)
          ln(`    for (int _i = 0; _i < 32; _i++) {`)
          ln(`      float _diff = _audioSpectrum[_i] - ${prefix}_prevSpectrum[_i]; if (_diff < 0.0f) _diff = 0.0f;`)
          ln(`      float _weight = _i < 6 ? 2.0f : (_i < 12 ? 1.35f : (_i < 20 ? 0.85f : 0.45f)); _flux += _diff * _weight; _weightSum += _weight;`)
          ln(`    }`)
          ln(`    _flux = _weightSum > 0.0f ? _flux / _weightSum : 0.0f;`)
          ln(`    ${prefix}_fast += (_flux - ${prefix}_fast) * ${attack.toFixed(4)}f;`)
          ln(`    ${prefix}_slow += (_flux - ${prefix}_slow) * ${decay.toFixed(4)}f;`)
          ln(`    float _onset = ${prefix}_fast - ${prefix}_slow, _baseline = ${prefix}_slow > 0.02f ? ${prefix}_slow : 0.02f;`)
          ln(`    float _gap = constrain(60000.0f / ${v('bpm')} * 0.42f, 150.0f, 600.0f); uint32_t _now = millis();`)
          ln(`    bool _peak = _flux > ${prefix}_prevFlux && ${prefix}_prevFlux >= ${prefix}_prevPrevFlux;`)
          ln(`    ${v('beat')} = _flux > ${threshold.toFixed(4)}f && _peak && _onset > ${(threshold * 0.45).toFixed(4)}f && _onset / _baseline > 1.1f && (${prefix}_lastBeat == 0 || _now - ${prefix}_lastBeat >= (uint32_t)_gap);`)
          ln(`    if (${v('beat')}) { if (${prefix}_lastBeat != 0) { float _interval = _now - ${prefix}_lastBeat; if (_interval >= 220.0f && _interval <= 1800.0f) ${v('bpm')} = ${v('bpm')} * 0.65f + (60000.0f / _interval) * 0.35f; } ${prefix}_lastBeat = _now; }`)
          ln(`    ${prefix}_prevPrevFlux = ${prefix}_prevFlux; ${prefix}_prevFlux = _flux;`)
          ln(`  }`)
          ln(`  for (int _i = 0; _i < 32; _i++) ${prefix}_prevSpectrum[_i] = _audioSpectrum[_i]; ${prefix}_ready = true;`)
        } else {
          ln(`  // BeatDetect — add a Microphone node for on-device beat detection`)
          ln(`  bool ${v('beat')} = false; float ${v('bpm')} = 120.0f;`)
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
        ln(`  // MicInput — INMP441 I2S audio is read once per frame by updateAudio()`)
        ln(`  // The source gain, AGC toggle, and adaptive noise gate come from the MicInput sliders.`)
        break

      case 'ButtonInput': {
        const pin = Number(p.pin ?? 0)
        pinSetupLines.add(`  pinMode(${pin}, ${p.pullup === false ? 'INPUT' : 'INPUT_PULLUP'});`)
        ln(`  bool ${v('pressed')} = digitalRead(${pin}) == LOW;`)
        break
      }

      case 'PotInput':
        ln(`  float ${v('value')} = analogRead(${Number(p.pin ?? 34)}) / 4095.0f;`)
        break

      // Polling quadrature decode (no interrupts) via a standard 4x lookup
      // table; `position` is an unbounded running count.
      case 'EncoderInput': {
        const pinA = Number(p.pinA ?? 32), pinB = Number(p.pinB ?? 33), pinSW = Number(p.pinSW ?? 25)
        const mode = p.pullup === false ? 'INPUT' : 'INPUT_PULLUP'
        for (const pin of [pinA, pinB, pinSW]) pinSetupLines.add(`  pinMode(${pin}, ${mode});`)
        ln(`  static int8_t _encLast_${id} = 0; static float _encPos_${id} = 0;`)
        ln(`  { int8_t _a=digitalRead(${pinA}),_b=digitalRead(${pinB}); int8_t _s=(_a<<1)|_b;`)
        ln(`    static const int8_t _encTbl_${id}[16]={0,-1,1,0, 1,0,0,-1, -1,0,0,1, 0,1,-1,0};`)
        ln(`    _encPos_${id}+=_encTbl_${id}[(_encLast_${id}<<2)|_s]; _encLast_${id}=_s; }`)
        ln(`  float ${v('position')} = _encPos_${id};`)
        ln(`  bool ${v('pressed')} = digitalRead(${pinSW}) == LOW;`)
        break
      }

      case 'SolidColor': {
        const ob = ownBuf()
        const r = Number(p.r ?? 255), g = Number(p.g ?? 0), b = Number(p.b ?? 128)
        ln(`  fill_solid(${ob}, NUM_LEDS, CRGB(${r}, ${g}, ${b}));`)
        break
      }

      case 'Circle': {
        const ob = ownBuf()
        const colorE = incoming.get(`${node.id}:color`)
          ? colorExpr(node.id, 'color')
          : `CRGB(${Number(p.r ?? 255)}, ${Number(p.g ?? 0)}, ${Number(p.b ?? 128)})`
        const cx = Number(p.cx ?? 8), cy = Number(p.cy ?? 8), rad = Number(p.radius ?? 4)
        ln(`  { ${seedFrom('base')}`)
        ln(`    int _x0 = max(0, (int)floorf(${cx} - ${rad} - 1.5f)), _x1 = min(WIDTH - 1, (int)ceilf(${cx} + ${rad} + 1.5f));`)
        ln(`    int _y0 = max(0, (int)floorf(${cy} - ${rad} - 1.5f)), _y1 = min(HEIGHT - 1, (int)ceilf(${cy} + ${rad} + 1.5f));`)
        ln(`    for (int _y = _y0; _y <= _y1; _y++) for (int _x = _x0; _x <= _x1; _x++) {`)
        ln(`      float _dx = (_x + 0.5f) - ${cx}, _dy = (_y + 0.5f) - ${cy}, _d = sqrtf(_dx * _dx + _dy * _dy);`)
        if (p.filled) ln(`      float _cov = constrain(${rad} + 0.5f - _d, 0.0f, 1.0f);`)
        else ln(`      float _cov = constrain(0.5f - fabsf(_d - ${rad}), 0.0f, 1.0f);`)
        ln(`      if (_cov <= 0.0f) continue; CRGB _add = ${colorE}; _add.nscale8((uint8_t)(_cov * 255.0f)); ${ob}[_y * WIDTH + _x] += _add; } }`)
        break
      }

      case 'Line': {
        const ob = ownBuf()
        const colorE = incoming.get(`${node.id}:color`)
          ? colorExpr(node.id, 'color')
          : `CRGB(${Number(p.r ?? 0)}, ${Number(p.g ?? 200)}, ${Number(p.b ?? 255)})`
        const x1 = Number(p.x1 ?? 0), y1 = Number(p.y1 ?? 0)
        const x2 = Number(p.x2 ?? 0), y2 = Number(p.y2 ?? 0)
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
        const fl = (value: number) => `${Number.isInteger(value) ? value.toFixed(1) : value}f`
        const hexCrgb = (hex: unknown, def: number) => {
          const m = /^#([0-9a-f]{6})$/i.exec(String(hex))
          const n = m ? parseInt(m[1], 16) : def
          return `CRGB(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
        }
        const shape = ['rect', 'ellipse'].includes(String(p.shape)) ? String(p.shape) : 'polygon'
        const cx = Number(p.cx ?? 8), cy = Number(p.cy ?? 8)
        const size = Math.max(0.5, Number(p.size ?? 6))
        const aspect = shape === 'polygon' ? 1 : Math.max(0.01, Number(p.aspect ?? 1))
        const rot = Number(p.rotation ?? 0)
        const thick = Math.max(0, Number(p.thickness ?? 1.5))
        const filled = (p.filled ?? true) !== false
        const ax = size * aspect, ay = size
        const reach = Math.sqrt(ax * ax + ay * ay) + thick / 2 + 1
        const bx0 = Math.max(0, Math.floor(cx - reach)), bx1 = Math.min(width - 1, Math.ceil(cx + reach))
        const by0 = Math.max(0, Math.floor(cy - reach)), by1 = Math.min(height - 1, Math.ceil(cy + reach))
        const fillE = incoming.get(`${node.id}:fill`) ? colorExpr(node.id, 'fill') : hexCrgb(p.fill, 0xff3080)
        const edgeE = incoming.get(`${node.id}:edge`) ? colorExpr(node.id, 'edge') : hexCrgb(p.edge, 0x00e0ff)
        ln(`  { ${seedFrom('base')}`)
        ln(`    float _cx=${fl(cx)},_cy=${fl(cy)},_ra=${fl(-rot)}*0.01745329f,_cr=cosf(_ra),_sr=sinf(_ra);`)
        ln(`    CRGB _fill=${fillE},_edge=${edgeE};`)
        if (shape === 'polygon') ln(`    float _n=max(3.0f,(float)(${f('sides', 'sides', 5)})); int _nlo=(int)floorf(_n); float _fr=_n-_nlo;`)
        ln(`    for(int _y=${by0};_y<=${by1};_y++) for(int _x=${bx0};_x<=${bx1};_x++){`)
        ln(`      float _dx=(_x+0.5f)-_cx,_dy=(_y+0.5f)-_cy,_lx=_dx*_cr-_dy*_sr,_ly=_dx*_sr+_dy*_cr,_sd;`)
        if (shape === 'rect') {
          ln(`      float _qx=fabsf(_lx)-${fl(ax)},_qy=fabsf(_ly)-${fl(ay)},_mx=max(_qx,0.0f),_my=max(_qy,0.0f);`)
          ln(`      _sd=sqrtf(_mx*_mx+_my*_my)+min(max(_qx,_qy),0.0f);`)
        } else if (shape === 'ellipse') {
          ln(`      float _ex=_lx/${fl(ax)},_ey=_ly/${fl(ay)}; _sd=(sqrtf(_ex*_ex+_ey*_ey)-1.0f)*${fl(Math.min(ax, ay))};`)
        } else {
          ln(`      float _r=sqrtf(_lx*_lx+_ly*_ly),_pa=atan2f(_ly,_lx);`)
          ln(`      float _s0=6.2831853f/_nlo,_a0=fmodf(fmodf(_pa,_s0)+_s0,_s0)-_s0*0.5f,_sdl=_r-${fl(size)}*cosf(3.14159265f/_nlo)/cosf(_a0),_sd2=_sdl;`)
          ln(`      if(_fr>0.0f){ float _s1=6.2831853f/(_nlo+1),_a1=fmodf(fmodf(_pa,_s1)+_s1,_s1)-_s1*0.5f; _sd2=_r-${fl(size)}*cosf(3.14159265f/(_nlo+1))/cosf(_a1); }`)
          ln(`      _sd=_sdl*(1.0f-_fr)+_sd2*_fr;`)
        }
        ln(`      float _fc=${filled ? 'constrain(0.5f-_sd,0.0f,1.0f)' : '0.0f'};`)
        ln(`      float _ec=${thick > 0 ? `constrain(${fl(thick * 0.5)}+0.5f-fabsf(_sd),0.0f,1.0f)` : '0.0f'};`)
        ln(`      float _al=max(_fc,_ec); if(_al<=0.0f) continue;`)
        ln(`      CRGB _col=_fill; nblend(_col,_edge,(uint8_t)(_ec*255.0f)); nblend(${ob}[_y*WIDTH+_x],_col,(uint8_t)(_al*255.0f)); } }`)
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
        const fl = (value: number) => `${Number.isInteger(value) ? value.toFixed(1) : value}f`
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
        ln(`    float _rad = max(0.25f, ${fl(thickness)} * 0.5f);`)
        ln(`    float _ext = max(0.0f, min((float)WIDTH, (float)HEIGHT) * 0.5f * ${fl(scale)} - _rad);`)
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

      case 'Text': {
        const ob = ownBuf()
        const text = String(p.text ?? 'HELLO')
        const font = asFont(p.font)
        const cols = textColumns(text, font)
        const sx = Math.floor(Number(p.x ?? 0)), sy = Math.floor(Number(p.y ?? 0))
        const dynamic = !!incoming.get(`${node.id}:scroll`) || Number(p.scroll ?? 0) !== 0
        const colorE = incoming.get(`${node.id}:color`)
          ? colorExpr(node.id, 'color')
          : `CRGB(${Number(p.r ?? 0)}, ${Number(p.g ?? 255)}, ${Number(p.b ?? 255)})`
        ln(`  { // Text "${text.replace(/[^ -~]/g, '?')}"`)
        ln(`    static const uint8_t _txt_${id}[] = {${cols.join(',')}};`)
        ln(`    const int _tn_${id} = ${cols.length};`)
        ln(`    fill_solid(${ob}, NUM_LEDS, CRGB::Black);`)
        if (dynamic) {
          needsT.v = true
          ln(`    int _tot = _tn_${id} + WIDTH, _off = (((int)(t * (${f('scroll', 'scroll', 0)})) % _tot) + _tot) % _tot;`)
        } else {
          ln(`    int _off = 0;`)
        }
        ln(`    for (int _x = 0; _x < WIDTH; _x++) { int _ci = _x - ${sx} + _off; if (_ci < 0 || _ci >= _tn_${id}) continue; uint8_t _col = _txt_${id}[_ci];`)
        ln(`      for (int _r = 0; _r < ${font.h}; _r++) if (_col & (1 << _r)) { int _yy = ${sy} + _r; if (_yy >= 0 && _yy < HEIGHT) ${ob}[_yy * WIDTH + _x] = ${colorE}; } }`)
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
        const pal = paletteExpr(node.id, 'paletteIn', p)
        switch (noiseType) {
          case 'simplex':
            ln(`  { // Simplex2D`)
            ln(`    float _spd=${speed},_sc=${scale};`)
            ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
            ln(`      float _n=sin(_x*_sc+sin(_y*_sc*0.8f+t*_spd*0.5f)+t*_spd)`)
            ln(`            +0.5f*sin(_x*_sc*2+t*_spd*1.9f)+0.25f*sin(_x*_sc*4+t*_spd*4.1f);`)
            ln(`      ${of}[_y*WIDTH+_x]=constrain(_n*0.25f+0.5f,0.0f,1.0f);}}`)
            break
          case 'noise3d':
            ln(`  { // Noise3D`)
            ln(`    float _spd=${speed},_sc=${scale};`)
            ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
            ln(`      float _n=(sin(_x*_sc+t*_spd)+cos(_y*_sc+t*_spd*0.7f))*0.5f`)
            ln(`            +(sin(_x*_sc*1.7f+t*_spd*1.3f+_y*_sc*0.9f)*0.33f)`)
            ln(`            +(cos(_x*_sc*2.9f+t*_spd*2.1f)*0.17f);`)
            ln(`      ${of}[_y*WIDTH+_x]=constrain(_n*0.3f+0.5f,0.0f,1.0f);}}`)
            break
          case 'noise4d':
            ln(`  { // Noise4D (looping inoise16 x,y,z,t path)`)
            ln(`    float _spd=${speed},_sc=${scale},_ang=t*_spd*6.2831853f;`)
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
            ln(`    float _spd=${speed},_sc=${scale};`)
            ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
            ln(`      float _px=_x*_sc,_py=_y*_sc; int _xi=(int)floorf(_px),_yi=(int)floorf(_py); float _f1=1e9f;`)
            ln(`      for(int _dj=-1;_dj<=1;_dj++) for(int _di=-1;_di<=1;_di++){`)
            ln(`        int _cx=_xi+_di,_cy=_yi+_dj; float _h=_worleyHash(_cx,_cy);`)
            ln(`        float _fx=_cx+0.5f+0.45f*sin(t*_spd+_h*6.2831f);`)
            ln(`        float _fy=_cy+0.5f+0.45f*cos(t*_spd*1.1f+_h*6.2831f);`)
            ln(`        float _d=sqrtf((_px-_fx)*(_px-_fx)+(_py-_fy)*(_py-_fy)); if(_d<_f1)_f1=_d; }`)
            ln(`      ${of}[_y*WIDTH+_x]=min(1.0f,_f1);}}`)
            break
          case 'plasma':
            ln(`  { float _spd=${speed},_sc=${scale}; uint16_t _z=(uint16_t)(t*_spd*10);`)
            ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
            ln(`      float _v=sin(_x*0.2f+t*_spd)+sin(_y*0.25f+t*_spd*0.8f)+sin((_x+_y)*0.15f+t*_spd*0.6f);`)
            ln(`      float _amp=1,_fr=_sc*96,_fn=0; for(int _o=0;_o<3;_o++){ _fn+=_amp*(inoise8((uint16_t)(_x*_fr),(uint16_t)(_y*_fr),_z)/255.0f-0.5f); _amp*=0.5f; _fr*=2; }`)
            ln(`      _v+=_fn*5; float _nf=fmodf(_v*0.15f,1.0f); if(_nf<0)_nf+=1.0f;`)
            ln(`      ${of}[_y*WIDTH+_x]=_nf;}}`)
            break
          case 'field':
          default:
            ln(`  {`)
            ln(`    float _spd = ${speed}, _scl = ${scale};`)
            ln(`    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {`)
            ln(`      float _v = (sin(_x * _scl * 0.5f + t * _spd) + cos(_y * _scl * 0.5f + t * _spd * 0.7f)) / 2.0f;`)
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
        const pal = paletteExpr(node.id, 'paletteIn', p)
        ln(`  { float _spd=${speed}; float _exp=6.0f-5.0f*${density}; int _i=0;`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _ph=sinf(_i*12.9898f)*43758.5453f; _ph=_ph-floorf(_ph);`)
        ln(`      float _rt=sinf((_i+11)*12.9898f)*43758.5453f; _rt=0.5f+(_rt-floorf(_rt));`)
        ln(`      float _ci=sinf((_i+23)*12.9898f)*43758.5453f; _ci=_ci-floorf(_ci);`)
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
        const pal = paletteExpr(node.id, 'paletteIn', p)
        ln(`  {`)
        ln(`    float _spd=${speed}, _den=${density}, _fd=${fade};`)
        ln(`    fadeToBlackBy(${ob}, NUM_LEDS, (uint8_t)(_fd * 255.0f));`)
        ln(`    int _spawns=(int)(_den * (0.08f + _spd * 0.2142857f) * sqrtf((float)NUM_LEDS));`)
        ln(`    if(_spawns<1 && _den * _spd > 0.08f) _spawns=1;`)
        ln(`    uint8_t _drift=(uint8_t)(t * _spd * 14.5714f);`)
        ln(`    for(int _s=0; _s<_spawns; _s++){`)
        ln(`      int _i=random16(NUM_LEDS);`)
        ln(`      ${ob}[_i] += ColorFromPalette(${pal}, random8() + _drift);`)
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
        const pal = paletteExpr(node.id, 'paletteIn', p)
        ln(`  {`)
        ln(`    float _spd=${speed}, _fd=${fade};`)
        ln(`    const int _dots=${dots};`)
        ln(`    fadeToBlackBy(${ob}, NUM_LEDS, (uint8_t)(_fd * 255.0f));`)
        ln(`    for(int _d=0; _d<_dots; _d++){`)
        ln(`      float _travel=sinf(t*_spd*(2.5f+_d*0.35f)+_d*0.9f)*0.5f+0.5f;`)
        ln(`      int _x=(int)roundf(_travel*(WIDTH-1));`)
        ln(`      int _y=_dots<=1 ? (int)roundf((HEIGHT-1)*0.5f) : (int)roundf(((_d+0.5f)*HEIGHT)/(float)_dots-0.5f);`)
        ln(`      float _pulse=0.75f+0.25f*sinf(t*_spd*3.0f+_d);`)
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
        ln(`  { // Fire pattern`)
        ln(`    static uint8_t heat_${id}[HEIGHT][WIDTH];`)
        ln(`    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++)`)
        ln(`      heat_${id}[_y][_x] = qsub8(heat_${id}[_y][_x], random8(0, 55));`)
        ln(`    for (int _y = 0; _y < HEIGHT - 1; _y++) for (int _x = 0; _x < WIDTH; _x++)`)
        ln(`      heat_${id}[_y][_x] = (heat_${id}[_y][_x] + heat_${id}[_y+1][max(0,_x-1)] + heat_${id}[_y+1][_x] + heat_${id}[_y+1][min(WIDTH-1,_x+1)]) / 4;`)
        ln(`    for (int _x = 0; _x < WIDTH; _x++)`)
        ln(`      if (random8() < 120) heat_${id}[HEIGHT-1][_x] = random8(200, 255);`)
        ln(`    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {`)
        ln(`      uint8_t h = heat_${id}[_y][_x];`)
        ln(`      ${ob}[_y * WIDTH + _x] = h < 85 ? CRGB(h * 3, 0, 0) : h < 170 ? CRGB(255, (h-85)*3, 0) : CRGB(255, 255, (h-170)*3);`)
        ln(`    }`)
        ln(`  }`)
        break
      }

      case 'SpectrumBars': {
        needsT.v = true
        const ob = ownBuf()
        const bass = f('bass', 'bass', 0.5)
        const mids = f('mids', 'mids', 0.5)
        const treble = f('treble', 'treble', 0.5)
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

      case 'BassPulse': {
        const ob = ownBuf()
        const r = Number(p.r ?? 255), g = Number(p.g ?? 0), b = Number(p.b ?? 80)
        const bass = f('bass', 'bass', 0.5)
        ln(`  { float _b = ${bass}; fill_solid(${ob}, NUM_LEDS, CRGB((uint8_t)(${r} * _b), (uint8_t)(${g} * _b), (uint8_t)(${b} * _b))); }`)
        break
      }

      case 'BassRings': {
        needsT.v = true
        const ob = ownBuf()
        const bass = f('bass', 'bass', 0.5)
        const energy = f('energy', 'energy', 0.7)
        const speed = f('speed', 'speed', 1)
        const colorE = incoming.get(`${node.id}:color`)
          ? colorExpr(node.id, 'color')
          : `CRGB(${Number(p.r ?? 255)}, ${Number(p.g ?? 120)}, ${Number(p.b ?? 32)})`
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
        ln(`    CRGB _base = ${colorE};`)
        ln(`    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {`)
        ln(`      float _dx = _x - _cx, _dy = _y - _cy;`)
        ln(`      float _dist = sqrtf(_dx * _dx + _dy * _dy) / max(0.0001f, _maxD);`)
        ln(`      float _wave = sinf(_dist * _rings * 6.2831853f - _phase);`)
        ln(`      float _crisp = powf(max(0.0f, _wave * 0.5f + 0.5f), 2.4f);`)
        ln(`      float _v = min(1.0f, _floor + _crisp * _gain);`)
        ln(`      int _i = _y * WIDTH + _x;`)
        ln(`      ${ob}[_i] = _base;`)
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
        const colorE = incoming.get(`${node.id}:color`)
          ? colorExpr(node.id, 'color')
          : `CRGB(${Number(p.r ?? 180)}, ${Number(p.g ?? 220)}, ${Number(p.b ?? 255)})`
        ln(`  {`)
        ln(`    float _t = ${treble}, _d = ${density};`)
        ln(`    fadeToBlackBy(${ob}, NUM_LEDS, (uint8_t)(110 + (1.0f - constrain(_t, 0.0f, 1.0f)) * 40));`)
        ln(`    int _spawns = (int)(NUM_LEDS * constrain(_d, 0.0f, 1.0f) * (0.03f + constrain(_t, 0.0f, 1.0f) * 0.12f));`)
        ln(`    if (_spawns < 1 && _d * _t > 0.05f) _spawns = 1;`)
        ln(`    uint8_t _spawnChance = (uint8_t)(51 + constrain(_t, 0.0f, 1.0f) * 204);`)
        ln(`    for (int _s = 0; _s < _spawns; _s++) if (random8() <= _spawnChance) {`)
        ln(`      int _x = random16(WIDTH), _y = random16(HEIGHT), _i = _y * WIDTH + _x;`)
        ln(`      CRGB _spark = blend(${colorE}, CRGB::White, (uint8_t)(89 + constrain(_t, 0.0f, 1.0f) * 89));`)
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
        const colorE = incoming.get(`${node.id}:color`)
          ? colorExpr(node.id, 'color')
          : `CRGB(${Number(p.r ?? 200)}, ${Number(p.g ?? 120)}, ${Number(p.b ?? 255)})`
        ln(`  {`)
        ln(`    float _t = min(1.0f, max(0.0f, ${treble}));`)
        ln(`    float _strength = min(1.0f, max(0.0f, ${energy}));`)
        ln(`    float _spd = min(1.0f, max(0.0f, ${speed}));`)
        ln(`    float _motion = _spd * (1.2f + _t * 3.2f * _strength);`)
        ln(`    CRGB _base = ${colorE};`)
        ln(`    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {`)
        ln(`      float _diagA = _x * 1.7f + _y * 1.15f, _diagB = _x * -1.1f + _y * 1.9f;`)
        ln(`      float _waveA = sinf(_diagA + t * _motion * 7.5f);`)
        ln(`      float _waveB = sinf(_diagB - t * _motion * 6.1f);`)
        ln(`      float _prism = max(0.0f, _waveA * 0.55f + _waveB * 0.45f);`)
        ln(`      float _shard = powf(_prism, 3.6f);`)
        ln(`      float _flash = powf(max(0.0f, sinf((_x + _y) * 2.4f - t * _motion * 9.0f) * 0.5f + 0.5f), 10.0f);`)
        ln(`      float _v = min(1.0f, _shard * (0.3f + _t * 0.7f * _strength) + _flash * _t * 0.9f * _strength);`)
        ln(`      int _i = _y * WIDTH + _x;`)
        ln(`      ${ob}[_i] = _base;`)
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
        const decay = f('decay', 'decay', 0.85)
        ln(`  {`)
        ln(`    ${seedFrom('frame')}`)
        ln(`    static float _flash_${id} = 0;`)
        ln(`    if (${beat}) _flash_${id} = 1.0f; else _flash_${id} *= ${decay};`)
        ln(`    for (int _i = 0; _i < NUM_LEDS; _i++) {`)
        ln(`      ${ob}[_i].r = qadd8(${ob}[_i].r, (uint8_t)((255 - ${ob}[_i].r) * _flash_${id}));`)
        ln(`      ${ob}[_i].g = qadd8(${ob}[_i].g, (uint8_t)((255 - ${ob}[_i].g) * _flash_${id}));`)
        ln(`      ${ob}[_i].b = qadd8(${ob}[_i].b, (uint8_t)((255 - ${ob}[_i].b) * _flash_${id}));`)
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
        const pal = paletteExpr(node.id, 'paletteIn', p)
        ln(`  { // KickShock`)
        ln(`    static float _ksBorn_${id}[8]; static uint8_t _ksKind_${id}[8]; static bool _ksAlive_${id}[8]; static bool _ksInit_${id}=false; static uint8_t _ksNext_${id}=0; static bool _ksPrevKick_${id}=false,_ksPrevSnare_${id}=false;`)
        ln(`    if(!_ksInit_${id}){ for(int _i=0;_i<8;_i++) _ksAlive_${id}[_i]=false; _ksInit_${id}=true; }`)
        ln(`    float _spd=${speed},_strength=min(1.0f,max(0.0f,${energy})),_hihatAmt=min(1.0f,max(0.0f,${hihat}));`)
        ln(`    bool _kickHit=(${kick})>0.5f, _snareHit=(${snare})>0.5f;`)
        ln(`    if(_kickHit && !_ksPrevKick_${id}){ _ksBorn_${id}[_ksNext_${id}]=t; _ksKind_${id}[_ksNext_${id}]=0; _ksAlive_${id}[_ksNext_${id}]=true; _ksNext_${id}=(uint8_t)((_ksNext_${id}+1)%8); }`)
        ln(`    if(_snareHit && !_ksPrevSnare_${id}){ _ksBorn_${id}[_ksNext_${id}]=t; _ksKind_${id}[_ksNext_${id}]=1; _ksAlive_${id}[_ksNext_${id}]=true; _ksNext_${id}=(uint8_t)((_ksNext_${id}+1)%8); }`)
        ln(`    _ksPrevKick_${id}=_kickHit; _ksPrevSnare_${id}=_snareHit;`)
        ln(`    float _spdK=(0.35f+_strength*0.5f)*max(0.2f,_spd), _spdS=_spdK*1.8f;`)
        ln(`    const float _lifeK=1.9f,_lifeS=1.0f,_bandK=0.10f,_bandS=0.055f;`)
        ln(`    float _cx=(WIDTH-1)/2.0f,_cy=(HEIGHT-1)/2.0f,_maxD=max(1e-6f,sqrtf(_cx*_cx+_cy*_cy));`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _dx=_x-_cx,_dy=_y-_cy,_dist=sqrtf(_dx*_dx+_dy*_dy)/_maxD;`)
        ln(`      float _wave=0;`)
        ln(`      for(int _r=0;_r<8;_r++){ if(!_ksAlive_${id}[_r]) continue;`)
        ln(`        float _age=t-_ksBorn_${id}[_r]; bool _isKick=_ksKind_${id}[_r]==0;`)
        ln(`        float _spdR=_isKick?_spdK:_spdS,_life=_isKick?_lifeK:_lifeS,_band=_isKick?_bandK:_bandS;`)
        ln(`        if(_age<0||_age>_life) continue;`)
        ln(`        float _d=_dist-_age*_spdR; float _front=expf(-(_d*_d)/(2.0f*_band*_band));`)
        ln(`        _wave+=_front*(1.0f-_age/_life); }`)
        ln(`      _wave=min(1.0f,_wave);`)
        ln(`      float _jitter=_hihatAmt*0.18f*(sinf(_dist*50.0f-t*_spd*22.0f)*0.5f+0.5f);`)
        ln(`      float _v=min(1.0f,_wave*(0.5f+_strength*0.5f)+_jitter*_wave+0.03f*_strength);`)
        ln(`      ${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)((_dist*0.5f+t*_spd*0.03f)*255));`)
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
        ln(`    float _level=min(1.0f,max(0.0f,${vocals})),_strength=min(1.0f,max(0.0f,${energy}));`)
        ln(`    float _gate=(${silence})?0.0f:1.0f;`)
        ln(`    float _drift=t*${speed}*(0.15f+_level*0.35f);`)
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
        ln(`    float _rot=t*${speed}*(0.15f+_strength*0.35f)+_bkPunch_${id}*0.8f;`)
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
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      int _cx=(int)(_x/_cellW),_cy=(int)(_y/_cellH);`)
        ln(`      float _diag=(_cx+_cy)/(2.0f*(float)max(1,_n-1));`)
        ln(`      float _mix=_b*(1.0f-_diag)+_m*0.5f+_tr*_diag;`)
        ln(`      float _phase=_cx*0.6f+_cy*0.9f+t*${speed}*(0.4f+_strength*0.8f);`)
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
        ln(`  { // PercussionBlobs`)
        ln(`    static float _pbx_${id}[12],_pby_${id}[12],_pbt_${id}[12]; static uint8_t _pbk_${id}[12]; static bool _pbAlive_${id}[12]; static bool _pbInit_${id}=false; static uint8_t _pbNext_${id}=0; static bool _pbPrevKick_${id}=false,_pbPrevSnare_${id}=false,_pbPrevHihat_${id}=false;`)
        ln(`    if(!_pbInit_${id}){ for(int _i=0;_i<12;_i++) _pbAlive_${id}[_i]=false; _pbInit_${id}=true; }`)
        ln(`    bool _kickHit=(${kick})>0.5f, _snareHit=(${snare})>0.5f, _hihatHit=(${hihat})>0.55f;`)
        ln(`    if(_kickHit && !_pbPrevKick_${id}){ _pbx_${id}[_pbNext_${id}]=random8()/255.0f*WIDTH; _pby_${id}[_pbNext_${id}]=random8()/255.0f*HEIGHT; _pbt_${id}[_pbNext_${id}]=t; _pbk_${id}[_pbNext_${id}]=0; _pbAlive_${id}[_pbNext_${id}]=true; _pbNext_${id}=(uint8_t)((_pbNext_${id}+1)%12); }`)
        ln(`    if(_snareHit && !_pbPrevSnare_${id}){ _pbx_${id}[_pbNext_${id}]=random8()/255.0f*WIDTH; _pby_${id}[_pbNext_${id}]=random8()/255.0f*HEIGHT; _pbt_${id}[_pbNext_${id}]=t; _pbk_${id}[_pbNext_${id}]=1; _pbAlive_${id}[_pbNext_${id}]=true; _pbNext_${id}=(uint8_t)((_pbNext_${id}+1)%12); }`)
        ln(`    if(_hihatHit && !_pbPrevHihat_${id}){ _pbx_${id}[_pbNext_${id}]=random8()/255.0f*WIDTH; _pby_${id}[_pbNext_${id}]=random8()/255.0f*HEIGHT; _pbt_${id}[_pbNext_${id}]=t; _pbk_${id}[_pbNext_${id}]=2; _pbAlive_${id}[_pbNext_${id}]=true; _pbNext_${id}=(uint8_t)((_pbNext_${id}+1)%12); }`)
        ln(`    _pbPrevKick_${id}=_kickHit; _pbPrevSnare_${id}=_snareHit; _pbPrevHihat_${id}=_hihatHit;`)
        ln(`    const float _pr[3]={0.34f,0.20f,0.10f}, _pl[3]={1.4f,0.7f,0.35f};`)
        ln(`    float _minDim=min((float)WIDTH,(float)HEIGHT);`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _field=0;`)
        ln(`      for(int _bl=0;_bl<12;_bl++){ if(!_pbAlive_${id}[_bl]) continue;`)
        ln(`        float _age=t-_pbt_${id}[_bl]; uint8_t _kind=_pbk_${id}[_bl]; float _life=_pl[_kind];`)
        ln(`        if(_age<0||_age>_life) continue;`)
        ln(`        float _lifeT=_age/_life;`)
        ln(`        float _radius=_pr[_kind]*_minDim*(0.4f+0.6f*min(1.0f,_lifeT*2.0f));`)
        ln(`        float _decay=1.0f-_lifeT;`)
        ln(`        float _dx=_x-_pbx_${id}[_bl],_dy=_y-_pby_${id}[_bl];`)
        ln(`        _field+=_decay*(_radius*_radius)/(_dx*_dx+_dy*_dy+_radius*_radius*0.15f); }`)
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
        ln(`    float _trebleAmp=0.15f+_tr*0.6f,_midsAmp=0.3f+_m*0.9f,_bassPulse=min(1.0f,0.5f+_b*0.9f);`)
        ln(`    float _tFast=t*${speed}*(1.5f+_tr*2.0f),_tSlow=t*${speed}*(0.3f+_m*0.6f);`)
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
        ln(`  { // RainRipples`)
        ln(`    static float _rrx_${id}[8],_rry_${id}[8],_rrt_${id}[8]; static bool _rrAlive_${id}[8]; static bool _rrInit_${id}=false; static uint8_t _rrNext_${id}=0; static bool _rrPrevTrig_${id}=false;`)
        ln(`    if(!_rrInit_${id}){ for(int _i=0;_i<8;_i++) _rrAlive_${id}[_i]=false; _rrInit_${id}=true; }`)
        ln(`    bool _trig=(${trigger});`)
        ln(`    if(_trig && !_rrPrevTrig_${id}){ _rrx_${id}[_rrNext_${id}]=random8()/255.0f*WIDTH; _rry_${id}[_rrNext_${id}]=random8()/255.0f*HEIGHT; _rrt_${id}[_rrNext_${id}]=t; _rrAlive_${id}[_rrNext_${id}]=true; _rrNext_${id}=(uint8_t)((_rrNext_${id}+1)%8); }`)
        ln(`    _rrPrevTrig_${id}=_trig;`)
        ln(`    float _strength=min(1.0f,max(0.0f,${energy})); float _spd=max(0.2f,${speed});`)
        ln(`    float _life=1.6f/_spd; float _speedPx=max((float)WIDTH,(float)HEIGHT)*0.9f/_life;`)
        ln(`    float _band=0.9f+(1.0f-_strength)*0.6f;`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _v=0;`)
        ln(`      for(int _r=0;_r<8;_r++){ if(!_rrAlive_${id}[_r]) continue;`)
        ln(`        float _age=t-_rrt_${id}[_r]; if(_age<0||_age>_life) continue;`)
        ln(`        float _dx=_x-_rrx_${id}[_r],_dy=_y-_rry_${id}[_r],_dist=sqrtf(_dx*_dx+_dy*_dy);`)
        ln(`        float _d=_dist-_age*_speedPx; float _ring=expf(-(_d*_d)/(2.0f*_band*_band));`)
        ln(`        _v=max(_v,_ring*(1.0f-_age/_life)); }`)
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
        ln(`    float _drift=t*${speed}*(4.0f+${mids}*8.0f);`)
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
        ln(`  { ${seedFrom('frame')} uint8_t _br = (uint8_t)(constrain(${br}, 0, 1) * 255); for (int _i = 0; _i < NUM_LEDS; _i++) ${ob}[_i].nscale8(_br); }`)
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

      // Feedback/trails buffer — the persistent buf_ own buffer is deliberately
      // not seeded from the input each frame (see the Code node comment above);
      // it fades in place, then re-lightens per-channel wherever the input is
      // brighter. Mirrors the evaluator's Trails case.
      case 'Trails': {
        const ob = ownBuf()
        const src = srcBuf('frame')
        if (!src) { ln(`  fill_solid(${ob}, NUM_LEDS, CRGB::Black);`); break }
        const decay = Math.max(0, Math.min(1, Number(p.decay ?? 0.15)))
        const amt = Math.round(decay * 255)
        ln(`  { // Trails: fadeToBlackBy(${amt}) then re-lighten from the input (per-channel max)`)
        ln(`    fadeToBlackBy(${ob}, NUM_LEDS, ${amt});`)
        ln(`    for(int _i=0;_i<NUM_LEDS;_i++){`)
        ln(`      if(${src}[_i].r>${ob}[_i].r)${ob}[_i].r=${src}[_i].r;`)
        ln(`      if(${src}[_i].g>${ob}[_i].g)${ob}[_i].g=${src}[_i].g;`)
        ln(`      if(${src}[_i].b>${ob}[_i].b)${ob}[_i].b=${src}[_i].b;}`)
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
        ln(`  { ${seedFrom('frame')} uint8_t _sh = (uint8_t)((${shift}) / 360.0f * 255); for (int _i = 0; _i < NUM_LEDS; _i++) ${ob}[_i] = CHSV(rgb2hsv_approximate(${ob}[_i]).hue + _sh, rgb2hsv_approximate(${ob}[_i]).sat, rgb2hsv_approximate(${ob}[_i]).val); }`)
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
        const g = Math.max(0.1, Number(p.gamma ?? 2.2))
        ln(`  { ${seedFrom('frame')} napplyGamma_video(${ob}, NUM_LEDS, ${g.toFixed(3)}f); }`)
        break
      }

      case 'Transform': {
        needsT.v = true
        const ob = ownBuf()
        const src = srcBuf('frame')
        if (!src) { ln(`  fill_solid(${ob}, NUM_LEDS, CRGB::Black); // Transform: no input`); break }
        const mode = String(p.transform ?? 'rotate')
        const rate = f('rate', 'rate', 90)
        const angle = Number(p.angle ?? 0)
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
        const flt = (val: unknown, def: number) => {
          const n = Number(val ?? def)
          const v = Number.isFinite(n) ? n : def
          return Number.isInteger(v) ? `${v}.0f` : `${v}f`
        }
        const offX = flt(p.offsetX, 3), offY = flt(p.offsetY, 0)
        // `angle` and `count` are wire-able (see nodeLibrary inputs) so an
        // animated signal can spin/grow the array; unwired they bake the slider.
        const ang = f('angle', 'angle', 0)
        const scl = flt(Math.max(0.05, Number(p.scale ?? 1)), 1), fo = flt(p.falloff, 0.7)
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

      case 'Noise2D': {
        needsT.v = true
        const ob = ownBuf()
        const speed = rateCpp(f('speed', 'speed', 0.4), SPEED_MAX.Noise2D), scale = rateCpp(f('scale', 'scale', 0.4), SCALE_MAX.Noise2D)
        ln(`  { float _spd=${speed},_sc=${scale}; for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`    float _v=sin(_x*_sc+t*_spd+1.7f)*cos(_y*_sc*1.3f+t*_spd*0.8f+2.3f)+0.5f*sin(_x*_sc*2.1f+t*_spd*2.0f)*cos(_y*_sc*2.7f+t*_spd*1.6f);`)
        ln(`    ${ob}[_y*WIDTH+_x]=CHSV((uint8_t)((_v*0.5f+0.5f)*255),255,220);}}`)
        break
      }

      case 'RadialBurst': {
        needsT.v = true
        const ob = ownBuf()
        const speed = rateCpp(f('speed', 'speed', 0.5), SPEED_MAX.RadialBurst)
        const r = Number(p.r ?? 0), g = Number(p.g ?? 200), b = Number(p.b ?? 255)
        ln(`  { float _spd=${speed}; for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`    float _d=sqrt((_x-WIDTH/2.0f)*(_x-WIDTH/2.0f)+(_y-HEIGHT/2.0f)*(_y-HEIGHT/2.0f))/sqrt(WIDTH*WIDTH/4.0f+HEIGHT*HEIGHT/4.0f);`)
        ln(`    float _w=(sin((_d*8-t*_spd*3)*3.14159f)+1)/2.0f;`)
        ln(`    ${ob}[_y*WIDTH+_x]=CRGB((uint8_t)(${r}*_w),(uint8_t)(${g}*_w),(uint8_t)(${b}*_w));}}`)
        break
      }

      case 'Spiral': {
        needsT.v = true
        const ob = ownBuf()
        const speed = rateCpp(f('speed', 'speed', 0.5), SPEED_MAX.Spiral), arms = Number(p.arms ?? 2)
        ln(`  { float _spd=${speed}; for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`    float _d=sqrt((_x-WIDTH/2.0f)*(_x-WIDTH/2.0f)+(_y-HEIGHT/2.0f)*(_y-HEIGHT/2.0f))/sqrt(WIDTH*WIDTH/4.0f+HEIGHT*HEIGHT/4.0f);`)
        ln(`    float _a=atan2(_y-HEIGHT/2.0f,_x-WIDTH/2.0f);float _s=(_a+_d*12.57f-t*_spd*3.14159f)*${arms};`)
        ln(`    ${ob}[_y*WIDTH+_x]=CHSV((uint8_t)(_d*255+t*30),255,(uint8_t)((sin(_s)+1)/2.0f*230));}}`)
        break
      }

      case 'Kaleidoscope': {
        const ob = ownBuf()
        ln(`  ${seedFrom('frame')}  // Kaleidoscope: mirror logic to apply on ${ob}`)
        break
      }

      case 'Particles': {
        const ob = ownBuf()
        const mode = String(p.particleType ?? 'fountain')
        if (['comet', 'snow', 'embers', 'bubbles', 'fireflies', 'meteor', 'tornado', 'attractor'].includes(mode)) needsT.v = true
        const rate = f('rate', 'rate', 0.3)
        const decay = Number(p.decay ?? 0.92)
        const decayL = (Number.isInteger(decay) ? `${decay}.0` : `${decay}`) + 'f'
        const colorE = incoming.get(`${node.id}:color`)
          ? colorExpr(node.id, 'color')
          : `CRGB(${Number(p.r ?? 100)}, ${Number(p.g ?? 200)}, ${Number(p.b ?? 255)})`
        // Fixed-size pool (SoA): l[i] <= 0.04 marks a free slot. swarm keeps every
        // slot live (boids), so it uses a smaller pool for the O(N^2) step.
        const cap = mode === 'swarm' ? 40 : 120
        const A = `_pa_${id}`
        ln(`  { // Particles: ${mode}`)
        ln(`    const int _PN=${cap};`)
        ln(`    static float ${A}x[_PN], ${A}y[_PN], ${A}vx[_PN], ${A}vy[_PN], ${A}l[_PN], ${A}s[_PN]; static uint8_t ${A}r[_PN], ${A}g[_PN], ${A}b[_PN]; static bool ${A}init=false;`)
        ln(`    float _rate=${rate}; CRGB _pc=${colorE};`)

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
          if (mode === 'fountain')
            ln(`    if(random8()<(uint8_t)(_rate*255)){ for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=random8()/255.0f*WIDTH; ${A}y[i]=HEIGHT-1; ${A}vx[i]=(random8()/255.0f-0.5f)*0.6f; ${A}vy[i]=-(random8()/255.0f*0.5f+0.1f); ${A}l[i]=1; ${A}r[i]=_pc.r; ${A}g[i]=_pc.g; ${A}b[i]=_pc.b; break; } }`)
          else if (mode === 'gravity')
            ln(`    if(random8()<(uint8_t)(_rate*255)){ for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=random8()/255.0f*WIDTH; ${A}y[i]=0; ${A}vx[i]=(random8()/255.0f-0.5f)*0.4f; ${A}vy[i]=random8()/255.0f*0.2f; ${A}l[i]=1; ${A}r[i]=_pc.r; ${A}g[i]=_pc.g; ${A}b[i]=_pc.b; break; } }`)
          else if (mode === 'fireworks') {
            ln(`    if(random8()<(uint8_t)(_rate*0.12f*255)){ uint8_t _hue=random8(); int _n=14+random8()/32; float _cx=random8()/255.0f*WIDTH, _cy=random8()/255.0f*HEIGHT*0.5f+HEIGHT*0.1f;`)
            ln(`      for(int k=0;k<_n;k++) for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ float _a=(k/(float)_n)*6.2831f+random8()/255.0f*0.3f, _sp=random8()/255.0f*0.5f+0.35f; ${A}x[i]=_cx; ${A}y[i]=_cy; ${A}vx[i]=cos(_a)*_sp; ${A}vy[i]=sin(_a)*_sp; ${A}l[i]=1; CRGB _fc=CHSV(_hue+(random8()%30)-15,255,255); ${A}r[i]=_fc.r; ${A}g[i]=_fc.g; ${A}b[i]=_fc.b; break; } }`)
          } else if (mode === 'sparkle')
            ln(`    { int _sp=max(1,(int)(_rate*WIDTH*0.8f)); for(int k=0;k<_sp;k++) if(random8()<(uint8_t)(_rate*255)){ for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=random8()/255.0f*WIDTH; ${A}y[i]=random8()/255.0f*HEIGHT*0.3f; ${A}vx[i]=0; ${A}vy[i]=random8()/255.0f*0.25f+0.05f; ${A}l[i]=1; ${A}r[i]=_pc.r; ${A}g[i]=_pc.g; ${A}b[i]=_pc.b; break; } } }`)
          else if (mode === 'comet')
            ln(`    { float _hx=(WIDTH-1)*(0.5f+0.45f*sin(t*0.9f)), _hy=(HEIGHT-1)*(0.5f+0.45f*sin(t*0.6f+1.3f)); for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=_hx; ${A}y[i]=_hy; ${A}vx[i]=0; ${A}vy[i]=0; ${A}l[i]=1; ${A}r[i]=_pc.r; ${A}g[i]=_pc.g; ${A}b[i]=_pc.b; break; } }`)
          else if (mode === 'snow')
            ln(`    if(random8()<(uint8_t)(_rate*255)){ for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=random8()/255.0f*WIDTH; ${A}y[i]=0; ${A}vy[i]=random8()/255.0f*0.12f+0.05f; ${A}l[i]=0.7f+random8()/255.0f*0.3f; ${A}s[i]=random8()/255.0f*6.28f; ${A}r[i]=_pc.r; ${A}g[i]=_pc.g; ${A}b[i]=_pc.b; break; } }`)
          else if (mode === 'rain')
            ln(`    if(random8()<(uint8_t)(_rate*255)){ for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=random8()/255.0f*WIDTH; ${A}y[i]=0; ${A}vx[i]=(random8()/255.0f-0.5f)*0.18f; ${A}vy[i]=random8()/255.0f*0.45f+0.35f; ${A}l[i]=1; break; } }`)
          else if (mode === 'embers')
            ln(`    if(random8()<(uint8_t)(_rate*255)){ for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=random8()/255.0f*WIDTH; ${A}y[i]=HEIGHT-1; ${A}vx[i]=(random8()/255.0f-0.5f)*0.12f; ${A}vy[i]=-(random8()/255.0f*0.18f+0.04f); ${A}s[i]=random8()/255.0f*6.28f; ${A}l[i]=1; break; } }`)
          else if (mode === 'bubbles')
            ln(`    if(random8()<(uint8_t)(_rate*255)){ for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=random8()/255.0f*WIDTH; ${A}y[i]=HEIGHT-1; ${A}vy[i]=-(random8()/255.0f*0.16f+0.06f); ${A}s[i]=random8()/255.0f*6.28f; ${A}l[i]=1; break; } }`)
          else if (mode === 'vortex')
            ln(`    if(random8()<(uint8_t)(_rate*255)){ for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=random8()/255.0f*WIDTH; ${A}y[i]=random8()/255.0f*HEIGHT; ${A}l[i]=1; break; } }`)
          else if (mode === 'orbit')
            ln(`    { int _target=max(4,min(48,(int)(4+_rate*44))); for(int i=0;i<_target;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=random8()/255.0f*WIDTH; ${A}y[i]=random8()/255.0f*HEIGHT; ${A}s[i]=random8()/255.0f*0.08f+0.025f; ${A}l[i]=1; } for(int i=_target;i<_PN;i++) ${A}l[i]=0; }`)
          else if (mode === 'confetti')
            ln(`    { int _sp=max(1,(int)(_rate*4)); for(int k=0;k<_sp;k++) if(random8()<(uint8_t)(_rate*255)){ for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=random8()/255.0f*WIDTH; ${A}y[i]=random8()/255.0f*HEIGHT; ${A}vx[i]=(random8()/255.0f-0.5f)*0.16f; ${A}vy[i]=random8()/255.0f*0.08f+0.02f; ${A}l[i]=1; break; } } }`)
          else if (mode === 'fireflies')
            ln(`    { int _target=max(5,min(50,(int)(5+_rate*45))); for(int i=0;i<_target;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=random8()/255.0f*WIDTH; ${A}y[i]=random8()/255.0f*HEIGHT; ${A}vx[i]=(random8()/255.0f-0.5f)*0.12f; ${A}vy[i]=(random8()/255.0f-0.5f)*0.12f; ${A}s[i]=random8()/255.0f*6.28f; ${A}l[i]=1; } for(int i=_target;i<_PN;i++) ${A}l[i]=0; }`)
          else if (mode === 'meteor')
            ln(`    { float _span=max(1.0f,max(WIDTH,HEIGHT)-1.0f),_phase=fmodf(t*max(2.0f,WIDTH*0.45f),_span); for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=_phase*(WIDTH-1)/_span; ${A}y[i]=_phase*(HEIGHT-1)/_span; ${A}l[i]=1; break; } }`)
          else if (mode === 'tornado')
            ln(`    if(random8()<(uint8_t)(_rate*255)){ for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=WIDTH/2.0f; ${A}y[i]=HEIGHT-1; ${A}vy[i]=-(random8()/255.0f*0.16f+0.06f); ${A}s[i]=random8()/255.0f*6.28f; ${A}l[i]=1; break; } }`)
          else if (mode === 'pinwheel')
            ln(`    if(random8()<(uint8_t)(_rate*255)){ for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ float _a=random8()/255.0f*6.2831f; ${A}x[i]=WIDTH/2.0f; ${A}y[i]=HEIGHT/2.0f; ${A}vx[i]=cos(_a)*0.18f; ${A}vy[i]=sin(_a)*0.18f; ${A}l[i]=1; break; } }`)
          else if (mode === 'bounce')
            ln(`    { int _target=max(4,min(50,(int)(4+_rate*46))); for(int i=0;i<_target;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=random8()/255.0f*WIDTH; ${A}y[i]=random8()/255.0f*HEIGHT; ${A}vx[i]=(random8()/255.0f-0.5f)*0.5f; ${A}vy[i]=(random8()/255.0f-0.5f)*0.5f; ${A}l[i]=1; } for(int i=_target;i<_PN;i++) ${A}l[i]=0; }`)
          else if (mode === 'attractor')
            ln(`    if(random8()<(uint8_t)(_rate*255)){ for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=random8()/255.0f*WIDTH; ${A}y[i]=random8()/255.0f*HEIGHT; ${A}vx[i]=(random8()/255.0f-0.5f)*0.1f; ${A}vy[i]=(random8()/255.0f-0.5f)*0.1f; ${A}l[i]=1; break; } }`)
          else if (mode === 'waterfall')
            ln(`    { int _sp=max(1,(int)(_rate*3)); for(int k=0;k<_sp;k++) if(random8()<(uint8_t)(_rate*255)){ for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=WIDTH*(0.35f+random8()/255.0f*0.3f); ${A}y[i]=0; ${A}vx[i]=(random8()/255.0f-0.5f)*0.08f; ${A}vy[i]=random8()/255.0f*0.2f+0.12f; ${A}l[i]=1; break; } } }`)

          // ── update ──
          ln(`    for(int i=0;i<_PN;i++){ if(${A}l[i]<=0.04f) continue;`)
          if (mode === 'fountain')
            ln(`      ${A}x[i]+=${A}vx[i]; ${A}y[i]+=${A}vy[i]; ${A}vy[i]+=0.02f; ${A}l[i]*=${decayL}; if(${A}y[i]<0) ${A}l[i]=0; }`)
          else if (mode === 'gravity')
            ln(`      ${A}vy[i]+=0.045f; ${A}x[i]+=${A}vx[i]; ${A}y[i]+=${A}vy[i]; if(${A}y[i]>=HEIGHT-1){ ${A}y[i]=HEIGHT-1; ${A}vy[i]*=-0.55f; ${A}vx[i]*=0.8f; ${A}l[i]*=0.9f; } ${A}l[i]*=${decayL}; }`)
          else if (mode === 'fireworks')
            ln(`      ${A}vy[i]=(${A}vy[i]+0.022f)*0.965f; ${A}vx[i]*=0.965f; ${A}x[i]+=${A}vx[i]; ${A}y[i]+=${A}vy[i]; ${A}l[i]*=${decayL}*0.985f; }`)
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
            ln(`      ${A}vy[i]+=0.025f; ${A}x[i]+=${A}vx[i]; ${A}y[i]+=${A}vy[i]; if(${A}y[i]>=HEIGHT-1){ ${A}y[i]=HEIGHT-1; ${A}vy[i]*=-0.3f; ${A}vx[i]+=(random8()/255.0f-0.5f)*0.35f; ${A}l[i]*=0.7f; } ${A}l[i]*=${decayL}*0.995f; }`)
        }

        // ── render (shared) ── fireworks keeps per-particle (random-hue) colour;
        // every other mode renders the live node colour so a colour change applies
        // to existing particles too.
        const cr = mode === 'fireworks' ? `${A}r[i]` : '_pc.r'
        const cg = mode === 'fireworks' ? `${A}g[i]` : '_pc.g'
        const cb = mode === 'fireworks' ? `${A}b[i]` : '_pc.b'
        // Blob radius baked from the panel's configured WIDTH/HEIGHT — mirrors
        // the evaluator's particleScale.ts so firmware matches preview.
        const R = Math.max(0.5, particleRadius(width, height))
        const Rf = Number.isInteger(R) ? R.toFixed(1) : String(R)
        ln(`    fill_solid(${ob}, NUM_LEDS, CRGB::Black);`)
        ln(`    for(int i=0;i<_PN;i++){ if(${A}l[i]<=0.04f) continue; float _k=min(1.0f,${A}l[i]), _sx=${A}x[i], _sy=${A}y[i];`)
        ln(`      int _x0=max(0,(int)floorf(_sx-${Rf}f-1.0f)), _x1=min(WIDTH-1,(int)ceilf(_sx+${Rf}f+1.0f));`)
        ln(`      int _y0=max(0,(int)floorf(_sy-${Rf}f-1.0f)), _y1=min(HEIGHT-1,(int)ceilf(_sy+${Rf}f+1.0f));`)
        ln(`      for(int _y=_y0;_y<=_y1;_y++) for(int _x=_x0;_x<=_x1;_x++){`)
        ln(`        float _dx=(_x+0.5f)-_sx,_dy=(_y+0.5f)-_sy; float _cov=constrain(${Rf}f+0.5f-sqrtf(_dx*_dx+_dy*_dy),0.0f,1.0f);`)
        ln(`        if(_cov<=0.0f) continue; CRGB _add=CRGB((uint8_t)(${cr}*_k),(uint8_t)(${cg}*_k),(uint8_t)(${cb}*_k)); _add.nscale8((uint8_t)(_cov*255.0f)); ${ob}[_y*WIDTH+_x]+=_add; } } }`)
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
          const g = Math.round(Math.max(0, Math.min(1, Number(p.glowAmount ?? 0.35))) * 255)
          const tintE = incoming.get(`${node.id}:color`)
            ? colorExpr(node.id, 'color')
            : `CRGB(${Number(p.r ?? 255)}, ${Number(p.g ?? 255)}, ${Number(p.b ?? 255)})`
          ln(`    int _ax=_x,_ay=_y;`)
          if (mode === 'horizontal' || mode === 'quad') ln(`    _ax=max(_x,WIDTH-1-_x);`)
          if (mode === 'vertical' || mode === 'quad') ln(`    _ay=max(_y,HEIGHT-1-_y);`)
          if (mode === 'diagonal') ln(`    _ax=min(max(_x,_y),WIDTH-1);_ay=min(min(_x,_y),HEIGHT-1);`)
          ln(`    CRGB _b=${src}[_sy*WIDTH+_sx], _a=${src}[_ay*WIDTH+_ax], _t=${tintE};`)
          ln(`    ${ob}[_y*WIDTH+_x]=CRGB(qadd8(_b.r,scale8(scale8(_a.r,_t.r),${g})),qadd8(_b.g,scale8(scale8(_a.g,_t.g),${g})),qadd8(_b.b,scale8(scale8(_a.b,_t.b),${g})));}}`)
          break
        }
        ln(`    ${ob}[_y*WIDTH+_x]=${src}[_sy*WIDTH+_sx];}}`)
        break
      }

      case 'GradientFrame': {
        const ob = ownBuf()
        const rA = Number(p.rA ?? 0), gA = Number(p.gA ?? 200), bA = Number(p.bA ?? 255)
        const rB = Number(p.rB ?? 255), gB = Number(p.gB ?? 0), bB = Number(p.bB ?? 255)
        const vert = Boolean(p.vertical)
        ln(`  { for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`    float _t=${vert ? '_y/(HEIGHT-1.0f)' : '_x/(WIDTH-1.0f)'};`)
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
        ln(`  float ${v('value')} = ${lo} + random8() / 255.0f * ${hi - lo};`)
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

      // Trigger envelope — 1 on a rising edge, linear decay to 0 over `decay`
      // seconds; outputs 0 until the first trigger.
      case 'Envelope': {
        const trig = boolExpr(node.id, 'trigger')
        const ms = Math.max(50, Math.round(Number(p.decay ?? 0.5) * 1000))
        ln(`  static uint32_t _envT_${id} = 0; static bool _envF_${id} = false, _envP_${id} = false;`)
        ln(`  { bool _t = (${trig}); if (_t && !_envP_${id}) { _envT_${id} = millis(); _envF_${id} = true; } _envP_${id} = _t; }`)
        ln(`  float ${v('result')} = _envF_${id} ? constrain(1.0f - (millis() - _envT_${id}) / ${ms}.0f, 0.0f, 1.0f) : 0.0f;`)
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
        ln(`  { // Fractal noise (fBm via inoise8)`)
        ln(`    float _spd=${speed},_sc=${scale}; uint16_t _z=(uint16_t)(t*_spd*40);`)
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
        const orientation = Number(p.orientation ?? 45)
        const pal = paletteExpr(node.id, 'paletteIn', p)
        ln(`  { // Gabor noise`)
        ln(`    float _spd=${speed},_sc=${scale},_fr=${freq},_om=${orientation}*0.01745329f,_co=cos(_om),_si=sin(_om);`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _px=_x*_sc,_py=_y*_sc; int _xi=(int)floorf(_px),_yi=(int)floorf(_py); float _v=0;`)
        ln(`      for(int _dj=-1;_dj<=1;_dj++) for(int _di=-1;_di<=1;_di++){`)
        ln(`        int _cx=_xi+_di,_cy=_yi+_dj; float _h=_worleyHash(_cx,_cy),_h2=_worleyHash(_cx+31,_cy-17);`)
        ln(`        float _fx=_cx+0.5f+(_h-0.5f),_fy=_cy+0.5f+(_h2-0.5f);`)
        ln(`        float _dx=_px-_fx,_dy=_py-_fy,_g=expf(-2.5f*(_dx*_dx+_dy*_dy));`)
        ln(`        float _proj=_dx*_co+_dy*_si,_w=_h2<0.5f?1.0f:-1.0f;`)
        ln(`        _v+=_w*_g*cosf(6.2831853f*_fr*_proj+t*_spd+_h*6.2831853f); }`)
        ln(`      ${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)((_v*0.5f+0.5f)*255));}}`)
        break
      }

      case 'PaletteGradient': {
        const ob = ownBuf()
        const angle = Number(p.angle ?? 45), repeat = Number(p.repeat ?? 1)
        const speed = Math.max(0, Math.min(1, Number(p.speed ?? 0))) * SPEED_MAX.PaletteGradient
        const pal = paletteExpr(node.id, 'paletteIn', p)
        const fl = (value: number) => `${Number.isInteger(value) ? value.toFixed(1) : value}f`
        const scroll = speed !== 0 ? `+t*${fl(speed)}` : ''
        if (speed !== 0) needsT.v = true
        ln(`  { // Palette gradient`)
        ln(`    float _a=${angle}*0.01745329f,_co=cos(_a),_si=sin(_a);`)
        ln(`    float _pmin=(_co<0?(WIDTH-1)*_co:0)+(_si<0?(HEIGHT-1)*_si:0);`)
        ln(`    float _pmax=(_co>0?(WIDTH-1)*_co:0)+(_si>0?(HEIGHT-1)*_si:0);`)
        ln(`    float _rng=max(1e-6f,_pmax-_pmin);`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _tn=(_x*_co+_y*_si-_pmin)/_rng;`)
        ln(`      ${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)((_tn*${fl(repeat)}${scroll})*255));}}`)
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
        const rawRotation = ((Number(p.rotation ?? 0) % 360) + 360) % 360
        const rotation = [90, 180, 270].includes(rawRotation) ? rawRotation : 0
        const rw = rotation === 90 || rotation === 270 ? img.h : img.w
        const rh = rotation === 90 || rotation === 270 ? img.w : img.h
        const position = (value: unknown) => {
          const n = Number(value ?? 0.5)
          return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.5
        }
        const positionX = position(p.positionX)
        const positionY = position(p.positionY)
        const cropX = position(p.cropX)
        const cropY = position(p.cropY)
        const rawZoom = Number(p.zoom ?? 1)
        const zoom = Number.isFinite(rawZoom) ? Math.max(1, Math.min(8, rawZoom)) : 1
        const rawBrightness = Number(p.brightness ?? 1)
        const brightness = Number.isFinite(rawBrightness) ? Math.max(0, Math.min(1, rawBrightness)) : 1
        const background = hexToRgb(String(p.background ?? '#000000'))
        const finite = (value: unknown, fallback: number, min: number, max: number) => {
          const n = Number(value ?? fallback)
          return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback
        }
        const saturation = p.monochrome ? 0 : finite(p.saturation, 1, 0, 2)
        const contrast = finite(p.contrast, 1, 0, 2)
        const hue = finite(p.hueShift, 0, -180, 180) * Math.PI / 180
        const gamma = finite(p.gamma, 1, 1, 3.5)
        const rawLevels = Number(p.paletteLevels)
        const paletteLevels = Number.isFinite(rawLevels) && rawLevels >= 2 ? Math.min(32, Math.round(rawLevels)) : 0
        const dithering = p.dithering === 'ordered2x2' || p.dithering === 'ordered4x4' ? p.dithering : 'none'
        const hc = Math.cos(hue), hs = Math.sin(hue)
        const hm = [
          .213 + .787 * hc - .213 * hs, .715 - .715 * hc - .715 * hs, .072 - .072 * hc + .928 * hs,
          .213 - .213 * hc + .143 * hs, .715 + .285 * hc + .140 * hs, .072 - .072 * hc - .283 * hs,
          .213 - .213 * hc - .787 * hs, .715 - .715 * hc + .715 * hs, .072 + .928 * hc + .072 * hs,
        ]
        const sampling = p.sampling === 'smooth' ? 'smooth' : 'nearest'
        const fl = (value: number) => `${Number.isInteger(value) ? value.toFixed(1) : value}f`
        ln(`  { // ${node.data.nodeType} ${img.w}x${img.h}`)
        ln(`    static const uint8_t _img_${id}[] PROGMEM = {${storedPixels.join(',')}};`)
        if (storedAlpha) ln(`    static const uint8_t _imga_${id}[] PROGMEM = {${storedAlpha.join(',')}};`)
        if (animation) ln(`    static const uint32_t _imgd_${id}[] PROGMEM = {${animation.durations.map((duration) => Math.round(duration)).join(',')}};`)
        ln(`    const int _iw=${img.w}, _ih=${img.h}, _rw=${rw}, _rh=${rh};`)
        if (animation) {
          const total = Math.max(1, Math.round(animation.durations.reduce((sum, duration) => sum + duration, 0)))
          const playbackRate = finite(p.playbackRate, 1, 0.25, 4)
          ln(`    uint32_t _it=(uint32_t)(millis()*${fl(playbackRate)});`)
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
        ln(`    float _iox=(WIDTH-_dw)*${fl(positionX)}, _ioy=(HEIGHT-_dh)*${fl(positionY)};`)
        ln(`    const float _ibr=${fl(brightness)}, _izv=${fl(1 / zoom)};`)
        if (dithering === 'ordered2x2') ln(`    static const uint8_t _idither[] PROGMEM={0,2,3,1};`)
        else if (dithering === 'ordered4x4') ln(`    static const uint8_t _idither[] PROGMEM={0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5};`)
        ln(`    struct _ImgPx { float r,g,b,a; };`)
        ln(`    auto _imgpx=[&](int _px,int _py)->_ImgPx{`)
        if (p.flipX) ln(`      _px=_rw-1-_px;`)
        if (p.flipY) ln(`      _py=_rh-1-_py;`)
        if (rotation === 90) ln(`      int _sx=_py, _sy=_ih-1-_px;`)
        else if (rotation === 180) ln(`      int _sx=_iw-1-_px, _sy=_ih-1-_py;`)
        else if (rotation === 270) ln(`      int _sx=_iw-1-_py, _sy=_px;`)
        else ln(`      int _sx=_px, _sy=_py;`)
        ln(`      int _ai=_ibase+_sy*_iw+_sx, _pi=_ai*3;`)
        if (storedAlpha) ln(`      float _a=pgm_read_byte(&_imga_${id}[_ai])/255.0f;`)
        else ln(`      float _a=1.0f;`)
        ln(`      return {(float)pgm_read_byte(&_img_${id}[_pi])*_a,(float)pgm_read_byte(&_img_${id}[_pi+1])*_a,(float)pgm_read_byte(&_img_${id}[_pi+2])*_a,_a};};`)
        ln(`    auto _imgcolor=[&](_ImgPx _p,int _x,int _y)->CRGB{`)
        ln(`      float _r=(_p.r+${fl(background.r)}*(1-_p.a))*_ibr, _g=(_p.g+${fl(background.g)}*(1-_p.a))*_ibr, _b=(_p.b+${fl(background.b)}*(1-_p.a))*_ibr;`)
        ln(`      float _hr=_r*${fl(hm[0])}+_g*${fl(hm[1])}+_b*${fl(hm[2])}, _hg=_r*${fl(hm[3])}+_g*${fl(hm[4])}+_b*${fl(hm[5])}, _hb=_r*${fl(hm[6])}+_g*${fl(hm[7])}+_b*${fl(hm[8])};`)
        ln(`      float _lum=_hr*0.2126f+_hg*0.7152f+_hb*0.0722f; _r=(_lum+(_hr-_lum)*${fl(saturation)}-127.5f)*${fl(contrast)}+127.5f; _g=(_lum+(_hg-_lum)*${fl(saturation)}-127.5f)*${fl(contrast)}+127.5f; _b=(_lum+(_hb-_lum)*${fl(saturation)}-127.5f)*${fl(contrast)}+127.5f;`)
        if (gamma !== 1) ln(`      _r=powf(constrain(_r,0.0f,255.0f)/255.0f,${fl(gamma)})*255.0f; _g=powf(constrain(_g,0.0f,255.0f)/255.0f,${fl(gamma)})*255.0f; _b=powf(constrain(_b,0.0f,255.0f)/255.0f,${fl(gamma)})*255.0f;`)
        else ln(`      _r=constrain(_r,0.0f,255.0f); _g=constrain(_g,0.0f,255.0f); _b=constrain(_b,0.0f,255.0f);`)
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
        ln(`      _u=(1-_izv)*${fl(cropX)}+_u*_izv; _v=(1-_izv)*${fl(cropY)}+_v*_izv;`)
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
        const count = Math.max(1, Math.min(6, Math.floor(Number(p.count ?? 3))))
        const pal = paletteExpr(node.id, 'paletteIn', p)
        ln(`  { // Blobs (metaballs)`)
        ln(`    float _spd=${speed}, _r=${scale}*min(WIDTH,HEIGHT), _r2=_r*_r;`)
        ln(`    float _bx[${count}], _by[${count}];`)
        ln(`    for(int _i=0;_i<${count};_i++){ _bx[_i]=WIDTH*(0.5f+0.4f*sin(t*_spd*(0.7f+_i*0.13f)+_i*1.7f)); _by[_i]=HEIGHT*(0.5f+0.4f*cos(t*_spd*(0.6f+_i*0.17f)+_i*2.3f)); }`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){ float _f=0;`)
        ln(`      for(int _i=0;_i<${count};_i++){ float _dx=_x-_bx[_i],_dy=_y-_by[_i]; _f+=_r2/(_dx*_dx+_dy*_dy+1.0f); }`)
        ln(`      ${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)((_f/(_f+1.0f))*255)); }}`)
        break
      }

      case 'FlowField': {
        needsT.v = true
        const ob = ownBuf()
        const speed = rateCpp(f('speed', 'speed', 0.67), SPEED_MAX.FlowField), scale = rateCpp(f('scale', 'scale', 0.08), SCALE_MAX.FlowField)
        const count = Math.max(8, Math.min(400, Math.floor(Number(p.count ?? 80))))
        const fade = Number(p.fade ?? 0.9)
        const fadeL = (Number.isInteger(fade) ? `${fade}.0` : `${fade}`) + 'f'
        const pal = paletteExpr(node.id, 'paletteIn', p)
        const px = `_fpx_${id}`, py = `_fpy_${id}`, tr = `_ftr_${id}`
        ln(`  { // Flow field`)
        ln(`    static float ${px}[${count}], ${py}[${count}], ${tr}[NUM_LEDS]; static bool _fi_${id}=false;`)
        ln(`    if(!_fi_${id}){ for(int _i=0;_i<${count};_i++){ ${px}[_i]=(random8()/255.0f)*WIDTH; ${py}[_i]=(random8()/255.0f)*HEIGHT; } for(int _i=0;_i<NUM_LEDS;_i++)${tr}[_i]=0; _fi_${id}=true; }`)
        ln(`    float _spd=${speed},_sc=${scale}; uint16_t _z=(uint16_t)(t*100);`)
        ln(`    for(int _i=0;_i<NUM_LEDS;_i++) ${tr}[_i]*=${fadeL};`)
        ln(`    for(int _i=0;_i<${count};_i++){`)
        ln(`      float _a=(inoise8((uint16_t)(${px}[_i]*_sc*256),(uint16_t)(${py}[_i]*_sc*256),_z)/255.0f)*6.2831f*2;`)
        ln(`      ${px}[_i]=fmodf(${px}[_i]+cos(_a)*_spd*0.6f+WIDTH,WIDTH); ${py}[_i]=fmodf(${py}[_i]+sin(_a)*_spd*0.6f+HEIGHT,HEIGHT);`)
        ln(`      int _xi=(int)${px}[_i],_yi=(int)${py}[_i]; if(_xi>=0&&_xi<WIDTH&&_yi>=0&&_yi<HEIGHT){ int _id=_yi*WIDTH+_xi; ${tr}[_id]=min(1.0f,${tr}[_id]+0.5f); } }`)
        ln(`    for(int _i=0;_i<NUM_LEDS;_i++) ${ob}[_i]=ColorFromPalette(${pal},(uint8_t)(${tr}[_i]*255)); }`)
        break
      }

      case 'Starfield': {
        const ob = ownBuf()
        const speed = rateCpp(f('speed', 'speed', 0.33), SPEED_MAX.Starfield)
        const count = Math.max(8, Math.min(300, Math.floor(Number(p.count ?? 60))))
        const colorE = incoming.get(`${node.id}:color`)
          ? colorExpr(node.id, 'color')
          : `CRGB(${Number(p.r ?? 255)}, ${Number(p.g ?? 255)}, ${Number(p.b ?? 255)})`
        const sx = `_sfx_${id}`, sy = `_sfy_${id}`, sz = `_sfz_${id}`
        ln(`  { // Starfield`)
        ln(`    static float ${sx}[${count}], ${sy}[${count}], ${sz}[${count}]; static bool _sfi_${id}=false;`)
        ln(`    if(!_sfi_${id}){ for(int _i=0;_i<${count};_i++){ ${sx}[_i]=random8()/127.5f-1; ${sy}[_i]=random8()/127.5f-1; ${sz}[_i]=random8()/255.0f*0.9f+0.1f; } _sfi_${id}=true; }`)
        ln(`    float _spd=${speed}; fill_solid(${ob}, NUM_LEDS, CRGB::Black);`)
        ln(`    for(int _i=0;_i<${count};_i++){ ${sz}[_i]-=_spd*0.015f;`)
        ln(`      if(${sz}[_i]<=0.02f){ ${sx}[_i]=random8()/127.5f-1; ${sy}[_i]=random8()/127.5f-1; ${sz}[_i]=1; }`)
        ln(`      int _px=(int)(WIDTH/2.0f+(${sx}[_i]/${sz}[_i])*WIDTH*0.35f), _py=(int)(HEIGHT/2.0f+(${sy}[_i]/${sz}[_i])*HEIGHT*0.35f);`)
        ln(`      if(_px>=0&&_px<WIDTH&&_py>=0&&_py<HEIGHT){ ${ob}[_py*WIDTH+_px]=${colorE}; ${ob}[_py*WIDTH+_px].nscale8((uint8_t)(min(1.0f,1-${sz}[_i])*255)); } } }`)
        break
      }

      case 'Boids': {
        const ob = ownBuf()
        const speed = rateCpp(f('speed', 'speed', 0.5), SPEED_MAX.Boids)
        const count = Math.max(2, Math.min(80, Math.floor(Number(p.count ?? 24))))
        const sep = Number(p.separation ?? 0.6), ali = Number(p.alignment ?? 0.5)
        const coh = Number(p.cohesion ?? 0.4), range = Number(p.visualRange ?? 4)
        const colorMode = String(p.colorMode ?? 'solid')
        if (colorMode === 'cycle') needsT.v = true  // time-cycling hue needs `t`
        const colorE = incoming.get(`${node.id}:color`)
          ? colorExpr(node.id, 'color')
          : `CRGB(${Number(p.r ?? 120)}, ${Number(p.g ?? 200)}, ${Number(p.b ?? 255)})`
        const bx = `_bx_${id}`, by = `_by_${id}`, bvx = `_bvx_${id}`, bvy = `_bvy_${id}`
        const nvx = `_bnx_${id}`, nvy = `_bny_${id}`, nn = `_bnn_${id}`
        const needNN = colorMode === 'density'  // per-boid neighbour count (density colouring only)
        const rng2 = (range * range).toFixed(3), sepR2 = (range * 0.5 * range * 0.5).toFixed(3)
        ln(`  { // Boids (Reynolds flocking)`)
        ln(`    static float ${bx}[${count}], ${by}[${count}], ${bvx}[${count}], ${bvy}[${count}]; static bool _bi_${id}=false;`)
        ln(`    if(!_bi_${id}){ for(int _i=0;_i<${count};_i++){ ${bx}[_i]=(random8()/255.0f)*WIDTH; ${by}[_i]=(random8()/255.0f)*HEIGHT; float _a=(random8()/255.0f)*6.2831f; ${bvx}[_i]=cosf(_a); ${bvy}[_i]=sinf(_a); } _bi_${id}=true; }`)
        ln(`    float _ms=${speed}; if(_ms<0.1f)_ms=0.1f; float ${nvx}[${count}], ${nvy}[${count}];${needNN ? ` int ${nn}[${count}];` : ''}`)
        ln(`    for(int _i=0;_i<${count};_i++){`)
        ln(`      float _sx=0,_sy=0,_avx=0,_avy=0,_cx=0,_cy=0; int _near=0,_sc=0;`)
        ln(`      for(int _j=0;_j<${count};_j++){ if(_j==_i)continue; float _dx=${bx}[_j]-${bx}[_i],_dy=${by}[_j]-${by}[_i]; float _d2=_dx*_dx+_dy*_dy;`)
        ln(`        if(_d2<${rng2}f){ _avx+=${bvx}[_j];_avy+=${bvy}[_j];_cx+=${bx}[_j];_cy+=${by}[_j];_near++; if(_d2<${sepR2}f&&_d2>0){_sx-=_dx;_sy-=_dy;_sc++;} } }`)
        ln(`      float _stx=0,_sty=0;`)
        ln(`      if(_near>0){ _stx+=(_avx/_near-${bvx}[_i])*${ali.toFixed(3)}f*0.08f; _sty+=(_avy/_near-${bvy}[_i])*${ali.toFixed(3)}f*0.08f; _stx+=(_cx/_near-${bx}[_i])*${coh.toFixed(3)}f*0.005f; _sty+=(_cy/_near-${by}[_i])*${coh.toFixed(3)}f*0.005f; }`)
        ln(`      if(_sc>0){ _stx+=_sx*${sep.toFixed(3)}f*0.05f; _sty+=_sy*${sep.toFixed(3)}f*0.05f; }`)
        ln(`      ${nvx}[_i]=${bvx}[_i]+_stx; ${nvy}[_i]=${bvy}[_i]+_sty;${needNN ? ` ${nn}[_i]=_near;` : ''} }`)
        ln(`    fill_solid(${ob}, NUM_LEDS, CRGB::Black);`)
        if (colorMode === 'solid') ln(`    CRGB _bc0=${colorE};`)
        else if (colorMode === 'radial') ln(`    float _bcx=WIDTH/2.0f,_bcy=HEIGHT/2.0f,_bmr=sqrtf(_bcx*_bcx+_bcy*_bcy); if(_bmr<=0)_bmr=1;`)
        const boidColor =
          colorMode === 'heading' ? `CRGB _bc=CHSV((uint8_t)((atan2f(_diry,_dirx)/6.2831853f+0.5f)*255.0f),255,255);`
          : colorMode === 'spectrum' ? `CRGB _bc=CHSV((uint8_t)(_i/(float)${count}*255.0f),255,255);`
          : colorMode === 'density' ? `CRGB _bc=CHSV((uint8_t)((1.0f-min(1.0f,${nn}[_i]/8.0f))*0.7f*255.0f),255,255);`
          : colorMode === 'position' ? `CRGB _bc=CHSV((uint8_t)((${bx}[_i]/WIDTH+${by}[_i]/HEIGHT)*0.5f*255.0f),255,255);`
          : colorMode === 'cycle' ? `CRGB _bc=CHSV((uint8_t)(t*0.1f*255.0f),255,255);`
          : colorMode === 'radial' ? `CRGB _bc=CHSV((uint8_t)(sqrtf((${bx}[_i]-_bcx)*(${bx}[_i]-_bcx)+(${by}[_i]-_bcy)*(${by}[_i]-_bcy))/_bmr*255.0f),255,255);`
          : `CRGB _bc=_bc0;`
        ln(`    for(int _i=0;_i<${count};_i++){`)
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
        ln(`    float _flow=t*_spd*(0.2f+_m*1.5f); uint8_t _bright=(uint8_t)(min(1.0f,0.3f+_b)*255);`)
        ln(`    float _vamp=0.2f+_tr*0.7f+_b*0.3f;`)
        ln(`    float _vflow=((float)inoise8((uint16_t)((t*_spd*4.0f+50)*256),4429)/128.0f-1.0f)*_vamp;`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      uint8_t _v=inoise8((uint16_t)((_x*_sc+_flow)*256),(uint16_t)((_y*_sc*0.6f+_vflow+8.0f)*256));`)
        ln(`      ${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)(_v+_tr*80)); ${ob}[_y*WIDTH+_x].nscale8(_bright);}}`)
        break
      }

      case 'ReactionDiffusion': {
        const ob = ownBuf()
        const feed = f('feed', 'feed', 0.055), kill = f('kill', 'kill', 0.062)
        const iters = Math.max(1, Math.min(20, Math.floor(Number(p.speed ?? 8))))
        const pal = paletteExpr(node.id, 'paletteIn', p)
        const u = `_u_${id}`, v = `_v_${id}`, un = `_un_${id}`, vn = `_vn_${id}`
        ln(`  { // ReactionDiffusion (Gray-Scott)`)
        ln(`    static float ${u}[NUM_LEDS], ${v}[NUM_LEDS], ${un}[NUM_LEDS], ${vn}[NUM_LEDS]; static bool _rd_${id} = false;`)
        ln(`    if (!_rd_${id}) { for (int _i = 0; _i < NUM_LEDS; _i++) { ${u}[_i] = 1; ${v}[_i] = 0; }`)
        ln(`      for (int _y = HEIGHT/2-2; _y <= HEIGHT/2+1; _y++) for (int _x = WIDTH/2-2; _x <= WIDTH/2+1; _x++)`)
        ln(`        if (_x>=0&&_x<WIDTH&&_y>=0&&_y<HEIGHT) { ${u}[_y*WIDTH+_x]=0.5f; ${v}[_y*WIDTH+_x]=0.5f; } _rd_${id}=true; }`)
        ln(`    float _f=${feed}, _k=${kill};`)
        ln(`    for (int _it=0; _it<${iters}; _it++) {`)
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
        const colorE = incoming.get(`${node.id}:color`)
          ? colorExpr(node.id, 'color')
          : `CRGB(${Number(p.r ?? 0)}, ${Number(p.g ?? 255)}, ${Number(p.b ?? 70)})`
        const speed = f('speed', 'speed', 8)
        const fade = Number(p.fade ?? 0.75)
        const fadeL = (Number.isInteger(fade) ? `${fade}.0` : `${fade}`) + 'f'
        const c = `_gc_${id}`, nx = `_gn_${id}`, br = `_gb_${id}`
        ln(`  { // Game of Life`)
        ln(`    static uint8_t ${c}[NUM_LEDS], ${nx}[NUM_LEDS]; static float ${br}[NUM_LEDS]; static bool _gi_${id}=false; static uint32_t _gt_${id}=0;`)
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
        ln(`    for (int _i=0;_i<NUM_LEDS;_i++){ ${br}[_i]=${c}[_i]?1.0f:${br}[_i]*${fadeL}; ${ob}[_i]=${colorE}; ${ob}[_i].nscale8((uint8_t)(${br}[_i]*255)); } }`)
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
        if (usesShims(raw)) needsShims.v = true
        const formula = cppRewriteShims(raw).replace(/\*\//g, '* /')
        const ob = ownBuf()
        const pal = paletteExpr(node.id, 'paletteIn', p)
        ln(`  { /* CustomFormula: ${raw.replace(/\*\//g, '* /')} */`)
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
        if (usesShims(raw)) needsShims.v = true
        const formula = cppRewriteShims(raw).replace(/\*\//g, '* /')
        const of = ownField()
        const a = f('a', 'a', 0), b = f('b', 'b', 0)
        const fin = srcField('fieldIn')
        ln(`  { /* FieldFormula: ${raw.replace(/\*\//g, '* /')} */`)
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
        ln(`  { // Field noise (fBm via inoise8)`)
        ln(`    float _spd=${speed},_sc=${scale}; uint16_t _z=(uint16_t)(t*_spd*40);`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _v=0,_amp=0.5f,_norm=0,_freq=_sc*96;`)
        ln(`      for(int _o=0;_o<${octaves};_o++){`)
        ln(`        _v+=_amp*(inoise8((uint16_t)(_x*_freq),(uint16_t)(_y*_freq),_z)/255.0f);`)
        ln(`        _norm+=_amp; _amp*=0.5f; _freq*=2; }`)
        ln(`      ${of}[_y*WIDTH+_x]=constrain(_v/_norm,0.0f,1.0f);}}`)
        break
      }

      case 'WaveSim': {
        const of = ownField()
        const trig = boolExpr(node.id, 'trigger')
        const speed = Math.max(1, Math.min(12, Math.floor(Number(p.speed ?? 4))))
        const damping = Math.max(0.8, Math.min(0.999, Number(p.damping ?? 0.985)))
        const impulse = Math.max(0.1, Math.min(1, Number(p.impulse ?? 1)))
        const dampL = (Number.isInteger(damping) ? damping.toFixed(1) : String(damping)) + 'f'
        const impulseL = (Number.isInteger(impulse) ? impulse.toFixed(1) : String(impulse)) + 'f'
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
        const angle = f('angle', 'angle', 0), spin = Number(p.spin ?? 0)
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
        const tx = Math.max(1, Math.round(Number(p.tilesX ?? 2)))
        const ty = Math.max(1, Math.round(Number(p.tilesY ?? 2)))
        const src = srcField('field')
        ln(`  { /* FieldTile */`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      int _sx=(_x*${tx})%WIDTH,_sy=(_y*${ty})%HEIGHT;`)
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
        // Build a CRGBPalette16 from connected colors (CRGBPalette16 has 1–4 and
        // 16 colour constructors); consumers reference pal_<id> via paletteExpr.
        const cols = ['color0', 'color1', 'color2', 'color3']
          .filter((port) => incoming.get(`${node.id}:${port}`))
          .map((port) => colorExpr(node.id, port))
        if (cols.length === 0) ln(`  CRGBPalette16 pal_${id} = RainbowColors_p;`)
        else ln(`  CRGBPalette16 pal_${id}(${cols.join(', ')});`)
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
        const bpm = Number(p.bpm ?? 60), lo = Number(p.low ?? 0), hi = Number(p.high ?? 255)
        ln(`  uint8_t ${v('value')} = beatsin8(${bpm}, ${lo}, ${hi});`)
        break
      }

      case 'Fire2012': {
        const ob = ownBuf()
        const cooling = Number(p.cooling ?? 55), sparking = Number(p.sparking ?? 120)
        ln(`  { // Fire2012 (cooling=${cooling}, sparking=${sparking})`)
        ln(`    static uint8_t _heat_${id}[HEIGHT][WIDTH] = {};`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++)`)
        ln(`      _heat_${id}[_y][_x]=qsub8(_heat_${id}[_y][_x],random8(0,((${cooling}*10/HEIGHT)+2)));`)
        ln(`    for(int _y=0;_y<HEIGHT-2;_y++) for(int _x=0;_x<WIDTH;_x++)`)
        ln(`      _heat_${id}[_y][_x]=(_heat_${id}[_y+1][_x]+_heat_${id}[_y+2][max(0,_x-1)]+_heat_${id}[_y+2][_x]+_heat_${id}[_y+2][min(WIDTH-1,_x+1)])/4;`)
        ln(`    for(int _x=0;_x<WIDTH;_x++) if(random8()<${sparking}) _heat_${id}[HEIGHT-1][_x]=qadd8(_heat_${id}[HEIGHT-1][_x],random8(160,255));`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++) ${ob}[_y*WIDTH+_x]=HeatColor(_heat_${id}[_y][_x]);`)
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
        const amount = Math.max(0, Math.min(1, Number(p.amount ?? 0.15)))
        ln(`  ${seedFrom('frame')} blur2d(${ob}, WIDTH, HEIGHT, ${Math.round(amount * 255)}, _xyMap);`)
        break
      }

      case 'XYMapper': {
        const xx = f('x', 'x', 0), yy = f('y', 'y', 0)
        ln(`  uint16_t ${v('index')} = (uint16_t)(${xx}) + (uint16_t)(${yy}) * WIDTH;`)
        break
      }

      case 'AudioHue': {
        const bass = f('bass','bass',0.5), mids = f('mids','mids',0.5), treble = f('treble','treble',0.5)
        ln(`  uint8_t ${v('hue')} = (uint8_t)(((${bass})*0.5f+(${mids})*0.3f+(${treble})*0.2f)*255);`)
        break
      }

      case 'PerformanceGenerator':
        // Music-sync shows are rendered by the dedicated SD-card player. Keep
        // the ordinary frame path deterministic when wired to MatrixOutput.
        ln(`  fill_solid(${ownBuf()}, NUM_LEDS, CRGB::Black);`)
        break

      case 'MatrixOutput': {
        const src = srcBuf('frame')
        if (!src) {
          ln(`  fill_solid(leds, ${physLeds}, CRGB::Black);`)
        } else if (ss) {
          // Average each SS×SS block of the render buffer into one physical LED.
          const dst = serpentine ? 'XY(_x, _y)' : `_y * PANEL_W + _x`
          ln(`  for (int _y = 0; _y < PANEL_H; _y++) for (int _x = 0; _x < PANEL_W; _x++) {`)
          ln(`    uint16_t _r = 0, _g = 0, _b = 0;`)
          ln(`    for (int _sy = 0; _sy < SS; _sy++) for (int _sx = 0; _sx < SS; _sx++) {`)
          ln(`      CRGB _c = ${src}[(_y * SS + _sy) * WIDTH + (_x * SS + _sx)];`)
          ln(`      _r += _c.r; _g += _c.g; _b += _c.b;`)
          ln(`    }`)
          ln(`    leds[${dst}] = CRGB(_r / (SS * SS), _g / (SS * SS), _b / (SS * SS));`)
          ln(`  }`)
        } else if (serpentine) {
          ln(`  for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) leds[XY(_x, _y)] = ${src}[_y * WIDTH + _x];`)
        } else {
          ln(`  ::memmove(leds, ${src}, sizeof(CRGB) * NUM_LEDS);`)
        }
        ln(`  FastLED.show();`)
        break
      }

      default:
        ln(`  // ${type} — not yet supported in code gen`)
    }
  }

  // Emit all node snippets first to collect needsMapFloat and needsT flags
  for (const node of sorted) emit(node)

  const lines: string[] = []

  // Header (the overclock define must precede the FastLED include)
  lines.push(...overclockDefineCpp(hw))
  lines.push(`#include <FastLED.h>`)
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
  lines.push(`#define DATA_PIN ${dataPin}`)
  if (SPI_CHIPSETS.has(hw.chipset)) lines.push(`#define CLOCK_PIN ${hw.clockPin}`)
  lines.push(``)
  lines.push(`CRGB leds[${physLeds}];`)
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
  lines.push(``)
  if (usePsram) {
    lines.push(PSRAM_ALLOC_CPP)
    lines.push(``)
  }

  if (needsShims.v) {
    lines.push(CPP_SHIM_HELPERS)
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

  if (serpentine) {
    lines.push(`// Serpentine (zig-zag) layout: every other row runs right-to-left.`)
    lines.push(`uint16_t XY(uint8_t x, uint8_t y) {`)
    lines.push(`  return (y & 0x01) ? (uint16_t)y * ${panelW} + (${panelW} - 1 - x) : (uint16_t)y * ${panelW} + x;`)
    lines.push(`}`)
    lines.push(``)
  }

  if (audio) {
    lines.push(...audio.code)
    lines.push(``)
  }

  lines.push(...customPaletteDeclarationsCpp())
  lines.push(``)

  // File-scope code from Code nodes (helpers, persistent vars, palettes).
  if (globalLines.length) {
    lines.push(...globalLines)
  }

  lines.push(`void setup() {`)
  lines.push(...psramAllocs)
  lines.push(...pinSetupLines)
  lines.push(...fastledSetupCpp(hw, ss ? { ledCountMacro: physLeds } : {}))
  if (powerLimit) lines.push(`  FastLED.setMaxPowerInVoltsAndMilliamps(${volts}, ${milliamps});`)
  if (emitEngine) lines.push(`  setupAudio();`)
  lines.push(`}`)
  lines.push(``)

  lines.push(`void loop() {`)
  if (emitEngine) lines.push(`  updateAudio();`)
  if (needsT.v) lines.push(`  float t = millis() / 1000.0f;`)
  lines.push(...loopLines)
  if (!sorted.some((n) => n.data.nodeType === 'MatrixOutput')) {
    lines.push(`  FastLED.show();`)
  }
  lines.push(`  FastLED.delay(16);  // ~60 fps`)
  lines.push(`}`)

  return lines.join('\n')
}
