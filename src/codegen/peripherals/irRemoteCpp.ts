import {
  IR_REMOTE_PROTOCOLS,
  IR_REMOTE_REPEAT_HOLD_MS,
  irRemoteButtonHandle,
  normalizeIrRemoteButtons,
  type IrRemoteProtocol,
} from '../../state/peripherals/irRemote'
import { IR_RMT_RECEIVER_CPP, irRmtReceiverCpp } from './irRmtReceiverCpp'

/**
 * Pinned Arduino-IRremote release.
 *
 * Keep this identical to `_IRREMOTE_VERSION` in `backend/toolchain.py`. A newer
 * checkout is not compatible just because the include name stayed the same.
 */
export const IR_REMOTE_VERSION = '4.7.1'
export const IR_REMOTE_INCLUDE = '#include <IRremote.hpp>'

/** What an exported sketch tells someone building it with arduino-cli. */
export function irRemoteInstallInstruction(): string {
  return `arduino-cli lib install IRremote@${IR_REMOTE_VERSION}`
}

/**
 * Which decoder macro covers a saved protocol.
 *
 * Several names share one decoder: NEC2, Apple and Onkyo are NEC; Sharp is
 * Denon; Samsung48 and SamsungLG are Samsung. Defining any DECODE_* macro
 * turns the library's "enable everything" default off, so an unlisted family
 * is not compiled in.
 */
const DECODER_MACRO: Record<IrRemoteProtocol, string> = {
  NEC: 'DECODE_NEC',
  NEC2: 'DECODE_NEC',
  Onkyo: 'DECODE_NEC',
  Apple: 'DECODE_NEC',
  Panasonic: 'DECODE_KASEIKYO',
  Kaseikyo: 'DECODE_KASEIKYO',
  Denon: 'DECODE_DENON',
  Sharp: 'DECODE_DENON',
  Sony: 'DECODE_SONY',
  RC5: 'DECODE_RC5',
  RC6: 'DECODE_RC6',
  Samsung: 'DECODE_SAMSUNG',
  Samsung48: 'DECODE_SAMSUNG',
  SamsungLG: 'DECODE_SAMSUNG',
  LG: 'DECODE_LG',
  LG2: 'DECODE_LG',
  JVC: 'DECODE_JVC',
}

const MACRO_ORDER = [
  'DECODE_NEC', 'DECODE_KASEIKYO', 'DECODE_DENON', 'DECODE_SHARP',
  'DECODE_SONY', 'DECODE_RC5', 'DECODE_RC6', 'DECODE_SAMSUNG', 'DECODE_LG', 'DECODE_JVC',
]

/** Macros for these protocols, in a stable order. Empty when nothing is learned. */
export function irDecoderMacros(protocols: readonly string[]): string[] {
  const needed = new Set<string>()
  for (const protocol of protocols) {
    const macro = DECODER_MACRO[protocol as IrRemoteProtocol]
    if (macro) needed.add(macro)
  }
  return MACRO_ORDER.filter((macro) => needed.has(macro))
}

/**
 * The include block for a sketch that decodes `protocols`.
 *
 * No protocols means no include and no library: an IR-free sketch must not
 * pay for the decoder. Macros come before the include, which is the only
 * place this library reads them.
 */
export function irRemoteHeader(protocols: readonly string[]): string {
  const macros = irDecoderMacros(protocols)
  if (macros.length === 0) return ''
  return [
    `// ${irRemoteInstallInstruction()}`,
    ...macros.map((macro) => `#define ${macro}`),
    '#define NO_LED_RECEIVE_FEEDBACK_CODE',
    '#if defined(CONFIG_IDF_TARGET_ESP32S3)',
    '// The app saves protocols up to 48 bits; 100 timing entries cover them.',
    '#define RAW_BUFFER_LENGTH 100',
    '#endif',
    IR_REMOTE_INCLUDE,
  ].join('\n')
}

