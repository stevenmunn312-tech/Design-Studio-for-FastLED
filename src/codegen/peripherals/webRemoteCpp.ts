/*
 * Firmware for a Web Remote: the phone page in flash, its state, and a small
 * HTTP server that never holds up the LED loop.
 *
 * The server is the core library one on each platform (`WebServer` on ESP32,
 * `ESP8266WebServer` on ESP8266), so a build needs nothing installed. It
 * starts the first time the shared network connection comes up, through
 * `_netEnsureConnected()`/`_netConnected()` from networkCpp.ts, and from then
 * on `handleClient()` serves at most one waiting request per pass.
 *
 * Three routes: `/` sends the page `webRemotePageHtml` built (the same text
 * the studio's phone preview loads), `/s` the state as a JSON array, and a
 * POST to `/set` one control's new value. Both inputs of `/set` are bounded
 * before anything reads them: the index must be one or two digits naming a
 * control, the value a short finite number, and each control clamps and
 * snaps it to its own range exactly as the preview does (`webRemoteQuantize`).
 *
 * A Button is true while held. The page repeats its press every 400 ms, and
 * one not repeated for 1.5 s reads as released, so a dropped release (a phone
 * locked mid-press, a lost packet) cannot latch it on.
 *
 * Every table and function here is emitted only for a remote that uses it:
 * no quantiser without a ranged control, no hold timer without a Button, no
 * hue helper without a Colour Picker.
 */

import { cppComment, cppStringLiteral, floatLit, safeId } from '../cppLiterals'
import {
  normalizeWebRemoteControls,
  webRemoteControlDataType,
  webRemoteControlKind,
  webRemoteMdnsName,
  webRemotePortId,
  webRemoteStartState,
  webRemoteStateRange,
  webRemoteTitle,
  type WebRemoteControl,
} from '../../state/peripherals/webRemote'
import { webRemotePageHtml } from '../../state/peripherals/webRemotePage'
import { displayPickerTone } from '../../state/displays/displayRegistry'
import type { StudioNode } from '../../state/graphStore'
import type { ControlInputEmission } from '../controlInputCpp'
import { networkSketchCpp, networkSourceIn } from './networkCpp'

/** How long a held Button may go unrepeated before it reads as released. */
export const WEB_REMOTE_HOLD_TIMEOUT_MS = 1500

export interface WebRemoteFirmware {
  /** One block: the platform's server and mDNS headers. */
  include: string
  /** File scope: the page, the state and the request handlers. */
  globals: string
  /** `setup()` lines: the routes. The server itself starts once the network is up. */
  setup: string[]
  /** `loop()` lines: service the server, then declare each control's output. */
  loop: string[]
  /** Each output port's graph type. */
  outputs: Record<string, 'bool' | 'float' | 'color'>
}

export const WEB_REMOTE_INCLUDES_CPP = [
  `#if defined(ESP32)`,
  `#include <WebServer.h>`,
  `#include <ESPmDNS.h>`,
  `#elif defined(ESP8266)`,
  `#include <ESP8266WebServer.h>`,
  `#include <ESP8266mDNS.h>`,
  `#endif`,
].join('\n')

/** The page as adjacent C string literals, one source line per page line. */
export function webRemotePageCpp(page: string): string {
  return page.split('\n').map((line, index, lines) => (
    `  ${cppStringLiteral(index < lines.length - 1 ? `${line}\n` : line)}`
  )).join('\n')
}

function startLiteral(control: WebRemoteControl): string {
  const start = webRemoteStartState(control)
  return floatLit(typeof start === 'boolean' ? (start ? 1 : 0) : start)
}

/**
 * The firmware for one Web Remote node. `id` is the node's C++-safe id,
 * `hostname` the shared connection's hostname (announced over mDNS).
 */
