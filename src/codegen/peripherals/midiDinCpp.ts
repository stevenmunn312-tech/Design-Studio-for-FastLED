import type { UartPort } from '../../build/pins/uartAssignment'
import { MIDI_BAUD } from '../../state/peripherals/midiSource'
import { uartPortDeclarationCpp } from './uartPortCpp'

/** A DIN-mode MIDI node the shared reader serves: what it listens for. */
export interface MidiDinReader {
  id: string
  note: number
  cc: number
  /** 0 hears every channel; 1–16 one. */
  channel: number
}

/** The MIDI interface on the bench: its RX GPIO and the UART it was given. */
export interface MidiDinWiring {
  rxPin: number
  ports: { twoUart: UartPort; oneUart: UartPort }
}

export interface MidiDinEmission {
  globals: string[]
  setup: string[]
  /** Called once per frame before the graph, so every node reads this frame's bytes. */
  poll: string[]
}

/**
 * One reader for the board's one DIN jack, shared by every DIN-mode MIDI node.
 *
 * A UART hands each byte out once, so a reader per node would split the
 * jack's bytes between them. Instead one parser takes every byte, with
 * running status, and gives each complete channel message to every node,
 * which keeps the velocity of the note it watches (a note-on at velocity 0 is
 * off) and the last value of the controller it watches, on its channel or
 * any. Real-time bytes never disturb running status.
 */
export function midiDinEmission(readers: readonly MidiDinReader[], wiring: MidiDinWiring): MidiDinEmission {
  if (readers.length === 0) return { globals: [], setup: [], poll: [] }
  const dispatch = readers.flatMap(({ id, note, cc, channel }) => {
    const on = channel === 0 ? '' : `ch == ${channel} && `
    return [
      `  if (${on}(kind == 0x90 || kind == 0x80) && d0 == ${note}) _midiVel_${id} = (kind == 0x90 && d1 > 0) ? d1 / 127.0f : 0.0f;`,
      `  if (${on}kind == 0xB0 && d0 == ${cc}) _midiCc_${id} = d1 / 127.0f;`,
    ]
  })
  return {
    globals: [
      '// DIN MIDI: the MIDI interface\'s one jack, read once for every MIDI node.',
      '#if defined(ESP32)',
      ...uartPortDeclarationCpp(wiring.ports, (port) => `static HardwareSerial _midiDin(${port});`),
      '#endif',
      ...readers.map(({ id }) => `static float _midiVel_${id} = 0.0f, _midiCc_${id} = 0.0f;`),
      'static uint8_t _midiDinStatus = 0, _midiDinData[2], _midiDinCount = 0;',
      'static void _midiDinMessage(uint8_t kind, uint8_t ch, uint8_t d0, uint8_t d1) {',
      ...dispatch,
      '}',
      'static void _midiDinPoll() {',
      '#if defined(ESP32)',
      '  while (_midiDin.available() > 0) {',
      '    uint8_t b = (uint8_t)_midiDin.read();',
      '    if (b >= 0xF8) continue;  // real-time messages never disturb running status',
      '    if (b & 0x80) { _midiDinStatus = b < 0xF0 ? b : 0; _midiDinCount = 0; continue; }',
      '    if (!_midiDinStatus) continue;',
      '    _midiDinData[_midiDinCount++] = b;',
      '    uint8_t kind = _midiDinStatus & 0xF0;',
      '    uint8_t need = (kind == 0xC0 || kind == 0xD0) ? 1 : 2;',
      '    if (_midiDinCount < need) continue;',
      '    _midiDinCount = 0;',
      '    _midiDinMessage(kind, (_midiDinStatus & 0x0F) + 1, _midiDinData[0], need > 1 ? _midiDinData[1] : 0);',
      '  }',
      '#endif',
      '}',
    ],
    setup: [
      '#if defined(ESP32)',
      `  _midiDin.begin(${MIDI_BAUD}, SERIAL_8N1, ${wiring.rxPin}, -1);  // DIN MIDI in; MIDI_TX unwired`,
      '#endif',
    ],
    poll: ['  _midiDinPoll();'],
  }
}