/** Every protocol the learn sketch must be able to name. */
export function irLearnHeader(): string {
  return [irRemoteHeader(IR_REMOTE_PROTOCOLS), IR_RMT_RECEIVER_CPP].join('\n')
}

export function irRemoteBeginLine(pin: number | string): string {
  const gpio = typeof pin === 'number'
    ? String(Math.max(0, Math.min(255, Math.trunc(pin))))
    : pin
  return `FLS_IR_RECEIVER.begin(${gpio}, DISABLE_LED_FEEDBACK);`
}

/**
 * C++ `decode_type_t` token for a saved protocol name.
 *
 * The graph stores the portable name (`Onkyo`, `SamsungLG`). The enum is the
 * library's spelling, which is not always that name in uppercase with the
 * same breaks.
 */
const CPP_PROTOCOL: Record<IrRemoteProtocol, string> = {
  NEC: 'NEC',
  NEC2: 'NEC2',
  Onkyo: 'ONKYO',
  Apple: 'APPLE',
  Panasonic: 'PANASONIC',
  Kaseikyo: 'KASEIKYO',
  Denon: 'DENON',
  Sharp: 'SHARP',
  Sony: 'SONY',
  RC5: 'RC5',
  RC6: 'RC6',
  Samsung: 'SAMSUNG',
  Samsung48: 'SAMSUNG48',
  SamsungLG: 'SAMSUNGLG',
  LG: 'LG',
  LG2: 'LG2',
  JVC: 'JVC',
}

export interface IrRemoteProjectNode {
  /** C++-safe node id. Sanitized again here so a raw canvas id is also safe. */
  id: string
  pin: number
  buttons: unknown
  debug?: boolean
}

export interface IrRemoteProjectEmission {
  /** Whether the caller must open the serial port at 115200 baud. */
  debug: boolean
  /** Atomic include blocks, empty without saved protocols or diagnostics. */
  includes: string[]
  /** Capture helper and key bools, emitted after all library includes. */
  globals: string[]
  /** Begin capture when saved protocols or diagnostics require it. */
  setup: string[]
  /**
   * Inlined in `loop()` after the control snapshot and before anything reads a key.
   * Contains one `FLS_IR_RECEIVER.decode()` when capture is needed.
   */
  sample: string[]
}

function irVariable(id: string, buttonId: string): string {
  const node = id.replace(/[^a-zA-Z0-9_]/g, '_')
  const handle = irRemoteButtonHandle(buttonId).replace(/[^a-zA-Z0-9_]/g, '_')
  return `n_${node}_${handle}`
}

/**
 * One receiver poll for every learned key in the sketch.
 *
 * The library's receiver is a single global. A second `decode()` in the same
 * pass returns false and clears the frame, so every generator emits this
 * block once and runs it in the input half before any key is read. `once`
 * drops a repeat frame; `held` keeps it. Repeats inherit the last complete
 * identity within the same bounded window as preview: NEC2 may be reported
 * only after a key learned as NEC is held. Leave a false graph pass between
 * pulses even if the receiver already has the next frame ready.
 *
 * A key with an empty protocol is false and does not, by itself, pull the
 * library in. Debug explicitly enables capture and all supported decoders,
 * even before any keys are learned or connected.
 */