export function webRemoteFirmware(
  id: string,
  properties: Record<string, unknown>,
  hostname: unknown,
): WebRemoteFirmware {
  const controls = normalizeWebRemoteControls(properties.controls)
  const count = Math.max(1, controls.length)
  const page = webRemotePageHtml(properties.title, controls)
  const v = (port: string) => `n_${id}_${safeId(port)}`
  const val = `_wrVal_${id}`
  const server = `_wrServer_${id}`
  const presses = controls.map((control, index) => ({ control, index }))
    .filter(({ control }) => webRemoteControlKind(control.type) === 'press')
  const ranged = controls.some((control) => {
    const kind = webRemoteControlKind(control.type)
    return kind !== 'press' && kind !== 'latch'
  })
  const hues = controls.some((control) => webRemoteControlKind(control.type) === 'hue')

  const cases = controls.map((control, index) => {
    const kind = webRemoteControlKind(control.type)
    const note = `// ${cppComment(control.label)}`
    if (kind === 'press') {
      return `    case ${index}: ${val}[${index}] = v >= 0.5f ? 1.0f : 0.0f; if (v >= 0.5f) _wrHeldMs_${id}_${index} = millis(); break;  ${note}`
    }
    if (kind === 'latch') return `    case ${index}: ${val}[${index}] = v >= 0.5f ? 1.0f : 0.0f; break;  ${note}`
    const range = webRemoteStateRange(control)
    return `    case ${index}: ${val}[${index}] = _wrQuantize_${id}(v, ${floatLit(range.min, 6)}, ${floatLit(range.max, 6)}, ${floatLit(range.step, 6)}); break;  ${note}`
  })

  const globals = [
    `// Web Remote "${cppComment(webRemoteTitle(properties.title))}": a phone control page served over Wi-Fi.`,
    `static const char _wrPage_${id}[] PROGMEM =`,
    `${webRemotePageCpp(page)};`,
    `static float ${val}[${count}] = { ${controls.length > 0 ? controls.map(startLiteral).join(', ') : '0.0f'} };`,
    ...(hues ? [
      `// The six-sector HSV every Colour Picker shares (displayHueColor), packed 0xRRGGBB.`,
      `static uint32_t _wrHueRgb_${id}(float hue, float saturation, float value) {`,
      `  float h = fmodf(fmodf(isfinite(hue) ? hue : 0.0f, 360.0f) + 360.0f, 360.0f) / 60.0f;`,
      `  float v = constrain(value, 0.0f, 1.0f);`,
      `  float c = v * constrain(saturation, 0.0f, 1.0f);`,
      `  float x = c * (1.0f - fabsf(fmodf(h, 2.0f) - 1.0f));`,
      `  float r = 0.0f, g = 0.0f, b = 0.0f;`,
      `  switch ((int)h) {`,
      `    case 0: r = c; g = x; break;`,
      `    case 1: r = x; g = c; break;`,
      `    case 2: g = c; b = x; break;`,
      `    case 3: g = x; b = c; break;`,
      `    case 4: r = x; b = c; break;`,
      `    default: r = c; b = x; break;`,
      `  }`,
      `  float m = v - c;`,
      `  return ((uint32_t)lroundf((r + m) * 255.0f) << 16) | ((uint32_t)lroundf((g + m) * 255.0f) << 8) | (uint32_t)lroundf((b + m) * 255.0f);`,
      `}`,
    ] : []),
    `#if FLS_NET_SUPPORTED`,
    `#if defined(ESP32)`,
    `static WebServer ${server}(80);`,
    `#else`,
    `static ESP8266WebServer ${server}(80);`,
    `#endif`,
    `static bool _wrStarted_${id} = false;`,
    ...presses.map(({ index }) => `static uint32_t _wrHeldMs_${id}_${index} = 0;`),
    ...(ranged ? [
      `// Clamp into range and snap to the step from the minimum, as the page and preview do.`,
      `static float _wrQuantize_${id}(float v, float lo, float hi, float step) {`,
      `  v = constrain(v, lo, hi);`,
      `  if (step > 0.0f) v = lo + roundf((v - lo) / step) * step;`,
      `  return constrain(v, lo, hi);`,
      `}`,
    ] : []),
    `// A control index: one or two digits naming a control, else -1.`,
    `static int _wrIndex_${id}(const String &text) {`,
    `  if (text.length() < 1 || text.length() > 2) return -1;`,
    `  int index = 0;`,
    `  for (unsigned int k = 0; k < text.length(); k++) {`,
    `    char digit = text[k];`,
    `    if (digit < '0' || digit > '9') return -1;`,
    `    index = index * 10 + (digit - '0');`,
    `  }`,
    `  return index < ${controls.length} ? index : -1;`,
    `}`,
    `static void _wrSendState_${id}() {`,
    `  String body;`,
    `  body.reserve(${count * 10 + 2});`,
    `  body += '[';`,
    `  for (int i = 0; i < ${controls.length}; i++) {`,
    `    if (i) body += ',';`,
    `    body += String(${val}[i], 4);`,
    `  }`,
    `  body += ']';`,
    `  ${server}.sendHeader("Cache-Control", "no-store");`,
    `  ${server}.send(200, "application/json", body);`,
    `}`,
    `static void _wrSendPage_${id}() {`,
    `  ${server}.send_P(200, "text/html", _wrPage_${id});`,
    `}`,
    `static void _wrNotFound_${id}() {`,
    `  ${server}.send(404, "text/plain", "Not found");`,
    `}`,
    `static void _wrHandleSet_${id}() {`,
    `  int i = _wrIndex_${id}(${server}.arg("i"));`,
    `  String raw = ${server}.arg("v");`,
    `  float v = raw.toFloat();`,
    `  if (i < 0 || raw.length() == 0 || raw.length() > 16 || !isfinite(v)) {`,
    `    ${server}.send(400, "text/plain", "Bad control");`,
    `    return;`,
    `  }`,
    ...(cases.length > 0 ? [`  switch (i) {`, ...cases, `  }`] : []),
    `  _wrSendState_${id}();`,
    `}`,
    `#endif`,
    ``,
  ].join('\n')

  const setup = [
    `#if FLS_NET_SUPPORTED`,
    `  ${server}.on("/", HTTP_GET, _wrSendPage_${id});`,
    `  ${server}.on("/s", HTTP_GET, _wrSendState_${id});`,
    `  ${server}.on("/set", HTTP_POST, _wrHandleSet_${id});`,
    `  ${server}.onNotFound(_wrNotFound_${id});`,
    `#endif`,
  ]

  const outputs: WebRemoteFirmware['outputs'] = {}
  const outputLines = controls.map((control, index) => {
    const port = webRemotePortId(control.id)
    const dataType = webRemoteControlDataType(control.type)
    outputs[port] = dataType
    if (dataType === 'bool') return `  bool ${v(port)} = ${val}[${index}] >= 0.5f;`
    if (dataType === 'color') {
      const tone = displayPickerTone(control)
      return `  CRGB ${v(port)} = CRGB(_wrHueRgb_${id}(${val}[${index}], ${floatLit(tone.saturation)}, ${floatLit(tone.brightness)}));`
    }
    return `  float ${v(port)} = ${val}[${index}];`
  })

  const loop = [
    `  // Web Remote: serve at most one waiting request, never wait for one.`,
    `  _netEnsureConnected();`,
    `#if FLS_NET_SUPPORTED`,
    `  if (_netConnected()) {`,
    `    if (!_wrStarted_${id}) {`,
    `      ${server}.begin();`,
    `      if (MDNS.begin(${cppStringLiteral(webRemoteMdnsName(hostname))})) MDNS.addService("http", "tcp", 80);`,
    `      _wrStarted_${id} = true;`,
    `    }`,
    `    ${server}.handleClient();`,
    `#if defined(ESP8266)`,
    `    MDNS.update();`,
    `#endif`,
    `  }`,
    ...presses.map(({ index }) => (
      `  if (${val}[${index}] >= 0.5f && (uint32_t)(millis() - _wrHeldMs_${id}_${index}) > ${WEB_REMOTE_HOLD_TIMEOUT_MS}u) ${val}[${index}] = 0.0f;`
    )),
    `#endif`,
    ...outputLines,
  ]

  return { include: WEB_REMOTE_INCLUDES_CPP, globals, setup, loop, outputs }
}


/**
 * A Web Remote as a typed control source for the show and SD player
 * templates' control graph: its floats and booleans, and a Colour Picker's
 * colour as a self-contained CRGB, sampled before the graph pass like any
 * other input. It carries the shared network with it, as an NTP clock's
 * emission does, so the template starts the same connection; the control
 * graph dedupes those identical blocks when both are present.
 */
export function webRemoteControlEmission(
  id: string,
  properties: Record<string, unknown>,
  nodes: readonly StudioNode[],
): ControlInputEmission {
  // The remote is itself a network user, so the source is never missing.
  const source = networkSourceIn(nodes)
  const network = source ? networkSketchCpp(nodes, source) : null
  const firmware = webRemoteFirmware(id, properties, (source?.data.properties as Record<string, unknown> | undefined)?.wifiHostname)
  return {
    setup: [...(network?.setup ?? []), ...firmware.setup],
    loop: firmware.loop,
    outputs: firmware.outputs,
    includes: [...(network ? [network.include] : []), firmware.include],
    helpers: [...(network ? [network.bootstrap] : []), firmware.globals],
  }
}
