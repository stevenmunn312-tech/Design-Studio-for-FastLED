import { IR_REMOTE_PROTOCOLS, type IrRemoteProtocol } from '../state/irRemote'

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