export function irRemoteProjectEmission(nodes: readonly IrRemoteProjectNode[]): IrRemoteProjectEmission {
  const debug = nodes.some((node) => node.debug === true)
  const empty: IrRemoteProjectEmission = { debug: false, includes: [], globals: [], setup: [], sample: [] }
  const rows: { variable: string; protocol: IrRemoteProtocol | ''; address: number; command: number; repeat: 'once' | 'held' }[] = []
  let pin: number | null = null
  for (const node of nodes) {
    if (pin === null && node.debug) pin = node.pin
    for (const button of normalizeIrRemoteButtons(node.buttons)) {
      rows.push({
        variable: irVariable(node.id, button.id),
        protocol: button.protocol,
        address: button.address,
        command: button.command,
        repeat: button.repeat,
      })
      if (pin === null && button.protocol) pin = node.pin
    }
  }
  if (rows.length === 0 && !debug) return empty
  const globals = rows.map((row) => `static bool ${row.variable};`)
  const protocols = rows.map((row) => row.protocol)
  if (!debug && !protocols.some((protocol) => protocol !== '')) {
    return {
      ...empty,
      globals,
      sample: rows.map((row) => `  ${row.variable} = false;`),
    }
  }
  const header = irRemoteHeader(debug ? IR_REMOTE_PROTOCOLS : protocols)
  return {
    debug,
    // Keep conditional directives and helper bodies atomic: control graphs
    // deduplicate includes, which would otherwise remove repeated braces/#endif.
    includes: header ? [header] : [],
    // A class body in the include preamble makes fbuild hoist CRGB-typed
    // player prototypes ahead of FastLED.h. Emit the adapter at file scope
    // after all includes instead; IRremote.hpp still precedes Audio.h.
    globals: [irRmtReceiverCpp(debug), ...globals,
      'static decode_type_t _irLastProtocol = UNKNOWN;',
      'static uint16_t _irLastAddress = 0, _irLastCommand = 0;',
      'static uint32_t _irLastFrameAt = 0;',
    ],
    setup: [`  ${irRemoteBeginLine(pin ?? 0)}`],
    sample: [
      `  bool _irHadPulse = ${rows.map((row) => row.variable).join(' || ') || 'false'};`,
      '  bool _irRepeat = false;',
      '  decode_type_t _irProtocol = UNKNOWN;',
      '  uint16_t _irAddress = 0;',
      '  uint16_t _irCommand = 0;',
      '  if (!_irHadPulse && FLS_IR_RECEIVER.decode()) {',
      '    _irRepeat = (IrReceiver.decodedIRData.flags & IRDATA_FLAGS_IS_REPEAT) != 0;',
      '    _irProtocol = IrReceiver.decodedIRData.protocol;',
      '    _irAddress = IrReceiver.decodedIRData.address;',
      '    _irCommand = IrReceiver.decodedIRData.command;',
      '    const uint32_t _irNow = millis();',
      '    if (_irRepeat) {',
      `      if (_irLastProtocol != UNKNOWN && (uint32_t)(_irNow - _irLastFrameAt) <= ${IR_REMOTE_REPEAT_HOLD_MS}u`,
      '          && _irAddress == _irLastAddress && _irCommand == _irLastCommand) {',
      '        _irProtocol = _irLastProtocol;',
      '        _irLastFrameAt = _irNow;',
      '      } else { _irProtocol = UNKNOWN; _irLastProtocol = UNKNOWN; }',
      '    } else {',
      '      _irLastProtocol = _irProtocol;',
      '      _irLastAddress = _irAddress; _irLastCommand = _irCommand;',
      '      _irLastFrameAt = _irNow;',
      '    }',
      ...(debug ? [
        '    Serial.print("FLS_IR_DEBUG protocol="); Serial.print(getProtocolString(_irProtocol));',
        '    Serial.print(" address=0x"); Serial.print(_irAddress, HEX);',
        '    Serial.print(" command=0x"); Serial.print(_irCommand, HEX);',
        '    Serial.print(" repeat="); Serial.println(_irRepeat ? 1 : 0);',
      ] : []),
      '    FLS_IR_RECEIVER.resume();',
      '  }',
      ...rows.map((row) => {
        if (!row.protocol) return `  ${row.variable} = false;`
        const matched = `_irProtocol == ${CPP_PROTOCOL[row.protocol]} && _irAddress == ${row.address}u && _irCommand == ${row.command}u`
        const expr = row.repeat === 'held' ? matched : `${matched} && !_irRepeat`
        return `  ${row.variable} = ${expr};`
      }),
      ...(debug ? rows.map((row) => `  if (${row.variable}) Serial.println("FLS_IR_MATCH output=${row.variable}");`) : []),
    ],
  }
}
