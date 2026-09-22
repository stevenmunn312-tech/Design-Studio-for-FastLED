import {
  IR_REMOTE_PROTOCOLS,
  irRemoteButtonHandle,
  normalizeIrRemoteButtons,
  type IrRemoteProtocol,
} from '../state/irRemote'

/**
 * Pinned Arduino-IRremote release.
 *
 * Keep this identical to `_IRREMOTE_VERSION` in `backend/app.py`. A newer
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
    IR_REMOTE_INCLUDE,
  ].join('\n')
}

/** Every protocol the learn sketch must be able to name. */
export function irLearnHeader(): string {
  return irRemoteHeader(IR_REMOTE_PROTOCOLS)
}

export function irRemoteBeginLine(pin: number | string): string {
  const gpio = typeof pin === 'number'
    ? String(Math.max(0, Math.min(255, Math.trunc(pin))))
    : pin
  return `IrReceiver.begin(${gpio}, DISABLE_LED_FEEDBACK);`
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
}

export interface IrRemoteProjectEmission {
  /** Lines of `irRemoteHeader`, empty when no saved key names a protocol. */
  includes: string[]
  /** File-scope bools. Assigned from `sample`, read by whichever function walks the graph. */
  globals: string[]
  /** `IrReceiver.begin` for the one receiver. Empty when there is nothing to decode. */
  setup: string[]
  /**
   * Inlined in `loop()` after the control snapshot and before anything reads a key.
   * Contains `IrReceiver.decode()` when at least one key has a protocol.
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
 * drops a repeat frame; `held` keeps it. On a repeat the library copies the
 * last complete address and command into the decoded fields.
 *
 * A key with an empty protocol is false and does not, by itself, pull the
 * library in. No protocols anywhere means no include and no begin.
 */
export function irRemoteProjectEmission(nodes: readonly IrRemoteProjectNode[]): IrRemoteProjectEmission {
  const empty: IrRemoteProjectEmission = { includes: [], globals: [], setup: [], sample: [] }
  const rows: { variable: string; protocol: IrRemoteProtocol | ''; address: number; command: number; repeat: 'once' | 'held' }[] = []
  let pin: number | null = null
  for (const node of nodes) {
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
  if (rows.length === 0) return empty
  const globals = rows.map((row) => `static bool ${row.variable};`)
  const protocols = rows.map((row) => row.protocol)
  if (!protocols.some((protocol) => protocol !== '')) {
    return {
      ...empty,
      globals,
      sample: rows.map((row) => `  ${row.variable} = false;`),
    }
  }
  const header = irRemoteHeader(protocols)
  return {
    includes: header ? header.split('\n') : [],
    globals,
    setup: [`  ${irRemoteBeginLine(pin ?? 0)}`],
    sample: [
      '  bool _irRepeat = false;',
      '  decode_type_t _irProtocol = UNKNOWN;',
      '  uint16_t _irAddress = 0;',
      '  uint16_t _irCommand = 0;',
      '  if (IrReceiver.decode()) {',
      '    _irRepeat = (IrReceiver.decodedIRData.flags & IRDATA_FLAGS_IS_REPEAT) != 0;',
      '    _irProtocol = IrReceiver.decodedIRData.protocol;',
      '    _irAddress = IrReceiver.decodedIRData.address;',
      '    _irCommand = IrReceiver.decodedIRData.command;',
      '    IrReceiver.resume();',
      '  }',
      ...rows.map((row) => {
        if (!row.protocol) return `  ${row.variable} = false;`
        const matched = `_irProtocol == ${CPP_PROTOCOL[row.protocol]} && _irAddress == ${row.address}u && _irCommand == ${row.command}u`
        const expr = row.repeat === 'held' ? matched : `${matched} && !_irRepeat`
        return `  ${row.variable} = ${expr};`
      }),
    ],
  }
}
